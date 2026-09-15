// netlify/functions/books-meta.mjs — spec §9; POST removed 2026-09-15 (D-023,
// phase2.7-spec.md §5) — setPeriod/upsert/propertyTab now run from the workbook's
// Recast Books menu. GET stays: the Inbox pickers and the model's tools read it.
//   GET /api/meta?tab=Accounts|Properties|Periods|Settings|Users|Bank accounts|Vendors -> {headers, rows}

import {
  requireConfig,
  json,
  getWriter,
  getSessionPayload,
  requireRole,
  authErrorResponse,
  readTab,
  getCacheStore,
  WriterError,
} from "./_shared.mjs";

const READABLE_TABS = new Set([
  "Accounts",
  "Properties",
  "Periods",
  "Settings",
  "Users",
  "Bank accounts",
  "Vendors",
  "Advances",
]);

function writerErrorResponse(err) {
  if (err instanceof WriterError) {
    return json(502, { error: err.code, message: err.message });
  }
  return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
}

let spreadsheetUrlMemo;

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
    const tab = url.searchParams.get("tab");
    if (!tab || !READABLE_TABS.has(tab)) {
      return json(400, {
        error: "BAD_REQUEST",
        message: `tab must be one of: ${[...READABLE_TABS].join(", ")}`,
      });
    }
    // ?fresh=1 (phase2.5-spec.md section 2): forces a re-read past the books-cache
    // TTL, for the Settings/Users pages after Paul edits the sheet by hand. Owner-only.
    const wantsFresh = url.searchParams.get("fresh") === "1";
    if (wantsFresh) {
      try {
        requireRole(session, ["owner"]);
      } catch (err) {
        const resp = authErrorResponse(err);
        if (resp) return resp;
        throw err;
      }
    }
    try {
      const resp = await readTab(writer, tab, { fresh: wantsFresh });
      const rows = resp.rows.slice();
      // The workbook link is not a stored setting; the writer knows it (ping) and the
      // dashboard reads it from Settings, so surface it there as a derived row.
      if (tab === "Settings" && !rows.some((r) => r[0] === "spreadsheet_url")) {
        // The workbook url never changes and ping is a full Apps Script round trip
        // (10-20 s cold, 2026-09-14). Cached in books-cache across instances; a memo
        // alone still paid it once per cold function instance.
        if (spreadsheetUrlMemo === undefined) {
          const store = getCacheStore();
          spreadsheetUrlMemo = (await store.get("meta/spreadsheet_url", { type: "text" })) || "";
          if (!spreadsheetUrlMemo) {
            try {
              spreadsheetUrlMemo = (await writer.ping()).spreadsheet_url || "";
              if (spreadsheetUrlMemo) await store.set("meta/spreadsheet_url", spreadsheetUrlMemo);
            } catch { spreadsheetUrlMemo = undefined; }
          }
        }
        if (spreadsheetUrlMemo) rows.push(["spreadsheet_url", spreadsheetUrlMemo, "from writer ping"]);
      }
      return json(200, { headers: resp.headers, rows, ...(resp.stale ? { stale: true } : {}) });
    } catch (err) {
      return writerErrorResponse(err);
    }
  }

  // setPeriod/upsert/propertyTab moved to the workbook's Recast Books menu (D-023).
  return json(405, { error: "METHOD_NOT_ALLOWED" });
};

export const config = { path: "/api/meta" };
