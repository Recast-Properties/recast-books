// test/books-property-mailboxes.test.mjs — netlify/functions/books-property-mailboxes.mjs
// phase2.6-spec.md §3/§6: auth (poller secret vs session), shape of every response,
// and the label <-> Properties.name normalisation rule (lib/property-key.mjs).
//
// Same pattern as test/books-meta.test.mjs: a fake books-cache store stands in for
// Netlify Blobs, and a mocked global fetch stands in for the Apps Script writer, so
// this never touches a real workbook.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { issueSession } from "../lib/auth.mjs";
import { resetWriterForTests, resetCacheStoreForTests } from "../netlify/functions/_shared.mjs";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";
import { normalizePropertyKey } from "../lib/property-key.mjs";

process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
process.env.SESSION_SECRET = "session-secret";
process.env.POLLER_SECRET = "poller-secret";

const { default: handler } = await import("../netlify/functions/books-property-mailboxes.mjs");

const PROPERTIES_ROWS = [
  ["1616 Granite", "1616 Granite Dr", "under contract", "2026-04-07", "279001", "", "", true, "", ""],
  ["881 Newport", "881 Newport Dr", "held", "2026-06-29", "207000", "", "", true, "", ""],
  ["Old Sold House", "1 Sold St", "sold", "2025-01-01", "150000", "2025-06-01", "", false, "", ""],
];

let cacheStore;

beforeEach(() => {
  resetWriterForTests();
  cacheStore = makeFakeCacheStore();
  resetCacheStoreForTests(cacheStore);
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.action === "read" && body.tab === "Properties") {
      return {
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            headers: ["name", "address", "status", "purchase_date", "purchase_price", "settlement_date", "template", "dennis_funded", "drive_folder", "notes"],
            rows: PROPERTIES_ROWS,
          }),
      };
    }
    throw new Error(`unexpected writer call: ${JSON.stringify(body)}`);
  };
});

function session(role, email = `${role}@recast-properties.com`) {
  return issueSession({ email, role, name: role }, process.env.SESSION_SECRET);
}

function req(method, { body, token, pollerSecret } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (pollerSecret) headers["x-poller-secret"] = pollerSecret;
  return new Request("https://books.test/api/property-mailboxes", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("normalizePropertyKey lower-cases and strips everything but [a-z0-9]", () => {
  assert.equal(normalizePropertyKey("881 Newport"), "881newport");
  assert.equal(normalizePropertyKey("881Newport"), "881newport");
  assert.equal(normalizePropertyKey("1616 Granite"), "1616granite");
  assert.equal(normalizePropertyKey(""), "");
  assert.equal(normalizePropertyKey(null), "");
});

test("GET with poller secret returns registered {name,key} for held/under-contract properties only", async () => {
  const res = await handler(req("GET", { pollerSecret: "poller-secret" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.registered, [
    { name: "1616 Granite", key: "1616granite" },
    { name: "881 Newport", key: "881newport" },
  ]);
});

test("POST with poller secret stores labels under mailbox/labels with a fetchedAt", async () => {
  const res = await handler(req("POST", { pollerSecret: "poller-secret", body: { labels: ["1616 Granite", "Some Other Label"] } }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.labels, ["1616 Granite", "Some Other Label"]);
  assert.ok(typeof body.fetchedAt === "number");

  const stored = await cacheStore.get("mailbox/labels", { type: "json" });
  assert.deepEqual(stored.labels, ["1616 Granite", "Some Other Label"]);
  assert.equal(stored.fetchedAt, body.fetchedAt);
});

test("POST without the poller secret is unauthorized", async () => {
  const res = await handler(req("POST", { body: { labels: ["x"] } }));
  assert.equal(res.status, 401);
});

test("POST with a non-array labels body is rejected", async () => {
  const res = await handler(req("POST", { pollerSecret: "poller-secret", body: { labels: "not-an-array" } }));
  assert.equal(res.status, 400);
});

test("GET with a session (any role) returns labels + registered + fetchedAt", async () => {
  await handler(req("POST", { pollerSecret: "poller-secret", body: { labels: ["1616 Granite"] } }));

  const res = await handler(req("GET", { token: session("partner") }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.labels, ["1616 Granite"]);
  assert.deepEqual(body.registered, [
    { name: "1616 Granite", key: "1616granite" },
    { name: "881 Newport", key: "881newport" },
  ]);
  assert.ok(typeof body.fetchedAt === "number");
});

test("GET with a session before any labels were ever posted returns an empty labels list, not an error", async () => {
  const res = await handler(req("GET", { token: session("owner") }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.labels, []);
  assert.equal(body.fetchedAt, null);
});

test("GET with neither poller secret nor session is unauthorized", async () => {
  const res = await handler(req("GET", {}));
  assert.equal(res.status, 401);
});

test("unsupported method is rejected", async () => {
  const res = await handler(req("DELETE", { token: session("owner") }));
  assert.equal(res.status, 405);
});
