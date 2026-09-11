import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMonthsClamped,
  daysBetween,
  lastDayOf,
  accruedThrough,
  interestForPeriod,
  payoffAt,
  schedule,
} from "../lib/accrual.mjs";

// --- addMonthsClamped ------------------------------------------------------
// D-010: anniversary k = addMonthsClamped(date, k), clamped to the target month's last
// day when it overflows.

test("addMonthsClamped clamps a Jan-31 advance's anniversaries", () => {
  assert.equal(addMonthsClamped("2026-01-31", 1), "2026-02-28"); // 2026 is not a leap year
  assert.equal(addMonthsClamped("2026-01-31", 2), "2026-03-31");
  assert.equal(addMonthsClamped("2026-01-31", 3), "2026-04-30");
});

test("addMonthsClamped does not clamp when the day fits", () => {
  assert.equal(addMonthsClamped("2026-06-29", 1), "2026-07-29");
  assert.equal(addMonthsClamped("2026-06-29", 2), "2026-08-29");
  assert.equal(addMonthsClamped("2026-06-29", 3), "2026-09-29");
});

test("addMonthsClamped rolls the year over", () => {
  assert.equal(addMonthsClamped("2026-11-15", 2), "2027-01-15");
});

// --- daysBetween / lastDayOf ------------------------------------------------

test("daysBetween counts whole calendar days in UTC", () => {
  assert.equal(daysBetween("2026-08-29", "2026-09-11"), 13);
  assert.equal(daysBetween("2026-09-09", "2026-09-11"), 2);
  assert.equal(daysBetween("2026-01-01", "2026-01-01"), 0);
});

test("lastDayOf returns the last calendar day of a period", () => {
  assert.equal(lastDayOf("2026-02"), "2026-02-28");
  assert.equal(lastDayOf("2026-09"), "2026-09-30");
  assert.equal(lastDayOf("2024-02"), "2024-02-29"); // leap year
});

// --- accruedThrough golden values (phase1-spec.md §1, docs/property-tab-anatomy.md) ---
// 881 Newport, reproduced to the cent against the live tab.

test("golden: 207000.00 purchase principal from 2026-06-29 as of 2026-09-11", () => {
  const advance = { amount_cents: 20700000, date: "2026-06-29" };
  assert.equal(accruedThrough(advance, "2026-09-11"), 379952);
});

test("golden: 2000.00 cash advance from 2026-07-09 as of 2026-09-11", () => {
  const advance = { amount_cents: 200000, date: "2026-07-09" };
  assert.equal(accruedThrough(advance, "2026-09-11"), 3113);
});

// --- accruedThrough edge rules ---------------------------------------------

test("accruedThrough is 0 as of the advance date, and before it", () => {
  const advance = { amount_cents: 20700000, date: "2026-06-29" };
  assert.equal(accruedThrough(advance, "2026-06-29"), 0);
  assert.equal(accruedThrough(advance, "2026-06-01"), 0);
});

test("accruedThrough at the first anniversary is round(P*r), no stub", () => {
  const advance = { amount_cents: 100000, date: "2026-01-15" }; // $1,000.00
  const firstAnniversary = addMonthsClamped(advance.date, 1);
  assert.equal(firstAnniversary, "2026-02-15");
  const r = 0.09 / 12;
  assert.equal(accruedThrough(advance, firstAnniversary), Math.round(100000 * r));
});

test("accruedThrough freezes at repaid_date when repaid before asOf", () => {
  const advance = { amount_cents: 200000, date: "2026-07-09", repaid_date: "2026-09-09" };
  const frozen = accruedThrough(advance, "2026-09-09");
  // Same result whether asked as of the repaid date or any later date.
  assert.equal(accruedThrough(advance, "2026-12-31"), frozen);
  assert.equal(accruedThrough({ ...advance, repaid_date: undefined }, "2026-09-09"), frozen);
});

test("accruedThrough respects custom rateAnnual/stubBasis", () => {
  const advance = { amount_cents: 100000, date: "2026-01-01" };
  const zeroInterest = accruedThrough(advance, "2026-06-01", { rateAnnual: 0 });
  assert.equal(zeroInterest, 0);
});

