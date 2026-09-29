// test/books-ingest-background.test.mjs — netlify/functions/books-ingest-background.mjs
// phase2-spec.md section 5
//
// books-ingest-background.mjs imports lib/bookkeeper.mjs and lib/gate.mjs, which
// another agent is writing concurrently per this task's brief ("code against these
// exact exports... do NOT create or edit those two files; if missing at test time,
// stub them ONLY under test/stubs/" - see that directory's header comments). If
// they are missing, every test below is skipped with a clear reason instead of
// failing the suite - `npm test` should report skips, not failures, until the other
// agent's files land, at which point these start running for real.
//
// Even once they land, this file deliberately never drives the full handler through
// a real runBookkeeper() call, because that would call the real Anthropic API - a
// real, paid, networked call with no place in a test suite. Instead:
//   - the exported `processDecision` (the deterministic half of ingest: dry/dismiss/
//     post/hold, Drive filing, void+post, postBatch error mapping) is tested
//     directly with hand-built `model`/`gateResult` fixtures - no runBookkeeper, no
//     Anthropic, no network;
//   - the default handler is only exercised on paths that return BEFORE ever
//     reaching runBookkeeper (auth, validation, config, envelope-not-found).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeBlobsContext, makeFakeDocsStore } from "./helpers/fake-docs-store.mjs";

process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-unused"; // never actually sent - see header comment
process.env.POLLER_SECRET = "poller-secret";
installFakeBlobsContext();

let handler, processDecision, propertyMailboxHint, makeLedgerDep, searchDocs, tradesByProperty, resetWriterForTests, getDocsStore, importError;
try {
  ({ default: handler, processDecision, propertyMailboxHint, makeLedgerDep, searchDocs, tradesByProperty } = await import("../netlify/functions/books-ingest-background.mjs"));
  ({ resetWriterForTests, getDocsStore } = await import("../netlify/functions/_shared.mjs"));
} catch (err) {
  importError = err;
}

const skip = importError
  ? `lib/bookkeeper.mjs and/or lib/gate.mjs not present yet: ${importError.message}`
  : false;

const ACCOUNTS_ROWS = [
  ["1030", "Rehab - materials", "1000", "asset", "Rehab", "Inventory (held)", true, ""],
  ["1401", "Cash - Citizens shared", "1400", "asset", "", "", true, ""],
];
const PROPERTIES_ROWS = [["881 Newport", "881 Newport Dr", "held", "2026-06-29", "207000", "", "light", true, "", ""]];
const PERIODS_ROWS = [["2026-09", "open", "", "", ""]];

function writerRouter(body) {
  if (body.action === "read") {
    switch (body.tab) {
      case "Accounts":
        return { ok: true, headers: ["code", "name", "series", "type", "cost_class", "tax_treatment", "active", "notes"], rows: ACCOUNTS_ROWS };
      case "Properties":
        return { ok: true, headers: ["name", "address", "status", "purchase_date", "purchase_price", "settlement_date", "template", "dennis_funded", "drive_folder", "notes"], rows: PROPERTIES_ROWS };
      case "Periods":
        return { ok: true, headers: ["period", "status", "closed_at", "snapshot_url", "notes"], rows: PERIODS_ROWS };
      case "Journal":
        return { ok: true, headers: ["txn_id", "date", "period", "account", "debit", "credit", "property", "payee", "description", "source", "void_of"], rows: [] };
      case "Vendors":
        return { ok: true, headers: ["canonical", "aliases", "entity_type", "form_1099", "tin_status", "w9_url", "default_account", "notes"], rows: [] };
      case "Settings":
        return { ok: true, headers: ["key", "value", "notes"], rows: [["autofile_ceiling_cents", "50000", ""]] };
      default:
        throw new Error(`unexpected read: ${body.tab}`);
    }
  }
  throw new Error(`writerRouter did not expect action ${body.action}`);
}

let docsStore;
let writerCalls;

