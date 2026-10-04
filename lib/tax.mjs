// lib/tax.mjs - the Taxes tab (Paul, 2026-10-02: "add a tab to the recast books that shows me my tax
// exposure for both IRS and Oregon State"). An ESTIMATE of what Paul may owe on the year's profit, worked
// from the books and the year's published tables - code does the arithmetic, the accountant has the final
// say. It assumes what the books assume (D-006, D-015, chart-of-accounts "Tax-bucket review"): Recast is
// Paul's alone and reported on his own return, houses are bought to resell (so the profit also carries the
// Social Security and Medicare tax), Dennis is a lender, Paul is an Oregon resident and Texas taxes no income.
// The accountant's open questions (open-questions.md Q-1, Q-3, Q-4) change the answer, not this code's shape.

import { profitAndLoss } from "./reports.mjs";

// Dollars. 2026: IRS Rev. Proc. 2025-32 (rate tables 1 and 3, standard deduction, section 4.26 - the income
// range over which the 20% business deduction fades out for a business with no payroll), SSA (wage base);
// Oregon Publication OR-ESTIMATE 2026 (charts S and J, standard deduction, federal tax subtraction - which
// fades out in five equal steps of income above `from`).
// ponytail: one table per year, typed in by hand each fall when the IRS and Oregon publish them - a year
// with no table shows "tell Claude" instead of a guess.
export const TAX_TABLES = {
  2026: {
    ss_wage_base: 184500,
    single: {
      fed_std: 16100,
      fed: [[0, 0.10], [12400, 0.12], [50400, 0.22], [105700, 0.24], [201775, 0.32], [256225, 0.35], [640600, 0.37]],
      business_deduction_fades: [201750, 276750],
      medicare_extra_over: 200000,
      or_std: 2900,
      or: [[0, 0.0475], [4550, 0.0675], [11400, 0.0875], [125000, 0.099]],
      or_fed_sub: { max: 8750, from: 125000, step: 5000 },
    },
    married: {
      fed_std: 32200,
      fed: [[0, 0.10], [24800, 0.12], [100800, 0.22], [211400, 0.24], [403550, 0.32], [512450, 0.35], [768700, 0.37]],
      business_deduction_fades: [403500, 553500],
      medicare_extra_over: 250000,
      or_std: 5800,
      or: [[0, 0.0475], [9100, 0.0675], [22800, 0.0875], [250000, 0.099]],
      or_fed_sub: { max: 8750, from: 250000, step: 10000 },
    },
  },
};

// What RECAST carries in from last year's return (Paul, 2026-10-04: "apply the 2025 loss to my 2026 tax tab", then
// "only show me what recast can take from 2025"). Dollars, by the year they are USED, from the Carryover Worksheet
// the accountant prints with the return (2025's: Savage Tax, signed 2026-07-14) - typed in each fall with the tables.
//   home_office   Form 8829 lines 43 + 44 (725 + 386): Recast had no 2025 profit to take them against - the one
//                 thing Recast takes, and the only row on the tab
//   business_loss the 2025 Schedule C and rental losses (Recast's 17,810 among them). They were USED in 2025 against
//                 the paychecks - the return carries no net operating loss; they only come off what this year's 20%
//                 deduction is worked on, so they are in the arithmetic and not a row
// Left out on Paul's word: the household's 37,452 loss on stocks and funds (3,000 a year) - real, on the same
// worksheet, not Recast's. The accountant takes it on the return; this tab does not count it.
export const CARRIED_OVER = {
  2026: { home_office: 1111, business_loss: 32135 },
};

const bracketTax = (income, brackets) => brackets.reduce((tax, [from, rate], i) => {
  const to = i + 1 < brackets.length ? brackets[i + 1][0] : Infinity;
  return tax + Math.max(0, Math.min(income, to) - from) * rate;
}, 0);

/**
 * The year's tax on a business profit plus the household's other income. Cents in, cents out; null when
 * the year has no table.
 * ponytail: standard deduction only, no credits (Oregon's $260 exemption credit included), no $400 minimum
 * business deduction, and the other income is taken as not Paul's own wages (those would use up some of the
 * Social Security wage base) - each is worth a few hundred dollars at most; the accountant's return settles them.
 *
 * @param {{year: string|number, status: string, profit_cents: number, other_cents?: number,
 *   carried?: {home_office?: number, business_loss?: number}}} input `carried` is a CARRIED_OVER entry (dollars);
 *   without it nothing is carried
 * @returns {{self_employment: number, fed_income: number, oregon: number, business_deduction: number}|null}
 */
