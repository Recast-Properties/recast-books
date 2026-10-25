// test/books-feed-match.test.mjs - netlify/functions/books-feed-match.mjs, the matching starter. Audit 2026-10-24 #17:
// a start while the account's run is still going joins it instead of starting a second one; a finished or stale run
// lets a new one start. The background function is never reached: fetch is stubbed.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.POLLER_SECRET = "poller-secret";
import { resetDocsStoreForTests } from "../netlify/functions/_shared.mjs";
const { default: start, jobKey, activeKey } = await import("../netlify/functions/books-feed-match.mjs");

function fakeDocsStore() {
  const items = new Map();
  return {
    items,
    get: async (k, { type } = {}) => (items.has(k) ? (type === "json" ? JSON.parse(items.get(k)) : items.get(k)) : null),
    setJSON: async (k, v) => { items.set(k, JSON.stringify(v)); },
  };
}
let store, invoked;
beforeEach(() => {
  store = fakeDocsStore();
  resetDocsStoreForTests(store);
  invoked = [];
  globalThis.fetch = async (url, options) => { invoked.push([String(url), JSON.parse(options.body)]); return { status: 202 }; };
});
const post = (body, secret = "poller-secret") => start(new Request("https://books.test/api/feed-match", {
  method: "POST", headers: { "x-poller-secret": secret, "content-type": "application/json" }, body: JSON.stringify(body),
}));

test("a start runs the job once; a second start while it is matching joins it; another account runs on its own; a finished or stale run lets a new one start", async () => {
  const r1 = await post({ account: "1401", by: "paul" });
  assert.equal(r1.status, 202);
  const { job_id } = await r1.json();
  assert.deepEqual(invoked.map((i) => i[1]), [{ job_id }], "the background job was kicked once");
  assert.equal((await store.get(jobKey(job_id), { type: "json" })).status, "matching");
  assert.equal((await store.get(activeKey("1401"), { type: "json" })).job_id, job_id);

  const r2 = await post({ account: "1401" });
  assert.equal(r2.status, 200);
  assert.deepEqual(await r2.json(), { job_id, status: "matching", joined: true });
  assert.equal(invoked.length, 1, "no second run on the account");

  const r3 = await post({ account: "1402" });
  assert.equal(r3.status, 202);
  assert.equal(invoked.length, 2, "another account is its own run");

  await store.setJSON(jobKey(job_id), { ...(await store.get(jobKey(job_id), { type: "json" })), status: "done" });
  const r4 = await post({ account: "1401" });
  assert.equal(r4.status, 202);
  assert.notEqual((await r4.json()).job_id, job_id, "the run finished: a new one");

  await store.setJSON(activeKey("1401"), { job_id: "stale-job", startedAt: new Date(Date.now() - 11 * 60000).toISOString() });
  await store.setJSON(jobKey("stale-job"), { status: "matching" });
  const r5 = await post({ account: "1401" });
  assert.equal(r5.status, 202, "a mark older than ten minutes is a run that died - not joined");
});

test("GET reads a job; a bad account, a bad secret and a bad body are refused", async () => {
  await store.setJSON(jobKey("abcdef1234"), { job_id: "abcdef1234", status: "done", summary: { total: 1 } });
  const g = await start(new Request("https://books.test/api/feed-match?job=abcdef1234", { headers: { "x-poller-secret": "poller-secret" } }));
  assert.equal(g.status, 200);
  assert.equal((await g.json()).summary.total, 1);
  assert.equal((await post({ account: "6910" })).status, 400);
  assert.equal((await post({ account: "1401" }, "wrong")).status, 401);
  const bad = await start(new Request("https://books.test/api/feed-match", { method: "POST", headers: { "x-poller-secret": "poller-secret" }, body: "{" }));
  assert.equal(bad.status, 400);
  assert.equal(invoked.length, 0);
});
