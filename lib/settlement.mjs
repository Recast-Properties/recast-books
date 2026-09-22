// lib/settlement.mjs — reading a title company's settlement statement (docs/phase5-spec.md §1.1)
//
// Pure: the prompt the model is given, the tool it answers with, and the validation of what
// comes back. No network, no model call — netlify/functions/books-settlement.mjs does that.
//
// Every rule here was taught by the two statements the Phase 5 gate runs on (spec §6a):
// 1616 Granite (Bison file 260648, one seller, an escrow holdback) and 280 Sparkling (file
// 260725, two sellers, and a line disbursed to Recast by name). The read fills the Sell
// dialog's form and nothing else: it never posts, files or locks anything, and Paul confirms
// every line before it can.
import { ACCOUNTS } from "./coa.mjs";

export const KINDS = ["cost", "credit", "holdback", "to_recast"];

/** Accounts a statement line may post to: the project-cost series, the escrow receivable,
 *  and other income for a credit that is genuinely income rather than a cost recovered. */
export function allowedAccounts() {
  return ACCOUNTS.map((a) => a.code).filter((c) => /^1[0-3]\d\d$/.test(c) || c === "1510" || c === "4030");
}

/** The chart, as the prompt shows it to the model: code, name, and what it is for. */
export function accountMenu() {
  const allowed = new Set(allowedAccounts());
  return ACCOUNTS.filter((a) => allowed.has(a.code)).map((a) => `- \`${a.code}\` ${a.name}`).join("\n");
}

export const SETTLEMENT_TOOL = {
  name: "report_settlement",
  description:
    "Report every figure on this settlement statement, once, when you have read all of it. " +
    "This fills a form a human then confirms; it posts nothing.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "file_no", "settlement_agent", "property_address", "sellers", "date",
      "sale_price_cents", "net_to_seller_cents", "cash_to_recast_cents",
      "recast_share_pct", "lines", "notes",
    ],
    properties: {
      file_no: { type: "string", description: "The settlement agent's file or GF number, verbatim. Empty string if absent." },
      settlement_agent: { type: "string", description: "The title company named on the statement." },
      property_address: { type: "string", description: "The property address as the statement gives it." },
      sellers: {
        type: "array", items: { type: "string" },
        description: "Every seller named on the statement, including any on an addendum. One entry per legal entity.",
      },
      date: { type: "string", description: "The closing or disbursement date, as YYYY-MM-DD. Prefer the disbursement date when both appear." },
      sale_price_cents: { type: "integer", description: "The contract sale price of the property, in cents. The whole price, not a share of it." },
      net_to_seller_cents: { type: "integer", description: "The statement's own cash-to-seller figure, in cents, for ALL sellers together." },
      cash_to_recast_cents: {
        type: "integer",
        description:
          "What Recast Properties itself received, in cents, when the statement says so directly; " +
          "0 when it does not (a single-seller statement, or one that only gives the combined figure).",
      },
      recast_share_pct: {
        type: "number",
        description:
          "Recast's share of this property as a percentage, read from the sellers: 100 for a single " +
          "seller, 50 for two equal sellers. Never a guess beyond what the statement shows.",
      },
      lines: {
        type: "array",
        description: "Every charge, adjustment and holdback on the statement. One entry per line; no line left out and none invented.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "cents", "kind", "account", "why"],
          properties: {
            label: { type: "string", description: "The statement's own wording for the line, verbatim." },
            cents: { type: "integer", description: "The amount in cents, always positive. The kind says which way it goes." },
            kind: {
              type: "string", enum: KINDS,
              description:
                "cost: a charge paid by the seller. credit: an adjustment due to the seller (an item the " +
                "seller paid in advance, a reimbursement of a certificate). holdback: an amount withheld in " +
                "escrow. to_recast: a line disbursed to Recast Properties by name.",
            },
            account: { type: "string", description: "The account from the chart below that this line belongs to." },
            why: { type: "string", description: "One short clause: the words on the statement that decided the account and the kind." },
          },
        },
      },
      notes: { type: "string", description: "Anything a human should know: an unusual line, a figure you could not read, a payoff you could not place." },
    },
  },
};

