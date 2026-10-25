// lib/inbox-card.mjs - the Inbox card's logic: what a card says, what Save records, the yellow box, the bank-line
// card (audit 2026-10-24 #19). Pure: the dialog's state comes in as arguments (its SWAP map, the account picker, the
// autofile ceiling, the card's edited entries) and the words go out as HTML. The same code runs in the dialog:
// scripts/build-gs.mjs writes it into apps-script/writer/InboxCard.html, which Inbox.html includes after Style.html
// (NEED_RECEIPT is Inbox.html's own declaration there, PLAIN_WORDS is Style.html's; both imports are stripped by the
// build). test/inbox-card.test.mjs imports this file; the dialog's own text is linted in test/writer-gs-lint.test.mjs.
import { NEED_RECEIPT } from "./gate.mjs";
import { PLAIN_WORDS } from "./plain-words.mjs";

/** Style.html's escapeHtml_, again: the module cannot see the dialog's. */
function escapeHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

export const WAITING_ON = ['Dennis', 'Paul'];
// Grouped so "business vs a property" is visible in the list itself (Paul, 2026-09-23:
// "there is no general tools category that is for the business vs a property" - 6510 is
// that category, it just did not say so). Series rules are lib/posting.mjs's, D-010.
export const ACCT_GROUPS = ['Property costs - needs a property', 'Business overhead - OVERHEAD only', 'Cash, prepaid and other'];
// Every bullet is something Paul has to DO, in his words (2026-09-23: "this needs to be
// explicit for the action i need to take. this is still too much"). Claude's reasoning is
// not a bullet - it is one click away under "Claude's read". Plain everyday words, and only
// actions the card allows (2026-09-26: "i'm not an accountant. talk to me like im 5 years old").
export const GATE_TEXT = {
  NOT_POST_VERDICT: '',                                             // covered by the catch-all below
  LOW_CONFIDENCE: 'Claude is not sure of the amounts - check them against the receipt, then Save',
  MISSING_VENDOR: 'Claude could not read the store name - click Reprocess, or Dismiss all',
  MISSING_DATE: 'Claude could not read the date - click Reprocess, or Dismiss all',
  BAD_DATE: 'Dated in the future, or not a real date - a payment that has not happened yet is not a receipt: Dismiss all, the receipt comes when it is paid',
  ZERO_TOTAL: 'Claude could not read the total - type the amounts, or Dismiss all',
  OVER_CEILING: 'Too big for Claude to record on its own - check it, then Save',
  TOTAL_MISMATCH: 'The items do not add up to the receipt total - fix the amounts',
  NEEDS_HUMAN_274D: 'Meal or gift - type who it was with and the business reason',
  NO_ENTRIES: 'Claude found nothing to record - type the item in the fields below, click Reprocess to read it again, or Dismiss all',
  BAD_PROPERTY: 'Which house is this for? Pick one',
  PAYER_UNKNOWN: 'Who paid? Pick the card or account',
  BAD_PAID_FROM: 'Who paid? Pick the card or account again',
  PARTLY_ON_BOOKS: 'Some items never got recorded - pick Approve, Returned or Dismiss on each, then Save'
};
export const TRADELESS_ACCOUNTS = ['1000', '1100', '1200', '1210', '1220'];  // summary lines, never in a tab block
// Each line's own choice (Paul, 2026-09-26: "some itemized items will be returned, some dismissed, some approved.
// its not a blanket response for all items. that defeats the purpose of itemizing"). Approve is the default.
export const DECISIONS = { approve: 'Approve', returned: 'Returned', dismiss: 'Dismiss' };
// A card born from a bank line (Phase 3) is not a receipt: the bullets say what Claude asks and which
// button answers it (Paul, 2026-09-28: "the system is not set up for this type of thing").
// Audit 2026-10-24 #5: money between Paul, Dennis and the bank - a wire, a transfer, a deposit, a sale's payout -
// is never a purchase, and Save on a bank card runs no ceiling: one Save would have booked the 147,729.38 wire
// of 10-09 as a house cost. Such a card gets no line to fill in and no Save; Dismiss all with a note routes it to
// Claude, who books it the right way (D-055, D-083, D-084). A line over the autofile ceiling is treated the same.
export const PARTNER_RE = /\b(wire|fedwire|transfer|deposit|payout|dennis|little|recast prop)\b/i;
export const PARTNER_TEXT = 'This is money moving between you, Dennis and the bank - a wire, a transfer, a deposit or a payout - not a purchase, so there is nothing to fill in. Click Dismiss all and say in your own words what it was; Claude books it the right way.';
export function isWaiting_(entries) {
  return (entries || []).some(function (e) { return (e.items || []).some(function (it) { return String(it.description || '').indexOf(NEED_RECEIPT) === 0; }); });
}
// The bank lines a card was made from, one by one - [{date, amount_cents (signed), name}] - read off
// the card's own text ("2026-09-28  -162.91  Home Depot Waxahachie", lib/feed-match.mjs cardEnvelope;
// a lint runs this on a card that code made). null when they cannot be read, or do not add up to
// the card: a card of three charges must never be recorded as one lump.
export function bankLines_(env) {
  var f = env.feed || {}, m = env.model || {}, out = [];
  String(env.bodyText || '').split('\n').forEach(function (t) {
    var p = /^(\d{4}-\d{2}-\d{2}) {2}(-?\d[\d,]*\.\d{2}) {2}(.*)$/.exec(t);
    if (p) out.push({ date: p[1], amount_cents: Math.round(parseFloat(p[2].replace(/,/g, '')) * 100), name: p[3] });
  });
  var sum = out.reduce(function (t, l) { return t + l.amount_cents; }, 0);
  var want = f.amount_cents != null ? Number(f.amount_cents) : null;
  if (!out.length || out.length !== (f.feed_ids || []).length) return null;
  if (want != null ? sum !== want : Math.abs(sum) !== Number(m.receipt_total_cents)) return null;
  return out;
}
// A placeholder is ONE entry per bank line - the bank's date, store and amount on one item, on the
// house Paul picks - because each charge has its own receipt, and a receipt finds its placeholder
// by the amount (2026-09-29: three Home Depot charges came as one card of $337.07). null when the
// card's lines cannot be read one by one, or one of them is money in.
export function placeholderEntries_(env, who, house) {
  var m = env.model || {}, lines = bankLines_(env);
  if (!lines || lines.some(function (l) { return l.amount_cents >= 0; })) return null;
  return lines.map(function (l) {
    return { date: l.date, payee: l.name, memo: 'recorded from the bank statement - the receipt has not come in', property: house, paid_from: m.paid_from,
      items: [{ account: '1030', amount_cents: -l.amount_cents, description: NEED_RECEIPT + ' ' + String(who).toUpperCase(),
        trade: 'Waiting on receipt', business_purpose: '', property: house }] };
  });
}
// Money out only, every line of it: a deposit or a refund is never a purchase waiting on its receipt.
export function moneyOut_(env) {
  var lines = bankLines_(env);
  return !!lines && lines.every(function (l) { return l.amount_cents < 0; });
}
// What this card would take the place of in the books, ticked or not: the charge Paul was waiting
// on (D-057, the gate found the placeholder), or an earlier copy the read names in `supersedes`
// (D-058: a ride before its tip, an invoice before it was amended) - `earlier` marks that kind.
export function swapCandidate_(env) {
  var g = env.gate || {}, m = env.model || {};
  if (env.source === 'feed') return null;
  if (g.placeholder) return g.placeholder;
  if (!m.supersedes) return null;
  var r = g.replaces && g.replaces.txn_id === m.supersedes ? g.replaces : {};
  return { txn_id: String(m.supersedes), earlier: true, payee: r.payee, date: r.date, total_cents: r.total_cents, property: r.property };
}
// ...and what Save will take out: nothing once Paul unticks the box.
export function swapOf_(env, swap) { return (swap || {})[env.docId] === false ? null : swapCandidate_(env); }
export function tabOf_(env) { return env.source === 'feed' ? 'bank' : 'receipts'; }
export function money_(cents) { var n = Number(cents || 0) / 100; return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2); }   // a refund reads -$43.80
export function cents_(v) {
  var n = Math.round(parseFloat(String(v).replace(/[$,\s]/g, '')) * 100);
  return isFinite(n) ? n : 0;
}
export function opt_(value, label, selected) {
  return '<option value="' + escapeHtml_(value) + '"' + (selected ? ' selected' : '') + '>' + escapeHtml_(label) + '</option>';
}
export function acctGroup_(code) {
  var c = String(code);
  if (c.charAt(0) === '1' && c < '1400') return ACCT_GROUPS[0];
  if (c.charAt(0) === '6' || c.charAt(0) === '7') return ACCT_GROUPS[1];
  return ACCT_GROUPS[2];
}
export function flagText_(r) {
  var t = String(r), i = t.indexOf(':');
  var head = i < 0 ? t : t.slice(0, i), rest = i < 0 ? '' : t.slice(i + 1);
  if (head === 'DUPLICATE_OF') return 'Already in the books - Dismiss all (' + rest + ')';
  if (head === 'POSSIBLE_TWIN') return 'Might already be in the books - check, then Save or Dismiss all (' + rest + ')';
  if (head === 'ENTRY_INVALID') return 'Will not save as it is: ' + (PLAIN_WORDS[rest] || rest).replace(/^Nothing was saved - /, '') + ' Or Dismiss all';   // #12: the same words as a refusal
  if (head === 'PLACEHOLDER_WAITING') return 'This looks like a receipt you were waiting on - check the yellow box below, then Save';
  return GATE_TEXT.hasOwnProperty(head) ? GATE_TEXT[head] : t;
}
// A property cost with no trade lands in no block on the property tab: counted in the
// totals, itemized nowhere. That is how an Energy Texas bill went missing (2026-09-23).
export function needsTrade_(entries) {
  return (entries || []).some(function (e) {
    if (!e.property || e.property === 'OVERHEAD') return false;
    return (e.items || []).some(function (it) {
      var a = String(it.account || '');
      return a.charAt(0) === '1' && TRADELESS_ACCOUNTS.indexOf(a) < 0 && !String(it.trade || '').trim();
    });
  });
}
export function acctName_(code, accounts) {
  var a = (accounts || []).filter(function (x) { return String(x.code) === String(code); })[0];
  return a ? a.name : String(code);
}
// D-010, checked against what is on the card right now rather than what the model first
// proposed - the ingest gate never saw Paul's edits.
export function mismatchFlags_(entries, accounts) {
  var out = [];
  (entries || []).forEach(function (e) {
    (e.items || []).forEach(function (it) {
      var g = acctGroup_(it.account || ''), prop = itemProperty_(e, it);
      if (!it.account) return;
      // Name the line (Paul, 2026-10-23: batteries on OVERHEAD under Rehab - materials went to the engine and
      // came back PROPERTY_REQUIRED; the flag alone did not stop the Save, and did not say which item).
      var who = it.description ? '"' + String(it.description).slice(0, 40) + '": ' : '';
      if (g === ACCT_GROUPS[1] && prop && prop !== 'OVERHEAD') out.push(who + acctName_(it.account, accounts) + ' is a business cost, not a house cost - set its house to OVERHEAD, or pick a house account');
      if (g === ACCT_GROUPS[0] && prop === 'OVERHEAD') out.push(who + acctName_(it.account, accounts) + ' is a house cost - pick which house for it, or a business account (the Business overhead group, e.g. Office supplies or Small tools)');
      if (g === ACCT_GROUPS[0] && !prop) out.push(who + acctName_(it.account, accounts) + ' needs a house - pick which one');
    });
  });
  return out.filter(function (t, i) { return out.indexOf(t) === i; });
}
export function itemsSum_(entries) {
  var sum = 0;
  (entries || []).forEach(function (e) { (e.items || []).forEach(function (it) { sum += Number(it.amount_cents) || 0; }); });
  return sum;
}
export function decisionOf_(it) { return DECISIONS.hasOwnProperty(it && it.decision) ? it.decision : 'approve'; }
export function approvedOnly_(entries) {
  return (entries || []).map(function (e) {
    var c = {}; for (var k in e) c[k] = e[k];
    c.items = (e.items || []).filter(function (it) { return decisionOf_(it) === 'approve'; });
    return c;
  });
}
// What Save records (`keep`), and the note that keeps the rest: "Returned ($9.95): ... | Dismissed ($2.58): ... -
// personal". A store credit on a bank statement is matched to the "Returned (" part (docs/phase3-spec.md 3a).
export function sortByDecision_(entries) {
  var keep = [], lines = { returned: [], dismiss: [] }, sum = { approve: 0, returned: 0, dismiss: 0 };
  (entries || []).forEach(function (e) {
    var kept = [];
    (e.items || []).forEach(function (it) {
      var d = decisionOf_(it), cents = Number(it.amount_cents) || 0;
      if (!cents && !it.description) return;   // a blank line added by hand
      sum[d] += cents;
      if (d !== 'approve') { lines[d].push((it.description || 'no description') + (d === 'dismiss' && it.reason ? ' - ' + it.reason : '')); return; }
      var c = JSON.parse(JSON.stringify(it)); delete c.decision; delete c.reason; kept.push(c);
    });
    if (kept.length) { var k = JSON.parse(JSON.stringify(e)); k.items = kept; keep.push(k); }
  });
  var note = [];
  if (lines.returned.length) note.push('Returned (' + money_(sum.returned) + '): ' + lines.returned.join('; '));
  if (lines.dismiss.length) note.push('Dismissed (' + money_(sum.dismiss) + '): ' + lines.dismiss.join('; '));
  return { keep: keep, note: note.join(' | ').slice(0, 500), sum: sum };
}
// A meal or gift line Paul keeps needs the who-and-why; one he returns or dismisses does not.
export function needsPurpose_(entries) {
  return (entries || []).some(function (e) {
    return (e.items || []).some(function (it) { return (it.account === '6710' || it.account === '6720') && !String(it.business_purpose || '').trim(); });
  });
}
// Part of a receipt is recorded and part is not: say which, in dollars, and ask the real question
// (2026-09-26: "it sounds like you're telling me this is a duplicate ... i THINK you are asking if i returned them?").
export function partlyText_(gate, entries) {
  return money_(gate.already_posted_cents) + ' of this receipt is already in the books. The items below (' + money_(itemsSum_(entries)) +
    ') never got recorded - on each one click Approve (you kept it), Returned (it went back to the store) or Dismiss (personal, or not a business cost), then click Save.';
}
// Claude's sentence without its verdict prefix and the reprocess tag - what Paul reads on the card.
export function plainWhy_(why) {
  return String(why || '').replace(/^(Dismissed|Held|Posted|Hold|Post|Dismiss):\s*/i, '').replace(/\s*\[reprocess:.*$/, '').trim();
}
// Paul, 2026-09-28 ("i cant do anything with this"): when the read found nothing to record, the card says WHY
// in Claude's own sentence and which button that means - the reason was hidden under "Claude's read".
export function noEntriesText_(why) {
  return 'Claude found nothing to record. It says: "' + plainWhy_(why) + '" If that is right, click Dismiss all (the reason is filled in). If not, type the item in the fields below, or click Reprocess';
}
export function partnerMoney_(env, ceilingCents) {
  if (!env || env.source !== 'feed') return false;
  var f = env.feed || {}, m = env.model || {};
  if ((m.entries || []).length) return false;   // the matcher proposed a purchase: Paul checks it as before
  var ceiling = Number(ceilingCents || 0);
  return PARTNER_RE.test(String(env.bodyText || '') + ' ' + String(m.vendor || '')) || (ceiling > 0 && Math.abs(Number(f.amount_cents) || 0) > ceiling);
}
// What Save or Dismiss did about the bank line, under the result (audit 2026-10-24 #2c: a failed tie used to
// come back ok:true and vanish; a retired card used to stay in the Bank statement tab until Paul found it).
// Audit 2026-10-24 #7: a card number the read could not place is remembered when Paul picks who paid.
export function payerText_(env) {
  var l4 = String(((env || {}).model || {}).card_last4 || '');
  return GATE_TEXT.PAYER_UNKNOWN + (l4 ? ' - card ending ' + l4 + ' will be remembered' : '');
}
export function feedFlags_(entries, why, env, accounts, ceilingCents) {
  var kept = approvedOnly_(entries);
  if (partnerMoney_(env, ceilingCents)) return [plainWhy_(why), PARTNER_TEXT].map(function (t) { return '<li class="act">' + escapeHtml_(t) + '</li>'; }).join('');
  if (isWaiting_(kept)) {
    return [kept.length > 1 ? 'No receipt yet: Save records these ' + kept.length + ' charges now, each on its own, just as the bank shows them. Pick the house for each'
      : 'No receipt yet: Save records this charge now, just as the bank shows it',
      'When a receipt comes in it takes its charge\'s place - it is not counted twice. If it never comes, the charge stays as it is']
      .concat(mismatchFlags_(kept, accounts)).map(function (t) { return '<li class="act">' + escapeHtml_(t) + '</li>'; }).join('');
  }
  // A question card carries one blank typed line (renderCard_), so "is anything proposed" is asked of the items.
  var proposed = (entries || []).some(function (e) { return (e.items || []).some(function (it) { return Number(it.amount_cents) || String(it.description || '').trim(); }); });
  var out = [plainWhy_(why)];
  out.push(proposed
    ? 'Claude thinks this bank line is a purchase - check the house and the items, then Save. If it is not a purchase, click Dismiss all and say what it was'
    : 'A purchase? Fill in the line below and Save. Money from Dennis or from you, a deposit, a transfer, a check that is not a bill? Click Dismiss all and say in your own words what it was - Claude books it the right way');
  return out.concat(mismatchFlags_(kept, accounts)).map(function (t) { return '<li class="act">' + escapeHtml_(t) + '</li>'; }).join('');
}
export function flagsList_(gate, entries, why, env, state) {
  state = state || {};   // {swap, accounts, ceiling}: the dialog's SWAP, its account picker and the autofile ceiling
  if (env && env.source === 'feed') return feedFlags_(entries, why, env, state.accounts, state.ceiling);
  var kept = approvedOnly_(entries);
  var swapping = !!(env && swapOf_(env, state.swap) && !swapOf_(env, state.swap).earlier);   // a placeholder: the bank line already says who paid
  var flags = ((gate && gate.reasons) || []).filter(function (r) { return r !== 'NEEDS_HUMAN_274D' && !(swapping && (r === 'PAYER_UNKNOWN' || r === 'BAD_PAID_FROM')); })
    .map(function (r) { return r === 'PARTLY_ON_BOOKS' ? partlyText_(gate, entries) : (r === 'NO_ENTRIES' && why) ? noEntriesText_(why) : r === 'PAYER_UNKNOWN' ? payerText_(env) : flagText_(r); })
    .filter(Boolean).concat(mismatchFlags_(kept, state.accounts));
  if (needsPurpose_(kept)) flags.push(GATE_TEXT.NEEDS_HUMAN_274D);
  if (needsTrade_(kept)) flags.push('Pick a trade (the kind of work) for each house item');
  if (!flags.length) flags.push('Check each item, then Save');
  return flags.map(function (t) { return '<li class="act">' + escapeHtml_(t) + '</li>'; }).join('');
}
// Property is per ITEM in the editor (Paul, 2026-09-23: "i should be able to assign each
// itemized item in a receipt to a different property or overhead"). A posted entry is
// still one property, so approve splits an entry into one per property it carries - the
// same shape the bookkeeper is asked to propose when a receipt spans two houses.
export function itemProperty_(entry, item) {
  return (item && item.property !== undefined && item.property !== null) ? item.property : (entry ? entry.property : '');
}
export function splitByProperty_(entries) {
  var out = [];
  (entries || []).forEach(function (e) {
    var order = [], byProp = {};
    (e.items || []).forEach(function (it) {
      var p = itemProperty_(e, it);
      if (!byProp[p]) { byProp[p] = JSON.parse(JSON.stringify(e)); byProp[p].property = p; byProp[p].items = []; order.push(p); }
      var copy = JSON.parse(JSON.stringify(it));
      delete copy.property;
      byProp[p].items.push(copy);
    });
    if (!order.length) out.push(e);
    order.forEach(function (p) { out.push(byProp[p]); });
  });
  return out;
}
// Where every dollar of the receipt goes when Paul clicks Save, in plain words.
export function totalsLine_(env, entries) {
  var sum = sortByDecision_(entries).sum;
  var rt = Number((env.model && env.model.receipt_total_cents) || 0);
  var already = Number((env.gate && env.gate.already_posted_cents) || 0);   // the lines the read found on the books
  var parts = [];
  if (already) parts.push(money_(already) + ' already in the books');
  parts.push(money_(sum.approve) + ' to record now');
  if (sum.returned) parts.push(money_(sum.returned) + ' returned');
  if (sum.dismiss) parts.push(money_(sum.dismiss) + ' dismissed');
  var gap = rt - already - sum.approve - sum.returned - sum.dismiss;   // > 0 missing from the items; < 0 more than the receipt
  var readNothing = !((env.model && env.model.entries) || []).length && !sum.approve && !sum.returned && !sum.dismiss;
  var bank = env.source === 'feed';   // a card born from the bank statement is not a receipt
  if (readNothing) return '<div class="totals ok">' + (bank ? 'The bank shows ' + money_(rt) + ': nothing is filled in yet' : 'Receipt ' + money_(rt) + ': nothing to record, by Claude\'s read - see the line above') + '</div>';
  // A read that found no total (a screenshot with no amount on it) is not a receipt for $0.00 that Paul's typed
  // amount exceeds - say that no total was read, and what will be recorded.
  if (!bank && !rt && !already) return '<div class="totals ok">No total could be read on this one: ' + parts.join(' + ') + '</div>';
  var text = (bank ? 'The bank shows ' : 'Receipt ') + money_(rt) + ': ' + parts.join(' + ');
  if (gap > 0) text += ' - ' + money_(gap) + ' missing from the items';
  if (gap < 0) text += ' - ' + money_(-gap) + ' more than the ' + (bank ? 'bank shows' : 'receipt');
  return '<div class="totals ' + (gap ? 'off' : 'ok') + '">' + text + '</div>';
}
// D-057, the yellow box. On a bank statement card: no receipt yet? one click makes it a placeholder.
// On a receipt card the gate tied to a placeholder: is this the receipt Paul was waiting for?
export function waitHtml_(env, entries, swapTicked) {
  if (env.source === 'feed') {
    if (!moneyOut_(env) || isWaiting_(entries)) return '';
    var who = (env.feed && env.feed.card && env.feed.card.holder) || '';   // D-059: whose card paid, from the bank's daily email
    // 2026-10-25 (Paul: "if there is no receipt i should have a way to add a receipt to this"): the receipt, a photo or a
    // PDF from his computer, goes in from the card (Inbox.html readReceiptFiles_ -> inboxAddReceipt -> /api/upload) and
    // the bookkeeper reads it as any receipt; one that answers the card ties the line and retires the card (D-087).
    return '<div class="wait">Have the receipt? <input type="file" accept="image/*,application/pdf" data-receipt-file="1" multiple> ' +
      '<button data-add-receipt="1">Add receipt</button> <br>No receipt yet? Waiting on <select data-wait-who="1">' + WAITING_ON.map(function (w) { return opt_(w, w, w === who); }).join('') +
      '</select> <button data-wait="1">Waiting on receipt</button></div>';
  }
  var p = swapCandidate_(env);
  if (!p) return '';
  var box = '<label class="wait"><input type="checkbox" data-swap="1"' + (swapTicked !== false ? ' checked' : '') + '> ';
  var what = escapeHtml_(p.payee || 'a charge') + ', ' + escapeHtml_(String(p.date || '').slice(5)) + ', ' + money_(p.total_cents) + (p.property ? ', on ' + escapeHtml_(p.property) : '');
  if (!p.earlier) return box + 'This is the receipt I was waiting for: ' + what + '. Save puts this receipt in its place - it is not counted twice. Untick if this is a different purchase.</label>';
  // A card read before 2026-09-29 names only the entry's id - the books had not told the card what it was.
  return box + 'This replaces one already in the books' + (p.total_cents != null ? ': ' + what : '') +
    '. Save takes the old one out - it is not counted twice. Untick if this is a separate purchase.' +
    (p.total_cents != null ? '' : '<div class="docid">' + escapeHtml_(p.txn_id) + '</div>') + '</label>';
}
