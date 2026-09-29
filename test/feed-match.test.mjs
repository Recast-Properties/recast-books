// test/feed-match.test.mjs - lib/feed-match.mjs and the matching job: Claude's verdicts are
// re-checked by code, every match to the cent; proposals and questions become Inbox cards;
// the Feed rows get their notes. No real model, writer or store anywhere here.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS } from "../lib/coa.mjs";
import { makeCtx } from "../lib/posting.mjs";
import {
  buildCandidates, expandVerdicts, applyVerdicts, runMatcher, buildSystem, buildUser, VERDICTS_TOOL, lineText,
} from "../lib/feed-match.mjs";

process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
process.env.POLLER_SECRET = "poller-secret";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
const { resetCacheStoreForTests, tieFeedRows } = await import("../netlify/functions/_shared.mjs");
const { makeFakeCacheStore } = await import("./helpers/fake-cache-store.mjs");
const { runFeedMatch, feedRows } = await import("../netlify/functions/books-feed-match-background.mjs");

// ---- fixtures ---------------------------------------------------------------------------

const ACCOUNT = "1401";
const journalLine = (txn_id, date, account, amount_cents, extra = {}) => ({
  txn_id, date, account, amount_cents, property: "", trade: "", payee: "", description: "", memo: "", source: "receipt", void_of: "", ...extra,
});
// Journal, as flattenJournalLines gives it (amount signed: debit +, credit -).
const JOURNAL = [
  journalLine("receipt-1", "2026-08-13", "1030", 54240, { property: "366 Mesa", payee: "Lowe's", description: "siding" }),
  journalLine("receipt-1", "2026-08-13", ACCOUNT, -54240, { property: "366 Mesa", payee: "Lowe's" }),
  journalLine("manual-2", "2026-09-01", "1120", 109640, { property: "Cost Recapture", payee: "Waxahachie Water", source: "manual" }),
  journalLine("manual-2", "2026-09-01", ACCOUNT, -109640, { payee: "Waxahachie Water", source: "manual" }),
  journalLine("manual-3", "2026-09-01", "1120", 10000, { property: "108 Brushwood", payee: "Waxahachie Water", source: "manual" }),
  journalLine("manual-3", "2026-09-01", ACCOUNT, -10000, { payee: "Waxahachie Water", source: "manual" }),
  journalLine("sale-4", "2026-08-07", ACCOUNT, 26376994, { payee: "Bison Title", source: "sale", memo: "280 Sparkling settlement" }),
  journalLine("sale-4", "2026-08-07", "1500", -26376994, { property: "280 Sparkling", payee: "Bison Title", source: "sale" }),
  journalLine("receipt-5", "2026-08-20", "1030", 5000, { property: "366 Mesa", payee: "Home Depot" }),
  journalLine("receipt-5", "2026-08-20", ACCOUNT, -5000, { payee: "Home Depot" }),
  journalLine("void-receipt-5", "2026-08-21", "1030", -5000, { source: "void", void_of: "receipt-5" }),
  journalLine("void-receipt-5", "2026-08-21", ACCOUNT, 5000, { source: "void", void_of: "receipt-5" }),
  journalLine("manual-6", "2026-08-11", "6930", 2815, { property: "OVERHEAD", payee: "Deluxe", source: "manual" }),
  journalLine("manual-6", "2026-08-11", ACCOUNT, -2815, { payee: "Deluxe", source: "manual" }),
  journalLine("receipt-7", "2026-09-02", "1030", 4200, { property: "104 Ashburne", payee: "Floor & Decor", paid_from: "2030" }),
  journalLine("receipt-7", "2026-09-02", "2030", -4200, { payee: "Floor & Decor" }),
];
const line = (feed_id, date, amount_cents, name, memo = name) => ({ feed_id, date, amount_cents, name, memo });
const LINES = [
  line("F1", "2026-08-13", -54240, "Lowe s Waxahachie"),
  line("F2", "2026-09-01", -119640, "408 S ROGERS STREET WAXAHACHI", "408 S ROGERS STREET WAXAHACHIE TX"),
  line("F3", "2026-08-07", 25905312, "Wire Transfer from Bison Titl", "Wire Transfer from Bison Title LLC"),
  line("F4", "2026-08-07", 471682, "Wire Transfer from Bison Titl", "Wire Transfer from Bison Title LLC"),
  line("F5", "2026-09-14", -23900, "LOWES #00907* 866-483-7521 NC"),
  line("F6", "2026-09-15", -3000000, "CK# 1063 Paul Bgorte"),
  line("F7", "2026-09-23", 71555865, "Wire Transfer from Bison Titl", "Wire Transfer from Bison Title LLC"),
  line("F8", "2026-08-11", -2815, "DELUXE CHECK -CHECK/ACC."),
];
const PROPERTIES = [
  { name: "366 Mesa", address: "366 Mesa Dr, Waxahachie", status: "held", purchase_date: "2026-05-01", trades: ["Siding", "Roof"] },
  { name: "108 Brushwood", address: "108 Brushwood, Waxahachie", status: "held", trades: [] },
  { name: "104 Ashburne", address: "104 Ashburn Glen Ln", status: "sold", trades: [] },
];
const ctx = () => makeCtx({ accounts: new Map(ACCOUNTS.map((a) => [a.code, a])), properties: new Set(["366 Mesa", "108 Brushwood"]), periods: new Map(), today: "2026-09-28" });
const SETTINGS = { autofile_ceiling_cents: 50000 };

