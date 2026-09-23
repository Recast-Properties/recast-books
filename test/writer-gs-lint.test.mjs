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

test("every private helper called in Code.gs or Menu.gs is declared somewhere in the project", () => {
  // Three times in one session an edit deleted a helper that was still being called, and
  // nothing caught it until Paul clicked the menu and nothing happened. The repo's
  // convention is that a private helper's name ends in an underscore, so every such call
  // must resolve to a declaration in Code.gs, Menu.gs or the generated lib.gs.
  const files = ["Code.gs", "Menu.gs", "lib.gs"].map((f) => readFileSync(new URL(`../apps-script/writer/${f}`, import.meta.url), "utf8"));
  const all = files.join("\n");
  const declared = new Set([
    ...[...all.matchAll(/^\s*function\s+([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]),
    ...[...all.matchAll(/^\s*var\s+([A-Za-z0-9_]+)\s*=\s*function/gm)].map((m) => m[1]),
  ]);
  const missing = new Set();
  for (const src of files.slice(0, 2)) {
    for (const m of src.matchAll(/(?<![.\w])([a-z][A-Za-z0-9]*_)\s*\(/g)) {
      if (!declared.has(m[1])) missing.add(m[1]);
    }
  }
  assert.deepEqual([...missing], [], `called but never declared: ${[...missing].join(", ")}`);
});

test("no function is declared twice in Code.gs or Menu.gs: in Apps Script the last one silently wins", () => {
  for (const file of ["Code.gs", "Menu.gs"]) {
    const src = readFileSync(new URL(`../apps-script/writer/${file}`, import.meta.url), "utf8");
    const names = [...src.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]);
    const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
    assert.deepEqual(dupes, [], `${file} declares these twice: ${dupes.join(", ")}`);
  }
});

test("every function the Recast Books menu names is declared in Menu.gs", () => {
  const menuSrc = readFileSync(new URL("../apps-script/writer/Menu.gs", import.meta.url), "utf8");
  const onOpen = menuSrc.slice(menuSrc.indexOf("function onOpen()"), menuSrc.indexOf("// ---- access control"));
  const named = [...onOpen.matchAll(/addItem\(\s*'[^']*'\s*,\s*'([A-Za-z0-9_]+)'\s*\)/g)].map((m) => m[1]);
  assert.ok(named.length >= 10, `expected the menu to name many handlers, found ${named.length}`);
  const declared = new Set([...menuSrc.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]));
  const missing = named.filter((fn) => !declared.has(fn));
  assert.deepEqual(missing, [], `the menu names handlers Menu.gs does not declare: ${missing.join(", ")}`);
});

test("every writer action (ping, post, void, read, setPeriod, upsert, postBatch, storeDocument, setDocUrl, propertyTab) is dispatched", () => {
  for (const action of ["ping", "post", "void", "read", "setPeriod", "upsert", "postBatch", "storeDocument", "setDocUrl", "propertyTab"]) {
    assert.ok(
      source.includes(`case '${action}':`),
      `doPost does not appear to dispatch action "${action}"`
    );
  }
});

test("phase2.6-spec.md section 5: setupPropertyTab(name) exists, callable from the editor and from action_propertyTab_", () => {
  assert.ok(source.includes("function setupPropertyTab(name, asOf)"), "setupPropertyTab(name) not found");
  assert.ok(source.includes("function action_propertyTab_("), "action_propertyTab_ not found");
  const anchor = source.indexOf("function action_propertyTab_(");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(body.includes("setupPropertyTab("), "action_propertyTab_ does not call setupPropertyTab");
});

// receiptCell_ touches no Apps Script API, so unlike the rest of Code.gs it can actually run
// here: pull it out of the source and check the escaping, which is the part that fails
// silently in a sheet (Paul, 2026-09-23: receipt links on the property tab lines).
const lift = (name, args) => {
  const m = source.match(new RegExp("function " + name + "\\(" + args + "\\) \\{[\\s\\S]*?\\n\\}"));
  assert.ok(m, name + " not found in Code.gs");
  return eval("(" + m[0].replace("function " + name, "function") + ")");
};
const num = (name) => Number(source.match(new RegExp("var " + name + " = (\\d+);"))[1]);
const bodyOf = (fn) => {
  const anchor = source.indexOf("function " + fn + "(");
  const next = source.indexOf("\nfunction ", anchor + 1);
  return source.slice(anchor, next === -1 ? source.length : next);
};

test("receiptCell_: a HYPERLINK when the line has a doc_url, blank when it does not", () => {
  const receiptCell_ = lift("receiptCell_", "docUrl");
  assert.strictEqual(receiptCell_(""), "", "a line with no document leaves the cell empty");
  assert.strictEqual(receiptCell_(null), "", "a missing doc_url must not produce a broken formula");
  assert.strictEqual(receiptCell_("https://drive.google.com/file/d/abc/view"),
    '=HYPERLINK("https://drive.google.com/file/d/abc/view","Receipt")');
  assert.strictEqual(receiptCell_('https://x/1"); BAD("'), '=HYPERLINK("https://x/1); BAD(","Receipt")',
    "quotes in the url must be stripped, never left to close the formula early");
});

// Paul, 2026-09-23, on Granite's settlement rows: "there are no explanations". The rows are
// real and reconcile; they just carry the explanation at entry level, in the memo.
test("lineDescription_: a blank line description falls back to the entry memo, sale prefix trimmed", () => {
  const lineDescription_ = lift("lineDescription_", "description, memo");
  assert.strictEqual(lineDescription_("Landscaping - INV 1372", "anything"), "Landscaping - INV 1372",
    "a line with its own description must keep it");
  assert.strictEqual(lineDescription_("", "1616 Granite sale 2026-07-24: project cost released to COGS"),
    "project cost released to COGS");
  assert.strictEqual(lineDescription_("", "1616 Granite sale 2026-07-24: settlement statement"),
    "settlement statement");
  assert.strictEqual(lineDescription_("", "280 Sparkling sale 2026-08-06 (Recast 50%): project cost released to COGS"),
    "project cost released to COGS", "the co-owned share note is part of the prefix");
  assert.strictEqual(lineDescription_("", "Dennis advance - 1616 Granite"), "Dennis advance - 1616 Granite",
    "a memo that is not a sale memo is shown whole");
  assert.strictEqual(lineDescription_("", ""), "", "nothing to fall back to stays blank");
});

// Paul, 2026-09-23: "i want the property tab frozen ... as it is when the closing tab is
// created. i want to keep it as a record." 1616 Granite and 280 Sparkling were lost to this:
// the sale's release entry nets every formula on the tab to zero. Four things have to hold.
test("a sold property's tab is frozen at closing and nothing writes over it again", () => {
  assert.ok(source.includes("function freezePropertyTab_(ss, name, date)"), "freezePropertyTab_ is gone");
  const freeze = bodyOf("freezePropertyTab_");
  assert.ok(/rng\.setValues\(rng\.getValues\(\)\)/.test(freeze),
    "freezing must replace the formulas with the values they are showing");
  assert.ok(!freeze.includes("clearDataValidations"),
    "the checkboxes stay rendered so the frozen tab still looks like itself");

  // the freeze happens BEFORE the sale posts - after it, every number is already zero
  const sell = menuSource.slice(menuSource.indexOf("function sellPost("));
  const f = sell.indexOf("freezePropertyTab_("), post = sell.indexOf("postBatchEntries_(");
  assert.ok(f !== -1 && post !== -1 && f < post, "sellPost must freeze the tab before it posts the sale");
  assert.ok(/postBatchEntries_\(entries, props, true\)/.test(sell.slice(0, post + 60)),
    "the sale must post with skipRefresh, or the post rewrites the tab it just froze");

  // and nothing rebuilds or refreshes it afterwards
  for (const fn of ["setupPropertyTab", "refreshLineBlocks_"]) {
    assert.ok(/status \|\| ''\)\.toLowerCase\(\) === 'sold'/.test(bodyOf(fn)),
      `${fn} does not leave a sold property's frozen tab alone`);
  }
  assert.ok(/status \|\| ''\)\.toLowerCase\(\) === 'sold'/.test(bodyOf("onPropertyTabEdit")),
    "a hand edit on a frozen tab still fires the void-and-repost trigger");
});

test("selling a property drops it from the postable set at once, not in six hours", () => {
  const sell = menuSource.slice(menuSource.indexOf("function sellPost("), menuSource.indexOf("function sellStatementForTab_"));
  assert.ok(sell.includes("setValue('sold')"), "sellPost no longer marks the property sold");
  assert.ok(/remove\('ctx'\)/.test(sell),
    "sellPost must clear the cached posting ctx - a script write to Properties fires no onEdit, " +
    "so the sold property stays postable for six hours and a receipt can land on a frozen tab");
  const soldAt = sell.indexOf("setValue('sold')"), cleared = sell.indexOf("remove('ctx')");
  assert.ok(cleared > soldAt, "the cache must be cleared after the status is written, not before");
});

// 1616 Granite and 280 Sparkling sold before freezing existed, so their record has to be
// rebuilt from the Journal as it stood the moment before each sale posted.
test("a property that sold before freezing existed can be reconstructed and frozen", () => {
  const body = bodyOf("setupPropertyTab");
  assert.ok(body.includes("if (!asOf && String((registry || {}).status || '').toLowerCase() === 'sold')"),
    "an as-of must bypass the sold guard - reconstructing the record is the one time rebuilding a sold tab is right");
  assert.ok(body.includes("(asOf ? '*' + ne('P', 'sale') : '')"),
    "the reconstruction must drop the sale's own rows, or the release entry zeroes it all over again");
  assert.ok(/asOf \? '=DATE\(/.test(body), "the as-of cell must be pinned to a date, not left on TODAY()");
  for (const fn of ["refreshLineBlocks_", "refreshHeavyBlocks_"]) {
    assert.ok(/\(!asOf \|\| String\(g\(r, 'source'\)\) !== 'sale'\)/.test(bodyOf(fn)),
      `${fn} leaves the sale rows in the reconstructed line blocks`);
  }
  const rebuild = bodyOf("rebuildFrozenRecord");
  assert.ok(rebuild.includes("setupPropertyTab(name, date)"), "it must rebuild as of the settlement date");
  assert.ok(rebuild.indexOf("setupPropertyTab(name, date)") < rebuild.indexOf("freezePropertyTab_(ss, name, date)"),
    "it must freeze AFTER rebuilding, not before");
  assert.ok(rebuild.includes("!== 'sold'"), "it must refuse a property that is still held");
  // the Apps Script Run button passes no arguments, so there has to be a no-arg way in
  const all = bodyOf("rebuildAllFrozenRecords");
  assert.ok(/function rebuildAllFrozenRecords\(\)/.test(source), "rebuildAllFrozenRecords must take no arguments");
  assert.ok(all.includes("rebuildFrozenRecord(name)") && all.includes("'sold'"),
    "it must walk the sold properties and reconstruct each one");
});

test("both line-block refreshers fill a Receipt column", () => {
  for (const fn of ["refreshLineBlocks_", "refreshHeavyBlocks_"]) {
    assert.ok(bodyOf(fn).includes("receiptCell_(g(r, 'doc_url'))"), `${fn} does not fill the Receipt column`);
    assert.ok(bodyOf(fn).includes("lineDescription_(g(r, 'description'), g(r, 'memo'))"),
      `${fn} shows a raw description, so a sale's release lines read as unexplained charges`);
  }
});

// Paul, 2026-09-23: "be careful to not disrupt the spacing columns. you have not accounted
// for those in the past" - audit 61 was exactly that. The spacer is the LAST column of a
// heavy block, so everything about it has to come off PT_HEAVY_COLS, never a literal.
test("the heavy blocks keep their spacer: data columns, then one spacer, then the next block", () => {
  assert.strictEqual(num("PT_HEAVY_COLS"), 5, "Payee, Date, Description, Amount, Receipt");
  assert.ok(source.includes("var PT_HEAVY_STRIDE = PT_HEAVY_COLS + 1;"),
    "the stride must be derived from the data columns, or the spacer gets squeezed out when a column is added");
  assert.ok(bodyOf("refreshHeavyBlocks_").includes("PT_LINES_N, PT_HEAVY_COLS).setValues(out)"),
    "refreshHeavyBlocks_ writes a hardcoded width, so it will spill into the spacer");
  assert.ok(source.includes("sh.setColumnWidth(c0 + PT_HEAVY_COLS, 20)"),
    "the spacer's own width is not derived from PT_HEAVY_COLS");
  assert.ok(!/setColumnWidth\(c0 \+ 4, 20\)/.test(source),
    "c0 + 4 is the Receipt column now - narrowing it to 20px would hide the links");
});

test("the light block offsets agree everywhere: Receipt at c0+4, boxes at PT_BOX_OFFSET, txn_id past them", () => {
  const box = num("PT_BOX_OFFSET"), txn = num("PT_TXN_OFFSET");
  assert.strictEqual(box, 5, "Receipt sits at c0+4, so the first checkbox is c0+5");
  assert.strictEqual(txn, box + 3, "txn_id must follow the three checkbox columns");
  const cols = source.match(/var PT_BLOCK_COLS = \[(\d+), (\d+)\];/);
  assert.strictEqual(Number(cols[2]) - Number(cols[1]), txn + 1,
    "the two blocks must be exactly one block apart (the first block's txn_id is the spacer)");
  // 9 columns written per row, and the sheet wide enough for the second block's last visible one.
  assert.ok(source.includes("PT_LINES_N, 9).setValues(out)"), "refreshLineBlocks_ does not write all 9 columns");
  assert.ok(Number(cols[2]) + box + 2 <= num("WIDTH"), "the grid is too narrow for the Utilities checkboxes");
});

test("setupPropertyTab: old-tab layout (summary / Dennis / Rehab Costs / Utilities), D-006 interest, FILTER lines, typed Sale Price", () => {
  const anchor = source.indexOf("function setupPropertyTab(name, asOf)");
  assert.ok(anchor !== -1, "setupPropertyTab not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);

  for (const label of ["Total Project Cost", "Purchase Principal + Interest", "Cash Advance Interest", "Rehab Costs", "Utilities",
    "Profit Breakdown", "Net Profit", "Dennis Share", "Paul Share", "Payouts", "Back to Recast account", "Sale Price (estimate - type it here)",
    "Concession (type it here)", "Paul Paid (direct)"]) {
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
  // Paul, 2026-09-23: the light tabs get the Ashburne tab's concession cell, and lose the
  // Dennis commission rows - he charges none on a partnership deal.
  assert.ok(body.includes("readLabelledValue_(sh, 'Concession')"), "a rebuild does not keep the typed Concession");
  assert.ok(body.includes("-ABS(B' + concRow + ')"), "Net Profit does not subtract the concession");
  assert.ok(!body.includes("'Less Dennis commission'"), "Paul's payout still deducts a Dennis commission");
  assert.ok(!body.includes("'Due to Paul"), "the Paul payout line was not renamed to 'Paul Paid (direct)'");
  // Paul, 2026-09-23: advances and refunds are their own rows in all three who-paid blocks.
  assert.ok(!body.includes("'Received (advances, refunds)'"), "the who-paid blocks still merge advances and refunds");
  assert.strictEqual(body.split("'Received (advances)'").length - 1, 2, "Received (advances) belongs on the Paul and Recast blocks only");
  assert.strictEqual(body.split("'Received (refunds)'").length - 1, 3, "Received (refunds) is not on all three who-paid blocks");
  assert.ok(body.includes("eq('L', 'Dennis Little')") && body.includes("ne('L', 'Dennis Little')"),
    "the advances/refunds split is not an exhaustive partition on payee");
  assert.ok(body.includes("Properties!A:L,12"), "does not read tax_annual (property tax proration)");
  assert.ok(body.includes("DATE(YEAR($B$1),1,1)"), "no Jan-1-to-date proration of tax_annual");
});

test("refreshHeavyBlocks_ finds a block by its header, and an untraded Holding line lands under Utilities", () => {
  const anchor = source.indexOf("function refreshHeavyBlocks_(");
  assert.ok(anchor !== -1, "refreshHeavyBlocks_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);

  // setupPropertyTab writes the grid and THEN inserts the left spacer column, so a block
  // sits one column right of where it was built. Recomputing the built column here wrote
  // every refresh into the spacer and froze the blocks (2026-09-23).
  assert.ok(body.includes("head.indexOf(blk"), "the block column must be read from the row-4 header");
  assert.ok(!/getRange\(6,\s*\d+\s*\+/.test(body), "a block column is being recomputed instead of read from its header");
  assert.ok(body.includes("'Utilities'"), "an untraded Holding line has no block to fall into");
});

test("the Inbox card translates every gate reason code into a plain-English bullet", () => {
  // Paul, 2026-09-23: the card lists short bullets that name the fix, not reason codes and
  // not a paragraph. A new gate reason with no translation would show as a raw code.
  const inbox = readFileSync(path.join(__dirname, "..", "apps-script", "writer", "Inbox.html"), "utf8");
  const gate = readFileSync(path.join(__dirname, "..", "lib", "gate.mjs"), "utf8");
  const plain = [...gate.matchAll(/push\("([A-Z_0-9]+)"\)/g)].map((m) => m[1]);
  const prefixed = [...gate.matchAll(/`([A-Z_0-9]+):\$\{/g)].map((m) => m[1]);   // ENTRY_INVALID:, DUPLICATE_OF:, POSSIBLE_TWIN:
  assert.ok(plain.length >= 10 && prefixed.length >= 2, "gate reason codes not found - did the push() shape change?");
  for (const code of plain) {
    assert.match(inbox, new RegExp("\\b" + code + ":"), `no bullet text for gate reason ${code}`);
  }
  for (const code of prefixed) {
    assert.ok(inbox.includes("'" + code + "'"), `no bullet text for gate reason ${code}:<value>`);
  }
  assert.ok(!inbox.includes('class="chip"'), "reason codes are being shown raw again");
  assert.ok(inbox.includes("No trade - enter a trade"), "the missing-trade bullet is gone");
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

  assert.ok(body.includes("docsFolderFor_"), "storeDocument does not resolve the folder");
  const fAnchor = source.indexOf("function docsFolderFor_(");
  assert.ok(fAnchor !== -1, "docsFolderFor_ not found");
  const fNext = source.indexOf("\nfunction ", fAnchor + 1);
  const fBody = source.slice(fAnchor, fNext === -1 ? source.length : fNext);
  assert.ok(fBody.includes("getOrCreateDocsRootFolder_"), "folder walk does not create/reuse the root folder");
  assert.ok(fBody.includes("getOrCreateSubfolder_"), "folder walk does not walk nested folder segments");
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
