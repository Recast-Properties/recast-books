// test/books-summary.test.mjs — netlify/functions/books-summary.mjs, phase2-spec.md
// section 5. No writer, no dependency on lib/bookkeeper.mjs or lib/gate.mjs (it reads
// only from the envelopes already in the docs store), so this file always runs.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { issueSession } from "../lib/auth.mjs";
import { resetDocsStoreForTests, getDocsStore } from "../netlify/functions/_shared.mjs";
import { installFakeBlobsContext, makeFakeDocsStore } from "./helpers/fake-docs-store.mjs";

process.env.SESSION_SECRET = "session-secret";
process.env.POLLER_SECRET = "poller-secret";
installFakeBlobsContext();

const { default: handler } = await import("../netlify/functions/books-summary.mjs");

function session(role, email = `${role}@recast-properties.com`) {
  return issueSession({ email, role, name: role }, process.env.SESSION_SECRET);
}

function req({ date, token, pollerSecret } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (pollerSecret) headers["x-poller-secret"] = pollerSecret;
  const qs = date ? `?date=${date}` : "";
  return new Request(`https://books.test/api/summary${qs}`, { method: "GET", headers });
}

beforeEach(() => {
  resetDocsStoreForTests();
  const { fetchImpl } = makeFakeDocsStore();
  globalThis.fetch = fetchImpl;
});

test("neither session nor poller secret -> 401", async () => {
  const res = await handler(req({ date: "2026-09-10" }));
  assert.equal(res.status, 401);
});

test("bad date format is rejected", async () => {
  const res = await handler(req({ date: "09/10/2026", token: session("owner") }));
  assert.equal(res.status, 400);
});

test("poller secret auth works with no session", async () => {
  const res = await handler(req({ date: "2026-09-10", pollerSecret: "poller-secret" }));
  assert.equal(res.status, 200);
});

test("buckets posted/pending/dismissed/errors by finishedAt's Chicago date, excludes dry runs", async () => {
  const store = getDocsStore();
  await store.setJSON("doc/posted-1", {
    docId: "posted-1",
    status: "posted",
    dryRun: false,
    finishedAt: "2026-09-10T23:30:00.000Z", // 6:30 PM Chicago on the 10th
    model: {
      vendor: "Home Depot",
      receipt_total_cents: 5000,
      entries: [{ property: "881 Newport", items: [{ account: "1030", amount_cents: 5000 }] }],
    },
    result: { txn_ids: ["receipt-20260910-abc"] },
  });
  await store.setJSON("doc/pending-1", {
    docId: "pending-1",
    status: "pending",
    dryRun: false,
    finishedAt: "2026-09-11T02:00:00.000Z", // 9 PM Chicago on the 10th (CDT, UTC-5)
    model: { vendor: "Unknown Vendor", date: "2026-09-10", receipt_total_cents: 12000, why: "confidence was medium" },
    gate: { passed: false, reasons: ["NOT_HIGH_CONFIDENCE"] },
  });
  await store.setJSON("doc/dismissed-1", {
    docId: "dismissed-1",
    status: "dismissed",
    dryRun: false,
    finishedAt: "2026-09-10T15:00:00.000Z",
    model: { vendor: "Anthropic", duplicate_of: "receipt-20260909-def" },
    review: { note: "already on the books" },
  });
  await store.setJSON("doc/error-1", {
    docId: "error-1",
    status: "error",
    dryRun: false,
    finishedAt: "2026-09-10T16:00:00.000Z",
    subject: "Weird attachment",
    error: "ANTHROPIC_API_KEY not set",
  });
  await store.setJSON("doc/dry-1", {
    docId: "dry-1",
    status: "dry",
    dryRun: true,
    finishedAt: "2026-09-10T16:00:00.000Z",
    model: { vendor: "Should Not Appear", receipt_total_cents: 999 },
  });
  await store.setJSON("doc/other-day", {
    docId: "other-day",
    status: "posted",
    dryRun: false,
    finishedAt: "2026-09-05T16:00:00.000Z",
    model: { vendor: "Wrong Day", receipt_total_cents: 100, entries: [] },
  });

  const res = await handler(req({ date: "2026-09-10", token: session("owner") }));
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.date, "2026-09-10");
  assert.equal(body.posted.length, 1);
  assert.equal(body.posted[0].docId, "posted-1");
  assert.equal(body.posted[0].vendor, "Home Depot");
  assert.equal(body.posted[0].total_cents, 5000);
  assert.equal(body.posted[0].property, "881 Newport");
  assert.deepEqual(body.posted[0].account_summary, [{ account: "1030", amount_cents: 5000 }]);
  assert.deepEqual(body.posted[0].txn_ids, ["receipt-20260910-abc"]);

  assert.equal(body.pending.length, 1);
  assert.equal(body.pending[0].docId, "pending-1");
  assert.equal(body.pending[0].why, "confidence was medium");
  assert.deepEqual(body.pending[0].gate_reasons, ["NOT_HIGH_CONFIDENCE"]);

  assert.equal(body.dismissed.length, 1);
  assert.equal(body.dismissed[0].duplicate_of, "receipt-20260909-def");

  assert.equal(body.errors.length, 1);
  assert.equal(body.errors[0].error, "ANTHROPIC_API_KEY not set");

  assert.equal(body.totals.posted_count, 1);
  assert.equal(body.totals.posted_total_cents, 5000);
  assert.equal(body.totals.pending_count, 1);
  assert.equal(body.totals.dismissed_count, 1);
  assert.equal(body.totals.error_count, 1);
});

test("no date param defaults to today (Chicago)", async () => {
  const res = await handler(req({ token: session("owner") }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.date, /^\d{4}-\d{2}-\d{2}$/);
});

test("POST is not allowed", async () => {
  const res = await handler(new Request("https://books.test/api/summary", { method: "POST" }));
  assert.equal(res.status, 405);
});