// ---- candidates ----------------------------------------------------------------------------

test("buildCandidates: one per entry touching the account, bank-signed, voided and already-tied entries left out, what-it-recorded kept", () => {
  const c = buildCandidates(JOURNAL, ACCOUNT, new Set(["manual-6"]));
  assert.deepEqual(c.map((x) => [x.txn_id, x.date, x.amount_cents]), [
    ["sale-4", "2026-08-07", 26376994],
    ["receipt-1", "2026-08-13", -54240],
    ["manual-2", "2026-09-01", -109640],
    ["manual-3", "2026-09-01", -10000],
  ]);
  assert.deepEqual(c[1].what, [{ account: "1030", property: "366 Mesa", description: "siding", amount_cents: 54240 }]);
  assert.equal(c[1].payee, "Lowe's");
  assert.ok(!c.some((x) => x.txn_id === "receipt-7"), "an entry paid by Paul does not touch the bank account");
});

// ---- the model's aliases -> ids ------------------------------------------------------------------

test("expandVerdicts: L/C aliases become feed_ids and txn_ids; an alias that names nothing is dropped", () => {
  const cands = buildCandidates(JOURNAL, ACCOUNT, new Set(["manual-6"]));
  const out = expandVerdicts({
    matches: [{ lines: ["L1"], candidates: ["C2"], note: "Lowe's siding" }, { lines: ["L3", "L4"], candidates: ["C1", "C9"], note: "the Sparkling wires" }],
    proposals: [{ lines: ["L5"], entry: { payee: "Lowe's", items: [] }, note: "a Lowe's charge" }],
    questions: [{ lines: ["L6"], question: "A 30,000 check to Paul on 09-15 - what is it?" }],
    later: [{ lines: ["L7", "L99"], note: "the Ashburne sale" }],
  }, LINES, cands);
  assert.deepEqual(out.map((v) => [v.kind, v.feed_ids, v.txn_ids]), [
    ["match", ["F1"], ["receipt-1"]],
    ["match", ["F3", "F4"], ["sale-4"]],
    ["propose", ["F5"], []],
    ["question", ["F6"], []],
    ["later", ["F7"], []],
  ]);
  assert.equal(out[2].entry.payee, "Lowe's");
  assert.deepEqual(expandVerdicts(null, LINES, cands), []);
});

// ---- code's half ---------------------------------------------------------------------------------

