import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS, accountMap, seriesOf } from "../lib/coa.mjs";

test("every account has code, name, series, type, cost_class, tax_treatment", () => {
  for (const a of ACCOUNTS) {
    assert.equal(typeof a.code, "string");
    assert.equal(typeof a.name, "string");
    assert.equal(typeof a.series, "string");
    assert.equal(typeof a.type, "string");
    assert.equal(typeof a.cost_class, "string");
    assert.equal(typeof a.tax_treatment, "string");
  }
});

test("account codes are unique", () => {
  const codes = ACCOUNTS.map((a) => a.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("spec §6 accounts are all present, including 1220 and 2030", () => {
  const codes = new Set(ACCOUNTS.map((a) => a.code));
  const expected = [
    "1000", "1010", "1020", "1030", "1040", "1050", "1060",
    "1100", "1110", "1120", "1130",
    "1200", "1210", "1220",
    "1300", "1310", "1320", "1330",
    "1401", "1402", "1500", "1510", "1520",
    "2000", "2010", "2020", "2030",
    "4000", "4010", "4020", "4030",
    "5000", "5010",
    "6000", "6010", "6100", "6200", "6210", "6300", "6400", "6410", "6500",
    "6510", "6600", "6610", "6700", "6710", "6720", "6800", "6900", "6910", "6920", "6350", "6930",
    "7000",
    "9000", "9010",
  ];
  for (const code of expected) {
    assert.ok(codes.has(code), `missing account ${code}`);
  }
  assert.equal(codes.size, expected.length);
});

test("1000-series cost_class follows the range table", () => {
  const map = accountMap();
  assert.equal(map.get("1000").cost_class, "Acquisition");
  assert.equal(map.get("1010").cost_class, "Acquisition");
  assert.equal(map.get("1020").cost_class, "Rehab");
  assert.equal(map.get("1060").cost_class, "Rehab");
  assert.equal(map.get("1100").cost_class, "Holding");
  assert.equal(map.get("1130").cost_class, "Holding");
  assert.equal(map.get("1200").cost_class, "Financing");
  assert.equal(map.get("1220").cost_class, "Financing");
  assert.equal(map.get("1300").cost_class, "Selling");
  assert.equal(map.get("1330").cost_class, "Selling");
});

test("1000-1399 accounts carry tax_treatment Inventory (held)", () => {
  const map = accountMap();
  for (const code of ["1000", "1030", "1100", "1200", "1220", "1330"]) {
    assert.equal(map.get(code).tax_treatment, "Inventory (held)");
  }
});

test("6000-series accounts are cost_class Overhead, tax_treatment Expense", () => {
  const map = accountMap();
  for (const code of ["6000", "6400", "6600", "6710", "6920"]) {
    assert.equal(map.get(code).cost_class, "Overhead");
    assert.equal(map.get(code).tax_treatment, "Expense");
    assert.equal(map.get(code).type, "expense");
  }
});

test("5000-series is type cogs with tax_treatment COGS (released)", () => {
  const map = accountMap();
  assert.equal(map.get("5000").type, "cogs");
  assert.equal(map.get("5000").tax_treatment, "COGS (released)");
  assert.equal(map.get("5010").type, "cogs");
});

test("liability accounts 2000-2030 are type liability", () => {
  const map = accountMap();
  for (const code of ["2000", "2010", "2020", "2030"]) {
    assert.equal(map.get(code).type, "liability");
  }
  assert.equal(map.get("2010").name, "Note payable — Dennis");
  assert.equal(map.get("2030").name, "Due to owner (Paul)");
});

test("equity accounts 9000-9010 are type equity, tax_treatment Owner equity", () => {
  const map = accountMap();
  assert.equal(map.get("9000").type, "equity");
  assert.equal(map.get("9000").tax_treatment, "Owner equity");
  assert.equal(map.get("9010").type, "equity");
});

test("accountMap returns a Map keyed by code", () => {
  const map = accountMap();
  assert.ok(map instanceof Map);
  assert.equal(map.get("1030").name, "Rehab — materials");
});

test("seriesOf buckets 1000-1399 as \"1000\" and 1400-1599 as \"1400\"", () => {
  assert.equal(seriesOf("1000"), "1000");
  assert.equal(seriesOf("1030"), "1000");
  assert.equal(seriesOf("1330"), "1000");
  assert.equal(seriesOf("1401"), "1400");
  assert.equal(seriesOf("1510"), "1400");
});

test("seriesOf buckets the rest of the chart", () => {
  assert.equal(seriesOf("2010"), "2000");
  assert.equal(seriesOf("4000"), "4000");
  assert.equal(seriesOf("5000"), "5000");
  assert.equal(seriesOf("6400"), "6000");
  assert.equal(seriesOf("7000"), "7000");
  assert.equal(seriesOf("9010"), "9000");
});

test("seriesOf throws on a code with no known bucket", () => {
  assert.throws(() => seriesOf("3000"), RangeError);
  assert.throws(() => seriesOf("not-a-code"), RangeError);
});
