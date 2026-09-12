// lib/coa.mjs — chart of accounts, spec §6 and §9
//
// Source of truth: docs/chart-of-accounts.md with the 2026-09-11 changes folded in
// (phase0-spec.md §6 is the binding version — it adds 1220 and 2030, which the older
// docs/chart-of-accounts.md draft does not yet have).
//
// Fields the spec doesn't state a value for (cost_class/tax_treatment on balance-sheet
// accounts like cash, liabilities, income, 7000) are left "" rather than omitted, to
// match the entry-line schema in phase0-spec.md §3, which uses "" for "not applicable"
// rather than null/undefined.

const ACQUISITION = { cost_class: "Acquisition", tax_treatment: "Inventory (held)" };
const REHAB = { cost_class: "Rehab", tax_treatment: "Inventory (held)" };
const HOLDING = { cost_class: "Holding", tax_treatment: "Inventory (held)" };
const FINANCING = { cost_class: "Financing", tax_treatment: "Inventory (held)" };
const SELLING = { cost_class: "Selling", tax_treatment: "Inventory (held)" };
const NONE = { cost_class: "", tax_treatment: "" };
const OVERHEAD = { cost_class: "Overhead", tax_treatment: "Expense" };

/** @type {Array<{code:string,name:string,series:string,type:string,cost_class:string,tax_treatment:string}>} */
export const ACCOUNTS = [
  // 1000 series — property costs, capitalized to inventory while held (§6)
  acct("1000", "Purchase price", "1000", "asset", ACQUISITION),
  acct("1010", "Acquisition costs", "1000", "asset", ACQUISITION),
  acct("1020", "Rehab — subcontract labor", "1000", "asset", REHAB),
  acct("1030", "Rehab — materials", "1000", "asset", REHAB),
  acct("1040", "Rehab — fixtures & appliances", "1000", "asset", REHAB),
  acct("1050", "Permits & inspections", "1000", "asset", REHAB),
  acct("1060", "Debris & haul-off", "1000", "asset", REHAB),
  acct("1100", "Holding — property tax", "1000", "asset", HOLDING),
  acct("1110", "Holding — insurance", "1000", "asset", HOLDING),
  acct("1120", "Holding — utilities", "1000", "asset", HOLDING),
  acct("1130", "Holding — HOA & grounds", "1000", "asset", HOLDING),
  acct("1200", "Financing — interest (Dennis)", "1000", "asset", FINANCING),
  acct("1210", "Financing — points & fees", "1000", "asset", FINANCING),
  acct("1220", "Profit participation — Dennis", "1000", "asset", FINANCING),
  acct("1300", "Selling — commission", "1000", "asset", SELLING),
  acct("1310", "Selling — closing costs", "1000", "asset", SELLING),
  acct("1320", "Selling — concessions & credits", "1000", "asset", SELLING),
  acct("1330", "Selling — staging & marketing", "1000", "asset", SELLING),

  // 1400 series — cash & other balance-sheet assets
  acct("1401", "Cash — Citizens shared", "1400", "asset", NONE),
  acct("1402", "Cash — Chase operating", "1400", "asset", NONE),
  acct("1500", "Earnest money & deposits", "1400", "asset", NONE),
  acct("1510", "Escrow & holdbacks receivable", "1400", "asset", NONE),

  // 2000 series — liabilities
  acct("2000", "Accrued interest — Dennis", "2000", "liability", NONE),
  acct("2010", "Note payable — Dennis", "2000", "liability", NONE),
  acct("2020", "Backup withholding payable", "2000", "liability", NONE),
  acct("2030", "Due to owner (Paul)", "2000", "liability", NONE),

  // 4000 series — income
  acct("4000", "Property sale proceeds", "4000", "income", NONE),
  acct("4010", "Wholesale assignment fees", "4000", "income", NONE),
  acct("4020", "Escrow holdback released", "4000", "income", NONE),
  acct("4030", "Other income", "4000", "income", NONE),

  // 5000 series — cost of goods sold, the release target
  acct("5000", "COGS — property released", "5000", "cogs", { cost_class: "", tax_treatment: "COGS (released)" }),
  acct("5010", "COGS — wholesale", "5000", "cogs", { cost_class: "", tax_treatment: "COGS (released)" }),

  // 6000 series — overhead operating expenses, deducted currently (D-010: never a property)
  acct("6000", "Advertising & signage", "6000", "expense", OVERHEAD),
  acct("6010", "Lead generation", "6000", "expense", OVERHEAD),
  acct("6100", "Contract labor — non-property", "6000", "expense", OVERHEAD),
  acct("6200", "Legal & professional", "6000", "expense", OVERHEAD),
  acct("6210", "Accounting & bookkeeping", "6000", "expense", OVERHEAD),
  acct("6300", "Data & research", "6000", "expense", OVERHEAD),
  acct("6350", "Abandoned deal costs", "6000", "expense", OVERHEAD),
  acct("6400", "Software & subscriptions", "6000", "expense", OVERHEAD),
  acct("6410", "Website & hosting", "6000", "expense", OVERHEAD),
  acct("6500", "Office supplies & postage", "6000", "expense", OVERHEAD),
  acct("6510", "Small tools & equipment", "6000", "expense", OVERHEAD),
  acct("6600", "Vehicle (actual)", "6000", "expense", OVERHEAD),
  acct("6610", "Tolls & parking", "6000", "expense", OVERHEAD),
  acct("6700", "Travel", "6000", "expense", OVERHEAD),
  acct("6710", "Meals (50%)", "6000", "expense", OVERHEAD),
  acct("6720", "Business gifts", "6000", "expense", OVERHEAD),
  acct("6800", "Insurance — entity", "6000", "expense", OVERHEAD),
  acct("6900", "Taxes & licenses", "6000", "expense", OVERHEAD),
  acct("6910", "Bank & merchant fees", "6000", "expense", OVERHEAD),
  acct("6920", "Dues & education", "6000", "expense", OVERHEAD),
  acct("6930", "Interest — other", "6000", "expense", OVERHEAD),

  // 7000 series — depreciable assets (also gated OVERHEAD-only by D-010, §3 OVERHEAD_ON_PROPERTY)
  acct("7000", "Depreciable assets", "7000", "asset", { cost_class: "", tax_treatment: "Fixed asset" }),

  // 9000 series — equity, never an expense
  acct("9000", "Owner contributions", "9000", "equity", { cost_class: "", tax_treatment: "Owner equity" }),
  acct("9010", "Owner draws & distributions", "9000", "equity", { cost_class: "", tax_treatment: "Owner equity" }),
];