test("applyVerdicts: a match must add up to the cent (several lines to one entry, one line to several entries); a wrong sum is a question, never a match", () => {
  const cands = buildCandidates(JOURNAL, ACCOUNT);
  const { updates, envelopes, summary } = applyVerdicts({
    verdicts: [
      { kind: "match", feed_ids: ["F1"], txn_ids: ["receipt-1"], entry: null, note: "Lowe's siding for 366 Mesa" },
      { kind: "match", feed_ids: ["F3", "F4"], txn_ids: ["sale-4"], entry: null, note: "the Sparkling sale, two wires" },
      { kind: "match", feed_ids: ["F2"], txn_ids: ["manual-2"], entry: null, note: "the water bill" },            // 1,096.40 vs the bank's 1,196.40 - far off
    ],
    lines: LINES.slice(0, 4), candidates: cands, account: ACCOUNT, accountName: "Citizens", ctx: ctx(), settings: SETTINGS, now: "2026-09-28T20:00:00Z",
  });
  const byId = Object.fromEntries(updates.map((u) => [u.feed_id, u]));
  assert.deepEqual(byId.F1, { feed_id: "F1", status: "matched", txn_id: "receipt-1", match_note: "Lowe's siding for 366 Mesa" });
  assert.equal(byId.F3.txn_id, "sale-4");
  assert.equal(byId.F4.txn_id, "sale-4");
  assert.equal(byId.F2.status, "proposed");
  assert.match(byId.F2.match_note, /^In the Inbox: Claude tried to tie the bank's -1196\.40 of 2026-09-01 .* the amounts differ/);
  assert.equal(envelopes.length, 1);
  assert.equal(envelopes[0].docId, "feed-1401-F2");
  assert.deepEqual(envelopes[0].feed, { account: ACCOUNT, feed_ids: ["F2"] });
  assert.equal(envelopes[0].status, "pending");
  assert.deepEqual(envelopes[0].model.entries, []);
  assert.equal(envelopes[0].model.paid_from, ACCOUNT);
  assert.deepEqual(summary, { total: 4, matched: 3, cards: 1, later: 0, none: 0 });
});

test("applyVerdicts: a few cents off is still a match, and the note says so; more is a question", () => {
  const cands = buildCandidates(JOURNAL, ACCOUNT);
  const pennyOff = [line("F1", "2026-08-13", -54239, "Lowe s Waxahachie")];
  const { updates } = applyVerdicts({
    verdicts: [{ kind: "match", feed_ids: ["F1"], txn_ids: ["receipt-1"], entry: null, note: "Lowe's siding for 366 Mesa" }],
    lines: pennyOff, candidates: cands, account: ACCOUNT, accountName: "Citizens", ctx: ctx(),
  });
  assert.equal(updates[0].status, "matched");
  assert.equal(updates[0].match_note, "Lowe's siding for 366 Mesa (the books are 0.01 over the bank - rounding in the old books)");
  const dimeOff = [line("F1", "2026-08-13", -54220, "Lowe s Waxahachie")];
  const far = applyVerdicts({
    verdicts: [{ kind: "match", feed_ids: ["F1"], txn_ids: ["receipt-1"], entry: null, note: "Lowe's" }],
    lines: dimeOff, candidates: cands, account: ACCOUNT, accountName: "Citizens", ctx: ctx(),
  });
  assert.equal(far.updates[0].status, "proposed");
  assert.match(far.updates[0].match_note, /the amounts differ/);
});

test("applyVerdicts: one line to two entries adds up; a candidate used twice makes the second a question", () => {
  const cands = buildCandidates(JOURNAL, ACCOUNT);
  const { updates } = applyVerdicts({
    verdicts: [
      { kind: "match", feed_ids: ["F2"], txn_ids: ["manual-2", "manual-3"], entry: null, note: "Waxahachie Water, two houses" },
      { kind: "match", feed_ids: ["F1"], txn_ids: ["manual-3"], entry: null, note: "nonsense" },
    ],
    lines: LINES.slice(0, 2), candidates: cands, account: ACCOUNT, accountName: "Citizens", ctx: ctx(), settings: SETTINGS,
  });
  const byId = Object.fromEntries(updates.map((u) => [u.feed_id, u]));
  assert.equal(byId.F2.status, "matched");
  assert.equal(byId.F2.txn_id, "manual-2, manual-3");
  assert.equal(byId.F1.status, "proposed");
  assert.match(byId.F1.match_note, /already tied to another line/);
});

test("applyVerdicts: a proposal whose items add up becomes a pending card with the entry, paid from the account, gated; one that does not becomes a question; later and silence stay unmatched with a note", () => {
  const cands = buildCandidates(JOURNAL, ACCOUNT);
  const entry = { date: "2026-08-11", payee: "Deluxe", memo: "check order", property: "OVERHEAD", paid_from: "PAUL",
    items: [{ account: "6930", amount_cents: 2815, description: "checks", trade: null, business_purpose: null }] };
  const bad = { ...entry, items: [{ ...entry.items[0], amount_cents: 2800 }] };
  const { updates, envelopes, summary } = applyVerdicts({
    verdicts: [
      { kind: "propose", feed_ids: ["F8"], txn_ids: [], entry, note: "the bank's check order" },
      { kind: "propose", feed_ids: ["F5"], txn_ids: [], entry: bad, note: "a Lowe's charge" },
      { kind: "question", feed_ids: ["F6"], txn_ids: [], entry: null, note: "A 30,000.00 check to Paul on 09-15 - what is it for?" },
      { kind: "later", feed_ids: ["F7"], txn_ids: [], entry: null, note: "the 104 Ashburne sale, not closed in the books yet" },
    ],
    lines: LINES.slice(4), candidates: cands, account: ACCOUNT, accountName: "Citizens", ctx: ctx(), settings: SETTINGS,
  });
  const byId = Object.fromEntries(updates.map((u) => [u.feed_id, u]));
  const env = Object.fromEntries(envelopes.map((e) => [e.docId, e]));
  assert.equal(byId.F8.status, "proposed");
  assert.equal(env["feed-1401-F8"].model.entries[0].paid_from, ACCOUNT, "paid_from is the bank account whatever the model said");
  assert.equal(env["feed-1401-F8"].model.receipt_total_cents, 2815);
  assert.equal(env["feed-1401-F8"].model.vendor, "Deluxe");
  assert.ok(Array.isArray(env["feed-1401-F8"].gate.reasons) && env["feed-1401-F8"].gate.reasons.includes("NOT_POST_VERDICT"), "gated like a receipt hold");
  assert.equal(env["feed-1401-F8"].channel, "bankfeed");
  assert.match(env["feed-1401-F8"].bodyText, /Bank line on Citizens \(1401\):\n2026-08-11  -28\.15  DELUXE CHECK/);
  assert.equal(byId.F5.status, "proposed");
  assert.match(env["feed-1401-F5"].model.why, /items do not add up/);
  assert.deepEqual(env["feed-1401-F5"].model.entries, []);
  assert.equal(env["feed-1401-F6"].model.why, "A 30,000.00 check to Paul on 09-15 - what is it for?");
  assert.equal(env["feed-1401-F6"].model.vendor, "CK# 1063 Paul Bgorte");
  assert.deepEqual(byId.F7, { feed_id: "F7", status: "unmatched", txn_id: "", match_note: "Waits: the 104 Ashburne sale, not closed in the books yet" });
  assert.deepEqual(summary, { total: 4, matched: 0, cards: 3, later: 1, none: 0 });

  const silent = applyVerdicts({ verdicts: [], lines: LINES.slice(0, 1), candidates: cands, account: ACCOUNT, accountName: "Citizens", ctx: ctx() });
  assert.equal(silent.updates[0].status, "unmatched");
  assert.match(silent.updates[0].match_note, /no verdict/);
  assert.equal(silent.summary.none, 1);
});

test("applyVerdicts: a line named twice keeps its first verdict; an unknown feed_id is ignored", () => {
  const cands = buildCandidates(JOURNAL, ACCOUNT);
  const { updates, envelopes } = applyVerdicts({
    verdicts: [
      { kind: "match", feed_ids: ["F1", "nope"], txn_ids: ["receipt-1"], entry: null, note: "first" },
      { kind: "question", feed_ids: ["F1"], txn_ids: [], entry: null, note: "second" },
    ],
    lines: LINES.slice(0, 1), candidates: cands, account: ACCOUNT, accountName: "Citizens", ctx: ctx(),
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, "matched");
  assert.equal(envelopes.length, 0);
});

// ---- the model call ------------------------------------------------------------------------------

/** A fake Anthropic client: parses the aliases out of the prompt and answers with `answer(lines, cands)`. */
function fakeAnthropic(answer, { silentFirst = false } = {}) {
  const calls = [];
  const parse = (text, tag) => [...text.matchAll(new RegExp(`^${tag}(\\d+) \\| (\\S+) \\| (-?[\\d.]+) \\| ([^|\\n]*)`, "gm"))]
    .map((m) => ({ alias: `${tag}${m[1]}`, date: m[2], amount: m[3], text: m[4].trim() }));
  return {
    calls,
    beta: { messages: { create: async (req) => {
      calls.push(req);
      const lines = parse(req.messages[0].content, "L");
      const cands = parse(req.system[0].text, "C");
      if (silentFirst && calls.length === 1) return { stop_reason: "end_turn", content: [{ type: "text", text: "Let me think." }], usage: { input_tokens: 10, output_tokens: 2 } };
      return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: VERDICTS_TOOL.name, input: answer(lines, cands) }], usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 80 } };
    } } },
  };
}
const answerByAmount = (lines, cands) => {
  const byAmt = (a) => cands.filter((c) => c.amount === a).map((c) => c.alias);
  const out = { matches: [], proposals: [], questions: [], later: [] };
  for (const l of lines) {
    const c = byAmt(l.amount);
    if (c.length) out.matches.push({ lines: [l.alias], candidates: c, note: `${l.text} - in the books` });
    else out.questions.push({ lines: [l.alias], question: `What is the ${l.amount} of ${l.date} (${l.text})?` });
  }
  return out;
};

