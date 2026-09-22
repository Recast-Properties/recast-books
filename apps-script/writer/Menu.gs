/****************************************************************
 * Recast Books - workbook menu
 *
 * phase2.7-spec.md section 4: the input side of the books, run from a custom
 * menu in the bound workbook instead of the web app. Every write goes through
 * the same engine as before (lib.gs, generated from lib/) and the same
 * action handler internals (postEntry_, voidEntry_, postBatchEntries_,
 * setPeriodStatus_) Code.gs's web endpoint uses - this file is a second front
 * door onto them, not a second copy of the rules.
 *
 * ASCII ONLY below - same paste-into-the-editor constraint as Code.gs.
 ****************************************************************/

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Recast Books')
    .addItem('New expense...', 'showExpenseDialog')
    .addItem('New journal entry...', 'showJournalDialog')
    .addItem('Void selected entry...', 'voidSelected')
    .addItem('Inbox...', 'showInboxSidebar')
    .addSeparator()
    .addItem('Add property...', 'showPropertyDialog')
    .addItem('Rebuild property tab', 'rebuildPropertyTab')
    .addItem('Add advance...', 'showAdvanceDialog')
    .addItem('Post interest...', 'showInterestDialog')
    .addSeparator()
    .addItem('Sell property...', 'showSellDialog')
    .addSeparator()
    .addItem('Close period...', 'closePeriod')
    .addItem('Reopen period...', 'reopenPeriod')
    .addSeparator()
    .addSubMenu(ui.createMenu('Reports')
      .addItem('Trial balance', 'reportTrialBalance')
      .addItem('Balance sheet', 'reportBalanceSheet')
      .addItem('P&L', 'reportProfitAndLoss')
      .addItem('Job cost', 'reportJobCost')
      .addItem('Dennis ledger', 'reportDennisLedger'))
    .addSeparator()
    .addItem('Self test', 'runSelfTestFromMenu')
    .addToUi();
}

// ---- access control ---------------------------------------------------------------

/** The active user's Users.role, or null if they are not listed. */
function currentUserRole_(ss) {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  // 6 h role cache; onPropertyTabEdit clears it on any Users-tab edit (the old email may
  // also be cleared by hand: CacheService key 'role:<email>').
  var cache = CacheService.getScriptCache();
  var cached = cache.get('role:' + email);
  if (cached) return cached === '-' ? null : cached;
  var role = readUserRole_(ss, email);
  cache.put('role:' + email, role || '-', 21600);
  return role;
}

function readUserRole_(ss, email) {
  var sheet = ss.getSheetByName('Users');
  var cols = headerIndex_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !cols['email'] || !cols['role']) return null;
  var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][cols['email'] - 1]).toLowerCase() === email) return String(rows[i][cols['role'] - 1]);
  }
  return null;
}

// Every writing menu action requires role "owner"; reports only require the user to
// be listed at all (any role - phase0-spec.md section 5's read-only roles still read).
// Fails with a ui alert and throws (fail_), matching every other refusal in this
// project, so a caller's own try/catch (or an unguarded call from the menu, which
// just surfaces the alert) both work.
function requireOwner_(ss, allowAnyRole) {
  var role;
  try {
    role = currentUserRole_(ss);
  } catch (err) {
    // A missing scope (userinfo.email) or an unreadable Users tab surfaces here; say
    // so instead of letting the callers' catch swallow it into "nothing happened".
    SpreadsheetApp.getUi().alert('Could not check your role: ' + String((err && err.message) || err));
    fail_('FORBIDDEN', 'role check failed');
  }
  var ok = allowAnyRole ? !!role && role !== 'removed' : role === 'owner';
  if (ok) return;
  var message = allowAnyRole
    ? 'You are not listed on the Users tab - ask an owner to add you.'
    : 'Only an owner can do this' + (role ? ' (you are "' + role + '")' : ' (you are not listed on the Users tab)') + '.';
  SpreadsheetApp.getUi().alert(message);
  fail_('FORBIDDEN', message);
}

// ---- posting ctx / pickers ----------------------------------------------------------

/** The Apps Script equivalent of _shared.mjs's getPostingCtx, read straight off the
 *  sheets instead of over HTTP - accounts (active only), properties (open only, per
 *  lib.gs's isOpenProperty), periods, today in America/Chicago. */