export function taxEstimate({ year, status, profit_cents, other_cents = 0, carried = {} }) {
  const T = TAX_TABLES[year];
  if (!T) return null;
  const t = T[status === "married" ? "married" : "single"];
  const other = Math.max(0, other_cents / 100);

  // carried over: home office costs come off the profit (never below zero - what is left waits again)
  const profit = profit_cents / 100 - Math.min(carried.home_office || 0, Math.max(0, profit_cents / 100));

  // Social Security and Medicare on 92.35% of the profit; half of it comes off income
  const base = Math.max(0, profit) * 0.9235;
  const se = base < 400 ? 0 : 0.124 * Math.min(base, T.ss_wage_base) + 0.029 * base;
  const medicareExtra = 0.009 * Math.max(0, base - t.medicare_extra_over);
  const income = profit + other - se / 2;

  // the 20% business deduction: Recast has no payroll, so it fades to nothing across the range; last year's
  // business losses come off what it is worked on
  const beforeDeduction = Math.max(0, income - t.fed_std);
  const [lo, hi] = t.business_deduction_fades;
  const kept = Math.min(1, Math.max(0, (hi - beforeDeduction) / (hi - lo)));
  const deduction = Math.min(0.2 * Math.max(0, profit - se / 2 - (carried.business_loss || 0)) * kept, 0.2 * beforeDeduction);
  const fedIncome = bracketTax(beforeDeduction - deduction, t.fed);

  // Oregon starts from the same income, allows no business deduction, and subtracts some federal tax
  const steps = Math.min(5, Math.max(0, Math.ceil((income - t.or_fed_sub.from) / t.or_fed_sub.step)));
  const fedSub = Math.min(fedIncome, t.or_fed_sub.max * (1 - steps / 5));
  const oregon = bracketTax(Math.max(0, income - t.or_std - fedSub), t.or);

  const c = (x) => Math.round(x * 100);
  return { self_employment: c(se + medicareExtra), fed_income: c(fedIncome), oregon: c(oregon), business_deduction: c(deduction) };
}

/**
 * What the Journal says about the year, for the tab: Recast's profit (the P&L tab's "Recast earned"), the
 * costs in it that cannot be subtracted on a return (half of meals; lines labelled Non-deductible, such as
 * a traffic fine), and travel (the accountant's open question, shown apart).
 *
 * @param {Array<object>} lines loadJournal lines
 * @param {string} asOf YYYY-MM-DD
 */
export function taxFacts(lines, asOf) {
  const year = asOf.slice(0, 4), from = `${year}-01-01`;
  const pl = profitAndLoss(lines, { from, to: asOf });
  const cost = (code) => (pl.expenses.find((e) => e.account === code) || {}).balance || 0;
  const voided = new Set(lines.map((l) => l.void_of).filter(Boolean));
  const fines = lines
    .filter((l) => l.tax_treatment === "Non-deductible" && l.source !== "void" && !voided.has(l.txn_id) && l.date >= from && l.date <= asOf)
    .reduce((s, l) => s + l.debit - l.credit, 0);
  return { year, earned: pl.net_income, meals_half: Math.round(cost("6710") / 2), fines, travel: cost("6700") };
}

/** The cells Paul types (blue, kept across rebuilds) - found again by these labels, so never reword one. */
export const TAX_INPUTS = {
  status: "How you file - pick single or married",
  other: "Other income in your household this year",
  paid_irs: "Already sent to the IRS for this year",
  paid_or: "Already sent to Oregon for this year",
};

/**
 * The Taxes tab's rows, in plain words (CLAUDE.md rule 7).
 *
 * @param {object} facts taxFacts()
 * @param {Array<{name: string, profit_cents: number|null}>} houses every house still held, with the profit to
 *   Paul its tab shows - null when no sale price is typed on its tab yet (Paul, 2026-10-02: "youre missing green
 *   acres, bowling green, janice, white rock" - every house is listed; one with no price adds nothing)
 * @param {Object<string, any[]>} typed what the tab holds now, by column-A label: [column B, column C]
 * @returns {{ rows: any[][], kinds: string[] }} rows are [what, dollars, note]; kinds are "head", "total",
 *   "input" (column B is Paul's), "house" (column C is Paul's yes) or ""
 */
