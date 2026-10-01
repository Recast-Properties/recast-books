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
const CONCESSIONS = "1320";       // Selling — concessions & credits (off the commission's base, D-053)
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
  // D-053: it is on the sale price less the seller's concessions - "dennis is taking 3% on
  // $756,000" (104 Ashburne: 775,000 less the 19,000 seller credit, which the statement puts on 1320).
  const concession_cents = settlement.lines
    .filter((l) => l.kind === "cost" && String(l.account) === CONCESSIONS)
    .reduce((t, l) => t + Math.round(l.cents), 0);
  const commission_basis_cents = settlement.sale_price_cents - concession_cents;
  const commission = deal === "bank"
    ? atShare(Math.round(commission_basis_cents * (Number(property.dennis_commission_pct ?? 0) / 100)), share)
    : 0;
  if (commission) {
    intents.push({
      type: "journal", date, source: "sale", posted_by: postedBy, doc_url: docUrl,
      memo: `${memoBase}: Dennis's ${property.dennis_commission_pct}% commission on the sale price` +
        (concession_cents ? ` less concessions (${(commission_basis_cents / 100).toFixed(2)})` : "") + " (bank deal)",
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
    commission_basis_cents: commission ? commission_basis_cents : 0,
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

// ---- the closing tab's two lists (Paul, 2026-10-01: "this sheet is a bit confusing") -------
// Pure, so the tab's arithmetic is tested here: every list adds up to the total under it.

/**
 * The SETTLEMENT block, the way the money arrived. Every statement line shows at Recast's
 * share. A line paid to Recast by name shows twice, because that is what happened: once
 * among the charges (Recast's share of it came out of Recast's own sale money) and once
 * below the subtotal, in full (the separate payment Recast received). 280 Sparkling: the
 * 4,716.82 reimbursement came off the top before the split, so 259,053.12 + 4,716.82 are
 * the two wires - the old layout netted the two to "2,358.41" and read as half a payment.
 *
 * @param {{revenue_cents, cash_in_cents, recast_share_pct?}} summary
 * @param {Array<{label, account, kind, posted_cents, full_cents?, rest_label?, paid_label?}>} lines
 *   `full_cents` on a to_recast line is the statement's own figure; without it (a tab
 *   rebuilt from the Journal alone) the line shows as the net credit it was posted as.
 * @returns {Array<{label, cents, note, total?: true}>} first row the sale price, last row cash received
 */
export function settlementRows(summary, lines = []) {
  const share = Number(summary.recast_share_pct ?? 100);
  const mine = share === 50 ? "half" : "share";
  const rows = [{ label: "Sale price" + (share < 100 ? " (Recast's share)" : ""), cents: summary.revenue_cents, note: "" }];
  const paid = lines.filter((l) => l.kind === "to_recast" && l.full_cents);
  const paidFull = paid.reduce((t, l) => t + l.full_cents, 0);
  let running = summary.revenue_cents;
  for (const l of lines) {
    const charged = paid.includes(l);
    const cents = charged ? -(l.full_cents - l.posted_cents)
      : (l.kind === "credit" || l.kind === "to_recast" ? 1 : -1) * l.posted_cents;
    running += cents;
    // the explanation leads: a long statement label is cut off at the column's edge
    rows.push({ label: "  " + (charged ? `Your ${mine} of the charge: ` : "") + l.label, cents, note: l.account });
  }
  const rounding = summary.cash_in_cents - paidFull - running;
  if (rounding) rows.push({ label: "  Rounding", cents: rounding, note: "" });
  if (paid.length) {
    rows.push({ label: paid[0].rest_label || `Your ${mine} of the sale money`, cents: summary.cash_in_cents - paidFull, note: "", total: true });
    for (const l of paid) rows.push({ label: l.paid_label || `${l.label}, paid to Recast in full`, cents: l.full_cents, note: "" });
  }
  rows.push({ label: "Cash received", cents: summary.cash_in_cents, note: "", total: true });
  return rows;
}

/**
 * The PROJECT COST RELEASED block: one row per account released to COGS, the rehab accounts
 * as one Rehab row. Net of both sides - a rehab account the closing reimbursed past zero is
 * released with a debit, and counting credits only left that row off the list, so the rows
 * did not add up to the total (280 Sparkling, 1,559.94). Rehab shows what was spent.
 *
 * A reimbursement paid to Recast by name shows IN FULL under it, with Recast's share of the
 * charge for it as its own row - the same two figures as the settlement block. Paul,
 * 2026-10-01, on a single net row worded "the co-owner's half": "WE PAID THE ENTIRE 4,716.82.
 * SAM DIDNT PAY A PENNY. we were reimbursed as a separate wire for the full amount." Never
 * word either row as the co-owner paying.
 *
 * @param {Array<{memo, lines}>} intents  the run's entries; the settlement and the release are read
 * @param {(account: string) => string} nameOf  the chart's name for an account
 * @param {Array<{kind, account, posted_cents, full_cents?}>} [lines]  the tab's statement lines (settlementRows)
 * @param {number} [sharePct]  Recast's share of the sale, for the charge row's wording
 * @returns {Array<{label, cents, accounts}>}
 */
export function releasedCostRows(intents, nameOf = (a) => "account " + a, lines = [], sharePct = 100) {
  const isRehab = (a) => a >= "1020" && a <= "1060";
  const released = new Map();
  let reimbursed = 0;   // what the settlement entry credited to the rehab accounts
  for (const i of intents || []) {
    const release = /released to COGS/.test(i.memo);
    const statement = /settlement statement/.test(i.memo);
    for (const l of i.lines) {
      const a = String(l.account);
      if (!isProjectCostAccount(a)) continue;
      if (release) released.set(a, (released.get(a) || 0) + (l.credit || 0) - (l.debit || 0));
      else if (statement && isRehab(a)) reimbursed += l.credit || 0;
    }
  }
  const paid = (lines || []).filter((l) => l.kind === "to_recast" && l.full_cents && l.posted_cents && isRehab(String(l.account)));
  const paidFull = paid.reduce((t, l) => t + l.full_cents, 0);
  const paidNet = paid.reduce((t, l) => t + l.posted_cents, 0);
  const rows = [];
  const rehab = [...released.keys()].filter(isRehab).sort();
  let rehabDone = false;
  for (const a of [...released.keys()].sort()) {
    if (isRehab(a)) {
      if (rehabDone) continue;
      rehabDone = true;
      rows.push({ label: "Rehab", cents: rehab.reduce((t, r) => t + released.get(r), 0) + reimbursed, accounts: rehab.join(" ") });
      if (paid.length) {
        rows.push({ label: "Less: reimbursement paid to Recast, in full", cents: -paidFull, accounts: "" });
        rows.push({ label: `Your ${sharePct === 50 ? "half" : "share"} of the charge for it, taken out of the sale money (same as above)`, cents: paidFull - paidNet, accounts: "" });
      }
      rows.push({ label: "Less: rehab reimbursed at closing", cents: -(reimbursed - (paid.length ? paidNet : 0)), accounts: "" });
      continue;
    }
    rows.push({
      label: a === DENNIS_SHARE ? "Dennis's half of the profit (a cost of the deal, so your half is the bottom line)" : nameOf(a),
      cents: released.get(a), accounts: a,
    });
  }
  return rows.filter((r) => r.cents !== 0);
}

// ---- the closing tab every partner deal gets (Paul's layout, 2026-10-01) -------------------
// He shaped it line by line on 280 Sparkling's trial tab, then: "yes. with the exception of
// ashburne" - the bank deal keeps the long layout above (settlementRows / releasedCostRows).
// It follows the cash: what came in, what the house cost before closing, the profit and its
// split, who was paid. The title company's own charges are not listed - they came out of the
// sale money before it was wired, and are on the linked closing document.

/**
 * What each project-cost account held BEFORE the closing: what the release took out, less
 * what the settlement entry itself put in. Dennis's share of the profit is not a cost here.
 * @returns {Map<string, number>} account -> cents
 */
export function costBeforeClosing(intents) {
  const before = new Map();
  for (const i of intents || []) {
    if (!/released to COGS|settlement statement/.test(i.memo)) continue;
    for (const l of i.lines) {
      const a = String(l.account);
      if (!isProjectCostAccount(a) || a === DENNIS_SHARE) continue;
      before.set(a, (before.get(a) || 0) + (l.credit || 0) - (l.debit || 0));
    }
  }
  return before;
}

/**
 * The rows of the closing tab, in Paul's sections, names and order.
 *
 * PROJECT COSTS (D-071, which replaced D-068): the way Paul's old reconciled tabs did it -
 * the purchase, the interest, Rehab Costs = EVERY bill that is not a utility, tax or
 * insurance, and Utilities. A cash advance's PRINCIPAL is not a cost row: it paid for bills
 * that are already in Rehab Costs (or paid Paul back for them), so listing it too would
 * count that money twice. Its interest is a cost. The principal shows only in PAYOUTS, where
 * Dennis gets it back; a partner's "Paid out of pocket" there is bills he paid that no
 * advance covered. Never net the advances out of Rehab Costs - Paul reads that row against
 * the house tab's list of bills.
 * Never throws - it is called after a sale has posted; a figure that does not tie says so
 * in its note instead.
 *
 * @param {object} input
 * @param {object} input.summary     buildSalePlan's summary (or the same read back off the Journal)
 * @param {Array<{memo, lines}>} input.intents   the settlement and release entries are read
 * @param {Array} [input.lines]      the tab's statement lines (settlementRows): holdbacks, payments to Recast
 * @param {number} [input.dennisPct] Dennis's share of the profit
 * @param {{date, received_cents, dennis_cents, paul_cents}} [input.holdback] escrow released since
 * @returns {{title_note: string, rows: Array<{label, cents, note, style, note_plain?}>}}
 *   style: "head" | "total" | "row" | "blank"; cents null on a name row; note_plain = the note is not bold
 */
export function closingRows({ summary: s, intents, lines = [], dennisPct = 50, holdback = null }) {
  const share = Number(s.recast_share_pct ?? 100);
  const mine = share === 50 ? "half" : "share";
  const money = (c) => (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rows = [];
  const row = (label, cents, note = "") => rows.push({ label: "  " + label, cents, note, style: "row" });
  const total = (label, cents, note = "") => rows.push({ label, cents, note, style: "total" });
  const head = (label) => rows.push({ label, cents: null, note: "", style: "head" });
  const blank = () => rows.push({ label: "", cents: null, note: "", style: "blank" });

  const before = costBeforeClosing(intents);
  const at = (a) => before.get(a) || 0;
  const totalCost = [...before.values()].reduce((t, c) => t + c, 0);
  const advances = (s.interest && s.interest.by_advance) || [];
  const cashAdv = advances.filter((a) => a.kind === "cash");
  const cashPrincipal = cashAdv.reduce((t, a) => t + a.amount_cents, 0);
  const cashInterest = cashAdv.reduce((t, a) => t + a.interest_cents, 0);
  const purchasePrincipal = advances.filter((a) => a.kind !== "cash").reduce((t, a) => t + a.amount_cents, 0);
  const held = lines.filter((l) => l.kind === "holdback").reduce((t, l) => t + l.posted_cents, 0);
  const paid = lines.filter((l) => l.kind === "to_recast" && l.full_cents);
  const paidFull = paid.reduce((t, l) => t + l.full_cents, 0);

  head("INCOMING CASH AT CLOSING");
  // Paul's wording, 2026-10-01: "Payout from title company", and its note short and not bold
  row((paid[0] && paid[0].rest_label) || (share < 100 ? `Your ${mine} of the sale money` : "Payout from title company"),
    s.cash_in_cents - paidFull, "After commission, closing costs and taxes");
  rows[rows.length - 1].note_plain = true;
  for (const l of paid) row(l.paid_label || `${l.label}, paid to Recast in full`, l.full_cents);
  total("Cash received", s.cash_in_cents);
  if (held) {
    row("Held back by the title company (escrow)", held, "Comes later - see the escrow section below");
    rows[rows.length - 1].note_plain = true;   // not bold (Paul, 2026-10-01)
  }
  blank();

  head("PROJECT COSTS");
  row("Purchase Principal", at("1000"));
  row("Purchase Interest", at(INTEREST_COST) - cashInterest);
  // Paul, 2026-10-01: "add the cash advance total after Cash Advances Interest so it would say Cash Advances
  // Interest on $6,838" - the principal is not a cost row here, so the interest row says what it is interest on.
  const dollars = (c) => "$" + (c % 100 ? money(c) : money(c).slice(0, -3));
  row("Cash Advances Interest" + (cashPrincipal ? " on " + dollars(cashPrincipal) : ""), cashInterest);
  row("Rehab Costs", totalCost - at("1000") - at(INTEREST_COST) - at("1120") - at("1100") - at("1110"));
  row("Utilities", at("1120"));
  if (at("1100")) row("Property Tax", at("1100"));
  if (at("1110")) row("Insurance", at("1110"));
  total("Total Project Costs", totalCost);
  blank();

  head("PROFIT");
  const expected = s.cash_in_cents + held - totalCost;
  total("Total Profit", s.profit_cents, expected === s.profit_cents
    ? "Cash received" + (held ? " plus the escrow" : "") + " less total project costs"
    : `DOES NOT MATCH cash received less total project costs (${money(expected)})`);
  if (dennisPct) row(`Dennis ${dennisPct}%`, s.dennis_share_cents);
  row(`Paul ${100 - dennisPct}%`, s.paul_share_cents);
  blank();

  // Plain "Half of profit" even when escrow was held back and only part was paid at closing (Paul took the
  // "(the part paid at closing)" suffix off, 2026-10-01) - the escrow section under the payouts shows the rest.
  const shareLabel = (pct) => (pct === 50 ? "Half of profit" : `${pct}% of profit`);
  const paidOut = s.paid.dennis_cents + s.paid.paul_cents + s.retained_cents;
  head("PAYOUTS");
  total("Dennis", null);
  row("Purchase Principal", purchasePrincipal);
  row("Purchase Interest", s.paid.dennis_interest_cents - cashInterest);
  row("Cash Advances Principal", cashPrincipal);
  row("Cash Advances Interest", cashInterest);
  row("Paid out of pocket", s.paid.dennis_note_cents - purchasePrincipal - cashPrincipal);
  row(shareLabel(dennisPct), s.paid.dennis_share_cents);
  total("Total to Dennis", s.paid.dennis_cents);
  blank();
  total("Paul", null);
  row("Paid out of pocket", s.paid.paul_due_cents);
  row(shareLabel(100 - dennisPct), s.paid.paul_share_cents);
  total("Total to Paul", s.paid.paul_cents);
  blank();
  total("Refunded to Recast Citizens Account", s.retained_cents);
  blank();
  total("Total paid out", paidOut, paidOut === s.cash_in_cents
    ? "Matches the cash received at closing" : "DOES NOT MATCH the cash received at closing");

  if (held) {
    blank();
    head("ESCROW HELD BACK AT CLOSING");
    const got = holdback ? holdback.received_cents : 0;
    if (got) {
      row(`Released by the title company ${holdback.date}`, got);
      row("Paid to Dennis", holdback.dennis_cents);
      row("Paid to Paul", holdback.paul_cents);
      row("Refunded to Recast Citizens Account", got - holdback.dennis_cents - holdback.paul_cents);
    }
    if (held - got) {
      row("Still held by the title company", held - got);
      row("Owed to Dennis when it is released", s.owed_after.dennis_cents);
      row("Owed to Paul when it is released", s.owed_after.paul_undrawn_cents);
    }
  }

  return {
    title_note: `Sold for ${money(Math.round(s.revenue_cents * 100 / share))}.` + (share < 100 ? ` Recast owned ${share}%.` : ""),
    rows,
  };
}
