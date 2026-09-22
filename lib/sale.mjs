// lib/sale.mjs — Phase 5 sell wizard arithmetic (docs/phase5-spec.md, D-033, D-036, D-037)
//
// Pure. Turns a confirmed settlement statement into the ordered journal intents that close
// one property, plus the checks that must hold before any of it posts. Nothing here reads
// or writes: the caller (the writer's Sell dialog) maps each intent through
// lib/posting.mjs buildEntry and posts them as one batch under the writer's lock.
//
// Two rules do the work:
//   D-037 Recast's share. Every statement line posts at Recast's undivided share of the
//   property; a line payable TO Recast by name posts at the co-owner's share only, because
//   Recast's own share of a payment to itself cancels.
//   Distribution order (reproduces Paul's own closed tabs to the cent): principal,
//   interest and direct reimbursements first — both partners — then whatever cash is left
//   splits by the profit share, capped at each partner's share. An unpaid share rides on
//   2010 for Dennis and stays undrawn for Paul until the escrow holdback arrives.
//
// Profit is recognised in full at settlement even when cash is not: the holdback sits in
// 1510 and the partners' unpaid shares are the mirror of it (Granite: $60,000 held back,
// $30,000 owed to each — exactly the old Sales tab's two lines).
import { accruedThrough } from "./accrual.mjs";

const CASH = "1401";              // Cash — Citizens shared
const HOLDBACK = "1510";          // Escrow & holdbacks receivable
const REVENUE = "4000";           // Property sale proceeds
const COGS = "5000";              // COGS — property released
const INTEREST_COST = "1200";     // Financing — interest (Dennis)
const INTEREST_ACCRUED = "2000";  // Accrued interest — Dennis
const DENNIS_SHARE = "1220";      // Profit participation — Dennis
const DENNIS_FEES = "1210";       // Financing — points & fees (the bank deal's commission)
const DENNIS_NOTE = "2010";       // Note payable — Dennis
const DUE_TO_PAUL = "2030";       // Due to owner (Paul)
const OWNER_DRAWS = "9010";       // Owner draws & distributions
const ROUNDING_ACCOUNT = "1310";  // Selling — closing costs: where a share's rounding cents land

/** A cost account whose balance releases to COGS at the sale: the 1000-1399 series. */
export function isProjectCostAccount(account) {
  const a = String(account);
  return /^1[0-3]\d\d$/.test(a);
}

function atShare(cents, share) {
  return Math.round(cents * share);
}

/**
 * Splits one confirmed settlement statement into the sale entry's lines at Recast's share.
 *
 * `lines` are the statement as Paul confirmed it, each already mapped to an account:
 *   {label, account, cents, kind}  kind:
 *     "cost"      a seller-paid charge         -> debit, at share
 *     "credit"    an adjustment due to seller  -> credit, at share
 *     "holdback"  withheld in escrow           -> debit 1510, at share
 *     "to_recast" disbursed to Recast by name  -> credit, at the co-owner's share (D-037)
 *
 * @returns {{cash_cents, revenue_cents, cost_cents, credit_cents, holdback_cents,
 *            to_recast_cents, rounding_cents, byAccount: Map<string, number>}}
 */
