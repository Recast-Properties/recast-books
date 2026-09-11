// test/auth.test.mjs — lib/auth.mjs, spec §5 and §9
//
// Generates an RSA keypair in-process and signs fake Google id_tokens against it, so
// verifyGoogleIdToken is exercised end to end (WebCrypto RS256 verify) with no network
// call — the injectable fetchJwks stands in for the real https://www.googleapis.com
// fetch, returning our own key as the JWKS.
//
// All tests share ONE keypair/fetchJwks. lib/auth.mjs caches the JWKS in module scope
// for 1h regardless of which fetchJwks callback is passed (spec §5: "module-scope 1h
// cache"), so a per-test keypair would make later tests see an earlier test's stale
// cached key and fail signature verification for the wrong reason. Sharing a keypair
// sidesteps that; the "signed by a different key" test still gets a real mismatch
// because it signs with a *different* key while the cache/fetchJwks still serves the
// shared public one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import {
  verifyGoogleIdToken,
  issueSession,
  verifySession,
  requireRole,
  AuthError,
} from "../lib/auth.mjs";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const KID = "test-key-1";

function b64url(objOrBuf) {
  const buf = Buffer.isBuffer(objOrBuf) ? objOrBuf : Buffer.from(JSON.stringify(objOrBuf), "utf8");
  return buf.toString("base64url");
}

function makeKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });
  jwk.kid = KID;
  jwk.alg = "RS256";
  jwk.use = "sig";
  return { privateKey, jwk };
}

function signIdToken(privateKey, payloadOverrides = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", kid: KID, typ: "JWT" };
  const payload = {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    exp: nowSec + 3600,
    email: "paul@recast-properties.com",
    email_verified: true,
    name: "Paul Bjork",
    picture: "https://example.com/p.jpg",
    ...payloadOverrides,
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const sig = cryptoSign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${sig.toString("base64url")}`;
}

// Shared across every test in this file — see file-header note.
const { privateKey: SHARED_PRIVATE_KEY, jwk: SHARED_JWK } = makeKeypair();
let jwksFetchCount = 0;
const fetchJwks = async () => {
  jwksFetchCount += 1;
  return { keys: [SHARED_JWK] };
};

test("verifyGoogleIdToken: valid token passes, and caches the JWKS in module scope", async () => {
  const before = jwksFetchCount;
  const idToken = signIdToken(SHARED_PRIVATE_KEY);

  const result = await verifyGoogleIdToken(idToken, { clientId: CLIENT_ID, fetchJwks });
  assert.equal(result.email, "paul@recast-properties.com");
  assert.equal(result.name, "Paul Bjork");
  assert.equal(result.picture, "https://example.com/p.jpg");

  // A second verification must not re-fetch the JWKS (spec §5: 1h module-scope cache).
  await verifyGoogleIdToken(signIdToken(SHARED_PRIVATE_KEY), { clientId: CLIENT_ID, fetchJwks });
  assert.ok(jwksFetchCount - before <= 1, "fetchJwks should be called at most once across both verifications");
});

test("verifyGoogleIdToken: also accepts iss without the https:// prefix", async () => {
  const idToken = signIdToken(SHARED_PRIVATE_KEY, { iss: "accounts.google.com" });
  const result = await verifyGoogleIdToken(idToken, { clientId: CLIENT_ID, fetchJwks });
  assert.equal(result.email, "paul@recast-properties.com");
});

test("verifyGoogleIdToken: wrong aud throws AuthError", async () => {
  const idToken = signIdToken(SHARED_PRIVATE_KEY, { aud: "someone-else.apps.googleusercontent.com" });
  await assert.rejects(
    () => verifyGoogleIdToken(idToken, { clientId: CLIENT_ID, fetchJwks }),
    AuthError,
  );
});

test("verifyGoogleIdToken: wrong iss throws AuthError", async () => {
  const idToken = signIdToken(SHARED_PRIVATE_KEY, { iss: "https://evil.example.com" });
  await assert.rejects(
    () => verifyGoogleIdToken(idToken, { clientId: CLIENT_ID, fetchJwks }),
    AuthError,
  );
});

test("verifyGoogleIdToken: expired token throws AuthError", async () => {
  const idToken = signIdToken(SHARED_PRIVATE_KEY, { exp: Math.floor(Date.now() / 1000) - 10 });
  await assert.rejects(
    () => verifyGoogleIdToken(idToken, { clientId: CLIENT_ID, fetchJwks }),
    AuthError,
  );
});

test("verifyGoogleIdToken: email_verified false throws AuthError", async () => {
  const idToken = signIdToken(SHARED_PRIVATE_KEY, { email_verified: false });
  await assert.rejects(
    () => verifyGoogleIdToken(idToken, { clientId: CLIENT_ID, fetchJwks }),
    AuthError,
  );
});

test("verifyGoogleIdToken: a token signed by a different key throws AuthError", async () => {
  const { privateKey: otherPrivateKey } = makeKeypair(); // different key, same kid
  const idToken = signIdToken(otherPrivateKey);
  // fetchJwks (and/or the module cache) still serves the shared *published* key, so
  // this is a genuine signature mismatch regardless of cache state.
  await assert.rejects(
    () => verifyGoogleIdToken(idToken, { clientId: CLIENT_ID, fetchJwks }),
    AuthError,
  );
});

test("session: issueSession/verifySession round trip", () => {
  const secret = "test-secret-do-not-use-in-prod";
  const token = issueSession({ email: "paul@recast-properties.com", role: "owner", name: "Paul" }, secret);
  const payload = verifySession(token, secret);
  assert.equal(payload.email, "paul@recast-properties.com");
  assert.equal(payload.role, "owner");
  assert.equal(payload.name, "Paul");
  assert.equal(typeof payload.exp, "number");
});

test("session: tampered payload throws AuthError", () => {
  const secret = "test-secret-do-not-use-in-prod";
  const token = issueSession({ email: "paul@recast-properties.com", role: "partner", name: "Paul" }, secret);
  const [h, p, s] = token.split(".");
  const tamperedPayload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  tamperedPayload.role = "owner"; // attempted privilege escalation
  const tamperedP = Buffer.from(JSON.stringify(tamperedPayload), "utf8").toString("base64url");
  const tampered = `${h}.${tamperedP}.${s}`;

  assert.throws(() => verifySession(tampered, secret), AuthError);
});

test("session: wrong secret throws AuthError", () => {
  const token = issueSession({ email: "a@b.com", role: "owner", name: "A" }, "secret-one");
  assert.throws(() => verifySession(token, "secret-two"), AuthError);
});

test("session: expired token throws AuthError", () => {
  const secret = "test-secret-do-not-use-in-prod";
  const token = issueSession({ email: "a@b.com", role: "owner", name: "A" }, secret, -10);
  assert.throws(() => verifySession(token, secret), AuthError);
});

test("session: malformed token throws AuthError", () => {
  assert.throws(() => verifySession("not-a-jwt", "secret"), AuthError);
  assert.throws(() => verifySession("a.b", "secret"), AuthError);
});

test("requireRole: allows a listed role", () => {
  assert.doesNotThrow(() => requireRole({ role: "partner" }, ["owner", "partner"]));
});

test("requireRole: throws AuthError('FORBIDDEN') for an unlisted role", () => {
  try {
    requireRole({ role: "accountant" }, ["owner"]);
    assert.fail("expected requireRole to throw");
  } catch (err) {
    assert.ok(err instanceof AuthError);
    assert.equal(err.code, "FORBIDDEN");
  }
});
