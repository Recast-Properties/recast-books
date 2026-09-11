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
]);

function writerErrorResponse(err) {
  if (err instanceof WriterError) {
    return json(502, { error: err.code, message: err.message });
  }
  return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
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
    const tab = url.searchParams.get("tab");
    if (!tab || !READABLE_TABS.has(tab)) {
      return json(400, {
        error: "BAD_REQUEST",
        message: `tab must be one of: ${[...READABLE_TABS].join(", ")}`,
      });
    }
    try {
      const resp = await writer.read(tab);
      return json(200, { headers: resp.headers, rows: resp.rows });
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
        invalidateCtxCache(); // periods feed the posting-engine ctx
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
      try {
        const result = await writer.upsert(tab, key_column, row);
        if (tab === "Properties" || tab === "Accounts") invalidateCtxCache();
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
