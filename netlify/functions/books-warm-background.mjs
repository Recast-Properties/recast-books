// netlify/functions/books-warm-background.mjs — path /api/warm-bg — phase2.5-spec.md.
// Refreshes every tab's books-cache snapshot from the writer so no user request is
// ever the first (cold, 8 s-capped) read of a tab. Background function: the writer can
// take 10–15 s cold and this has minutes. Invoked by books-warm.mjs on a schedule, or
// by anything holding POLLER_SECRET (header x-poller-secret).
import { requireConfig, json, getWriter, refreshTab, pollerSecretOk } from "./_shared.mjs";

export const WARM_TABS = ["Users", "Settings", "Accounts", "Properties", "Bank accounts", "Vendors", "Periods", "Advances", "Journal"];
const WARM_TIMEOUT_MS = 120 * 1000;

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
  return json(200, { warmed: WARM_TABS.length - failed.length, failed });
};

export const config = { path: "/api/warm-bg" };
