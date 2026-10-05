// test/writer-gs-lint.test.mjs
//
// Code.gs runs in the Apps Script V8 runtime and can't execute under
// node:test, so this is a text-level lint against the contract in
// docs/phase0-spec.md section 4: setup() is the first function and the only
// hand-run entry point, the file is ASCII-only (pasting into the Apps
// Script editor mangles UTF-8), every tab's header row from the spec
// appears verbatim, every writer action is dispatched, and no column is
// addressed by hardcoded A1 letters. D-056: the two live files hold only what the
// workbook reaches; hand-run scripts live in oneOffScripts.gs (see that file's header).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildEntry, makeCtx } from "../lib/posting.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE_PATH = path.join(__dirname, "..", "apps-script", "writer", "Code.gs");
const MENU_PATH = path.join(__dirname, "..", "apps-script", "writer", "Menu.gs");
const source = readFileSync(CODE_PATH, "utf8");
const menuSource = readFileSync(MENU_PATH, "utf8");
const ONEOFF_PATH = path.join(__dirname, "..", "apps-script", "writer", "oneOffScripts.gs");
const oneOffSource = readFileSync(ONEOFF_PATH, "utf8");

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
    "settlement_date", "template", "dennis_funded", "drive_folder"],   // notes removed 2026-09-30 (Paul)
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

