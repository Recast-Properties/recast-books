// lib/sheets-reader.mjs — D-047: reads come off the Apps Script writer.
//
// A service account (Viewer on the workbook) reads a tab through the Sheets values API
// and returns exactly what the writer's readTabData_ (apps-script/writer/Code.gs) returns
// for a whole-tab read: {ok, headers, rows}, numbers as numbers, booleans as booleans,
// Date cells as the writer's ISO strings. The writer keeps every WRITE under its lock;
// this only ever GETs. No dependency: RS256 JWT with node:crypto, token cached ~50 min.
//
// Date cells: the values API has no cell type, so a Date is recognised by its column,
// not by `instanceof Date`. The column lists below are the writer's (Code.gs
// readTabData_'s timestamp/period columns) plus the date columns of TAB_HEADERS. A
// number in one of those columns is a Sheets serial (days since 1899-12-30, wall-clock
// in the spreadsheet's timezone, America/Chicago = the script's, so no shift).
// scripts/reads-tieout.mjs proves the two paths agree cell by cell before the flip.

import { createSign } from "node:crypto";

export const READABLE_TABS = ["Accounts", "Properties", "Bank accounts", "Vendors", "Periods", "Settings", "Users", "Journal", "Advances"];
const TIMESTAMP_COLS = new Set(["posted_at", "closed_at", "added_at"]);
const PERIOD_COLS = new Set(["period"]);
const DATE_COLS = new Set(["date", "purchase_date", "settlement_date", "accrued_to", "repaid_date", "opening_date"]);

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TOKEN_TTL_MS = 50 * 60 * 1000;
const SERIAL_EPOCH_DAYS = 25569; // 1899-12-30 -> 1970-01-01
const TOKEN_URI = "https://oauth2.googleapis.com/token";

export class SheetsReadError extends Error {
  constructor(code, message, status) {
    super(message || code);
    this.name = "SheetsReadError";
    this.code = code;
    this.status = status;
  }
}

/** Sheets serial -> Date holding the wall-clock as UTC (so the host timezone never matters). */
export function serialToDate(n) {
  return new Date(Math.round((n - SERIAL_EPOCH_DAYS) * 86400000));
}

export function formatCell(header, cell) {
  if (typeof cell !== "number") return cell;
  if (PERIOD_COLS.has(header)) return serialToDate(cell).toISOString().slice(0, 7);
  if (TIMESTAMP_COLS.has(header)) return serialToDate(cell).toISOString().slice(0, 19);
  if (DATE_COLS.has(header)) return serialToDate(cell).toISOString().slice(0, 10);
  return cell;
}

/** SHEETS_SA_KEY: the key file's JSON (only client_email and private_key are needed - Netlify
 * caps all env vars at 4 KB together, and the whole file base64'd was over it on 2026-09-25),
 * or the whole file base64-encoded. */
export function parseKey(raw) {
  const text = String(raw || "").trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const key = JSON.parse(text);
  if (!key.client_email || !key.private_key) throw new SheetsReadError("BAD_KEY", "service account key needs client_email and private_key");
  return { ...key, token_uri: key.token_uri || TOKEN_URI };
}

/**
 * @param {object} opts
 * @param {string} opts.key - SHEETS_SA_KEY (base64 JSON key file, or the JSON itself)
 * @param {string} opts.spreadsheetId
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {() => number} [opts.now]
 */
export function createSheetsReader({ key, spreadsheetId, fetchImpl = fetch, now = Date.now }) {
  if (!spreadsheetId) throw new SheetsReadError("NOT_CONFIGURED", "SPREADSHEET_ID is required with SHEETS_SA_KEY");
  const sa = parseKey(key);
  let cached = null;

  async function token() {
    if (cached && now() < cached.exp) return cached.token;
    const iat = Math.floor(now() / 1000);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat, exp: iat + 3600 })}`;
    const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
    const res = await fetchImpl(sa.token_uri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }).toString(),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) throw new SheetsReadError("TOKEN", `token exchange failed: ${res.status} ${body.error_description || body.error || ""}`.trim(), res.status);
    cached = { token: body.access_token, exp: now() + TOKEN_TTL_MS };
    return cached.token;
  }

  /** Whole tab, the writer's readTabData_ shape. since/limit/all are applied by the caller (applyReadOpts). */
  async function read(tab) {
    if (!READABLE_TABS.includes(tab)) throw new SheetsReadError("BAD_TAB", `tab not readable: ${tab}`);
    const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${await token()}` } });
    if (res.status === 401) cached = null; // a revoked token: the next read signs a new one
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) throw new SheetsReadError(res.status === 404 ? "NOT_FOUND" : "HTTP", `sheets read of ${tab}: HTTP ${res.status} ${body?.error?.message || ""}`.trim(), res.status);
    const values = body.values || [];
    const headers = values[0] || [];
    // The API trims trailing empty cells and returns [] for an empty row; getValues() pads to the last column.
    const rows = values.slice(1).map((row) => headers.map((h, i) => formatCell(h, row[i] === undefined ? "" : row[i])));
    return { ok: true, headers, rows };
  }

  return { read };
}
