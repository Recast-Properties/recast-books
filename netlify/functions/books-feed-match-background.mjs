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
// decides it - books-inbox.mjs mark-posted / dismiss). The one thing posted here: the bank's own
// fee under the ceiling (bankFeePass, D-093), by code, before the model sees the lines.
import Anthropic from "@anthropic-ai/sdk";
import {
  requireConfig, json, pollerSecretOk, getDocsStore, getCacheStore, getWriter, readTab, getPostingCtx,
  rowsToObjectsPublic, refreshTabAfterWrite, invalidateJournalCache, todayChicago,
  loadDocIndex, loadEnvelopes,
} from "./_shared.mjs";
import { cardsForLines, loadSummaries } from "../../lib/bank-mail.mjs";
import { flattenJournalLines, buildPostedEntries, tradesByProperty } from "./books-ingest-background.mjs";
import { buildCandidates, runMatcher, applyVerdicts, isBankFee, bankFeeIntent, BANK_FEE_CEILING_CENTS, isUtilityFeeLine, buildBills } from "../../lib/feed-match.mjs";
import { candidatesFor } from "../../lib/feed-tie.mjs";
import { toCents, fromCents } from "../../lib/money.mjs";
import { buildEntry } from "../../lib/posting.mjs";
import { WriterError } from "../../lib/writer-client.mjs";
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

/** The account's Inbox cards still waiting - one short list, the key carries the account. */
export async function loadPendingFeedCards(docsStore, account) {
  const wanted = (await loadDocIndex(docsStore, { prefix: `doc/feed-${account}-` })).filter((d) => d.status === "pending");
  return loadEnvelopes(docsStore, wanted.map((d) => d.key));
}

/**
 * Audit 2026-10-24 #1: a waiting card whose line a posted entry now pays for - the receipt came in through the
 * Inbox after the statement, and a receipt Paul saves by hand never retired its card - is tied by code and
 * retired; Paul answered it already. A card whose lines were all tied some other way is a leftover and is retired
 * too (the three 09-29 placeholders). Pure: {updates (Feed rows), dismissed:[{card, note}]}; `used` gains the
 * txn_ids it spends.
 */
export function retirePendingCards({ pendingCards, rows, candidates, used }) {
  const byId = new Map(rows.map((r) => [r.feed_id, r]));
  const updates = [], dismissed = [];
  for (const card of pendingCards) {
    const ids = card.feed?.feed_ids || [];
    const lines = ids.map((id) => byId.get(id)).filter(Boolean);
    if (!ids.length || lines.length !== ids.length) continue;
    if (lines.every((l) => l.txn_id)) {
      dismissed.push({ card, note: `Its bank line was already tied (${[...new Set(lines.map((l) => l.txn_id))].join(", ")})` });
      continue;
    }
    if (!lines.every((l) => l.status === "proposed" && !l.txn_id)) continue;
    const total = lines.reduce((t, l) => t + l.amount_cents, 0);
    const found = candidatesFor(candidates, { amount_cents: total, date: lines[0].date }, used);   // one entry, or one receipt split by house
    if (!found.length) continue;
    found.forEach((c) => used.add(c.txn_id));
    const txn_id = found.map((c) => c.txn_id).join(", ");
    const note = `The receipt came in and was recorded (${txn_id}); the bookkeeper tied it`;
    for (const l of lines) updates.push({ feed_id: l.feed_id, status: "matched", txn_id, match_note: note });
    dismissed.push({ card, note });
  }
  return { updates, dismissed };
}

/**
 * Audit 2026-10-24 #16, D-093 (Paul, 2026-10-25): the bank's own fee under BANK_FEE_CEILING_CENTS is recorded by code,
 * no card - the open lines that are one, and a waiting card that is exactly one such line. A fee the books already
 * hold (a check order posted from its receipt, a wire fee Paul typed) is TIED to that entry, never posted again
 * (candidatesFor, the same rail retirePendingCards uses; `used` gains the entry). Otherwise one built entry per line
 * through lib/posting.mjs buildEntry (the engine every post goes through), its id `bank-<account>-<feed_id>` so the
 * same line can never post twice; a line the engine refuses (a closed period) is left for the model. Pure.
 */
