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
// A reply that cannot be trusted but says nothing about the request itself: the doGet
// misfire (below), Google's busy / error page, a dropped connection.
const LOST_REPLY = new Set(["REDIRECT_MISFIRE", "BAD_RESPONSE", "NETWORK_ERROR"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createWriter({ url, secret, fetchImpl = fetch, retryDelayMs = 1500 }) {
  async function once(action, body) {
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

    // 2026-09-21 (cutover day): under concurrent calls the follow-up of the POST's 302 lands
    // on the web app's doGet, whose body is {ok:true, service, version} - "ok" with none of
    // the action's fields. The POST itself DID run. Seen as Journal reads "with no rows"
    // (09-14), storeDocument replies without url/fileId (1 in 12 during the Drive filing)
    // and 16 of 20 live receipts in error. Only doGet carries `service`; never pass it on.
    if (action !== "ping" && json.service) {
      throw new WriterError("REDIRECT_MISFIRE", `the reply to "${action}" came from doGet; the request ran, its answer was lost`, res.status);
    }

    return json;
  }

  // A read is safe to ask again, so a lost reply is simply asked again (4 tries, growing
  // pause). A write is NOT repeated here: it may have landed - the caller decides
  // (postBatch is idempotent by txn_id; storeDocument would file a second copy).
  async function call(action, body) {
    const tries = action === "read" ? 4 : 1;
    for (let i = 1; ; i++) {
      try {
        return await once(action, body);
      } catch (err) {
        if (i >= tries || !LOST_REPLY.has(err.code)) throw err;
        await sleep(i * retryDelayMs + Math.random() * retryDelayMs);
      }
    }
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