function buildCtx_(ss) {
  // Six sheet reads (~1.1 s) - cached 6 h as plain arrays. Cleared by every writer upsert
  // and period change (Code.gs) and by a hand edit on Accounts/Properties/Periods (the
  // onEdit trigger); postBatchEntries_ re-checks the period lock itself regardless.
  var cache = CacheService.getScriptCache();
  var cached = cache.get('ctx');
  if (cached) {
    var c = JSON.parse(cached);
    return makeCtx({ accounts: new Map(c.accounts), properties: new Set(c.properties), periods: new Map(c.periods),
      today: Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd') });
  }
  var built = readCtx_(ss);
  cache.put('ctx', JSON.stringify({ accounts: Array.from(built.accounts.entries()), properties: Array.from(built.properties),
    periods: Array.from(built.periods.entries()) }), 21600);
  return makeCtx(built);
}

function readCtx_(ss) {
  var accSheet = ss.getSheetByName('Accounts');
  var accCols = headerIndex_(accSheet);
  var accLast = accSheet.getLastRow();
  var accRows = accLast > 1 ? accSheet.getRange(2, 1, accLast - 1, accSheet.getLastColumn()).getValues() : [];
  var accounts = new Map();
  accRows.forEach(function (r) {
    var active = String(r[accCols['active'] - 1]).trim().toLowerCase();
    if (active === 'false' || active === '0' || active === 'no') return;
    var code = String(r[accCols['code'] - 1]);
    accounts.set(code, {
      code: code, name: r[accCols['name'] - 1], series: String(r[accCols['series'] - 1]),
      type: r[accCols['type'] - 1], cost_class: r[accCols['cost_class'] - 1] || '',
      tax_treatment: r[accCols['tax_treatment'] - 1] || ''
    });
  });

  var propSheet = ss.getSheetByName('Properties');
  var propCols = headerIndex_(propSheet);
  var propLast = propSheet.getLastRow();
  var propRows = propLast > 1 ? propSheet.getRange(2, 1, propLast - 1, propSheet.getLastColumn()).getValues() : [];
  var properties = new Set();
  propRows.forEach(function (r) {
    var name = r[propCols['name'] - 1];
    if (name && isOpenProperty({ status: r[propCols['status'] - 1] })) properties.add(String(name));
  });

  var perSheet = ss.getSheetByName('Periods');
  var perCols = headerIndex_(perSheet);
  var perLast = perSheet.getLastRow();
  var perRows = perLast > 1 ? perSheet.getRange(2, 1, perLast - 1, perSheet.getLastColumn()).getValues() : [];
  var periods = new Map();
  perRows.forEach(function (r) { periods.set(normalizePeriod_(r[perCols['period'] - 1]), r[perCols['status'] - 1]); });

  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  return { accounts: accounts, properties: properties, periods: periods, today: today };
}

/** Account/property/bank-account lists and the current interest rate, for the
 *  dialogs' pickers - web/app.js's accountOptions/propertyOptions/paidFromOptions
 *  equivalent, computed in-process instead of from a GET /api/meta round trip. */
function pickerData_(ss) {
  var accSheet = ss.getSheetByName('Accounts');
  var accCols = headerIndex_(accSheet);
  var accLast = accSheet.getLastRow();
  var accRows = accLast > 1 ? accSheet.getRange(2, 1, accLast - 1, accSheet.getLastColumn()).getValues() : [];
  var accounts = accRows
    .filter(function (r) { return String(r[accCols['active'] - 1]).trim().toLowerCase() !== 'false'; })
    .map(function (r) { return { code: String(r[accCols['code'] - 1]), name: String(r[accCols['name'] - 1]) }; });

  var propSheet = ss.getSheetByName('Properties');
  var propCols = headerIndex_(propSheet);
  var propLast = propSheet.getLastRow();
  var propRows = propLast > 1 ? propSheet.getRange(2, 1, propLast - 1, propSheet.getLastColumn()).getValues() : [];
  var properties = propRows
    .filter(function (r) { return isOpenProperty({ status: r[propCols['status'] - 1] }); })
    .map(function (r) { return String(r[propCols['name'] - 1]); })
    .filter(Boolean);

  var bankSheet = ss.getSheetByName('Bank accounts');
  var bankCols = headerIndex_(bankSheet);
  var bankLast = bankSheet.getLastRow();
  var bankRows = bankLast > 1 ? bankSheet.getRange(2, 1, bankLast - 1, bankSheet.getLastColumn()).getValues() : [];
  var bankAccounts = bankRows.map(function (r) {
    return { code: String(r[bankCols['code'] - 1]), name: String(r[bankCols['name'] - 1]) };
  });

  var setSheet = ss.getSheetByName('Settings');
  var setCols = headerIndex_(setSheet);
  var setLast = setSheet.getLastRow();
  var setRows = setLast > 1 ? setSheet.getRange(2, 1, setLast - 1, setSheet.getLastColumn()).getValues() : [];
  var rateAnnual = 0.08; // D-016 default
  setRows.forEach(function (r) {
    if (r[setCols['key'] - 1] === 'interest_rate_annual') {
      var v = Number(r[setCols['value'] - 1]);
      if (v > 0) rateAnnual = v;
    }
  });

  return {
    accounts: accounts, properties: properties, bankAccounts: bankAccounts,
    interestRatePct: Math.round(rateAnnual * 10000) / 100
  };
}

// ---- dialog plumbing ----------------------------------------------------------------

/** <?!= include_('Style') ?> inside a dialog template pulls in the shared style block. */
function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function showDialog_(file, title, data) {
  var tmpl = HtmlService.createTemplateFromFile(file);
  tmpl.data = data || {};
  var html = tmpl.evaluate().setWidth(600).setHeight(560);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

/** The workbook if the active user may post, else null (requireOwner_ already
 *  alerted) - every show*Dialog_ below is "get it or bail", so this is the one
 *  place that pattern is written out. */
function openIfOwner_() {
  var ss = openWorkbook_(PropertiesService.getScriptProperties());
  try {
    requireOwner_(ss);
  } catch (err) {
    return null;
  }
  return ss;
}

function showExpenseDialog() {
  var ss = openIfOwner_();
  if (ss) showDialog_('Expense', 'New expense', pickerData_(ss));
}

function showJournalDialog() {
  var ss = openIfOwner_();
  if (ss) showDialog_('Journal', 'New journal entry', pickerData_(ss));
}

function showPropertyDialog() {
  var ss = openIfOwner_();
  if (ss) showDialog_('Property', 'Add property', {});
}

function showAdvanceDialog() {
  var ss = openIfOwner_();
  if (ss) showDialog_('Advance', 'Add advance', pickerData_(ss));
}

function showInterestDialog() {
  var ss = openIfOwner_();
  if (ss) showDialog_('Interest', 'Post interest', {});
}

// ---- New expense / New journal entry -------------------------------------------------

// google.script.run handlers return {ok:false, error, message} on refusal rather than
// throwing - a thrown Error crosses the client bridge as a generic failure, and every
// dialog needs the PostingError/writer code (D-010 OVERHEAD_ON_PROPERTY, PERIOD_CLOSED,
// DUPLICATE, ...) to show it, per phase2.7-spec.md section 4's last paragraph.
function postExpense(form) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss);
    var ctx = buildCtx_(ss);
    var intent = {
      type: 'expense', date: form.date, payee: form.payee || '', description: form.description || '',
      amount_cents: toCents(form.amount), account: form.account, property: form.property || '',
      paid_from: form.paid_from, trade: form.trade || '', business_purpose: form.business_purpose || '',
      source: 'manual', posted_by: Session.getActiveUser().getEmail()
    };
    var entry = buildEntry(intent, ctx);
    var result = postEntry_(entry, props);
    warmCache_();
    return { ok: true, txn_id: entry.txn_id, rows: result.rows, entry: entry };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

function postJournal(form) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss);
    var ctx = buildCtx_(ss);
    var lines = (form.lines || [])
      .filter(function (l) { return l.account && (l.debit || l.credit); })
      .map(function (l) {
        return {
          account: l.account, debit: l.debit ? toCents(l.debit) : 0, credit: l.credit ? toCents(l.credit) : 0,
          property: l.property || '', payee: l.payee || '', description: l.description || '',
          paid_from: l.paid_from || '', business_purpose: l.business_purpose || ''
        };
      });
    var intent = {
      type: 'journal', date: form.date, memo: form.memo || '', lines: lines,
      source: 'manual', posted_by: Session.getActiveUser().getEmail()
    };
    var entry = buildEntry(intent, ctx);
    var result = postEntry_(entry, props);
    warmCache_();
    return { ok: true, txn_id: entry.txn_id, rows: result.rows, entry: entry };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

// ---- Void selected entry --------------------------------------------------------------

function voidSelected() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var ui = SpreadsheetApp.getUi();
  try {
    requireOwner_(ss);
  } catch (err) {
    return; // requireOwner_ already alerted
  }

  var sh = ss.getActiveSheet();
  if (sh.getName() !== 'Journal') { ui.alert('Select a row on the Journal tab first.'); return; }
  var activeRange = ss.getActiveRange();
  var row = activeRange ? activeRange.getRow() : -1;
  if (row < 2) { ui.alert('Select a Journal data row (not the header) first.'); return; }

  var cols = headerIndex_(sh);
  var txnId = sh.getRange(row, cols['txn_id']).getValue();
  if (!txnId) { ui.alert('No txn_id on the selected row.'); return; }

  var resp = ui.prompt('Void ' + txnId, 'Reason for voiding this entry:', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var reason = resp.getResponseText().trim();
  if (!reason) { ui.alert('A reason is required; nothing was voided.'); return; }

  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  try {
    var result = voidEntry_(String(txnId), reason, today, Session.getActiveUser().getEmail(), props);
    warmCache_();
    ui.alert('Voided ' + txnId + ' as ' + result.txn_id + '.');
  } catch (err) {
    ui.alert('Could not void ' + txnId + ': ' + ((err && err.code) || 'ERROR') + ' - ' + String((err && err.message) || err));
  }
}

// ---- Add property / Rebuild property tab -----------------------------------------------

/** toCents/fromCents round-trip: validates a dollar string and normalizes it to
 *  "1234.56" the way the sheet already stores Properties money columns. Blank in,
 *  blank out - these fields (contract_price, tax_annual) are optional. */
function dollarsOrBlank_(v) {
  var s = String(v == null ? '' : v).trim();
  return s === '' ? '' : fromCents(toCents(s));
}

function addProperty(form, skipRebuild) {   // skipRebuild: the migration rebuilds every tab once at the end
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss);
    var name = String(form.name || '').trim();
    if (!name) return { ok: false, error: 'BAD_REQUEST', message: 'Name is required.' };
    var row = {
      name: name,
      address: form.address || '',
      status: form.status || 'held',
      purchase_date: form.purchase_date || '',
      purchase_price: dollarsOrBlank_(form.purchase_price),
      contract_price: dollarsOrBlank_(form.contract_price),
      tax_annual: dollarsOrBlank_(form.tax_annual),
      dennis_share_pct: String(form.dennis_share_pct || '50').replace('%', '').trim() || '50',
      dennis_commission_pct: String(form.dennis_commission_pct == null ? '' : form.dennis_commission_pct).replace('%', '').trim(),
      settlement_date: form.settlement_date || '',
      template: form.template || '',
      dennis_funded: form.dennis_funded || 'false',
      drive_folder: form.drive_folder || '',
      notes: form.notes || ''
    };
    var sheet = ss.getSheetByName('Properties');
    var cols = headerIndex_(sheet);
    var created = upsertRow_(sheet, cols, 'name', row);

    var tabRows = null, tabError = null;
    if (skipRebuild !== true) {
      try {
        tabRows = setupPropertyTab(name).rows;
      } catch (err) {
        tabError = String((err && err.message) || err);
      }
      warmCache_();
    }
    return { ok: true, name: name, created: created, tabRows: tabRows, tabError: tabError };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

function rebuildPropertyTab() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var ui = SpreadsheetApp.getUi();
  try {
    requireOwner_(ss);
  } catch (err) {
    return;
  }

  var propSheet = ss.getSheetByName('Properties');
  var cols = headerIndex_(propSheet);
  var names = propSheet.getLastRow() > 1
    ? propSheet.getRange(2, cols['name'], propSheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); }).filter(Boolean)
    : [];

  var active = ss.getActiveSheet().getName();
  var name = names.indexOf(active) !== -1 ? active : null;
  if (!name) {
    var resp = ui.prompt('Rebuild property tab', 'Property name (exactly as on the Properties tab):', ui.ButtonSet.OK_CANCEL);
    if (resp.getSelectedButton() !== ui.Button.OK) return;
    name = resp.getResponseText().trim();
  }
  if (!name || names.indexOf(name) === -1) { ui.alert('"' + name + '" is not on the Properties tab.'); return; }

  try {
    var result = setupPropertyTab(name);
    ui.alert('Rebuilt "' + name + '" (' + result.rows + ' rows).');
  } catch (err) {
    ui.alert('Could not rebuild "' + name + '": ' + String((err && err.message) || err));
  }
}

