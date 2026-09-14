// netlify/functions/books-upload.mjs — path /api/upload — phase2-spec.md section 5
//   POST /api/upload {docId?, source, channel, gmailUrl, subject, from, receivedAt,
//                      bodyText, dryRun, attachments:[{name, mime, base64}], reprocess?}
//     -> {docId} | {docId, skipped:true}
//
// Synchronous function (Netlify's ~6 MB request cap on a normal function, not the
// ~256 KB background-invocation cap that keeps bytes off books-ingest-background.mjs
// - see that file's header and ../../../Recast-site/netlify/functions/receipts-upload.mjs
// for the reference pattern this mirrors). Auth is session OR the poller shared
// secret (header x-poller-secret): the Recast Books Poller Apps Script has no Google
// session, only the secret.
//
// Writes the attachments to att/<docId>/<i> (base64 text, matching books-file.mjs's
// reader) and a "processing" envelope to doc/<docId>, then invokes
// books-ingest-background over HTTP with the poller secret so it runs as a genuine
// Netlify background invocation regardless of who called books-upload.

import {
  requireConfig,
  json,
  getDocsStore,
  getSessionPayload,
  authErrorResponse,
  pollerSecretOk,
  getWriter,
  readTab,
  rowsToObjectsPublic,
} from "./_shared.mjs";
import { isOpenProperty } from "../../lib/property-key.mjs";

const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const VALID_SOURCES = new Set(["email", "upload"]);
const VALID_CHANNELS = new Set(["receipts", "travel", "upload"]);

// phase2.6-spec.md §4: channel may also be the exact (trimmed) name of a property
// currently held or under contract — the mailbox for that property. Only consulted
// when the channel isn't already one of the three fixed values, so the common path
// never needs WRITER_URL/WRITER_SECRET configured.
async function isRegisteredPropertyChannel(channel) {
  if (!process.env.WRITER_URL || !process.env.WRITER_SECRET) return false;
  try {
    const resp = await readTab(getWriter(), "Properties");
    const rows = rowsToObjectsPublic(resp.headers, resp.rows);
    return rows.some(
      (r) => isOpenProperty(r) && String(r.name || "").trim() === channel.trim(),
    );
  } catch {
    return false;
  }
}
const TERMINAL_SKIP_STATUSES = new Set(["posted", "dismissed", "pending"]);
// docId is used verbatim inside Blobs keys (doc/<docId>, att/<docId>/<i>) and later
// inside Drive folder/file naming - restrict to a safe charset so nothing resembling
// a path-traversal or a stray "/" can reach either.
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;

function newUuid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function base64Bytes(b64) {
  // Decoded byte length without materializing the buffer twice - close enough for
  // the 6 MB gate (base64 has at most 2 bytes of padding slack per 4 chars).
  const clean = String(b64 || "").replace(/=+$/, "");
  return Math.floor((clean.length * 3) / 4);
}

