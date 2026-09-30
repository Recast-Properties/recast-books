// lib/bank-sheet.mjs - the bank account's own tab (Paul, 2026-09-29): every line of the account,
// newest on top, who paid, and where it stands - so he can show Dennis what is reconciled and what
// he still needs from him. Code, not judgment: it reads the Feed tab and the Journal and says what
// they already hold. The writer (Code.gs refreshBankSheets_) puts the rows on the tab.

import { NEED_RECEIPT } from "./gate.mjs";

export const BANK_SHEET_HEADER = ["Date", "Amount", "What the bank says", "Who paid", "Status", "Waiting on", "House", "Note"];

export const BANK_STATUS = {
  done: "Reconciled",
  receipt: "Waiting for receipt",
  answer: "Waiting for an answer",
  later: "Waiting for closing",   // followed by " : <house>" when the note names one (Paul, 2026-09-29)
  booking: "Being recorded",
  fresh: "New - not looked at yet",
  excluded: "Left out",
  broken: "Needs a look",
};

const BANK_ACCOUNT = /^14\d\d$/;
const ids = (s) => String(s || "").split(/[\s,]+/).filter(Boolean);
const proper = (s) => { const t = String(s || "").trim().toLowerCase(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ""; };
/** "Dennis (9301)" -> "Dennis"; what Paul typed by hand ("Dennis") stays as it is. */
export const holderOfCard = (card) => String(card || "").replace(/\s*\(.*$/, "").trim();
const house = (p) => (p === "OVERHEAD" ? "Business" : p);
/** A note as Paul reads it: no decision numbers, and nothing when it only says where it was clicked. */
const plain = (note) => String(note || "").replace(/\s*\(D-\d+\)/g, "").replace(/^Recorded from the Inbox$/, "").trim();

/**
 * @param {Array<{feed_id, account, date, amount, name, memo, status, txn_id, match_note, card}>} feed
 *        the Feed tab's rows; date is YYYY-MM-DD, amount is dollars as the bank shows it
 * @param {Array<object>} journal loadJournal lines
 * @param {string} account the bank account's code ("1401")
 * @returns {any[][]} one row per bank line in BANK_SHEET_HEADER order, newest first
 */
export function bankSheetRows(feed, journal, account) {
  const voided = new Set(journal.map((l) => l.void_of).filter(Boolean));
  // the houses the books know, longest name first, to find the one a note names
  const houses = [...new Set(journal.map((l) => l.property).filter((p) => p && p !== "OVERHEAD"))].sort((a, b) => b.length - a.length);
  const byTxn = new Map();
  for (const l of journal) {
    if (l.void_of || l.source === "void") continue;
    (byTxn.get(l.txn_id) || byTxn.set(l.txn_id, []).get(l.txn_id)).push(l);
  }

  return feed
    .filter((r) => String(r.account) === String(account))
    .sort((a, b) => (a.date === b.date ? String(b.feed_id).localeCompare(String(a.feed_id)) : String(b.date).localeCompare(String(a.date))))
    .map((r) => {
      const who = holderOfCard(r.card);
      const note = plain(r.match_note);
      let status, waiting = "", where = "", say = note;

      if (r.status === "matched") {
        const tied = ids(r.txn_id);
        const live = tied.filter((t) => !voided.has(t) && byTxn.has(t));
        // a card of several bank lines ties every line to all of its entries: the entry for this
        // very amount speaks for the line when there is one (three charges, three placeholders)
        const cents = Math.round((Number(r.amount) || 0) * 100);
        const onBank = (t) => byTxn.get(t).filter((l) => String(l.account) === String(account)).reduce((sum, l) => sum + l.debit - l.credit, 0);
        const own = live.filter((t) => onBank(t) === cents);
        const lines = (own.length ? own : live).flatMap((t) => byTxn.get(t)).filter((l) => !BANK_ACCOUNT.test(l.account));
        where = [...new Set(lines.map((l) => house(l.property)).filter(Boolean))].join(", ");
        const holder = lines.map((l) => String(l.description)).find((d) => d.includes(NEED_RECEIPT));
        if (!live.length || live.length < tied.length) {
          status = BANK_STATUS.broken; waiting = "Claude";
          say = "The entry this line was tied to was taken out of the books";
        } else if (holder) {
          status = BANK_STATUS.receipt;
          waiting = proper(holder.slice(holder.indexOf(NEED_RECEIPT) + NEED_RECEIPT.length)) || who;
          say = "Recorded - the receipt takes its place when it comes";
        } else {
          status = BANK_STATUS.done;
          const first = lines[0];
          if (!say && first) say = [first.payee, first.description].filter(Boolean).join(" - ") + (lines.length > 1 ? ` (+${lines.length - 1} more)` : "");
        }
      } else if (r.status === "proposed") {
        // a card in Paul's Inbox: a charge on a card needs that person's receipt, anything else Paul's word
        status = who && Number(r.amount) < 0 ? BANK_STATUS.receipt : BANK_STATUS.answer;
        waiting = who || "Paul";
        say = note.replace(/^In the Inbox:\s*/, "");
      } else if (r.status === "excluded") {
        status = BANK_STATUS.excluded;
      } else if (/^Waits:/.test(note)) {
        say = note.replace(/^Waits:\s*/, "");
        where = houses.find((h) => say.includes(h)) || "";
        status = BANK_STATUS.later + (where ? ` : ${where}` : "");
      } else if (/^Paul:/.test(note)) {
        status = BANK_STATUS.booking; waiting = "Claude";
      } else {
        status = BANK_STATUS.fresh;
        say = "";
      }
      return [r.date, Number(r.amount) || 0, String(r.memo || "").length >= String(r.name || "").length ? r.memo : r.name, who, status, waiting, where, say];
    });
}

/** The line above the table: how many lines stand where. */
export function bankSheetSummary(rows) {
  const count = (s) => rows.filter((r) => String(r[4]).startsWith(s)).length;
  const on = (w) => rows.filter((r) => r[5] === w).length;
  return `${rows.length} lines - ${count(BANK_STATUS.done)} reconciled, ${on("Dennis")} waiting on Dennis, ${on("Paul")} waiting on Paul, ${count(BANK_STATUS.later)} waiting for a closing`;
}

/**
 * The bank-vs-books box at the top of the tab (Paul, 2026-09-30: part of what is already built,
 * no new step): what the bank says, every reason the books differ, what the books say, and
 * anything left with no reason - line by line. Code, not judgment.
 * Bank = the account's opening balance + every bank line (the import already checks the file
 * ties to the bank's own balance). Books = the account's lines on the Journal. A bank line is
 * in the books when it is tied to live entries; a books line is on the bank when its entry is
 * tied to a bank line. Whatever is left after both lists is rounding (under a dollar) or not
 * explained.
 * @returns {{ bank_cents, books_cents, reasons: Array<{text, cents}>, unexplained: Array<{date, cents, text}> }}
 */
export function bankCheck(feed, journal, account, openingCents = 0) {
  const acct = String(account);
  const lines = feed.filter((r) => String(r.account) === acct);
  const cents = (v) => Math.round((Number(v) || 0) * 100);
  const voided = new Set(journal.map((l) => l.void_of).filter(Boolean));
  const live = new Set(journal.filter((l) => l.source !== "void" && !voided.has(l.txn_id)).map((l) => l.txn_id));
  const houses = [...new Set(journal.map((l) => l.property).filter((p) => p && p !== "OVERHEAD"))].sort((a, b) => b.length - a.length);

  const bank_cents = lines.reduce((s, r) => s + cents(r.amount), openingCents);
  const books_cents = journal.filter((l) => String(l.account) === acct).reduce((s, l) => s + l.debit - l.credit, 0);

  const onBank = new Set();
  const groups = new Map();   // reason -> { n, cents }
  const unexplained = [];
  const add = (text, c) => { const g = groups.get(text) || groups.set(text, { n: 0, cents: 0 }).get(text); g.n++; g.cents -= c; };
  for (const r of lines) {
    const tied = ids(r.txn_id);
    const note = String(r.match_note || "");
    if (r.status === "matched" && tied.length && tied.every((t) => live.has(t))) { tied.forEach((t) => onBank.add(t)); continue; }
    if (r.status === "excluded") add("left out on purpose", cents(r.amount));
    else if (r.status === "matched") unexplained.push({ date: r.date, cents: cents(r.amount), text: `On the bank (${r.name || r.memo}), tied to something taken out of the books` });
    else if (/^Waits:/.test(note)) {
      const h = houses.find((x) => note.includes(x));
      add(`waiting for ${h ? `the ${h}` : "a"} closing - not in the books until the house closes`, cents(r.amount));
    }
    else if (r.status === "proposed") add("still open in the Inbox - not in the books yet", cents(r.amount));
    else add("not looked at yet", cents(r.amount));
  }

  // books lines no bank line stands behind, one per entry
  const first = lines.reduce((m, r) => (!m || r.date < m ? r.date : m), "");
  const byTxn = new Map();
  for (const l of journal) {
    if (String(l.account) !== acct || !live.has(l.txn_id) || onBank.has(l.txn_id)) continue;
    const e = byTxn.get(l.txn_id) || byTxn.set(l.txn_id, { date: String(l.date).slice(0, 10), cents: 0, what: "" }).get(l.txn_id);
    e.cents += l.debit - l.credit;
    e.what = e.what || [l.payee, l.description].filter(Boolean).join(" - ") + (l.property ? ` (${house(l.property)})` : "");
  }
  let before = 0;
  for (const e of byTxn.values()) {
    if (!e.cents) continue;
    if (first && e.date < first) { before += e.cents; continue; }
    unexplained.push({ date: e.date, cents: e.cents, text: `In the books as paid from this account, not on the bank: ${e.what}` });
  }
  if (before) unexplained.push({ date: first, cents: before, text: "In the books before the bank's first line" });

  const reasons = [...groups].map(([text, g]) => ({ text: `${g.n} bank line${g.n > 1 ? "s" : ""} ${text}`, cents: g.cents }));
  const rest = books_cents - bank_cents - reasons.reduce((s, r) => s + r.cents, 0) - unexplained.reduce((s, u) => s + u.cents, 0);
  if (rest && Math.abs(rest) < 100) reasons.push({ text: "pennies of rounding in the old books", cents: rest });
  else if (rest) unexplained.push({ date: "", cents: rest, text: "A difference no line accounts for" });
  unexplained.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { bank_cents, books_cents, reasons, unexplained };
}

/** The box as tab rows: [date, amount, text], amounts in dollars. */
export function bankCheckRows(check, bankName) {
  const d = (c) => c / 100;
  const rows = [
    ["", d(check.bank_cents), `What ${bankName} says is in the account`],
    ...check.reasons.map((r) => ["", d(r.cents), r.text]),
    ...check.unexplained.map((u) => [u.date, d(u.cents), u.text]),
    ["", d(check.books_cents), "What the books say is in the account"],
  ];
  const head = check.unexplained.length
    ? `Bank vs books: ${check.unexplained.length} thing${check.unexplained.length > 1 ? "s" : ""} not explained - listed below`
    : "Bank vs books: they agree - every dollar of difference has a reason";
  return [[head, "", ""], ...rows];
}
