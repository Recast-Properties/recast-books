/****************************************************************
 * Recast Books Writer
 *
 * Standalone Apps Script web app. The only thing that writes the
 * "Recast Books" workbook. Every POST carries a shared secret
 * (Script Property WRITER_SECRET) in the JSON body. See
 * ../../docs/phase0-spec.md section 4 for the contract this file
 * implements.
 *
 * Setup: run setup() once from the editor (see README.md), then
 * deploy as a web app (execute as: me, access: anyone).
 *
 * ASCII ONLY below - this file gets pasted into the Apps Script
 * editor and non-ASCII bytes get mangled in transit.
 ****************************************************************/

function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss = openOrCreateWorkbook_(props);
  adoptDocsRootFolder_(props);
  installTriggers();

  TAB_ORDER.forEach(function (name) {
    var sheet = getOrCreateSheet_(ss, name);
    ensureHeaders_(sheet, TAB_HEADERS[name]);
    forceTextColumns_(sheet, TAB_HEADERS[name]);
  });

  seedIfEmpty_(ss.getSheetByName('Accounts'), ACCOUNTS_SEED);
  ensureSeedRows_(ss.getSheetByName('Accounts'), ACCOUNTS_SEED); // a code added to the chart later (1520, D-018) reaches a live tab too
  seedIfEmpty_(ss.getSheetByName('Settings'), SETTINGS_SEED);
  seedIfEmpty_(ss.getSheetByName('Users'), [
    ['paul@recast-properties.com', 'owner', 'Paul', new Date()]
  ]);

  var periodRows = generatePeriods_().map(function (p) {
    return [p, 'open', '', '', ''];
  });
  seedIfEmpty_(ss.getSheetByName('Periods'), periodRows);

  // v0.2.0: seed Bank accounts (if empty) from the chart's two Cash accounts, so a
  // fresh workbook has a working paid_from list before Paul adds real bank rows.
  seedIfEmpty_(ss.getSheetByName('Bank accounts'), BANK_ACCOUNTS_SEED);

  // Sheets auto-converts text like "2026-09" into a date. Repair any period cells
  // that were converted before the columns were forced to plain text.
  repairPeriodCells_(ss.getSheetByName('Periods'));
  repairPeriodCells_(ss.getSheetByName('Journal'));

  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  var secret = props.getProperty('WRITER_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('WRITER_SECRET', secret);
  }

  warmCache_(); // the site's Accounts/Settings snapshots pick up seed rows now, not at the next 15-min warm
  Logger.log('Recast Books workbook: ' + ss.getUrl());
  Logger.log('WRITER_SECRET: ' + secret);
}

// ---- web app entry points ----------------------------------------------

function doGet(e) {
  return jsonOutput_({ ok: true, service: 'recast-books-writer', version: WRITER_VERSION });
}

function doPost(e) {
  try {
    var bodyText = (e && e.postData && e.postData.contents) ? String(e.postData.contents) : '';
    var body;
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch (parseErr) {
      return jsonOutput_({ ok: false, error: 'BAD_JSON', message: 'Request body is not valid JSON' });
    }

    var props = PropertiesService.getScriptProperties();
    var expected = props.getProperty('WRITER_SECRET');
    if (!expected || body.secret !== expected) {
      return jsonOutput_({ ok: false, error: 'UNAUTHORIZED' });
    }

    switch (body.action) {
      case 'ping': return action_ping_(props);
      case 'post': return action_post_(body, props);
      case 'void': return action_void_(body, props);
      case 'read': return action_read_(body, props);
      case 'setPeriod': return action_setPeriod_(body, props);
      case 'upsert': return action_upsert_(body, props);
      case 'postBatch': return action_postBatch_(body, props);
      case 'storeDocument': return action_storeDocument_(body, props);
      case 'propertyTab': return action_propertyTab_(body, props);
      default: return jsonOutput_({ ok: false, error: 'BAD_ACTION' });
    }
  } catch (err) {
    var code = (err && err.code) ? err.code : 'INTERNAL';
    var out = { ok: false, error: code, message: String(err && err.message ? err.message : err) };
    // postBatch failures name the failing txn_id alongside its code (phase1-spec.md
    // section 3); action_postBatch_ attaches it to the thrown error when present.
    if (err && err.txn_id) out.txn_id = err.txn_id;
    return jsonOutput_(out);
  }
}

// ---- config ---------------------------------------------------------------

var WRITER_VERSION = '0.4.0';
var WORKBOOK_NAME = 'Recast Books';
// phase2-spec.md section 7: the Drive root folder every filed document lives under.
// Same name as the workbook (Paul's own naming choice) but a different resource -
// a Drive folder, not the spreadsheet - so its id is stored under its own Script
// Property (DOCS_ROOT_FOLDER_ID), separate from SPREADSHEET_ID.
var DOCS_ROOT_FOLDER_NAME = WORKBOOK_NAME;

// Tabs created (in this order) by setup(). Headers match phase0-spec.md
// section 4 verbatim for every tab that section spells out; Trips and Feed
// are headers-only per that section and their columns are drawn from
// BUILD-PLAN.md section 4's prose description (not spelled out as a header
// list in the spec - see README/report note).
var TAB_ORDER = [
  'Journal', 'Accounts', 'Properties', 'Bank accounts', 'Vendors',
  'Advances', 'Periods', 'Settings', 'Users', 'Trips', 'Feed'
];

var TAB_HEADERS = {
  'Journal': ['txn_id', 'line', 'date', 'period', 'account', 'debit', 'credit',
    'property', 'cost_class', 'tax_treatment', 'trade', 'payee', 'description',
    'paid_from', 'doc_url', 'source', 'posted_by', 'posted_at', 'memo',
    'reconciled_ref', 'business_purpose', 'attendee', 'destination', 'odometer',
    'void_of'],
  'Accounts': ['code', 'name', 'series', 'type', 'cost_class', 'tax_treatment',
    'active', 'notes'],
  'Properties': ['name', 'address', 'status', 'purchase_date', 'purchase_price',
    'settlement_date', 'template', 'dennis_funded', 'drive_folder', 'notes', 'contract_price',
    'tax_annual', 'dennis_share_pct', 'dennis_commission_pct'],
  'Bank accounts': ['code', 'name', 'institution', 'last4', 'plaid_item_id',
    'plaid_account_id', 'opening_balance', 'opening_date', 'active'],
  'Vendors': ['canonical', 'aliases', 'entity_type', 'form_1099', 'tin_status',
    'w9_url', 'default_account', 'notes'],
  'Advances': ['advance_id', 'date', 'amount', 'property', 'source_txn_id',
    'status', 'accrued_to', 'repaid_date', 'notes', 'kind', 'rate_pct'],
  'Periods': ['period', 'status', 'closed_at', 'snapshot_url', 'notes'],
  'Settings': ['key', 'value', 'notes'],
  'Users': ['email', 'role', 'name', 'added_at'],
  // Phase 1/3, headers only - column names inferred from BUILD-PLAN.md
  // section 4's prose ("Date, from, to, miles, purpose, property").
  'Trips': ['date', 'from', 'to', 'miles', 'purpose', 'property'],
  // Phase 1/3, headers only - column names inferred from BUILD-PLAN.md
  // section 4's prose ("id, account, date, amount, name, merchant,
  // match status, txn_id").
  'Feed': ['id', 'account', 'date', 'amount', 'name', 'merchant',
    'match_status', 'txn_id']
};

// Chart of accounts seed, spec section 6 (2026-09-11 changes), columns in
// Accounts header order: code, name, series, type, cost_class, tax_treatment,
// active, notes. Account names use a plain hyphen where the spec's source
// text uses an em dash - see README/report note (ASCII-only constraint).
var ACCOUNTS_SEED = [
  ['1000', 'Purchase price', '1000', 'asset', 'Acquisition', 'Inventory (held)', true, ''],
  ['1010', 'Acquisition costs', '1000', 'asset', 'Acquisition', 'Inventory (held)', true, ''],
  ['1020', 'Rehab - subcontract labor', '1000', 'asset', 'Rehab', 'Inventory (held)', true, ''],
  ['1030', 'Rehab - materials', '1000', 'asset', 'Rehab', 'Inventory (held)', true, ''],
  ['1040', 'Rehab - fixtures & appliances', '1000', 'asset', 'Rehab', 'Inventory (held)', true, ''],
  ['1050', 'Permits & inspections', '1000', 'asset', 'Rehab', 'Inventory (held)', true, ''],
  ['1060', 'Debris & haul-off', '1000', 'asset', 'Rehab', 'Inventory (held)', true, ''],
  ['1100', 'Holding - property tax', '1000', 'asset', 'Holding', 'Inventory (held)', true, ''],
  ['1110', 'Holding - insurance', '1000', 'asset', 'Holding', 'Inventory (held)', true, ''],
  ['1120', 'Holding - utilities', '1000', 'asset', 'Holding', 'Inventory (held)', true, ''],
  ['1130', 'Holding - HOA & grounds', '1000', 'asset', 'Holding', 'Inventory (held)', true, ''],
  ['1200', 'Financing - interest (Dennis)', '1000', 'asset', 'Financing', 'Inventory (held)', true, ''],
  ['1210', 'Financing - points & fees', '1000', 'asset', 'Financing', 'Inventory (held)', true, ''],
  ['1220', 'Profit participation - Dennis', '1000', 'asset', 'Financing', 'Inventory (held)', true, ''],
  ['1300', 'Selling - commission', '1000', 'asset', 'Selling', 'Inventory (held)', true, ''],
  ['1310', 'Selling - closing costs', '1000', 'asset', 'Selling', 'Inventory (held)', true, ''],
  ['1320', 'Selling - concessions & credits', '1000', 'asset', 'Selling', 'Inventory (held)', true, ''],
  ['1330', 'Selling - staging & marketing', '1000', 'asset', 'Selling', 'Inventory (held)', true, ''],
  ['1401', 'Cash - Citizens shared', '1400', 'asset', '', '', true, ''],
  ['1402', 'Cash - Chase operating', '1400', 'asset', '', '', true, ''],
  ['1500', 'Earnest money & deposits', '1400', 'asset', '', '', true, ''],
  ['1510', 'Escrow & holdbacks receivable', '1400', 'asset', '', '', true, ''],
  ['1520', 'Prepaid API credits', '1400', 'asset', '', '', true, 'D-018: Anthropic top-ups; drawn down monthly by /api/api-costs'],
  ['2000', 'Accrued interest - Dennis', '2000', 'liability', '', '', true, ''],
  ['2010', 'Note payable - Dennis', '2000', 'liability', '', '', true, ''],
  ['2020', 'Backup withholding payable', '2000', 'liability', '', '', true, ''],
  ['2030', 'Due to owner (Paul)', '2000', 'liability', '', '', true, ''],
  ['4000', 'Property sale proceeds', '4000', 'income', '', '', true, ''],
  ['4010', 'Wholesale assignment fees', '4000', 'income', '', '', true, ''],
  ['4020', 'Escrow holdback released', '4000', 'income', '', '', true, ''],
  ['4030', 'Other income', '4000', 'income', '', '', true, ''],
  ['5000', 'COGS - property released', '5000', 'cogs', '', 'COGS (released)', true, ''],
  ['5010', 'COGS - wholesale', '5000', 'cogs', '', 'COGS (released)', true, ''],
  ['6000', 'Advertising & signage', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6010', 'Lead generation', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6100', 'Contract labor - non-property', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6200', 'Legal & professional', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6210', 'Accounting & bookkeeping', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6300', 'Data & research', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6350', 'Abandoned deal costs', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6400', 'Software & subscriptions', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6410', 'Website & hosting', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6500', 'Office supplies & postage', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6510', 'Small tools & equipment', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6600', 'Vehicle (actual)', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6610', 'Tolls & parking', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6700', 'Travel', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6710', 'Meals (50%)', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6720', 'Business gifts', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6800', 'Insurance - entity', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6900', 'Taxes & licenses', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6910', 'Bank & merchant fees', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6920', 'Dues & education', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['6930', 'Interest - other', '6000', 'expense', 'Overhead', 'Expense', true, ''],
  ['7000', 'Depreciable assets', '7000', 'asset', '', 'Fixed asset', true, ''],
  ['9000', 'Owner contributions', '9000', 'equity', '', 'Owner equity', true, ''],
  ['9010', 'Owner draws & distributions', '9000', 'equity', '', 'Owner equity', true, '']
];

// Settings seed, spec section 4.
var SETTINGS_SEED = [
  ['autofile_ceiling_cents', '50000', ''],
  ['threshold_1099_2026', '200000', ''],
  ['threshold_1099_prior', '60000', ''],
  ['estimate_agent_pct', '3', ''],
  ['estimate_closing_pct', '2', ''],
  ['interest_rate_annual', '0.08', 'D-016: 8% per Dennis\'s own calculation'],
  ['stub_days_basis', '30', ''],
  ['dealer_status', 'unknown', ''],
  ['cash_or_accrual', 'unknown', ''],
  ['de_minimis_elected', 'unknown', ''],
  ['tax_home', 'unknown', ''],
  ['api_cost_account:Recast Books', '6210', 'D-018: account for this Anthropic workspace\'s usage'],
  ['api_cost_account:Receipts (old site)', '6210', 'D-018'],
  ['api_cost_account:Title Search', '6300', 'D-018'],
  ['api_cost_account:Default', '6400', 'D-018']
];

// Bank accounts seed, phase1-spec.md section 3: the chart's two Cash accounts, so
// paid_from has somewhere to point before Paul adds real bank rows. Columns in
// Bank accounts header order: code, name, institution, last4, plaid_item_id,
// plaid_account_id, opening_balance, opening_date, active.
var BANK_ACCOUNTS_SEED = [
  ['1401', 'Cash - Citizens shared', 'Citizens National Bank of Texas', '', '', '', 0, '', true],
  ['1402', 'Cash - Chase operating', 'Chase', '', '', '', 0, '', true]
];

// ---- setup helpers ----------------------------------------------------------

// phase2.7-spec.md section 2: a container-bound project (the workbook's own
// Extensions > Apps Script) always uses its own container - never creates or
// opens a different workbook - and remembers its id so the rest of this file
// (which reads SPREADSHEET_ID directly in a few places) stays consistent.
function openOrCreateWorkbook_(props) {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    if (props.getProperty('SPREADSHEET_ID') !== active.getId()) props.setProperty('SPREADSHEET_ID', active.getId());
    return active;
  }
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create(WORKBOOK_NAME);
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

// setup() only: adopt the Drive folder documents already file into (phase2-spec.md
// section 7) rather than letting the first storeDocument call create a second one
// under the same name. Exactly one match or this throws - ambiguity would split
// filing across two folders silently.
function adoptDocsRootFolder_(props) {
  if (props.getProperty('DOCS_ROOT_FOLDER_ID')) return;
  var found = DriveApp.getFoldersByName(DOCS_ROOT_FOLDER_NAME);
  var matches = [];
  while (found.hasNext()) matches.push(found.next());
  if (matches.length !== 1) {
    fail_('AMBIGUOUS_DOCS_ROOT', 'Expected exactly one Drive folder named "' + DOCS_ROOT_FOLDER_NAME +
      '", found ' + matches.length + '. Set DOCS_ROOT_FOLDER_ID in Script Properties by hand.');
  }
  props.setProperty('DOCS_ROOT_FOLDER_ID', matches[0].getId());
}

function getOrCreateSheet_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

// Columns that hold codes or period keys must never be auto-converted to numbers
// or dates by Sheets ("2026-09" -> a date, "1000" -> a number). Plain-text format
// applied to the whole column below the header.
var TEXT_COLUMNS = ['period', 'txn_id', 'code', 'account', 'paid_from', 'void_of',
  'default_account', 'key', 'value', 'last4'];

function forceTextColumns_(sheet, headers) {
  var maxRows = sheet.getMaxRows();
  if (maxRows < 2) return;
  headers.forEach(function (h, i) {
    if (TEXT_COLUMNS.indexOf(h) !== -1) {
      sheet.getRange(2, i + 1, maxRows - 1, 1).setNumberFormat('@');
    }
  });
}

// A period cell that Sheets turned into a Date is written back as "yyyy-MM" text.
function repairPeriodCells_(sheet) {
  if (!sheet) return;
  var cols = headerIndex_(sheet);
  var col = cols['period'];
  var lastRow = sheet.getLastRow();
  if (!col || lastRow < 2) return;
  var range = sheet.getRange(2, col, lastRow - 1, 1);
  var values = range.getValues();
  var changed = false;
  var fixed = values.map(function (r) {
    var v = r[0];
    if (v instanceof Date) { changed = true; return [normalizePeriod_(v)]; }
    return [v];
  });
  if (changed) {
    range.setNumberFormat('@');
    range.setValues(fixed);
  }
}

// "2026-09" whether the cell holds text or a Date.
function normalizePeriod_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Chicago', 'yyyy-MM');
  return String(v || '').slice(0, 7);
}

