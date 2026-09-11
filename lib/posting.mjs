// lib/posting.mjs — the posting engine, phase0-spec.md §3, §3.1, §3.2, §9
//
// Claude states an intent; this module turns it into a balanced, validated journal
// entry (or refuses with a PostingError carrying one of the §3 codes). Code owns
// arithmetic, identity and the gates — never judgment.

import { createHash, randomBytes } from "node:crypto";
import { accountMap, seriesOf } from "./coa.mjs";
import { sumCents } from "./money.mjs";

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

export class PostingError extends Error {
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
export function makeCtx({ accounts, properties = new Set(), periods = new Map(), today } = {}) {
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
export function periodOf(isoDate) {
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
export function makeTxnId(source, date, firstDebitLine, { allow_duplicate_hash = false } = {}) {
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
export function validateEntry(entry, ctx) {
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
    return { creditAccount: "2030", creditDescription: "Paid by Paul" };
  }

  if (paid_from === "DENNIS") {
    // §3.1: "a direct-paid cost is an advance" — D-010 ties every advance to one property.
    if (!property) {
      throw new PostingError("PROPERTY_REQUIRED", {
        message: "paid_from DENNIS requires a property (a direct-paid cost is an advance)",
      });
    }
    return { creditAccount: "2010", creditDescription: "Paid by Dennis" };
  }

  const bankAccount = ctx.accounts.get(paid_from);
  if (!bankAccount || seriesOf(paid_from) !== "1400") {
    throw new PostingError("BAD_ACCOUNT", {
      message: `paid_from must be a 1400-series bank account, "PAUL", or "DENNIS" — got "${paid_from}"`,
    });
  }
  return { creditAccount: paid_from, creditDescription: `Paid from ${bankAccount.name}` };
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
  const { creditAccount, creditDescription } = resolvePaidFrom(paid_from, property, ctx);

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
      description: creditDescription,
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

  const description = "Dennis advance";
  const debitLine = fillLineDefaults({ account: into, debit: amount_cents, credit: 0, property, description }, ctx);
  const creditLine = fillLineDefaults({ account: "2010", debit: 0, credit: amount_cents, property, description }, ctx);

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
 * §3.1: turn an intent into a validated, balanced entry.
 * @param {{type: "journal"|"expense"|"advance", [key: string]: any}} intent
 * @param {{accounts:Map, properties:Set, periods:Map, today:string}} ctx
 * @returns {object} entry
 */
export function buildEntry(intent, ctx) {
  switch (intent?.type) {
    case "journal":
      return buildJournal(intent, ctx);
    case "expense":
      return buildExpense(intent, ctx);
    case "advance":
      return buildAdvance(intent, ctx);
    default:
      // Not a §3 code (no intent-shape error is listed there) — a caller/programmer
      // error, not a bookkeeping rule, so it's kept distinct rather than overloaded
      // onto an existing code.
      throw new PostingError("BAD_INTENT", { message: `unknown intent type "${intent?.type}"` });
  }
}
