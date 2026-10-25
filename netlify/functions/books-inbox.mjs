// netlify/functions/books-inbox.mjs — path /api/inbox — phase2-spec.md section 5
//   GET  /api/inbox?status=pending|posted|dismissed|dry|error|all&limit=
//     -> {envelopes:[...]} newest first, no attachment bytes (any signed-in role)
//   POST /api/inbox {action:"dismiss", docId, note}               (owner)
//   POST /api/inbox {action:"reprocess", docId}                   (owner)
//   POST /api/inbox {action:"relearn", last4, paid_from}          (owner/poller; audit 2026-10-24 #7 - the other cards
//                                                                   citing a card number Paul just placed, re-run from their reads)
//   POST /api/inbox {action:"mark-posted" | "mark-pending", ...}  (owner/poller; the workbook's Inbox records its post here)
//   POST /api/inbox {action:"delete", docId}                      (owner; dry/error only)
//
// Nothing here posts to the books (audit 2026-10-24 #11, D-023): an entry is posted by the workbook's Inbox
// (Menu.gs inboxApprove, in-process) or by the ingest's automatic path (D-044) - the site records and manages the
// queue. The web Inbox's `approve` verb and its background half, and D-025's `repost` / `repost-all` staging
// replays, went with #11. Every POST verb is owner-only; GET is read-only for every signed-in role.

import {
  requireConfig,
  json,
  getWriter,
  getDocsStore,
  getSessionPayload,
  requireRole,
  authErrorResponse,
  pollerSecretOk,
  loadDocIndex, loadEnvelopes,
  getCacheStore, loadHeartbeat,
} from "./_shared.mjs";
const STATUSES = new Set(["pending", "posted", "dismissed", "dry", "error", "processing"]);
const DELETABLE_STATUSES = new Set(["dry", "error"]);
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

async function loadEnvelope(docsStore, docId) {
  return docsStore.get(`doc/${docId}`, { type: "json" });
}

