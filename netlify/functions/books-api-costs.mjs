// netlify/functions/books-api-costs.mjs — path /api/api-costs — D-018
//   GET  /api/api-costs?month=YYYY-MM   -> the month's Anthropic spend split by workspace,
//                                          the account each maps to, nothing written
//                                          (any signed-in role, or the poller secret)
//   POST /api/api-costs {month?}        -> posts one entry: Dr <account per workspace>,
//                                          Cr 1520 Prepaid API credits, dated the last
//                                          day of the month (owner, or the poller secret;
//                                          month defaults to the previous month)
//
// Why: an Anthropic receipt is a credit top-up and never says which system spent the
// money. Paul (2026-09-14): "i want to split where these charges are being logged so i
// know what each is costing me." Top-ups post to 1520 (prompt rule); this job expenses
// the usage from Anthropic's own cost report, one line per Console workspace, to the
// account in Settings `api_cost_account:<workspace name>` (default 6400). Deterministic:
// the split is Anthropic's number, the mapping is a setting, no model judgment.
//
// Idempotent: a month already posted (a live 1520 credit line whose description is
// "API usage <month>") is skipped, so the poller can call this every day of the month.
// Admin credential: ANTHROPIC_ADMIN_KEY (sk-ant-admin..., Paul sets it on Netlify).
// ponytail: runs synchronously like books-dennis (two Admin API calls + one writer
// post); move behind a -background function if the 10 s budget ever bites.

import {
  requireConfig,
  json,
  getWriter,
  getPostingCtx,
  getJournalAll,
  invalidateJournalCache,
  invalidateCtxCache,
  readTab,
  refreshTabAfterWrite,
  getSessionPayload,
  requireRole,
  authErrorResponse,
  pollerSecretOk,
  todayChicago,
  rowsToObjectsPublic,
  WriterError,
} from "./_shared.mjs";
import { buildEntry, PostingError } from "../../lib/posting.mjs";
import { lastDayOf } from "../../lib/accrual.mjs";

export const PREPAID_ACCOUNT = "1520";
export const DEFAULT_USAGE_ACCOUNT = "6400";
const SETTING_PREFIX = "api_cost_account:";
// D-018 mapping used when Settings has no row for the workspace yet (the row is then
// written so the Settings page shows it); the live workbook predates the seed.
const DEFAULT_MAP = new Map([
  ["recast books", "6210"],
  ["receipts (old site)", "6210"],
  ["title search", "6300"],
]);
const ANTHROPIC_BASE = process.env.ANTHROPIC_ADMIN_BASE || "https://api.anthropic.com";

const PREPAID_ROW = {
  code: PREPAID_ACCOUNT,
  name: "Prepaid API credits",
  series: "1400",
  type: "asset",
  cost_class: "",
  tax_treatment: "",
  active: true,
  notes: "D-018: Anthropic top-ups; drawn down monthly by /api/api-costs",
};

