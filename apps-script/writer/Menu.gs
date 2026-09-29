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
    .addItem('Import statement...', 'showImportDialog')
    .addItem('Match statement lines...', 'matchStatementLines')
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

  // The trades the property tabs group by, so the Inbox can offer them instead of free
  // text: a trade that does not match a block name gets no block until the tab is rebuilt
  // (Paul, 2026-09-23). Same set heavyBlocks_ builds from - the known order, then whatever
  // else the Journal has seen.
  var journal = ss.getSheetByName('Journal');
  var jCols = headerIndex_(journal);
  var jLast = journal.getLastRow();
  var trades = PT_HEAVY_ORDER.slice();
  if (jLast > 1 && jCols['trade']) {
    var seen = {};
    journal.getRange(2, jCols['trade'], jLast - 1, 1).getValues().forEach(function (r) {
      var t = String(r[0] || '').trim();
      if (t) seen[t] = true;
    });
    Object.keys(seen).sort().forEach(function (t) { if (trades.indexOf(t) < 0) trades.push(t); });
  }

  return {
    accounts: accounts, properties: properties, bankAccounts: bankAccounts, trades: trades,
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

    // D-052: the dialog says who the money was paid to and the account follows from it.
    // migrationRegisterAdvances still passes `into`.
    var paidTo = kind === 'purchase' ? 'Seller'
      : String(form.paid_to || ({ '2030': 'Paul', '1401': 'Citizens', '1402': 'Chase' })[form.into || '1401'] || '');
    if (!ADVANCE_PAID_TO[paidTo] || (kind === 'cash' && paidTo === 'Seller')) {
      return { ok: false, error: 'BAD_REQUEST', message: 'Choose who the money was paid to.' };
    }
    if (paidTo === 'Vendor' && isPartnerDeal_(ss, property)) {
      return { ok: false, error: 'BAD_REQUEST', message: 'On a partner deal, a bill Dennis paid straight to a worker is not an advance. Add it as a cost Dennis paid.' };
    }
    var into = ADVANCE_PAID_TO[paidTo];
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
      kind: kind, rate_pct: rate_pct, paid_to: paidTo
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
      kind: cols['kind'] ? String(r[cols['kind'] - 1] || '') : '',
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

// The Inbox loads in two calls the dialog runs side by side, so it can say what it is waiting on
// (Paul, 2026-09-28: "when the inbox is loading i want more information"): the receipts from the
// site, and the pickers from the workbook.
/** Pending envelopes (newest first, no bytes). */
function inboxEnvelopes() {
  var ss = openWorkbook_(PropertiesService.getScriptProperties());
  try {
    requireOwner_(ss);
    var resp = siteFetchJson_('/api/inbox?status=pending&limit=500');   // the list is collapsed rows now; 100 hid most of a 387-document queue (2026-09-18)
    return { ok: true, envelopes: resp.envelopes || [], total: resp.total };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

/** The pickers the editor needs (houses, accounts, stores, cards), the user and the site url. */
function inboxPickers() {
  var ss = openWorkbook_(PropertiesService.getScriptProperties());
  try {
    requireOwner_(ss);
    return { ok: true, pickers: pickerData_(ss),
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

/** An attachment's own bytes as base64 - the Inbox opens a PDF from them in one click
 *  (the site's session is a Bearer token, so a plain /api/file link cannot work). */
function inboxFile(key) {
  try {
    return { ok: true, b64: Utilities.base64Encode(siteFetchRaw_('/api/file?key=' + encodeURIComponent(key)).getContent()) };
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
    var feed = tieFeedRows_(ss, req.feed, 'matched', txnIds, 'Recorded from the Inbox' + (req.note ? ' - ' + req.note : ''));
    lap('feed');
    return { ok: true, txn_ids: txnIds, rows: result.rows, entries: built, feed: feed, timings: timings.join(', ') };
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

/** The email body as the receipt (D-035): stored to Drive as email.txt; returns the file url. */
function storeEmailText_(model, text, folder, props) {
  return storeDocument_(driveFileName_(model, 'email.txt', 0), 'text/plain', Utilities.base64Encode(text, Utilities.Charset.UTF_8), folder, props).url;
}

// Paul, 2026-09-28: the five email-only receipts approved from the sheet's Inbox that morning posted
// with no Drive link (the sheet's Save filed attachments only). Editor, once: each gets its email.txt
// and the link on its Journal lines and its card. Safe to run again - a linked card is skipped.
var EMAIL_ONLY_POSTED = ['gm-19c01b85d135afa6', 'gm-19c28c64aa9a29ea', 'gm-19cd5e12f4e9d9b7', 'gm-19cf927112794782', 'gm-19d63f17bf22f9fa'];
function fileEmailReceipts() {
  var props = PropertiesService.getScriptProperties();
  var out = [];
  EMAIL_ONLY_POSTED.forEach(function (docId) {
    try {
      var env = (siteFetchJson_('/api/inbox?docId=' + encodeURIComponent(docId)).envelopes || [])[0];
      if (!env) { out.push('NOT FOUND  ' + docId); return; }
      var txnIds = (env.result && env.result.txn_ids) || [];
      if (!txnIds.length || (env.result && env.result.doc_url) || !env.bodyText) { out.push('skip  ' + docId + '  (no rows, already linked, or no email text)'); return; }
      var model = env.model || {}, first = (model.entries || [])[0] || {};
      var folder = [String(first.date || model.date || '').slice(0, 4) || Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy'), first.property || 'OVERHEAD'];
      var url = storeEmailText_(model, String(env.bodyText), folder, props);
      setDocUrl_(txnIds, url, props);
      siteFetchJson_('/api/inbox', 'post', { action: 'mark-posted', docId: docId, txn_ids: txnIds, doc_url: url, by: Session.getActiveUser().getEmail() });
      out.push('linked  ' + docId + '  ' + (model.vendor || '') + '  ' + url);
    } catch (err) { out.push('FAILED  ' + docId + '  ' + String((err && err.message) || err)); }
  });
  console.log(out.join('\n'));
  return out;
}

// Paul, 2026-09-28 ("yes. that was my mistake"): the Ravinte hinges card of 03-18 (198.42) was approved whole, but
// Amazon had refunded one of the two 60-packs, 78.65, on 04-16. A refund is the cost entry with its sides swapped
// (the migration's negative rows, phase4-audit): Paul's owed balance down, the house's cabinet cost down, same trade so
// the tab's block nets. Editor, once; a second run is refused as DUPLICATE.
var ASHBURNE_HINGE_REFUND = { date: '2026-04-16', cents: 7865, property: '104 Ashburne', payee: 'Amazon', trade: 'Cabinets & Millwork',
  description: 'REFUND: one Ravinte 60 Pack (30 Pairs) cabinet hinges returned (of the two bought 03-18)',
  doc_url: 'https://drive.google.com/file/d/1Er2n5elPxbF7rB4guHP_93knoBN79roN/view?usp=drivesdk',
  memo: 'Amazon refund of 04-16, 78.65, one of the two Ravinte 60-packs on the 03-18 order (receipt-20260318-dabc9c1dc327-52e1); the card was approved whole on 2026-09-28 - Paul: "that was my mistake"' };
function addAshburneHingeRefund() {
  var props = PropertiesService.getScriptProperties();
  var ctx = buildCtx_(openWorkbook_(props));
  var r = ASHBURNE_HINGE_REFUND, user = Session.getActiveUser().getEmail() || 'editor';
  var entry = buildEntry({ type: 'journal', date: r.date, memo: r.memo, source: 'manual', posted_by: user, doc_url: r.doc_url, lines: [
    { account: '2030', debit: r.cents, credit: 0, property: r.property, payee: r.payee, description: r.description, paid_from: 'PAUL' },
    { account: '1030', debit: 0, credit: r.cents, property: r.property, trade: r.trade, payee: r.payee, description: r.description, paid_from: 'PAUL' }
  ] }, ctx);
  var result = postBatchEntries_([entry], props);
  warmCache_();
  console.log('Posted the 78.65 hinge refund to 104 Ashburne, Journal rows ' + result.rows.join('-') + ' (' + entry.txn_id + ')');
  return result;
}

// Paul, 2026-09-28 ("yes do both"): the live reads gave 104 Ashburne sections its tab never had - twelve new
// blocks beside the old ones. Move every live-receipt line on Ashburne into the tab's own sections (the
// heavy tab's PT_HEAVY_ORDER): by trade for the clear ones, by description for the bath items (Paul's word:
// the master bath list below, everything else bath-related is Small Baths). Trade is grouping only - no
// amount, account or balance changes; the lint proves every target is an existing section. Editor, once;
// a second run finds nothing to move. Rebuilds the tab after.
var ASHBURNE_TRADE_MAP = {
  'Electrical': 'Lighting & Electrical', 'Electrical & Lighting': 'Lighting & Electrical',
  'Fireplace': 'Chimney/FIreplace/Glass', 'Windows & Glass': 'Chimney/FIreplace/Glass',
  'Staging': 'Marketing',
  'Cabinets': 'Kitchen', 'Cabinets & Millwork': 'Kitchen', 'Cabinets & Countertops': 'Kitchen',
  'Doors & Hardware': 'House Hardware', 'Doors & Trim': 'House Hardware',
  'Carpentry': 'Supplies', 'Framing': 'Supplies',
  'Plumbing': 'Small Baths', 'Plumbing & Fixtures': 'Small Baths', 'Fixtures': 'Small Baths',
  'Glass & Shower': 'Small Baths', 'Tile & Shower': 'Small Baths'
};
// Bath lines that are the master bath (matched on the description); the rest go to Small Baths.
var ASHBURNE_MASTER_BATH = [/72x36/i, /32-33\.4 in/i, /Rainfall Spa/i, /tub drain and overflow/i, /Kerdi-Board/i];
function retagAshburneTrades() {
  var props = PropertiesService.getScriptProperties();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var out = [], n = 0;
  try {
    var ss = openWorkbook_(props);
    var sheet = ss.getSheetByName('Journal');
    var cols = headerIndex_(sheet);
    var last = sheet.getLastRow();
    var rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
    // Every live line, debit or credit, whatever its source (2026-09-28: the first run took receipt debits only and
    // missed the manual hinge refund and the pendant replayed two minutes later); a voided line stays as it was.
    var voided = {}; rows.forEach(function (r) { var vo = String(r[cols['void_of'] - 1] || ''); if (vo) voided[vo] = true; });
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], g = function (k) { return String(r[cols[k] - 1] || ''); };
      if (g('property') !== '104 Ashburne' || g('source') === 'void' || voided[g('txn_id')]) continue;
      var from = g('trade').trim(), to = ASHBURNE_TRADE_MAP[from];
      if (!to) continue;
      if (to === 'Small Baths' && ASHBURNE_MASTER_BATH.some(function (re) { return re.test(g('description')); })) to = 'Master Bath';
      sheet.getRange(i + 2, cols['trade']).setValue(to);
      out.push(from + ' -> ' + to + '  ' + g('date').slice(0, 10) + '  ' + fromCents(Math.round((Number(r[cols['debit'] - 1]) || -Number(r[cols['credit'] - 1])) * 100)) + '  ' + g('description').slice(0, 60));
      n++;
    }
  } finally { lock.releaseLock(); }
  if (n) { setupPropertyTab('104 Ashburne'); warmCache_(); }
  out.push(n + ' lines moved' + (n ? '; 104 Ashburne rebuilt' : ''));
  console.log(out.join('\n'));
  return out;
}

// 2026-09-28: a receipt read correctly but refused at the posting step (the writer timed out under the
// burst of 28 posts - "Lock timeout", "non-JSON response") stays "error" once the warm job's two retries
// are spent, and the sheet's Inbox never shows it. Replay it from its stored read - no new model read -
// through the site's ingest, which confirms on the Journal before it posts again. Editor; safe to repeat.
// NEVER a document from before the cutover (2026-09-21): those were migrated row by row, and a stored read
// from the staging era posts on top of the migrated rows (the first run, 2026-09-28 13:06, replayed three
// such documents - voided the same hour). The ingest answers 202 with no body, so the raw fetch is used.
var REPLAY_CUTOVER = '2026-09-21';
function replayErroredReceipts() {
  var out = [];
  var envs = siteFetchJson_('/api/inbox?status=error&limit=50').envelopes || [];
  envs.forEach(function (env) {
    var m = env.model || {};
    if (!m.verdict) { out.push('skip, no stored read  ' + env.docId); return; }
    if (String(env.receivedAt || '').slice(0, 10) < REPLAY_CUTOVER) { out.push('skip, from before the cutover - migrated, never replay  ' + env.docId + '  ' + (m.vendor || '') + ' ' + (m.date || '')); return; }
    try {
      var code = siteFetchRaw_('/api/ingest-bg', 'post', { docId: env.docId, fromStored: true }).getResponseCode();
      out.push((code === 202 || code === 200 ? 'replaying  ' : 'HTTP ' + code + '  ') + env.docId + '  ' + (m.vendor || '') + '  ' + (m.date || '') + '  ' + fromCents(Number(m.receipt_total_cents) || 0));
    } catch (err) { out.push('FAILED  ' + env.docId + '  ' + String((err && err.message) || err)); }
    Utilities.sleep(3000);
  });
  console.log(out.join('\n') || 'no receipts stuck at the posting step');
  return out;
}

// 2026-09-28 13:06: the first replayErroredReceipts run also replayed three documents from before the cutover -
// each already in the books as migrated rows (Seconds & Surplus 04-11 432.98 whole; HD 06-25 Bowling Green, six of
// eight lines; HD 03-29 Ashburne, two of three lines). Void the three entries (append-only: the rows stay, mirrored)
// and mark their envelopes dismissed so nothing replays them again. The two lines that matched no migrated row - the
// 11.01 Defiant knob of 06-25 and the 71.71 fence pickets of 03-29 - are Paul's questions, not posts. Editor, once.
var REPLAYED_BY_MISTAKE = [
  ['receipt-20260411-ae5bc54d8fcf', 'gm-19d7ec4e31eef94b', 'Seconds & Surplus 04-11 432.98 - the migrated "Butcher Vlock" row'],
  ['receipt-20260625-9508822eadf0', 'gm-19f00c2049c512fe', 'Home Depot 06-25 Bowling Green 176.59 - six migrated rows (batteries lumped as 33.28); the 11.01 knob is a question for Paul'],
  ['receipt-20260329-62c4ae1ea634', 'gm-19d3a4c4d7090e19', 'Home Depot 03-29 Ashburne 87.64 - toggle bolts and P-trap migrated; the 71.71 pickets are a question for Paul']
];
function undoReplayedMigrationDocs() {
  var props = PropertiesService.getScriptProperties();
  var user = Session.getActiveUser().getEmail() || 'editor';
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  var out = [];
  REPLAYED_BY_MISTAKE.forEach(function (x) {
    var why = 'replayed by mistake 2026-09-28 13:06 (replayErroredReceipts, pre-cutover document): ' + x[2];
    try { voidEntry_(x[0], why, today, user, props, true); out.push('voided  ' + x[0]); }
    catch (err) { out.push('void FAILED  ' + x[0] + '  ' + String((err && err.message) || err)); }
    try { siteFetchJson_('/api/inbox', 'post', { action: 'dismiss', docId: x[1], by: user, note: why }); out.push('card dismissed  ' + x[1]); }
    catch (err) { out.push('dismiss FAILED  ' + x[1] + '  ' + String((err && err.message) || err)); }
  });
  try { setupPropertyTab('104 Ashburne'); out.push('104 Ashburne rebuilt'); } catch (err) { out.push('rebuild FAILED ' + String((err && err.message) || err)); }
  warmCache_();
  console.log(out.join('\n'));
  return out;
}

// Paul, 2026-09-28 ("fence pickets is a new expense for ashburne"): the one line of the HD 03-29 run that matched no
// migrated row, posted on its own with the receipt's Drive link; the toggle bolts and P-trap on that run are the
// migrated rows of 03-29. Same section as the old books' "Fence Boards" (Landscaping). Editor, once; DUPLICATE on a rerun.
var ASHBURNE_PICKETS = { date: '2026-03-29', payee: 'The Home Depot', amount: 71.71, account: '1030', trade: 'Landscaping',
  description: '18 x 5/8"x5-1/2"x8\' PT pine dog-ear pickets @ $3.68 (incl. tax share)',
  doc_url: 'https://drive.google.com/file/d/1d1IOm9B-Vcj7uitHuVADusVdDDMlOMYN/view?usp=drivesdk',
  memo: 'Home Depot 03-29 fence pickets - the only line of that receipt not in the old books; Paul 2026-09-28: "a new expense for ashburne" (the receipt was replayed whole by mistake and voided, receipt-20260329-62c4ae1ea634)' };
function addAshburnePickets() {
  var props = PropertiesService.getScriptProperties();
  var ctx = buildCtx_(openWorkbook_(props));
  var p = ASHBURNE_PICKETS;
  var entry = buildEntry({ type: 'expense', date: p.date, payee: p.payee, description: p.description, amount_cents: toCents(p.amount),
    account: p.account, trade: p.trade, property: '104 Ashburne', paid_from: 'PAUL', source: 'manual', doc_url: p.doc_url,
    posted_by: Session.getActiveUser().getEmail() || 'editor', memo: p.memo }, ctx);
  var result = postBatchEntries_([entry], props);
  warmCache_();
  console.log('Posted the 71.71 fence pickets to 104 Ashburne, Journal rows ' + result.rows.join('-') + ' (' + entry.txn_id + ')');
  return result;
}

// Paul, 2026-09-28 ("if they are on the same receipt then they are duplicates"): the Home Depot 06-29 receipt's two toilet
// kits were already in the books as the migrated 06-28 "Toilet Kits" 40.01 on 1616 Granite (no receipt behind it; 21.98 +
// 14.98 = 36.96 x 1.0825 = 40.01 to the cent - this receipt is its document). The card was approved whole, so the kits
// are in twice. Void that entry and record the air filter alone, on Cost Recapture under Granite's section as the card
// had it, with the receipt's link; point the receipt's record at the new entry. Editor, once; a rerun voids nothing
// (already voided) and the re-post is refused as DUPLICATE.
var GRANITE_TOILET_KITS_DUPLICATE = 'receipt-20260629-54b0cdd99d86-0246';
var GRANITE_FILTER = { docId: 'gm-19f1526194ff1558', date: '2026-06-29', payee: 'The Home Depot', amount: 20.54, account: '1030',
  trade: '1616 Granite', property: 'Cost Recapture',
  description: '20x25x1 HDX FPR 9 air filter (incl. tax share)',
  doc_url: 'https://drive.google.com/file/d/16WAwFSFb-106FQgrWz4qcKhNizEk6X0R/view?usp=drivesdk',
  memo: 'Home Depot 06-29 receipt 6505 00053 37076, job name 1616 - the air filter only; the two toilet kits on the same receipt are the migrated 06-28 "Toilet Kits" 40.01 on 1616 Granite (Paul 2026-09-28: same receipt = duplicates; the first posting, receipt-20260629-54b0cdd99d86-0246, is voided)' };
function fixGraniteToiletKits() {
  var props = PropertiesService.getScriptProperties();
  var user = Session.getActiveUser().getEmail() || 'editor';
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  var p = GRANITE_FILTER, out = [];
  try {
    voidEntry_(GRANITE_TOILET_KITS_DUPLICATE, 'the two toilet kits are the migrated 06-28 "Toilet Kits" 40.01 on 1616 Granite; the air filter is re-posted alone (Paul 2026-09-28)', today, user, props, true);
    out.push('voided  ' + GRANITE_TOILET_KITS_DUPLICATE);
  } catch (err) { out.push('void FAILED  ' + String((err && err.message) || err)); }
  var ctx = buildCtx_(openWorkbook_(props));
  var entry = buildEntry({ type: 'expense', date: p.date, payee: p.payee, description: p.description, amount_cents: toCents(p.amount),
    account: p.account, trade: p.trade, property: p.property, paid_from: 'PAUL', source: 'manual', doc_url: p.doc_url,
    posted_by: user, memo: p.memo }, ctx);
  var result = postBatchEntries_([entry], props);
  out.push('posted the 20.54 air filter to Cost Recapture, Journal rows ' + result.rows.join('-') + ' (' + entry.txn_id + ')');
  try {
    siteFetchJson_('/api/inbox', 'post', { action: 'mark-posted', docId: p.docId, txn_ids: [entry.txn_id], doc_url: p.doc_url, by: user });
    out.push('the receipt now points at the new entry');
  } catch (err) { out.push('mark-posted FAILED  ' + String((err && err.message) || err)); }
  warmCache_();
  console.log(out.join('\n'));
  return out;
}

// Paul, 2026-09-28 ("fix"): the migrated 09-02 camera gimbal (RECAST BIZ / Marketing, 126.61) was typed without its tax -
// the Amazon order (#111-1699514-3146617) totals 137.06 = 126.61 x 1.0825. Void the old row and re-post the full amount
// on the same account and payer with the same receipt link (the payer, Citizens, is the Citizens first pass's open
// question - not changed here). Editor, once; DUPLICATE on a rerun.
var CAMERA_GIMBAL = { old: 'migration-20260902-c83153c60423', date: '2026-09-02', payee: 'Amazon.com', amount: 137.06, account: '6510',
  property: 'OVERHEAD', paid_from: '1401',
  description: 'Camera gimbal - Amazon order #111-1699514-3146617 (126.61 + 10.45 tax)',
  doc_url: 'https://drive.google.com/file/d/1bklxp-ML5fbE0pyBjF1q9hSIYDL2MNku/view?usp=drivesdk',
  memo: 'old books: RECAST BIZ / Marketing, typed at 126.61 without the 10.45 tax; corrected to the order total 137.06 on Paul\'s word 2026-09-28 (migration-20260902-c83153c60423 voided)' };
function fixCameraGimbalTax() {
  var props = PropertiesService.getScriptProperties();
  var user = Session.getActiveUser().getEmail() || 'editor';
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  var p = CAMERA_GIMBAL, out = [];
  try { voidEntry_(p.old, 'typed without its 10.45 tax - re-posted at the order total 137.06 (Paul, 2026-09-28)', today, user, props, true); out.push('voided  ' + p.old); }
  catch (err) { out.push('void FAILED  ' + String((err && err.message) || err)); }
  var ctx = buildCtx_(openWorkbook_(props));
  var entry = buildEntry({ type: 'expense', date: p.date, payee: p.payee, description: p.description, amount_cents: toCents(p.amount),
    account: p.account, property: p.property, paid_from: p.paid_from, source: 'manual', doc_url: p.doc_url, posted_by: user, memo: p.memo }, ctx);
  var result = postBatchEntries_([entry], props);
  out.push('posted the camera gimbal at 137.06, Journal rows ' + result.rows.join('-') + ' (' + entry.txn_id + ')');
  warmCache_();
  console.log(out.join('\n'));
  return out;
}

// 2026-09-28 15:03 PDT: Paul typed the 08-07 Amazon order's items (cameras 91.35 for Bowling Green, pool lights
// 10.61 personal) onto the look-alike 08-13 card (4 hardware items, 160.60) and saved it there. Void that entry and
// put the 08-13 card back in the Inbox with its original read (mark-pending takes an in-process approve back); the
// 08-07 card is still pending and gets the cameras properly. Editor, once; a rerun fails harmlessly on both steps.
var MISFILED_CAMERAS = { txn: 'receipt-20260813-05b9e33b10ee-6e73', docId: 'gm-1a0e9f120ca8f283' };
// ... and then the 08-07 card itself was dismissed as "Duplicate" (15:16), so the cameras are on no book. Re-read it
// into the Inbox (hold-only, the Inbox's own route) for Paul to enter: cameras 91.35 on Bowling Green, pool lights personal.
function reprocessCamerasCard() { return reprocessParked_(['gm-1a0e9f10e30e481d']); }
function undoMisfiledCamerasCard() {
  var props = PropertiesService.getScriptProperties();
  var user = Session.getActiveUser().getEmail() || 'editor';
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  var out = [];
  try {
    voidEntry_(MISFILED_CAMERAS.txn, 'the 08-07 order\'s cameras were saved through the 08-13 card by mistake (Paul, 2026-09-28); re-entered on the 08-07 card', today, user, props, true);
    out.push('voided  ' + MISFILED_CAMERAS.txn);
  } catch (err) { out.push('void FAILED  ' + String((err && err.message) || err)); }
  try {
    siteFetchJson_('/api/inbox', 'post', { action: 'mark-pending', docId: MISFILED_CAMERAS.docId, by: user });
    out.push('the 08-13 card is back in the Inbox');
  } catch (err) { out.push('mark-pending FAILED  ' + String((err && err.message) || err)); }
  warmCache_();
  console.log(out.join('\n'));
  return out;
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
    // D-035 from the sheet (2026-09-28): a receipt that is only an email - no attachment - files its text as
    // email.txt, as the site's ingest does for new mail. Five email-only cards approved that morning had no link.
    if (!docUrl && req.bodyText) { docUrl = storeEmailText_(model, String(req.bodyText), folder, props); lap('email.txt'); }
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
    // On Recast's own account nothing is ever excluded: a dismissed card means "not that" - the line goes
    // back to the next matching run carrying Paul's words, and ties once the books hold the entry he describes.
    return { ok: true, feed: tieFeedRows_(ss, req.feed, 'unmatched', [], 'Paul: ' + req.note) };
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
    var bal = propertyBalances_(ss, name);
    return {
      ok: true,
      sold: sold,
      // What the closing left outstanding: escrow still receivable, and what each partner
      // is owed out of it (D-036 1: Granite's $60,000 arrived on 2026-09-11, split 50/50).
      holdback: {
        outstanding_cents: Math.round(bal['1510'] || 0),
        dennis_owed_cents: -Math.round(bal['2010'] || 0),
        paul_owed_cents: -Math.round(bal['2030'] || 0)
      },
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
    // Derived by lib/sale.mjs unless the statement itself stated it (2026-09-22: the
    // dialog does not ask - "it should know cash received").
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
    // The held view, frozen as the record BEFORE the sale lands (Paul, 2026-09-23). It has to
    // happen here: the next line's release entry nets every formula on that tab to zero.
    // postBatchEntries_ is called with skipRefresh, and Properties.status becomes 'sold' a few
    // lines below, so nothing rewrites the tab in between. If the post throws, the tab is
    // frozen but the property is still held, so Rebuild property tab restores it.
    freezePropertyTab_(ss, name, form.date);
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
    // buildCtx_ caches the postable property set for six hours, and it is cleared by an
    // upsert or a HAND edit on Properties - neither of which this is, because the status
    // above is written straight to the sheet by this script. Without this line the sold
    // property still looks open to the gate for up to six hours, and a receipt arriving in
    // that window posts onto a property whose tab is now frozen and never refreshed again -
    // invisible on both tabs. That window is the likeliest source of the 178.48 sitting on
    // 1616 Granite after its 2026-09-22 close (Paul, 2026-09-23).
    CacheService.getScriptCache().remove('ctx');

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
  // A cost row Paul has renamed on the tab keeps his wording through a rebuild, the same
  // courtesy the settlement lines get: a property closed before a classification was
  // corrected (280 Sparkling's HOA release, D-039) can read right without touching the
  // locked ledger.
  costByClass.forEach(function (g) { if (typedLabels[g.accounts]) g.label = typedLabels[g.accounts]; });

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
    // Keyed by the note column: one account for a settlement line, a list of them for a
    // released-cost row ("1020 1030 1040"). A label this code wrote as its own fallback is
    // not Paul's wording - ignoring it lets a better name replace it (2026-09-22).
    if (label && /^[0-9]{4}( [0-9]{4})*$/.test(note) && !/^account [0-9]{4}$/.test(label)) out[note] = label;
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

/**
 * The escrow holdback, when the money actually arrives: Dr cash / Cr 1510, then each
 * partner's unpaid share. Part of the closing, not a new cost, so it lives in the same
 * dialog (D-036 1; `buildHoldbackRelease` in lib/sale.mjs does the arithmetic).
 */
function sellHoldback(form) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss);
    var name = form.property;
    var registry = propertyRow_(ss, name);
    if (!registry) return { ok: false, error: 'NOT_FOUND', message: '"' + name + '" is not on the Properties tab.' };

    var amount = toCents(form.amount);
    var bal = propertyBalances_(ss, name);
    var outstanding = Math.round(bal['1510'] || 0);
    if (!amount) return { ok: false, error: 'NO_AMOUNT', message: 'Enter the amount that arrived.' };
    if (amount > outstanding) {
      return { ok: false, error: 'OVER_HOLDBACK',
        message: 'Only ' + (outstanding / 100).toFixed(2) + ' is still receivable on ' + name + '.' };
    }

    var plan = buildHoldbackRelease({
      property: { name: name },
      date: form.date,
      amount_cents: amount,
      dennis_cents: form.dennis === '' || form.dennis == null ? 0 : toCents(form.dennis),
      paul_cents: form.paul === '' || form.paul == null ? 0 : toCents(form.paul),
      docUrl: String(form.doc_url || '').trim(),
      postedBy: Session.getActiveUser().getEmail()
    });
    if (!plan.checks.ok) {
      return { ok: false, error: 'HOLDBACK_DOES_NOT_TIE', message: JSON.stringify(plan.checks) };
    }

    // A sold property is out of the posting allowlist (D-015, D-017) and that is the point -
    // no new cost may name it. The holdback is not a new cost: it is the closing's own money
    // arriving late, against the 1510 receivable the sale created. The sell wizard owns the
    // closing, so it is the one place allowed to name a sold property.
    var ctx = buildCtx_(ss);
    ctx.properties.add(name);

    var entries = plan.intents.map(function (intent) { return buildEntry(intent, ctx); });
    var result = postBatchEntries_(entries, props, true);

    var built = closingFromJournal_(ss, name);
    var tab = built ? writeClosingTab_(ss, name, built, closingTabName_(name)).sheet : '';
    warmCache_();
    return { ok: true, posted: result.posted, tab: tab };
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

// ---- Import statement (Phase 3, docs/phase3-spec.md section 2) ----------------------
// The bank's QFX/OFX export, chosen in the dialog and read there as text, parsed by
// lib.gs's parseOfx (no model), and appended to the Feed tab under the writer's lock:
// the account by the file's account-number last four against Bank accounts.last4 (a
// comma-separated list - Citizens "2505, 5450, 9301", Chase "6317"), one row per line,
// deduped on the bank's FITID, so the same file imported twice adds nothing. The dialog
// then says whether opening balance + every Feed line = the bank's balance (spec section 4's
// first check). Matching the lines to the books is the site's job, the next step.

function showImportDialog() {
  var ss = openIfOwner_();
  if (!ss) return;
  showDialog_('Import', 'Import statement', { bankAccounts: bankAccountsLast4_(ss) });
}

/** Active Bank accounts rows as {code, name, last4: [...], opening_cents}. */
function bankAccountsLast4_(ss) {
  var sh = ss.getSheetByName('Bank accounts');
  var cols = headerIndex_(sh);
  var last = sh.getLastRow();
  var rows = last > 1 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
  return rows
    .filter(function (r) { return String(r[cols['active'] - 1]).trim().toLowerCase() !== 'false'; })
    .map(function (r) {
      return {
        code: String(r[cols['code'] - 1]), name: String(r[cols['name'] - 1]),
        last4: String(r[cols['last4'] - 1] || '').split(/[\s,;]+/).filter(Boolean),
        opening_cents: toCents(Number(r[cols['opening_balance'] - 1]) || 0)
      };
    });
}

/** The Feed tab's header row, written the first time a statement lands (Phase 0 created the
 *  tab headers-only with a different guess at its columns). Refuses to touch a tab with rows. */
function ensureFeedHeaders_(sh) {
  var want = TAB_HEADERS['Feed'];
  var cols = headerIndex_(sh);
  var missing = want.filter(function (h) { return !cols[h]; });
  if (!missing.length) return;
  if (sh.getLastRow() > 1) {
    fail_('FEED_HEADERS', 'The Feed tab already has rows but is missing the columns ' + missing.join(', ') + ' - add them to row 1 by hand.');
  }
  ensureHeaders_(sh, want);
  forceTextColumns_(sh, want);
}

function feedRow_(cols, values) {
  var row = new Array(maxColIndex_(cols)).fill('');
  Object.keys(values).forEach(function (k) { if (cols[k]) row[cols[k] - 1] = values[k]; });
  return row;
}

/** google.script.run from Import.html: {name, text} - the file's name and its text. */
function importStatement(req) {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  try {
    requireOwner_(ss);
    var text = String((req && req.text) || '');
    if (!text) return { ok: false, error: 'NO_FILE', message: 'Choose the file the bank gave you.' };
    var parsed = parseOfx(text);
    var accounts = bankAccountsLast4_(ss).filter(function (a) { return a.last4.indexOf(parsed.account_last4) !== -1; });
    if (accounts.length !== 1) {
      return { ok: false, error: 'NO_ACCOUNT', message: accounts.length
        ? 'More than one row on the Bank accounts tab ends in ' + parsed.account_last4 + ' - fix the last4 column so only one does, then import again.'
        : 'No row on the Bank accounts tab ends in ' + parsed.account_last4 + '. Type it in that row\'s last4 column (comma-separated when the account has cards, e.g. "2505, 5450, 9301") and import again.' };
    }
    var account = accounts[0];
    // The bank names the file after the account number; only its last four are kept.
    var sourceFile = String((req && req.name) || '').replace(/\d{5,}/g, function (d) { return '****' + d.slice(-4); });

    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      var sh = ss.getSheetByName('Feed');
      ensureFeedHeaders_(sh);
      var cols = headerIndex_(sh);
      var last = sh.getLastRow();
      var seen = {};
      var feedCents = account.opening_cents;
      if (last > 1) {
        sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().forEach(function (r) {
          if (String(r[cols['account'] - 1]) !== account.code) return;
          seen[String(r[cols['feed_id'] - 1])] = true;
          feedCents += toCents(Number(r[cols['amount'] - 1]) || 0);
        });
      }
      var now = new Date();
      var rows = [];
      parsed.lines.forEach(function (l) {
        if (seen[l.fitid]) return;
        seen[l.fitid] = true;
        feedCents += l.amount_cents;
        rows.push(feedRow_(cols, {
          feed_id: l.fitid, account: account.code, date: parseIsoDate_(l.date), amount: l.amount_cents / 100,
          name: l.name, memo: l.memo, status: 'unmatched', txn_id: '', match_note: '',
          source_file: sourceFile, imported_at: now
        }));
      });
      if (rows.length) sh.getRange(last + 1, 1, rows.length, rows[0].length).setValues(rows);
      warmCache_();
      var bal = parsed.ledger_balance_cents;
      return {
        ok: true, account: account.name, added: rows.length, skipped: parsed.lines.length - rows.length,
        first: parsed.lines[0].date, last: parsed.lines[parsed.lines.length - 1].date,
        bank_balance: bal == null ? '' : fromCents(bal), feed_balance: fromCents(feedCents),
        off_by: bal == null ? '' : fromCents(feedCents - bal), ties: bal != null && feedCents === bal
      };
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

// ---- Match statement lines (Phase 3, docs/phase3-spec.md section 3) -----------------
// The site does the matching (/api/feed-match, a background job: Claude judges, code checks
// every match to the cent, the verdicts land on the Feed rows, proposals and questions become
// Inbox cards). This waits for it the way the sell wizard waits for its read, then says in
// plain words what happened. Nothing is posted to the Journal by a match.
var FEED_MATCH_POLLS = 60;
var FEED_MATCH_WAIT_MS = 5000;

function matchStatementLines() {
  var ss = openIfOwner_();
  if (!ss) return;
  var ui = SpreadsheetApp.getUi();
  var sh = ss.getSheetByName('Feed');
  var cols = headerIndex_(sh);
  var last = sh.getLastRow();
  var counts = {};
  if (last > 1 && cols['status'] && cols['account']) {
    sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues().forEach(function (r) {
      if (String(r[cols['status'] - 1]) !== 'unmatched') return;
      var a = String(r[cols['account'] - 1]);
      counts[a] = (counts[a] || 0) + 1;
    });
  }
  var accounts = Object.keys(counts);
  if (!accounts.length) {
    ui.alert('Nothing to match', 'Every line on the Feed tab is already tied to the books or waiting in the Inbox. Import a statement first.', ui.ButtonSet.OK);
    return;
  }
  var account = accounts[0];
  if (accounts.length > 1) {
    var ask = ui.prompt('Match statement lines', 'Which account? ' + accounts.map(function (a) { return a + ' (' + counts[a] + ' open lines)'; }).join(', '), ui.ButtonSet.OK_CANCEL);
    if (ask.getSelectedButton() !== ui.Button.OK) return;
    account = ask.getResponseText().trim();
    if (!counts[account]) { ui.alert('No open lines on ' + account + '.'); return; }
  }
  try {
    var started = siteFetchJson_('/api/feed-match', 'post', { account: account, by: Session.getActiveUser().getEmail() });
    if (!started.job_id) { ui.alert('Matching failed', 'The site did not start the matching.', ui.ButtonSet.OK); return; }
    for (var i = 0; i < FEED_MATCH_POLLS; i++) {
      ss.toast('Tying ' + counts[account] + ' bank lines to the books... ' + Math.round(i * FEED_MATCH_WAIT_MS / 1000) + ' s', 'Matching', 10);
      Utilities.sleep(FEED_MATCH_WAIT_MS);
      var job = siteFetchJson_('/api/feed-match?job=' + encodeURIComponent(started.job_id));
      if (job.status === 'done') { ui.alert('Matched', feedMatchSummary_(job.summary), ui.ButtonSet.OK); return; }
      if (job.status === 'error') { ui.alert('Matching failed', String(job.error || ''), ui.ButtonSet.OK); return; }
    }
    ui.alert('Still running', 'The matching is still running after five minutes. Look at the Feed tab in a few minutes - the notes land there when it finishes.', ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Matching failed', String((err && err.message) || err), ui.ButtonSet.OK);
  }
}

/** The run's counts in plain words. */
function feedMatchSummary_(s) {
  s = s || {};
  var out = [(s.total || 0) + ' bank lines looked at.', (s.matched || 0) + ' tied to the books.',
    (s.cards || 0) + ' need your word - they are in the Inbox (Recast Books -> Inbox...).'];
  if (s.later) out.push(s.later + ' wait for a sale to close.');
  if (s.none) out.push(s.none + ' got no answer - run this again.');
  out.push('Each line\'s note is in the match_note column of the Feed tab.');
  return out.join('\n');
}

/** Phase 3: a card born from bank lines (envelope.feed, lib/feed-match.mjs) ties its Feed rows
 *  when Paul decides it - approve -> matched with the posted ids, dismiss -> back to unmatched
 *  with his note - here, in-process, never through the site. Null for a receipt card; a failure is
 *  returned, never thrown (the decision itself is already recorded). */
function tieFeedRows_(ss, feed, status, txnIds, note) {
  var ids = (feed && feed.feed_ids) || [];
  if (!ids.length) return null;
  try {
    return feedUpdateRows_(ss, ids.map(function (id) { return { feed_id: id, status: status, txn_id: (txnIds || []).join(', '), match_note: note }; }));
  } catch (err) {
    return { ok: false, error: (err && err.code) || 'INTERNAL', message: String((err && err.message) || err) };
  }
}

/** Phase 3 tuning loop (editor-only, run once, then Match statement lines... again): every
 *  pending Inbox card born from bank lines is dismissed on the site with a note saying why,
 *  and its Feed rows go back to `unmatched` with the note cleared, so the next run sends
 *  them again after a matcher fix. Rows already tied to the books are never touched; a card
 *  Paul has already decided is not pending, so it is left alone too. */
function resetFeedCards() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var user = Session.getActiveUser().getEmail();
  var pending = siteFetchJson_('/api/inbox?status=pending&limit=500').envelopes || [];
  var cards = pending.filter(function (e) { return e.feed && e.feed.feed_ids && e.feed.feed_ids.length; });
  cards.forEach(function (e) {
    siteFetchJson_('/api/inbox', 'post', { action: 'dismiss', docId: e.docId, by: user, note: 'Put back for another matching run (resetFeedCards)' });
  });
  // Every row still waiting on a card goes back (a proposed row always belongs to a card, and the
  // cards were just dismissed), plus any row an earlier, interrupted run already marked.
  var sh = ss.getSheetByName('Feed');
  var cols = headerIndex_(sh);
  var last = sh.getLastRow();
  var rows = [];
  if (last > 1) {
    var feedIds = sh.getRange(2, cols['feed_id'], last - 1, 1).getValues();
    var verdicts = sh.getRange(2, cols['status'], last - 1, 3).getValues();
    feedIds.forEach(function (r, i) {
      var status = String(verdicts[i][0]), noteText = String(verdicts[i][2]);
      if (status === 'proposed' || (status === 'excluded' && noteText.indexOf('(resetFeedCards)') >= 0)) {
        rows.push({ feed_id: String(r[0]), status: 'unmatched', txn_id: '', match_note: '' });
      }
    });
  }
  var n = rows.length ? feedUpdateRows_(ss, rows).updated : 0;
  warmCache_();
  var out = 'cards dismissed ' + cards.length + ', lines back to unmatched ' + n;
  Logger.log(out);
  return out;
}

// D-055 (Paul, 2026-09-28): the partners' working money in the Citizens account - Dennis's 5,000 of
// 08-06 and Paul's 4,858.42 of 08-13 - belongs to no house and earns no interest; it is owed back
// when either takes it out. Dr 1401 / Cr 2010 (Dennis) or 2030 (Paul), no Advances row, so nothing
// accrues. Posts both, ties both bank lines on the Feed tab and clears their Inbox cards.
// Editor-only, run once (a second run is refused DUPLICATE by the writer).
var WORKING_CAPITAL_2026_08 = [
  { date: '2026-08-06', cents: 500000, owed: '2010', payee: 'Dennis Little', feed_id: '202608060000000542493317',
    memo: 'Working money Dennis put into the Citizens account - no house, no interest; owed back when he takes it out (D-055)' },
  { date: '2026-08-13', cents: 485842, owed: '2030', payee: 'Paul Bjork', feed_id: '202608130000000543721512',
    memo: 'Working money Paul put into the Citizens account - no house, no interest; owed back when he takes it out (D-055)' }
];
function addWorkingCapital() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var ctx = buildCtx_(ss);
  var user = Session.getActiveUser().getEmail() || 'editor';
  var entries = WORKING_CAPITAL_2026_08.map(function (r) {
    return buildEntry({ type: 'journal', date: r.date, memo: r.memo, source: 'manual', posted_by: user, lines: [
      { account: '1401', debit: r.cents, credit: 0, property: '', payee: r.payee, description: 'Working money put into the account', paid_from: '1401' },
      { account: r.owed, debit: 0, credit: r.cents, property: '', payee: r.payee, description: 'Working money put into the account', paid_from: '1401' }
    ] }, ctx);
  });
  var result = postBatchEntries_(entries, props, true);
  var tie = feedUpdateRows_(ss, WORKING_CAPITAL_2026_08.map(function (r, i) {
    return { feed_id: r.feed_id, status: 'matched', txn_id: entries[i].txn_id, match_note: r.payee.split(' ')[0] + '\'s working money put into the account, no interest (D-055)' };
  }));
  WORKING_CAPITAL_2026_08.forEach(function (r) {
    try { siteFetchJson_('/api/inbox', 'post', { action: 'dismiss', docId: 'feed-1401-' + r.feed_id, by: user, note: 'Recorded as working money put into the account (D-055)' }); }
    catch (e) { /* already decided, or not pending - the entry and the tie are what matter */ }
  });
  warmCache_();
  var out = 'posted ' + entries.map(function (e) { return e.txn_id; }).join(', ') + ' (Journal rows ' + result.rows.join('-') + '); bank lines tied ' + tie.updated;
  Logger.log(out);
  return out;
}
