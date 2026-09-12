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

// ctx for the posting engine, built from Accounts/Properties/Periods reads and cached
// 60s in module scope — spec §9.
const CTX_TTL_MS = 60 * 1000;
let ctxCache = null; // { ctx, fetchedAt }

function isActive(value) {
  const s = String(value ?? "").trim().toLowerCase();
  return s !== "false" && s !== "0" && s !== "no";
}

export async function getPostingCtx(writer, { fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && ctxCache && now - ctxCache.fetchedAt < CTX_TTL_MS) {
    return ctxCache.ctx;
  }

  const [accountsResp, propertiesResp, periodsResp] = await Promise.all([
    writer.read("Accounts"),
    writer.read("Properties"),
    writer.read("Periods"),
  ]);

  const accountRows = rowsToObjects(accountsResp.headers, accountsResp.rows);
  const accounts = new Map(
    accountRows.filter((r) => isActive(r.active)).map((r) => [String(r.code), { ...r, code: String(r.code), series: String(r.series) }]),
  );

  const propertyRows = rowsToObjects(propertiesResp.headers, propertiesResp.rows);
  const properties = new Set(propertyRows.map((r) => r.name).filter(Boolean));

  const periodRows = rowsToObjects(periodsResp.headers, periodsResp.rows);
  const periods = new Map(periodRows.map((r) => [r.period, r.status]));

  const ctx = { accounts, properties, periods, today: todayChicago() };
  ctxCache = { ctx, fetchedAt: now };
  return ctx;
}

/** Call after any write that could change Accounts/Properties/Periods. */
export function invalidateCtxCache() {
  ctxCache = null;
}

// Users lookup for books-auth, cached 5 min in module scope — spec §5.
const USERS_TTL_MS = 5 * 60 * 1000;
let usersCache = null; // { byEmail, fetchedAt }

export async function getUsersByEmail(writer, { fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && usersCache && now - usersCache.fetchedAt < USERS_TTL_MS) {
    return usersCache.byEmail;
  }
  const resp = await writer.read("Users");
  const rows = rowsToObjects(resp.headers, resp.rows);
  const byEmail = new Map(rows.map((r) => [String(r.email).trim().toLowerCase(), r]));
  usersCache = { byEmail, fetchedAt: now };
  return byEmail;
}

export function rowsToObjectsPublic(headers, rows) {
  return rowsToObjects(headers, rows);
}

// Journal (all rows) cache for the reports pages and the Dennis ledger - spec section
// 4: "Reads Journal with all:true, cached 30 s in module scope, invalidated by any
// post (export invalidateJournalCache() from _shared.mjs; call it from ledger/dennis
// posts)."
const JOURNAL_TTL_MS = 30 * 1000;
let journalCache = null; // { data: {headers, rows}, fetchedAt }

export async function getJournalAll(writer, { fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && journalCache && now - journalCache.fetchedAt < JOURNAL_TTL_MS) {
    return journalCache.data;
  }
  const resp = await writer.read("Journal", { all: true });
  const data = { headers: resp.headers, rows: resp.rows };
  journalCache = { data, fetchedAt: now };
  return data;
}

/** Call after any post/void (books-ledger, books-dennis) - the journal just changed. */
export function invalidateJournalCache() {
  journalCache = null;
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
