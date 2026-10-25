// lib/feed-match.mjs - Phase 3, docs/phase3-spec.md section 3: tying bank lines to the books.
//
// Claude decides, code checks. The model sees the account's open bank lines and every Journal
// entry that touches the account and is not yet tied to a line, and gives each line ONE
// verdict: match (candidates already in the books), propose (an entry, held for Paul as an
// Inbox card), question (a card in plain words), later (a sale not yet closed in the books).
// `applyVerdicts` re-checks every claim - a match must add up to the cent, a proposal's items
// must add up to the line, an alias must exist - and turns the result into Feed row updates
// and Inbox envelopes. Nothing here posts: a proposal is a card Paul approves.

import { fromCents } from "./money.mjs";
import { ACCOUNTS } from "./coa.mjs";
import { evaluateGate } from "./gate.mjs";
import { DECIDE_ENTRY_SCHEMA, MODEL_ID } from "./bookkeeper.mjs";

export const BATCH_SIZE = 30;
// "allow a few cents" (Paul, 2026-09-28): the old books' typed amounts round - 542.39 for the
// bank's 542.40, 109.00 for 109.01. Inside this a match still ties, and the note says by how much;
// beyond it the line is a question. The books are never changed by a match.
export const MATCH_TOLERANCE_CENTS = 5;
const MAX_TOKENS = 20000; // one turn; above ~21k the SDK insists on streaming

export const MATCH_PROMPT = `You are the bookkeeper for Recast Properties LLC, a small Texas house-flipping company. Paul runs the work and the money; Dennis Little lends the money for the houses. You are reconciling one of Recast's own bank accounts: every line the bank shows must be explained by the books.

You are given:
- CANDIDATES: the Journal entries that touch this bank account and are not yet tied to a bank line. Each has an alias (C1, C2, ...), its date, its amount signed as the bank shows it (negative = money left the account), the payee, where the entry came from (receipt, manual, migration, sale, advance) and what it recorded (house, account, description, amount).
- RECENT BILLS: the utility bills paid from this account in the last 45 days, tied to a bank line or not, each with an alias (B1, B2, ...), its date, amount, payee and house - the bill a utility's card or online fee came with.
- HOUSES: the properties with their address, status and the sections their tab groups costs by.
- LINES: a batch of bank lines with aliases (L1, L2, ...): the bank's date, the amount (negative = money out), the bank's text, sometimes the card that paid ("card 9301 (Dennis)" - read from the bank's own daily email, so it is a fact: a charge on Dennis's card is something Dennis bought, for the house he is working on; a charge on Paul's card is Paul's), and sometimes a note - from an earlier run, or Paul's own words ("Paul: ..."). Paul's word settles what a line is: if the books now hold the entry he describes, match it; if they do not yet, it is a question that says exactly what is still missing, in his terms.

Give EVERY line exactly one verdict by calling record_verdicts once, last:
1. match - the line is one or more candidates already in the books. The candidates' amounts must add up to the lines' amounts - a difference of a few cents is the old books' rounding and still a match (say so in the note); more than that is a question. A store or utility payment the books itemised by house is several entries for one line; a sale can arrive as two wires for one entry; a check and its online fee can be two lines for one bill; a utility bill and its online-payment or card-processing fee (MUNICIPAL ONLINE PAYMEN, SERVFEE) that the receipt itemises are two lines for one entry - match both to it, never ask whether to split them; a purchase and its refund can be two lines for the entries that net them. Dates within about ten days of each other. The store, utility, worker or check number in the bank text must agree with the entry - never match on the amount alone when the text says something else. A Zelle or a check names a person; the books may carry that person's business name (VENDOR NAMES, or an entry's memo naming the same job or invoice) - that is the same payee.
2. propose - nothing in the books explains it and you can say what it was: one purchase entry - payee, house (or OVERHEAD), one item per thing bought with its account and amount, the items adding up to the line. paid_from is this bank account. Read the house from the bank text: a Zelle line names the worker and often the house; a utility line naming a street address is that house's bill (1120); a Zelle or check to a worker is subcontract labor (1020); a bank fee or check order that code did not already record (under 50.00 it never reaches you, D-093) is OVERHEAD 6910 Bank & merchant fees - never 6930, which is interest; a store charge with no receipt on the books is rehab materials (1030) for the house the amount and date point to, or a question when two houses fit. A utility's own fee for paying by card or online (SERVFEE, MUNICIPAL ONLINE PAYMEN) under 50.00 that the books do not already carry is the cost of the house whose bill it came with (Paul's rule of 10-25): propose it as one item on 1120 for that house and put the bill's alias in "bill" (B2, or C3 while the bill is still a candidate) - code records it without a card; when the receipt already itemises the fee it is a match (rule 1), and when two houses could own the bill it is a question. Never propose money to or from Dennis, Paul, a title company or a lender.
3. question - it needs Paul's word: money to or from Dennis Little or Paul, a deposit or transfer with no name, a check with no payee, a refund from a store with no return in the books (ask what was returned and for which house), a line that could belong to two houses, an amount you cannot account for. Write the question in plain words with the date and the dollar amount, as you would ask a friend who is not an accountant. No account codes, no ids.
4. later - it belongs to something the books will post soon: a title-company wire, a lender payoff or a partner payout for a house that is sold or under contract but not yet closed in the books. Say which house.

One charge, one card: Paul decides each charge by itself, so every separate charge gets its OWN proposal or question - three charges at the same store on the same day are three, each naming its own amount. Put several lines in one proposal or question only when they are one event: a purchase and its refund, a check and its fee, the wires of one sale.

Rules: never invent a house or an account - use the lists; every line appears in exactly one verdict; a candidate is used at most once; a note is one short plain sentence Paul reads on the Feed tab (say what it is, not the bank text again, e.g. "Lowe's siding for 366 Mesa, the receipt of 08-13"). When a line and a candidate agree on payee and date but not on the amount, that is a question, not a match.`;

