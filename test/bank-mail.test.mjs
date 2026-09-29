// test/bank-mail.test.mjs — D-059: which card paid a bank line, read from the bank's daily email
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDailySummary, cardsForLines, holderOf, loadSummaries } from "../lib/bank-mail.mjs";
import { lineText } from "../lib/feed-match.mjs";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";
import { SUMMARY_0928, SUMMARY_0901 } from "./helpers/bank-mail-fixture.mjs";

test("parseDailySummary: the account, the day, every line with its card - and the lines add up to the email's own total", () => {
  const s = parseDailySummary(SUMMARY_0928);
  assert.equal(s.account_last4, "2505");
  assert.equal(s.date, "2026-09-28");
  assert.equal(s.ok, true, s.why);
  assert.deepEqual(s.lines.map((l) => [l.kind, l.description, l.signed_cents, l.card_last4, l.card_name]), [
    ["debit", "THE HOME DEPOT #6505 W", -16291, "9301", "DENNIS C LITTLE"],
    ["debit", "1316 N HIGHWAY 77 WAXA", -265, "9301", "DENNIS C LITTLE"],
    ["debit", "EPAY DEBIT 09/28 ZE", -28000, "", ""],
    ["debit", "CONDOCERTS TX 800-3106", -37500, "5450", "PAUL V BJORK"],
    ["debit", "THE HOME DEPOT #6505 W", -3307, "9301", "DENNIS C LITTLE"],
    ["debit", "THE HOME DEPOT #6505 W", -14109, "9301", "DENNIS C LITTLE"],
  ]);
  assert.equal(s.lines.reduce((t, l) => t + l.amount_cents, 0), 99472);
});

test("parseDailySummary: fails closed - lines that do not add up to the total are not used; other mail is not a summary", () => {
  const off = parseDailySummary(SUMMARY_0928.replace("$162.91", "$162.19"));
  assert.equal(off.ok, false);
  assert.match(off.why, /do not add up to the email's own total \$994\.72/);
  assert.deepEqual(off.lines, []);
  assert.equal(parseDailySummary("Your $275.00 to Effren Landscaper was sent"), null);
  assert.equal(parseDailySummary(""), null);
});

test("cardsForLines: a bank line gets the card its day and amount name - never a pending line's, another account's, or one of two", () => {
  const summaries = [parseDailySummary(SUMMARY_0928), parseDailySummary(SUMMARY_0901)];
  const lines = [
    { feed_id: "F1", date: "2026-09-28", amount_cents: -16291 }, { feed_id: "F2", date: "2026-09-28", amount_cents: -265 },
    { feed_id: "F3", date: "2026-09-28", amount_cents: -28000 }, { feed_id: "F4", date: "2026-09-28", amount_cents: -37500 },
    { feed_id: "F5", date: "2026-09-27", amount_cents: -16291 },   // the right amount, another day
    { feed_id: "F6", date: "2026-09-01", amount_cents: -6162 },
    { feed_id: "F7", date: "2026-09-01", amount_cents: -4726 },    // pending in that email, not posted
  ];
  const cards = cardsForLines(lines, summaries, ["2505", "5450", "9301"]);
  assert.deepEqual([...cards.keys()], ["F1", "F2", "F4", "F6"]);
  assert.deepEqual(cards.get("F1"), { last4: "9301", name: "DENNIS C LITTLE", holder: "Dennis" });
  assert.deepEqual(cards.get("F4"), { last4: "5450", name: "PAUL V BJORK", holder: "Paul" });
  assert.equal(cardsForLines(lines, summaries, ["6317"]).size, 0, "Chase's lines never take Citizens' cards");

  // the same amount on the same day on two cards: neither line can be told from the other
  const two = parseDailySummary(SUMMARY_0928.replace("CONDOCERTS TX 800-3106", "THE HOME DEPOT #6505 W").replace("$375.00", "$33.07").replace("$994.72", "$652.79"));
  assert.equal(two.ok, true, two.why);
  const both = cardsForLines([{ feed_id: "A", date: "2026-09-28", amount_cents: -3307 }, { feed_id: "B", date: "2026-09-28", amount_cents: -3307 }], [two], ["2505"]);
  assert.equal(both.size, 0);
  assert.equal(holderOf("DENNIS C LITTLE"), "Dennis");
  assert.equal(holderOf(""), "");
});

test("the matcher's line says the card, and the stored emails are read by prefix", async () => {
  assert.equal(lineText({ date: "2026-09-28", amount_cents: -16291, name: "Home Depot Waxahachie", memo: "Home Depot Waxahachie", card: { last4: "9301", holder: "Dennis" } }),
    "2026-09-28 | -162.91 | Home Depot Waxahachie | card 9301 (Dennis)");
  assert.equal(lineText({ date: "2026-09-28", amount_cents: -28000, name: "09/28 ZELLE", memo: "" }), "2026-09-28 | -280.00 | 09/28 ZELLE");
  const store = makeFakeCacheStore();
  await store.setJSON("bankmail/m1", { id: "m1", bodyText: SUMMARY_0928 });
  await store.setJSON("bankmail/m2", { id: "m2", bodyText: "not a summary" });
  await store.setJSON("tab/Feed", { headers: [], rows: [] });
  const all = await loadSummaries(store);
  assert.deepEqual(all.map((s) => s.date), ["2026-09-28"]);
});
