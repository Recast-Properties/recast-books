// netlify/functions/books-config.mjs — GET /api/config (public, no session) — spec §9
//
// The one function that does not require Authorization: Bearer — the sign-in screen
// needs the Google client id before any session exists.

import { requireConfig, json } from "./_shared.mjs";

export default async (req) => {
  if (req.method !== "GET") {
    return json(405, { error: "METHOD_NOT_ALLOWED" });
  }

  const configErr = requireConfig(["GOOGLE_CLIENT_ID"]);
  if (configErr) return configErr;

  return json(200, {
    google_client_id: process.env.GOOGLE_CLIENT_ID,
    site_name: "Recast Books",
  });
};

export const config = { path: "/api/config" };
