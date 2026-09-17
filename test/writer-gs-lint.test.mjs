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
const MENU_PATH = path.join(__dirname, "..", "apps-script", "writer", "Menu.gs");
const source = readFileSync(CODE_PATH, "utf8");
const menuSource = readFileSync(MENU_PATH, "utf8");

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

// phase2.7-spec.md section 4: Menu.gs gets pasted into the same editor as Code.gs and
// lib.gs, so it is held to the same paste-safety bar (ASCII) plus a cheap syntax smoke
// test (balanced braces) - it can't run under node:test any more than Code.gs can.
test("Menu.gs exists, is non-empty and ASCII-only", () => {
  assert.ok(menuSource.length > 0);
  const nonAscii = [...menuSource].filter((ch) => ch.charCodeAt(0) > 127);
  assert.equal(nonAscii.length, 0, `found non-ASCII characters: ${JSON.stringify(nonAscii.slice(0, 10))}`);
});

test("Menu.gs braces are balanced", () => {
  const opens = (menuSource.match(/\{/g) || []).length;
  const closes = (menuSource.match(/\}/g) || []).length;
  assert.equal(opens, closes, `Menu.gs has ${opens} "{" but ${closes} "}"`);
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

test("every writer action (ping, post, void, read, setPeriod, upsert, postBatch, storeDocument, propertyTab) is dispatched", () => {
  for (const action of ["ping", "post", "void", "read", "setPeriod", "upsert", "postBatch", "storeDocument", "propertyTab"]) {
    assert.ok(
      source.includes(`case '${action}':`),
      `doPost does not appear to dispatch action "${action}"`
    );
  }
});

test("phase2.6-spec.md section 5: setupPropertyTab(name) exists, callable from the editor and from action_propertyTab_", () => {
  assert.ok(source.includes("function setupPropertyTab(name)"), "setupPropertyTab(name) not found");
  assert.ok(source.includes("function action_propertyTab_("), "action_propertyTab_ not found");
  const anchor = source.indexOf("function action_propertyTab_(");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(body.includes("setupPropertyTab("), "action_propertyTab_ does not call setupPropertyTab");
});

test("setupPropertyTab: old-tab layout (summary / Dennis / Rehab Costs / Utilities), D-006 interest, FILTER lines, typed Sale Price", () => {
  const anchor = source.indexOf("function setupPropertyTab(name)");
  assert.ok(anchor !== -1, "setupPropertyTab not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);

  for (const label of ["Total Project Cost", "Purchase Principal + Interest", "Cash Advance Interest", "Rehab Costs", "Utilities",
    "Profit Breakdown", "Net Profit", "Dennis Share", "Paul Share", "Payouts", "Back to Recast account", "Sale Price (estimate - type it here)"]) {
    assert.ok(body.includes("'" + label + "'"), `summary label "${label}" missing`);
  }
  for (const cls of ["Rehab", "Acquisition", "Holding"]) {
    assert.ok(body.includes("'" + cls + "'"), `cost class "${cls}" not referenced`);
  }
  assert.ok(body.includes("DATEDIF"), "no DATEDIF - D-006 full-month anniversary count is missing");
  assert.ok(body.includes("EDATE"), "no EDATE - D-006 last-anniversary date is missing");
  assert.ok(body.includes("interest_rate_annual"), "does not read Settings!interest_rate_annual (D-016)");
  assert.ok(body.includes("stub_days_basis"), "does not read Settings!stub_days_basis");
  assert.ok(body.includes("FILTER("), "line blocks do not use FILTER over Journal");
  assert.ok(body.includes("insertCheckboxes"), "Paul Paid / Dennis Paid / Recast Account are not checkboxes");
  assert.ok(!body.includes("POST-SALE"), "post-sale block belongs to the Phase 5 closing tab, not the property tab");
  assert.ok(body.includes("Properties!A:F"), "does not read settlement_date (tax proration stops at the sale)");
  assert.ok(body.includes("Properties!A:K,11"), "does not read contract_price (D-017)");
  assert.ok(body.includes("readLabelledValue_(sh, 'Sale Price')"), "a rebuild does not keep the typed Sale Price");
  assert.ok(body.includes("Properties!A:L,12"), "does not read tax_annual (property tax proration)");
  assert.ok(body.includes("DATE(YEAR($B$1),1,1)"), "no Jan-1-to-date proration of tax_annual");
});

test("WRITER_VERSION is 0.4.0", () => {
  assert.match(source, /var WRITER_VERSION = '0\.4\.0';/);
});

test("storeDocument: creates/reuses a root Drive folder, walks nested folder segments, and returns fileId/url/folderUrl", () => {
  assert.ok(source.includes("function action_storeDocument_("), "action_storeDocument_ not found");
  // The body is the unwrapped storeDocument_ (Menu.gs's inboxApprove files in-process through it).
  const anchor = source.indexOf("function storeDocument_(");
  assert.ok(anchor !== -1, "storeDocument_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);

  assert.ok(body.includes("getOrCreateDocsRootFolder_"), "storeDocument does not create/reuse the root folder");
  assert.ok(body.includes("getOrCreateSubfolder_"), "storeDocument does not walk nested folder segments");
  assert.ok(body.includes("Utilities.base64Decode"), "storeDocument does not decode the base64 payload");
  assert.ok(body.includes("createFile"), "storeDocument does not create a Drive file");
  assert.ok(body.includes("fileId:") && body.includes("url:") && body.includes("folderUrl:"),
    "storeDocument response does not include fileId/url/folderUrl");
});

test("the Drive root folder id is cached in Script Properties, separate from SPREADSHEET_ID", () => {
  assert.ok(source.includes("DOCS_ROOT_FOLDER_ID"), "DOCS_ROOT_FOLDER_ID Script Property not found");
  const anchor = source.indexOf("function getOrCreateDocsRootFolder_(");
  assert.ok(anchor !== -1, "getOrCreateDocsRootFolder_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(body.includes("props.getProperty('DOCS_ROOT_FOLDER_ID')"));
  assert.ok(body.includes("props.setProperty('DOCS_ROOT_FOLDER_ID'"));
});

test("read allows the Advances tab", () => {
  const anchor = source.indexOf("function action_read_(");
  assert.ok(anchor !== -1, "action_read_ not found");
  const allowedEnd = source.indexOf("];", anchor);
  const snippet = source.slice(anchor, allowedEnd);
  assert.ok(snippet.includes("'Advances'"), "Advances not in action_read_'s allowed tabs");
});

test("Journal read supports limit up to 20000 and an all:true escape hatch", () => {
  assert.ok(source.includes("20000"), "Journal read limit does not mention 20000");
  assert.ok(source.includes("body.all"), "Journal read does not check body.all");
});

test("upsert allows Advances (key advance_id) and Accounts (key code)", () => {
  const anchor = source.indexOf("function action_upsert_(");
  assert.ok(anchor !== -1, "action_upsert_ not found");
  const allowedEnd = source.indexOf("];", anchor);
  const snippet = source.slice(anchor, allowedEnd);
  assert.ok(snippet.includes("'Advances'"), "Advances not in action_upsert_'s allowed tabs");
  assert.ok(snippet.includes("'Accounts'"), "Accounts not in action_upsert_'s allowed tabs");
});

test("action_postBatch_ dispatches to postBatchEntries_ (phase2.7: Menu.gs's postInterest_ calls the latter directly)", () => {
  const anchor = source.indexOf("function action_postBatch_(");
  assert.ok(anchor !== -1, "action_postBatch_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(body.includes("postBatchEntries_("), "action_postBatch_ does not delegate to postBatchEntries_");
});

test("postBatchEntries_: one lock, validates every entry before writing any row", () => {
  const anchor = source.indexOf("function postBatchEntries_(");
  assert.ok(anchor !== -1, "postBatchEntries_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);

  assert.equal(
    (body.match(/LockService\.getScriptLock\(\)/g) || []).length,
    1,
    "postBatchEntries_ should acquire exactly one lock"
  );
  assert.ok(body.includes("checkEntryForPost_"), "postBatchEntries_ does not validate entries via checkEntryForPost_");
  // Every entry is validated (the forEach below) before the single setValues call
  // that writes rows - i.e. validation happens once, up front, not interleaved with
  // writes entry-by-entry.
  const validateIdx = body.indexOf("checkEntryForPost_(entry");
  const writeIdx = body.indexOf(".setValues(");
  assert.ok(validateIdx !== -1 && writeIdx !== -1 && validateIdx < writeIdx,
    "entries must be validated before any row is written");
});

test("postBatch refuses DUPLICATE, PERIOD_CLOSED, UNBALANCED and MIN_LINES per entry", () => {
  const anchor = source.indexOf("function checkEntryForPost_(");
  assert.ok(anchor !== -1, "checkEntryForPost_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  for (const code of ["DUPLICATE", "PERIOD_CLOSED", "UNBALANCED", "MIN_LINES"]) {
    assert.ok(body.includes(`'${code}'`), `checkEntryForPost_ does not check for ${code}`);
  }
});

test("setup() seeds Bank accounts from the chart's two Cash accounts", () => {
  assert.ok(source.includes("BANK_ACCOUNTS_SEED"), "BANK_ACCOUNTS_SEED not found");
  assert.ok(source.includes("seedIfEmpty_(ss.getSheetByName('Bank accounts'), BANK_ACCOUNTS_SEED)"),
    "setup() does not seed Bank accounts from BANK_ACCOUNTS_SEED");
  assert.ok(source.includes("'1401'") && source.includes("'1402'"),
    "BANK_ACCOUNTS_SEED does not reference both Cash accounts (1401, 1402)");
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