// Appends any seed row whose first-column key is missing from the sheet; existing rows
// are never touched. seedIfEmpty_ alone left 1520 (D-018) out of the live Accounts tab,
// and the bookkeeper's correct 1520 proposal was refused as BAD_ACCOUNT (2026-09-16).
function ensureSeedRows_(sheet, rows) {
  var last = sheet.getLastRow();
  var have = {};
  if (last >= 2) sheet.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { have[String(r[0])] = true; });
  var missing = rows.filter(function (r) { return !have[String(r[0])]; });
  if (missing.length) sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, missing[0].length).setValues(missing);
  return missing.length;
}

function seedIfEmpty_(sheet, rows) {
  if (!sheet || !rows || rows.length === 0) return;
  if (sheet.getLastRow() > 1) return; // already seeded (or edited) - no-op
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function generatePeriods_() {
  var tz = 'America/Chicago';
  var endParts = Utilities.formatDate(new Date(), tz, 'yyyy-MM').split('-');
  var endY = parseInt(endParts[0], 10);
  var endM = parseInt(endParts[1], 10);
  var y = 2025, m = 12;
  var periods = [];
  while (y < endY || (y === endY && m <= endM)) {
    periods.push(String(y) + '-' + (m < 10 ? '0' + m : String(m)));
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return periods;
}

// ---- runtime helpers --------------------------------------------------------

// Column access by header name only - reads row 1 once per call. Never
// hardcode column letters.
function headerIndex_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var index = {};
  headers.forEach(function (name, i) {
    if (name) index[String(name)] = i + 1;
  });
  return index;
}

function fail_(code, message, extra) {
  var err = new Error(message || code);
  err.code = code;
  if (extra) {
    for (var k in extra) { err[k] = extra[k]; }
  }
  throw err;
}

function openWorkbook_(props) {
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var id = props.getProperty('SPREADSHEET_ID');
  if (!id) fail_('NOT_SETUP', 'Run setup() first');
  return SpreadsheetApp.openById(id);
}

// Fire-and-forget poke of the site's cache warmer (apps-script/poller/Code.gs's
// warmCache_, copied) so a menu write's Netlify snapshot doesn't wait out its TTL.
// SITE_URL defaults to the production site; skipped silently with no POLLER_SECRET
// set (a standalone/dev project without it just runs slightly stale reads on the
// web app side - never a reason to fail a menu write).
function warmCache_() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('POLLER_SECRET');
  if (!secret) return;
  var siteUrl = props.getProperty('SITE_URL') || 'https://books.recast-properties.com';
  try {
    UrlFetchApp.fetch(siteUrl.replace(/\/+$/, '') + '/api/warm-bg',
      { method: 'post', headers: { 'x-poller-secret': secret }, muteHttpExceptions: true });
  } catch (err) {
    console.error('warmCache_: ' + String(err));
  }
}

function findRowByValue_(sheet, colIndex, value) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !colIndex) return -1;
  var range = sheet.getRange(2, colIndex, lastRow - 1, 1);
  var found = range.createTextFinder(String(value)).matchEntireCell(true).findNext();
  return found ? found.getRow() : -1;
}

function findAllRowsByValue_(sheet, colIndex, value) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !colIndex) return [];
  var range = sheet.getRange(2, colIndex, lastRow - 1, 1);
  var matches = range.createTextFinder(String(value)).matchEntireCell(true).findAll();
  return matches.map(function (r) { return r.getRow(); });
}

function parseIsoDate_(iso) {
  var parts = String(iso).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatIsoDate_(d) {
  if (!(d instanceof Date)) return d === '' || d === null || d === undefined ? '' : String(d);
  return Utilities.formatDate(d, 'America/Chicago', 'yyyy-MM-dd');
}

function formatIsoTimestamp_(d) {
  return Utilities.formatDate(d, 'America/Chicago', "yyyy-MM-dd'T'HH:mm:ss");
}

function maxColIndex_(cols) {
  var width = 0;
  for (var k in cols) { if (cols[k] > width) width = cols[k]; }
  return width;
}

// Builds one Journal row (array, header-width, values placed by name) for
// an entry line. debit/credit on `line` are integer cents; written to the
// sheet as dollars (cents / 100).
function buildJournalRow_(cols, entry, line, lineNumber, postedAt) {
  var row = new Array(maxColIndex_(cols)).fill('');
  function set(name, value) {
    var idx = cols[name];
    if (idx) row[idx - 1] = value;
  }
  set('txn_id', entry.txn_id);
  set('line', lineNumber);
  set('date', parseIsoDate_(entry.date));
  set('period', entry.period);
  set('account', line.account);
  set('debit', (Number(line.debit) || 0) / 100);
  set('credit', (Number(line.credit) || 0) / 100);
  set('property', line.property || '');
  set('cost_class', line.cost_class || '');
  set('tax_treatment', line.tax_treatment || '');
  set('trade', line.trade || '');
  set('payee', line.payee || '');
  set('description', line.description || '');
  set('paid_from', line.paid_from || '');
  set('doc_url', line.doc_url || entry.doc_url || '');
  set('source', entry.source || '');
  set('posted_by', entry.posted_by || '');
  set('posted_at', postedAt);
  set('memo', entry.memo || '');
  set('reconciled_ref', line.reconciled_ref || '');
  set('business_purpose', line.business_purpose || '');
  set('attendee', line.attendee || '');
  set('destination', line.destination || '');
  set('odometer', line.odometer || '');
  set('void_of', entry.void_of || '');
  return row;
}

function periodStatus_(periodsSheet, period) {
  var cols = headerIndex_(periodsSheet);
  var lastRow = periodsSheet.getLastRow();
  if (lastRow < 2 || !cols['period'] || !cols['status']) return 'open';
  var width = maxColIndex_(cols);
  var values = periodsSheet.getRange(2, 1, lastRow - 1, width).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizePeriod_(values[i][cols['period'] - 1]) === period) {
      return String(values[i][cols['status'] - 1] || 'open');
    }
  }
  return 'open';
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- actions ----------------------------------------------------------------

function action_ping_(props) {
  var ss = openWorkbook_(props);
  return jsonOutput_({ ok: true, spreadsheet_url: ss.getUrl(), version: WRITER_VERSION });
}

function action_post_(body, props) {
  return jsonOutput_(postEntry_(body.entry, props));
}

// The body of the old action_post_, unwrapped from JSON so Menu.gs's dialog
// handlers can call it directly with an already-built entry (phase2.7-spec.md
// section 4) instead of going through doPost. Throws via fail_ on any refusal -
// action_post_ lets that propagate to doPost's catch; Menu.gs callers catch it
// themselves and show err.code/err.message in the dialog.
function postEntry_(entry, props) {
  if (!entry || !Array.isArray(entry.lines) || entry.lines.length < 1) {
    fail_('BAD_ENTRY', 'entry.lines must be a non-empty array');
  }
  if (!entry.txn_id) fail_('BAD_ENTRY', 'entry.txn_id is required');
  if (entry.lines.length < 2) fail_('MIN_LINES', 'an entry needs at least two lines');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))) fail_('BAD_DATE', 'entry.date must be YYYY-MM-DD');
  // The period is always derived from the date here; the caller's value is not trusted.
  entry.period = String(entry.date).slice(0, 7);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = openWorkbook_(props);
    var sheet = ss.getSheetByName('Journal');
    var cols = headerIndex_(sheet);

    var debitTotal = 0, creditTotal = 0;
    entry.lines.forEach(function (line) {
      debitTotal += Math.round(Number(line.debit) || 0);
      creditTotal += Math.round(Number(line.credit) || 0);
    });
    if (debitTotal !== creditTotal) {
      fail_('UNBALANCED', 'debits ' + debitTotal + ' != credits ' + creditTotal);
    }

    var cache = CacheService.getScriptCache();
    if (cache.get('txn:' + entry.txn_id)) fail_('DUPLICATE', 'txn_id already posted (cache)');
    if (findRowByValue_(sheet, cols['txn_id'], entry.txn_id) !== -1) {
      fail_('DUPLICATE', 'txn_id already in Journal');
    }

    if (entry.source !== 'void') {
      var status = periodStatus_(ss.getSheetByName('Periods'), entry.period);
      if (status === 'closed') fail_('PERIOD_CLOSED', 'period ' + entry.period + ' is closed');
    }

    var postedAt = new Date();
    var rows = entry.lines.map(function (line, idx) {
      return buildJournalRow_(cols, entry, line, idx + 1, postedAt);
    });

    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);

    cache.put('txn:' + entry.txn_id, '1', 21600);
    refreshLineBlocksFor_(ss, entry.lines);

    return { ok: true, rows: [startRow, startRow + rows.length - 1] };
  } finally {
    lock.releaseLock();
  }
}

function action_void_(body, props) {
  return jsonOutput_(voidEntry_(body.txn_id, body.reason || '', body.date, body.posted_by || 'system', props));
}

// Unwrapped body of the old action_void_ (see postEntry_'s comment) - Menu.gs's
// voidSelected_ calls this directly with the Journal row's own txn_id.
function voidEntry_(txnId, reason, date, postedBy, props, skipRefresh) {
  if (!txnId) fail_('BAD_REQUEST', 'txn_id is required');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) fail_('BAD_REQUEST', 'date (YYYY-MM-DD) is required');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = openWorkbook_(props);
    var sheet = ss.getSheetByName('Journal');
    var cols = headerIndex_(sheet);

    var originalRows = findAllRowsByValue_(sheet, cols['txn_id'], txnId);
    if (originalRows.length === 0) fail_('NOT_FOUND', 'no Journal rows for txn_id ' + txnId);

    var alreadyVoided = findAllRowsByValue_(sheet, cols['void_of'], txnId);
    if (alreadyVoided.length > 0) fail_('ALREADY_VOIDED', 'txn_id ' + txnId + ' already voided');

    var width = sheet.getLastColumn();
    var originalLines = originalRows.map(function (r) {
      var values = sheet.getRange(r, 1, 1, width).getValues()[0];
      var obj = {};
      Object.keys(cols).forEach(function (name) { obj[name] = values[cols[name] - 1]; });
      return obj;
    });

    var voidTxnId = 'void-' + txnId;
    var period = String(date).slice(0, 7);
    var postedAt = new Date();

    var rows = originalLines.map(function (orig, idx) {
      var mirrorEntry = {
        txn_id: voidTxnId, date: date, period: period, memo: 'VOID: ' + reason,
        source: 'void', posted_by: postedBy,
        doc_url: orig.doc_url || '', void_of: txnId
      };
      var mirrorLine = {
        account: orig.account,
        debit: Math.round(Number(orig.credit) * 100),
        credit: Math.round(Number(orig.debit) * 100),
        property: orig.property, cost_class: orig.cost_class,
        tax_treatment: orig.tax_treatment, trade: orig.trade, payee: orig.payee,
        description: orig.description, paid_from: orig.paid_from,
        doc_url: orig.doc_url, reconciled_ref: orig.reconciled_ref,
        business_purpose: orig.business_purpose, attendee: orig.attendee,
        destination: orig.destination, odometer: orig.odometer
      };
      return buildJournalRow_(cols, mirrorEntry, mirrorLine, idx + 1, postedAt);
    });

    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
    if (!skipRefresh) refreshLineBlocksFor_(ss, originalLines);

    return { ok: true, rows: [startRow, startRow + rows.length - 1], txn_id: voidTxnId };
  } finally {
    lock.releaseLock();
  }
}

function action_read_(body, props) {
  return jsonOutput_(readTabData_(openWorkbook_(props), body.tab, body));
}

// Unwrapped body of the old action_read_ (see postEntry_'s comment) - Menu.gs's
// report handlers call this directly (e.g. {tab:'Journal', all:true}) to get the
// same since/limit/all filtering and Date->ISO-string formatting the HTTP callers get.
function readTabData_(ss, tab, body) {
  var allowed = ['Accounts', 'Properties', 'Bank accounts', 'Vendors', 'Periods',
    'Settings', 'Users', 'Journal', 'Advances'];
  if (allowed.indexOf(tab) === -1) fail_('BAD_TAB', 'tab not readable: ' + tab);

  var sheet = ss.getSheetByName(tab);
  if (!sheet) fail_('NOT_FOUND', 'tab not found: ' + tab);

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var headers = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var dataRows = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];

  if (tab === 'Journal') {
    var cols = headerIndex_(sheet);
    var dateCol = cols['date'] - 1;
    var since = body.since;
    if (since) {
      dataRows = dataRows.filter(function (row) {
        return formatIsoDate_(row[dateCol]) >= since;
      });
    }
    // {all:true} returns every matching row (used by the reports pages) - skip the
    // limit slicing entirely rather than trying to express "no limit" as a number.
    if (!body.all) {
      var limit = Math.max(1, Math.min(parseInt(body.limit, 10) || 200, 20000));
      if (dataRows.length > limit) dataRows = dataRows.slice(dataRows.length - limit);
    }
  }

  var timestampCols = {};
  var periodCols = {};
  headers.forEach(function (h, i) {
    if (h === 'posted_at' || h === 'closed_at' || h === 'added_at') timestampCols[i] = true;
    if (h === 'period') periodCols[i] = true;
  });
  var out = dataRows.map(function (row) {
    return row.map(function (cell, i) {
      if (!(cell instanceof Date)) return cell;
      if (periodCols[i]) return normalizePeriod_(cell);
      return timestampCols[i] ? formatIsoTimestamp_(cell) : formatIsoDate_(cell);
    });
  });

  return { ok: true, headers: headers, rows: out };
}

function action_setPeriod_(body, props) {
  return jsonOutput_(setPeriodStatus_(body.period, body.status, props));
}

// Unwrapped body of the old action_setPeriod_ (see postEntry_'s comment) - Menu.gs's
// closePeriod_/reopenPeriod_ call this directly after their own ui.prompt.
function setPeriodStatus_(period, status, props) {
  if (!/^\d{4}-\d{2}$/.test(String(period))) fail_('BAD_PERIOD', 'period must match YYYY-MM');
  if (status !== 'open' && status !== 'closed') fail_('BAD_STATUS', 'status must be open or closed');

  var ss = openWorkbook_(props);
  var sheet = ss.getSheetByName('Periods');
  var cols = headerIndex_(sheet);
  var row = -1;
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var periodValues = sheet.getRange(2, cols['period'], lastRow - 1, 1).getValues();
    for (var i = 0; i < periodValues.length; i++) {
      if (normalizePeriod_(periodValues[i][0]) === period) { row = i + 2; break; }
    }
  }
  var closedAt = status === 'closed' ? new Date() : '';
  CacheService.getScriptCache().remove('ctx');

  if (row === -1) {
    var newRow = new Array(maxColIndex_(cols)).fill('');
    newRow[cols['period'] - 1] = period;
    newRow[cols['status'] - 1] = status;
    if (cols['closed_at']) newRow[cols['closed_at'] - 1] = closedAt;
    var target = sheet.getRange(sheet.getLastRow() + 1, 1, 1, newRow.length);
    sheet.getRange(sheet.getLastRow() + 1, cols['period']).setNumberFormat('@');
    target.setValues([newRow]);
  } else {
    sheet.getRange(row, cols['status']).setValue(status);
    if (cols['closed_at']) sheet.getRange(row, cols['closed_at']).setValue(closedAt);
  }

  return { ok: true, period: period, status: status };
}

