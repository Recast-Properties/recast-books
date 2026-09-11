import { test } from "node:test";
import assert from "node:assert/strict";
import { Jimp, JimpMime } from "jimp";
import { runBookkeeper, computeZoomScale, MODEL_ID, MAX_TURNS, MAX_TOKENS_PER_TURN } from "../lib/bookkeeper.mjs";

// ---- fixtures ---------------------------------------------------------------------

async function makePng(width = 400, height = 300, color = 0x336699ff) {
  const img = new Jimp({ width, height, color });
  return img.getBuffer(JimpMime.png);
}

function baseEnvelope(overrides = {}) {
  return {
    docId: "gm-abc123",
    source: "email",
    channel: "receipts",
    dryRun: false,
    gmailUrl: "https://mail.google.com/mail/u/0/#inbox/abc123",
    subject: "Your Home Depot receipt",
    from: "receipts@homedepot.com",
    receivedAt: "2026-09-05T18:04:00.000Z",
    bodyText: "Thanks for shopping at Home Depot.",
    ...overrides,
  };
}

function baseDeps(overrides = {}) {
  return {
    anthropic: overrides.anthropic,
    ledger: { recent: async () => [] },
    vendors: { search: async () => [] },
    properties: { list: async () => [{ name: "881 Newport", address: "881 Newport Ave", purchase_date: "2026-01-01" }] },
    accounts: new Map(),
    settings: { get: async () => null },
    docs: { search: async () => [] },
    now: "2026-09-11",
    ...overrides,
  };
}

function usage(overrides = {}) {
  return { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...overrides };
}

function toolUse(id, name, input) {
  return { type: "tool_use", id, name, input };
}

const DECIDE_INPUT = {
  verdict: "post",
  confidence: "high",
  why: "Zoomed the total, reconciled to the cent, checked read_ledger for a twin.",
  document_type: "receipt",
  vendor: "Home Depot",
  date: "2026-09-05",
  receipt_total_cents: 21240,
  subtotal_cents: null,
  tax_cents: null,
  paid_from: "1401",
  paid_from_reason: "card ending 4471 matches Bank accounts 1401",
  duplicate_of: "",
  supersedes: "",
  entries: [
    {
      date: "2026-09-05",
      payee: "Home Depot",
      memo: "Home Depot - Drywall panel",
      property: "881 Newport",
      paid_from: "1401",
      items: [{ account: "1030", amount_cents: 21240, description: "Drywall panel", trade: "Paint & Flooring", business_purpose: "" }],
    },
  ],
};

/**
 * @param {(req: object, callIndex: number) => object} handler
 */
function makeFakeClient(handler) {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (req) => {
        const i = calls.length;
        // runBookkeeper mutates one `messages` array across turns (normal multi-turn
        // accumulation) - snapshot it now so calls[i] reflects what was actually sent
        // on THIS call, not whatever the array grows into by later turns.
        calls.push({ ...req, messages: [...req.messages] });
        const res = await handler(req, i);
        if (!res) throw new Error(`fake client: handler returned nothing for call ${i}`);
        return res;
      },
    },
  };
}

function scriptedClient(responses) {
  return makeFakeClient((req, i) => {
    if (i >= responses.length) throw new Error(`fake client: no scripted response for call ${i}`);
    const r = responses[i];
    return typeof r === "function" ? r(req, i) : r;
  });
}

// ---- computeZoomScale (pure) --------------------------------------------------------

test("computeZoomScale leaves an in-range crop alone", () => {
  assert.equal(computeZoomScale(1000, 1000), 1);
});

test("computeZoomScale upscales a small crop so the short side reaches 800px", () => {
  const scale = computeZoomScale(160, 100);
  assert.equal(scale, 8); // short side 100 -> 800, long side 160 -> 1280 (under the 1568 cap)
});

