// test/books-reconcile.test.mjs — the nightly books check: code gathers the facts, the
// model (a stub here) writes the actions, the result is stored for /api/summary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";

process.env.WRITER_URL ||= "https://writer.test/exec";
process.env.WRITER_SECRET ||= "s";
process.env.POLLER_SECRET ||= "poller-secret";
process.env.ANTHROPIC_API_KEY ||= "test-key";
const { resetCacheStoreForTests } = await import("../netlify/functions/_shared.mjs");
const { gatherFacts, runCheck, default: handler, setAnthropicForTests, CHECK_PROMPT } = await import("../netlify/functions/books-reconcile-background.mjs");

const H = ["txn_id", "line", "date", "account", "debit", "credit", "property", "payee", "doc_url", "source", "posted_at", "void_of"];
const row = (id, line, date, acct, dr, cr, prop, payee, doc, src, void_of = "") => [id, line, date, acct, dr, cr, prop, payee, doc, src, "2026-09-25T10:00:00", void_of];
const JOURNAL = {
  headers: H,
  rows: [
    // a migrated row and its live twin (the 09-25 Sherwin-Williams case)
    row("migration-20260322-aaa", 1, "2026-03-22", "1030", 55.72, "", "104 Ashburne", "Sherwin-Williams", "https://d/1", "migration"),
    row("migration-20260322-aaa", 2, "2026-03-22", "1401", "", 55.72, "104 Ashburne", "Sherwin-Williams", "https://d/1", "migration"),
    row("receipt-20260322-bbb", 1, "2026-03-22", "1030", 55.72, "", "104 Ashburne", "The Sherwin Williams", "https://d/2", "receipt"),
    row("receipt-20260322-bbb", 2, "2026-03-22", "1401", "", 55.72, "104 Ashburne", "The Sherwin Williams", "https://d/2", "receipt"),
    // two migrated rows alike: the old books had both (D-027), not a finding
    row("migration-20260111-m1", 1, "2026-01-11", "1030", 14.04, "", "OVERHEAD", "Home Depot", "https://d/9", "migration"),
    row("migration-20260111-m1", 2, "2026-01-11", "1401", "", 14.04, "OVERHEAD", "Home Depot", "https://d/9", "migration"),
    row("migration-20260111-m2", 1, "2026-01-11", "1030", 14.04, "", "OVERHEAD", "Home Depot", "https://d/9", "migration"),
    row("migration-20260111-m2", 2, "2026-01-11", "1401", "", 14.04, "OVERHEAD", "Home Depot", "https://d/9", "migration"),
    // a receipt entry with no envelope and no document
    row("receipt-20260924-ccc", 1, "2026-09-24", "6510", 12.5, "", "OVERHEAD", "Anthropic", "", "receipt"),
    row("receipt-20260924-ccc", 2, "2026-09-24", "1402", "", 12.5, "OVERHEAD", "Anthropic", "", "receipt"),
    // a voided pair: neither counts
    row("receipt-20260901-ddd", 1, "2026-09-01", "1030", 9, "", "881 Newport", "Lowe's", "https://d/3", "receipt"),
    row("receipt-20260901-ddd", 2, "2026-09-01", "1401", "", 9, "881 Newport", "Lowe's", "https://d/3", "receipt"),
    row("void-20260902-eee", 1, "2026-09-02", "1030", "", 9, "881 Newport", "Lowe's", "https://d/3", "void", "receipt-20260901-ddd"),
    row("void-20260902-eee", 2, "2026-09-02", "1401", 9, "", "881 Newport", "Lowe's", "https://d/3", "void", "receipt-20260901-ddd"),
  ],
};
const NOW = Date.parse("2026-09-26T07:30:00Z");
const ENVELOPES = [
  { docId: "gm-1", status: "posted", result: { txn_ids: ["receipt-20260322-bbb"] }, model: { vendor: "Sherwin-Williams", receipt_total_cents: 5572 } },
  { docId: "gm-2", status: "posted", finishedAt: "2026-09-25T20:00:00Z", result: { txn_ids: ["receipt-20260925-zzz"] }, model: { vendor: "HILCO", receipt_total_cents: 5603 } }, // not on the Journal
  { docId: "gm-2s", status: "posted", finishedAt: "2026-09-18T09:00:00Z", result: { txn_ids: ["receipt-20260110-staging"] }, model: { vendor: "Shell" } }, // staging-era: ignored
  { docId: "gm-3", status: "posting", posting_at: "2026-09-26T04:00:00Z", model: { vendor: "Atmos" } }, // stuck 3.5 h
  { docId: "gm-4", status: "processing", startedAt: "2026-09-26T07:20:00Z" }, // 10 min: fine
  { docId: "gm-5", status: "error", receivedAt: "2026-05-01T00:00:00Z", subject: "HD 87.64", error: "writer read timed out" },
  { docId: "gm-6", status: "pending", finishedAt: "2026-09-23T12:00:00Z", model: { vendor: "Home Depot" } },
  { docId: "dry-7", status: "pending", dryRun: true },
];

