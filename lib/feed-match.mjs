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
- HOUSES: the properties with their address, status and the sections their tab groups costs by.
- LINES: a batch of bank lines with aliases (L1, L2, ...): the bank's date, the amount (negative = money out), the bank's text, sometimes the card that paid ("card 9301 (Dennis)" - read from the bank's own daily email, so it is a fact: a charge on Dennis's card is something Dennis bought, for the house he is working on; a charge on Paul's card is Paul's), and sometimes a note - from an earlier run, or Paul's own words ("Paul: ..."). Paul's word settles what a line is: if the books now hold the entry he describes, match it; if they do not yet, it is a question that says exactly what is still missing, in his terms.

Give EVERY line exactly one verdict by calling record_verdicts once, last:
1. match - the line is one or more candidates already in the books. The candidates' amounts must add up to the lines' amounts - a difference of a few cents is the old books' rounding and still a match (say so in the note); more than that is a question. A store or utility payment the books itemised by house is several entries for one line; a sale can arrive as two wires for one entry; a check and its online fee can be two lines for one bill; a purchase and its refund can be two lines for the entries that net them. Dates within about ten days of each other. The store, utility, worker or check number in the bank text must agree with the entry - never match on the amount alone when the text says something else. A Zelle or a check names a person; the books may carry that person's business name (VENDOR NAMES, or an entry's memo naming the same job or invoice) - that is the same payee.
2. propose - nothing in the books explains it and you can say what it was: one purchase entry - payee, house (or OVERHEAD), one item per thing bought with its account and amount, the items adding up to the line. paid_from is this bank account. Read the house from the bank text: a Zelle line names the worker and often the house; a utility line naming a street address is that house's bill (1120); a Zelle or check to a worker is subcontract labor (1020); bank fees and check orders are OVERHEAD 6930; a store charge with no receipt on the books is rehab materials (1030) for the house the amount and date point to, or a question when two houses fit. Never propose money to or from Dennis, Paul, a title company or a lender.
3. question - it needs Paul's word: money to or from Dennis Little or Paul, a deposit or transfer with no name, a check with no payee, a refund from a store with no return in the books (ask what was returned and for which house), a line that could belong to two houses, an amount you cannot account for. Write the question in plain words with the date and the dollar amount, as you would ask a friend who is not an accountant. No account codes, no ids.
4. later - it belongs to something the books will post soon: a title-company wire, a lender payoff or a partner payout for a house that is sold or under contract but not yet closed in the books. Say which house.

Rules: never invent a house or an account - use the lists; every line appears in exactly one verdict; a candidate is used at most once; a note is one short plain sentence Paul reads on the Feed tab (say what it is, not the bank text again, e.g. "Lowe's siding for 366 Mesa, the receipt of 08-13"). When a line and a candidate agree on payee and date but not on the amount, that is a question, not a match.`;

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
          type: "object", additionalProperties: false, required: ["lines", "entry", "note"],
          properties: { lines: ALIASES("Line aliases this entry explains"), entry: DECIDE_ENTRY_SCHEMA, note: NOTE },
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
export function buildSystem({ account, accountName, candidates, properties, vendors = [] }) {
  const chart = ACCOUNTS.filter((a) => a.active !== false).map((a) => `${a.code} ${a.name}`).join("\n");
  const houses = (properties || []).map((p) =>
    `${p.name} | ${p.address || ""} | ${p.status || ""}${p.purchase_date ? ` | bought ${p.purchase_date}` : ""}${(p.trades || []).length ? ` | sections: ${p.trades.join(", ")}` : ""}`).join("\n");
  const cands = candidates.map((c, i) => `C${i + 1} | ${candidateText(c)}`).join("\n");
  const names = vendors.filter((v) => v.canonical && (v.aliases || []).length).map((v) => `${v.canonical} | ${v.aliases.join(", ")}`).join("\n");
  return `${MATCH_PROMPT}\n\nTHE ACCOUNT: ${accountName} (${account}).\n\nCHART OF ACCOUNTS (code name):\n${chart}\n\nHOUSES (name | address | status | sections):\n${houses || "(none)"}\n\nVENDOR NAMES (the books' name | other names the bank, a Zelle or a check uses):\n${names || "(none)"}\n\nCANDIDATES (alias | date | amount | payee | source | what it recorded):\n${cands || "(none - nothing in the books touches this account yet)"}`;
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
export async function runMatcher({ anthropic, account, accountName, lines, candidates, properties, vendors = [], today, batchSize = BATCH_SIZE, model = MODEL_ID }) {
  const system = [{ type: "text", text: buildSystem({ account, accountName, candidates, properties, vendors }), cache_control: { type: "ephemeral" } }];
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
    verdicts.push(...expandVerdicts(recorded, batch, candidates));
  }
  return { verdicts, usage, transcript: transcript.join("\n") };
}

/** Aliases -> ids. An alias that names nothing is dropped (the note says so downstream). */
export function expandVerdicts(recorded, batch, candidates) {
  if (!recorded) return [];
  const lineId = (a) => batch[Number(String(a).replace(/^L/i, "")) - 1]?.feed_id;
  const candId = (a) => candidates[Number(String(a).replace(/^C/i, "")) - 1]?.txn_id;
  const ids = (list, f) => (Array.isArray(list) ? list : []).map(f).filter(Boolean);
  const out = [];
  for (const m of recorded.matches || []) out.push({ kind: "match", feed_ids: ids(m.lines, lineId), txn_ids: ids(m.candidates, candId), entry: null, note: String(m.note || "") });
  for (const p of recorded.proposals || []) out.push({ kind: "propose", feed_ids: ids(p.lines, lineId), txn_ids: [], entry: p.entry || null, note: String(p.note || "") });
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
      card(mine, model);
      continue;
    }

    if (v.kind === "question") {
      question(mine, v.note || `What is the bank's ${fromCents(lineTotal)} of ${mine[0].date} (${mine[0].name})?`);
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
  return { updates, envelopes, summary };
}
