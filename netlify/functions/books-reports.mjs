// netlify/functions/books-reports.mjs — path /api/reports — phase1-spec.md section 4
//   GET /api/reports?report=tb|bs|pl|jobcost|propbs|dennis&asOf=&from=&to=&property=
//     -> the matching lib/reports.mjs output plus generated_at
//
// Read-only for every signed-in role (partner/accountant included - phase0-spec.md
// §5's role matrix only restricts writes, and a report is never a write).

import {
  requireConfig,
  json,
  getWriter,
  getJournalAll,
  readTab,
  getSessionPayload,
  authErrorResponse,
  rowsToObjectsPublic,
  WriterError,
} from "./_shared.mjs";
import {
  loadJournal,
  trialBalance,
  balanceSheet,
  profitAndLoss,
  propertyJobCost,
  propertyBalanceSheet,
  dennisLedger,
} from "../../lib/reports.mjs";
import { toCents } from "../../lib/money.mjs";

const REPORTS = new Set(["tb", "bs", "pl", "jobcost", "propbs", "dennis"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CONFLICT_CODES = new Set(["DUPLICATE", "PERIOD_CLOSED", "ALREADY_VOIDED"]);
const NOT_FOUND_CODES = new Set(["NOT_FOUND"]);

function writerErrorResponse(err) {
  if (err instanceof WriterError) {
    const status = CONFLICT_CODES.has(err.code) ? 409 : NOT_FOUND_CODES.has(err.code) ? 404 : 502;
    return json(status, { error: err.code, message: err.message });
  }
  return json(502, { error: "WRITER_ERROR", message: String((err && err.message) || err) });
}

function badDate(name, value) {
  return json(400, { error: "BAD_REQUEST", message: `${name} must be an ISO date (YYYY-MM-DD), got "${value}"` });
}

/** Advances tab -> lib/accrual.mjs's `advance` shape, same conversion as books-dennis.mjs. */
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

export default async (req) => {
  const configErr = requireConfig(["WRITER_URL", "WRITER_SECRET", "SESSION_SECRET"]);
  if (configErr) return configErr;

  if (req.method !== "GET") {
    return json(405, { error: "METHOD_NOT_ALLOWED" });
  }

  try {
    getSessionPayload(req);
  } catch (err) {
    const resp = authErrorResponse(err);
    if (resp) return resp;
    throw err;
  }

  const url = new URL(req.url);
  const report = url.searchParams.get("report");
  const asOf = url.searchParams.get("asOf") || undefined;
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const property = url.searchParams.get("property") || undefined;

  if (!report || !REPORTS.has(report)) {
    return json(400, { error: "BAD_REQUEST", message: `report must be one of: ${[...REPORTS].join(", ")}` });
  }
  if (asOf !== undefined && !ISO_DATE.test(asOf)) return badDate("asOf", asOf);
  if (from !== undefined && !ISO_DATE.test(from)) return badDate("from", from);
  if (to !== undefined && !ISO_DATE.test(to)) return badDate("to", to);
  if ((report === "jobcost" || report === "propbs") && !property) {
    return json(400, { error: "BAD_REQUEST", message: `report=${report} requires property` });
  }

  const writer = getWriter();

  let journal;
  try {
    journal = await getJournalAll(writer);
  } catch (err) {
    return writerErrorResponse(err);
  }
  const lines = loadJournal(journal.headers, journal.rows);

  let result;
  try {
    switch (report) {
      case "tb":
        result = trialBalance(lines, { asOf });
        break;
      case "bs":
        result = balanceSheet(lines, { asOf });
        break;
      case "pl":
        result = profitAndLoss(lines, { from, to });
        break;
      case "jobcost":
        result = propertyJobCost(lines, property, { asOf });
        break;
      case "propbs":
        result = propertyBalanceSheet(lines, property, { asOf });
        break;
      case "dennis": {
        let advances, accrualOpts;
        try {
          advances = await loadAdvances(writer);
          accrualOpts = await getAccrualOpts(writer);
        } catch (err) {
          return writerErrorResponse(err);
        }
        result = dennisLedger(lines, advances, { asOf }, accrualOpts);
        break;
      }
    }
  } catch (err) {
    // lib/reports.mjs has no spec'd error-code contract (it is pure functions over
    // already-validated input) - an unknown property or similar bad param surfaces as
    // a generic 500 rather than a code this function invents on its own.
    return json(500, { error: "REPORT_ERROR", message: String((err && err.message) || err) });
  }

  return json(200, { report, ...result, generated_at: new Date().toISOString() });
};

export const config = { path: "/api/reports" };