test("gatherFacts: envelope/Journal disagreement both ways, duplicates across sources, missing documents, stuck, errors, queue, balance", () => {
  const f = gatherFacts(JOURNAL, ENVELOPES, NOW);
  assert.equal(f.journal_rows, 14);
  assert.equal(f.live_entries, 5, "the voided receipt and its void are not live");
  assert.deepEqual(f.balance, { debits: "170.02", credits: "170.02", balanced: true });
  assert.deepEqual(f.envelope_not_on_journal, [{ docId: "gm-2", vendor: "HILCO", total: "56.03", missing: ["receipt-20260925-zzz"] }]);
  assert.deepEqual(f.journal_not_in_envelopes.map((e) => e.txn_id), ["receipt-20260924-ccc"]);
  assert.equal(f.possible_duplicates.length, 1, "the migration-vs-migration pair is not a finding");
  assert.deepEqual(f.possible_duplicates[0].entries, ["migration-20260322-aaa (migration, 104 Ashburne)", "receipt-20260322-bbb (receipt, 104 Ashburne)"]);
  assert.match(CHECK_PROMPT, /Pending cards are holds/);
  assert.deepEqual(f.receipts_without_document.map((e) => e.txn_id), ["receipt-20260924-ccc"]);
  assert.deepEqual(f.stuck.map((e) => e.docId), ["gm-3"]);
  assert.deepEqual(f.errors.map((e) => [e.docId, e.received]), [["gm-5", "2026-05-01"]]);
  assert.deepEqual(f.pending, { count: 1, oldest: "2026-09-23T12:00:00Z" });
});

function fakes() {
  const cache = makeFakeCacheStore();
  resetCacheStoreForTests(cache);
  const writer = { read: async () => ({ ok: true, ...JOURNAL }) };
  const docsStore = {
    list: async () => ({ blobs: ENVELOPES.map((e) => ({ key: `doc/${e.docId}` })) }),
    get: async (k) => ENVELOPES.find((e) => `doc/${e.docId}` === k) || null,
  };
  return { cache, writer, docsStore };
}

test("runCheck: the model gets the facts with no tools, its text is stored under the date and as latest", async () => {
  const { cache, writer, docsStore } = fakes();
  let seen;
  const anthropic = { beta: { messages: { create: async (params) => { seen = params; return { stop_reason: "end_turn", model: "m", usage: { input_tokens: 900, output_tokens: 80 }, content: [{ type: "text", text: "- Void receipt-20260322-bbb - twin of migration-20260322-aaa (Sherwin-Williams 03-22 55.72)" }] }; } } } };
  const check = await runCheck({ writer, docsStore, cacheStore: cache, anthropic, now: NOW });
  assert.equal(seen.tools, undefined);
  assert.match(seen.messages[0].content, /receipt-20260322-bbb/);
  assert.equal(check.error, "");
  assert.match(check.text, /^- Void receipt-20260322-bbb/);
  assert.equal(check.date, "2026-09-26");
  const latest = await cache.get("reconcile/latest", { type: "json" });
  assert.equal(latest.text, check.text);
  assert.ok(await cache.get("reconcile/2026-09-26", { type: "json" }));
});

test("runCheck: a failed model call is stored as an error, never thrown; the HTTP wrapper needs the poller secret", async () => {
  const { cache, writer, docsStore } = fakes();
  const anthropic = { beta: { messages: { create: async () => { throw new Error("overloaded"); } } } };
  const check = await runCheck({ writer, docsStore, cacheStore: cache, anthropic, now: NOW });
  assert.match(check.error, /overloaded/);
  assert.equal(check.text, "");
  setAnthropicForTests(anthropic);
  const res = await handler(new Request("https://books.test/api/reconcile-bg", { method: "POST", body: "{}" }));
  assert.equal(res.status, 401);
});

test("the prompt tells the model which fixes are Paul's clicks and which get a 'Paste to Claude' line", async () => {
  const { CHECK_PROMPT } = await import("../netlify/functions/books-reconcile-background.mjs");
  assert.match(CHECK_PROMPT, /Paste to Claude:/);
  assert.match(CHECK_PROMPT, /void \(workbook menu\), approve \/ dismiss \/ reprocess \(Inbox\)/);
});