// Audit 2026-10-24 #16, D-093 (Paul, 2026-10-25: "a bank fee under $50 can be recorded on its own, no card"): the bank's
// OWN charge - money out, under the ceiling, its text saying FEE or CHARGE as a whole word, or a check order. A utility's
// processing fee ("WAXAHACHIE SERVFEE") is not one: no whole word, and it is the city's, not the bank's.
// ponytail: a whole-word test; add an exclusion list only if a vendor's late fee ever lands here.
export const BANK_FEE_CEILING_CENTS = 5000;
export const BANK_FEE_ACCOUNT = "6910";   // Bank & merchant fees (the chart); 6930 is interest
const BANK_FEE_RE = /\b(FEE|FEES|CHARGE|CHARGES|CHECK ORDER)\b|\bDELUXE CHECK\b/i;
export function isBankFee(line, ceiling = BANK_FEE_CEILING_CENTS) {
  const cents = Number(line?.amount_cents);
  return cents < 0 && -cents < ceiling && BANK_FEE_RE.test(`${line.name || ""} ${line.memo || ""}`);
}
/** The purchase intent for one fee line (lib/posting.mjs buildEntry): 6910 under OVERHEAD, paid from the account,
 *  the bank as payee, the bank's own text as the description. The caller sets the id to the bank's line id. */
export function bankFeeIntent(line, account, accountName) {
  const cents = -line.amount_cents;
  const text = String(line.memo || "").length > String(line.name || "").length ? line.memo : line.name;   // the bank's words, the longer form
  return {
    type: "purchase", date: line.date, payee: accountName, property: "OVERHEAD", paid_from: account,
    memo: `${accountName} fee ${fromCents(cents)} - the bank's own charge, recorded from the bank line`,
    items: [{ account: BANK_FEE_ACCOUNT, amount_cents: cents, description: String(text || "Bank fee") }],
    source: "bank", posted_by: "claude",
  };
}

