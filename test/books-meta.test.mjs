// test/books-meta.test.mjs — netlify/functions/books-meta.mjs, phase1-spec.md §4
//
// Exercises the phase 1 additions only (Advances readable; Users role validation and
// last-owner protection; Bank accounts upsert also upserting Accounts). Drives the
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
import { resetWriterForTests, invalidateCtxCache } from "../netlify/functions/_shared.mjs";

process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
process.env.SESSION_SECRET = "session-secret";
process.env.GOOGLE_CLIENT_ID = "client-id";

const { default: handler } = await import("../netlify/functions/books-meta.mjs");

let router = null; // (body) -> response object body, set per test

beforeEach(() => {
  resetWriterForTests();
  invalidateCtxCache();
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

test("Users upsert refuses an invalid role", async () => {
  const res = await handler(
    req("POST", {
      token: session("owner"),
      body: { action: "upsert", tab: "Users", key_column: "email", row: { email: "x@y.com", role: "superadmin" } },
    }),
  );
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.error, "BAD_ROLE");
});

test("Users upsert refuses to demote the last owner", async () => {
  router = (body) => {
    if (body.action === "read" && body.tab === "Users") {
      return {
        ok: true,
        headers: ["email", "role", "name", "added_at"],
        rows: [["paul@recast-properties.com", "owner", "Paul", ""]],
      };
    }
    throw new Error(`unexpected call: ${JSON.stringify(body)}`);
  };
  const res = await handler(
    req("POST", {
      token: session("owner"),
      body: {
        action: "upsert",
        tab: "Users",
        key_column: "email",
        row: { email: "paul@recast-properties.com", role: "partner" },
      },
    }),
  );
  assert.equal(res.status, 409);
  const json = await res.json();
  assert.equal(json.error, "LAST_OWNER");
});

test("Users upsert allows demoting an owner when another owner remains", async () => {
  let upserted = null;
  router = (body) => {
    if (body.action === "read" && body.tab === "Users") {
      return {
        ok: true,
        headers: ["email", "role", "name", "added_at"],
        rows: [
          ["paul@recast-properties.com", "owner", "Paul", ""],
          ["dennis@recast-properties.com", "owner", "Dennis", ""],
        ],
      };
    }
    if (body.action === "upsert" && body.tab === "Users") {
      upserted = body.row;
      return { ok: true, tab: "Users", created: false, ignored: [] };
    }
    throw new Error(`unexpected call: ${JSON.stringify(body)}`);
  };
  const res = await handler(
    req("POST", {
      token: session("owner"),
      body: {
        action: "upsert",
        tab: "Users",
        key_column: "email",
        row: { email: "dennis@recast-properties.com", role: "partner" },
      },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(upserted.role, "partner");
});

test("Users upsert with no role change (e.g. renaming) skips the last-owner check", async () => {
  router = (body) => {
    if (body.action === "upsert" && body.tab === "Users") {
      return { ok: true, tab: "Users", created: false, ignored: [] };
    }
    throw new Error(`unexpected call: ${JSON.stringify(body)} (should not need to read Users)`);
  };
  const res = await handler(
    req("POST", {
      token: session("owner"),
      body: {
        action: "upsert",
        tab: "Users",
        key_column: "email",
        row: { email: "paul@recast-properties.com", name: "Paul B" },
      },
    }),
  );
  assert.equal(res.status, 200);
});

test("Bank accounts upsert also upserts the matching Accounts row", async () => {
  const upserts = [];
  router = (body) => {
    if (body.action === "upsert") {
      upserts.push(body);
      return { ok: true, tab: body.tab, created: true, ignored: [] };
    }
    throw new Error(`unexpected call: ${JSON.stringify(body)}`);
  };
  const res = await handler(
    req("POST", {
      token: session("owner"),
      body: {
        action: "upsert",
        tab: "Bank accounts",
        key_column: "code",
        row: { code: "1403", name: "Wells Fargo ops", institution: "Wells Fargo", active: true },
      },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(upserts.length, 2);
  assert.equal(upserts[0].tab, "Bank accounts");
  assert.equal(upserts[1].tab, "Accounts");
  assert.equal(upserts[1].key_column, "code");
  assert.deepEqual(upserts[1].row, {
    code: "1403",
    name: "Cash - Wells Fargo ops",
    series: "1400",
    type: "asset",
    active: true,
  });
});

test("non-owner cannot upsert", async () => {
  const res = await handler(
    req("POST", {
      token: session("partner"),
      body: { action: "upsert", tab: "Vendors", key_column: "canonical", row: { canonical: "Home Depot" } },
    }),
  );
  assert.equal(res.status, 403);
});
