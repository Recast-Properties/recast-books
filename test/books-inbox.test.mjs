// test/books-inbox.test.mjs — netlify/functions/books-inbox.mjs, phase2-spec.md section 5
//
// books-inbox.mjs imports lib/gate.mjs (buildEntriesFromModel), which another agent
// is writing concurrently per this task's brief - if it is missing, every test below
// is skipped with a clear reason instead of failing the suite (same pattern as
// test/books-dennis.test.mjs and test/books-ingest-background.test.mjs). Unlike
// ingest-background, books-inbox.mjs never calls runBookkeeper or touches
// deps.anthropic - approve builds entries straight from a `model` object with no
// tool loop - so once lib/gate.mjs exists, every test here runs against the real
// buildEntriesFromModel/buildEntry with no network risk at all.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { issueSession } from "../lib/auth.mjs";
import { installFakeBlobsContext, makeFakeDocsStore } from "./helpers/fake-docs-store.mjs";

process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
process.env.SESSION_SECRET = "session-secret";
process.env.POLLER_SECRET = "poller-secret";
installFakeBlobsContext();

let handler, resetWriterForTests, getDocsStore, importError;
try {
  ({ default: handler } = await import("../netlify/functions/books-inbox.mjs"));
  ({ resetWriterForTests, getDocsStore } = await import("../netlify/functions/_shared.mjs"));
} catch (err) {
  importError = err;
}

const skip = importError ? `lib/gate.mjs not present yet: ${importError.message}` : false;

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
        // A successful postBatch refreshes the Journal books-cache snapshot
        // (phase2.5-spec.md section 2: "post/postBatch/void -> Journal").
        return { ok: true, headers: ["txn_id", "date"], rows: [] };
      default:
        throw new Error(`unexpected read: ${body.tab}`);
    }
  }
  if (body.action === "postBatch") {
    return { ok: true, posted: body.entries.map((e) => e.txn_id), rows: [5, 6] };
  }
  throw new Error(`writerRouter did not expect action ${body.action} / ${JSON.stringify(body).slice(0, 120)}`);
}

let docsStore, writerCalls, ingestCalls;

beforeEach(() => {
  if (importError) return;
  resetWriterForTests();
  docsStore = makeFakeDocsStore();
  writerCalls = [];
  ingestCalls = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(typeof url === "string" ? url : url.url);
    if (u === "https://writer.test/exec") {
      const body = JSON.parse(opts.body);
      writerCalls.push(body);
      return { status: 200, text: async () => JSON.stringify(writerRouter(body)) };
    }
    if (u === "https://books.test/api/ingest-bg") {
      ingestCalls.push({ body: JSON.parse(opts.body), headers: opts.headers });
      return new Response(JSON.stringify({ docId: JSON.parse(opts.body).docId }), { status: 202 });
    }
    return docsStore.fetchImpl(url, opts);
  };
});

function session(role, email = `${role}@recast-properties.com`) {
  return issueSession({ email, role, name: role }, process.env.SESSION_SECRET);
}