function action_upsert_(body, props) {
  var tab = body.tab;
  var allowed = ['Properties', 'Bank accounts', 'Vendors', 'Users', 'Settings',
    'Advances', 'Accounts'];
  if (allowed.indexOf(tab) === -1) fail_('BAD_TAB', 'tab not upsertable: ' + tab);

  var keyColumn = body.key_column;
  var rowData = body.row || {};

  var ss = openWorkbook_(props);
  var sheet = ss.getSheetByName(tab);
  if (!sheet) fail_('NOT_FOUND', 'tab not found: ' + tab);

  var cols = headerIndex_(sheet);
  // A column added to TAB_HEADERS after setup() ran (tax_annual, 2026-09-14) is
  // written to the header row on first use, so no re-run of setup() is needed.
  var missing = TAB_HEADERS[tab].some(function (h) { return !cols[h]; });
  if (missing) { ensureHeaders_(sheet, TAB_HEADERS[tab]); cols = headerIndex_(sheet); }
  if (!cols[keyColumn]) fail_('BAD_KEY_COLUMN', 'key_column not found: ' + keyColumn);

  var keyValue = rowData[keyColumn];
  if (keyValue === undefined || keyValue === null || keyValue === '') {
    fail_('BAD_REQUEST', 'row must include the key column value');
  }

  var ignored = [];
  Object.keys(rowData).forEach(function (name) {
    if (!cols[name]) ignored.push(name);
  });

  var created = upsertRow_(sheet, cols, keyColumn, rowData);

  return jsonOutput_({ ok: true, tab: tab, created: created, ignored: ignored });
}

// Shared by action_upsert_ and Menu.gs's write handlers (addProperty_, addAdvance_,
// the Bank-accounts-to-Accounts mirror in onPropertyTabEdit): find a row by its key
// column's value, update it in place, or append a new one. Returns true if a row
// was created. `cols` is the sheet's headerIndex_() map (callers already have it, so
// this never re-reads row 1).
function upsertRow_(sheet, cols, keyColumn, rowData) {
  CacheService.getScriptCache().remove('ctx'); // Menu.gs buildCtx_ caches Accounts/Properties/Periods
  var existingRow = findRowByValue_(sheet, cols[keyColumn], rowData[keyColumn]);
  var created = existingRow === -1;
  if (created) {
    var newRow = new Array(maxColIndex_(cols)).fill('');
    Object.keys(rowData).forEach(function (name) {
      if (cols[name]) newRow[cols[name] - 1] = rowData[name];
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, newRow.length).setValues([newRow]);
  } else {
    Object.keys(rowData).forEach(function (name) {
      if (cols[name]) sheet.getRange(existingRow, cols[name]).setValue(rowData[name]);
    });
  }
  return created;
}

// Same checks as action_post_'s per-entry gate (MIN_LINES, BAD_DATE, UNBALANCED,
// DUPLICATE - including duplicates within the batch itself - and PERIOD_CLOSED),
// but as a standalone check with no side effects, so action_postBatch_ can validate
// every entry before writing any of them. Throws via fail_, tagging the error with
// the failing txn_id so doPost's catch can name it in the response.
function checkEntryForPost_(entry, sheet, cols, periodsSheet, cache, seenTxnIds) {
  if (!entry || !Array.isArray(entry.lines) || entry.lines.length < 1) {
    fail_('BAD_ENTRY', 'entry.lines must be a non-empty array');
  }
  if (!entry.txn_id) fail_('BAD_ENTRY', 'entry.txn_id is required');
  if (entry.lines.length < 2) {
    fail_('MIN_LINES', 'an entry needs at least two lines', { txn_id: entry.txn_id });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))) {
    fail_('BAD_DATE', 'entry.date must be YYYY-MM-DD', { txn_id: entry.txn_id });
  }
  entry.period = String(entry.date).slice(0, 7);

  var debitTotal = 0, creditTotal = 0;
  entry.lines.forEach(function (line) {
    debitTotal += Math.round(Number(line.debit) || 0);
    creditTotal += Math.round(Number(line.credit) || 0);
  });
  if (debitTotal !== creditTotal) {
    fail_('UNBALANCED', 'debits ' + debitTotal + ' != credits ' + creditTotal, { txn_id: entry.txn_id });
  }

  if (seenTxnIds[entry.txn_id]) {
    fail_('DUPLICATE', 'txn_id duplicated within batch', { txn_id: entry.txn_id });
  }
  if (cache.get('txn:' + entry.txn_id)) {
    fail_('DUPLICATE', 'txn_id already posted (cache)', { txn_id: entry.txn_id });
  }
  if (findRowByValue_(sheet, cols['txn_id'], entry.txn_id) !== -1) {
    fail_('DUPLICATE', 'txn_id already in Journal', { txn_id: entry.txn_id });
  }

  if (entry.source !== 'void') {
    var status = periodStatus_(periodsSheet, entry.period);
    if (status === 'closed') {
      fail_('PERIOD_CLOSED', 'period ' + entry.period + ' is closed', { txn_id: entry.txn_id });
    }
  }
}

// postBatch: the interest posting job posts one entry per advance under a single
// lock, all or nothing. Every entry is validated (checkEntryForPost_) before any row
// is written; if one fails, nothing is written and the thrown error carries its
// txn_id and code (see doPost's catch).
function action_postBatch_(body, props) {
  return jsonOutput_(postBatchEntries_(body.entries, props, body.skipRefresh === true));
}

// Unwrapped body of the old action_postBatch_ (see postEntry_'s comment) - Menu.gs's
// postInterest_ posts one entry per advance this way, all-or-nothing under one lock.
// skipRefresh: the caller refreshes the property tab's line blocks itself, later
// (Menu.gs inboxFinish - the rebuild is ~1 s the Inbox user need not wait for).
function postBatchEntries_(entries, props, skipRefresh) {
  if (!Array.isArray(entries) || entries.length === 0) {
    fail_('BAD_ENTRY', 'entries must be a non-empty array');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = openWorkbook_(props);
    var sheet = ss.getSheetByName('Journal');
    var cols = headerIndex_(sheet);
    var periodsSheet = ss.getSheetByName('Periods');
    var cache = CacheService.getScriptCache();

    var seenTxnIds = {};
    entries.forEach(function (entry) {
      checkEntryForPost_(entry, sheet, cols, periodsSheet, cache, seenTxnIds);
      seenTxnIds[entry.txn_id] = true;
    });

    var postedAt = new Date();
    var allRows = [];
    var postedIds = [];
    entries.forEach(function (entry) {
      var rows = entry.lines.map(function (line, idx) {
        return buildJournalRow_(cols, entry, line, idx + 1, postedAt);
      });
      allRows = allRows.concat(rows);
      postedIds.push(entry.txn_id);
    });

    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, allRows.length, allRows[0].length).setValues(allRows);

    postedIds.forEach(function (txnId) { cache.put('txn:' + txnId, '1', 21600); });
    if (!skipRefresh) refreshLineBlocksFor_(ss, entries.reduce(function (acc, en) { return acc.concat(en.lines); }, []));

    return { ok: true, posted: postedIds, rows: [startRow, startRow + allRows.length - 1] };
  } finally {
    lock.releaseLock();
  }
}

// storeDocument: files one source document (receipt photo, PDF, etc.) to Drive,
// phase2-spec.md section 7. Creates the root folder "Recast Books" once (id cached
// in Script Properties, separate from the workbook's own SPREADSHEET_ID) and the
// requested path of nested folders under it, creating any that do not yet exist,
// then saves the file there. No ScriptLock: concurrent uploads name different
// files, and DriveApp folder lookups are not the serialized resource the Journal
// writes are - a benign race just means two calls might both create the same
// missing subfolder concurrently in the rare worst case, which getFoldersByName
// tolerates (both folders exist under the same name; harmless duplication, never
// data loss). Scope stays drive.file per the spec - only files/folders this script
// creates are touched.
function action_storeDocument_(body, props) {
  var name = body.name;
  var mime = body.mime;
  var base64 = body.base64;
  var folder = body.folder;
  if (!name) fail_('BAD_REQUEST', 'name is required');
  if (!mime) fail_('BAD_REQUEST', 'mime is required');
  if (!base64) fail_('BAD_REQUEST', 'base64 is required');
  if (!Array.isArray(folder) || folder.length === 0) {
    fail_('BAD_REQUEST', 'folder must be a non-empty array of path segments');
  }
  return jsonOutput_(storeDocument_(name, mime, base64, folder, props));
}

// Unwrapped body of action_storeDocument_ - Menu.gs's inboxApprove files the receipt
// in-process this way before it posts (the web app's approve does the same over HTTP).
function storeDocument_(name, mime, base64, folder, props) {
  var target = docsFolderFor_(folder, props);

  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mime, name);
  var file = target.createFile(blob);

  return { ok: true, fileId: file.getId(), url: file.getUrl(), folderUrl: target.getUrl() };
}

// The folder for a path like ["2026", "1616 Granite"]: walked once, then its id is
// cached for 6 h (each getFoldersByName hop is ~0.5 s of Drive time - Inbox timing
// 2026-09-16: the walk plus createFile was 2.6 s of an 8.4 s approve).
function docsFolderFor_(folder, props) {
  var cache = CacheService.getScriptCache();
  var key = 'folder:' + folder.join('/');
  var id = cache.get(key);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* trashed - walk again */ }
  }
  var target = getOrCreateDocsRootFolder_(props);
  folder.forEach(function (segment) {
    target = getOrCreateSubfolder_(target, String(segment));
  });
  cache.put(key, target.getId(), 21600);
  return target;
}

/** Fills doc_url on every Journal line of the given txn_ids (Menu.gs inboxFinish:
 *  the Inbox posts first and files to Drive afterwards, so the link lands late). */
function setDocUrl_(txnIds, url, props) {
  var ss = openWorkbook_(props);
  var sheet = ss.getSheetByName('Journal');
  var cols = headerIndex_(sheet);
  var last = sheet.getLastRow();
  if (last < 2 || !cols['doc_url'] || !url) return 0;
  var ids = sheet.getRange(2, cols['txn_id'], last - 1, 1).getValues();
  var want = {};
  txnIds.forEach(function (t) { want[String(t)] = true; });
  var n = 0;
  for (var i = 0; i < ids.length; i++) {
    if (want[String(ids[i][0])]) { sheet.getRange(i + 2, cols['doc_url']).setValue(url); n++; }
  }
  return n;
}

function getOrCreateDocsRootFolder_(props) {
  var id = props.getProperty('DOCS_ROOT_FOLDER_ID');
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      // Folder was deleted/trashed out from under the stored id - fall through and
      // create a fresh one rather than failing every storeDocument call forever.
    }
  }
  var created = DriveApp.createFolder(DOCS_ROOT_FOLDER_NAME);
  props.setProperty('DOCS_ROOT_FOLDER_ID', created.getId());
  return created;
}

function getOrCreateSubfolder_(parent, name) {
  var existing = parent.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parent.createFolder(name);
}

// ---- Totals tab (2026-09-14, Paul: "add a totals tab") -------------------------------
// Formula-only report tab so the books read without the app: trial balance by account,
// cost by property, overhead by account, key balances - all SUMIFS over Journal as of
// the date in B1 (default today). Voids are mirror pairs, so they net out by themselves.
// Per-row formulas (SUMIFS does not spread inside ARRAYFORMULA). Idempotent: run
// setupTotals() from the editor any time; it rebuilds the tab. Journal column letters
// follow TAB_HEADERS.Journal order (C date, E account, F debit, G credit, H property,
// I cost_class).
function setupTotals() {
  var props = PropertiesService.getScriptProperties();
  var ss = openOrCreateWorkbook_(props);
  var sh = getOrCreateSheet_(ss, 'Totals');
  sh.clear();
  // Voided pairs (an entry + its reversal) are excluded from the gross Debit/Credit
  // columns so a mistake does not inflate them; nets are unchanged either way. A row is
  // excluded when it is a void (P = source) or when some void names its txn_id (Y).
  // SUMPRODUCT over bounded rows: 5000 lines is years of these books.
  var N = 5000;
  var R = function (col) { return 'Journal!$' + col + '$2:$' + col + '$' + N; };
  // The "is this txn_id voided" lookup is O(rows^2); it is computed once in helper
  // column H (row 2 down) and every formula reads the flag.
  var live = '(' + R('P') + '<>"void")*($H$2:$H$' + N + '<>TRUE)*(' + R('C') + '<=$B$1)';
  var critExpr = function (crit) {
    // crit is "col,value[,col,value]" in SUMIFS form; each pair becomes a (range=value)
    // factor. Both sides are coerced to text: a code typed by hand is a number, the
    // writer's are text.
    var parts = crit.split(','), out = '';
    for (var i = 0; i + 1 < parts.length; i += 2) {
      var v = parts[i + 1];
      out += v === '"<>"' ? '(' + parts[i] + '<>"")*' : '(' + parts[i] + '&""=' + v + '&"")*';
    }
    return out;
  };
  var deb = function (crit) { return 'SUMPRODUCT(' + critExpr(crit) + live + '*' + R('F') + ')'; };
  var cred = function (crit) { return 'SUMPRODUCT(' + critExpr(crit) + live + '*' + R('G') + ')'; };
  var ifBlank = function (ref, f) { return '=IF(' + ref + '="","",' + f + ')'; };

  var rows = [];
  var bold = [];
  var push = function (r, isBold) { rows.push(r); if (isBold) bold.push(rows.length); };

  push(['As of', '=TODAY()', '', '', ''], true);
  push(['', '', '', '', '']);
  push(['TRIAL BALANCE', '', 'Debit', 'Credit', 'Net (Dr - Cr)'], true);
  var tbFirst = rows.length + 1, tbN = 80;
  for (var i = 0; i < tbN; i++) {
    var r = tbFirst + i, src = 2 + i;
    push(['=IF(Accounts!A' + src + '="","",Accounts!A' + src + ')',
          '=IF(Accounts!A' + src + '="","",Accounts!B' + src + ')',
          ifBlank('A' + r, deb(R('E') + ',A' + r)),
          ifBlank('A' + r, cred(R('E') + ',A' + r)),
          ifBlank('A' + r, 'C' + r + '-D' + r)]);
  }
  var tbLast = tbFirst + tbN - 1;
  push(['TOTAL', '', '=SUM(C' + tbFirst + ':C' + tbLast + ')', '=SUM(D' + tbFirst + ':D' + tbLast + ')',
        '=SUM(E' + tbFirst + ':E' + tbLast + ')'], true);
  push(['', '', '', '', '']);

  push(['KEY BALANCES', '', '', '', 'Balance'], true);
  [['1401', 'Cash - Citizens shared'], ['1402', 'Cash - Chase operating'], ['2030', 'Due to owner (Paul)'],
   ['2010', 'Note payable - Dennis'], ['2000', 'Accrued interest - Dennis']].forEach(function (k) {
    push([k[0], k[1], '', '', '=' + deb(R('E') + ',"' + k[0] + '"') + '-' + cred(R('E') + ',"' + k[0] + '"')]);
  });
  push(['', '', '', '', '']);

  push(['COST BY PROPERTY (capitalized 1000-series lines)', '', '', '', 'Net'], true);
  var pFirst = rows.length + 1, pN = 30;
  for (var j = 0; j < pN; j++) {
    var pr = pFirst + j, psrc = 2 + j;
    push(['=IF(Properties!A' + psrc + '="","",Properties!A' + psrc + ')', '', '', '',
          ifBlank('A' + pr, deb(R('H') + ',A' + pr + ',' + R('I') + ',"<>"') + '-' + cred(R('H') + ',A' + pr + ',' + R('I') + ',"<>"'))]);
  }
  push(['OVERHEAD', "Paul's alone (D-010) - see below", '', '',
        '=' + deb(R('H') + ',"OVERHEAD",' + R('I') + ',"<>"') + '-' + cred(R('H') + ',"OVERHEAD",' + R('I') + ',"<>"')], true);
  push(['', '', '', '', '']);

  push(['OVERHEAD BY ACCOUNT (6000-series)', '', 'Debit', 'Credit', 'Net'], true);
  var oFirst = rows.length + 1, oN = 40;
  for (var k2 = 0; k2 < oN; k2++) {
    var orow = oFirst + k2, idx = k2 + 1;
    var pick = 'IFERROR(INDEX(FILTER(Accounts!A$2:A,Accounts!C$2:C=6000),' + idx + '),"")';
    push(['=' + pick,
          ifBlank('A' + orow, 'VLOOKUP(A' + orow + ',Accounts!A:B,2,FALSE)'),
          ifBlank('A' + orow, deb(R('E') + ',A' + orow)),
          ifBlank('A' + orow, cred(R('E') + ',A' + orow)),
          ifBlank('A' + orow, 'C' + orow + '-D' + orow)]);
  }
  var oLast = oFirst + oN - 1;
  push(['TOTAL OVERHEAD', '', '=SUM(C' + oFirst + ':C' + oLast + ')', '=SUM(D' + oFirst + ':D' + oLast + ')',
        '=SUM(E' + oFirst + ':E' + oLast + ')'], true);

  sh.getRange(1, 1, rows.length, 5).setValues(rows);
  sh.getRange(1, 8).setValue('helper: voided?');
  sh.getRange(2, 8).setFormula('=ARRAYFORMULA(IF(' + R('A') + '="","",ISNUMBER(MATCH(' + R('A') + ',' + R('Y') + ',0))))');
  sh.getRange(1, 8, 1, 1).setFontColor('#999999');
  sh.setColumnWidth(8, 60);
  sh.getRange(1, 2).setNumberFormat('yyyy-mm-dd');
  sh.getRange(1, 3, rows.length, 3).setNumberFormat('#,##0.00;(#,##0.00);-');
  sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 280);
  [3, 4, 5].forEach(function (c) { sh.setColumnWidth(c, 120); });
  sh.setFrozenRows(1);
  bold.forEach(function (r) { sh.getRange(r, 1, 1, 5).setFontWeight('bold'); });
  console.log('Totals tab rebuilt: ' + rows.length + ' rows');
  return { ok: true, rows: rows.length };
}

