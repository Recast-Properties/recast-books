import { test } from "node:test";
import assert from "node:assert/strict";
import { repairDecideInput } from "../lib/bookkeeper.mjs";

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
