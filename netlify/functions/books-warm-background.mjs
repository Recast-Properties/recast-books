// netlify/functions/books-warm-background.mjs — path /api/warm-bg — phase2.5-spec.md.
// Refreshes every tab's books-cache snapshot from the writer so no user request is
// ever the first (cold, 8 s-capped) read of a tab. Background function: the writer can
// take 10–15 s cold and this has minutes. Invoked by books-warm.mjs on a schedule, or
// by anything holding POLLER_SECRET (header x-poller-secret).
import { requireConfig, json, getWriter, getDocsStore, refreshTab, pollerSecretOk } from "./_shared.mjs";

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

export async function retryErroredDocs(origin, docsStore) {
  // ponytail: full scan of doc/* every run; index error docs if the store grows past a few hundred
  const { blobs } = await docsStore.list({ prefix: "doc/" });
  const retried = [];
  for (const b of blobs || []) {
    const env = await docsStore.get(b.key, { type: "json" });
    if (!env || env.status !== "error" || (env.retries || 0) >= MAX_AUTO_RETRIES) continue;
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
  return json(200, { warmed: WARM_TABS.length - failed.length, failed, retried });
};

export const config = { path: "/api/warm-bg" };