function validateDocId(docId) {
  return typeof docId === "string" && DOC_ID_RE.test(docId);
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
    // Audit 2026-10-24 #10c: when the pollers last reported in - alone (the writer's hourly watcher) or with the list.
    const heartbeat = await loadHeartbeat(getCacheStore()).catch(() => null);
    if (url.searchParams.get("heartbeat")) return json(200, { heartbeat });
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

    // Audit 2026-10-24 #9: the index says which documents are wanted; only those are fetched whole.
    let picked;
    try {
      picked = (await loadDocIndex(docsStore, { prefix: onlyDocId ? `doc/${onlyDocId}` : "doc/" }))
        .filter((d) => (!onlyDocId || d.docId === onlyDocId) && (status === "all" || d.status === status));
    } catch (err) {
      return json(502, { error: "STORE_ERROR", message: String((err && err.message) || err) });
    }
    picked.sort((a, b) => {
      const ta = a.startedAt || a.receivedAt || "";
      const tb = b.startedAt || b.receivedAt || "";
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    const envelopes = await loadEnvelopes(docsStore, picked.slice(0, limit).map((d) => d.key));
    return json(200, { envelopes, total: picked.length, heartbeat });
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

    // Audit 2026-10-24 #7: the workbook learned a card's last four (Paul picked the payer on a card held for
    // PAYER_UNKNOWN - Menu.gs learnCard_). Every other receipt card still waiting that cites the same number is
    // re-run from its stored read with that payer - no new model read: the gate and the post happen in ingest-bg
    // (fromStored + overrides.paid_from, the D-025 replay). A card that still fails another rail stays a card,
    // with the payer filled in. 12 of October's 27 "who paid?" cards were one number.
    if (body.action === "relearn") {
      const last4 = String(body.last4 || "");
      const payer = String(body.paid_from || "");
      if (!/^\d{4}$/.test(last4) || !/^(14\d\d|PAUL)$/.test(payer)) {
        return json(400, { error: "BAD_REQUEST", message: "last4 (four digits) and paid_from (a 14xx account or PAUL) are required" });
      }
      const wanted = (await loadDocIndex(docsStore)).filter((d) => d.status === "pending" && d.source !== "feed" && !d.dryRun && d.has_model &&
        d.verdict && d.gate_reasons.includes("PAYER_UNKNOWN") && d.cited_last4 === last4);
      const waiting = await loadEnvelopes(docsStore, wanted.map((d) => d.key));
      const origin = new URL(req.url).origin;
      const started = [], failed = [];
      for (const e of waiting) {
        const now = new Date().toISOString();
        await docsStore.setJSON(`doc/${e.docId}`, { ...e, status: "processing", startedAt: now, finishedAt: "", error: "", gate: null, result: null });
        try {
          const res = await fetch(`${origin}/api/ingest-bg`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET },
            body: JSON.stringify({ docId: e.docId, fromStored: true, overrides: { paid_from: payer, note: `card ending ${last4} is ${payer} - ${by} placed it on another card` } }),
          });
          if (res.status !== 202 && res.status !== 200) throw new Error(`ingest-bg returned HTTP ${res.status}`);
          started.push(e.docId);
        } catch (err) {
          try { await docsStore.setJSON(`doc/${e.docId}`, e); } catch { /* best-effort: back as it was */ }
          failed.push(e.docId);
        }
      }
      return json(200, { last4, paid_from: payer, started, failed });
    }

    const docId = body.docId;
    if (!validateDocId(docId)) {
      return json(400, { error: "BAD_REQUEST", message: "docId is required" });
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
      // 2026-10-24: a posted record whose entries were voided and posted again by hand (Mariana's two Zelles,
      // re-posted paid from Chase) is pointed at the live entries - a one-off's call, with the new ids named.
      if (envelope.status === "posted" && body.repoint === true) {
        const repointed = { ...envelope, result: { ...(envelope.result || {}), txn_ids },
          review: { ...(envelope.review || {}), repointed: { from: envelope.result?.txn_ids || [], by, at: new Date().toISOString(), note: body.note || "" } } };
        await docsStore.setJSON(`doc/${docId}`, repointed);
        return json(200, { docId, status: "posted", txn_ids, repointed: true });
      }
      if (envelope.status !== "pending") {
        return json(409, { error: "NOT_PENDING", message: `envelope is "${envelope.status}", not pending` });
      }
      // entries: what Paul saved in the workbook, which may be less than the read proposed (a line
      // marked Returned or Dismiss) - /api/summary prints these in the digest's Posted list.
      const saved = Array.isArray(body.entries) && body.entries.length ? { entries: body.entries } : {};
      const updated = {
        ...envelope,
        status: "posted",
        result: { txn_ids, rows: body.rows ?? null, doc_url: body.doc_url || envelope.result?.doc_url || "", ...saved },
        review: { action: "approve", by, at: new Date().toISOString(), note: body.note || "", in_process: true },
      };
      // A card born from bank lines ties its Feed rows in the workbook itself (Menu.gs tieFeedRows_):
      // a synchronous function cannot wait on the writer (2026-09-28).
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
      // only_pending: the workbook retiring a bank card whose line a saved receipt now pays for (Menu.gs
      // tieOpenBankLine_, audit 2026-10-24 #1) - a card Paul decided meanwhile is left as he left it.
      if (body.only_pending && envelope.status !== "pending") return json(200, { docId, status: envelope.status, unchanged: true });

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
          body: JSON.stringify({ docId, reprocess: true, holdOnly: true }),
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

    return json(400, { error: "BAD_REQUEST", message: "unknown action - it must be mark-posted, mark-pending, dismiss, reprocess, relearn or delete" });
  }

  return json(405, { error: "METHOD_NOT_ALLOWED" });
};

export const config = { path: "/api/inbox" };