beforeEach(() => {
  if (importError) return;
  resetWriterForTests();
  docsStore = makeFakeDocsStore();
  writerCalls = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(typeof url === "string" ? url : url.url);
    if (u === "https://writer.test/exec") {
      const body = JSON.parse(opts.body);
      writerCalls.push(body);
      return { status: 200, text: async () => JSON.stringify(writerRouter(body)) };
    }
    return docsStore.fetchImpl(url, opts);
  };
});

function baseCtx() {
  return {
    accounts: new Map([
      ["1030", { code: "1030", name: "Rehab - materials", cost_class: "Rehab", tax_treatment: "Inventory (held)" }],
      ["1401", { code: "1401", name: "Cash - Citizens shared" }],
    ]),
    properties: new Set(["881 Newport"]),
    periods: new Map([["2026-09", "open"]]),
    today: "2026-09-11",
  };
}

function baseEnvelope(overrides = {}) {
  const docId = overrides.docId || "gm-abc";
  return {
    docId,
    source: "email",
    channel: "receipts",
    dryRun: false,
    attachments: [{ key: `att/${docId}/0`, name: "r.jpg", mime: "image/jpeg", bytes: 100 }],
    status: "processing",
    startedAt: "2026-09-11T12:00:00.000Z",
    finishedAt: "",
    error: "",
    model: null,
    gate: null,
    result: null,
    review: null,
    ...overrides,
  };
}

function postModel(overrides = {}) {
  return {
    verdict: "post",
    confidence: "high",
    why: "zoomed the total, reconciled to the ledger",
    document_type: "receipt",
    vendor: "Home Depot",
    date: "2026-09-10",
    receipt_total_cents: 4500,
    subtotal_cents: 4157,
    tax_cents: 343,
    paid_from: "1401",
    paid_from_reason: "matched card last-4",
    duplicate_of: "",
    supersedes: "",
    entries: [
      {
        date: "2026-09-10",
        payee: "Home Depot",
        memo: "drywall",
        property: "881 Newport",
        paid_from: "1401",
        items: [{ account: "1030", amount_cents: 4500, description: "drywall", trade: "", business_purpose: "" }],
      },
    ],
    ...overrides,
  };
}

const PASS_GATE = { passed: true, reasons: [] };

async function seedEnvelope(overrides) {
  const store = getDocsStore();
  const envelope = baseEnvelope(overrides);
  await store.setJSON(`doc/${envelope.docId}`, envelope);
  return envelope;
}

// ---- processDecision: the deterministic half, no runBookkeeper/Anthropic -------

test("dry run: filed under _dry-runs, status dry, nothing posted", { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "dry-gm-1", dryRun: true });
  const writer = { storeDocument: async (name, mime, base64, folder) => ({ fileId: "f1", url: "https://drive/x", folderUrl: "https://drive/folder", name, folder }) };
  const store = getDocsStore();
  await store.set("att/dry-gm-1/0", Buffer.from("hi").toString("base64"), { metadata: { contentType: "image/jpeg" } });

  const result = await processDecision({
    envelope,
    docId: "dry-gm-1",
    model: postModel(),
    transcript_summary: ["read", "decided"],
    usage: { input_tokens: 1, output_tokens: 1 },
    gateResult: PASS_GATE,
    ctx: baseCtx(),
    writer,
    docsStore: store,
  });

  assert.equal(result.status, "dry");
  assert.equal(result.result.doc_url, "https://drive/x");
  assert.equal(result.result.txn_ids.length, 0);
});