// ---- Property tab (2026-09-14, phase2.6-spec.md section 5) -----------------------
// One tab per property, named exactly as its Properties.name, built/rebuilt when the
// property is added (Properties page -> action_propertyTab_ below) or any time from
// the editor via setupPropertyTab(name). Formula-only view over bounded Journal rows
// (same SUMPRODUCT / FILTER / voided-pair-helper-column pattern as setupTotals - read
// that header comment first).
//
// Layout mirrors the old workbook's light property tab (Paul, 2026-09-14, "881
// Newport" CSV), side by side:
//   A:B   SUMMARY - Total Project Cost, Purchase Price (1000), Interest to Date
//         (computed below), Rehab Costs (Rehab + Acquisition ex-1000), Utilities
//         (Holding ex-1100), Property Tax (posted 1100 + the Texas seller proration
//         of Properties.tax_annual from Jan 1 to the as-of date while unsold);
//         PROFIT BREAKDOWN
//         (sale price = contract_price else purchase price; agent/closing at the
//         Settings estimate pcts); PAYOUTS - Dennis / Paul / Back to Recast account.
//         This tab is the forecast while held (Paul, 2026-09-15); the settlement
//         actuals, the true-up and the payouts-equal-proceeds check belong to the
//         closing tab the Phase 5 sell wizard builds.
//   D:H   DENNIS - Purchase Principal + Interest schedule (Advances.kind = purchase),
//         then Paul Paid / Dennis Paid direct / Recast Account who-paid blocks, then
//         the Cash Advances schedule (every other advance). Each schedule row: Start,
//         End (repaid_date), Principal, Interest to Date at Settings!interest_rate_annual
//         (D-016, 8%) by the D-006 method, Notes.
//   J:P   REHAB COSTS - payee, date, description, amount, Paul Paid / Dennis Paid /
//         Recast Account checkboxes (from paid_from).
//   R:X   UTILITIES - same shape, Holding-class lines. Post-sale costs (D-015) are on
//         the Phase 5 closing tab, not here (Paul, 2026-09-15).
//   AI:AS helpers (rate, stub basis, settlement_date, contract_price, per-advance
//         math, tax_annual, tax proration estimate), greyed; the voided flag is on the
//         hidden 'Journal helpers' sheet.
// Interest to Date is the in-sheet computation on every advance (D-011/D-021), not posted
// 1200 accruals, so the tab reads the same whether or not the close job has run;
// Financing-class lines are therefore left out of Total Project Cost (no double count). The tab is a view;
// nothing on it is typed. Sold properties keep their tab.
// ponytail: a held-property view. After the Phase 5 release/payoff entries the
// summary reads zero and the tie-out row goes non-zero; the sell wizard owns that.

function action_propertyTab_(body, props) {
  var name = body.name;
  if (!name) fail_('BAD_REQUEST', 'name is required');
  return jsonOutput_(setupPropertyTab(String(name)));
}

