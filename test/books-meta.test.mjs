// test/books-meta.test.mjs — netlify/functions/books-meta.mjs, phase1-spec.md §4
//
// POST (setPeriod/upsert/propertyTab) moved to the workbook's Recast Books menu
// 2026-09-15 (D-023, phase2.7-spec.md §5); this file now covers GET only. Drives the
// module's actual default export with a mocked global fetch standing in for the
// Apps Script writer, so this never touches a real workbook.
//
// _shared.mjs's getWriter()/getPostingCtx()/getUsersByEmail() caches are all
// module-scope and persist across the tests in this file (node:test runs a file's
// tests in one process) - each test resets what it depends on rather than assuming a
// clean slate.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { issueSession } from "../lib/auth.mjs";
import { resetWriterForTests, resetCacheStoreForTests } from "../netlify/functions/_shared.mjs";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";

process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
process.env.SESSION_SECRET = "session-secret";
process.env.GOOGLE_CLIENT_ID = "client-id";

const { default: handler } = await import("../netlify/functions/books-meta.mjs");

let router = null; // (body) -> response object body, set per test

beforeEach(() => {
  resetWriterForTests();
  resetCacheStoreForTests(makeFakeCacheStore()); // fresh books-cache snapshot per test
  router = null;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (!router) throw new Error(`no router set for action "${body.action}" (tab "${body.tab}")`);
    const respBody = router(body);
    return { status: 200, text: async () => JSON.stringify(respBody) };
  };
});

function session(role, email = `${role}@recast-properties.com`) {
  return issueSession({ email, role, name: role }, process.env.SESSION_SECRET);
}

function req(method, { body, token, search = "" } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`https://books.test/api/meta${search}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("GET ?tab=Advances is readable", async () => {
  router = (body) => {
    assert.equal(body.action, "read");
    assert.equal(body.tab, "Advances");
    return { ok: true, headers: ["advance_id", "date"], rows: [["adv-1", "2026-06-29"]] };
  };
  const res = await handler(req("GET", { token: session("partner"), search: "?tab=Advances" }));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.deepEqual(json.headers, ["advance_id", "date"]);
});

test("POST is refused (moved to the workbook's Recast Books menu, D-023)", async () => {
  const res = await handler(
    req("POST", { token: session("owner"), body: { action: "upsert", tab: "Vendors", key_column: "canonical", row: {} } }),
  );
  assert.equal(res.status, 405);
});
