// netlify/functions/books-reconcile-background.mjs — path /api/reconcile-bg
//   POST (poller secret) {}  -> runs the nightly books check, stores it, 200
//   POST (poller secret) {dry:true} -> the same with nothing written, stored at reconcile/dry/<date> only
//
// Part 3 of the 2026-09-25 plan. On 09-25 the books were checked by hand and that found
// two duplicate entries and four envelopes that disagreed with the Journal. That is
// judgment work; it happens every night now, before Paul's digest. CODE gathers the facts
// from the books-cache Journal snapshot and the docs store (both cheap after D-047); THE
// MODEL reads it, looks things up and fixes what a fix tool covers (2026-10-27, below), then writes
// at most eight bullets, each an action in Paul's words, or "Books check: clean." Stored at books-cache
// `reconcile/<date>` and `reconcile/latest`; /api/summary returns it as `check`; the paul@ poller's
// dailyDigest prints it first, with what was fixed overnight at the top. Approves stay Paul's clicks.
import Anthropic from "@anthropic-ai/sdk";
import { requireConfig, json, pollerSecretOk, getWriter, getDocsStore, getCacheStore, readTab,
  loadHeartbeat, heartbeatWarning, refreshTabAfterWrite, storeAttachmentsToDrive,
} from "./_shared.mjs";
import { NEED_RECEIPT, citedLast4 } from "../../lib/gate.mjs";
import { MODEL_ID, placeCacheMarkers } from "../../lib/bookkeeper.mjs";
import { MIGRATION_RECORD } from "../../lib/migration-record.mjs";

const MAX_TOKENS = 16000;   // per turn; the 10-26 check stopped at the old 4000 exactly
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
const fileId = (u) => (String(u || "").match(/\/d\/([\w-]{20,})/) || [])[1];
const words = (s) => String(s || "").toLowerCase().match(/[a-z]{4,}/g) || [];
const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const chicagoDate = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

/** One record per live Journal entry (an entry voided, and its void, are not live) - shared by the facts and the fixes. */
export function liveEntries(journal) {
  const idx = Object.fromEntries(journal.headers.map((h, i) => [h, i]));
  const g = (r, n) => (idx[n] === undefined ? "" : r[idx[n]]);
  const rows = journal.rows;
  const voided = new Set(rows.map((r) => String(g(r, "void_of") || "")).filter(Boolean));
  const live = rows.filter((r) => String(g(r, "source")) !== "void" && !voided.has(String(g(r, "txn_id"))));
  const journalIds = new Set(rows.map((r) => String(g(r, "txn_id"))));
  const byTxn = new Map();
  for (const r of live) {
    const id = String(g(r, "txn_id"));
    const e = byTxn.get(id) || { txn_id: id, date: String(g(r, "date")), payee: String(g(r, "payee")), property: "", source: String(g(r, "source")), debit: 0, doc_url: "", posted_at: String(g(r, "posted_at")), memo: String(g(r, "memo") || "").slice(0, 160), waiting_on: "", credited: new Set() };
    e.debit += cents(g(r, "debit"));
    if (cents(g(r, "credit")) > 0) e.credited.add(String(g(r, "account")));   // where the money came from
    // D-057: a placeholder - "NEED RECEIPT FROM DENNIS" - is waiting on that person's receipt
    const d = String(g(r, "description") || "");
    if (d.startsWith(NEED_RECEIPT)) e.waiting_on = d.slice(NEED_RECEIPT.length).trim() || "someone";
    if (!e.property && g(r, "property")) e.property = String(g(r, "property"));
    if (!e.doc_url && g(r, "doc_url")) e.doc_url = String(g(r, "doc_url"));
    byTxn.set(id, e);
  }
  return { entries: [...byTxn.values()], voided, journalIds, rows, g };
}

/**
 * The facts. Pure: (headers, rows) of the Journal and the list of envelopes in.
 * Mirrors reportDuplicateReplays in apps-script/writer/Code.gs for (c).
 */
