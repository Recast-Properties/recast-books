// lib/reports.mjs — pure reporting over Journal rows, phase1-spec.md §2
//
// Every function is pure: Journal lines in (already normalized by loadJournal), a
// report object out. Money in is dollars (as the writer/Sheets store it); money out is
// always integer cents. Balances are reported as *natural* balances — assets and
// expenses debit-positive, liabilities/income/equity credit-positive — so a tie reads
// as assets = liabilities + equity without the reader having to flip a sign in their
// head.
//
// D-010: overhead (6000/7000) never carries a property, and every 1000-1399 property
// cost does; that split is what lets the "1000-1399 grouped by property" and "2000s are
// liabilities" rules below work without a special property==OVERHEAD case.
// D-011: Dennis interest (1200 cost / 2000 accrual) is a property's financing cost, so
// it falls out of the ordinary 1000-1399 / 2000 grouping like any other line — no
// separate treatment needed here, only in accrual.mjs where the number comes from.

import { accountMap, seriesOf } from "./coa.mjs";
import { sumCents } from "./money.mjs";
import { payoffAt, accruedThrough } from "./accrual.mjs";

const ACCOUNTS = accountMap();

function accountName(code) {
  return ACCOUNTS.get(code)?.name;
}

/**
 * Convert a dollars value (number or numeric string, as the writer/Sheets store it) to
 * integer cents. Blank cells come back as 0. Math.round guards against float noise
 * (e.g. 212.40 read back as 212.39999999999998).
 */