function setupPropertyTab(name) {
  name = String(name);
  var safeName = name.replace(/"/g, '""'); // escaped for embedding in formula string literals
  var props = PropertiesService.getScriptProperties();
  var ss = openOrCreateWorkbook_(props);
  var sh = getOrCreateSheet_(ss, name);
  // Sale Price is the one typed cell on the tab (Paul, 2026-09-15: "a live input cell
  // for me to enter the value"): keep what is there across a rebuild, else start from the
  // registry's contract_price.
  var keptSalePrice = readLabelledValue_(sh, 'Sale Price');
  var registry = propertyRow_(ss, name);
  var heavy = String((registry || {}).template || '').toLowerCase() === 'heavy';
  var BC = PT_BLOCK_COLS;   // Rehab Costs / Utilities block columns (light template)
  // A previous build's spacer column A (empty, name in B1) is removed so the build
  // below starts at column A again and re-inserts exactly one.
  if (sh.getLastColumn() > 1 && sh.getRange(1, 1).isBlank() && !sh.getRange(1, 2).isBlank()) sh.deleteColumn(1);
  sh.showColumns(1, sh.getMaxColumns());
  sh.clear();
  // clear() leaves data validation behind, so an old block's checkboxes would survive
  // a rebuild.
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();

  var N = 5000;     // Journal bound, same as setupTotals
  // Each advance schedule holds as many rows as the property has today plus one spare
  // (Paul, 2026-09-15); the Dennis page rebuilds the tab after each advance it adds.
  var LINES_N = 300; // rows per line block; the sheet is trimmed to end with them (Paul,
                     // 2026-09-15: "extend the checkboxes all the way to the bottom")

  var J = function (col) { return 'Journal!$' + col + '$2:$' + col + '$' + N; };
  var A = function (col) { return 'Advances!$' + col + '$2:$' + col + '$' + N; };
  // The "is this txn_id voided" flag lives on a hidden helper sheet: an ARRAYFORMULA
  // spilling 5000 rows on this tab would make Sheets grow the tab back past the line
  // blocks (Paul, 2026-09-15: "didnt work").
  ensureJournalHelpers_(ss);
  // The helper column, sized from the Journal range itself: when Sheets grows the Journal
  // references (rows inserted: 5000 -> 5008 on the staging copy, 2026-09-17) this grows with
  // them, so the SUMPRODUCT arrays always agree. INDEX:INDEX is not volatile.
  var VOIDED = "INDEX('" + HELPER_SHEET + "'!$A:$A,2):INDEX('" + HELPER_SHEET + "'!$A:$A,ROWS(" + J('A') + ")+1)";
  var eq = function (col, v) { return '(' + J(col) + '&""="' + v + '")'; };
  var ne = function (col, v) { return '(' + J(col) + '&""<>"' + v + '")'; };

  // Journal columns: C date, E account, F debit, G credit, H property, I cost_class,
  // L payee, M description, N paid_from, P source, Y void_of. Voided flag: AD.
  // Voided = the txn_id is named by some void_of (Y). That lookup is O(rows^2): it is computed
  // ONCE, in the helper column, and every formula reads the flag. 2026-09-17's #N/A fix put
  // the MATCH inside every SUMPRODUCT instead - hundreds of 5000-row lookups per Journal
  // append; the staging workbook stalled for minutes and the writer's reads timed out.
  var live = ne('P', 'void') + '*(' + VOIDED + '<>TRUE)*' + eq('H', safeName) + '*(' + J('C') + '<=$B$1)';
  var net = function (factor) { return 'SUMPRODUCT(' + factor + '*' + live + '*(' + J('F') + '-' + J('G') + '))'; };
  var deb = function (factor) { return 'SUMPRODUCT(' + factor + '*' + live + '*' + J('F') + ')'; };
  var cred = function (factor) { return 'SUMPRODUCT(' + factor + '*' + live + '*' + J('G') + ')'; };
  var isBank = '(LEFT(' + J('E') + '&"",2)="14")';
  var rehabF = '(' + eq('I', 'Rehab') + '+' + eq('I', 'Acquisition') + '*' + ne('E', '1000') + ')';
  var holdingF = eq('I', 'Holding');
  var costLineF = ne('I', '');

  var WIDTH = 24; // A..X (heavy: set from the trade blocks below)
  // Helper columns (rate, dates, per-advance math) sit past the grid. On the heavy template
  // the trade blocks run to column DX and had buried the helpers at AI:AW (Ashburne after
  // cutover, 2026-09-22: interest formulas multiplying Pool receipts, #VALUE! everywhere).
  var HB = heavy ? 9 + heavyBlocks_(ss, name).length * PT_HEAVY_STRIDE + 2 : 35;
  var HL = function (k) { return colLetter_(HB + k); };   // k=0 rate .. 14 commission
  var RATE = '$' + HL(0) + '$1', STUB = '$' + HL(1) + '$1', SETTLE = '$' + HL(2) + '$1', CONTRACT = '$' + HL(3) + '$1';
  var TAX = '$' + HL(11) + '$1', PRORATE = '$' + HL(12) + '$1', SHARE = '$' + HL(13) + '$1', COMM = '$' + HL(14) + '$1';
  var hAN = HL(5), hAO = HL(6), hAP = HL(7), hAQ = HL(8), hAR = HL(9), hAS = HL(10);
  if (sh.getMaxColumns() < HB + 15) sh.insertColumnsAfter(sh.getMaxColumns(), HB + 15 - sh.getMaxColumns());
  var grid = [];
  var bold = [];
  // Colours copied from the old workbook's tab (Paul, 2026-09-15): section heads green
  // with the total in light green, sub-heads tan, checkbox columns pale tan, Individual
  // Share yellow. paint(r, c, w, bg) queues a background fill applied after setValues.
  var C = { head: '#a3f67f', total: '#ceffbc', sub: '#ffe599', tan: '#fff2cc', yellow: '#ffff00', input: '#cfe2f3' };
  var paints = [];
  var paint = function (r, c, w, bg, h) { paints.push([r, c, w, bg, h || 1]); };
  var set = function (r, c, v, isBold) {
    while (grid.length < r) grid.push(new Array(WIDTH).fill(''));
    grid[r - 1][c - 1] = v;
    if (isBold) bold.push([r, c]);
  };

  // Row 1-2: name / as-of ($B$1, read by every block) / address.
  set(1, 1, name, true);
  set(1, 2, '=TODAY()');
  set(1, 4, 'as of');
  set(2, 1, '=IFERROR(VLOOKUP("' + safeName + '",Properties!A:B,2,FALSE),"")');

  // ---- DENNIS (D:H) - built first so the summary can point at its totals ---------
  // Two advance schedules (Paul, 2026-09-15: "having cash advances separated at the
  // bottom allows for multiple rows"): the purchase principal (Advances.kind =
  // "purchase") at the top, cash advances (any other kind) below the who-paid blocks.
  // Each schedule: Start / End (repaid_date) / Principal / Interest to Date / Notes,
  // interest by the D-006 method at Settings!interest_rate_annual (D-016), with the
  // per-row math in helper columns AN:AQ; the head carries principal + interest.
  var advCritBase = '(' + A('D') + '&""="' + safeName + '")*(' + A('B') + '<>"")';
  var advanceSchedule = function (top, title, kindFactor, n) {
    set(top, 4, title, true); paint(top, 4, 3, C.head); paint(top, 7, 1, C.total);
    set(top + 1, 4, 'Start Date', true); set(top + 1, 5, 'End Date', true); set(top + 1, 6, 'Principal', true);
    set(top + 1, 7, 'Interest to Date', true);
    paint(top + 1, 4, 4, C.sub);
    var crit = advCritBase + '*' + kindFactor;
    var pick = function (col, idx) { return 'INDEX(FILTER(' + A(col) + ',' + crit + '),' + idx + ')'; };
    var endDates = advanceRepaidDates_(ss, name, kindFactor.indexOf('="purchase"') !== -1);
    var helpers = [];
    var first = top + 2, last = top + 1 + n;
    for (var i = 0; i < n; i++) {
      var r = first + i, idx = i + 1;
      set(r, 4, '=IFERROR(' + pick('B', idx) + ',"")');
      // End Date is typed on the sheet (Paul, 2026-09-15): the value comes from
      // Advances.repaid_date and an edit trigger writes it back (onPropertyTabEdit).
      set(r, 5, endDates[i] || '');
      set(r, 6, '=IF(D' + r + '="","",' + pick('C', idx) + ')');
      // AN n = full monthly anniversaries to the as-of date (DATEDIF "m"); AO balance
      // compounded monthly; AP last anniversary; AQ stub days - simple over
      // Settings!stub_days_basis (D-006).
      // AR the advance's own rate_pct (blank = Settings rate), AS the annual rate used.
      // Interest runs to the as-of date, or to the End Date (repaid_date) if earlier -
      // the same freeze lib/accrual.mjs applies (D-011).
      var asOf = 'IF(E' + r + '="",$B$1,MIN($B$1,E' + r + '))';
      helpers.push([
        '=IF(D' + r + '="","",IFERROR(DATEDIF(D' + r + ',' + asOf + ',"m"),0))',
        '=IF(D' + r + '="","",F' + r + '*(1+' + hAS + r + '/12)^' + hAN + r + ')',
        '=IF(D' + r + '="","",EDATE(D' + r + ',' + hAN + r + '))',
        '=IF(D' + r + '="","",MAX(0,' + asOf + '-' + hAP + r + '))',
        '=IF(D' + r + '="","",IFERROR(' + pick('K', idx) + ',""))',
        '=IF(D' + r + '="","",IF(' + hAR + r + '="",' + RATE + ',' + hAR + r + '/100))']);
      set(r, 7, '=IF(D' + r + '="","",' + hAO + r + '*(1+' + hAS + r + '/12*' + hAQ + r + '/' + STUB + ')-F' + r + ')');
    }
    set(top, 7, '=SUM(F' + first + ':F' + last + ')+SUM(G' + first + ':G' + last + ')', true);
    advHelperBlocks.push([first, helpers]);
    return { head: top, first: first, last: last, next: last + 2 };
  };
  var advHelperBlocks = [];
  var isPurchase = '(' + A('J') + '&""="purchase")';
  var isCash = '(' + A('J') + '&""<>"purchase")';
  // One purchase principal per property, so no spare row here (Paul, 2026-09-15).
  var purchase = advanceSchedule(4, 'Purchase Principal + Interest', isPurchase, Math.max(1, countAdvances_(ss, name, true)));

  // Sub-blocks shaped like the old tab: a green head carrying the net total, detail
  // rows beneath it. Same two rows in each: "<who> Paid" then "Received (advances,
  // refunds)" (Paul, 2026-09-15).
  var subBlock = function (top, title, detail) {
    set(top, 4, title, true); paint(top, 4, 3, C.head); paint(top, 7, 1, C.total);
    detail.forEach(function (d, i) { set(top + 1 + i, 4, d[0]); set(top + 1 + i, 7, d[1]); });
    set(top, 7, '=SUM(G' + (top + 1) + ':G' + (top + detail.length) + ')', true);
    return top + detail.length + 2;
  };
  var dueToPaulRow = purchase.next;
  var dennisDirectRow = subBlock(dueToPaulRow, 'Paul Paid', [
    ['Paul Paid', '=' + cred(eq('E', '2030'))],
    ['Received (advances, refunds)', '=-' + deb(eq('E', '2030'))]]);
  var recastNetRow = subBlock(dennisDirectRow, 'Dennis Paid (direct, not an advance)', [
    ['Dennis Paid', '=' + deb(costLineF + '*' + eq('N', 'DENNIS'))],
    ['Received (advances, refunds)', '=-' + cred(costLineF + '*' + eq('N', 'DENNIS'))]]);
  var cashTop = subBlock(recastNetRow, 'Recast Account Paid', [
    ['Recast Account Paid', '=' + cred(isBank)],
    ['Received (advances, refunds)', '=-' + deb(isBank)]]);
  var cash = advanceSchedule(cashTop, 'Cash Advances + Interest', isCash, countAdvances_(ss, name, false) + 1);

  // D-011 / D-021: interest on every advance is a property cost (the cash advances
  // reimbursed Paul for Granite costs, so the money paid for the property). "Interest
  // to Date" in the summary is both schedules' interest; each partner bears half
  // through the split.
  var purchaseInterestRef = 'SUM(G' + purchase.first + ':G' + purchase.last + ')';
  var purchasePayoffRef = 'G' + purchase.head;
  var cashPayoffRef = 'G' + cash.head;
  var cashInterestRef = 'SUM(G' + cash.first + ':G' + cash.last + ')';

  // ---- SUMMARY (A:B) --------------------------------------------------------------
  var s = 4;
  set(s, 1, 'Total Project Cost', true); var totalRow = s; paint(s, 1, 1, C.head); paint(s, 2, 1, C.total); s += 1;
  // The posted purchase (account 1000) once it is on the books; the registry's
  // purchase_price until then.
  // Paul, 2026-09-15: the summary reads like the payout - purchase principal with its
  // interest on one line, the cash advances' interest on the next.
  set(s, 1, 'Purchase Principal + Interest'); set(s, 2, '=IF(' + net(eq('E', '1000')) + '=0,IFERROR(VLOOKUP("' + safeName + '",Properties!A:E,5,FALSE),0),' + net(eq('E', '1000')) + ')+' + purchaseInterestRef); var purchaseRow = s++;
  set(s, 1, 'Cash Advance Interest'); set(s, 2, '=' + cashInterestRef); s++;
  set(s, 1, 'Rehab Costs'); set(s, 2, '=' + net(rehabF)); var rehabRow = s++;
  set(s, 1, 'Utilities'); set(s, 2, '=' + net(holdingF + '*' + ne('E', '1100'))); s++;
  // Property tax: posted 1100 lines plus, while unsold, the proration estimate in
  // $AU$1 (annual x days from Jan 1 of the as-of year / 365 - what the old tab typed).
  // The label names the annual figure it is built from.
  // ponytail: a current-year bill paid before the sale would count in both terms;
  // Texas bills arrive in October and are due Jan 31, so a held property rarely
  // pays one - revisit if it happens.
  set(s, 1, '="Property Tax (prorated"&IF(' + TAX + '="","",", "&TEXT(' + TAX + ',"$#,##0")&"/yr")&")"'); set(s, 2, '=' + net(eq('E', '1100')) + '+' + PRORATE); s++;
  set(totalRow, 2, '=SUM(B' + purchaseRow + ':B' + (s - 1) + ')', true);
  s++;
  paint(s, 1, 2, C.head); set(s++, 1, 'Profit Breakdown', true);
  set(s, 1, 'Sale Price (estimate - type it here)', true);
  set(s, 2, keptSalePrice !== '' ? keptSalePrice : (registry.contract_price || ''), true);
  paint(s, 1, 2, C.input); var saleRow = s++;
  set(s, 1, 'Total Project Costs'); set(s, 2, '=-B' + totalRow); s++;
  var pct = function (key) { return 'IFERROR(VLOOKUP("' + key + '",Settings!A:B,2,FALSE),0)'; };
  set(s, 1, '="Agent "&' + pct('estimate_agent_pct') + '&"%"'); set(s, 2, '=-B' + saleRow + '*' + pct('estimate_agent_pct') + '/100'); var agentRow = s++;
  set(s, 1, '="Closing "&' + pct('estimate_closing_pct') + '&"%"'); set(s, 2, '=-B' + saleRow + '*' + pct('estimate_closing_pct') + '/100'); var closingRow = s++;
  set(s, 1, 'Net Profit', true); set(s, 2, '=SUM(B' + saleRow + ':B' + closingRow + ')', true); paint(s, 1, 2, C.total); var profitRow = s++;
  // D-022: the split is a term on the property (Properties.dennis_share_pct, default 50;
  // 0 when Dennis is the bank only, as on 104 Ashburne).
  set(s, 1, '="Dennis Share ("&' + SHARE + '&"%)"', true); set(s, 2, '=B' + profitRow + '*' + SHARE + '/100', true); paint(s, 1, 2, C.yellow); var dennisShareRow = s++;
  set(s, 1, '="Paul Share ("&(100-' + SHARE + ')&"%)"', true); set(s, 2, '=B' + profitRow + '-B' + dennisShareRow, true); paint(s, 1, 2, C.yellow); var paulShareRow = s++;
  s++;
  paint(s, 1, 2, C.head); set(s++, 1, 'Payouts', true);
  set(s, 1, 'Dennis', true); paint(s, 1, 1, C.sub); paint(s, 2, 1, C.tan); var dennisRow = s++;
  set(s, 1, 'Purchase Principal & Interest'); set(s, 2, '=' + purchasePayoffRef); s++;
  set(s, 1, 'Cash Advances + Interest'); set(s, 2, '=' + cashPayoffRef); s++;
  set(s, 1, 'Dennis Share'); set(s, 2, '=B' + dennisShareRow); s++;
  set(s, 1, 'Dennis Paid (direct)'); set(s, 2, '=G' + dennisDirectRow); s++;
  // Bank-only deal (Ashburne, 2026-09-17): Dennis's return is interest (already inside
  // project cost) plus a commission on the sale price; it comes out of Paul's side.
  set(s, 1, '="Dennis commission ("&' + COMM + '&"% of sale)"'); set(s, 2, '=B' + saleRow + '*' + COMM + '/100'); var dennisCommRow = s++;
  set(dennisRow, 2, '=SUM(B' + (dennisRow + 1) + ':B' + (dennisRow + 5) + ')', true);
  s++;
  set(s, 1, 'Paul', true); paint(s, 1, 1, C.sub); paint(s, 2, 1, C.tan); var paulRow = s++;
  set(s, 1, 'Paul Share'); set(s, 2, '=B' + paulShareRow); s++;
  set(s, 1, 'Due to Paul (paid less reimbursed)'); set(s, 2, '=G' + dueToPaulRow); s++;
  set(s, 1, 'Less Dennis commission'); set(s, 2, '=-B' + dennisCommRow); s++;
  set(paulRow, 2, '=SUM(B' + (paulRow + 1) + ':B' + (paulRow + 3) + ')', true);
  s++;
  set(s, 1, 'Back to Recast account', true); set(s, 2, '=G' + recastNetRow, true); paint(s, 1, 1, C.sub); paint(s, 2, 1, C.tan); s++;


  // ---- Line blocks: REHAB COSTS (J:P), UTILITIES (R:X) ----------------------------
  var lineBlock = function (top, c0, title, crit, asOfBound) {
    set(top, c0, title, true);
    var amtCol = colLetter_(c0 + 3);
    set(top, c0 + 3, '=SUM(' + amtCol + (top + 2) + ':' + amtCol + (top + 1 + LINES_N) + ')', true);
    set(top + 1, c0 + 4, 'Paul Paid', true); set(top + 1, c0 + 5, 'Dennis Paid', true); set(top + 1, c0 + 6, 'Recast Account', true);
    set(top + 1, c0, 'Payee', true); set(top + 1, c0 + 1, 'Date', true); set(top + 1, c0 + 2, 'Description', true); set(top + 1, c0 + 3, 'Amount', true);
    paint(top, c0, 3, C.head); paint(top, c0 + 3, 1, C.total); paint(top, c0 + 4, 3, C.head);
    paint(top + 1, c0, 7, C.sub); paint(top + 2, c0 + 4, 3, C.tan, LINES_N);
    // The line rows (payee, date, description, amount, the three paid-by checkboxes,
    // txn_id) are VALUES written by refreshLineBlocks_ - after this build and after every
    // post/void that touches the property - not a formula spill: a checkbox that shows a
    // formula's result cannot be clicked, and Paul wants to change who paid by clicking
    // (2026-09-15). onPropertyTabEdit turns that click into a void + re-post.
    return top + 2 + LINES_N;
  };
  if (heavy) {
    // Heavy template (D-002, D-026.8; Paul 2026-09-17: "match the format in this Ashburne
    // tab"): one block per trade side by side from column J, Payee / Date / Description /
    // Amount, in the old tab's block order, then any other trade seen on the Journal, then
    // '(no trade)' and Utilities (Holding lines). Values are written by
    // refreshHeavyBlocks_; the head carries the block's SUM.
    var hb = heavyBlocks_(ss, name);
    hb.forEach(function (blk, i) {
      var c0 = 10 + i * PT_HEAVY_STRIDE;
      var amt = colLetter_(c0 + 3);
      set(4, c0, blk, true); set(4, c0 + 3, '=SUM(' + amt + '6:' + amt + (5 + LINES_N) + ')', true);
      set(5, c0, 'Payee', true); set(5, c0 + 1, 'Date', true); set(5, c0 + 2, 'Description', true); set(5, c0 + 3, 'Amount', true);
      paint(4, c0, 3, C.head); paint(4, c0 + 3, 1, C.total); paint(5, c0, 4, C.sub);
    });
    WIDTH = 9 + hb.length * PT_HEAVY_STRIDE;
    grid.forEach(function (row) { while (row.length < WIDTH) row.push(''); });
  } else {
    lineBlock(4, BC[0], 'Rehab Costs', rehabF + '*' + live);
    lineBlock(4, BC[1], 'Utilities', holdingF + '*' + live);
  }
  var needRows = 5 + LINES_N;
  while (grid.length < needRows) grid.push(new Array(WIDTH).fill(''));
  var maxRows = sh.getMaxRows();
  if (maxRows > needRows) sh.deleteRows(needRows + 1, maxRows - needRows);
  else if (maxRows < needRows) sh.insertRowsAfter(maxRows, needRows - maxRows);
  sh.getRange(1, 1, grid.length, WIDTH).setValues(grid);

  // Helpers past the grid: AI1 rate, AJ1 stub basis, AK1 settlement_date, AL1
  // contract_price (D-017), AN:AQ per-advance math, AR/AS tax.
  sh.getRange(1, HB).setFormula('=IFERROR(VLOOKUP("interest_rate_annual",Settings!A:B,2,FALSE),0)');
  sh.getRange(1, HB + 1).setFormula('=IFERROR(VLOOKUP("stub_days_basis",Settings!A:B,2,FALSE),30)');
  sh.getRange(1, HB + 2).setFormula('=IFERROR(VLOOKUP("' + safeName + '",Properties!A:F,6,FALSE),"")'); // settlement_date
  sh.getRange(1, HB + 3).setFormula('=IFERROR(VLOOKUP("' + safeName + '",Properties!A:K,11,FALSE),"")'); // contract_price
  advHelperBlocks.forEach(function (blk) { sh.getRange(blk[0], HB + 5, blk[1].length, 6).setFormulas(blk[1]); });
  sh.getRange(1, HB + 11).setFormula('=IFERROR(VLOOKUP("' + safeName + '",Properties!A:L,12,FALSE),"")'); // AT1: tax_annual
  sh.getRange(1, HB + 12).setFormula('=IF(OR(' + SETTLE + '<>"",' + TAX + '=""),0,' + TAX + '*($B$1-DATE(YEAR($B$1),1,1))/365)'); // AU1: proration estimate while unsold
  sh.getRange(1, HB + 13).setFormula('=IFERROR(IF(VLOOKUP("' + safeName + '",Properties!A:M,13,FALSE)="",50,VLOOKUP("' + safeName + '",Properties!A:M,13,FALSE)),50)'); // AV1: Dennis profit share % (D-022)
  sh.getRange(1, HB + 14).setFormula('=IFERROR(IF(VLOOKUP("' + safeName + '",Properties!A:N,14,FALSE)="",0,VLOOKUP("' + safeName + '",Properties!A:N,14,FALSE)),0)'); // AW1: Dennis commission % of sale (bank-only deals, Ashburne)
  sh.getRange(1, HB, 1, 5).setFontColor('#999999');
  sh.getRange(1, HB + 11, 1, 4).setFontColor('#999999');
  advHelperBlocks.forEach(function (blk) { sh.getRange(blk[0], HB + 5, blk[1].length, 6).setFontColor('#999999'); });

  // Formats: dates, dollars, checkboxes (a formula returning TRUE/FALSE renders as a
  // checked/unchecked box, like the old tab).
  var money = '$#,##0.00;-$#,##0.00;-';
  sh.getRange(1, 2).setNumberFormat('mm/dd/yyyy');
  sh.getRange(1, HB + 2).setNumberFormat('mm/dd/yyyy');
  sh.getRange(4, 2, grid.length - 3, 1).setNumberFormat(money);
  [purchase, cash].forEach(function (blk) { sh.getRange(blk.first, 4, blk.last - blk.first + 1, 2).setNumberFormat('mm/dd/yyyy'); });
  sh.getRange(4, 6, grid.length - 3, 2).setNumberFormat(money);
  if (heavy) {
    heavyBlocks_(ss, name).forEach(function (blk, i) {
      var c0 = 10 + i * PT_HEAVY_STRIDE;
      sh.getRange(4, c0 + 1, grid.length - 3, 1).setNumberFormat('mm/dd/yyyy');
      sh.getRange(4, c0 + 3, grid.length - 3, 1).setNumberFormat(money);
      sh.setColumnWidth(c0, 150); sh.setColumnWidth(c0 + 1, 90); sh.setColumnWidth(c0 + 2, 180); sh.setColumnWidth(c0 + 3, 100); sh.setColumnWidth(c0 + 4, 20);
    });
  }
  (heavy ? [] : BC).forEach(function (c) {
    sh.getRange(4, c + 1, grid.length - 3, 1).setNumberFormat('mm/dd/yyyy');
    sh.getRange(4, c + 3, grid.length - 3, 1).setNumberFormat(money);
    sh.getRange(6, c + 4, LINES_N, 3).insertCheckboxes();
    sh.getRange(6, c + 4, LINES_N, 3).clearContent(); // keep the validation, let the block's formula spill into them
    sh.getRange(6, c + PT_TXN_OFFSET, LINES_N, 1).setFontColor('#ffffff'); // txn_id column: present for the trigger, invisible
  });
  if (!heavy) sh.hideColumns(BC[1] + PT_TXN_OFFSET); // Utilities' txn_id column sits past the grid
  refreshLineBlocks_(ss, name);

  sh.setColumnWidth(1, 250); sh.setColumnWidth(2, 110); sh.setColumnWidth(3, 20);
  sh.setColumnWidth(4, 190); [5, 6, 7].forEach(function (c) { sh.setColumnWidth(c, 100); });
  sh.setColumnWidth(9, 20); if (!heavy) sh.setColumnWidth(BC[1] - 1, 20);
  (heavy ? [] : BC).forEach(function (c) {
    sh.setColumnWidth(c, 150); sh.setColumnWidth(c + 1, 90); sh.setColumnWidth(c + 2, 180);
    sh.setColumnWidth(c + 3, 100); [4, 5, 6].forEach(function (k) { sh.setColumnWidth(c + k, 100); });
  });
  sh.setFrozenRows(1);
  bold.forEach(function (rc) { sh.getRange(rc[0], rc[1]).setFontWeight('bold'); });
  paints.forEach(function (p) { sh.getRange(p[0], p[1], p[4], p[2]).setBackground(p[3]); });
  sh.getRange(1, 1).setFontSize(14);
  sh.getRange(1, 1, grid.length, WIDTH).setVerticalAlignment('middle');
  sh.setRowHeight(1, 36);
  sh.getRange(4, 2, grid.length - 3, 1).setHorizontalAlignment('right');
  sh.getRange(1, 4).setFontColor('#999999');

  sh.getRange(4, 4, grid.length - 3, 3).setHorizontalAlignment('left'); // Dennis block D:F (Paul, 2026-09-15)
  // The Dennis block has no Notes column: drop column H so the gap column follows the
  // Interest column directly (Paul, 2026-09-15). Formulas shift with their cells.
  sh.deleteColumn(8);
  // Narrow spacer column on the left, like the old tab (Paul, 2026-09-15). Inserting
  // after the build shifts every formula on the tab along with its cell.
  sh.insertColumnBefore(1);
  sh.setColumnWidth(1, 20);
  sh.getRange(1, 1, sh.getMaxRows(), 1).setBackground(null); // the insert copies the neighbour's fills

  console.log('Property tab rebuilt for "' + name + '": ' + grid.length + ' rows');
  return { ok: true, rows: grid.length };
}

/** The value right of the first cell (columns A:B) whose label starts with `label`, or ''. */
function readLabelledValue_(sh, label) {
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 2) return '';
  var rows = sh.getRange(1, 1, sh.getLastRow(), 3).getValues();
  for (var i = 0; i < rows.length; i++) {
    for (var c = 0; c < 2; c++) {
      if (String(rows[i][c]).indexOf(label) === 0) return rows[i][c + 1] === '' ? '' : rows[i][c + 1];
    }
  }
  return '';
}

