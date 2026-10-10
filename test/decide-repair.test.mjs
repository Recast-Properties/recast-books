import { test } from "node:test";
import assert from "node:assert/strict";
import { repairDecideInput, normalizeDecide } from "../lib/bookkeeper.mjs";

const MARK = "<" + "/antml" + ":parameter>"; // built by concatenation so the literal never appears in source
const OPEN = (n) => "<" + "parameter name=\"" + n + "\">";

test("a string field that swallowed the rest of the call is cut and the entries recovered", () => {
  const entries = [{ date: "2026-09-11", payee: "Anthropic, PBC", memo: "m", property: "OVERHEAD", paid_from: "1402",
    items: [{ account: "6400", amount_cents: 1034, description: "credits", trade: "", business_purpose: "" }] }];
  const input = { verdict: "post", supersedes: "" + MARK + "\n" + OPEN("entries") + JSON.stringify(entries), entries: [] };
  const { input: out, repaired, notes } = repairDecideInput(input);
  assert.equal(repaired, true);
  assert.equal(out.supersedes, "");
  assert.equal(out.entries.length, 1);
  assert.equal(out.entries[0].items[0].amount_cents, 1034);
  assert.ok(notes.some((n) => n.includes("recovered entries")));
});

test("clean input is untouched", () => {
  const input = { verdict: "hold", supersedes: null, paid_from: "1402", entries: [] };
  const { input: out, repaired } = repairDecideInput(input);
  assert.equal(repaired, false);
  assert.deepEqual(out, input);
});

test("a recovered field never overwrites a value the model already gave", () => {
  const input = { verdict: "dismiss", paid_from: "" + MARK + OPEN("vendor") + "Junk Co", vendor: "Real Co" };
  const { input: out } = repairDecideInput(input);
  assert.equal(out.vendor, "Real Co");
  assert.equal(out.paid_from, "");
});

// 2026-10-10: a drill receipt held over its free battery - a $0.00 line is not a Journal line (BAD_AMOUNT).
test("a free ($0.00) item folds into the memo instead of standing as a line", () => {
  const input = { verdict: "post", entries: [{ date: "2026-10-06", payee: "The Home Depot", memo: "drill with a free battery", property: "OVERHEAD", paid_from: "PAUL",
    items: [{ account: "6510", amount_cents: 24789, description: "M18 hammer drill", trade: "", business_purpose: "" },
            { account: "6510", amount_cents: 0, description: "M18 5.0Ah battery (BOGO)", trade: "", business_purpose: "" }] }] };
  const out = normalizeDecide(input);
  assert.equal(out.entries[0].items.length, 1);
  assert.equal(out.entries[0].items[0].amount_cents, 24789);
  assert.equal(out.entries[0].memo, "drill with a free battery (free with it: M18 5.0Ah battery (BOGO))");
});