function req(method, { body, token, search = "" } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`https://books.test/api/inbox${search}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function postModel(overrides = {}) {
  return {
    verdict: "post",
    confidence: "high",
    why: "reconciled",
    document_type: "receipt",
    vendor: "Home Depot",
    date: "2026-09-10",
    receipt_total_cents: 4500,
    subtotal_cents: 4157,
    tax_cents: 343,
    paid_from: "1401",
    paid_from_reason: "matched last-4",
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

async function seedEnvelope(docId, overrides = {}) {
  const store = getDocsStore();
  const envelope = {
    docId,
    source: "email",
    channel: "receipts",
    dryRun: false,
    attachments: [],
    status: "pending",
    startedAt: "2026-09-11T12:00:00.000Z",
    finishedAt: "2026-09-11T12:05:00.000Z",
    error: "",
    model: postModel(),
    gate: { passed: false, reasons: ["LOW_CONFIDENCE"] },
    result: null,
    review: null,
    ...overrides,
  };
  await store.setJSON(`doc/${docId}`, envelope);
  return envelope;
}

// ---- GET -------------------------------------------------------------------------

test("GET requires a session", { skip }, async () => {
  const res = await handler(req("GET"));
  assert.equal(res.status, 401);
});

test("GET returns envelopes newest first, filtered by status", { skip }, async () => {
  await seedEnvelope("gm-1", { status: "pending", startedAt: "2026-09-10T10:00:00.000Z" });
  await seedEnvelope("gm-2", { status: "posted", startedAt: "2026-09-11T10:00:00.000Z" });
  await seedEnvelope("gm-3", { status: "pending", startedAt: "2026-09-11T11:00:00.000Z" });

  const res = await handler(req("GET", { token: session("partner"), search: "?status=pending" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.envelopes.length, 2);
  assert.equal(body.envelopes[0].docId, "gm-3"); // newest first
  assert.equal(body.envelopes[1].docId, "gm-1");
});

test("GET status=all returns everything", { skip }, async () => {
  await seedEnvelope("gm-a", { status: "pending" });
  await seedEnvelope("gm-b", { status: "dry" });
  const res = await handler(req("GET", { token: session("owner"), search: "?status=all" }));
  const body = await res.json();
  assert.equal(body.envelopes.length, 2);
});

test("GET rejects an unknown status", { skip }, async () => {
  const res = await handler(req("GET", { token: session("owner"), search: "?status=bogus" }));
  assert.equal(res.status, 400);
});

// ---- approve -----------------------------------------------------------------------

test("approve is owner-only", { skip }, async () => {
  await seedEnvelope("gm-approve1");
  const res = await handler(req("POST", { token: session("partner"), body: { action: "approve", docId: "gm-approve1" } }));
  assert.equal(res.status, 403);
});

test("approve: files to Drive (never filed while pending), builds entries, posts, records review", { skip }, async () => {
  await seedEnvelope("gm-approve2");
  const store = getDocsStore();
  await store.set("att/gm-approve2/0", Buffer.from("hi").toString("base64"), { metadata: { contentType: "image/jpeg" } });
  // envelope.attachments is empty in the fixture above, so storeAttachmentsToDrive
  // (which reads envelope.attachments) has nothing to file - approve should still
  // succeed (doc_url stays ""), matching a receipt with no stored attachment key.

  const res = await handler(req("POST", { token: session("owner"), body: { action: "approve", docId: "gm-approve2" } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "posted");
  assert.equal(body.txn_ids.length, 1);

  const envelope = await store.get("doc/gm-approve2", { type: "json" });
  assert.equal(envelope.status, "posted");
  assert.equal(envelope.review.action, "approve");
  assert.equal(envelope.review.by, "owner@recast-properties.com");

  const postCall = writerCalls.find((c) => c.action === "postBatch");
  assert.ok(postCall, "postBatch was not called");
  assert.equal(postCall.entries[0].posted_by, "owner@recast-properties.com");
  assert.equal(postCall.entries[0].lines.some((l) => l.account === "1030"), true);
});

test("approve honors human-edited entries over the model's original proposal", { skip }, async () => {
  await seedEnvelope("gm-approve3");
  const editedEntries = [
    {
      date: "2026-09-10",
      payee: "Home Depot",
      memo: "drywall (corrected)",
      property: "881 Newport",
      paid_from: "1401",
      items: [{ account: "1030", amount_cents: 5000, description: "drywall", trade: "", business_purpose: "" }],
    },
  ];

  const res = await handler(
    req("POST", { token: session("owner"), body: { action: "approve", docId: "gm-approve3", entries: editedEntries } }),
  );
  assert.equal(res.status, 200);

  const postCall = writerCalls.find((c) => c.action === "postBatch");
  const debitLine = postCall.entries[0].lines.find((l) => l.account === "1030");
  assert.equal(debitLine.debit, 5000);
});

test("approve maps a DUPLICATE from postBatch to 409", { skip }, async () => {
  await seedEnvelope("gm-approve4");
  globalThis.fetch = async (url, opts) => {
    const u = String(typeof url === "string" ? url : url.url);
    if (u === "https://writer.test/exec") {
      const body = JSON.parse(opts.body);
      if (body.action === "postBatch") {
        return { status: 200, text: async () => JSON.stringify({ ok: false, error: "DUPLICATE", message: "already posted" }) };
      }
      return { status: 200, text: async () => JSON.stringify(writerRouter(body)) };
    }
    return docsStore.fetchImpl(url, opts);
  };

  const res = await handler(req("POST", { token: session("owner"), body: { action: "approve", docId: "gm-approve4" } }));
  assert.equal(res.status, 409);
});

test("approve with no entries anywhere -> 400", { skip }, async () => {
  await seedEnvelope("gm-approve5", { model: { ...postModel(), entries: [] } });
  const res = await handler(req("POST", { token: session("owner"), body: { action: "approve", docId: "gm-approve5" } }));
  assert.equal(res.status, 400);
});

test("approve on an unknown docId -> 404", { skip }, async () => {
  const res = await handler(req("POST", { token: session("owner"), body: { action: "approve", docId: "gm-nope" } }));
  assert.equal(res.status, 404);
});

// ---- dismiss -----------------------------------------------------------------------

test("dismiss is owner-only", { skip }, async () => {
  await seedEnvelope("gm-dismiss1");
  const res = await handler(
    req("POST", { token: session("accountant"), body: { action: "dismiss", docId: "gm-dismiss1", note: "twin" } }),
  );
  assert.equal(res.status, 403);
});

test("dismiss requires a note", { skip }, async () => {
  await seedEnvelope("gm-dismiss2");
  const res = await handler(req("POST", { token: session("owner"), body: { action: "dismiss", docId: "gm-dismiss2" } }));
  assert.equal(res.status, 400);
});

test("dismiss sets status and review", { skip }, async () => {
  await seedEnvelope("gm-dismiss3");
  const res = await handler(
    req("POST", { token: session("owner"), body: { action: "dismiss", docId: "gm-dismiss3", note: "already on the books" } }),
  );
  assert.equal(res.status, 200);
  const envelope = await getDocsStore().get("doc/gm-dismiss3", { type: "json" });
  assert.equal(envelope.status, "dismissed");
  assert.equal(envelope.review.note, "already on the books");
});

// ---- reprocess ---------------------------------------------------------------------

test("reprocess is owner-only", { skip }, async () => {
  await seedEnvelope("gm-reprocess1");
  const res = await handler(req("POST", { token: session("partner"), body: { action: "reprocess", docId: "gm-reprocess1" } }));
  assert.equal(res.status, 403);
});

test("reprocess resets the envelope to processing and re-invokes ingest-bg with the poller secret", { skip }, async () => {
  await seedEnvelope("gm-reprocess2", { status: "error", error: "boom" });
  const res = await handler(req("POST", { token: session("owner"), body: { action: "reprocess", docId: "gm-reprocess2" } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "processing");

  assert.equal(ingestCalls.length, 1);
  assert.equal(ingestCalls[0].body.docId, "gm-reprocess2");
  assert.equal(ingestCalls[0].headers["x-poller-secret"], "poller-secret");

  const envelope = await getDocsStore().get("doc/gm-reprocess2", { type: "json" });
  assert.equal(envelope.status, "processing");
  assert.equal(envelope.error, "");
  assert.equal(envelope.model, null);
});

test("reprocess invoke failure marks the envelope error and returns 502", { skip }, async () => {
  await seedEnvelope("gm-reprocess3");
  globalThis.fetch = async (url, opts) => {
    const u = String(typeof url === "string" ? url : url.url);
    if (u === "https://books.test/api/ingest-bg") return new Response("", { status: 500 });
    if (u === "https://writer.test/exec") {
      const body = JSON.parse(opts.body);
      return { status: 200, text: async () => JSON.stringify(writerRouter(body)) };
    }
    return docsStore.fetchImpl(url, opts);
  };

  const res = await handler(req("POST", { token: session("owner"), body: { action: "reprocess", docId: "gm-reprocess3" } }));
  assert.equal(res.status, 502);
  const envelope = await getDocsStore().get("doc/gm-reprocess3", { type: "json" });
  assert.equal(envelope.status, "error");
});

// ---- delete ------------------------------------------------------------------------

test("delete is owner-only", { skip }, async () => {
  await seedEnvelope("gm-delete1", { status: "error" });
  const res = await handler(req("POST", { token: session("partner"), body: { action: "delete", docId: "gm-delete1" } }));
  assert.equal(res.status, 403);
});

test("delete refuses a pending/posted envelope", { skip }, async () => {
  await seedEnvelope("gm-delete2", { status: "pending" });
  const res = await handler(req("POST", { token: session("owner"), body: { action: "delete", docId: "gm-delete2" } }));
  assert.equal(res.status, 409);
});

test("delete removes a dry envelope and its attachments", { skip }, async () => {
  await seedEnvelope("gm-delete3", { status: "dry", attachments: [{ key: "att/gm-delete3/0", name: "r.jpg", mime: "image/jpeg", bytes: 5 }] });
  const store = getDocsStore();
  await store.set("att/gm-delete3/0", Buffer.from("hi").toString("base64"), { metadata: {} });

  const res = await handler(req("POST", { token: session("owner"), body: { action: "delete", docId: "gm-delete3" } }));
  assert.equal(res.status, 200);
  assert.equal(await store.get("doc/gm-delete3", { type: "json" }), null);
  assert.equal(await store.get("att/gm-delete3/0"), null);
});

test("delete removes an error envelope too", { skip }, async () => {
  await seedEnvelope("gm-delete4", { status: "error" });
  const res = await handler(req("POST", { token: session("owner"), body: { action: "delete", docId: "gm-delete4" } }));
  assert.equal(res.status, 200);
});

// ---- misc ----------------------------------------------------------------------

test("unknown action -> 400", { skip }, async () => {
  await seedEnvelope("gm-misc1");
  const res = await handler(req("POST", { token: session("owner"), body: { action: "frobnicate", docId: "gm-misc1" } }));
  assert.equal(res.status, 400);
});

test("PUT is not allowed", { skip }, async () => {
  const res = await handler(req("PUT", { token: session("owner") }));
  assert.equal(res.status, 405);
});
