// netlify/functions/_shared.mjs — helpers shared by books-*.mjs.
//
// A filename starting with "_" is not picked up by Netlify's function-discovery scan
// of netlify/functions/, so this stays a plain importable module and never becomes a
// deployed route of its own (spec: "files starting with underscore are not deployed
// as functions on Netlify").
//
// Imports lib/writer-client.mjs, lib/posting.mjs and lib/coa.mjs by the interfaces
// frozen in phase0-spec.md §9. Those modules are being built in parallel by other
// agents and may not exist on disk yet — that is expected; this file must not stub or
// duplicate them.

import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { verifySession, requireRole, AuthError } from "../../lib/auth.mjs";
import { createWriter, WriterError } from "../../lib/writer-client.mjs";

const REQUIRED_ENV = ["WRITER_URL", "WRITER_SECRET", "GOOGLE_CLIENT_ID", "SESSION_SECRET"];

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * §7: fail closed with 503 {error:"NOT_CONFIGURED", missing:[...]} when any of the env
 * vars a function actually needs is unset — never with a stack trace. Callers pass the
 * subset of REQUIRED_ENV they use; defaults to all four.
 */
export function requireConfig(names = REQUIRED_ENV) {
  const missing = names.filter((k) => !process.env[k]);
  if (missing.length) {
    return json(503, { error: "NOT_CONFIGURED", missing });
  }
  return null;
}

let writerSingleton = null;
export function getWriter() {
  if (!writerSingleton) {
    writerSingleton = createWriter({ url: process.env.WRITER_URL, secret: process.env.WRITER_SECRET });
  }
  return writerSingleton;
}

// Exposed so a test harness or a future function can reset the singleton between runs.
export function resetWriterForTests() {
  writerSingleton = null;
}

/**
 * Pull the session out of `Authorization: Bearer <token>` and verify it.
 * Throws AuthError("UNAUTHENTICATED") — same as a bad/expired session — if the header
 * is missing or malformed, so callers can treat every failure here as "go sign in".
 */
export function getSessionPayload(req) {
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m) {
    throw new AuthError("UNAUTHENTICATED", "missing Authorization: Bearer token");
  }
  return verifySession(m[1], process.env.SESSION_SECRET);
}

/**
 * Turn an AuthError into a Response: 403 for FORBIDDEN, 401 for everything else
 * (UNAUTHENTICATED and every id-token verification code alike — the client's only
 * correct reaction to any of them is "sign in again"). Returns null for a non-AuthError
 * so the caller can rethrow or handle it another way.
 */
export function authErrorResponse(err) {
  if (err instanceof AuthError) {
    const status = err.code === "FORBIDDEN" ? 403 : 401;
    return json(status, { error: err.code, message: err.message });
  }
  return null;
}

export { requireRole, WriterError, AuthError };

function rowsToObjects(headers, rows) {
  return rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
}

/** "today" in America/Chicago as an ISO date — spec §9. */
export function todayChicago() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // en-CA formats as YYYY-MM-DD
}

// ---- phase 2.5: read cache (docs/phase2.5-spec.md) ---------------------------
// Netlify Blobs store "books-cache" (strong consistency), key "tab/<tab name>",
// value {fetchedAt, headers, rows} — the whole tab. since/limit/all (Journal only)
// are applied after the read so one snapshot serves every shape of read.
let cacheStoreOverride = null;
export function getCacheStore() {
  if (cacheStoreOverride) return cacheStoreOverride;
  return getStore({ name: "books-cache", consistency: "strong" });
}

/** Tests inject a fake store here; pass null to clear. */
export function resetCacheStoreForTests(fake = null) {
  cacheStoreOverride = fake;
}

const WRITER_READ_TIMEOUT_MS = 8000;
// Journal is writer-only and every write refreshes the snapshot, so the TTL only
// guards a tab nobody hand-edits; 60 s sent every ledger page load to the cold writer.
// 20 min: the poller kicks the warmer every 15 min, so a snapshot is never older than
// that unless the warmer failed; the Netlify schedule is a bonus when it fires.
const JOURNAL_TTL_MS = 20 * 60 * 1000;
const DEFAULT_TAB_TTL_MS = 20 * 60 * 1000;

function tabTtlMs(tab) {
  return tab === "Journal" ? JOURNAL_TTL_MS : DEFAULT_TAB_TTL_MS;
}

/** Races a promise against an 8s timer so a cold Apps Script call can't hang a function past its own budget. */
function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/** Whole-tab writer read. Journal needs {all:true} to bypass the writer's own
 * 200-row default; every other tab already returns everything with no options. */
function fetchTabFromWriter(writer, tab, timeoutMs = WRITER_READ_TIMEOUT_MS) {
  const opts = tab === "Journal" ? { all: true } : undefined;
  return withTimeout(writer.read(tab, opts), timeoutMs, `readTab: writer read of ${tab} timed out`);
}

