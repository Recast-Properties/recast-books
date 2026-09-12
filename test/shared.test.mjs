// test/shared.test.mjs — netlify/functions/_shared.mjs's Journal cache
// (phase1-spec.md §4: "cached 30 s in module scope, invalidated by any post").
//
// getJournalAll/invalidateJournalCache hold state in _shared.mjs's own module scope,
// so every test here shares one cache across the whole file (like the ctx/users cache
// tests would, if this repo had them) - each test calls invalidateJournalCache() first
// so it starts from a clean slate regardless of test order.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getJournalAll, invalidateJournalCache } from "../netlify/functions/_shared.mjs";

function fakeWriter(rows) {
  let calls = 0;
  return {
    calls: () => calls,
    read: async (tab, opts) => {
      calls++;
      assert.equal(tab, "Journal");
      assert.equal(opts && opts.all, true, "getJournalAll must call read('Journal', {all: true})");
      return { ok: true, headers: ["txn_id", "date"], rows };
    },
  };
}

test("getJournalAll fetches once and caches the result", async () => {
  invalidateJournalCache();
  const writer = fakeWriter([["t1", "2026-09-01"]]);

  const first = await getJournalAll(writer);
  const second = await getJournalAll(writer);

  assert.equal(writer.calls(), 1, "a second call within the TTL should not hit the writer again");
  assert.deepEqual(first, second);
  assert.deepEqual(first, { headers: ["txn_id", "date"], rows: [["t1", "2026-09-01"]] });
});

test("invalidateJournalCache forces the next call to re-fetch", async () => {
  invalidateJournalCache();
  const writer = fakeWriter([["t1", "2026-09-01"]]);

  await getJournalAll(writer);
  invalidateJournalCache();
  await getJournalAll(writer);

  assert.equal(writer.calls(), 2);
});

test("{fresh: true} bypasses the cache without invalidating it for other callers", async () => {
  invalidateJournalCache();
  const writer = fakeWriter([["t1", "2026-09-01"]]);

  await getJournalAll(writer);
  await getJournalAll(writer, { fresh: true });
  const third = await getJournalAll(writer); // back to the (still valid) cache

  assert.equal(writer.calls(), 2, "fresh:true forces one extra fetch, but the cache updates from it");
  assert.deepEqual(third, { headers: ["txn_id", "date"], rows: [["t1", "2026-09-01"]] });
});

test("driveFileName (Phase 2 polish): named from the verdict, original name when there is none", async () => {
  const { driveFileName } = await import("../netlify/functions/_shared.mjs");
  const model = { date: "2026-08-28", vendor: "FedEx Office", receipt_total_cents: 1275 };
  assert.equal(driveFileName(model, "image.jpg"), "2026-08-28 FedEx Office 12.75.jpg");
  assert.equal(driveFileName(model, "scan.PDF", 1), "2026-08-28 FedEx Office 12.75 (2).pdf");
  assert.equal(driveFileName({ vendor: "A/B: C" , date: "2026-01-02", receipt_total_cents: 5 }, "x.png"), "2026-01-02 AB C 0.05.png");
  assert.equal(driveFileName(null, "image.jpg"), "image.jpg");
  assert.equal(driveFileName({ vendor: "X" }, "image.jpg"), "image.jpg");
});