// ---- Add advance ------------------------------------------------------------------------
// The addAdvance flow from netlify/functions/books-dennis.mjs, moved in-process:
// kind "purchase" posts the purchase itself (Dr 1000, Cr 2010); kind "cash" lands the
// money in a bank account or 2030 (Dr 14xx/2030, Cr 2010). Then an Advances row and a
// property-tab rebuild, same as the web app's two-step flow.
// skipRebuild: the migration registers 33 advances in a row and rebuilds each tab once at the end.
function addAdvance(form, skipRebuild) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss);
    var kind = form.kind === 'purchase' ? 'purchase' : 'cash';
    var property = form.property;
    if (!property) return { ok: false, error: 'BAD_REQUEST', message: 'Choose a property.' };
    var amount_cents = toCents(form.amount);
    var date = form.date;

    var rate_pct = '';
    var rateRaw = String(form.rate_pct == null ? '' : form.rate_pct).trim().replace('%', '');
    if (rateRaw !== '') {
      rate_pct = Number(rateRaw);
      if (!(Number.isFinite(rate_pct) && rate_pct > 0 && rate_pct < 100)) {
        return { ok: false, error: 'BAD_REQUEST', message: 'Interest rate must be a percent between 0 and 100.' };
      }
    }

    var into = kind === 'purchase' ? '1000' : (form.into || '1401');
    var description = kind === 'purchase' ? 'Purchase price (Dennis purchase principal)' : 'Dennis advance';
    var memo = form.memo || '';

    var ctx = buildCtx_(ss);
    var entry = buildEntry({
      type: 'advance', date: date, amount_cents: amount_cents, property: property, into: into,
      description: description, memo: memo, source: 'manual', posted_by: Session.getActiveUser().getEmail()
    }, ctx);
    var result = postEntry_(entry, props);

    var advSheet = ss.getSheetByName('Advances');
    var advCols = headerIndex_(advSheet);
    var advanceRow = {
      advance_id: 'adv-' + entry.txn_id, date: date, amount: fromCents(amount_cents), property: property,
      source_txn_id: entry.txn_id, status: 'open', accrued_to: '', repaid_date: '', notes: memo,
      kind: kind, rate_pct: rate_pct
    };
    upsertRow_(advSheet, advCols, 'advance_id', advanceRow);

    var tabRows = null, tabError = null;
    if (skipRebuild !== true) {
      try {
        tabRows = setupPropertyTab(property).rows;
      } catch (err) {
        tabError = String((err && err.message) || err);
      }
      warmCache_();
    }
    return { ok: true, txn_id: entry.txn_id, advance_id: advanceRow.advance_id, tabRows: tabRows, tabError: tabError };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

// ---- Post interest ------------------------------------------------------------------------
// Mirrors netlify/functions/books-dennis.mjs's loadAdvances/getAccrualOpts/
// advancesDueFor/buildInterestEntry/previewInterest/postInterest, reading straight
// off the sheets instead of through the writer's read/postBatch actions.

/** Advances tab rows -> lib.gs's accrual "advance" shape. */
function loadAdvances_(ss) {
  var sheet = ss.getSheetByName('Advances');
  var cols = headerIndex_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  return rows.map(function (r) {
    var ratePct = cols['rate_pct'] ? r[cols['rate_pct'] - 1] : '';
    return {
      advance_id: String(r[cols['advance_id'] - 1] || ''),
      date: formatIsoDate_(r[cols['date'] - 1]),
      amount_cents: toCents(r[cols['amount'] - 1] || 0),
      property: String(r[cols['property'] - 1] || ''),
      status: String(r[cols['status'] - 1] || 'open'),
      accrued_to: cols['accrued_to'] ? String(r[cols['accrued_to'] - 1] || '') : '',
      repaid_date: cols['repaid_date'] && r[cols['repaid_date'] - 1] !== '' ? formatIsoDate_(r[cols['repaid_date'] - 1]) : '',
      rate_annual: ratePct !== '' && ratePct != null && Number.isFinite(Number(ratePct)) ? Number(ratePct) / 100 : undefined
    };
  });
}

/** Settings interest_rate_annual/stub_days_basis, falling back to 0.08/30 (D-016). */
function getAccrualOpts_(ss) {
  var sheet = ss.getSheetByName('Settings');
  var cols = headerIndex_(sheet);
  var lastRow = sheet.getLastRow();
  var byKey = {};
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues().forEach(function (r) {
      byKey[r[cols['key'] - 1]] = r[cols['value'] - 1];
    });
  }
  var rateAnnual = Number(byKey['interest_rate_annual']);
  var stubBasis = Number(byKey['stub_days_basis']);
  return {
    rateAnnual: Number.isFinite(rateAnnual) && rateAnnual > 0 ? rateAnnual : 0.08,
    stubBasis: Number.isFinite(stubBasis) && stubBasis > 0 ? stubBasis : 30
  };
}

function advancesDueFor_(advances, period) {
  return advances.filter(function (a) {
    return a.status === 'open' && !a.repaid_date && !(a.accrued_to && a.accrued_to >= period);
  });
}

/** Dr 1200 / Cr 2000, property on both lines, payee "Dennis Little" - same shape as
 *  books-dennis.mjs's buildInterestEntry. */
function buildInterestEntry_(advance, period, deltaCents, ctx, postedBy) {
  var date = lastDayOf(period);
  var description = 'Interest ' + period + ' on ' + advance.advance_id;
  var line = function (account, isDebit) {
    var acct = ctx.accounts.get(account);
    return {
      account: account, debit: isDebit ? deltaCents : 0, credit: isDebit ? 0 : deltaCents,
      property: advance.property, cost_class: (acct && acct.cost_class) || '', tax_treatment: (acct && acct.tax_treatment) || '',
      trade: '', payee: 'Dennis Little', description: description, paid_from: '',
      reconciled_ref: '', business_purpose: '', attendee: '', destination: '', odometer: ''
    };
  };
  var txn_id = makeTxnId('close', date, { payee: advance.advance_id, description: period });
  return {
    txn_id: txn_id, date: date, period: period, memo: description, source: 'close', posted_by: postedBy,
    doc_url: '', void_of: '', lines: [line('1200', true), line('2000', false)]
  };
}

/** {period} -> [{advance_id, property, delta_cents, entry}], one per advance with a
 *  non-zero delta for that period. No writes. */
function previewInterest(period) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss, true); // any listed role may preview (books-dennis.mjs's own rule)
    if (!/^\d{4}-\d{2}$/.test(String(period))) return { ok: false, error: 'BAD_REQUEST', message: 'period (YYYY-MM) is required.' };
    var ctx = buildCtx_(ss);
    var advances = loadAdvances_(ss);
    var accrualOpts = getAccrualOpts_(ss);
    var previews = [];
    advancesDueFor_(advances, period).forEach(function (advance) {
      var deltaCents = interestForPeriod(advance, period, accrualOpts);
      if (deltaCents === 0) return;
      var entry = buildInterestEntry_(advance, period, deltaCents, ctx, Session.getActiveUser().getEmail());
      previews.push({ advance_id: advance.advance_id, property: advance.property, delta_cents: deltaCents, memo: entry.memo });
    });
    return { ok: true, period: period, previews: previews };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

/** Validates and posts every due advance's interest for `period` as one batch, then
 *  stamps Advances.accrued_to = period on each one posted. Refuses a period that has
 *  not ended yet (interest is booked on the period's last day). */
function postInterest(period) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss);
    if (!/^\d{4}-\d{2}$/.test(String(period))) return { ok: false, error: 'BAD_REQUEST', message: 'period (YYYY-MM) is required.' };
    var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
    if (lastDayOf(period) > today) {
      return { ok: false, error: 'PERIOD_NOT_ENDED', message: 'period ' + period + ' has not ended yet.' };
    }

    var ctx = buildCtx_(ss);
    var advances = loadAdvances_(ss);
    var accrualOpts = getAccrualOpts_(ss);
    var due = advancesDueFor_(advances, period);
    var toPost = [];
    for (var i = 0; i < due.length; i++) {
      var advance = due[i];
      var deltaCents = interestForPeriod(advance, period, accrualOpts);
      if (deltaCents === 0) continue;
      var entry = buildInterestEntry_(advance, period, deltaCents, ctx, Session.getActiveUser().getEmail());
      validateEntry(entry, ctx); // refuses PERIOD_CLOSED etc before anything is posted
      toPost.push({ advance: advance, entry: entry });
    }
    if (toPost.length === 0) { warmCache_(); return { ok: true, period: period, posted: [] }; }

    var batchResult = postBatchEntries_(toPost.map(function (t) { return t.entry; }), props);

    var advSheet = ss.getSheetByName('Advances');
    var advCols = headerIndex_(advSheet);
    toPost.forEach(function (t) {
      upsertRow_(advSheet, advCols, 'advance_id', { advance_id: t.advance.advance_id, accrued_to: period });
    });
    warmCache_();
    return { ok: true, period: period, posted: batchResult.posted, rows: batchResult.rows };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

// ---- Close period / Reopen period -----------------------------------------------------

