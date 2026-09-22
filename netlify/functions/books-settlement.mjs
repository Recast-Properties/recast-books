// netlify/functions/books-settlement.mjs — path /api/settlement
// docs/phase5-spec.md §1.1: step 2 of the sell wizard.
//
//   POST (poller secret) {base64, mime, name?, property?}  -> 202 {job_id}
//   GET  (poller secret) ?job=<id>                          -> {status, ...the read}
//
// One model read of a title company's settlement statement, so the Sell dialog's form can
// be filled in from the document instead of typed. It posts nothing, files nothing and
// locks nothing: Paul confirms every line at step 2, and `lib/sale.mjs` does the
// arithmetic afterwards. `lib/settlement.mjs` owns the prompt, the tool and the validation.
//
// **Why a job and not one call.** Reading a three-page closing disclosure takes a minute or
// two, and a synchronous Netlify function is cut off at ten seconds (2026-09-22: Paul got a
// 504 "Inactivity Timeout" on the first real document). So this starts a job and
// books-settlement-background.mjs does the read, exactly as books-upload.mjs hands a receipt
// to books-ingest-background.mjs. The writer polls, because Apps Script has six minutes.
//
// The caller is the writer (the Apps Script project bound to the workbook), over the same
// siteFetchJson_ path the Inbox sidebar already uses, so the poller secret is the auth.
import { randomUUID } from "node:crypto";
import { requireConfig, json, pollerSecretOk, getDocsStore } from "./_shared.mjs";

const MAX_BASE64 = 20 * 1024 * 1024;   // far past anything a title company sends
const DOC_MIMES = new Set(["application/pdf"]);
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export function jobKey(jobId) {
  return `settle/${jobId}`;
}

export function documentKind(mime) {
  if (DOC_MIMES.has(mime)) return "document";
  if (IMAGE_MIMES.has(mime)) return "image";
  return null;
}

export default async (req) => {
  const configErr = requireConfig(["POLLER_SECRET"]);
  if (configErr) return configErr;
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });
  const store = getDocsStore();

  // ---- the writer polling for a read it started ----------------------------------------
  if (req.method === "GET") {
    const jobId = new URL(req.url).searchParams.get("job") || "";
    if (!/^[0-9a-f-]{10,64}$/.test(jobId)) return json(400, { error: "BAD_REQUEST", message: "job is required" });
    const job = await store.get(jobKey(jobId), { type: "json" });
    if (!job) return json(404, { error: "NOT_FOUND", message: `no settlement read with id ${jobId}` });
    // The document's bytes are the biggest thing in the record and the caller already has
    // them; never send them back.
    const { base64, ...rest } = job;
    return json(200, rest);
  }

  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "BAD_REQUEST", message: "body must be JSON" });
  }

  const base64 = typeof body?.base64 === "string" ? body.base64.replace(/^data:[^,]*,/, "") : "";
  const mime = String(body?.mime || "application/pdf").toLowerCase();
  if (!base64) return json(400, { error: "BAD_REQUEST", message: "base64 is required" });
  if (base64.length > MAX_BASE64) {
    return json(413, { error: "TOO_LARGE", message: "the document is larger than 20 MB of base64" });
  }
  if (!documentKind(mime)) {
    return json(400, { error: "BAD_REQUEST", message: `a settlement statement must be a PDF or a photo, not "${mime}"` });
  }

  const jobId = randomUUID();
  const job = {
    job_id: jobId,
    status: "reading",
    property: String(body?.property || ""),
    name: String(body?.name || ""),
    mime,
    base64,
    startedAt: new Date().toISOString(),
    finishedAt: "",
  };
  try {
    await store.setJSON(jobKey(jobId), job);
  } catch (err) {
    return json(502, { error: "STORE_ERROR", message: String((err && err.message) || err) });
  }

  // Same hand-off as books-upload.mjs: a real HTTP request to this deploy's own origin, so
  // Netlify dispatches it as a background invocation and returns at once.
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/settlement-bg`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET },
      body: JSON.stringify({ job_id: jobId }),
    });
    if (res.status !== 202 && res.status !== 200) throw new Error(`settlement-bg invocation returned HTTP ${res.status}`);
  } catch (err) {
    const message = `failed to start the read: ${String((err && err.message) || err)}`;
    try {
      await store.setJSON(jobKey(jobId), { ...job, base64: "", status: "error", error: message, finishedAt: new Date().toISOString() });
    } catch { /* the reading record above is still the trail */ }
    return json(502, { error: "READ_INVOKE_FAILED", message, job_id: jobId });
  }

  return json(202, { job_id: jobId, status: "reading" });
};

export const config = { path: "/api/settlement" };