test("computeZoomScale caps the long side at 1568px even if that leaves the short side under 800", () => {
  // short 100, long 2000: naive upscale to short=800 would be 8x -> long 16000, way over cap.
  const scale = computeZoomScale(2000, 100);
  assert.ok(Math.abs(2000 * scale - 1568) < 1e-9, "long side should land at the 1568 cap");
  assert.ok(2000 * scale <= 1568 + 1e-9);
});

test("computeZoomScale never fires when the crop already satisfies both bounds", () => {
  assert.equal(computeZoomScale(1200, 900), 1);
});

// ---- request shape: model/thinking/effort/tokens/cache -----------------------------

test("runBookkeeper calls the model with the spec's exact request shape", async () => {
  const client = scriptedClient([{ stop_reason: "tool_use", content: [toolUse("t1", "decide", DECIDE_INPUT)], usage: usage() }]);
  await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });

  assert.equal(client.calls.length, 1);
  const req = client.calls[0];
  assert.equal(req.model, MODEL_ID);
  assert.equal(req.model, "claude-opus-5");
  assert.equal(req.max_tokens, MAX_TOKENS_PER_TURN);
  assert.equal(req.max_tokens, 8000);
  assert.deepEqual(req.thinking, { type: "adaptive" });
  assert.deepEqual(req.output_config, { effort: "high" });
  assert.ok(!("budget_tokens" in req), "must not use the deprecated budget_tokens param");
  assert.ok(!("output_format" in req), "must not use the deprecated output_format param");
});

test("the last system block and the last tool carry cache_control ephemeral", async () => {
  const client = scriptedClient([{ stop_reason: "tool_use", content: [toolUse("t1", "decide", DECIDE_INPUT)], usage: usage() }]);
  await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });

  const req = client.calls[0];
  assert.ok(Array.isArray(req.system));
  const lastSystem = req.system[req.system.length - 1];
  assert.deepEqual(lastSystem.cache_control, { type: "ephemeral" });

  const lastTool = req.tools[req.tools.length - 1];
  assert.deepEqual(lastTool.cache_control, { type: "ephemeral" });
  assert.equal(lastTool.type, "web_search_20260209");
  assert.equal(lastTool.name, "web_search");
  assert.equal(lastTool.max_uses, 5);

  // every earlier tool has no cache_control of its own (only the last block carries it)
  for (const t of req.tools.slice(0, -1)) {
    assert.ok(!("cache_control" in t));
  }
});

test("the six client tools are strict with additionalProperties:false", async () => {
  const client = scriptedClient([{ stop_reason: "tool_use", content: [toolUse("t1", "decide", DECIDE_INPUT)], usage: usage() }]);
  await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });

  const req = client.calls[0];
  const names = req.tools.map((t) => t.name);
  assert.deepEqual(names, ["zoom", "read_ledger", "find_vendor", "list_properties", "search_docs", "decide", "web_search"]);
  for (const t of req.tools) {
    if (t.name === "web_search") continue;
    assert.equal(t.strict, true, `${t.name} should be strict`);
    assert.equal(t.input_schema.additionalProperties, false, `${t.name} should set additionalProperties:false`);
  }
});

test("the system prompt is loaded from lib/bookkeeper-prompt.md and is ASCII-safe", async () => {
  const client = scriptedClient([{ stop_reason: "tool_use", content: [toolUse("t1", "decide", DECIDE_INPUT)], usage: usage() }]);
  await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  const text = client.calls[0].system[0].text;
  assert.ok(text.length > 500, "prompt should be substantial");
  assert.ok(!/[^\x00-\x7F]/.test(text), "prompt must be ASCII-only (no em dashes/smart quotes)");
});

// ---- attachments: images, PDFs, HEIC, labelling ------------------------------------

