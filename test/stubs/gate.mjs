// test/stubs/gate.mjs — NOT imported by any production or test code in this repo.
//
// This task's brief: "do NOT create or edit lib/bookkeeper.mjs and lib/gate.mjs
// (another agent is writing them concurrently); if missing at test time, stub them
// ONLY under test/stubs/." Those two files did not exist on disk while this task's
// server plumbing (netlify/functions/books-*.mjs) was written, so this is a
// documented reference stand-in matching the exact contract this task was given to
// code against:
//
//   evaluateGate(model, ctx, settings, {postedEntries}) -> {passed, reasons}
//
// A developer working in a SCRATCH COPY of the repo (never this project's real
// lib/ directory - see test/books-dennis.test.mjs's header comment, which
// established this convention for lib/accrual.mjs and lib/reports.mjs during
// Phase 1) can copy this to lib/gate.mjs there to exercise
// netlify/functions/books-ingest-background.mjs and books-inbox.mjs before the real
// module lands. It implements a reasonable reading of docs/phase2-spec.md section 4
// well enough to unblock that kind of manual exercise - it is not a claim about
// what the real gate.mjs must do in every case, and none of this repo's real tests
// import it (see each *.test.mjs file's own try/catch-and-skip pattern instead).

const RESTRICTED_274D_ACCOUNTS = new Set(["6700", "6710", "6720"]);

export function evaluateGate(model, ctx, settings, { postedEntries = [] } = {}) {
  const reasons = [];
  const isSupersede = Boolean(model && model.supersedes);

  // Condition 1: verdict "post" + confidence "high" - waived for a valid supersede,
  // which "passes the gate like a post" per phase2-spec.md section 4.
  if (!isSupersede) {
    if (!model || model.verdict !== "post") reasons.push("NOT_POST_VERDICT");
    if (!model || model.confidence !== "high") reasons.push("NOT_HIGH_CONFIDENCE");
  }

  // Condition 2: vendor and date present, date valid and not in the future.
  if (!model || !model.vendor) reasons.push("MISSING_VENDOR");
  if (!model || !model.date) {
    reasons.push("MISSING_DATE");
  } else if (ctx && ctx.today && model.date > ctx.today) {
    reasons.push("DATE_IN_FUTURE");
  }

  // Condition 4: receipt_total_cents > 0 and <= ceiling.
  const ceiling = Number(settings && settings.autofile_ceiling_cents) || 0;
  if (!model || !(model.receipt_total_cents > 0)) {
    reasons.push("BAD_TOTAL");
  } else if (ceiling && model.receipt_total_cents > ceiling) {
    reasons.push("OVER_CEILING");
  }

  // Condition 3: every entry's items sum to the receipt total across entries.
  const entries = (model && model.entries) || [];
  const itemsTotal = entries.reduce(
    (sum, entry) => sum + (entry.items || []).reduce((s, item) => s + (Number(item.amount_cents) || 0), 0),
    0,
  );
  if (model && model.receipt_total_cents > 0 && itemsTotal !== model.receipt_total_cents) {
    reasons.push("ITEMS_DO_NOT_RECONCILE");
  }

  // Condition 5: no item posts to a Section 274(d) account.
  // Condition 6: every entry's property is OVERHEAD or a known property.
  const knownProperties = (ctx && ctx.properties) || new Set();
  for (const entry of entries) {
    if (entry.property !== "OVERHEAD" && !knownProperties.has(entry.property)) {
      reasons.push(`UNKNOWN_PROPERTY ${entry.property}`);
    }
    for (const item of entry.items || []) {
      if (RESTRICTED_274D_ACCOUNTS.has(item.account)) reasons.push(`RESTRICTED_ACCOUNT ${item.account}`);
    }
  }

  // Condition 7: paid_from resolves.
  if (!model || !model.paid_from) reasons.push("PAID_FROM_UNRESOLVED");

  // Condition 9: twin rail - a posted entry with the same payee/date/total that the
  // model did not already name as duplicate_of/supersedes.
  if (model && model.vendor && model.date && model.receipt_total_cents > 0) {
    const twin = postedEntries.find(
      (e) =>
        e.payee &&
        e.payee.toLowerCase() === model.vendor.toLowerCase() &&
        e.date === model.date &&
        e.total_cents === model.receipt_total_cents &&
        e.txn_id !== model.duplicate_of &&
        e.txn_id !== model.supersedes,
    );
    if (twin) reasons.push(`POSSIBLE_TWIN ${twin.txn_id}`);
  }

  return { passed: reasons.length === 0, reasons };
}
