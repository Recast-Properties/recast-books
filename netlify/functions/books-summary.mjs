// netlify/functions/books-summary.mjs — path /api/summary — phase2-spec.md section 5
//   GET /api/summary?date=YYYY-MM-DD
//     -> {date, posted:[...], pending:[...why], dismissed:[...], errors:[...], totals, check}
//   `check` is the latest nightly books check (books-reconcile-background.mjs): {date, ranAt, text, error}.
//   Auth: session OR the poller shared secret (the Apps Script daily digest has no
//   Google session - phase2-spec.md section 6's dailyDigest calls this with
//   x-poller-secret, same as books-upload.mjs).
//
// Built entirely from the envelopes already sitting in the "books-docs" Blobs store
// (no writer call needed) - each envelope already carries everything the digest
// needs: the model's verdict/why, the gate's reasons, and (for a posted item) the
// proposed entries' items, which this file aggregates into a per-account summary.
// Dry-run envelopes are excluded - they are a test read, not real bookkeeping
// activity for the day (see this task's report for this interpretation).

import { requireConfig, json, getDocsStore, getCacheStore, getSessionPayload, authErrorResponse, pollerSecretOk } from "./_shared.mjs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function chicagoDateOf(isoTimestamp) {
  if (!isoTimestamp) return "";
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // en-CA formats as YYYY-MM-DD
}

function todayChicago() {
  return chicagoDateOf(new Date().toISOString());
}

/** Per-account totals across every proposed entry's items, for the posted bucket. */
function accountSummaryFor(model) {
  const totals = new Map();
  for (const entry of (model && model.entries) || []) {
    for (const item of entry.items || []) {
      const account = item.account;
      if (!account) continue;
      totals.set(account, (totals.get(account) || 0) + (Number(item.amount_cents) || 0));
    }
  }
  return [...totals.entries()].map(([account, amount_cents]) => ({ account, amount_cents }));
}

function propertyOf(model) {
  const first = (model && model.entries && model.entries[0]) || {};
  return first.property || "";
}

export default async (req) => {
  const configErr = requireConfig(["SESSION_SECRET", "POLLER_SECRET"]);
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
  const dateParam = url.searchParams.get("date");
  if (dateParam && !ISO_DATE.test(dateParam)) {
    return json(400, { error: "BAD_REQUEST", message: "date must be YYYY-MM-DD" });
  }
  const date = dateParam || todayChicago();

  const store = getDocsStore();
  let envelopes;
  try {
    const { blobs } = await store.list({ prefix: "doc/" });
    const loaded = await Promise.all((blobs || []).map((b) => store.get(b.key, { type: "json" })));
    envelopes = loaded.filter(Boolean).filter((e) => !e.dryRun);
  } catch (err) {
    return json(502, { error: "STORE_ERROR", message: String((err && err.message) || err) });
  }

  const forDate = envelopes.filter((e) => chicagoDateOf(e.finishedAt || e.startedAt) === date);

  const posted = forDate
    .filter((e) => e.status === "posted")
    .map((e) => ({
      docId: e.docId,
      vendor: (e.model && e.model.vendor) || "",
      total_cents: (e.model && e.model.receipt_total_cents) || 0,
      property: propertyOf(e.model),
      account_summary: accountSummaryFor(e.model),
      txn_ids: (e.result && e.result.txn_ids) || [],
    }));

  const pending = forDate
    .filter((e) => e.status === "pending")
    .map((e) => ({
      docId: e.docId,
      vendor: (e.model && e.model.vendor) || "",
      date: (e.model && e.model.date) || "",
      receipt_total_cents: (e.model && e.model.receipt_total_cents) || 0,
      why: (e.model && e.model.why) || "",
      gate_reasons: (e.gate && e.gate.reasons) || [],
    }));

  const dismissed = forDate
    .filter((e) => e.status === "dismissed")
    .map((e) => ({
      docId: e.docId,
      vendor: (e.model && e.model.vendor) || "",
      duplicate_of: (e.model && e.model.duplicate_of) || "",
      note: (e.review && e.review.note) || "",
    }));

  const errors = forDate
    .filter((e) => e.status === "error")
    .map((e) => ({
      docId: e.docId,
      subject: e.subject || "",
      vendor: (e.model && e.model.vendor) || "",
      error: e.error || "",
    }));

  const totals = {
    posted_count: posted.length,
    posted_total_cents: posted.reduce((sum, p) => sum + (p.total_cents || 0), 0),
    pending_count: pending.length,
    dismissed_count: dismissed.length,
    error_count: errors.length,
  };

  // The nightly check (books-reconcile-background.mjs) - the digest prints it first.
  let check = null;
  try {
    const latest = await getCacheStore().get("reconcile/latest", { type: "json" });
    if (latest) check = { date: latest.date, ranAt: latest.ranAt, text: latest.text, error: latest.error };
  } catch { /* no check tonight is not a failure of the summary */ }

  return json(200, { date, posted, pending, dismissed, errors, totals, check });
};

export const config = { path: "/api/summary" };
