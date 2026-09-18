// The one check behind the row-driven migration (D-029): every generated entry must build in
// the real posting engine against the workbook's own Accounts/Properties/Periods, balanced,
// and the totals must equal what migration-rows.py said it would post.
//   node scripts/migration-rows-check.mjs <dir with tab-Accounts.json tab-Properties.json tab-Periods.json> <rows dir>
import { readFileSync } from "node:fs";
import { buildEntry, makeCtx } from "../lib/posting.mjs";
const [tabs, rowsDir] = process.argv.slice(2);
const tab = (n) => { const t = JSON.parse(readFileSync(`${tabs}/tab-${n}.json`, "utf8")); return t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [h, r[i]]))); };
const active = (v) => !["false", "0", "no"].includes(String(v ?? "").trim().toLowerCase());
const ctx = makeCtx({
  accounts: new Map(tab("Accounts").filter((r) => active(r.active)).map((r) => [String(r.code), { ...r, code: String(r.code), series: String(r.series) }])),
  properties: new Set(tab("Properties").filter((r) => String(r.status || "").toLowerCase() !== "sold").map((r) => r.name).filter(Boolean)),
  periods: new Map(tab("Periods").map((r) => [r.period, r.status])),
  today: new Date().toISOString().slice(0, 10),
});
const src = readFileSync(`${rowsDir}/MigrationData.gs`, "utf8");
const entries = JSON.parse(src.slice(src.indexOf("= ") + 2, src.lastIndexOf(";")));
const expected = JSON.parse(readFileSync(`${rowsDir}/expected.json`, "utf8"));
const failed = []; let cents = 0; const byProp = {};
for (const e of entries) {
  try {
    // A negative old row is a refund Paul typed: the same entry with its sides swapped.
    const entry = buildEntry({ type: "expense", ...e, amount_cents: Math.abs(e.amount_cents), source: "migration", posted_by: "migration" }, ctx);
    if (e.amount_cents < 0) entry.lines = entry.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
    const d = entry.lines.reduce((s, l) => s + (l.debit || 0), 0), c = entry.lines.reduce((s, l) => s + (l.credit || 0), 0);
    if (d !== c || d !== Math.abs(e.amount_cents)) throw new Error(`unbalanced or wrong amount: ${d}/${c} vs ${e.amount_cents}`);
    cents += e.amount_cents; byProp[e.property] = (byProp[e.property] || 0) + e.amount_cents;
  } catch (err) { failed.push(`${e.date} ${e.property} ${e.account} ${e.paid_from} ${e.payee}: ${err.code || ""} ${err.message}`); }
}
const codes = {}; for (const f of failed) { const k = f.split(": ")[1].split(" ")[0]; codes[k] = (codes[k] || 0) + 1; }
console.log(`built ${entries.length - failed.length} of ${entries.length}; failed ${failed.length}`, codes);
failed.slice(0, 12).forEach((f) => console.log("  ", f));
if (!failed.length) {
  console.assert(cents === expected.cents, "total differs from expected.json");
  for (const [p, c] of Object.entries(expected.by_property)) console.assert(byProp[p] === c, `property ${p} differs`);
  console.log(`total $${(cents / 100).toFixed(2)} = expected; every property total matches`);
}
process.exit(failed.length ? 1 : 0);