// D-094 (Paul, 2026-10-25: "a utility's card or processing fee under $50 can be recorded on its own against the house
// whose bill it came with, no card"): the utility's OWN charge for paying by card or online - money out, under the same
// ceiling, its words in the bank's text. Code names the line and checks the proposal; the model names the house through
// the bill the fee came with (RECENT BILLS); the engine records it. The bank's own fee (isBankFee) is never one.
// ponytail: the two wordings measured (Waxahachie's SERVFEE, Red Oak's MUNICIPAL ONLINE PAYMEN); add a utility's wording
// here when its fee lands as a card.
const UTILITY_FEE_RE = /\bSERV\s?FEE\b|\bONLINE PAYMEN\w*\b/i;
export const UTILITY_FEE_ACCOUNT = "1120";   // the fee rides with the bill
export const BILL_DAYS = 45;
export function isUtilityFeeLine(line, ceiling = BANK_FEE_CEILING_CENTS) {
  const cents = Number(line?.amount_cents);
  return cents < 0 && -cents < ceiling && !isBankFee(line, ceiling) && UTILITY_FEE_RE.test(`${line.name || ""} ${line.memo || ""}`);
}
/** The account's utility bills of the last `days` (flattenJournalLines rows): one per txn_id with a 1120 debit and a line
 *  on the account, tied or not - what the model sees as RECENT BILLS. */
export function buildBills(journalLines, account, today, days = BILL_DAYS) {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400000);
  const voided = new Set(journalLines.filter((l) => l.void_of).map((l) => l.void_of));
  const byTxn = new Map();
  for (const l of journalLines) {
    if (l.source === "void" || l.void_of || voided.has(l.txn_id) || !l.date || new Date(`${l.date}T00:00:00Z`) < since) continue;
    if (!byTxn.has(l.txn_id)) byTxn.set(l.txn_id, { txn_id: l.txn_id, date: l.date, payee: "", property: "", amount_cents: 0, utility: false, touches: false });
    const b = byTxn.get(l.txn_id);
    if (!b.payee && l.payee) b.payee = l.payee;
    if (String(l.account) === String(account)) b.touches = true;
    if (String(l.account) === UTILITY_FEE_ACCOUNT && l.amount_cents > 0) { b.utility = true; b.amount_cents += l.amount_cents; if (!b.property) b.property = l.property || ""; }
  }
  return [...byTxn.values()].filter((b) => b.utility && b.touches && b.property).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
/** The proposal code records on its own: a utility-fee line, one item on 1120 adding up to it, for the house of the bill
 *  the model named. The purchase intent for lib/posting.mjs buildEntry, or null (the proposal is then Paul's card). */
export function utilityFeeIntent(line, entry, account, bill) {
  const items = entry?.items || [];
  if (!bill || !bill.property || !isUtilityFeeLine(line) || items.length !== 1) return null;
  if (String(items[0].account) !== UTILITY_FEE_ACCOUNT || Number(items[0].amount_cents) !== -line.amount_cents) return null;
  if (!entry.property || entry.property === "OVERHEAD" || entry.property !== bill.property) return null;
  return {
    type: "purchase", date: entry.date || line.date, payee: entry.payee || line.name, property: entry.property, paid_from: account,
    memo: entry.memo || `${entry.payee || line.name} fee ${fromCents(-line.amount_cents)} - the utility's own charge, recorded from the bank line`,
    items: [{ account: UTILITY_FEE_ACCOUNT, amount_cents: -line.amount_cents, description: String(items[0].description || "Payment fee"), trade: items[0].trade || "Utilities" }],
    source: "bank", posted_by: "claude",
  };
}

const NOTE = { type: "string", description: "One short plain sentence for Paul on the Feed tab" };
const ALIASES = (what) => ({ type: "array", items: { type: "string" }, description: what });