export const SETTLEMENT_PROMPT = `You are reading one settlement statement (a seller's Closing
Disclosure, ALTA statement, or HUD-1) for Recast Properties LLC, an Oregon company that buys
houses at foreclosure auction in Ellis County, Texas, rehabs them and resells them.

Your only job is to report what the document says, so a form can be filled in for a human to
confirm. You post nothing and change nothing. Call \`report_settlement\` exactly once, at the
end, when you have read the whole statement including any addendum.

## What matters most

**Every line, and the statement's own words.** List every charge, adjustment and holdback,
using the statement's wording verbatim as the label. Do not paraphrase, do not merge two lines
into one, do not leave out a line because it is small, and never invent one. If a line's amount
is unreadable, include it with your best reading and say so in \`notes\`.

**The kind comes from which part of the statement the line sits in, not from the words alone:**
- A charge in the seller-paid column, or under "Due from Seller at Closing", or in the closing
  cost details as seller-paid, is \`cost\`.
- An "Adjustment for Items Paid by Seller in Advance", or anything else under "Due to Seller at
  Closing" besides the sale price, is \`credit\`.
- An escrow holdback withheld at closing is \`holdback\`.
- A line disbursed **to Recast Properties by name** is \`to_recast\` - for example "Expense
  Reimbursement to RECAST PROPERTIES LLC". This one matters: Recast banks the whole line, but on
  a co-owned deal only the co-owner's share of it is new money.

**Taxes.** A Texas seller owes the buyer the year's tax from January 1 to closing, and the title
company nets it out of the proceeds. That line is a \`cost\` on account 1100, however it is
worded ("County Property Taxes 1/1/2026 thru 7/24/2026").

**A title premium disclosed twice.** Some statements disclose part of a premium again as its own
line (a "$65.00 of Title Premium" row) without charging it twice. If including a line would make
the arithmetic not tie, and the line reads as a breakdown of another, leave it out and say so in
\`notes\`.

**Sellers and the share.** Read every seller named, the addendum included. One seller means
\`recast_share_pct\` is 100. Two sellers sharing equally means 50, and then
\`net_to_seller_cents\` is still the combined figure the statement gives - do not halve it.
Only report \`cash_to_recast_cents\` when the statement itself says what Recast received;
otherwise report 0 and let the form derive it.

**The arithmetic must tie.** Sale price, plus every credit, less every cost and every holdback,
should equal the statement's own cash-to-seller figure. Check it before you answer. If it does
not tie, say so in \`notes\` with the gap - a missing line or a double-counted one is the usual
cause, and it is better to name the gap than to force a number.

## The accounts a line may use

${accountMenu()}

Pick the account that describes what was actually paid for. The commission goes to 1300; title,
escrow, recording, survey, doc prep, the owner's policy adjustment and similar closing charges go
to 1310; a buyer credit or concession to 1320; staging, photography or a listing fee to 1330; the
tax proration to 1100; HOA dues or a transfer fee to 1130; an escrow holdback to 1510. A
reimbursement of rehab that Recast fronted credits the rehab account it repays (1020 labor, 1030
materials, 1040 fixtures) - say in \`why\` which it repays and why you chose that one.`;