test("a Reprocess (holdOnly) never posts or dismisses: post+passed, a confident dismiss and a DUPLICATE_OF all wait in pending", { skip }, async () => {
  // 2026-09-26: the four parked hardware receipts are mostly on the books as migrated rows.
  const cases = [
    ["gm-hold-only-post", postModel(), PASS_GATE],
    ["gm-hold-only-dismiss", postModel({ verdict: "dismiss", duplicate_of: "migration-20260302-e5299709adcd" }), { passed: false, reasons: ["NOT_POST_VERDICT"] }],
    ["gm-hold-only-dup", postModel(), { passed: false, reasons: ["DUPLICATE_OF:migration-20260302-e5299709adcd"] }],
  ];
  for (const [docId, model, gateResult] of cases) {
    const envelope = await seedEnvelope({ docId });
    const touched = [];
    const writer = { storeDocument: async () => { touched.push("storeDocument"); }, postBatch: async () => { touched.push("postBatch"); return { rows: [] }; }, void: async () => { touched.push("void"); } };
    const result = await processDecision({ envelope, docId, model, transcript_summary: [], usage: {}, gateResult, ctx: baseCtx(), holdOnly: true, writer, docsStore: getDocsStore() });
    assert.equal(result.status, "pending", docId);
    assert.deepEqual(touched, [], `${docId}: nothing filed, posted or voided`);
    assert.match(result.model.why, new RegExp(`\\[reprocess: read as ${model.verdict}, held for Paul`), docId);
    assert.deepEqual(result.gate, gateResult, `${docId}: the gate's reasons stay on the card`);
  }
});

test("dismiss with duplicate_of -> dismissed, no Drive filing, no writer calls", { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "gm-dismiss" });
  const store = getDocsStore();
  let storeDocumentCalled = false;
  const writer = { storeDocument: async () => { storeDocumentCalled = true; } };

  const result = await processDecision({
    envelope,
    docId: "gm-dismiss",
    model: postModel({ verdict: "dismiss", duplicate_of: "receipt-20260909-abc" }),
    transcript_summary: [],
    usage: {},
    gateResult: { passed: false, reasons: [] },
    ctx: baseCtx(),
    writer,
    docsStore: store,
  });

  assert.equal(result.status, "dismissed");
  assert.equal(storeDocumentCalled, false);
});

test("a confident dismiss with no duplicate_of (promotion, $0 statement) is dismissed outright", { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "gm-promo" });
  const store = getDocsStore();
  const result = await processDecision({
    envelope,
    docId: "gm-promo",
    model: postModel({ verdict: "dismiss", confidence: "high", duplicate_of: "" }),
    transcript_summary: [],
    usage: {},
    gateResult: { passed: false, reasons: [] },
    ctx: baseCtx(),
    writer: {},
    docsStore: store,
  });
  assert.equal(result.status, "dismissed");
});

test("a hesitant dismiss (medium/low) with no duplicate_of waits for a human", { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "gm-baddismiss" });
  const store = getDocsStore();
  const result = await processDecision({
    envelope,
    docId: "gm-baddismiss",
    model: postModel({ verdict: "dismiss", confidence: "medium", duplicate_of: "" }),
    transcript_summary: [],
    usage: {},
    gateResult: { passed: false, reasons: [] },
    ctx: baseCtx(),
    writer: {},
    docsStore: store,
  });
  assert.equal(result.status, "pending");
});

test("hold verdict -> pending, gate reasons preserved, nothing filed or posted", { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "gm-hold" });
  const store = getDocsStore();
  const result = await processDecision({
    envelope,
    docId: "gm-hold",
    model: postModel({ verdict: "hold", confidence: "medium", why: "blurry total" }),
    transcript_summary: [],
    usage: {},
    gateResult: { passed: false, reasons: ["NOT_HIGH_CONFIDENCE"] },
    ctx: baseCtx(),
    writer: {},
    docsStore: store,
  });
  assert.equal(result.status, "pending");
  assert.deepEqual(result.gate.reasons, ["NOT_HIGH_CONFIDENCE"]);
});

test('verdict "post" but the gate refused -> pending, not posted', { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "gm-refused" });
  const store = getDocsStore();
  let postBatchCalled = false;
  const writer = { postBatch: async () => { postBatchCalled = true; return { rows: [1, 2] }; } };
  const result = await processDecision({
    envelope,
    docId: "gm-refused",
    model: postModel(),
    transcript_summary: [],
    usage: {},
    gateResult: { passed: false, reasons: ["OVER_CEILING"] },
    ctx: baseCtx(),
    writer,
    docsStore: store,
  });
  assert.equal(result.status, "pending");
  assert.equal(postBatchCalled, false);
});

