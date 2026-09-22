import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSettlement, tieCheck, SETTLEMENT_PROMPT, SETTLEMENT_TOOL, KINDS } from "../lib/settlement.mjs";
import { buildSalePlan } from "../lib/sale.mjs";

// The two statements the Phase 5 gate runs on, as the model should report them
// (docs/phase5-spec.md §6a). Figures are from the documents in Paul's Drive.

const GRANITE_READ = {
  file_no: "260648",
  settlement_agent: "Bison Title, LLC",
  property_address: "1616 Granite Way, Waxahachie, TX 75165",
  sellers: ["RECAST PROPERTIES LLC"],
  date: "2026-07-24",
  sale_price_cents: 43_000_000,
  net_to_seller_cents: 34_734_303,
  cash_to_recast_cents: 34_734_303,
  recast_share_pct: 100,
  lines: [
    { label: "Real Estate Commission - Selling", cents: 1_290_000, kind: "cost", account: "1300", why: "commission to KW Ellis County" },
    { label: "Attorney Doc Prep Fee", cents: 12_500, kind: "cost", account: "1310", why: "seller-paid closing charge" },
    { label: "Title - Settlement Fee", cents: 60_000, kind: "cost", account: "1310", why: "title company fee" },
    { label: "Title - State of Texas Policy Guaranty Fee", cents: 200, kind: "cost", account: "1310", why: "title charge" },
    { label: "HOA Transfer Fee", cents: 14_000, kind: "cost", account: "1130", why: "HOA transfer at closing" },
    { label: "Survey", cents: 64_950, kind: "cost", account: "1310", why: "seller-paid survey" },
    { label: "Tax Certificate", cents: 8_660, kind: "cost", account: "1310", why: "tax certificate fee" },
    { label: "Title - Owner's Title Insurance", cents: 73_800, kind: "cost", account: "1310", why: "owner's policy" },
    { label: "Title - Survey Amend Res (Own)", cents: 12_050, kind: "cost", account: "1310", why: "endorsement" },
    { label: "Adjustment for Owner's Policy Paid by Seller", cents: 167_200, kind: "cost", account: "1310", why: "due from seller" },
    { label: "County Property Taxes 1/1/2026 thru 7/24/2026", cents: 562_337, kind: "cost", account: "1100", why: "seller's share of 2026 tax, netted at closing" },
    { label: "Escrow Holdback", cents: 6_000_000, kind: "holdback", account: "1510", why: "withheld in escrow at closing" },
  ],
  notes: "The '$65.00 of Title Premium' row is a breakdown of the owner's policy, not a separate charge, so it is left out.",
};

const SPARKLING_READ = {
  file_no: "260725",
  settlement_agent: "Bison Title, LLC",
  property_address: "280 Sparkling Springs Drive, Waxahachie, TX 75165",
  sellers: ["SAM H PROPERTIES LLC", "RECAST PROPERTIES LLC"],
  date: "2026-08-06",
  sale_price_cents: 55_000_000,
  net_to_seller_cents: 51_810_625,
  cash_to_recast_cents: 0,
  recast_share_pct: 50,
  lines: [
    { label: "Real Estate Commission - Selling", cents: 1_650_000, kind: "cost", account: "1300", why: "commission to Texas Connect Realty" },
    { label: "Expense Reimbursement to RECAST PROPERTIES LLC", cents: 471_682, kind: "to_recast", account: "1030", why: "repays rehab materials Recast fronted" },
    { label: "HOA Dues", cents: 29_178, kind: "cost", account: "1130", why: "HOA dues at closing" },
    { label: "Tax Certificate", cents: 8_660, kind: "cost", account: "1310", why: "tax certificate fee" },
    { label: "Title - Owner's Title Insurance", cents: 10_000, kind: "cost", account: "1310", why: "owner's policy" },
    { label: "Title - Settlement Fee", cents: 60_000, kind: "cost", account: "1310", why: "title company fee" },
    { label: "Pest Inspection / title charges", cents: 200, kind: "cost", account: "1310", why: "services the borrower shopped for, seller-paid" },
    { label: "Adjustment for Owner's Policy Paid by Seller", cents: 290_300, kind: "cost", account: "1310", why: "due from seller" },
    { label: "County Property Taxes 1/1/2026 thru 8/6/2026", cents: 737_992, kind: "cost", account: "1100", why: "seller's share of 2026 tax" },
    { label: "HOA Dues 8/7/2026 thru 12/31/2026", cents: 20_137, kind: "credit", account: "1130", why: "paid by seller in advance" },
    { label: "HOA Resale Cert Reimbursement", cents: 48_500, kind: "credit", account: "1010", why: "due to seller at closing" },
  ],
  notes: "Two sellers: Sam H Properties and Recast, equal shares, so Recast's share reads 50%.",
};

// ---- the prompt and the tool ------------------------------------------------------------

