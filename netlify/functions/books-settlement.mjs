// netlify/functions/books-settlement.mjs — path /api/settlement
// docs/phase5-spec.md §1.1: step 2 of the sell wizard.
//
//   POST (poller secret) {base64, mime, name?, property?}
//     -> {ok, settlement, read, problems, usage}
//
// One model read of a title company's settlement statement, so the Sell dialog's form can
// be filled in from the document instead of typed. It posts nothing, files nothing and
// locks nothing: Paul confirms every line at step 2, and `lib/sale.mjs` does the
// arithmetic afterwards. `lib/settlement.mjs` owns the prompt, the tool and the
// validation; this file is the transport.
//
// The caller is the writer (the Apps Script project bound to the workbook), over the same
// siteFetchJson_ path the Inbox sidebar already uses, so the poller secret is the auth.
import Anthropic from "@anthropic-ai/sdk";
import { requireConfig, json, pollerSecretOk } from "./_shared.mjs";
import { SETTLEMENT_PROMPT, SETTLEMENT_TOOL, validateSettlement } from "../../lib/settlement.mjs";
import { MODEL_ID } from "../../lib/bookkeeper.mjs";

// Test seam, same shape as _shared.mjs's resetWriterForTests: the suite injects a stub so
// no test ever makes a real model call.
let clientForTests = null;
export function setAnthropicForTests(client) {
  clientForTests = client;
}

const MAX_TOKENS = 8000;
// A seller CD runs 3 pages; 20 MB of base64 is far past anything a title company sends and
// well under the API's own document limit.
const MAX_BASE64 = 20 * 1024 * 1024;
const DOC_MIMES = new Set(["application/pdf"]);
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function documentBlock(mime, base64) {
  if (DOC_MIMES.has(mime)) {
    return { type: "document", source: { type: "base64", media_type: mime, data: base64 } };
  }
  if (IMAGE_MIMES.has(mime)) {
    return { type: "image", source: { type: "base64", media_type: mime, data: base64 } };
  }
  return null;
}

export default async (req) => {
  const configErr = requireConfig(["POLLER_SECRET"]);
  if (configErr) return configErr;
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });

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
  const block = documentBlock(mime, base64);
  if (!block) {
    return json(400, {
      error: "BAD_REQUEST",
      message: `a settlement statement must be a PDF or a photo, not "${mime}"`,
    });
  }

  const header = [
    body?.property ? `The form being filled in is for the property: ${String(body.property)}.` : "",
    body?.name ? `File name: ${String(body.name)}.` : "",
    "Read this settlement statement and report every figure on it.",
  ].filter(Boolean).join(" ");

  const anthropic = clientForTests || new Anthropic();
  let res;
  try {
    res = await anthropic.beta.messages.create({
      // A safety-classifier refusal re-runs on a fallback model inside the call rather
      // than coming back as an empty read (audit §56).
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
    return json(502, { error: "MODEL_CALL_FAILED", message: String((err && err.message) || err) });
  }

  if (res.stop_reason === "refusal") {
    const details = res.stop_details || {};
    return json(502, {
      error: "REFUSED",
      message: `the model declined to read the document (${details.category || "unspecified"}). ${details.explanation || ""}`.trim(),
    });
  }

  const call = (res.content || []).find((b) => b.type === "tool_use" && b.name === SETTLEMENT_TOOL.name);
  if (!call) {
    const said = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join(" ").slice(0, 400);
    return json(502, {
      error: "NO_READ",
      message: `the model finished (${res.stop_reason}) without reporting the statement. It said: ${said || "(nothing)"}`,
    });
  }

  const { ok, settlement, read, problems } = validateSettlement(call.input);
  return json(200, {
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
};

export const config = { path: "/api/settlement" };
