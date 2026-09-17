// netlify/functions/books-file.mjs — path /api/file — phase2-spec.md section 5
//   GET /api/file?key=att/<docId>/<i>[&thumb=1]
//     -> streams the attachment bytes with the stored mime; ?thumb=1 returns a
//        jimp-resized 480px JPEG (PDFs 404 for thumb). Session-gated, any role -
//        or header x-poller-secret (the workbook's Inbox sidebar, Menu.gs).
//
// Bytes live in the "books-docs" Blobs store at att/<docId>/<i>, stored as base64
// text by books-upload.mjs (metadata carries contentType/filename) - this is the
// only function that ever reads them back out for a browser.

import { requireConfig, json, getDocsStore, getSessionPayload, authErrorResponse, pollerSecretOk } from "./_shared.mjs";
import { Jimp, JimpMime } from "jimp";

const KEY_RE = /^att\/[A-Za-z0-9_-]{1,200}\/\d+$/;
const THUMB_WIDTH = 480;

export default async (req) => {
  const configErr = requireConfig(["SESSION_SECRET"]);
  if (configErr) return configErr;

  if (req.method !== "GET") return json(405, { error: "METHOD_NOT_ALLOWED" });

  if (!pollerSecretOk(req)) {
    try {
      getSessionPayload(req);
    } catch (err) {
      const resp = authErrorResponse(err);
      if (resp) return resp;
      throw err;
    }
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  if (!KEY_RE.test(key)) {
    return json(400, { error: "BAD_REQUEST", message: "key must look like att/<docId>/<index>" });
  }
  const wantThumb = url.searchParams.get("thumb") === "1";

  const store = getDocsStore();
  let entry;
  try {
    entry = await store.getWithMetadata(key, { type: "text" });
  } catch (err) {
    return json(502, { error: "STORE_ERROR", message: String((err && err.message) || err) });
  }
  if (!entry || !entry.data) {
    return json(404, { error: "NOT_FOUND", message: `no attachment at ${key}` });
  }

  const mime = (entry.metadata && entry.metadata.contentType) || "application/octet-stream";
  const filename = (entry.metadata && entry.metadata.filename) || "";
  const bytes = Buffer.from(entry.data, "base64");

  if (wantThumb) {
    if (mime === "application/pdf") {
      return json(404, { error: "NO_THUMB_FOR_PDF", message: "PDFs have no thumbnail" });
    }
    let image;
    try {
      image = await Jimp.read(bytes);
    } catch (err) {
      return json(422, { error: "BAD_IMAGE", message: String((err && err.message) || err) });
    }
    image.scaleToFit({ w: THUMB_WIDTH, h: THUMB_WIDTH });
    const jpegBytes = await image.getBuffer(JimpMime.jpeg);
    return new Response(jpegBytes, {
      status: 200,
      headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600" },
    });
  }

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": mime,
      "content-disposition": filename ? `inline; filename="${filename.replace(/"/g, "")}"` : "inline",
      "cache-control": "private, max-age=3600",
    },
  });
};

export const config = { path: "/api/file" };
