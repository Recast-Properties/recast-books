import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSalePlan, buildHoldbackRelease, splitStatement, isProjectCostAccount } from "../lib/sale.mjs";
import { buildEntry, makeCtx } from "../lib/posting.mjs";

// ---- the two sales that actually closed, from their Bison Title seller CDs --------------
// 1616 Granite: file 260648, closed 2026-07-24, Recast the only seller (docs/phase5-spec.md §6a).
// Balances are the live Journal's, which tie to the old "1616 Granite RECONCILED" tab.

const GRANITE = {
  property: { name: "1616 Granite", deal: "partner", dennis_share_pct: 50 },
  settlement: {
    date: "2026-07-24",
    sale_price_cents: 43_000_000,
    net_to_seller_cents: 34_734_303,
    recast_share_pct: 100,
    lines: [
      { label: "Real Estate Commission - Selling, KW Ellis County", account: "1300", cents: 1_290_000, kind: "cost" },
      { label: "Attorney Doc Prep Fee", account: "1310", cents: 12_500, kind: "cost" },
      { label: "Title services (settlement fee, guaranty)", account: "1310", cents: 60_200, kind: "cost" },
      { label: "HOA Transfer Fee", account: "1310", cents: 14_000, kind: "cost" },
      { label: "Survey", account: "1310", cents: 64_950, kind: "cost" },
      { label: "Tax Certificate", account: "1310", cents: 8_660, kind: "cost" },
      { label: "Owner's Title Insurance", account: "1310", cents: 73_800, kind: "cost" },
      { label: "Title - Survey Amend Res (Own)", account: "1310", cents: 12_050, kind: "cost" },
      { label: "Adjustment for Owner's Policy Paid by Seller", account: "1310", cents: 167_200, kind: "cost" },
      { label: "County Property Taxes 1/1/2026 thru 7/24/2026", account: "1100", cents: 562_337, kind: "cost" },
      { label: "Escrow Holdback", account: "1510", cents: 6_000_000, kind: "holdback" },
    ],
  },
  // audit §59: 8%, and interest runs to the day Dennis was repaid (07-27), not the closing.
  advances: [
    { advance_id: "g-purchase", date: "2026-04-07", amount_cents: 27_900_100, rate_annual: 0.08, repaid_date: "2026-07-27", kind: "purchase" },
    { advance_id: "g-cash-1", date: "2026-06-01", amount_cents: 550_000, rate_annual: 0.08, repaid_date: "2026-07-27", kind: "cash" },
    { advance_id: "g-cash-2", date: "2026-06-05", amount_cents: 133_800, rate_annual: 0.08, repaid_date: "2026-07-27", kind: "cash" },
  ],
  balances: {
    1000: 27_900_100, 1020: 582_546, 1030: 324_868, 1040: 63_983,
    1120: 147_690, 1130: 25_000, 1310: 46_500, 1330: 29_900,
    2010: -28_730_563, 2030: -390_024,
  },
  // Dennis's agreed figure on the closed tab: purchase 6,873.90 + cash advances 84.70.
  interestFigureCents: 695_860,
};

