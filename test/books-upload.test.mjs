// test/books-upload.test.mjs — netlify/functions/books-upload.mjs, phase2-spec.md section 5
//
// books-upload.mjs only imports _shared.mjs (no dependency on lib/bookkeeper.mjs or
// lib/gate.mjs), so unlike the ingest/inbox tests this file always runs - no
// try/catch-and-skip needed. Blobs traffic is faked with
// test/helpers/fake-docs-store.mjs; the self-invocation of books-ingest-background
// is faked as a second branch on the same mocked global fetch.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { issueSession } from "../lib/auth.mjs";
import {
  resetDocsStoreForTests,
  getDocsStore,
  resetWriterForTests,
  resetCacheStoreForTests,
} from "../netlify/functions/_shared.mjs";
import { installFakeBlobsContext, makeFakeDocsStore } from "./helpers/fake-docs-store.mjs";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";

process.env.SESSION_SECRET = "session-secret";
process.env.POLLER_SECRET = "poller-secret";
// Only exercised by the "channel is a registered property name" tests below (see
// isRegisteredPropertyChannel in books-upload.mjs) - every other test's channel is
// one of the three fixed values and never touches the writer.
process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
installFakeBlobsContext();

const { default: handler } = await import("../netlify/functions/books-upload.mjs");

let docsStore; // { fetchImpl, items }
let ingestCalls; // [{url, body}]
let propertiesRows; // rows the fake writer answers a Properties read with

function session(role, email = `${role}@recast-properties.com`) {
  return issueSession({ email, role, name: role }, process.env.SESSION_SECRET);
}