export function taxTab(facts, houses, typed = {}) {
  const rows = [], kinds = [];
  const add = (kind, what, cents = "", note = "") => { rows.push([what, cents === "" ? "" : cents / 100, note]); kinds.push(kind); };
  const was = (label, col) => (typed[label] || [])[col];
  const dollars = (label) => Math.round(Math.abs(Number(was(label, 0)) || 0) * 100);
  const status = /^m/i.test(String(was(TAX_INPUTS.status, 0) || "")) ? "married" : "single";
  const other = dollars(TAX_INPUTS.other), paidIrs = dollars(TAX_INPUTS.paid_irs), paidOr = dollars(TAX_INPUTS.paid_or);

  add("head", "YOUR OWN FACTS - TYPE THEM IN THE BLUE CELLS");
  rows.push([TAX_INPUTS.status, status, "single until you change it - married means one return for the two of you"]); kinds.push("input");
  add("input", TAX_INPUTS.other, other, "a paycheck, a spouse's pay - before tax; leave Recast out");
  add("input", TAX_INPUTS.paid_irs, paidIrs, "payments you sent in during the year, plus tax held out of paychecks");
  add("input", TAX_INPUTS.paid_or, paidOr, "the same, for Oregon");

  if (!taxEstimate({ year: facts.year, status, profit_cents: 0 })) {
    add("", "");
    add("head", `NO TAX TABLES FOR ${facts.year} YET - TELL CLAUDE`);
    return { rows, kinds };
  }

  add("", "");
  add("head", `WHAT RECAST EARNED YOU - ${facts.year} SO FAR`);
  add("", "Recast earned", facts.earned, "the P&L tab's number: the houses sold and closed in the books, less the business costs");
  const notAllowed = facts.meals_half + facts.fines;
  if (notAllowed) add("", "Costs a tax return does not let you subtract", notAllowed, [facts.meals_half && "half of meals", facts.fines && "fines and tickets"].filter(Boolean).join(", "));
  let profit = facts.earned + notAllowed;
  if (houses.length) {
    add("", "");
    add("head", `HOUSES NOT CLOSED IN THE BOOKS YET - TYPE yes BESIDE ANY THAT SELLS IN ${facts.year}`);
    for (const h of houses) {
      const yes = /^y/i.test(String(was(h.name, 1) || ""));
      rows.push([h.name, h.profit_cents === null ? "no sale price yet" : h.profit_cents / 100, yes ? "yes" : ""]); kinds.push("house");
      if (yes) profit += h.profit_cents || 0;
    }
  }
  add("total", "Profit you are taxed on", profit, houses.length ? "what Recast earned, plus each house marked yes at the profit its own tab shows"
    + (houses.some((h) => h.profit_cents === null) ? " - a house with no sale price typed on its own tab adds nothing until you type one there" : "") : "");

  const carried = CARRIED_OVER[facts.year];
  const t = taxEstimate({ year: facts.year, status, profit_cents: profit, other_cents: other, carried });
  if (carried && carried.home_office) {
    const last = Number(facts.year) - 1;
    add("", "");
    add("head", `WHAT RECAST CARRIES OVER FROM ${last}`);
    add("", `Home office costs ${last} could not use`, carried.home_office * 100, `Recast made no profit in ${last}, so they waited - they come off Recast's profit this year`);
  }
  const irs = t.self_employment + t.fed_income;
  add("", "");
  add("head", "IRS");
  add("", "Social Security and Medicare tax", t.self_employment, "a business owner pays both halves - about 15% of the profit");
  add("", "Income tax", t.fed_income, "on the profit plus your other income, after the standard deduction"
    + (t.business_deduction ? ` and the 20% deduction for business owners (${Math.round(t.business_deduction / 100).toLocaleString("en-US")})` : ""));
  if (paidIrs) add("", "Less what you already sent", -paidIrs);
  add("total", "Still owed to the IRS", irs - paidIrs);

  add("", "");
  add("head", "OREGON");
  add("", "Oregon income tax", t.oregon, "Oregon taxes everything you earn, the Texas houses included - Texas has no income tax of its own");
  if (paidOr) add("", "Less what you already sent", -paidOr);
  add("total", "Still owed to Oregon", t.oregon - paidOr);

  const owed = irs - paidIrs + t.oregon - paidOr;
  add("", "");
  add("total", "SET ASIDE FOR BOTH", owed,
    (profit > 0 ? `the tax is about ${Math.round((irs + t.oregon) * 100 / (profit + other))}% of your income - ` : "")
    + `both want it paid during the year; the last payment date for ${facts.year} is January 15, ${Number(facts.year) + 1}`);

  add("", "");
  add("head", "NOT IN THESE NUMBERS - FOR YOUR ACCOUNTANT");
  if (facts.travel) add("", "Flights and other travel", facts.travel, "counted as a business cost above; if the accountant says the Portland-Dallas trips do not count, the profit you are taxed on goes up by this much");
  add("", "City and county income taxes", "", "the Portland area (Metro, Multnomah County) taxes higher incomes too - not counted");
  add("", "Interest for paying late in the year", "", "the IRS and Oregon charge it when the year's payments come in late - not counted");
  return { rows, kinds };
}