export function bankFeePass({ lines, pendingCards, rows, candidates, used, account, accountName, ctx }) {
  const byId = new Map(rows.map((r) => [r.feed_id, r]));
  const picks = lines.filter((l) => isBankFee(l)).map((line) => ({ line, card: null }));
  for (const card of pendingCards) {
    const ids = card.feed?.feed_ids || [];
    const line = ids.length === 1 ? byId.get(ids[0]) : null;
    if (line && line.status === "proposed" && !line.txn_id && isBankFee(line)) picks.push({ line, card });
  }
  const out = [];
  for (const p of picks) {
    const found = candidatesFor(candidates, { amount_cents: p.line.amount_cents, date: p.line.date }, used);
    if (found.length) {
      found.forEach((c) => used.add(c.txn_id));
      const txn_id = found.map((c) => c.txn_id).join(", ");
      out.push({ ...p, entry: null, txn_id, note: `The bank's own fee - already in the books (${txn_id}); the bookkeeper tied it` });
      continue;
    }
    try {
      const entry = buildEntry(bankFeeIntent(p.line, account, accountName), ctx);
      entry.txn_id = `bank-${account}-${p.line.feed_id}`;
      out.push({ ...p, entry, txn_id: entry.txn_id, note: `The bank's own fee, under $${fromCents(BANK_FEE_CEILING_CENTS)} - recorded on its own (your rule of 10-25)` });
    } catch (err) {
      console.error(`feed-match-bg: the bank fee on line ${p.line.feed_id} was not built: ${String((err && err.message) || err)}`);
    }
  }
  return out;
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
  // Audit 2026-10-24 #2a: a "proposed" row whose card is no longer waiting - posted, dismissed, or a tie that
  // failed and left the row behind - was never offered to the matcher again. It is open again.
  const pendingCards = await loadPendingFeedCards(docsStore, account);
  const waitingIds = new Set(pendingCards.flatMap((c) => c.feed?.feed_ids || []));
  const reopened = mine.filter((r) => r.status === "proposed" && !r.txn_id && !waitingIds.has(r.feed_id));
  // D-094: a waiting card that is exactly one utility-fee line goes back to the model, RECENT BILLS in view. The run's
  // verdict takes the card's place (a new card lands on the same docId) or retires it when the fee is recorded.
  const byFeedId = new Map(mine.map((r) => [r.feed_id, r]));
  const feeCards = pendingCards.filter((c) => (c.feed?.feed_ids || []).length === 1)
    .map((c) => ({ card: c, row: byFeedId.get(c.feed.feed_ids[0]) }))
    .filter((x) => x.row && x.row.status === "proposed" && !x.row.txn_id && isUtilityFeeLine(x.row));
  let lines = mine.filter((r) => r.status === "unmatched").concat(reopened, feeCards.map((x) => x.row));
  // Tied on THIS account's rows (audit 2026-10-24 #14): an entry that moves money between Recast's accounts touches
  // both, and tied on the Citizens side it must still be offered on the Chase side. Built from every row, Chase's
  // side of every transfer became a card.
  const used = new Set(mine.flatMap((r) => r.txn_id.split(/[\s,]+/)).filter(Boolean));
  const journalLines = flattenJournalLines(journalResp.headers, journalResp.rows);
  const allCandidates = buildCandidates(journalLines, account, used);
  const retired = retirePendingCards({ pendingCards, rows: mine, candidates: allCandidates, used });
  for (const { card, note } of retired.dismissed) {
    await docsStore.setJSON(`doc/${card.docId}`, { ...card, status: "dismissed", review: { action: "dismiss", by: "claude", at: now, note } });
  }
  const settings = Object.fromEntries(rowsToObjectsPublic(settingsResp.headers, settingsResp.rows).map((r) => [r.key, r.value]));
  const bank = rowsToObjectsPublic(bankResp.headers, bankResp.rows).find((b) => String(b.code) === account);
  const accountName = String(bank?.name || account);

  // D-093: the bank's own fees under the ceiling - tied when the books hold them, else recorded one at a time (a
  // rerun after a lost reply is refused DUPLICATE on the line's own id and simply tied); the lines leave the model's
  // batch, their cards are retired.
  const gone = new Set(retired.dismissed.map((d) => d.card.docId));
  const fees = { updates: [], dismissed: [], posted: 0 };
  for (const f of bankFeePass({ lines, pendingCards: pendingCards.filter((c) => !gone.has(c.docId)), rows: mine, candidates: allCandidates, used, account, accountName, ctx })) {
    if (f.entry) {
      try {
        await writer.postBatch([f.entry], { skipRefresh: true });   // OVERHEAD: no house tab to rebuild
        fees.posted++;
      } catch (err) {
        if (!(err instanceof WriterError && err.code === "DUPLICATE")) { console.error(`feed-match-bg: the bank fee on line ${f.line.feed_id} was not recorded: ${String((err && err.message) || err)}`); continue; }
      }
    }
    fees.updates.push({ feed_id: f.line.feed_id, status: "matched", txn_id: f.txn_id, match_note: f.note });
    if (f.card) fees.dismissed.push({ card: f.card, note: f.note });
  }
  if (fees.posted) await invalidateJournalCache(writer);
  for (const { card, note } of fees.dismissed) {
    await docsStore.setJSON(`doc/${card.docId}`, { ...card, status: "dismissed", review: { action: "dismiss", by: "claude", at: now, note } });
  }
  const feeIds = new Set(fees.updates.map((u) => u.feed_id));
  lines = lines.filter((l) => !feeIds.has(l.feed_id));
  const candidates = allCandidates.filter((c) => !used.has(c.txn_id));
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

  const housekeeping = { retired: retired.dismissed.length, reopened: reopened.length, fees: fees.updates.length };
  if (!lines.length) {
    const pre = [...retired.updates, ...fees.updates, ...cardUpdates];
    if (pre.length) { await writer.feedUpdate(pre); await refreshTabAfterWrite(writer, "Feed"); }
    return { summary: { total: 0, matched: 0, cards: 0, later: 0, none: 0, ...housekeeping }, candidates: candidates.length, usage: null, transcript: "no open lines" };
  }

  const bills = buildBills(journalLines, account, ctx.today);
  const { verdicts, usage, transcript } = await runMatcher({ anthropic, account, accountName, lines, candidates, properties, vendors, bills, today: ctx.today });
  const applied = applyVerdicts({ verdicts, lines, candidates, account, accountName, ctx, settings, postedEntries: buildPostedEntries(journalLines), now });

  // D-094: the utility's fee under the ceiling, on the house of the bill it came with - recorded here, one at a time on
  // the line's own id (a rerun's DUPLICATE is tied as already there); a refusal makes it the card it would have been.
  let utilityPosted = 0;
  const utilityDone = new Set();
  for (const a of applied.autoposts || []) {
    try {
      const entry = buildEntry(a.intent, ctx);
      entry.txn_id = a.txn_id;
      try {
        await writer.postBatch([entry]);   // a house cost: the house tab is rebuilt
        utilityPosted++;
      } catch (err) {
        if (!(err instanceof WriterError && err.code === "DUPLICATE")) throw err;
      }
      applied.updates.push({ feed_id: a.line.feed_id, status: "matched", txn_id: a.txn_id, match_note: `${a.note} - the utility's own fee under $${fromCents(BANK_FEE_CEILING_CENTS)}, recorded with its bill (your rule of 10-25)` });
      applied.summary.utility_fees = (applied.summary.utility_fees || 0) + 1;
      utilityDone.add(a.line.feed_id);
    } catch (err) {
      console.error(`feed-match-bg: the utility fee on line ${a.line.feed_id} was not recorded, it is a card: ${String((err && err.message) || err)}`);
      applied.envelopes.push(a.fallback.env);
      applied.updates.push(...a.fallback.updates);
      applied.summary.cards += 1;
    }
  }
  if (utilityPosted) await invalidateJournalCache(writer);
  const newCardIds = new Set(applied.envelopes.map((e) => e.docId));
  for (const { card, row } of feeCards) {
    if (newCardIds.has(card.docId)) continue;   // the run's card took its place
    const note = utilityDone.has(row.feed_id)
      ? `The utility's own fee under $${fromCents(BANK_FEE_CEILING_CENTS)} - recorded with its bill (your rule of 10-25)`
      : "The line was looked at again and is open on the Feed tab";
    await docsStore.setJSON(`doc/${card.docId}`, { ...card, status: "dismissed", review: { action: "dismiss", by: "claude", at: now, note } });
  }

  for (const env of applied.envelopes) await docsStore.setJSON(`doc/${env.docId}`, env);
  applied.updates.unshift(...retired.updates, ...fees.updates);
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
  return { summary: { ...applied.summary, ...housekeeping }, candidates: candidates.length, cards: applied.envelopes.map((e) => e.docId), carded, written, usage, transcript };
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
