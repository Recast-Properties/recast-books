// test/tax.test.mjs - the Taxes tab (lib/tax.mjs): the arithmetic against a return worked by hand from the
// published 2026 tables, and the tab's rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { taxEstimate, taxFacts, taxTab, TAX_INPUTS, CARRIED_OVER } from "../lib/tax.mjs";

test("taxEstimate: 100,000 of profit, single, worked by hand from the 2026 tables", () => {
  // 92,350 x 15.3% = 14,129.55; income 100,000 - 7,064.78 = 92,935.22; less 16,100 = 76,835.22;
  // business deduction 20% of that = 15,367.05; taxed on 61,468.18: 5,800 + 22% of 11,068.18 = 8,235.00.
  // Oregon: 92,935.22 - 2,900 - 8,235.00 = 81,800.22: 678.50 + 8.75% of 70,400.22 = 6,838.52.
  assert.deepEqual(taxEstimate({ year: "2026", status: "single", profit_cents: 10000000 }),
    { self_employment: 1412955, fed_income: 823500, oregon: 683852, business_deduction: 1536705, carried_off: 0 });
});

test("taxEstimate: high income, married - wage base cap, extra Medicare, no business deduction, no federal subtraction", () => {
  // 600,000 x 92.35% = 554,100: 12.4% of 184,500 + 2.9% of 554,100 = 38,946.90, + 0.9% of 304,100 = 2,736.90.
  // income 600,000 - 19,473.45 = 580,526.55; less 32,200 = 548,326.55 (the deduction is all but gone at 553,500):
  // kept (553,500 - 548,326.55) / 150,000 = 3.449%, deduction 20% x 580,526.55 x 3.449% = 4,004.43
  // taxed on 544,322.12: 116,896 + 35% of 31,872.12 = 128,051.24
  // Oregon: 580,526.55 - 5,800 (no federal subtraction above 290,000) = 574,726.55: 21,237 + 9.9% of 324,726.55 = 53,384.93 (chart J)
  const t = taxEstimate({ year: 2026, status: "married", profit_cents: 60000000 });
  assert.equal(t.self_employment, 3894690 + 273690);
  assert.equal(t.business_deduction, 400443);
  assert.equal(t.fed_income, 12805124);
  assert.equal(t.oregon, 5338493);
});

test("taxEstimate: a loss owes nothing; a year with no table is null, never a guess", () => {
  assert.deepEqual(taxEstimate({ year: "2026", status: "single", profit_cents: -500000 }), { self_employment: 0, fed_income: 0, oregon: 0, business_deduction: 0, carried_off: 0 });
  assert.equal(taxEstimate({ year: "2031", status: "single", profit_cents: 10000000 }), null);
});

test("taxEstimate: what the 2025 return carries into 2026, worked by hand (married, 100,000 profit, 100,000 of paychecks)", () => {
  // home office 1,111 off the profit: 98,889 x 92.35% = 91,323.99 x 15.3% = 13,972.57
  // income 98,889 + 100,000 - 6,986.29 - 3,000 of the investment loss = 188,902.71; less 32,200 = 156,702.71
  // business deduction 20% of (98,889 - 6,986.29 - 32,135 of 2025 losses) = 11,953.54
  // taxed on 144,749.17: 11,600 + 22% of 43,949.17 = 21,268.82
  // Oregon: 188,902.71 - 5,800 - 8,750 = 174,352.71: 1,357 + 8.75% of 151,552.71 = 14,617.86
  const carried = CARRIED_OVER[2026];
  assert.deepEqual(carried, { home_office: 1111, investment_loss: 37452, business_loss: 32135 }, "the 2025 return's carryover page");
  assert.deepEqual(taxEstimate({ year: 2026, status: "married", profit_cents: 10000000, other_cents: 10000000, carried }),
    { self_employment: 1397257, fed_income: 2126882, oregon: 1461786, business_deduction: 1195354, carried_off: 411100 });
  // no profit: the home office costs wait again, the 3,000 still comes off the other income
  assert.equal(taxEstimate({ year: 2026, status: "married", profit_cents: -500000, other_cents: 10000000, carried }).carried_off, 300000);
});

const L = (txn_id, date, account, debit, credit, extra = {}) =>
  ({ txn_id, date, account, debit, credit, property: "OVERHEAD", description: "", source: "manual", void_of: "", tax_treatment: "", ...extra });