test('verdict "post" + gate passed: files to Drive under [year, property] BEFORE posting, then postBatch, then posted', { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "gm-post1" });
  const store = getDocsStore();
  await store.set("att/gm-post1/0", Buffer.from("hi").toString("base64"), { metadata: { contentType: "image/jpeg" } });

  const calls = [];
  const writer = {
    storeDocument: async (name, mime, base64, folder) => {
      calls.push({ op: "storeDocument", folder });
      return { fileId: "f1", url: "https://drive/receipt.jpg", folderUrl: "https://drive/folder" };
    },
    postBatch: async (entries) => {
      calls.push({ op: "postBatch", entries });
      // doc_url (an entry-level field per phase0-spec.md section 3 - the writer
      // falls each line back to it) must already be set by the time postBatch is
      // called - "file the document first, then post" (phase2-spec.md section 5).
      assert.ok(entries.every((e) => e.doc_url === "https://drive/receipt.jpg"));
      return { rows: [10, 11] };
    },
    // A successful post refreshes the Journal books-cache snapshot (phase2.5-spec.md
    // section 2: "post/postBatch/void -> Journal") via the writer.
    read: async (tab) => ({ ok: true, headers: ["txn_id"], rows: [] }),
  };

  const result = await processDecision({
    envelope,
    docId: "gm-post1",
    model: postModel(),
    transcript_summary: ["read", "decided"],
    usage: { input_tokens: 10, output_tokens: 5 },
    gateResult: PASS_GATE,
    ctx: baseCtx(),
    writer,
    docsStore: store,
  });

  assert.equal(result.status, "posted");
  assert.equal(result.result.doc_url, "https://drive/receipt.jpg");
  assert.equal(result.result.rows.length, 2);
  assert.equal(result.result.txn_ids.length, 1);

  // Drive filing happens before postBatch, and the folder is [year, property] from
  // the model's own first proposed entry (phase2-spec.md section 7's worked example).
  assert.equal(calls[0].op, "storeDocument");
  assert.deepEqual(calls[0].folder, ["2026", "881 Newport"]);
  assert.equal(calls[1].op, "postBatch");
});

test("a supersede voids the old entry before posting the new one", { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "gm-supersede" });
  const store = getDocsStore();
  await store.set("att/gm-supersede/0", Buffer.from("hi").toString("base64"), { metadata: {} });

  const calls = [];
  const writer = {
    storeDocument: async () => ({ fileId: "f1", url: "https://drive/x", folderUrl: "https://drive/folder" }),
    void: async (txn_id, reason, date, posted_by) => {
      calls.push({ op: "void", txn_id, reason, posted_by });
      return { ok: true };
    },
    postBatch: async (entries) => {
      calls.push({ op: "postBatch" });
      return { rows: [1, 2] };
    },
    // A successful post refreshes the Journal books-cache snapshot (phase2.5-spec.md
    // section 2: "post/postBatch/void -> Journal") via the writer.
    read: async (tab) => ({ ok: true, headers: ["txn_id"], rows: [] }),
  };

  await processDecision({
    envelope,
    docId: "gm-supersede",
    model: postModel({ supersedes: "receipt-20260909-old" }),
    transcript_summary: [],
    usage: {},
    gateResult: PASS_GATE,
    ctx: baseCtx(),
    writer,
    docsStore: store,
  });

  assert.equal(calls[0].op, "void");
  assert.equal(calls[0].txn_id, "receipt-20260909-old");
  assert.match(calls[0].reason, /superseded by gm-supersede/);
  assert.equal(calls[0].posted_by, "claude");
  assert.equal(calls[1].op, "postBatch");
});

test("postBatch DUPLICATE/PERIOD_CLOSED downgrades to pending with the reason recorded", { skip }, async () => {
  const { WriterError } = await import("../lib/writer-client.mjs");
  const envelope = await seedEnvelope({ docId: "gm-dup" });
  const store = getDocsStore();
  await store.set("att/gm-dup/0", Buffer.from("hi").toString("base64"), { metadata: {} });

  const writer = {
    storeDocument: async () => ({ fileId: "f1", url: "https://drive/x", folderUrl: "https://drive/folder" }),
    postBatch: async () => {
      throw new WriterError("DUPLICATE", "txn_id already posted");
    },
  };

  const result = await processDecision({
    envelope,
    docId: "gm-dup",
    model: postModel(),
    transcript_summary: [],
    usage: {},
    gateResult: PASS_GATE,
    ctx: baseCtx(),
    writer,
    docsStore: store,
  });

  assert.equal(result.status, "pending");
  assert.ok(result.gate.reasons.some((r) => r.includes("DUPLICATE")));
});

