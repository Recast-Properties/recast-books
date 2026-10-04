// GENERATED from lib/*.mjs by scripts/build-gs.mjs - do not edit by hand.
// Apps Script stand-ins for the two node:crypto calls lib/posting.mjs makes.
function createHash(algo) {
  if (algo !== 'sha256') throw new Error('createHash: only sha256 is shimmed');
  var parts = [];
  var api = {
    update: function (s) { parts.push(String(s)); return api; },
    digest: function (enc) {
      if (enc !== 'hex') throw new Error('digest: only hex is shimmed');
      var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, parts.join(''), Utilities.Charset.UTF_8);
      return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
    }
  };
  return api;
}
function randomBytes(n) {
  var bytes = [];
  for (var i = 0; i < n; i++) bytes.push(Math.floor(Math.random() * 256));
  return { toString: function (enc) {
    if (enc !== 'hex') throw new Error('randomBytes.toString: only hex is shimmed');
    return bytes.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  } };
}

// ---- lib/coa.mjs ----
var M_coa = (function () {
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
  const ACCOUNTS = [
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
    acct("1130", "Holding — HOA", "1000", "asset", HOLDING),
    acct("1200", "Financing — interest (Dennis)", "1000", "asset", FINANCING),
    acct("1210", "Financing — points & fees", "1000", "asset", FINANCING),
    acct("1220", "Profit participation — Dennis", "1000", "asset", FINANCING),
    acct("1300", "Selling — commission", "1000", "asset", SELLING),
    acct("1310", "Selling — closing costs", "1000", "asset", SELLING),
    acct("1320", "Selling — concessions & credits", "1000", "asset", SELLING),
    acct("1330", "Selling — staging & marketing", "1000", "asset", SELLING),
    acct("1340", "Selling — HOA release", "1000", "asset", SELLING),

    // 1400 series — cash & other balance-sheet assets
    acct("1401", "Cash — Citizens shared", "1400", "asset", NONE),
    acct("1402", "Cash — Chase operating", "1400", "asset", NONE),
    acct("1500", "Earnest money & deposits", "1400", "asset", NONE),
    acct("1510", "Escrow & holdbacks receivable", "1400", "asset", NONE),
    acct("1520", "Prepaid API credits", "1400", "asset", NONE),

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
  function accountMap() {
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
  function seriesOf(code) {
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

  return { ACCOUNTS, accountMap, seriesOf };
})();
var ACCOUNTS = M_coa.ACCOUNTS;
var accountMap = M_coa.accountMap;
var seriesOf = M_coa.seriesOf;

// ---- lib/money.mjs ----
var M_money = (function () {
  // lib/money.mjs — spec §2
  //
  // Integer cents everywhere inside code. Parse on the way in, format on the way out.
  // Never parseFloat a total and add.

  /**
   * Parse a dollar amount into integer cents.
   * Accepts: "212.40", "$1,234.56", 212.4 (number), "(44.39)" (parens = negative).
   * Throws RangeError for anything that is not a finite number once parsed.
   *
   * @param {string|number} input
   * @returns {number} integer cents, may be negative
   */
  function toCents(input) {
    if (typeof input === "number") {
      if (!Number.isFinite(input)) {
        throw new RangeError(`toCents: not a finite number: ${input}`);
      }
      return round(input * 100);
    }

    if (typeof input !== "string") {
      throw new RangeError(`toCents: unsupported input type: ${typeof input}`);
    }

    let str = input.trim();
    if (str === "") {
      throw new RangeError("toCents: empty string");
    }

    // Parenthesized amounts are accounting notation for negative, e.g. "(44.39)".
    let negative = false;
    const parenMatch = str.match(/^\((.*)\)$/);
    if (parenMatch) {
      negative = true;
      str = parenMatch[1].trim();
    }

    // Strip a leading sign (kept aside so we don't lose the parens/sign combination).
    if (str.startsWith("-")) {
      negative = true;
      str = str.slice(1);
    } else if (str.startsWith("+")) {
      str = str.slice(1);
    }

    // Strip currency symbols and thousands separators.
    str = str.replace(/[$,\s]/g, "");

    if (str === "" || !/^\d+(\.\d+)?$/.test(str)) {
      throw new RangeError(`toCents: cannot parse amount: ${JSON.stringify(input)}`);
    }

    const value = Number(str);
    if (!Number.isFinite(value)) {
      throw new RangeError(`toCents: not a finite number: ${JSON.stringify(input)}`);
    }

    const cents = round(value * 100);
    return negative ? -cents : cents;
  }

  /**
   * Format integer cents as a fixed 2-decimal dollar string, e.g. 21240 -> "212.40".
   * Negative cents produce a leading "-", e.g. -4439 -> "-44.39".
   *
   * @param {number} cents
   * @returns {string}
   */
  function fromCents(cents) {
    if (!Number.isInteger(cents)) {
      throw new RangeError(`fromCents: expected an integer number of cents, got ${cents}`);
    }
    const negative = cents < 0;
    const abs = Math.abs(cents);
    const dollars = Math.floor(abs / 100);
    const remainder = abs % 100;
    const sign = negative ? "-" : "";
    return `${sign}${dollars}.${String(remainder).padStart(2, "0")}`;
  }

  /**
   * Sum an array of integer cents. Never touches floating point.
   *
   * @param {number[]} centsArray
   * @returns {number}
   */
  function sumCents(centsArray) {
    let total = 0;
    for (const c of centsArray) {
      if (!Number.isInteger(c)) {
        throw new RangeError(`sumCents: expected an integer number of cents, got ${c}`);
      }
      total += c;
    }
    return total;
  }

  // Round-half-away-from-zero to the nearest cent, guarding against float noise
  // (e.g. 212.40 * 100 landing on 21239.999999999996).
  function round(n) {
    return n >= 0 ? Math.round(n) : -Math.round(-n);
  }

  return { toCents, fromCents, sumCents };
})();
var toCents = M_money.toCents;
var fromCents = M_money.fromCents;
var sumCents = M_money.sumCents;

// ---- lib/accrual.mjs ----
var M_accrual = (function () {
  // lib/accrual.mjs — Dennis's advance accrual engine, phase1-spec.md §1
  //
  // D-006/D-016: Dennis advances accrue 8% annual interest, compounding monthly on each
  // advance's own monthly anniversary. D-010: every advance is dedicated to one specific
  // property and interest starts the day the money lands, not when it is spent — there is
  // no pooled loan. D-011: interest on every advance (purchase principal or cash advance
  // alike) is a financing cost of the property it funds, never charged to Paul alone.
  //
  // All date math is done in UTC (Date.UTC) so local timezone can never shift a day.
  // Money in/out is integer cents; compounding itself runs in floating point on the cents
  // value and is rounded to cents exactly once per cumulative figure (Math.round), per the
  // spec's rounding rule — this is what reproduces the golden 881 Newport values to the cent.

  const DEFAULT_RATE_ANNUAL = 0.08; // D-016: 8%, matched to Dennis's own figures 2026-09-14
  const DEFAULT_STUB_BASIS = 30;

  function parseIso(isoDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    if (!m) throw new RangeError(`accrual: not an ISO date: ${isoDate}`);
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  function toIso(y, month1, d) {
    return `${String(y).padStart(4, "0")}-${String(month1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  /**
   * Days in a given (UTC) month. month1 is 1-based.
   */
  function daysInMonth(y, month1) {
    // Date.UTC(y, month1, 0) is day 0 of the month *after* month1 (0-based), i.e. the
    // last day of month1 itself.
    return new Date(Date.UTC(y, month1, 0)).getUTCDate();
  }

  /**
   * Add `months` calendar months to an ISO date, clamping the day to the target month's
   * last day when it overflows (D-010's anniversary rule: a Jan-31 advance's February
   * anniversary is Feb 28/29, not March 3).
   *
   * @param {string} isoDate
   * @param {number} months
   * @returns {string} isoDate
   */
  function addMonthsClamped(isoDate, months) {
    const { y, m, d } = parseIso(isoDate);
    const zeroBased = m - 1 + months;
    const targetY = y + Math.floor(zeroBased / 12);
    const targetMonth1 = ((zeroBased % 12) + 12) % 12 + 1; // 1-based, always in [1,12]
    const clampedDay = Math.min(d, daysInMonth(targetY, targetMonth1));
    return toIso(targetY, targetMonth1, clampedDay);
  }

  /**
   * Whole calendar days between two ISO dates (isoB - isoA), in UTC.
   *
   * @param {string} isoA
   * @param {string} isoB
   * @returns {number}
   */
  function daysBetween(isoA, isoB) {
    const a = parseIso(isoA);
    const b = parseIso(isoB);
    const msA = Date.UTC(a.y, a.m - 1, a.d);
    const msB = Date.UTC(b.y, b.m - 1, b.d);
    return Math.round((msB - msA) / 86400000);
  }

  /**
   * The last calendar day of a "YYYY-MM" period, as an ISO date.
   *
   * @param {string} period "YYYY-MM"
   * @returns {string} isoDate
   */
  function lastDayOf(period) {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) throw new RangeError(`accrual: not a period string: ${period}`);
    const y = Number(m[1]);
    const month1 = Number(m[2]);
    return toIso(y, month1, daysInMonth(y, month1));
  }

  /**
   * The "YYYY-MM" immediately before `period`.
   */
  function prevPeriod(period) {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) throw new RangeError(`accrual: not a period string: ${period}`);
    const y = Number(m[1]);
    const month1 = Number(m[2]);
    return month1 === 1 ? `${y - 1}-12` : `${y}-${String(month1 - 1).padStart(2, "0")}`;
  }

  /**
   * The largest k >= 0 such that advance `date`'s k-th monthly anniversary (k=0 meaning
   * the advance date itself — D-010: "nothing accrues on that day itself") is <= asOf,
   * plus that anniversary's ISO date.
   */
  function anniversariesThrough(date, asOf) {
    let k = 0;
    while (addMonthsClamped(date, k + 1) <= asOf) k++;
    const anniversaryDate = k === 0 ? date : addMonthsClamped(date, k);
    return { k, anniversaryDate };
  }

  /**
   * Interest accrued on one advance through `asOf`, in integer cents.
   * D-006: monthly rate = annual / 12, compounding on each advance's own anniversary.
   * D-011: frozen at repaid_date once an advance is repaid — no further interest is a
   * property cost past that point.
   *
   * @param {{amount_cents:number, date:string, repaid_date?:string}} advance
   * @param {string} asOf isoDate
   * @param {{rateAnnual?:number, stubBasis?:number}} [opts]
   * @returns {number} cents
   */
  function accruedThrough(advance, asOf, { rateAnnual = DEFAULT_RATE_ANNUAL, stubBasis = DEFAULT_STUB_BASIS } = {}) {
    const { amount_cents, date, repaid_date } = advance;
    // D-022: an advance may carry its own annual rate; the Settings rate is the default.
    if (Number.isFinite(advance.rate_annual) && advance.rate_annual > 0) rateAnnual = advance.rate_annual;

    // D-011: an advance repaid before asOf stops accruing at repaid_date.
    const effectiveAsOf = repaid_date && repaid_date < asOf ? repaid_date : asOf;

    if (effectiveAsOf <= date) return 0;

    const r = rateAnnual / 12;
    const { k, anniversaryDate } = anniversariesThrough(date, effectiveAsOf);

    const balance_cents = amount_cents * Math.pow(1 + r, k);
    const stubDays = daysBetween(anniversaryDate, effectiveAsOf);
    const stubInterest = (balance_cents * r * stubDays) / stubBasis;

    // Round once per cumulative figure (spec) — not once per anniversary, not once on
    // the stub alone — so the result reproduces the live tab to the cent.
    return Math.round(balance_cents - amount_cents + stubInterest);
  }

  /**
   * The interest posting job's period delta: what gets booked for one "YYYY-MM" period.
   * Each side is accruedThrough (already rounded to cents), so the sum of every period's
   * delta always equals the rounded cumulative accruedThrough figure — no drift.
   *
   * @param {{amount_cents:number, date:string, repaid_date?:string}} advance
   * @param {string} period "YYYY-MM"
   * @param {{rateAnnual?:number, stubBasis?:number}} [opts]
   * @returns {number} cents
   */
  function interestForPeriod(advance, period, opts) {
    return accruedThrough(advance, lastDayOf(period), opts) - accruedThrough(advance, lastDayOf(prevPeriod(period)), opts);
  }

  /**
   * D-010: every advance lives on exactly one property's balance sheet. payoffAt totals
   * the advances of one property that are not yet repaid (repaid_date unset, or in the
   * future relative to asOf) into a single payoff figure.
   *
   * @param {Array<{advance_id:string, date:string, amount_cents:number, property:string, repaid_date?:string}>} advances
   * @param {string} property
   * @param {string} asOf isoDate
   * @param {{rateAnnual?:number, stubBasis?:number}} [opts]
   */
  function payoffAt(advances, property, asOf, opts) {
    const open = advances.filter((a) => a.property === property && (!a.repaid_date || a.repaid_date > asOf));

    const detail = open.map((a) => {
      const { k } = anniversariesThrough(a.date, asOf <= a.date ? a.date : asOf);
      const stubAnniversary = k === 0 ? a.date : addMonthsClamped(a.date, k);
      const stub_days = asOf <= a.date ? 0 : daysBetween(stubAnniversary, asOf);
      return {
        advance_id: a.advance_id,
        date: a.date,
        amount_cents: a.amount_cents,
        anniversaries: k,
        stub_days,
        interest_cents: accruedThrough(a, asOf, opts),
      };
    });

    const principal_cents = detail.reduce((sum, d) => sum + d.amount_cents, 0);
    const interest_cents = detail.reduce((sum, d) => sum + d.interest_cents, 0);

    return { principal_cents, interest_cents, total_cents: principal_cents + interest_cents, advances: detail };
  }

  /**
   * The compounded balance at each anniversary <= asOf, for display (the Dennis panel's
   * payoff-calculator schedule).
   *
   * @param {{amount_cents:number, date:string, repaid_date?:string}} advance
   * @param {string} asOf isoDate
   * @param {{rateAnnual?:number, stubBasis?:number}} [opts]
   * @returns {Array<{anniversary:string, balance_cents:number}>}
   */
  function schedule(advance, asOf, { rateAnnual = DEFAULT_RATE_ANNUAL, stubBasis = DEFAULT_STUB_BASIS } = {}) {
    const { amount_cents, date, repaid_date } = advance;
    if (Number.isFinite(advance.rate_annual) && advance.rate_annual > 0) rateAnnual = advance.rate_annual; // D-022
    const effectiveAsOf = repaid_date && repaid_date < asOf ? repaid_date : asOf;
    if (effectiveAsOf <= date) return [];

    const r = rateAnnual / 12;
    const { k } = anniversariesThrough(date, effectiveAsOf);

    const rows = [];
    for (let j = 1; j <= k; j++) {
      rows.push({
        anniversary: addMonthsClamped(date, j),
        // Round once per cumulative figure, same rule as accruedThrough.
        balance_cents: Math.round(amount_cents * Math.pow(1 + r, j)),
      });
    }
    return rows;
  }

  return { addMonthsClamped, daysBetween, lastDayOf, accruedThrough, interestForPeriod, payoffAt, schedule };
})();
var addMonthsClamped = M_accrual.addMonthsClamped;
var daysBetween = M_accrual.daysBetween;
var lastDayOf = M_accrual.lastDayOf;
var accruedThrough = M_accrual.accruedThrough;
var interestForPeriod = M_accrual.interestForPeriod;
var payoffAt = M_accrual.payoffAt;
var schedule = M_accrual.schedule;

// ---- lib/posting.mjs ----
var M_posting = (function () {
  // lib/posting.mjs — the posting engine, phase0-spec.md §3, §3.1, §3.2, §9
  //
  // Claude states an intent; this module turns it into a balanced, validated journal
  // entry (or refuses with a PostingError carrying one of the §3 codes). Code owns
  // arithmetic, identity and the gates — never judgment.


  const LINE_FIELDS = [
    "trade",
    "payee",
    "description",
    "paid_from",
    "reconciled_ref",
    "business_purpose",
    "attendee",
    "destination",
    "odometer",
  ];

  // §3: accounts that trigger §274(d)-style substantiation (business_purpose required).
  const PURPOSE_REQUIRED_ACCOUNTS = new Set(["6600", "6700", "6710", "6720"]);

  class PostingError extends Error {
    /**
     * @param {string} code one of the codes in phase0-spec.md §3
     * @param {object} [details] arbitrary context for debugging/display; details.message
     *   becomes the Error message when present.
     */
    constructor(code, details = {}) {
      super(details.message ?? code);
      this.name = "PostingError";
      this.code = code;
      this.details = details;
    }
  }

  /**
   * Build the ctx the posting engine needs. Only `accounts` has a spec-given default
   * (accountMap()); properties/periods default to empty so a caller building a fresh
   * ctx for tests doesn't have to pass every field.
   *
   * @param {{accounts?: Map, properties?: Set, periods?: Map, today?: string}} [opts]
   */
  function makeCtx({ accounts, properties = new Set(), periods = new Map(), today } = {}) {
    return {
      accounts: accounts ?? accountMap(),
      properties,
      periods,
      today,
    };
  }

  /**
   * @param {string} isoDate "YYYY-MM-DD"
   * @returns {string} "YYYY-MM"
   */
  function periodOf(isoDate) {
    if (typeof isoDate !== "string" || isoDate.length < 7) {
      throw new RangeError(`periodOf: not a date string: ${isoDate}`);
    }
    return isoDate.slice(0, 7);
  }

  /**
   * §3.2: <source>-<yyyymmdd>-<first 12 hex of sha256(payee|amount|description|paid_from|property)>
   * hashed from the entry's first debit line, so a re-run of a migration or a
   * re-ingested receipt reproduces the same id and the writer refuses it as DUPLICATE.
   *
   * @param {string} source
   * @param {string} date "YYYY-MM-DD"
   * @param {{payee?:string, debit?:number, description?:string, paid_from?:string, property?:string}} firstDebitLine
   * @param {{allow_duplicate_hash?: boolean}} [opts]
   */
  function makeTxnId(source, date, firstDebitLine, { allow_duplicate_hash = false } = {}) {
    const yyyymmdd = String(date).replaceAll("-", "");
    const raw = [
      firstDebitLine?.payee ?? "",
      String(firstDebitLine?.debit ?? ""),
      firstDebitLine?.description ?? "",
      firstDebitLine?.paid_from ?? "",
      firstDebitLine?.property ?? "",
    ].join("|");
    const hash = createHash("sha256").update(raw).digest("hex").slice(0, 12);
    const base = `${source}-${yyyymmdd}-${hash}`;

    if (!allow_duplicate_hash) return base;

    // Manual entries: two legitimate identical purchases same day get distinct ids.
    const suffix = randomBytes(2).toString("hex"); // exactly 4 hex chars
    return `${base}-${suffix}`;
  }

  /**
   * Fill every line field with its explicit value, or a derived/empty default.
   * cost_class and tax_treatment derive from the account (via coa.mjs) unless the
   * caller explicitly supplied them (§3: "Derived fields ... unless explicitly supplied").
   */
  function fillLineDefaults(line, ctx) {
    const account = ctx.accounts.get(line.account);
    const out = {
      account: line.account,
      debit: line.debit ?? 0,
      credit: line.credit ?? 0,
      property: line.property ?? "",
      cost_class: line.cost_class ?? account?.cost_class ?? "",
      tax_treatment: line.tax_treatment ?? account?.tax_treatment ?? "",
    };
    for (const field of LINE_FIELDS) {
      out[field] = line[field] ?? "";
    }
    return out;
  }

  function isValidIsoDate(s) {
    if (typeof s !== "string") return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    // Round-trip through UTC to reject calendar overflow (e.g. 2026-02-30).
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }

  function daysAhead(dateStr, todayStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const [ty, tm, td] = todayStr.split("-").map(Number);
    const date = Date.UTC(y, m - 1, d);
    const today = Date.UTC(ty, tm - 1, td);
    return Math.round((date - today) / 86400000);
  }

  /**
   * Run every §3 rule against an already-assembled entry. Used directly by the
   * `journal` intent (explicit lines, engine validates only) and internally by
   * `expense`/`advance` after they build their own lines.
   *
   * @param {object} entry
   * @param {{accounts:Map, properties:Set, periods:Map, today:string}} ctx
   * @returns {object} the same entry, unchanged, if it passes
   */
  function validateEntry(entry, ctx) {
    const { lines } = entry;

    if (!Array.isArray(lines) || lines.length < 2) {
      throw new PostingError("MIN_LINES", { message: "an entry needs at least two lines", entry });
    }

    // BAD_ACCOUNT first: every later check (series, cost_class) depends on a known account.
    for (const line of lines) {
      if (!ctx.accounts.has(line.account)) {
        throw new PostingError("BAD_ACCOUNT", {
          message: `account ${line.account} is not in the chart of accounts`,
          line,
        });
      }
    }

    for (const line of lines) {
      const debit = line.debit ?? 0;
      const credit = line.credit ?? 0;
      const bothSet = debit !== 0 && credit !== 0;
      const bothZero = debit === 0 && credit === 0;
      if (bothSet || bothZero || debit < 0 || credit < 0) {
        throw new PostingError("BAD_AMOUNT", {
          message: `line for account ${line.account} has an invalid debit/credit amount`,
          line,
        });
      }
    }

    const totalDebit = sumCents(lines.map((l) => l.debit ?? 0));
    const totalCredit = sumCents(lines.map((l) => l.credit ?? 0));
    if (totalDebit !== totalCredit) {
      throw new PostingError("UNBALANCED", {
        message: `debits ${totalDebit} do not equal credits ${totalCredit}`,
        totalDebit,
        totalCredit,
      });
    }

    if (!isValidIsoDate(entry.date) || daysAhead(entry.date, ctx.today) > 1) {
      throw new PostingError("BAD_DATE", { message: `invalid or too-far-future date ${entry.date}`, date: entry.date });
    }

    for (const line of lines) {
      const series = seriesOf(line.account);
      const property = line.property ?? "";

      // D-010: overhead never touches a property — 6000/7000-series lines must be OVERHEAD.
      if ((series === "6000" || series === "7000") && property !== "OVERHEAD") {
        throw new PostingError("OVERHEAD_ON_PROPERTY", {
          message: `account ${line.account} is overhead and must post with property "OVERHEAD", got "${property}"`,
          line,
        });
      }

      // D-010/D-011: every property cost (1000-1399) is capitalized on a specific property.
      if (series === "1000" && (property === "" || property === "OVERHEAD")) {
        throw new PostingError("PROPERTY_REQUIRED", {
          message: `account ${line.account} requires a property (got "${property}")`,
          line,
        });
      }

      // Properties tab is the allowlist (BUILD-PLAN §4): nothing posts to a property not there.
      if (property !== "" && property !== "OVERHEAD" && !ctx.properties.has(property)) {
        throw new PostingError("BAD_PROPERTY", { message: `unknown property "${property}"`, line });
      }

      if (PURPOSE_REQUIRED_ACCOUNTS.has(line.account) && !line.business_purpose) {
        throw new PostingError("PURPOSE_REQUIRED", {
          message: `account ${line.account} requires business_purpose`,
          line,
        });
      }
    }

    // D-001's substitute for QBO's period locking: a closed period refuses new lines,
    // except a void (which must always be able to reverse a mistake).
    if (ctx.periods.get(entry.period) === "closed" && entry.source !== "void") {
      throw new PostingError("PERIOD_CLOSED", { message: `period ${entry.period} is closed`, period: entry.period });
    }

    // Audit 66 / CLAUDE.md Phase 3 note: on 2026-09-22 a read that wrote its own doubt into the entry -
    // "PENDING ROUTING: ... reroute to 1030 if a Feb-2026 job is identified" - was approved and posted. An
    // entry that says it is not finished never posts; a void (which only mirrors an old entry) is exempt.
    if (entry.source !== "void" && [entry.memo, ...lines.map((l) => l.description)].some((t) => /PENDING ROUTING/i.test(String(t ?? "")))) {
      throw new PostingError("PENDING_ROUTING", { message: "a line still says PENDING ROUTING - choose its house and account first" });
    }

    return entry;
  }

  /**
   * `expense`'s credit side: a 1400-series bank account, or the PAUL/DENNIS
   * direct-paid shorthand.
   */
  function resolvePaidFrom(paid_from, property, ctx) {
    if (paid_from === "PAUL") {
      // BUILD-PLAN §2 "Paul": a cost he pays personally is Due to owner until reimbursed.
      return { creditAccount: "2030" };
    }

    if (paid_from === "DENNIS") {
      // §3.1: "a direct-paid cost is an advance" — D-010 ties every advance to one property.
      if (!property) {
        throw new PostingError("PROPERTY_REQUIRED", {
          message: "paid_from DENNIS requires a property (a direct-paid cost is an advance)",
        });
      }
      return { creditAccount: "2010" };
    }

    const bankAccount = ctx.accounts.get(paid_from);
    if (!bankAccount || seriesOf(paid_from) !== "1400") {
      throw new PostingError("BAD_ACCOUNT", {
        message: `paid_from must be a 1400-series bank account, "PAUL", or "DENNIS" — got "${paid_from}"`,
      });
    }
    return { creditAccount: paid_from };
  }

  function buildJournal(intent, ctx) {
    const {
      date,
      memo = "",
      source = "manual",
      posted_by = "",
      doc_url = "",
      void_of = "",
      lines = [],
      allow_duplicate_hash = false,
    } = intent;

    const filledLines = lines.map((line) => fillLineDefaults(line, ctx));
    // Guard against an empty/malformed lines array crashing id generation instead of
    // surfacing MIN_LINES/BAD_AMOUNT etc. from validateEntry below.
    const firstDebit = filledLines.find((l) => (l.debit ?? 0) > 0) ?? {};

    const entry = {
      txn_id: makeTxnId(source, date, firstDebit, { allow_duplicate_hash }),
      date,
      period: periodOf(date),
      memo,
      source,
      posted_by,
      doc_url,
      void_of,
      lines: filledLines,
    };

    return validateEntry(entry, ctx);
  }

  function buildExpense(intent, ctx) {
    const {
      date,
      payee,
      description,
      amount_cents,
      account,
      property,
      paid_from,
      trade = "",
      business_purpose = "",
      memo,
      doc_url = "",
      source = "manual",
      posted_by = "",
      void_of = "",
      reconciled_ref = "",
      attendee = "",
      destination = "",
      odometer = "",
      allow_duplicate_hash = false,
    } = intent;

    // Resolved before either line is built so PROPERTY_REQUIRED (DENNIS) and BAD_ACCOUNT
    // (unknown paid_from) surface without constructing a doomed entry first.
    const { creditAccount } = resolvePaidFrom(paid_from, property, ctx);

    const debitLine = fillLineDefaults(
      {
        account,
        debit: amount_cents,
        credit: 0,
        property,
        trade,
        payee,
        description,
        paid_from,
        business_purpose,
        reconciled_ref,
        attendee,
        destination,
        odometer,
      },
      ctx,
    );

    // The credit line carries the same property as the debit line, per phase0-spec.md
    // §3's worked example (both lines of the Home Depot entry carry "881 Newport").
    const creditLine = fillLineDefaults(
      {
        account: creditAccount,
        debit: 0,
        credit: amount_cents,
        property,
        payee,
        description, // the credit line names what was bought too; paid_from already says who paid (Paul, 2026-09-15)
        paid_from,
      },
      ctx,
    );

    const entry = {
      txn_id: makeTxnId(source, date, debitLine, { allow_duplicate_hash }),
      date,
      period: periodOf(date),
      memo: memo ?? `${payee} — ${description}`,
      source,
      posted_by,
      doc_url,
      void_of,
      lines: [debitLine, creditLine],
    };

    return validateEntry(entry, ctx);
  }

  function buildAdvance(intent, ctx) {
    const {
      date,
      amount_cents,
      property,
      into = "1401", // D-010: advances land in the shared Citizens account
      description = "Dennis advance", // the purchase principal debits 1000 instead: "Purchase price"
      memo,
      doc_url = "",
      source = "manual",
      posted_by = "",
      void_of = "",
      allow_duplicate_hash = false,
    } = intent;

    // D-010: "every advance is dedicated to one specific property" — not optional here,
    // even though 1401/2010 sit outside the 1000-1399 range the generic PROPERTY_REQUIRED
    // check covers, so it's enforced explicitly rather than relying on validateEntry.
    if (!property) {
      throw new PostingError("PROPERTY_REQUIRED", { message: "advance requires a property" });
    }

    const debitLine = fillLineDefaults({ account: into, debit: amount_cents, credit: 0, property, description, payee: "Dennis Little" }, ctx);
    const creditLine = fillLineDefaults({ account: "2010", debit: 0, credit: amount_cents, property, description, payee: "Dennis Little" }, ctx);

    const entry = {
      txn_id: makeTxnId(source, date, debitLine, { allow_duplicate_hash }),
      date,
      period: periodOf(date),
      memo: memo ?? `Dennis advance — ${property}`,
      source,
      posted_by,
      doc_url,
      void_of,
      lines: [debitLine, creditLine],
    };

    return validateEntry(entry, ctx);
  }

  /**
   * phase2-spec.md §2: a receipt with one or more line items, all sharing one property
   * and one paid_from. Each item becomes its own debit line (same payee/property/paid_from
   * on every line, per the worked example in phase0-spec.md §3); the credit side is
   * resolved exactly as `expense` resolves it (14xx bank account / PAUL -> 2030 /
   * DENNIS -> 2010). `txn_id` hashes the first debit line (items[0]), so re-ingesting an
   * identical receipt reproduces the same id and the writer refuses it as DUPLICATE.
   */
  function buildPurchase(intent, ctx) {
    const {
      date,
      payee,
      memo,
      property,
      paid_from,
      items = [],
      doc_url = "",
      source = "receipt",
      posted_by = "",
      void_of = "",
      allow_duplicate_hash = false,
      invoice_number = "",
    } = intent;

    // Resolved before the lines are built so PROPERTY_REQUIRED (DENNIS) and BAD_ACCOUNT
    // (unknown paid_from) surface without constructing a doomed entry first — same
    // reasoning as buildExpense.
    const { creditAccount } = resolvePaidFrom(paid_from, property, ctx);

    const debitLines = items.map((item) =>
      fillLineDefaults(
        {
          account: item.account,
          debit: item.amount_cents,
          credit: 0,
          property,
          trade: item.trade,
          payee,
          description: item.description,
          paid_from,
          business_purpose: item.business_purpose,
        },
        ctx,
      ),
    );

    const totalCents = sumCents(items.map((item) => item.amount_cents ?? 0));

    const creditLine = fillLineDefaults(
      {
        account: creditAccount,
        debit: 0,
        credit: totalCents,
        property,
        payee,
        description: items.map((item) => item.description).filter(Boolean).join("; "),
        paid_from,
      },
      ctx,
    );

    const firstDebit = debitLines[0] ?? {};
    const defaultMemo =
      items.length === 1 ? `${payee} — ${items[0]?.description ?? ""}` : `${payee} — ${items.length} items`;

    // Identity: when the vendor printed an invoice/receipt number, the id is
    // payee + that number + property, so two copies of one invoice (original and a
    // forward, processed in parallel) collide inside the writer's lock and the second
    // is refused DUPLICATE - the D-012 rail enforced by code, not by a race against the
    // ledger read. 2026-09-13: both Anthropic copies posted three seconds apart. Without
    // a number the id hashes the first debit line as before.
    const idLine = invoice_number
      ? { payee, description: `invoice:${String(invoice_number).trim().toLowerCase()}`, property }
      : firstDebit;
    const entry = {
      txn_id: makeTxnId(source, date, idLine, { allow_duplicate_hash }),
      date,
      period: periodOf(date),
      memo: memo ?? defaultMemo,
      source,
      posted_by,
      doc_url,
      void_of,
      lines: [...debitLines, creditLine],
    };

    return validateEntry(entry, ctx);
  }

  /**
   * §3.1: turn an intent into a validated, balanced entry.
   * @param {{type: "journal"|"expense"|"advance"|"purchase", [key: string]: any}} intent
   * @param {{accounts:Map, properties:Set, periods:Map, today:string}} ctx
   * @returns {object} entry
   */
  function buildEntry(intent, ctx) {
    switch (intent?.type) {
      case "journal":
        return buildJournal(intent, ctx);
      case "expense":
        return buildExpense(intent, ctx);
      case "advance":
        return buildAdvance(intent, ctx);
      case "purchase":
        return buildPurchase(intent, ctx);
      default:
        // Not a §3 code (no intent-shape error is listed there) — a caller/programmer
        // error, not a bookkeeping rule, so it's kept distinct rather than overloaded
        // onto an existing code.
        throw new PostingError("BAD_INTENT", { message: `unknown intent type "${intent?.type}"` });
    }
  }

  return { PostingError, makeCtx, periodOf, makeTxnId, validateEntry, buildEntry };
})();
var PostingError = M_posting.PostingError;
var makeCtx = M_posting.makeCtx;
var periodOf = M_posting.periodOf;
var makeTxnId = M_posting.makeTxnId;
var validateEntry = M_posting.validateEntry;
var buildEntry = M_posting.buildEntry;

// ---- lib/gate.mjs ----
var M_gate = (function () {
  // lib/gate.mjs - the deterministic autofile gate, phase2-spec.md §4
  //
  // Claude's `decide` verdict never posts anything by itself. This module re-checks
  // every fact the model claims against the rules that are always true (arithmetic,
  // the chart of accounts, property/paid_from validity, a hard ceiling, the sec 274(d)
  // human-required accounts, and a twin rail against what is already posted) and only
  // says `passed: true` when every one of them holds. Code owns this decision, not the
  // model's self-reported confidence (docs/policies.md "What confidence is and is not").
  //
  // `buildEntriesFromModel` is the single place a `model` verdict turns into postable
  // `purchase` entries (via lib/posting.mjs `buildEntry`) - both the autofile path and
  // the human "Approve" path in the functions layer call it, so there is exactly one
  // code path from "what Claude said" to "what gets posted".


  // sec 274(d) substantiation categories - never autofile-eligible (docs/policies.md,
  // ledger-schema.md "On columns 19-22").
  // Meals and gifts always need a human. Travel (6700) posts when the model has written
  // the business purpose - Paul, 2026-09-11: PDX<->DFW travel is business, the system
  // should know that without asking. buildEntry still enforces PURPOSE_REQUIRED on 6700.
  const HUMAN_REQUIRED_ACCOUNTS = new Set(["6710", "6720"]);

  const INVOICE_TOKEN = /[A-Za-z0-9][A-Za-z0-9-]{3,}/g;

  // D-057 (Paul, 2026-09-29: "the reality is i may not get a receipt from him"): a PLACEHOLDER is a
  // charge recorded from the bank statement while its receipt is still with someone else. Its line
  // description starts with NEED_RECEIPT ("NEED RECEIPT FROM DENNIS") - the Inbox's "Waiting on
  // receipt" button writes it. The receipt, if it ever comes, REPLACES the placeholder (`supersedes`);
  // it is never a duplicate of it and never posts beside it.
  const NEED_RECEIPT = "NEED RECEIPT FROM";
  const PLACEHOLDER_DAYS = 7;   // the bank posts a card charge a day or two after the receipt's date
  const isPlaceholder = (posted) => String(posted?.text || "").includes(NEED_RECEIPT);

  /**
   * The live placeholder this document touches: the one the read names (in `supersedes`, or in
   * `duplicate_of` - a read that calls the receipt "already recorded"), else one for the same amount
   * within PLACEHOLDER_DAYS of the document's date. The payee is not compared - the
   * placeholder carries the bank's name for the store ("THE HOME DEPOT #6505 W"), not the receipt's.
   */
  function findPlaceholder(model, postedEntries = []) {
    const waiting = postedEntries.filter(isPlaceholder);
    const named = waiting.find((p) => p.txn_id === model?.supersedes || p.txn_id === model?.duplicate_of);
    if (named) return named;
    const total = Number(model?.receipt_total_cents) || 0;
    const at = Date.parse(model?.date || "");
    if (!(total > 0) || Number.isNaN(at)) return null;
    return waiting.find((p) => p.total_cents === total && Math.abs(Date.parse(p.date) - at) <= PLACEHOLDER_DAYS * 864e5) || null;
  }

  /**
   * Duplicate detection the whole pipeline shares. A posted entry is a duplicate of this
   * document when (a) the document's invoice/receipt number appears in that entry's memo
   * or descriptions and the payee matches, or (b) payee, date and total all match and
   * neither side carries an invoice number that tells them apart. Same payee/date/total
   * WITH differing invoice numbers is two legitimate charges. Returns
   * {kind:"duplicate"|"possible_twin", txn_id} or null.
   */
  function findDuplicate(model, postedEntries = []) {
    const payee = String(model?.vendor || model?.entries?.[0]?.payee || "").trim().toLowerCase();
    const inv = String(model?.invoice_number || "").trim();
    const total = (model?.entries || []).reduce((t, e) => t + entryTotalCents(e), 0) || Number(model?.receipt_total_cents) || 0;
    const date = String(model?.date || model?.entries?.[0]?.date || "");
    // A row the read says already carries part of this receipt is not a twin of the rest.
    const named = new Set([model?.duplicate_of, model?.supersedes, ...(model?.already_posted_txn_ids || [])].filter(Boolean));
    for (const posted of postedEntries) {
      if (named.has(posted.txn_id) || isPlaceholder(posted)) continue;   // a placeholder is replaced, never duplicated (D-057)
      const postedPayee = String(posted.payee || "").trim().toLowerCase();
      if (!postedPayee || postedPayee !== payee) continue;
      const text = String(posted.text || "");
      if (inv && inv.length >= 4 && text.toLowerCase().includes(inv.toLowerCase())) {
        return { kind: "duplicate", txn_id: posted.txn_id };
      }
      if (posted.date === date && posted.total_cents === total) {
        // Same payee/date/total: distinguishable only if both carry invoice numbers that differ.
        const postedTokens = new Set((text.match(INVOICE_TOKEN) || []).map((t) => t.toLowerCase()));
        if (inv && postedTokens.size && !postedTokens.has(inv.toLowerCase()) && [...postedTokens].some((t) => /\d/.test(t) && t.length >= 6)) {
          continue; // different invoice numbers -> legitimately separate charges
        }
        return { kind: inv ? "duplicate" : "possible_twin", txn_id: posted.txn_id };
      }
    }
    return null;
  }

  function isValidIsoDate(s) {
    if (typeof s !== "string") return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }

  // ISO "YYYY-MM-DD" strings compare lexicographically in calendar order.
  function isFutureDate(dateStr, todayStr) {
    return typeof todayStr === "string" && todayStr.length > 0 && dateStr > todayStr;
  }

  function entriesOf(model) {
    return Array.isArray(model?.entries) ? model.entries : [];
  }

  function itemsOf(entry) {
    return Array.isArray(entry?.items) ? entry.items : [];
  }

  function entryTotalCents(entry) {
    let total = 0;
    for (const item of itemsOf(entry)) {
      const n = Number(item?.amount_cents);
      if (Number.isFinite(n)) total += n;
    }
    return total;
  }

  /**
   * Build the `purchase` intent lib/posting.mjs expects from one proposedEntry
   * (phase2-spec.md §1) plus the request-level options. The only place this mapping
   * happens, so evaluateGate's condition 8 and buildEntriesFromModel can never drift
   * apart.
   */
  function purchaseIntentFromEntry(entry, { posted_by = "", doc_url = "", allow_duplicate_hash = false, invoice_number = "" } = {}) {
    return {
      invoice_number,
      type: "purchase",
      date: entry?.date,
      payee: entry?.payee,
      memo: entry?.memo,
      property: entry?.property,
      paid_from: entry?.paid_from,
      items: itemsOf(entry),
      doc_url,
      source: "receipt",
      posted_by,
      allow_duplicate_hash,
    };
  }

  /**
   * Whether `paid_from` is one that lib/posting.mjs's `resolvePaidFrom` can resolve for
   * `property`, without actually building the entry - phase2-spec.md §4 condition 7.
   * (`buildEntry` enforces the same rule again in condition 8; this pre-check exists so
   * the gate can report the clean `BAD_PAID_FROM` reason instead of a generic
   * `ENTRY_INVALID:BAD_ACCOUNT`/`ENTRY_INVALID:PROPERTY_REQUIRED`.)
   */
  function paidFromResolves(paid_from, property, ctx) {
    if (paid_from === "PAUL") return true;
    if (paid_from === "DENNIS") return !!property;
    const account = ctx.accounts.get(String(paid_from));
    // series may arrive from the sheet as a number; compare as text.
    return !!account && String(account.series) === "1400";
  }

  /**
   * Whether `property` is a value `buildEntry` will accept - phase2-spec.md §4
   * condition 6 (`OVERHEAD`, or a property in the registry `ctx.properties` allowlist,
   * which the caller builds from properties not sold (D-017) per the
   * `list_properties` tool contract in §3).
   */
  function propertyIsValid(property, ctx) {
    return property === "OVERHEAD" || ctx.properties.has(property);
  }

  /**
   * phase2-spec.md §4: run every deterministic autofile condition against a `model`
   * verdict (the object the `decide` tool captured) and report every reason it fails,
   * not just the first. `passed` is true only when the reasons list is empty.
   *
   * @param {object} model the `decide` call's input (phase2-spec.md §3)
   * @param {{accounts:Map, properties:Set, periods:Map, today:string}} ctx same ctx
   *   shape lib/posting.mjs's buildEntry takes
   * @param {{autofile_ceiling_cents:number}} settings resolved Settings values (not the
   *   `{get(key)}` tool interface `runBookkeeper` uses - the caller resolves the keys
   *   this gate needs before calling it, so the gate itself stays a pure sync function)
   * @param {{postedEntries?: Array<{txn_id:string, date:string, payee:string, total_cents:number}>, placeholders?: boolean}} [opts]
   *   `postedEntries` is the posted-Journal view the twin rail (condition 9) checks
   *   against - already-posted entries only, shaped as the fields the twin check needs.
   *   `placeholders: false` skips condition 10 - a card born from a bank line is not a receipt.
   * @returns {{passed:boolean, reasons:string[], already_posted_cents:number, placeholder:object|null, replaces:object|null}}
   *   already_posted_cents is what the Journal holds for the read's already_posted_txn_ids (the card
   *   shows it beside the entries); placeholder is the waiting charge this document touches, if any;
   *   replaces is the other live entry the read's `supersedes` names, if any
   */
  function evaluateGate(model, ctx, settings, { postedEntries = [], placeholders = true } = {}) {
    const reasons = [];
    const push = (reason) => {
      if (!reasons.includes(reason)) reasons.push(reason);
    };

    // 1. verdict + confidence
    if (model?.verdict !== "post") push("NOT_POST_VERDICT");
    // D-044 (2026-09-25): "medium" posts when every deterministic rail below holds - the
    // rails are the control, self-reported confidence is not (docs/policies.md). "low" or
    // no confidence at all still holds.
    if (model?.confidence !== "high" && model?.confidence !== "medium") push("LOW_CONFIDENCE");

    // 2. vendor + date
    const vendor = typeof model?.vendor === "string" ? model.vendor.trim() : "";
    if (!vendor) push("MISSING_VENDOR");
    const date = model?.date;
    if (!date) {
      push("MISSING_DATE");
    } else if (!isValidIsoDate(date) || isFutureDate(date, ctx?.today)) {
      push("BAD_DATE");
    }

    // 4. receipt total vs. the autofile ceiling
    const receiptTotal = Number(model?.receipt_total_cents);
    if (!(Number.isFinite(receiptTotal) && receiptTotal > 0)) push("ZERO_TOTAL");
    const ceiling = Number(settings?.autofile_ceiling_cents);
    if (Number.isFinite(receiptTotal) && Number.isFinite(ceiling) && receiptTotal > ceiling) {
      push("OVER_CEILING");
    }

    const entries = entriesOf(model);

    // A receipt partly on the books (2026-09-26: parked hardware receipts whose lines the migration
    // posted as old-book rows): the read names the entries that carry some lines and proposes the
    // rest. Their amounts come from the Journal, never from the model - a name that is not a live
    // posted entry adds nothing, so the total fails. Always a human's call: a later copy of a receipt
    // could otherwise name the posted rows and post the lines Paul removed on the card.
    const alreadyPosted = new Set(Array.isArray(model?.already_posted_txn_ids) ? model.already_posted_txn_ids : []);
    const alreadyPostedCents = postedEntries.filter((p) => alreadyPosted.has(p.txn_id)).reduce((t, p) => t + (Number(p.total_cents) || 0), 0);
    if (alreadyPosted.size) push("PARTLY_ON_BOOKS");

    // 3. items sum to the receipt total across every entry (±0.5% when subtotal_cents
    // and tax_cents are both given - rounding on a reconciled receipt; exact otherwise).
    // Only when something was proposed: nothing proposed is NO_ENTRIES below, whatever the verdict -
    // a hold with no items read "Items do not add up - fix the amounts" with nothing to fix (2026-09-26).
    const proposed = entries.some((e) => itemsOf(e).length > 0);
    const itemsTotal = entries.reduce((t, entry) => t + entryTotalCents(entry), 0) + alreadyPostedCents;
    const tolerant = model?.subtotal_cents != null && model?.tax_cents != null;
    const tolerance = tolerant && Number.isFinite(receiptTotal) ? Math.round(Math.abs(receiptTotal) * 0.005) : 0;
    if ((proposed || alreadyPosted.size) && Number.isFinite(receiptTotal) && Math.abs(itemsTotal - receiptTotal) > tolerance) {
      push("TOTAL_MISMATCH");
    }

    // 5. no item on a sec 274(d) account (travel/meals/gifts always need a human)
    for (const entry of entries) {
      for (const item of itemsOf(entry)) {
        if (HUMAN_REQUIRED_ACCOUNTS.has(item?.account)) {
          push("NEEDS_HUMAN_274D");
        }
      }
    }

    if (!proposed) push("NO_ENTRIES");

    // 6/7. property + paid_from, per entry - pre-checked here (for the clean reason
    // code) before condition 8 attempts to actually build the entry.
    const structurallyValid = [];
    for (const entry of entries) {
      const propOk = propertyIsValid(entry?.property, ctx);
      if (!propOk) push("BAD_PROPERTY");
      const paidOk = paidFromResolves(entry?.paid_from, entry?.property, ctx);
      // D-014: the model never guesses the payer. UNKNOWN is a legitimate answer that
      // holds the document for Paul to assign the account on the Inbox card.
      if (entry?.paid_from === "UNKNOWN") push("PAYER_UNKNOWN");
      else if (!paidOk) push("BAD_PAID_FROM");
      if (propOk && paidOk) structurallyValid.push(entry);
    }

    // 8. buildEntry succeeds for every entry - also runs D-010/D-011, OVERHEAD_ON_PROPERTY,
    // PURPOSE_REQUIRED, PERIOD_CLOSED, etc. Only attempted for entries that already
    // passed the property/paid_from pre-checks above, so a BAD_PROPERTY/BAD_PAID_FROM
    // entry doesn't also produce a redundant ENTRY_INVALID for the same root cause.
    const builtEntries = [];
    for (const entry of structurallyValid) {
      try {
        builtEntries.push(buildEntry(purchaseIntentFromEntry(entry, { posted_by: "claude" }), ctx));
      } catch (err) {
        if (err instanceof PostingError) {
          push(`ENTRY_INVALID:${err.code}`);
        } else {
          throw err;
        }
      }
    }

    // 9. duplicate rail: a posted Journal entry this document duplicates. An invoice-number
    // match (or same payee/date/total with no invoice numbers to tell them apart) is a
    // DUPLICATE_OF the ingest dismisses on its own; only a genuinely ambiguous twin holds.
    const dup = findDuplicate(model, postedEntries);
    if (dup) push(dup.kind === "duplicate" ? `DUPLICATE_OF:${dup.txn_id}` : `POSSIBLE_TWIN:${dup.txn_id}`);

    // 10. placeholder rail (D-057): a receipt replaces a waiting charge on its own only when the read
    // names it in `supersedes`, the totals agree to the cent and every entry is paid from the account
    // the bank line was on. Anything else that touches a placeholder is Paul's call on the card.
    const waiting = placeholders ? findPlaceholder(model, postedEntries) : null;
    if (waiting) {
      const same = model?.supersedes === waiting.txn_id && waiting.total_cents === receiptTotal &&
        entries.length > 0 && entries.every((e) => String(e?.paid_from) === String(waiting.paid_from));
      if (!same) push(`PLACEHOLDER_WAITING:${waiting.txn_id}`);
    }
    // D-058: what the read's `supersedes` names, when it is a live entry and not a placeholder (a ride
    // with the tip added, an amended invoice) - the card shows it, so a held one can be swapped on Save.
    const earlier = !waiting && model?.supersedes ? postedEntries.find((p) => p.txn_id === model.supersedes) : null;
    const pick = (p) => (p ? { txn_id: p.txn_id, date: p.date, payee: p.payee, property: p.property, paid_from: p.paid_from, total_cents: p.total_cents } : null);

    return { passed: reasons.length === 0, reasons, already_posted_cents: alreadyPostedCents, placeholder: pick(waiting), replaces: pick(earlier) };
  }

  /**
   * phase2-spec.md §3/§4: turn a `model` verdict into postable ledger entries via the
   * `purchase` intent (lib/posting.mjs `buildEntry`) - the one code path both the
   * autofile poster and the human "Approve" bypass use, so a hand-edited approval
   * enforces exactly the same D-010/D-011/PURPOSE_REQUIRED rules an autofile does.
   * All-or-nothing: throws the first `PostingError` hit rather than posting a partial
   * set of entries.
   *
   * @param {object} model the `decide` call's input (or a human-edited copy of it)
   * @param {{accounts:Map, properties:Set, periods:Map, today:string}} ctx
   * @param {{posted_by?:string, doc_url?:string, allow_duplicate_hash?:boolean}} [opts]
   * @returns {object[]} one built entry per `model.entries` item, in order
   */
  function buildEntriesFromModel(model, ctx, { posted_by = "", doc_url = "", allow_duplicate_hash = false } = {}) {
    const invoice_number = typeof model?.invoice_number === "string" ? model.invoice_number.trim() : "";
    return entriesOf(model).map((entry) =>
      buildEntry(purchaseIntentFromEntry(entry, { posted_by, doc_url, allow_duplicate_hash, invoice_number }), ctx),
    );
  }

  return { NEED_RECEIPT, isPlaceholder, findPlaceholder, findDuplicate, evaluateGate, buildEntriesFromModel };
})();
var NEED_RECEIPT = M_gate.NEED_RECEIPT;
var isPlaceholder = M_gate.isPlaceholder;
var findPlaceholder = M_gate.findPlaceholder;
var findDuplicate = M_gate.findDuplicate;
var evaluateGate = M_gate.evaluateGate;
var buildEntriesFromModel = M_gate.buildEntriesFromModel;

// ---- lib/reports.mjs ----
var M_reports = (function () {
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
  function loadJournal(headers, rows) {
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
  function trialBalance(lines, { asOf } = {}) {
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
  function balanceSheet(lines, { asOf } = {}) {
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
  function profitAndLoss(lines, { from, to } = {}) {
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
  function propertyJobCost(lines, property, { asOf } = {}) {
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
  function propertyBalanceSheet(lines, property, { asOf } = {}) {
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
  function dennisLedger(lines, advances, { asOf } = {}, accrualOpts) {
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
   * @returns {{ rows: any[][], kinds: string[], ties: boolean }} rows are [what, dollars, note]; kinds are
   *   "head", "total" or "" per row
   */
  function pnlTab(lines, advances, asOf, accrualOpts) {
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
    add("head", `PROFIT AND LOSS - ${year} SO FAR`);
    for (const p of pl.by_property) if (p.gross) add("", p.property, p.gross, soldOn.has(p.property) ? `sold ${soldOn.get(p.property)} - Recast's profit after Dennis was paid` : "");
    const other = pl.gross_profit - pl.by_property.reduce((s, p) => s + p.gross, 0);
    if (other) add("", "Other income", other);
    if (costs) add("", "Business costs", -costs, "tools, travel, software - never charged to a house; by type on the Totals tab");
    add("total", "Recast earned", pl.net_income);

    const bs = balanceSheet(lines, { asOf });
    const houses = bs.assets.filter((a) => !/^\d+$/.test(a.account) && a.account !== "Cost Recapture" && a.balance);
    const name = { "1401": "Cash in the Citizens account", "1402": "Cash in the Chase account", "1510": "Money held back at a closing (escrow)",
      "1520": "Claude API credits recorded the old way - tell Claude", "7000": "Equipment and other big purchases" };
    add("", "");
    add("head", "WHAT RECAST OWNS TODAY");
    if (houses.length) add("", `Houses still held (${houses.length})`, houses.reduce((s, a) => s + a.balance, 0) + interest, "what they cost so far, Dennis's interest included - each has its own tab");
    for (const a of bs.assets) {
      if (!a.balance || houses.includes(a)) continue;
      if (a.account === "Cost Recapture") add("", "Costs paid after a house sold", a.balance, "the Cost Recapture tab");
      else add("", name[a.account] || a.name, a.balance);
    }
    const owns = bs.total_assets + interest;
    add("total", "Total", owns);

    const bal = (acct) => (bs.liabilities.find((x) => x.account === acct) || {}).balance || 0;
    add("", "");
    add("head", "WHAT RECAST OWES TODAY");
    [["Dennis - money he lent", bal("2010"), "for the houses, plus his working money in the account"],
     ["Dennis - interest recorded, not paid yet", bal("2000"), ""],
     ["Dennis - interest not recorded yet", interest, "built up to today on every advance still open"],
     ["Paul", bal("2030"), "costs he paid himself, plus his working money in the account"],
     ...bs.liabilities.filter((l) => !["2000", "2010", "2030"].includes(l.account)).map((l) => [l.name, l.balance, ""]),
    ].forEach(([what, c, note]) => { if (c) add("", what, c, note); });
    const owes = bs.total_liabilities + interest;
    add("total", "Total", owes);

    const allTime = profitAndLoss(lines, { to: asOf }).net_income;
    const paid = bs.equity.reduce((s, e) => s + e.balance, 0);
    const left = allTime + paid;
    add("", "");
    add("head", "LEFT FOR THE OWNERS");
    if (allTime !== pl.net_income) add("", `Earned before ${year}`, allTime - pl.net_income);
    if (paid) add("", paid < 0 ? "Paid out to Paul" : "Put in by Paul", paid, paid < 0 ? "his share of the house profits" : "");
    add("total", "Left", left,
      left < 0 && left === -costs && allTime === pl.net_income ? "the same as the business costs: all the house profit went to Paul, so none was kept to cover them - what Paul paid for them himself, Recast owes him back"
        : left < 0 ? "below zero - more was paid out than Recast earned" : "what Recast earned less what it paid out");
    return { rows, kinds, ties: owns === owes + left };
  }

  return { loadJournal, trialBalance, balanceSheet, profitAndLoss, propertyJobCost, propertyBalanceSheet, dennisLedger, pnlTab };
})();
var loadJournal = M_reports.loadJournal;
var trialBalance = M_reports.trialBalance;
var balanceSheet = M_reports.balanceSheet;
var profitAndLoss = M_reports.profitAndLoss;
var propertyJobCost = M_reports.propertyJobCost;
var propertyBalanceSheet = M_reports.propertyBalanceSheet;
var dennisLedger = M_reports.dennisLedger;
var pnlTab = M_reports.pnlTab;

// ---- lib/property-key.mjs ----
var M_property_key = (function () {
  // lib/property-key.mjs — the Gmail-label <-> Properties.name normalisation rule,
  // phase2.6-spec.md §2: "compared after lower-casing and removing spaces and
  // punctuation (881Newport <-> 881 Newport)". Shared by
  // netlify/functions/books-property-mailboxes.mjs (and its tests) and mirrored by
  // hand in apps-script/poller/Code.gs's normalizeKey_ (Apps Script can't import ESM,
  // so that copy has to stay textually in sync with this one — see
  // test/poller-gs-lint.test.mjs).
  function normalizePropertyKey(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  /**
   * D-017: a property is "held" (open: costs post, interest accrues, mail is watched)
   * unless its status is "sold". Anything else - blank, a legacy "under contract" - is
   * treated as held. One rule for the allowlist, the mailbox registry and the upload.
   */
  function isOpenProperty(row) {
    return String(row?.status || "").trim().toLowerCase() !== "sold";
  }

  return { normalizePropertyKey, isOpenProperty };
})();
var normalizePropertyKey = M_property_key.normalizePropertyKey;
var isOpenProperty = M_property_key.isOpenProperty;

// ---- lib/sale.mjs ----
var M_sale = (function () {
  // lib/sale.mjs — Phase 5 sell wizard arithmetic (docs/phase5-spec.md, D-033, D-036, D-037)
  //
  // Pure. Turns a confirmed settlement statement into the ordered journal intents that close
  // one property, plus the checks that must hold before any of it posts. Nothing here reads
  // or writes: the caller (the writer's Sell dialog) maps each intent through
  // lib/posting.mjs buildEntry and posts them as one batch under the writer's lock.
  //
  // Two rules do the work:
  //   D-037 Recast's share. Every statement line posts at Recast's undivided share of the
  //   property; a line payable TO Recast by name posts at the co-owner's share only, because
  //   Recast's own share of a payment to itself cancels.
  //   Distribution order (reproduces Paul's own closed tabs to the cent): principal,
  //   interest and direct reimbursements first — both partners — then whatever cash is left
  //   splits by the profit share, capped at each partner's share. An unpaid share rides on
  //   2010 for Dennis and stays undrawn for Paul until the escrow holdback arrives.
  //
  // Profit is recognised in full at settlement even when cash is not: the holdback sits in
  // 1510 and the partners' unpaid shares are the mirror of it (Granite: $60,000 held back,
  // $30,000 owed to each — exactly the old Sales tab's two lines).

  const CASH = "1401";              // Cash — Citizens shared
  const HOLDBACK = "1510";          // Escrow & holdbacks receivable
  const REVENUE = "4000";           // Property sale proceeds
  const COGS = "5000";              // COGS — property released
  const INTEREST_COST = "1200";     // Financing — interest (Dennis)
  const INTEREST_ACCRUED = "2000";  // Accrued interest — Dennis
  const DENNIS_SHARE = "1220";      // Profit participation — Dennis
  const DENNIS_FEES = "1210";       // Financing — points & fees (the bank deal's commission)
  const CONCESSIONS = "1320";       // Selling — concessions & credits (off the commission's base, D-053)
  const DENNIS_NOTE = "2010";       // Note payable — Dennis
  const DUE_TO_PAUL = "2030";       // Due to owner (Paul)
  const OWNER_DRAWS = "9010";       // Owner draws & distributions
  const ROUNDING_ACCOUNT = "1310";  // Selling — closing costs: where a share's rounding cents land

  /** A cost account whose balance releases to COGS at the sale: the 1000-1399 series. */
  function isProjectCostAccount(account) {
    const a = String(account);
    return /^1[0-3]\d\d$/.test(a);
  }

  function atShare(cents, share) {
    return Math.round(cents * share);
  }

  /**
   * Splits one confirmed settlement statement into the sale entry's lines at Recast's share.
   *
   * `lines` are the statement as Paul confirmed it, each already mapped to an account:
   *   {label, account, cents, kind}  kind:
   *     "cost"      a seller-paid charge         -> debit, at share
   *     "credit"    an adjustment due to seller  -> credit, at share
   *     "holdback"  withheld in escrow           -> debit 1510, at share
   *     "to_recast" disbursed to Recast by name  -> credit, at the co-owner's share (D-037)
   *
   * @returns {{cash_cents, revenue_cents, cost_cents, credit_cents, holdback_cents,
   *            to_recast_cents, rounding_cents, byAccount: Map<string, number>}}
   */
  function splitStatement(settlement) {
    const share = (settlement.recast_share_pct ?? 100) / 100;
    if (!(share > 0 && share <= 1)) throw new RangeError(`sale: recast_share_pct must be in (0, 100]`);

    const byAccount = new Map(); // account -> signed cents, debit positive
    const labels = new Map();    // account -> the statement's own wording, for the Journal line
    const add = (account, cents, label) => {
      byAccount.set(account, (byAccount.get(account) || 0) + cents);
      if (label) labels.set(account, labels.has(account) ? labels.get(account) + "; " + label : label);
    };

    const revenue_cents = atShare(settlement.sale_price_cents, share);
    let cost_cents = 0, credit_cents = 0, holdback_cents = 0, to_recast_cents = 0, to_recast_full_cents = 0;

    for (const line of settlement.lines || []) {
      const cents = Number(line.cents) || 0;
      if (cents < 0) throw new RangeError(`sale: statement line "${line.label}" is negative; use the right kind instead`);
      if (line.kind === "cost") {
        const c = atShare(cents, share);
        cost_cents += c; add(line.account, c, line.label);
      } else if (line.kind === "credit") {
        const c = atShare(cents, share);
        credit_cents += c; add(line.account, -c, line.label);
      } else if (line.kind === "holdback") {
        const c = atShare(cents, share);
        holdback_cents += c; add(HOLDBACK, c, line.label);
      } else if (line.kind === "to_recast") {
        // D-037: Recast banks the whole line, but only the co-owner's share is new money -
        // Recast's own share of it was already deducted from its half of net-to-seller.
        const c = cents - atShare(cents, share);
        to_recast_full_cents += cents;
        to_recast_cents += c; add(line.account, -c, line.label);
      } else {
        throw new RangeError(`sale: statement line "${line.label}" has unknown kind "${line.kind}"`);
      }
    }

    // Cash = Recast's share of net-to-seller + every line paid to Recast, in full.
    //
    // The share is FLOORED, not rounded: half of an odd cent cannot go to both sellers, and
    // the title company gave the odd cent to the other one (280 Sparkling, 2026-08-06: half
    // of 518,106.25 is 259,053.125 and Recast was wired 259,053.12). Flooring reproduces the
    // wire, and understating Recast's cash by a cent is the safe direction.
    //
    // A statement that states Recast's own figure wins over the derivation; the dialog does
    // not ask Paul for it (2026-09-22: "it should know cash received"). Whichever it is,
    // rounding each line at the share can still differ by a few cents, and those land on
    // closing costs so the entry balances and the check names them.
    const cash_cents = Number.isFinite(settlement.cash_to_recast_cents) && settlement.cash_to_recast_cents > 0
      ? Math.round(settlement.cash_to_recast_cents)
      : Math.floor(settlement.net_to_seller_cents * share) + to_recast_full_cents;
    const derived = revenue_cents + credit_cents + to_recast_cents - cost_cents - holdback_cents;
    const rounding_cents = cash_cents - derived;
    const allowed = Math.max(5, (settlement.lines || []).length);
    if (Math.abs(rounding_cents) > allowed) {
      const off = (c) => (c / 100).toFixed(2);
      throw new RangeError(
        `sale: the statement does not tie. The ${(settlement.lines || []).length} line(s) given take ` +
        `${off(cost_cents + holdback_cents)} off the sale price and add ${off(credit_cents + to_recast_cents)} back, ` +
        `which leaves ${off(derived)}, but net-to-seller says Recast received ${off(cash_cents)} - a gap of ` +
        `${off(rounding_cents)}. Every charge, adjustment and holdback on the statement needs its own line.`,
      );
    }
    if (rounding_cents) add(ROUNDING_ACCOUNT, -rounding_cents);

    add(CASH, cash_cents);
    add(REVENUE, -revenue_cents);
    return {
      cash_cents, revenue_cents, cost_cents, credit_cents, holdback_cents, to_recast_cents,
      to_recast_full_cents, rounding_cents, byAccount, labels,
    };
  }

  /** Interest the engine says each advance earned, frozen at its repayment date (audit §59:
   * the settlement date and an advance's repayment date are different dates). */
  function interestByAdvance(advances, settlementDate) {
    return (advances || []).map((a) => {
      const asOf = a.repaid_date || settlementDate;
      return {
        advance_id: a.advance_id,
        date: a.date,
        kind: a.kind || "",
        amount_cents: a.amount_cents,
        as_of: asOf,
        interest_cents: accruedThrough(a, asOf),
      };
    });
  }

  function line(account, cents, extra = {}) {
    return cents >= 0
      ? { account, debit: cents, credit: 0, ...extra }
      : { account, debit: 0, credit: -cents, ...extra };
  }

  /**
   * The whole close, as ordered journal intents plus a summary and the checks.
   *
   * @param {object} input
   * @param {{name, deal?: "partner"|"bank", dennis_share_pct?, dennis_commission_pct?}} input.property
   * @param {{date, sale_price_cents, net_to_seller_cents, recast_share_pct?, lines}} input.settlement
   * @param {Array} input.advances               this property's advance rows
   * @param {Record<string, number>} input.balances  the property's Journal balances, debit positive
   * @param {number} [input.interestFigureCents] Dennis's agreed figure (D-015 §2); default the engine's
   * @param {number} [input.recaptureCents]      Cost Recapture settled on this payout (D-015 §4)
   * @param {string} [input.postedBy]
   */
  function buildSalePlan({
    property,
    settlement,
    advances = [],
    balances = {},
    interestFigureCents = null,
    recaptureCents = 0,
    docUrl = "",
    postedBy = "",
  }) {
    const date = settlement.date;
    const share = (settlement.recast_share_pct ?? 100) / 100;
    const deal = property.deal === "bank" ? "bank" : "partner";
    const dennisPct = deal === "bank" ? 0 : Number(property.dennis_share_pct ?? 50);
    const memoBase = `${property.name} sale ${date}` + (share < 1 ? ` (Recast ${(share * 100).toFixed(0)}%)` : "");
    const common = { property: property.name, payee: "", source: "sale", posted_by: postedBy };

    const st = splitStatement(settlement);

    // ---- 1. the sale itself -------------------------------------------------------------
    const saleLines = [...st.byAccount].map(([account, cents]) =>
      line(account, cents, { property: property.name, description: st.labels.get(account) || "" }));
    const intents = [{
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${memoBase}: settlement statement`,
      lines: saleLines,
    }];

    // ---- 2. interest to each advance's repayment date, then Dennis's agreed figure -------
    const detail = interestByAdvance(advances, date);
    const engineInterest = detail.reduce((t, d) => t + d.interest_cents, 0);
    const postedInterest = Math.round(balances[INTEREST_COST] || 0);
    const agreedInterest = interestFigureCents == null ? engineInterest : Math.round(interestFigureCents);

    const accrueNow = engineInterest - postedInterest;
    if (accrueNow !== 0) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
        memo: `${memoBase}: interest accrued to repayment (${detail.length} advance${detail.length === 1 ? "" : "s"})`,
        lines: [line(INTEREST_COST, accrueNow, { property: property.name }), line(INTEREST_ACCRUED, -accrueNow, { property: property.name })],
      });
    }
    const trueUp = agreedInterest - engineInterest;
    if (trueUp !== 0) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
        memo: `${memoBase}: interest true-up to Dennis's agreed figure (D-015)`,
        lines: [line(INTEREST_COST, trueUp, { property: property.name }), line(INTEREST_ACCRUED, -trueUp, { property: property.name })],
      });
    }

    // ---- 3. the bank deal's commission is a cost, so it lands before profit (D-030/D-036) --
    // D-053: it is on the sale price less the seller's concessions - "dennis is taking 3% on
    // $756,000" (104 Ashburne: 775,000 less the 19,000 seller credit, which the statement puts on 1320).
    const concession_cents = settlement.lines
      .filter((l) => l.kind === "cost" && String(l.account) === CONCESSIONS)
      .reduce((t, l) => t + Math.round(l.cents), 0);
    const commission_basis_cents = settlement.sale_price_cents - concession_cents;
    const commission = deal === "bank"
      ? atShare(Math.round(commission_basis_cents * (Number(property.dennis_commission_pct ?? 0) / 100)), share)
      : 0;
    if (commission) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
        memo: `${memoBase}: Dennis's ${property.dennis_commission_pct}% commission on the sale price` +
          (concession_cents ? ` less concessions (${(commission_basis_cents / 100).toFixed(2)})` : "") + " (bank deal)",
        lines: [line(DENNIS_FEES, commission, { property: property.name }), line(DENNIS_NOTE, -commission, { property: property.name })],
      });
    }

    // ---- 4. net profit, then the partner's share (itself a project cost, D-006) ----------
    const cost = new Map(); // project-cost account -> balance after the sale and interest
    for (const [account, cents] of Object.entries(balances)) {
      if (isProjectCostAccount(account) && Math.round(cents)) cost.set(account, Math.round(cents));
    }
    for (const [account, cents] of st.byAccount) {
      if (isProjectCostAccount(account)) cost.set(account, (cost.get(account) || 0) + cents);
    }
    cost.set(INTEREST_COST, (cost.get(INTEREST_COST) || 0) + accrueNow + trueUp);
    if (commission) cost.set(DENNIS_FEES, (cost.get(DENNIS_FEES) || 0) + commission);

    const costBeforeShare = [...cost.values()].reduce((t, c) => t + c, 0);
    const profit_cents = st.revenue_cents - costBeforeShare;
    const dennis_share_cents = Math.round(profit_cents * (dennisPct / 100));
    const paul_share_cents = profit_cents - dennis_share_cents;

    if (dennis_share_cents) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
        memo: `${memoBase}: Dennis's ${dennisPct}% of net profit`,
        lines: [line(DENNIS_SHARE, dennis_share_cents, { property: property.name }), line(DENNIS_NOTE, -dennis_share_cents, { property: property.name })],
      });
      cost.set(DENNIS_SHARE, (cost.get(DENNIS_SHARE) || 0) + dennis_share_cents);
    }

    // ---- 5. release every project cost to COGS ------------------------------------------
    const released_cents = [...cost.values()].reduce((t, c) => t + c, 0);
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${memoBase}: project cost released to COGS`,
      lines: [
        line(COGS, released_cents, { property: property.name }),
        ...[...cost].filter(([, c]) => c !== 0).map(([account, c]) => line(account, -c, { property: property.name })),
      ],
    });

    // ---- 6. the cash out: principal, interest and reimbursements first, then the shares ---
    const noteBefore = -Math.round(balances[DENNIS_NOTE] || 0) + commission;   // credit balance, positive = owed
    const accruedBefore = -Math.round(balances[INTEREST_ACCRUED] || 0) + accrueNow + trueUp;
    const dueToPaul = -Math.round(balances[DUE_TO_PAUL] || 0);

    let cash = st.cash_cents;
    const payDennisNote = Math.min(noteBefore, cash); cash -= payDennisNote;
    const payDennisInterest = Math.min(accruedBefore, cash); cash -= payDennisInterest;
    const payPaulDue = Math.min(dueToPaul, cash); cash -= payPaulDue;
    // what is left of the cash belongs to the two shares, in their proportion, capped at each
    const shareCash = Math.max(0, cash);
    const payDennisShare = Math.min(dennis_share_cents, Math.round(shareCash * (dennisPct / 100)));
    const payPaulShare = Math.min(paul_share_cents, shareCash - payDennisShare);
    cash = shareCash - payDennisShare - payPaulShare;

    const dennisLines = [];
    if (payDennisNote) dennisLines.push(line(DENNIS_NOTE, payDennisNote, { property: property.name, payee: "Dennis Little" }));
    if (payDennisShare) dennisLines.push(line(DENNIS_NOTE, payDennisShare, { property: property.name, payee: "Dennis Little" }));
    if (payDennisInterest) dennisLines.push(line(INTEREST_ACCRUED, payDennisInterest, { property: property.name, payee: "Dennis Little" }));
    const payDennis = payDennisNote + payDennisShare + payDennisInterest;
    if (payDennis) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
        memo: `${memoBase}: paid to Dennis — principal, interest and his share`,
        lines: [...dennisLines, line(CASH, -payDennis, { property: property.name, payee: "Dennis Little" })],
      });
    }

    const paulLines = [];
    if (payPaulDue) paulLines.push(line(DUE_TO_PAUL, payPaulDue, { property: property.name, payee: "Paul Bjork" }));
    if (payPaulShare) paulLines.push(line(OWNER_DRAWS, payPaulShare, { property: property.name, payee: "Paul Bjork" }));
    const payPaul = payPaulDue + payPaulShare;
    if (payPaul) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
        memo: `${memoBase}: paid to Paul — costs he fronted and his share`,
        lines: [...paulLines, line(CASH, -payPaul, { property: property.name, payee: "Paul Bjork" })],
      });
    }

    const summary = {
      property: property.name, deal, date,
      recast_share_pct: settlement.recast_share_pct ?? 100,
      sale_price_cents: settlement.sale_price_cents,
      revenue_cents: st.revenue_cents,
      statement: st,
      interest: { engine_cents: engineInterest, agreed_cents: agreedInterest, posted_before_cents: postedInterest, true_up_cents: trueUp, by_advance: detail },
      commission_cents: commission,
      commission_basis_cents: commission ? commission_basis_cents : 0,
      cost_before_share_cents: costBeforeShare,
      profit_cents,
      dennis_share_cents, paul_share_cents,
      released_cents,
      cash_in_cents: st.cash_cents,
      paid: { dennis_cents: payDennis, paul_cents: payPaul, dennis_note_cents: payDennisNote, dennis_interest_cents: payDennisInterest, dennis_share_cents: payDennisShare, paul_due_cents: payPaulDue, paul_share_cents: payPaulShare },
      retained_cents: cash,
      owed_after: { dennis_cents: noteBefore + dennis_share_cents - payDennisNote - payDennisShare + accruedBefore - payDennisInterest, paul_cents: dueToPaul - payPaulDue, paul_undrawn_cents: paul_share_cents - payPaulShare },
      recapture_cents: recaptureCents,
    };

    const checks = {
      // every intent balances
      balanced: intents.every((i) => i.lines.reduce((t, l) => t + (l.debit || 0) - (l.credit || 0), 0) === 0),
      // cash out never exceeds cash in, and nothing is left unexplained
      cash_ties: payDennis + payPaul + cash === st.cash_cents,
      // the 1000s are empty after the release
      released_ties: released_cents === costBeforeShare + dennis_share_cents,
      // the statement's own rounding, named
      statement_rounding_cents: st.rounding_cents,
    };
    checks.ok = checks.balanced && checks.cash_ties && checks.released_ties;

    return { intents, summary, checks };
  }

  /**
   * The escrow holdback, when the money actually arrives (D-036 §1: Granite's $60,000 came
   * in on 2026-09-11, split 50/50). Dr cash / Cr 1510, then the partners' unpaid shares.
   */
  function buildHoldbackRelease({ property, date, amount_cents, dennis_cents, paul_cents, docUrl = "", postedBy = "" }) {
    const name = property.name;
    const intents = [{
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${name} escrow holdback released ${date}`,
      lines: [line(CASH, amount_cents, { property: name }), line(HOLDBACK, -amount_cents, { property: name })],
    }];
    if (dennis_cents) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
        memo: `${name} holdback: Dennis's share`,
        lines: [line(DENNIS_NOTE, dennis_cents, { property: name, payee: "Dennis Little" }), line(CASH, -dennis_cents, { property: name, payee: "Dennis Little" })],
      });
    }
    if (paul_cents) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
        memo: `${name} holdback: Paul's share`,
        lines: [line(OWNER_DRAWS, paul_cents, { property: name, payee: "Paul Bjork" }), line(CASH, -paul_cents, { property: name, payee: "Paul Bjork" })],
      });
    }
    const checks = {
      balanced: intents.every((i) => i.lines.reduce((t, l) => t + (l.debit || 0) - (l.credit || 0), 0) === 0),
      distributed_ties: (dennis_cents || 0) + (paul_cents || 0) <= amount_cents,
    };
    checks.ok = checks.balanced && checks.distributed_ties;
    return { intents, checks };
  }

  // ---- the closing tab's two lists (Paul, 2026-10-01: "this sheet is a bit confusing") -------
  // Pure, so the tab's arithmetic is tested here: every list adds up to the total under it.

  /**
   * The SETTLEMENT block, the way the money arrived. Every statement line shows at Recast's
   * share. A line paid to Recast by name shows twice, because that is what happened: once
   * among the charges (Recast's share of it came out of Recast's own sale money) and once
   * below the subtotal, in full (the separate payment Recast received). 280 Sparkling: the
   * 4,716.82 reimbursement came off the top before the split, so 259,053.12 + 4,716.82 are
   * the two wires - the old layout netted the two to "2,358.41" and read as half a payment.
   *
   * @param {{revenue_cents, cash_in_cents, recast_share_pct?}} summary
   * @param {Array<{label, account, kind, posted_cents, full_cents?, rest_label?, paid_label?}>} lines
   *   `full_cents` on a to_recast line is the statement's own figure; without it (a tab
   *   rebuilt from the Journal alone) the line shows as the net credit it was posted as.
   * @returns {Array<{label, cents, note, total?: true}>} first row the sale price, last row cash received
   */
  function settlementRows(summary, lines = []) {
    const share = Number(summary.recast_share_pct ?? 100);
    const mine = share === 50 ? "half" : "share";
    const rows = [{ label: "Sale price" + (share < 100 ? " (Recast's share)" : ""), cents: summary.revenue_cents, note: "" }];
    const paid = lines.filter((l) => l.kind === "to_recast" && l.full_cents);
    const paidFull = paid.reduce((t, l) => t + l.full_cents, 0);
    let running = summary.revenue_cents;
    for (const l of lines) {
      const charged = paid.includes(l);
      const cents = charged ? -(l.full_cents - l.posted_cents)
        : (l.kind === "credit" || l.kind === "to_recast" ? 1 : -1) * l.posted_cents;
      running += cents;
      // the explanation leads: a long statement label is cut off at the column's edge
      rows.push({ label: "  " + (charged ? `Your ${mine} of the charge: ` : "") + l.label, cents, note: l.account });
    }
    const rounding = summary.cash_in_cents - paidFull - running;
    if (rounding) rows.push({ label: "  Rounding", cents: rounding, note: "" });
    if (paid.length) {
      rows.push({ label: paid[0].rest_label || `Your ${mine} of the sale money`, cents: summary.cash_in_cents - paidFull, note: "", total: true });
      for (const l of paid) rows.push({ label: l.paid_label || `${l.label}, paid to Recast in full`, cents: l.full_cents, note: "" });
    }
    rows.push({ label: "Cash received", cents: summary.cash_in_cents, note: "", total: true });
    return rows;
  }

  /**
   * The PROJECT COST RELEASED block: one row per account released to COGS, the rehab accounts
   * as one Rehab row. Net of both sides - a rehab account the closing reimbursed past zero is
   * released with a debit, and counting credits only left that row off the list, so the rows
   * did not add up to the total (280 Sparkling, 1,559.94). Rehab shows what was spent.
   *
   * A reimbursement paid to Recast by name shows IN FULL under it, with Recast's share of the
   * charge for it as its own row - the same two figures as the settlement block. Paul,
   * 2026-10-01, on a single net row worded "the co-owner's half": "WE PAID THE ENTIRE 4,716.82.
   * SAM DIDNT PAY A PENNY. we were reimbursed as a separate wire for the full amount." Never
   * word either row as the co-owner paying.
   *
   * @param {Array<{memo, lines}>} intents  the run's entries; the settlement and the release are read
   * @param {(account: string) => string} nameOf  the chart's name for an account
   * @param {Array<{kind, account, posted_cents, full_cents?}>} [lines]  the tab's statement lines (settlementRows)
   * @param {number} [sharePct]  Recast's share of the sale, for the charge row's wording
   * @returns {Array<{label, cents, accounts}>}
   */
  function releasedCostRows(intents, nameOf = (a) => "account " + a, lines = [], sharePct = 100) {
    const isRehab = (a) => a >= "1020" && a <= "1060";
    const released = new Map();
    let reimbursed = 0;   // what the settlement entry credited to the rehab accounts
    for (const i of intents || []) {
      const release = /released to COGS/.test(i.memo);
      const statement = /settlement statement/.test(i.memo);
      for (const l of i.lines) {
        const a = String(l.account);
        if (!isProjectCostAccount(a)) continue;
        if (release) released.set(a, (released.get(a) || 0) + (l.credit || 0) - (l.debit || 0));
        else if (statement && isRehab(a)) reimbursed += l.credit || 0;
      }
    }
    const paid = (lines || []).filter((l) => l.kind === "to_recast" && l.full_cents && l.posted_cents && isRehab(String(l.account)));
    const paidFull = paid.reduce((t, l) => t + l.full_cents, 0);
    const paidNet = paid.reduce((t, l) => t + l.posted_cents, 0);
    const rows = [];
    const rehab = [...released.keys()].filter(isRehab).sort();
    let rehabDone = false;
    for (const a of [...released.keys()].sort()) {
      if (isRehab(a)) {
        if (rehabDone) continue;
        rehabDone = true;
        rows.push({ label: "Rehab", cents: rehab.reduce((t, r) => t + released.get(r), 0) + reimbursed, accounts: rehab.join(" ") });
        if (paid.length) {
          rows.push({ label: "Less: reimbursement paid to Recast, in full", cents: -paidFull, accounts: "" });
          rows.push({ label: `Your ${sharePct === 50 ? "half" : "share"} of the charge for it, taken out of the sale money (same as above)`, cents: paidFull - paidNet, accounts: "" });
        }
        rows.push({ label: "Less: rehab reimbursed at closing", cents: -(reimbursed - (paid.length ? paidNet : 0)), accounts: "" });
        continue;
      }
      rows.push({
        label: a === DENNIS_SHARE ? "Dennis's half of the profit (a cost of the deal, so your half is the bottom line)" : nameOf(a),
        cents: released.get(a), accounts: a,
      });
    }
    return rows.filter((r) => r.cents !== 0);
  }

  // ---- the closing tab every partner deal gets (Paul's layout, 2026-10-01) -------------------
  // He shaped it line by line on 280 Sparkling's trial tab, then: "yes. with the exception of
  // ashburne" - the bank deal keeps the long layout above (settlementRows / releasedCostRows).
  // It follows the cash: what came in, what the house cost before closing, the profit and its
  // split, who was paid. The title company's own charges are not listed - they came out of the
  // sale money before it was wired, and are on the linked closing document.

  /**
   * What each project-cost account held BEFORE the closing: what the release took out, less
   * what the settlement entry itself put in. Dennis's share of the profit is not a cost here.
   * @returns {Map<string, number>} account -> cents
   */
  function costBeforeClosing(intents) {
    const before = new Map();
    for (const i of intents || []) {
      if (!/released to COGS|settlement statement/.test(i.memo)) continue;
      for (const l of i.lines) {
        const a = String(l.account);
        if (!isProjectCostAccount(a) || a === DENNIS_SHARE) continue;
        before.set(a, (before.get(a) || 0) + (l.credit || 0) - (l.debit || 0));
      }
    }
    return before;
  }

  /**
   * The rows of the closing tab, in Paul's sections, names and order.
   *
   * PROJECT COSTS (D-071, which replaced D-068): the way Paul's old reconciled tabs did it -
   * the purchase, the interest, Rehab Costs = EVERY bill that is not a utility, tax or
   * insurance, and Utilities. A cash advance's PRINCIPAL is not a cost row: it paid for bills
   * that are already in Rehab Costs (or paid Paul back for them), so listing it too would
   * count that money twice. Its interest is a cost. The principal shows only in PAYOUTS, where
   * Dennis gets it back; a partner's "Paid out of pocket" there is bills he paid that no
   * advance covered. Never net the advances out of Rehab Costs - Paul reads that row against
   * the house tab's list of bills.
   * Never throws - it is called after a sale has posted; a figure that does not tie says so
   * in its note instead.
   *
   * @param {object} input
   * @param {object} input.summary     buildSalePlan's summary (or the same read back off the Journal)
   * @param {Array<{memo, lines}>} input.intents   the settlement and release entries are read
   * @param {Array} [input.lines]      the tab's statement lines (settlementRows): holdbacks, payments to Recast
   * @param {number} [input.dennisPct] Dennis's share of the profit
   * @param {{date, received_cents, dennis_cents, paul_cents}} [input.holdback] escrow released since
   * @returns {{title_note: string, rows: Array<{label, cents, note, style, note_plain?}>}}
   *   style: "head" | "total" | "row" | "blank"; cents null on a name row; note_plain = the note is not bold
   */
  function closingRows({ summary: s, intents, lines = [], dennisPct = 50, holdback = null }) {
    const share = Number(s.recast_share_pct ?? 100);
    const mine = share === 50 ? "half" : "share";
    const money = (c) => (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const rows = [];
    const row = (label, cents, note = "") => rows.push({ label: "  " + label, cents, note, style: "row" });
    const total = (label, cents, note = "") => rows.push({ label, cents, note, style: "total" });
    const head = (label) => rows.push({ label, cents: null, note: "", style: "head" });
    const blank = () => rows.push({ label: "", cents: null, note: "", style: "blank" });

    const before = costBeforeClosing(intents);
    const at = (a) => before.get(a) || 0;
    const totalCost = [...before.values()].reduce((t, c) => t + c, 0);
    const advances = (s.interest && s.interest.by_advance) || [];
    const cashAdv = advances.filter((a) => a.kind === "cash");
    const cashPrincipal = cashAdv.reduce((t, a) => t + a.amount_cents, 0);
    const cashInterest = cashAdv.reduce((t, a) => t + a.interest_cents, 0);
    const purchasePrincipal = advances.filter((a) => a.kind !== "cash").reduce((t, a) => t + a.amount_cents, 0);
    const held = lines.filter((l) => l.kind === "holdback").reduce((t, l) => t + l.posted_cents, 0);
    const paid = lines.filter((l) => l.kind === "to_recast" && l.full_cents);
    const paidFull = paid.reduce((t, l) => t + l.full_cents, 0);

    head("INCOMING CASH AT CLOSING");
    // Paul's wording, 2026-10-01: "Payout from title company", and its note short and not bold
    row((paid[0] && paid[0].rest_label) || (share < 100 ? `Your ${mine} of the payout from title company` : "Payout from title company"),
      s.cash_in_cents - paidFull, "After commission, closing costs and taxes");
    rows[rows.length - 1].note_plain = true;
    for (const l of paid) row(l.paid_label || `${l.label}, paid to Recast in full`, l.full_cents);
    total("Cash received", s.cash_in_cents);
    if (held) {
      row("Held back by the title company (escrow)", held, "Comes later - see the escrow section below");
      rows[rows.length - 1].note_plain = true;   // not bold (Paul, 2026-10-01)
    }
    blank();

    head("PROJECT COSTS");
    row("Purchase Principal", at("1000"));
    row("Purchase Interest", at(INTEREST_COST) - cashInterest);
    // Paul, 2026-10-01: "add the cash advance total after Cash Advances Interest so it would say Cash Advances
    // Interest on $6,838" - the principal is not a cost row here, so the interest row says what it is interest on.
    const dollars = (c) => "$" + (c % 100 ? money(c) : money(c).slice(0, -3));
    row("Cash Advances Interest" + (cashPrincipal ? " on " + dollars(cashPrincipal) : ""), cashInterest);
    row("Rehab Costs", totalCost - at("1000") - at(INTEREST_COST) - at("1120") - at("1100") - at("1110"));
    row("Utilities", at("1120"));
    if (at("1100")) row("Property Tax", at("1100"));
    if (at("1110")) row("Insurance", at("1110"));
    total("Total Project Costs", totalCost);
    blank();

    head("PROFIT");
    const expected = s.cash_in_cents + held - totalCost;
    total("Total Profit", s.profit_cents, expected === s.profit_cents
      ? "Cash received" + (held ? " plus the escrow" : "") + " less total project costs"
      : `DOES NOT MATCH cash received less total project costs (${money(expected)})`);
    if (dennisPct) row(`Dennis ${dennisPct}%`, s.dennis_share_cents);
    row(`Paul ${100 - dennisPct}%`, s.paul_share_cents);
    blank();

    // Plain "Half of profit" even when escrow was held back and only part was paid at closing (Paul took the
    // "(the part paid at closing)" suffix off, 2026-10-01) - the escrow section under the payouts shows the rest.
    const shareLabel = (pct) => (pct === 50 ? "Half of profit" : `${pct}% of profit`);
    const paidOut = s.paid.dennis_cents + s.paid.paul_cents + s.retained_cents;
    head("PAYOUTS");
    total("Dennis", null);
    row("Purchase Principal", purchasePrincipal);
    row("Purchase Interest", s.paid.dennis_interest_cents - cashInterest);
    row("Cash Advances Principal", cashPrincipal);
    row("Cash Advances Interest", cashInterest);
    row("Paid out of pocket", s.paid.dennis_note_cents - purchasePrincipal - cashPrincipal);
    row(shareLabel(dennisPct), s.paid.dennis_share_cents);
    total("Total to Dennis", s.paid.dennis_cents);
    blank();
    total("Paul", null);
    row("Paid out of pocket", s.paid.paul_due_cents);
    row(shareLabel(100 - dennisPct), s.paid.paul_share_cents);
    total("Total to Paul", s.paid.paul_cents);
    blank();
    total("Refunded to Recast Citizens Account", s.retained_cents);
    blank();
    total("Total paid out", paidOut, paidOut === s.cash_in_cents
      ? "Matches the cash received at closing" : "DOES NOT MATCH the cash received at closing");

    if (held) {
      blank();
      head("ESCROW HELD BACK AT CLOSING");
      const got = holdback ? holdback.received_cents : 0;
      if (got) {
        row(`Released by the title company ${holdback.date}`, got);
        row("Paid to Dennis", holdback.dennis_cents);
        row("Paid to Paul", holdback.paul_cents);
        row("Refunded to Recast Citizens Account", got - holdback.dennis_cents - holdback.paul_cents);
      }
      if (held - got) {
        row("Still held by the title company", held - got);
        row("Owed to Dennis when it is released", s.owed_after.dennis_cents);
        row("Owed to Paul when it is released", s.owed_after.paul_undrawn_cents);
      }
    }

    return {
      title_note: `Sold for ${money(Math.round(s.revenue_cents * 100 / share))}.` + (share < 100 ? ` Recast owned ${share}%.` : ""),
      rows,
    };
  }

  return { isProjectCostAccount, splitStatement, interestByAdvance, buildSalePlan, buildHoldbackRelease, settlementRows, releasedCostRows, costBeforeClosing, closingRows };
})();
var isProjectCostAccount = M_sale.isProjectCostAccount;
var splitStatement = M_sale.splitStatement;
var interestByAdvance = M_sale.interestByAdvance;
var buildSalePlan = M_sale.buildSalePlan;
var buildHoldbackRelease = M_sale.buildHoldbackRelease;
var settlementRows = M_sale.settlementRows;
var releasedCostRows = M_sale.releasedCostRows;
var costBeforeClosing = M_sale.costBeforeClosing;
var closingRows = M_sale.closingRows;

