// test/books-warm.test.mjs — the background warmer refreshes every tab and reports failures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";

process.env.WRITER_URL ||= "https://writer.test";
process.env.WRITER_SECRET ||= "s";
process.env.POLLER_SECRET ||= "poller-secret";

const { resetWriterForTests, resetCacheStoreForTests, resetDocsStoreForTests } = await import("../netlify/functions/_shared.mjs");
const { default: handler, WARM_TABS, retryErroredDocs, MAX_AUTO_RETRIES } = await import("../netlify/functions/books-warm-background.mjs");

// Minimal in-memory stand-in for the three docs-store calls the retry scan makes.
function memDocsStore(envelopes) {
  const items = new Map(envelopes.map((e) => [`doc/${e.docId}`, e]));
  return {
    items,
    list: async () => ({ blobs: [...items.keys()].map((key) => ({ key })) }),
    get: async (key) => items.get(key) ?? null,
    setJSON: async (key, value) => { items.set(key, value); },
  };
}

test("warm-bg refreshes every tab into the cache; a failing tab is reported, not fatal", async () => {
  const store = makeFakeCacheStore();
  resetCacheStoreForTests(store);
  resetDocsStoreForTests(memDocsStore([]));
  const seen = [];
  resetWriterForTests();
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    seen.push(body.tab);
    const out = body.tab === "Vendors" ? { ok: false, error: "BOOM", message: "boom" } : { ok: true, headers: ["a"], rows: [[1]] };
    return { status: 200, text: async () => JSON.stringify(out) };
  };
  const res = await handler(new Request("https://x/api/warm-bg", { method: "POST", headers: { "x-poller-secret": "poller-secret" } }));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(seen, WARM_TABS);
  assert.equal(body.warmed, WARM_TABS.length - 1);
  assert.match(body.failed[0], /^Vendors: /);
  assert.ok(await store.get("tab/Users"));
  assert.equal(await store.get("tab/Vendors"), null);
  assert.deepEqual(body.retried, []);
  resetWriterForTests();
  resetCacheStoreForTests(null);
  resetDocsStoreForTests(null);
});

test("retryErroredDocs re-reads error docs with no read and re-posts those with one, at most MAX_AUTO_RETRIES times", async () => {
  const docs = memDocsStore([
    { docId: "gm-0", status: "error", error: "read on staging", receivedAt: "2026-03-22T10:00:00.000Z", model: { verdict: "post" } },
    { docId: "gm-a", status: "error", error: "Writer returned a non-JSON response", receivedAt: "2026-09-21T10:00:00.000Z", model: null },
    { docId: "gm-b", status: "error", error: "boom after the model ran", receivedAt: "2026-09-25T10:00:00.000Z", model: { verdict: "post" } },
    { docId: "gm-e", status: "error", error: "third in line", receivedAt: "2026-09-25T11:00:00.000Z", model: null },
    { docId: "gm-c", status: "error", error: "still broken", model: null, retries: MAX_AUTO_RETRIES },
    { docId: "gm-d", status: "pending", model: null },
  ]);
  const invoked = [];
  globalThis.fetch = async (url, opts) => {
    invoked.push({ url: String(url), body: JSON.parse(opts.body), secret: opts.headers["x-poller-secret"] });
    return new Response("", { status: 202 });
  };
  const retried = await retryErroredDocs("https://books.test", docs);
  assert.deepEqual(retried, ["gm-a", "gm-b"]);
  assert.deepEqual(invoked.map((i) => i.body), [{ docId: "gm-a", reprocess: true }, { docId: "gm-b", fromStored: true }]);
  assert.equal(invoked[0].url, "https://books.test/api/ingest-bg");
  assert.equal(invoked[0].secret, "poller-secret");
  const a = docs.items.get("doc/gm-a");
  assert.equal(a.status, "processing");
  assert.equal(a.retries, 1);
  assert.equal(a.error, "");
  assert.equal(docs.items.get("doc/gm-b").status, "processing", "a doc whose read is stored is re-posted from it");
  assert.equal(docs.items.get("doc/gm-b").model.verdict, "post", "the stored read is kept for the replay");
  assert.equal(docs.items.get("doc/gm-c").status, "error", "a doc at the retry cap is left alone");
  assert.equal(docs.items.get("doc/gm-0").status, "error", "a migration-era doc is never replayed");
  assert.equal(docs.items.get("doc/gm-e").status, "error", "at most MAX_RETRIES_PER_RUN per run");
  assert.equal(docs.items.get("doc/gm-d").status, "pending");
});

test("retryErroredDocs records a failed re-invocation as error again, keeping the retry count", async () => {
  const docs = memDocsStore([{ docId: "gm-a", status: "error", error: "x", receivedAt: "2026-09-25T10:00:00.000Z", model: null }]);
  globalThis.fetch = async () => new Response("", { status: 500 });
  const retried = await retryErroredDocs("https://books.test", docs);
  assert.deepEqual(retried, []);
  const a = docs.items.get("doc/gm-a");
  assert.equal(a.status, "error");
  assert.equal(a.retries, 1);
  assert.match(a.error, /HTTP 500/);
});

test("warm-bg refuses without the poller secret", async () => {
  const res = await handler(new Request("https://x/api/warm-bg", { method: "POST" }));
  assert.equal(res.status, 401);
});

test("audit 2026-10-24 #4: a doc stuck at processing longer than STUCK_MS is retried like an error; a live one is left alone", async () => {
  const { STUCK_MS } = await import("../netlify/functions/books-warm-background.mjs");
  const now = Date.parse("2026-10-24T12:00:00.000Z");
  const docs = memDocsStore([
    { docId: "gm-live", status: "processing", startedAt: new Date(now - 5 * 60 * 1000).toISOString(), receivedAt: "2026-10-24T11:50:00.000Z", model: null },
    { docId: "gm-dead", status: "processing", startedAt: new Date(now - STUCK_MS - 60 * 1000).toISOString(), receivedAt: "2026-10-24T09:00:00.000Z", model: null },
    { docId: "gm-dead-read", status: "processing", startedAt: new Date(now - 3 * STUCK_MS).toISOString(), receivedAt: "2026-10-24T08:00:00.000Z", model: { verdict: "post" } },
  ]);
  const invoked = [];
  globalThis.fetch = async (_url, opts) => { invoked.push(JSON.parse(opts.body)); return new Response("", { status: 202 }); };
  const retried = await retryErroredDocs("https://books.test", docs, now);
  assert.deepEqual(retried, ["gm-dead", "gm-dead-read"]);
  assert.deepEqual(invoked, [{ docId: "gm-dead", reprocess: true }, { docId: "gm-dead-read", fromStored: true }]);
  assert.equal(docs.items.get("doc/gm-live").retries, undefined, "a read five minutes in is still running");
  assert.equal(docs.items.get("doc/gm-dead").retries, 1);
  assert.ok(Date.parse(docs.items.get("doc/gm-dead").startedAt) >= now - 1000, "the retry restarts the clock, so it is not retried again next run");
});
