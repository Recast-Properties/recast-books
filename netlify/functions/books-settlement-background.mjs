// netlify/functions/books-settlement-background.mjs — path /api/settlement-bg
// docs/phase5-spec.md §1.1, step 2 of the sell wizard.
//
//   POST (poller secret) {job_id}  -> 202, then the read happens here
//
// The model read itself. A background function because reading a three-page closing
// disclosure takes a minute or two and a synchronous function is cut off at ten seconds -
// the same reason books-ingest-background.mjs exists for receipts. books-settlement.mjs
// started the job and holds the document's bytes; this writes the answer back onto the
// same record, and the writer polls for it.
//
// Nothing here posts, files or locks anything. It fills a form for Paul to confirm.
import Anthropic from "@anthropic-ai/sdk";
import { requireConfig, json, pollerSecretOk, getDocsStore } from "./_shared.mjs";
import { SETTLEMENT_PROMPT, SETTLEMENT_TOOL, validateSettlement } from "../../lib/settlement.mjs";
import { MODEL_ID } from "../../lib/bookkeeper.mjs";
import { jobKey, documentKind } from "./books-settlement.mjs";

const MAX_TOKENS = 8000;

// Test seam, the same shape as _shared.mjs's resetWriterForTests: the suite injects a stub
// so no test ever makes a real model call.
let clientForTests = null;
export function setAnthropicForTests(client) {
  clientForTests = client;
}

export default async (req) => {
  const configErr = requireConfig(["POLLER_SECRET"]);
  if (configErr) return configErr;
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });

  let jobId = "";
  try {
    jobId = String((await req.json())?.job_id || "");
  } catch {
    return json(400, { error: "BAD_REQUEST", message: "body must be JSON" });
  }
  if (!jobId) return json(400, { error: "BAD_REQUEST", message: "job_id is required" });

  const store = getDocsStore();
  const key = jobKey(jobId);
  const job = await store.get(key, { type: "json" });
  if (!job) return json(404, { error: "NOT_FOUND", message: `no settlement read with id ${jobId}` });

  // Whatever happens below, the record must stop saying "reading": a job nobody will ever
  // touch again is the one state the writer cannot recover from (it would poll to its
  // timeout). Bytes are dropped on every finish - the caller already has the document.
  const finish = async (patch) => {
    try {
      await store.setJSON(key, { ...job, base64: "", finishedAt: new Date().toISOString(), ...patch });
    } catch { /* best effort: the reading record is still the trail */ }
  };

  const kind = documentKind(job.mime);
  if (!kind || !job.base64) {
    await finish({ status: "error", error: "the job has no readable document" });
    return json(200, { ok: false });
  }

  const block = kind === "document"
    ? { type: "document", source: { type: "base64", media_type: job.mime, data: job.base64 } }
    : { type: "image", source: { type: "base64", media_type: job.mime, data: job.base64 } };

  const header = [
    job.property ? `The form being filled in is for the property: ${job.property}.` : "",
    job.name ? `File name: ${job.name}.` : "",
    "Read this settlement statement and report every figure on it.",
  ].filter(Boolean).join(" ");

  const anthropic = clientForTests || new Anthropic();
  let res;
  try {
    res = await anthropic.beta.messages.create({
      // A safety-classifier refusal re-runs on a fallback model inside the call rather than
      // coming back as an empty read (audit §56).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: [{ type: "text", text: SETTLEMENT_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [SETTLEMENT_TOOL],
      messages: [{ role: "user", content: [block, { type: "text", text: header }] }],
    });
  } catch (err) {
    await finish({ status: "error", error: `the model call failed: ${String((err && err.message) || err)}` });
    return json(200, { ok: false });
  }

  if (res.stop_reason === "refusal") {
    const d = res.stop_details || {};
    await finish({
      status: "error",
      error: `the model declined to read the document (${d.category || "unspecified"}). ${d.explanation || ""}`.trim(),
    });
    return json(200, { ok: false });
  }

  const call = (res.content || []).find((b) => b.type === "tool_use" && b.name === SETTLEMENT_TOOL.name);
  if (!call) {
    const said = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ").slice(0, 400);
    await finish({
      status: "error",
      error: `the model finished (${res.stop_reason}) without reporting the statement. It said: ${said || "(nothing)"}`,
    });
    return json(200, { ok: false });
  }

  const { ok, settlement, read, problems } = validateSettlement(call.input);
  await finish({
    status: "done",
    ok,
    settlement,
    read,
    problems,
    usage: {
      input_tokens: res.usage?.input_tokens ?? 0,
      output_tokens: res.usage?.output_tokens ?? 0,
      model: res.model || MODEL_ID,
      fallback: (res.usage?.iterations || []).some((i) => i && i.type === "fallback_message"),
    },
  });
  return json(200, { ok: true });
};

export const config = { path: "/api/settlement-bg" };