export const VERDICTS_TOOL = {
  name: "record_verdicts",
  description: "Your verdict for every bank line in this batch. Call it exactly once, last. Each line alias (L1, L2, ...) appears in exactly one of the four lists; a candidate alias appears at most once.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["matches", "proposals", "questions", "later"],
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["lines", "candidates", "note"],
          properties: { lines: ALIASES("Line aliases, e.g. [\"L3\"]"), candidates: ALIASES("Candidate aliases whose amounts add up to the lines', e.g. [\"C7\", \"C8\"]"), note: NOTE },
        },
      },
      proposals: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["lines", "entry", "note", "bill"],
          properties: { lines: ALIASES("Line aliases this entry explains"), entry: DECIDE_ENTRY_SCHEMA, note: NOTE, bill: { type: "string", description: "Only for a utility's card or online fee: the alias of the bill it came with (B2, or C3). Otherwise \"\"." } },
        },
      },
      questions: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["lines", "question"],
          properties: { lines: ALIASES("Line aliases"), question: { type: "string", description: "The question for Paul, in plain words, with the date and the amount" } },
        },
      },
      later: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["lines", "note"],
          properties: { lines: ALIASES("Line aliases"), note: { type: "string", description: "What the books will post and for which house" } },
        },
      },
    },
  },
};

/**
 * The Journal entries that touch `account` and are not yet tied to a bank line, one per
 * txn_id, amount signed as the bank shows it (a credit on the bank account is money out).
 * `lines` are flattenJournalLines rows; `usedTxnIds` the txn_ids already on Feed rows.
 */