test("runMatcher: batches the lines, caches the candidates in the system block, maps aliases back, bounces a call with no verdicts once", async () => {
  const cands = buildCandidates(JOURNAL, ACCOUNT, new Set(["manual-6"]));
  const anthropic = fakeAnthropic(answerByAmount, { silentFirst: true });
  const { verdicts, usage, transcript } = await runMatcher({ anthropic, account: ACCOUNT, accountName: "Citizens", lines: LINES.slice(0, 3), candidates: cands, properties: PROPERTIES, today: "2026-09-28", batchSize: 2 });
  assert.equal(anthropic.calls.length, 3, "batch 1 bounced once + batch 2");
  assert.equal(anthropic.calls[0].system[0].cache_control.type, "ephemeral");
  assert.match(anthropic.calls[0].system[0].text, /HOUSES[\s\S]*366 Mesa \| 366 Mesa Dr, Waxahachie \| held \| bought 2026-05-01 \| sections: Siding, Roof/);
  assert.match(anthropic.calls[0].system[0].text, /^C2 \| 2026-08-13 \| -542\.40 \| Lowe's \| receipt \| 366 Mesa 1030 542\.40 "siding"$/m);
  assert.match(anthropic.calls[0].messages[0].content, /batch 1 of 2[\s\S]*^L1 \| 2026-08-13 \| -542\.40 \| Lowe s Waxahachie$/m);
  assert.equal(anthropic.calls[1].messages.length, 3, "the bounce carries the model's turn and the nudge");
  assert.deepEqual(verdicts.map((v) => [v.kind, v.feed_ids, v.txn_ids]), [
    ["match", ["F1"], ["receipt-1"]],
    ["question", ["F2"], []],
    ["question", ["F3"], []],
  ]);
  assert.equal(usage.calls, 3);
  assert.equal(usage.cache_read_input_tokens, 160);
  assert.match(transcript, /batch 1: no record_verdicts \(end_turn\) - bounced/);
});

test("VERDICTS_TOOL is strict and every line kind is a list with lines[]; lineText prefers the longer memo", () => {
  assert.equal(VERDICTS_TOOL.strict, true);
  for (const k of ["matches", "proposals", "questions", "later"]) {
    const item = VERDICTS_TOOL.input_schema.properties[k].items;
    assert.equal(item.additionalProperties, false);
    assert.ok(item.required.includes("lines"));
  }
  assert.equal(lineText(LINES[1]), "2026-09-01 | -1196.40 | 408 S ROGERS STREET WAXAHACHIE TX");
  assert.equal(lineText({ ...LINES[1], match_note: "Paul: the water bill for Brushwood" }), "2026-09-01 | -1196.40 | 408 S ROGERS STREET WAXAHACHIE TX | note: Paul: the water bill for Brushwood");
  assert.match(buildUser({ lines: LINES.slice(0, 1), batch: 1, batches: 1, today: "2026-09-28" }), /L1..L1/);
  assert.match(buildSystem({ account: ACCOUNT, accountName: "Citizens", candidates: [], properties: [] }), /nothing in the books touches this account yet/);
  const sys = buildSystem({ account: ACCOUNT, accountName: "Citizens", candidates: [], properties: [], vendors: [{ canonical: "Falcon Creek Lawn Care", aliases: ["Effren", "Effren Landscaper"] }, { canonical: "Home Depot", aliases: [] }] });
  assert.match(sys, /VENDOR NAMES[^\n]*\n(Falcon Creek Lawn Care \| Effren, Effren Landscaper)\n\nCANDIDATES/);
});

// ---- the job, end to end with fakes ---------------------------------------------------------

const JOURNAL_HEADERS = ["txn_id", "line", "date", "period", "account", "debit", "credit", "property", "cost_class", "tax_treatment", "trade", "payee", "description", "paid_from", "doc_url", "source", "posted_by", "posted_at", "memo", "reconciled_ref", "business_purpose", "attendee", "destination", "odometer", "void_of"];
const journalRow = (l) => JOURNAL_HEADERS.map((h) => {
  if (h === "debit") return l.amount_cents > 0 ? l.amount_cents / 100 : 0;
  if (h === "credit") return l.amount_cents < 0 ? -l.amount_cents / 100 : 0;
  if (h === "period") return l.date.slice(0, 7);
  return l[h] ?? "";
});
const FEED_HEADERS = ["feed_id", "account", "date", "amount", "name", "memo", "status", "txn_id", "match_note", "source_file", "imported_at"];
const feedRow = (l, status = "unmatched", txn_id = "", account = ACCOUNT) => [l.feed_id, account, l.date, l.amount_cents / 100, l.name, l.memo, status, txn_id, "", "****2505.QFX", "2026-09-28T16:20:00"];

function fakeWriter() {
  const calls = [];
  const tabs = {
    Feed: { headers: FEED_HEADERS, rows: [...LINES.map((l) => feedRow(l)), feedRow(line("F9", "2026-08-11", -2815, "DELUXE"), "matched", "manual-6"), feedRow(line("F10", "2026-09-15", 200000, "Deposit"), "unmatched", "", "1402")] },
    Journal: { headers: JOURNAL_HEADERS, rows: JOURNAL.map(journalRow) },
    Accounts: { headers: ["code", "name", "series", "type", "cost_class", "tax_treatment", "active", "notes"], rows: ACCOUNTS.map((a) => [a.code, a.name, a.series, a.type, a.cost_class, a.tax_treatment, true, ""]) },
    Properties: { headers: ["name", "address", "status", "purchase_date"], rows: PROPERTIES.map((p) => [p.name, p.address, p.status, p.purchase_date || ""]) },
    Periods: { headers: ["period", "status"], rows: [] },
    Settings: { headers: ["key", "value"], rows: [["autofile_ceiling_cents", 50000]] },
    "Bank accounts": { headers: ["code", "name", "institution", "last4", "active"], rows: [[ACCOUNT, "Recast Citizens - Shared", "Citizens", "2505, 5450, 9301", true]] },
    Vendors: { headers: ["canonical", "aliases"], rows: [["Falcon Creek Lawn Care", "Effren, Effren Landscaper"]] },
  };
  return {
    calls,
    read: async (tab) => { calls.push(["read", tab]); return { ok: true, ...tabs[tab] }; },
    feedUpdate: async (rows) => { calls.push(["feedUpdate", rows]); return { ok: true, updated: rows.length, missing: [] }; },
  };
}
function fakeDocsStore() {
  const items = new Map();
  return { items, get: async (k, { type } = {}) => (items.has(k) ? (type === "json" ? JSON.parse(items.get(k)) : items.get(k)) : null), setJSON: async (k, v) => { items.set(k, JSON.stringify(v)); } };
}

beforeEach(() => resetCacheStoreForTests(makeFakeCacheStore()));

test("runFeedMatch: reads the tabs, sends only the account's open lines, leaves out entries already tied, writes the verdicts and the cards", async () => {
  const writer = fakeWriter();
  const docsStore = fakeDocsStore();
  const anthropic = fakeAnthropic(answerByAmount);
  const out = await runFeedMatch({ account: ACCOUNT, writer, docsStore, anthropic, now: "2026-09-28T20:00:00Z" });
  assert.equal(anthropic.calls.length, 1);
  const sent = [...anthropic.calls[0].messages[0].content.matchAll(/^L\d+ \| /gm)].length;
  assert.equal(sent, 8, "F9 (matched) and F10 (another account) stay home");
  assert.doesNotMatch(anthropic.calls[0].system[0].text, /Deluxe/, "manual-6 is tied to F9 already, so it is no candidate");
  assert.match(anthropic.calls[0].system[0].text, /Falcon Creek Lawn Care \| Effren, Effren Landscaper/, "the Vendors tab's other names reach the model");
  assert.equal(out.candidates, 4);
  const upd = writer.calls.find((c) => c[0] === "feedUpdate")[1];
  const byId = Object.fromEntries(upd.map((u) => [u.feed_id, u]));
  assert.equal(byId.F1.status, "matched");
  assert.equal(byId.F1.txn_id, "receipt-1");
  assert.equal(byId.F6.status, "proposed");
  assert.equal(out.summary.total, 8);
  assert.equal(out.summary.matched, 1);
  assert.equal(out.summary.cards, 7);
  assert.equal(out.cards.length, 7);
  const card = await docsStore.get("doc/feed-1401-F6", { type: "json" });
  assert.equal(card.status, "pending");
  assert.match(card.model.why, /-30000\.00 of 2026-09-15/);
  assert.equal(card.from, "Recast Citizens - Shared");
  assert.deepEqual(feedRows({ headers: FEED_HEADERS, rows: [feedRow(LINES[0])] })[0], { feed_id: "F1", account: ACCOUNT, date: "2026-08-13", amount_cents: -54240, name: "Lowe s Waxahachie", memo: "Lowe s Waxahachie", status: "unmatched", txn_id: "", match_note: "" });
});

test("runFeedMatch: no open lines on the account -> nothing sent, nothing written", async () => {
  const writer = fakeWriter();
  const anthropic = fakeAnthropic(answerByAmount);
  const out = await runFeedMatch({ account: "1402", writer, docsStore: fakeDocsStore(), anthropic });
  assert.equal(out.summary.total, 1);
  assert.equal(anthropic.calls.length, 1);
  const out2 = await runFeedMatch({ account: "1499", writer, docsStore: fakeDocsStore(), anthropic });
  assert.equal(out2.summary.total, 0);
  assert.equal(anthropic.calls.length, 1, "no call for an account with no open lines");
  assert.ok(!writer.calls.some((c) => c[0] === "feedUpdate" && c[1].some((u) => u.feed_id.startsWith("F9"))));
});

// ---- the Inbox ties the rows a card came from ------------------------------------------------

test("tieFeedRows: a card with feed rows ties them (approve -> matched with the txn_ids, dismiss -> excluded); a receipt card does nothing; a failed tie is returned, not thrown", async () => {
  const calls = [];
  const writer = { feedUpdate: async (rows) => { calls.push(rows); return { ok: true, updated: rows.length }; }, read: async () => ({ ok: true, headers: FEED_HEADERS, rows: [] }) };
  const env = { docId: "feed-1401-F5", feed: { account: ACCOUNT, feed_ids: ["F5", "F5b"] } };
  assert.deepEqual(await tieFeedRows(writer, env, { status: "matched", txn_ids: ["manual-9"], note: "Recorded from the Inbox" }), { ok: true, updated: 2 });
  assert.deepEqual(calls[0], [
    { feed_id: "F5", status: "matched", txn_id: "manual-9", match_note: "Recorded from the Inbox" },
    { feed_id: "F5b", status: "matched", txn_id: "manual-9", match_note: "Recorded from the Inbox" },
  ]);
  assert.equal(await tieFeedRows(writer, { docId: "receipt-1" }, { status: "matched", txn_ids: ["x"] }), null);
  const broken = { feedUpdate: async () => { throw new Error("writer down"); } };
  assert.deepEqual(await tieFeedRows(broken, env, { status: "excluded", note: "Dismissed" }), { ok: false, error: "writer down" });
});
