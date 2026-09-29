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
export const NEED_RECEIPT = "NEED RECEIPT FROM";
const PLACEHOLDER_DAYS = 7;   // the bank posts a card charge a day or two after the receipt's date
export const isPlaceholder = (posted) => String(posted?.text || "").includes(NEED_RECEIPT);

/**
 * The live placeholder this document touches: the one the read names (in `supersedes`, or in
 * `duplicate_of` - a read that calls the receipt "already recorded"), else one for the same amount
 * within PLACEHOLDER_DAYS of the document's date. The payee is not compared - the
 * placeholder carries the bank's name for the store ("THE HOME DEPOT #6505 W"), not the receipt's.
 */
export function findPlaceholder(model, postedEntries = []) {
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
export function findDuplicate(model, postedEntries = []) {
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
 * @returns {{passed:boolean, reasons:string[], already_posted_cents:number, placeholder:object|null}}
 *   already_posted_cents is what the Journal holds for the read's already_posted_txn_ids (the card
 *   shows it beside the entries); placeholder is the waiting charge this document touches, if any
 */
export function evaluateGate(model, ctx, settings, { postedEntries = [], placeholders = true } = {}) {
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
  const placeholder = waiting
    ? { txn_id: waiting.txn_id, date: waiting.date, payee: waiting.payee, property: waiting.property, paid_from: waiting.paid_from, total_cents: waiting.total_cents }
    : null;

  return { passed: reasons.length === 0, reasons, already_posted_cents: alreadyPostedCents, placeholder };
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
  const invoice_number = typeof model?.invoice_number === "string" ? model.invoice_number.trim() : "";
  return entriesOf(model).map((entry) =>
    buildEntry(purchaseIntentFromEntry(entry, { posted_by, doc_url, allow_duplicate_hash, invoice_number }), ctx),
  );
}
