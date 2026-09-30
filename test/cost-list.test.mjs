import { test } from "node:test";
import assert from "node:assert/strict";
import { costListRows, COST_LIST_HEADER } from "../lib/cost-list.mjs";

const P = "Cost Recapture";
const line = (txn_id, date, account, debit, credit, extra = {}) =>
  ({ txn_id, date, account, debit, credit, property: P, trade: "1616 Granite", payee: "Home Depot", description: "Filter", source: "receipt", void_of: "", ...extra });
const cost = (id, date, cents, who, extra = {}) => {
  const { account = "1030", ...rest } = extra;
  return [
    line(id, date, account, cents, 0, rest),
    who === "Paul" ? line(id, date, "2030", 0, cents, rest) : who === "Dennis" ? line(id, date, "2010", 0, cents, rest) : line(id, date, "1401", 0, cents, rest),
  ];
};

const JOURNAL = [
  ...cost("a", "2026-05-28", 1571, "Paul", { payee: "Amazon.com", description: "Doorbell" }),
  ...cost("b", "2026-06-29", 2054, "Paul"),
  ...cost("c", "2026-08-18", 21364, "Recast account", { account: "1120", payee: "TXU", description: "Electricity", trade: "280 Sparkling" }),
  ...cost("d", "2026-08-30", 5500, "Dennis", { payee: "Falcon Creek", description: "Grass" }),
  // a correction: the closed tab was too high, so Paul is owed less (a negative cost)
  line("e", "2026-09-18", "1120", 0, 16117, { payee: "TXU", description: "Correction" }), line("e", "2026-09-18", "2030", 16117, 0),
  // a payback to Paul: no cost line, money out of the account
  line("f", "2026-09-25", "2030", 3000, 0, { payee: "Paul Bjork", description: "Paid back" }), line("f", "2026-09-25", "1401", 0, 3000),
  // voided: never listed
  ...cost("g", "2026-09-01", 999, "Paul"), line("void-g", "2026-09-28", "1030", 0, 999, { source: "void", void_of: "g" }), line("void-g", "2026-09-28", "2030", 999, 0, { source: "void", void_of: "g" }),
  // another property: not here
  ...cost("h", "2026-09-01", 500, "Paul", { property: "366 Mesa" }),
];

test("the cost list: one row per cost, newest on top, who paid, paid back in date order", () => {
  const { rows, summary } = costListRows(JOURNAL, P);
  assert.ok(rows.every((r) => r.length === COST_LIST_HEADER.length));
  assert.deepEqual(rows, [
    ["2026-09-18", "TXU", "Correction", "1616 Granite", -161.17, "Paul", ""],
    ["2026-08-30", "Falcon Creek", "Grass", "1616 Granite", 55.00, "Dennis", "No"],
    ["2026-08-18", "TXU", "Electricity", "280 Sparkling", 213.64, "Recast account", ""],
    ["2026-06-29", "Home Depot", "Filter", "1616 Granite", 20.54, "Paul", "Part (14.29)"],
    ["2026-05-28", "Amazon.com", "Doorbell", "1616 Granite", 15.71, "Paul", "Yes"],
  ]);
  // Paul: 15.71 + 20.54 - 161.17 = -124.92 owed, less the 30.00 paid back
  assert.deepEqual(summary, ["Paul is owed -154.92 (paid back so far 30.00)", "Dennis is owed 55.00", "Paid from the Recast account: 213.64"]);
});

test("the cost list: nothing paid back yet reads No on every personal line", () => {
  const { rows, summary } = costListRows(JOURNAL.filter((l) => l.txn_id !== "f"), P);
  assert.deepEqual(rows.map((r) => r[6]), ["", "No", "", "No", "No"]);
  assert.equal(summary[0], "Paul is owed -124.92");
});