// ---- lib/statement.mjs ----
var M_statement = (function () {
  // lib/statement.mjs - Phase 3: a bank's OFX/QFX export as feed lines (docs/phase3-spec.md section 2).
  //
  // Pure and deterministic: no model, no I/O. It also runs inside the workbook (scripts/build-gs.mjs
  // puts it in lib.gs), so nothing here uses a Node API. Citizens (CNB of Texas, "S1 IBS") exports
  // OFX 1.02 SGML: one tag per line, leaf values with no closing tag, `%23` where the bank meant `#`
  // ("CK%23 1023" is check 1023) and `&amp;` for `&`. The account number sits in ACCTID; only its
  // last four digits come out of here - the whole number never leaves the file.


  const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };

  function fail(code, message) {
    const err = new Error(message);
    err.code = code;
    throw err;
  }

  function pick(head, keys) {
    for (const k of keys) if (head[k] != null && head[k] !== "") return head[k];
    return "";
  }

  /** A NAME/MEMO as the bank meant it: entities and %23 decoded, whitespace collapsed. */
  function decodeOfxText(s) {
    return String(s == null ? "" : s)
      .replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m])
      .replace(/%23/g, "#")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** "20260901" or "20260928230510.000[-5:CDT]" -> "2026-09-01"; "" when it is not a date. */
  function ofxDate(s) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(s || "").trim());
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
  }

  /**
   * Parse an OFX/QFX file (SGML 1.x or XML 2.x) into
   *   {account_last4, account_type, currency, start, end, ledger_balance_cents, ledger_date,
   *    lines: [{fitid, date, amount_cents, type, name, memo}]}
   * lines oldest first (date, then FITID). Throws {code: NOT_OFX | NO_ACCOUNT | NO_LINES | BAD_LINE}.
   */
  function parseOfx(text) {
    const src = String(text || "");
    const at = src.indexOf("<OFX>");
    if (at < 0) fail("NOT_OFX", "This is not a bank export: there is no OFX statement inside the file.");
    const tokens = src.slice(at).match(/<\/?[A-Za-z0-9._]+>[^<]*/g) || [];

    // Leaves outside a transaction are keyed "<innermost open aggregate>.<tag>", so LEDGERBAL's
    // BALAMT and AVAILBAL's never collide. A tag with nothing after it opens an aggregate (SGML
    // never closes a leaf; XML closes both, and a close for a tag not on the stack is ignored).
    const head = {};
    const lines = [];
    const stack = [];
    let trn = null;
    for (const tok of tokens) {
      const m = /^<(\/?)([A-Za-z0-9._]+)>([^<]*)$/.exec(tok);
      const closing = m[1] === "/";
      const tag = m[2];
      const value = m[3].trim();
      if (closing) {
        const i = stack.lastIndexOf(tag);
        if (i >= 0) stack.length = i;
        if (tag === "STMTTRN" && trn) { lines.push(trn); trn = null; }
        continue;
      }
      if (value === "") {
        stack.push(tag);
        if (tag === "STMTTRN") trn = {};
        continue;
      }
      if (trn) trn[tag] = value;
      else head[`${stack[stack.length - 1] || ""}.${tag}`] = value;
    }

    const acctId = pick(head, ["BANKACCTFROM.ACCTID", "CCACCTFROM.ACCTID"]);
    if (!acctId) fail("NO_ACCOUNT", "The file names no account.");
    if (!lines.length) fail("NO_LINES", "The file has no transactions in it.");

    const out = lines.map((t) => {
      const fitid = String(t.FITID || "").trim();
      const date = ofxDate(t.DTPOSTED);
      if (!fitid || !date || t.TRNAMT == null) {
        fail("BAD_LINE", `A line in the file is missing its id, date or amount: ${JSON.stringify(t)}`);
      }
      return {
        fitid,
        date,
        amount_cents: toCents(String(t.TRNAMT)),
        type: String(t.TRNTYPE || "").trim().toUpperCase(),
        name: decodeOfxText(t.NAME),
        memo: decodeOfxText(t.MEMO),
      };
    });
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fitid < b.fitid ? -1 : a.fitid > b.fitid ? 1 : 0));

    const bal = pick(head, ["LEDGERBAL.BALAMT"]);
    return {
      account_last4: acctId.replace(/\D/g, "").slice(-4),
      account_type: pick(head, ["BANKACCTFROM.ACCTTYPE"]) || (head["CCACCTFROM.ACCTID"] ? "CREDITCARD" : ""),
      currency: pick(head, ["STMTRS.CURDEF", "CCSTMTRS.CURDEF"]) || "USD",
      start: ofxDate(pick(head, ["BANKTRANLIST.DTSTART"])) || out[0].date,
      end: ofxDate(pick(head, ["BANKTRANLIST.DTEND"])) || out[out.length - 1].date,
      ledger_balance_cents: bal === "" ? null : toCents(String(bal)),
      ledger_date: ofxDate(pick(head, ["LEDGERBAL.DTASOF"])),
      lines: out,
    };
  }

  return { decodeOfxText, ofxDate, parseOfx };
})();
var decodeOfxText = M_statement.decodeOfxText;
var ofxDate = M_statement.ofxDate;
var parseOfx = M_statement.parseOfx;