test("a lost postBatch reply is confirmed against the Journal and recorded as posted", { skip }, async () => {
  const { WriterError } = await import("../lib/writer-client.mjs");
  const envelope = await seedEnvelope({ docId: "gm-lost" });
  const store = getDocsStore();
  await store.set("att/gm-lost/0", Buffer.from("hi").toString("base64"), { metadata: {} });
  const writer = {
    storeDocument: async () => ({ fileId: "f1", url: "https://drive/x", folderUrl: "https://drive/folder" }),
    postBatch: async () => { throw new WriterError("REDIRECT_MISFIRE", "the reply came from doGet"); },
  };
  const asked = [];
  const result = await processDecision({
    envelope, docId: "gm-lost", model: postModel(), transcript_summary: [], usage: {}, gateResult: PASS_GATE, ctx: baseCtx(),
    writer, docsStore: store,
    confirmPosted: async (ids, since) => { asked.push({ ids, since }); return true; },
  });
  assert.equal(result.status, "posted");
  assert.equal(asked.length, 1);
  assert.deepEqual(result.result.txn_ids, asked[0].ids);
  assert.equal(result.result.doc_url, "https://drive/x");

  // Not on the Journal: the original error surfaces, so the warm job replays it.
  const envelope2 = await seedEnvelope({ docId: "gm-lost2" });
  await store.set("att/gm-lost2/0", Buffer.from("hi").toString("base64"), { metadata: {} });
  await assert.rejects(
    processDecision({ envelope: envelope2, docId: "gm-lost2", model: postModel(), transcript_summary: [], usage: {}, gateResult: PASS_GATE, ctx: baseCtx(),
      writer, docsStore: store, confirmPosted: async () => false }),
    (e) => e.code === "REDIRECT_MISFIRE",
  );
});

test("writer DUPLICATE on an invoice-numbered receipt dismisses as a duplicate (twin beat it)", { skip }, async () => {
  const { WriterError } = await import("../lib/writer-client.mjs");
  const envelope = await seedEnvelope({ docId: "gm-dup-inv" });
  const store = getDocsStore();
  await store.set("att/gm-dup-inv/0", Buffer.from("hi").toString("base64"), { metadata: {} });
  const writer = {
    storeDocument: async () => ({ fileId: "f1", url: "https://drive/x", folderUrl: "https://drive/folder" }),
    postBatch: async () => { throw new WriterError("DUPLICATE", "txn_id already posted"); },
  };
  const result = await processDecision({
    envelope, docId: "gm-dup-inv", model: { ...postModel(), invoice_number: "2268-3974-1772" },
    transcript_summary: [], usage: {}, gateResult: PASS_GATE, ctx: baseCtx(), writer, docsStore: store,
  });
  assert.equal(result.status, "dismissed");
  assert.match(result.model.duplicate_of, /^receipt-/);
  assert.match(result.model.why, /invoice 2268-3974-1772/);
});

test("a non-conflict postBatch failure propagates (caller records status error)", { skip }, async () => {
  const { WriterError } = await import("../lib/writer-client.mjs");
  const envelope = await seedEnvelope({ docId: "gm-fail" });
  const store = getDocsStore();
  await store.set("att/gm-fail/0", Buffer.from("hi").toString("base64"), { metadata: {} });

  const writer = {
    storeDocument: async () => ({ fileId: "f1", url: "https://drive/x", folderUrl: "https://drive/folder" }),
    postBatch: async () => {
      throw new WriterError("UNAUTHORIZED", "bad secret");
    },
  };

  await assert.rejects(
    () =>
      processDecision({
        envelope,
        docId: "gm-fail",
        model: postModel(),
        transcript_summary: [],
        usage: {},
        gateResult: PASS_GATE,
        ctx: baseCtx(),
        writer,
        docsStore: store,
      }),
    (err) => {
      assert.equal(err.code, "UNAUTHORIZED");
      return true;
    },
  );
});

