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
const { gatherFacts, runCheck, default: handler, setAnthropicForTests, CHECK_PROMPT, CHECK_TOOLS, checkTools } = await import("../netlify/functions/books-reconcile-background.mjs");

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

  // one lawn invoice, the same amount for two yards: a split of one document, not a duplicate
  const doc = "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view";
  const lawn = (id, prop) => [row(id, 1, "2026-09-30", "1130", 110, "", prop, "Falcon Creek Lawn Care", doc, "receipt"), row(id, 2, "2026-09-30", "1401", "", 110, prop, "Falcon Creek Lawn Care", doc, "receipt")];
  const split = gatherFacts({ headers: H, rows: [...JOURNAL.rows, ...lawn("receipt-20260930-bg", "136 Bowling Green"), ...lawn("receipt-20260930-np", "881 Newport")] }, ENVELOPES, NOW);
  assert.equal(split.possible_duplicates.length, 1, "the two yards are not a finding");
  const twice = gatherFacts({ headers: H, rows: [...JOURNAL.rows, ...lawn("receipt-20260930-bg", "881 Newport"), ...lawn("receipt-20260930-np", "881 Newport")] }, ENVELOPES, NOW);
  assert.equal(twice.possible_duplicates.length, 2, "the same yard twice still is");

  // two 1.00 ATM fees on one day, each from its own bank line: two charges, not a double (2026-10-07)
  const fee = (id, src) => [row(id, 1, "2026-10-07", "6910", 1, "", "OVERHEAD", "Recast Citizens - Shared", "", src), row(id, 2, "2026-10-07", "1401", "", 1, "OVERHEAD", "Recast Citizens - Shared", "", src)];
  const fees = gatherFacts({ headers: H, rows: [...JOURNAL.rows, ...fee("bank-1401-a", "bank"), ...fee("bank-1401-b", "bank")] }, ENVELOPES, NOW);
  assert.equal(fees.possible_duplicates.length, 1, "two bank lines are two charges");
  const feeAndReceipt = gatherFacts({ headers: H, rows: [...JOURNAL.rows, ...fee("bank-1401-a", "bank"), ...fee("receipt-20261007-x", "receipt")] }, ENVELOPES, NOW);
  assert.equal(feeAndReceipt.possible_duplicates.length, 2, "a bank line beside a receipt still is");
  assert.doesNotMatch(CHECK_PROMPT, /Say "check"/);
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

