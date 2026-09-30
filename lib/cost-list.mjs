// lib/cost-list.mjs - a property whose tab is a plain list (Paul, 2026-09-30, on Cost Recapture: "i just
// need a simple list that shows the expenses, who is owed and whether it was reimbursed if it was
// paid for from a personal account"). Properties.template = "List". One row per cost line: the
// store, what, which sold house it was for, the amount, who paid, whether they have been paid
// back. Code, not judgment: it reads the Journal.

const OWED = { "2030": "Paul", "2010": "Dennis" };
const BANK = /^14\d\d$/;
const isCost = (l) => /^1[0-3]\d\d$/.test(String(l.account)) || /^[5-9]\d\d\d$/.test(String(l.account));

export const COST_LIST_HEADER = ["Date", "Store", "What", "For", "Amount", "Paid by", "Paid back"];

/**
 * @param {Array<object>} journal loadJournal lines
 * @param {string} name the property ("Cost Recapture")
 * @returns {{rows: any[][], summary: string[]}} rows in COST_LIST_HEADER order, newest first
 */
export function costListRows(journal, name) {
  const voided = new Set(journal.map((l) => l.void_of).filter(Boolean));
  const mine = journal.filter((l) => l.property === name && !l.void_of && l.source !== "void" && !voided.has(l.txn_id));
  const byTxn = new Map();
  for (const l of mine) (byTxn.get(l.txn_id) || byTxn.set(l.txn_id, []).get(l.txn_id)).push(l);

  const rows = [];
  const paidBack = { Paul: 0, Dennis: 0 };   // cents each person has been paid back, from entries with no cost line
  for (const lines of byTxn.values()) {
    const costs = lines.filter(isCost);
    const owed = lines.find((l) => OWED[String(l.account)]);
    const who = owed ? OWED[String(owed.account)] : lines.some((l) => BANK.test(String(l.account))) ? "Recast account" : "";
    if (!costs.length) {
      if (owed && owed.debit > owed.credit) paidBack[who] += owed.debit - owed.credit;
      continue;
    }
    for (const c of costs) {
      rows.push({ date: c.date, store: c.payee, what: c.description, trade: c.trade, cents: c.debit - c.credit, who });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));

  // paid back in date order: the oldest of a person's costs are covered first
  const left = { ...paidBack };
  const out = rows.map((r) => {
    let back = "";
    if (r.who === "Paul" || r.who === "Dennis") {
      if (r.cents <= 0) back = "";
      else if (left[r.who] >= r.cents) { back = "Yes"; left[r.who] -= r.cents; }
      else if (left[r.who] > 0) { back = `Part (${(left[r.who] / 100).toFixed(2)})`; left[r.who] = 0; }
      else back = "No";
    }
    return [r.date, r.store, r.what, r.trade, r.cents / 100, r.who, back];
  }).reverse();   // paid back is worked out oldest first; the tab shows the newest on top (Paul, 2026-09-30)

  const owedTo = (who) => rows.filter((r) => r.who === who).reduce((s, r) => s + r.cents, 0) - paidBack[who];
  const money = (c) => (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const summary = [
    `Paul is owed ${money(owedTo("Paul"))}` + (paidBack.Paul ? ` (paid back so far ${money(paidBack.Paul)})` : ""),
    `Dennis is owed ${money(owedTo("Dennis"))}` + (paidBack.Dennis ? ` (paid back so far ${money(paidBack.Dennis)})` : ""),
    `Paid from the Recast account: ${money(rows.filter((r) => r.who === "Recast account").reduce((s, r) => s + r.cents, 0))}`,
  ];
  return { rows: out, summary };
}