function dollarsToCents(value) {
  if (value === "" || value === undefined || value === null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/**
 * Normalize writer Journal rows (`{headers, rows}`, as returned by `read`) into flat
 * line objects. Columns are located by header name (never position) so a reordered
 * sheet doesn't silently corrupt reports.
 *
 * @param {string[]} headers
 * @param {any[][]} rows
 * @returns {Array<object>} lines
 */
export function loadJournal(headers, rows) {
  const idx = new Map(headers.map((h, i) => [h, i]));
  const cell = (row, name) => {
    const i = idx.get(name);
    return i === undefined ? undefined : row[i];
  };
  const str = (row, name) => {
    const v = cell(row, name);
    return v === undefined || v === null ? "" : String(v);
  };

  return rows.map((row) => ({
    txn_id: str(row, "txn_id"),
    date: str(row, "date"),
    period: str(row, "period"),
    account: str(row, "account"),
    debit: dollarsToCents(cell(row, "debit")),
    credit: dollarsToCents(cell(row, "credit")),
    property: str(row, "property"),
    cost_class: str(row, "cost_class"),
    tax_treatment: str(row, "tax_treatment"),
    trade: str(row, "trade"),
    payee: str(row, "payee"),
    description: str(row, "description"),
    paid_from: str(row, "paid_from"),
    source: str(row, "source"),
    void_of: str(row, "void_of"),
  }));
}

// A void entry is an ordinary row that mirrors its original with debits and credits
// swapped, so it nets to zero by construction wherever it's summed — no special-casing
// void_of anywhere below.
function inWindow(line, { asOf, from, to } = {}) {
  if (asOf !== undefined && asOf !== null && line.date > asOf) return false;
  if (from !== undefined && from !== null && line.date < from) return false;
  if (to !== undefined && to !== null && line.date > to) return false;
  return true;
}

/**
 * Trial balance: every account's summed debits and credits through `asOf`.
 *
 * @param {Array<object>} lines
 * @param {{asOf?:string}} [opts]
 */
export function trialBalance(lines, { asOf } = {}) {
  const totals = new Map(); // account -> {debit, credit}
  for (const line of lines) {
    if (!inWindow(line, { asOf })) continue;
    const t = totals.get(line.account) ?? { debit: 0, credit: 0 };
    t.debit += line.debit;
    t.credit += line.credit;
    totals.set(line.account, t);
  }

  const rows = [...totals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([account, { debit, credit }]) => ({
      account,
      name: accountName(account),
      debit,
      credit,
      net: debit - credit,
    }));

  const total_debit = sumCents(rows.map((r) => r.debit));
  const total_credit = sumCents(rows.map((r) => r.credit));

  return { rows, total_debit, total_credit, balanced: total_debit === total_credit };
}

/**
 * Balance sheet as of a date. assets = 1000-1399 (grouped by property, as "Property
 * inventory" — D-010/D-011: these are the property's capitalized costs including
 * Dennis's financing) + 1400s cash + 1500/1510 + 7000; liabilities = every 2000-series
 * account (D-006: 2000 accrued interest, 2010 note payable, plus 2020/2030);
 * equity = 9000s (Paul's owner equity only, per D-006 — Dennis is a lender, not a
 * member) + current_earnings.
 *
 * @param {Array<object>} lines
 * @param {{asOf?:string}} [opts]
 */
export function balanceSheet(lines, { asOf } = {}) {
  const inScope = lines.filter((l) => inWindow(l, { asOf }));

  const propertyInventory = new Map(); // property -> net debit-credit
  const cashAndOther = new Map(); // account -> net (1400s, 1500, 1510, 7000)
  const liabilityTotals = new Map(); // account -> net credit-debit
  const equityTotals = new Map(); // account -> net credit-debit
  let income = 0;
  let cogs = 0;
  let expenses = 0;

  for (const line of inScope) {
    const series = seriesOf(line.account);
    if (series === "1000") {
      // D-010: every 1000-1399 line is capitalized on a specific property.
      const key = line.property || "(no property)";
      propertyInventory.set(key, (propertyInventory.get(key) ?? 0) + line.debit - line.credit);
    } else if (series === "1400" || series === "7000") {
      cashAndOther.set(line.account, (cashAndOther.get(line.account) ?? 0) + line.debit - line.credit);
    } else if (series === "2000") {
      liabilityTotals.set(line.account, (liabilityTotals.get(line.account) ?? 0) + line.credit - line.debit);
    } else if (series === "9000") {
      // D-006: 9000 series is Paul's owner equity only.
      equityTotals.set(line.account, (equityTotals.get(line.account) ?? 0) + line.credit - line.debit);
    } else if (series === "4000") {
      income += line.credit - line.debit;
    } else if (series === "5000") {
      cogs += line.debit - line.credit;
    } else if (series === "6000") {
      expenses += line.debit - line.credit;
    }
  }

  const current_earnings = income - cogs - expenses;

  const assets = [
    ...[...propertyInventory.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([property, balance]) => ({ account: property, name: `Property inventory — ${property}`, balance })),
    ...[...cashAndOther.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([account, balance]) => ({ account, name: accountName(account), balance })),
  ];
  const liabilities = [...liabilityTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([account, balance]) => ({ account, name: accountName(account), balance }));
  const equity = [...equityTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([account, balance]) => ({ account, name: accountName(account), balance }));

  const total_assets = sumCents(assets.map((a) => a.balance));
  const total_liabilities = sumCents(liabilities.map((l) => l.balance));
  const total_equity = sumCents(equity.map((e) => e.balance)) + current_earnings;

  return {
    assets,
    liabilities,
    equity,
    current_earnings,
    total_assets,
    total_liabilities,
    total_equity,
    ties: total_assets === total_liabilities + total_equity,
  };
}

/**
 * Profit & loss over [from, to]. income = 4000s, cogs = 5000s, expenses = 6000s
 * (D-010: expenses are overhead and never carry a property, so by_property only ever
 * groups income/cogs lines, which do carry one at settlement/release).
 *
 * @param {Array<object>} lines
 * @param {{from?:string, to?:string}} [opts]
 */
export function profitAndLoss(lines, { from, to } = {}) {
  const inScope = lines.filter((l) => inWindow(l, { from, to }));

  const incomeTotals = new Map();
  const cogsTotals = new Map();
  const expenseTotals = new Map();
  const byProperty = new Map(); // property -> {income, cogs}

  for (const line of inScope) {
    const series = seriesOf(line.account);
    if (series === "4000") {
      incomeTotals.set(line.account, (incomeTotals.get(line.account) ?? 0) + line.credit - line.debit);
      if (line.property) {
        const p = byProperty.get(line.property) ?? { income: 0, cogs: 0 };
        p.income += line.credit - line.debit;
        byProperty.set(line.property, p);
      }
    } else if (series === "5000") {
      cogsTotals.set(line.account, (cogsTotals.get(line.account) ?? 0) + line.debit - line.credit);
      if (line.property) {
        const p = byProperty.get(line.property) ?? { income: 0, cogs: 0 };
        p.cogs += line.debit - line.credit;
        byProperty.set(line.property, p);
      }
    } else if (series === "6000") {
      expenseTotals.set(line.account, (expenseTotals.get(line.account) ?? 0) + line.debit - line.credit);
    }
  }

  const income = [...incomeTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([account, balance]) => ({ account, name: accountName(account), balance }));
  const cogsRows = [...cogsTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([account, balance]) => ({ account, name: accountName(account), balance }));
  const expensesRows = [...expenseTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([account, balance]) => ({ account, name: accountName(account), balance }));

  const income_total = sumCents(income.map((r) => r.balance));
  const cogs_total = sumCents(cogsRows.map((r) => r.balance));
  const gross_profit = income_total - cogs_total;
  const expense_total = sumCents(expensesRows.map((r) => r.balance));
  const net_income = gross_profit - expense_total;

  const by_property = [...byProperty.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([property, { income, cogs }]) => ({ property, income, cogs, gross: income - cogs }));

  return { income, cogs: cogsRows, gross_profit, expenses: expensesRows, net_income, by_property };
}

/**
 * One property's job cost: its 1000-1399 activity through `asOf`, sliced by cost_class
 * (Acquisition/Rehab/Holding/Financing/Selling — D-011 puts Dennis interest in
 * Financing here), by account, and by trade.
 *
 * @param {Array<object>} lines
 * @param {string} property
 * @param {{asOf?:string}} [opts]
 */
export function propertyJobCost(lines, property, { asOf } = {}) {
  const inScope = lines.filter((l) => l.property === property && inWindow(l, { asOf }));
  // D-010: property costs live only in the 1000-1399 range.
  const jobLines = inScope.filter((l) => seriesOf(l.account) === "1000");

  const byCostClass = new Map();
  const byAccount = new Map();
  const byTrade = new Map();

  for (const line of jobLines) {
    const net = line.debit - line.credit;
    const costClassKey = line.cost_class || "(uncategorized)";
    byCostClass.set(costClassKey, (byCostClass.get(costClassKey) ?? 0) + net);
    byAccount.set(line.account, (byAccount.get(line.account) ?? 0) + net);
    const tradeKey = line.trade || "(none)";
    byTrade.set(tradeKey, (byTrade.get(tradeKey) ?? 0) + net);
  }

  const by_cost_class = [...byCostClass.entries()].map(([cost_class, total]) => ({ cost_class, total }));
  const by_account = [...byAccount.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([account, total]) => ({ account, name: accountName(account), total }));
  const by_trade = [...byTrade.entries()].map(([trade, total]) => ({ trade, total }));

  const total_cost = sumCents(jobLines.map((l) => l.debit - l.credit));

  // Released to COGS at sale (5000 series, tagged to this property).
  const releasedLines = inScope.filter((l) => seriesOf(l.account) === "5000");
  const released_to_cogs = sumCents(releasedLines.map((l) => l.debit - l.credit));

  return { property, by_cost_class, by_account, by_trade, total_cost, released_to_cogs, lines: jobLines };
}

/**
 * One property's balance sheet: its capitalized costs (1000-1399 + 1500) against
 * Dennis's note and accrued interest on it (2000, 2010 — D-006/D-011; deliberately not
 * the full 2000-series, e.g. 2030 Due to owner is a personal reimbursement, not this
 * property's liability).
 *
 * @param {Array<object>} lines
 * @param {string} property
 * @param {{asOf?:string}} [opts]
 */
export function propertyBalanceSheet(lines, property, { asOf } = {}) {
  const inScope = lines.filter((l) => l.property === property && inWindow(l, { asOf }));

  const assetTotals = new Map();
  const liabilityTotals = new Map();

  for (const line of inScope) {
    const series = seriesOf(line.account);
    if (series === "1000" || line.account === "1500") {
      assetTotals.set(line.account, (assetTotals.get(line.account) ?? 0) + line.debit - line.credit);
    }
    if (line.account === "2000" || line.account === "2010") {
      liabilityTotals.set(line.account, (liabilityTotals.get(line.account) ?? 0) + line.credit - line.debit);
    }
  }

  const assets = [...assetTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([account, balance]) => ({ account, name: accountName(account), balance }));
  const liabilities = [...liabilityTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([account, balance]) => ({ account, name: accountName(account), balance }));

  const total_assets = sumCents(assets.map((a) => a.balance));
  const total_liabilities = sumCents(liabilities.map((l) => l.balance));

  return { property, assets, liabilities, total_assets, total_liabilities, net: total_assets - total_liabilities };
}

/**
 * Dennis's loan ledger, per property: principal outstanding and interest posted from
 * the journal (2010/2000, D-006), against interest actually accrued to date
 * (lib/accrual.payoffAt — D-011: every advance's interest is a property cost whether or
 * not it has been posted yet).
 *
 * @param {Array<object>} lines
 * @param {Array<{advance_id:string, date:string, amount_cents:number, property:string, repaid_date?:string}>} advances
 * @param {{asOf?:string}} [opts]
 * @param {{rateAnnual?:number, stubBasis?:number}} [accrualOpts]
 */
export function dennisLedger(lines, advances, { asOf } = {}, accrualOpts) {
  const inScope = lines.filter((l) => inWindow(l, { asOf }));

  const principalTotals = new Map();
  const postedTotals = new Map();
  const properties = new Set();

  for (const line of inScope) {
    if (line.account === "2010") {
      properties.add(line.property);
      principalTotals.set(line.property, (principalTotals.get(line.property) ?? 0) + line.credit - line.debit);
    } else if (line.account === "2000") {
      properties.add(line.property);
      postedTotals.set(line.property, (postedTotals.get(line.property) ?? 0) + line.credit - line.debit);
    }
  }
  for (const advance of advances) {
    if (advance.property) properties.add(advance.property);
  }

  const by_property = [...properties]
    .sort((a, b) => a.localeCompare(b))
    .map((property) => {
      const principal_outstanding = principalTotals.get(property) ?? 0;
      const interest_posted = postedTotals.get(property) ?? 0;
      const propertyAdvances = advances.filter((a) => a.property === property);
      const payoff = payoffAt(propertyAdvances, property, asOf, accrualOpts);
      const interest_accrued_to_date = payoff.interest_cents;
      // Clamp at 0 and flag rather than show a negative "unposted" figure — posted
      // should never exceed accrued, but a data-entry mistake shouldn't produce a
      // nonsensical report.
      const interest_unposted = Math.max(0, interest_accrued_to_date - interest_posted);
      const posted_exceeds_accrued = interest_posted > interest_accrued_to_date;

      return {
        property,
        principal_outstanding,
        interest_posted,
        interest_accrued_to_date,
        interest_unposted,
        posted_exceeds_accrued,
        payoff,
      };
    });

  const totals = {
    principal_outstanding: sumCents(by_property.map((p) => p.principal_outstanding)),
    interest_posted: sumCents(by_property.map((p) => p.interest_posted)),
    interest_accrued_to_date: sumCents(by_property.map((p) => p.interest_accrued_to_date)),
    interest_unposted: sumCents(by_property.map((p) => p.interest_unposted)),
  };

  return { by_property, totals };
}

/**
 * The P&L tab (Paul, 2026-09-30: "change the name of the tab to P&L and put the P&L section at the top.
 * remove any duplicate numbers and streamline this as much as you can"), in plain words (CLAUDE.md rule 7),
 * each fact once: this year's profit and loss (each house sold, business costs, what Recast earned), then
 * what Recast owns and owes today, what was paid out and what is left. Dennis's interest built up on the
 * open advances but not recorded yet is part of what the houses cost AND owed to Dennis, so it is counted
 * on both sides (the sheet still adds up) and named once, on the owes side. The houses are one line - each
 * house's tab has its own numbers; business costs by type are on the Totals tab. Zero lines are left off.
 *
 * @param {Array<object>} lines loadJournal lines
 * @param {Array<object>} advances the Advances tab in accrual shape (loadAdvances_)
 * @param {string} asOf YYYY-MM-DD
 * @param {{ paulOnly?: Iterable<string> }} [opts] houses that are Paul's alone (Properties dennis_share_pct 0: 104 Ashburne,
 *   1014 S View) - what Recast owes him on them is paid from Chase (D-101)
 * @returns {{ rows: any[][], kinds: string[], ties: boolean }} rows are [what, dollars, note]; kinds are
 *   "head", "total", "detail" (an indented row making up the line above it) or "" per row
 */
export function pnlTab(lines, advances, asOf, accrualOpts, opts = {}) {
  const year = asOf.slice(0, 4);
  const voided = new Set(lines.map((l) => l.void_of).filter(Boolean));
  const live = lines.filter((l) => l.source !== "void" && !voided.has(l.txn_id) && String(l.date).slice(0, 10) <= asOf);
  const rows = [], kinds = [];
  const add = (kind, what, cents = "", note = "") => { rows.push([what, cents === "" ? "" : cents / 100, note]); kinds.push(kind); };

  // interest built up on each open advance, less what is already recorded against it (1200 lines
  // "Interest YYYY-MM on <advance_id>", buildInterestEntry_)
  let interest = 0;
  for (const a of advances) {
    if (a.status !== "open" || (a.repaid_date && a.repaid_date <= asOf)) continue;
    const posted = live.filter((l) => String(l.account) === "1200" && String(l.description).endsWith(` on ${a.advance_id}`)).reduce((s, l) => s + l.debit - l.credit, 0);
    interest += Math.max(0, accruedThrough(a, asOf, accrualOpts) - posted);
  }

  const pl = profitAndLoss(lines, { from: `${year}-01-01`, to: asOf });
  const soldOn = new Map(live.filter((l) => seriesOf(l.account) === "4000" && String(l.date).startsWith(year) && l.property).map((l) => [l.property, String(l.date).slice(5, 10)]));
  const costs = pl.expenses.reduce((s, e) => s + e.balance, 0);
  add("head", `PROFIT AND LOSS - ${year} YEAR TO DATE`);
  // a house Dennis put no money into (1014 S View, Paul's own deal with an outside lender, D-079) says so
  const dennisIn = new Set(live.filter((l) => ["2000", "2010", "1220"].includes(String(l.account))).map((l) => l.property));
  for (const p of pl.by_property) if (p.gross) add("", p.property, p.gross, !soldOn.has(p.property) ? ""
    : `sold ${soldOn.get(p.property)} - ` + (dennisIn.has(p.property) ? "Recast's profit after Dennis was paid" : "your own deal, Dennis was not in it"));
  const other = pl.gross_profit - pl.by_property.reduce((s, p) => s + p.gross, 0);
  if (other) add("", "Other income", other);
  if (costs) add("", "Business costs", -costs, "tools, travel, software - never charged to a house; by type on the Totals tab");
  add("total", "Net income", pl.net_income);

  const bs = balanceSheet(lines, { asOf });
  const houses = bs.assets.filter((a) => !/^\d+$/.test(a.account) && a.account !== "Cost Recapture" && a.balance);
  const name = { "1401": "Cash in the Citizens account", "1402": "Operating cash - the business Chase account", "1510": "Money held back at a closing (escrow)",
    "1520": "Claude API credits recorded the old way - tell Claude", "7000": "Equipment and other big purchases" };
  add("", "");
  add("head", "ASSETS");
  if (houses.length) add("", `Houses still held (${houses.length})`, houses.reduce((s, a) => s + a.balance, 0) + interest, "what they cost so far, Dennis's interest included - each has its own tab");
  for (const a of bs.assets) {
    if (!a.balance || houses.includes(a)) continue;
    if (a.account === "Cost Recapture") add("", "Costs paid after a house sold", a.balance, "the Cost Recapture tab");
    else add("", name[a.account] || a.name, a.balance);
  }
  const owns = bs.total_assets + interest;
  add("total", "Total assets", owns);

  const bal = (acct) => (bs.liabilities.find((x) => x.account === acct) || {}).balance || 0;
  // What Recast owes Paul, by the account that pays it (D-101; Paul, 2026-11-01: "i want to be able to see in one place
  // how much money the chase account owes me and how much the citizens account owes me"). Chase (his own account,
  // D-098): the business costs he paid, his own houses' (dennis_share_pct 0), and his money sitting in Chase. Citizens
  // (shared with Dennis): costs he paid on the partner houses and Cost Recapture (paid back at each sale), his payouts
  // from sold partner houses not taken out yet, and his working money there. The two add up to 2030. Each is a small
  // ledger (Paul, 2026-11-01: "more of a ledger for what makes up the amounts owed for each row"): one indented "detail"
  // row per house or pot of his money under the line, adding up to it. Money in the business Chase belongs to the
  // business (D-103, Paul 2026-11-01: "i moved the 30,000 out of business into personal. that money no longer belongs
  // to the business"): what he put in is "Capital contributions", the cash is Operating cash above, and Chase's line is what he
  // paid for the business and his own houses still held, plus a sold one's payout not taken out yet. His money in Chase
  // still on 2030 (no house, paid from 1402) was booked the old way and says so.
  const paulOnly = new Set(opts.paulOnly || []);
  const soldHouses = new Set(live.filter((l) => seriesOf(l.account) === "4000").map((l) => l.property));
  const pot = new Map();   // house, "OVERHEAD" (business and his own held houses), " cash" (the old way) or " citizens" (his working money) -> cents
  for (const l of live) {
    if (String(l.account) !== "2030") continue;
    const p = l.property || "";
    const k = !p ? (l.paid_from === "1402" ? " cash" : " citizens") : paulOnly.has(p) && !soldHouses.has(p) ? "OVERHEAD" : p;
    pot.set(k, (pot.get(k) || 0) + l.credit - l.debit);
  }
  const named = { OVERHEAD: ["Business expenses owed", "costs he paid for the business"], "Cost Recapture": ["Costs paid after a house sold", "the Cost Recapture tab"],
    " cash": ["His money in Chase booked as a loan", "the old way - tell Claude"], " citizens": ["His working money", "listed at the bottom"] };
  const rank = (k) => k === " cash" ? 0 : k === "OVERHEAD" ? 1 : k === "Cost Recapture" ? 3 : k === " citizens" ? 4 : 2;
  const ledger = (chase) => [...pot.keys()].filter((k) => pot.get(k) && (k === "OVERHEAD" || k === " cash" || paulOnly.has(k)) === chase)
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((k) => {
      const [what, note] = named[k] || [k, soldHouses.has(k) ? "sold - his payout, not taken out yet" : "costs he paid, back when it sells"];
      return ["    " + what, pot.get(k), note];
    });
  const sum = (rows) => rows.reduce((s, r) => s + r[1], 0);
  const chaseLedger = ledger(true), citLedger = ledger(false);
  add("", "");
  add("head", "LIABILITIES");
  // Paul's two lines - by the account that pays him (D-101, Paul 2026-11-01) - stay on the tab even at zero
  [["Dennis - money he lent", bal("2010"), "for the houses, plus his working money in the account (listed at the bottom)"],
   ["Dennis - interest recorded, not paid yet", bal("2000"), ""],
   ["Dennis - interest not recorded yet", interest, "built up to today on every advance still open"],
   ["Paul - owed from the Chase account", sum(chaseLedger), "", true, chaseLedger],
   ["Paul - owed from the Citizens account", sum(citLedger), "", true, citLedger],
   ...bs.liabilities.filter((l) => !["2000", "2010", "2030"].includes(l.account)).map((l) => [l.name, l.balance, ""]),
  ].forEach(([what, c, note, always, detail = []]) => {
    if (c || always) add("", what, c, note);
    for (const d of detail) add("detail", ...d);
  });
  const owes = bs.total_liabilities + interest;
  add("total", "Total liabilities", owes);

  const allTime = profitAndLoss(lines, { to: asOf }).net_income;
  const paid = bs.equity.reduce((s, e) => s + e.balance, 0);
  const left = allTime + paid;
  const money = (c) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  add("", "");
  // Industry terms (D-104), laid out as the standard roll-forward the independent audit asked for (2026-11-01, D-105):
  // earlier years' profit, this year's, what Paul put in, what was paid out, what is left - every row adds up to the total.
  add("head", "MEMBER'S EQUITY");
  if (allTime !== pl.net_income) add("", `Net income from before ${year}`, allTime - pl.net_income);
  add("", `Net income - ${year} year to date`, pl.net_income, "the Net income line at the top");
  // Capital contributions is a ledger: his deposits into the business Chase (D-103, described "Put into the business
  // Chase by Paul - <what>", the part after the dash is the note) and a house's shortfall he absorbed (D-079: what Recast
  // owed him for it, forgiven - the same figure as that house's loss at the top, one fact in two places, never counted twice).
  const putIn = live.filter((l) => String(l.account) === "9000");
  const deposits = putIn.filter((l) => !l.property);
  const suffix = (ls) => [...new Set(ls.map((l) => String(l.description).split(" - ")[1]).filter(Boolean))].join(" and ");
  const putInRows = [
    ["Put into the business Chase", deposits, suffix(deposits)],
    ...[...new Set(putIn.filter((l) => l.property).map((l) => l.property))].map((p) => [`${p} - the shortfall Paul absorbed`, putIn.filter((l) => l.property === p),
      "what Recast owed him for it, forgiven and counted as capital - the same figure as that house's loss at the top, not counted twice"]),
  ].map(([what, ls, note]) => ["    " + what, ls.reduce((s, l) => s + l.credit - l.debit, 0), note]).filter((r) => r[1]);
  // Distributions is a ledger too (audit 2026-11-01: most of it was never cash he kept): one row per house, saying where
  // its share stands - paid from the bank that day, put back into the business Chase as capital (a deposit on 9000 names
  // the house, D-103), left in Citizens as his working money (D-055), or still owed to him (its sold-house row above).
  const draws = live.filter((l) => String(l.account) === "9010");
  const accts = new Map();
  for (const l of live) { if (!accts.has(l.txn_id)) accts.set(l.txn_id, new Set()); accts.get(l.txn_id).add(String(l.account)); }
  const drawRows = [...new Set(draws.map((l) => l.property || ""))].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b)).map((p) => {   // houses first, his own draws last
    const ls = draws.filter((l) => (l.property || "") === p);
    const amt = ls.reduce((s, l) => s + l.credit - l.debit, 0);
    const cashLs = ls.filter((l) => accts.get(l.txn_id).has("1401") || accts.get(l.txn_id).has("1402"));
    const cash = cashLs.reduce((s, l) => s + l.credit - l.debit, 0);
    const bank = cashLs.some((l) => accts.get(l.txn_id).has("1401")) ? "Citizens" : "Chase";
    const back = !!p && deposits.some((l) => String(l.description).includes(p));
    const kept = live.filter((l) => String(l.account) === "2030" && !l.property && /^Working money\b.*left in/.test(l.description) && String(l.description).includes(p)).reduce((s, l) => s + l.credit - l.debit, 0);
    const owed = p ? pot.get(p) || 0 : 0;
    const note = !p ? suffix(ls) : cash === amt ? `paid to Paul from ${bank}`
      : back ? "paid to Paul and put back into the business Chase as capital - counted above, not cash he kept"
      : [kept && `${money(kept)} left in Citizens as his working money`, owed && `${money(owed)} owed to him, not paid yet - under LIABILITIES`].filter(Boolean).join("; ") || "declared at the sale";
    return ["    " + (p || "Taken out for Paul"), amt, note];
  });
  for (const e of bs.equity) {
    if (!e.balance) continue;
    if (e.account === "9000") { add("", "Capital contributions", e.balance, "what Paul put in"); for (const r of putInRows) add("detail", ...r); }
    else if (e.account === "9010") { add("", "Distributions", e.balance, "his share of each sold house's profit, declared at its sale, and anything the business paid for him"); for (const r of drawRows) add("detail", ...r); }
    else add("", e.name, e.balance);
  }
  add("total", "Total member's equity", left, "Total assets less Total liabilities");

  // The working money in the Citizens account (Paul, 2026-10-29: "a ledger of how much both dennis and i have put into
  // the citizens account as working capital"): every D-055 line - no house, described "Working money ...", paid from
  // 1401 - in date order, then what each partner has in. Chase is Paul's alone and has its own line above.
  const wm = live.filter((l) => ["2010", "2030"].includes(String(l.account)) && !l.property && /^Working money\b/.test(l.description) && l.paid_from === "1401")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (wm.length) {
    const has = { Dennis: 0, Paul: 0 };
    add("", "");
    add("head", "WORKING MONEY IN THE CITIZENS ACCOUNT", "", "money each of you put in for general use - no house, no interest, owed back when it is taken out");
    for (const l of wm) {
      const who = String(l.account) === "2010" ? "Dennis" : "Paul";
      const c = l.credit - l.debit;
      has[who] += c;
      const verb = /left in/.test(l.description) ? "left in" : c < 0 ? "took out" : "put in";
      add("", `${String(l.date).slice(5, 10)}  ${who} ${verb}`, c, (l.description.split(" - ")[1] || "").trim());
    }
    add("total", "Dennis has in the account", has.Dennis);
    add("total", "Paul has in the account", has.Paul);
  }
  return { rows, kinds, ties: owns === owes + left };
}