/** The Properties row for a name as an object keyed by header, or {} if absent. */
function propertyRow_(ss, name) {
  var sheet = ss.getSheetByName('Properties');
  if (!sheet || sheet.getLastRow() < 2) return {};
  var cols = headerIndex_(sheet);
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][cols['name'] - 1]) === name) {
      var out = {};
      Object.keys(cols).forEach(function (h) { out[h] = rows[i][cols[h] - 1]; });
      return out;
    }
  }
  return {};
}

var HELPER_SHEET = 'Journal helpers';

/** Hidden sheet holding the Journal-wide "voided?" flag every property tab reads. */
function ensureJournalHelpers_(ss) {
  var sh = ss.getSheetByName(HELPER_SHEET);
  if (!sh) { sh = ss.insertSheet(HELPER_SHEET); sh.hideSheet(); }
  sh.getRange(1, 1).setValue('voided? (txn_id named by a void)');
  sh.getRange(2, 1).setFormula('=ARRAYFORMULA(IF(Journal!$A$2:$A$5000="","",ISNUMBER(MATCH(Journal!$A$2:$A$5000,Journal!$Y$2:$Y$5000,0))))');
  return sh;
}

/** Advances.repaid_date values for this property's advances of one kind, in the
 *  Advances tab's row order (the order the tab's FILTER lists them), as yyyy-mm-dd text. */
function advanceRepaidDates_(ss, name, purchaseKind) {
  var sheet = ss.getSheetByName('Advances');
  if (!sheet || sheet.getLastRow() < 2) return [];
  var cols = headerIndex_(sheet);
  if (!cols['property']) return [];
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var out = [];
  rows.forEach(function (r) {
    if (String(r[cols['property'] - 1]) !== name) return;
    var isPurchase = cols['kind'] ? String(r[cols['kind'] - 1]) === 'purchase' : false;
    if (isPurchase !== purchaseKind) return;
    var v = cols['repaid_date'] ? r[cols['repaid_date'] - 1] : '';
    out.push(v === '' ? '' : formatIsoDate_(v));
  });
  return out;
}

// ---- End Date typed on a property tab -> Advances.repaid_date (2026-09-15) -----------
// Installable onEdit trigger (this is a standalone script, so a simple onEdit would not
// fire). When a cell in the End Date column of a property tab's advance schedule
// changes, the matching Advances row (same property, start date, principal) gets its
// repaid_date set or cleared. The app's accrual engine and the tab's interest formulas
// both stop at that date (D-011).
// Line blocks (Rehab Costs at J, Utilities at R): payee/date/description/amount, then
// the Paul Paid / Dennis Paid / Recast Account checkbox columns at c0+4..c0+6 and the
// txn_id column at c0+7 (Q / Y). The checkbox columns are spills keyed by that txn_id.
var PT_HEAVY_STRIDE = 5;   // Payee, Date, Description, Amount, spacer
// The old 104 Ashburne tab's block order (2026-09-17 snapshot); trades seen on the
// Journal but not listed here follow, then '(no trade)' and Utilities.
var PT_HEAVY_ORDER = ['Paint & Flooring', 'Trash', 'Lighting & Electrical', 'Master Bath', 'Small Baths', 'Pool',
  'Landscaping', 'Chimney/FIreplace/Glass', 'Kitchen', 'Appliances', 'HVAC', 'House Hardware',
  'Countertops & Backsplash', 'Equipment Rentals', 'Pest Control', 'Insurance - Farmers Insurance',
  'Cleaning', 'Supplies', 'Gas/Truck/Trailer', 'Marketing'];
function colLetter_(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
function heavyBlocks_(ss, name) {
  var journal = ss.getSheetByName('Journal'); var cols = headerIndex_(journal); var last = journal.getLastRow();
  var seen = {};
  if (last > 1 && cols['property'] && cols['trade']) {
    var v = journal.getRange(2, 1, last - 1, journal.getLastColumn()).getValues();
    v.forEach(function (r) { if (String(r[cols['property'] - 1]) === name) { var t = String(r[cols['trade'] - 1] || '').trim(); if (t) seen[t] = true; } });
  }
  var out = PT_HEAVY_ORDER.filter(function (t) { return true; });
  Object.keys(seen).sort().forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); });
  out.push('(no trade)'); out.push('Utilities');
  return out;
}
// Values for a heavy tab: rehab lines by trade (Holding lines under Utilities).
function refreshHeavyBlocks_(ss, name) {
  var sh = ss.getSheetByName(name); if (!sh) return;
  var journal = ss.getSheetByName('Journal'); var cols = headerIndex_(journal); var last = journal.getLastRow();
  var rows = last > 1 ? journal.getRange(2, 1, last - 1, journal.getLastColumn()).getValues() : [];
  var g = function (r, n) { return cols[n] ? r[cols[n] - 1] : ''; };
  var voided = {}; rows.forEach(function (r) { var v = String(g(r, 'void_of') || ''); if (v) voided[v] = true; });
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  var lines = rows.filter(function (r) {
    return String(g(r, 'property')) === name && String(g(r, 'source')) !== 'void' && !voided[String(g(r, 'txn_id'))] && formatIsoDate_(g(r, 'date')) <= today;
  });
  var isRehab = function (r) { var cc = String(g(r, 'cost_class')); return cc === 'Rehab' || (cc === 'Acquisition' && String(g(r, 'account')) !== '1000'); };
  heavyBlocks_(ss, name).forEach(function (blk, i) {
    var pick = blk === 'Utilities' ? function (r) { return String(g(r, 'cost_class')) === 'Holding'; }
             : blk === '(no trade)' ? function (r) { return isRehab(r) && !String(g(r, 'trade') || '').trim(); }
             : function (r) { return isRehab(r) && String(g(r, 'trade') || '').trim() === blk; };
    var out = lines.filter(pick).map(function (r) { return [g(r, 'payee'), g(r, 'date'), g(r, 'description'), Number(g(r, 'debit') || 0) - Number(g(r, 'credit') || 0)]; });
    out.sort(function (x, y) { return formatIsoDate_(x[1]) < formatIsoDate_(y[1]) ? -1 : formatIsoDate_(x[1]) > formatIsoDate_(y[1]) ? 1 : 0; });
    out = out.slice(0, PT_LINES_N); while (out.length < PT_LINES_N) out.push(['', '', '', '']);
    sh.getRange(6, 10 + i * PT_HEAVY_STRIDE, PT_LINES_N, 4).setValues(out);
  });
}
var PT_BLOCK_COLS = [10, 18];        // Light template
function ptBlockCols_(ss, name) {
  var reg = propertyRow_(ss, name) || {};
  return String(reg.template || '').toLowerCase() === 'heavy' ? [] : PT_BLOCK_COLS;
}
var PT_TXN_OFFSET = 7;
var PT_LINES_N = 300;
var PT_PAID_BY = [['PAUL', '2030'], ['DENNIS', '2010'], ['1401', '']]; // checkbox k -> paid_from, credit account ('' = the bank code itself)

// Rewrites a property tab's Rehab Costs and Utilities rows from the Journal: live
// lines (not a void, not voided, dated on or before today) on that property, Rehab
// class plus Acquisition other than 1000 in the first block, Holding class in the
// second, oldest first. Values, not formulas, so the checkboxes can be clicked. Called
// by setupPropertyTab and, through refreshLineBlocksFor_, after every Journal write.
function refreshLineBlocks_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return;
  if (String((propertyRow_(ss, name) || {}).template || '').toLowerCase() === 'heavy') { refreshHeavyBlocks_(ss, name); return; }
  var journal = ss.getSheetByName('Journal');
  var cols = headerIndex_(journal);
  var last = journal.getLastRow();
  var rows = last > 1 ? journal.getRange(2, 1, last - 1, journal.getLastColumn()).getValues() : [];
  var g = function (r, n) { return cols[n] ? r[cols[n] - 1] : ''; };
  var voided = {};
  rows.forEach(function (r) { var v = String(g(r, 'void_of') || ''); if (v) voided[v] = true; });
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  var lines = rows.filter(function (r) {
    return String(g(r, 'property')) === name && String(g(r, 'source')) !== 'void' &&
      !voided[String(g(r, 'txn_id'))] && formatIsoDate_(g(r, 'date')) <= today;
  });
  var blocks = [
    function (r) { var cc = String(g(r, 'cost_class')); return cc === 'Rehab' || (cc === 'Acquisition' && String(g(r, 'account')) !== '1000'); },
    function (r) { return String(g(r, 'cost_class')) === 'Holding'; }
  ];
  blocks.forEach(function (crit, b) {
    var out = lines.filter(crit).map(function (r) {
      var pf = String(g(r, 'paid_from') || '');
      return [g(r, 'payee'), g(r, 'date'), g(r, 'description'), Number(g(r, 'debit') || 0) - Number(g(r, 'credit') || 0),
        pf === 'PAUL', pf === 'DENNIS', pf.slice(0, 2) === '14', g(r, 'txn_id')];
    });
    out.sort(function (x, y) { return formatIsoDate_(x[1]) < formatIsoDate_(y[1]) ? -1 : formatIsoDate_(x[1]) > formatIsoDate_(y[1]) ? 1 : 0; });
    out = out.slice(0, PT_LINES_N);
    while (out.length < PT_LINES_N) out.push(['', '', '', '', false, false, false, '']);
    sh.getRange(6, ptBlockCols_(ss, name)[b], PT_LINES_N, 8).setValues(out);
  });
}

// After a Journal write: refresh the tab of every property the lines name. Never
// fails the write - a tab that cannot be refreshed is rebuilt from the menu.
function refreshLineBlocksFor_(ss, lines) {
  var seen = {};
  lines.forEach(function (l) {
    var p = String(l.property || '');
    if (!p || p === 'OVERHEAD' || seen[p]) return;
    seen[p] = true;
    try { refreshLineBlocks_(ss, p); } catch (err) { console.error('refreshLineBlocks_ ' + p + ': ' + err); }
  });
}

// A click on a Paul Paid / Dennis Paid / Recast Account checkbox: void the entry and
// re-post it with the new paid_from (append-only ledger - the original stays,
// voided). A cash box from PAUL/DENNIS lands on 1401; change it on the Journal if it
// was Chase. Refused (with a toast) when the period is closed or the box was unticked.
function repaidFromEdit_(e, sh, ss, row, col) {
  var bc = ptBlockCols_(ss, sh.getName());
  if (!bc.length) return;
  var c0 = col < bc[1] ? bc[0] : bc[1];
  var k = col - (c0 + 4);
  var toast = function (msg) { ss.toast(msg, 'Recast Books', 8); };
  var txnId = String(sh.getRange(row, c0 + PT_TXN_OFFSET).getValue() || '');
  try {
    if (!txnId) return;
    if (e.value !== 'TRUE' && e.value !== true) { toast('Tick the box of who paid instead; nothing changed.'); return; }
    repaidFromTxn_(e, ss, txnId, k, toast);
  } finally {
    refreshLineBlocks_(ss, sh.getName()); // puts the boxes back to what the Journal says, changed or not
  }
}

function repaidFromTxn_(e, ss, txnId, k, toast) {

  var journal = ss.getSheetByName('Journal');
  var cols = headerIndex_(journal);
  var rowsIdx = findAllRowsByValue_(journal, cols['txn_id'], txnId);
  if (rowsIdx.length === 0) { toast('No Journal rows for ' + txnId); return; }
  var width = journal.getLastColumn();
  var orig = rowsIdx.map(function (r) {
    var values = journal.getRange(r, 1, 1, width).getValues()[0];
    var obj = {};
    Object.keys(cols).forEach(function (n) { obj[n] = values[cols[n] - 1]; });
    return obj;
  });
  var oldPaidFrom = String(orig[0].paid_from || '');
  var newPaidFrom = PT_PAID_BY[k][0];
  if (k === 2 && oldPaidFrom.slice(0, 2) === '14') newPaidFrom = oldPaidFrom;
  if (newPaidFrom === oldPaidFrom) return; // already so
  var newAccount = PT_PAID_BY[k][1] || newPaidFrom;
  var period = String(orig[0].period || String(orig[0].date).slice(0, 7));
  if (periodStatus_(ss.getSheetByName('Periods'), period) === 'closed') { toast('Period ' + period + ' is closed; ' + txnId + ' unchanged.'); return; }
  var cents = function (v) { return Math.round(Number(v || 0) * 100); };
  var isCreditSide = function (l) { return cents(l.credit) > 0 && (String(l.account).slice(0, 2) === '14' || l.account === '2030' || l.account === '2010'); };
  if (!orig.some(isCreditSide)) { toast(txnId + ' has no paid-from line to move.'); return; }
  var date = formatIsoDate_(orig[0].date);
  var lines = orig.map(function (l) {
    var moved = isCreditSide(l);
    return {
      account: moved ? newAccount : String(l.account), debit: cents(l.debit), credit: cents(l.credit),
      property: l.property, cost_class: moved ? '' : l.cost_class, tax_treatment: moved ? '' : l.tax_treatment,
      trade: l.trade, payee: l.payee, description: l.description, paid_from: newPaidFrom,
      reconciled_ref: '', business_purpose: l.business_purpose, attendee: l.attendee,
      destination: l.destination, odometer: l.odometer
    };
  });
  var firstDebit = lines.filter(function (l) { return l.debit > 0; })[0];
  var user = (e.user && e.user.getEmail && e.user.getEmail()) || 'sheet';
  var entry = {
    txn_id: makeTxnId('manual', date, firstDebit), date: date, period: period,
    memo: String(orig[0].memo || '') + ' (paid from ' + newPaidFrom + ', was ' + oldPaidFrom + ')',
    source: 'manual', posted_by: user, doc_url: orig[0].doc_url || '', void_of: '', lines: lines
  };
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  try {
    voidEntry_(txnId, 'paid_from ' + oldPaidFrom + ' -> ' + newPaidFrom, today, user, props, true);
    postEntry_(entry, props);
  } catch (err) {
    toast('Could not move ' + txnId + ': ' + ((err && err.code) || 'ERROR') + ' - ' + String((err && err.message) || err));
    return;
  }
  warmCache_();
  toast('Re-posted ' + txnId + ' as ' + entry.txn_id + ', paid from ' + newPaidFrom + (k === 2 && newPaidFrom === '1401' && oldPaidFrom.slice(0, 2) !== '14' ? ' (1401 assumed; fix on the Journal if it was Chase)' : '') + '.');
}