// 280 Sparkling: file 260725, closed 2026-08-06, sold with SAM H PROPERTIES LLC 50/50 (D-037).
const SPARKLING = {
  property: { name: "280 Sparkling", deal: "partner", dennis_share_pct: 50 },
  settlement: {
    date: "2026-08-06",
    sale_price_cents: 55_000_000,
    net_to_seller_cents: 51_810_625,
    cash_to_recast_cents: 26_376_994, // half of net-to-seller plus the whole reimbursement
    recast_share_pct: 50,
    lines: [
      { label: "Real Estate Commission - Selling, Texas Connect Realty", account: "1300", cents: 1_650_000, kind: "cost" },
      { label: "HOA Dues, North Grove", account: "1130", cents: 29_178, kind: "cost" },
      { label: "Tax Certificate", account: "1310", cents: 8_660, kind: "cost" },
      { label: "Owner's Title Insurance", account: "1310", cents: 10_000, kind: "cost" },
      { label: "Title - Settlement Fee", account: "1310", cents: 60_000, kind: "cost" },
      { label: "Pest inspection / title", account: "1310", cents: 200, kind: "cost" },
      { label: "Adjustment for Owner's Policy Paid by Seller", account: "1310", cents: 290_300, kind: "cost" },
      { label: "County Property Taxes 1/1/2026 thru 8/6/2026", account: "1100", cents: 737_992, kind: "cost" },
      { label: "HOA Dues 8/7 thru 12/31 paid in advance", account: "1130", cents: 20_137, kind: "credit" },
      { label: "HOA Resale Cert Reimbursement", account: "1010", cents: 48_500, kind: "credit" },
      { label: "Expense Reimbursement to RECAST PROPERTIES LLC", account: "1030", cents: 471_682, kind: "to_recast" },
    ],
  },
  advances: [
    { advance_id: "s-purchase", date: "2026-06-02", amount_cents: 19_685_050, rate_annual: 0.08, repaid_date: "2026-08-06", kind: "purchase" },
  ],
  balances: {
    1000: 19_685_050, 1010: 48_500, 1020: 60_000, 1030: 79_847,
    1120: 77_731, 1130: 22_000, 1330: 29_900,
    2010: -19_824_848, 2030: -178_180,
  },
  interestFigureCents: 280_957, // the closed tab's typed figure
};

function ctx() {
  return makeCtx({
    properties: new Set(["1616 Granite", "280 Sparkling"]),
    today: "2026-09-22",
  });
}

const dollars = (cents) => (cents / 100).toFixed(2);

// ---- the pieces --------------------------------------------------------------------------

test("isProjectCostAccount covers the 1000-1399 series and nothing else", () => {
  for (const a of ["1000", "1030", "1100", "1200", "1220", "1300", "1330", "1399"]) {
    assert.equal(isProjectCostAccount(a), true, `${a} should be a project cost`);
  }
  for (const a of ["1401", "1510", "1520", "2010", "2030", "4000", "5000", "6510", "9010"]) {
    assert.equal(isProjectCostAccount(a), false, `${a} should not be a project cost`);
  }
});

test("splitStatement: a sole-owner statement posts every line in full and ties to net-to-seller", () => {
  const st = splitStatement(GRANITE.settlement);
  assert.equal(st.revenue_cents, 43_000_000);
  assert.equal(st.cost_cents, 2_265_697); // 22,656.97: commission + closing + owner's policy + tax proration
  assert.equal(st.holdback_cents, 6_000_000);
  assert.equal(st.cash_cents, 34_734_303);
  assert.equal(st.rounding_cents, 0, "a 100% statement should need no rounding plug");
});

test("splitStatement: D-037 halves a co-owned statement, and a line paid to Recast credits only the co-owner's share", () => {
  const st = splitStatement(SPARKLING.settlement);
  assert.equal(st.revenue_cents, 27_500_000, "Recast's half of the $550,000 price");
  assert.equal(st.to_recast_full_cents, 471_682, "Recast banked the whole reimbursement");
  assert.equal(st.to_recast_cents, 235_841, "but only Sam H's half is new money");
  assert.equal(st.cash_cents, 26_376_994, "the wire: 259,053.12 + 4,716.82 = the old tab's gross proceeds");
  assert.equal(Math.abs(st.rounding_cents) <= 1, true, `share rounding should be a cent, got ${st.rounding_cents}`);
});

test("splitStatement refuses a statement whose lines do not explain net-to-seller", () => {
  const bad = { ...GRANITE.settlement, net_to_seller_cents: 30_000_000 };
  assert.throws(() => splitStatement(bad), /does not tie/);
  assert.throws(() => splitStatement(bad), /needs its own line/);
});

test("splitStatement refuses an unknown line kind and a negative amount", () => {
  assert.throws(() => splitStatement({ ...GRANITE.settlement, lines: [{ label: "x", account: "1310", cents: 100, kind: "fee" }] }), /unknown kind/);
  assert.throws(() => splitStatement({ ...GRANITE.settlement, lines: [{ label: "x", account: "1310", cents: -100, kind: "cost" }] }), /negative/);
});

