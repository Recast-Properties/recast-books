// netlify/functions/books-bank-mail.mjs — path /api/bank-mail — D-059
//   POST /api/bank-mail {id, receivedAt, subject, from, bodyText}   (the poller's secret)
//     -> 200 {ok, id}
//
// The bank's own file (QFX) says what was charged, never which card. Citizens' "Daily Summary"
// email does - every line is followed by "9301 - DENNIS C LITTLE". The paul@ poller sends those
// emails here as they arrive; they are kept as they came (the text, nothing parsed) so the reader
// (lib/bank-mail.mjs) can be corrected without asking the mailbox again. The matcher reads them
// when it builds a bank line's card. Nothing here touches the books.

import { requireConfig, json, pollerSecretOk, getCacheStore } from "./_shared.mjs";

export const BANK_MAIL_PREFIX = "bankmail/";
const MAX_BODY = 60000;
// Only the bank's own summaries - the poller's search is the first filter, this is the second.
const SENDERS = [/@cnboftexas\.com>?\s*$/i];

export default async (req) => {
  const configErr = requireConfig(["POLLER_SECRET"]);
  if (configErr) return configErr;
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "BAD_JSON" }); }
  const id = String(body?.id || "").trim();
  const from = String(body?.from || "").trim();
  const bodyText = String(body?.bodyText || "");
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return json(400, { error: "BAD_REQUEST", message: "id is the Gmail message id" });
  if (!SENDERS.some((s) => s.test(from))) return json(400, { error: "BAD_REQUEST", message: "not a bank's summary" });
  if (!bodyText.trim()) return json(400, { error: "BAD_REQUEST", message: "bodyText is empty" });

  await getCacheStore().setJSON(`${BANK_MAIL_PREFIX}${id}`, {
    id, from, subject: String(body?.subject || "").slice(0, 200), receivedAt: String(body?.receivedAt || ""),
    bodyText: bodyText.slice(0, MAX_BODY), storedAt: new Date().toISOString(),
  });
  return json(200, { ok: true, id });
};

export const config = { path: "/api/bank-mail" };