function req({ body, token, pollerSecret } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (pollerSecret) headers["x-poller-secret"] = pollerSecret;
  return new Request("https://books.test/api/upload", {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
}

const SMALL_ATTACHMENT = { name: "r.jpg", mime: "image/jpeg", base64: Buffer.from("hello").toString("base64") };

beforeEach(() => {
  resetDocsStoreForTests();
  resetWriterForTests();
  resetCacheStoreForTests(makeFakeCacheStore());
  docsStore = makeFakeDocsStore();
  ingestCalls = [];
  propertiesRows = [["1616 Granite", "1616 Granite Dr", "under contract", "2026-04-07", "279001", "", "", true, "", ""]];
  globalThis.fetch = async (url, opts) => {
    const u = String(typeof url === "string" ? url : url.url);
    if (u === "https://books.test/api/ingest-bg") {
      ingestCalls.push({ url: u, opts });
      return new Response(JSON.stringify({ docId: JSON.parse(opts.body).docId, status: "processing" }), { status: 202 });
    }
    if (u === process.env.WRITER_URL) {
      const body = JSON.parse(opts.body);
      if (body.action === "read" && body.tab === "Properties") {
        return new Response(
          JSON.stringify({
            ok: true,
            headers: ["name", "address", "status", "purchase_date", "purchase_price", "settlement_date", "template", "dennis_funded", "drive_folder", "notes"],
            rows: propertiesRows,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false, error: "UNEXPECTED" }), { status: 200 });
    }
    return docsStore.fetchImpl(url, opts);
  };
});

test("neither session nor poller secret -> 401", async () => {
  const res = await handler(req({ body: { source: "upload", channel: "upload", attachments: [] } }));
  assert.equal(res.status, 401);
});

test("a bad session token -> 401", async () => {
  const res = await handler(req({ body: { source: "upload", channel: "upload" }, token: "garbage" }));
  assert.equal(res.status, 401);
});

test("wrong poller secret falls through to session auth and 401s with no session", async () => {
  const res = await handler(req({ body: { source: "upload", channel: "upload" }, pollerSecret: "not-the-secret" }));
  assert.equal(res.status, 401);
});

test("session auth: a signed-in upload with no attachments gets an up-<uuid> docId and invokes ingest", async () => {
  const res = await handler(
    req({ body: { source: "upload", channel: "upload", attachments: [] }, token: session("owner") }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.docId, /^up-/);
  assert.equal(ingestCalls.length, 1);
  assert.equal(JSON.parse(ingestCalls[0].opts.body).docId, body.docId);
  assert.equal(ingestCalls[0].opts.headers["x-poller-secret"], "poller-secret");

  const stored = await getDocsStore().get(`doc/${body.docId}`, { type: "json" });
  assert.equal(stored.status, "processing");
  assert.equal(stored.source, "upload");
});

test("poller-secret auth: an email upload requires a docId", async () => {
  const res = await handler(
    req({ body: { source: "email", channel: "receipts", attachments: [] }, pollerSecret: "poller-secret" }),
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "BAD_REQUEST");
});

test("poller-secret auth: an email upload with a docId stores att/<docId>/<i> and doc/<docId>", async () => {
  const res = await handler(
    req({
      body: {
        docId: "gm-abc123",
        source: "email",
        channel: "receipts",
        gmailUrl: "https://mail.google.com/x",
        subject: "Receipt",
        from: "vendor@example.com",
        receivedAt: "2026-09-10T12:00:00.000Z",
        bodyText: "thanks for your purchase",
        attachments: [SMALL_ATTACHMENT],
      },
      pollerSecret: "poller-secret",
    }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.docId, "gm-abc123");

  const store = getDocsStore();
  const envelope = await store.get("doc/gm-abc123", { type: "json" });
  assert.equal(envelope.status, "processing");
  assert.equal(envelope.attachments.length, 1);
  assert.equal(envelope.attachments[0].key, "att/gm-abc123/0");

  const attBytes = await store.get("att/gm-abc123/0");
  assert.equal(attBytes, SMALL_ATTACHMENT.base64);
});

test("dryRun prefixes the docId with dry- even when the caller already passed one", async () => {
  const res = await handler(
    req({
      body: { docId: "gm-xyz", source: "email", channel: "receipts", dryRun: true, attachments: [] },
      pollerSecret: "poller-secret",
    }),
  );
  const body = await res.json();
  assert.equal(body.docId, "dry-gm-xyz");
});

test("bad source/channel values are rejected", async () => {
  const res1 = await handler(req({ body: { source: "carrier-pigeon", channel: "upload" }, token: session("owner") }));
  assert.equal(res1.status, 400);
  const res2 = await handler(req({ body: { source: "upload", channel: "nope" }, token: session("owner") }));
  assert.equal(res2.status, 400);
});

test("channel accepts a registered (held/under contract) property name — phase2.6-spec.md §4", async () => {
  const res = await handler(
    req({ body: { docId: "gm-granite1", source: "email", channel: "1616 Granite", attachments: [] }, pollerSecret: "poller-secret" }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.docId, "gm-granite1");
  const envelope = await getDocsStore().get("doc/gm-granite1", { type: "json" });
  assert.equal(envelope.channel, "1616 Granite");
});

test("channel refuses a property name that isn't registered (wrong status or unknown)", async () => {
  propertiesRows.push(["Old Sold House", "1 Sold St", "sold", "2025-01-01", "150000", "2025-06-01", "", false, "", ""]);
  const res1 = await handler(
    req({ body: { docId: "gm-sold1", source: "email", channel: "Old Sold House", attachments: [] }, pollerSecret: "poller-secret" }),
  );
  assert.equal(res1.status, 400);

  const res2 = await handler(
    req({ body: { docId: "gm-nope1", source: "email", channel: "Not A Property", attachments: [] }, pollerSecret: "poller-secret" }),
  );
  assert.equal(res2.status, 400);
  const body2 = await res2.json();
  assert.equal(body2.error, "BAD_REQUEST");
});

test("an attachment over 6 MB is rejected with 413", async () => {
  const big = "A".repeat(9 * 1024 * 1024); // ~6.75 MB once decoded (base64 is 4/3 the byte size), over the 6 MB cap
  const res = await handler(
    req({
      body: { source: "upload", channel: "upload", attachments: [{ name: "big.jpg", mime: "image/jpeg", base64: big }] },
      token: session("owner"),
    }),
  );
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.equal(body.error, "ATTACHMENT_TOO_LARGE");
});

test("repeated docId already posted -> skipped:true, no re-upload, no re-invoke", async () => {
  const store = getDocsStore();
  await store.setJSON("doc/up-existing", { docId: "up-existing", status: "posted" });

  const res = await handler(
    req({ body: { docId: "up-existing", source: "upload", channel: "upload", attachments: [] }, token: session("owner") }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { docId: "up-existing", skipped: true });
  assert.equal(ingestCalls.length, 0);
});

test("repeated docId already posted, but reprocess:true bypasses the skip", async () => {
  const store = getDocsStore();
  await store.setJSON("doc/up-existing2", { docId: "up-existing2", status: "posted" });

  const res = await handler(
    req({
      body: { docId: "up-existing2", source: "upload", channel: "upload", attachments: [], reprocess: true },
      token: session("owner"),
    }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.skipped, undefined);
  assert.equal(ingestCalls.length, 1);
});

test("a pending docId is NOT skipped (only posted/dismissed/pending block a fresh upload... wait: pending DOES block)", async () => {
  // phase2-spec.md section 5: "A repeated docId that is already posted|dismissed|pending
  // returns {docId, skipped:true} unless reprocess:true" - pending is one of the three.
  const store = getDocsStore();
  await store.setJSON("doc/up-pending", { docId: "up-pending", status: "pending" });

  const res = await handler(
    req({ body: { docId: "up-pending", source: "upload", channel: "upload", attachments: [] }, token: session("owner") }),
  );
  const body = await res.json();
  assert.deepEqual(body, { docId: "up-pending", skipped: true });
});

test("an error-status docId is NOT skipped - the point of error is to be retried", async () => {
  const store = getDocsStore();
  await store.setJSON("doc/up-errored", { docId: "up-errored", status: "error" });

  const res = await handler(
    req({ body: { docId: "up-errored", source: "upload", channel: "upload", attachments: [] }, token: session("owner") }),
  );
  const body = await res.json();
  assert.equal(body.skipped, undefined);
  assert.equal(ingestCalls.length, 1);
});

test("if the ingest invocation fails, the envelope is rewritten to status error and the response is 502", async () => {
  globalThis.fetch = async (url, opts) => {
    const u = String(typeof url === "string" ? url : url.url);
    if (u === "https://books.test/api/ingest-bg") return new Response("", { status: 500 });
    return docsStore.fetchImpl(url, opts);
  };

  const res = await handler(
    req({ body: { docId: "up-boom", source: "upload", channel: "upload", attachments: [] }, token: session("owner") }),
  );
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.error, "INGEST_INVOKE_FAILED");

  const envelope = await getDocsStore().get("doc/up-boom", { type: "json" });
  assert.equal(envelope.status, "error");
  assert.ok(envelope.error.includes("failed to invoke ingest"));
});

test("GET is not allowed", async () => {
  const res = await handler(new Request("https://books.test/api/upload", { method: "GET" }));
  assert.equal(res.status, 405);
});