// ---- propertyMailboxHint (phase2.6-spec.md §4) -----------------------------------

test("read_ledger by date: a receipt's cost lines within 10 days, nearest first - a row booked 5 days late still shows", { skip }, () => {
  // Home Depot 01-11 (2026-09-26): 40 entries within 3 days filled the old 80-line cap with their
  // payment-side lines, so the light bulbs booked on 01-16 never reached the model.
  const lines = [];
  for (let i = 0; i < 40; i++) {
    const date = `2026-01-${String(8 + (i % 7)).padStart(2, "0")}`;
    lines.push({ txn_id: `m-${i}`, date, payee: "Home Depot", amount_cents: 100 + i, account: "1030", property: "104 Ashburne" });
    lines.push({ txn_id: `m-${i}`, date, payee: "Home Depot", amount_cents: -(100 + i), account: "2030", property: "104 Ashburne" });
  }
  lines.push({ txn_id: "bulbs", date: "2026-01-16", payee: "Home Depot", amount_cents: 2594, account: "1030", property: "104 Ashburne" });
  lines.push({ txn_id: "far", date: "2026-01-25", payee: "Home Depot", amount_cents: 999, account: "1030", property: "104 Ashburne" });

  const rows = makeLedgerDep(lines).recent({ date: "2026-01-11" });
  assert.ok(rows.some((r) => r.txn_id === "bulbs"), "the late-booked row must show");
  assert.ok(rows.every((r) => r.amount_cents > 0), "cost lines only");
  assert.ok(!rows.some((r) => r.txn_id === "far"), "more than 10 days away");
  assert.equal(rows.at(-1).txn_id, "bulbs", "nearest first");
});

test("propertyMailboxHint: envelope.channel in the property registry -> that name", { skip }, () => {
  const ctx = { properties: new Set(["1616 Granite", "881 Newport"]) };
  assert.equal(propertyMailboxHint(ctx, { channel: "1616 Granite" }), "1616 Granite");
});

test("propertyMailboxHint: fixed channels and unregistered names -> undefined", { skip }, () => {
  const ctx = { properties: new Set(["1616 Granite"]) };
  assert.equal(propertyMailboxHint(ctx, { channel: "receipts" }), undefined);
  assert.equal(propertyMailboxHint(ctx, { channel: "travel" }), undefined);
  assert.equal(propertyMailboxHint(ctx, { channel: "upload" }), undefined);
  assert.equal(propertyMailboxHint(ctx, { channel: "Some Unregistered House" }), undefined);
});

// ---- default handler: only the paths that return before runBookkeeper -----------

function req(body, { pollerSecret } = { pollerSecret: "poller-secret" }) {
  const headers = { "content-type": "application/json" };
  if (pollerSecret) headers["x-poller-secret"] = pollerSecret;
  return new Request("https://books.test/api/ingest-bg", { method: "POST", headers, body: JSON.stringify(body || {}) });
}

test("wrong poller secret -> 401", { skip }, async () => {
  const res = await handler(req({ docId: "gm-x" }, { pollerSecret: "nope" }));
  assert.equal(res.status, 401);
});

test("missing poller secret -> 401", { skip }, async () => {
  const res = await handler(req({ docId: "gm-x" }, { pollerSecret: undefined }));
  assert.equal(res.status, 401);
});

test("missing docId -> 400", { skip }, async () => {
  const res = await handler(req({}));
  assert.equal(res.status, 400);
});

test("no envelope for docId -> 404", { skip }, async () => {
  const res = await handler(req({ docId: "gm-does-not-exist" }));
  assert.equal(res.status, 404);
});

test("GET is not allowed", { skip }, async () => {
  const res = await handler(new Request("https://books.test/api/ingest-bg", { method: "GET" }));
  assert.equal(res.status, 405);
});

