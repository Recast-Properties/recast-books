// test/books-file.test.mjs — netlify/functions/books-file.mjs, phase2-spec.md section 5
//
// Session-gated only (no writer, no dependency on lib/bookkeeper.mjs or lib/gate.mjs),
// so this file always runs. Blobs traffic is faked with test/helpers/fake-docs-store.mjs.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { issueSession } from "../lib/auth.mjs";
import { resetDocsStoreForTests, getDocsStore } from "../netlify/functions/_shared.mjs";
import { installFakeBlobsContext, makeFakeDocsStore } from "./helpers/fake-docs-store.mjs";

process.env.SESSION_SECRET = "session-secret";
installFakeBlobsContext();

const { default: handler } = await import("../netlify/functions/books-file.mjs");

// A tiny 20x10 red PNG, so the thumbnail path has real image bytes to decode.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABQAAAAKCAYAAAC0VX7mAAAAJUlEQVR4Aa3BAQEAAAiDMKR/51uC7QYjJDGJSUxiEpOYxCQmsQdr2QISg9YJPgAAAABJRU5ErkJggg==";

function session(role, email = `${role}@recast-properties.com`) {
  return issueSession({ email, role, name: role }, process.env.SESSION_SECRET);
}

function req({ key, thumb, token } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const qs = new URLSearchParams();
  if (key !== undefined) qs.set("key", key);
  if (thumb) qs.set("thumb", thumb);
  return new Request(`https://books.test/api/file?${qs.toString()}`, { method: "GET", headers });
}

beforeEach(() => {
  resetDocsStoreForTests();
  const { fetchImpl } = makeFakeDocsStore();
  globalThis.fetch = fetchImpl;
});

test("no session -> 401", async () => {
  const res = await handler(req({ key: "att/doc1/0" }));
  assert.equal(res.status, 401);
});

test("a key outside att/ is rejected", async () => {
  const res = await handler(req({ key: "doc/doc1", token: session("owner") }));
  assert.equal(res.status, 400);
});

test("a key with a traversal-looking segment is rejected", async () => {
  const res = await handler(req({ key: "att/../../etc/passwd/0", token: session("owner") }));
  assert.equal(res.status, 400);
});

test("missing attachment -> 404", async () => {
  const res = await handler(req({ key: "att/doc1/0", token: session("owner") }));
  assert.equal(res.status, 404);
});

test("streams the stored bytes with the stored mime and filename", async () => {
  const store = getDocsStore();
  await store.set("att/doc1/0", Buffer.from("hello world").toString("base64"), {
    metadata: { contentType: "text/plain", filename: "note.txt" },
  });

  const res = await handler(req({ key: "att/doc1/0", token: session("partner") }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/plain");
  assert.match(res.headers.get("content-disposition"), /note\.txt/);
  const text = await res.text();
  assert.equal(text, "hello world");
});

test("?thumb=1 on a PDF returns 404", async () => {
  const store = getDocsStore();
  await store.set("att/doc1/0", Buffer.from("%PDF-1.4 fake").toString("base64"), {
    metadata: { contentType: "application/pdf", filename: "r.pdf" },
  });

  const res = await handler(req({ key: "att/doc1/0", thumb: "1", token: session("owner") }));
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, "NO_THUMB_FOR_PDF");
});

test("?thumb=1 on an image returns a resized JPEG", async () => {
  const store = getDocsStore();
  await store.set("att/doc1/0", TINY_PNG_BASE64, { metadata: { contentType: "image/png", filename: "r.png" } });

  const res = await handler(req({ key: "att/doc1/0", thumb: "1", token: session("owner") }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  const bytes = new Uint8Array(await res.arrayBuffer());
  // JPEG magic bytes
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
});

test("?thumb=1 on unreadable image bytes -> 422", async () => {
  const store = getDocsStore();
  await store.set("att/doc1/0", Buffer.from("not an image").toString("base64"), {
    metadata: { contentType: "image/png", filename: "r.png" },
  });

  const res = await handler(req({ key: "att/doc1/0", thumb: "1", token: session("owner") }));
  assert.equal(res.status, 422);
});

test("POST is not allowed", async () => {
  const res = await handler(new Request("https://books.test/api/file?key=att/doc1/0", { method: "POST" }));
  assert.equal(res.status, 405);
});
