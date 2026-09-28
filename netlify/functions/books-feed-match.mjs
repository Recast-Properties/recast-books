// netlify/functions/books-feed-match.mjs — path /api/feed-match
// docs/phase3-spec.md section 3: tying an account's bank lines to the books.
//
//   POST (poller secret) {account, by?}   -> 202 {job_id}
//   GET  (poller secret) ?job=<id>        -> {status, summary, ...}
//
// Started from the workbook (Recast Books -> Match statement lines...) over the same
// siteFetchJson_ path the sell wizard's read uses; books-feed-match-background.mjs does the
// work (a synchronous function is cut off at ten seconds) and the writer polls this. Same
// shape as books-settlement.mjs.
import { randomUUID } from "node:crypto";
import { requireConfig, json, pollerSecretOk, getDocsStore } from "./_shared.mjs";

export function jobKey(jobId) {
  return `feedmatch/${jobId}`;
}

export default async (req) => {
  const configErr = requireConfig(["POLLER_SECRET"]);
  if (configErr) return configErr;
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });
  const store = getDocsStore();

  if (req.method === "GET") {
    const jobId = new URL(req.url).searchParams.get("job") || "";
    if (!/^[0-9a-f-]{10,64}$/.test(jobId)) return json(400, { error: "BAD_REQUEST", message: "job is required" });
    const job = await store.get(jobKey(jobId), { type: "json" });
    if (!job) return json(404, { error: "NOT_FOUND", message: `no matching run with id ${jobId}` });
    return json(200, job);
  }

  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "BAD_REQUEST", message: "body must be JSON" });
  }
  const account = String(body?.account || "");
  if (!/^14\d\d$/.test(account)) return json(400, { error: "BAD_REQUEST", message: "account must be a 14xx bank account code" });

  const jobId = randomUUID();
  const job = { job_id: jobId, status: "matching", account, by: String(body?.by || ""), startedAt: new Date().toISOString(), finishedAt: "" };
  try {
    await store.setJSON(jobKey(jobId), job);
  } catch (err) {
    return json(502, { error: "STORE_ERROR", message: String((err && err.message) || err) });
  }

  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/feed-match-bg`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET },
      body: JSON.stringify({ job_id: jobId }),
    });
    if (res.status !== 202 && res.status !== 200) throw new Error(`feed-match-bg invocation returned HTTP ${res.status}`);
  } catch (err) {
    const message = `failed to start the matching: ${String((err && err.message) || err)}`;
    try {
      await store.setJSON(jobKey(jobId), { ...job, status: "error", error: message, finishedAt: new Date().toISOString() });
    } catch { /* the matching record above is still the trail */ }
    return json(502, { error: "MATCH_INVOKE_FAILED", message, job_id: jobId });
  }
  return json(202, { job_id: jobId, status: "matching" });
};

export const config = { path: "/api/feed-match" };
