// netlify/functions/books-auth.mjs — POST /api/auth {id_token} -> {session, user} — spec §5, §9

import { requireConfig, json, getWriter, getUsersByEmail, authErrorResponse } from "./_shared.mjs";
import { verifyGoogleIdToken, issueSession } from "../../lib/auth.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return json(405, { error: "METHOD_NOT_ALLOWED" });
  }

  const configErr = requireConfig(["GOOGLE_CLIENT_ID", "WRITER_URL", "WRITER_SECRET", "SESSION_SECRET"]);
  if (configErr) return configErr;

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "BAD_REQUEST", message: "expected a JSON body" });
  }

  const idToken = body && body.id_token;
  if (!idToken) {
    return json(400, { error: "BAD_REQUEST", message: "id_token is required" });
  }

  let googleUser;
  try {
    googleUser = await verifyGoogleIdToken(idToken, { clientId: process.env.GOOGLE_CLIENT_ID });
  } catch (err) {
    const resp = authErrorResponse(err);
    if (resp) return resp;
    return json(401, { error: "INVALID_TOKEN", message: String((err && err.message) || err) });
  }

  const writer = getWriter();
  let usersByEmail;
  try {
    usersByEmail = await getUsersByEmail(writer);
  } catch (err) {
    return json(502, { error: "WRITER_UNAVAILABLE", message: String((err && err.message) || err) });
  }

  const record = usersByEmail.get(googleUser.email.trim().toLowerCase());
  if (!record) {
    // spec §5: unknown email -> 403 NOT_ALLOWED, no session, no further detail.
    return json(403, { error: "NOT_ALLOWED" });
  }

  const user = { email: googleUser.email, role: record.role, name: record.name || googleUser.name || "" };
  const session = issueSession(user, process.env.SESSION_SECRET);
  return json(200, { session, user });
};

export const config = { path: "/api/auth" };
