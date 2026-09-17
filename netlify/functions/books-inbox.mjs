// netlify/functions/books-inbox.mjs — path /api/inbox — phase2-spec.md section 5
//   GET  /api/inbox?status=pending|posted|dismissed|dry|error|all&limit=
//     -> {envelopes:[...]} newest first, no attachment bytes (any signed-in role)
//   POST /api/inbox {action:"approve", docId, entries?, note?}    (owner)
//   POST /api/inbox {action:"dismiss", docId, note}               (owner)
//   POST /api/inbox {action:"reprocess", docId}                   (owner)
//   POST /api/inbox {action:"repost", docId}                      (owner/poller; D-025, re-post from the stored read)
//   POST /api/inbox {action:"repost-all", after?, limit?, only?:[docId], overrides?:{docId|"*":{paid_from?,property?}}}  (owner/poller; D-025, paged)
//   POST /api/inbox {action:"delete", docId}                      (owner; dry/error only)
//
// Every POST verb here is owner-only (task brief: "Owner-only verbs in books-inbox") -
// approve is the human bypass around the model+gate, dismiss/reprocess/delete are
// review-queue management. GET is read-only for every signed-in role, like the other
// *-ledger-ish pages.

import {
  requireConfig,
  json,
  getWriter,
  getDocsStore,
  getPostingCtx,
  invalidateJournalCache,
  getSessionPayload,
  requireRole,
  authErrorResponse,
  todayChicago,
  storeAttachmentsToDrive,
  pollerSecretOk,
  WriterError,
} from "./_shared.mjs";
import { buildEntriesFromModel } from "../../lib/gate.mjs";

const STATUSES = new Set(["pending", "posted", "dismissed", "dry", "error", "processing"]);
const DELETABLE_STATUSES = new Set(["dry", "error"]);
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
const CONFLICT_CODES = new Set(["DUPLICATE", "PERIOD_CLOSED", "ALREADY_VOIDED"]);
const NOT_FOUND_CODES = new Set(["NOT_FOUND"]);

function writerErrorResponse(err) {
  if (err instanceof WriterError) {
    const status = CONFLICT_CODES.has(err.code) ? 409 : NOT_FOUND_CODES.has(err.code) ? 404 : 502;
    return json(status, { error: err.code, message: err.message });
  }
  return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
}

/** A thrown build error (PostingError-shaped: has .code) -> 422; anything else rethrows. */
function buildErrorResponse(err) {
  if (err && typeof err.code === "string") {
    return json(422, { error: err.code, message: err.message, details: err.details });
  }
  return null;
}

async function loadEnvelope(docsStore, docId) {
  return docsStore.get(`doc/${docId}`, { type: "json" });
}

function validateDocId(docId) {
  return typeof docId === "string" && DOC_ID_RE.test(docId);
}

/** Folder for a document that was never filed on the way into Pending (hold never
 * files to Drive - see books-ingest-background.mjs): ["<year>", "<property or
 * OVERHEAD>"] from the (possibly human-edited) first entry being approved. */
function approveFolderFor(entries) {
  const first = entries[0] || {};
  const year = (first.date || todayChicago()).slice(0, 4);
  const property = first.property || "OVERHEAD";
  return [year, property];
}