test("taxFacts: the year's profit, half of meals, lines labelled Non-deductible (a voided one is not counted)", () => {
  const lines = [
    L("s", "2026-08-10", "4000", 0, 10000000, { property: "2 Oak" }), L("s", "2026-08-10", "5000", 4000000, 0, { property: "2 Oak" }),
    L("m", "2026-03-01", "6710", 20000, 0),
    L("f", "2026-05-08", "6600", 28095, 0, { tax_treatment: "Non-deductible" }),
    L("x", "2026-05-09", "6600", 5000, 0, { tax_treatment: "Non-deductible" }), L("vx", "2026-05-09", "6600", 0, 5000, { source: "void", void_of: "x", tax_treatment: "Non-deductible" }),
    L("t", "2026-06-01", "6700", 50000, 0),
    L("old", "2025-12-31", "6700", 99900, 0),
  ];
  assert.deepEqual(taxFacts(lines, "2026-10-02"), { year: "2026", earned: 6000000 - 20000 - 28095 - 50000, meals_half: 10000, fines: 28095, travel: 50000 });
});

test("taxTab: plain rows, Paul's typed cells kept, a house counts only when he typed yes", () => {
  const facts = { year: "2026", earned: 5000000, meals_half: 10000, fines: 28095, travel: 800000 };
  const houses = [{ name: "104 Ashburne", profit_cents: 12800000 }, { name: "366 Mesa", profit_cents: 3000000 }, { name: "200 Janice", profit_cents: null }];
  const by = (t) => Object.fromEntries(t.rows.filter((r) => r[0]).map((r) => [r[0], r[1]]));

  const first = taxTab(facts, houses);
  assert.equal(first.rows.length, first.kinds.length);
  assert.equal(by(first)[TAX_INPUTS.status], "single", "single until he says otherwise");
  assert.equal(by(first)["Profit you are taxed on"], 50380.95, "no house counted until he types yes");
  const carried = CARRIED_OVER[2026];
  const e = taxEstimate({ year: "2026", status: "single", profit_cents: 5038095, carried });
  assert.equal(by(first)["SET ASIDE FOR BOTH"], (e.self_employment + e.fed_income + e.oregon) / 100);

  const typed = { [TAX_INPUTS.status]: ["Married", ""], [TAX_INPUTS.other]: [40000, ""], [TAX_INPUTS.paid_irs]: [10000, ""], [TAX_INPUTS.paid_or]: ["", ""],
    "104 Ashburne": [128000, "Yes"], "366 Mesa": [30000, ""], "200 Janice": ["no sale price yet", "yes"] };
  const t = taxTab(facts, houses, typed);
  const b = by(t);
  assert.equal(b[TAX_INPUTS.status], "married");
  assert.equal(b[TAX_INPUTS.other], 40000);
  assert.equal(t.rows.find((r) => r[0] === "104 Ashburne")[2], "yes");
  assert.equal(t.rows.find((r) => r[0] === "366 Mesa")[2], "");
  assert.equal(b["200 Janice"], "no sale price yet", "a held house with no sale price on its tab is listed");
  assert.equal(b["Profit you are taxed on"], 178380.95, "and adds nothing, even marked yes");
  const m = taxEstimate({ year: "2026", status: "married", profit_cents: 17838095, other_cents: 4000000, carried });
  assert.equal(b["Loss on investments, not used yet"], 37452, "the whole loss is shown");
  assert.equal(b["Comes off your income this year"], -4111, "1,111 of home office and 3,000 of the investment loss - not the 32,135 already used in 2025");
  assert.match(t.rows.find((r) => r[0] === "2025 business and rental losses")[2], /^NOT a loss you can use again/);
  assert.equal(b["Still owed to the IRS"], (m.self_employment + m.fed_income) / 100 - 10000);
  assert.equal(b["Still owed to Oregon"], m.oregon / 100);
  assert.equal(b["SET ASIDE FOR BOTH"], (m.self_employment + m.fed_income + m.oregon) / 100 - 10000);
  assert.equal(t.kinds.filter((k) => k === "input").length, 4);
  assert.equal(t.kinds.filter((k) => k === "house").length, 3);
  assert.ok(!JSON.stringify(t.rows.map((r) => [r[0], r[2]])).match(/\b(6600|6700|6710|QBI|AGI|Schedule|self-employment|accrual|ledger|journal)\b/i), "no account codes or tax-form words");

  const none = taxTab({ ...facts, year: "2031" }, houses, typed);
  assert.match(none.rows.at(-1)[0], /NO TAX TABLES FOR 2031/);
  assert.equal(none.rows.length, 7, "the typed cells stay, nothing is worked out");
});
