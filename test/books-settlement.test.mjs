// test/books-settlement.test.mjs — netlify/functions/books-settlement.mjs
// docs/phase5-spec.md §1.1: auth, what a document may be, the request shape sent to the
// model, and every way a read can fail. The Anthropic SDK is stubbed, so this never makes
// a real model call or spends anything.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { SETTLEMENT_TOOL } from "../lib/settlement.mjs";
import { MODEL_ID } from "../lib/bookkeeper.mjs";

process.env.POLLER_SECRET = "poller-secret";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";

const calls = [];
let reply = null;
const { default: handler, setAnthropicForTests } = await import("../netlify/functions/books-settlement.mjs");
setAnthropicForTests({
  beta: {
    messages: {
      create: async (req) => {
        calls.push(req);
        if (typeof reply === "function") return reply(req);
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
  },
});

const TOOL_INPUT = {
  file_no: "260648",
  settlement_agent: "Bison Title, LLC",
  property_address: "1616 Granite Way",
  sellers: ["RECAST PROPERTIES LLC"],
  date: "2026-07-24",
  sale_price_cents: 43_000_000,
  net_to_seller_cents: 34_734_303,
  cash_to_recast_cents: 34_734_303,
  recast_share_pct: 100,
  lines: [
    { label: "Real Estate Commission - Selling", cents: 1_290_000, kind: "cost", account: "1300", why: "commission" },
    { label: "Closing costs", cents: 413_360, kind: "cost", account: "1310", why: "title, survey, doc prep" },
    { label: "County Property Taxes 1/1/2026 thru 7/24/2026", cents: 562_337, kind: "cost", account: "1100", why: "tax proration" },
    { label: "Escrow Holdback", cents: 6_000_000, kind: "holdback", account: "1510", why: "withheld" },
  ],
  notes: "",
};

function okReply(input = TOOL_INPUT) {
  return {
    stop_reason: "tool_use",
    model: MODEL_ID,
    usage: { input_tokens: 9000, output_tokens: 700 },
    content: [{ type: "tool_use", name: SETTLEMENT_TOOL.name, input }],
  };
}

function req(body, { secret = "poller-secret", method = "POST" } = {}) {
  return new Request("https://books.test/api/settlement", {
    method,
    headers: { "content-type": "application/json", ...(secret ? { "x-poller-secret": secret } : {}) },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

const PDF = Buffer.from("%PDF-1.7 fake").toString("base64");

beforeEach(() => {
  calls.length = 0;
  reply = okReply();
});

// ---- auth and inputs ---------------------------------------------------------------------

test("without the poller secret it is 401, and no model call is made", async () => {
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }, { secret: "" }));
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test("a wrong poller secret is 401", async () => {
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }, { secret: "nope" }));
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test("GET is 405", async () => {
  const res = await handler(req(null, { method: "GET" }));
  assert.equal(res.status, 405);
});

test("no document is 400", async () => {
  const res = await handler(req({ mime: "application/pdf" }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /base64 is required/);
  assert.equal(calls.length, 0);
});

test("a spreadsheet or a Word file is refused with what is allowed", async () => {
  const res = await handler(req({ base64: PDF, mime: "application/vnd.ms-excel" }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).message, /must be a PDF or a photo/);
  assert.equal(calls.length, 0);
});

test("a document over 20 MB of base64 is refused before the model is called", async () => {
  const res = await handler(req({ base64: "A".repeat(21 * 1024 * 1024), mime: "application/pdf" }));
  assert.equal(res.status, 413);
  assert.equal(calls.length, 0);
});

test("a photo of a statement is accepted as an image block", async () => {
  const res = await handler(req({ base64: PDF, mime: "image/jpeg" }));
  assert.equal(res.status, 200);
  assert.equal(calls[0].messages[0].content[0].type, "image");
});

test("a data: prefix from a browser FileReader is stripped", async () => {
  await handler(req({ base64: `data:application/pdf;base64,${PDF}`, mime: "application/pdf" }));
  assert.equal(calls[0].messages[0].content[0].source.data, PDF);
});

// ---- the request the model gets -----------------------------------------------------------

test("the model is called once with the document, the strict tool and the refusal fallback", async () => {
  const res = await handler(req({ base64: PDF, mime: "application/pdf", name: "seller cd.pdf", property: "1616 Granite" }));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.model, MODEL_ID);
  assert.deepEqual(c.thinking, { type: "adaptive" });
  assert.deepEqual(c.output_config, { effort: "high" });
  assert.deepEqual(c.betas, ["server-side-fallback-2026-07-01"]);
  assert.equal(c.fallbacks, "default");
  assert.equal(c.tools.length, 1);
  assert.equal(c.tools[0].name, SETTLEMENT_TOOL.name);
  assert.equal(c.tools[0].strict, true);
  assert.deepEqual(c.system[0].cache_control, { type: "ephemeral" });
  const [doc, text] = c.messages[0].content;
  assert.equal(doc.type, "document");
  assert.equal(doc.source.media_type, "application/pdf");
  assert.match(text.text, /1616 Granite/);
  assert.match(text.text, /seller cd\.pdf/);
});

// ---- what comes back ----------------------------------------------------------------------

test("a clean read returns the validated settlement, the read's metadata and the usage", async () => {
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }));
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.problems, []);
  assert.equal(body.settlement.sale_price_cents, 43_000_000);
  assert.equal(body.settlement.lines.length, 4);
  assert.equal(body.read.file_no, "260648");
  assert.equal(body.read.tie.ties, true);
  assert.equal(body.usage.input_tokens, 9000);
  assert.equal(body.usage.fallback, false);
});

test("a read whose lines do not tie still returns 200: step 2 shows the gap for Paul to fix", async () => {
  reply = okReply({ ...TOOL_INPUT, lines: TOOL_INPUT.lines.filter((l) => l.kind !== "holdback") });
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.ok(body.problems.some((p) => /do not tie/.test(p)), body.problems.join(" | "));
  assert.equal(body.read.tie.gap_cents, 6_000_000);
});

test("a safety refusal is reported as such, with the category", async () => {
  reply = { stop_reason: "refusal", stop_details: { category: "cyber", explanation: "policy" }, content: [], usage: {} };
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, "REFUSED");
  assert.match(body.message, /cyber/);
});

test("a turn that ends without the tool call is reported, quoting what the model said", async () => {
  reply = { stop_reason: "end_turn", model: MODEL_ID, usage: {}, content: [{ type: "text", text: "I cannot see the totals." }] };
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, "NO_READ");
  assert.match(body.message, /cannot see the totals/);
});

test("an API failure is a 502 naming the failure, never a silent empty read", async () => {
  reply = new Error("upstream connect timeout");
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, "MODEL_CALL_FAILED");
  assert.match(body.message, /timeout/);
});

test("a fallback-served read says so, so the cost and the model are visible", async () => {
  reply = { ...okReply(), model: "claude-opus-4-8", usage: { input_tokens: 1, output_tokens: 2, iterations: [{ type: "fallback_message" }] } };
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }));
  const body = await res.json();
  assert.equal(body.usage.fallback, true);
  assert.equal(body.usage.model, "claude-opus-4-8");
});
