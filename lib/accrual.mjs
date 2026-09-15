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
export function addMonthsClamped(isoDate, months) {
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
export function daysBetween(isoA, isoB) {
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
export function lastDayOf(period) {
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
export function accruedThrough(advance, asOf, { rateAnnual = DEFAULT_RATE_ANNUAL, stubBasis = DEFAULT_STUB_BASIS } = {}) {
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
export function interestForPeriod(advance, period, opts) {
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
export function payoffAt(advances, property, asOf, opts) {
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
export function schedule(advance, asOf, { rateAnnual = DEFAULT_RATE_ANNUAL, stubBasis = DEFAULT_STUB_BASIS } = {}) {
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
