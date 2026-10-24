// lib/feed-tie.mjs - which open bank line a posted entry pays for (audit 2026-10-24 #1, #2).
//
// Pure, no imports; it also runs inside the workbook (scripts/build-gs.mjs puts it in lib.gs). A receipt's
// entries say what left (or came back to) a bank account; the Feed tab says what the bank saw. When exactly one
// open line of that account carries the same amount within TIE_DAYS of the entry's date, the two are the same
// payment: code ties them and retires the line's Inbox card. Until 2026-10-24 only an automatic post whose read
// named the card did this; a receipt Paul saved by hand left its bank card waiting - nine of the thirty cards in
// the Inbox that day were already answered.

export const TIE_DAYS = 10;
const OPEN = { unmatched: true, proposed: true };

/**
 * The bank movements of a post: [{account, bank_cents, date}], one per bank account the entries touch,
 * bank_cents signed as the bank's file shows it (money out negative, a refund positive). `entries` are built
 * entries ({date, lines:[{account, debit, credit}]} in cents); `isBank(code)` says which accounts are banks.
 */
export function bankMovements(entries, isBank) {
  const by = new Map();
  let date = "";
  for (const e of entries || []) {
    if (!date) date = String(e.date || "");
    for (const l of e.lines || []) {
      const code = String(l.account || "");
      if (!isBank(code)) continue;
      by.set(code, (by.get(code) || 0) + (Number(l.debit) || 0) - (Number(l.credit) || 0));
    }
  }
  return [...by].filter(([, c]) => c !== 0).map(([account, bank_cents]) => ({ account, bank_cents, date }));
}

/**
 * The one open Feed row a movement pays for, or null - none, or more than one, which is the matcher's call.
 * `rows`: {feed_id, account, date, amount_cents, status, txn_id} as feedRows / the Feed tab give them.
 */
export function openLineFor(rows, { account, bank_cents, date }, days = TIE_DAYS) {
  const at = Date.parse(date);
  if (!Number.isFinite(at)) return null;
  const hits = (rows || []).filter((r) => String(r.account) === String(account) && OPEN[String(r.status)] && !String(r.txn_id || "") &&
    Number(r.amount_cents) === bank_cents && Math.abs(Date.parse(r.date) - at) <= days * 864e5);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * The one untied entry that explains a bank line, or null: `candidates` as lib/feed-match.mjs buildCandidates
 * gives them ({txn_id, date, amount_cents} signed as the bank shows it), `used` the txn_ids spoken for already.
 */
export function candidateFor(candidates, { amount_cents, date }, used = new Set(), days = TIE_DAYS) {
  const at = Date.parse(date);
  if (!Number.isFinite(at)) return null;
  const hits = (candidates || []).filter((c) => !used.has(c.txn_id) && Number(c.amount_cents) === Number(amount_cents) &&
    Math.abs(Date.parse(c.date) - at) <= days * 864e5);
  return hits.length === 1 ? hits[0] : null;
}
