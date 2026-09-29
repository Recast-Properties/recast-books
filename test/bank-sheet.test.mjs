import { test } from "node:test";
import assert from "node:assert/strict";
import { bankSheetRows, bankSheetSummary, BANK_SHEET_HEADER, BANK_STATUS, holderOfCard } from "../lib/bank-sheet.mjs";

// a cost line and the bank's side of it, in cents
const line = (txn_id, account, property, description, extra = {}) =>
  ({ txn_id, date: "2026-09-01", account, debit: 0, credit: 0, property, payee: "Home Depot", description, source: "receipt", void_of: "", ...extra });
const paid = (txn_id, account, property, description, cents) =>
  [line(txn_id, account, property, description, { debit: cents }), line(txn_id, "1401", property, description, { credit: cents })];

const JOURNAL = [
  line("t-real", "1030", "366 Mesa", "Siding trim"), line("t-real", "1401", "366 Mesa", "Siding trim"),
  line("t-real2", "1030", "469 Brushwood", "Stain"), line("t-real2", "1401", "469 Brushwood", "Stain"),
  ...paid("t-hold", "1030", "366 Mesa", "NEED RECEIPT FROM DENNIS", 16291),
  ...paid("t-hold2", "1030", "366 Mesa", "NEED RECEIPT FROM DENNIS", 3307),
  ...paid("t-came", "1030", "469 Brushwood", "Deck screws", 3307),
  line("t-gone", "6510", "OVERHEAD", "Tape"), line("t-gone", "1401", "OVERHEAD", "Tape"),
  line("void-t-gone", "6510", "OVERHEAD", "Tape", { source: "void", void_of: "t-gone" }),
];
const feed = (feed_id, date, amount, status, txn_id, match_note, card = "") =>
  ({ feed_id, account: "1401", date, amount, name: "HOME DEPOT", memo: "HOME DEPOT WAXAHACHIE", status, txn_id, match_note, card });

const FEED = [
  feed("1", "2026-08-10", -50, "matched", "t-real, t-real2", "Recorded from the Inbox", "Paul (5450)"),
  feed("2", "2026-09-28", -162.91, "matched", "t-hold, t-hold2", "Recorded from the Inbox", "Dennis (9301)"),
  feed("3", "2026-09-21", -90.67, "proposed", "", "In the Inbox: Home Depot supplies for 469 Brushwood", "Dennis (9301)"),
  feed("4", "2026-09-08", -2500, "proposed", "", "In the Inbox: Check 1021 to Juan Garcia - which house?"),
  feed("5", "2026-09-23", 715558.65, "unmatched", "", "Waits: Closing wire in for the 104 Ashburne sale"),
  feed("6", "2026-09-29", -12, "unmatched", "", ""),
  feed("7", "2026-09-02", -9, "matched", "t-gone", "tied"),
  // one card held two charges: this one's receipt came and took its placeholder's place, the other's has not
  feed("9", "2026-09-27", -33.07, "matched", "t-hold, t-came", "Dennis's working money, no interest (D-055)", "Dennis (9301)"),
  { ...feed("8", "2026-09-30", -1, "matched", "t-real", "another account"), account: "1402" },
];

test("the bank sheet: newest first, the account's lines only, in the header's columns", () => {
  const rows = bankSheetRows(FEED, JOURNAL, "1401");
  assert.equal(rows.length, 8, "the 1402 line is not Citizens'");
  assert.deepEqual(rows.map((r) => r[0]), ["2026-09-29", "2026-09-28", "2026-09-27", "2026-09-23", "2026-09-21", "2026-09-08", "2026-09-02", "2026-08-10"]);
  assert.ok(rows.every((r) => r.length === BANK_SHEET_HEADER.length));
  assert.equal(rows[0][2], "HOME DEPOT WAXAHACHIE", "the bank's longer text");
});

test("the bank sheet: who paid and where each line stands", () => {
  const by = Object.fromEntries(bankSheetRows(FEED, JOURNAL, "1401").map((r) => [r[0], r]));
  const cols = (r) => ({ who: r[3], status: r[4], waiting: r[5], house: r[6], note: r[7] });

  assert.deepEqual(cols(by["2026-08-10"]), { who: "Paul", status: BANK_STATUS.done, waiting: "", house: "366 Mesa, 469 Brushwood", note: "Home Depot - Siding trim (+1 more)" });
  // recorded as a placeholder: reconciled to the bank, still waiting on the person the placeholder names
  assert.deepEqual(cols(by["2026-09-28"]), { who: "Dennis", status: BANK_STATUS.receipt, waiting: "Dennis", house: "366 Mesa", note: "Recorded - the receipt takes its place when it comes" });
  // the entry for this line's own amount speaks for it: its receipt came, so it is reconciled; and no decision number in the note
  assert.deepEqual(cols(by["2026-09-27"]), { who: "Dennis", status: BANK_STATUS.done, waiting: "", house: "469 Brushwood", note: "Dennis's working money, no interest" });
  // a card in the Inbox: a card charge waits on the card's holder, a check on Paul's word
  assert.deepEqual(cols(by["2026-09-21"]), { who: "Dennis", status: BANK_STATUS.receipt, waiting: "Dennis", house: "", note: "Home Depot supplies for 469 Brushwood" });
  assert.deepEqual(cols(by["2026-09-08"]), { who: "", status: BANK_STATUS.answer, waiting: "Paul", house: "", note: "Check 1021 to Juan Garcia - which house?" });
  assert.deepEqual(cols(by["2026-09-23"]), { who: "", status: BANK_STATUS.later, waiting: "", house: "", note: "Closing wire in for the 104 Ashburne sale" });
  assert.equal(by["2026-09-29"][4], BANK_STATUS.fresh);
  // tied to an entry that was voided since: never shown as reconciled
  assert.equal(by["2026-09-02"][4], BANK_STATUS.broken);
});

test("the bank sheet: no ids and no system words reach Paul's tab", () => {
  const text = JSON.stringify(bankSheetRows(FEED, JOURNAL, "1401")) + bankSheetSummary(bankSheetRows(FEED, JOURNAL, "1401"));
  for (const word of ["t-real", "t-hold", "matched", "proposed", "unmatched", "In the Inbox", "Waits:", "NEED RECEIPT", "D-055", "Recorded from"]) {
    assert.ok(!text.includes(word), `"${word}" is on the tab`);
  }
});

test("the bank sheet: the summary counts, and a hand-typed name is a holder too", () => {
  assert.equal(bankSheetSummary(bankSheetRows(FEED, JOURNAL, "1401")), "8 lines - 2 reconciled, 2 waiting on Dennis, 1 waiting on Paul, 1 waiting for a closing");
  assert.equal(holderOfCard("Dennis (9301)"), "Dennis");
  assert.equal(holderOfCard("Dennis"), "Dennis");
  assert.equal(holderOfCard(""), "");
});
