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

test("applyVerdicts: a match must add up to the cent (several lines to one entry, one line to several entries); a wrong sum is a question, never a match", async () => {
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
  assert.deepEqual(envelopes[0].feed, { account: ACCOUNT, feed_ids: ["F2"], amount_cents: -119640, card: null });   // signed: money out; no card known
  assert.equal(envelopes[0].status, "pending");
  assert.deepEqual(envelopes[0].model.entries, []);
  assert.equal(envelopes[0].model.paid_from, ACCOUNT);
  assert.deepEqual(summary, { total: 4, matched: 3, cards: 1, later: 0, none: 0 });

  // D-059: the card the bank's daily email named rides on the Inbox card, when every line has the same one
  const dennis = { last4: "9301", name: "DENNIS C LITTLE", holder: "Dennis" };
  const carded = applyVerdicts({
    verdicts: [{ kind: "question", feed_ids: ["F2"], txn_ids: [], entry: null, note: "What was it?" }, { kind: "question", feed_ids: ["F3", "F4"], txn_ids: [], entry: null, note: "And these?" }],
    lines: LINES.slice(0, 4).map((l) => (l.feed_id === "F4" ? l : { ...l, card: dennis })), candidates: [], account: ACCOUNT, accountName: "Citizens", ctx: ctx(), settings: SETTINGS, now: "2026-09-28T20:00:00Z",
  });
  assert.deepEqual(carded.envelopes[0].feed.card, dennis);
  assert.match(carded.envelopes[0].model.checked, /The bank's daily email says Dennis's card \(9301\) paid\.$/);
  assert.equal(carded.envelopes[1].feed.card, null, "two lines, one of them with no card: the card does not speak for both");

  // D-060: three charges asked about together are three cards, each naming its own amount; a purchase and its refund stay one
  const hd = (id, c) => line(id, "2026-09-28", c, "Home Depot Waxahachie");
  const split = applyVerdicts({
    verdicts: [{ kind: "question", feed_ids: ["H1", "H2", "H3"], txn_ids: [], entry: null, note: "Which house is each one for?" },
      { kind: "question", feed_ids: ["P1", "R1"], txn_ids: [], entry: null, note: "What was bought and taken back?" }],
    lines: [hd("H1", -16291), hd("H2", -3307), hd("H3", -14109), hd("P1", -5409), line("R1", "2026-09-28", 5409, "Refund 1315 HWY 77 NORTH WAXA")],
    candidates: [], account: ACCOUNT, accountName: "Citizens", ctx: ctx(), settings: SETTINGS, now: "2026-09-28T20:00:00Z",
  });
  assert.deepEqual(split.envelopes.map((e) => [e.docId, e.feed.feed_ids, e.model.receipt_total_cents]), [
    ["feed-1401-H1", ["H1"], 16291], ["feed-1401-H2", ["H2"], 3307], ["feed-1401-H3", ["H3"], 14109], ["feed-1401-P1", ["P1", "R1"], 0]]);
  assert.equal(split.envelopes[1].model.why, "Home Depot Waxahachie, $33.07 on 09-28 - Which house is each one for?");
  assert.equal(split.envelopes[3].model.why, "What was bought and taken back?");
  assert.equal(split.summary.cards, 5);
  assert.deepEqual(split.updates.map((u) => [u.feed_id, u.status]), [["H1", "proposed"], ["H2", "proposed"], ["H3", "proposed"], ["P1", "proposed"], ["R1", "proposed"]]);
  const { MATCH_PROMPT } = await import("../lib/feed-match.mjs");
  assert.match(MATCH_PROMPT, /One charge, one card: .* every separate charge gets its OWN proposal or question/);
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
      const bills = parse(req.system[0].text, "B");
      if (silentFirst && calls.length === 1) return { stop_reason: "end_turn", content: [{ type: "text", text: "Let me think." }], usage: { input_tokens: 10, output_tokens: 2 } };
      return { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: VERDICTS_TOOL.name, input: answer(lines, cands, bills) }], usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 80 } };
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
  assert.match(sys, /VENDOR NAMES[^\n]*\n(Falcon Creek Lawn Care \| Effren, Effren Landscaper)\n\nRECENT BILLS[^\n]*\n\(none in the last 45 days\)\n\nCANDIDATES/);
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
    postBatch: async (entries, opts) => { calls.push(["postBatch", entries, opts]); return { ok: true, posted: entries.map((e) => e.txn_id), rows: [1, 2] }; },
  };
}
function fakeDocsStore() {
  const items = new Map();
  return {
    items,
    get: async (k, { type } = {}) => (items.has(k) ? (type === "json" ? JSON.parse(items.get(k)) : items.get(k)) : null),
    setJSON: async (k, v) => { items.set(k, JSON.stringify(v)); },
    list: async ({ prefix = "" } = {}) => ({ blobs: [...items.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
  };
}

beforeEach(() => resetCacheStoreForTests(makeFakeCacheStore()));

test("runFeedMatch: reads the tabs, sends only the account's open lines, leaves out entries already tied, writes the verdicts and the cards", async () => {
  const writer = fakeWriter();
  const docsStore = fakeDocsStore();
  const anthropic = fakeAnthropic(answerByAmount);
  const out = await runFeedMatch({ account: ACCOUNT, writer, docsStore, anthropic, now: "2026-09-28T20:00:00Z" });
  assert.equal(anthropic.calls.length, 1);
  const sent = [...anthropic.calls[0].messages[0].content.matchAll(/^L\d+ \| /gm)].length;
  assert.equal(sent, 7, "F9 (matched) and F10 (another account) stay home; F8, the bank's check order, is recorded by code (D-093)");
  assert.doesNotMatch(anthropic.calls[0].system[0].text, /Deluxe/, "manual-6 is tied to F9 already, so it is no candidate");
  assert.match(anthropic.calls[0].system[0].text, /Falcon Creek Lawn Care \| Effren, Effren Landscaper/, "the Vendors tab's other names reach the model");
  assert.equal(out.candidates, 4);
  const upd = writer.calls.find((c) => c[0] === "feedUpdate")[1];
  const byId = Object.fromEntries(upd.map((u) => [u.feed_id, u]));
  assert.equal(byId.F1.status, "matched");
  assert.equal(byId.F1.txn_id, "receipt-1");
  assert.equal(byId.F6.status, "proposed");
  assert.equal(out.summary.total, 7);
  assert.equal(out.summary.matched, 1);
  assert.equal(out.summary.cards, 6);
  assert.equal(out.cards.length, 6);
  assert.equal(out.summary.fees, 1, "F8 (D-093)");
  const card = await docsStore.get("doc/feed-1401-F6", { type: "json" });
  assert.equal(card.status, "pending");
  assert.match(card.model.why, /-30000\.00 of 2026-09-15/);
  assert.equal(card.from, "Recast Citizens - Shared");
  assert.deepEqual(feedRows({ headers: FEED_HEADERS, rows: [feedRow(LINES[0])] })[0], { feed_id: "F1", account: ACCOUNT, date: "2026-08-13", amount_cents: -54240, name: "Lowe s Waxahachie", memo: "Lowe s Waxahachie", status: "unmatched", txn_id: "", match_note: "", card_cell: "" });
});

test("D-059 runFeedMatch: the card the bank's daily email names reaches the model's line and the Inbox card; no emails, or a store that fails, changes nothing", async () => {
  const { makeFakeCacheStore } = await import("./helpers/fake-cache-store.mjs");
  const cacheStore = makeFakeCacheStore();
  // F5 is the bank's -239.00 of 2026-09-14 (Lowe's) - say the email put it on Dennis's card
  await cacheStore.setJSON("bankmail/m1", { id: "m1", bodyText: ` Daily Summary Account: 2505 Date: 09/14/26 MPOWERED SMALL BUS Debits: (-) LOWES #00907* \u24D8 9301 - DENNIS C LITTLE <https://x> $239.00 Total Debits $239.00 09/15 Avail Balance 7:00 AM $1.00` });
  const anthropic = fakeAnthropic(answerByAmount);
  const docsStore = fakeDocsStore();
  const writer = fakeWriter();
  const out = await runFeedMatch({ account: ACCOUNT, writer, docsStore, anthropic, cacheStore, now: "2026-09-28T20:00:00Z" });
  assert.equal(out.carded, 1);
  // the bank sheet's "Who paid": the card rides to the Feed tab on the line's own verdict, and only where the email named one
  const written = writer.calls.find((c) => c[0] === "feedUpdate")[1];
  assert.equal(written.find((u) => u.feed_id === "F5").card, "Dennis (9301)");
  assert.ok(written.find((u) => u.feed_id === "F5").status, "one update per line: the verdict and the card together");
  assert.equal(written.filter((u) => u.card != null).length, 1);
  assert.match(anthropic.calls[0].messages[0].content, /\| -239\.00 \| LOWES #00907\* 866-483-7521 NC \| card 9301 \(Dennis\)/);
  assert.equal([...anthropic.calls[0].messages[0].content.matchAll(/\| card /g)].length, 1, "only the line the email named");
  const card = await docsStore.get("doc/feed-1401-F5", { type: "json" });
  assert.deepEqual(card.feed.card, { last4: "9301", name: "DENNIS C LITTLE", holder: "Dennis" });

  const broken = { list: async () => { throw new Error("the store is down"); } };
  const quiet = console.error; console.error = () => {};
  try {
    const out2 = await runFeedMatch({ account: ACCOUNT, writer: fakeWriter(), docsStore: fakeDocsStore(), anthropic: fakeAnthropic(answerByAmount), cacheStore: broken, now: "2026-09-28T20:00:00Z" });
    assert.equal(out2.carded, 0);
    assert.equal(out2.summary.total, 7, "the run goes on without the cards");
  } finally { console.error = quiet; }
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

test("audit 2026-10-24 #1/#2a runFeedMatch: a waiting card whose line a posted entry pays for is tied and retired by code; a leftover card is retired; a proposed row with no card is open again", async () => {
  const base = fakeWriter();
  const extraFeed = [
    feedRow(line("F11", "2026-09-16", -8800, "THE HOME DEPOT #6505"), "proposed"),          // its receipt was saved from the Inbox since
    feedRow(line("F12", "2026-09-19", -4321, "LOWES #00907"), "proposed"),                   // its card is gone: a tie that failed
    feedRow(line("F13", "2026-09-10", -2000, "Home Depot Waxahachie"), "matched", "manual-9"), // tied another way; its card never left
    feedRow(line("F14", "2026-09-17", -5285, "1315 HWY 77 NORTH"), "proposed"),               // its receipt was saved split by house (D-041)
  ];
  const extraJournal = [
    journalLine("receipt-11", "2026-09-15", "1030", 8800, { property: "366 Mesa", payee: "The Home Depot" }),
    journalLine("receipt-11", "2026-09-15", ACCOUNT, -8800, { payee: "The Home Depot" }),
    journalLine("receipt-14a", "2026-09-16", "6510", 1000, { property: "OVERHEAD", payee: "The Home Depot" }),
    journalLine("receipt-14a", "2026-09-16", ACCOUNT, -1000, { payee: "The Home Depot" }),
    journalLine("receipt-14b", "2026-09-16", "1030", 4285, { property: "108 Brushwood", payee: "The Home Depot" }),
    journalLine("receipt-14b", "2026-09-16", ACCOUNT, -4285, { payee: "The Home Depot" }),
  ].map(journalRow);
  const writer = {
    calls: base.calls, feedUpdate: base.feedUpdate, postBatch: base.postBatch,
    read: async (tab) => { const t = await base.read(tab); return tab === "Feed" ? { ...t, rows: [...t.rows, ...extraFeed] } : tab === "Journal" ? { ...t, rows: [...t.rows, ...extraJournal] } : t; },
  };
  const docsStore = fakeDocsStore();
  const card = (id, ids) => ({ docId: `feed-1401-${id}`, source: "feed", status: "pending", feed: { account: ACCOUNT, feed_ids: ids, amount_cents: -8800 }, model: { vendor: "x" } });
  await docsStore.setJSON("doc/feed-1401-F11", card("F11", ["F11"]));
  await docsStore.setJSON("doc/feed-1401-F13", card("F13", ["F13"]));
  await docsStore.setJSON("doc/feed-1401-F14", { ...card("F14", ["F14"]), feed: { account: ACCOUNT, feed_ids: ["F14"], amount_cents: -5285 } });
  await docsStore.setJSON("doc/feed-1402-F99", { ...card("F99", ["F99"]), docId: "feed-1402-F99" });   // another account: untouched
  const anthropic = fakeAnthropic(answerByAmount);
  const out = await runFeedMatch({ account: ACCOUNT, writer, docsStore, anthropic, now: "2026-09-28T20:00:00Z" });

  const sent = [...anthropic.calls[0].messages[0].content.matchAll(/^L\d+ \| /gm)].length;
  assert.equal(sent, 8, "the seven open lines (F8 is recorded by code, D-093) plus F12, open again");
  assert.doesNotMatch(anthropic.calls[0].system[0].text, /receipt-11|8,?800\.00/, "the entry that pays F11 was spent before the model saw it");
  assert.equal(out.summary.retired, 3);
  assert.equal(out.summary.reopened, 1);
  const upd = writer.calls.find((c) => c[0] === "feedUpdate")[1];
  const byId = Object.fromEntries(upd.map((u) => [u.feed_id, u]));
  assert.equal(byId.F11.status, "matched");
  assert.equal(byId.F11.txn_id, "receipt-11");
  assert.match(byId.F11.match_note, /receipt came in and was recorded/);
  assert.ok(byId.F12, "F12 got a verdict this run");
  assert.equal(byId.F13, undefined, "a matched row is not rewritten");
  assert.equal(byId.F14.status, "matched");
  assert.equal(byId.F14.txn_id, "receipt-14a, receipt-14b", "a receipt split by house ties as one");
  assert.doesNotMatch(anthropic.calls[0].system[0].text, /receipt-14/, "both halves were spent before the model saw them");
  assert.equal((await docsStore.get("doc/feed-1401-F14", { type: "json" })).status, "dismissed");
  const f11 = await docsStore.get("doc/feed-1401-F11", { type: "json" });
  assert.equal(f11.status, "dismissed");
  assert.equal(f11.review.by, "claude");
  const f13 = await docsStore.get("doc/feed-1401-F13", { type: "json" });
  assert.equal(f13.status, "dismissed");
  assert.match(f13.review.note, /already tied \(manual-9\)/);
  assert.equal((await docsStore.get("doc/feed-1402-F99", { type: "json" })).status, "pending");
});

test("audit 2026-10-24 #14 runFeedMatch: an entry tied on one account's row is still a candidate on the other account it touches (a transfer between Recast's accounts)", async () => {
  const base = fakeWriter();
  const extraFeed = [feedRow(line("F20", "2026-09-20", -100000, "Online Transfer to CHK ...6317"), "matched", "transfer-1")];
  const extraJournal = [
    journalLine("transfer-1", "2026-09-20", "1402", 100000, { payee: "Transfer", source: "manual" }),
    journalLine("transfer-1", "2026-09-20", ACCOUNT, -100000, { payee: "Transfer", source: "manual" }),
  ].map(journalRow);
  const writer = {
    calls: base.calls, feedUpdate: base.feedUpdate, postBatch: base.postBatch,
    read: async (tab) => { const t = await base.read(tab); return tab === "Feed" ? { ...t, rows: [...t.rows, ...extraFeed] } : tab === "Journal" ? { ...t, rows: [...t.rows, ...extraJournal] } : t; },
  };
  const anthropic = fakeAnthropic(answerByAmount);
  await runFeedMatch({ account: "1402", writer, docsStore: fakeDocsStore(), anthropic, now: "2026-09-28T20:00:00Z" });
  assert.match(anthropic.calls[0].system[0].text, /transfer-1|1,?000\.00 \| Transfer/, "the Chase side of the transfer is offered on the Chase run");
  const again = fakeAnthropic(answerByAmount);
  await runFeedMatch({ account: ACCOUNT, writer, docsStore: fakeDocsStore(), anthropic: again, now: "2026-09-28T20:00:00Z" });
  assert.doesNotMatch(again.calls[0].system[0].text, /Transfer/, "on the Citizens run it is tied already");
});

// ---- D-093: the bank's own fees under the ceiling, recorded by code -----------------------------

test("D-093 isBankFee: the bank's own charge - money out, under 50.00, FEE or CHARGE as a whole word or a check order; a utility's SERVFEE, a fee of 50.00, money in and a store line are not", async () => {
  const { isBankFee, bankFeeIntent, BANK_FEE_CEILING_CENTS, BANK_FEE_ACCOUNT, MATCH_PROMPT } = await import("../lib/feed-match.mjs");
  assert.match(MATCH_PROMPT, /a utility bill and its online-payment or card-processing fee \(MUNICIPAL ONLINE PAYMEN, SERVFEE\) that the receipt itemises are two lines for one entry - match both to it, never ask whether to split them/,
    "2026-10-25: the 10-06 run asked Paul about the 2.00 Municipal Online Payments line and the 298.72 Red Oak line instead of matching both to the 300.72 receipt");
  const { buildEntry } = await import("../lib/posting.mjs");
  assert.equal(BANK_FEE_CEILING_CENTS, 5000);
  assert.equal(BANK_FEE_ACCOUNT, "6910", "the chart's Bank & merchant fees, never 6930 (interest)");
  assert.match(MATCH_PROMPT, /OVERHEAD 6910 Bank & merchant fees - never 6930/, "the model is told the same account");
  const yes = [
    line("A1", "2026-09-07", -100, "FOREIGN ATM CHARGE SUPL CD 11", "FOREIGN ATM CHARGE SUPL CD 11 1 AT 1.00"),
    line("A2", "2026-09-09", -2500, "Wire transfer fee"),
    line("A3", "2026-08-11", -2815, "DELUXE CHECK -CHECK/ACC."),
    line("A4", "2026-09-01", -1200, "MONTHLY SERVICE CHARGE"),
    line("A5", "2026-09-01", -4999, "CHECK ORDER"),
  ];
  const no = [
    line("N1", "2026-09-08", -994, "WAXAHACHIE SERVFEE PLANO TX"),
    line("N2", "2026-09-02", -4726, "TYL WAXAHACHIE SERVFEE PLANO", "TYL WAXAHACHIE SERVFEE PLANO TX"),
    line("N3", "2026-09-01", -5000, "MONTHLY SERVICE CHARGE"),
    line("N4", "2026-09-01", 100, "FEE REFUND"),
    line("N5", "2026-09-14", -2390, "LOWES #00907* 866-483-7521 NC"),
    line("N6", "2026-09-07", -100, "", ""),
  ];
  for (const l of yes) assert.ok(isBankFee(l), `${l.feed_id} ${l.memo} is the bank's own fee`);
  for (const l of no) assert.ok(!isBankFee(l), `${l.feed_id} ${l.memo} is not`);
  const entry = buildEntry(bankFeeIntent(yes[0], ACCOUNT, "Citizens Bank"), ctx());
  assert.equal(entry.source, "bank");
  assert.equal(entry.posted_by, "claude");
  assert.match(entry.memo, /Citizens Bank fee 1\.00 - the bank's own charge, recorded from the bank line/);
  assert.deepEqual(entry.lines.map((l) => [l.account, l.debit, l.credit, l.property, l.payee]), [["6910", 100, 0, "OVERHEAD", "Citizens Bank"], [ACCOUNT, 0, 100, "OVERHEAD", "Citizens Bank"]]);
  assert.equal(entry.lines[0].description, "FOREIGN ATM CHARGE SUPL CD 11 1 AT 1.00", "the bank's own text is the description");
});

test("D-093 runFeedMatch: the bank's own fees are settled before the model sees the lines - a fee the books hold is tied to it, the rest posted one at a time on the line's own id (a DUPLICATE still tied), a waiting one-line card retired; a utility's SERVFEE still goes to the model", async () => {
  const { WriterError } = await import("../lib/writer-client.mjs");
  const base = fakeWriter();
  const F11 = line("F11", "2026-10-07", -100, "FOREIGN ATM CHARGE SUPL CD 11", "FOREIGN ATM CHARGE SUPL CD 11 1 AT 1.00");
  const F12 = line("F12", "2026-10-07", -100, "FOREIGN ATM CHARGE SUPL CD 11", "FOREIGN ATM CHARGE SUPL CD 11 1 AT 1.00");
  const F13 = line("F13", "2026-10-08", -994, "WAXAHACHIE SERVFEE PLANO TX");
  const F14 = line("F14", "2026-10-09", -2500, "Wire transfer fee");
  const extraJournal = [
    journalLine("manual-25", "2026-10-09", "6910", 2500, { property: "OVERHEAD", payee: "Citizens National Bank of Texas", source: "manual" }),
    journalLine("manual-25", "2026-10-09", ACCOUNT, -2500, { payee: "Citizens National Bank of Texas", source: "manual" }),
  ].map(journalRow);
  const posted = [];
  const writer = {
    calls: base.calls, feedUpdate: base.feedUpdate,
    read: async (tab) => { const r = await base.read(tab); return tab === "Feed" ? { ...r, rows: [...r.rows, feedRow(F11), feedRow(F12, "proposed"), feedRow(F13), feedRow(F14)] } : tab === "Journal" ? { ...r, rows: [...r.rows, ...extraJournal] } : r; },
    postBatch: async (entries, opts) => {
      posted.push([entries, opts]);
      if (entries[0].txn_id === "bank-1401-F12") throw new WriterError("DUPLICATE", "txn_id already in Journal");
      return { ok: true, posted: entries.map((e) => e.txn_id), rows: [1, 2] };
    },
  };
  const docsStore = fakeDocsStore();
  await docsStore.setJSON("doc/feed-1401-F12", { docId: "feed-1401-F12", status: "pending", source: "feed", feed: { account: ACCOUNT, feed_ids: ["F12"], amount_cents: -100 }, model: { why: "a second $1 charge" } });
  const anthropic = fakeAnthropic(answerByAmount);
  const out = await runFeedMatch({ account: ACCOUNT, writer, docsStore, anthropic, now: "2026-10-25T20:00:00Z" });
  assert.deepEqual(posted.map((p) => p[0][0].txn_id).sort(), ["bank-1401-F11", "bank-1401-F12", "bank-1401-F8"], "one post per fee the books do not hold; F14 is never posted");
  assert.ok(posted.every((p) => p[0].length === 1 && p[1].skipRefresh === true), "one at a time, no house tab to rebuild");
  assert.equal(posted[0][0][0].lines[0].account, "6910");
  const prompt = anthropic.calls[0].messages[0].content;
  assert.doesNotMatch(prompt, /FOREIGN ATM|Wire transfer fee|DELUXE/, "a settled fee never reaches the model");
  assert.match(prompt, /SERVFEE/, "the utility's processing fee still does");
  const upd = writer.calls.find((c) => c[0] === "feedUpdate")[1];
  const byId = Object.fromEntries(upd.map((u) => [u.feed_id, u]));
  assert.equal(byId.F11.status, "matched");
  assert.equal(byId.F11.txn_id, "bank-1401-F11");
  assert.match(byId.F11.match_note, /The bank's own fee, under \$50\.00 - recorded on its own \(your rule of 10-25\)/);
  assert.equal(byId.F12.status, "matched", "DUPLICATE means it is already there: tied, not left open");
  assert.equal(byId.F12.txn_id, "bank-1401-F12");
  assert.equal(byId.F14.status, "matched");
  assert.equal(byId.F14.txn_id, "manual-25", "the wire fee Paul typed is tied, not posted again");
  assert.match(byId.F14.match_note, /already in the books \(manual-25\)/);
  assert.equal(byId.F13.status, "proposed", "the 9.94 SERVFEE is still Paul's card");
  assert.doesNotMatch(anthropic.calls[0].system[0].text, /manual-25/, "the tied entry is no candidate any more");
  const card = await docsStore.get("doc/feed-1401-F12", { type: "json" });
  assert.equal(card.status, "dismissed");
  assert.equal(card.review.by, "claude");
  assert.match(card.review.note, /recorded on its own/);
  assert.equal(out.summary.fees, 4);
});

// ---- D-094: a utility's card or online fee under 50.00 is recorded with its bill, no card --------------------------

test("D-094 isUtilityFeeLine / buildBills / utilityFeeIntent: the utility's own fee words under 50.00 and money out; the bills of the last 45 days with a house; the intent only for one item on 1120 for the bill's house", async () => {
  const { isUtilityFeeLine, buildBills, utilityFeeIntent, UTILITY_FEE_ACCOUNT, BILL_DAYS, MATCH_PROMPT, VERDICTS_TOOL: tool } = await import("../lib/feed-match.mjs");
  const { buildEntry } = await import("../lib/posting.mjs");
  assert.equal(BILL_DAYS, 45);
  assert.equal(UTILITY_FEE_ACCOUNT, "1120");
  const yes = [
    line("U1", "2026-10-08", -994, "WAXAHACHIE SERVFEE PLANO TX"),
    line("U2", "2026-09-02", -4726, "TYL WAXAHACHIE SERVFEE PLANO", "TYL WAXAHACHIE SERVFEE PLANO TX"),
    line("U3", "2026-10-02", -200, "MUNICIPAL ONLINE PAYMEN 844-7", "MUNICIPAL ONLINE PAYMEN 844-7244507 TX"),
  ];
  const no = [
    line("N1", "2026-10-05", -29872, "CITY OF RED OAK ECOMM 972-617"),
    line("N2", "2026-10-08", -5000, "WAXAHACHIE SERVFEE PLANO TX"),
    line("N3", "2026-10-08", 994, "WAXAHACHIE SERVFEE PLANO TX"),
    line("N4", "2026-10-07", -100, "FOREIGN ATM CHARGE SUPL CD 11"),
    line("N5", "2026-10-13", -3784, "Home Depot Waxahachie"),
  ];
  for (const l of yes) assert.ok(isUtilityFeeLine(l), `${l.feed_id} is the utility's fee`);
  for (const l of no) assert.ok(!isUtilityFeeLine(l), `${l.feed_id} is not`);
  assert.match(MATCH_PROMPT, /A utility's own fee for paying by card or online \(SERVFEE, MUNICIPAL ONLINE PAYMEN\) under 50\.00[^.]*the house whose bill it came with/);
  assert.ok(tool.input_schema.properties.proposals.items.required.includes("bill"), "a proposal names the bill it came with");

  const bills = buildBills(JOURNAL, ACCOUNT, "2026-09-28");
  assert.deepEqual(bills.map((b) => [b.txn_id, b.property, b.amount_cents]), [["manual-2", "Cost Recapture", 109640], ["manual-3", "108 Brushwood", 10000]], "the two water bills of 09-01, tied or not; a voided entry and the store never");
  assert.deepEqual(buildBills(JOURNAL, ACCOUNT, "2026-11-30"), [], "older than 45 days: gone");

  const entry = { date: "2026-10-08", payee: "City of Waxahachie", memo: "Card service fee", property: "108 Brushwood", paid_from: ACCOUNT, items: [{ account: "1120", amount_cents: 994, description: "Service fee", trade: "Utilities" }] };
  const bill = { txn_id: "manual-3", property: "108 Brushwood" };
  const intent = utilityFeeIntent(yes[0], entry, ACCOUNT, bill);
  assert.equal(intent.type, "purchase");
  assert.equal(intent.property, "108 Brushwood");
  assert.equal(intent.source, "bank");
  assert.equal(intent.posted_by, "claude");
  assert.deepEqual(intent.items, [{ account: "1120", amount_cents: 994, description: "Service fee", trade: "Utilities" }]);
  assert.equal(utilityFeeIntent(yes[0], entry, ACCOUNT, null), null, "no bill named: a card");
  assert.equal(utilityFeeIntent(yes[0], entry, ACCOUNT, { txn_id: "manual-2", property: "Cost Recapture" }), null, "the bill's house is not the proposal's: a card");
  assert.equal(utilityFeeIntent(yes[0], { ...entry, property: "OVERHEAD" }, ACCOUNT, { txn_id: "x", property: "OVERHEAD" }), null, "never OVERHEAD");
  assert.equal(utilityFeeIntent(yes[0], { ...entry, items: [{ ...entry.items[0], account: "1030" }] }, ACCOUNT, bill), null, "not on 1120: a card");
  assert.equal(utilityFeeIntent(yes[0], { ...entry, items: [{ ...entry.items[0], amount_cents: 1000 }] }, ACCOUNT, bill), null, "does not add up: a card");
  assert.equal(utilityFeeIntent(no[5 - 1], entry, ACCOUNT, bill), null, "a store line is never one");
  const built = buildEntry(intent, makeCtx({ accounts: new Map(ACCOUNTS.map((a) => [a.code, a])), properties: new Set(["108 Brushwood"]), periods: new Map(), today: "2026-10-25" }));
  assert.equal(built.lines.length, 2);
  assert.equal(built.lines[0].account, "1120");
  assert.equal(built.lines[0].property, "108 Brushwood");
});

test("D-094 applyVerdicts: a proposal that is a utility's fee for its bill's house is an autopost with the card as its fallback, not a card; the same proposal with no bill is a card", () => {
  const fee = line("U1", "2026-10-08", -994, "WAXAHACHIE SERVFEE PLANO TX");
  const entry = { date: "2026-10-08", payee: "City of Waxahachie", memo: "Card service fee", property: "108 Brushwood", paid_from: "1402", attachment: -1, items: [{ account: "1120", amount_cents: 994, description: "Service fee", trade: "Utilities", business_purpose: null }] };
  const base = { lines: [fee], candidates: [], account: ACCOUNT, accountName: "Citizens", ctx: ctx(), now: "2026-10-25T20:00:00Z" };
  const withBill = applyVerdicts({ ...base, verdicts: [{ kind: "propose", feed_ids: ["U1"], txn_ids: [], entry, note: "The city's card fee on the 10-08 water bill for 108 Brushwood", bill: { txn_id: "receipt-bill", property: "108 Brushwood" } }] });
  assert.equal(withBill.envelopes.length, 0, "no card");
  assert.equal(withBill.updates.length, 0, "the run writes the row after it posts");
  assert.equal(withBill.summary.cards, 0);
  assert.equal(withBill.autoposts.length, 1);
  const a = withBill.autoposts[0];
  assert.equal(a.txn_id, "bank-1401-U1");
  assert.equal(a.intent.paid_from, ACCOUNT, "paid from this account whatever the model wrote");
  assert.equal(a.intent.property, "108 Brushwood");
  assert.equal(a.fallback.env.docId, "feed-1401-U1");
  assert.equal(a.fallback.env.status, "pending");
  assert.deepEqual(a.fallback.updates.map((u) => [u.feed_id, u.status]), [["U1", "proposed"]]);
  const noBill = applyVerdicts({ ...base, verdicts: [{ kind: "propose", feed_ids: ["U1"], txn_ids: [], entry, note: "a fee", bill: null }] });
  assert.equal(noBill.autoposts.length, 0);
  assert.equal(noBill.envelopes.length, 1, "Paul's card, as before");
  assert.equal(noBill.summary.cards, 1);
});

test("D-094 runFeedMatch: the waiting SERVFEE card goes back to the model with RECENT BILLS in view; its proposal for the bill's house posts on the line's id, the line is tied, the card retired, the summary counts it", async () => {
  const base = fakeWriter();
  const F13 = line("F13", "2026-10-08", -994, "WAXAHACHIE SERVFEE PLANO TX");
  const F15 = line("F15", "2026-10-08", -25164, "CITY OF WAXAHACHIE WAXAHACHIE");
  const today = new Date().toISOString().slice(0, 10);
  const billDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);   // inside the 45-day window whatever today is
  const extraJournal = [
    journalLine("receipt-bill", billDate, "1120", 25164, { property: "108 Brushwood", payee: "City of Waxahachie - Utility Billing", description: "water", paid_from: ACCOUNT }),
    journalLine("receipt-bill", billDate, ACCOUNT, -25164, { payee: "City of Waxahachie - Utility Billing", paid_from: ACCOUNT }),
  ].map(journalRow);
  const posted = [];
  const writer = {
    calls: base.calls, feedUpdate: base.feedUpdate,
    read: async (tab) => { const r = await base.read(tab); return tab === "Feed" ? { ...r, rows: [...r.rows, feedRow(F13, "proposed"), feedRow(F15, "matched", "receipt-bill")] } : tab === "Journal" ? { ...r, rows: [...r.rows, ...extraJournal] } : r; },
    postBatch: async (entries, opts) => { posted.push([entries, opts]); return { ok: true, posted: entries.map((e) => e.txn_id), rows: [1, 2] }; },
  };
  const docsStore = fakeDocsStore();
  await docsStore.setJSON("doc/feed-1401-F13", { docId: "feed-1401-F13", status: "pending", source: "feed", feed: { account: ACCOUNT, feed_ids: ["F13"], amount_cents: -994 }, model: { why: "The $9.94 service fee that came with the Waxahachie water bill" } });
  const answer = (lines, cands, bills) => {
    const out = answerByAmount(lines, cands);
    const l = lines.find((x) => x.amount === "-9.94");
    const b = bills.find((x) => x.amount === "251.64");
    out.questions = out.questions.filter((q) => !q.lines.includes(l.alias));
    out.proposals.push({ lines: [l.alias], bill: b.alias, note: "The city's card fee on the 10-08 water bill for 108 Brushwood",
      entry: { date: "2026-10-08", payee: "City of Waxahachie - Utility Billing", memo: "Card service fee on the water payment", property: "108 Brushwood", paid_from: ACCOUNT, attachment: -1, items: [{ account: "1120", amount_cents: 994, description: "Service fee on the water payment", trade: "Utilities", business_purpose: null }] } });
    return out;
  };
  const anthropic = fakeAnthropic(answer);
  const out = await runFeedMatch({ account: ACCOUNT, writer, docsStore, anthropic, now: "2026-10-25T21:00:00Z" });
  const sys = anthropic.calls[0].system[0].text;
  assert.match(sys, new RegExp(`RECENT BILLS[^\\n]*\\nB1 \\| ${billDate} \\| 251\\.64 \\| City of Waxahachie - Utility Billing \\| 108 Brushwood`), "the tied bill is in view");
  assert.match(anthropic.calls[0].messages[0].content, /SERVFEE/, "the waiting fee line went back to the model");
  const fee = posted.find((p) => p[0][0].txn_id === "bank-1401-F13");
  assert.ok(fee, "the fee posted on the line's own id");
  assert.equal(fee[0][0].lines[0].account, "1120");
  assert.equal(fee[0][0].lines[0].property, "108 Brushwood");
  assert.ok(!fee[1] || !fee[1].skipRefresh, "a house cost: the house tab is rebuilt");
  const upd = writer.calls.find((c) => c[0] === "feedUpdate")[1];
  const byId = Object.fromEntries(upd.map((u) => [u.feed_id, u]));
  assert.equal(byId.F13.status, "matched");
  assert.equal(byId.F13.txn_id, "bank-1401-F13");
  assert.match(byId.F13.match_note, /recorded with its bill \(your rule of 10-25\)/);
  const card = await docsStore.get("doc/feed-1401-F13", { type: "json" });
  assert.equal(card.status, "dismissed");
  assert.equal(card.review.by, "claude");
  assert.match(card.review.note, /recorded with its bill/);
  assert.equal(out.summary.utility_fees, 1);
  assert.equal(today.length, 10);
});

test("D-096 the matcher: a store charge with no receipt is a question - never a house from the amount, the date or what other houses are buying", async () => {
  const { MATCH_PROMPT } = await import("../lib/feed-match.mjs");
  assert.match(MATCH_PROMPT, /a store charge with no receipt on the books is a question: what was bought and for which house - never a house from the amount, the date or what other houses are buying/);
  assert.doesNotMatch(MATCH_PROMPT, /for the house the amount and date point to/);
});