function acct(code, name, series, type, { cost_class, tax_treatment }) {
  return { code, name, series, type, cost_class, tax_treatment };
}

/**
 * @returns {Map<string, {code:string,name:string,series:string,type:string,cost_class:string,tax_treatment:string}>}
 */
export function accountMap() {
  return new Map(ACCOUNTS.map((a) => [a.code, a]));
}

/**
 * The series bucket a code belongs to, per the eight buckets phase0-spec.md §9 names.
 * "series" is not the account's literal first-digit prefix (1020's own series id is
 * "1000") — it's which thousand-block behaviour applies, and the 1000 block itself
 * splits into 1000-1399 (property costs) vs 1400-1599 (cash & other assets).
 *
 * @param {string|number} code
 * @returns {"1000"|"1400"|"2000"|"4000"|"5000"|"6000"|"7000"|"9000"}
 */
export function seriesOf(code) {
  const n = Number(code);
  if (!Number.isInteger(n)) {
    throw new RangeError(`seriesOf: not a valid account code: ${code}`);
  }
  if (n >= 1000 && n < 1400) return "1000";
  if (n >= 1400 && n < 2000) return "1400";
  if (n >= 2000 && n < 3000) return "2000";
  if (n >= 4000 && n < 5000) return "4000";
  if (n >= 5000 && n < 6000) return "5000";
  if (n >= 6000 && n < 7000) return "6000";
  if (n >= 7000 && n < 8000) return "7000";
  if (n >= 9000 && n < 10000) return "9000";
  throw new RangeError(`seriesOf: account code out of known ranges: ${code}`);
}