export function gatherFacts(journal, envelopes, now = Date.now(), record = MIGRATION_RECORD, feed = null, heartbeat = undefined) {
  const { entries, voided, journalIds, rows, g } = liveEntries(journal);

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
  // Two migrated rows alike are the old books as Paul kept them (D-027), not a finding. Nor is one
  // document split across houses (Falcon Creek INV 1404, 2026-09-30: 110.00 each for two yards).
  const oneBillSplit = (gr) => fileId(gr[0].doc_url) && gr.every((e) => fileId(e.doc_url) === fileId(gr[0].doc_url)) && new Set(gr.map((e) => e.property)).size === gr.length;
  // Nor are entries recorded straight from bank lines: each id carries the bank's own line id, so two of them are two
  // charges the bank took (the two 1.00 ATM fees of 2026-10-07, one per withdrawal, mailed to Paul as "check" on 10-27).
  const allBankLines = (gr) => gr.every((e) => e.source === "bank");
  const possible_duplicates = [...groups.values()].filter((gr) => gr.length > 1 && gr.some((e) => e.source !== "migration") && !oneBillSplit(gr) && !allBankLines(gr))
    .map((gr) => ({ date: gr[0].date, payee: gr[0].payee, total: money(gr[0].debit), entries: gr.map((e) => `${e.txn_id} (${e.source}, ${e.property || "no property"}${e.memo ? `; memo: ${e.memo}` : ""})`) }));

  // (d) receipt entries with no document - a placeholder has none by design, and has its own list
  const receipts_without_document = entries.filter((e) => e.source === "receipt" && !e.doc_url && !e.waiting_on)
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

  // (h) receipts on no book. Every document ends one of four ways: on the Journal, in the
  // queue, kept off the books with a recorded reason, or not a cost. On 2026-09-26, 161
  // documents turned up dismissed as duplicates of staging-only entries - all resolved, but by
  // hand (Paul: "how do we know if there are other like it?"). A receipt is its copies: one
  // accounted copy accounts for all of them. Old-book payees are misspelled ("Harbor Frieght"),
  // so the last resort matches on amount and date, with a shared word or the same day.
  const liveIds = new Set(entries.map((e) => e.txn_id));
  const liveFiles = new Set(entries.map((e) => fileId(e.doc_url)).filter(Boolean));
  const inA = new Set(envelope_not_on_journal.map((e) => e.docId));
  const byDoc = new Map(envelopes.map((e) => [e.docId, e]));
  const settled = new Set(record.settled);
  // The amount match may only use an entry no document already explains - two 13.57 Anthropic
  // top-ups on one day are two receipts, and one row cannot stand in for both.
  const claimed = new Set([...envelopes.flatMap((e) => e.result?.txn_ids || []), ...Object.values(record.links).flat(),
    ...envelopes.map((e) => (String(e.review?.note || "").match(/its row is in the Journal: (\S+)/) || [])[1]).filter(Boolean)]);
  const unclaimed = entries.filter((x) => !claimed.has(x.txn_id));
  const accounted = (e, seen = new Set()) => {
    const m = e.model || {}, note = String(e.review?.note || ""), txns = e.result?.txn_ids || [];
    if ((e.status !== "posted" && e.status !== "dismissed") || inA.has(e.docId)) return true; // the queue, (a), (e)
    if (txns.length && txns.every((t) => liveIds.has(t) || voided.has(t))) return true; // a void is a decision, not a loss
    // a migrated row carries it - or carried it and was voided: taken out on purpose (the 10-01 final
    // register's doubles came back the next night as six "may not be in the books" lines for Paul)
    if ((record.links[e.docId] || []).some((t) => liveIds.has(t) || voided.has(t))) return true;
    if (liveFiles.has(fileId(e.result?.doc_url))) return true;
    const named = note.match(/its row is in the Journal: (\S+)/);
    if (named && liveIds.has(named[1])) return true;
    if (settled.has(e.docId) || /recorded decision - /.test(note)) return true;
    // what it says it is a copy of: the model's duplicate_of, or the migration's "a second copy of <doc>"
    for (const p of [m.duplicate_of, (note.match(/second copy of (\S+?)[,\s]/) || [])[1]].filter(Boolean).map(String)) {
      if (liveIds.has(p) || settled.has(p) || (record.links[p] || []).some((t) => liveIds.has(t) || voided.has(t))) return true;
      const original = byDoc.get(p);
      if (original && !seen.has(e.docId) && accounted(original, seen.add(e.docId))) return true;
    }
    // A dismissal that claims nothing is not a cost (a promotion, a food order). One that claims a
    // duplicate - the model's pointer, Paul's "Duplicate", a migration note or rule - had to find it above.
    if (e.status === "dismissed" && !m.duplicate_of && !/duplicate|its row is in the Journal|second cop/i.test(note) && !/\[rule: /.test(m.why || "")) return true;
    if (/the bookkeeper's read was "dismiss"/.test(note)) return true; // the model's own not-a-cost call, confirmed by the migration
    if (!(m.receipt_total_cents > 0)) return true; // no charge on it
    const vendor = new Set(words(m.vendor));
    return unclaimed.some((x) => days(x.date, m.date) <= 10 &&
      (Math.abs(x.debit - m.receipt_total_cents) <= 2 || (m.subtotal_cents > 0 && Math.abs(x.debit - m.subtotal_cents) <= 2)) &&
      (x.date === m.date || words(x.payee).some((w) => vendor.has(w))));
  };
  // Copies share vendor, date and total. Two receipt numbers in the same format that differ are two
  // receipts (Anthropic's same-day top-ups); an order number beside a store receipt number is one.
  const inv = (e) => String(e.model?.invoice_number || "").trim();
  const shape = (s) => s.replace(/\d/g, "9").replace(/[a-z]/gi, "A");
  const twoReceipts = (a, b) => inv(a) && inv(b) && inv(a) !== inv(b) && shape(inv(a)) === shape(inv(b));
  const byKey = new Map();
  for (const e of envelopes) {
    if (e.dryRun || String(e.docId).startsWith("up-test")) continue;
    const m = e.model || {}, k = `${words(m.vendor)[0] || norm(m.vendor)}|${m.date || ""}|${m.receipt_total_cents || 0}`;
    const receipts = byKey.get(k) || byKey.set(k, []).get(k);
    const same = receipts.find((copies) => !copies.some((c) => twoReceipts(c, e)));
    if (same) same.push(e); else receipts.push([e]);
  }
  const receipts_on_no_book = [...byKey.values()].flat(1).filter((copies) => !copies.some((e) => accounted(e))).map((copies) => ({
    date: copies[0].model?.date || "", vendor: copies[0].model?.vendor || "", total: money(copies[0].model?.receipt_total_cents || 0),
    copies: copies.map((e) => `${e.docId} (${e.status}${e.model?.duplicate_of ? `, named ${e.model.duplicate_of} as the original - not on the books` : ""})`),
  }));

  const cap = (list) => (list.length > MAX_ITEMS ? [...list.slice(0, MAX_ITEMS), `... and ${list.length - MAX_ITEMS} more`] : list);

  // (i) the bank side (audit 2026-10-24 #2d). The check never read the Feed tab: a "proposed" line whose Inbox
  // card is gone was never re-matched, a line tied to an entry since voided sat red on the bank tab, and a line
  // nobody has explained in ten days is a receipt someone owes. `feed` is the tab; null when it could not be read.
  let bank_lines = null;
  if (feed && Array.isArray(feed.headers) && Array.isArray(feed.rows)) {
    const fi = Object.fromEntries(feed.headers.map((h, i) => [h, i]));
    const fg = (r, n) => (fi[n] === undefined ? "" : r[fi[n]]);
    const waiting = new Set(envelopes.filter((e) => e.source === "feed" && e.status === "pending" && !e.dryRun).flatMap((e) => e.feed?.feed_ids || []));
    const line = (r) => ({ feed_id: String(fg(r, "feed_id")), account: String(fg(r, "account")), date: String(fg(r, "date")).slice(0, 10), amount: money(cents(fg(r, "amount"))), text: String(fg(r, "name") || fg(r, "memo") || "").slice(0, 60) });
    const status = (r) => String(fg(r, "status") || "");
    const txns = (r) => String(fg(r, "txn_id") || "").split(/[\s,]+/).filter(Boolean);
    bank_lines = {
      proposed_without_card: cap(feed.rows.filter((r) => status(r) === "proposed" && !txns(r).length && !waiting.has(String(fg(r, "feed_id")))).map(line)),
      tied_to_missing_entry: cap(feed.rows.filter((r) => status(r) === "matched" && txns(r).some((t) => voided.has(t) || !journalIds.has(t))).map((r) => ({ ...line(r), txn_id: txns(r).join(", ") }))),
      open_over_10_days: cap(feed.rows.filter((r) => status(r) === "unmatched" && now - Date.parse(String(fg(r, "date"))) > 10 * 864e5).map(line)),
    };
  }

  return {
    journal_rows: rows.length, live_entries: entries.length,
    balance: { debits: money(debits), credits: money(credits), balanced: debits === credits },
    envelope_not_on_journal: cap(envelope_not_on_journal), journal_not_in_envelopes: cap(journal_not_in_envelopes),
    possible_duplicates: cap(possible_duplicates), receipts_without_document: cap(receipts_without_document),
    stuck: cap(stuck), errors: cap(errors), pending: { count: pending.length, oldest },
    receipts_on_no_book: cap(receipts_on_no_book),
    ...(bank_lines ? { bank_lines } : {}),
    // audit 2026-10-24 #10c: only when the mail poller has gone quiet (a fact with an action: tell Claude)
    ...(heartbeat !== undefined && heartbeatWarning(heartbeat, now) ? { mail_poller_quiet: heartbeatWarning(heartbeat, now) + " For Claude: the receipts poller has not reported in; check its trigger." } : {}),
  };
}

/**
 * D-057: the charges recorded from the bank statement whose receipt has not come in, oldest first,
 * as the lines the 3 AM email prints under the check. Code writes these, not the model - the list
 * is what Paul sends Dennis. "" when nothing is waiting.
 */
export function waitingOnReceipts(journal) {
  const idx = Object.fromEntries(journal.headers.map((h, i) => [h, i]));
  const g = (r, n) => (idx[n] === undefined ? "" : r[idx[n]]);
  const voided = new Set(journal.rows.map((r) => String(g(r, "void_of") || "")).filter(Boolean));
  const name = (s) => s.charAt(0) + s.slice(1).toLowerCase();
  const list = journal.rows
    .filter((r) => String(g(r, "source")) !== "void" && !voided.has(String(g(r, "txn_id"))) && String(g(r, "description") || "").startsWith(NEED_RECEIPT) && cents(g(r, "debit")) > 0)
    .map((r) => ({ who: name(String(g(r, "description")).slice(NEED_RECEIPT.length).trim() || "someone"), date: String(g(r, "date")).slice(0, 10), payee: String(g(r, "payee")), cents: cents(g(r, "debit")), property: String(g(r, "property")) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!list.length) return "";
  const total = list.reduce((t, w) => t + w.cents, 0);
  return [`Waiting on receipts (${list.length}, $${money(total)}) - recorded from the bank statement, no receipt yet:`,
    ...list.map((w) => `- ${w.who}: ${w.payee}, ${w.date.slice(5)}, $${money(w.cents)}, ${w.property || "no house"}`)].join("\n");
}


// ---- Look-ups and fixes (Paul, 2026-10-27: "have the nightly check look things up and fix what it can on its own,
// and tell me in the morning email what it fixed"). The 10-27 check mailed him "check your 10-07 statement" for two
// 1.00 ATM fees the bank's own lines settle at a glance; every item it had listed for Claude since 10-14 was one of
// the four fixes below. The look-ups read what the check already holds. Each fix is a write behind a rail that ties it
// to tonight's facts (Claude decides, code executes - CLAUDE.md constraint 3); only a fix code ran reaches Paul, in
// the model's one plain sentence; a refused one goes on Claude's list with code's reason.
const MAX_TURNS = 16;
const MAX_FIXES = 8;
const ID_IN_TEXT = /\b(?:receipt|bank|manual|migration|void|sale|gm|up)-[\w-]*\d[\w-]{4,}/;   // every id carries digits; "up-to-date" does not
const nul = (type) => ({ type: [type, "null"] });
const ids = { type: ["array", "null"], items: { type: "string" } };
const PLAIN = { type: "string", description: "One sentence for Paul's morning email saying what you fixed, in his words: the store, the date and the dollar amount, no ids" };
const tool = (name, description, properties) => ({ name, description, strict: true,
  input_schema: { type: "object", additionalProperties: false, required: Object.keys(properties), properties } });

export const CHECK_TOOLS = [
  tool("bank_lines", "The bank's own statement lines (the Feed tab) within `days` (default 3) of a date: feed_id, account, date, amount (negative = money out), the bank's words, status, the entry it is tied to and the matcher's note. Two lines with different feed_ids are two things the bank did.",
    { date: { type: "string", description: "YYYY-MM-DD" }, days: nul("integer"), account: nul("string") }),
  tool("entries", "Journal lines. With txn_ids: every line of those entries and of any void of them. Otherwise: live entries within 10 days of `date`, nearest first, filtered by amount and/or part of the payee.",
    { txn_ids: ids, date: nul("string"), amount_cents: nul("integer"), payee: nul("string") }),
  tool("documents", "The receipts and emails the bookkeeper has handled. With docIds: each one's status, subject, sender, attachments, what the bookkeeper read (store, date, total, receipt number, verdict and why), the entries it posted, its Drive link and the review note. Otherwise: documents within 10 days of `date`, filtered by a word of the store and/or the total.",
    { docIds: ids, vendor: nul("string"), amount_cents: nul("integer"), date: nul("string") }),
  tool("take_out_double", "Void an entry that is the same charge recorded twice; keep_txn_id is the one that stays. Refused unless both are live with the same date, payee and amount, the money came from the same account in both, they are not each tied to a bank line of their own, and an old-books row is the one kept.",
    { txn_id: { type: "string" }, keep_txn_id: { type: "string" }, plain: PLAIN }),
  tool("point_receipt_at_entries", "A receipt on tonight's receipts_on_no_book list whose charge IS in the books under other entries: record which. Refused unless the entries are live, within 10 days of the receipt and add up to its total to the cent.",
    { docId: { type: "string" }, txn_ids: { type: "array", items: { type: "string" } }, plain: PLAIN }),
  tool("file_missing_receipt", "An entry on tonight's receipts_without_document list: file the receipt of the document that posted it to Drive and link it. Refused unless that document posted this entry and still has its file.",
    { txn_id: { type: "string" }, docId: { type: "string" }, plain: PLAIN }),
  tool("read_again", "A document on tonight's errors list: send it to the bookkeeper again. A re-read never posts - anything it needs from Paul lands as an Inbox card. Once per document, never one from before the 2026-09-21 cutover.",
    { docId: { type: "string" }, plain: PLAIN }),
];
CHECK_TOOLS[CHECK_TOOLS.length - 1].cache_control = { type: "ephemeral" };

/**
 * The tools over tonight's data. `run(name, input)` answers the model; `fixed` and `refused` are what code did and
 * would not do. Writes go through the writer and the docs store only. `origin` + POLLER_SECRET reach the ingest.
 * `dry`: every rail runs, nothing is written - a fix that would have run is listed with `dry: true`.
 */
export function checkTools({ journal, feed, envelopes, facts, writer, docsStore, origin = "", now = Date.now(), fetchImpl = fetch, dry = false }) {
  const { entries, rows, g } = liveEntries(journal);
  const byId = new Map(entries.map((e) => [e.txn_id, e]));
  const byDoc = new Map(envelopes.map((e) => [e.docId, e]));
  const fi = Object.fromEntries((feed?.headers || []).map((h, i) => [h, i]));
  const fg = (r, n) => (fi[n] === undefined ? "" : r[fi[n]]);
  const feedRows = feed?.rows || [];
  const tiedTo = (id) => feedRows.filter((r) => String(fg(r, "txn_id")).split(/[\s,]+/).includes(id)).map((r) => String(fg(r, "feed_id")));
  const today = chicagoDate(now), at = () => new Date().toISOString();
  const fresh = async (docId) => (await docsStore.get(`doc/${docId}`, { type: "json" })) || byDoc.get(docId);
  const onList = (list, test) => (list || []).some((x) => x && typeof x === "object" && test(x));
  const gone = new Set();   // voided tonight - the snapshot does not know yet
  const live = (t) => byId.has(t) && !gone.has(t);
  const fixed = [], refused = [];

  const lookups = {
    bank_lines: ({ date, days: span, account }) => feedRows
      .filter((r) => days(String(fg(r, "date")), date) <= Math.min(Math.max(span ?? 3, 0), 31) && (!account || String(fg(r, "account")) === account))
      .slice(0, 80).map((r) => Object.fromEntries(["feed_id", "account", "date", "amount", "name", "memo", "status", "txn_id", "match_note"].map((n) => [n, String(fg(r, n))]))),
    entries: ({ txn_ids, date, amount_cents, payee }) => {
      if (txn_ids?.length) {
        const cols = ["txn_id", "line", "date", "account", "debit", "credit", "property", "payee", "description", "paid_from", "source", "memo", "void_of"];
        return rows.filter((r) => txn_ids.includes(String(g(r, "txn_id"))) || txn_ids.includes(String(g(r, "void_of"))))
          .map((r) => ({ ...Object.fromEntries(cols.map((n) => [n, String(g(r, n) ?? "")])), has_receipt: !!g(r, "doc_url") }));
      }
      if (!date) return "Give txn_ids or a date.";
      return entries.filter((e) => days(e.date, date) <= 10 && (amount_cents == null || e.debit === amount_cents) && (!payee || norm(e.payee).includes(norm(payee))))
        .sort((a, b) => days(a.date, date) - days(b.date, date)).slice(0, 40)
        .map((e) => ({ txn_id: e.txn_id, date: e.date, payee: e.payee, property: e.property, total: money(e.debit), source: e.source, memo: e.memo, has_receipt: !!e.doc_url, bank_lines: tiedTo(e.txn_id), voided_tonight: gone.has(e.txn_id) }));
    },
    documents: ({ docIds, vendor, amount_cents, date }) => {
      const view = (e) => { const m = e.model || {};
        return { docId: e.docId, status: e.status, source: e.source || "", subject: String(e.subject || "").slice(0, 120), from: String(e.from || ""), received: e.receivedAt || "",
          attachments: (e.attachments || []).map((a) => `${a.name} (${a.mime})`),
          read: e.model ? { vendor: m.vendor || "", date: m.date || "", total: money(m.receipt_total_cents || 0), invoice_number: m.invoice_number || "", verdict: m.verdict || "", why: String(m.why || "").slice(0, 300), duplicate_of: m.duplicate_of || "" } : null,
          txn_ids: e.result?.txn_ids || [], doc_url: e.result?.doc_url || "", review_note: String(e.review?.note || "").slice(0, 300), error: String(e.error || "").slice(0, 200) }; };
      if (docIds?.length) return docIds.map((d) => (byDoc.has(d) ? view(byDoc.get(d)) : { docId: d, missing: true }));
      const vw = words(vendor);
      return envelopes.filter((e) => !e.dryRun && (!date || days(e.model?.date || e.receivedAt || "", date) <= 10) && (amount_cents == null || e.model?.receipt_total_cents === amount_cents) &&
        (!vw.length || words(e.model?.vendor || e.subject).some((w) => vw.includes(w)))).slice(0, 20).map(view);
    },
  };

  const fixes = {
    take_out_double: {
      rail: ({ txn_id, keep_txn_id }) => {
        const a = byId.get(txn_id), k = byId.get(keep_txn_id);
        if (txn_id === keep_txn_id || !live(txn_id) || !live(keep_txn_id)) return "both entries must be live and different";
        if (a.date !== k.date || norm(a.payee) !== norm(k.payee) || a.debit !== k.debit || a.debit <= 0) return "they differ in date, payee or amount";
        if (a.source === "sale" || k.source === "sale") return "a sale is never a double";
        if ([...a.credited].sort().join() !== [...k.credited].sort().join()) return "the money moved differently in the two (a purchase and its return?)";
        if (a.source === "migration" && k.source !== "migration") return "the old books' row is the one kept (D-027)";
        if (tiedTo(txn_id).length && tiedTo(keep_txn_id).length) return "each is tied to its own bank line - the bank shows two charges";
        if (a.source === "bank" && k.source === "bank") return "two bank lines are two charges";
        if (fileId(a.doc_url) && fileId(a.doc_url) === fileId(k.doc_url) && a.property !== k.property) return "one bill split across houses";
        return "";
      },
      act: async ({ txn_id, keep_txn_id }) => {
        const res = await writer.void(txn_id, `the same charge as ${keep_txn_id} - taken out by the nightly check ${today}`, byId.get(txn_id).date.slice(0, 10), "claude");
        gone.add(txn_id);
        // its bank line (if any) belongs to the entry kept
        if (tiedTo(txn_id).length) { await writer.feedRetie(txn_id, [keep_txn_id], `the same charge as ${keep_txn_id}; its twin was taken out ${today}`); await refreshTabAfterWrite(writer, "Feed"); }
        await refreshTabAfterWrite(writer, "Journal");
        return { voided: txn_id, kept: keep_txn_id, void_txn_id: res.txn_id };
      },
    },
    point_receipt_at_entries: {
      rail: ({ docId, txn_ids }) => {
        const env = byDoc.get(docId), m = env?.model || {}, list = [...new Set(txn_ids)];
        if (!onList(facts.receipts_on_no_book, (r) => (r.copies || []).some((c) => c.startsWith(`${docId} `)))) return "the receipt is not on tonight's receipts_on_no_book list";
        if (!["posted", "dismissed"].includes(env?.status)) return `the document is ${env?.status || "missing"}`;
        if (!list.length || !list.every(live)) return "every entry named must be live";
        const sum = list.reduce((s, t) => s + byId.get(t).debit, 0);
        if (sum !== m.receipt_total_cents) return `the entries add up to ${money(sum)}, the receipt says ${money(m.receipt_total_cents || 0)}`;
        if (list.some((t) => days(byId.get(t).date, m.date) > 10)) return "an entry is more than 10 days from the receipt's date";
        return "";
      },
      act: async ({ docId, txn_ids }) => {
        const env = await fresh(docId), list = [...new Set(txn_ids)];
        const note = `its row is in the Journal: ${list.join(" and ")} - found by the nightly check ${today}`;
        await docsStore.setJSON(`doc/${docId}`, env.status === "posted"
          ? { ...env, result: { ...(env.result || {}), txn_ids: list }, review: { ...(env.review || {}), repointed: { from: env.result?.txn_ids || [], by: "the nightly check", at: at(), note } } }
          : { ...env, review: { ...(env.review || {}), action: "dismiss", by: "the nightly check", at: at(), note } });
        return { docId, txn_ids: list };
      },
    },
    file_missing_receipt: {
      rail: ({ txn_id, docId }) => {
        const env = byDoc.get(docId);
        if (!onList(facts.receipts_without_document, (x) => x.txn_id === txn_id) || !live(txn_id)) return "the entry is not on tonight's receipts_without_document list";
        if (!(env?.result?.txn_ids || []).includes(txn_id)) return "that document did not post this entry";
        if (!env.result?.doc_url && !(env.attachments || []).length) return "the document has no file (the email itself was the receipt)";
        return "";
      },
      act: async ({ txn_id, docId }) => {
        const env = await fresh(docId), e = byId.get(txn_id);
        let url = env.result?.doc_url || "";   // filed once already, the link never written: no second copy
        if (!url) {
          url = (await storeAttachmentsToDrive(writer, docsStore, env, [e.date.slice(0, 4), e.property || "OVERHEAD"], env.model))[0]?.url || "";
          if (!url) throw new Error("the document's file is no longer in the store");
          await docsStore.setJSON(`doc/${docId}`, { ...env, result: { ...(env.result || {}), doc_url: url } });
        }
        await writer.setDocUrl([txn_id], url);
        await refreshTabAfterWrite(writer, "Journal");
        return { txn_id, docId, doc_url: url };
      },
    },
    read_again: {
      rail: ({ docId }) => {
        const env = byDoc.get(docId);
        if (!onList(facts.errors, (x) => x.docId === docId) || env?.status !== "error") return "the document is not on tonight's errors list";
        if (String(env.receivedAt || env.startedAt || "").slice(0, 10) < CUTOVER) return "a document from before the cutover is never read again (D-067)";
        if (env.check_reread_at) return `the check already read it again on ${env.check_reread_at.slice(0, 10)}`;
        if (!origin || !process.env.POLLER_SECRET) return "the check cannot reach the bookkeeper from here";
        return "";
      },
      act: async ({ docId }) => {
        // books-inbox.mjs's reprocess, with the night it was tried kept on the document
        const env = await fresh(docId), stamp = at();
        await docsStore.setJSON(`doc/${docId}`, { ...env, status: "processing", startedAt: stamp, finishedAt: "", error: "", model: null, gate: null, result: null, check_reread_at: stamp });
        const res = await fetchImpl(`${origin}/api/ingest-bg`, { method: "POST", headers: { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET },
          body: JSON.stringify({ docId, reprocess: true, holdOnly: true }) }).catch((err) => ({ status: 0, err }));
        if (res.status !== 202 && res.status !== 200) {
          await docsStore.setJSON(`doc/${docId}`, { ...env, check_reread_at: stamp });
          throw new Error(`the bookkeeper did not take it (HTTP ${res.status})`);
        }
        return { docId };
      },
    },
  };

  const text = (v) => [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 1) }];
  async function run(name, input = {}) {
    if (lookups[name]) {
      try { return { ok: true, content: text(lookups[name](input)) }; } catch (err) { return { ok: false, error: String(err?.message || err).slice(0, 300) }; }
    }
    const fix = fixes[name];
    if (!fix) return { ok: false, error: `Unknown tool "${name}"` };
    const plain = String(input.plain || "").trim();
    const refuse = (why) => { refused.push({ fix: name, input, why }); return { ok: false, error: `Refused: ${why}. If it still needs doing, list it under "For Claude:".` }; };
    if (fixed.length >= MAX_FIXES) return refuse(`tonight's limit of ${MAX_FIXES} fixes is reached`);
    if (!plain || plain.length > 240 || ID_IN_TEXT.test(plain)) return refuse("`plain` must be one short sentence for Paul with no ids");
    const why = fix.rail(input);
    if (why) return refuse(why);
    if (dry) { fixed.push({ fix: name, plain, dry: true, ...input }); return { ok: true, content: text({ done: true, dry: true }) }; }
    try {
      const done = await fix.act(input);
      fixed.push({ fix: name, plain, ...done });
      return { ok: true, content: text({ done: true, ...done }) };
    } catch (err) {
      return refuse(`it failed: ${String(err?.message || err).slice(0, 200)}`);
    }
  }
  return { run, fixed, refused };
}

/**
 * Paul, 2026-10-27: "flag any charges that come through on my personal accounts". The entries recorded on `day` (the
 * Journal's posted_at, Texas time) that his own card paid for (paid_from PAUL - Recast owes him each one back, D-051), as
 * the lines the 3 AM email prints under the check: store, date, amount, house, and the card's last four when the receipt
 * shows them. The amount is what his card moved (account 2030): a refund to his card prints as money back. Code writes
 * these, not the model. "" when there are none. A cost the Recast Chase account paid is Paul's too (D-098: its cost
 * lines carry PAUL) but Chase is the business account, not a personal card, so an entry with a 1402 line is left out.
 */
export function onPaulsCard(journal, envelopes, day) {
  const idx = Object.fromEntries(journal.headers.map((h, i) => [h, i]));
  const g = (r, n) => (idx[n] === undefined ? "" : r[idx[n]]);
  const voided = new Set(journal.rows.map((r) => String(g(r, "void_of") || "")).filter(Boolean));
  const chase = new Set(journal.rows.filter((r) => String(g(r, "account")) === "1402").map((r) => String(g(r, "txn_id"))));
  const byTxn = new Map();
  for (const r of journal.rows) {
    const id = String(g(r, "txn_id"));
    if (String(g(r, "paid_from")) !== "PAUL" || chase.has(id) || String(g(r, "source")) === "void" || voided.has(id) || String(g(r, "posted_at")).slice(0, 10) !== day) continue;
    const e = byTxn.get(id) || byTxn.set(id, { date: String(g(r, "date")).slice(0, 10), payee: String(g(r, "payee")), property: "", cents: 0 }).get(id);
    if (String(g(r, "account")) === "2030") e.cents += cents(g(r, "credit")) - cents(g(r, "debit"));
    if (!e.property && g(r, "property")) e.property = String(g(r, "property"));
  }
  const card = new Map(envelopes.flatMap((e) => (e.result?.txn_ids || []).map((t) => [t, citedLast4(e.model)])));
  const list = [...byTxn.entries()].filter(([, e]) => e.cents !== 0).sort(([, a], [, b]) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!list.length) return "";
  const total = list.reduce((t, [, e]) => t + e.cents, 0);
  return [`Paid with your own card, recorded yesterday (${list.length}, $${money(total)}) - the business owes you these back:`,
    ...list.map(([t, e]) => `- ${e.payee}, ${e.date.slice(5)}, ${e.cents < 0 ? `$${money(-e.cents)} back to your card` : `$${money(e.cents)}`}, ${e.property || "no house"}${card.get(t) ? `, card ending ${card.get(t)}` : ""}`)].join("\n");
}

export const CHECK_PROMPT = `You are the nightly books check for Recast Properties LLC, a small real-estate flipping business. The books are a Google Sheets Journal (double-entry, append-only, voids are reversing entries) fed by a receipts bookkeeper whose review queue is a set of "envelopes" (one per document: status pending / posting / posted / dismissed / error).

You receive the facts the code gathered tonight as JSON. Look things up, fix what your fix tools cover, then write what Paul (the owner) should do. Rules:
- Look before you judge (bank_lines, entries, documents): the bank's own lines, the entries' lines and memos, the documents' reads and notes settle most items without anyone.
- Fix it yourself when a fix tool covers it and your look-ups settle it (Paul, 2026-10-27: "have the nightly check look things up and fix what it can on its own, and tell me in the morning email what it fixed"): take_out_double, point_receipt_at_entries, file_missing_receipt, read_again. Each takes \`plain\`: one sentence for Paul in his words, the store, the date and the dollar amount, no ids ("Took out the second $40.00 USPS mailbox key from 01-02 - it was in the books twice; the one on 1014 S View stays."). Code checks each fix against tonight's facts and prints \`plain\` under "Fixed overnight:" only when it ran - never mention a fix in your own bullets. When you are not sure, do not fix: list it under "For Claude:". A refused or failed fix goes under "For Claude:" with code's reason.
- Output at most eight bullets, each one action for Paul starting with a verb, in plain everyday words - he is not an accountant ("talk to me like im 5 years old", 2026-09-26): the store, the date, the dollar amount and what to click. "Approve the Atmos $67.39 card - it has waited 3 days", "Tell Claude what the Lowe's $84.12 of 10-09 was - no receipt has come in". No jargon in his sentence (entries, journal, envelope, migrated, gate, txn); an id goes at the end in parentheses so he can find it, exactly as given.
- A duplicate is two live entries with the same date, payee and amount; a migration entry beside a receipt entry is the classic replay - the receipt one is the twin to void. Read the memos first: different receipt or invoice numbers mean different charges (Anthropic top-ups repeat the same day) and need no action at all; the same number twice is the duplicate. When the memos do not settle it, look it up - two bank lines with their own feed_ids are two charges (the two 1.00 ATM fees of 10-07, one per withdrawal). A settled double you take out yourself (take_out_double); one your look-ups do not settle goes under "For Claude:" naming the ids - never ask Paul to "check" his statement.
- Pending cards are holds - Paul's decision is what they wait for, and some are parked on purpose for the Phase 3 bank statement. The queue count is context, not an action: never tell Paul to approve, dismiss or "clear" a card the check has not read. Mention the queue only if it is growing or a card is over 30 days old.
- Errors dated before 2026-09-17 are migration-era. Every migration leftover was settled with Paul on 2026-10-01 (docs/migration-leftovers-final.md), so one showing up now is Claude's to look at, never Paul's: a bullet under "For Claude:" naming the docIds. Do not ask for replays of them. An error since the cutover: read_again (once per document); if it was already tried, it is Claude's.
- receipts_on_no_book: every copy of each receipt listed was posted or dismissed against something that is not on the books, so the receipt may be on no book at all. Look for where it landed (entries near its date and amount, documents): when live entries add up to its total, point_receipt_at_entries. Otherwise Claude's job: one bullet per receipt under "For Claude:" naming the docIds ("Lowe's 03-16 $465.73 may be on no book - the only copy gm-... was dismissed against ...; find where it landed or post it").
- bank_lines is the bank statement tab. proposed_without_card: lines whose Inbox card is gone and that the matcher must see again - Claude's job, a bullet under "For Claude:" ("run Match statement lines on <account>"). tied_to_missing_entry: lines tied to an entry that was voided or is not in the books - Claude's job, name the ids there. open_over_10_days: charges nobody has explained - one bullet per line naming the store, the date and the amount, asking Paul for its receipt or a word on what it was.
- receipts_without_document: find the document that posted the entry (documents near its date and amount, its txn_ids) and file_missing_receipt.
- Paul's bullets are his own decisions only: approve or dismiss a card (Inbox), and a receipt or a word for a charge nobody has explained. Taking out a double and re-reading a failed document are your fixes, not his clicks. Anything else - an envelope whose status disagrees with the Journal, a stuck card, a Drive link to attach, a balance problem, an error to diagnose, a receipt on no book, a migration-era leftover, a bank line to re-match - is Claude's job and is NEVER a bullet for Paul (2026-10-26, Paul: "i thought we took care of all the lingering issues" - he was being mailed Claude's to-do list as chores to paste). Put every such item under one final line that reads exactly "For Claude:", one bullet each, self-contained, naming the ids, e.g. "- mark envelope gm-19f... posted, its entries receipt-2026... are on the Journal." Paul's bullets come first and hold only his own clicks; when he has none and Claude has some, his part is exactly "Books check: nothing for you to do."
- Do not repeat a fact without an action. Do not explain the rules. No headers, no preamble.
- If nothing needs Paul, answer exactly: Books check: clean.`;

/** The model's text split at its "For Claude:" line: Paul's bullets (his clicks) and Claude's own list. */
export function splitForClaude(text) {
  const m = String(text || "").match(/^\s*For Claude:\s*$/m);
  if (!m) return { paul: String(text || "").trim(), claude: "" };
  const paul = text.slice(0, m.index).trim();
  const claude = text.slice(m.index + m[0].length).trim();
  return { paul: paul || (claude ? "Books check: nothing for you to do." : ""), claude };
}

export async function runCheck({ writer, docsStore, cacheStore, anthropic, now = Date.now(), origin = "", fetchImpl = fetch, dry = false }) {
  const journal = await readTab(writer, "Journal", { all: true });
  const feed = await readTab(writer, "Feed").catch(() => null);   // the bank side of the check; never fatal
  const { blobs } = await docsStore.list({ prefix: "doc/" });
  const envelopes = (await Promise.all((blobs || []).map((b) => docsStore.get(b.key, { type: "json" })))).filter(Boolean);
  const heartbeat = await loadHeartbeat(cacheStore).catch(() => null);
  const facts = gatherFacts(journal, envelopes, now, MIGRATION_RECORD, feed, heartbeat);
  const tools = checkTools({ journal, feed, envelopes, facts, writer, docsStore, origin, now, fetchImpl, dry });

  // runBookkeeper's loop (lib/bookkeeper.mjs), cut down: the model ends by writing the check instead of calling decide
  const messages = [{ role: "user", content: [{ type: "text", text: `Facts as of ${new Date(now).toISOString()}:\n${JSON.stringify(facts, null, 1)}`, cache_control: { type: "ephemeral" } }] }];
  let text = "", usage = { input_tokens: 0, output_tokens: 0, turns: 0, model: MODEL_ID }, error = "";
  try {
    for (let turn = 0; ; turn++) {
      if (turn >= MAX_TURNS) { error = `the check used all ${MAX_TURNS} turns without writing its result`; break; }
      const res = await anthropic.beta.messages.create({
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        model: MODEL_ID,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: [{ type: "text", text: CHECK_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: CHECK_TOOLS,
        messages: placeCacheMarkers(messages),
      });
      usage = { input_tokens: usage.input_tokens + (res.usage?.input_tokens ?? 0), output_tokens: usage.output_tokens + (res.usage?.output_tokens ?? 0), turns: turn + 1, model: res.model || MODEL_ID };
      if (res.stop_reason === "refusal") { error = `the model declined (${res.stop_details?.category || "unspecified"})`; break; }
      if (res.stop_reason !== "tool_use") {
        text = (res.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        if (!text) error = `the model finished (${res.stop_reason}) with no text`;
        break;
      }
      messages.push({ role: "assistant", content: res.content });
      const results = [];
      for (const b of res.content.filter((c) => c.type === "tool_use")) {
        const out = await tools.run(b.name, b.input);
        results.push({ type: "tool_result", tool_use_id: b.id, content: out.ok ? out.content : [{ type: "text", text: `Error: ${out.error}` }], is_error: !out.ok });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (err) {
    error = `the model call failed: ${String((err && err.message) || err)}`;
  }

  // 2026-10-26: Claude's items are stored, never mailed as chores for Paul (Penny reads `claude` at the start of
  // every books session, docs/ops.md). The model writes them under one line "For Claude:".
  const { fixed, refused } = tools;
  let { paul, claude } = splitForClaude(text);
  // 2026-10-27: what code fixed tonight, in the model's words, first in Paul's email; what it refused, on Claude's list
  if (refused.length) claude = [claude, ...refused.map((r) => `- the check's ${r.fix} ${JSON.stringify({ ...r.input, plain: undefined })} was not done: ${r.why}`)].filter(Boolean).join("\n");
  if (fixed.length && (!paul || /^Books check: (clean|nothing for you to do)\.$/.test(paul))) paul = "Books check: nothing for you to do.";
  text = [fixed.length ? ["Fixed overnight:", ...fixed.map((f) => `- ${f.plain}`)].join("\n") : "", paul, waitingOnReceipts(journal),
    onPaulsCard(journal, envelopes, chicagoDate(now - 864e5))].filter(Boolean).join("\n");

  const date = chicagoDate(now);
  const check = { date, ranAt: new Date(now).toISOString(), text, claude, error, usage, fixed, refused, facts, ...(dry ? { dry: true } : {}) };
  if (dry) { await cacheStore.setJSON(`reconcile/dry/${date}`, check); return check; }   // never the digest's
  await cacheStore.setJSON(`reconcile/${date}`, check);
  await cacheStore.setJSON("reconcile/latest", check);
  return check;
}

export default async (req) => {
  const configErr = requireConfig(["WRITER_URL", "WRITER_SECRET", "POLLER_SECRET", "ANTHROPIC_API_KEY"]);
  if (configErr) return configErr;
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });
  const check = await runCheck({ writer: getWriter(), docsStore: getDocsStore(), cacheStore: getCacheStore(), anthropic: clientForTests || new Anthropic({ maxRetries: 4 }), // the first hand run died on "Connection error" after the default 2
    origin: new URL(req.url).origin, dry: (await req.json().catch(() => ({})))?.dry === true });
  if (check.error) console.error("reconcile-bg: " + check.error);
  return json(200, { ok: !check.error, date: check.date, text: check.text, error: check.error });
};

export const config = { path: "/api/reconcile-bg" };