// ---- 1616 Granite, the gate case ---------------------------------------------------------

test("1616 Granite reproduces the closed tab: Paul is paid 28,489.52 and each partner is owed the 30,000 holdback half", () => {
  const { intents, summary, checks } = buildSalePlan(GRANITE);
  assert.equal(checks.ok, true, JSON.stringify(checks));

  // interest: the engine at 8% to the repayment date, trued up to Dennis's agreed figure
  assert.equal(summary.interest.engine_cents, 696_643, "8% to 2026-07-27: purchase 6,882.27 + 68.70 + 15.46");
  assert.equal(summary.interest.agreed_cents, 695_860);
  assert.equal(summary.interest.true_up_cents, -783, "one true-up line of $7.83, D-015 §2");

  // project cost, profit and the 50/50 split
  assert.equal(dollars(summary.cost_before_share_cents), "320821.44");
  assert.equal(dollars(summary.profit_cents), "109178.56");
  assert.equal(dollars(summary.dennis_share_cents), "54589.28");
  assert.equal(dollars(summary.paul_share_cents), "54589.28");

  // cash at closing: principal, interest and reimbursements first, then the rest by share
  assert.equal(dollars(summary.cash_in_cents), "347343.03");
  assert.equal(dollars(summary.paid.dennis_note_cents), "287305.63");
  assert.equal(dollars(summary.paid.dennis_interest_cents), "6958.60");
  assert.equal(dollars(summary.paid.paul_due_cents), "3900.24");
  assert.equal(dollars(summary.paid.dennis_share_cents), "24589.28");
  assert.equal(dollars(summary.paid.paul_share_cents), "24589.28");
  assert.equal(dollars(summary.paid.paul_cents), "28489.52", "the old tab's Paul Payout Total, to the cent");
  assert.equal(summary.retained_cents, 0);

  // what the escrow holdback owes each partner afterwards
  assert.equal(dollars(summary.owed_after.dennis_cents), "30000.00");
  assert.equal(dollars(summary.owed_after.paul_undrawn_cents), "30000.00");

  // the 1000s are empty after the release
  assert.equal(summary.released_cents, summary.cost_before_share_cents + summary.dennis_share_cents);

  // every intent is a postable, balanced entry
  const c = ctx();
  for (const intent of intents) {
    const entry = buildEntry(intent, c);
    const debit = entry.lines.reduce((t, l) => t + (l.debit || 0), 0);
    const credit = entry.lines.reduce((t, l) => t + (l.credit || 0), 0);
    assert.equal(debit, credit, `unbalanced: ${intent.memo}`);
    assert.equal(entry.date, "2026-07-24", "every line of the run is dated the settlement");
  }
  assert.equal(intents.length, 7, "sale, accrual, true-up, share, release, pay Dennis, pay Paul");
});

test("1616 Granite: the holdback release of 2026-09-11 pays each partner their 30,000 (D-036 §1)", () => {
  const { intents, checks } = buildHoldbackRelease({
    property: GRANITE.property,
    date: "2026-09-11",
    amount_cents: 6_000_000,
    dennis_cents: 3_000_000,
    paul_cents: 3_000_000,
  });
  assert.equal(checks.ok, true, JSON.stringify(checks));
  assert.equal(intents.length, 3);
  const c = ctx();
  for (const intent of intents) {
    const entry = buildEntry(intent, c);
    assert.equal(
      entry.lines.reduce((t, l) => t + (l.debit || 0) - (l.credit || 0), 0),
      0,
      `unbalanced: ${intent.memo}`,
    );
  }
});

// ---- 280 Sparkling, the co-owned case ----------------------------------------------------

