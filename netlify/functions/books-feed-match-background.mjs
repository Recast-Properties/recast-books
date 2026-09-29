// netlify/functions/books-feed-match-background.mjs — path /api/feed-match-bg
// docs/phase3-spec.md section 3. The matching run itself, as a background function.
//
//   POST (poller secret) {job_id}  -> 202, then the run happens here
//
// Code gathers (the account's open Feed lines, every Journal entry touching the account and
// not yet tied to a line, the houses and their sections), the model judges (lib/feed-match.mjs
// runMatcher - one call per batch of lines), code checks and writes (applyVerdicts: a match
// must add up to the cent; the verdict lands on each Feed row through the writer's feedUpdate;
// a proposal or a question becomes a pending Inbox card that ties its Feed rows when Paul
// decides it - books-inbox.mjs mark-posted / dismiss). Nothing here posts to the Journal.
import Anthropic from "@anthropic-ai/sdk";
import {
  requireConfig, json, pollerSecretOk, getDocsStore, getCacheStore, getWriter, readTab, getPostingCtx,
  rowsToObjectsPublic, refreshTabAfterWrite, todayChicago,
} from "./_shared.mjs";
import { cardsForLines, loadSummaries } from "../../lib/bank-mail.mjs";
import { flattenJournalLines, buildPostedEntries, tradesByProperty } from "./books-ingest-background.mjs";
import { buildCandidates, runMatcher, applyVerdicts } from "../../lib/feed-match.mjs";
import { toCents } from "../../lib/money.mjs";
import { jobKey } from "./books-feed-match.mjs";

const JOURNAL_READ_TIMEOUT_MS = 300000;

let clientForTests = null;
export function setAnthropicForTests(client) {
  clientForTests = client;
}

/** A Feed tab row as the matcher wants it. */
export function feedRows(resp) {
  return rowsToObjectsPublic(resp.headers, resp.rows).map((r) => ({
    feed_id: String(r.feed_id || ""),
    account: String(r.account || ""),
    date: String(r.date || "").slice(0, 10),
    amount_cents: toCents(Number(r.amount) || 0),
    name: String(r.name || ""),
    memo: String(r.memo || ""),
    status: String(r.status || ""),
    txn_id: String(r.txn_id || ""),
    match_note: String(r.match_note || ""),
    card_cell: String(r.card || ""),   // what the Feed tab already says; `card` is the email's, set below
  }));
}

