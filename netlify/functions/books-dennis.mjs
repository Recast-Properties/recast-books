// netlify/functions/books-dennis.mjs — path /api/dennis — phase1-spec.md section 4
//   GET  /api/dennis?asOf=YYYY-MM-DD                                  -> dennisLedger output + raw advances
//   POST /api/dennis {action:"addAdvance", date, amount_cents, property, into?, memo?}     (owner)
//   POST /api/dennis {action:"previewInterest", period}                                    (any signed-in role)
//   POST /api/dennis {action:"postInterest", period}                                        (owner)
//
// Advances are readable by every role (partner/accountant get Dennis's read-only
// view per phase0-spec.md §5's role matrix); only addAdvance/postInterest write, so
// those two are owner-only. previewInterest computes nothing to the workbook and is
// read-only in effect, so it is left open to every signed-in role like the GET.

import {
  requireConfig,
  json,
  getWriter,
  getPostingCtx,
  getJournalAll,
  invalidateJournalCache,
  readTab,
  refreshTabAfterWrite,
  getSessionPayload,
  requireRole,
  authErrorResponse,
  todayChicago,
  rowsToObjectsPublic,
  WriterError,
} from "./_shared.mjs";
import { buildEntry, validateEntry, makeTxnId, PostingError } from "../../lib/posting.mjs";
import { toCents, fromCents } from "../../lib/money.mjs";
import { interestForPeriod, lastDayOf } from "../../lib/accrual.mjs";
import { loadJournal, dennisLedger } from "../../lib/reports.mjs";

const CONFLICT_CODES = new Set(["DUPLICATE", "PERIOD_CLOSED", "ALREADY_VOIDED"]);
const NOT_FOUND_CODES = new Set(["NOT_FOUND"]);

function writerErrorResponse(err) {
  if (err instanceof WriterError) {
    const status = CONFLICT_CODES.has(err.code) ? 409 : NOT_FOUND_CODES.has(err.code) ? 404 : 502;
    return json(status, { error: err.code, message: err.message });
  }
  return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
}

function postingErrorResponse(err) {
  if (err instanceof PostingError) {
    return json(422, { error: err.code, message: err.message, details: err.details });
  }
  return null;
}

/** Advances tab rows -> accrual.mjs's `advance` shape (amount converted dollars -> cents). */
async function loadAdvances(writer) {
  const resp = await readTab(writer, "Advances");
  const rows = rowsToObjectsPublic(resp.headers, resp.rows);
  return rows.map((r) => ({
    advance_id: r.advance_id,
    date: r.date,
    amount_cents: toCents(r.amount ?? 0),
    property: r.property,
    source_txn_id: r.source_txn_id || "",
    status: r.status || "open",
    accrued_to: r.accrued_to || "",
    repaid_date: r.repaid_date || "",
    notes: r.notes || "",
  }));
}

/** Settings interest_rate_annual / stub_days_basis, falling back to 0.08 / 30 (D-016). */
async function getAccrualOpts(writer) {
  const resp = await readTab(writer, "Settings");
  const rows = rowsToObjectsPublic(resp.headers, resp.rows);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const rateAnnual = Number(byKey.get("interest_rate_annual"));
  const stubBasis = Number(byKey.get("stub_days_basis"));
  return {
    rateAnnual: Number.isFinite(rateAnnual) && rateAnnual > 0 ? rateAnnual : 0.08,
    stubBasis: Number.isFinite(stubBasis) && stubBasis > 0 ? stubBasis : 30,
  };
}

/**
 * The interest-posting job's entry for one advance/period: Dr 1200, Cr 2000, property
 * on both lines, payee "Dennis Little" (phase1-spec.md §4). Not validated here -
 * callers run it through validateEntry (postInterest) or leave it as a preview
 * (previewInterest).
 */