/** since/limit/all applied identically to the writer's own action_read_ filtering
 * (apps-script/writer/Code.gs): since filters by date >= since, then (unless all)
 * slice to the last `limit` (default 200, max 20000) rows. Only Journal is filtered. */
function applyReadOpts(tab, headers, rows, { since, limit, all } = {}) {
  if (tab !== "Journal") return rows;
  let out = rows;
  if (since) {
    const dateIdx = headers.indexOf("date");
    out = out.filter((row) => String(row[dateIdx]) >= since);
  }
  if (!all) {
    const lim = Math.max(1, Math.min(Number(limit) || 200, 20000));
    if (out.length > lim) out = out.slice(out.length - lim);
  }
  return out;
}

/** Re-reads a tab from the writer and stores it as the new snapshot. Exported so a
 * write handler can refresh exactly the tab it just wrote. */
export async function refreshTab(writer, tab, { timeoutMs } = {}) {
  const resp = await fetchTabFromWriter(writer, tab, timeoutMs);
  const snapshot = { fetchedAt: Date.now(), headers: resp.headers, rows: resp.rows };
  await getCacheStore().setJSON(`tab/${tab}`, snapshot);
  return { headers: snapshot.headers, rows: snapshot.rows };
}

/**
 * The refresh a write handler calls after the write succeeded. Best effort: the
 * write is already in the workbook, so a slow writer here must not turn a successful
 * post into an error response (or, in the ingest, an "error" envelope that a reprocess
 * would post again). On failure the snapshot is dropped so the next read misses.
 */
export async function refreshTabAfterWrite(writer, tab) {
  try {
    await refreshTab(writer, tab);
  } catch {
    try { await getCacheStore().delete(`tab/${tab}`); } catch { /* nothing left to do */ }
  }
}

/**
 * Read a tab from the books-cache snapshot, refreshing from the writer on a miss,
 * an expired TTL, or {fresh:true}. Stale beats dead: if the writer read aborts
 * (8s) or throws, an existing snapshot (any age) is returned with `stale: true`
 * instead of failing the request; only with no snapshot at all does it rethrow.
 */
export async function readTab(writer, tab, { fresh = false, since, limit, all, timeoutMs } = {}) {
  const store = getCacheStore();
  const key = `tab/${tab}`;
  const cached = fresh ? null : await store.get(key, { type: "json" });

  if (cached && Date.now() - cached.fetchedAt < tabTtlMs(tab)) {
    return { headers: cached.headers, rows: applyReadOpts(tab, cached.headers, cached.rows, { since, limit, all }) };
  }

  try {
    const resp = await refreshTab(writer, tab, { timeoutMs });
    return { headers: resp.headers, rows: applyReadOpts(tab, resp.headers, resp.rows, { since, limit, all }) };
  } catch (err) {
    // A caller that asked for fresh asked because the answer must be current (the
    // D-012 duplicate re-check before a post). Stale would defeat it - fail instead.
    if (fresh) throw err;
    const fallback = cached || (await store.get(key, { type: "json" }));
    if (fallback) {
      return {
        headers: fallback.headers,
        rows: applyReadOpts(tab, fallback.headers, fallback.rows, { since, limit, all }),
        stale: true,
      };
    }
    throw err;
  }
}

function isActive(value) {
  const s = String(value ?? "").trim().toLowerCase();
  return s !== "false" && s !== "0" && s !== "no";
}

// ctx for the posting engine, built from Accounts/Properties/Periods — spec §9.
// Thin wrapper over readTab; each of the three tabs has its own books-cache snapshot
// and TTL, so this itself holds no state.
export async function getPostingCtx(writer, { fresh = false } = {}) {
  const [accountsResp, propertiesResp, periodsResp] = await Promise.all([
    readTab(writer, "Accounts", { fresh }),
    readTab(writer, "Properties", { fresh }),
    readTab(writer, "Periods", { fresh }),
  ]);

  const accountRows = rowsToObjects(accountsResp.headers, accountsResp.rows);
  const accounts = new Map(
    accountRows.filter((r) => isActive(r.active)).map((r) => [String(r.code), { ...r, code: String(r.code), series: String(r.series) }]),
  );

  const propertyRows = rowsToObjects(propertiesResp.headers, propertiesResp.rows);
  const properties = new Set(propertyRows.map((r) => r.name).filter(Boolean));

  const periodRows = rowsToObjects(periodsResp.headers, periodsResp.rows);
  const periods = new Map(periodRows.map((r) => [r.period, r.status]));

  return { accounts, properties, periods, today: todayChicago() };
}

