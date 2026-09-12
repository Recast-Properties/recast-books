// test/books-auth.test.mjs — the phase1-spec.md §4 addition only: a Users row with
// role "removed" is refused exactly like an unlisted email (403 NOT_ALLOWED).
//
// Signs a real Google id_token in-process against a throwaway RSA keypair (same
// technique as test/auth.test.mjs) and mocks global fetch for both the Google JWKS
// endpoint and the writer's Users read, so this never makes a network call.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";

process.env.WRITER_URL = "https://writer.test/exec";
process.env.WRITER_SECRET = "writer-secret";
process.env.SESSION_SECRET = "session-secret";
process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";

const { default: handler } = await import("../netlify/functions/books-auth.mjs");
const { resetWriterForTests, resetCacheStoreForTests } = await import("../netlify/functions/_shared.mjs");
const { makeFakeCacheStore } = await import("./helpers/fake-cache-store.mjs");

const KID = "test-key-1";

function b64url(objOrBuf) {
  const buf = Buffer.isBuffer(objOrBuf) ? objOrBuf : Buffer.from(JSON.stringify(objOrBuf), "utf8");
  return buf.toString("base64url");
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" });
jwk.kid = KID;
jwk.alg = "RS256";
jwk.use = "sig";

function signIdToken(email) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: KID, typ: "JWT" };
  const payload = {
    iss: "https://accounts.google.com",
    aud: process.env.GOOGLE_CLIENT_ID,
    exp: nowSec + 3600,
    email,
    email_verified: true,
    name: "Test User",
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const sig = cryptoSign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${sig.toString("base64url")}`;
}

// _shared.mjs's getUsersByEmail caches the whole Users tab (not per-email) for 5
// minutes in module scope, with no exported way to reset it — so both tests below
// share one mock response (the Users tab as it would really look, with both a
// removed row and an owner row) rather than each installing its own, or the second
// test would just see the first test's cached map.
const USERS_ROWS = [
  ["removed@recast-properties.com", "removed", "Gone", ""],
  ["paul@recast-properties.com", "owner", "Paul", ""],
];

function mockFetch() {
  return async (url) => {
    if (String(url).includes("googleapis.com/oauth2/v3/certs")) {
      return { ok: true, status: 200, json: async () => ({ keys: [jwk] }) };
    }
    // the writer /exec call
    return {
      status: 200,
      text: async () =>
        JSON.stringify({ ok: true, headers: ["email", "role", "name", "added_at"], rows: USERS_ROWS }),
    };
  };
}

resetWriterForTests();
resetCacheStoreForTests(makeFakeCacheStore());
globalThis.fetch = mockFetch();

test("a user with role \"removed\" is refused 403 NOT_ALLOWED, same as an unlisted email", async () => {
  const res = await handler(
    new Request("https://books.test/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: signIdToken("removed@recast-properties.com") }),
    }),
  );

  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, "NOT_ALLOWED");
  assert.equal(body.session, undefined);
});

test("an owner still signs in normally (control case)", async () => {
  const res = await handler(
    new Request("https://books.test/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: signIdToken("paul@recast-properties.com") }),
    }),
  );

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.role, "owner");
  assert.ok(body.session);
});
