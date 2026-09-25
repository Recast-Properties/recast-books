// netlify/functions/books-reconcile-background.mjs — path /api/reconcile-bg
//   POST (poller secret) {}  -> runs the nightly books check, stores it, 200
//
// Part 3 of the 2026-09-25 plan. On 09-25 the books were checked by hand and that found
// two duplicate entries and four envelopes that disagreed with the Journal. That is
// judgment work; it happens every night now, before Paul's digest. CODE gathers the facts
// from the books-cache Journal snapshot and the docs store (both cheap after D-047); THE
// MODEL reads the table once (no tools) and writes at most eight bullets, each an action in
// Paul's words, or "Books check: clean." Stored at books-cache `reconcile/<date>` and
// `reconcile/latest`; /api/summary returns it as `check`; the paul@ poller's dailyDigest
// prints it first. It never writes to the workbook - voids and approves stay Paul's clicks.
import Anthropic from "@anthropic-ai/sdk";
import { requireConfig, json, pollerSecretOk, getWriter, getDocsStore, getCacheStore, readTab } from "./_shared.mjs";
import { MODEL_ID } from "../../lib/bookkeeper.mjs";

const MAX_TOKENS = 4000;
const STALE_MS = 60 * 60 * 1000;
// The production Journal was born on the cutover day; envelopes posted before it record
// staging txn_ids that never existed here (272 of them on the first run, 2026-09-25).
const CUTOVER = "2026-09-21";
const MAX_ITEMS = 40; // per list in the prompt; the rest is a count

let clientForTests = null;
export function setAnthropicForTests(client) { clientForTests = client; }

const norm = (p) => String(p || "").toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");
const cents = (v) => Math.round(Number(v || 0) * 100);
const money = (c) => (c / 100).toFixed(2);

/**
 * The facts. Pure: (headers, rows) of the Journal and the list of envelopes in.
 * Mirrors reportDuplicateReplays in apps-script/writer/Code.gs for (c).
 */
export function gatherFacts(journal, envelopes, now = Date.now()) {
  const idx = Object.fromEntries(journal.headers.map((h, i) => [h, i]));
  const g = (r, n) => (idx[n] === undefined ? "" : r[idx[n]]);
  const rows = journal.rows;
  const voided = new Set(rows.map((r) => String(g(r, "void_of") || "")).filter(Boolean));
  const live = rows.filter((r) => String(g(r, "source")) !== "void" && !voided.has(String(g(r, "txn_id"))));
  const journalIds = new Set(rows.map((r) => String(g(r, "txn_id"))));

  // one record per live entry
  const byTxn = new Map();
  for (const r of live) {
    const id = String(g(r, "txn_id"));
    const e = byTxn.get(id) || { txn_id: id, date: String(g(r, "date")), payee: String(g(r, "payee")), property: "", source: String(g(r, "source")), debit: 0, doc_url: "", posted_at: String(g(r, "posted_at")), memo: String(g(r, "memo") || "").slice(0, 160) };
    e.debit += cents(g(r, "debit"));
    if (!e.property && g(r, "property")) e.property = String(g(r, "property"));
    if (!e.doc_url && g(r, "doc_url")) e.doc_url = String(g(r, "doc_url"));
    byTxn.set(id, e);
  }
  const entries = [...byTxn.values()];

  const posted = envelopes.filter((e) => e.status === "posted" && !e.dryRun);
  const postedIds = new Set(posted.flatMap((e) => e.result?.txn_ids || []));

  // (a) posted envelopes (since the cutover) whose txn_ids are not on the Journal
  const envelope_not_on_journal = posted
    .filter((e) => String(e.review?.at || e.finishedAt || "") >= CUTOVER)
    .filter((e) => (e.result?.txn_ids || []).some((t) => !journalIds.has(t)))
    .map((e) => ({ docId: e.docId, vendor: e.model?.vendor || "", total: money(e.model?.receipt_total_cents || 0), missing: (e.result.txn_ids || []).filter((t) => !journalIds.has(t)) }));

  // (b) receipt entries with no posted envelope naming them
  const journal_not_in_envelopes = entries
    .filter((e) => e.source === "receipt" && !postedIds.has(e.txn_id))
    .map((e) => ({ txn_id: e.txn_id, date: e.date, payee: e.payee, total: money(e.debit), property: e.property }));

  // (c) live entries sharing date + normalised payee + debit total (live-vs-live and live-vs-migration)
  const groups = new Map();
  for (const e of entries) {
    if (e.source === "sale" || e.debit <= 0) continue;
    const k = `${e.date}|${norm(e.payee)}|${e.debit}`;
    (groups.get(k) || groups.set(k, []).get(k)).push(e);
  }
  // Two migrated rows alike are the old books as Paul kept them (D-027), not a finding.
  const possible_duplicates = [...groups.values()].filter((gr) => gr.length > 1 && gr.some((e) => e.source !== "migration"))
    .map((gr) => ({ date: gr[0].date, payee: gr[0].payee, total: money(gr[0].debit), entries: gr.map((e) => `${e.txn_id} (${e.source}, ${e.property || "no property"}${e.memo ? `; memo: ${e.memo}` : ""})`) }));

  // (d) receipt entries with no document
  const receipts_without_document = entries.filter((e) => e.source === "receipt" && !e.doc_url)
    .map((e) => ({ txn_id: e.txn_id, date: e.date, payee: e.payee, total: money(e.debit) }));

  // (e) stuck and errored envelopes
  const stuck = envelopes.filter((e) => (e.status === "processing" || e.status === "posting") && now - Date.parse(e.posting_at || e.startedAt || 0) > STALE_MS)
    .map((e) => ({ docId: e.docId, status: e.status, since: e.posting_at || e.startedAt || "", vendor: e.model?.vendor || e.subject || "" }));
  const errors = envelopes.filter((e) => e.status === "error" && !e.dryRun)
    .map((e) => ({ docId: e.docId, vendor: e.model?.vendor || e.subject || "", received: String(e.receivedAt || e.startedAt || "").slice(0, 10), error: String(e.error || "").slice(0, 160) }));

  // (f) the queue
  const pending = envelopes.filter((e) => e.status === "pending" && !e.dryRun);
  const oldest = pending.map((e) => e.finishedAt || e.startedAt || "").filter(Boolean).sort()[0] || "";

  // (g) the books balance
  const debits = rows.reduce((s, r) => s + cents(g(r, "debit")), 0);
  const credits = rows.reduce((s, r) => s + cents(g(r, "credit")), 0);

  const cap = (list) => (list.length > MAX_ITEMS ? [...list.slice(0, MAX_ITEMS), `... and ${list.length - MAX_ITEMS} more`] : list);
  return {
    journal_rows: rows.length, live_entries: entries.length,
    balance: { debits: money(debits), credits: money(credits), balanced: debits === credits },
    envelope_not_on_journal: cap(envelope_not_on_journal), journal_not_in_envelopes: cap(journal_not_in_envelopes),
    possible_duplicates: cap(possible_duplicates), receipts_without_document: cap(receipts_without_document),
    stuck: cap(stuck), errors: cap(errors), pending: { count: pending.length, oldest },
  };
}

