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

import { PostingError, buildEntry } from "./posting.mjs";

// sec 274(d) substantiation categories - never autofile-eligible (docs/policies.md,
// ledger-schema.md "On columns 19-22").
const HUMAN_REQUIRED_ACCOUNTS = new Set(["6700", "6710", "6720"]);

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
function purchaseIntentFromEntry(entry, { posted_by = "", doc_url = "", allow_duplicate_hash = false } = {}) {
  return {
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
  const account = ctx.accounts.get(paid_from);
  return !!account && account.series === "1400";
}

/**
 * Whether `property` is a value `buildEntry` will accept - phase2-spec.md §4
 * condition 6 (`OVERHEAD`, or a property in the registry `ctx.properties` allowlist,
 * which the caller builds from properties with status held/under contract per the
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
export function evaluateGate(model, ctx, settings, { postedEntries = [] } = {}) {
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

  // 6/7. property + paid_from, per entry - pre-checked here (for the clean reason
  // code) before condition 8 attempts to actually build the entry.
  const structurallyValid = [];
  for (const entry of entries) {
    const propOk = propertyIsValid(entry?.property, ctx);
    if (!propOk) push("BAD_PROPERTY");
    const paidOk = paidFromResolves(entry?.paid_from, entry?.property, ctx);
    if (!paidOk) push("BAD_PAID_FROM");
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

  // 9. twin rail: a posted Journal entry with the same payee, date and total that the
  // model did not name as the document it duplicates or supersedes -> hold, never a
  // silent double-post and never a silent drop.
  const named = new Set([model?.duplicate_of, model?.supersedes].filter(Boolean));
  for (const entry of entries) {
    const total = entryTotalCents(entry);
    const payee = typeof entry?.payee === "string" ? entry.payee.trim().toLowerCase() : "";
    for (const posted of postedEntries) {
      if (named.has(posted.txn_id)) continue;
      const postedPayee = typeof posted.payee === "string" ? posted.payee.trim().toLowerCase() : "";
      if (postedPayee === payee && posted.date === entry?.date && posted.total_cents === total) {
        push(`POSSIBLE_TWIN:${posted.txn_id}`);
      }
    }
  }

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
export function buildEntriesFromModel(model, ctx, { posted_by = "", doc_url = "", allow_duplicate_hash = false } = {}) {
  return entriesOf(model).map((entry) =>
    buildEntry(purchaseIntentFromEntry(entry, { posted_by, doc_url, allow_duplicate_hash }), ctx),
  );
}