// 2026-09-28: the 09-17 staging replay left migration-era envelopes saying "posted" with ids that never reached the
// production Journal; the Ping Lighting re-read believed one and called a sconce "already in the books". search_docs
// now checks a "posted" copy's rows against the Journal and says "not on the books" when none is there.
test("search_docs: a 'posted' copy whose rows are not on the Journal is reported as not on the books, with no ids", { skip }, async () => {
  const store = getDocsStore();
  const base = { model: { vendor: "Ping Lighting", date: "2026-03-10", receipt_total_cents: 9920, verdict: "post" }, finishedAt: new Date().toISOString() };
  await store.setJSON("doc/gm-practice", { ...base, docId: "gm-practice", status: "posted", result: { txn_ids: ["receipt-20260310-practice"] } });
  await store.setJSON("doc/gm-real", { ...base, docId: "gm-real", status: "posted", result: { txn_ids: ["receipt-20260310-real"] } });
  await store.setJSON("doc/gm-held", { ...base, docId: "gm-held", status: "pending", result: null });
  const onBooks = new Set(["receipt-20260310-real"]);
  const by = Object.fromEntries((await searchDocs(store, { vendor: "Ping", amount_cents: 9920, days: 400 }, "gm-self", onBooks)).map((d) => [d.docId, d]));
  assert.equal(by["gm-real"].status, "posted");
  assert.deepEqual(by["gm-real"].txn_ids, ["receipt-20260310-real"]);
  assert.match(by["gm-practice"].status, /not on the books/);
  assert.deepEqual(by["gm-practice"].txn_ids, [], "a practice-run id must not be offered as proof");
  assert.equal(by["gm-held"].status, "pending", "only 'posted' copies are checked");
  const unchecked = await searchDocs(store, { vendor: "Ping", amount_cents: 9920, days: 400 }, "gm-self");
  assert.equal(unchecked.find((d) => d.docId === "gm-practice").status, "posted", "with no Journal to check against, the stored status stands");
});

// 2026-09-28: the reader reuses a house's existing sections (its trades in use), most used first.
test("tradesByProperty: a house's sections from its cost lines, most used first, credit lines and blanks ignored", { skip }, () => {
  const L = (property, trade, amount_cents) => ({ property, trade, amount_cents });
  const out = tradesByProperty([
    L("104 Ashburne", "Lighting & Electrical", 100), L("104 Ashburne", "Lighting & Electrical", 100), L("104 Ashburne", "Pool", 100),
    L("104 Ashburne", "", 100), L("104 Ashburne", "Marketing", -100), L("1616 Granite", "Paint & Flooring", 100), L("OVERHEAD", "", 100),
  ]);
  assert.deepEqual(out["104 Ashburne"], ["Lighting & Electrical", "Pool"]);
  assert.deepEqual(out["1616 Granite"], ["Paint & Flooring"]);
  assert.equal(out["OVERHEAD"], undefined);
});

// ---- D-057: a charge waiting on its receipt ----------------------------------------------------
const WAITING = { txn_id: "receipt-20260912-wait", date: "2026-09-12", payee: "THE HOME DEPOT #6505 W", property: "881 Newport", paid_from: "1401", total_cents: 4500 };

test("D-057: the receipt takes its placeholder's place - voided on the placeholder's own date, posted, the bank lines moved", { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "gm-swap" });
  const store = getDocsStore();
  await store.set("att/gm-swap/0", Buffer.from("hi").toString("base64"), { metadata: {} });
  const calls = [];
  const writer = {
    storeDocument: async () => ({ fileId: "f1", url: "https://drive/x", folderUrl: "https://drive/folder" }),
    void: async (txn_id, reason, date) => { calls.push(["void", txn_id, reason, date]); return { ok: true }; },
    postBatch: async (entries) => { calls.push(["postBatch", entries.length]); return { rows: [1, 2] }; },
    feedRetie: async (from, to, note) => { calls.push(["feedRetie", from, to.length, note]); return { ok: true, updated: 1 }; },
    read: async () => ({ ok: true, headers: ["txn_id"], rows: [] }),
  };
  const result = await processDecision({ envelope, docId: "gm-swap", model: postModel({ supersedes: WAITING.txn_id }), transcript_summary: [], usage: {},
    gateResult: { passed: true, reasons: [], placeholder: WAITING }, ctx: baseCtx(), writer, docsStore: store });
  assert.equal(result.status, "posted");
  assert.deepEqual(calls, [
    ["void", WAITING.txn_id, "replaced by its receipt gm-swap", "2026-09-12"],
    ["postBatch", 1],
    ["feedRetie", WAITING.txn_id, 1, "The receipt came in (gm-swap) and replaced the placeholder"],
  ]);
});