export const CHECK_PROMPT = `You are the nightly books check for Recast Properties LLC, a small real-estate flipping business. The books are a Google Sheets Journal (double-entry, append-only, voids are reversing entries) fed by a receipts bookkeeper whose review queue is a set of "envelopes" (one per document: status pending / posting / posted / dismissed / error).

You receive the facts the code gathered tonight as JSON. Judge them and write what Paul (the owner) should do. Rules:
- Output at most eight bullets, each one action in plain words, starting with a verb: "Void receipt-2026... - twin of migration-2026... (Sherwin-Williams 03-22 55.72)", "Approve the Atmos 67.39 card - it has waited 3 days", "Mark envelope gm-... posted - its entries are on the Journal". Name txn_ids and docIds exactly as given.
- A duplicate is two live entries with the same date, payee and amount; a migration entry beside a receipt entry is the classic replay - the receipt one is the twin to void. Read the memos first: different receipt or invoice numbers mean different charges (Anthropic top-ups repeat the same day) and need no action at all; the same number twice is the duplicate. Say "check" only when the memos do not settle it.
- Pending cards are holds - Paul's decision is what they wait for, and some are parked on purpose for the Phase 3 bank statement. The queue count is context, not an action: never tell Paul to approve, dismiss or "clear" a card the check has not read. Mention the queue only if it is growing or a card is over 30 days old.
- Errors dated before 2026-09-17 are migration-era and belong to Phase 3; mention them once as a group, not one by one. Do not ask for replays of them.
- Paul fixes a plain click himself: void (workbook menu), approve / dismiss / reprocess (Inbox). Anything else - an envelope whose status disagrees with the Journal, a stuck card, a Drive link to attach, a balance problem, an error to diagnose - is Claude's job. Under such a bullet add one indented line starting "Paste to Claude:" with a self-contained instruction naming the ids, e.g. "Paste to Claude: mark envelope gm-19f... posted, its entries receipt-2026... are on the Journal."
- Do not repeat a fact without an action. Do not explain the rules. No headers, no preamble.
- If nothing needs Paul, answer exactly: Books check: clean.`;

export async function runCheck({ writer, docsStore, cacheStore, anthropic, now = Date.now() }) {
  const journal = await readTab(writer, "Journal", { all: true });
  const { blobs } = await docsStore.list({ prefix: "doc/" });
  const envelopes = (await Promise.all((blobs || []).map((b) => docsStore.get(b.key, { type: "json" })))).filter(Boolean);
  const facts = gatherFacts(journal, envelopes, now);

  let text = "", usage = null, error = "";
  try {
    const res = await anthropic.beta.messages.create({
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: [{ type: "text", text: CHECK_PROMPT }],
      messages: [{ role: "user", content: `Facts as of ${new Date(now).toISOString()}:\n${JSON.stringify(facts, null, 1)}` }],
    });
    text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    usage = { input_tokens: res.usage?.input_tokens ?? 0, output_tokens: res.usage?.output_tokens ?? 0, model: res.model || MODEL_ID };
    if (res.stop_reason === "refusal") error = `the model declined (${res.stop_details?.category || "unspecified"})`;
    if (!text) error = error || `the model finished (${res.stop_reason}) with no text`;
  } catch (err) {
    error = `the model call failed: ${String((err && err.message) || err)}`;
  }

  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const check = { date, ranAt: new Date(now).toISOString(), text, error, usage, facts };
  await cacheStore.setJSON(`reconcile/${date}`, check);
  await cacheStore.setJSON("reconcile/latest", check);
  return check;
}

export default async (req) => {
  const configErr = requireConfig(["WRITER_URL", "WRITER_SECRET", "POLLER_SECRET", "ANTHROPIC_API_KEY"]);
  if (configErr) return configErr;
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });
  const check = await runCheck({ writer: getWriter(), docsStore: getDocsStore(), cacheStore: getCacheStore(), anthropic: clientForTests || new Anthropic({ maxRetries: 4 }) }); // the first hand run died on "Connection error" after the default 2
  if (check.error) console.error("reconcile-bg: " + check.error);
  return json(200, { ok: !check.error, date: check.date, text: check.text, error: check.error });
};

export const config = { path: "/api/reconcile-bg" };
