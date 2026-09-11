// test/books-dennis.test.mjs — netlify/functions/books-dennis.mjs, phase1-spec.md §4
//
// books-dennis.mjs imports lib/accrual.mjs and lib/reports.mjs, which another agent
// is writing concurrently per docs/phase1-spec.md §1/§2 and may not exist on disk yet
// (this task's brief: "code against those exact exports, do not create or edit those
// two files"). If they are missing, every test below is skipped with a clear reason
// instead of failing the suite — `npm test` should report skips, not failures, until
// the other agent's files land, at which point these start running for real.
//
// See test/stubs/accrual.mjs and test/stubs/reports.mjs for the stand-ins used to
// exercise this file's logic during development (in a scratch copy of the repo, never
// this project's real lib/ directory).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { issueSession } from "../lib/auth.mjs";

process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
process.env.SESSION_SECRET = "session-secret";
process.env.GOOGLE_CLIENT_ID = "client-id";

let handler, resetWriterForTests, invalidateCtxCache, invalidateJournalCache, importError;
try {
  ({ default: handler } = await import("../netlify/functions/books-dennis.mjs"));
  ({ resetWriterForTests, invalidateCtxCache, invalidateJournalCache } = await import("../netlify/functions/_shared.mjs"));
} catch (err) {
  importError = err;
}

const skip = importError
  ? `lib/accrual.mjs and/or lib/reports.mjs not present yet: ${importError.message}`
  : false;

function session(role, email = `${role}@recast-properties.com`) {
  return issueSession({ email, role, name: role }, process.env.SESSION_SECRET);
}