export function buildCandidates(lines, account, usedTxnIds = new Set()) {
  const voided = new Set(lines.filter((l) => l.void_of).map((l) => l.void_of));
  const byTxn = new Map();
  for (const l of lines) {
    if (l.source === "void" || l.void_of || voided.has(l.txn_id) || usedTxnIds.has(l.txn_id)) continue;
    if (!byTxn.has(l.txn_id)) {
      byTxn.set(l.txn_id, { txn_id: l.txn_id, date: l.date, payee: "", memo: l.memo || "", source: l.source || "", amount_cents: 0, touches: false, what: [] });
    }
    const c = byTxn.get(l.txn_id);
    if (!c.payee && l.payee) c.payee = l.payee;
    if (String(l.account) === String(account)) {
      c.touches = true;
      c.amount_cents += l.amount_cents;
    } else {
      c.what.push({ account: String(l.account), property: l.property || "", description: l.description || "", amount_cents: l.amount_cents });
    }
  }
  return [...byTxn.values()].filter((c) => c.touches).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function lineText(l) {
  const note = String(l.match_note || "").trim();
  const card = l.card ? ` | card ${l.card.last4} (${l.card.holder})` : "";   // D-059, from the bank's daily email
  return `${l.date} | ${fromCents(l.amount_cents)} | ${l.memo && l.memo.length >= (l.name || "").length ? l.memo : l.name}${card}${note ? ` | note: ${note}` : ""}`;
}

function candidateText(c) {
  const what = c.what.map((w) => `${w.property || "OVERHEAD"} ${w.account} ${fromCents(w.amount_cents)}${w.description ? ` "${w.description}"` : ""}`).join("; ");
  return `${c.date} | ${fromCents(c.amount_cents)} | ${c.payee || "(no payee)"} | ${c.source} | ${what}${c.memo ? ` | memo: ${c.memo}` : ""}`;
}

/** The stable part of every call - cached across batches. */
export function buildSystem({ account, accountName, candidates, properties, vendors = [], bills = [] }) {
  const chart = ACCOUNTS.filter((a) => a.active !== false).map((a) => `${a.code} ${a.name}`).join("\n");
  const houses = (properties || []).map((p) =>
    `${p.name} | ${p.address || ""} | ${p.status || ""}${p.purchase_date ? ` | bought ${p.purchase_date}` : ""}${(p.trades || []).length ? ` | sections: ${p.trades.join(", ")}` : ""}`).join("\n");
  const cands = candidates.map((c, i) => `C${i + 1} | ${candidateText(c)}`).join("\n");
  const names = vendors.filter((v) => v.canonical && (v.aliases || []).length).map((v) => `${v.canonical} | ${v.aliases.join(", ")}`).join("\n");
  const recent = bills.map((b, i) => `B${i + 1} | ${b.date} | ${fromCents(b.amount_cents)} | ${b.payee || "(no payee)"} | ${b.property}`).join("\n");
  return `${MATCH_PROMPT}\n\nTHE ACCOUNT: ${accountName} (${account}).\n\nCHART OF ACCOUNTS (code name):\n${chart}\n\nHOUSES (name | address | status | sections):\n${houses || "(none)"}\n\nVENDOR NAMES (the books' name | other names the bank, a Zelle or a check uses):\n${names || "(none)"}\n\nRECENT BILLS (alias | date | amount | payee | house):\n${recent || `(none in the last ${BILL_DAYS} days)`}\n\nCANDIDATES (alias | date | amount | payee | source | what it recorded):\n${cands || "(none - nothing in the books touches this account yet)"}`;
}

export function buildUser({ lines, batch, batches, today }) {
  const body = lines.map((l, i) => `L${i + 1} | ${lineText(l)}`).join("\n");
  return `Today: ${today}.\nLINES, batch ${batch} of ${batches} (alias | date | amount | the bank's text | the card, when the bank's email named it | note, when there is one):\n${body}\n\nCall record_verdicts with a verdict for every line L1..L${lines.length}.`;
}

function accumulate(usage, u) {
  if (!u) return;
  usage.input_tokens += u.input_tokens || 0;
  usage.output_tokens += u.output_tokens || 0;
  usage.cache_read_input_tokens += u.cache_read_input_tokens || 0;
  usage.cache_creation_input_tokens += u.cache_creation_input_tokens || 0;
  usage.calls += 1;
}

/**
 * One model call per batch of lines, the candidates cached in the system block. Resolves to
 * {verdicts:[{kind, feed_ids, txn_ids, entry, note}], usage, transcript}. A call that ends
 * without record_verdicts is bounced once; the batch's lines then get no verdict (they stay
 * unmatched with a note - never a guessed verdict).
 */
export async function runMatcher({ anthropic, account, accountName, lines, candidates, properties, vendors = [], bills = [], today, batchSize = BATCH_SIZE, model = MODEL_ID }) {
  const system = [{ type: "text", text: buildSystem({ account, accountName, candidates, properties, vendors, bills }), cache_control: { type: "ephemeral" } }];
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, calls: 0 };
  const transcript = [];
  const verdicts = [];
  const batches = [];
  for (let i = 0; i < lines.length; i += batchSize) batches.push(lines.slice(i, i + batchSize));

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const messages = [{ role: "user", content: buildUser({ lines: batch, batch: b + 1, batches: batches.length, today }) }];
    let recorded = null;
    for (let attempt = 0; attempt < 2 && !recorded; attempt++) {
      let res;
      try {
        res = await anthropic.beta.messages.create({
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          model,
          max_tokens: MAX_TOKENS,
          thinking: { type: "adaptive" },
          output_config: { effort: "high" },
          system,
          tools: [VERDICTS_TOOL],
          messages,
        });
      } catch (err) {
        throw new Error(`The Anthropic API call failed (batch ${b + 1}): ${String((err && err.message) || err)}`, { cause: err });
      }
      accumulate(usage, res.usage);
      if (res.stop_reason === "refusal") {
        transcript.push(`batch ${b + 1}: refusal (${res.stop_details?.category || "unspecified"})`);
        break;
      }
      const call = (res.content || []).find((c) => c.type === "tool_use" && c.name === VERDICTS_TOOL.name);
      if (call) {
        recorded = call.input || {};
        transcript.push(`batch ${b + 1}: recorded (${res.stop_reason})`);
        break;
      }
      transcript.push(`batch ${b + 1}: no record_verdicts (${res.stop_reason}) - ${attempt ? "given up" : "bounced"}`);
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: "Call record_verdicts now, with a verdict for every line." });
    }
    verdicts.push(...expandVerdicts(recorded, batch, candidates, bills));
  }
  return { verdicts, usage, transcript: transcript.join("\n") };
}