/** "2026-09" -> the month before, "2026-08". */
export function previousMonth(isoDate) {
  const [y, m] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function adminGet(path, params) {
  const url = new URL(path, ANTHROPIC_BASE);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      "x-api-key": process.env.ANTHROPIC_ADMIN_KEY,
      "anthropic-version": "2023-06-01",
      "user-agent": "RecastBooks/1.0 (https://books.recast-properties.com)",
    },
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`Anthropic admin ${path} ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

/** Workspace id -> name; the default workspace reports as null and is named "Default". */
async function workspaceNames() {
  const names = new Map([[null, "Default"]]);
  let after;
  for (let page = 0; page < 20; page++) {
    const resp = await adminGet("/v1/organizations/workspaces", { limit: 1000, include_archived: true, after_id: after });
    for (const w of resp.data || []) names.set(w.id, w.name);
    if (!resp.has_more || !resp.last_id) break;
    after = resp.last_id;
  }
  return names;
}

/**
 * Sum the month's cost report by workspace id. Amounts arrive as decimal strings in
 * cents ("123.78912" = $1.24); summed as numbers and rounded to whole cents at the end.
 */
export async function costByWorkspace(month) {
  const totals = new Map();
  let page;
  for (let i = 0; i < 20; i++) {
    const resp = await adminGet("/v1/organizations/cost_report", {
      starting_at: `${month}-01T00:00:00Z`,
      ending_at: `${nextMonth(month)}-01T00:00:00Z`,
      "group_by[]": ["workspace_id"],
      limit: 31,
      page,
    });
    for (const bucket of resp.data || []) {
      for (const r of bucket.results || []) {
        if (r.currency && r.currency !== "USD") throw new Error(`unexpected currency ${r.currency}`);
        const id = r.workspace_id ?? null;
        totals.set(id, (totals.get(id) || 0) + Number(r.amount || 0));
      }
    }
    if (!resp.has_more || !resp.next_page) break;
    page = resp.next_page;
  }
  return new Map([...totals].map(([id, cents]) => [id, Math.round(cents)]));
}

function normalizeName(s) {
  return String(s || "").trim().toLowerCase();
}

/** Settings rows -> {normalized workspace name -> account code}. */
function accountMap(settingsRows) {
  const map = new Map();
  for (const r of settingsRows) {
    const key = String(r.key || "");
    if (key.startsWith(SETTING_PREFIX)) map.set(normalizeName(key.slice(SETTING_PREFIX.length)), String(r.value || "").trim());
  }
  return map;
}

/** The split for one month: [{workspace, cents, account, mapped}], total, entry date. */
export async function buildSplit(writer, month) {
  const [names, totals, settingsResp] = await Promise.all([
    workspaceNames(),
    costByWorkspace(month),
    readTab(writer, "Settings"),
  ]);
  const map = accountMap(rowsToObjectsPublic(settingsResp.headers, settingsResp.rows));
  const lines = [];
  for (const [id, cents] of totals) {
    if (cents <= 0) continue;
    const workspace = names.get(id) || String(id);
    const key = normalizeName(workspace);
    const account = map.get(key);
    lines.push({ workspace, cents, account: account || DEFAULT_MAP.get(key) || DEFAULT_USAGE_ACCOUNT, mapped: Boolean(account) });
  }
  lines.sort((a, b) => b.cents - a.cents);
  return { month, date: lastDayOf(month), lines, total_cents: lines.reduce((s, l) => s + l.cents, 0) };
}

/** True when a live (not voided) 1520 credit for this month is already on the Journal. */
export function alreadyPosted(journal, month) {
  const rows = rowsToObjectsPublic(journal.headers, journal.rows);
  const voided = new Set(rows.map((r) => r.void_of).filter(Boolean));
  return rows.some(
    (r) =>
      String(r.account) === PREPAID_ACCOUNT &&
      r.description === `API usage ${month}` &&
      r.source !== "void" &&
      !voided.has(r.txn_id),
  );
}

export function usageEntryIntent(split, posted_by) {
  const lines = split.lines.map((l) => ({
    account: l.account,
    debit: l.cents,
    property: "OVERHEAD",
    payee: "Anthropic",
    description: `API usage ${split.month} - ${l.workspace}`,
  }));
  lines.push({
    account: PREPAID_ACCOUNT,
    credit: split.total_cents,
    property: "OVERHEAD",
    payee: "Anthropic",
    description: `API usage ${split.month}`,
  });
  return {
    type: "journal",
    date: split.date,
    memo: `Anthropic API usage for ${split.month} by workspace (D-018)`,
    source: "close",
    posted_by,
    lines,
  };
}

async function ensureMappingRows(writer, split) {
  // Unmapped workspaces get a Settings row at the default so the Settings page shows
  // Paul exactly what to change; a mapped one is left alone.
  let wrote = false;
  for (const l of split.lines) {
    if (l.mapped) continue;
    await writer.upsert("Settings", "key", { key: SETTING_PREFIX + l.workspace, value: l.account, notes: "D-018: account for this Anthropic workspace's usage" });
    wrote = true;
  }
  if (wrote) await refreshTabAfterWrite(writer, "Settings");
}

export default async function handler(req) {
  const missing = requireConfig(["WRITER_URL", "WRITER_SECRET", "SESSION_SECRET", "ANTHROPIC_ADMIN_KEY"]);
  if (missing) return missing;

  let session = null;
  const viaPoller = pollerSecretOk(req);
  if (!viaPoller) {
    try {
      session = await getSessionPayload(req);
    } catch (err) {
      const resp = authErrorResponse(err);
      if (resp) return resp;
      throw err;
    }
  }

  const writer = getWriter();
  const url = new URL(req.url);
  let month;
  let body = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }
  month = (req.method === "GET" ? url.searchParams.get("month") : body.month) || previousMonth(todayChicago());
  if (!/^\d{4}-\d{2}$/.test(month)) return json(400, { error: "BAD_REQUEST", message: "month must be YYYY-MM" });

  let split;
  try {
    split = await buildSplit(writer, month);
  } catch (err) {
    return json(502, { error: "COST_REPORT_ERROR", message: String((err && err.message) || err) });
  }

  if (req.method === "GET") return json(200, split);
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  if (!viaPoller) {
    try {
      requireRole(session, ["owner"]);
    } catch (err) {
      const resp = authErrorResponse(err);
      if (resp) return resp;
      throw err;
    }
  }

  if (split.total_cents === 0) return json(200, { ...split, posted: false, reason: "NO_SPEND" });

  try {
    const journal = await getJournalAll(writer, { fresh: true });
    if (alreadyPosted(journal, month)) return json(200, { ...split, posted: false, reason: "ALREADY_POSTED" });
  } catch (err) {
    return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
  }

  let ctx;
  try {
    await ensureMappingRows(writer, split);
    if (!(await getPostingCtx(writer)).accounts.has(PREPAID_ACCOUNT)) {
      await writer.upsert("Accounts", "code", PREPAID_ROW);
      await invalidateCtxCache(writer, "Accounts");
    }
    ctx = await getPostingCtx(writer);
  } catch (err) {
    return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
  }

  let entry;
  try {
    entry = buildEntry(usageEntryIntent(split, session ? session.email : "system"), ctx);
  } catch (err) {
    if (err instanceof PostingError) return json(422, { error: err.code, message: err.message, details: err.details });
    throw err;
  }

  try {
    const result = await writer.post(entry);
    await invalidateJournalCache(writer);
    return json(200, { ...split, posted: true, txn_id: entry.txn_id, rows: result.rows });
  } catch (err) {
    if (err instanceof WriterError) {
      return json(err.code === "DUPLICATE" ? 409 : 502, { error: err.code, message: err.message });
    }
    return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
  }
}
