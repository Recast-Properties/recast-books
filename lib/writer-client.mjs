// lib/writer-client.mjs — spec section 9
//
// Thin client for the Apps Script writer web app (apps-script/writer/Code.gs).
// Every call POSTs JSON with the shared secret in the body and resolves to
// the writer's JSON body on ok:true, or throws WriterError on ok:false / a
// non-JSON response. The Apps Script /exec endpoint answers POSTs with a 302
// to a googleusercontent URL, so redirects must be followed.

export class WriterError extends Error {
  /**
   * @param {string} code - the writer's `error` field (or a client-side code
   *   like "BAD_RESPONSE" / "NETWORK_ERROR").
   * @param {string} [message]
   * @param {number} [status] - HTTP status of the response, if one exists.
   */
  constructor(code, message, status) {
    super(message || code);
    this.name = "WriterError";
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.url - the writer's /exec URL
 * @param {string} opts.secret - WRITER_SECRET
 * @param {typeof fetch} [opts.fetchImpl] - injectable for tests
 */
export function createWriter({ url, secret, fetchImpl = fetch }) {
  async function call(action, body) {
    const payload = Object.assign({ action, secret }, body || {});

    let res;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "follow"
      });
    } catch (err) {
      throw new WriterError("NETWORK_ERROR", err && err.message ? err.message : String(err));
    }

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new WriterError("BAD_RESPONSE", "Writer returned a non-JSON response", res.status);
    }

    if (!json || json.ok !== true) {
      const code = (json && json.error) || "UNKNOWN";
      const message = json && json.message;
      throw new WriterError(code, message, res.status);
    }

    return json;
  }

  return {
    ping: () => call("ping"),
    post: (entry) => call("post", { entry }),
    // skipRefresh: a bulk re-post leaves the property tabs alone (the rebuild runs inside the
    // writer's lock - ~88 Ashburne posts in a row starved every other call, 2026-09-17);
    // the caller rebuilds them once at the end (rebuildAllPropertyTabs).
    postBatch: (entries, { skipRefresh } = {}) => call("postBatch", skipRefresh ? { entries, skipRefresh: true } : { entries }),
    void: (txn_id, reason, date, posted_by) => call("void", { txn_id, reason, date, posted_by }),
    read: (tab, { limit, since, all } = {}) => call("read", { tab, limit, since, all }),
    setPeriod: (period, status) => call("setPeriod", { period, status }),
    upsert: (tab, key_column, row) => call("upsert", { tab, key_column, row }),
    // phase2-spec.md section 7 (writer v0.3.0): files one document to Drive under
    // "Recast Books"/<folder segments...>, creating the root and the nested path if
    // needed. Resolves to {ok:true, fileId, url, folderUrl}.
    storeDocument: (name, mime, base64, folder) => call("storeDocument", { name, mime, base64, folder }),
    // phase2.6-spec.md §5 (writer): builds/rebuilds the formula-only property tab
    // named exactly `name`. Resolves to {ok:true, rows}.
    propertyTab: (name) => call("propertyTab", { name })
  };
}