function setPeriodFromMenu_(status) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var ui = SpreadsheetApp.getUi();
  try {
    requireOwner_(ss);
  } catch (err) {
    return;
  }
  var resp = ui.prompt((status === 'closed' ? 'Close' : 'Reopen') + ' period', 'Period (YYYY-MM):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  var period = resp.getResponseText().trim();
  try {
    var result = setPeriodStatus_(period, status, props);
    ui.alert('Period ' + result.period + ' is now ' + result.status + '.');
  } catch (err) {
    ui.alert('Could not set period: ' + ((err && err.code) || 'ERROR') + ' - ' + String((err && err.message) || err));
  }
}

function closePeriod() { setPeriodFromMenu_('closed'); }
function reopenPeriod() { setPeriodFromMenu_('open'); }

// ---- Reports ----------------------------------------------------------------------------
// Every report reads the whole Journal once (readTabData_, the same date/period
// formatting the HTTP read gives), runs it through lib.gs's report functions, and
// writes the result to a tab named "Report - <name>" (ASCII hyphen - phase0-spec's
// ASCII constraint applies to sheet names too, since Code.gs writes them), cleared
// and rewritten every run.

function journalLines_(ss) {
  var data = readTabData_(ss, 'Journal', { all: true });
  return loadJournal(data.headers, data.rows);
}

/** Writes a 2D array of rows to a "Report - <name>" tab: cleared, header row bold,
 *  a title row naming the as-of/period, frozen header, then the data. `rows[0]` is
 *  the header row; the caller has already put the tie-out line at the bottom.
 *  Sheet layout: row 1 = title, row 2 = blank, row 3 = rows[0] (the header),
 *  row 4+ = the rest of `rows`. */
function writeReportRows_(ss, name, title, rows) {
  var sheetName = 'Report - ' + name;
  var sh = ss.getSheetByName(sheetName);
  if (sh) sh.clear(); else sh = ss.insertSheet(sheetName);
  var HEADER_ROW = 3;
  var body = [[title], []].concat(rows);
  var width = body.reduce(function (w, r) { return Math.max(w, r.length); }, 1);
  body = body.map(function (r) { var row = r.slice(); while (row.length < width) row.push(''); return row; });
  sh.getRange(1, 1, body.length, width).setValues(body);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(12);
  sh.getRange(HEADER_ROW, 1, 1, width).setFontWeight('bold');
  sh.setFrozenRows(HEADER_ROW);
  sh.autoResizeColumns(1, width);
  return sh;
}

function centsRow_(label, cents) { return [label, fromCents(cents || 0)]; }

function reportTrialBalance() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try { requireOwner_(ss, true); } catch (err) { return; }
  var asOf = promptDate_('Trial balance', 'As of (YYYY-MM-DD):');
  if (asOf === null) return;
  var report = trialBalance(journalLines_(ss), { asOf: asOf || undefined });
  var rows = [['Account', 'Name', 'Debit', 'Credit', 'Net']];
  report.rows.forEach(function (r) { rows.push([r.account, r.name || '', fromCents(r.debit), fromCents(r.credit), fromCents(r.net)]); });
  rows.push(['TOTAL', '', fromCents(report.total_debit), fromCents(report.total_credit), '']);
  rows.push(['Ties out', '', '', '', report.balanced ? 'YES' : 'NO - debits/credits do not match']);
  writeReportRows_(ss, 'Trial balance', 'Trial balance as of ' + (asOf || 'today'), rows);
  SpreadsheetApp.getUi().alert('Trial balance written to "Report - Trial balance".');
}

function reportBalanceSheet() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try { requireOwner_(ss, true); } catch (err) { return; }
  var asOf = promptDate_('Balance sheet', 'As of (YYYY-MM-DD):');
  if (asOf === null) return;
  var report = balanceSheet(journalLines_(ss), { asOf: asOf || undefined });
  var rows = [['', '', 'Balance']];
  rows.push(['ASSETS']);
  report.assets.forEach(function (a) { rows.push([a.account, a.name || '', fromCents(a.balance)]); });
  rows.push(['Total assets', '', fromCents(report.total_assets)]);
  rows.push([]);
  rows.push(['LIABILITIES']);
  report.liabilities.forEach(function (l) { rows.push([l.account, l.name || '', fromCents(l.balance)]); });
  rows.push(['Total liabilities', '', fromCents(report.total_liabilities)]);
  rows.push([]);
  rows.push(['EQUITY']);
  report.equity.forEach(function (e) { rows.push([e.account, e.name || '', fromCents(e.balance)]); });
  rows.push(['Current earnings', '', fromCents(report.current_earnings)]);
  rows.push(['Total equity', '', fromCents(report.total_equity)]);
  rows.push([]);
  rows.push(['Ties out (assets = liabilities + equity)', '', report.ties ? 'YES' : 'NO']);
  writeReportRows_(ss, 'Balance sheet', 'Balance sheet as of ' + (asOf || 'today'), rows);
  SpreadsheetApp.getUi().alert('Balance sheet written to "Report - Balance sheet".');
}

function reportProfitAndLoss() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try { requireOwner_(ss, true); } catch (err) { return; }
  var ui = SpreadsheetApp.getUi();
  var from = promptDate_('P&L', 'From (YYYY-MM-DD, blank for all time):');
  if (from === null) return;
  var to = promptDate_('P&L', 'To (YYYY-MM-DD, blank for today):');
  if (to === null) return;
  var report = profitAndLoss(journalLines_(ss), { from: from || undefined, to: to || undefined });
  var rows = [['Account', 'Name', 'Balance']];
  rows.push(['INCOME']);
  report.income.forEach(function (r) { rows.push([r.account, r.name || '', fromCents(r.balance)]); });
  rows.push(['COGS']);
  report.cogs.forEach(function (r) { rows.push([r.account, r.name || '', fromCents(r.balance)]); });
  rows.push(['Gross profit', '', fromCents(report.gross_profit)]);
  rows.push(['EXPENSES']);
  report.expenses.forEach(function (r) { rows.push([r.account, r.name || '', fromCents(r.balance)]); });
  rows.push(['Net income', '', fromCents(report.net_income)]);
  rows.push([]);
  rows.push(['BY PROPERTY', 'Income', 'COGS', 'Gross']);
  report.by_property.forEach(function (p) { rows.push([p.property, fromCents(p.income), fromCents(p.cogs), fromCents(p.gross)]); });
  writeReportRows_(ss, 'P&L', 'P&L ' + (from || 'inception') + ' to ' + (to || 'today'), rows);
  ui.alert('P&L written to "Report - P&L".');
}

function reportJobCost() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try { requireOwner_(ss, true); } catch (err) { return; }
  var property = promptProperty_(ss, 'Job cost');
  if (property === null) return;
  var asOf = promptDate_('Job cost', 'As of (YYYY-MM-DD):');
  if (asOf === null) return;
  var report = propertyJobCost(journalLines_(ss), property, { asOf: asOf || undefined });
  var rows = [['By cost class', 'Total']];
  report.by_cost_class.forEach(function (r) { rows.push([r.cost_class, fromCents(r.total)]); });
  rows.push([]);
  rows.push(['By account', 'Name', 'Total']);
  report.by_account.forEach(function (r) { rows.push([r.account, r.name || '', fromCents(r.total)]); });
  rows.push([]);
  rows.push(['By trade', 'Total']);
  report.by_trade.forEach(function (r) { rows.push([r.trade, fromCents(r.total)]); });
  rows.push([]);
  rows.push(['Total cost', '', fromCents(report.total_cost)]);
  rows.push(['Released to COGS', '', fromCents(report.released_to_cogs)]);
  writeReportRows_(ss, 'Job cost', 'Job cost, ' + property + ', as of ' + (asOf || 'today'), rows);
  SpreadsheetApp.getUi().alert('Job cost written to "Report - Job cost".');
}

function reportDennisLedger() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try { requireOwner_(ss, true); } catch (err) { return; }
  var asOf = promptDate_('Dennis ledger', 'As of (YYYY-MM-DD):');
  if (asOf === null) return;
  var accrualOpts = getAccrualOpts_(ss);
  var report = dennisLedger(journalLines_(ss), loadAdvances_(ss), { asOf: asOf || undefined }, accrualOpts);
  var rows = [['Property', 'Principal outstanding', 'Interest posted', 'Interest accrued to date', 'Interest unposted']];
  report.by_property.forEach(function (p) {
    rows.push([p.property, fromCents(p.principal_outstanding), fromCents(p.interest_posted),
      fromCents(p.interest_accrued_to_date), fromCents(p.interest_unposted)]);
  });
  rows.push(['TOTAL', fromCents(report.totals.principal_outstanding), fromCents(report.totals.interest_posted),
    fromCents(report.totals.interest_accrued_to_date), fromCents(report.totals.interest_unposted)]);
  writeReportRows_(ss, 'Dennis ledger', 'Dennis ledger as of ' + (asOf || 'today'), rows);
  SpreadsheetApp.getUi().alert('Dennis ledger written to "Report - Dennis ledger".');
}