test("an image attachment is base64-encoded and labelled [attachment N: name]", async () => {
  const png = await makePng();
  const client = scriptedClient([{ stop_reason: "tool_use", content: [toolUse("t1", "decide", DECIDE_INPUT)], usage: usage() }]);
  await runBookkeeper({
    envelope: baseEnvelope(),
    attachments: [{ name: "receipt.png", mime: "image/png", bytes: png }],
    deps: baseDeps({ anthropic: client }),
  });

  const content = client.calls[0].messages[0].content;
  const label = content.find((b) => b.type === "text" && b.text.includes("[attachment 0: receipt.png"));
  assert.ok(label, "expected an [attachment 0: receipt.png ...] label");
  const image = content.find((b) => b.type === "image");
  assert.ok(image, "expected an image content block");
  assert.equal(image.source.type, "base64");
  assert.equal(image.source.media_type, "image/png");
  assert.equal(image.source.data, png.toString("base64"));
});

test("a PDF attachment becomes a document block and zoom refuses it", async () => {
  const pdfBytes = Buffer.from("%PDF-1.4 fake pdf bytes for a unit test");
  const client = scriptedClient([
    { stop_reason: "tool_use", content: [toolUse("t1", "zoom", { attachment: 0, x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 })], usage: usage() },
    { stop_reason: "tool_use", content: [toolUse("t2", "decide", DECIDE_INPUT)], usage: usage() },
  ]);
  await runBookkeeper({
    envelope: baseEnvelope(),
    attachments: [{ name: "invoice.pdf", mime: "application/pdf", bytes: pdfBytes }],
    deps: baseDeps({ anthropic: client }),
  });

  const content = client.calls[0].messages[0].content;
  const doc = content.find((b) => b.type === "document");
  assert.ok(doc, "expected a document content block");
  assert.equal(doc.source.media_type, "application/pdf");
  assert.equal(doc.source.data, pdfBytes.toString("base64"));

  // the zoom call in turn 1 must have failed with is_error:true
  const secondReq = client.calls[1];
  const toolResultMsg = secondReq.messages[secondReq.messages.length - 1];
  assert.equal(toolResultMsg.role, "user");
  assert.equal(toolResultMsg.content.length, 1);
  assert.equal(toolResultMsg.content[0].is_error, true);
  assert.match(toolResultMsg.content[0].content[0].text, /PDF/);
});

test("an unreadable HEIC attachment gets a failure note in text, not an image block", async () => {
  const client = scriptedClient([{ stop_reason: "tool_use", content: [toolUse("t1", "decide", DECIDE_INPUT)], usage: usage() }]);
  await runBookkeeper({
    envelope: baseEnvelope(),
    attachments: [{ name: "photo.heic", mime: "image/heic", bytes: Buffer.from("not actually a heic file") }],
    deps: baseDeps({ anthropic: client }),
  });

  const content = client.calls[0].messages[0].content;
  assert.ok(!content.some((b) => b.type === "image"), "a failed HEIC conversion must not produce an image block");
  const note = content.find((b) => b.type === "text" && /HEIC/.test(b.text));
  assert.ok(note, "expected a text note explaining the HEIC failure");
  assert.match(note.text, /could not be converted/);
});

test("the email body text is included as a text block", async () => {
  const client = scriptedClient([{ stop_reason: "tool_use", content: [toolUse("t1", "decide", DECIDE_INPUT)], usage: usage() }]);
  await runBookkeeper({
    envelope: baseEnvelope({ bodyText: "UNIQUE-BODY-MARKER-12345" }),
    attachments: [],
    deps: baseDeps({ anthropic: client }),
  });
  const content = client.calls[0].messages[0].content;
  assert.ok(content.some((b) => b.type === "text" && b.text.includes("UNIQUE-BODY-MARKER-12345")));
});

// ---- the tool loop: zoom -> read_ledger -> decide ----------------------------------