/**
 * Call after a write to Accounts, Properties or Periods (whichever one was just
 * written — post/postBatch/void never touch these, so they don't call this).
 * Refreshes that tab's books-cache snapshot via the writer so the next
 * getPostingCtx sees it immediately instead of waiting out the TTL.
 */
export async function invalidateCtxCache(writer, tab) {
  if (writer && tab) await refreshTabAfterWrite(writer, tab);
}

// Users lookup for books-auth — spec §5. Thin wrapper over readTab.
export async function getUsersByEmail(writer, { fresh = false } = {}) {
  const resp = await readTab(writer, "Users", { fresh });
  const rows = rowsToObjects(resp.headers, resp.rows);
  return new Map(rows.map((r) => [String(r.email).trim().toLowerCase(), r]));
}

export function rowsToObjectsPublic(headers, rows) {
  return rowsToObjects(headers, rows);
}

// Journal (all rows) for the reports pages and the Dennis ledger — spec section 4.
// Thin wrapper over readTab.
export async function getJournalAll(writer, { fresh = false } = {}) {
  const resp = await readTab(writer, "Journal", { fresh, all: true });
  return { headers: resp.headers, rows: resp.rows };
}

/** Call after any post/void/postBatch (books-ledger, books-dennis, books-inbox,
 * books-ingest-background) - refreshes the Journal books-cache snapshot via the writer. */
export async function invalidateJournalCache(writer) {
  if (writer) await refreshTabAfterWrite(writer, "Journal");
}

// ---- phase 2 additions -------------------------------------------------------
// getDocsStore(): the Netlify Blobs store "books-docs" (phase2-spec.md section 1),
// shared by books-upload / books-ingest-background / books-inbox / books-file /
// books-summary. Netlify Functions v2 resolves the store's site context (siteID,
// token) from the deploy environment automatically, so no explicit config is
// needed here beyond the store name - same as getWriter()'s lazy singleton above.
// NOT a singleton: the Blobs client carries a short-lived token from the invocation
// context, and a warm function instance that kept one across requests failed with
// "Failed to decode token: Token expired" (seen 2026-09-11). A store handle is cheap.
let docsStoreOverride = null;
export function getDocsStore() {
  if (docsStoreOverride) return docsStoreOverride;
  return getStore({ name: "books-docs", consistency: "strong" });
}

/** Tests inject a fake store here; pass null to clear. */
export function resetDocsStoreForTests(fake = null) {
  docsStoreOverride = fake;
}

/**
 * The poller/upload shared-secret check (phase2-spec.md section 5: "auth = session
 * or header x-poller-secret = POLLER_SECRET"). Constant-time compare so response
 * timing can't leak the secret. Returns false (never throws) on any mismatch,
 * missing header, or missing/empty POLLER_SECRET env var - callers fall through to
 * session auth in that case.
 */
export function pollerSecretOk(req) {
  const expected = process.env.POLLER_SECRET || "";
  const got = req.headers.get("x-poller-secret") || "";
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Files every attachment of an envelope to Drive via the writer's storeDocument
 * action (phase2-spec.md section 7), under the given folder path. Reads attachment
 * bytes back from the docs store (stored as base64 text by books-upload.mjs at
 * att/<docId>/<i>). Shared by books-ingest-background.mjs (auto-post and dry-run
 * filing) and books-inbox.mjs (filing on human approve, when the document was never
 * auto-filed because the item sat in Pending). Returns
 * [{fileId, url, folderUrl, name}, ...] in attachment order; an attachment whose
 * bytes are missing from the store is skipped rather than failing the whole batch.
 */
export async function storeAttachmentsToDrive(writer, docsStore, envelope, folder, model) {
  const results = [];
  const attachments = envelope.attachments || [];
  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const key = att.key || `att/${envelope.docId}/${i}`;
    const base64 = await docsStore.get(key, { type: "text" });
    if (!base64) continue;
    const name = driveFileName(model, att.name || `attachment-${i}`, i);
    const stored = await writer.storeDocument(name, att.mime || "application/octet-stream", base64, folder);
    results.push({ ...stored, name });
  }
  return results;
}

/**
 * "<date> <vendor> <total>.<ext>" from the model verdict (phone photos all arrive as
 * image.jpg); the original name when there is no verdict to name it from. A second
 * attachment gets " (2)".
 */
export function driveFileName(model, original, index = 0) {
  const vendor = String(model?.vendor || "").trim().replace(/[\\/:*?"<>|]+/g, "").slice(0, 60);
  const cents = Number(model?.receipt_total_cents);
  if (!model?.date || !vendor || !Number.isFinite(cents)) return original;
  const ext = (original.match(/\.[A-Za-z0-9]{1,5}$/) || [""])[0].toLowerCase();
  const suffix = index > 0 ? ` (${index + 1})` : "";
  return `${model.date} ${vendor} ${(cents / 100).toFixed(2)}${suffix}${ext}`;
}
