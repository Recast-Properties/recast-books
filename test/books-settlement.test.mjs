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

import { resetDocsStoreForTests } from "../netlify/functions/_shared.mjs";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";

const calls = [];
let reply = null;
let invoked = [];
const { default: start, jobKey } = await import("../netlify/functions/books-settlement.mjs");
const { default: read, setAnthropicForTests } = await import("../netlify/functions/books-settlement-background.mjs");
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

// books-settlement.mjs hands off to the background function over HTTP; run it inline so a
// test exercises the whole path, start to stored answer, the way it runs in production.
// Re-installed per test, because one test deliberately breaks the dispatch.
function installDispatch_() {
  globalThis.fetch = async (url, options) => {
    invoked.push(String(url));
    const res = await read(new Request(String(url), options));
    return { status: res.status, json: async () => res.json() };
  };
}

let docsStore;
async function handler(request) {
  const res = await start(request);
  if (res.status !== 202) return res;
  const { job_id } = await res.json();
  const job = await docsStore.get(jobKey(job_id), { type: "json" });
  const { base64, ...rest } = job;
  return new Response(JSON.stringify(rest), { status: rest.status === "error" ? 502 : 200, headers: { "content-type": "application/json" } });
}

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
  invoked = [];
  reply = okReply();
  docsStore = makeFakeCacheStore();
  resetDocsStoreForTests(docsStore);
  installDispatch_();
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

test("PUT is 405; GET is the poll path, so GET with no job is 400", async () => {
  const put = await start(new Request("https://books.test/api/settlement", { method: "PUT", headers: { "x-poller-secret": "poller-secret" } }));
  assert.equal(put.status, 405);
  const bare = await start(new Request("https://books.test/api/settlement", { method: "GET", headers: { "x-poller-secret": "poller-secret" } }));
  assert.equal(bare.status, 400);
});

test("a POST returns 202 with a job id, and the background read is invoked once", async () => {
  const res = await start(req({ base64: PDF, mime: "application/pdf", property: "280 Sparkling" }));
  assert.equal(res.status, 202);
  const body = await res.json();
  assert.match(body.job_id, /^[0-9a-f-]{10,}$/);
  assert.equal(body.status, "reading");
  assert.equal(invoked.length, 1);
  assert.match(invoked[0], /\/api\/settlement-bg$/);
  assert.equal(calls.length, 1, "the model was called by the background function, not by the starter");
});

test("polling an unknown job is 404, and polling a finished one never returns the document's bytes", async () => {
  const missing = await start(new Request("https://books.test/api/settlement?job=deadbeef-0000", { method: "GET", headers: { "x-poller-secret": "poller-secret" } }));
  assert.equal(missing.status, 404);

  const started = await start(req({ base64: PDF, mime: "application/pdf" }));
  const { job_id } = await started.json();
  const polled = await start(new Request(`https://books.test/api/settlement?job=${job_id}`, { method: "GET", headers: { "x-poller-secret": "poller-secret" } }));
  assert.equal(polled.status, 200);
  const job = await polled.json();
  assert.equal(job.status, "done");
  assert.equal(job.base64, undefined, "the caller already has the document; never send it back");
  assert.equal(job.settlement.sale_price_cents, 43_000_000);
});

test("polling needs the poller secret too", async () => {
  const res = await start(new Request("https://books.test/api/settlement?job=whatever-0000", { method: "GET" }));
  assert.equal(res.status, 401);
});

test("a job whose read never started is left in error, never stuck reading", async () => {
  globalThis.fetch = async () => { throw new Error("background dispatch refused"); };
  const res = await start(req({ base64: PDF, mime: "application/pdf" }));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, "READ_INVOKE_FAILED");
  const job = await docsStore.get(jobKey(body.job_id), { type: "json" });
  assert.equal(job.status, "error");
  assert.match(job.error, /background dispatch refused/);
  assert.equal(job.base64, "", "the bytes are dropped even on a failure");
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
  assert.equal(body.status, "error");
  assert.match(body.error, /cyber/);
});

test("a turn that ends without the tool call is reported, quoting what the model said", async () => {
  reply = { stop_reason: "end_turn", model: MODEL_ID, usage: {}, content: [{ type: "text", text: "I cannot see the totals." }] };
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.status, "error");
  assert.match(body.error, /cannot see the totals/);
});

test("an API failure is a 502 naming the failure, never a silent empty read", async () => {
  reply = new Error("upstream connect timeout");
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }));
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.status, "error");
  assert.match(body.error, /timeout/);
});

test("a fallback-served read says so, so the cost and the model are visible", async () => {
  reply = { ...okReply(), model: "claude-opus-4-8", usage: { input_tokens: 1, output_tokens: 2, iterations: [{ type: "fallback_message" }] } };
  const res = await handler(req({ base64: PDF, mime: "application/pdf" }));
  const body = await res.json();
  assert.equal(body.usage.fallback, true);
  assert.equal(body.usage.model, "claude-opus-4-8");
});