test("the prompt names the rules the two real statements taught, and the tool is strict", () => {
  // Compared with whitespace collapsed: the prompt is hard-wrapped, so a phrase can span lines.
  const prose = SETTLEMENT_PROMPT.replace(/\s+/g, " ");
  for (const must of ["to_recast", "recast_share_pct", "1/1", "does not tie", "verbatim"]) {
    assert.ok(prose.includes(must), `the prompt never mentions "${must}"`);
  }
  assert.ok(SETTLEMENT_PROMPT.includes("- `1300`"), "the prompt does not show the chart of accounts");
  assert.equal(SETTLEMENT_TOOL.strict, true);
  assert.equal(SETTLEMENT_TOOL.input_schema.additionalProperties, false);
  assert.deepEqual(SETTLEMENT_TOOL.input_schema.properties.lines.items.properties.kind.enum, KINDS);
});

// No ASCII rule here: this prompt goes to the API, never into the Apps Script editor, and it
// embeds account names that legitimately carry an em dash ("Holding - HOA" is written with one
// in lib/coa.mjs). lib/settlement.mjs is deliberately not in build-gs's MODULES for that reason.
test("the prompt gives no real dollar figure as an example the model could echo", () => {
  assert.ok(!/\$\d{3},\d{3}/.test(SETTLEMENT_PROMPT), "a six-figure example invites the model to echo it");
});

// ---- 1616 Granite: one seller, an escrow holdback ---------------------------------------

test("1616 Granite's statement validates clean and ties to the cent", () => {
  const { ok, settlement, read, problems } = validateSettlement(GRANITE_READ);
  assert.deepEqual(problems, []);
  assert.equal(ok, true);
  assert.equal(settlement.recast_share_pct, 100);
  assert.equal(settlement.lines.length, 12);
  assert.equal(read.tie.ties, true);
  assert.equal(read.tie.gap_cents, 0);
  assert.equal(read.file_no, "260648");
});

test("1616 Granite's read drives the sale plan to the same numbers the gate posted", () => {
  const { settlement } = validateSettlement(GRANITE_READ);
  const { summary, checks } = buildSalePlan({
    property: { name: "1616 Granite", deal: "partner", dennis_share_pct: 50 },
    settlement,
    advances: [
      { advance_id: "g1", date: "2026-04-07", amount_cents: 27_900_100, rate_annual: 0.08, repaid_date: "2026-07-27", kind: "purchase" },
      { advance_id: "g2", date: "2026-06-01", amount_cents: 550_000, rate_annual: 0.08, repaid_date: "2026-07-27", kind: "cash" },
      { advance_id: "g3", date: "2026-06-05", amount_cents: 133_800, rate_annual: 0.08, repaid_date: "2026-07-27", kind: "cash" },
    ],
    balances: {
      1000: 27_900_100, 1020: 582_546, 1030: 324_868, 1040: 63_983,
      1120: 147_690, 1130: 25_000, 1310: 46_500, 1330: 29_900,
      2010: -28_730_563, 2030: -390_024,
    },
    interestFigureCents: 695_860,
  });
  assert.equal(checks.ok, true);
  assert.equal(summary.cash_in_cents, 34_734_303);
  assert.equal(summary.profit_cents, 10_917_856, "net profit 109,178.56, as posted on 2026-09-22");
  assert.equal(summary.paid.paul_cents, 2_848_952, "Paul's 28,489.52, the old tab's figure");
  assert.equal(summary.owed_after.dennis_cents, 3_000_000);
});

// ---- 280 Sparkling: two sellers, a line paid to Recast -----------------------------------

test("280 Sparkling's statement validates clean, reads two sellers and a 50% share", () => {
  const { ok, settlement, read, problems } = validateSettlement(SPARKLING_READ);
  assert.deepEqual(problems, []);
  assert.equal(ok, true);
  assert.equal(settlement.recast_share_pct, 50);
  assert.equal(read.sellers.length, 2);
  assert.equal(read.tie.ties, true);
  const toRecast = settlement.lines.filter((l) => l.kind === "to_recast");
  assert.equal(toRecast.length, 1);
  assert.equal(toRecast[0].cents, 471_682);
  assert.equal(toRecast[0].account, "1030");
});

test("280 Sparkling's read drives the sale plan to the old tab's net profit at Recast's half", () => {
  const { settlement } = validateSettlement(SPARKLING_READ);
  const { summary, checks } = buildSalePlan({
    property: { name: "280 Sparkling", deal: "partner", dennis_share_pct: 50 },
    settlement,   // the wire is derived from the statement, not typed (D-037's floored share)
    advances: [{ advance_id: "s1", date: "2026-06-02", amount_cents: 19_685_050, rate_annual: 0.08, repaid_date: "2026-08-06", kind: "purchase" }],
    balances: {
      1000: 19_685_050, 1010: 48_500, 1020: 60_000, 1030: 79_847,
      1120: 77_731, 1130: 22_000, 1330: 29_900,
      2010: -19_824_848, 2030: -178_180,
    },
    interestFigureCents: 280_957,
  });
  assert.equal(checks.ok, true);
  assert.equal(summary.revenue_cents, 27_500_000);
  assert.equal(summary.profit_cents, 6_093_009, "the old tab's 60,930.09");
  assert.equal(summary.paid.paul_cents, 3_224_684);
});