function buildInterestEntry(advance, period, deltaCents, ctx, postedBy) {
  // Interest for a period is booked on that period's last day (the accrual runs through it).
  const date = lastDayOf(period);
  const description = `Interest ${period} on ${advance.advance_id}`;

  const line = (account, isDebit) => {
    const acct = ctx.accounts.get(account);
    return {
      account,
      debit: isDebit ? deltaCents : 0,
      credit: isDebit ? 0 : deltaCents,
      property: advance.property,
      cost_class: acct?.cost_class ?? "",
      tax_treatment: acct?.tax_treatment ?? "",
      trade: "",
      payee: "Dennis Little",
      description,
      paid_from: "",
      reconciled_ref: "",
      business_purpose: "",
      attendee: "",
      destination: "",
      odometer: "",
    };
  };

  // phase1-spec.md §4: txn_id = "close-<period without dash>01-<hash(advance_id|period)>".
  // makeTxnId's own hash is over payee|debit|description|paid_from|property of a line
  // (posting.mjs §3.2) - there is no exported way to hash exactly "advance_id|period"
  // through it, so this calls it with a line built to depend on nothing but those two
  // values (payee=advance_id, description=period, the rest empty). See the "spec
  // ambiguities" note in this task's report.
  const txn_id = makeTxnId("close", date, { payee: advance.advance_id, description: period });

  return {
    txn_id,
    date,
    period,
    memo: description,
    source: "close",
    posted_by: postedBy,
    doc_url: "",
    void_of: "",
    lines: [line("1200", true), line("2000", false)],
  };
}

/** Advances open (not repaid) and not yet accrued through this period. */
function advancesDueFor(advances, period) {
  return advances.filter((a) => a.status === "open" && !a.repaid_date && !(a.accrued_to && a.accrued_to >= period));
}

