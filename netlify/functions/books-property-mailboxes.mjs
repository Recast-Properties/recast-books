// netlify/functions/books-property-mailboxes.mjs — path /api/property-mailboxes
// phase2.6-spec.md §3
//
//   POST (poller secret) {labels:[...]} -> stores {labels, fetchedAt} in the
//     books-cache store under key "mailbox/labels". The properties@ poller POSTs its
//     current Gmail user labels (minus books-done) here every run.
//   GET  (poller secret)  -> {registered:[{name,key}]} — Properties rows with status
//     held or under contract, key = normalizePropertyKey(name). What the poller
//     matches its labels against.
//   GET  (session, any role) -> {labels, registered, fetchedAt} — what the Properties
//     page's add form reads to build its "which mailbox is this" dropdown.

import {
  requireConfig,
  json,
  getWriter,
  getCacheStore,
  getSessionPayload,
  authErrorResponse,
  pollerSecretOk,
  readTab,
  rowsToObjectsPublic,
} from "./_shared.mjs";
import { normalizePropertyKey } from "../../lib/property-key.mjs";

const MAILBOX_LABELS_KEY = "mailbox/labels";

async function registeredProperties(writer) {
  const resp = await readTab(writer, "Properties");
  const rows = rowsToObjectsPublic(resp.headers, resp.rows);
  return rows
    .filter((r) => r.status === "held" || r.status === "under contract")
    .map((r) => ({ name: r.name, key: normalizePropertyKey(r.name) }));
}

export default async (req) => {
  const configErr = requireConfig(["WRITER_URL", "WRITER_SECRET", "SESSION_SECRET", "POLLER_SECRET"]);
  if (configErr) return configErr;

  const isPoller = pollerSecretOk(req);
  const writer = getWriter();

  if (req.method === "POST") {
    if (!isPoller) return json(401, { error: "UNAUTHORIZED" });

    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "BAD_REQUEST", message: "expected a JSON body" });
    }
    if (!Array.isArray(body.labels)) {
      return json(400, { error: "BAD_REQUEST", message: "labels must be an array" });
    }
    const labels = body.labels.map((l) => String(l));
    const fetchedAt = Date.now();
    try {
      await getCacheStore().setJSON(MAILBOX_LABELS_KEY, { labels, fetchedAt });
    } catch (err) {
      return json(502, { error: "STORE_ERROR", message: String((err && err.message) || err) });
    }
    return json(200, { ok: true, labels, fetchedAt });
  }

  if (req.method === "GET") {
    if (isPoller) {
      try {
        return json(200, { registered: await registeredProperties(writer) });
      } catch (err) {
        return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
      }
    }

    // Session auth — any signed-in role may read this (it only informs the add form).
    try {
      getSessionPayload(req);
    } catch (err) {
      const resp = authErrorResponse(err);
      if (resp) return resp;
      throw err;
    }

    try {
      const stored = (await getCacheStore().get(MAILBOX_LABELS_KEY, { type: "json" })) || { labels: [], fetchedAt: null };
      const registered = await registeredProperties(writer);
      return json(200, { labels: stored.labels, registered, fetchedAt: stored.fetchedAt });
    } catch (err) {
      return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
    }
  }

  return json(405, { error: "METHOD_NOT_ALLOWED" });
};

export const config = { path: "/api/property-mailboxes" };
