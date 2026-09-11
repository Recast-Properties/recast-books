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
export function toCents(input) {
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
export function fromCents(cents) {
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
export function sumCents(centsArray) {
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