/** Aliases -> ids. An alias that names nothing is dropped (the note says so downstream). */
export function expandVerdicts(recorded, batch, candidates, bills = []) {
  if (!recorded) return [];
  const lineId = (a) => batch[Number(String(a).replace(/^L/i, "")) - 1]?.feed_id;
  const candId = (a) => candidates[Number(String(a).replace(/^C/i, "")) - 1]?.txn_id;
  const ids = (list, f) => (Array.isArray(list) ? list : []).map(f).filter(Boolean);
  // D-094: the bill a utility's fee came with - a RECENT BILLS alias, or a candidate (the bill not yet tied).
  const billOf = (a) => {
    const s = String(a || "").trim();
    const n = Number(s.slice(1)) - 1;
    const b = /^B\d+$/i.test(s) ? bills[n] : /^C\d+$/i.test(s) ? candidates[n] : null;
    if (!b) return null;
    const property = b.property || ((b.what || []).find((w) => String(w.account) === UTILITY_FEE_ACCOUNT && w.property) || {}).property || "";
    return { txn_id: b.txn_id, property };
  };
  const out = [];
  for (const m of recorded.matches || []) out.push({ kind: "match", feed_ids: ids(m.lines, lineId), txn_ids: ids(m.candidates, candId), entry: null, note: String(m.note || "") });
  for (const p of recorded.proposals || []) out.push({ kind: "propose", feed_ids: ids(p.lines, lineId), txn_ids: [], entry: p.entry || null, note: String(p.note || ""), bill: billOf(p.bill) });
  for (const q of recorded.questions || []) out.push({ kind: "question", feed_ids: ids(q.lines, lineId), txn_ids: [], entry: null, note: String(q.question || "") });
  for (const l of recorded.later || []) out.push({ kind: "later", feed_ids: ids(l.lines, lineId), txn_ids: [], entry: null, note: String(l.note || "") });
  return out;
}

const sumOf = (xs) => xs.reduce((t, x) => t + (Number(x) || 0), 0);
const itemsTotal = (entry) => sumOf((entry?.items || []).map((it) => it.amount_cents));

/** The one card that paid every line, or null. */
function commonCard(lines) {
  const first = lines[0]?.card;
  return first && lines.every((l) => l.card && l.card.last4 === first.last4) ? first : null;
}

/** An Inbox card born from bank lines: the same envelope shape a receipt gets, plus `feed`. */
function cardEnvelope({ account, accountName, lines, model, gate, now }) {
  const text = lines.map((l) => `${l.date}  ${fromCents(l.amount_cents)}  ${l.memo || l.name}`).join("\n");
  const total = sumOf(lines.map((l) => l.amount_cents));
  return {
    docId: `feed-${account}-${lines[0].feed_id}`,
    source: "feed",
    channel: "bankfeed",
    dryRun: false,
    gmailUrl: "",
    subject: `${accountName} ${lines[0].date} ${lines[0].name} ${fromCents(total)}`,
    from: accountName,
    receivedAt: `${lines[0].date}T12:00:00`,
    bodyText: `Bank line${lines.length > 1 ? "s" : ""} on ${accountName} (${account}):\n${text}`,
    attachments: [],
    status: "pending",
    startedAt: now,
    finishedAt: now,
    error: "",
    model,
    gate,
    result: { txn_ids: [], rows: null, doc_url: "" },
    review: null,
    // amount_cents is signed: the card offers "Waiting on receipt" on money out only. card (D-059) is
    // who paid, when the bank's daily email named one card for every line here.
    feed: { account, feed_ids: lines.map((l) => l.feed_id), amount_cents: total, card: commonCard(lines) },
  };
}

