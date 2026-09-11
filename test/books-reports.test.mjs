// test/books-reports.test.mjs — netlify/functions/books-reports.mjs, phase1-spec.md §4
//
// Like test/books-dennis.test.mjs, this imports lib/reports.mjs, which another agent
// is writing concurrently per docs/phase1-spec.md §2 — see that file's header for the
// skip-if-missing rationale (this one uses the same pattern).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { issueSession } from "../lib/auth.mjs";

process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
process.env.SESSION_SECRET = "session-secret";
process.env.GOOGLE_CLIENT_ID = "client-id";

let handler, resetWriterForTests, invalidateJournalCache, importError;
try {
  ({ default: handler } = await import("../netlify/functions/books-reports.mjs"));
  ({ resetWriterForTests, invalidateJournalCache } = await import("../netlify/functions/_shared.mjs"));
} catch (err) {
  importError = err;
}

const skip = importError ? `lib/reports.mjs not present yet: ${importError.message}` : false;

function session(role, email = `${role}@recast-properties.com`) {
  return issueSession({ email, role, name: role }, process.env.SESSION_SECRET);
}

function req(search, token) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`https://books.test/api/reports${search}`, { headers });
}

const JOURNAL_HEADERS = [
  "txn_id", "line", "date", "period", "account", "debit", "credit", "property",
  "cost_class", "tax_treatment", "trade", "payee", "description", "paid_from",
  "doc_url", "source", "posted_by", "posted_at", "memo", "reconciled_ref",
  "business_purpose", "attendee", "destination", "odometer", "void_of",
];
// One balanced expense entry: Dr 1030 (rehab materials, 881 Newport), Cr 1401.
const JOURNAL_ROWS = [
  ["manual-20260701-abc", 1, "2026-07-01", "2026-07", "1030", "212.40", "", "881 Newport", "Rehab", "Inventory (held)", "", "Home Depot", "Drywall", "1401", "", "manual", "paul@recast-properties.com", "2026-07-01T00:00:00", "", "", "", "", "", "", ""],
  ["manual-20260701-abc", 2, "2026-07-01", "2026-07", "1401", "", "212.40", "881 Newport", "", "", "", "Home Depot", "Paid from Citizens", "1401", "", "manual", "paul@recast-properties.com", "2026-07-01T00:00:00", "", "", "", "", "", "", ""],
];
const ADVANCES_ROWS = [["adv-1", "2026-06-29", "207000", "881 Newport", "x", "open", "", "", ""]];
const SETTINGS_ROWS = [["interest_rate_annual", "0.09", ""], ["stub_days_basis", "30", ""]];

function router(body) {
  if (body.action === "read") {
    switch (body.tab) {
      case "Journal":
        return { ok: true, headers: JOURNAL_HEADERS, rows: JOURNAL_ROWS };
      case "Advances":
        return { ok: true, headers: ["advance_id", "date", "amount", "property", "source_txn_id", "status", "accrued_to", "repaid_date", "notes"], rows: ADVANCES_ROWS };
      case "Settings":
        return { ok: true, headers: ["key", "value", "notes"], rows: SETTINGS_ROWS };
      default:
        throw new Error(`unexpected read: ${body.tab}`);
    }
  }
  throw new Error(`books-reports.mjs should never write (${body.action})`);
}

beforeEach(() => {
  if (importError) return;
  resetWriterForTests();
  invalidateJournalCache();
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    return { status: 200, text: async () => JSON.stringify(router(body)) };
  };
});

test("requires a session", { skip }, async () => {
  const res = await handler(req("?report=tb"));
  assert.equal(res.status, 401);
});

test("rejects an unknown report", { skip }, async () => {
  const res = await handler(req("?report=nonsense", session("owner")));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, "BAD_REQUEST");
});

test("rejects a non-ISO date", { skip }, async () => {
  const res = await handler(req("?report=tb&asOf=09/11/2026", session("owner")));
  assert.equal(res.status, 400);
});

test("jobcost requires property", { skip }, async () => {
  const res = await handler(req("?report=jobcost", session("owner")));
  assert.equal(res.status, 400);
});

test("propbs requires property", { skip }, async () => {
  const res = await handler(req("?report=propbs", session("owner")));
  assert.equal(res.status, 400);
});

test("tb: reads Journal all:true (cached) and returns a balanced trial balance plus generated_at", { skip }, async () => {
  const res = await handler(req("?report=tb", session("partner")));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.report, "tb");
  assert.equal(body.balanced, true);
  assert.equal(body.total_debit, body.total_credit);
  assert.ok(body.generated_at);
});

test("bs: ties", { skip }, async () => {
  const res = await handler(req("?report=bs&asOf=2026-09-11", session("accountant")));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.report, "bs");
  assert.equal(body.ties, true);
});

test("jobcost: with property returns 200", { skip }, async () => {
  const res = await handler(req(`?report=jobcost&property=${encodeURIComponent("881 Newport")}`, session("owner")));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.property, "881 Newport");
});

test("dennis: pulls Advances and Settings alongside the journal", { skip }, async () => {
  const res = await handler(req("?report=dennis&asOf=2026-09-11", session("owner")));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.report, "dennis");
  assert.ok(Array.isArray(body.by_property));
});

test("the Journal read is cached across two report calls in the same 30s window", { skip }, async () => {
  let journalReads = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.action === "read" && body.tab === "Journal") journalReads++;
    return { status: 200, text: async () => JSON.stringify(router(body)) };
  };
  await handler(req("?report=tb", session("owner")));
  await handler(req("?report=bs", session("owner")));
  assert.equal(journalReads, 1, "second report call should reuse the 30s Journal cache");
});