/** The run, exported so the test drives it with fakes. Returns what the job record stores. */
export async function runFeedMatch({ account, writer, docsStore, anthropic, cacheStore = getCacheStore(), now = new Date().toISOString() }) {
  const [feedResp, journalResp, ctx, settingsResp, bankResp, propsResp, vendorsResp] = await Promise.all([
    readTab(writer, "Feed", { fresh: true }),
    readTab(writer, "Journal", { fresh: true, all: true, timeoutMs: JOURNAL_READ_TIMEOUT_MS }),
    getPostingCtx(writer),
    readTab(writer, "Settings"),
    readTab(writer, "Bank accounts"),
    readTab(writer, "Properties"),
    readTab(writer, "Vendors"),
  ]);
  const vendors = rowsToObjectsPublic(vendorsResp.headers, vendorsResp.rows)
    .map((v) => ({ canonical: String(v.canonical || ""), aliases: String(v.aliases || "").split(",").map((a) => a.trim()).filter(Boolean) }));
  const feed = feedRows(feedResp);
  const mine = feed.filter((r) => r.account === account);
  const lines = mine.filter((r) => r.status === "unmatched");
  const used = new Set(feed.flatMap((r) => r.txn_id.split(/[\s,]+/)).filter(Boolean));
  const journalLines = flattenJournalLines(journalResp.headers, journalResp.rows);
  const candidates = buildCandidates(journalLines, account, used);
  const settings = Object.fromEntries(rowsToObjectsPublic(settingsResp.headers, settingsResp.rows).map((r) => [r.key, r.value]));
  const bank = rowsToObjectsPublic(bankResp.headers, bankResp.rows).find((b) => String(b.code) === account);
  const accountName = String(bank?.name || account);
  const trades = tradesByProperty(journalLines);
  const properties = rowsToObjectsPublic(propsResp.headers, propsResp.rows)
    .filter((p) => p.name)
    .map((p) => ({ name: p.name, address: p.address || "", status: p.status || "", purchase_date: p.purchase_date || "", trades: trades[p.name] || [] }));

  // D-059: which card paid, from the bank's daily emails. Knowing it is a help, never a need -
  // a store that cannot be read leaves the lines as the bank's file has them. Every line of the
  // account is looked up, not only the open ones: the Feed tab's card column is the bank sheet's
  // "Who paid" (2026-09-29). A cell that already says who is never written over.
  let carded = 0;
  const cardUpdates = [];
  try {
    const last4s = String(bank?.last4 || "").split(/[\s,;]+/).filter(Boolean);
    const cards = cardsForLines(mine, await loadSummaries(cacheStore), last4s);
    for (const l of lines) if (cards.has(l.feed_id)) { l.card = cards.get(l.feed_id); carded++; }
    for (const r of mine) {
      const c = cards.get(r.feed_id);
      if (c && !r.card_cell) cardUpdates.push({ feed_id: r.feed_id, card: `${c.holder} (${c.last4})` });
    }
  } catch (err) {
    console.error(`feed-match-bg: the bank's daily emails could not be read: ${String((err && err.message) || err)}`);
  }

  if (!lines.length) {
    if (cardUpdates.length) { await writer.feedUpdate(cardUpdates); await refreshTabAfterWrite(writer, "Feed"); }
    return { summary: { total: 0, matched: 0, cards: 0, later: 0, none: 0 }, candidates: candidates.length, usage: null, transcript: "no open lines" };
  }

  const { verdicts, usage, transcript } = await runMatcher({ anthropic, account, accountName, lines, candidates, properties, vendors, today: ctx.today });
  const applied = applyVerdicts({ verdicts, lines, candidates, account, accountName, ctx, settings, postedEntries: buildPostedEntries(journalLines), now });

  for (const env of applied.envelopes) await docsStore.setJSON(`doc/${env.docId}`, env);
  const verdictOf = new Map(applied.updates.map((u) => [u.feed_id, u]));
  for (const c of cardUpdates) {
    if (verdictOf.has(c.feed_id)) verdictOf.get(c.feed_id).card = c.card;
    else applied.updates.push(c);
  }
  let written = null;
  if (applied.updates.length) {
    written = await writer.feedUpdate(applied.updates);
    await refreshTabAfterWrite(writer, "Feed");
  }
  return { summary: applied.summary, candidates: candidates.length, cards: applied.envelopes.map((e) => e.docId), carded, written, usage, transcript };
}

export default async (req) => {
  const configErr = requireConfig(["POLLER_SECRET", "WRITER_URL", "WRITER_SECRET", "ANTHROPIC_API_KEY"]);
  if (configErr) return configErr;
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });
  let jobId = "";
  try {
    jobId = String((await req.json())?.job_id || "");
  } catch {
    return json(400, { error: "BAD_REQUEST", message: "body must be JSON" });
  }
  if (!jobId) return json(400, { error: "BAD_REQUEST", message: "job_id is required" });

  const store = getDocsStore();
  const key = jobKey(jobId);
  const job = await store.get(key, { type: "json" });
  if (!job) return json(404, { error: "NOT_FOUND", message: `no matching run with id ${jobId}` });
  // Whatever happens, the record must stop saying "matching" - the writer polls it.
  const finish = async (patch) => {
    try { await store.setJSON(key, { ...job, finishedAt: new Date().toISOString(), ...patch }); } catch { /* best effort */ }
  };
  try {
    const result = await runFeedMatch({ account: job.account, writer: getWriter(), docsStore: store, anthropic: clientForTests || new Anthropic({ maxRetries: 4 }), now: new Date().toISOString() });   // 2026-09-29: a 529 "overloaded" ended a run after the default 2
    await finish({ status: "done", ...result });
    return json(200, { ok: true });
  } catch (err) {
    await finish({ status: "error", error: String((err && err.message) || err), error_stack: String((err && err.stack) || "").split("\n").slice(0, 6).join("\n") });
    return json(200, { ok: false });
  }
};

export const config = { path: "/api/feed-match-bg" };