/** ui.prompt for a date; '' means "use the default" (today/all-time, per report),
 *  null means the user cancelled. */
function promptDate_(title, label) {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(title, label, ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  var v = resp.getResponseText().trim();
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { ui.alert('Enter a date as YYYY-MM-DD, or leave it blank.'); return promptDate_(title, label); }
  return v;
}

/** Defaults to the active sheet's name when it is a property tab (phase2.7-spec.md
 *  section 4: "default to the active sheet name if it is a property"); otherwise
 *  prompts. null means cancelled. */
function promptProperty_(ss, title) {
  var propSheet = ss.getSheetByName('Properties');
  var cols = headerIndex_(propSheet);
  var names = propSheet.getLastRow() > 1
    ? propSheet.getRange(2, cols['name'], propSheet.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); }).filter(Boolean)
    : [];
  var active = ss.getActiveSheet().getName();
  if (names.indexOf(active) !== -1) return active;
  var ui = SpreadsheetApp.getUi();
  var resp = ui.prompt(title, 'Property name (exactly as on the Properties tab):', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  var name = resp.getResponseText().trim();
  if (names.indexOf(name) === -1) { ui.alert('"' + name + '" is not on the Properties tab.'); return null; }
  return name;
}

// ---- Inbox (receipts waiting for review) ---------------------------------------------------
// The queue stays in Netlify Blobs (one source of truth: the poller, the ingest job, the
// web Inbox and the digest all read it). The sidebar reads it over HTTP with the same
// POLLER_SECRET warmCache_ uses, then Approve files the document to Drive and posts the
// entries IN-PROCESS - the slow hops (Netlify -> cold writer web app, two or three per
// approve) are gone - and one cheap call marks the envelope posted. Dismiss and
// Reprocess are the existing /api/inbox verbs, proxied.

/** UrlFetchApp to the site with the poller secret. Returns the HTTPResponse; throws a
 *  fail_ with the API's error code on any non-2xx. */
function siteFetchRaw_(path, method, body) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('POLLER_SECRET');
  if (!secret) fail_('NO_SECRET', 'Script property POLLER_SECRET is not set (Project settings > Script properties).');
  var siteUrl = (props.getProperty('SITE_URL') || 'https://books.recast-properties.com').replace(/\/+$/, '');
  var params = { method: method || 'get', headers: { 'x-poller-secret': secret }, muteHttpExceptions: true };
  if (body) { params.contentType = 'application/json'; params.payload = JSON.stringify(body); }
  var res = UrlFetchApp.fetch(siteUrl + path, params);
  var code = res.getResponseCode();
  if (code >= 300) {
    var data = null;
    try { data = JSON.parse(res.getContentText()); } catch (e) { /* not JSON */ }
    fail_((data && data.error) || 'HTTP_' + code, (data && data.message) || res.getContentText().slice(0, 200));
  }
  return res;
}

function siteFetchJson_(path, method, body) {
  return JSON.parse(siteFetchRaw_(path, method, body).getContentText());
}

function showInboxSidebar() {
  var ss = openIfOwner_();
  if (!ss) return;
  // A sidebar is fixed at 300 px by Sheets; Paul wanted double that (2026-09-16), so it
  // is a modeless dialog: floats, movable, the sheet stays usable behind it.
  var html = HtmlService.createTemplateFromFile('Inbox').evaluate().setWidth(600).setHeight(760);
  SpreadsheetApp.getUi().showModelessDialog(html, 'Inbox');
}

