// test/statement.test.mjs - lib/statement.mjs: the bank's export becomes feed lines, nothing more.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { parseOfx, decodeOfxText, ofxDate } from "../lib/statement.mjs";
import { OFX_FIXTURE, OFX_XML_FIXTURE } from "./helpers/ofx-fixture.mjs";

// Paul's real Citizens export, when it is on his Desktop. Never copied into the repo; the
// file name and body carry the whole account number.
const REAL = "/Users/paulbjork/Desktop/10632505.QFX";

test("parseOfx: a Citizens SGML export -> last four of the account, lines oldest first, cents, decoded text, the bank's balance", () => {
  const p = parseOfx(OFX_FIXTURE);
  assert.equal(p.account_last4, "2505");
  assert.equal(p.account_type, "CHECKING");
  assert.equal(p.currency, "USD");
  assert.equal(p.start, "2026-01-01");
  assert.equal(p.end, "2026-09-28");
  assert.equal(p.ledger_balance_cents, 17080007);
  assert.equal(p.ledger_date, "2026-09-28");
  assert.deepEqual(p.lines.map((l) => [l.date, l.amount_cents, l.type]), [
    ["2026-08-06", 500000, "CREDIT"],
    ["2026-09-01", -119640, "DEBIT"],
    ["2026-09-08", -699, "DEBIT"],        // same day as the refund: the smaller FITID first
    ["2026-09-08", 19102, "CREDIT"],
    ["2026-09-23", -10000, "DEBIT"],
    ["2026-09-25", -55000000, "DEBIT"],
  ]);
  const byId = Object.fromEntries(p.lines.map((l) => [l.fitid, l]));
  assert.equal(byId["202609230000000550838838"].memo, "CK# 1023 Kopec Overhead Door LLC");
  assert.equal(byId["202609230000000550838838"].name, "CK# 1023 Kopec Overhead Doo");
  assert.equal(byId["202609250000000551249109"].memo, "Wire transfer to Raymond James & Associates Inc");
  assert.equal(byId["202609080000000548051099"].memo, "Refund LOWES #02601* WAXAHACHIE TX");
  assert.equal(byId["202608060000000542493317"].memo, "XFER FROM ACCT CK-000099999999DENNIS C LITTLE");
  assert.ok(p.lines.every((l) => /^\d{24}$/.test(l.fitid)), "FITIDs kept whole (24 digits - text, never a number)");
  assert.ok(!JSON.stringify(p).includes("99992505"), "the account number never comes out of the parser");
});

test("parseOfx: OFX 2 (XML) form parses the same way, a time-zoned DTPOSTED is just its day", () => {
  const p = parseOfx(OFX_XML_FIXTURE);
  assert.equal(p.account_last4, "6317");
  assert.equal(p.lines.length, 1);
  assert.deepEqual(p.lines[0], { fitid: "2026091501", date: "2026-09-15", amount_cents: 200000, type: "DEP", name: "Deposit", memo: "Bison Title earnest money" });
  assert.equal(p.ledger_balance_cents, 200000);
  assert.equal(p.ledger_date, "2026-09-30");
});

test("parseOfx: refuses what is not a statement, in plain words", () => {
  assert.throws(() => parseOfx("Date,Amount,Description\n2026-09-01,-5.00,Coffee\n"), (e) => e.code === "NOT_OFX");
  assert.throws(() => parseOfx("<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>1234</ACCTID></BANKACCTFROM><BANKTRANLIST></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"), (e) => e.code === "NO_LINES");
  assert.throws(() => parseOfx("<OFX><STMTTRN><TRNAMT>1.00</STMTTRN></OFX>"), (e) => e.code === "NO_ACCOUNT");
  assert.throws(() => parseOfx(OFX_FIXTURE.replace("<FITID>202609230000000550838838\n", "")), (e) => e.code === "BAD_LINE");
});

test("decodeOfxText and ofxDate", () => {
  assert.equal(decodeOfxText(" A &amp; B  %23 5 "), "A & B # 5");
  assert.equal(decodeOfxText(null), "");
  assert.equal(ofxDate("20260928230510.000[-5:CDT]"), "2026-09-28");
  assert.equal(ofxDate("nope"), "");
});

test("the real Citizens export on Paul's Desktop ties: opening 0 + every line = the bank's balance", { skip: !existsSync(REAL) && "no export on the Desktop" }, () => {
  const p = parseOfx(readFileSync(REAL, "latin1"));
  assert.equal(p.account_last4, "2505");
  // whatever range Paul exported (2026-10-05: a fresh file on the Desktop failed the old pins of 73 lines from 08-06)
  assert.ok(p.lines.length > 0, "no lines in the export");
  assert.equal(new Set(p.lines.map((l) => l.fitid)).size, p.lines.length, "every FITID unique");
  assert.equal(p.lines.reduce((t, l) => t + l.amount_cents, 0), p.ledger_balance_cents);
  assert.ok(p.lines.every((l) => !/%23|&amp;/.test(l.name + l.memo)));
});