// --- interestForPeriod ------------------------------------------------------

test("interestForPeriod is the delta of cumulative accruedThrough figures", () => {
  const advance = { amount_cents: 20700000, date: "2026-06-29" };
  const delta = interestForPeriod(advance, "2026-09");
  const expected = accruedThrough(advance, "2026-09-30") - accruedThrough(advance, "2026-08-31");
  assert.equal(delta, expected);
});

test("interestForPeriod is 0 before the advance date", () => {
  const advance = { amount_cents: 20700000, date: "2026-06-29" };
  assert.equal(interestForPeriod(advance, "2026-05"), 0);
  assert.equal(interestForPeriod(advance, "2026-04"), 0);
});

test("period deltas 2026-06..2026-09 sum to the cumulative accruedThrough(2026-09-30) for the 881 purchase", () => {
  const advance = { amount_cents: 20700000, date: "2026-06-29" };
  const periods = ["2026-06", "2026-07", "2026-08", "2026-09"];
  const sum = periods.reduce((total, period) => total + interestForPeriod(advance, period), 0);
  assert.equal(sum, accruedThrough(advance, "2026-09-30"));
});

// --- payoffAt ----------------------------------------------------------------

test("payoffAt totals both 881 Newport advances (purchase + cash advance)", () => {
  const advances = [
    { advance_id: "adv-1", date: "2026-06-29", amount_cents: 20700000, property: "881 Newport" },
    { advance_id: "adv-2", date: "2026-07-09", amount_cents: 200000, property: "881 Newport" },
    { advance_id: "adv-3", date: "2026-01-01", amount_cents: 500000, property: "OTHER PROPERTY" },
  ];
  const result = payoffAt(advances, "881 Newport", "2026-09-11");

  assert.equal(result.principal_cents, 20700000 + 200000);
  assert.equal(result.interest_cents, 379952 + 3113);
  assert.equal(result.total_cents, result.principal_cents + result.interest_cents);
  assert.equal(result.advances.length, 2);

  const purchase = result.advances.find((a) => a.advance_id === "adv-1");
  assert.equal(purchase.anniversaries, 2);
  assert.equal(purchase.stub_days, 13);
  assert.equal(purchase.interest_cents, 379952);

  const cash = result.advances.find((a) => a.advance_id === "adv-2");
  assert.equal(cash.anniversaries, 2);
  assert.equal(cash.stub_days, 2);
  assert.equal(cash.interest_cents, 3113);
});

test("payoffAt excludes advances already repaid as of asOf", () => {
  const advances = [
    { advance_id: "adv-1", date: "2026-01-01", amount_cents: 100000, property: "X", repaid_date: "2026-03-01" },
    { advance_id: "adv-2", date: "2026-01-01", amount_cents: 200000, property: "X" },
  ];
  const result = payoffAt(advances, "X", "2026-09-11");
  assert.equal(result.advances.length, 1);
  assert.equal(result.advances[0].advance_id, "adv-2");
  assert.equal(result.principal_cents, 200000);
});

test("payoffAt includes an advance whose repaid_date is still in the future", () => {
  const advances = [{ advance_id: "adv-1", date: "2026-01-01", amount_cents: 100000, property: "X", repaid_date: "2026-12-31" }];
  const result = payoffAt(advances, "X", "2026-09-11");
  assert.equal(result.advances.length, 1);
});

// --- schedule ------------------------------------------------------------------

test("schedule lists each anniversary <= asOf with the compounded balance", () => {
  const advance = { amount_cents: 20700000, date: "2026-06-29" };
  const rows = schedule(advance, "2026-09-11");
  assert.deepEqual(
    rows.map((r) => r.anniversary),
    ["2026-07-29", "2026-08-29"],
  );
  const r = 0.09 / 12;
  assert.equal(rows[0].balance_cents, Math.round(20700000 * (1 + r)));
  assert.equal(rows[1].balance_cents, Math.round(20700000 * Math.pow(1 + r, 2)));
});

test("schedule is empty before the first anniversary", () => {
  const advance = { amount_cents: 100000, date: "2026-09-01" };
  assert.deepEqual(schedule(advance, "2026-09-15"), []);
});
