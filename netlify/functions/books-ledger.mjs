// netlify/functions/books-ledger.mjs — spec §9
//   GET  /api/ledger?limit=200                          -> {entries:[...grouped by txn_id]}
//   POST /api/ledger {intent}                           -> {entry, rows}                (owner)
//   POST /api/ledger {action:"void", txn_id, reason}     -> {entry}                      (owner)

import {
  requireConfig,
  json,
  getWriter,
  getPostingCtx,
  invalidateJournalCache,
  readTab,
  getSessionPayload,
  requireRole,
  authErrorResponse,
  todayChicago,
  WriterError,
} from "./_shared.mjs";
import { buildEntry, PostingError } from "../../lib/posting.mjs";

// A WriterError with one of these codes reflects a client-fixable conflict (retry with
// a different txn_id, or post to an open period) -> 409. Everything else from the
// writer is treated as an upstream failure -> 502.
const CONFLICT_CODES = new Set(["DUPLICATE", "PERIOD_CLOSED", "ALREADY_VOIDED"]);
const NOT_FOUND_CODES = new Set(["NOT_FOUND"]);

function writerErrorResponse(err) {
  if (err instanceof WriterError) {
    const status = CONFLICT_CODES.has(err.code) ? 409 : NOT_FOUND_CODES.has(err.code) ? 404 : 502;
    return json(status, { error: err.code, message: err.message });
  }
  return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
}

/**
 * Group flat Journal rows (one row per line) into entries keyed by txn_id, newest
 * first by date. Each line object carries every column on that row (account, debit,
 * credit, property, payee, description, paid_from, etc.) — a superset of what the
 * Journal page needs, so the client picks the fields it wants.
 */
function groupJournalRows(headers, rows) {
  const iTxn = headers.indexOf("txn_id");
  const iDate = headers.indexOf("date");
  const iPeriod = headers.indexOf("period");
  const iMemo = headers.indexOf("memo");
  const iSource = headers.indexOf("source");
  const iPostedBy = headers.indexOf("posted_by");
  const iVoidOf = headers.indexOf("void_of");

  const byTxn = new Map();
  const order = []; // first-seen order, to keep same-date entries stable
  for (const row of rows) {
    const txnId = row[iTxn];
    if (!byTxn.has(txnId)) {
      byTxn.set(txnId, {
        txn_id: txnId,
        date: iDate >= 0 ? row[iDate] : "",
        period: iPeriod >= 0 ? row[iPeriod] : "",
        memo: iMemo >= 0 ? row[iMemo] : "",
        source: iSource >= 0 ? row[iSource] : "",
        posted_by: iPostedBy >= 0 ? row[iPostedBy] : "",
        void_of: iVoidOf >= 0 ? row[iVoidOf] : "",
        lines: [],
      });
      order.push(txnId);
    }
    const line = {};
    headers.forEach((h, i) => (line[h] = row[i]));
    byTxn.get(txnId).lines.push(line);
  }

  return order
    .map((id) => byTxn.get(id))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export default async (req) => {
  const configErr = requireConfig(["WRITER_URL", "WRITER_SECRET", "SESSION_SECRET"]);
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

  if (req.method === "GET") {
    const url = new URL(req.url);
    const limitParam = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 200;

    try {
      const resp = await readTab(writer, "Journal", { limit });
      return json(200, { entries: groupJournalRows(resp.headers, resp.rows) });
    } catch (err) {
      return writerErrorResponse(err);
    }
  }

  if (req.method === "POST") {
    // Every write on this endpoint is owner-only (§5 role matrix: partner/accountant read-only).
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

    if (body && body.action === "void") {
      const { txn_id, reason } = body;
      if (!txn_id || !reason) {
        return json(400, { error: "BAD_REQUEST", message: "txn_id and reason are required" });
      }
      try {
        // lib/writer-client.mjs's void() resolves to the writer's raw body
        // {ok:true, rows:[first,last], txn_id: "void-"+original} (see
        // apps-script/writer/Code.gs action_void_) — there is no built §3 entry
        // object to hand back, so the ledger route's {entry} is a summary of what
        // the void actually wrote, not a full journal entry.
        const result = await writer.void(txn_id, reason, todayChicago(), session.email);
        await invalidateJournalCache(writer);
        return json(200, { entry: { txn_id: result.txn_id, void_of: txn_id, reason, rows: result.rows } });
      } catch (err) {
        return writerErrorResponse(err);
      }
    }

    if (!body || typeof body.intent !== "object" || body.intent === null) {
      return json(400, { error: "BAD_REQUEST", message: "intent is required" });
    }

    let ctx;
    try {
      ctx = await getPostingCtx(writer);
    } catch (err) {
      return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
    }

    // The person posting is whoever is signed in, not whatever the client claims.
    const intent = { ...body.intent, posted_by: session.email };

    let entry;
    try {
      entry = buildEntry(intent, ctx);
    } catch (err) {
      if (err instanceof PostingError) {
        return json(422, { error: err.code, message: err.message, details: err.details });
      }
      throw err;
    }

    try {
      const result = await writer.post(entry);
      await invalidateJournalCache(writer);
      return json(200, { entry, rows: result.rows });
    } catch (err) {
      return writerErrorResponse(err);
    }
  }

  return json(405, { error: "METHOD_NOT_ALLOWED" });
};

export const config = { path: "/api/ledger" };