/** Pending envelopes (newest first, no bytes) plus the pickers the editor needs. */
function inboxList() {
  var ss = openWorkbook_(PropertiesService.getScriptProperties());
  try {
    requireOwner_(ss);
    var resp = siteFetchJson_('/api/inbox?status=pending&limit=500');   // the list is collapsed rows now; 100 hid most of a 387-document queue (2026-09-18)
    var pickers = pickerData_(ss);
    return { ok: true, envelopes: resp.envelopes || [], total: resp.total, pickers: pickers,
      user: Session.getActiveUser().getEmail(), site: PropertiesService.getScriptProperties().getProperty('SITE_URL') || 'https://books.recast-properties.com' };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

/** 480 px JPEG thumbnail of an image attachment as a data URI (PDFs have none). */
function inboxThumb(key) {
  try {
    var res = siteFetchRaw_('/api/file?key=' + encodeURIComponent(key) + '&thumb=1');
    return { ok: true, dataUri: 'data:image/jpeg;base64,' + Utilities.base64Encode(res.getContent()) };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

/** "<date> <vendor> <total>.<ext>" - netlify/functions/_shared.mjs driveFileName, copied. */
function driveFileName_(model, original, index) {
  var vendor = String((model && model.vendor) || '').trim().replace(/[\\/:*?"<>|]+/g, '').slice(0, 60);
  var cents = Number(model && model.receipt_total_cents);
  if (!(model && model.date) || !vendor || !isFinite(cents)) return original;
  var ext = (original.match(/\.[A-Za-z0-9]{1,5}$/) || [''])[0].toLowerCase();
  var suffix = index > 0 ? ' (' + (index + 1) + ')' : '';
  return model.date + ' ' + vendor + ' ' + (cents / 100).toFixed(2) + suffix + ext;
}

/** Approve, step one - the only part the user waits for. Builds the (possibly edited)
 *  entries with the same rules as the web approve (buildEntriesFromModel,
 *  allow_duplicate_hash, gate NOT applied - the human is the gate), marks the envelope
 *  posted on the site FIRST (refused with NOT_PENDING if the web Inbox or the ingest got
 *  there first - nothing posted yet), then posts under the writer's lock with the line-
 *  block refresh deferred. Drive filing, doc_url, line blocks and the cache poke are
 *  inboxFinish, which the dialog calls after "Posted" is already on screen.
 *  Timing 2026-09-16 before this split: 8.4 s; the post itself is under a second. */
function inboxApprove(req) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var t0 = Date.now(), timings = [];
  var lap = function (label) { timings.push(label + ' ' + (Date.now() - t0) + 'ms'); t0 = Date.now(); };
  var docId = String(req.docId || '');
  var marked = false;
  try {
    requireOwner_(ss);
    lap('role');
    var entries = Array.isArray(req.entries) ? req.entries : [];
    if (!docId) return { ok: false, error: 'BAD_REQUEST', message: 'docId is required' };
    if (!entries.length) return { ok: false, error: 'BAD_REQUEST', message: 'no entries to approve' };

    var model = {};
    for (var k in (req.model || {})) model[k] = req.model[k];
    model.entries = entries;
    var ctx = buildCtx_(ss);
    lap('ctx');
    var postedBy = Session.getActiveUser().getEmail();
    var built = buildEntriesFromModel(model, ctx, { posted_by: postedBy, doc_url: '', allow_duplicate_hash: true });
    var txnIds = built.map(function (e) { return e.txn_id; });
    lap('build');

    siteFetchJson_('/api/inbox', 'post', { action: 'mark-posted', docId: docId, txn_ids: txnIds, rows: null,
      doc_url: '', by: postedBy, note: req.note || '' });
    marked = true;
    lap('mark');

    var result = postBatchEntries_(built, props, true);
    lap('post');
    return { ok: true, txn_ids: txnIds, rows: result.rows, entries: built, timings: timings.join(', ') };
  } catch (err) {
    var message = String((err && err.message) || err);
    if (marked) {
      // Marked posted but the post itself failed: put the card back so it can be retried.
      try { siteFetchJson_('/api/inbox', 'post', { action: 'mark-pending', docId: docId }); }
      catch (e2) { message += ' - AND the card could not be put back to pending (' + String((e2 && e2.message) || e2) + '); it shows as posted on the site with nothing in the Journal'; }
    }
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: message };
  }
}

/** Approve, step two (the dialog calls it right after inboxApprove returns): fetch the
 *  attachment bytes, file to Drive under <year>/<property or OVERHEAD>, write doc_url on
 *  the posted Journal lines and the envelope, rebuild the property tab's line blocks,
 *  poke the site cache. Everything here is recoverable by hand; the entry is already posted. */
function inboxFinish(req) {
  var props = PropertiesService.getScriptProperties();
  var t0 = Date.now(), timings = [];
  var lap = function (label) { timings.push(label + ' ' + (Date.now() - t0) + 'ms'); t0 = Date.now(); };
  try {
    var docId = String(req.docId || '');
    var txnIds = req.txn_ids || [];
    var entries = req.entries || [];
    var model = req.model || {};
    var first = entries[0] || {};
    var year = String(first.date || Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd')).slice(0, 4);
    var folder = [year, first.property || 'OVERHEAD'];

    var docUrl = '';
    var atts = req.attachments || [];
    for (var i = 0; i < atts.length; i++) {
      var key = atts[i].key || ('att/' + docId + '/' + i);
      var bytes = siteFetchRaw_('/api/file?key=' + encodeURIComponent(key)).getContent();
      lap('fetch bytes');
      var stored = storeDocument_(driveFileName_(model, atts[i].name || ('attachment-' + i), i),
        atts[i].mime || 'application/octet-stream', Utilities.base64Encode(bytes), folder, props);
      if (!docUrl) docUrl = stored.url;
      lap('drive file');
    }
    if (docUrl) {
      setDocUrl_(txnIds, docUrl, props);
      siteFetchJson_('/api/inbox', 'post', { action: 'mark-posted', docId: docId, txn_ids: txnIds, doc_url: docUrl, by: Session.getActiveUser().getEmail() });
      lap('doc_url');
    }
    var ss = openWorkbook_(props);
    refreshLineBlocksFor_(ss, entries);
    lap('line blocks');
    warmCache_();
    lap('warm');
    return { ok: true, doc_url: docUrl, timings: timings.join(', ') };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err), timings: timings.join(', ') };
  }
}

function inboxDismiss(req) {
  var ss = openWorkbook_(PropertiesService.getScriptProperties());
  try {
    requireOwner_(ss);
    if (!req.note) return { ok: false, error: 'BAD_REQUEST', message: 'a reason is required' };
    siteFetchJson_('/api/inbox', 'post', { action: 'dismiss', docId: req.docId, note: req.note, by: Session.getActiveUser().getEmail() });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

function inboxReprocess(req) {
  var ss = openWorkbook_(PropertiesService.getScriptProperties());
  try {
    requireOwner_(ss);
    siteFetchJson_('/api/inbox', 'post', { action: 'reprocess', docId: req.docId, by: Session.getActiveUser().getEmail() });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

// ---- Self test ----------------------------------------------------------------------------

function runSelfTestFromMenu() {
  var ui = SpreadsheetApp.getUi();
  try {
    var result = selfTest();
    ui.alert('Self test OK: entry ' + result.txn_id + ', fixture interest ' + result.interest + '.');
  } catch (err) {
    ui.alert('Self test FAILED: ' + ((err && err.code) || 'ERROR') + ' - ' + String((err && err.message) || err));
  }
}

// ---- Phase 5: the sell wizard (docs/phase5-spec.md) ---------------------------------
//
// One pass closes a property: the confirmed settlement statement in, then the sale, the
// interest to each advance's repayment date with Dennis's agreed figure trued up once
// (D-015 section 2), the release to COGS, the payouts, the closing tab, and the lock.
// lib.gs's buildSalePlan (lib/sale.mjs) owns every number; this file only fetches what it
// needs off the sheets, posts what it returns, and writes the tab.
//
// Paul, 2026-09-22: while the layout is being proved the closing tab is written BESIDE the
// property tab as "<property> - Closing" and the live tab is untouched. When he signs the
// layout off, set CLOSING_TAB_IN_PLACE to true and it is written onto the property tab
// itself - one constant, not a setting.
var CLOSING_TAB_IN_PLACE = false;

function closingTabName_(name) {
  return CLOSING_TAB_IN_PLACE ? name : name + ' - Closing';
}

function showSellDialog() {
  var ss = openIfOwner_();
  if (!ss) return;
  showDialog_('Sell', 'Sell property', { properties: sellableProperties_(ss) });
}

/** Properties that can still be sold: anything not already `sold` (D-017). */
function sellableProperties_(ss) {
  var sheet = ss.getSheetByName('Properties');
  var cols = headerIndex_(sheet);
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues()
    .map(function (r) { return { name: String(r[cols['name'] - 1] || ''), status: String(r[cols['status'] - 1] || '') }; })
    // Sold properties stay on the list: the dialog opens in its closed view for them, which
    // is where a late settlement statement is attached (Paul, 2026-09-22: one dialog).
    .filter(function (p) { return p.name && p.name !== 'Cost Recapture'; })
    .map(function (p) { return p.name; });
}

/** Everything the dialog needs to show before Paul types anything. */
function sellContext(name) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss);
    var registry = propertyRow_(ss, name) || {};
    var advances = loadAdvances_(ss).filter(function (a) { return a.property === name; });
    var rate = getAccrualOpts_(ss).rateAnnual;
    var sold = String(registry.status || '').toLowerCase() === 'sold';
    return {
      ok: true,
      sold: sold,
      settlement_date: registry.settlement_date ? formatIsoDate_(registry.settlement_date) : '',
      property: {
        name: name,
        status: String(registry.status || ''),
        contract_price: registry.contract_price === '' || registry.contract_price == null ? '' : Number(registry.contract_price),
        dennis_share_pct: registry.dennis_share_pct === '' || registry.dennis_share_pct == null ? 50 : Number(registry.dennis_share_pct),
        dennis_commission_pct: registry.dennis_commission_pct === '' || registry.dennis_commission_pct == null ? 0 : Number(registry.dennis_commission_pct)
      },
      advances: advances.map(function (a) {
        return {
          advance_id: a.advance_id, date: a.date, amount: a.amount_cents / 100, kind: a.kind || '',
          rate_pct: a.rate_annual == null ? rate * 100 : a.rate_annual * 100,
          repaid_date: a.repaid_date || '', status: a.status
        };
      }),
      balances: propertyBalances_(ss, name),
      settings_rate_pct: rate * 100
    };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

/** The form's statement lines -> buildSalePlan's `settlement`. */
function sellSettlement_(form) {
  return {
    date: form.date,
    sale_price_cents: toCents(form.sale_price),
    net_to_seller_cents: toCents(form.net_to_seller),
    cash_to_recast_cents: form.cash_to_recast === '' || form.cash_to_recast == null ? undefined : toCents(form.cash_to_recast),
    recast_share_pct: form.recast_share_pct === '' || form.recast_share_pct == null ? 100 : Number(form.recast_share_pct),
    lines: (form.lines || [])
      .filter(function (l) { return l.account && String(l.amount).trim() !== '' && Number(l.amount) !== 0; })
      .map(function (l) { return { label: l.label || '', account: String(l.account), cents: toCents(l.amount), kind: l.kind || 'cost' }; })
  };
}

/** The advances as the dialog has them, so a rate corrected during the reconcile is used
 *  by the preview before it is written back (Paul: no Terminal for a reconcile). */
function sellAdvances_(form, ss, name) {
  var edited = {};
  (form.advances || []).forEach(function (a) { edited[String(a.advance_id)] = a; });
  return loadAdvances_(ss).filter(function (a) { return a.property === name; }).map(function (a) {
    var e = edited[a.advance_id] || {};
    var ratePct = e.rate_pct === '' || e.rate_pct == null ? null : Number(e.rate_pct);
    return {
      advance_id: a.advance_id, date: a.date, amount_cents: a.amount_cents, kind: a.kind || '',
      rate_annual: ratePct == null ? a.rate_annual : ratePct / 100,
      repaid_date: e.repaid_date || a.repaid_date || form.date
    };
  });
}

function sellPlan_(ss, form, docUrl) {
  var name = form.property;
  var registry = propertyRow_(ss, name) || {};
  var bank = Number(registry.dennis_share_pct) === 0 || String(form.deal || '') === 'bank';
  return buildSalePlan({
    property: {
      name: name,
      deal: bank ? 'bank' : 'partner',
      dennis_share_pct: registry.dennis_share_pct === '' || registry.dennis_share_pct == null ? 50 : Number(registry.dennis_share_pct),
      dennis_commission_pct: registry.dennis_commission_pct === '' || registry.dennis_commission_pct == null ? 0 : Number(registry.dennis_commission_pct)
    },
    settlement: sellSettlement_(form),
    advances: sellAdvances_(form, ss, name),
    balances: propertyBalances_(ss, name),
    interestFigureCents: form.interest_figure === '' || form.interest_figure == null ? null : toCents(form.interest_figure),
    recaptureCents: form.recapture === '' || form.recapture == null ? 0 : toCents(form.recapture),
    docUrl: docUrl || '',
    postedBy: Session.getActiveUser().getEmail()
  });
}

/** Read-only: the numbers and the checks, nothing written. */
function sellPreview(form) {
  var ss = openWorkbook_(PropertiesService.getScriptProperties());
  try {
    requireOwner_(ss);
    var typed = sellSettlement_(form).lines;
    if (!typed.length) {
      return { ok: false, error: 'NO_STATEMENT_LINES',
        message: 'No statement line has an amount. Type each charge, adjustment and holdback in the Amount column ' +
          '(third column) - the lines must explain the difference between the sale price and net-to-seller.' };
    }
    var plan = sellPlan_(ss, form);
    return {
      ok: true, summary: plan.summary, checks: plan.checks, statement_lines: typed.length,
      intents: plan.intents.map(function (i) { return { memo: i.memo, lines: i.lines.length }; }),
      target: closingTabName_(form.property)
    };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

/** The whole close, in one batch under the writer's lock, then the tab and the lock. */
function sellPost(form) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss);
    var name = form.property;
    var plan = sellPlan_(ss, form);
    if (!plan.checks.ok) {
      return { ok: false, error: 'SALE_DOES_NOT_TIE', message: 'the plan failed its own checks: ' + JSON.stringify(plan.checks) };
    }
    // The forecast the tab was showing, frozen before anything changes (spec section 3 item 4).
    var tab = ss.getSheetByName(name);
    var forecast = tab ? {
      sale_price: readLabelledValue_(tab, 'Sale Price'),
      total_cost: readLabelledValue_(tab, 'Total Project Cost'),
      profit: readLabelledValue_(tab, 'Net Profit')
    } : { sale_price: '', total_cost: '', profit: '' };

    // The closing document is the evidence for the whole run, so it is filed (or its
    // Drive link taken) BEFORE the entries are built and lands on every one of them.
    var docUrl = sellFileClosingDoc_(form, plan.summary, props);
    if (docUrl) plan = sellPlan_(ss, form, docUrl);

    var ctx = buildCtx_(ss);
    var entries = plan.intents.map(function (intent) { return buildEntry(intent, ctx); });
    var result = postBatchEntries_(entries, props, true);

    // Advances: the reconcile's rate, the repayment date, and repaid status (D-011 freezes
    // accrual at repaid_date, so this is what stops interest).
    var advSheet = ss.getSheetByName('Advances');
    var advCols = headerIndex_(advSheet);
    var advLast = advSheet.getLastRow();
    if (advLast > 1) {
      var edited = {};
      (form.advances || []).forEach(function (a) { edited[String(a.advance_id)] = a; });
      var advRows = advSheet.getRange(2, 1, advLast - 1, advSheet.getLastColumn()).getValues();
      advRows.forEach(function (r, i) {
        if (String(r[advCols['property'] - 1] || '') !== name) return;
        var e = edited[String(r[advCols['advance_id'] - 1] || '')] || {};
        var row = i + 2;
        advSheet.getRange(row, advCols['repaid_date']).setValue(e.repaid_date || form.date);
        advSheet.getRange(row, advCols['status']).setValue('repaid');
        if (advCols['rate_pct'] && e.rate_pct !== '' && e.rate_pct != null) {
          advSheet.getRange(row, advCols['rate_pct']).setValue(Number(e.rate_pct));
        }
      });
    }

    // Properties: sold and locked (D-015 section 2, D-017) - the posting allowlist drops it.
    var pSheet = ss.getSheetByName('Properties');
    var pCols = headerIndex_(pSheet);
    var pLast = pSheet.getLastRow();
    for (var r = 2; r <= pLast; r++) {
      if (String(pSheet.getRange(r, pCols['name']).getValue() || '') !== name) continue;
      pSheet.getRange(r, pCols['status']).setValue('sold');
      if (pCols['settlement_date']) pSheet.getRange(r, pCols['settlement_date']).setValue(form.date);
      break;
    }

    var written = writeClosingTab_(ss, name, {
      doc_url: docUrl,
      summary: plan.summary,
      statementLines: sellStatementForTab_(form, plan),
      costByClass: sellCostByClass_(ss, name, plan),
      forecast: forecast
    }, closingTabName_(name));

    warmCache_();
    return { ok: true, posted: result.posted, rows: result.rows, tab: written.sheet, doc_url: docUrl, summary: plan.summary };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

/** Statement lines with the amount actually posted at Recast's share, for the tab. */
function sellStatementForTab_(form, plan) {
  var share = (plan.summary.recast_share_pct || 100) / 100;
  return sellSettlement_(form).lines.map(function (l) {
    var posted = l.kind === 'to_recast' ? l.cents - Math.round(l.cents * share) : Math.round(l.cents * share);
    return { label: l.label, account: l.account, kind: l.kind, posted_cents: posted };
  });
}

/** The released cost: one row per account (Paul, 2026-09-22: "separate these costs out
 *  into individual rows" - grouped Holding and Selling lines hid what they were made of),
 *  except the rehab accounts, which collapse into a single Rehab row as the old closed tabs
 *  had them. The account's own name carries its class, e.g. "Holding - utilities". */
function sellCostByClass_(ss, name, plan) {
  var chart = accountMap();
  var released = {};
  plan.intents.forEach(function (i) {
    if (!/released to COGS/.test(i.memo)) return;
    i.lines.forEach(function (l) { if (l.credit) released[l.account] = (released[l.account] || 0) + l.credit; });
  });
  var isRehab = function (a) { return a >= '1020' && a <= '1060'; };
  var rows = [], rehabCents = 0, rehabAccounts = [];
  Object.keys(released).sort().forEach(function (a) {
    if (isRehab(a)) {
      if (!rehabAccounts.length) rows.push({ rehab: true });
      rehabCents += released[a];
      rehabAccounts.push(a);
      return;
    }
    var label = a === '1220'
      ? "Dennis's half of the profit (a cost of the deal, so your half is the bottom line)"
      : (chart.get(a) ? chart.get(a).name : 'account ' + a);
    rows.push({ label: label, cents: released[a], accounts: a });
  });
  return rows
    .map(function (r) { return r.rehab ? { label: 'Rehab', cents: rehabCents, accounts: rehabAccounts.join(' ') } : r; })
    .filter(function (r) { return r.cents !== 0; });
}

/**
 * Step 2 of the dialog: the document is read on the site (one model call, `/api/settlement`)
 * and the result fills the form. Nothing is posted, filed or locked by this - Paul confirms
 * every line, and `sellPost` does the work.
 */
function sellReadDocument(req) {
  var ss = openWorkbook_(PropertiesService.getScriptProperties());
  try {
    requireOwner_(ss);
    if (!req || !req.base64) return { ok: false, error: 'NO_DOCUMENT', message: 'No document was given to read.' };
    var started = siteFetchJson_('/api/settlement', 'post', {
      base64: req.base64, mime: req.mime || 'application/pdf',
      name: req.name || '', property: req.property || ''
    });
    if (!started.job_id) return { ok: false, error: 'NO_JOB', message: 'The site did not start a read.' };
    // Reading a three-page statement takes a minute or two, so the site does it in a
    // background function and we wait here: Apps Script has six minutes, a Netlify
    // request has ten seconds (2026-09-22: a 504 on the first real document).
    for (var i = 0; i < SELL_READ_POLLS; i++) {
      Utilities.sleep(SELL_READ_WAIT_MS);
      var job = siteFetchJson_('/api/settlement?job=' + encodeURIComponent(started.job_id));
      if (job.status === 'done') return job;
      if (job.status === 'error') return { ok: false, error: 'READ_FAILED', message: job.error || 'the read failed' };
    }
    return {
      ok: false, error: 'READ_TIMED_OUT',
      message: 'The read is still running after ' + Math.round(SELL_READ_POLLS * SELL_READ_WAIT_MS / 1000) +
        ' seconds. Try again, or Skip and type it in.'
    };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

// 4 s x 60 = four minutes of waiting, inside Apps Script's six-minute limit.
var SELL_READ_WAIT_MS = 4000;
var SELL_READ_POLLS = 60;

/**
 * The dialog's closed view: attach (or replace) the settlement statement on a sale that is
 * already posted, and rebuild its statement tab. The document often arrives after the close,
 * and 1616 Granite was posted before the dialog asked for one.
 */
function sellUpdate(form) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss);
    var name = form.property;
    if (!propertyRow_(ss, name)) return { ok: false, error: 'NOT_FOUND', message: '"' + name + '" is not on the Properties tab.' };

    var linked = 0;
    var docUrl = sellFileClosingDoc_(form, null, props);
    if (docUrl) {
      var journal = ss.getSheetByName('Journal');
      var cols = headerIndex_(journal);
      var last = journal.getLastRow();
      var rows = last > 1 ? journal.getRange(2, 1, last - 1, journal.getLastColumn()).getValues() : [];
      var ids = {};
      rows.forEach(function (r) {
        if (String(r[cols['property'] - 1]) !== name) return;
        if (String(r[cols['source'] - 1]) !== 'sale') return;
        ids[String(r[cols['txn_id'] - 1])] = true;
      });
      var txnIds = Object.keys(ids);
      if (!txnIds.length) return { ok: false, error: 'NO_SALE', message: 'No posted sale entries found for ' + name + '.' };
      linked = setDocUrl_(txnIds, docUrl, props);
    }

    var built = closingFromJournal_(ss, name);
    if (!built) return { ok: false, error: 'NO_SALE', message: 'No posted sale found for ' + name + '.' };
    if (docUrl) built.doc_url = docUrl;
    var written = writeClosingTab_(ss, name, built, closingTabName_(name));
    warmCache_();
    return { ok: true, linked: linked, tab: written.sheet, doc_url: docUrl };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

/** The closing statement's numbers, read back out of the posted `sale` entries. Returns
 *  null when the property has no posted sale. The shapes match what writeClosingTab_ wants,
 *  so the tab renders identically whether it is written at the sale or rebuilt later. */
function closingFromJournal_(ss, name) {
  var journal = ss.getSheetByName('Journal');
  var cols = headerIndex_(journal);
  var last = journal.getLastRow();
  var rows = last > 1 ? journal.getRange(2, 1, last - 1, journal.getLastColumn()).getValues() : [];
  var g = function (r, n) { return cols[n] ? r[cols[n] - 1] : ''; };
  var voided = {};
  rows.forEach(function (r) { var v = String(g(r, 'void_of') || ''); if (v) voided[v] = true; });

  var entries = {};   // txn_id -> {memo, date, lines:[{account, cents, description}]}
  rows.forEach(function (r) {
    if (String(g(r, 'property')) !== name) return;
    if (String(g(r, 'source')) !== 'sale' || voided[String(g(r, 'txn_id'))]) return;
    var id = String(g(r, 'txn_id'));
    if (!entries[id]) entries[id] = { memo: String(g(r, 'memo') || ''), date: formatIsoDate_(g(r, 'date')), lines: [] };
    entries[id].lines.push({
      account: String(g(r, 'account')),
      cents: Math.round(Number(g(r, 'debit') || 0) * 100) - Math.round(Number(g(r, 'credit') || 0) * 100),
      description: String(g(r, 'description') || '')
    });
  });
  var ids = Object.keys(entries);
  if (!ids.length) return null;

  var find = function (re) { for (var i = 0; i < ids.length; i++) if (re.test(entries[ids[i]].memo)) return entries[ids[i]]; return null; };
  var settlement = find(/settlement statement/);
  var accrual = find(/interest accrued/);
  var trueUp = find(/true-up|adjustment to the figure/);
  var shareEntry = find(/of net profit/);
  var commissionEntry = find(/commission on the sale price/);
  var release = find(/released to COGS/);
  var paidDennis = find(/paid to Dennis/);
  var paidPaul = find(/paid to Paul/);
  if (!settlement || !release) return null;

  var at = function (entry, account) {
    if (!entry) return 0;
    var t = 0;
    entry.lines.forEach(function (l) { if (l.account === account) t += l.cents; });
    return t;
  };
  var sum = function (entry, pick) {
    if (!entry) return 0;
    var t = 0;
    entry.lines.forEach(function (l) { if (pick(l)) t += l.cents; });
    return t;
  };

  var registry = propertyRow_(ss, name) || {};
  var postedDocUrl = '';
  rows.forEach(function (r) {
    if (postedDocUrl || String(r[cols['property'] - 1]) !== name) return;
    if (String(r[cols['source'] - 1]) !== 'sale') return;
    postedDocUrl = String(cols['doc_url'] ? r[cols['doc_url'] - 1] || '' : '');
  });
  // Wording for each settlement line, best first: what the Journal line itself carries,
  // then whatever is already typed on the tab (so a label Paul improves survives a
  // rebuild, like the property tab's typed Sale Price), then the account's own name.
  var chart = accountMap();
  var typedLabels = closingTabLabels_(ss, closingTabName_(name));
  var cash = at(settlement, '1401');
  var revenue = -at(settlement, '4000');
  var statementLines = settlement.lines
    .filter(function (l) { return l.account !== '1401' && l.account !== '4000'; })
    .map(function (l) {
      var fromChart = chart.get(l.account) ? chart.get(l.account).name : 'account ' + l.account;
      return {
        label: l.description || typedLabels[l.account] || fromChart,
        account: l.account,
        kind: l.account === '1510' ? 'holdback' : (l.cents < 0 ? 'credit' : 'cost'),
        posted_cents: Math.abs(l.cents)
      };
    });

  var engineInterest = at(accrual, '1200');
  var trueUpCents = at(trueUp, '1200');
  var dennisShare = at(shareEntry, '1220');
  var commission = at(commissionEntry, '1210');
  var released = at(release, '5000');
  var costBeforeShare = released - dennisShare;
  var profit = revenue - costBeforeShare;

  var payDennisNote = at(paidDennis, '2010');
  var payDennisInterest = at(paidDennis, '2000');
  var payPaulDue = at(paidPaul, '2030');
  var payPaulShare = at(paidPaul, '9010');
  var paidDennisTotal = paidDennis ? -at(paidDennis, '1401') : 0;
  var paidPaulTotal = paidPaul ? -at(paidPaul, '1401') : 0;

  var balances = propertyBalances_(ss, name);
  var costByClass = sellCostByClass_(ss, name, { intents: [{ memo: 'released to COGS', lines: release.lines.map(function (l) {
    return l.cents < 0 ? { account: l.account, credit: -l.cents } : { account: l.account, debit: l.cents };
  }) }] });

  var summary = {
    property: name,
    deal: commission ? 'bank' : 'partner',
    date: settlement.date,
    recast_share_pct: registry.recast_share_pct || 100,
    revenue_cents: revenue,
    cash_in_cents: cash,
    cost_before_share_cents: costBeforeShare,
    profit_cents: profit,
    dennis_share_cents: dennisShare,
    paul_share_cents: profit - dennisShare,
    commission_cents: commission,
    released_cents: released,
    interest: {
      engine_cents: engineInterest,
      agreed_cents: engineInterest + trueUpCents,
      true_up_cents: trueUpCents,
      posted_before_cents: 0,
      by_advance: loadAdvances_(ss).filter(function (a) { return a.property === name; }).map(function (a) {
        return { advance_id: a.advance_id, date: a.date, kind: a.kind || '', amount_cents: a.amount_cents,
          as_of: a.repaid_date || settlement.date, interest_cents: accruedThrough(a, a.repaid_date || settlement.date) };
      })
    },
    paid: {
      dennis_cents: paidDennisTotal, paul_cents: paidPaulTotal,
      dennis_note_cents: payDennisNote - dennisShare > 0 ? payDennisNote - dennisShare : payDennisNote,
      dennis_interest_cents: payDennisInterest,
      dennis_share_cents: Math.min(dennisShare, payDennisNote),
      paul_due_cents: payPaulDue, paul_share_cents: payPaulShare
    },
    retained_cents: cash - paidDennisTotal - paidPaulTotal,
    owed_after: {
      dennis_cents: -Math.round(balances['2010'] || 0),
      paul_cents: -Math.round(balances['2030'] || 0),
      paul_undrawn_cents: (profit - dennisShare) - payPaulShare
    },
    recapture_cents: 0
  };

  var tab = ss.getSheetByName(name);
  var forecast = tab ? {
    sale_price: readLabelledValue_(tab, 'Sale Price'),
    total_cost: readLabelledValue_(tab, 'Total Project Cost'),
    profit: readLabelledValue_(tab, 'Net Profit')
  } : { sale_price: '', total_cost: '', profit: '' };

  return { summary: summary, statementLines: statementLines, costByClass: costByClass, forecast: forecast, doc_url: postedDocUrl };
}

/** Statement-line wording already on a closing tab, by account: the label in column B of
 *  every row whose column D names a 4-digit account. Lets Paul improve a label in place
 *  and keep it through a rebuild (the same courtesy the property tab gives Sale Price). */
function closingTabLabels_(ss, target) {
  var sh = ss.getSheetByName(target);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  var rows = sh.getRange(1, 2, sh.getLastRow(), 3).getValues();
  rows.forEach(function (r) {
    var label = String(r[0] || '').replace(/^\s+/, '');
    var note = String(r[2] || '').trim();
    // A label this code wrote as its own fallback is not Paul's wording: ignoring it is
    // what lets a better name replace it (2026-09-22: "account 1300" preserved itself).
    if (label && /^[0-9]{4}$/.test(note) && !/^account [0-9]{4}$/.test(label)) out[note] = label;
  });
  return out;
}

/** The closing document for a sale: either the PDF the dialog uploaded (filed to the
 *  property's Drive folder, same path as a receipt) or a Drive link already pasted in.
 *  Returns the url, or '' when neither was given. */
function sellFileClosingDoc_(form, summary, props) {
  if (form.doc_base64) {
    var folder = [String(form.date || '').slice(0, 4), form.property];
    var name = String(form.date || '') + ' ' + form.property + ' settlement statement';
    var ext = String(form.doc_name || '').match(/\.[A-Za-z0-9]+$/);
    var stored = storeDocument_(name + (ext ? ext[0] : '.pdf'), form.doc_mime || 'application/pdf', form.doc_base64, folder, props);
    return stored.url;
  }
  return String(form.doc_url || '').trim();
}