function req(method, { body, token, search = "" } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`https://books.test/api/dennis${search}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

const ACCOUNTS_ROWS = [
  ["1200", "Financing - interest (Dennis)", "1000", "asset", "Financing", "Inventory (held)", true, ""],
  ["2000", "Accrued interest - Dennis", "2000", "liability", "", "", true, ""],
  ["1401", "Cash - Citizens shared", "1400", "asset", "", "", true, ""],
  ["2010", "Note payable - Dennis", "2000", "liability", "", "", true, ""],
];
const PROPERTIES_ROWS = [["881 Newport", "881 Newport Dr", "held", "2026-06-29", "207000", "", "light", true, "", ""]];
const PERIODS_ROWS_OPEN = [["2026-09", "open", "", "", ""]];
const PERIODS_ROWS_CLOSED = [["2026-07", "closed", "2026-08-01", "", ""]];
const SETTINGS_ROWS = [
  ["interest_rate_annual", "0.09", ""],
  ["stub_days_basis", "30", ""],
];
const ADVANCES_ROWS = [
  ["adv-1", "2026-06-29", "207000", "881 Newport", "manual-20260629-abc", "open", "", "", ""],
  ["adv-2", "2026-07-09", "2000", "881 Newport", "manual-20260709-def", "open", "", "", ""],
];

function baseRouter({ periods = PERIODS_ROWS_OPEN, advances = ADVANCES_ROWS } = {}) {
  return (body) => {
    if (body.action === "read") {
      switch (body.tab) {
        case "Accounts":
          return { ok: true, headers: ["code", "name", "series", "type", "cost_class", "tax_treatment", "active", "notes"], rows: ACCOUNTS_ROWS };
        case "Properties":
          return { ok: true, headers: ["name", "address", "status", "purchase_date", "purchase_price", "settlement_date", "template", "dennis_funded", "drive_folder", "notes"], rows: PROPERTIES_ROWS };
        case "Periods":
          return { ok: true, headers: ["period", "status", "closed_at", "snapshot_url", "notes"], rows: periods };
        case "Settings":
          return { ok: true, headers: ["key", "value", "notes"], rows: SETTINGS_ROWS };
        case "Advances":
          return { ok: true, headers: ["advance_id", "date", "amount", "property", "source_txn_id", "status", "accrued_to", "repaid_date", "notes"], rows: advances };
        case "Journal":
          return { ok: true, headers: ["txn_id", "line", "date", "period", "account", "debit", "credit", "property", "cost_class", "tax_treatment", "trade", "payee", "description", "paid_from", "doc_url", "source", "posted_by", "posted_at", "memo", "reconciled_ref", "business_purpose", "attendee", "destination", "odometer", "void_of"], rows: [] };
        default:
          throw new Error(`unexpected read: ${body.tab}`);
      }
    }
    throw new Error(`router did not expect action ${body.action}`);
  };
}

let router;
beforeEach(() => {
  if (importError) return;
  resetWriterForTests();
  invalidateCtxCache();
  invalidateJournalCache();
  router = baseRouter();
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    return { status: 200, text: async () => JSON.stringify(router(body)) };
  };
});

test("GET requires a session", { skip }, async () => {
  const res = await handler(req("GET"));
  assert.equal(res.status, 401);
});

test("GET returns the dennis ledger plus raw advances", { skip }, async () => {
  const res = await handler(req("GET", { token: session("partner"), search: "?asOf=2026-09-11" }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.by_property));
  assert.ok(Array.isArray(body.advances));
  assert.equal(body.advances.length, 2);
  assert.equal(body.advances[0].amount_cents, 20700000); // "207000" dollars -> cents
});

test("addAdvance is owner-only", { skip }, async () => {
  const res = await handler(
    req("POST", {
      token: session("partner"),
      body: { action: "addAdvance", date: "2026-09-01", amount_cents: 500000, property: "881 Newport" },
    }),
  );
  assert.equal(res.status, 403);
});

test("addAdvance refuses BAD_PROPERTY for a property not in the registry", { skip }, async () => {
  const res = await handler(
    req("POST", {
      token: session("owner"),
      body: { action: "addAdvance", date: "2026-09-01", amount_cents: 500000, property: "Not A Real Property" },
    }),
  );
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error, "BAD_PROPERTY");
});

test("addAdvance posts and upserts the Advances row", { skip }, async () => {
  const calls = [];
  router = (body) => {
    calls.push(body);
    if (body.action === "post") return { ok: true, rows: [10, 11] };
    if (body.action === "upsert" && body.tab === "Advances") return { ok: true, tab: "Advances", created: true, ignored: [] };
    return baseRouter()(body);
  };
  const res = await handler(
    req("POST", {
      token: session("owner"),
      body: { action: "addAdvance", date: "2026-09-01", amount_cents: 500000, property: "881 Newport" },
    }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.advance.property, "881 Newport");
  assert.equal(body.advance.amount, "5000.00");
  assert.equal(body.advance.status, "open");
  assert.ok(body.advance.advance_id.startsWith("adv-"));

  const upsertCall = calls.find((c) => c.action === "upsert" && c.tab === "Advances");
  assert.ok(upsertCall, "should have upserted the Advances tab");
  assert.equal(upsertCall.row.advance_id, body.advance.advance_id);
});

test("previewInterest computes a delta per open advance without writing anything", { skip }, async () => {
  const res = await handler(
    req("POST", { token: session("accountant"), body: { action: "previewInterest", period: "2026-09" } }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.period, "2026-09");
  assert.ok(Array.isArray(body.previews));
  // No write actions should have been dispatched — the router throws on anything but
  // read, so a non-read call anywhere would have already thrown inside the handler
  // and produced a 502, not a 200.
});

test("previewInterest skips an advance already accrued through this period", { skip }, async () => {
  const res = await handler(
    req("POST", {
      token: session("owner"),
      body: { action: "previewInterest", period: "2026-08" },
    }),
  );
  assert.equal(res.status, 200);
  router = baseRouter({ advances: [["adv-1", "2026-06-29", "207000", "881 Newport", "x", "open", "2026-08", "", ""]] });
  const res2 = await handler(
    req("POST", { token: session("owner"), body: { action: "previewInterest", period: "2026-08" } }),
  );
  const body2 = await res2.json();
  assert.equal(body2.previews.length, 0);
});

test("postInterest is owner-only", { skip }, async () => {
  const res = await handler(req("POST", { token: session("partner"), body: { action: "postInterest", period: "2026-09" } }));
  assert.equal(res.status, 403);
});

test("postInterest refuses a closed period (422 PERIOD_CLOSED, nothing written)", { skip }, async () => {
  router = baseRouter({ periods: PERIODS_ROWS_CLOSED.concat([["2026-07", "closed", "", "", ""]]) });
  // Advances dated 2026-06/2026-07 accruing into period 2026-07, which is closed.
  router = (body) => {
    if (body.action === "post" || body.action === "postBatch" || body.action === "upsert") {
      throw new Error("should not write anything when the period is closed");
    }
    return baseRouter({ periods: [["2026-07", "closed", "2026-08-01", "", ""]] })(body);
  };
  const res = await handler(
    req("POST", { token: session("owner"), body: { action: "postInterest", period: "2026-07" } }),
  );
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error, "PERIOD_CLOSED");
});

test("postInterest posts a batch and upserts accrued_to on success", { skip }, async () => {
  const calls = [];
  router = (body) => {
    calls.push(body);
    if (body.action === "postBatch") {
      return { ok: true, posted: body.entries.map((e) => e.txn_id), rows: [20, 23] };
    }
    if (body.action === "upsert" && body.tab === "Advances") {
      return { ok: true, tab: "Advances", created: false, ignored: [] };
    }
    return baseRouter()(body);
  };
  const res = await handler(
    req("POST", { token: session("owner"), body: { action: "postInterest", period: "2026-09" } }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.posted.length > 0);

  const batchCall = calls.find((c) => c.action === "postBatch");
  assert.ok(batchCall, "should have called postBatch");
  for (const entry of batchCall.entries) {
    assert.match(entry.txn_id, /^close-\d{8}-[0-9a-f]{12}$/);
    assert.equal(entry.source, "close");
    const totalDebit = entry.lines.reduce((s, l) => s + (l.debit || 0), 0);
    const totalCredit = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
    assert.equal(totalDebit, totalCredit, "each interest entry must balance");
    assert.deepEqual(entry.lines.map((l) => l.account).sort(), ["1200", "2000"]);
  }

  const accrualUpserts = calls.filter((c) => c.action === "upsert" && c.tab === "Advances");
  assert.equal(accrualUpserts.length, batchCall.entries.length);
  for (const u of accrualUpserts) assert.equal(u.row.accrued_to, "2026-09");
});