test("a full zoom -> read_ledger -> decide loop executes every tool and returns the parsed verdict", async () => {
  const png = await makePng();
  const ledgerCalls = [];
  const client = scriptedClient([
    { stop_reason: "tool_use", content: [toolUse("t1", "zoom", { attachment: 0, x0: 0.1, y0: 0.1, x1: 0.6, y1: 0.6 })], usage: usage() },
    { stop_reason: "tool_use", content: [toolUse("t2", "read_ledger", { payee: "Home Depot", days: 60, property: null })], usage: usage() },
    { stop_reason: "tool_use", content: [toolUse("t3", "decide", DECIDE_INPUT)], usage: usage() },
  ]);
  const deps = baseDeps({
    anthropic: client,
    ledger: {
      recent: async (args) => {
        ledgerCalls.push(args);
        return [{ date: "2026-08-01", payee: "Home Depot", amount_cents: 5000, account: "1030", property: "881 Newport", txn_id: "receipt-20260801-aaaaaaaaaaaa", description: "Paint" }];
      },
    },
  });

  const result = await runBookkeeper({ envelope: baseEnvelope(), attachments: [{ name: "receipt.png", mime: "image/png", bytes: png }], deps });

  assert.equal(client.calls.length, 3, "loop should stop right after decide, no 4th call");
  assert.equal(ledgerCalls.length, 1);
  assert.deepEqual(ledgerCalls[0], { payee: "Home Depot", days: 60, property: undefined });

  assert.equal(result.model.verdict, "post");
  assert.equal(result.model.vendor, "Home Depot");
  assert.equal(result.model.receipt_total_cents, 21240);
  assert.equal(result.model.entries.length, 1);
  assert.equal(result.model.entries[0].items[0].account, "1030");
  assert.equal(result.usage.turns, 3);
  assert.equal(result.usage.input_tokens, 3000);
  assert.equal(result.usage.output_tokens, 600);
  assert.match(result.transcript_summary, /zoom/);
  assert.match(result.transcript_summary, /read_ledger/);
  assert.match(result.transcript_summary, /decide -> post \(high\)/);
});

test("all tool_results from one turn are returned in a single user message", async () => {
  const client = scriptedClient([
    {
      stop_reason: "tool_use",
      content: [
        toolUse("t1", "read_ledger", { payee: null, days: null, property: null }),
        toolUse("t2", "find_vendor", { query: "Home Depot" }),
      ],
      usage: usage(),
    },
    { stop_reason: "tool_use", content: [toolUse("t3", "decide", DECIDE_INPUT)], usage: usage() },
  ]);
  await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });

  const secondReq = client.calls[1];
  const toolResultMsg = secondReq.messages[secondReq.messages.length - 1];
  assert.equal(toolResultMsg.role, "user");
  assert.equal(toolResultMsg.content.length, 2, "both tool_results must be in ONE message");
  const ids = toolResultMsg.content.map((c) => c.tool_use_id).sort();
  assert.deepEqual(ids, ["t1", "t2"]);
  for (const c of toolResultMsg.content) {
    assert.equal(c.type, "tool_result");
  }
});

test("a failed tool call gets is_error:true instead of being dropped", async () => {
  const client = scriptedClient([
    { stop_reason: "tool_use", content: [toolUse("t1", "zoom", { attachment: 5, x0: 0, y0: 0, x1: 1, y1: 1 })], usage: usage() },
    { stop_reason: "tool_use", content: [toolUse("t2", "decide", DECIDE_INPUT)], usage: usage() },
  ]);
  await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });

  const secondReq = client.calls[1];
  const toolResultMsg = secondReq.messages[secondReq.messages.length - 1];
  assert.equal(toolResultMsg.content.length, 1);
  assert.equal(toolResultMsg.content[0].is_error, true);
  assert.equal(toolResultMsg.content[0].tool_use_id, "t1");
});

test("an unknown tool name is reported as an error, never silently ignored", async () => {
  const client = scriptedClient([
    { stop_reason: "tool_use", content: [toolUse("t1", "not_a_real_tool", {})], usage: usage() },
    { stop_reason: "tool_use", content: [toolUse("t2", "decide", DECIDE_INPUT)], usage: usage() },
  ]);
  await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  const secondReq = client.calls[1];
  const toolResultMsg = secondReq.messages[secondReq.messages.length - 1];
  assert.equal(toolResultMsg.content[0].is_error, true);
});