function isIsoDate(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

/**
 * Sale price + credits - costs - holdbacks, against the statement's own net-to-seller.
 * Always at 100%: a statement is the whole deal, whoever the sellers are. A `to_recast`
 * line is a cost the sellers jointly paid, so it counts on the cost side here.
 *
 * @returns {{ties: boolean, derived_cents: number, gap_cents: number}}
 */
export function tieCheck(settlement) {
  let costs = 0, credits = 0;
  for (const line of settlement.lines || []) {
    const cents = Number(line.cents) || 0;
    if (line.kind === "credit") credits += cents;
    else costs += cents; // cost, holdback and to_recast all come off the sellers' proceeds
  }
  const derived = Number(settlement.sale_price_cents || 0) + credits - costs;
  const gap = derived - Number(settlement.net_to_seller_cents || 0);
  return { ties: Math.abs(gap) <= 2, derived_cents: derived, gap_cents: gap };
}

/**
 * Validate and normalise what the model reported. Returns the settlement in the shape
 * `lib/sale.mjs` and the Sell dialog want, the read's metadata, and every problem found.
 * A problem never throws: step 2 of the dialog shows them next to the fields so Paul can
 * fix them, which is the whole point of a confirm step.
 *
 * @param {object} raw the tool input
 * @returns {{ok: boolean, settlement: object, read: object, problems: string[]}}
 */
export function validateSettlement(raw) {
  const problems = [];
  const allowed = new Set(allowedAccounts());
  const r = raw && typeof raw === "object" ? raw : {};

  if (!isIsoDate(r.date)) problems.push(`the closing date read as "${r.date}", which is not a YYYY-MM-DD date`);
  if (!isPositiveInt(r.sale_price_cents)) problems.push("no sale price was read");
  if (!isPositiveInt(r.net_to_seller_cents)) problems.push("no net-to-seller figure was read");

  const share = Number(r.recast_share_pct);
  const sellers = Array.isArray(r.sellers) ? r.sellers.filter((x) => typeof x === "string" && x.trim()) : [];
  let recast_share_pct = share > 0 && share <= 100 ? share : 100;
  if (!(share > 0 && share <= 100)) {
    problems.push(`Recast's share read as "${r.recast_share_pct}"; using 100% until you say otherwise`);
  }
  if (sellers.length > 1 && recast_share_pct === 100) {
    problems.push(`${sellers.length} sellers are named (${sellers.join(", ")}) but the share reads 100% - check it`);
  }

  const lines = [];
  for (const [i, line] of (Array.isArray(r.lines) ? r.lines : []).entries()) {
    const at = `line ${i + 1}`;
    const cents = Number(line?.cents);
    const kind = KINDS.includes(line?.kind) ? line.kind : null;
    const account = String(line?.account || "");
    if (!isPositiveInt(cents)) { problems.push(`${at} ("${line?.label || ""}") has no readable amount, so it was dropped`); continue; }
    if (!kind) { problems.push(`${at} ("${line?.label || ""}") came back with kind "${line?.kind}", so it was dropped`); continue; }
    if (!allowed.has(account)) { problems.push(`${at} ("${line?.label || ""}") proposed account ${account || "(none)"}, which a statement line may not use`); continue; }
    if (kind === "holdback" && account !== "1510") problems.push(`${at} is a holdback but proposed account ${account}; an escrow holdback belongs on 1510`);
    lines.push({
      label: String(line.label || "").trim() || `account ${account}`,
      cents, kind, account,
      why: String(line.why || "").trim(),
    });
  }
  if (!lines.length) problems.push("no statement lines were read at all");

  const settlement = {
    date: isIsoDate(r.date) ? r.date : "",
    sale_price_cents: isPositiveInt(r.sale_price_cents) ? r.sale_price_cents : 0,
    net_to_seller_cents: isPositiveInt(r.net_to_seller_cents) ? r.net_to_seller_cents : 0,
    cash_to_recast_cents: isPositiveInt(r.cash_to_recast_cents) ? r.cash_to_recast_cents : 0,
    recast_share_pct,
    lines,
  };

  const tie = tieCheck(settlement);
  if (settlement.sale_price_cents && settlement.net_to_seller_cents && !tie.ties) {
    problems.push(
      `the lines do not tie: they leave ${(tie.derived_cents / 100).toFixed(2)} but the statement says ` +
      `${(settlement.net_to_seller_cents / 100).toFixed(2)} went to the sellers, a gap of ${(tie.gap_cents / 100).toFixed(2)}`,
    );
  }

  return {
    ok: problems.length === 0,
    settlement,
    read: {
      file_no: String(r.file_no || ""),
      settlement_agent: String(r.settlement_agent || ""),
      property_address: String(r.property_address || ""),
      sellers,
      notes: String(r.notes || ""),
      tie,
    },
    problems,
  };
}