test("an HOA charge that completes the sale is a selling cost on 1340, not acquisition or holding (D-039)", () => {
  const prose = SETTLEMENT_PROMPT.replace(/\s+/g, " ");
  assert.ok(prose.includes("resale certificate"), "the prompt does not mention a resale certificate");
  assert.ok(/1340, not 1130 and not 1010/.test(prose), "the prompt does not rule out 1130 and 1010 for it");
  assert.ok(prose.includes("- `1340`"), "1340 is not in the chart the prompt shows");

  // and a statement line may actually use it
  const { settlement, problems } = validateSettlement({
    ...GRANITE_READ,
    lines: [...GRANITE_READ.lines, { label: "HOA Resale Certificate", cents: 20_000, kind: "cost", account: "1340", why: "required to close" }],
    net_to_seller_cents: 34_734_303 - 20_000,
  });
  assert.ok(!problems.some((p) => /1340/.test(p)), problems.join(" | "));
  assert.equal(settlement.lines.some((l) => l.account === "1340"), true);
});

// ---- what the confirm step is for --------------------------------------------------------

test("a statement that does not tie is reported as a gap, not forced", () => {
  const short = { ...GRANITE_READ, lines: GRANITE_READ.lines.filter((l) => l.kind !== "holdback") };
  const { ok, problems, read } = validateSettlement(short);
  assert.equal(ok, false);
  assert.equal(read.tie.ties, false);
  assert.equal(read.tie.gap_cents, 6_000_000, "the dropped holdback is the gap, to the cent");
  assert.ok(problems.some((p) => /do not tie/.test(p)), problems.join(" | "));
});

test("two sellers with a 100% share is flagged: it is the co-owned case D-037 exists for", () => {
  const { problems } = validateSettlement({ ...SPARKLING_READ, recast_share_pct: 100 });
  assert.ok(problems.some((p) => /2 sellers are named/.test(p)), problems.join(" | "));
});

test("a line that proposes an account a statement may not use is dropped and named", () => {
  const bad = { ...GRANITE_READ, lines: [...GRANITE_READ.lines, { label: "Small tools", cents: 5_000, kind: "cost", account: "6510", why: "" }] };
  const { settlement, problems } = validateSettlement(bad);
  assert.equal(settlement.lines.length, 12, "the overhead line is not admitted (D-010)");
  assert.ok(problems.some((p) => /6510/.test(p)), problems.join(" | "));
});

test("a holdback proposed on the wrong account is flagged", () => {
  const bad = { ...GRANITE_READ, lines: GRANITE_READ.lines.map((l) => (l.kind === "holdback" ? { ...l, account: "1310" } : l)) };
  const { problems } = validateSettlement(bad);
  assert.ok(problems.some((p) => /belongs on 1510/.test(p)), problems.join(" | "));
});

test("a bad kind, a negative amount and a missing date are each reported, never guessed", () => {
  const { ok, problems, settlement } = validateSettlement({
    ...GRANITE_READ,
    date: "July 24 2026",
    lines: [
      { label: "Something", cents: 100, kind: "fee", account: "1310", why: "" },
      { label: "Backwards", cents: -500, kind: "cost", account: "1310", why: "" },
    ],
  });
  assert.equal(ok, false);
  assert.equal(settlement.date, "");
  assert.equal(settlement.lines.length, 0);
  assert.equal(problems.filter((p) => /dropped/.test(p)).length, 2);
  assert.ok(problems.some((p) => /not a YYYY-MM-DD date/.test(p)));
});

test("a line the statement shows with no amount is noted, not flagged: that is normal on a CD", () => {
  const withZero = {
    ...GRANITE_READ,
    lines: [...GRANITE_READ.lines, { label: "HOA Community Enhancement Fee", cents: 0, kind: "cost", account: "1340", why: "no seller-paid amount shown" }],
  };
  const { ok, problems, read, settlement } = validateSettlement(withZero);
  assert.equal(ok, true, `a zero line should not fail the read: ${problems.join(" | ")}`);
  assert.deepEqual(problems, []);
  assert.deepEqual(read.zero_lines, ["HOA Community Enhancement Fee"]);
  assert.equal(settlement.lines.length, 12, "the zero line is not posted");
  assert.equal(read.tie.ties, true);
});

test("garbage in is problems out, never a throw", () => {
  for (const raw of [null, undefined, 42, "nope", {}, { lines: "no" }]) {
    const { ok, problems } = validateSettlement(raw);
    assert.equal(ok, false);
    assert.ok(problems.length > 0);
  }
});

test("tieCheck counts a to_recast line on the cost side: the sellers jointly paid it", () => {
  const one = tieCheck({ sale_price_cents: 1000, net_to_seller_cents: 900, lines: [{ cents: 100, kind: "to_recast" }] });
  assert.equal(one.ties, true);
  const two = tieCheck({ sale_price_cents: 1000, net_to_seller_cents: 1100, lines: [{ cents: 100, kind: "credit" }] });
  assert.equal(two.ties, true);
});