test("D-057: the bank lines failing to move never undoes the post", { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "gm-swap-2" });
  const store = getDocsStore();
  await store.set("att/gm-swap-2/0", Buffer.from("hi").toString("base64"), { metadata: {} });
  const writer = {
    storeDocument: async () => ({ fileId: "f1", url: "https://drive/x", folderUrl: "https://drive/folder" }),
    void: async () => ({ ok: true }), postBatch: async () => ({ rows: [1, 2] }),
    feedRetie: async () => { throw new Error("the writer timed out"); },
    read: async () => ({ ok: true, headers: ["txn_id"], rows: [] }),
  };
  const result = await processDecision({ envelope, docId: "gm-swap-2", model: postModel({ supersedes: WAITING.txn_id }), transcript_summary: [], usage: {},
    gateResult: { passed: true, reasons: [], placeholder: WAITING }, ctx: baseCtx(), writer, docsStore: store });
  assert.equal(result.status, "posted");
  assert.equal(result.result.txn_ids.length, 1);
});

test("D-057: a receipt that touches a placeholder is never dismissed by code, however sure the read is - it waits for Paul", { skip }, async () => {
  const gateResult = { passed: false, reasons: ["NOT_POST_VERDICT", `PLACEHOLDER_WAITING:${WAITING.txn_id}`], placeholder: WAITING };
  for (const [docId, model] of [
    ["gm-wait-dup", postModel({ verdict: "dismiss", duplicate_of: WAITING.txn_id })],
    ["gm-wait-sure", postModel({ verdict: "dismiss", confidence: "high" })],
    ["gm-wait-post", postModel()],
  ]) {
    const envelope = await seedEnvelope({ docId });
    const touched = [];
    const writer = { storeDocument: async () => { touched.push("storeDocument"); }, postBatch: async () => { touched.push("postBatch"); return { rows: [] }; }, void: async () => { touched.push("void"); } };
    const result = await processDecision({ envelope, docId, model, transcript_summary: [], usage: {}, gateResult, ctx: baseCtx(), writer, docsStore: getDocsStore() });
    assert.equal(result.status, "pending", docId);
    assert.deepEqual(touched, [], `${docId}: nothing filed, posted or voided`);
    assert.equal(result.gate.placeholder.txn_id, WAITING.txn_id, `${docId}: the card knows which charge it may replace`);
  }
});

test("D-057: the gate sees who paid for a posted entry, and the bookkeeper's ledger rows say it", { skip }, async () => {
  const { flattenJournalLines, buildPostedEntries } = await import("../netlify/functions/books-ingest-background.mjs");
  const lines = flattenJournalLines(["txn_id", "date", "account", "debit", "credit", "property", "payee", "description", "paid_from"], [
    ["receipt-wait", "2026-09-12", "1030", 45, "", "881 Newport", "THE HOME DEPOT #6505 W", "NEED RECEIPT FROM DENNIS", "1401"],
    ["receipt-wait", "2026-09-12", "1401", "", 45, "881 Newport", "THE HOME DEPOT #6505 W", "NEED RECEIPT FROM DENNIS", "1401"],
  ]);
  const [posted] = buildPostedEntries(lines);
  assert.equal(posted.paid_from, "1401");
  assert.equal(posted.total_cents, 4500);
  assert.match(posted.text, /NEED RECEIPT FROM DENNIS/);
});
