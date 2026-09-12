// netlify/functions/books-meta.mjs — spec §9
//   GET  /api/meta?tab=Accounts|Properties|Periods|Settings|Users|Bank accounts|Vendors -> {headers, rows}
//   POST /api/meta {action:"setPeriod", period, status}                                  (owner)
//   POST /api/meta {action:"upsert", tab, key_column, row}                                (owner)

import {
  requireConfig,
  json,
  getWriter,
  getSessionPayload,
  requireRole,
  authErrorResponse,
  invalidateCtxCache,
  readTab,
  refreshTabAfterWrite,
  rowsToObjectsPublic,
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

// spec phase1 section 4/5: Users upsert validates role against this set. The writer has
// no delete, so "removed" IS how a user is taken off the access list: books-auth.mjs
// refuses that role at sign-in (403 NOT_ALLOWED). The last-owner check below still
// applies to it.
const VALID_USER_ROLES = new Set(["owner", "partner", "accountant", "removed"]);

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
        // Memoized per instance: the workbook url never changes and ping is a full
        // Apps Script round trip (phase 2.5 - no writer call on a warm Settings read).
        if (spreadsheetUrlMemo === undefined) spreadsheetUrlMemo = (await writer.ping()).spreadsheet_url || "";
        if (spreadsheetUrlMemo) rows.push(["spreadsheet_url", spreadsheetUrlMemo, "from writer ping"]);
      }
      return json(200, { headers: resp.headers, rows, ...(resp.stale ? { stale: true } : {}) });
    } catch (err) {
      return writerErrorResponse(err);
    }
  }

  if (req.method === "POST") {
    // Every write on this endpoint is owner-only (§5 role matrix).
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

    if (body.action === "setPeriod") {
      const { period, status } = body;
      if (!period || !status) {
        return json(400, { error: "BAD_REQUEST", message: "period and status are required" });
      }
      try {
        const result = await writer.setPeriod(period, status);
        await invalidateCtxCache(writer, "Periods"); // periods feed the posting-engine ctx
        return json(200, result);
      } catch (err) {
        return writerErrorResponse(err);
      }
    }

    if (body.action === "upsert") {
      const { tab, key_column, row } = body;
      if (!tab || !key_column || !row) {
        return json(400, { error: "BAD_REQUEST", message: "tab, key_column and row are required" });
      }

      if (tab === "Users") {
        if (row.role !== undefined && !VALID_USER_ROLES.has(row.role)) {
          return json(400, {
            error: "BAD_ROLE",
            message: `role must be one of: ${[...VALID_USER_ROLES].join(", ")}`,
          });
        }
        // Refuse to demote (or, once the writer supports it, remove) the last owner.
        // Only relevant when this upsert is actually changing the role away from owner.
        if (row.role !== undefined && row.role !== "owner") {
          let users;
          try {
            const usersResp = await readTab(writer, "Users");
            users = rowsToObjectsPublic(usersResp.headers, usersResp.rows);
          } catch (err) {
            return writerErrorResponse(err);
          }
          const keyValue = row[key_column];
          const target = users.find((u) => String(u[key_column]) === String(keyValue));
          const owners = users.filter((u) => u.role === "owner");
          if (target && target.role === "owner" && owners.length <= 1) {
            return json(409, { error: "LAST_OWNER", message: "cannot demote or remove the last owner" });
          }
        }
      }

      if (tab === "Bank accounts") {
        // spec phase1 section 4: upserting a bank account also upserts the matching
        // Accounts row (so it gets a working 14xx code) and invalidates ctx.
        try {
          const bankResult = await writer.upsert("Bank accounts", key_column, row);
          const code = row.code ?? row[key_column];
          const accountsRow = {
            code,
            name: `Cash - ${row.name ?? ""}`,
            series: "1400",
            type: "asset",
            active: true,
          };
          await writer.upsert("Accounts", "code", accountsRow);
          await refreshTabAfterWrite(writer, "Bank accounts");
          await invalidateCtxCache(writer, "Accounts");
          return json(200, bankResult);
        } catch (err) {
          return writerErrorResponse(err);
        }
      }

      try {
        const result = await writer.upsert(tab, key_column, row);
        if (tab === "Properties" || tab === "Accounts") {
          await invalidateCtxCache(writer, tab);
        } else {
          await refreshTabAfterWrite(writer, tab);
        }
        return json(200, result);
      } catch (err) {
        return writerErrorResponse(err);
      }
    }

    return json(400, { error: "BAD_REQUEST", message: "action must be setPeriod or upsert" });
  }

  return json(405, { error: "METHOD_NOT_ALLOWED" });
};

export const config = { path: "/api/meta" };
