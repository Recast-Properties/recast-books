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

  TAB_ORDER.forEach(function (name) {
    var sheet = getOrCreateSheet_(ss, name);
    ensureHeaders_(sheet, TAB_HEADERS[name]);
    forceTextColumns_(sheet, TAB_HEADERS[name]);
  });

  seedIfEmpty_(ss.getSheetByName('Accounts'), ACCOUNTS_SEED);
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

var WRITER_VERSION = '0.3.0';
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
    'settlement_date', 'template', 'dennis_funded', 'drive_folder', 'notes', 'contract_price'],
  'Bank accounts': ['code', 'name', 'institution', 'last4', 'plaid_item_id',
    'plaid_account_id', 'opening_balance', 'opening_date', 'active'],
  'Vendors': ['canonical', 'aliases', 'entity_type', 'form_1099', 'tin_status',
    'w9_url', 'default_account', 'notes'],
  'Advances': ['advance_id', 'date', 'amount', 'property', 'source_txn_id',
    'status', 'accrued_to', 'repaid_date', 'notes'],
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
  ['tax_home', 'unknown', '']
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

function openOrCreateWorkbook_(props) {
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.create(WORKBOOK_NAME);
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
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
  var id = props.getProperty('SPREADSHEET_ID');
  if (!id) fail_('NOT_SETUP', 'Run setup() first');
  return SpreadsheetApp.openById(id);
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
  var entry = body.entry;
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

    return jsonOutput_({ ok: true, rows: [startRow, startRow + rows.length - 1] });
  } finally {
    lock.releaseLock();
  }
}

function action_void_(body, props) {
  var txnId = body.txn_id;
  var reason = body.reason || '';
  var date = body.date;
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
        source: 'void', posted_by: body.posted_by || 'system',
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

    return jsonOutput_({ ok: true, rows: [startRow, startRow + rows.length - 1], txn_id: voidTxnId });
  } finally {
    lock.releaseLock();
  }
}

function action_read_(body, props) {
  var tab = body.tab;
  var allowed = ['Accounts', 'Properties', 'Bank accounts', 'Vendors', 'Periods',
    'Settings', 'Users', 'Journal', 'Advances'];
  if (allowed.indexOf(tab) === -1) fail_('BAD_TAB', 'tab not readable: ' + tab);

  var ss = openWorkbook_(props);
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

  return jsonOutput_({ ok: true, headers: headers, rows: out });
}