function baseModel({ account, lines, why, confidence }) {
  const total = sumOf(lines.map((l) => l.amount_cents));
  return {
    verdict: "hold",
    confidence,
    why,
    checked: `Bank line${lines.length > 1 ? "s" : ""}: ${lines.map(lineText).join(" / ")}. Nothing on the books was tied to ${lines.length > 1 ? "them" : "it"}.${commonCard(lines) ? ` The bank's daily email says ${commonCard(lines).holder}'s card (${commonCard(lines).last4}) paid.` : ""}`,
    document_type: "statement",
    vendor: lines[0].name,
    date: lines[0].date,
    receipt_total_cents: Math.abs(total),
    subtotal_cents: null,
    tax_cents: null,
    paid_from: account,
    paid_from_reason: "the line is on this bank account",
    duplicate_of: null,
    supersedes: null,
    invoice_number: null,
    already_posted_txn_ids: [],
    entries: [],
  };
}

/**
 * Code's half. Every verdict re-checked; the result is what to write on the Feed rows and
 * which Inbox cards to create. A failed check never guesses - it becomes a question card.
 *   lines: the open Feed rows sent ({feed_id, date, amount_cents, name, memo})
 *   candidates: buildCandidates()
 *   ctx, settings, postedEntries: what evaluateGate needs for a proposal's card
 */
