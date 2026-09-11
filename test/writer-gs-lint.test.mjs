// test/writer-gs-lint.test.mjs
//
// Code.gs runs in the Apps Script V8 runtime and can't execute under
// node:test, so this is a text-level lint against the contract in
// docs/phase0-spec.md section 4: setup() is the first function and the only
// hand-run entry point, the file is ASCII-only (pasting into the Apps
// Script editor mangles UTF-8), every tab's header row from the spec
// appears verbatim, every writer action is dispatched, and no column is
// addressed by hardcoded A1 letters.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE_PATH = path.join(__dirname, "..", "apps-script", "writer", "Code.gs");
const source = readFileSync(CODE_PATH, "utf8");

test("Code.gs exists and is non-empty", () => {
  assert.ok(source.length > 0);
});

test("setup is the first function declared", () => {
  const matches = [...source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)];
  assert.ok(matches.length > 0, "no top-level function declarations found");
  assert.equal(matches[0][1], "setup", `first function declared was "${matches[0][1]}", expected "setup"`);
});

test("no non-ASCII bytes anywhere in the file", () => {
  const nonAscii = [...source].filter((ch) => ch.charCodeAt(0) > 127);
  assert.equal(nonAscii.length, 0, `found non-ASCII characters: ${JSON.stringify(nonAscii.slice(0, 10))}`);
});

// Header lists spelled out verbatim in phase0-spec.md section 4.
const SPEC_HEADERS = {
  "Journal": ["txn_id", "line", "date", "period", "account", "debit", "credit",
    "property", "cost_class", "tax_treatment", "trade", "payee", "description",
    "paid_from", "doc_url", "source", "posted_by", "posted_at", "memo",
    "reconciled_ref", "business_purpose", "attendee", "destination", "odometer",
    "void_of"],
  "Accounts": ["code", "name", "series", "type", "cost_class", "tax_treatment", "active", "notes"],
  "Properties": ["name", "address", "status", "purchase_date", "purchase_price",
    "settlement_date", "template", "dennis_funded", "drive_folder", "notes"],
  "Bank accounts": ["code", "name", "institution", "last4", "plaid_item_id",
    "plaid_account_id", "opening_balance", "opening_date", "active"],
  "Vendors": ["canonical", "aliases", "entity_type", "form_1099", "tin_status",
    "w9_url", "default_account", "notes"],
  "Advances": ["advance_id", "date", "amount", "property", "source_txn_id",
    "status", "accrued_to", "repaid_date", "notes"],
  "Periods": ["period", "status", "closed_at", "snapshot_url", "notes"],
  "Settings": ["key", "value", "notes"],
  "Users": ["email", "role", "name", "added_at"]
};

for (const [tab, headers] of Object.entries(SPEC_HEADERS)) {
  test(`${tab} header row from spec section 4 appears verbatim`, () => {
    // Anchor on the TAB_HEADERS key (e.g. "'Bank accounts': [") so this
    // finds the right array even when a header name (like "name") repeats
    // across multiple tabs' header lists.
    const keyNeedle = `'${tab}': [`;
    const anchorIndex = source.indexOf(keyNeedle);
    assert.ok(anchorIndex !== -1, `TAB_HEADERS key "${tab}" not found in Code.gs`);

    // These header arrays are flat lists of strings (no nested brackets), so
    // the next "]" after the anchor closes the array, however many lines it
    // wraps onto.
    const arrayEnd = source.indexOf("]", anchorIndex);
    assert.ok(arrayEnd !== -1, `no closing "]" found after TAB_HEADERS key "${tab}"`);
    const snippet = source.slice(anchorIndex, arrayEnd + 1);

    for (const name of headers) {
      assert.ok(
        snippet.includes(`'${name}'`),
        `header "${name}" not found verbatim in the "${tab}" array in Code.gs`
      );
    }
  });
}

test("every writer action (ping, post, void, read, setPeriod, upsert) is dispatched", () => {
  for (const action of ["ping", "post", "void", "read", "setPeriod", "upsert"]) {
    assert.ok(
      source.includes(`case '${action}':`),
      `doPost does not appear to dispatch action "${action}"`
    );
  }
});

test("unknown action falls through to BAD_ACTION", () => {
  assert.ok(source.includes("BAD_ACTION"));
});

test("no hardcoded A1-style column letters in getRange calls", () => {
  // Matches getRange("A2"), getRange('B3'), getRange("C2:C10"), etc. - a
  // getRange call whose first argument is a quoted A1 reference rather than
  // a numeric row/column.
  const a1Pattern = /getRange\(\s*["'][A-Za-z]{1,3}\d+/g;
  const hits = [...source.matchAll(a1Pattern)];
  assert.equal(hits.length, 0, `found hardcoded A1-style getRange calls: ${hits.map((h) => h[0]).join(", ")}`);
});

test("Journal columns are accessed via headerIndex_, not hardcoded indices", () => {
  assert.ok(source.includes("function headerIndex_("), "headerIndex_ helper is missing");
  assert.ok(source.includes("headerIndex_(sheet)") || source.includes("headerIndex_(periodsSheet)"));
});
