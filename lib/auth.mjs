// lib/auth.mjs — spec §5 and §9
//
// Google ID token verification (RS256 via WebCrypto) + HS256 session tokens
// (via node:crypto). Zero npm dependencies (spec §1): WebCrypto, node:crypto, and
// Buffer (Node core, not npm) for base64url cover everything.

import { createHmac, timingSafeEqual, webcrypto } from "node:crypto";

export class AuthError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = "AuthError";
    this.code = code;
  }
}

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const JWKS_CACHE_MS = 60 * 60 * 1000; // 1h, module-scope cache — spec §5

// Module-scope cache: { keys: object[], fetchedAt: number }
let jwksCache = null;

function bufferToB64url(buf) {
  return Buffer.from(buf).toString("base64url");
}
function b64urlToBuffer(str) {
  return Buffer.from(str, "base64url");
}
function jsonToB64url(obj) {
  return bufferToB64url(Buffer.from(JSON.stringify(obj), "utf8"));
}
function b64urlToJson(str) {
  return JSON.parse(b64urlToBuffer(str).toString("utf8"));
}

async function defaultFetchJwks() {
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) {
    throw new AuthError("JWKS_FETCH_FAILED", `Google JWKS fetch failed: HTTP ${res.status}`);
  }
  return res.json();
}

async function getJwks(fetchJwks) {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_MS) {
    return jwksCache.keys;
  }
  const body = await (fetchJwks || defaultFetchJwks)();
  const keys = body && body.keys;
  if (!Array.isArray(keys)) {
    throw new AuthError("JWKS_INVALID", "Google JWKS response missing keys[]");
  }
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

/**
 * Verify a Google Sign-In ID token (spec §5).
 *
 * @param {string} idToken
 * @param {{clientId: string, fetchJwks?: () => Promise<{keys: object[]}>}} opts
 * @returns {Promise<{email: string, name: string, picture: string}>}
 */
export async function verifyGoogleIdToken(idToken, { clientId, fetchJwks } = {}) {
  if (typeof idToken !== "string" || idToken.split(".").length !== 3) {
    throw new AuthError("INVALID_TOKEN", "id_token is not a JWT");
  }
  const [headerB64, payloadB64, sigB64] = idToken.split(".");

  let header, payload;
  try {
    header = b64urlToJson(headerB64);
    payload = b64urlToJson(payloadB64);
  } catch {
    throw new AuthError("INVALID_TOKEN", "id_token header/payload is not valid JSON");
  }

  if (header.alg !== "RS256") {
    throw new AuthError("BAD_ALG", `unsupported id_token alg: ${header.alg}`);
  }

  const keys = await getJwks(fetchJwks);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new AuthError("KEY_NOT_FOUND", `no JWKS key for kid ${header.kid}`);
  }

  let cryptoKey;
  try {
    cryptoKey = await webcrypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch (err) {
    throw new AuthError("BAD_KEY", `could not import JWKS key: ${err.message || err}`);
  }

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = b64urlToBuffer(sigB64);
  const valid = await webcrypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, sig, data);
  if (!valid) {
    throw new AuthError("BAD_SIGNATURE", "id_token signature verification failed");
  }

  if (!GOOGLE_ISSUERS.has(payload.iss)) {
    throw new AuthError("BAD_ISS", `unexpected iss: ${payload.iss}`);
  }
  if (payload.aud !== clientId) {
    throw new AuthError("BAD_AUD", "aud does not match GOOGLE_CLIENT_ID");
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new AuthError("EXPIRED", "id_token expired");
  }
  if (payload.email_verified !== true) {
    throw new AuthError("EMAIL_NOT_VERIFIED", "email_verified is not true");
  }

  return { email: payload.email, name: payload.name || "", picture: payload.picture || "" };
}

/**
 * Issue an HS256 session JWT (spec §5).
 *
 * @param {{email: string, role: string, name: string}} user
 * @param {string} secret
 * @param {number} [ttlSeconds=43200]
 * @returns {string}
 */
export function issueSession({ email, role, name }, secret, ttlSeconds = 43200) {
  if (!secret) {
    throw new AuthError("NO_SECRET", "issueSession: secret is required");
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = { email, role, name, iat: nowSec, exp: nowSec + ttlSeconds };
  const signingInput = `${jsonToB64url(header)}.${jsonToB64url(payload)}`;
  const sig = createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${bufferToB64url(sig)}`;
}

/**
 * Verify an HS256 session JWT (spec §5). Throws AuthError("UNAUTHENTICATED") on any
 * failure — malformed, tampered, wrong secret, or expired — without distinguishing
 * which, so a caller never learns more than "sign in again".
 *
 * @param {string} token
 * @param {string} secret
 * @returns {{email: string, role: string, name: string, iat: number, exp: number}}
 */
export function verifySession(token, secret) {
  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new AuthError("UNAUTHENTICATED", "session token malformed");
  }
  const [headerB64, payloadB64, sigB64] = token.split(".");
  const signingInput = `${headerB64}.${payloadB64}`;

  let expectedSig;
  try {
    expectedSig = createHmac("sha256", secret).update(signingInput).digest();
  } catch {
    throw new AuthError("UNAUTHENTICATED", "session verification failed");
  }

  let providedSig;
  try {
    providedSig = b64urlToBuffer(sigB64);
  } catch {
    throw new AuthError("UNAUTHENTICATED", "session signature malformed");
  }

  if (providedSig.length !== expectedSig.length || !timingSafeEqual(providedSig, expectedSig)) {
    throw new AuthError("UNAUTHENTICATED", "session signature invalid");
  }

  let payload;
  try {
    payload = b64urlToJson(payloadB64);
  } catch {
    throw new AuthError("UNAUTHENTICATED", "session payload invalid");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new AuthError("UNAUTHENTICATED", "session expired");
  }

  return payload;
}

/**
 * Throw AuthError("FORBIDDEN") unless payload.role is one of roles.
 *
 * @param {{role: string}} payload
 * @param {string[]} roles
 */
export function requireRole(payload, roles) {
  if (!payload || !roles.includes(payload.role)) {
    throw new AuthError("FORBIDDEN", "role not permitted");
  }
}