export function splitStatement(settlement) {
  const share = (settlement.recast_share_pct ?? 100) / 100;
  if (!(share > 0 && share <= 1)) throw new RangeError(`sale: recast_share_pct must be in (0, 100]`);

  const byAccount = new Map(); // account -> signed cents, debit positive
  const labels = new Map();    // account -> the statement's own wording, for the Journal line
  const add = (account, cents, label) => {
    byAccount.set(account, (byAccount.get(account) || 0) + cents);
    if (label) labels.set(account, labels.has(account) ? labels.get(account) + "; " + label : label);
  };

  const revenue_cents = atShare(settlement.sale_price_cents, share);
  let cost_cents = 0, credit_cents = 0, holdback_cents = 0, to_recast_cents = 0, to_recast_full_cents = 0;

  for (const line of settlement.lines || []) {
    const cents = Number(line.cents) || 0;
    if (cents < 0) throw new RangeError(`sale: statement line "${line.label}" is negative; use the right kind instead`);
    if (line.kind === "cost") {
      const c = atShare(cents, share);
      cost_cents += c; add(line.account, c, line.label);
    } else if (line.kind === "credit") {
      const c = atShare(cents, share);
      credit_cents += c; add(line.account, -c, line.label);
    } else if (line.kind === "holdback") {
      const c = atShare(cents, share);
      holdback_cents += c; add(HOLDBACK, c, line.label);
    } else if (line.kind === "to_recast") {
      // D-037: Recast banks the whole line, but only the co-owner's share is new money -
      // Recast's own share of it was already deducted from its half of net-to-seller.
      const c = cents - atShare(cents, share);
      to_recast_full_cents += cents;
      to_recast_cents += c; add(line.account, -c, line.label);
    } else {
      throw new RangeError(`sale: statement line "${line.label}" has unknown kind "${line.kind}"`);
    }
  }

  // Cash = Recast's share of net-to-seller + every line paid to Recast, in full.
  //
  // The share is FLOORED, not rounded: half of an odd cent cannot go to both sellers, and
  // the title company gave the odd cent to the other one (280 Sparkling, 2026-08-06: half
  // of 518,106.25 is 259,053.125 and Recast was wired 259,053.12). Flooring reproduces the
  // wire, and understating Recast's cash by a cent is the safe direction.
  //
  // A statement that states Recast's own figure wins over the derivation; the dialog does
  // not ask Paul for it (2026-09-22: "it should know cash received"). Whichever it is,
  // rounding each line at the share can still differ by a few cents, and those land on
  // closing costs so the entry balances and the check names them.
  const cash_cents = Number.isFinite(settlement.cash_to_recast_cents) && settlement.cash_to_recast_cents > 0
    ? Math.round(settlement.cash_to_recast_cents)
    : Math.floor(settlement.net_to_seller_cents * share) + to_recast_full_cents;
  const derived = revenue_cents + credit_cents + to_recast_cents - cost_cents - holdback_cents;
  const rounding_cents = cash_cents - derived;
  const allowed = Math.max(5, (settlement.lines || []).length);
  if (Math.abs(rounding_cents) > allowed) {
    const off = (c) => (c / 100).toFixed(2);
    throw new RangeError(
      `sale: the statement does not tie. The ${(settlement.lines || []).length} line(s) given take ` +
      `${off(cost_cents + holdback_cents)} off the sale price and add ${off(credit_cents + to_recast_cents)} back, ` +
      `which leaves ${off(derived)}, but net-to-seller says Recast received ${off(cash_cents)} - a gap of ` +
      `${off(rounding_cents)}. Every charge, adjustment and holdback on the statement needs its own line.`,
    );
  }
  if (rounding_cents) add(ROUNDING_ACCOUNT, -rounding_cents);

  add(CASH, cash_cents);
  add(REVENUE, -revenue_cents);
  return {
    cash_cents, revenue_cents, cost_cents, credit_cents, holdback_cents, to_recast_cents,
    to_recast_full_cents, rounding_cents, byAccount, labels,
  };
}

/** Interest the engine says each advance earned, frozen at its repayment date (audit §59:
 * the settlement date and an advance's repayment date are different dates). */
export function interestByAdvance(advances, settlementDate) {
  return (advances || []).map((a) => {
    const asOf = a.repaid_date || settlementDate;
    return {
      advance_id: a.advance_id,
      date: a.date,
      kind: a.kind || "",
      amount_cents: a.amount_cents,
      as_of: asOf,
      interest_cents: accruedThrough(a, asOf),
    };
  });
}

function line(account, cents, extra = {}) {
  return cents >= 0
    ? { account, debit: cents, credit: 0, ...extra }
    : { account, debit: 0, credit: -cents, ...extra };
}

/**
 * The whole close, as ordered journal intents plus a summary and the checks.
 *
 * @param {object} input
 * @param {{name, deal?: "partner"|"bank", dennis_share_pct?, dennis_commission_pct?}} input.property
 * @param {{date, sale_price_cents, net_to_seller_cents, recast_share_pct?, lines}} input.settlement
 * @param {Array} input.advances               this property's advance rows
 * @param {Record<string, number>} input.balances  the property's Journal balances, debit positive
 * @param {number} [input.interestFigureCents] Dennis's agreed figure (D-015 §2); default the engine's
 * @param {number} [input.recaptureCents]      Cost Recapture settled on this payout (D-015 §4)
 * @param {string} [input.postedBy]
 */