export default async (req) => {
  const configErr = requireConfig(["WRITER_URL", "WRITER_SECRET", "SESSION_SECRET"]);
  if (configErr) return configErr;

  let session;
  try {
    session = getSessionPayload(req);
  } catch (err) {
    const resp = authErrorResponse(err);
    if (resp) return resp;
    throw err;
  }

  const writer = getWriter();

  if (req.method === "GET") {
    const url = new URL(req.url);
    const asOf = url.searchParams.get("asOf") || todayChicago();

    let advances, accrualOpts, journal;
    try {
      advances = await loadAdvances(writer);
      accrualOpts = await getAccrualOpts(writer);
      journal = await getJournalAll(writer);
    } catch (err) {
      return writerErrorResponse(err);
    }

    const lines = loadJournal(journal.headers, journal.rows);
    const ledger = dennisLedger(lines, advances, { asOf }, accrualOpts);
    return json(200, { ...ledger, advances });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "BAD_REQUEST", message: "expected a JSON body" });
    }

    if (body.action === "addAdvance") {
      try {
        requireRole(session, ["owner"]);
      } catch (err) {
        const resp = authErrorResponse(err);
        if (resp) return resp;
        throw err;
      }

      const { date, amount_cents, property, memo, kind = "cash" } = body;
      if (!["purchase", "cash"].includes(kind)) {
        return json(400, { error: "BAD_REQUEST", message: 'kind must be "purchase" or "cash"' });
      }
      // Purchase principal never lands in an account: Dennis pays the auction directly,
      // so the advance IS the purchase - Dr 1000 Purchase price, Cr 2010 (Paul,
      // 2026-09-15). A cash advance lands in a bank account (Dr 14xx, Cr 2010).
      const into = kind === "purchase" ? "1000" : body.into || "1401";
      const description = kind === "purchase" ? "Purchase price (Dennis purchase principal)" : "Dennis advance";
      if (!date || !Number.isFinite(amount_cents) || !property) {
        return json(400, { error: "BAD_REQUEST", message: "date, amount_cents and property are required" });
      }

      let ctx;
      try {
        ctx = await getPostingCtx(writer);
      } catch (err) {
        return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
      }

      let entry;
      try {
        entry = buildEntry(
          { type: "advance", date, amount_cents, property, into, description, memo, source: "manual", posted_by: session.email },
          ctx,
        );
      } catch (err) {
        const resp = postingErrorResponse(err);
        if (resp) return resp;
        throw err;
      }

      let postResult;
      try {
        postResult = await writer.post(entry);
        await invalidateJournalCache(writer);
      } catch (err) {
        return writerErrorResponse(err);
      }

      const advanceRow = {
        advance_id: `adv-${entry.txn_id}`,
        date,
        amount: fromCents(amount_cents),
        property,
        source_txn_id: entry.txn_id,
        status: "open",
        accrued_to: "",
        repaid_date: "",
        notes: memo || "",
        kind,
      };
      try {
        await writer.upsert("Advances", "advance_id", advanceRow);
        await refreshTabAfterWrite(writer, "Advances");
      } catch (err) {
        return writerErrorResponse(err);
      }

      // The property tab sizes its advance block to the Advances rows (phase2.6-spec.md
      // section 5); rebuild it so the new advance has a row. Best effort: the advance is
      // already on the books, so a slow writer here must not fail the request.
      let tab_rebuilt = true;
      try {
        await writer.propertyTab(property);
      } catch {
        tab_rebuilt = false;
      }

      return json(200, { advance: advanceRow, entry, rows: postResult.rows, tab_rebuilt });
    }

    if (body.action === "previewInterest") {
      const { period } = body;
      if (!period || !/^\d{4}-\d{2}$/.test(period)) {
        return json(400, { error: "BAD_REQUEST", message: "period (YYYY-MM) is required" });
      }

      let ctx, advances, accrualOpts;
      try {
        ctx = await getPostingCtx(writer);
        advances = await loadAdvances(writer);
        accrualOpts = await getAccrualOpts(writer);
      } catch (err) {
        return writerErrorResponse(err);
      }

      const previews = [];
      for (const advance of advancesDueFor(advances, period)) {
        const deltaCents = interestForPeriod(advance, period, accrualOpts);
        if (deltaCents === 0) continue;
        const entry = buildInterestEntry(advance, period, deltaCents, ctx, session.email);
        previews.push({ advance_id: advance.advance_id, property: advance.property, delta_cents: deltaCents, entry });
      }

      return json(200, { period, previews });
    }

    if (body.action === "postInterest") {
      try {
        requireRole(session, ["owner"]);
      } catch (err) {
        const resp = authErrorResponse(err);
        if (resp) return resp;
        throw err;
      }

      const { period } = body;
      if (!period || !/^\d{4}-\d{2}$/.test(period)) {
        return json(400, { error: "BAD_REQUEST", message: "period (YYYY-MM) is required" });
      }
      // Interest is booked on the period's last day, so a period can only be posted once
      // it has ended. Preview works any time.
      if (lastDayOf(period) > todayChicago()) {
        return json(422, { error: "PERIOD_NOT_ENDED", message: `period ${period} has not ended yet; preview is available, posting is not` });
      }

      let ctx, advances, accrualOpts;
      try {
        ctx = await getPostingCtx(writer);
        advances = await loadAdvances(writer);
        accrualOpts = await getAccrualOpts(writer);
      } catch (err) {
        return writerErrorResponse(err);
      }

      const toPost = [];
      for (const advance of advancesDueFor(advances, period)) {
        const deltaCents = interestForPeriod(advance, period, accrualOpts);
        if (deltaCents === 0) continue;
        const entry = buildInterestEntry(advance, period, deltaCents, ctx, session.email);
        try {
          // Refuses PERIOD_CLOSED here (validateEntry checks ctx.periods) before the
          // writer is ever called - same code path posting/expenses use.
          validateEntry(entry, ctx);
        } catch (err) {
          const resp = postingErrorResponse(err);
          if (resp) return resp;
          throw err;
        }
        toPost.push({ advance, entry });
      }

      if (toPost.length === 0) {
        return json(200, { period, posted: [] });
      }

      let batchResult;
      try {
        batchResult = await writer.postBatch(toPost.map((t) => t.entry));
        await invalidateJournalCache(writer);
      } catch (err) {
        return writerErrorResponse(err);
      }

      // Per phase1-spec.md §4: on success, upsert each advance's accrued_to = period.
      // postBatch already posted all-or-nothing, so every advance here did post.
      for (const { advance } of toPost) {
        try {
          await writer.upsert("Advances", "advance_id", { advance_id: advance.advance_id, accrued_to: period });
        } catch (err) {
          return writerErrorResponse(err);
        }
      }
      await refreshTabAfterWrite(writer, "Advances");

      return json(200, { period, posted: batchResult.posted, rows: batchResult.rows });
    }

    return json(400, { error: "BAD_REQUEST", message: "action must be addAdvance, previewInterest or postInterest" });
  }

  return json(405, { error: "METHOD_NOT_ALLOWED" });
};

export const config = { path: "/api/dennis" };
