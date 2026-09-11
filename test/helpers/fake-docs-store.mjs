// test/helpers/fake-docs-store.mjs — an in-memory stand-in for the Netlify Blobs
// "books-docs" store, used by every test that exercises a phase 2 function reading
// or writing it (books-upload, books-ingest-background, books-inbox, books-file,
// books-summary).
//
// @netlify/blobs' "API access" mode (the mode getStore() falls into once
// NETLIFY_BLOBS_CONTEXT names an apiURL - which is exactly what a real Netlify
// Functions v2 deploy auto-populates) is a TWO-HOP protocol, not a single request:
//   1. GET/PUT/DELETE https://<apiURL>/api/v1/blobs/<siteID>/site:<store>[/<key>]
//      -> {url: "<signed content URL>"} (GET/PUT) or 200 with no body (DELETE)
//   2. GET/PUT that signed URL for the actual bytes; metadata travels as a
//      base64-JSON header (netlify-blobs-metadata / x-amz-meta-user, whichever the
//      client sends) on whichever hop carries it.
// (Confirmed empirically against node_modules/@netlify/blobs's actual request
// traffic while building this task's tests - see this task's report for how.)
// This fake implements just enough of that protocol - get/getWithMetadata/set/
// setJSON/delete/list with a prefix - for the functions under test, entirely
// in-memory, so no test ever makes a real network call.

const METADATA_HEADERS = ["netlify-blobs-metadata", "x-amz-meta-user"];

function decodeMetadataHeader(headers) {
  if (!headers) return null;
  for (const name of METADATA_HEADERS) {
    const value = headers[name] || headers[name.toLowerCase()];
    if (typeof value === "string" && value.startsWith("b64;")) {
      return JSON.parse(Buffer.from(value.slice(4), "base64").toString("utf8"));
    }
  }
  return null;
}

function encodeMetadataHeader(metadata) {
  return "b64;" + Buffer.from(JSON.stringify(metadata || {})).toString("base64");
}

async function bodyToString(body) {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  // A ReadableStream or other body type - read it through Response, same as the
  // real client would end up doing on the server side.
  return new Response(body).text();
}

/**
 * @returns {{ fetchImpl, items: Map<string, {data:string, metadata:object|null}> }}
 *   `items` is exposed so a test can seed/inspect state directly without going
 *   through the wire protocol.
 */
export function makeFakeDocsStore({ apiOrigin = "https://blobs.test", contentOrigin = "https://blobs-content.test" } = {}) {
  const items = new Map();
  const pendingMetadata = new Map(); // key -> metadata captured on the management-API hop, for the content PUT that follows

  async function fetchImpl(input, init = {}) {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = (init.method || "get").toLowerCase();
    const headers = init.headers || {};

    if (url.origin === contentOrigin) {
      const key = decodeURIComponent(url.pathname.slice(1));
      if (method === "get") {
        const item = items.get(key);
        if (!item) return new Response("", { status: 404 });
        const respHeaders = { "content-type": "text/plain" };
        if (item.metadata) respHeaders["netlify-blobs-metadata"] = encodeMetadataHeader(item.metadata);
        return new Response(item.data, { status: 200, headers: respHeaders });
      }
      if (method === "put") {
        const data = await bodyToString(init.body);
        const metadata = decodeMetadataHeader(headers) ?? pendingMetadata.get(key) ?? null;
        items.set(key, { data, metadata });
        pendingMetadata.delete(key);
        return new Response("", { status: 200 });
      }
      return new Response("", { status: 405 });
    }

    if (url.origin === apiOrigin && url.pathname.startsWith("/api/v1/blobs/")) {
      const rest = url.pathname.slice("/api/v1/blobs/".length).split("/");
      // rest = [siteID, "site:<store>", ...keyParts]
      const key = rest.slice(2).join("/");

      if (method === "get" && url.searchParams.has("prefix")) {
        const prefix = url.searchParams.get("prefix") || "";
        const blobs = [...items.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ key: k }));
        return new Response(JSON.stringify({ blobs, directories: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (method === "get") {
        // The real API always hands back a signed URL for GET, whether or not the
        // key exists - "not found" only surfaces at the content hop below (matches
        // an S3-style presigned-URL backend; confirmed empirically, see this file's
        // header comment).
        return new Response(JSON.stringify({ url: `${contentOrigin}/${encodeURIComponent(key)}` }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (method === "put") {
        const metadata = decodeMetadataHeader(headers);
        if (metadata) pendingMetadata.set(key, metadata);
        return new Response(JSON.stringify({ url: `${contentOrigin}/${encodeURIComponent(key)}` }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (method === "delete") {
        items.delete(key);
        return new Response("", { status: 200 });
      }
    }

    return new Response("", { status: 404 });
  }

  return { fetchImpl, items };
}

/**
 * Sets NETLIFY_BLOBS_CONTEXT so _shared.mjs's getDocsStore() (a bare
 * getStore({name, consistency})) resolves to API-access mode against the given
 * origin, matching what a real Netlify deploy auto-populates. Call once per test
 * file (module scope is fine - the origin/siteID are fixed fakes, not secrets).
 */
export function installFakeBlobsContext({ apiOrigin = "https://blobs.test", siteID = "test-site", token = "test-token" } = {}) {
  process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ apiURL: apiOrigin, siteID, token })).toString("base64");
}