export function buildSalePlan({
  property,
  settlement,
  advances = [],
  balances = {},
  interestFigureCents = null,
  recaptureCents = 0,
  docUrl = "",
  postedBy = "",
}) {
  const date = settlement.date;
  const share = (settlement.recast_share_pct ?? 100) / 100;
  const deal = property.deal === "bank" ? "bank" : "partner";
  const dennisPct = deal === "bank" ? 0 : Number(property.dennis_share_pct ?? 50);
  const memoBase = `${property.name} sale ${date}` + (share < 1 ? ` (Recast ${(share * 100).toFixed(0)}%)` : "");
  const common = { property: property.name, payee: "", source: "sale", posted_by: postedBy };

  const st = splitStatement(settlement);

  // ---- 1. the sale itself -------------------------------------------------------------
  const saleLines = [...st.byAccount].map(([account, cents]) =>
    line(account, cents, { property: property.name, description: st.labels.get(account) || "" }));
  const intents = [{
    type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
    memo: `${memoBase}: settlement statement`,
    lines: saleLines,
  }];

  // ---- 2. interest to each advance's repayment date, then Dennis's agreed figure -------
  const detail = interestByAdvance(advances, date);
  const engineInterest = detail.reduce((t, d) => t + d.interest_cents, 0);
  const postedInterest = Math.round(balances[INTEREST_COST] || 0);
  const agreedInterest = interestFigureCents == null ? engineInterest : Math.round(interestFigureCents);

  const accrueNow = engineInterest - postedInterest;
  if (accrueNow !== 0) {
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${memoBase}: interest accrued to repayment (${detail.length} advance${detail.length === 1 ? "" : "s"})`,
      lines: [line(INTEREST_COST, accrueNow, { property: property.name }), line(INTEREST_ACCRUED, -accrueNow, { property: property.name })],
    });
  }
  const trueUp = agreedInterest - engineInterest;
  if (trueUp !== 0) {
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${memoBase}: interest true-up to Dennis's agreed figure (D-015)`,
      lines: [line(INTEREST_COST, trueUp, { property: property.name }), line(INTEREST_ACCRUED, -trueUp, { property: property.name })],
    });
  }

  // ---- 3. the bank deal's commission is a cost, so it lands before profit (D-030/D-036) --
  const commission = deal === "bank"
    ? atShare(Math.round(settlement.sale_price_cents * (Number(property.dennis_commission_pct ?? 0) / 100)), share)
    : 0;
  if (commission) {
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${memoBase}: Dennis's ${property.dennis_commission_pct}% commission on the sale price (bank deal)`,
      lines: [line(DENNIS_FEES, commission, { property: property.name }), line(DENNIS_NOTE, -commission, { property: property.name })],
    });
  }

  // ---- 4. net profit, then the partner's share (itself a project cost, D-006) ----------
  const cost = new Map(); // project-cost account -> balance after the sale and interest
  for (const [account, cents] of Object.entries(balances)) {
    if (isProjectCostAccount(account) && Math.round(cents)) cost.set(account, Math.round(cents));
  }
  for (const [account, cents] of st.byAccount) {
    if (isProjectCostAccount(account)) cost.set(account, (cost.get(account) || 0) + cents);
  }
  cost.set(INTEREST_COST, (cost.get(INTEREST_COST) || 0) + accrueNow + trueUp);
  if (commission) cost.set(DENNIS_FEES, (cost.get(DENNIS_FEES) || 0) + commission);

  const costBeforeShare = [...cost.values()].reduce((t, c) => t + c, 0);
  const profit_cents = st.revenue_cents - costBeforeShare;
  const dennis_share_cents = Math.round(profit_cents * (dennisPct / 100));
  const paul_share_cents = profit_cents - dennis_share_cents;

  if (dennis_share_cents) {
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${memoBase}: Dennis's ${dennisPct}% of net profit`,
      lines: [line(DENNIS_SHARE, dennis_share_cents, { property: property.name }), line(DENNIS_NOTE, -dennis_share_cents, { property: property.name })],
    });
    cost.set(DENNIS_SHARE, (cost.get(DENNIS_SHARE) || 0) + dennis_share_cents);
  }

  // ---- 5. release every project cost to COGS ------------------------------------------
  const released_cents = [...cost.values()].reduce((t, c) => t + c, 0);
  intents.push({
    type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
    memo: `${memoBase}: project cost released to COGS`,
    lines: [
      line(COGS, released_cents, { property: property.name }),
      ...[...cost].filter(([, c]) => c !== 0).map(([account, c]) => line(account, -c, { property: property.name })),
    ],
  });

  // ---- 6. the cash out: principal, interest and reimbursements first, then the shares ---
  const noteBefore = -Math.round(balances[DENNIS_NOTE] || 0) + commission;   // credit balance, positive = owed
  const accruedBefore = -Math.round(balances[INTEREST_ACCRUED] || 0) + accrueNow + trueUp;
  const dueToPaul = -Math.round(balances[DUE_TO_PAUL] || 0);

  let cash = st.cash_cents;
  const payDennisNote = Math.min(noteBefore, cash); cash -= payDennisNote;
  const payDennisInterest = Math.min(accruedBefore, cash); cash -= payDennisInterest;
  const payPaulDue = Math.min(dueToPaul, cash); cash -= payPaulDue;
  // what is left of the cash belongs to the two shares, in their proportion, capped at each
  const shareCash = Math.max(0, cash);
  const payDennisShare = Math.min(dennis_share_cents, Math.round(shareCash * (dennisPct / 100)));
  const payPaulShare = Math.min(paul_share_cents, shareCash - payDennisShare);
  cash = shareCash - payDennisShare - payPaulShare;

  const dennisLines = [];
  if (payDennisNote) dennisLines.push(line(DENNIS_NOTE, payDennisNote, { property: property.name, payee: "Dennis Little" }));
  if (payDennisShare) dennisLines.push(line(DENNIS_NOTE, payDennisShare, { property: property.name, payee: "Dennis Little" }));
  if (payDennisInterest) dennisLines.push(line(INTEREST_ACCRUED, payDennisInterest, { property: property.name, payee: "Dennis Little" }));
  const payDennis = payDennisNote + payDennisShare + payDennisInterest;
  if (payDennis) {
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${memoBase}: paid to Dennis — principal, interest and his share`,
      lines: [...dennisLines, line(CASH, -payDennis, { property: property.name, payee: "Dennis Little" })],
    });
  }

  const paulLines = [];
  if (payPaulDue) paulLines.push(line(DUE_TO_PAUL, payPaulDue, { property: property.name, payee: "Paul Bjork" }));
  if (payPaulShare) paulLines.push(line(OWNER_DRAWS, payPaulShare, { property: property.name, payee: "Paul Bjork" }));
  const payPaul = payPaulDue + payPaulShare;
  if (payPaul) {
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${memoBase}: paid to Paul — costs he fronted and his share`,
      lines: [...paulLines, line(CASH, -payPaul, { property: property.name, payee: "Paul Bjork" })],
    });
  }

  const summary = {
    property: property.name, deal, date,
    recast_share_pct: settlement.recast_share_pct ?? 100,
    sale_price_cents: settlement.sale_price_cents,
    revenue_cents: st.revenue_cents,
    statement: st,
    interest: { engine_cents: engineInterest, agreed_cents: agreedInterest, posted_before_cents: postedInterest, true_up_cents: trueUp, by_advance: detail },
    commission_cents: commission,
    cost_before_share_cents: costBeforeShare,
    profit_cents,
    dennis_share_cents, paul_share_cents,
    released_cents,
    cash_in_cents: st.cash_cents,
    paid: { dennis_cents: payDennis, paul_cents: payPaul, dennis_note_cents: payDennisNote, dennis_interest_cents: payDennisInterest, dennis_share_cents: payDennisShare, paul_due_cents: payPaulDue, paul_share_cents: payPaulShare },
    retained_cents: cash,
    owed_after: { dennis_cents: noteBefore + dennis_share_cents - payDennisNote - payDennisShare + accruedBefore - payDennisInterest, paul_cents: dueToPaul - payPaulDue, paul_undrawn_cents: paul_share_cents - payPaulShare },
    recapture_cents: recaptureCents,
  };

  const checks = {
    // every intent balances
    balanced: intents.every((i) => i.lines.reduce((t, l) => t + (l.debit || 0) - (l.credit || 0), 0) === 0),
    // cash out never exceeds cash in, and nothing is left unexplained
    cash_ties: payDennis + payPaul + cash === st.cash_cents,
    // the 1000s are empty after the release
    released_ties: released_cents === costBeforeShare + dennis_share_cents,
    // the statement's own rounding, named
    statement_rounding_cents: st.rounding_cents,
  };
  checks.ok = checks.balanced && checks.cash_ties && checks.released_ties;

  return { intents, summary, checks };
}