export function applyVerdicts({ verdicts, lines, candidates, account, accountName, ctx, settings = {}, postedEntries = [], now = new Date().toISOString() }) {
  const lineById = new Map(lines.map((l) => [l.feed_id, l]));
  const candById = new Map(candidates.map((c) => [c.txn_id, c]));
  const seenLine = new Set();
  const usedCand = new Set();
  const updates = [];
  const envelopes = [];
  const autoposts = [];   // D-094: proposals code records itself - {line, intent, txn_id, note, fallback: {env, updates}}
  const summary = { total: lines.length, matched: 0, cards: 0, later: 0, none: 0 };

  const note = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const claim = (feedIds) => {
    // The lines this verdict may speak for: known, in this run, not already given a verdict.
    const mine = [...new Set(feedIds)].filter((id) => lineById.has(id) && !seenLine.has(id));
    mine.forEach((id) => seenLine.add(id));
    return mine.map((id) => lineById.get(id));
  };
  const card = (mine, model) => {
    const gate = evaluateGate(model, ctx, settings, { postedEntries, placeholders: false });
    const env = cardEnvelope({ account, accountName, lines: mine, model, gate, now });
    envelopes.push(env);
    summary.cards += mine.length;
    for (const l of mine) updates.push({ feed_id: l.feed_id, status: "proposed", txn_id: "", match_note: note(`In the Inbox: ${model.why}`) });
  };
  const question = (mine, why) => card(mine, baseModel({ account, lines: mine, why: note(why), confidence: "low" }));

  for (const v of verdicts) {
    const mine = claim(v.feed_ids || []);
    if (!mine.length) continue;
    const lineTotal = sumOf(mine.map((l) => l.amount_cents));

    if (v.kind === "match") {
      const cands = [...new Set(v.txn_ids || [])].map((id) => candById.get(id)).filter(Boolean);
      const fresh = cands.filter((c) => !usedCand.has(c.txn_id));
      const candTotal = sumOf(fresh.map((c) => c.amount_cents));
      const off = candTotal - lineTotal;
      if (!fresh.length || fresh.length !== cands.length || Math.abs(off) > MATCH_TOLERANCE_CENTS) {
        const named = cands.map((c) => `${c.payee || c.txn_id} ${fromCents(c.amount_cents)}`).join(" + ") || "nothing";
        question(mine, `Claude tried to tie the bank's ${fromCents(lineTotal)} of ${mine[0].date} (${mine[0].name}) to ${named} in the books, but ${!fresh.length ? "that entry is already tied to another line" : fresh.length !== cands.length ? "one of those entries is already tied to another line" : "the amounts differ"}. What is this line?`);
        continue;
      }
      fresh.forEach((c) => usedCand.add(c.txn_id));
      const txn = fresh.map((c) => c.txn_id).join(", ");
      const tail = off ? ` (the books are ${fromCents(Math.abs(off))} ${off > 0 ? "under" : "over"} the bank - rounding in the old books)` : "";
      for (const l of mine) updates.push({ feed_id: l.feed_id, status: "matched", txn_id: txn, match_note: note(v.note + tail) });
      summary.matched += mine.length;
      continue;
    }

    if (v.kind === "propose") {
      const entry = v.entry && typeof v.entry === "object" ? { ...v.entry, paid_from: account } : null;
      if (!entry || !(entry.items || []).length || itemsTotal(entry) !== Math.abs(lineTotal)) {
        question(mine, `Claude thought the bank's ${fromCents(lineTotal)} of ${mine[0].date} (${mine[0].name}) was ${entry?.payee || "a purchase"} but its items do not add up to the line. What was it, and for which house?`);
        continue;
      }
      const model = { ...baseModel({ account, lines: mine, why: note(v.note), confidence: "medium" }), vendor: entry.payee || mine[0].name, date: entry.date || mine[0].date, entries: [entry] };
      const intent = mine.length === 1 ? utilityFeeIntent(mine[0], entry, account, v.bill) : null;
      if (intent) {
        // D-094: the utility's fee for the house of the bill it came with - recorded by the run, no card. The card is built
        // all the same and travels as the fallback, for a post the engine or the writer refuses.
        const gate = evaluateGate(model, ctx, settings, { postedEntries, placeholders: false });
        const env = cardEnvelope({ account, accountName, lines: mine, model, gate, now });
        const fallback = { env, updates: [{ feed_id: mine[0].feed_id, status: "proposed", txn_id: "", match_note: note(`In the Inbox: ${model.why}`) }] };
        autoposts.push({ line: mine[0], intent, txn_id: `bank-${account}-${mine[0].feed_id}`, note: note(v.note), bill: v.bill, fallback });
        continue;
      }
      card(mine, model);
      continue;
    }

    if (v.kind === "question") {
      const asked = v.note || `What is the bank's ${fromCents(lineTotal)} of ${mine[0].date} (${mine[0].name})?`;
      // D-060 (Paul, 2026-09-29: "are those three separate charges? ... shouldn't they be separate
      // expenses not grouped?"): separate charges are separate cards, whatever the read grouped.
      // Lines of both signs stay together - a purchase and its refund are one event.
      if (mine.length > 1 && mine.every((l) => l.amount_cents < 0)) {
        for (const l of mine) question([l], `${l.name}, $${fromCents(-l.amount_cents)} on ${l.date.slice(5)} - ${asked}`);
      } else {
        question(mine, asked);
      }
      continue;
    }

    if (v.kind === "later") {
      for (const l of mine) updates.push({ feed_id: l.feed_id, status: "unmatched", txn_id: "", match_note: note(`Waits: ${v.note}`) });
      summary.later += mine.length;
    }
  }

  for (const l of lines) {
    if (seenLine.has(l.feed_id)) continue;
    updates.push({ feed_id: l.feed_id, status: "unmatched", txn_id: "", match_note: "Claude gave no verdict this run - run Match statement lines again" });
    summary.none += 1;
  }
  return { updates, envelopes, summary, autoposts };
}
