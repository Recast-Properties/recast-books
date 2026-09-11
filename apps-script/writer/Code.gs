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
      default: return jsonOutput_({ ok: false, error: 'BAD_ACTION' });
    }
  } catch (err) {
    var code = (err && err.code) ? err.code : 'INTERNAL';
    return jsonOutput_({ ok: false, error: code, message: String(err && err.message ? err.message : err) });
  }
}

// ---- config ---------------------------------------------------------------

var WRITER_VERSION = '0.1.1';
var WORKBOOK_NAME = 'Recast Books';

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
    'settlement_date', 'template', 'dennis_funded', 'drive_folder', 'notes'],
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
  ['interest_rate_annual', '0.09', ''],
  ['stub_days_basis', '30', ''],
  ['dealer_status', 'unknown', ''],
  ['cash_or_accrual', 'unknown', ''],
  ['de_minimis_elected', 'unknown', ''],
  ['tax_home', 'unknown', '']
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

function fail_(code, message) {
  var err = new Error(message || code);
  err.code = code;
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
    'Settings', 'Users', 'Journal'];
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
    var limit = Math.max(1, Math.min(parseInt(body.limit, 10) || 200, 2000));
    if (dataRows.length > limit) dataRows = dataRows.slice(dataRows.length - limit);
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
  var allowed = ['Properties', 'Bank accounts', 'Vendors', 'Users', 'Settings'];
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