test("every private helper called in Code.gs, Menu.gs or oneOffScripts.gs is declared somewhere in the project", () => {
  // Three times in one session an edit deleted a helper that was still being called, and
  // nothing caught it until Paul clicked the menu and nothing happened. The repo's
  // convention is that a private helper's name ends in an underscore, so every such call
  // must resolve to a declaration in Code.gs, Menu.gs, oneOffScripts.gs or the generated lib.gs.
  const files = ["Code.gs", "Menu.gs", "oneOffScripts.gs", "lib.gs"].map((f) => readFileSync(new URL(`../apps-script/writer/${f}`, import.meta.url), "utf8"));
  const all = files.join("\n");
  const declared = new Set([
    ...[...all.matchAll(/^\s*function\s+([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]),
    ...[...all.matchAll(/^\s*var\s+([A-Za-z0-9_]+)\s*=\s*function/gm)].map((m) => m[1]),
  ]);
  const missing = new Set();
  for (const src of files.slice(0, 3)) {
    for (const m of src.matchAll(/(?<![.\w])([a-z][A-Za-z0-9]*_)\s*\(/g)) {
      if (!declared.has(m[1])) missing.add(m[1]);
    }
  }
  assert.deepEqual([...missing], [], `called but never declared: ${[...missing].join(", ")}`);
});

test("no function is declared twice across Code.gs, Menu.gs and oneOffScripts.gs: in Apps Script the last one silently wins", () => {
  const names = [];
  for (const src of [source, menuSource, oneOffSource]) names.push(...[...src.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]));
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  assert.deepEqual(dupes, [], `declared twice: ${dupes.join(", ")}`);
});

test("oneOffScripts.gs exists, is ASCII-only, its braces balance, and it states the rule", () => {
  assert.ok(oneOffSource.length > 0);
  assert.equal([...oneOffSource].filter((ch) => ch.charCodeAt(0) > 127).length, 0, "non-ASCII in oneOffScripts.gs");
  assert.equal((oneOffSource.match(/\{/g) || []).length, (oneOffSource.match(/\}/g) || []).length, "unbalanced braces");
  assert.ok(/^ \* THE RULE\./m.test(oneOffSource), "the header states the rule");
  // a script carries its STATUS line; the file is emptied once its scripts have run (Paul, 2026-09-30)
  if (/^function /m.test(oneOffSource)) assert.ok(/^\/\/ STATUS: /m.test(oneOffSource), "each script carries a STATUS line");
});

// D-056 (Paul, 2026-09-28: "get organized"): Code.gs and Menu.gs hold only what the workbook
// reaches - the menu, its dialogs, the onEdit trigger, the /exec endpoint - plus the standing
// setup tools. Anything run by hand from the editor lives in oneOffScripts.gs, and the live
// files never call into it. Comments are stripped first, so a mention is not a reach.
test("D-056: every function in Code.gs and Menu.gs is reached from the workbook, and neither calls into oneOffScripts.gs", () => {
  const strip = (f) => f.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const defs = {};
  for (const [file, src] of [["Code.gs", source], ["Menu.gs", menuSource], ["oneOffScripts.gs", oneOffSource]]) {
    const clean = strip(src);
    const starts = [...clean.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)];
    starts.forEach((m, i) => { defs[m[1]] = { file, body: clean.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : clean.length) }; });
  }
  const dir = path.join(__dirname, "..", "apps-script", "writer");
  const html = readdirSync(dir).filter((f) => f.endsWith(".html")).map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
  const entries = new Set([
    "onOpen", "doGet", "doPost", "onPropertyTabEdit", "refreshBalanceSheetHourly",   // Apps Script itself calls these (triggers)
    "setup", "installTriggers", "setupTotals", "rebuildAllPropertyTabs", "selfTest",   // the standing setup tools (README)
    ...[...html.matchAll(/callServer_\(\s*'([A-Za-z0-9_]+)'/g)].map((m) => m[1]),                        // the dialogs
    ...[...html.matchAll(/<\?!?=?\s*([A-Za-z0-9_]+)\s*\(/g)].map((m) => m[1]),                            // template scriptlets (include_)
    ...[...menuSource.matchAll(/addItem\(\s*'[^']*'\s*,\s*'([A-Za-z0-9_]+)'\s*\)/g)].map((m) => m[1]),   // the menu
  ]);
  const reached = new Set(), queue = [...entries];
  while (queue.length) {
    const n = queue.shift();
    if (reached.has(n) || !defs[n]) continue;
    reached.add(n);
    for (const m of Object.keys(defs)) if (!reached.has(m) && new RegExp("\\b" + m + "\\s*\\(").test(defs[n].body)) queue.push(m);
  }
  const stranded = Object.keys(defs).filter((n) => defs[n].file !== "oneOffScripts.gs" && !reached.has(n));
  assert.deepEqual(stranded, [], `nothing in the workbook reaches these - move them to oneOffScripts.gs: ${stranded.join(", ")}`);
  const live = strip(source + "\n" + menuSource);
  const leaked = Object.keys(defs).filter((n) => defs[n].file === "oneOffScripts.gs" && new RegExp("\\b" + n + "\\s*\\(").test(live));
  assert.deepEqual(leaked, [], `Code.gs or Menu.gs calls into oneOffScripts.gs: ${leaked.join(", ")}`);
  assert.ok(entries.size > 40 && Object.keys(defs).length > 150, "the walk found the menu, the dialogs and the functions");
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

test("every writer action (ping, post, void, read, setPeriod, upsert, postBatch, storeDocument, setDocUrl, propertyTab, feedUpdate) is dispatched", () => {
  for (const action of ["ping", "post", "void", "read", "setPeriod", "upsert", "postBatch", "storeDocument", "setDocUrl", "propertyTab", "feedUpdate"]) {
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
  const re = new RegExp("function " + name + "\\(" + args + "\\) \\{[\\s\\S]*?\\n\\}");
  const m = [source, menuSource, oneOffSource].map((f) => f.match(re)).find(Boolean);
  assert.ok(m, name + " not found in Code.gs, Menu.gs or oneOffScripts.gs");
  return eval("(" + m[0].replace("function " + name, "function") + ")");
};
const num = (name) => Number(source.match(new RegExp("var " + name + " = (\\d+);"))[1]);
const bodyOf = (fn) => {
  const src = [source, menuSource, oneOffSource].find((f) => f.includes("function " + fn + "(")) || source;
  const anchor = src.indexOf("function " + fn + "(");
  const next = src.indexOf("\nfunction ", anchor + 1);
  return src.slice(anchor, next === -1 ? src.length : next);
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

  // a sold house's record is named "<house> - Frozen": looking its plain name up first would create an empty tab
  const setup = bodyOf("setupPropertyTab");
  const soldReturn = setup.indexOf("return { ok: true, frozen: true, rows: 0 }"), firstSheet = setup.indexOf("getOrCreateSheet_(");
  assert.ok(soldReturn !== -1 && firstSheet !== -1 && soldReturn < firstSheet,
    "setupPropertyTab must return for a sold house before any getOrCreateSheet_, or it leaves an empty tab named after the house");
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
test("a sold property's tab can be reconstructed as of its sale (setupPropertyTab with an as-of)", () => {
  const body = bodyOf("setupPropertyTab");
  assert.ok(body.includes("if (!asOf && String((registry || {}).status || '').toLowerCase() === 'sold')"),
    "an as-of must bypass the sold guard - reconstructing the record is the one time rebuilding a sold tab is right");
  // Paul, 2026-10-01: the record is frozen when the closing is RUN, not on the closing day - so the reconstruction
  // drops the sale's own rows and has NO date cut-off (Granite's three bills dated after 07-24 were in its payout);
  // only a held tab stops at its as-of date.
  assert.ok(body.includes("(asOf ? '*' + ne('P', 'sale') : '*(' + J('C') + '<=$B$1)')"),
    "the reconstruction must drop the sale's own rows and keep every other bill whatever its date");
  assert.ok(/asOf \? '=DATE\(/.test(body), "the as-of cell must be pinned to a date, not left on TODAY()");
  for (const fn of ["refreshLineBlocks_", "refreshHeavyBlocks_"]) {
    assert.ok(bodyOf(fn).includes("(asOf ? String(g(r, 'source')) !== 'sale' : formatIsoDate_(g(r, 'date')) <= today)"),
      `${fn}: the reconstructed line blocks must leave out the sale rows and no bill for its date`);
  }
});

// The duplicate that reached 1616 Granite landed on a different property AND a different
// account than the migrated rows it duplicated (audit 65), so neither may enter the key.
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
  assert.ok(body.includes("propLookup_(safeName, 'settlement_date')"), "does not read settlement_date (tax proration stops at the sale)");
  assert.ok(body.includes("propLookup_(safeName, 'contract_price')"), "does not read contract_price (D-017)");
  assert.ok(!/VLOOKUP\([^)]*Properties!/.test(source), "a Properties cell is found by its header, never a column count (2026-09-30)");
  assert.ok(body.includes("readLabelledValue_(sh, 'Sale Price')"), "a rebuild does not keep the typed Sale Price");
  // Paul, 2026-09-23: the light tabs get the Ashburne tab's concession cell, and lose the
  // Dennis commission rows - he charges none on a partnership deal.
  assert.ok(body.includes("readLabelledValue_(sh, 'Concession')"), "a rebuild does not keep the typed Concession");
  assert.ok(body.includes("-ABS(B' + concRow + ')"), "Net Profit does not subtract the concession");
  assert.ok(!body.includes("'Less Dennis commission'"), "Paul's payout still deducts a Dennis commission");
  // D-054: on the heavy tab the tax paid is in Rehab Total; its own line in Total Project Cost counted it twice.
  assert.ok(!body.includes("'Property Tax Paid'"), "the heavy Total Project Cost counts the tax on top of the draws that paid it");
  // Paul, 2026-09-28: the heavy All-in also counts what he spent beyond the draws (the house's 2030 balance), inside the SUM.
  const paidByPaul = body.indexOf("'Paid by Paul (not yet paid back)'"), allInSum = body.indexOf("set(hTotal, 2, '=SUM(B' + hFirst");
  assert.ok(paidByPaul > 0 && allInSum > paidByPaul, "the heavy Total Project Cost misses 'Paid by Paul (not yet paid back)'");
  assert.ok(/'Paid by Paul \(not yet paid back\)'\); set\(s, 2, '=-' \+ net\(eq\('E', '2030'\)\)\)/.test(body), "Paid by Paul must be the house's 2030 balance, credits less debits");
  assert.ok(!body.includes("'Due to Paul"), "the Paul payout line was not renamed to 'Paul Paid (direct)'");
  // Paul, 2026-09-23: advances and refunds are their own rows in all three who-paid blocks.
  assert.ok(!body.includes("'Received (advances, refunds)'"), "the who-paid blocks still merge advances and refunds");
  assert.strictEqual(body.split("'Received (advances)'").length - 1, 2, "Received (advances) belongs on the Paul and Recast blocks only");
  assert.strictEqual(body.split("'Received (refunds)'").length - 1, 3, "Received (refunds) is not on all three who-paid blocks");
  assert.ok(body.includes("eq('L', 'Dennis Little')") && body.includes("ne('L', 'Dennis Little')"),
    "the advances/refunds split is not an exhaustive partition on payee");
  assert.ok(body.includes("propLookup_(safeName, 'tax_annual')"), "does not read tax_annual (property tax proration)");
  assert.ok(body.includes("DATE(YEAR($B$1),1,1)"), "no Jan-1-to-date proration of tax_annual");
});

// D-080 (2026-10-04): the house tabs and the closing tabs added up Journal rows 2 to 5,000 with the Journal
// at 3,500 rows - past the bound every total would have come up short with no error. One range that follows
// the Journal (journalRange_); no formula in the live files may name a Journal row again. Totals keeps its own
// INDIRECT bound, which says "JOURNAL PAST ROW ..." on the tab when it is passed.
test("D-080: every Journal range on a house tab or a closing tab follows the Journal - none has a typed last row", () => {
  // a range built with a column joined in ('Journal!$' + col + '$2:$' + ...) is read as its literal form
  const flatten = (src) => src.replace(/'\s*\+\s*[A-Za-z_$][\w$]*\s*\+\s*'/g, "X");
  const fixedRows = (src) => flatten(src).match(/(?<!INDIRECT\(")Journal!\$?[A-Z]{1,3}\$?\d+/g) || [];
  assert.deepEqual(fixedRows(source + "\n" + menuSource), [], "a Journal range with a typed row is back - use journalRange_(col)");
  // the lint itself: both ways the old bound was written are caught
  assert.equal(fixedRows("var J = function (col) { return 'Journal!$' + col + '$2:$' + col + '$' + N; };").length, 1);
  assert.equal(fixedRows("'=SUMIF(Journal!$K$2:$K$5000,\"x\",Journal!$F$2:$F$5000)'").length, 2);
  assert.ok(source.includes("return 'INDEX(Journal!$' + col + ':$' + col + ',2):INDEX(Journal!$' + col + ':$' + col + ',' + JOURNAL_LAST + ')';"),
    "journalRange_ is row 2 to the Journal's last row (JOURNAL_LAST)");
  for (const fn of ["setupPropertyTab", "writeSimpleClosingTab_", "writeClosingTab_", "ensureJournalHelpers_"]) {
    const at = source.indexOf("function " + fn + "("), end = source.indexOf("\nfunction ", at + 1);
    assert.ok(at !== -1 && source.slice(at, end === -1 ? source.length : end).includes("journalRange_"), fn + " does not use journalRange_");
  }
  // the voided flag ends on the same row as every range, or SUMPRODUCT's arrays stop agreeing
  assert.ok(source.includes(`var JOURNAL_VOIDED = "INDEX('" + HELPER_SHEET + "'!$A:$A,2):INDEX('" + HELPER_SHEET + "'!$A:$A," + JOURNAL_LAST + ")";`));
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

test("the Inbox card: each line is Approve, Returned or Dismiss, and the card says in plain dollars where the receipt goes", () => {
  // 2026-09-26: "Part is on the books already" read as "this is a duplicate", and one Returned button for the whole
  // card "defeats the purpose of itemizing". The card's own functions, run on Home Depot 01-11.
  const inbox = readFileSync(path.join(__dirname, "..", "apps-script", "writer", "Inbox.html"), "utf8");
  const style = readFileSync(path.join(__dirname, "..", "apps-script", "writer", "Style.html"), "utf8");
  const grab = (s, head) => {
    const a = s.indexOf(head);
    assert.ok(a !== -1, `${head} not found`);
    let i = s.indexOf("{", a), depth = 0;
    do { if (s[i] === "{") depth++; else if (s[i] === "}") depth--; i++; } while (depth);
    return s.slice(a, i);
  };
  const names = ["money_", "acctGroup_", "acctName_", "flagText_", "needsTrade_", "itemProperty_", "mismatchFlags_", "itemsSum_",
    "decisionOf_", "approvedOnly_", "sortByDecision_", "needsPurpose_", "partlyText_", "flagsList_", "totalsLine_"];
  const card = new Function([
    "var EDIT = {}, DATA = { pickers: { accounts: [{ code: '1030', name: 'Rehab - materials' }] } };",
    grab(style, "function escapeHtml_("), inbox.match(/var ACCT_GROUPS = .*;/)[0], inbox.match(/var TRADELESS_ACCOUNTS = [^;]*;/)[0],
    grab(inbox, "var GATE_TEXT = ") + ";", grab(inbox, "var DECISIONS = ") + ";", ...names.map((n) => grab(inbox, `function ${n}(`)),
    "return { flagsList_, totalsLine_, sortByDecision_, EDIT };",
  ].join("\n"))();

  const gate = { reasons: ["NOT_POST_VERDICT", "PARTLY_ON_BOOKS"], already_posted_cents: 15479 };
  const pack = (cents, description, decision, reason) => ({ account: "1030", amount_cents: cents, description, trade: "Supplies", decision, reason });
  const both = [{ property: "104 Ashburne", items: [pack(995, "GRK 3/8 x 12"), pack(589, "GRK 3/8 x 8")] }];
  const env = { docId: "d", model: { receipt_total_cents: 17063 }, gate };
  assert.match(card.flagsList_(gate, both), /\$154\.79 of this receipt is already in the books\. The items below \(\$15\.84\) never got recorded - on each one click Approve \(you kept it\), Returned \(it went back to the store\) or Dismiss/);
  card.EDIT.d = both;
  assert.match(card.totalsLine_(env), /class="totals ok">Receipt \$170\.63: \$154\.79 already in the books \+ \$15\.84 to record now</);

  // One pack went back, one was personal: nothing to record, both in the note, every dollar accounted for.
  const mixed = [{ property: "104 Ashburne", items: [pack(995, "GRK 3/8 x 12", "returned"), pack(589, "GRK 3/8 x 8", "dismiss", "personal")] }];
  card.EDIT.d = mixed;
  assert.match(card.totalsLine_(env), /class="totals ok">Receipt \$170\.63: \$154\.79 already in the books \+ \$0\.00 to record now \+ \$9\.95 returned \+ \$5\.89 dismissed</);
  const sorted = card.sortByDecision_(mixed);
  assert.deepEqual(sorted.keep, []);
  assert.equal(sorted.note, "Returned ($9.95): GRK 3/8 x 12 | Dismissed ($5.89): GRK 3/8 x 8 - personal");

  // Approve one, return one: only the kept line is posted, stripped of the choice fields.
  const one = card.sortByDecision_([{ property: "104 Ashburne", items: [pack(995, "GRK 3/8 x 12", "returned"), pack(589, "GRK 3/8 x 8")] }]);
  assert.equal(one.keep.length, 1);
  assert.deepEqual(one.keep[0].items.map((it) => [it.amount_cents, it.decision, it.reason]), [[589, undefined, undefined]]);
  assert.equal(one.note, "Returned ($9.95): GRK 3/8 x 12");
  assert.ok(inbox.includes("callServer_('inboxApprove', { docId: env.docId, entries: toPost, model: env.model || {}, note: sorted.note, feed: env.feed || null, supersedes: swap ? swap.txn_id : null })"),
    "Save posts the kept lines with the note");

  // A meal line needs its who-and-why only while it is kept (HD 03-02's water).
  const water = (decision) => [{ property: "OVERHEAD", items: [{ account: "6710", amount_cents: 258, description: "Dasani", decision }] }];
  const meal = /Meal or gift - type who it was with/;
  assert.match(card.flagsList_({ reasons: ["NEEDS_HUMAN_274D"] }, water()), meal);
  assert.doesNotMatch(card.flagsList_({ reasons: ["NEEDS_HUMAN_274D"] }, water("dismiss")), meal);

  card.EDIT.n = [{ property: "104 Ashburne", items: [{ account: "1030", amount_cents: 4500, trade: "Paint" }] }];
  assert.match(card.totalsLine_({ docId: "n", model: { receipt_total_cents: 4500 }, gate: { reasons: [] } }), /Receipt \$45\.00: \$45\.00 to record now</);
  assert.match(card.flagsList_({ reasons: [] }, [{ property: "OVERHEAD", items: [{ account: "1030", amount_cents: 100 }] }]), /Rehab - materials is a house cost - pick which house/);
  for (const jargon of [/Entries \$/, /does not match/, /on the books already/, /entry/i]) {
    assert.ok(!jargon.test(card.flagsList_(gate, both) + card.totalsLine_(env)), `jargon on the card: ${jargon}`);
  }
  for (const gone of ["data-approve", "data-returned", "data-rm"]) assert.ok(!inbox.includes(gone), `the whole-card ${gone} button is back`);
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
  assert.ok(inbox.includes("Pick a trade (the kind of work) for each house item"), "the missing-trade bullet is gone");
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

// D-052, Paul 2026-09-28: "anything labeled Draw was cash into one of my personal accounts";
// an advance named for a worker is money Dennis paid that worker directly.
test("an advance's paid_to: Paul and Vendor sit on 2030, a purchase on 1000, and the Add advance dialog asks", () => {
  const map = source.match(/var ADVANCE_PAID_TO = (\{[^}]*\});/);
  assert.ok(map, "ADVANCE_PAID_TO is gone");
  const paidTo = eval("(" + map[1] + ")");
  assert.deepStrictEqual([paidTo.Paul, paidTo.Vendor, paidTo.Seller], ["2030", "2030", "1000"],
    "Paul and Vendor both sit on 2030 (D-032); a purchase on 1000");
  const dialog = readFileSync(path.join(__dirname, "..", "apps-script", "writer", "Advance.html"), "utf8");
  assert.ok(dialog.includes("id=\"a-paid-to\"") && dialog.includes("paid_to: document.getElementById('a-paid-to').value"),
    "the Add advance dialog asks who the money was paid to");
});

// The editor's re-read loop (oneOffScripts.gs): the Inbox's own Reprocess route, which can only hold (D-049).
// 2026-09-28 13:06: the first replay run posted three pre-cutover documents on top of their migrated rows.
test("Feed tab (Phase 3): the spec's columns, feed_id kept as text, the tab readable and imported_at a timestamp", () => {
  const start = source.indexOf("'Feed': [");
  const feed = source.slice(start, source.indexOf("]", start) + 1);
  for (const h of ["feed_id", "account", "date", "amount", "name", "memo", "status", "txn_id", "match_note", "source_file", "imported_at", "card"]) {
    assert.ok(feed.includes(`'${h}'`), `Feed header ${h}`);
  }
  assert.match(source, /var TEXT_COLUMNS = \[[^\]]*'feed_id'/);
  assert.match(source, /'Settings', 'Users', 'Journal', 'Advances', 'Feed'\];\n  if \(allowed\.indexOf\(tab\) === -1\) fail_\('BAD_TAB'/);
  assert.match(source, /h === 'imported_at'\) timestampCols\[i\] = true/);
});

test("importStatement: parses with lib.gs's parseOfx, one lock, dedupes on the bank's id, keeps only the last four of the account, lands lines unmatched", () => {
  const menu = readFileSync(new URL("../apps-script/writer/Menu.gs", import.meta.url), "utf8");
  assert.match(menu, /addItem\('Import statement\.\.\.', 'showImportDialog'\)/);
  const at = menu.indexOf("function importStatement(");
  assert.ok(at > 0, "importStatement declared");
  const fn = menu.slice(at, menu.indexOf("\n}\n", at) + 3);
  assert.match(fn, /parseOfx\(text\)/);
  assert.equal((fn.match(/LockService\.getScriptLock\(\)/g) || []).length, 1);
  assert.match(fn, /if \(seen\[l\.fitid\]\) return;/);
  assert.match(fn, /replace\(\/\\d\{5,\}\/g/, "the file name's account number is masked");
  assert.match(fn, /status: 'unmatched'/);
  assert.match(fn, /a\.last4\.indexOf\(parsed\.account_last4\)/);
  assert.ok(existsSync(new URL("../apps-script/writer/Import.html", import.meta.url)), "Import.html exists");
});

test("feedUpdate: one lock, the three verdict columns read once and written once, a missing feed_id reported; the menu has Match statement lines", () => {
  assert.match(source, /function action_feedUpdate_\([\s\S]*?return jsonOutput_\(feedUpdateRows_\(openWorkbook_\(props\), rows\)\);/);
  const at = source.indexOf("function feedUpdateRows_(");
  assert.ok(at > 0, "feedUpdateRows_ declared");
  const fn = source.slice(at, source.indexOf("\n}\n", at) + 3);
  assert.equal((fn.match(/LockService\.getScriptLock\(\)/g) || []).length, 1);
  assert.equal((fn.match(/\.getValues\(\)/g) || []).length, 3, "the feed_id column, the three-column block, and the card column when a card came");
  assert.equal((fn.match(/\.setValues\(/g) || []).length, 2);
  assert.match(fn, /if \(carded\.length\) \{[\s\S]*cols\['card'\]/, "the card column is touched only when a row brings a card");
  assert.ok(fn.indexOf("lock.releaseLock()") < fn.indexOf("refreshBankSheets_(ss)"), "the bank's tab is rebuilt after the lock is given back");
  const refresh = gsFn(source, "refreshBankSheets_");
  assert.match(refresh, /^function refreshBankSheets_\(ss\) \{\n  try \{/, "a tab that cannot be rebuilt never fails the bank line's write");
  assert.match(refresh, /bankSheetRows\(feed, journal, account\)/);
  assert.match(menuSource, /addItem\('Bank sheet', 'showBankSheet'\)/);
  assert.match(fn, /cols\['txn_id'\] !== cols\['status'\] \+ 1/);
  assert.match(fn, /missing\.push/);
  const menu = readFileSync(new URL("../apps-script/writer/Menu.gs", import.meta.url), "utf8");
  assert.match(menu, /addItem\('Match statement lines\.\.\.', 'matchStatementLines'\)/);
  const m = menu.slice(menu.indexOf("function matchStatementLines("));
  assert.match(m, /siteFetchJson_\('\/api\/feed-match', 'post'/);
  assert.match(m, /!== 'unmatched'\) return;/, "only open lines are counted");
  // Paul was shown the machine's own error (2026-09-29, a 529): a failed run is said in plain words, the raw text last
  const failure = new Function(menu.slice(menu.indexOf("function matchFailure_("), menu.indexOf("\n}\n", menu.indexOf("function matchFailure_(")) + 3) + " return matchFailure_;")();
  assert.equal(failure('The Anthropic API call failed (batch 1): 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'),
    'The bookkeeper was too busy to answer just now. Nothing was changed. Wait a minute or two, then run Match statement lines again.\n\nPaste to Claude: The Anthropic API call failed (batch 1): 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}');
  assert.match(failure("FEED_HEADERS: the Feed tab needs feed_id"), /^The matching stopped before it finished\. Nothing was recorded in your books\. Tell Claude\.\n\nPaste to Claude: FEED_HEADERS/);
  assert.equal(failure(""), "The matching stopped before it finished. Nothing was recorded in your books. Tell Claude.");
  assert.doesNotMatch(m.slice(0, m.indexOf("function matchFailure_")), /ui\.alert\('Matching [a-z ]+', String\(/, "the raw error is shown to Paul again");
  // Paul, 2026-09-29: two banks now - he is asked by the bank's name, a click, never an account code to type.
  const mm = m.slice(0, m.indexOf("function feedMatchSummary_"));
  assert.doesNotMatch(mm, /ui\.prompt\(/, "Match statement lines asks Paul to type something");
  assert.match(mm, /names\[a\.code\] = a\.name/, "the banks are named from the Bank accounts tab");
  // The picking loop, run: one bank -> no question; two -> Yes picks the first, No then Yes the second, closing the box stops.
  const loop = mm.slice(mm.indexOf("var label ="), mm.indexOf("var rest ="));
  const pickBank = (accounts, answers) => new Function("accounts", "counts", "names", "ui",
    loop.replace("if (!account) return;", "").replace(/else if \(pick !== ui\.Button\.NO\) return;/, "else if (pick !== ui.Button.NO) return 'closed';") + " return account;")(
    accounts, { 1401: 12, 1402: 1 }, { 1401: "Citizens", 1402: "Chase" },
    { Button: { YES: "Y", NO: "N" }, ButtonSet: {}, asked: [], alert(t, msg) { this.asked.push(msg); return answers.shift(); } });
  assert.equal(pickBank(["1401"], []), "1401");
  assert.equal(pickBank(["1401", "1402"], ["Y"]), "1401");
  assert.equal(pickBank(["1401", "1402"], ["N", "Y"]), "1402");
  assert.equal(pickBank(["1401", "1402"], ["N", "N"]), null);
  assert.equal(pickBank(["1401", "1402"], ["X"]), "closed");
  assert.doesNotMatch(m.slice(0, m.indexOf("function feedMatchSummary_")), /postEntry_|postBatchEntries_/, "a match never posts from the workbook");
  // The sheet's Inbox ties a bank-line card's rows itself, in-process, on approve and on dismiss.
  assert.match(menu.slice(menu.indexOf("function inboxApprove(")), /tieFeedRows_\(ss, req\.feed, 'matched', txnIds/);
  assert.match(menu.slice(menu.indexOf("function inboxDismiss(")), /tieFeedRows_\(ss, req\.feed, 'unmatched', \[\], 'Paul: ' \+ req\.note\)/, "a dismissed bank line goes back to the next run with Paul's words");
  const html = readFileSync(new URL("../apps-script/writer/Inbox.html", import.meta.url), "utf8");
  assert.equal((html.match(/feed: env\.feed \|\| null/g) || []).length, 3, "approve and both dismiss paths send the card's feed rows");
  const inbox = readFileSync(new URL("../netlify/functions/books-inbox.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(inbox, /await tieFeedRows\(|feedUpdate\(/, "no synchronous site handler waits on the writer");
});

test("the Inbox card born from bank lines gets its own flags (feedFlags_) on both call sites", () => {
  const html = readFileSync(new URL("../apps-script/writer/Inbox.html", import.meta.url), "utf8");
  assert.match(html, /function feedFlags_\(entries, why\)/);
  assert.match(html, /if \(env && env\.source === 'feed'\) return feedFlags_\(entries, why\);/);
  assert.equal((html.match(/flagsList_\([^)]*, env\)/g) || []).length, 2, "both call sites pass the envelope");
});

test("the Inbox has two tabs: a bank-line card is on Bank statement, everything else on Receipts", () => {
  // Paul, 2026-09-29: the bank statement's questions apart from the unresolved receipts.
  const html = readFileSync(new URL("../apps-script/writer/Inbox.html", import.meta.url), "utf8");
  const tabOf = new Function(html.match(/function tabOf_\(env\) \{[^}]*\}/)[0] + " return tabOf_;")();
  assert.equal(tabOf({ source: "feed" }), "bank");
  assert.equal(tabOf({ source: "gmail" }), "receipts");
  assert.equal(tabOf({}), "receipts");
  for (const t of ["receipts", "bank"]) assert.ok(html.includes(`data-tab="${t}"`), `no ${t} tab button`);
  assert.equal((html.match(/data-tab="' \+ tabOf_\(env\) \+ '"/g) || []).length, 2, "the open and the closed card both carry their tab");
  assert.match(html, /c\.dataset\.tab === TAB &&/, "the list shows only the open tab's cards");
});

// ---- D-057: a charge waiting on its receipt ----------------------------------------------------
const gsFn = (src, name) => {
  const a = src.indexOf(`function ${name}(`);
  assert.ok(a !== -1, `${name} not found`);
  return src.slice(a, src.indexOf("\n}\n", a) + 3);
};
// A sheet as the two functions below read it: a header row and rows, 1-based like Apps Script.
const fakeSheet = (headers, rows) => ({
  getLastRow: () => rows.length + 1,
  getLastColumn: () => headers.length,
  getRange: (r, c, n = 1, w = 1) => ({ getValues: () => rows.slice(r - 2, r - 2 + n).map((row) => row.slice(c - 1, c - 1 + w)) }),
});
const headerIndexOf = (headers) => Object.fromEntries(headers.map((h, i) => [h, i + 1]));

test("D-057 feedRetie: the bank lines tied to a placeholder move to the entries that replaced it, and only those lines", () => {
  assert.match(source, /case 'feedRetie': return action_feedRetie_\(body, props\);/);
  const headers = ["feed_id", "account", "status", "txn_id", "match_note"];
  const rows = [["F1", "1401", "matched", "receipt-wait", "Recorded from the Inbox"], ["F2", "1401", "matched", "receipt-other", "x"],
    ["F3", "1401", "matched", "receipt-a, receipt-wait", "two entries on one line"], ["F4", "1401", "unmatched", "", ""]];
  const written = [];
  const retie = new Function("headerIndex_", "feedUpdateRows_", gsFn(source, "feedRetieRows_") + " return feedRetieRows_;")(
    () => headerIndexOf(headers), (ss, r) => { written.push(...r); return { ok: true, updated: r.length, missing: [] }; });
  const ss = { getSheetByName: () => fakeSheet(headers, rows) };
  assert.deepEqual(retie(ss, "receipt-wait", ["receipt-new1", "receipt-new2"], "The receipt came in"), { ok: true, updated: 2, missing: [] });
  assert.deepEqual(written, [
    { feed_id: "F1", status: "matched", txn_id: "receipt-new1, receipt-new2", match_note: "The receipt came in" },
    { feed_id: "F3", status: "matched", txn_id: "receipt-a, receipt-new1, receipt-new2", match_note: "The receipt came in" },
  ]);
  written.length = 0;
  assert.deepEqual(retie(ss, "receipt-nowhere", ["x"], ""), { ok: true, updated: 0, missing: [] });
  assert.deepEqual(written, [], "nothing tied to it, nothing written");
  // D-058: replaced for another amount - nothing explains the bank line any more, so it goes back to the next matching run
  retie(ss, "receipt-wait", [], "replaced for another amount");
  assert.deepEqual(written, [
    { feed_id: "F1", status: "unmatched", txn_id: "", match_note: "replaced for another amount" },
    { feed_id: "F3", status: "unmatched", txn_id: "", match_note: "replaced for another amount" },
  ]);
  assert.match(source, /if \(!body\.from_txn_id \|\| !Array\.isArray\(body\.to_txn_ids\)\) fail_/, "an empty list is a real answer");
});

test("D-057, D-058 replacedEntry_: a placeholder's receipt must be that charge (same amount, same account); an earlier copy may differ in amount; what is not in the books is refused", () => {
  const headers = ["txn_id", "date", "account", "debit", "credit", "paid_from", "description", "void_of"];
  const journal = (extra = []) => [
    ["receipt-wait", "2026-09-28", "1030", 162.91, "", "1401", "NEED RECEIPT FROM DENNIS", ""],
    ["receipt-wait", "2026-09-28", "1401", "", 162.91, "1401", "", ""],
    ["receipt-plain", "2026-09-20", "1030", 12, "", "1401", "screws", ""],
    ["receipt-plain", "2026-09-20", "1401", "", 12, "1401", "", ""], ...extra];
  const swapWith = (rows) => new Function("headerIndex_", "findAllRowsByValue_", "formatIsoDate_", "toCents", "bankAccountsLast4_", "NEED_RECEIPT", "Utilities",
    gsFn(menuSource, "replacedEntry_") + " return replacedEntry_;")(
    () => headerIndexOf(headers),
    (sh, col, v) => rows.map((r, i) => (String(r[col - 1]) === String(v) ? i + 2 : 0)).filter(Boolean),
    (d) => String(d), (n) => Math.round(n * 100), () => [{ code: "1401", name: "Cash - Citizens shared" }], "NEED RECEIPT FROM",
    { formatDate: () => "2026-09-29" });
  const ss = (rows) => ({ getSheetByName: () => fakeSheet(headers, rows) });
  const receipt = (cents, paid_from = "1401") => [{ paid_from, items: [{ amount_cents: cents - 1000 }, { amount_cents: 1000 }] }];

  const live = journal();
  assert.deepEqual(swapWith(live)(ss(live), "receipt-wait", receipt(16291)), { txn_id: "receipt-wait", date: "2026-09-28", voided: false, placeholder: true, same: true });
  assert.match(swapWith(live)(ss(live), "receipt-wait", receipt(17000)).refuse, /adds up to \$170\.00 but the charge you were waiting on is \$162\.91/);
  assert.match(swapWith(live)(ss(live), "receipt-wait", receipt(16291, "PAUL")).refuse, /was paid from Cash - Citizens shared/);
  // D-058, an earlier copy: taken out today; another amount (the tip) or another payer is no reason to refuse
  assert.deepEqual(swapWith(live)(ss(live), "receipt-plain", receipt(1500, "PAUL")), { txn_id: "receipt-plain", date: "2026-09-29", voided: false, placeholder: false, same: false });
  assert.equal(swapWith(live)(ss(live), "receipt-plain", receipt(1200)).same, true);
  assert.match(swapWith(live)(ss(live), "receipt-gone", receipt(1200)).refuse, /is not in the books\. Untick the yellow box/);
  // a Save that died after the placeholder was taken out: clicked again, it only posts
  const voided = journal([["void-receipt-wait", "2026-09-28", "1030", "", 162.91, "1401", "NEED RECEIPT FROM DENNIS", "receipt-wait"]]);
  assert.equal(swapWith(voided)(ss(voided), "receipt-wait", receipt(16291)).voided, true);
  for (const r of ["refuse: 'This receipt adds up", "refuse: 'The charge you were waiting on was paid", "refuse: 'What this card was meant to replace"]) {
    assert.ok(menuSource.includes(r), "a refusal lost its plain words");
  }
  assert.doesNotMatch(gsFn(menuSource, "replacedEntry_"), /' \+ paidFrom \+ '/, "an account code in Paul's sentence");
});

test("D-057, D-058 inboxApprove: refused before anything is marked, the old entry voided before the post, its bank lines moved (same amount) or freed after", () => {
  const fn = gsFn(menuSource, "inboxApprove");
  const at = (s) => { const i = fn.indexOf(s); assert.ok(i !== -1, `${s} not in inboxApprove`); return i; };
  const order = ["replacedEntry_(ss, String(req.supersedes), entries)", "if (swap && swap.refuse) return", "action: 'mark-posted'",
    "voidEntry_(swap.txn_id, (swap.placeholder ? 'replaced by its receipt ' : 'superseded by ') + docId, swap.date, postedBy, props, true)",
    "postBatchEntries_(built, props, true)", "feedRetieRows_(ss, swap.txn_id, swap.same ? txnIds : [],"].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(fn, /if \(swap && !swap\.voided\) \{ voidEntry_/, "an entry already taken out is not voided twice");
});

test("D-057 the Inbox card: Waiting on receipt makes the one placeholder line; the swap box sends the placeholder with Save", async () => {
  const { NEED_RECEIPT } = await import("../lib/gate.mjs");
  const inbox = readFileSync(path.join(__dirname, "..", "apps-script", "writer", "Inbox.html"), "utf8");
  const poller = readFileSync(path.join(__dirname, "..", "apps-script", "poller", "Code.gs"), "utf8");
  assert.ok(inbox.includes(`var NEED_RECEIPT = '${NEED_RECEIPT}';`), "the card's words for a placeholder drifted from lib/gate.mjs");
  const bullet = "if (head === 'PLACEHOLDER_WAITING') return 'This looks like a receipt you were waiting on - check the yellow box below, then Save';";
  assert.ok(inbox.includes(bullet) && poller.includes(bullet), "the card and the 3 AM email say it the same way");

  const grab = (head) => { const a = inbox.indexOf(head); let i = inbox.indexOf("{", a), d = 0; do { if (inbox[i] === "{") d++; else if (inbox[i] === "}") d--; i++; } while (d); return inbox.slice(a, i); };
  const card = new Function(["var SWAP = {}, EDIT = {};", `var NEED_RECEIPT = '${NEED_RECEIPT}';`, ...["isWaiting_", "bankLines_", "placeholderEntries_", "moneyOut_", "swapCandidate_", "swapOf_"].map((n) => grab(`function ${n}(`)),
    "return { isWaiting_, bankLines_, placeholderEntries_, moneyOut_, swapCandidate_, swapOf_, SWAP };"].join("\n"))();
  // cards as code makes them (lib/feed-match.mjs), so the card's own text is the real thing
  const { applyVerdicts } = await import("../lib/feed-match.mjs");
  const { ACCOUNTS } = await import("../lib/coa.mjs");
  const bankLine = (feed_id, amount_cents, name) => ({ feed_id, date: "2026-09-28", amount_cents, name, memo: name });
  const made = applyVerdicts({
    // a card of several lines still happens - a match the books could not back up is asked about as one (D-060 splits only what the read ASKED together)
    verdicts: [{ kind: "match", feed_ids: ["F1", "F2", "F3"], txn_ids: [], entry: null, note: "three runs" }, { kind: "question", feed_ids: ["F4"], txn_ids: [], entry: null, note: "What was it?" },
      { kind: "question", feed_ids: ["F5", "F6"], txn_ids: [], entry: null, note: "A purchase and its refund?" }, { kind: "question", feed_ids: ["F7"], txn_ids: [], entry: null, note: "Big one" }],
    lines: [bankLine("F1", -16291, "Home Depot Waxahachie"), bankLine("F2", -3307, "Home Depot Waxahachie"), bankLine("F3", -14109, "Home Depot Waxahachie"), bankLine("F4", -265, "Target Waxahachie"),
      bankLine("F5", -5409, "Home Depot Waxahachie"), bankLine("F6", 5409, "Refund 1315 HWY 77 NORTH WAXA"), bankLine("F7", -119640, "408 S ROGERS STREET WAXAHACHI")],
    candidates: [], account: "1401", accountName: "Recast Citizens - Shared",
    ctx: makeCtx({ accounts: new Map(ACCOUNTS.map((a) => [a.code, a])), properties: new Set(["469 Brushwood"]), periods: new Map(), today: "2026-09-29" }), settings: {}, now: "2026-09-29T16:00:00Z",
  }).envelopes;
  const [three, env, mixed, big] = made;
  assert.deepEqual(card.bankLines_(three), [{ date: "2026-09-28", amount_cents: -16291, name: "Home Depot Waxahachie" }, { date: "2026-09-28", amount_cents: -3307, name: "Home Depot Waxahachie" }, { date: "2026-09-28", amount_cents: -14109, name: "Home Depot Waxahachie" }]);
  assert.deepEqual(card.bankLines_(big), [{ date: "2026-09-28", amount_cents: -119640, name: "408 S ROGERS STREET WAXAHACHI" }], "over a thousand dollars");

  // THREE charges on one card are three placeholders, never one lump of $337.07 - each receipt finds its own by the amount
  const entries = card.placeholderEntries_(three, "Dennis", "469 Brushwood");
  assert.deepEqual(entries.map((e) => [e.date, e.payee, e.property, e.paid_from, e.items.length, e.items[0].amount_cents, e.items[0].description]), [
    ["2026-09-28", "Home Depot Waxahachie", "469 Brushwood", "1401", 1, 16291, "NEED RECEIPT FROM DENNIS"],
    ["2026-09-28", "Home Depot Waxahachie", "469 Brushwood", "1401", 1, 3307, "NEED RECEIPT FROM DENNIS"],
    ["2026-09-28", "Home Depot Waxahachie", "469 Brushwood", "1401", 1, 14109, "NEED RECEIPT FROM DENNIS"],
  ]);
  const [entry] = card.placeholderEntries_(env, "Dennis", "469 Brushwood");
  assert.deepEqual(entry, { date: "2026-09-28", payee: "Target Waxahachie", memo: "recorded from the bank statement - the receipt has not come in", property: "469 Brushwood", paid_from: "1401",
    items: [{ account: "1030", amount_cents: 265, description: "NEED RECEIPT FROM DENNIS", trade: "Waiting on receipt", business_purpose: "", property: "469 Brushwood" }] });
  // they post through the same engine as any purchase, each the whole amount on the house, each its own entry
  const ctx29 = makeCtx({ properties: new Set(["469 Brushwood"]), periods: new Map([["2026-09", "open"]]), today: "2026-09-29" });
  const built = entries.map((e) => buildEntry({ type: "purchase", ...e, source: "receipt", posted_by: "paul" }, ctx29));
  assert.deepEqual(built.map((b) => b.lines.map((l) => [l.account, l.debit, l.credit])), [[["1030", 16291, 0], ["1401", 0, 16291]], [["1030", 3307, 0], ["1401", 0, 3307]], [["1030", 14109, 0], ["1401", 0, 14109]]]);
  assert.equal(new Set(built.map((b) => b.txn_id)).size, 3, "three entries, three ids");
  assert.equal(built[0].lines[0].description, "NEED RECEIPT FROM DENNIS");

  assert.equal(card.isWaiting_(entries), true);
  assert.equal(card.isWaiting_([{ items: [{ description: "screws" }] }]), false);
  assert.equal(card.moneyOut_(three), true);
  assert.equal(card.moneyOut_(mixed), false, "a purchase and its refund on one card: no button");
  assert.equal(card.placeholderEntries_(mixed, "Dennis", "469 Brushwood"), null);
  // a card whose text and lines disagree is never split by guesswork - and never lumped
  assert.equal(card.bankLines_({ ...three, bodyText: three.bodyText.replace("-33.07", "-33.70") }), null, "the lines do not add up to the card");
  assert.equal(card.bankLines_({ ...three, bodyText: "Bank lines" }), null);
  assert.equal(card.placeholderEntries_({ ...three, bodyText: "" }, "Dennis", "469 Brushwood"), null);
  assert.equal(card.moneyOut_({ feed: { amount_cents: 500000, feed_ids: ["F9"] }, bodyText: "Bank line on X (1401):\n2026-08-06  5000.00  XFER FROM ACCT", model: { receipt_total_cents: 500000 } }), false, "a deposit is never a purchase");
  // a card made before 2026-09-29 has no signed amount on it: the lines must add up to the card's total
  const older = { ...env, feed: { account: "1401", feed_ids: ["F4"] } };
  assert.equal(card.moneyOut_(older), true);
  assert.equal(card.placeholderEntries_(older, "Paul", "")[0].items[0].description, "NEED RECEIPT FROM PAUL");
  assert.ok(inbox.includes("if (!made) return showMsg_(msg, false, 'The bank lines on this card could not be read one by one, so nothing was changed. Tell Claude.');"));

  const p = { txn_id: "receipt-wait", paid_from: "1401" };
  assert.equal(card.swapOf_({ docId: "gm-1", source: "email", gate: { placeholder: p } }), p);
  assert.equal(card.swapOf_({ docId: "gm-1", source: "feed", gate: { placeholder: p } }), null, "a bank statement card replaces nothing");
  card.SWAP["gm-1"] = false;
  assert.equal(card.swapOf_({ docId: "gm-1", source: "email", gate: { placeholder: p } }), null, "Paul unticked it: a different purchase");
  assert.equal(card.swapCandidate_({ docId: "gm-1", source: "email", gate: { placeholder: p } }), p, "the box stays on the card so he can tick it again");

  // D-058: a held card whose read names an earlier copy - Save takes that one out
  const old = { txn_id: "receipt-untipped", date: "2026-09-12", payee: "Uber", property: "", paid_from: "PAUL", total_cents: 2500 };
  assert.deepEqual(card.swapOf_({ docId: "gm-2", source: "email", model: { supersedes: "receipt-untipped" }, gate: { replaces: old } }),
    { txn_id: "receipt-untipped", earlier: true, payee: "Uber", date: "2026-09-12", total_cents: 2500, property: "" });
  // a card read before the gate reported it: the id is all there is
  assert.deepEqual(card.swapOf_({ docId: "gm-3", source: "email", model: { supersedes: "receipt-untipped" }, gate: { reasons: [] } }),
    { txn_id: "receipt-untipped", earlier: true, payee: undefined, date: undefined, total_cents: undefined, property: undefined });
  assert.equal(card.swapOf_({ docId: "gm-4", source: "email", model: { supersedes: null }, gate: {} }), null);
  assert.ok(inbox.includes("if (swap && !swap.earlier) toPost.forEach(function (e) { e.paid_from = swap.paid_from; });"), "only a placeholder's bank line settles who paid");
  assert.ok(inbox.includes("var swapping = !!(env && swapOf_(env) && !swapOf_(env).earlier);"), "an earlier copy never hides 'Who paid?'");

  // the yellow box, in Paul's words, for each kind of card
  const style = readFileSync(path.join(__dirname, "..", "apps-script", "writer", "Style.html"), "utf8");
  const grabIn = (src, head) => { const a = src.indexOf(head); let i = src.indexOf("{", a), d = 0; do { if (src[i] === "{") d++; else if (src[i] === "}") d--; i++; } while (d); return src.slice(a, i); };
  const box = new Function(["var SWAP = {}, EDIT = {}, WAITING_ON = ['Dennis', 'Paul'];", `var NEED_RECEIPT = '${NEED_RECEIPT}';`, grabIn(style, "function escapeHtml_("),
    ...["money_", "opt_", "isWaiting_", "bankLines_", "moneyOut_", "swapCandidate_", "waitHtml_"].map((n) => grabIn(inbox, `function ${n}(`)), "return { waitHtml_, SWAP };"].join("\n"))();
  const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(text(box.waitHtml_({ ...env, feed: { ...env.feed, card: null } })), "No receipt yet? Waiting on Dennis Paul Waiting on receipt");
  // D-059: the bank's daily email named the card - the box starts on its holder
  assert.match(box.waitHtml_({ ...env, feed: { ...env.feed, card: { last4: "5450", holder: "Paul" } } }), /<option value="Paul" selected>Paul<\/option>/);
  assert.doesNotMatch(box.waitHtml_({ ...env, feed: { ...env.feed, card: null } }), / selected>/, "no card known: nothing is picked for him, the list starts on Dennis");
  assert.ok(inbox.includes("escapeHtml_(env.feed.card.holder) + (env.feed.card.last4 ? '\\'s card (' + escapeHtml_(env.feed.card.last4) + ')' : ' paid')"), "the card's top line says whose card paid");
  // Paul, 2026-09-29: who paid after every bank card's name in the list - the email's card, the Feed tab's, or Unknown
  assert.ok(inbox.includes("if (env.source === 'feed') title += ' - ' + ((env.feed && env.feed.card && env.feed.card.holder) || 'Unknown');"));
  assert.match(menuSource, /feedCardsOnto_\(ss, envelopes\)/);
  assert.equal(box.waitHtml_(mixed), "", "a refund among the lines: no button");
  assert.equal(text(box.waitHtml_({ docId: "gm-1", source: "email", gate: { placeholder: { txn_id: "receipt-wait", payee: "THE HOME DEPOT #6505 W", date: "2026-09-28", total_cents: 16291, property: "469 Brushwood", paid_from: "1401" } } })),
    "This is the receipt I was waiting for: THE HOME DEPOT #6505 W, 09-28, $162.91, on 469 Brushwood. Save puts this receipt in its place - it is not counted twice. Untick if this is a different purchase.");
  assert.equal(text(box.waitHtml_({ docId: "gm-2", source: "email", model: { supersedes: "receipt-untipped" }, gate: { replaces: old } })),
    "This replaces one already in the books: Uber, 09-12, $25.00. Save takes the old one out - it is not counted twice. Untick if this is a separate purchase.");
  assert.equal(text(box.waitHtml_({ docId: "gm-3", source: "email", model: { supersedes: "receipt-untipped" }, gate: {} })),
    "This replaces one already in the books. Save takes the old one out - it is not counted twice. Untick if this is a separate purchase. receipt-untipped");
  assert.equal(box.waitHtml_({ docId: "gm-4", source: "email", model: {}, gate: {} }), "", "an ordinary receipt has no box");
  box.SWAP["gm-2"] = false;
  assert.match(box.waitHtml_({ docId: "gm-2", source: "email", model: { supersedes: "receipt-untipped" }, gate: { replaces: old } }), /data-swap="1"> /, "unticked, the box is still there");
  assert.ok(inbox.includes("bodyText: waiting ? '' : env.bodyText || ''"), "a placeholder would get a Receipt link to the bank line's text");
});

test("a bank statement card speaks of the bank, not a receipt; a question is not called a purchase; a match that needs nothing says so", () => {
  const inbox = readFileSync(path.join(__dirname, "..", "apps-script", "writer", "Inbox.html"), "utf8");
  const style = readFileSync(path.join(__dirname, "..", "apps-script", "writer", "Style.html"), "utf8");
  const grabIn = (src, head) => { const a = src.indexOf(head); let i = src.indexOf("{", a), d = 0; do { if (src[i] === "{") d++; else if (src[i] === "}") d--; i++; } while (d); return src.slice(a, i); };
  const card = new Function(["var EDIT = {}, DATA = { pickers: { accounts: [] } };", "var NEED_RECEIPT = 'NEED RECEIPT FROM';", grabIn(style, "function escapeHtml_("),
    inbox.match(/var ACCT_GROUPS = .*;/)[0], grabIn(inbox, "var DECISIONS = ") + ";",
    ...["money_", "acctGroup_", "acctName_", "itemProperty_", "mismatchFlags_", "decisionOf_", "approvedOnly_", "sortByDecision_", "plainWhy_", "isWaiting_", "feedFlags_", "totalsLine_"].map((n) => grabIn(inbox, `function ${n}(`)),
    "return { feedFlags_, totalsLine_, EDIT };"].join("\n"))();
  const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // the blank line every empty card carries is not a proposal (2026-09-29: a question card read "Claude thinks this bank line is a purchase")
  const blank = [{ property: "", items: [{ account: "", amount_cents: 0, description: "", trade: "" }] }];
  assert.match(text(card.feedFlags_(blank, "What was it?")), /^What was it\? A purchase\? Fill in the line below and Save\./);
  const proposed = [{ property: "366 Mesa", items: [{ account: "1030", amount_cents: 9067, description: "Home Depot supplies", trade: "Supplies" }] }];
  assert.match(text(card.feedFlags_(proposed, "Home Depot supplies.")), /Claude thinks this bank line is a purchase/);

  const env = { docId: "feed-1", source: "feed", model: { receipt_total_cents: 9067, entries: [] }, gate: {} };
  card.EDIT["feed-1"] = blank;
  assert.equal(text(card.totalsLine_(env)), "The bank shows $90.67: nothing is filled in yet");
  card.EDIT["feed-1"] = proposed;
  assert.equal(text(card.totalsLine_(env)), "The bank shows $90.67: $90.67 to record now");
  card.EDIT["gm-1"] = proposed;
  assert.equal(text(card.totalsLine_({ docId: "gm-1", source: "email", model: { receipt_total_cents: 9067, entries: proposed }, gate: {} })), "Receipt $90.67: $90.67 to record now");

  const summary = new Function(menuSource.slice(menuSource.indexOf("function feedMatchSummary_("), menuSource.indexOf("\n}\n", menuSource.indexOf("function feedMatchSummary_(")) + 3) + " return feedMatchSummary_;")();
  assert.equal(summary({ total: 3, matched: 1, cards: 0, later: 2, none: 0 }).split("\n")[2], "None need your word.");
  assert.equal(summary({ total: 8, matched: 1, cards: 5, later: 2, none: 0 }).split("\n")[2], "5 need your word - they are in the Inbox (Recast Books -> Inbox..., the Bank statement tab).");
});