test("runCheck: the model gets the facts and the look-up and fix tools, its text is stored under the date and as latest", async () => {
  const { cache, writer, docsStore } = fakes();
  let seen;
  const anthropic = { beta: { messages: { create: async (params) => { seen = params; return { stop_reason: "end_turn", model: "m", usage: { input_tokens: 900, output_tokens: 80 }, content: [{ type: "text", text: "- Void receipt-20260322-bbb - twin of migration-20260322-aaa (Sherwin-Williams 03-22 55.72)" }] }; } } } };
  const check = await runCheck({ writer, docsStore, cacheStore: cache, anthropic, now: NOW });
  assert.deepEqual(seen.tools.map((t) => t.name), ["bank_lines", "entries", "documents", "take_out_double", "point_receipt_at_entries", "file_missing_receipt", "read_again"]);
  assert.match(seen.messages[0].content[0].text, /receipt-20260322-bbb/);
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

test("receipts_on_no_book: a receipt every copy of which points at something not on the books is flagged; carried, settled, voided or not-a-cost ones are not", () => {
  // Paul, 2026-09-26: "how do we know if there are other like it?" - 161 documents had been dismissed as
  // duplicates of staging-only entries; each must still land somewhere on the books.
  const env = (docId, status, model, extra = {}) => ({ docId, status, model: { receipt_total_cents: 0, ...model }, result: { txn_ids: [] }, ...extra });
  const record = { links: { "gm-carried": ["migration-20260111-m1"], "gm-hf-a": ["migration-gone"] }, settled: ["gm-ride"] };
  const docs = [
    env("gm-lost", "dismissed", { vendor: "Harbor Freight", date: "2026-03-19", receipt_total_cents: 40267, duplicate_of: "receipt-20260319-staging" }),
    env("gm-carried", "dismissed", { vendor: "Home Depot", date: "2026-01-11", receipt_total_cents: 1404, duplicate_of: "receipt-20260111-staging" }),
    env("gm-copy", "dismissed", { vendor: "The Home Depot", date: "2026-01-11", receipt_total_cents: 1404 }, { review: { by: "paul@recast-properties.com", note: "Duplicate" } }),
    env("gm-top-a", "posted", { vendor: "Anthropic", date: "2026-09-24", receipt_total_cents: 1250, invoice_number: "2540-4444-8353" }, { result: { txn_ids: ["receipt-20260924-ccc"] } }),
    env("gm-top-b", "dismissed", { vendor: "Anthropic", date: "2026-09-24", receipt_total_cents: 1250, invoice_number: "2540-4444-8354", duplicate_of: "receipt-20260924-staging" }),
    env("gm-eats", "dismissed", { vendor: "Uber Eats", date: "2026-05-04", receipt_total_cents: 5965, why: "Uber Eats food-delivery order - not a business expense" }),
    env("gm-ride", "dismissed", { vendor: "Uber", date: "2026-03-17", receipt_total_cents: 1399, why: "a ride [rule: dismissed by migration rule]" }),
    env("gm-ruled", "dismissed", { vendor: "Uber", date: "2026-03-18", receipt_total_cents: 1413, why: "a ride [rule: dismissed by migration rule]" }),
    env("gm-voided", "posted", { vendor: "Lowe's", date: "2026-09-01", receipt_total_cents: 900 }, { result: { txn_ids: ["receipt-20260901-ddd"] } }),
    env("gm-second", "dismissed", { vendor: "Sherwin-Williams", date: "2026-03-21", receipt_total_cents: 5500 }, { review: { by: "workbook", note: "Migration leftover (audit §55): already settled by the 2026-09-21 migration - a second copy of gm-1, which carries the Journal link" } }),
  ];
  const f = gatherFacts(JOURNAL, [...ENVELOPES, ...docs], NOW, record);
  assert.deepEqual(f.receipts_on_no_book.map((r) => `${r.vendor} ${r.total}`), ["Harbor Freight 402.67", "Anthropic 12.50", "Uber 14.13"],
    "lost; a second top-up with its own receipt number; a ruled dismissal with no recorded decision");
  assert.match(f.receipts_on_no_book[0].copies[0], /named receipt-20260319-staging as the original - not on the books/);
  assert.match(CHECK_PROMPT, /receipts_on_no_book/);

  // its migrated row was voided: a double taken out on purpose (the Atmos 141.59 of 2026-10-01), not a loss
  assert.equal(gatherFacts(JOURNAL, [...ENVELOPES, ...docs], NOW, { ...record, links: { ...record.links, "gm-lost": ["receipt-20260901-ddd"] } })
    .receipts_on_no_book.some((r) => r.vendor === "Harbor Freight"), false);

  // its own migrated row puts it back on the books
  assert.equal(gatherFacts(JOURNAL, [...ENVELOPES, ...docs], NOW, { ...record, links: { ...record.links, "gm-lost": ["migration-20260322-aaa"] } })
    .receipts_on_no_book.some((r) => r.vendor === "Harbor Freight"), false);
});

test("lib/migration-record.mjs is generated from the migration data (run scripts/build-migration-record.mjs)", async () => {
  const { MIGRATION_RECORD } = await import("../lib/migration-record.mjs");
  const { buildRecord } = await import("../scripts/build-migration-record.mjs");
  assert.deepEqual(MIGRATION_RECORD, buildRecord());
  assert.ok(Object.keys(MIGRATION_RECORD.links).length > 600 && MIGRATION_RECORD.settled.includes("gm-19cfc795423b2590"));
});

test("the prompt tells the model which fixes are Paul's clicks and which get a 'Paste to Claude' line", async () => {
  const { CHECK_PROMPT } = await import("../netlify/functions/books-reconcile-background.mjs");
  assert.match(CHECK_PROMPT, /"For Claude:"/);
  assert.doesNotMatch(CHECK_PROMPT, /Paste to Claude/);
  assert.match(CHECK_PROMPT, /approve or dismiss a card \(Inbox\)/);
  assert.match(CHECK_PROMPT, /Taking out a double and re-reading a failed document are your fixes, not his clicks/);
});

test("D-057: charges waiting on a receipt are listed by code under the check, oldest first, and are not 'receipts without a document'", async () => {
  const { waitingOnReceipts } = await import("../netlify/functions/books-reconcile-background.mjs");
  const HD = [...H, "description"];
  const line = (id, n, date, acct, dr, cr, prop, payee, src, description, void_of = "") => [id, n, date, acct, dr, cr, prop, payee, "", src, "2026-09-29T10:00:00", void_of, description];
  const journal = { headers: HD, rows: [
    line("receipt-w2", 1, "2026-09-28", "1030", 33.07, "", "469 Brushwood", "THE HOME DEPOT #6505 W", "receipt", "NEED RECEIPT FROM DENNIS"),
    line("receipt-w2", 2, "2026-09-28", "1401", "", 33.07, "469 Brushwood", "THE HOME DEPOT #6505 W", "receipt", ""),
    line("receipt-w1", 1, "2026-09-21", "1030", 162.91, "", "366 Mesa", "THE HOME DEPOT #6505 W", "receipt", "NEED RECEIPT FROM DENNIS"),
    line("receipt-w1", 2, "2026-09-21", "1401", "", 162.91, "366 Mesa", "THE HOME DEPOT #6505 W", "receipt", ""),
    // its receipt came in: the placeholder was voided, so it is not waiting any more
    line("receipt-w0", 1, "2026-09-14", "1030", 50, "", "366 Mesa", "LOWES #02601", "receipt", "NEED RECEIPT FROM PAUL"),
    line("receipt-w0", 2, "2026-09-14", "1401", "", 50, "366 Mesa", "LOWES #02601", "receipt", ""),
    line("void-receipt-w0", 1, "2026-09-14", "1030", "", 50, "366 Mesa", "LOWES #02601", "void", "NEED RECEIPT FROM PAUL", "receipt-w0"),
    line("void-receipt-w0", 2, "2026-09-14", "1401", 50, "", "366 Mesa", "LOWES #02601", "void", "", "receipt-w0"),
    line("receipt-plain", 1, "2026-09-20", "1030", 12, "", "366 Mesa", "Ace", "receipt", "screws"),
    line("receipt-plain", 2, "2026-09-20", "1401", "", 12, "366 Mesa", "Ace", "receipt", ""),
  ] };
  assert.equal(waitingOnReceipts(journal), [
    "Waiting on receipts (2, $195.98) - recorded from the bank statement, no receipt yet:",
    "- Dennis: THE HOME DEPOT #6505 W, 09-21, $162.91, 366 Mesa",
    "- Dennis: THE HOME DEPOT #6505 W, 09-28, $33.07, 469 Brushwood",
  ].join("\n"));
  assert.equal(waitingOnReceipts(JOURNAL), "");
  const f = gatherFacts(journal, [], NOW);
  assert.deepEqual(f.receipts_without_document.map((e) => e.txn_id), ["receipt-plain"]);

  // the 3 AM email prints the list under the model's bullets, even when the check is clean
  const { cache, docsStore } = fakes();
  const writer = { read: async () => ({ ok: true, headers: journal.headers, rows: journal.rows }) };
  const anthropic = { beta: { messages: { create: async () => ({ stop_reason: "end_turn", model: "m", usage: {}, content: [{ type: "text", text: "Books check: clean." }] }) } } };
  const check = await runCheck({ writer, docsStore, cacheStore: cache, anthropic, now: NOW });
  assert.match(check.text, /^Books check: clean\.\nWaiting on receipts \(2, \$195\.98\)/);
});

test("audit 2026-10-24 #2d gatherFacts reads the Feed tab: proposed lines with no card, lines tied to a voided or missing entry, lines open over ten days", () => {
  const FH = ["feed_id", "account", "date", "amount", "name", "memo", "status", "txn_id"];
  const feed = { headers: FH, rows: [
    ["A", "1401", "2026-09-20", -52.85, "1315 HWY 77", "", "proposed", ""],              // its card is gone
    ["B", "1401", "2026-09-21", -3.14, "Home Depot", "", "proposed", ""],                // its card is waiting: fine
    ["C", "1401", "2026-09-01", -9, "Lowe's", "", "matched", "receipt-20260901-ddd"],     // voided entry
    ["D", "1401", "2026-09-02", -5, "X", "", "matched", "receipt-nowhere"],               // not on the Journal
    ["E", "1401", "2026-09-22", -55.72, "SW", "", "matched", "receipt-20260322-bbb"],     // live: fine
    ["F", "1401", "2026-09-10", -230, "ROCKETT SPECIAL UTILIT", "", "unmatched", ""],     // 16 days open
    ["G", "1401", "2026-09-24", -16.25, "AMAZON", "", "unmatched", ""],                   // 2 days: fine
  ] };
  const envelopes = [...ENVELOPES, { docId: "feed-1401-B", source: "feed", status: "pending", feed: { feed_ids: ["B"] } }, { docId: "feed-1401-A", source: "feed", status: "posted", feed: { feed_ids: ["A"] } }];
  const f = gatherFacts(JOURNAL, envelopes, NOW, undefined, feed);
  assert.deepEqual(f.bank_lines.proposed_without_card.map((l) => l.feed_id), ["A"]);
  assert.deepEqual(f.bank_lines.tied_to_missing_entry.map((l) => [l.feed_id, l.txn_id]), [["C", "receipt-20260901-ddd"], ["D", "receipt-nowhere"]]);
  assert.deepEqual(f.bank_lines.open_over_10_days.map((l) => [l.feed_id, l.amount, l.text]), [["F", "-230.00", "ROCKETT SPECIAL UTILIT"]]);
  assert.equal(gatherFacts(JOURNAL, ENVELOPES, NOW).bank_lines, undefined, "no Feed tab, no bank facts - never a crash");
  assert.match(CHECK_PROMPT, /bank_lines/, "the check knows what the bank facts are");
});

test("audit 2026-10-24 #10c: a quiet mail poller is a fact with a 'For Claude' line; a live one adds nothing", () => {
  const quiet = gatherFacts(JOURNAL, ENVELOPES, NOW, undefined, null, { paul: { at: new Date(NOW - 5 * 3600000).toISOString() } });
  assert.match(quiet.mail_poller_quiet, /not checked paul@'s mail for 5 hours.*For Claude/);
  const live = gatherFacts(JOURNAL, ENVELOPES, NOW, undefined, null, { paul: { at: new Date(NOW - 10 * 60000).toISOString() } });
  assert.equal(live.mail_poller_quiet, undefined);
  assert.equal(gatherFacts(JOURNAL, ENVELOPES, NOW).mail_poller_quiet, undefined, "no heartbeat given (older callers) - no fact");
});

test("2026-10-26: the model's 'For Claude:' section is stored as `claude`, never in Paul's text; nothing for Paul reads so", async () => {
  const { splitForClaude } = await import("../netlify/functions/books-reconcile-background.mjs");
  assert.deepEqual(splitForClaude("- Approve the Atmos $67.39 card.\nFor Claude:\n- mark envelope gm-1 posted, its entries receipt-2 are on the Journal.\n- run Match statement lines on 1401."),
    { paul: "- Approve the Atmos $67.39 card.", claude: "- mark envelope gm-1 posted, its entries receipt-2 are on the Journal.\n- run Match statement lines on 1401." });
  assert.deepEqual(splitForClaude("For Claude:\n- find where Amazon 10-12 $263.74 landed."), { paul: "Books check: nothing for you to do.", claude: "- find where Amazon 10-12 $263.74 landed." });
  assert.deepEqual(splitForClaude("Books check: clean."), { paul: "Books check: clean.", claude: "" });
});

// ---- 2026-10-27: the check looks things up and fixes what it can (Paul: "fix what it can on its own, and tell me in
// the morning email what it fixed"). Each fix is shown with the case that taught it.
const HM = [...H, "memo"];
const ln = (id, n, date, acct, dr, cr, prop, payee, src, doc = "", void_of = "") => [id, n, date, acct, dr, cr, prop, payee, doc, src, "2026-10-01T10:00:00", void_of, ""];
const NIGHT = { headers: HM, rows: [
  // the USPS mailbox key of 01-02: once from Paul's sheet, once from his phone picture - a real double
  ln("migration-usps", 1, "2026-01-02", "1030", 40, "", "1014 S View", "USPS", "migration"), ln("migration-usps", 2, "2026-01-02", "2030", "", 40, "1014 S View", "USPS", "migration"),
  ln("manual-usps", 1, "2026-01-02", "6500", 40, "", "OVERHEAD", "USPS", "manual"), ln("manual-usps", 2, "2026-01-02", "2030", "", 40, "OVERHEAD", "USPS", "manual"),
  // Home Depot 7.56 of 05-29: a purchase and its return - the money moved the other way, never a double
  ln("migration-hd", 1, "2026-05-29", "1030", 7.56, "", "1616 Granite", "Home Depot", "migration"), ln("migration-hd", 2, "2026-05-29", "2030", "", 7.56, "1616 Granite", "Home Depot", "migration"),
  ln("manual-hd", 1, "2026-05-29", "2030", 7.56, "", "Cost Recapture", "The Home Depot", "manual"), ln("manual-hd", 2, "2026-05-29", "1030", "", 7.56, "Cost Recapture", "The Home Depot", "manual"),
  // the two 1.00 ATM fees of 10-07, each from its own bank line
  ln("bank-1401-a", 1, "2026-10-07", "6910", 1, "", "OVERHEAD", "Recast Citizens - Shared", "bank"), ln("bank-1401-a", 2, "2026-10-07", "1401", "", 1, "OVERHEAD", "Recast Citizens - Shared", "bank"),
  ln("bank-1401-b", 1, "2026-10-07", "6910", 1, "", "OVERHEAD", "Recast Citizens - Shared", "bank"), ln("bank-1401-b", 2, "2026-10-07", "1401", "", 1, "OVERHEAD", "Recast Citizens - Shared", "bank"),
  // the Amazon email of 10-12 (263.74): its two orders are in the books from the bank cards
  ln("receipt-lights", 1, "2026-10-12", "1030", 197.88, "", "413 Green Acres", "Amazon", "receipt", "https://drive.google.com/file/d/1LightsAndFansAbCdEfGhIj/view"), ln("receipt-lights", 2, "2026-10-12", "1402", "", 197.88, "413 Green Acres", "Amazon", "receipt"),
  ln("receipt-towels", 1, "2026-10-13", "1030", 65.86, "", "136 Bowling Green", "Amazon", "receipt", "https://drive.google.com/file/d/1TowelBarsAbCdEfGhIjKlMn/view"), ln("receipt-towels", 2, "2026-10-13", "1402", "", 65.86, "136 Bowling Green", "Amazon", "receipt"),
  // Lupe's 300 of 10-12: posted, its screenshot never filed
  ln("receipt-lupe", 1, "2026-10-12", "1020", 300, "", "658 Erin Hills", "Lupe Carpet Guy", "receipt"), ln("receipt-lupe", 2, "2026-10-12", "1401", "", 300, "658 Erin Hills", "Lupe Carpet Guy", "receipt"),
] };
const FEED = { headers: ["feed_id", "account", "date", "amount", "name", "memo", "status", "txn_id", "match_note"], rows: [
  ["553324046", "1401", "2026-10-07", -1, "FOREIGN ATM CHARGE", "FOREIGN ATM CHARGE SUPL CD 11", "matched", "bank-1401-a", ""],
  ["553362798", "1401", "2026-10-07", -163, "Withdrawal 416 W JEFFERSON PALMER TX", "", "matched", "", ""],
  ["553378354", "1401", "2026-10-07", -1, "FOREIGN ATM CHARGE", "FOREIGN ATM CHARGE SUPL CD 11", "matched", "bank-1401-b", ""],
] };
const NIGHT_DOCS = () => [
  { docId: "gm-amazon", status: "dismissed", receivedAt: "2026-10-12T15:00:00Z", model: { vendor: "Amazon.com", date: "2026-10-12", receipt_total_cents: 26374, duplicate_of: "receipt-never-landed" }, result: { txn_ids: [] } },
  { docId: "gm-lupe", status: "posted", receivedAt: "2026-10-12T20:00:00Z", model: { vendor: "Lupe Carpet Guy", date: "2026-10-12", receipt_total_cents: 30000 }, result: { txn_ids: ["receipt-lupe"], doc_url: "" },
    attachments: [{ key: "att/gm-lupe/0", name: "Screenshot.png", mime: "image/png" }] },
  { docId: "gm-photo", status: "error", receivedAt: "2026-10-11T18:00:00Z", error: "400 invalid_request_error image.source.base64.data" },
  { docId: "gm-old", status: "error", receivedAt: "2026-05-01T00:00:00Z", error: "writer read timed out" },
];
function nightFakes() {
  const docs = new Map(NIGHT_DOCS().map((e) => [`doc/${e.docId}`, e]));
  docs.set("att/gm-lupe/0", "iVBORw0KGgo=");
  const calls = [];
  const writer = {
    read: async (tab) => ({ ok: true, ...(tab === "Feed" ? FEED : NIGHT) }),
    void: async (txn_id, reason, date, by) => { calls.push(["void", txn_id, date, by]); return { ok: true, txn_id: `void-${txn_id}` }; },
    feedRetie: async (...a) => { calls.push(["feedRetie", ...a]); return { ok: true }; },
    storeDocument: async (name, mime, b64, folder) => { calls.push(["storeDocument", name, folder.join("/")]); return { ok: true, fileId: "f1", url: "https://drive.google.com/file/d/1LupeScreenshotAbCdEfGhIj/view" }; },
    setDocUrl: async (ids, url) => { calls.push(["setDocUrl", ids.join(), url]); return { ok: true }; },
  };
  const docsStore = {
    list: async () => ({ blobs: [...docs.keys()].filter((k) => k.startsWith("doc/")).map((key) => ({ key })) }),
    get: async (k) => docs.get(k) ?? null,
    setJSON: async (k, v) => { docs.set(k, v); },
  };
  return { docs, calls, writer, docsStore };
}
const nightTools = (f, extra = {}) => {
  const envelopes = [...f.docs.entries()].filter(([k]) => k.startsWith("doc/")).map(([, v]) => v);
  return checkTools({ journal: NIGHT, feed: FEED, envelopes, facts: gatherFacts(NIGHT, envelopes, NOW_1027, MIGRATION_RECORD_EMPTY, FEED), writer: f.writer, docsStore: f.docsStore, now: NOW_1027, ...extra });
};
const NOW_1027 = Date.parse("2026-10-27T08:00:00Z");
const MIGRATION_RECORD_EMPTY = { links: {}, settled: [] };

test("the check's look-ups: the bank's own lines show two ATM fees, one per withdrawal; entries and documents answer by id or by date and amount", async () => {
  const t = nightTools(nightFakes());
  const bank = JSON.parse((await t.run("bank_lines", { date: "2026-10-07", days: 0, account: "1401" })).content[0].text);
  assert.deepEqual(bank.map((l) => [l.feed_id, l.amount]), [["553324046", "-1"], ["553362798", "-163"], ["553378354", "-1"]]);
  const lines = JSON.parse((await t.run("entries", { txn_ids: ["manual-usps"], date: null, amount_cents: null, payee: null })).content[0].text);
  assert.deepEqual(lines.map((l) => [l.account, l.debit, l.credit]), [["6500", "40", ""], ["2030", "", "40"]]);
  const near = JSON.parse((await t.run("entries", { txn_ids: null, date: "2026-10-12", amount_cents: 19788, payee: null })).content[0].text);
  assert.deepEqual(near.map((e) => e.txn_id), ["receipt-lights"]);
  const doc = JSON.parse((await t.run("documents", { docIds: ["gm-amazon"], vendor: null, amount_cents: null, date: null })).content[0].text);
  assert.equal(doc[0].read.total, "263.74");
  assert.deepEqual(t.fixed, []);
});

test("take_out_double: the USPS key's phone-picture copy goes, on its own date, and his sheet's row stays; a return, two bank lines and an old-books row are refused", async () => {
  const f = nightFakes(), t = nightTools(f);
  const plain = "Took out the second $40.00 USPS mailbox key from 01-02 - it was in the books twice; the one on 1014 S View stays.";
  const refusedFor = async (input) => { const r = await t.run("take_out_double", { plain, ...input }); assert.equal(r.ok, false); return r.error; };
  assert.match(await refusedFor({ txn_id: "migration-usps", keep_txn_id: "manual-usps" }), /old books' row is the one kept/);
  assert.match(await refusedFor({ txn_id: "manual-hd", keep_txn_id: "migration-hd" }), /money moved differently/);
  assert.match(await refusedFor({ txn_id: "bank-1401-b", keep_txn_id: "bank-1401-a" }), /each is tied to its own bank line/);
  assert.match(await refusedFor({ txn_id: "manual-usps", keep_txn_id: "migration-usps", plain: "Voided manual-usps-000000" }), /no ids/);
  assert.equal(f.calls.length, 0, "nothing written by a refusal");
  const ok = await t.run("take_out_double", { txn_id: "manual-usps", keep_txn_id: "migration-usps", plain });
  assert.equal(ok.ok, true);
  assert.deepEqual(f.calls, [["void", "manual-usps", "2026-01-02", "claude"]]);
  assert.deepEqual(t.fixed.map((x) => [x.fix, x.plain]), [["take_out_double", plain]]);
  assert.match(await refusedFor({ txn_id: "manual-usps", keep_txn_id: "migration-usps" }), /must be live/, "not twice in one night");
  assert.equal(t.refused.length, 5);
});

test("point_receipt_at_entries: the Amazon 263.74 is recorded as the 197.88 and the 65.86 - to the cent, or refused", async () => {
  const f = nightFakes(), t = nightTools(f);
  const plain = "Found the Amazon order of 10-12 for $263.74 - it is in the books as the lights and fans and the towel bars.";
  const short = await t.run("point_receipt_at_entries", { docId: "gm-amazon", txn_ids: ["receipt-lights"], plain });
  assert.match(short.error, /add up to 197\.88, the receipt says 263\.74/);
  assert.match((await t.run("point_receipt_at_entries", { docId: "gm-lupe", txn_ids: ["receipt-lupe"], plain })).error, /not on tonight's receipts_on_no_book/);
  const ok = await t.run("point_receipt_at_entries", { docId: "gm-amazon", txn_ids: ["receipt-lights", "receipt-towels"], plain });
  assert.equal(ok.ok, true);
  const env = f.docs.get("doc/gm-amazon");
  assert.equal(env.status, "dismissed");
  assert.match(env.review.note, /^its row is in the Journal: receipt-lights and receipt-towels/);
  // the next night's facts read it as accounted for
  assert.equal(gatherFacts(NIGHT, [env], NOW_1027, MIGRATION_RECORD_EMPTY).receipts_on_no_book.length, 0);
});

test("file_missing_receipt: Lupe's screenshot is filed under the house and linked; a document already filed is only linked", async () => {
  const f = nightFakes(), t = nightTools(f);
  const plain = "Attached the screenshot to Lupe Carpet Guy's $300.00 of 10-12 - it had never been filed.";
  assert.match((await t.run("file_missing_receipt", { txn_id: "receipt-lupe", docId: "gm-amazon", plain })).error, /did not post this entry/);
  assert.equal((await t.run("file_missing_receipt", { txn_id: "receipt-lupe", docId: "gm-lupe", plain })).ok, true);
  assert.deepEqual(f.calls, [["storeDocument", "2026-10-12 Lupe Carpet Guy 300.00.png", "2026/658 Erin Hills"],
    ["setDocUrl", "receipt-lupe", "https://drive.google.com/file/d/1LupeScreenshotAbCdEfGhIj/view"]]);
  assert.equal(f.docs.get("doc/gm-lupe").result.doc_url, "https://drive.google.com/file/d/1LupeScreenshotAbCdEfGhIj/view");

  const g = nightFakes();
  g.docs.get("doc/gm-lupe").result.doc_url = "https://drive.google.com/file/d/1AlreadyFiledAbCdEfGhIjKl/view";
  assert.equal((await nightTools(g).run("file_missing_receipt", { txn_id: "receipt-lupe", docId: "gm-lupe", plain })).ok, true);
  assert.deepEqual(g.calls.map((c) => c[0]), ["setDocUrl"], "no second copy in Drive");
});

test("read_again: a failed photo since the cutover is read again once, through the ingest, never posting; one from before the cutover never", async () => {
  const f = nightFakes(), sent = [];
  process.env.POLLER_SECRET ||= "poller-secret";
  const t = nightTools(f, { origin: "https://books.test", fetchImpl: async (url, init) => { sent.push([url, JSON.parse(init.body)]); return { status: 202 }; } });
  const plain = "Read the 10-11 photo again that had failed - if it needs you, it is in your Inbox.";
  assert.match((await t.run("read_again", { docId: "gm-old", plain })).error, /before the cutover/);
  assert.equal((await t.run("read_again", { docId: "gm-photo", plain })).ok, true);
  assert.deepEqual(sent, [["https://books.test/api/ingest-bg", { docId: "gm-photo", reprocess: true, holdOnly: true }]]);
  const env = f.docs.get("doc/gm-photo");
  assert.equal(env.status, "processing");
  assert.ok(env.check_reread_at);
  // the next night it is in error again: not a second time
  f.docs.set("doc/gm-photo", { ...env, status: "error" });
  assert.match((await nightTools(f, { origin: "https://books.test", fetchImpl: async () => ({ status: 202 }) }).run("read_again", { docId: "gm-photo", plain })).error, /already read it again/);
});

test("runCheck: what the check fixed opens Paul's email in its own words; what code refused goes on Claude's list, never his", async () => {
  const f = nightFakes(), cache = makeFakeCacheStore();
  resetCacheStoreForTests(cache);
  const plain = "Took out the second $40.00 USPS mailbox key from 01-02 - it was in the books twice; the one on 1014 S View stays.";
  const turns = [
    { stop_reason: "tool_use", content: [
      { type: "tool_use", id: "t1", name: "take_out_double", input: { txn_id: "manual-usps", keep_txn_id: "migration-usps", plain } },
      { type: "tool_use", id: "t2", name: "take_out_double", input: { txn_id: "manual-hd", keep_txn_id: "migration-hd", plain: "Took out the second Home Depot $7.56 of 05-29." } },
    ] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Books check: clean." }] },
  ];
  const seen = [];
  const anthropic = { beta: { messages: { create: async (p) => { seen.push(p.messages.at(-1)); return { model: "m", usage: { input_tokens: 10, output_tokens: 5 }, ...turns.shift() }; } } } };
  const check = await runCheck({ writer: f.writer, docsStore: f.docsStore, cacheStore: cache, anthropic, now: NOW_1027 });
  assert.equal(check.error, "", JSON.stringify(check.refused));
  assert.equal(check.text, `Fixed overnight:\n- ${plain}\nBooks check: nothing for you to do.`);
  assert.match(check.claude, /take_out_double .*manual-hd.* was not done: the money moved differently/);
  assert.deepEqual(check.fixed.map((x) => x.voided), ["manual-usps"]);
  assert.equal(seen[1].content.find((r) => r.tool_use_id === "t2").is_error, true, "the model is told it was refused");
  assert.equal(check.usage.turns, 2);
});

test("a dry run: every rail runs, nothing is written, and the result never becomes the digest's", async () => {
  const f = nightFakes(), cache = makeFakeCacheStore();
  resetCacheStoreForTests(cache);
  const plain = "Took out the second $40.00 USPS mailbox key from 01-02 - it was in the books twice; the one on 1014 S View stays.";
  const turns = [
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "take_out_double", input: { txn_id: "manual-usps", keep_txn_id: "migration-usps", plain } },
      { type: "tool_use", id: "t2", name: "take_out_double", input: { txn_id: "migration-usps", keep_txn_id: "manual-usps", plain } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Books check: clean." }] },
  ];
  const anthropic = { beta: { messages: { create: async () => ({ model: "m", usage: {}, ...turns.shift() }) } } };
  const check = await runCheck({ writer: f.writer, docsStore: f.docsStore, cacheStore: cache, anthropic, now: NOW_1027, dry: true });
  assert.deepEqual(f.calls, []);
  assert.deepEqual(check.fixed.map((x) => [x.txn_id, x.dry]), [["manual-usps", true]]);
  assert.match(check.claude, /old books' row is the one kept/);
  assert.ok(await cache.get("reconcile/dry/2026-10-27", { type: "json" }));
  assert.equal(await cache.get("reconcile/latest", { type: "json" }), null);
});

test("onPaulsCard: what his own card paid for, recorded yesterday, with the card when the receipt shows it; voided, other payers and other days left out; a refund is money back", async () => {
  const { onPaulsCard } = await import("../netlify/functions/books-reconcile-background.mjs");
  const HP = ["txn_id", "line", "date", "account", "debit", "credit", "property", "payee", "paid_from", "source", "posted_at", "void_of"];
  const e = (id, date, payee, prop, amt, paid_from, posted_at, src = "receipt") => [
    [id, 1, date, "1030", amt, "", prop, payee, paid_from, src, posted_at, ""],
    [id, 2, date, paid_from === "PAUL" ? "2030" : paid_from, "", amt, prop, payee, paid_from, src, posted_at, ""]];
  const journal = { headers: HP, rows: [
    ...e("receipt-lowes", "2026-10-12", "Lowe's", "658 Erin Hills", 3.8, "PAUL", "2026-10-23T10:36:00"),
    ...e("receipt-adobe", "2026-10-23", "Adobe", "OVERHEAD", 34.49, "PAUL", "2026-10-23T17:44:00"),
    ...e("receipt-chase", "2026-10-23", "Home Depot", "366 Mesa", 50, "1402", "2026-10-23T12:00:00"),
    ...e("receipt-pacer", "2026-10-14", "PACER", "OVERHEAD", 39.3, "PAUL", "2026-10-23T11:08:00"),
    ["void-receipt-pacer", 1, "2026-10-14", "1030", "", 39.3, "OVERHEAD", "PACER", "PAUL", "void", "2026-10-25T19:48:00", "receipt-pacer"],
    ["void-receipt-pacer", 2, "2026-10-14", "2030", 39.3, "", "OVERHEAD", "PACER", "PAUL", "void", "2026-10-25T19:48:00", "receipt-pacer"],
    ...e("receipt-fedex", "2026-10-24", "FedEx Office", "OVERHEAD", 135.95, "PAUL", "2026-10-24T14:30:00"),
    // a return to his card: 2030 debited
    ["manual-return", 1, "2026-10-20", "2030", 12, "", "366 Mesa", "Home Depot", "PAUL", "manual", "2026-10-23T09:00:00", ""],
    ["manual-return", 2, "2026-10-20", "1030", "", 12, "366 Mesa", "Home Depot", "PAUL", "manual", "2026-10-23T09:00:00", ""],
  ] };
  const envelopes = [{ result: { txn_ids: ["receipt-lowes"] }, model: { card_last4: "9166" } }];
  assert.equal(onPaulsCard(journal, envelopes, "2026-10-23"), [
    "Paid with your own card, recorded yesterday (3, $26.29) - the business owes you these back:",
    "- Lowe's, 10-12, $3.80, 658 Erin Hills, card ending 9166",
    "- Home Depot, 10-20, $12.00 back to your card, 366 Mesa",
    "- Adobe, 10-23, $34.49, OVERHEAD",
  ].join("\n"));
  assert.equal(onPaulsCard(journal, envelopes, "2026-10-26"), "");

  // the 3 AM email prints it under the check, for the day before the run
  const cache = makeFakeCacheStore();
  resetCacheStoreForTests(cache);
  const writer = { read: async (tab) => ({ ok: true, ...(tab === "Feed" ? { headers: [], rows: [] } : journal) }) };
  const docsStore = { list: async () => ({ blobs: [] }), get: async () => null };
  const anthropic = { beta: { messages: { create: async () => ({ stop_reason: "end_turn", model: "m", usage: {}, content: [{ type: "text", text: "Books check: clean." }] }) } } };
  const check = await runCheck({ writer, docsStore, cacheStore: cache, anthropic, now: Date.parse("2026-10-25T07:30:00Z") });
  assert.equal(check.text, "Books check: clean.\nPaid with your own card, recorded yesterday (1, $135.95) - the business owes you these back:\n- FedEx Office, 10-24, $135.95, OVERHEAD");
});
