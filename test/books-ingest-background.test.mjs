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

let handler, processDecision, resetWriterForTests, getDocsStore, importError;
try {
  ({ default: handler, processDecision } = await import("../netlify/functions/books-ingest-background.mjs"));
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

test('dismiss with NO duplicate_of falls through to pending (malformed model, defensive default)', { skip }, async () => {
  const envelope = await seedEnvelope({ docId: "gm-baddismiss" });
  const store = getDocsStore();
  const result = await processDecision({
    envelope,
    docId: "gm-baddismiss",
    model: postModel({ verdict: "dismiss", duplicate_of: "" }),
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
