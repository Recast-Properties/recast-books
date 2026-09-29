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
  later: "Waiting for the closing",
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
        status = BANK_STATUS.later;
        say = note.replace(/^Waits:\s*/, "");
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
  const count = (s) => rows.filter((r) => r[4] === s).length;
  const on = (w) => rows.filter((r) => r[5] === w).length;
  return `${rows.length} lines - ${count(BANK_STATUS.done)} reconciled, ${on("Dennis")} waiting on Dennis, ${on("Paul")} waiting on Paul, ${count(BANK_STATUS.later)} waiting for a closing`;
}