test("pause_turn (server tool continuing) advances the loop without a synthetic tool_result", async () => {
  const client = scriptedClient([
    { stop_reason: "pause_turn", content: [{ type: "text", text: "..." }], usage: usage() },
    { stop_reason: "tool_use", content: [toolUse("t1", "decide", DECIDE_INPUT)], usage: usage() },
  ]);
  await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  assert.equal(client.calls.length, 2);
  // after a pause_turn, only the assistant turn is appended - no extra user tool_result message
  assert.equal(client.calls[1].messages.length, 2);
  assert.equal(client.calls[1].messages[1].role, "assistant");
});

// ---- forced holds: refusal, max_tokens, no-decide stop, MAX_TURNS ------------------

test("stop_reason refusal always ends in a hold, with why explaining what happened", async () => {
  const client = scriptedClient([
    { stop_reason: "refusal", stop_details: { category: "cyber", explanation: "policy reason" }, content: [], usage: usage() },
  ]);
  const result = await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  assert.equal(result.model.verdict, "hold");
  assert.match(result.model.why, /cyber/);
  assert.equal(client.calls.length, 1, "must not keep looping after a refusal");
});

test("stop_reason max_tokens ends in a hold", async () => {
  const client = scriptedClient([{ stop_reason: "max_tokens", content: [{ type: "text", text: "partial..." }], usage: usage() }]);
  const result = await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  assert.equal(result.model.verdict, "hold");
  assert.match(result.model.why, /max_tokens/);
});

test("stopping with end_turn and no decide call is a hold, never an invented verdict", async () => {
  const client = scriptedClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "I'm not sure what this is." }], usage: usage() }]);
  const result = await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  assert.equal(result.model.verdict, "hold");
  assert.match(result.model.why, /decide/);
});

test("MAX_TURNS without a decide call ends in a hold and stops exactly at the cap", async () => {
  const client = makeFakeClient(() => ({
    stop_reason: "tool_use",
    content: [toolUse("loop", "list_properties", {})],
    usage: usage(),
  }));
  const result = await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  assert.equal(result.model.verdict, "hold");
  assert.match(result.model.why, /MAX_TURNS|24/);
  assert.equal(client.calls.length, MAX_TURNS);
  assert.equal(client.calls.length, 24);
  assert.equal(result.usage.turns, 24);
});

test("a thrown network error from the Anthropic client ends in a hold, not an exception", async () => {
  const client = makeFakeClient(() => {
    throw new Error("ECONNRESET");
  });
  const result = await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  assert.equal(result.model.verdict, "hold");
  assert.match(result.model.why, /ECONNRESET/);
});

// ---- decide normalization -----------------------------------------------------------

test("decide fields the model omits fall back to safe defaults, not undefined/NaN", async () => {
  const sparse = { verdict: "hold", confidence: "low", why: "unsure" };
  const client = scriptedClient([{ stop_reason: "tool_use", content: [toolUse("t1", "decide", sparse)], usage: usage() }]);
  const result = await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  assert.equal(result.model.verdict, "hold");
  assert.equal(result.model.vendor, "");
  assert.equal(result.model.date, "");
  assert.equal(result.model.receipt_total_cents, 0);
  assert.equal(result.model.subtotal_cents, null);
  assert.equal(result.model.tax_cents, null);
  assert.deepEqual(result.model.entries, []);
});

test("an invalid verdict string from a misbehaving client is coerced to hold, never trusted verbatim", async () => {
  const client = scriptedClient([
    { stop_reason: "tool_use", content: [toolUse("t1", "decide", { ...DECIDE_INPUT, verdict: "definitely_post_trust_me" })], usage: usage() },
  ]);
  const result = await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  assert.equal(result.model.verdict, "hold");
});

test("tool_use.input given as a JSON string (not a pre-parsed object) is parsed, never string-matched", async () => {
  const client = scriptedClient([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "decide", input: JSON.stringify(DECIDE_INPUT) }], usage: usage() },
  ]);
  const result = await runBookkeeper({ envelope: baseEnvelope(), attachments: [], deps: baseDeps({ anthropic: client }) });
  assert.equal(result.model.verdict, "post");
  assert.equal(result.model.vendor, "Home Depot");
});