var PROPERTY_TAB_START_COL = 5;   // E after the spacer column: Start Date
var PROPERTY_TAB_END_COL = 6;     // F: End Date (typed)
var PROPERTY_TAB_PRINCIPAL_COL = 7; // G: Principal

// One installable onEdit trigger for the whole workbook (forSpreadsheet, not
// forSheet) - onPropertyTabEdit's own dispatch on the edited sheet's name covers
// the property-tab End Date column, the phase2.7-spec.md section 4 Bank
// accounts->Accounts mirror, and the Users last-owner guard. A simple onEdit(e)
// can't be used because this is a standalone-turned-bound project (D-023) and
// simple triggers can't call PropertiesService/UrlFetchApp-touching code reliably;
// installable ones run with full authorization.
function installTriggers() {
  var props = PropertiesService.getScriptProperties();
  var ss = openOrCreateWorkbook_(props);
  var have = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onPropertyTabEdit'; });
  if (!have) ScriptApp.newTrigger('onPropertyTabEdit').forSpreadsheet(ss).onEdit().create();
  console.log('onPropertyTabEdit trigger ' + (have ? 'already installed' : 'installed'));
}

function onPropertyTabEdit(e) {
  try {
    var range = e.range;
    var editedSheet = range.getSheet();
    var edited = editedSheet.getName();
    // Menu.gs caches the posting ctx and each user's role (6 h); a hand edit on one of
    // these tabs is the only change the writer's own invalidation would not see.
    if (edited === 'Accounts' || edited === 'Properties' || edited === 'Periods') { CacheService.getScriptCache().remove('ctx'); return; }
    if (edited === 'Bank accounts') { mirrorBankAccountEdit_(editedSheet, range); return; }
    if (edited === 'Users') { clearRoleCache_(editedSheet); guardLastOwnerEdit_(e, editedSheet, range); return; }

    var col = range.getColumn();
    var isPaidBox = range.getNumRows() === 1 && range.getNumColumns() === 1 && range.getRow() >= 6 &&
      ptBlockCols_(editedSheet.getParent(), edited).some(function (c0) { return col >= c0 + 4 && col <= c0 + 6; });
    if (col !== PROPERTY_TAB_END_COL && !isPaidBox) return;
    if (range.getNumColumns() !== 1) return;
    var sh = editedSheet;
    var ss = sh.getParent();
    var name = sh.getName();
    var propSheet = ss.getSheetByName('Properties');
    if (!propSheet || propSheet.getLastRow() < 2) return;
    var pcols = headerIndex_(propSheet);
    var names = propSheet.getRange(2, pcols['name'], propSheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
    if (names.indexOf(name) === -1) return;
    if (isPaidBox) { repaidFromEdit_(e, sh, ss, range.getRow(), col); return; }
    var adv = ss.getSheetByName('Advances');
    var acols = headerIndex_(adv);
    var rows = adv.getRange(2, 1, Math.max(1, adv.getLastRow() - 1), adv.getLastColumn()).getValues();
    for (var i = 0; i < range.getNumRows(); i++) {
      var row = range.getRow() + i;
      var start = sh.getRange(row, PROPERTY_TAB_START_COL).getValue();
      var principal = sh.getRange(row, PROPERTY_TAB_PRINCIPAL_COL).getValue();
      if (start === '' || principal === '') continue; // not an advance row
      var typed = sh.getRange(row, PROPERTY_TAB_END_COL).getValue();
      var repaid = typed === '' ? '' : formatIsoDate_(typed);
      var startIso = formatIsoDate_(start);
      for (var j = 0; j < rows.length; j++) {
        var r = rows[j];
        if (String(r[acols['property'] - 1]) !== name) continue;
        if (formatIsoDate_(r[acols['date'] - 1]) !== startIso) continue;
        if (Math.round(Number(r[acols['amount'] - 1]) * 100) !== Math.round(Number(principal) * 100)) continue;
        adv.getRange(j + 2, acols['repaid_date']).setValue(repaid);
        if (acols['status']) adv.getRange(j + 2, acols['status']).setValue(repaid ? 'repaid' : 'open');
        break;
      }
    }
  } catch (err) {
    console.error('onPropertyTabEdit: ' + err);
  }
}

// phase2.7-spec.md section 4 guard (a): editing/adding a Bank accounts row mirrors
// it into Accounts, same rule as books-meta.mjs's POST upsert on that tab.
function mirrorBankAccountEdit_(sh, range) {
  if (range.getRow() < 2) return; // header row
  var cols = headerIndex_(sh);
  if (!cols['code'] || !cols['name']) return;
  var firstRow = range.getRow();
  var lastRow = firstRow + range.getNumRows() - 1;
  var accounts = sh.getParent().getSheetByName('Accounts');
  if (!accounts) return;
  var accCols = headerIndex_(accounts);
  for (var r = firstRow; r <= lastRow; r++) {
    var code = sh.getRange(r, cols['code']).getValue();
    var bankName = sh.getRange(r, cols['name']).getValue();
    if (!code || !bankName) continue; // incomplete row, nothing to mirror yet
    // Create only: an Accounts row that already exists keeps its own name (the
    // Netlify-era mirror overwrote 1401/1402 with "Cash - " and a doubled name).
    if (findRowByValue_(accounts, accCols['code'], String(code)) !== -1) continue;
    upsertRow_(accounts, accCols, 'code',
      { code: String(code), name: 'Cash - ' + bankName, series: '1400', type: 'asset', active: true });
  }
}

// phase2.7-spec.md section 4 guard (b): refuses to change the last listed owner's
// role away from "owner" - reverts the cell and toasts instead of throwing, since
// this runs from a user's own edit, not a menu action with a dialog to show an error in.
function clearRoleCache_(usersSheet) {
  var cols = headerIndex_(usersSheet);
  var last = usersSheet.getLastRow();
  if (last < 2 || !cols['email']) return;
  var keys = usersSheet.getRange(2, cols['email'], last - 1, 1).getValues()
    .map(function (r) { return 'role:' + String(r[0]).toLowerCase(); });
  CacheService.getScriptCache().removeAll(keys);
}

function guardLastOwnerEdit_(e, sh, range) {
  if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) return; // only single-cell role edits are guarded
  var cols = headerIndex_(sh);
  if (!cols['role'] || range.getColumn() !== cols['role']) return;
  if (range.getValue() === 'owner') return; // becoming owner never needs a guard
  if (e.oldValue !== 'owner') return; // wasn't owner before this edit - nothing to protect

  var lastRow = sh.getLastRow();
  var roles = lastRow >= 2 ? sh.getRange(2, cols['role'], lastRow - 1, 1).getValues() : [];
  var ownersLeft = roles.filter(function (r) { return r[0] === 'owner'; }).length;
  if (ownersLeft === 0) {
    range.setValue('owner');
    sh.getParent().toast('Cannot demote or remove the last owner. Reverted.', 'Recast Books');
  }
}

/** Number of Advances rows naming this property: purchase-principal ones (kind =
 *  "purchase") when `purchaseKind` is true, every other kind when false. */
function countAdvances_(ss, name, purchaseKind) {
  var sheet = ss.getSheetByName('Advances');
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var cols = headerIndex_(sheet);
  if (!cols['property']) return 0;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return rows.filter(function (r) {
    if (String(r[cols['property'] - 1]) !== name) return false;
    var isPurchase = cols['kind'] ? String(r[cols['kind'] - 1]) === 'purchase' : false;
    return purchaseKind ? isPurchase : !isPurchase;
  }).length;
}

/** 1-based column index -> A1 letters (1 -> A, 27 -> AA). Used only to build formula text. */
function colLetter_(c) {
  var s = '';
  while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); }
  return s;
}

/** Editor helper: rebuild the tab of every property in the Properties tab (no args). */
function rebuildAllPropertyTabs() {
  var props = PropertiesService.getScriptProperties();
  var sheet = openOrCreateWorkbook_(props).getSheetByName('Properties');
  var cols = headerIndex_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  sheet.getRange(2, cols['name'], lastRow - 1, 1).getValues().forEach(function (row) {
    if (row[0]) setupPropertyTab(String(row[0]));
  });
}

// ---- selfTest (phase2.7-spec.md section 3) ---------------------------------------
// Run from the editor (function dropdown -> selfTest -> Run) after every push: proves
// the V8 runtime actually accepts lib.gs's generated syntax (??, ?., classes) and that
// buildEntry/accruedThrough still produce the values the rest of the books depend on.
// Uses lib.gs's globals (ACCOUNTS, makeCtx, buildEntry, accruedThrough) directly - they
// are in scope here exactly as they are for any other file in this project.
function selfTest() {
  var accounts = new Map(ACCOUNTS.map(function (a) { return [a.code, a]; }));
  var ctx = makeCtx({
    accounts: accounts, properties: new Set(['TEST Self Test']), periods: new Map(), today: '2026-09-15'
  });
  var entry = buildEntry({
    type: 'expense', date: '2026-09-10', payee: 'Home Depot', description: 'Drywall',
    amount_cents: 21240, account: '1030', property: 'TEST Self Test', paid_from: '1401',
    source: 'manual', posted_by: 'selftest'
  }, ctx);
  if (!entry || entry.lines.length !== 2) fail_('SELFTEST_FAILED', 'buildEntry did not return a balanced 2-line entry');
  if (entry.lines[0].debit !== 21240 || entry.lines[1].credit !== 21240) {
    fail_('SELFTEST_FAILED', 'buildEntry lines do not match the fixture amount');
  }

  // 881 Newport-shaped fixture: a $207,000 advance dated 2026-03-05, accrued to
  // 2026-09-15 (D-016's 8%, compounding monthly on the advance's own anniversary).
  var advance = { amount_cents: 20700000, date: '2026-03-05' };
  var interestCents = accruedThrough(advance, '2026-09-15');
  if (!(interestCents > 0)) fail_('SELFTEST_FAILED', 'accruedThrough did not accrue positive interest');

  Logger.log('selfTest OK: entry ' + entry.txn_id + ' (' + entry.lines.length + ' lines), interest ' +
    fromCents(interestCents) + ' on the fixture advance');
  return { ok: true, txn_id: entry.txn_id, interest: fromCents(interestCents) };
}

// ---- D-013 / D-025: clear the Journal once, by hand, from the editor --------------
// Not a menu item and never a button (D-013). Deletes every data row of the Journal
// (headers stay) and rebuilds Totals. Refuses unless Script Property CLEAR_CONFIRM
// equals this workbook's id - so the property must be set on THIS project, minutes
// before, on purpose; it is deleted again on success. Used on the STAGING copy between
// reruns (D-025) and exactly once on the real workbook at cutover (D-013).
function clearBooks() {
  var props = PropertiesService.getScriptProperties();
  var ss = openOrCreateWorkbook_(props);
  var confirm = props.getProperty('CLEAR_CONFIRM') || '';
  if (confirm !== ss.getId()) {
    fail_('CLEAR_NOT_CONFIRMED', 'Set Script Property CLEAR_CONFIRM to this workbook id (' + ss.getId() +
      ') and run again. Workbook name: ' + ss.getName());
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = ss.getSheetByName('Journal');
    var rows = sh.getLastRow() - 1;
    if (rows > 0) sh.deleteRows(2, rows);
    props.deleteProperty('CLEAR_CONFIRM');
    setupTotals();
    console.log('CLEARED Journal: ' + rows + ' row(s) removed from "' + ss.getName() + '" (' + ss.getId() + ')');
    return { cleared: rows, workbook: ss.getName() };
  } finally {
    lock.releaseLock();
  }
}

// ---- Phase 4 (D-024): register every property the old workbook carries -----------
// Facts read from the 2026-09-17 snapshot (data/migration/2026-09-17/old-workbook-
// snapshot.xlsx): purchase date and principal from each tab's Purchase line, status
// from the Sales tab. Settlement dates known only where the tab records an end date;
// Paul fills the rest. Idempotent: addProperty upserts by name. Run from the editor
// on the STAGING project first; on the real workbook at cutover.
// D-031: charges dated after a property sold. Registered like a property so the tab, the posting
// rules and the payout machinery apply unchanged; the sold property's name rides in `trade`.
var COST_RECAPTURE_PROPERTY = { name: 'Cost Recapture', address: 'Charges after a property has sold', status: 'held', template: 'Light', dennis_funded: 'false', dennis_share_pct: '50',
  notes: 'D-031: post-sale charges, the sold property named in the trade column; reconciled when the next property sells' };

function migrationRegisterProperties(skipRebuild) {
  // tax_annual: the old tabs' "Property Tax (Prorated)" annual figure - the property tab's estimate of the seller's
  // proration at closing (Texas taxes are paid in arrears; TREC para. 13). Posted 1100 lines are actual payments.
  var list = [
    { name: '104 Ashburne', tax_annual: '14707.58', address: '104 Ashburne Glen Ln, Red Oak TX', status: 'held', purchase_date: '2025-12-02', purchase_price: '325000', template: 'Heavy', dennis_funded: 'true', dennis_share_pct: '0', dennis_commission_pct: '3', notes: 'Phase 4 migration; BANK-ONLY deal: Dennis earns 12% interest + 3% of sale, no profit share (Paul 2026-09-17); STILL HELD - has not closed (Paul 2026-09-18); tax_annual is the 2025 levy, the $16,031.25 paid 03-30 included 9% penalty and interest' },
    { name: '1616 Granite', address: '1616 Granite Way, Waxahachie TX', status: 'held', purchase_date: '2026-04-07', purchase_price: '279001', settlement_date: '2026-07-27', template: 'Light', dennis_funded: 'true', notes: 'Phase 4 migration' },
    { name: '280 Sparkling', address: '280 Sparkling Springs, Waxahachie TX', status: 'held', purchase_date: '2026-06-02', purchase_price: '196850.50', settlement_date: '2026-08-06', template: 'Light', dennis_funded: 'true', notes: 'Phase 4 migration' },
    { name: '881 Newport', tax_annual: '7941.61', address: '881 Newport Dr, Ferris TX 75125', status: 'held', purchase_date: '2026-06-29', purchase_price: '207000', template: 'Light', dennis_funded: 'true', notes: 'Phase 4 migration; UNDER CONTRACT, not closed (Paul 2026-09-21; Bison Title file 260910) - held until it settles' },
    { name: '136 Bowling Green', tax_annual: '9357', address: '136 Bowling Green', status: 'held', purchase_date: '2026-06-02', purchase_price: '294651', template: 'Light', dennis_funded: 'true', notes: 'Phase 4 migration' },
    { name: '206 White Rock', tax_annual: '10715.55', address: '206 White Rock', status: 'held', purchase_date: '2026-06-02', purchase_price: '184500', template: 'Light', dennis_funded: 'true', notes: 'Phase 4 migration' },
    { name: '366 Mesa', tax_annual: '470.57', address: '366 Mesa', status: 'held', purchase_date: '2026-08-04', purchase_price: '123645', template: 'Light', dennis_funded: 'true', notes: 'Phase 4 migration' },
    { name: '469 Brushwood', tax_annual: '7854', address: '469 Brushwood Ln, Waxahachie TX 75165', status: 'held', purchase_date: '2026-09-01', purchase_price: '253000', template: 'Light', dennis_funded: 'true', notes: 'Phase 4 migration' },
    // Pipeline (Sales tab "Waiting on market"): not purchased. Pre-acquisition costs
    // (eviction checks, earnest money, due diligence) accumulate here so nothing is lost;
    // if the deal never closes they are written off then (Paul, 2026-09-17).
    { name: '413 Green Acres', address: '413 Green Acres', status: 'held', template: 'Light', dennis_funded: 'false', dennis_share_pct: '50', notes: 'PIPELINE - not purchased; pre-acquisition costs only' },
    { name: '200 Janice', address: '200 Janice', status: 'held', template: 'Light', dennis_funded: 'false', dennis_share_pct: '50', notes: 'PIPELINE - not purchased; pre-acquisition costs only' },
    COST_RECAPTURE_PROPERTY
  ];
  var ss0 = openOrCreateWorkbook_(PropertiesService.getScriptProperties());
  ensureHeaders_(ss0.getSheetByName('Properties'), TAB_HEADERS['Properties']);   // adds dennis_commission_pct
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var r = addProperty(list[i], skipRebuild === true);
    out.push(list[i].name + ' -> ' + (r.ok ? (r.created ? 'created' : 'updated') : 'FAILED ' + r.message));
  }
  console.log(out.join('\n'));
  return out;
}


