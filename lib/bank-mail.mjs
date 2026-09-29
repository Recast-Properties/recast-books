// lib/bank-mail.mjs - D-059: which card paid a bank line.
//
// The bank's file (QFX) says what was charged, never which card. Citizens' "Daily Summary" email
// does: under every line, "9301 - DENNIS C LITTLE". Code reads it - this is arithmetic and
// matching, not judgment - and the matcher shows the model and Paul's card what it found.
// It fails closed: a summary whose lines do not add up to the total the email itself prints is
// not used, and a bank line two different cards could explain gets no card at all.

const MONEY = /-?\$\s?[\d,]+\.\d{2}/;
const cents = (s) => Math.round(Number(String(s).replace(/[$,\s]/g, "")) * 100);
const SECTION = /(Pending Transactions|Debits|Credits)\s*:\s*(?:\(\s*[-+]\s*\))?/g;
const KIND = { "Pending Transactions": "pending", Debits: "debit", Credits: "credit" };
const MARK = "ⓘ";   // the circled i the email puts before the card

/**
 * One Daily Summary email's text (Gmail's plain body) -> {account_last4, date, ok, why, lines}.
 * A line: {kind: debit|credit|pending, description, amount_cents, signed_cents, card_last4,
 * card_name}. `signed_cents` is as the bank's file shows it (a debit is negative). `ok` is false
 * when a section's lines do not add up to the total printed under it. null when the text is not
 * a Daily Summary.
 */
export function parseDailySummary(text) {
  const flat = String(text || "").replace(/<https?:[^>\s]*>/g, " ").replace(/\s+/g, " ").trim();
  const head = /Account:\s*(\d{4})\s+Date:\s*(\d{2})\/(\d{2})\/(\d{2})\b/.exec(flat);
  if (!head) return null;
  const out = { account_last4: head[1], date: `20${head[4]}-${head[2]}-${head[3]}`, ok: true, why: "", lines: [] };

  const marks = [...flat.matchAll(SECTION)];
  marks.forEach((m, i) => {
    const kind = KIND[m[1]];
    let body = flat.slice(m.index + m[0].length, i + 1 < marks.length ? marks[i + 1].index : flat.length);
    const total = /Total (?:Debits|Credits)\s*(\$\s?[\d,]+\.\d{2})/.exec(body);
    const end = body.search(/Total (?:Debits|Credits)|\d{2}\/\d{2} Avail Balance|Avail(?:able)? Balance/);
    if (end !== -1) body = body.slice(0, end);

    // "<description> (i) <card or the kind of payment> <amount> <description> (i) ..."
    const parts = body.split(MARK);
    let description = parts[0].trim();
    const found = [];
    for (let p = 1; p < parts.length; p++) {
      const amount = MONEY.exec(parts[p]);
      if (!amount || MONEY.test(description)) { out.ok = false; out.why = `could not read the ${m[1]} lines`; return; }
      const label = parts[p].slice(0, amount.index).trim();
      const card = /^(\d{4})\s*-\s*(.+)$/.exec(label);
      const c = Math.abs(cents(amount[0]));
      found.push({ kind, description, amount_cents: c, signed_cents: kind === "credit" ? c : -c, card_last4: card ? card[1] : "", card_name: card ? card[2].trim() : "" });
      description = parts[p].slice(amount.index + amount[0].length).trim();
    }
    if (total && found.reduce((t, l) => t + l.amount_cents, 0) !== cents(total[1])) {
      out.ok = false;
      out.why = `the ${m[1]} lines do not add up to the email's own total ${total[1]}`;
      return;
    }
    out.lines.push(...found);
  });
  return out;
}

/** "DENNIS C LITTLE" -> "Dennis" - who Paul would say the card belongs to. */
export function holderOf(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
}

/**
 * Which card paid each bank line: Map feed_id -> {last4, name, holder}. A line gets a card only
 * when every posted email line for that day and amount names the SAME card - two charges for the
 * same amount on the same day on different cards cannot be told apart, so neither gets one.
 * Pending lines never count (the bank's file holds posted lines only).
 *   lines: [{feed_id, date, amount_cents}] - amount signed as the bank's file shows it
 *   summaries: parseDailySummary results;  last4s: the account's numbers (Bank accounts.last4)
 */
export function cardsForLines(lines, summaries, last4s = []) {
  const posted = new Map();
  for (const s of summaries) {
    if (!s || !s.ok || !last4s.includes(s.account_last4)) continue;
    for (const l of s.lines) {
      if (l.kind === "pending") continue;
      const key = `${s.date}|${l.signed_cents}`;
      (posted.get(key) || posted.set(key, []).get(key)).push(l);
    }
  }
  const out = new Map();
  for (const line of lines) {
    const mail = posted.get(`${line.date}|${line.amount_cents}`) || [];
    const cards = new Set(mail.map((l) => l.card_last4));
    if (cards.size !== 1 || cards.has("")) continue;
    out.set(line.feed_id, { last4: mail[0].card_last4, name: mail[0].card_name, holder: holderOf(mail[0].card_name) });
  }
  return out;
}

/** Every stored summary, parsed (netlify/functions/books-bank-mail.mjs keeps them under bankmail/). */
export async function loadSummaries(store, prefix = "bankmail/") {
  const { blobs } = await store.list({ prefix });
  const mails = await Promise.all((blobs || []).map((b) => store.get(b.key, { type: "json" })));
  return mails.filter(Boolean).map((m) => parseDailySummary(m.bodyText)).filter(Boolean);
}
