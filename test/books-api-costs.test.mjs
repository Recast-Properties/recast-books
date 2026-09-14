// test/books-api-costs.test.mjs — netlify/functions/books-api-costs.mjs (D-018)

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { issueSession } from "../lib/auth.mjs";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";

process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
process.env.SESSION_SECRET = "session-secret";
process.env.POLLER_SECRET = "poller-secret";
process.env.ANTHROPIC_ADMIN_KEY = "sk-ant-admin-test";

const { default: handler, previousMonth, alreadyPosted, usageEntryIntent } = await import("../netlify/functions/books-api-costs.mjs");
const { resetWriterForTests, resetCacheStoreForTests } = await import("../netlify/functions/_shared.mjs");

const JOURNAL_HEADERS = ["txn_id", "line", "date", "period", "account", "debit", "credit", "property", "cost_class", "tax_treatment", "trade", "payee", "description", "paid_from", "doc_url", "source", "posted_by", "posted_at", "memo", "reconciled_ref", "business_purpose", "attendee", "destination", "odometer", "void_of"];
const ACCOUNTS_ROWS = [
  ["1520", "Prepaid API credits", "1400", "asset", "", "", true, ""],
  ["6210", "Accounting & bookkeeping", "6000", "expense", "Overhead", "Expense", true, ""],
  ["6300", "Data & research", "6000", "expense", "Overhead", "Expense", true, ""],
  ["6400", "Software & subscriptions", "6000", "expense", "Overhead", "Expense", true, ""],
  ["6410", "Website & hosting", "6000", "expense", "Overhead", "Expense", true, ""],
];
const SETTINGS_ROWS = [
  ["api_cost_account:Recast Books", "6210", ""],
  ["api_cost_account:Title Search", "6300", ""],
  ["api_cost_account:Receipts (old site)", "6410", ""], // a Settings row beats the built-in default
];

let journalRows, posted, upserts, adminCalls;
function router(body) {
  if (body.action === "read") {
    switch (body.tab) {
      case "Accounts": return { ok: true, headers: ["code", "name", "series", "type", "cost_class", "tax_treatment", "active", "notes"], rows: ACCOUNTS_ROWS };
      case "Properties": return { ok: true, headers: ["name", "address", "status"], rows: [] };
      case "Periods": return { ok: true, headers: ["period", "status", "closed_at", "snapshot_url", "notes"], rows: [["2026-08", "open", "", "", ""]] };
      case "Settings": return { ok: true, headers: ["key", "value", "notes"], rows: SETTINGS_ROWS };
      case "Journal": return { ok: true, headers: JOURNAL_HEADERS, rows: journalRows };
      default: throw new Error(`unexpected read ${body.tab}`);
    }
  }
  if (body.action === "post") { posted.push(body.entry); return { ok: true, rows: body.entry.lines.length }; }
  if (body.action === "upsert") { upserts.push(body); return { ok: true }; }
  throw new Error(`unexpected action ${body.action}`);
}

const WORKSPACES = { data: [
  { id: "wrkspc_books", name: "Recast Books" },
  { id: "wrkspc_title", name: "Title Search" },
  { id: "wrkspc_old", name: "Receipts (old site)" },
], has_more: false, last_id: "wrkspc_old" };
const COSTS = { data: [
  { starting_at: "2026-08-01T00:00:00Z", ending_at: "2026-08-02T00:00:00Z", results: [
    { amount: "1234.5", currency: "USD", workspace_id: "wrkspc_books" },
    { amount: "100.4", currency: "USD", workspace_id: "wrkspc_title" },
  ] },
  { starting_at: "2026-08-02T00:00:00Z", ending_at: "2026-08-03T00:00:00Z", results: [
    { amount: "1000.0", currency: "USD", workspace_id: "wrkspc_books" },
    { amount: "22.0", currency: "USD", workspace_id: "wrkspc_old" },
    { amount: "0.6", currency: "USD", workspace_id: null },
  ] },
], has_more: false, next_page: null };

beforeEach(() => {
  resetWriterForTests();
  resetCacheStoreForTests(makeFakeCacheStore());
  journalRows = []; posted = []; upserts = []; adminCalls = [];
  globalThis.fetch = async (url, options = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/")) {
      adminCalls.push(u);
      assert.equal(options.headers["x-api-key"], "sk-ant-admin-test");
      if (u.includes("/workspaces")) return { status: 200, text: async () => JSON.stringify(WORKSPACES) };
      if (u.includes("/cost_report")) {
        assert.ok(u.includes("group_by%5B%5D=workspace_id"), "groups by workspace_id");
        assert.ok(u.includes("starting_at=2026-08-01T00%3A00%3A00Z") && u.includes("ending_at=2026-09-01T00%3A00%3A00Z"), u);
        return { status: 200, text: async () => JSON.stringify(COSTS) };
      }
    }
    return { status: 200, text: async () => JSON.stringify(router(JSON.parse(options.body))) };
  };
});