test("280 Sparkling reproduces the closed tab at Recast's half: profit 60,930 and Paul paid 32,246.84", () => {
  const { summary, checks, intents } = buildSalePlan(SPARKLING);
  assert.equal(checks.ok, true, JSON.stringify(checks));

  assert.equal(summary.interest.engine_cents, 281_074, "8% to 2026-08-06");
  assert.equal(summary.interest.true_up_cents, -117, "Dennis's agreed 2,809.57 is $1.17 under the engine");

  assert.equal(dollars(summary.revenue_cents), "275000.00");
  assert.equal(dollars(summary.cost_before_share_cents), "214069.91");
  assert.equal(dollars(summary.profit_cents), "60930.09", "the old tab's Net after closing, to the cent");
  assert.equal(dollars(summary.paid.dennis_note_cents), "198248.48");
  assert.equal(dollars(summary.paid.paul_due_cents), "1781.80");
  assert.equal(dollars(summary.paid.paul_cents), "32246.84", "the old tab's Paul Payout 32,246.85, within a cent");
  assert.equal(summary.retained_cents, 0);
  assert.equal(dollars(summary.owed_after.dennis_cents), "0.00", "Sparkling had no holdback: Dennis is paid in full");

  const c = ctx();
  for (const intent of intents) {
    const entry = buildEntry(intent, c);
    assert.equal(entry.lines.reduce((t, l) => t + (l.debit || 0) - (l.credit || 0), 0), 0, `unbalanced: ${intent.memo}`);
  }
});

// ---- the rules that must not drift -------------------------------------------------------

test("a bank deal takes a commission on the full price and no profit share (D-030, D-036 §3)", () => {
  const { summary } = buildSalePlan({
    ...GRANITE,
    property: { name: "1616 Granite", deal: "bank", dennis_commission_pct: 3 },
  });
  assert.equal(dollars(summary.commission_cents), "12900.00", "3% of the $430,000 price");
  assert.equal(summary.dennis_share_cents, 0, "no profit share on a bank deal");
  assert.equal(summary.paul_share_cents, summary.profit_cents, "all of the profit is Paul's");
  assert.equal(dollars(summary.profit_cents), "96278.56", "profit is 12,900 lower: the commission is a cost");
});

test("overhead never enters a sale: a 6000-series balance is ignored by the release (D-010)", () => {
  const withOverhead = { ...GRANITE, balances: { ...GRANITE.balances, 6510: 50_000 } };
  const plain = buildSalePlan(GRANITE);
  const doped = buildSalePlan(withOverhead);
  assert.equal(doped.summary.profit_cents, plain.summary.profit_cents);
  assert.equal(doped.summary.released_cents, plain.summary.released_cents);
});

test("no cash ever leaves that did not come in, and an unpaid share rides on the balance", () => {
  // a far bigger holdback: the cash at closing cannot even cover Dennis's principal
  const lines = GRANITE.settlement.lines.map((l) => (l.kind === "holdback" ? { ...l, cents: 25_000_000 } : l));
  const short = {
    ...GRANITE,
    settlement: { ...GRANITE.settlement, lines, net_to_seller_cents: 43_000_000 - 2_265_697 - 25_000_000 },
  };
  const { summary, checks } = buildSalePlan(short);
  assert.equal(checks.cash_ties, true);
  assert.equal(summary.paid.dennis_cents + summary.paid.paul_cents + summary.retained_cents, 15_734_303);
  assert.equal(summary.paid.paul_cents, 0, "Dennis's principal comes first");
  assert.ok(summary.owed_after.dennis_cents > 0, "the rest stays owed to Dennis");
});

test("the interest figure defaults to the engine when Paul types nothing, and posts no true-up", () => {
  const { summary, intents } = buildSalePlan({ ...GRANITE, interestFigureCents: null });
  assert.equal(summary.interest.agreed_cents, summary.interest.engine_cents);
  assert.equal(summary.interest.true_up_cents, 0);
  assert.equal(intents.some((i) => /true-up/.test(i.memo)), false);
});

test("interest already posted for the property is not accrued twice", () => {
  const halfPosted = { ...GRANITE, balances: { ...GRANITE.balances, 1200: 300_000 } };
  const { intents, summary } = buildSalePlan(halfPosted);
  const accrual = intents.find((i) => /interest accrued/.test(i.memo));
  assert.equal(accrual.lines.find((l) => l.account === "1200").debit, 696_643 - 300_000);
  assert.equal(summary.interest.posted_before_cents, 300_000);
  assert.equal(dollars(summary.cost_before_share_cents), "320821.44", "the total is the same either way");
});