export default async (req) => {
  const configErr = requireConfig(["SESSION_SECRET", "POLLER_SECRET"]);
  if (configErr) return configErr;

  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const isPoller = pollerSecretOk(req);
  let session = null;
  if (!isPoller) {
    try {
      session = getSessionPayload(req);
    } catch (err) {
      const resp = authErrorResponse(err);
      if (resp) return resp;
      throw err;
    }
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "BAD_REQUEST", message: "expected a JSON body" });
  }

  const source = String(body.source || "");
  const channel = String(body.channel || "");
  if (!VALID_SOURCES.has(source)) {
    return json(400, { error: "BAD_REQUEST", message: 'source must be "email" or "upload"' });
  }
  if (!VALID_CHANNELS.has(channel) && !(await isRegisteredPropertyChannel(channel))) {
    return json(400, {
      error: "BAD_REQUEST",
      message: 'channel must be "receipts", "travel", "upload", or the name of a held property',
    });
  }

  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  for (const att of attachments) {
    if (!att || typeof att.base64 !== "string" || !att.base64) {
      return json(400, { error: "BAD_REQUEST", message: "every attachment needs base64 content" });
    }
    if (base64Bytes(att.base64) > MAX_ATTACHMENT_BYTES) {
      return json(413, { error: "ATTACHMENT_TOO_LARGE", message: `"${att.name || "attachment"}" exceeds 6 MB` });
    }
  }

  const dryRun = body.dryRun === true || body.dryRun === "true";

  // docId (spec section 1): "gm-<gmailMessageId>" for email, "up-<uuid>" for web
  // uploads, "dry-" prefixed in front for dry runs. The poller (which alone knows
  // the Gmail message id) is expected to compute and pass "gm-<id>" as `docId`
  // itself; a web upload with no client-supplied id gets "up-<uuid>" here. See this
  // task's report for why: only the caller's layer has the raw source id to prefix.
  let docId = String(body.docId || "").trim();
  if (!docId) {
    if (source === "email") {
      return json(400, { error: "BAD_REQUEST", message: "docId is required for source \"email\"" });
    }
    docId = `up-${newUuid()}`;
  }
  if (dryRun && !docId.startsWith("dry-")) {
    docId = `dry-${docId}`;
  }
  if (!DOC_ID_RE.test(docId)) {
    return json(400, { error: "BAD_REQUEST", message: "docId contains characters outside [A-Za-z0-9_-]" });
  }

  const store = getDocsStore();
  const envelopeKey = `doc/${docId}`;
  const reprocess = body.reprocess === true || body.reprocess === "true";

  if (!reprocess) {
    const existing = await store.get(envelopeKey, { type: "json" });
    if (existing && TERMINAL_SKIP_STATUSES.has(existing.status)) {
      return json(200, { docId, skipped: true });
    }
  }

  const now = new Date().toISOString();
  const storedAttachments = [];
  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const key = `att/${docId}/${i}`;
    await store.set(key, att.base64, {
      metadata: { contentType: String(att.mime || "application/octet-stream"), filename: String(att.name || "") },
    });
    storedAttachments.push({
      key,
      name: String(att.name || ""),
      mime: String(att.mime || "application/octet-stream"),
      bytes: base64Bytes(att.base64),
    });
  }

  const envelope = {
    docId,
    source,
    channel,
    dryRun,
    gmailUrl: String(body.gmailUrl || ""),
    subject: String(body.subject || ""),
    from: String(body.from || ""),
    receivedAt: String(body.receivedAt || now),
    bodyText: String(body.bodyText || ""),
    attachments: storedAttachments,
    status: "processing",
    startedAt: now,
    finishedAt: "",
    error: "",
    model: null,
    gate: null,
    result: null,
    review: null,
  };

  try {
    await store.setJSON(envelopeKey, envelope);
  } catch (err) {
    return json(502, { error: "STORE_ERROR", message: String((err && err.message) || err) });
  }

  // Invoke books-ingest-background as a real HTTP request against this deploy's own
  // origin, so Netlify dispatches it as a background invocation (immediate 202,
  // work continues async) regardless of whether we were called by the poller or a
  // signed-in browser upload.
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/api/ingest-bg`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET },
      body: JSON.stringify({ docId }),
    });
    if (res.status !== 202 && res.status !== 200) {
      throw new Error(`ingest-bg invocation returned HTTP ${res.status}`);
    }
  } catch (err) {
    // Never leave a half state (phase2-spec.md section 5): if the hand-off to the
    // background function itself failed, the envelope must say so rather than sit
    // in "processing" forever with nothing ever going to touch it again. A human
    // (or the poller's next run via books-inbox reprocess) can retry from here.
    const errored = {
      ...envelope,
      status: "error",
      error: `failed to invoke ingest: ${String((err && err.message) || err)}`,
      finishedAt: new Date().toISOString(),
    };
    try {
      await store.setJSON(envelopeKey, errored);
    } catch {
      // best-effort only - the processing envelope written above is still the trail
    }
    return json(502, { error: "INGEST_INVOKE_FAILED", message: errored.error, docId });
  }

  return json(200, { docId });
};

export const config = { path: "/api/upload" };