// ---- Phase 4: the old workbook's Dennis advances, as Advances rows (D-011/D-022) ------
// Purchase principal and cash advances per property tab (2026-09-17 snapshot), Ashburne's
// Cash Advances tab in full. Rates are the old books' (9%; Ashburne 12%), per advance.
// `into` is where the money landed: 1000 for a purchase, a bank code for a draw, 2030 when it
// reimbursed Paul or paid a contractor on his behalf. D-032 (Paul 2026-09-18: "dennis has no direct
// payments. only cash advances and loan for purchase"): an advance is financing, never a cost -
// the Ashburne tab's own rows carry the cost, so the 15 "Dennis Paid ..." lines land on 2030.
// Sold properties get their repaid_date so interest stops at the sale.
// Clear and rerun (D-025.2): the Advances tab and the advances' Journal lines are removed first,
// then the whole list is posted. Until 2026-09-18 this skipped any advance whose Advances row
// existed - and clearBooks() leaves that tab alone, so Granite's three (from the Phase 2.6 gate)
// kept their rows and lost their Journal entries (independent audit, finding 2).
/** Staging only (D-025.2: never correct in place - clear and rerun). Removes the receipt lane
 *  and any earlier migration pass from the Journal - txn_ids receipt-* and migration-*, and the
 *  voids that name them - and keeps everything else (the advances and purchases registered by
 *  migrationRegisterAdvances, whose Advances rows would otherwise point at nothing).
 *  Refuses any workbook whose name does not say STAGING; the real workbook is cleared once, at
 *  cutover, by clearBooks() behind its own confirmation (D-013). */
function migrationClearReceiptLane() {
  var props = PropertiesService.getScriptProperties();
  var ss = openOrCreateWorkbook_(props);
  if (ss.getName().indexOf('STAGING') === -1) fail_('NOT_STAGING', 'refusing to clear "' + ss.getName() + '"');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = ss.getSheetByName('Journal');
    var cols = headerIndex_(sh);
    var last = sh.getLastRow();
    if (last < 2) return { removed: 0, kept: 0 };
    var width = sh.getLastColumn();
    var vals = sh.getRange(2, 1, last - 1, width).getValues();
    var gone = function (id) { id = String(id || ''); return id.indexOf('receipt-') === 0 || id.indexOf('migration-') === 0; };
    var keep = [], removedIds = {};
    vals.forEach(function (r) {
      if (gone(r[cols['txn_id'] - 1]) || gone(r[cols['void_of'] - 1])) removedIds['txn:' + r[cols['txn_id'] - 1]] = true;
      else keep.push(r);
    });
    sh.getRange(2, 1, last - 1, width).clearContent();
    if (keep.length) sh.getRange(2, 1, keep.length, width).setValues(keep);
    var keys = Object.keys(removedIds), cache = CacheService.getScriptCache();
    for (var i = 0; i < keys.length; i += 100) cache.removeAll(keys.slice(i, i + 100));   // or a rerun reads DUPLICATE from the cache
    console.log('CLEARED receipt lane: ' + (vals.length - keep.length) + ' line(s) removed, ' + keep.length + ' kept, in "' + ss.getName() + '"');
    return { removed: vals.length - keep.length, kept: keep.length };
  } finally {
    lock.releaseLock();
  }
}

/** One Run for the staging pass: clear the receipt lane, then post the rows. If the log ends
 *  "run again", run migrationPostRows() (not this) until left=0. */
function migrationRunStaging() {
  migrationRegisterProperties(true);   // idempotent; Cost Recapture included, tax_annual and notes kept current; tabs are rebuilt at the end
  migrationClearReceiptLane();
  return migrationPostRows();
}

/** D-029: the row-driven migration's bulk pass - the old rows, posted as Paul typed them, each
 *  with its receipt link. MIGRATION_ENTRIES is a generated MigrationData.gs
 *  (scripts/migration-rows.py) pushed with the staging or cutover writer only, never kept in the
 *  repo's writer folder. No gates: this is history. Every entry is built by the same posting
 *  engine as everything else (balanced, D-010 enforced); if one does not build, nothing posts.
 *  Resumable: a txn_id already in the Journal is skipped. Property tabs are rebuilt once, at the end. */
function migrationPostRows() {
  if (typeof MIGRATION_ENTRIES === 'undefined') throw new Error('MigrationData.gs is not in this project');
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var ss = openOrCreateWorkbook_(props);
  var ctx = buildCtx_(ss);
  var sheet = ss.getSheetByName('Journal');
  var cols = headerIndex_(sheet);
  var have = {};
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, cols['txn_id'], sheet.getLastRow() - 1, 1).getValues().forEach(function (r) { have[String(r[0])] = true; });
  }
  var built = [], failed = [], already = 0;
  MIGRATION_ENTRIES.forEach(function (e) {
    if (have[e.txn_id]) { already++; return; }
    try {
      var entry = buildEntry({
        type: 'expense', date: e.date, amount_cents: Math.abs(e.amount_cents), payee: e.payee, description: e.description,
        account: e.account, property: e.property, paid_from: e.paid_from, trade: e.trade || '', memo: e.memo || '',
        doc_url: e.doc_url || '', business_purpose: e.business_purpose || '', attendee: e.attendee || '',
        source: 'migration', posted_by: 'migration'
      }, ctx);
      // A negative old row is a refund Paul typed: the same entry with its sides swapped.
      if (e.amount_cents < 0) entry.lines.forEach(function (l) { var d = l.debit; l.debit = l.credit; l.credit = d; });
      entry.txn_id = e.txn_id;   // identity is the old row (tab, row, block), not the amount: the old books repeat rows
      built.push(entry);
    } catch (err) {
      failed.push(e.txn_id + ' ' + e.date + ' ' + e.payee + ': ' + ((err && err.code) || '') + ' ' + ((err && err.message) || err));
    }
  });
  if (failed.length) {
    failed.forEach(function (f) { console.error(f); });
    throw new Error(failed.length + ' entries do not build - nothing posted. First: ' + failed[0]);
  }
  // One append under the writer's lock. postBatchEntries_ looks each txn_id up in the Journal
  // with a TextFinder (~0.9 s an entry: 300 entries in 4.5 min, 2026-09-18); here the ids were
  // already filtered against the Journal above and are unique by construction, and every entry
  // was built and balanced by the posting engine, so the rows are written in one setValues.
  var posted = 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var postedAt = new Date();
    var rows = [];
    built.forEach(function (entry) {
      entry.period = String(entry.date).slice(0, 7);
      entry.lines.forEach(function (line, idx) { rows.push(buildJournalRow_(cols, entry, line, idx + 1, postedAt)); });
    });
    if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    posted = built.length;
  } finally {
    lock.releaseLock();
  }
  var left = built.length - posted;
  if (!left) rebuildAllPropertyTabs();
  console.log('MIGRATION entries=' + MIGRATION_ENTRIES.length + ' already=' + already + ' posted=' + posted + ' left=' + left + (left ? ' - run again' : ' - tabs rebuilt'));
  return { posted: posted, already: already, left: left };
}

/** Empties the Advances tab and removes the advances' own Journal lines, so the list below is
 *  posted whole. Only where that cannot hurt: a workbook named STAGING, or one whose Journal is
 *  empty (the cutover, right after clearBooks). Anywhere else it refuses. */
function migrationResetAdvances_(ss, advSheet) {
  var journal = ss.getSheetByName('Journal');
  var jLast = journal.getLastRow();
  if (ss.getName().indexOf('STAGING') === -1 && jLast > 1) fail_('NOT_EMPTY', 'refusing to reset advances in "' + ss.getName() + '": its Journal has entries. Run clearBooks() first (cutover).');
  var aLast = advSheet.getLastRow();
  if (aLast < 2) return;
  var aCols = headerIndex_(advSheet);
  var ids = {};
  advSheet.getRange(2, aCols['source_txn_id'], aLast - 1, 1).getValues().forEach(function (r) { if (r[0]) ids[String(r[0])] = true; });
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (jLast > 1) {
      var jCols = headerIndex_(journal), width = journal.getLastColumn();
      var vals = journal.getRange(2, 1, jLast - 1, width).getValues();
      var keep = vals.filter(function (r) { return !ids[String(r[jCols['txn_id'] - 1])] && !ids[String(r[jCols['void_of'] - 1])]; });
      journal.getRange(2, 1, jLast - 1, width).clearContent();
      if (keep.length) journal.getRange(2, 1, keep.length, width).setValues(keep);
      console.log('RESET advances: ' + (vals.length - keep.length) + ' Journal line(s) removed');
    }
    advSheet.getRange(2, 1, aLast - 1, advSheet.getLastColumn()).clearContent();
    var keys = Object.keys(ids).map(function (id) { return 'txn:' + id; }), cache = CacheService.getScriptCache();
    for (var i = 0; i < keys.length; i += 100) cache.removeAll(keys.slice(i, i + 100));   // or the re-post reads DUPLICATE from the cache
  } finally {
    lock.releaseLock();
  }
}

function migrationRegisterAdvances() {
  var L = [
    ['1616 Granite', 'purchase', '2026-04-07', 279001, '1000', 9, 'Purchase principal (migration)', '2026-07-27'],
    ['1616 Granite', 'cash', '2026-06-01', 5500, '2030', 9, 'Cash advance, reimbursed Paul - part of a $7,000 check, $1,500 went to Bowling Green (migration)', '2026-07-27'],
    ['1616 Granite', 'cash', '2026-06-05', 1338, '2030', 9, 'Cash advance, reimbursed Paul (migration)', '2026-07-27'],
    ['280 Sparkling', 'purchase', '2026-06-02', 196850.50, '1000', 9, 'Purchase principal (migration)', '2026-08-06'],
    ['881 Newport', 'purchase', '2026-06-29', 207000, '1000', 9, 'Purchase principal (migration)', ''],
    ['881 Newport', 'cash', '2026-07-09', 2000, '2030', 9, 'Cash advance, reimbursed Paul (migration)', ''],
    ['469 Brushwood', 'purchase', '2026-09-01', 253000, '1000', 9, 'Purchase principal (migration)', ''],
    ['366 Mesa', 'purchase', '2026-08-04', 123645, '1000', 9, 'Purchase principal (migration)', ''],
    ['366 Mesa', 'cash', '2026-08-12', 10000, '1401', 9, 'Cash advance (migration)', ''],
    ['136 Bowling Green', 'purchase', '2026-06-02', 294651, '1000', 9, 'Purchase principal (migration)', ''],
    ['136 Bowling Green', 'cash', '2026-06-01', 1500, '1402', 9, 'Cash advance (migration)', ''],
    ['206 White Rock', 'purchase', '2026-06-02', 184500, '1000', 9, 'Purchase principal (migration)', ''],
    ['104 Ashburne', 'purchase', '2025-12-02', 325000, '1000', 12, 'Purchase principal, Auction.com (migration)', ''],
    ['104 Ashburne', 'cash', '2025-12-10', 200, '2030', 12, 'Cash advance - Julio, trash removal (migration)', ''],
    ['104 Ashburne', 'cash', '2025-12-11', 200, '2030', 12, 'Cash advance - Julio, pool clean out (migration)', ''],
    ['104 Ashburne', 'cash', '2026-01-08', 200, '2030', 12, 'Cash advance - Julio, labor (migration)', ''],
    ['104 Ashburne', 'cash', '2026-01-12', 7000, '2030', 12, 'Cash advance - Juanito, drywall/supplies/painting (migration)', ''],
    ['104 Ashburne', 'cash', '2026-01-23', 7000, '2030', 12, 'Cash advance - Juanito, painting (migration)', ''],
    ['104 Ashburne', 'cash', '2026-01-24', 606.70, '2030', 12, 'Cash advance - Robinson Air, HVAC (migration)', ''],
    ['104 Ashburne', 'cash', '2026-02-04', 50000, '1402', 12, 'Draw - rehab (migration)', ''],
    ['104 Ashburne', 'cash', '2026-03-06', 60000, '1402', 12, 'Draw - rehab (migration)', ''],
    ['104 Ashburne', 'cash', '2026-03-30', 20000, '1402', 12, 'Draw - rehab (migration)', ''],
    ['104 Ashburne', 'cash', '2026-04-08', 20000, '1402', 12, 'Draw - rehab (migration)', ''],
    ['104 Ashburne', 'cash', '2026-04-10', 400, '2030', 12, 'Cash advance - Julio, labor (migration)', ''],
    ['104 Ashburne', 'cash', '2026-04-16', 21, '2030', 12, 'Cash advance - City of Corsicana dump (migration)', ''],
    ['104 Ashburne', 'cash', '2026-04-22', 199, '2030', 12, 'Cash advance - listing fee (Iley) (migration)', ''],
    ['104 Ashburne', 'cash', '2026-05-04', 250, '2030', 12, 'Cash advance - Julio, labor (migration)', ''],
    ['104 Ashburne', 'cash', '2026-05-05', 1065.74, '2030', 12, 'Cash advance - Robinson Air, HVAC (migration)', ''],
    ['104 Ashburne', 'cash', '2026-05-07', 299, '2030', 12, 'Cash advance - listing fee (Iley) (migration)', ''],
    ['104 Ashburne', 'cash', '2026-05-21', 250, '2030', 12, 'Cash advance - Julio, labor (migration)', ''],
    ['104 Ashburne', 'cash', '2026-06-29', 8000, '1402', 12, 'Draw - buyer repairs (migration)', ''],
    ['104 Ashburne', 'cash', '2026-07-13', 150, '2030', 12, 'Cash advance - Julio, landscaping (migration)', ''],
    ['104 Ashburne', 'cash', '2026-07-27', 300, '2030', 12, 'Cash advance - Julio, landscaping (migration)', '']
  ];
  var props = PropertiesService.getScriptProperties();
  var ss = openOrCreateWorkbook_(props);
  var advSheet = ss.getSheetByName('Advances');
  migrationResetAdvances_(ss, advSheet);
  var out = [];
  L.forEach(function (a) {
    var key = a[0] + '|' + a[2] + '|' + a[3];
    var r = addAdvance({ kind: a[1], property: a[0], date: a[2], amount: a[3], into: a[4], rate_pct: a[5], memo: a[6] }, true);
    if (r.ok && a[7]) {
      var c2 = headerIndex_(advSheet);
      upsertRow_(advSheet, c2, 'advance_id', { advance_id: r.advance_id, repaid_date: a[7], status: 'repaid' });
    }
    out.push(key + ' -> ' + (r.ok ? r.advance_id : 'FAILED ' + r.message));
  });
  // one rebuild per property, not one per advance (33 advances took 14 minutes, 19 of them Ashburne rebuilds)
  var seen = {};
  L.forEach(function (a) {
    if (seen[a[0]]) return;
    seen[a[0]] = true;
    try { setupPropertyTab(a[0]); } catch (err) { out.push(a[0] + ' tab rebuild FAILED ' + String((err && err.message) || err)); }
  });
  warmCache_();
  console.log(out.join('\n'));
  return out;
}