function session(role) { return issueSession({ email: `${role}@recast-properties.com`, role, name: role }, process.env.SESSION_SECRET); }
function req(method, { body, token, pollerSecret, search = "" } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (pollerSecret) headers["x-poller-secret"] = pollerSecret;
  return new Request(`https://books.test/api/api-costs${search}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

test("previousMonth", () => {
  assert.equal(previousMonth("2026-09-02"), "2026-08");
  assert.equal(previousMonth("2026-01-15"), "2025-12");
});

test("GET needs a session or the poller secret", async () => {
  assert.equal((await handler(req("GET", { search: "?month=2026-08" }))).status, 401);
});

test("GET returns the split by workspace, mapped through Settings (built-in map, then 6400), rounded to cents", async () => {
  const res = await handler(req("GET", { token: session("accountant"), search: "?month=2026-08" }));
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.equal(b.date, "2026-08-31");
  assert.deepEqual(b.lines, [
    { workspace: "Recast Books", cents: 2235, account: "6210", mapped: true },   // 1234.5 + 1000.0 -> 2234.5 -> 2235
    { workspace: "Title Search", cents: 100, account: "6300", mapped: true },
    { workspace: "Receipts (old site)", cents: 22, account: "6410", mapped: true },
    { workspace: "Default", cents: 1, account: "6400", mapped: false },
  ]);
  assert.equal(b.total_cents, 2358);
  assert.equal(posted.length, 0);
});

test("POST (poller secret) posts one balanced entry: debits per workspace, one 1520 credit, dated month end", async () => {
  const res = await handler(req("POST", { pollerSecret: "poller-secret", body: { month: "2026-08" } }));
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const b = await res.json();
  assert.equal(b.posted, true);
  assert.equal(posted.length, 1);
  const e = posted[0];
  assert.equal(e.date, "2026-08-31");
  assert.equal(e.source, "close");
  assert.equal(e.posted_by, "system");
  const debits = e.lines.filter((l) => l.debit > 0);
  const credits = e.lines.filter((l) => l.credit > 0);
  assert.equal(debits.length, 4);
  assert.equal(credits.length, 1);
  assert.equal(credits[0].account, "1520");
  assert.equal(credits[0].credit, 2358);
  assert.equal(credits[0].description, "API usage 2026-08");
  assert.ok(e.lines.every((l) => l.property === "OVERHEAD" && l.payee === "Anthropic"));
  assert.equal(debits.find((l) => l.description.endsWith("Recast Books")).account, "6210");
  // unmapped workspaces got a Settings row at the default so Paul can change it
  const settingKeys = upserts.filter((u) => u.tab === "Settings").map((u) => u.row.key).sort();
  assert.deepEqual(settingKeys, ["api_cost_account:Default"]);
  assert.equal(upserts.find((u) => u.tab === "Settings").row.value, "6400");
});

test("POST as a non-owner session is refused", async () => {
  assert.equal((await handler(req("POST", { token: session("accountant"), body: { month: "2026-08" } }))).status, 403);
});

test("POST skips a month already on the Journal (live 1520 credit for that month)", async () => {
  journalRows = [["close-20260831-abc", 2, "2026-08-31", "2026-08", "1520", "", "23.58", "OVERHEAD", "", "", "", "Anthropic", "API usage 2026-08", "", "", "close", "system", "", "", "", "", "", "", "", ""]];
  const res = await handler(req("POST", { token: session("owner"), body: { month: "2026-08" } }));
  const b = await res.json();
  assert.equal(b.posted, false);
  assert.equal(b.reason, "ALREADY_POSTED");
  assert.equal(posted.length, 0);
});

test("alreadyPosted ignores a voided month entry", () => {
  const rows = [
    ["close-1", 2, "2026-08-31", "2026-08", "1520", "", "23.58", "OVERHEAD", "", "", "", "Anthropic", "API usage 2026-08", "", "", "close", "system", "", "", "", "", "", "", "", ""],
    ["void-1", 1, "2026-09-01", "2026-09", "1520", "23.58", "", "OVERHEAD", "", "", "", "Anthropic", "API usage 2026-08", "", "", "void", "paul", "", "", "", "", "", "", "", "close-1"],
  ];
  assert.equal(alreadyPosted({ headers: JOURNAL_HEADERS, rows }, "2026-08"), false);
});

test("usageEntryIntent balances", () => {
  const split = { month: "2026-08", date: "2026-08-31", lines: [{ workspace: "A", cents: 5, account: "6400" }, { workspace: "B", cents: 7, account: "6300" }], total_cents: 12 };
  const i = usageEntryIntent(split, "system");
  const d = i.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const c = i.lines.reduce((s, l) => s + (l.credit || 0), 0);
  assert.equal(d, c);
});
