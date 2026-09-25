// netlify/functions/books-approve-background.mjs — path /api/approve-bg
//   POST (poller secret) {docId}  -> 202, then the filing and the post happen here
//
// The second half of books-inbox.mjs's `approve` verb. A synchronous function is cut off
// by Netlify's proxy at ~26 s, and on 2026-09-25 that happened twice (Energy Texas, Atmos)
// AFTER postBatch had landed, leaving the envelope at `posting` and the entry on the
// Journal with no record. So the sync verb now validates, builds the entries, marks the
// envelope `posting` with those entries, fires this, and answers 202. This files the
// attachments to Drive, posts, writes the envelope, and on a lost reply confirms the
// txn_ids on the Journal the same way ingest does. Same pattern as
// books-settlement-background.mjs. The workbook's in-process inboxApprove (Menu.gs) never
// goes through HTTP and is untouched.
import {
  requireConfig, json, pollerSecretOk, getWriter, getDocsStore, readTab,
  invalidateJournalCache, storeAttachmentsToDrive, WriterError,
} from "./_shared.mjs";
import { LOST_REPLY } from "../../lib/writer-client.mjs";

const JOURNAL_READ_TIMEOUT_MS = 60 * 1000;

/** Are all txn_ids on the Journal? A fresh read since the earliest entry date. */
async function confirmPosted(writer, txnIds, since) {
  const fresh = await readTab(writer, "Journal", { fresh: true, since, limit: 20000, timeoutMs: JOURNAL_READ_TIMEOUT_MS });
  const col = fresh.headers.indexOf("txn_id");
  const seen = new Set(fresh.rows.map((r) => String(r[col] || "")));
  return txnIds.every((t) => seen.has(t));
}

/** The work itself, exported so the test drives it without HTTP. */
export async function runApprove({ docId, writer, docsStore, folder, folderModel, by, note }) {
  const key = `doc/${docId}`;
  const envelope = await docsStore.get(key, { type: "json" });
  if (!envelope || envelope.status !== "posting" || !Array.isArray(envelope.posting_entries)) {
    return { ok: false, error: `envelope ${docId} is not awaiting a post` };
  }
  const entries = envelope.posting_entries;
  // Back to pending with the reason on the card: nothing was written.
  const backToPending = async (message) => {
    const { posting_entries, posting_at, ...rest } = envelope;
    await docsStore.setJSON(key, { ...rest, status: "pending", gate: { passed: false, reasons: [...(envelope.gate?.reasons || []), `approve failed: ${message}`] } });
    return { ok: false, error: message };
  };

  // A pending item was never filed to Drive on the way in (only an auto-post or a dry
  // run files - books-ingest-background.mjs); file it now so the entry carries a doc_url.
  let doc_url = envelope.result?.doc_url || "";
  if (!doc_url) {
    try {
      const filed = await storeAttachmentsToDrive(writer, docsStore, envelope, folder, folderModel);
      doc_url = filed[0]?.url || "";
    } catch (err) {
      return backToPending(`Drive filing: ${String((err && err.message) || err)}`);
    }
    if (doc_url) entries.forEach((e) => { e.doc_url = doc_url; });
  }

  let rows = null;
  try {
    rows = (await writer.postBatch(entries)).rows;
  } catch (err) {
    const lost = err instanceof WriterError && LOST_REPLY.has(err.code);
    const since = entries.map((e) => e.date).sort()[0];
    const landed = lost && (await confirmPosted(writer, entries.map((e) => e.txn_id), since).catch(() => false));
    if (!landed) return backToPending(`${err.code || "WRITER_ERROR"}: ${String((err && err.message) || err)}`);
  }

  const { posting_entries, posting_at, ...rest } = envelope;
  await docsStore.setJSON(key, {
    ...rest,
    status: "posted",
    result: { txn_ids: entries.map((e) => e.txn_id), rows, doc_url },
    review: { action: "approve", by, at: new Date().toISOString(), note: note || "" },
  });
  await invalidateJournalCache(writer);
  return { ok: true, txn_ids: entries.map((e) => e.txn_id) };
}

export default async (req) => {
  const configErr = requireConfig(["WRITER_URL", "WRITER_SECRET", "POLLER_SECRET"]);
  if (configErr) return configErr;
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: "BAD_REQUEST", message: "body must be JSON" }); }
  if (!body?.docId) return json(400, { error: "BAD_REQUEST", message: "docId is required" });
  const res = await runApprove({ ...body, writer: getWriter(), docsStore: getDocsStore() });
  if (!res.ok) console.error(`approve-bg ${body.docId}: ${res.error}`);
  return json(200, res);
};

export const config = { path: "/api/approve-bg" };
