// test/books-warm.test.mjs — the background warmer refreshes every tab and reports failures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";

process.env.WRITER_URL ||= "https://writer.test";
process.env.WRITER_SECRET ||= "s";
process.env.POLLER_SECRET ||= "poller-secret";

const { resetWriterForTests, resetCacheStoreForTests } = await import("../netlify/functions/_shared.mjs");
const { default: handler, WARM_TABS } = await import("../netlify/functions/books-warm-background.mjs");

test("warm-bg refreshes every tab into the cache; a failing tab is reported, not fatal", async () => {
  const store = makeFakeCacheStore();
  resetCacheStoreForTests(store);
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
  resetWriterForTests();
  resetCacheStoreForTests(null);
});

test("warm-bg refuses without the poller secret", async () => {
  const res = await handler(new Request("https://x/api/warm-bg", { method: "POST" }));
  assert.equal(res.status, 401);
});