// ---- lib/bank-sheet.mjs ----
var M_bank_sheet = (function () {
  // lib/bank-sheet.mjs - the bank account's own tab (Paul, 2026-09-29): every line of the account,
  // newest on top, who paid, and where it stands - so he can show Dennis what is reconciled and what
  // he still needs from him. Code, not judgment: it reads the Feed tab and the Journal and says what
  // they already hold. The writer (Code.gs refreshBankSheets_) puts the rows on the tab.


  const BANK_SHEET_HEADER = ["Date", "Amount", "What the bank says", "Who paid", "Status", "Waiting on", "House", "Note"];

  const BANK_STATUS = {
    done: "Reconciled",
    receipt: "Waiting for receipt",
    answer: "Waiting for an answer",
    later: "Waiting for closing",   // followed by " : <house>" when the note names one (Paul, 2026-09-29)
    booking: "Being recorded",
    fresh: "New - not looked at yet",
    excluded: "Left out",
    broken: "Needs a look",
  };

  const BANK_ACCOUNT = /^14\d\d$/;
  const ids = (s) => String(s || "").split(/[\s,]+/).filter(Boolean);
  const proper = (s) => { const t = String(s || "").trim().toLowerCase(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ""; };
  /** "Dennis (9301)" -> "Dennis"; what Paul typed by hand ("Dennis") stays as it is. */
  const holderOfCard = (card) => String(card || "").replace(/\s*\(.*$/, "").trim();
  const house = (p) => (p === "OVERHEAD" ? "Business" : p);
  /** A note as Paul reads it: no decision numbers, and nothing when it only says where it was clicked. */
  const plain = (note) => String(note || "").replace(/\s*\(D-\d+\)/g, "").replace(/^Recorded from the Inbox$/, "").trim();

  /**
   * @param {Array<{feed_id, account, date, amount, name, memo, status, txn_id, match_note, card}>} feed
   *        the Feed tab's rows; date is YYYY-MM-DD, amount is dollars as the bank shows it
   * @param {Array<object>} journal loadJournal lines
   * @param {string} account the bank account's code ("1401")
   * @returns {any[][]} one row per bank line in BANK_SHEET_HEADER order, newest first
   */
  function bankSheetRows(feed, journal, account) {
    const voided = new Set(journal.map((l) => l.void_of).filter(Boolean));
    // the houses the books know, longest name first, to find the one a note names
    const houses = [...new Set(journal.map((l) => l.property).filter((p) => p && p !== "OVERHEAD"))].sort((a, b) => b.length - a.length);
    const byTxn = new Map();
    for (const l of journal) {
      if (l.void_of || l.source === "void") continue;
      (byTxn.get(l.txn_id) || byTxn.set(l.txn_id, []).get(l.txn_id)).push(l);
    }

    return feed
      .filter((r) => String(r.account) === String(account))
      .sort((a, b) => (a.date === b.date ? String(b.feed_id).localeCompare(String(a.feed_id)) : String(b.date).localeCompare(String(a.date))))
      .map((r) => {
        const who = holderOfCard(r.card);
        const note = plain(r.match_note);
        let status, waiting = "", where = "", say = note;

        if (r.status === "matched") {
          const tied = ids(r.txn_id);
          const live = tied.filter((t) => !voided.has(t) && byTxn.has(t));
          // a card of several bank lines ties every line to all of its entries: the entry for this
          // very amount speaks for the line when there is one (three charges, three placeholders)
          const cents = Math.round((Number(r.amount) || 0) * 100);
          const onBank = (t) => byTxn.get(t).filter((l) => String(l.account) === String(account)).reduce((sum, l) => sum + l.debit - l.credit, 0);
          const own = live.filter((t) => onBank(t) === cents);
          const lines = (own.length ? own : live).flatMap((t) => byTxn.get(t)).filter((l) => !BANK_ACCOUNT.test(l.account));
          where = [...new Set(lines.map((l) => house(l.property)).filter(Boolean))].join(", ");
          const holder = lines.map((l) => String(l.description)).find((d) => d.includes(NEED_RECEIPT));
          if (!live.length || live.length < tied.length) {
            status = BANK_STATUS.broken; waiting = "Claude";
            say = "The entry this line was tied to was taken out of the books";
          } else if (holder) {
            status = BANK_STATUS.receipt;
            waiting = proper(holder.slice(holder.indexOf(NEED_RECEIPT) + NEED_RECEIPT.length)) || who;
            say = "Recorded - the receipt takes its place when it comes";
          } else {
            status = BANK_STATUS.done;
            const first = lines[0];
            if (!say && first) say = [first.payee, first.description].filter(Boolean).join(" - ") + (lines.length > 1 ? ` (+${lines.length - 1} more)` : "");
          }
        } else if (r.status === "proposed") {
          // a card in Paul's Inbox: a charge on a card needs that person's receipt, anything else Paul's word
          status = who && Number(r.amount) < 0 ? BANK_STATUS.receipt : BANK_STATUS.answer;
          waiting = who || "Paul";
          say = note.replace(/^In the Inbox:\s*/, "");
        } else if (r.status === "excluded") {
          status = BANK_STATUS.excluded;
        } else if (/^Waits:/.test(note)) {
          say = note.replace(/^Waits:\s*/, "");
          where = houses.find((h) => say.includes(h)) || "";
          status = BANK_STATUS.later + (where ? ` : ${where}` : "");
        } else if (/^Paul:/.test(note)) {
          status = BANK_STATUS.booking; waiting = "Claude";
        } else {
          status = BANK_STATUS.fresh;
          say = "";
        }
        return [r.date, Number(r.amount) || 0, String(r.memo || "").length >= String(r.name || "").length ? r.memo : r.name, who, status, waiting, where, say];
      });
  }

  /** The line above the table: how many lines stand where. */
  function bankSheetSummary(rows) {
    const count = (s) => rows.filter((r) => String(r[4]).startsWith(s)).length;
    const on = (w) => rows.filter((r) => r[5] === w).length;
    return `${rows.length} lines - ${count(BANK_STATUS.done)} reconciled, ${on("Dennis")} waiting on Dennis, ${on("Paul")} waiting on Paul, ${count(BANK_STATUS.later)} waiting for a closing`;
  }

  /**
   * The bank-vs-books box at the top of the tab (Paul, 2026-09-30: part of what is already built,
   * no new step): what the bank says, every reason the books differ, what the books say, and
   * anything left with no reason - line by line. Code, not judgment.
   * Bank = the account's opening balance + every bank line (the import already checks the file
   * ties to the bank's own balance). Books = the account's lines on the Journal. A bank line is
   * in the books when it is tied to live entries; a books line is on the bank when its entry is
   * tied to a bank line. Whatever is left after both lists is rounding (under a dollar) or not
   * explained.
   * @returns {{ bank_cents, books_cents, reasons: Array<{text, cents}>, unexplained: Array<{date, cents, text}> }}
   */
  function bankCheck(feed, journal, account, openingCents = 0) {
    const acct = String(account);
    const lines = feed.filter((r) => String(r.account) === acct);
    const cents = (v) => Math.round((Number(v) || 0) * 100);
    const voided = new Set(journal.map((l) => l.void_of).filter(Boolean));
    const live = new Set(journal.filter((l) => l.source !== "void" && !voided.has(l.txn_id)).map((l) => l.txn_id));
    const houses = [...new Set(journal.map((l) => l.property).filter((p) => p && p !== "OVERHEAD"))].sort((a, b) => b.length - a.length);

    const bank_cents = lines.reduce((s, r) => s + cents(r.amount), openingCents);
    const books_cents = journal.filter((l) => String(l.account) === acct).reduce((s, l) => s + l.debit - l.credit, 0);

    const onBank = new Set();
    const groups = new Map();   // reason -> { n, cents }
    const unexplained = [];
    const add = (text, c) => { const g = groups.get(text) || groups.set(text, { n: 0, cents: 0 }).get(text); g.n++; g.cents -= c; };
    for (const r of lines) {
      const tied = ids(r.txn_id);
      const note = String(r.match_note || "");
      if (r.status === "matched" && tied.length && tied.every((t) => live.has(t))) { tied.forEach((t) => onBank.add(t)); continue; }
      if (r.status === "excluded") add("left out on purpose", cents(r.amount));
      else if (r.status === "matched") unexplained.push({ date: r.date, cents: cents(r.amount), text: `On the bank (${r.name || r.memo}), tied to something taken out of the books` });
      else if (/^Waits:/.test(note)) {
        const h = houses.find((x) => note.includes(x));
        add(`waiting for ${h ? `the ${h}` : "a"} closing - not in the books until the house closes`, cents(r.amount));
      }
      else if (r.status === "proposed") add("still open in the Inbox - not in the books yet", cents(r.amount));
      else add("not looked at yet", cents(r.amount));
    }

    // books lines no bank line stands behind, one per entry
    const first = lines.reduce((m, r) => (!m || r.date < m ? r.date : m), "");
    const byTxn = new Map();
    for (const l of journal) {
      if (String(l.account) !== acct || !live.has(l.txn_id) || onBank.has(l.txn_id)) continue;
      const e = byTxn.get(l.txn_id) || byTxn.set(l.txn_id, { date: String(l.date).slice(0, 10), cents: 0, what: "" }).get(l.txn_id);
      e.cents += l.debit - l.credit;
      e.what = e.what || [l.payee, l.description].filter(Boolean).join(" - ") + (l.property ? ` (${house(l.property)})` : "");
    }
    // A payment dated after the file's last line cannot be on it yet - a reason, not a red line
    // (2026-10-02: a water bill paid 10-01 against a file ending 09-28 turned the box red).
    const last = lines.reduce((m, r) => (r.date > m ? r.date : m), "");
    let before = 0;
    const after = { n: 0, cents: 0 };
    for (const e of byTxn.values()) {
      if (!e.cents) continue;
      if (first && e.date < first) { before += e.cents; continue; }
      if (last && e.date > last) { after.n++; after.cents += e.cents; continue; }
      unexplained.push({ date: e.date, cents: e.cents, text: `In the books as paid from this account, not on the bank: ${e.what}` });
    }
    if (before) unexplained.push({ date: first, cents: before, text: "In the books before the bank's first line" });

    const reasons = [...groups].map(([text, g]) => ({ text: `${g.n} bank line${g.n > 1 ? "s" : ""} ${text}`, cents: g.cents }));
    if (after.n) reasons.push({ text: `${after.n} payment${after.n > 1 ? "s" : ""} recorded after ${last.slice(5)}, the last day on the bank file - ${after.n > 1 ? "they tie" : "it ties"} when the next file is imported`, cents: after.cents });
    const rest = books_cents - bank_cents - reasons.reduce((s, r) => s + r.cents, 0) - unexplained.reduce((s, u) => s + u.cents, 0);
    if (rest && Math.abs(rest) < 100) reasons.push({ text: "pennies of rounding in the old books", cents: rest });
    else if (rest) unexplained.push({ date: "", cents: rest, text: "A difference no line accounts for" });
    unexplained.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { bank_cents, books_cents, reasons, unexplained };
  }

  /** The box as tab rows: [date, amount, text], amounts in dollars. */
  function bankCheckRows(check, bankName) {
    const d = (c) => c / 100;
    const rows = [
      ["", d(check.bank_cents), `What ${bankName} says is in the account`],
      ...check.reasons.map((r) => ["", d(r.cents), r.text]),
      ...check.unexplained.map((u) => [u.date, d(u.cents), u.text]),
      ["", d(check.books_cents), "What the books say is in the account"],
    ];
    const head = check.unexplained.length
      ? `Bank vs books: ${check.unexplained.length} thing${check.unexplained.length > 1 ? "s" : ""} not explained - listed below`
      : "Bank vs books: they agree - every dollar of difference has a reason";
    return [[head, "", ""], ...rows];
  }

  return { BANK_SHEET_HEADER, BANK_STATUS, holderOfCard, bankSheetRows, bankSheetSummary, bankCheck, bankCheckRows };
})();
var BANK_SHEET_HEADER = M_bank_sheet.BANK_SHEET_HEADER;
var BANK_STATUS = M_bank_sheet.BANK_STATUS;
var holderOfCard = M_bank_sheet.holderOfCard;
var bankSheetRows = M_bank_sheet.bankSheetRows;
var bankSheetSummary = M_bank_sheet.bankSheetSummary;
var bankCheck = M_bank_sheet.bankCheck;
var bankCheckRows = M_bank_sheet.bankCheckRows;

// ---- lib/cost-list.mjs ----
var M_cost_list = (function () {
  // lib/cost-list.mjs - a property whose tab is a plain list (Paul, 2026-09-30, on Cost Recapture: "i just
  // need a simple list that shows the expenses, who is owed and whether it was reimbursed if it was
  // paid for from a personal account"). Properties.template = "List". One row per cost line: the
  // store, what, which sold house it was for, the amount, who paid, whether they have been paid
  // back. Code, not judgment: it reads the Journal.

  const OWED = { "2030": "Paul", "2010": "Dennis" };
  const BANK = /^14\d\d$/;
  const isCost = (l) => /^1[0-3]\d\d$/.test(String(l.account)) || /^[5-9]\d\d\d$/.test(String(l.account));

  const COST_LIST_HEADER = ["Date", "Store", "What", "For", "Amount", "Paid by", "Paid back"];

  /**
   * @param {Array<object>} journal loadJournal lines
   * @param {string} name the property ("Cost Recapture")
   * @returns {{rows: any[][], summary: string[]}} rows in COST_LIST_HEADER order, newest first
   */
  function costListRows(journal, name) {
    const voided = new Set(journal.map((l) => l.void_of).filter(Boolean));
    const mine = journal.filter((l) => l.property === name && !l.void_of && l.source !== "void" && !voided.has(l.txn_id));
    const byTxn = new Map();
    for (const l of mine) (byTxn.get(l.txn_id) || byTxn.set(l.txn_id, []).get(l.txn_id)).push(l);

    const rows = [];
    const paidBack = { Paul: 0, Dennis: 0 };   // cents each person has been paid back, from entries with no cost line
    for (const lines of byTxn.values()) {
      const costs = lines.filter(isCost);
      const owed = lines.find((l) => OWED[String(l.account)]);
      const who = owed ? OWED[String(owed.account)] : lines.some((l) => BANK.test(String(l.account))) ? "Recast account" : "";
      if (!costs.length) {
        if (owed && owed.debit > owed.credit) paidBack[who] += owed.debit - owed.credit;
        continue;
      }
      for (const c of costs) {
        rows.push({ date: c.date, store: c.payee, what: c.description, trade: c.trade, cents: c.debit - c.credit, who });
      }
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));

    // paid back in date order: the oldest of a person's costs are covered first
    const left = { ...paidBack };
    const out = rows.map((r) => {
      let back = "";
      if (r.who === "Paul" || r.who === "Dennis") {
        if (r.cents <= 0) back = "";
        else if (left[r.who] >= r.cents) { back = "Yes"; left[r.who] -= r.cents; }
        else if (left[r.who] > 0) { back = `Part (${(left[r.who] / 100).toFixed(2)})`; left[r.who] = 0; }
        else back = "No";
      }
      return [r.date, r.store, r.what, r.trade, r.cents / 100, r.who, back];
    }).reverse();   // paid back is worked out oldest first; the tab shows the newest on top (Paul, 2026-09-30)

    const owedTo = (who) => rows.filter((r) => r.who === who).reduce((s, r) => s + r.cents, 0) - paidBack[who];
    const money = (c) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const summary = [
      `Paul is owed ${money(owedTo("Paul"))}` + (paidBack.Paul ? ` (paid back so far ${money(paidBack.Paul)})` : ""),
      `Dennis is owed ${money(owedTo("Dennis"))}` + (paidBack.Dennis ? ` (paid back so far ${money(paidBack.Dennis)})` : ""),
      `Paid from the Recast account: ${money(rows.filter((r) => r.who === "Recast account").reduce((s, r) => s + r.cents, 0))}`,
    ];
    return { rows: out, summary };
  }

  return { COST_LIST_HEADER, costListRows };
})();
var COST_LIST_HEADER = M_cost_list.COST_LIST_HEADER;
var costListRows = M_cost_list.costListRows;

// ---- lib/tax.mjs ----
var M_tax = (function () {
  // lib/tax.mjs - the Taxes tab (Paul, 2026-10-02: "add a tab to the recast books that shows me my tax
  // exposure for both IRS and Oregon State"). An ESTIMATE of what Paul may owe on the year's profit, worked
  // from the books and the year's published tables - code does the arithmetic, the accountant has the final
  // say. It assumes what the books assume (D-006, D-015, chart-of-accounts "Tax-bucket review"): Recast is
  // Paul's alone and reported on his own return, houses are bought to resell (so the profit also carries the
  // Social Security and Medicare tax), Dennis is a lender, Paul is an Oregon resident and Texas taxes no income.
  // The accountant's open questions (open-questions.md Q-1, Q-3, Q-4) change the answer, not this code's shape.


  // Dollars. 2026: IRS Rev. Proc. 2025-32 (rate tables 1 and 3, standard deduction, section 4.26 - the income
  // range over which the 20% business deduction fades out for a business with no payroll), SSA (wage base);
  // Oregon Publication OR-ESTIMATE 2026 (charts S and J, standard deduction, federal tax subtraction - which
  // fades out in five equal steps of income above `from`).
  // ponytail: one table per year, typed in by hand each fall when the IRS and Oregon publish them - a year
  // with no table shows "tell Claude" instead of a guess.
  const TAX_TABLES = {
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
  const CARRIED_OVER = {
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
  function taxEstimate({ year, status, profit_cents, other_cents = 0, carried = {} }) {
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
  function taxFacts(lines, asOf) {
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
  const TAX_INPUTS = {
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
  function taxTab(facts, houses, typed = {}) {
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
      add("", `Less home office costs carried over from ${last}`, -carried.home_office * 100, `taken off Recast's profit this year - they waited because Recast made no profit in ${last}`);
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

  return { TAX_TABLES, CARRIED_OVER, taxEstimate, taxFacts, TAX_INPUTS, taxTab };
})();
var TAX_TABLES = M_tax.TAX_TABLES;
var CARRIED_OVER = M_tax.CARRIED_OVER;
var taxEstimate = M_tax.taxEstimate;
var taxFacts = M_tax.taxFacts;
var TAX_INPUTS = M_tax.TAX_INPUTS;
var taxTab = M_tax.taxTab;