/**
 * The escrow holdback, when the money actually arrives (D-036 §1: Granite's $60,000 came
 * in on 2026-09-11, split 50/50). Dr cash / Cr 1510, then the partners' unpaid shares.
 */
export function buildHoldbackRelease({ property, date, amount_cents, dennis_cents, paul_cents, docUrl = "", postedBy = "" }) {
  const name = property.name;
  const intents = [{
    type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
    memo: `${name} escrow holdback released ${date}`,
    lines: [line(CASH, amount_cents, { property: name }), line(HOLDBACK, -amount_cents, { property: name })],
  }];
  if (dennis_cents) {
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${name} holdback: Dennis's share`,
      lines: [line(DENNIS_NOTE, dennis_cents, { property: name, payee: "Dennis Little" }), line(CASH, -dennis_cents, { property: name, payee: "Dennis Little" })],
    });
  }
  if (paul_cents) {
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${name} holdback: Paul's share`,
      lines: [line(OWNER_DRAWS, paul_cents, { property: name, payee: "Paul Bjork" }), line(CASH, -paul_cents, { property: name, payee: "Paul Bjork" })],
    });
  }
  const checks = {
    balanced: intents.every((i) => i.lines.reduce((t, l) => t + (l.debit || 0) - (l.credit || 0), 0) === 0),
    distributed_ties: (dennis_cents || 0) + (paul_cents || 0) <= amount_cents,
  };
  checks.ok = checks.balanced && checks.distributed_ties;
  return { intents, checks };
}
