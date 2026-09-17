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
  return makeCtx({ accounts: accounts, properties: properties, periods: periods, today: today });
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

function addProperty(form) {
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
    try {
      tabRows = setupPropertyTab(name).rows;
    } catch (err) {
      tabError = String((err && err.message) || err);
    }
    warmCache_();
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
function addAdvance(form) {
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
    try {
      tabRows = setupPropertyTab(property).rows;
    } catch (err) {
      tabError = String((err && err.message) || err);
    }
    warmCache_();
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
    var resp = siteFetchJson_('/api/inbox?status=pending&limit=100');
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

/** Approve: file to Drive, build + post the (possibly edited) entries in-process, then
 *  mark the envelope posted. Same rules as the web approve (buildEntriesFromModel,
 *  allow_duplicate_hash, gate NOT applied - the human is the gate). */
function inboxApprove(req) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var txnIds = null;
  try {
    requireOwner_(ss);
    var docId = String(req.docId || '');
    var entries = Array.isArray(req.entries) ? req.entries : [];
    if (!docId) return { ok: false, error: 'BAD_REQUEST', message: 'docId is required' };
    if (!entries.length) return { ok: false, error: 'BAD_REQUEST', message: 'no entries to approve' };

    // Fresh read right before posting: the web Inbox or the ingest may have moved it.
    // ponytail: a claim step would close the last few hundred ms; one user, not worth a verb
    var env = (siteFetchJson_('/api/inbox?status=all&docId=' + encodeURIComponent(docId)).envelopes || [])[0];
    if (!env) return { ok: false, error: 'NOT_FOUND', message: 'no envelope for ' + docId };
    if (env.status !== 'pending') return { ok: false, error: 'NOT_PENDING', message: 'this document is "' + env.status + '" now, not pending - refresh the list' };

    var model = {};
    for (var k in (env.model || {})) model[k] = env.model[k];
    model.entries = entries;
    var ctx = buildCtx_(ss);
    var postedBy = Session.getActiveUser().getEmail();

    // A pending item was never filed to Drive on the way in; file it now (web approve
    // does the same via storeAttachmentsToDrive). Folder: <year>/<property or OVERHEAD>.
    var docUrl = (env.result && env.result.doc_url) || '';
    if (!docUrl) {
      var first = entries[0] || {};
      var folder = [String(first.date || ctx.today).slice(0, 4), first.property || 'OVERHEAD'];
      var atts = env.attachments || [];
      for (var i = 0; i < atts.length; i++) {
        var key = atts[i].key || ('att/' + docId + '/' + i);
        var bytes = siteFetchRaw_('/api/file?key=' + encodeURIComponent(key)).getContent();
        var stored = storeDocument_(driveFileName_(model, atts[i].name || ('attachment-' + i), i),
          atts[i].mime || 'application/octet-stream', Utilities.base64Encode(bytes), folder, props);
        if (!docUrl) docUrl = stored.url;
      }
    }

    var built = buildEntriesFromModel(model, ctx, { posted_by: postedBy, doc_url: docUrl, allow_duplicate_hash: true });
    var result = postBatchEntries_(built, props);
    txnIds = built.map(function (e) { return e.txn_id; });

    siteFetchJson_('/api/inbox', 'post', { action: 'mark-posted', docId: docId, txn_ids: txnIds, rows: result.rows,
      doc_url: docUrl, by: postedBy, note: req.note || '' });
    warmCache_();
    return { ok: true, txn_ids: txnIds, doc_url: docUrl, entries: built };
  } catch (err) {
    if (txnIds) {
      // Posted, but the card is still pending on the site: say so loudly, never re-post.
      warmCache_();
      return { ok: false, error: 'MARK_FAILED', message: 'POSTED ' + txnIds.join(', ') + ' but the card could not be marked posted (' +
        String((err && err.message) || err) + '). Do NOT approve it again - from the repo run: node scripts/mark-posted.mjs ' + req.docId + ' ' + txnIds[0] };
    }
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
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
