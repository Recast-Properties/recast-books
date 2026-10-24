// netlify/functions/books-warm-background.mjs — path /api/warm-bg — phase2.5-spec.md.
// Refreshes every tab's books-cache snapshot from the writer so no user request is
// ever the first (cold, 8 s-capped) read of a tab. Background function: the writer can
// take 10–15 s cold and this has minutes. Invoked by books-warm.mjs on a schedule, or
// by anything holding POLLER_SECRET (header x-poller-secret).
import { requireConfig, json, getWriter, getDocsStore, getCacheStore, refreshTab, pollerSecretOk, loadDocIndex, stampHeartbeat } from "./_shared.mjs";

export const WARM_TABS = ["Users", "Settings", "Accounts", "Properties", "Bank accounts", "Vendors", "Periods", "Advances", "Journal"];
const WARM_TIMEOUT_MS = 120 * 1000;

// Errored documents that never got as far as the model (a cold-writer 502 on the
// pre-read, a Blobs hiccup) are retried here, on the poller's 15-min cadence: the
// poller labelled the thread books-done at upload time, so nothing else ever re-sends
// them (audit 2026-09-16: an Uber Eats doc sat in `error` for three days). A doc with
// no `model` is read again; one whose read is stored (a writer hiccup after the model
// ran - "no rows", a doGet misfire, a timeout: three Anthropic receipts 2026-09-21/25)
// is re-posted from that read (fromStored, $0). Both go back through the gate, and a
// replay of an entry that did land is refused by the writer as a DUPLICATE. At most
// MAX_AUTO_RETRIES times each.
export const MAX_AUTO_RETRIES = 2;
// Only mail the live pollers brought in. Migration-era envelopes (read on staging
// 2026-09-17/18, errored there) sat in `error` too, and the first run of the stored-read
// replay on 2026-09-25 posted two of them onto the real books - one a twin of a migrated
// row that the 60-day duplicate window could not see (Sherwin-Williams 03-22, voided).
export const RETRY_SINCE = "2026-09-17";
export const MAX_RETRIES_PER_RUN = 2; // the writer serialises reads; a burst of replays times them all out
// A read that died mid-run (the 15-minute cap, memory on a big photo, a platform fault) leaves its envelope at
// "processing" with nothing to retry it: the poller labelled the thread at upload and the Inbox lists pending only
// (audit 2026-10-24 #4). Past this age a "processing" envelope is an error in all but name - no real read has
// run anywhere near it since reads came off the writer (D-047). books-upload.mjs uses the same bar.
export const STUCK_MS = 30 * 60 * 1000;

export async function retryErroredDocs(origin, docsStore, nowMs = Date.now()) {
  // Audit 2026-10-24 #9: this run keeps the document index fresh (one list, the changed documents) and reads the
  // candidates off it; only those few are fetched whole.
  const isStuck = (d) => d.status === "processing" && nowMs - Date.parse(d.startedAt || 0) > STUCK_MS;
  const candidates = (await loadDocIndex(docsStore)).filter((d) => (d.status === "error" || isStuck(d)) && (d.retries || 0) < MAX_AUTO_RETRIES &&
    String(d.receivedAt || d.startedAt || "").slice(0, 10) >= RETRY_SINCE);
  const retried = [];
  for (const b of candidates) {
    if (retried.length >= MAX_RETRIES_PER_RUN) break;
    const env = await docsStore.get(b.key, { type: "json" });
    if (!env) continue;
    const stuck = env.status === "processing" && nowMs - Date.parse(env.startedAt || 0) > STUCK_MS;
    if ((env.status !== "error" && !stuck) || (env.retries || 0) >= MAX_AUTO_RETRIES) continue;
    const fromStored = !!(env.model && env.model.verdict);
    const now = new Date().toISOString();
    const reset = { ...env, status: "processing", startedAt: now, finishedAt: "", error: "", gate: null, result: null, retries: (env.retries || 0) + 1 };
    await docsStore.setJSON(b.key, reset);
    try {
      const res = await fetch(`${origin}/api/ingest-bg`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET },
        body: JSON.stringify(fromStored ? { docId: env.docId, fromStored: true } : { docId: env.docId, reprocess: true }),
      });
      if (res.status !== 202 && res.status !== 200) throw new Error(`ingest-bg invocation returned HTTP ${res.status}`);
      retried.push(env.docId);
    } catch (err) {
      const errored = { ...reset, status: "error", error: `failed to invoke ingest: ${String((err && err.message) || err)}`, finishedAt: new Date().toISOString() };
      try { await docsStore.setJSON(b.key, errored); } catch { /* best-effort */ }
    }
  }
  return retried;
}

export default async (req) => {
  const configErr = requireConfig(["WRITER_URL", "WRITER_SECRET", "POLLER_SECRET"]);
  if (configErr) return configErr;
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });
  // Audit 2026-10-24 #10c: a kick from a poller names its mailbox and what the poll did - the heartbeat. The
  // site's own 5-minute schedule sends no body and stamps nothing, so quiet pollers show as quiet.
  let kick = null;
  try { kick = await req.json(); } catch { kick = null; }
  let heartbeat = false;
  if (kick && kick.mailbox) {
    try { heartbeat = await stampHeartbeat(getCacheStore(), String(kick.mailbox), { sent: Number(kick.sent) || 0, failed: Number(kick.failed) || 0, polled_at: String(kick.at || "") }); }
    catch (err) { console.error("warm: heartbeat not stamped: " + String((err && err.message) || err)); }
  }
  const writer = getWriter();
  const failed = [];
  for (const tab of WARM_TABS) {
    try {
      await refreshTab(writer, tab, { timeoutMs: WARM_TIMEOUT_MS });
    } catch (err) {
      failed.push(`${tab}: ${String((err && err.message) || err)}`);
    }
  }
  if (failed.length) console.error("warm: " + failed.join("; "));
  let retried = [];
  try {
    retried = await retryErroredDocs(new URL(req.url).origin, getDocsStore());
  } catch (err) {
    console.error("warm: error-doc retry scan failed: " + String((err && err.message) || err));
  }
  if (retried.length) console.log("warm: retried errored doc(s) " + retried.join(", "));
  return json(200, { warmed: WARM_TABS.length - failed.length, failed, retried, heartbeat });
};

export const config = { path: "/api/warm-bg" };
