// test/shared.test.mjs — netlify/functions/_shared.mjs's read cache
// (docs/phase2.5-spec.md: readTab/refreshTab backing getPostingCtx/getUsersByEmail/
// getJournalAll, Netlify Blobs store "books-cache").
//
// readTab/refreshTab hold no state of their own (the state lives in the books-cache
// store), so each test swaps in a fresh fake store via resetCacheStoreForTests() -
// see test/helpers/fake-cache-store.mjs - to start from a clean slate regardless of
// test order or what a previous test cached.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  readTab,
  refreshTab,
  getCacheStore,
  resetCacheStoreForTests,
  getPostingCtx,
  invalidateCtxCache,
  getJournalAll,
  invalidateJournalCache,
} from "../netlify/functions/_shared.mjs";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";

beforeEach(() => {
  resetCacheStoreForTests(makeFakeCacheStore());
});

function fakeWriter(rows, { headers = ["txn_id", "date"] } = {}) {
  let calls = 0;
  return {
    calls: () => calls,
    read: async (tab, opts) => {
      calls++;
      // readTab always asks the writer for the whole tab: Journal needs {all: true}
      // to bypass the writer's own 200-row default, every other tab already returns
      // everything with no options (apps-script/writer/Code.gs's action_read_).
      if (tab === "Journal") {
        assert.equal(opts && opts.all, true, "a Journal read must ask for all: true");
      }
      return { ok: true, headers, rows };
    },
  };
}

test("getJournalAll fetches once and caches the result", async () => {
  const writer = fakeWriter([["t1", "2026-09-01"]]);

  const first = await getJournalAll(writer);
  const second = await getJournalAll(writer);

  assert.equal(writer.calls(), 1, "a second call within the TTL should not hit the writer again");
  assert.deepEqual(first, second);
  assert.deepEqual(first, { headers: ["txn_id", "date"], rows: [["t1", "2026-09-01"]] });
});

test("invalidateJournalCache(writer) re-reads the Journal through the writer", async () => {
  const writer = fakeWriter([["t1", "2026-09-01"]]);

  await getJournalAll(writer);
  await invalidateJournalCache(writer);
  await getJournalAll(writer);

  assert.equal(writer.calls(), 2, "invalidate must refresh via the writer, then the next read is a cache hit");
});

test("invalidateJournalCache() with no writer is a no-op (nothing to refresh with)", async () => {
  const writer = fakeWriter([["t1", "2026-09-01"]]);
  await getJournalAll(writer);
  await invalidateJournalCache();
  await getJournalAll(writer);
  assert.equal(writer.calls(), 1, "no writer supplied - the cached snapshot is left alone");
});

test("{fresh: true} bypasses the cache without invalidating it for other callers", async () => {
  const writer = fakeWriter([["t1", "2026-09-01"]]);

  await getJournalAll(writer);
  await getJournalAll(writer, { fresh: true });
  const third = await getJournalAll(writer); // back to the (still valid) cache

  assert.equal(writer.calls(), 2, "fresh:true forces one extra fetch, but the cache updates from it");
  assert.deepEqual(third, { headers: ["txn_id", "date"], rows: [["t1", "2026-09-01"]] });
});

test("refreshTab always calls the writer and overwrites whatever snapshot existed", async () => {
  await getCacheStore().setJSON("tab/Settings", { fetchedAt: Date.now(), headers: ["key", "value"], rows: [["k", "old"]] });
  const writer = fakeWriter([["k", "new"]], { headers: ["key", "value"] });

  const result = await refreshTab(writer, "Settings");
  assert.equal(writer.calls(), 1);
  assert.deepEqual(result.rows, [["k", "new"]]);
  assert.deepEqual((await readTab(writer, "Settings")).rows, [["k", "new"]]);
});

test("readTab: cache miss reads through the writer and stores the snapshot", async () => {
  const writer = fakeWriter([["k", "v"]], { headers: ["key", "value"] });
  const result = await readTab(writer, "Settings");
  assert.equal(writer.calls(), 1);
  assert.deepEqual(result.rows, [["k", "v"]]);

  const stored = await getCacheStore().get("tab/Settings", { type: "json" });
  assert.ok(stored, "refreshTab must store the snapshot under tab/<tab>");
  assert.deepEqual(stored.rows, [["k", "v"]]);
  assert.ok(Number.isFinite(stored.fetchedAt));
});

test("readTab: a hit within the TTL does not call the writer again", async () => {
  const writer = fakeWriter([["k", "v"]], { headers: ["key", "value"] });
  await readTab(writer, "Settings");
  await readTab(writer, "Settings");
  assert.equal(writer.calls(), 1);
});

test("readTab: an expired snapshot re-fetches", async () => {
  const writer = fakeWriter([["k", "v2"]], { headers: ["key", "value"] });
  // Seed an already-expired snapshot directly (every non-Journal tab's TTL is 10 min).
  await getCacheStore().setJSON("tab/Settings", {
    fetchedAt: Date.now() - 11 * 60 * 1000,
    headers: ["key", "value"],
    rows: [["k", "v1"]],
  });

  const result = await readTab(writer, "Settings");
  assert.equal(writer.calls(), 1, "an expired snapshot must not be served as a hit");
  assert.deepEqual(result.rows, [["k", "v2"]]);
});

