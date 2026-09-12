// netlify/functions/books-inbox.mjs — path /api/inbox — phase2-spec.md section 5
//   GET  /api/inbox?status=pending|posted|dismissed|dry|error|all&limit=
//     -> {envelopes:[...]} newest first, no attachment bytes (any signed-in role)
//   POST /api/inbox {action:"approve", docId, entries?, note?}    (owner)
//   POST /api/inbox {action:"dismiss", docId, note}               (owner)
//   POST /api/inbox {action:"reprocess", docId}                   (owner)
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

  let session;
  try {
    session = getSessionPayload(req);
  } catch (err) {
    const resp = authErrorResponse(err);
    if (resp) return resp;
    throw err;
  }

  const writer = getWriter();
  const docsStore = getDocsStore();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "all";
    if (status !== "all" && !STATUSES.has(status)) {
      return json(400, { error: "BAD_REQUEST", message: `unknown status "${status}"` });
    }
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 50;

    let envelopes;
    try {
      const { blobs } = await docsStore.list({ prefix: "doc/" });
      const loaded = await Promise.all((blobs || []).map((b) => docsStore.get(b.key, { type: "json" })));
      envelopes = loaded.filter(Boolean);
    } catch (err) {
      return json(502, { error: "STORE_ERROR", message: String((err && err.message) || err) });
    }

    if (status !== "all") envelopes = envelopes.filter((e) => e.status === status);
    envelopes.sort((a, b) => {
      const ta = a.startedAt || a.receivedAt || "";
      const tb = b.startedAt || b.receivedAt || "";
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });

    return json(200, { envelopes: envelopes.slice(0, limit), total: envelopes.length });
  }

  if (req.method === "POST") {
    try {
      requireRole(session, ["owner"]);
    } catch (err) {
      const resp = authErrorResponse(err);
      if (resp) return resp;
      throw err;
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "BAD_REQUEST", message: "expected a JSON body" });
    }

    const docId = body.docId;
    if (!validateDocId(docId)) {
      return json(400, { error: "BAD_REQUEST", message: "docId is required" });
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
          posted_by: session.email,
          doc_url,
          allow_duplicate_hash: true,
        });
      } catch (err) {
        const resp = buildErrorResponse(err);
        if (resp) return resp;
        throw err;
      }

      let postResult;
      try {
        postResult = await writer.postBatch(entries);
        await invalidateJournalCache(writer);
      } catch (err) {
        return writerErrorResponse(err);
      }

      const updated = {
        ...envelope,
        status: "posted",
        result: { txn_ids: entries.map((e) => e.txn_id), rows: postResult.rows, doc_url },
        review: { action: "approve", by: session.email, at: new Date().toISOString(), note: body.note || "" },
      };
      await docsStore.setJSON(`doc/${docId}`, updated);
      return json(200, { docId, status: "posted", txn_ids: updated.result.txn_ids, rows: postResult.rows });
    }

    if (body.action === "dismiss") {
      if (!body.note) return json(400, { error: "BAD_REQUEST", message: "note is required" });
      const envelope = await loadEnvelope(docsStore, docId);
      if (!envelope) return json(404, { error: "NOT_FOUND", message: `no envelope for docId ${docId}` });

      const updated = {
        ...envelope,
        status: "dismissed",
        review: { action: "dismiss", by: session.email, at: new Date().toISOString(), note: body.note },
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

    return json(400, { error: "BAD_REQUEST", message: "action must be approve, dismiss, reprocess or delete" });
  }

  return json(405, { error: "METHOD_NOT_ALLOWED" });
};

export const config = { path: "/api/inbox" };
