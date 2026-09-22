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
    const named = new Set([model?.duplicate_of, model?.supersedes].filter(Boolean));
    for (const posted of postedEntries) {
      if (named.has(posted.txn_id)) continue;
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
   * @param {{postedEntries?: Array<{txn_id:string, date:string, payee:string, total_cents:number}>}} [opts]
   *   `postedEntries` is the posted-Journal view the twin rail (condition 9) checks
   *   against - already-posted entries only, shaped as the fields the twin check needs.
   * @returns {{passed:boolean, reasons:string[]}}
   */
  function evaluateGate(model, ctx, settings, { postedEntries = [] } = {}) {
    const reasons = [];
    const push = (reason) => {
      if (!reasons.includes(reason)) reasons.push(reason);
    };

    // 1. verdict + confidence
    if (model?.verdict !== "post") push("NOT_POST_VERDICT");
    if (model?.confidence !== "high") push("LOW_CONFIDENCE");

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

    // 3. items sum to the receipt total across every entry (±0.5% when subtotal_cents
    // and tax_cents are both given - rounding on a reconciled receipt; exact otherwise).
    const itemsTotal = entries.reduce((t, entry) => t + entryTotalCents(entry), 0);
    const tolerant = model?.subtotal_cents != null && model?.tax_cents != null;
    const tolerance = tolerant && Number.isFinite(receiptTotal) ? Math.round(Math.abs(receiptTotal) * 0.005) : 0;
    if (Number.isFinite(receiptTotal) && Math.abs(itemsTotal - receiptTotal) > tolerance) {
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

    // A post verdict with nothing to post is its own, clearer failure than TOTAL_MISMATCH.
    if (model?.verdict === "post" && (!Array.isArray(entries) || entries.length === 0 || entries.every((e) => !itemsOf(e).length))) {
      push("NO_ENTRIES");
    }

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

    return { passed: reasons.length === 0, reasons };
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

  return { findDuplicate, evaluateGate, buildEntriesFromModel };
})();
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

  return { loadJournal, trialBalance, balanceSheet, profitAndLoss, propertyJobCost, propertyBalanceSheet, dennisLedger };
})();
var loadJournal = M_reports.loadJournal;
var trialBalance = M_reports.trialBalance;
var balanceSheet = M_reports.balanceSheet;
var profitAndLoss = M_reports.profitAndLoss;
var propertyJobCost = M_reports.propertyJobCost;
var propertyBalanceSheet = M_reports.propertyBalanceSheet;
var dennisLedger = M_reports.dennisLedger;

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
    const add = (account, cents) => byAccount.set(account, (byAccount.get(account) || 0) + cents);

    const revenue_cents = atShare(settlement.sale_price_cents, share);
    let cost_cents = 0, credit_cents = 0, holdback_cents = 0, to_recast_cents = 0, to_recast_full_cents = 0;

    for (const line of settlement.lines || []) {
      const cents = Number(line.cents) || 0;
      if (cents < 0) throw new RangeError(`sale: statement line "${line.label}" is negative; use the right kind instead`);
      if (line.kind === "cost") {
        const c = atShare(cents, share);
        cost_cents += c; add(line.account, c);
      } else if (line.kind === "credit") {
        const c = atShare(cents, share);
        credit_cents += c; add(line.account, -c);
      } else if (line.kind === "holdback") {
        const c = atShare(cents, share);
        holdback_cents += c; add(HOLDBACK, c);
      } else if (line.kind === "to_recast") {
        // D-037: Recast banks the whole line, but only the co-owner's share is new money -
        // Recast's own share of it was already deducted from its half of net-to-seller.
        const c = cents - atShare(cents, share);
        to_recast_full_cents += cents;
        to_recast_cents += c; add(line.account, -c);
      } else {
        throw new RangeError(`sale: statement line "${line.label}" has unknown kind "${line.kind}"`);
      }
    }

    // The wire is the truth: cash = Recast's share of net-to-seller + every line paid to
    // Recast, in full. Rounding each line at the share can differ from that by a few cents;
    // those cents land on closing costs so the entry balances and the check names them.
    // `cash_to_recast_cents` is the figure actually received when Paul has it to hand.
    const cash_cents = Number.isFinite(settlement.cash_to_recast_cents)
      ? Math.round(settlement.cash_to_recast_cents)
      : atShare(settlement.net_to_seller_cents, share) + to_recast_full_cents;
    const derived = revenue_cents + credit_cents + to_recast_cents - cost_cents - holdback_cents;
    const rounding_cents = cash_cents - derived;
    const allowed = Math.max(5, (settlement.lines || []).length);
    if (Math.abs(rounding_cents) > allowed) {
      throw new RangeError(
        `sale: the statement does not tie — Recast's share of the lines gives ${derived} cents of cash but ` +
        `net-to-seller gives ${cash_cents}; difference ${rounding_cents} cents is more than rounding (${allowed})`,
      );
    }
    if (rounding_cents) add(ROUNDING_ACCOUNT, -rounding_cents);

    add(CASH, cash_cents);
    add(REVENUE, -revenue_cents);
    return {
      cash_cents, revenue_cents, cost_cents, credit_cents, holdback_cents, to_recast_cents,
      to_recast_full_cents, rounding_cents, byAccount,
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
    const saleLines = [...st.byAccount].map(([account, cents]) => line(account, cents, { property: property.name }));
    const intents = [{
      type: "journal", date, source: "sale", posted_by: postedBy,
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
        type: "journal", date, source: "sale", posted_by: postedBy,
        memo: `${memoBase}: interest accrued to repayment (${detail.length} advance${detail.length === 1 ? "" : "s"})`,
        lines: [line(INTEREST_COST, accrueNow, { property: property.name }), line(INTEREST_ACCRUED, -accrueNow, { property: property.name })],
      });
    }
    const trueUp = agreedInterest - engineInterest;
    if (trueUp !== 0) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy,
        memo: `${memoBase}: interest true-up to Dennis's agreed figure (D-015)`,
        lines: [line(INTEREST_COST, trueUp, { property: property.name }), line(INTEREST_ACCRUED, -trueUp, { property: property.name })],
      });
    }

    // ---- 3. the bank deal's commission is a cost, so it lands before profit (D-030/D-036) --
    const commission = deal === "bank"
      ? atShare(Math.round(settlement.sale_price_cents * (Number(property.dennis_commission_pct ?? 0) / 100)), share)
      : 0;
    if (commission) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy,
        memo: `${memoBase}: Dennis's ${property.dennis_commission_pct}% commission on the sale price (bank deal)`,
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
        type: "journal", date, source: "sale", posted_by: postedBy,
        memo: `${memoBase}: Dennis's ${dennisPct}% of net profit`,
        lines: [line(DENNIS_SHARE, dennis_share_cents, { property: property.name }), line(DENNIS_NOTE, -dennis_share_cents, { property: property.name })],
      });
      cost.set(DENNIS_SHARE, (cost.get(DENNIS_SHARE) || 0) + dennis_share_cents);
    }

    // ---- 5. release every project cost to COGS ------------------------------------------
    const released_cents = [...cost.values()].reduce((t, c) => t + c, 0);
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy,
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
        type: "journal", date, source: "sale", posted_by: postedBy,
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
        type: "journal", date, source: "sale", posted_by: postedBy,
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
  function buildHoldbackRelease({ property, date, amount_cents, dennis_cents, paul_cents, postedBy = "" }) {
    const name = property.name;
    const intents = [{
      type: "journal", date, source: "sale", posted_by: postedBy,
      memo: `${name} escrow holdback released ${date}`,
      lines: [line(CASH, amount_cents, { property: name }), line(HOLDBACK, -amount_cents, { property: name })],
    }];
    if (dennis_cents) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy,
        memo: `${name} holdback: Dennis's share`,
        lines: [line(DENNIS_NOTE, dennis_cents, { property: name, payee: "Dennis Little" }), line(CASH, -dennis_cents, { property: name, payee: "Dennis Little" })],
      });
    }
    if (paul_cents) {
      intents.push({
        type: "journal", date, source: "sale", posted_by: postedBy,
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

  return { isProjectCostAccount, splitStatement, interestByAdvance, buildSalePlan, buildHoldbackRelease };
})();
var isProjectCostAccount = M_sale.isProjectCostAccount;
var splitStatement = M_sale.splitStatement;
var interestByAdvance = M_sale.interestByAdvance;
var buildSalePlan = M_sale.buildSalePlan;
var buildHoldbackRelease = M_sale.buildHoldbackRelease;
