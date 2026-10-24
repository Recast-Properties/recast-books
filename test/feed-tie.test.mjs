// test/feed-tie.test.mjs - audit 2026-10-24 #1: which open bank line a posted entry pays for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bankMovements, openLineFor, candidateFor, candidatesFor, TIE_DAYS } from "../lib/feed-tie.mjs";

const isBank = (code) => code === "1401" || code === "1402";
const purchase = (date, cents, account = "1401") => ({ date, txn_id: `receipt-${date}-x`, lines: [{ account: "1030", debit: cents, credit: 0 }, { account, debit: 0, credit: cents }] });
const row = (feed_id, date, amount_cents, status = "proposed", txn_id = "", account = "1401") => ({ feed_id, account, date, amount_cents, status, txn_id });

test("bankMovements: one movement per bank account, signed as the bank shows it; a refund is money in; a split receipt is one movement; PAUL/DENNIS entries have none", () => {
  assert.deepEqual(bankMovements([purchase("2026-10-06", 5285)], isBank), [{ account: "1401", bank_cents: -5285, date: "2026-10-06" }]);
  const refund = { date: "2026-10-02", lines: [{ account: "1030", debit: 0, credit: 6191 }, { account: "1401", debit: 6191, credit: 0 }] };
  assert.deepEqual(bankMovements([refund], isBank), [{ account: "1401", bank_cents: 6191, date: "2026-10-02" }]);
  assert.deepEqual(bankMovements([purchase("2026-10-06", 3000), purchase("2026-10-06", 2285)], isBank), [{ account: "1401", bank_cents: -5285, date: "2026-10-06" }]);
  const paul = { date: "2026-10-06", lines: [{ account: "1030", debit: 5285, credit: 0 }, { account: "2030", debit: 0, credit: 5285 }] };
  assert.deepEqual(bankMovements([paul], isBank), []);
});

test("openLineFor: the one open line of that account, same amount, within TIE_DAYS; never a tied line, never an ambiguous pair", () => {
  const rows = [row("A", "2026-10-06", -5285), row("B", "2026-10-06", -5285, "matched", "receipt-1"), row("C", "2026-10-06", -5285, "unmatched", "", "1402"), row("D", "2026-09-01", -5285, "unmatched")];
  const mv = { account: "1401", bank_cents: -5285, date: "2026-10-05" };
  assert.equal(openLineFor(rows, mv).feed_id, "A", "the open 1401 line a day away");
  assert.equal(openLineFor(rows, { ...mv, date: "2026-10-05", account: "1402" }).feed_id, "C");
  assert.equal(openLineFor([...rows, row("E", "2026-10-07", -5285)], mv), null, "two open lines fit: the matcher's call");
  assert.equal(openLineFor(rows, { ...mv, bank_cents: -5284 }), null, "to the cent");
  assert.equal(openLineFor(rows, { ...mv, date: "2026-09-12" }), null, `D is ${TIE_DAYS}+ days away`);
  assert.equal(openLineFor(rows, { ...mv, date: "not a date" }), null);
});

test("candidateFor: the one untied entry with the line's signed amount within TIE_DAYS", () => {
  const cands = [{ txn_id: "r1", date: "2026-10-13", amount_cents: -35000 }, { txn_id: "r2", date: "2026-10-14", amount_cents: -30000 }, { txn_id: "r3", date: "2026-08-01", amount_cents: -35000 }];
  assert.equal(candidateFor(cands, { amount_cents: -35000, date: "2026-10-14" }).txn_id, "r1");
  assert.equal(candidateFor(cands, { amount_cents: -35000, date: "2026-10-14" }, new Set(["r1"])), null, "spent already");
  assert.equal(candidateFor([...cands, { txn_id: "r4", date: "2026-10-15", amount_cents: -35000 }], { amount_cents: -35000, date: "2026-10-14" }), null, "two fit: ambiguous");
  assert.equal(candidateFor(cands, { amount_cents: 35000, date: "2026-10-14" }), null, "the sign matters: money in is not money out");
});

test("candidatesFor: a receipt split by house (D-041) is one group of same-payee same-date entries adding up to the line; two such groups, or a single plus a group, is nobody's", () => {
  const split = [
    { txn_id: "a", date: "2026-10-06", amount_cents: -1000, payee: "The Home Depot" },
    { txn_id: "b", date: "2026-10-06", amount_cents: -4285, payee: "The Home Depot" },
    { txn_id: "c", date: "2026-10-06", amount_cents: -4285, payee: "Lowe's" },
  ];
  assert.deepEqual(candidatesFor(split, { amount_cents: -5285, date: "2026-10-06" }).map((c) => c.txn_id), ["a", "b"]);
  assert.deepEqual(candidatesFor(split, { amount_cents: -4285, date: "2026-10-06" }), [], "two single entries fit: ambiguous");
  assert.deepEqual(candidatesFor(split, { amount_cents: -5285, date: "2026-10-06" }, new Set(["a"])), [], "a spent entry breaks the group");
  const two = [...split, { txn_id: "d", date: "2026-10-05", amount_cents: -5285, payee: "Lowe's" }];
  assert.deepEqual(candidatesFor(two, { amount_cents: -5285, date: "2026-10-06" }).map((c) => c.txn_id), ["d"], "a single entry wins over a group");
});