function action_setPeriod_(body, props) {
  var period = body.period;
  var status = body.status;
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

  return jsonOutput_({ ok: true, period: period, status: status });
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
  if (!cols[keyColumn]) fail_('BAD_KEY_COLUMN', 'key_column not found: ' + keyColumn);

  var keyValue = rowData[keyColumn];
  if (keyValue === undefined || keyValue === null || keyValue === '') {
    fail_('BAD_REQUEST', 'row must include the key column value');
  }

  var ignored = [];
  Object.keys(rowData).forEach(function (name) {
    if (!cols[name]) ignored.push(name);
  });

  var existingRow = findRowByValue_(sheet, cols[keyColumn], keyValue);
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

  return jsonOutput_({ ok: true, tab: tab, created: created, ignored: ignored });
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
  var entries = body.entries;
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

    return jsonOutput_({ ok: true, posted: postedIds, rows: [startRow, startRow + allRows.length - 1] });
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

  var target = getOrCreateDocsRootFolder_(props);
  folder.forEach(function (segment) {
    target = getOrCreateSubfolder_(target, String(segment));
  });

  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mime, name);
  var file = target.createFile(blob);

  return jsonOutput_({ ok: true, fileId: file.getId(), url: file.getUrl(), folderUrl: target.getUrl() });
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
// the editor via setupPropertyTab(name). Formula-only view, same bounded-range /
// SUMPRODUCT / FILTER / voided-pair-helper-column pattern as setupTotals above (read
// that function's header comment first):
//   - SUMMARY: cost by cost_class (Acquisition/Rehab/Holding/Financing/Selling),
//     total project cost, paid-by-Paul and paid-by-Dennis-direct - all SUMPRODUCT
//     over bounded Journal rows for this property, as of $B$1, voids excluded.
//   - DENNIS: this property's Advances rows (date/amount/notes), each with interest
//     computed in-sheet per the D-006 method at Settings!interest_rate_annual
//     (D-016: 8%): full monthly anniversaries via DATEDIF, balance compounded
//     monthly, a simple stub over Settings!stub_days_basis for the remainder - then
//     accrued interest and payoff totals as of $B$1. The FILTER/INDEX/interest math
//     lives in a small helper block (columns K:R) alongside each visible advance
//     row; columns A:C just point at it.
//   - PRELIMINARY PAYOUT: Settings estimate_agent_pct/estimate_closing_pct against
//     purchase_price (there is no better sale-price figure yet - Phase 5's sell
//     wizard will add one), less total project cost and the Dennis payoff.
//   - LINES: one block per cost class, date/payee/description/amount/paid-by, via
//     the same FILTER-over-bounded-Journal-rows idiom, bounded per class rather
//     than an open spill so a later block never has to guess how far to sit below it.
//   - POST-SALE (D-015): the same line shape for rows dated after
//     Properties.settlement_date, unbounded by $B$1's "as of".
// The tab is a view - nothing on it is typed. Sold properties keep their tab.
var PROPERTY_COST_CLASSES = ['Acquisition', 'Rehab', 'Holding', 'Financing', 'Selling'];

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
  sh.clear();

  var N = 5000;     // Journal bound, same as setupTotals
  var ADV_N = 30;   // Advances shown/computed for this property - generous headroom
  var LINES_N = 60; // Journal lines shown per cost-class / post-sale block - bounded

  var J = function (col) { return 'Journal!$' + col + '$2:$' + col + '$' + N; };
  var A = function (col) { return 'Advances!$' + col + '$2:$' + col + '$' + N; };

  // "is this Journal txn_id voided" - same ARRAYFORMULA-over-a-helper-column trick
  // as setupTotals, parked at column Z, well past this tab's own content (col <= R).
  var live = '(' + J('P') + '<>"void")*($Z$2:$Z$' + N + '<>TRUE)*(' + J('H') + '&""="' + safeName + '"&"")*(' + J('C') + '<=$B$1)';
  var classFactor = function (cls) { return '(' + J('I') + '&""="' + cls + '"&"")*'; };
  var paidFromFactor = function (who) { return '(' + J('N') + '&""="' + who + '"&"")*'; };
  var netCost = function (factor) { return 'SUMPRODUCT(' + factor + live + '*(' + J('F') + '-' + J('G') + '))'; };

  var WIDTH = 18; // A..R - covers the DENNIS advance rows' K..R helper columns
  var rows = [];
  var bold = [];
  var push = function (r, isBold) {
    var padded = r.slice();
    while (padded.length < WIDTH) padded.push('');
    rows.push(padded);
    if (isBold) bold.push(rows.length);
  };

  // Row 1: name / as-of (the $B$1 every block below reads) / status / purchase date
  // / purchase price, looked up live from Properties.
  push([name, '=TODAY()',
    '=IFERROR(VLOOKUP("' + safeName + '",Properties!A:C,3,FALSE),"")',
    '=IFERROR(VLOOKUP("' + safeName + '",Properties!A:D,4,FALSE),"")',
    '=IFERROR(VLOOKUP("' + safeName + '",Properties!A:E,5,FALSE),"")'], true);
  push(['name / as of / status / purchase date / purchase price', '', '', '', '']);
  push(['', '', '', '', '']);

  // ---- SUMMARY -----------------------------------------------------------------
  push(['SUMMARY', '', '', '', ''], true);
  var classFirst = rows.length + 1;
  PROPERTY_COST_CLASSES.forEach(function (cls) {
    push([cls, '=' + netCost(classFactor(cls)), '', '', '']);
  });
  var classLast = rows.length;
  push(['Total project', '=SUM(B' + classFirst + ':B' + classLast + ')', '', '', ''], true);
  var totalProjectRow = rows.length;
  push(['Paid by Paul', '=' + netCost(paidFromFactor('PAUL')), '', '', '']);
  push(['Paid by Dennis direct', '=' + netCost(paidFromFactor('DENNIS')), '', '', '']);
  push(['', '', '', '', '']);

  // ---- DENNIS: advances, interest (D-006/D-016), payoff -------------------------
  push(['DENNIS', '', '', '', ''], true);
  push(['Date', 'Amount', 'Notes', '', '']);
  var advFirst = rows.length + 1;
  for (var i = 0; i < ADV_N; i++) {
    var r = rows.length + 1;
    var idx = i + 1;
    var crit = '(' + A('D') + '&""="' + safeName + '"&"")*(' + A('B') + '<>"")';
    var kF = '=IFERROR(INDEX(FILTER(' + A('B') + ',' + crit + '),' + idx + '),"")';
    var lF = '=IF(K' + r + '="","",INDEX(FILTER(' + A('C') + ',' + crit + '),' + idx + '))';
    var mF = '=IF(K' + r + '="","",INDEX(FILTER(' + A('I') + ',' + crit + '),' + idx + '))';
    // n = full monthly anniversaries up to the as-of date (DATEDIF "m" counts whole
    // elapsed months); balance compounds monthly; the remainder since the last
    // anniversary is a simple stub over Settings!stub_days_basis (D-006).
    var nF = '=IF(K' + r + '="","",IFERROR(DATEDIF(K' + r + ',$B$1,"m"),0))';
    var oF = '=IF(K' + r + '="","",L' + r + '*(1+$U$1/12)^N' + r + ')';
    var pF = '=IF(K' + r + '="","",EDATE(K' + r + ',N' + r + '))';
    var qF = '=IF(K' + r + '="","",MAX(0,$B$1-P' + r + '))';
    var iF = '=IF(K' + r + '="","",O' + r + '*(1+$U$1/12*Q' + r + '/$V$1)-L' + r + ')';
    push(['=K' + r, '=L' + r, '=M' + r, '', '', '', '', '', '', '', kF, lF, mF, nF, oF, pF, qF, iF]);
  }
  var advLast = rows.length;
  push(['', '', '', '', '']);
  push(['Accrued interest as of B1', '=SUM(R' + advFirst + ':R' + advLast + ')', '', '', '']);
  var interestRow = rows.length;
  // ponytail: assumes no advance has been repaid yet (Advances.status/repaid_date
  // are not netted out here) - fold that in if/when a repayment is ever recorded.
  push(['Payoff as of B1', '=SUM(L' + advFirst + ':L' + advLast + ')+B' + interestRow, '', '', ''], true);
  var payoffRow = rows.length;
  push(['', '', '', '', '']);

  // ---- PRELIMINARY PAYOUT --------------------------------------------------------
  push(['PRELIMINARY PAYOUT', '', '', '', ''], true);
  // D-017: the contract price (Properties column K) when a buyer is under contract,
  // else the purchase price as a placeholder.
  push(['Estimated sale price (contract price if set, else purchase price)',
    '=IF($Y$1<>"",$Y$1,IF($E$1="",0,$E$1))', '', '', '']);
  var saleRow = rows.length;
  push(['Agent commission (Settings estimate_agent_pct)',
    '=B' + saleRow + '*IFERROR(VLOOKUP("estimate_agent_pct",Settings!A:B,2,FALSE),0)/100', '', '', '']);
  var agentRow = rows.length;
  push(['Closing costs (Settings estimate_closing_pct)',
    '=B' + saleRow + '*IFERROR(VLOOKUP("estimate_closing_pct",Settings!A:B,2,FALSE),0)/100', '', '', '']);
  var closingRow = rows.length;
  // Net profit = net proceeds - total project cost (purchase principal and posted
  // interest are inside project cost, as on the old tab). Dennis takes principal +
  // accrued interest + half; Paul half plus what he fronted (2030 lines here).
  push(['Net profit (net proceeds - total project cost)',
    '=B' + saleRow + '-B' + agentRow + '-B' + closingRow + '-B' + totalProjectRow, '', '', ''], true);
  var profitRow = rows.length;
  push(['Individual share (50%)', '=B' + profitRow + '/2', '', '', '']);
  var shareRow = rows.length;
  push(['Dennis - payoff + share', '=B' + payoffRow + '+B' + shareRow, '', '', ''], true);
  push(['Paul - share + reimbursement of costs he paid', '=B' + shareRow + '+B' + (totalProjectRow + 1), '', '', ''], true);
  push(['', '', '', '', '']);

  // ---- LINES: one bounded block per cost class -----------------------------------
  PROPERTY_COST_CLASSES.forEach(function (cls) {
    push(['LINES - ' + cls, '', '', '', ''], true);
    push(['Date', 'Payee', 'Description', 'Amount', 'Paid by']);
    var crit = classFactor(cls) + live;
    for (var li = 0; li < LINES_N; li++) {
      var lr = rows.length + 1;
      var lidx = li + 1;
      var dF = '=IFERROR(INDEX(FILTER(' + J('C') + ',' + crit + '),' + lidx + '),"")';
      var payeeF = '=IF(A' + lr + '="","",INDEX(FILTER(' + J('L') + ',' + crit + '),' + lidx + '))';
      var descF = '=IF(A' + lr + '="","",INDEX(FILTER(' + J('M') + ',' + crit + '),' + lidx + '))';
      var amtF = '=IF(A' + lr + '="","",INDEX(FILTER(' + J('F') + '-' + J('G') + ',' + crit + '),' + lidx + '))';
      var paidF = '=IF(A' + lr + '="","",INDEX(FILTER(' + J('N') + ',' + crit + '),' + lidx + '))';
      push([dF, payeeF, descF, amtF, paidF]);
    }
    push(['', '', '', '', '']);
  });

  // ---- POST-SALE (D-015): lines dated after Properties.settlement_date ----------
  push(['POST-SALE (D-015)', '', '', '', ''], true);
  push(['Date', 'Payee', 'Description', 'Amount', 'Paid by']);
  var postLive = '(' + J('P') + '<>"void")*($Z$2:$Z$' + N + '<>TRUE)*(' + J('H') + '&""="' + safeName + '"&"")*(' +
    J('C') + '>$X$1)*($X$1<>"")';
  for (var pi = 0; pi < LINES_N; pi++) {
    var pr = rows.length + 1;
    var pidx = pi + 1;
    var pdF = '=IFERROR(INDEX(FILTER(' + J('C') + ',' + postLive + '),' + pidx + '),"")';
    var ppayeeF = '=IF(A' + pr + '="","",INDEX(FILTER(' + J('L') + ',' + postLive + '),' + pidx + '))';
    var pdescF = '=IF(A' + pr + '="","",INDEX(FILTER(' + J('M') + ',' + postLive + '),' + pidx + '))';
    var pamtF = '=IF(A' + pr + '="","",INDEX(FILTER(' + J('F') + '-' + J('G') + ',' + postLive + '),' + pidx + '))';
    var ppaidF = '=IF(A' + pr + '="","",INDEX(FILTER(' + J('N') + ',' + postLive + '),' + pidx + '))';
    push([pdF, ppayeeF, pdescF, pamtF, ppaidF]);
  }

  sh.getRange(1, 1, rows.length, WIDTH).setValues(rows);

  // Constants and the voided-flag helper, parked past WIDTH (columns 21/22/24/26)
  // so they never collide with the padded grid above.
  sh.getRange(1, 21).setFormula('=IFERROR(VLOOKUP("interest_rate_annual",Settings!A:B,2,FALSE),0)'); // U1: rate
  sh.getRange(1, 22).setFormula('=IFERROR(VLOOKUP("stub_days_basis",Settings!A:B,2,FALSE),30)'); // V1: stub basis
  sh.getRange(1, 24).setFormula('=IFERROR(VLOOKUP("' + safeName + '",Properties!A:F,6,FALSE),"")'); // X1: settlement_date
  sh.getRange(1, 25).setFormula('=IFERROR(VLOOKUP("' + safeName + '",Properties!A:K,11,FALSE),"")'); // Y1: contract_price (D-017)
  sh.getRange(1, 26).setValue('helper: voided?'); // Z1
  sh.getRange(2, 26).setFormula('=ARRAYFORMULA(IF(' + J('A') + '="","",ISNUMBER(MATCH(' + J('A') + ',' + J('Y') + ',0))))'); // Z2
  sh.getRange(1, 21, 1, 6).setFontColor('#999999');
  sh.getRange(advFirst, 11, ADV_N, 8).setFontColor('#999999');

  sh.getRange(1, 2).setNumberFormat('yyyy-mm-dd');
  sh.getRange(1, 4).setNumberFormat('yyyy-mm-dd');
  sh.getRange(1, 24).setNumberFormat('yyyy-mm-dd');
  sh.getRange(advFirst, 1, ADV_N, 1).setNumberFormat('yyyy-mm-dd');
  sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 110); sh.setColumnWidth(3, 160);
  sh.setColumnWidth(4, 110); sh.setColumnWidth(5, 110);
  sh.setFrozenRows(1);
  bold.forEach(function (r2) { sh.getRange(r2, 1, 1, 5).setFontWeight('bold'); });

  console.log('Property tab rebuilt for "' + name + '": ' + rows.length + ' rows');
  return { ok: true, rows: rows.length };
}
