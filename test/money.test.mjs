import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents, fromCents, sumCents } from "../lib/money.mjs";

test("toCents parses a plain decimal string", () => {
  assert.equal(toCents("212.40"), 21240);
});

test("toCents parses a currency string with thousands separators", () => {
  assert.equal(toCents("$1,234.56"), 123456);
});

test("toCents parses a bare number", () => {
  assert.equal(toCents(212.4), 21240);
});

test("toCents treats parens as negative", () => {
  assert.equal(toCents("(44.39)"), -4439);
});

test("toCents handles a whole-dollar string with no cents", () => {
  assert.equal(toCents("500"), 50000);
});

test("toCents handles an explicit leading plus/minus sign", () => {
  assert.equal(toCents("-44.39"), -4439);
  assert.equal(toCents("+44.39"), 4439);
});

test("toCents rejects NaN with a RangeError", () => {
  assert.throws(() => toCents(NaN), RangeError);
});

test("toCents rejects garbage strings with a RangeError", () => {
  assert.throws(() => toCents("not a number"), RangeError);
  assert.throws(() => toCents(""), RangeError);
});

test("toCents rejects non-finite numbers", () => {
  assert.throws(() => toCents(Infinity), RangeError);
});

test("fromCents formats cents as a fixed 2-decimal string", () => {
  assert.equal(fromCents(21240), "212.40");
});

test("fromCents formats negative cents with a leading minus", () => {
  assert.equal(fromCents(-4439), "-44.39");
});

test("fromCents pads single-digit cent remainders", () => {
  assert.equal(fromCents(500), "5.00");
  assert.equal(fromCents(105), "1.05");
});

test("sumCents adds an array of integer cents", () => {
  assert.equal(sumCents([21240, 4439, -100]), 25579);
});

test("sumCents of an empty array is zero", () => {
  assert.equal(sumCents([]), 0);
});

test("round trip: toCents then fromCents recovers the original amount", () => {
  assert.equal(fromCents(toCents("1,234.56")), "1234.56");
});