test("readTab: {fresh: true} always calls the writer, even with a fresh snapshot", async () => {
  const writer = fakeWriter([["k", "v2"]], { headers: ["key", "value"] });
  await readTab(writer, "Settings"); // populates a fresh snapshot
  const result = await readTab(writer, "Settings", { fresh: true });
  assert.equal(writer.calls(), 2);
  assert.deepEqual(result.rows, [["k", "v2"]]);
});

test("readTab: writer abort with an existing snapshot returns it with stale:true, no throw", async () => {
  await getCacheStore().setJSON("tab/Settings", {
    fetchedAt: Date.now() - 11 * 60 * 1000, // expired, so readTab will attempt a refresh
    headers: ["key", "value"],
    rows: [["k", "old"]],
  });
  const writer = { read: async () => { throw new Error("writer unreachable"); } };

  const result = await readTab(writer, "Settings");
  assert.equal(result.stale, true);
  assert.deepEqual(result.rows, [["k", "old"]]);
});

test("readTab: writer abort with no snapshot at all rethrows", async () => {
  const writer = { read: async () => { throw new Error("writer unreachable"); } };
  await assert.rejects(() => readTab(writer, "Settings"), /writer unreachable/);
});

test("readTab: since/limit/all on Journal match the writer's own action_read_ filtering", async () => {
  // Mirrors apps-script/writer/Code.gs's action_read_: since filters by date >= since,
  // then (unless all) slice to the last `limit` rows (default 200, max 20000).
  const rows = [
    ["t1", "2026-08-01"],
    ["t2", "2026-08-15"],
    ["t3", "2026-09-01"],
    ["t4", "2026-09-05"],
    ["t5", "2026-09-10"],
  ];
  const writer = fakeWriter(rows);

  const sinceOnly = await readTab(writer, "Journal", { since: "2026-09-01" });
  assert.deepEqual(sinceOnly.rows, [
    ["t3", "2026-09-01"],
    ["t4", "2026-09-05"],
    ["t5", "2026-09-10"],
  ]);

  const sinceAndLimit = await readTab(writer, "Journal", { since: "2026-09-01", limit: 2 });
  assert.deepEqual(sinceAndLimit.rows, [
    ["t4", "2026-09-05"],
    ["t5", "2026-09-10"],
  ], "limit keeps the LAST `limit` rows after the since filter");

  const allEscapeHatch = await readTab(writer, "Journal", { since: "2026-09-01", limit: 1, all: true });
  assert.deepEqual(allEscapeHatch.rows, [
    ["t3", "2026-09-01"],
    ["t4", "2026-09-05"],
    ["t5", "2026-09-10"],
  ], "all:true skips the limit slicing entirely");

  // Every shape above came from one writer call - the whole tab, cached once.
  assert.equal(writer.calls(), 1);
});

test("getPostingCtx/invalidateCtxCache(writer, tab) refreshes only the tab that was written", async () => {
  let periodsCalls = 0;
  let accountsCalls = 0;
  const writer = {
    read: async (tab) => {
      if (tab === "Accounts") { accountsCalls++; return { ok: true, headers: ["code", "active"], rows: [["1000", true]] }; }
      if (tab === "Properties") return { ok: true, headers: ["name"], rows: [["881 Newport"]] };
      if (tab === "Periods") { periodsCalls++; return { ok: true, headers: ["period", "status"], rows: [["2026-09", "open"]] }; }
      throw new Error(`unexpected tab ${tab}`);
    },
  };

  await getPostingCtx(writer);
  assert.equal(accountsCalls, 1);
  assert.equal(periodsCalls, 1);

  await invalidateCtxCache(writer, "Periods"); // e.g. after setPeriod
  assert.equal(periodsCalls, 2, "invalidateCtxCache(writer, 'Periods') must refresh Periods via the writer");
  assert.equal(accountsCalls, 1, "Accounts was not written, so it must not be refetched");

  await getPostingCtx(writer); // Accounts/Properties still within TTL, Periods just refreshed
  assert.equal(accountsCalls, 1);
  assert.equal(periodsCalls, 2);
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

test("readTab: {fresh: true} never falls back to a stale snapshot (D-012 rail)", async () => {
  const { readTab, refreshTabAfterWrite, resetCacheStoreForTests } = await import("../netlify/functions/_shared.mjs");
  const { makeFakeCacheStore } = await import("./helpers/fake-cache-store.mjs");
  const store = makeFakeCacheStore();
  resetCacheStoreForTests(store);
  await store.setJSON("tab/Journal", { fetchedAt: 0, headers: ["date"], rows: [["2026-01-01"]] });
  const dead = { read: async () => { throw new Error("writer down"); } };
  await assert.rejects(() => readTab(dead, "Journal", { fresh: true }), /writer down/);
  const stale = await readTab(dead, "Journal");
  assert.equal(stale.stale, true);

  // refreshTabAfterWrite: a failed refresh drops the snapshot instead of throwing.
  await refreshTabAfterWrite(dead, "Journal");
  assert.equal(await store.get("tab/Journal"), null);
  resetCacheStoreForTests(null);
});
