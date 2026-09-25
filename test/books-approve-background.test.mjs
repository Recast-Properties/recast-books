// test/books-approve-background.test.mjs — the background half of approve: files, posts,
// writes the envelope; a lost reply is confirmed on the Journal; a refusal goes back to
// pending with the reason. Fake writer, fake stores, no HTTP.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";
import { WriterError } from "../lib/writer-client.mjs";

process.env.WRITER_URL ||= "https://writer.test/exec";
process.env.WRITER_SECRET ||= "s";
process.env.POLLER_SECRET ||= "poller-secret";
const { resetCacheStoreForTests } = await import("../netlify/functions/_shared.mjs");
const { runApprove, default: handler } = await import("../netlify/functions/books-approve-background.mjs");

const ENTRY = { txn_id: "manual-20260910-abc-1234", date: "2026-09-10", payee: "Home Depot", memo: "drywall", lines: [{ account: "1030", debit: 4500 }, { account: "1401", credit: 4500 }] };

function memStore(env) {
  const items = new Map([[`doc/${env.docId}`, JSON.stringify(env)], ["att/gm-1/0", Buffer.from("hi").toString("base64")]]);
  return {
    items,
    get: async (k, { type } = {}) => (items.has(k) ? (type === "json" ? JSON.parse(items.get(k)) : items.get(k)) : null),
    setJSON: async (k, v) => { items.set(k, JSON.stringify(v)); },
    set: async (k, v) => { items.set(k, String(v)); },
    delete: async (k) => { items.delete(k); },
  };
}
function envelope(over = {}) {
  return { docId: "gm-1", status: "posting", posting_at: new Date().toISOString(), posting_entries: [{ ...ENTRY }], attachments: [{ name: "r.jpg", mime: "image/jpeg" }], gate: { passed: false, reasons: ["LOW_CONFIDENCE"] }, result: null, model: { vendor: "Home Depot", date: "2026-09-10", receipt_total_cents: 4500 }, ...over };
}
function fakeWriter({ post } = {}) {
  const calls = [];
  return {
    calls,
    storeDocument: async (name, mime, b64, folder) => { calls.push(["storeDocument", name, folder]); return { fileId: "f1", url: "https://drive/f1" }; },
    postBatch: async (entries) => { calls.push(["postBatch", entries]); if (post) return post(entries); return { ok: true, rows: [10, 11] }; },
    read: async (tab) => { calls.push(["read", tab]); return { ok: true, headers: ["txn_id", "date"], rows: [[ENTRY.txn_id, ENTRY.date]] }; },
  };
}
const args = (docsStore, writer) => ({ docId: "gm-1", writer, docsStore, folder: ["2026", "881 Newport"], folderModel: { vendor: "Home Depot", date: "2026-09-10", receipt_total_cents: 4500 }, by: "paul@recast-properties.com", note: "ok" });

beforeEach(() => resetCacheStoreForTests(makeFakeCacheStore()));

test("files to Drive, posts with the doc_url, marks posted with the review", async () => {
  const store = memStore(envelope());
  const writer = fakeWriter();
  const res = await runApprove(args(store, writer));
  assert.deepEqual(res, { ok: true, txn_ids: [ENTRY.txn_id] });
  const filed = writer.calls.find((c) => c[0] === "storeDocument");
  assert.equal(filed[1], "2026-09-10 Home Depot 45.00.jpg");
  assert.deepEqual(filed[2], ["2026", "881 Newport"]);
  const posted = writer.calls.find((c) => c[0] === "postBatch");
  assert.equal(posted[1][0].doc_url, "https://drive/f1");
  const env = await store.get("doc/gm-1", { type: "json" });
  assert.equal(env.status, "posted");
  assert.deepEqual(env.result, { txn_ids: [ENTRY.txn_id], rows: [10, 11], doc_url: "https://drive/f1" });
  assert.equal(env.review.by, "paul@recast-properties.com");
  assert.equal(env.posting_entries, undefined);
  assert.ok(writer.calls.some((c) => c[0] === "read" && c[1] === "Journal"), "the Journal snapshot is refreshed after the post");
});

test("a lost postBatch reply is confirmed on the Journal and recorded as posted", async () => {
  const store = memStore(envelope({ attachments: [] }));
  const writer = fakeWriter({ post: () => { throw new WriterError("REDIRECT_MISFIRE", "lost"); } });
  const res = await runApprove(args(store, writer));
  assert.equal(res.ok, true);
  const env = await store.get("doc/gm-1", { type: "json" });
  assert.equal(env.status, "posted");
  assert.equal(env.result.rows, null);
});

test("a refused post goes back to pending with the writer's reason on the card", async () => {
  const store = memStore(envelope({ attachments: [] }));
  const writer = fakeWriter({ post: () => { throw new WriterError("DUPLICATE", "already posted"); } });
  const res = await runApprove(args(store, writer));
  assert.equal(res.ok, false);
  const env = await store.get("doc/gm-1", { type: "json" });
  assert.equal(env.status, "pending");
  assert.equal(env.posting_entries, undefined);
  assert.match(env.gate.reasons.at(-1), /approve failed: DUPLICATE/);
});

test("an envelope that is not posting is refused; the HTTP wrapper needs the poller secret", async () => {
  const store = memStore(envelope({ status: "pending", posting_entries: undefined }));
  const res = await runApprove(args(store, fakeWriter()));
  assert.equal(res.ok, false);
  const http = await handler(new Request("https://books.test/api/approve-bg", { method: "POST", body: JSON.stringify({ docId: "gm-1" }) }));
  assert.equal(http.status, 401);
});