export default async (req) => {
  const configErr = requireConfig(["WRITER_URL", "WRITER_SECRET", "SESSION_SECRET", "POLLER_SECRET"]);
  if (configErr) return configErr;

  const isPoller = pollerSecretOk(req);
  let session = null;
  if (!isPoller) {
    try {
      session = getSessionPayload(req);
    } catch (err) {
      const resp = authErrorResponse(err);
      if (resp) return resp;
      throw err;
    }
  }

  const writer = getWriter();
  const docsStore = getDocsStore();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "all";
    if (status !== "all" && !STATUSES.has(status)) {
      return json(400, { error: "BAD_REQUEST", message: `unknown status "${status}"` });
    }
    const onlyDocId = url.searchParams.get("docId") || "";
    if (onlyDocId && !validateDocId(onlyDocId)) {
      return json(400, { error: "BAD_REQUEST", message: "bad docId" });
    }
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 50;

    let envelopes;
    try {
      const { blobs } = await docsStore.list({ prefix: onlyDocId ? `doc/${onlyDocId}` : "doc/" });
      const loaded = await Promise.all((blobs || []).map((b) => docsStore.get(b.key, { type: "json" })));
      envelopes = loaded.filter(Boolean);
    } catch (err) {
      return json(502, { error: "STORE_ERROR", message: String((err && err.message) || err) });
    }

    if (onlyDocId) envelopes = envelopes.filter((e) => e.docId === onlyDocId);
    if (status !== "all") envelopes = envelopes.filter((e) => e.status === status);
    envelopes.sort((a, b) => {
      const ta = a.startedAt || a.receivedAt || "";
      const tb = b.startedAt || b.receivedAt || "";
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });

    return json(200, { envelopes: envelopes.slice(0, limit), total: envelopes.length });
  }

  if (req.method === "POST") {
    if (!isPoller) {
      try {
        requireRole(session, ["owner"]);
      } catch (err) {
        const resp = authErrorResponse(err);
        if (resp) return resp;
        throw err;
      }
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "BAD_REQUEST", message: "expected a JSON body" });
    }
    const by = isPoller ? String(body.by || "workbook") : session.email;

    // D-025 staging reruns: re-post every document that already carries a stored
    // read, without a second model call. Pages through the docs store so the
    // caller (a local script) controls the pace; each doc is handed to ingest-bg
    // with fromStored:true. Skips dry runs, test uploads and docs with no verdict.
    if (body.action === "repost-all") {
      const limit = Math.min(Math.max(parseInt(body.limit, 10) || 20, 1), 100);
      const after = String(body.after || "");
      const only = Array.isArray(body.only) ? new Set(body.only.map(String)) : null;
      const overrides = body.overrides && typeof body.overrides === "object" ? body.overrides : {};
      const { blobs } = await docsStore.list({ prefix: "doc/" });
      const keys = blobs.map((b) => b.key).filter((k) => k > `doc/${after}` && (!only || only.has(k.slice(4)))).sort().slice(0, limit);
      const fired = [], skipped = [];
      const origin = new URL(req.url).origin;
      for (const key of keys) {
        const id = key.slice(4);
        const env = await docsStore.get(key, { type: "json" });
        if (!env || env.dryRun || id.startsWith("dry-") || id.startsWith("up-test-") || !env.model || !env.model.verdict) { skipped.push(id); continue; }
        await docsStore.setJSON(key, { ...env, status: "processing", startedAt: new Date().toISOString(), finishedAt: "", error: "", gate: null, result: null });
        const res = await fetch(`${origin}/api/ingest-bg`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET },
          body: JSON.stringify({ docId: id, fromStored: true, overrides: overrides[id] || overrides["*"] || undefined }),
        });
        fired.push({ docId: id, http: res.status });
      }
      const last = keys.length ? keys[keys.length - 1].slice(4) : "";
      return json(200, { fired, skipped, after: last, done: keys.length < limit });
    }

    const docId = body.docId;
    if (!validateDocId(docId)) {
      return json(400, { error: "BAD_REQUEST", message: "docId is required" });
    }

    if (body.action === "repost") {
      const envelope = await loadEnvelope(docsStore, docId);
      if (!envelope) return json(404, { error: "NOT_FOUND", message: `no envelope for docId ${docId}` });
      if (!envelope.model || !envelope.model.verdict) return json(409, { error: "NO_STORED_READ", message: "this document has no stored model read; use reprocess" });
      await docsStore.setJSON(`doc/${docId}`, { ...envelope, status: "processing", startedAt: new Date().toISOString(), finishedAt: "", error: "", gate: null, result: null });
      const origin = new URL(req.url).origin;
      const res = await fetch(`${origin}/api/ingest-bg`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET },
        body: JSON.stringify({ docId, fromStored: true }),
      });
      if (res.status !== 202 && res.status !== 200) return json(502, { error: "INGEST_INVOKE", message: `ingest-bg returned HTTP ${res.status}` });
      return json(202, { docId, status: "processing", fromStored: true });
    }

    if (body.action === "approve") {
      const envelope = await loadEnvelope(docsStore, docId);
      if (!envelope) return json(404, { error: "NOT_FOUND", message: `no envelope for docId ${docId}` });

      const modelSource = envelope.model || {};
      const entriesInput = Array.isArray(body.entries) ? body.entries : modelSource.entries;
      if (!Array.isArray(entriesInput) || entriesInput.length === 0) {
        return json(400, { error: "BAD_REQUEST", message: "no entries to approve" });
      }

      let ctx;
      try {
        ctx = await getPostingCtx(writer);
      } catch (err) {
        return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
      }

      // A pending item was never filed to Drive on the way in (only an auto-post or a
      // dry run files - books-ingest-background.mjs); file it now, on approve, so an
      // entry a human posts by hand still carries a doc_url. See this task's report.
      let doc_url = envelope.result?.doc_url || "";
      if (!doc_url) {
        try {
          const filed = await storeAttachmentsToDrive(writer, docsStore, envelope, approveFolderFor(entriesInput), modelSource);
          doc_url = filed[0]?.url || "";
        } catch (err) {
          return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
        }
      }

      const modelForBuild = { ...modelSource, entries: entriesInput };
      let entries;
      try {
        entries = buildEntriesFromModel(modelForBuild, ctx, {
          posted_by: by,
          doc_url,
          allow_duplicate_hash: true,
        });
      } catch (err) {
        const resp = buildErrorResponse(err);
        if (resp) return resp;
        throw err;
      }

      // 2026-09-16: an approve ran past the function's timeout (504) after the writer
      // had posted but before this envelope was marked, leaving a posted entry behind a
      // still-pending card - and a second Approve would have posted it again (manual
      // txn_ids carry a random suffix). So: mark "posting" first, refuse a re-entry,
      // write the envelope the moment the writer answers, and refresh the cache last.
      if (envelope.status === "posting" && Date.now() - Date.parse(envelope.posting_at || 0) < 5 * 60 * 1000) {
        return json(409, { error: "POSTING", message: "this document is already being posted; reload in a minute" });
      }
      await docsStore.setJSON(`doc/${docId}`, { ...envelope, status: "posting", posting_at: new Date().toISOString() });

      let postResult;
      try {
        postResult = await writer.postBatch(entries);
      } catch (err) {
        await docsStore.setJSON(`doc/${docId}`, envelope); // back to pending, nothing was written
        return writerErrorResponse(err);
      }

      const updated = {
        ...envelope,
        status: "posted",
        result: { txn_ids: entries.map((e) => e.txn_id), rows: postResult.rows, doc_url },
        review: { action: "approve", by, at: new Date().toISOString(), note: body.note || "" },
      };
      await docsStore.setJSON(`doc/${docId}`, updated);
      await invalidateJournalCache(writer);
      return json(200, { docId, status: "posted", txn_ids: updated.result.txn_ids, rows: postResult.rows });
    }

    if (body.action === "mark-posted") {
      const envelope = await loadEnvelope(docsStore, docId);
      if (!envelope) return json(404, { error: "NOT_FOUND", message: `no envelope for docId ${docId}` });
      const txn_ids = Array.isArray(body.txn_ids) ? body.txn_ids.map(String).filter(Boolean) : [];
      if (!txn_ids.length) return json(400, { error: "BAD_REQUEST", message: "txn_ids is required" });
      // Same txn_ids again on a posted envelope: the workbook filed the document after
      // posting (inboxFinish) and is bringing the Drive link - patch it, nothing else.
      if (envelope.status === "posted" && JSON.stringify(envelope.result?.txn_ids || []) === JSON.stringify(txn_ids)) {
        const patched = { ...envelope, result: { ...envelope.result, doc_url: body.doc_url || envelope.result?.doc_url || "" } };
        await docsStore.setJSON(`doc/${docId}`, patched);
        return json(200, { docId, status: "posted", txn_ids, doc_url: patched.result.doc_url });
      }
      if (envelope.status !== "pending" && envelope.status !== "posting") {
        return json(409, { error: "NOT_PENDING", message: `envelope is "${envelope.status}", not pending` });
      }
      const updated = {
        ...envelope,
        status: "posted",
        result: { txn_ids, rows: body.rows ?? null, doc_url: body.doc_url || envelope.result?.doc_url || "" },
        review: { action: "approve", by, at: new Date().toISOString(), note: body.note || "", in_process: true },
      };
      await docsStore.setJSON(`doc/${docId}`, updated);
      return json(200, { docId, status: "posted", txn_ids });
    }

    if (body.action === "mark-pending") {
      // The workbook marked a card posted and then its own post failed: put it back.
      const envelope = await loadEnvelope(docsStore, docId);
      if (!envelope) return json(404, { error: "NOT_FOUND", message: `no envelope for docId ${docId}` });
      if (envelope.status !== "posted" || !envelope.review?.in_process) {
        return json(409, { error: "NOT_REVERTIBLE", message: `envelope is "${envelope.status}"; only an in-process post can be reverted` });
      }
      const reverted = { ...envelope, status: "pending", result: { txn_ids: [], rows: null, doc_url: envelope.result?.doc_url || "" }, review: null };
      await docsStore.setJSON(`doc/${docId}`, reverted);
      return json(200, { docId, status: "pending" });
    }

    if (body.action === "dismiss") {
      if (!body.note) return json(400, { error: "BAD_REQUEST", message: "note is required" });
      const envelope = await loadEnvelope(docsStore, docId);
      if (!envelope) return json(404, { error: "NOT_FOUND", message: `no envelope for docId ${docId}` });

      const updated = {
        ...envelope,
        status: "dismissed",
        review: { action: "dismiss", by, at: new Date().toISOString(), note: body.note },
      };
      await docsStore.setJSON(`doc/${docId}`, updated);
      return json(200, { docId, status: "dismissed" });
    }

    if (body.action === "reprocess") {
      const envelope = await loadEnvelope(docsStore, docId);
      if (!envelope) return json(404, { error: "NOT_FOUND", message: `no envelope for docId ${docId}` });

      const now = new Date().toISOString();
      const reset = {
        ...envelope,
        status: "processing",
        startedAt: now,
        finishedAt: "",
        error: "",
        model: null,
        gate: null,
        result: null,
      };
      await docsStore.setJSON(`doc/${docId}`, reset);

      try {
        const origin = new URL(req.url).origin;
        const res = await fetch(`${origin}/api/ingest-bg`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET },
          body: JSON.stringify({ docId, reprocess: true }),
        });
        if (res.status !== 202 && res.status !== 200) {
          throw new Error(`ingest-bg invocation returned HTTP ${res.status}`);
        }
      } catch (err) {
        const errored = {
          ...reset,
          status: "error",
          error: `failed to invoke ingest: ${String((err && err.message) || err)}`,
          finishedAt: new Date().toISOString(),
        };
        try {
          await docsStore.setJSON(`doc/${docId}`, errored);
        } catch {
          // best-effort only
        }
        return json(502, { error: "INGEST_INVOKE_FAILED", message: errored.error, docId });
      }

      return json(200, { docId, status: "processing" });
    }

    if (body.action === "delete") {
      const envelope = await loadEnvelope(docsStore, docId);
      if (!envelope) return json(404, { error: "NOT_FOUND", message: `no envelope for docId ${docId}` });
      if (!DELETABLE_STATUSES.has(envelope.status)) {
        return json(409, {
          error: "NOT_DELETABLE",
          message: `only dry or error envelopes can be deleted (status is "${envelope.status}")`,
        });
      }

      await docsStore.delete(`doc/${docId}`);
      await Promise.all((envelope.attachments || []).map((att, i) => docsStore.delete(att.key || `att/${docId}/${i}`)));
      return json(200, { docId, deleted: true });
    }

    return json(400, { error: "BAD_REQUEST", message: "action must be approve, mark-posted, mark-pending, dismiss, reprocess or delete" });
  }

  return json(405, { error: "METHOD_NOT_ALLOWED" });
};

export const config = { path: "/api/inbox" };
