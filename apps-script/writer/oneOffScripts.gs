/****************************************************************
 * Recast Books - one-off and hand-run scripts (D-056, 2026-09-28)
 *
 * THE RULE. Code.gs and Menu.gs hold only what the workbook itself reaches: the
 * Recast Books menu, its dialogs (callServer_ in the .html files), the onEdit
 * trigger, the /exec web endpoint, and the standing setup tools (setup,
 * installTriggers, setupTotals, rebuildAllPropertyTabs, selfTest). EVERYTHING
 * run by hand from the editor's function dropdown lives in THIS file: a dated
 * repair, a diagnostic report, a tuning helper, a migration step. Nothing in
 * Code.gs or Menu.gs may call into this file. test/writer-gs-lint.test.mjs
 * enforces both (the D-056 test).
 *
 * ADDING ONE. Append it to the end of section 2 - or section 1 if it carries no
 * fixed data and is meant to be run again - with this header above it:
 *   // <date> <who asked, the decision> - what it does, in one or two lines.
 *   // STATUS: NOT YET RUN
 * When it has run and been checked on the Journal, change the STATUS line to
 * DONE <date> (<Journal rows or result>). Build every entry through the engine
 * (buildEntry, postBatchEntries_, voidEntry_) - never setValue on the Journal.
 * A one-off runs from the editor, so it needs a clasp push, not a web-app
 * deploy (the deploy is for Code.gs / lib.gs changes the pollers post through).
 *
 * REMOVING ONE. A DONE script is the record of what was done to the books by
 * hand; leave it. If one is ever deleted, say so in CHANGELOG.md with its date.
 *
 * Sections:
 *   1. Tools meant to be run again (no fixed data).
 *   2. Dated one-offs, in the order they were written (all DONE).
 *   3. The Phase 4 migration and the cutover (D-024..D-029; DONE 2026-09-21).
 *
 * ASCII ONLY - same paste-into-the-editor constraint as Code.gs.
 ****************************************************************/

// =============================================================================================
// 1. TOOLS MEANT TO BE RUN AGAIN
// =============================================================================================

// STATUS: RE-RUNNABLE (rebuildFrozenRecord(name) and rebuildAllFrozenRecords()). Last run by Paul 2026-09-25 17:04 PDT, both frozen tabs tied out. Run again once 280 Sparkling's Sale Price (C12) is typed.
/** Editor helper: rebuild a property that sold BEFORE freezing existed (1616 Granite,
 *  280 Sparkling) as it stood the moment before its sale posted, then freeze it - the record
 *  every future sale now keeps automatically (Paul, 2026-09-23). Run it with the name:
 *  rebuildFrozenRecord('1616 Granite'). Safe to re-run: it rebuilds from the Journal each
 *  time, and the sale's own rows are excluded by source, not by date. */
function rebuildFrozenRecord(name) {
  name = String(name);
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var reg = propertyRow_(ss, name) || {};
  if (String(reg.status || '').toLowerCase() !== 'sold') {
    throw new Error(name + ' is not sold - its tab is live, there is nothing to reconstruct.');
  }
  var date = formatIsoDate_(reg.settlement_date);
  if (!date) throw new Error(name + ' has no settlement_date on the Properties tab.');
  var built = setupPropertyTab(name, date);
  var frozen = freezePropertyTab_(ss, name, date);
  var msg = name + ': rebuilt as of ' + date + ' (' + built.rows + ' rows) and frozen' +
    (frozen ? ' (' + frozen.rows + ' x ' + frozen.cols + ')' : '');
  console.log(msg);
  return msg;
}

// STATUS: RE-RUNNABLE report (reportDuplicateReplays) and repair (voidDuplicateReplays). The sweep of 2026-09-25 voided four replays, 488.67 (audit 66). Read the report first; an old row that combined several items hides from this line-level match.
/** Editor helper, NO ARGS: live entries that look like a replay of a row already migrated
 *  from the old books - the sweep Paul asked for after receipt-20260219-ffef9418064c-629c
 *  turned out to be a duplicate (audit 65). It matched on DATE + PAYEE + AMOUNT and nothing
 *  else, deliberately: that one landed on a different PROPERTY and a different ACCOUNT than
 *  the two migrated rows it duplicated, so including either in the key would have hidden it.
 *  On a sold property a duplicate shows up as a stranded balance; on a HELD one nothing flags
 *  it, which is why this exists. Debit lines only - the credit side is the payer account and
 *  matches nothing useful. Candidates only: two real purchases of the same thing from the
 *  same vendor on the same day are possible, so nothing is voided automatically. */
function reportDuplicateReplays() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var journal = ss.getSheetByName('Journal');
  var cols = headerIndex_(journal);
  var rows = journal.getRange(2, 1, journal.getLastRow() - 1, journal.getLastColumn()).getValues();
  var g = function (r, n) { return cols[n] ? r[cols[n] - 1] : ''; };
  var debit = function (r) { return Math.round(Number(g(r, 'debit') || 0) * 100); };
  var voided = {};
  rows.forEach(function (r) { var v = String(g(r, 'void_of') || ''); if (v) voided[v] = true; });
  // "The Home Depot" and "Home Depot" are the same vendor.
  var norm = function (p) { return String(p || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ''); };
  var key = function (r) { return formatIsoDate_(g(r, 'date')) + '|' + norm(g(r, 'payee')) + '|' + debit(r); };
  var live = rows.filter(function (r) {
    return String(g(r, 'source')) !== 'void' && !voided[String(g(r, 'txn_id'))] && debit(r) > 0;
  });
  var migrated = {};
  live.forEach(function (r) {
    if (String(g(r, 'source')) !== 'migration') return;
    var k = key(r);
    (migrated[k] = migrated[k] || []).push(r);
  });

  // Grouped by entry, and EVERY debit line of a flagged entry is shown - matched or not.
  // voidDuplicateReplays only voids an entry whose every line matched, so the unmatched ones
  // are exactly what has to be read by hand.
  var byTxn = {};
  live.forEach(function (r) {
    var src = String(g(r, 'source'));
    if (src === 'migration' || src === 'sale') return;
    var id = String(g(r, 'txn_id'));
    (byTxn[id] = byTxn[id] || []).push(r);
  });
  var out = [], entries = 0, matchedLines = 0, total = 0, byProperty = {};
  Object.keys(byTxn).sort().forEach(function (id) {
    var lines = byTxn[id];
    var hits = lines.filter(function (r) { return migrated[key(r)]; });
    if (!hits.length) return;
    entries++;
    var whole = hits.length === lines.length;
    var r0 = lines[0];
    out.push((whole ? 'WHOLE ENTRY  ' : 'PARTIAL (' + hits.length + ' of ' + lines.length + ')  ') + id + '  ' +
      formatIsoDate_(g(r0, 'date')) + '  ' + g(r0, 'payee') + '  [' + g(r0, 'source') + ' -> ' +
      g(r0, 'property') + ', posted ' + g(r0, 'posted_at') + ']');
    lines.forEach(function (r) {
      var hit = migrated[key(r)];
      out.push((hit ? '   MATCH  ' : '   new?   ') + (debit(r) / 100).toFixed(2) + '  acct ' + g(r, 'account') +
        '  "' + g(r, 'description') + '"');
      if (!hit) return;
      matchedLines++; total += debit(r);
      byProperty[String(g(r, 'property'))] = (byProperty[String(g(r, 'property'))] || 0) + debit(r);
      hit.forEach(function (m) {
        out.push('          vs migrated  ' + g(m, 'txn_id') + '  ' + g(m, 'property') + ' acct ' + g(m, 'account') +
          '  "' + g(m, 'description') + '"');
      });
    });
  });
  var head = entries + ' entr(ies) flagged, ' + matchedLines + ' matched line(s), ' + (total / 100).toFixed(2) + ' total';
  Object.keys(byProperty).sort().forEach(function (k) { head += '\n   ' + k + ': ' + (byProperty[k] / 100).toFixed(2); });
  out.unshift(head);
  console.log(out.join('\n'));
  return out;
}

/** Editor helper, NO ARGS: void the replays reportDuplicateReplays flags - but ONLY where
 *  EVERY debit line of the entry matched a migrated row. An entry where some lines matched
 *  and some did not is LISTED AND LEFT ALONE: that would be a receipt carrying one real item
 *  alongside a replay, and voiding the whole thing would drop a real cost. Run
 *  reportDuplicateReplays() first and read it - that is the dry run (constraint 5). Voids are
 *  append-only: the original rows stay, mirrored by a void entry. */
function voidDuplicateReplays() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var journal = ss.getSheetByName('Journal');
  var cols = headerIndex_(journal);
  var rows = journal.getRange(2, 1, journal.getLastRow() - 1, journal.getLastColumn()).getValues();
  var g = function (r, n) { return cols[n] ? r[cols[n] - 1] : ''; };
  var debit = function (r) { return Math.round(Number(g(r, 'debit') || 0) * 100); };
  var voided = {};
  rows.forEach(function (r) { var v = String(g(r, 'void_of') || ''); if (v) voided[v] = true; });
  var norm = function (p) { return String(p || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, ''); };
  var key = function (r) { return formatIsoDate_(g(r, 'date')) + '|' + norm(g(r, 'payee')) + '|' + debit(r); };
  var live = rows.filter(function (r) {
    return String(g(r, 'source')) !== 'void' && !voided[String(g(r, 'txn_id'))] && debit(r) > 0;
  });
  var migrated = {};
  live.forEach(function (r) { if (String(g(r, 'source')) === 'migration') migrated[key(r)] = true; });

  var tally = {};   // txn_id -> {matched, total, cents, date}
  live.forEach(function (r) {
    var src = String(g(r, 'source'));
    if (src === 'migration' || src === 'sale') return;
    var id = String(g(r, 'txn_id'));
    var t = tally[id] || (tally[id] = { matched: 0, total: 0, cents: 0, date: formatIsoDate_(g(r, 'date')) });
    t.total++;
    if (migrated[key(r)]) { t.matched++; t.cents += debit(r); }
  });

  var out = [], user = Session.getActiveUser().getEmail();
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  Object.keys(tally).sort().forEach(function (id) {
    var t = tally[id];
    if (!t.matched) return;
    if (t.matched < t.total) {
      out.push('LEFT ALONE  ' + id + '  ' + t.matched + ' of ' + t.total + ' debit lines matched - review by hand');
      return;
    }
    try {
      var res = voidEntry_(id, 'duplicate of rows already migrated from the old books (same date, payee and amount)',
        today, user, props, false);
      out.push('voided  ' + id + '  ' + t.total + ' line(s)  ' + (t.cents / 100).toFixed(2) + '  -> ' + res.txn_id);
    } catch (err) {
      out.push('FAILED  ' + id + '  ' + String((err && err.message) || err));
    }
  });
  if (!out.length) out.push('nothing to void - no entry had every debit line matched');
  console.log(out.join('\n'));
  return out;
}

/** Editor helper, NO ARGS (the Run button passes none): reconstruct and freeze the record
 *  for every sold property - 1616 Granite and 280 Sparkling, which sold before freezing
 *  existed. Idempotent: it rebuilds from the Journal each time, so re-running is harmless. */
function rebuildAllFrozenRecords() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var pSheet = ss.getSheetByName('Properties');
  var pCols = headerIndex_(pSheet);
  var out = [];
  pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues().forEach(function (r) {
    if (String(r[pCols['status'] - 1] || '').toLowerCase() !== 'sold') return;
    var name = String(r[pCols['name'] - 1]);
    try { out.push(rebuildFrozenRecord(name)); }
    catch (err) { out.push(name + ': FAILED ' + String((err && err.message) || err)); }
  });
  if (!out.length) out.push('no sold properties');
  console.log(out.join('\n'));
  return out;
}

// STATUS: RE-RUNNABLE report, writes nothing.
/** Editor helper: what is stranded on a sold property - a cost that posted AFTER the sale
 *  was posted, so the release entry never covered it and every tab now hides it. These are
 *  the six-hour ctx-cache window (Menu.gs sellPost now closes it). Reports only; moving one
 *  is a void and a re-post onto Cost Recapture with the property's name in `trade` (D-031).
 *  Run with no args. */
function reportStrandedCosts() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var pSheet = ss.getSheetByName('Properties');
  var pCols = headerIndex_(pSheet);
  var sold = pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues()
    .filter(function (r) { return String(r[pCols['status'] - 1] || '').toLowerCase() === 'sold'; })
    .map(function (r) { return String(r[pCols['name'] - 1]); });
  var journal = ss.getSheetByName('Journal');
  var jc = headerIndex_(journal);
  var jr = journal.getRange(2, 1, journal.getLastRow() - 1, journal.getLastColumn()).getValues();
  var g = function (r, n) { return jc[n] ? r[jc[n] - 1] : ''; };
  var cents = function (r) { return Math.round(Number(g(r, 'debit') || 0) * 100) - Math.round(Number(g(r, 'credit') || 0) * 100); };
  var voided = {};
  jr.forEach(function (r) { var v = String(g(r, 'void_of') || ''); if (v) voided[v] = true; });
  var out = [];
  sold.forEach(function (name) {
    var live = jr.filter(function (r) {
      return String(g(r, 'property')) === name && String(g(r, 'source')) !== 'void' && !voided[String(g(r, 'txn_id'))];
    });
    var bal = {};
    live.forEach(function (r) { var a = String(g(r, 'account')); bal[a] = (bal[a] || 0) + cents(r); });
    var off = Object.keys(bal).filter(function (a) { return bal[a] !== 0; }).sort();
    if (!off.length) { out.push(name + ': CLEAN - every account is zero, the sale released all of it'); return; }
    out.push(name + ': ' + off.map(function (a) { return a + ' ' + (bal[a] / 100).toFixed(2); }).join('  '));
    // the sale's own rows all share the run's posted_at; anything posted later was never released
    var salePosted = live.filter(function (r) { return String(g(r, 'source')) === 'sale'; })
      .map(function (r) { return String(g(r, 'posted_at') || ''); }).sort().pop() || '';
    live.filter(function (r) { return String(g(r, 'source')) !== 'sale' && String(g(r, 'posted_at') || '') > salePosted; })
      .forEach(function (r) {
        out.push('   ' + g(r, 'txn_id') + '  ' + formatIsoDate_(g(r, 'date')) + '  acct ' + g(r, 'account') +
          '  ' + (cents(r) / 100).toFixed(2) + '  ' + g(r, 'payee') + '  ' + g(r, 'description') +
          '  [posted ' + g(r, 'posted_at') + ', sale posted ' + salePosted + ']');
      });
  });
  if (!out.length) out.push('no sold properties');
  console.log(out.join('\n'));
  return out;
}

// ---- Who Dennis's money was paid to: the fix (D-052, 2026-09-28). The map ADVANCE_PAID_TO and
// isPartnerDeal_ stay in Code.gs because the Add advance dialog uses them; the one-time repair is here.
// STATUS: RE-RUNNABLE (D-052; ADVANCE_PAID_TO and isPartnerDeal_ stay in Code.gs - addAdvance uses them). First run by Paul 2026-09-28 07:27-07:38: eight advances moved, verified on the Journal. Run fixAdvancesPaidTo() again after changing a paid_to on the Advances tab (the tab does not move money by itself); reportAdvancesPaidTo() is the dry run. About 10 minutes.
// Bowling Green's 1,500 of 2026-06-01 was the rest of the $7,000 check that reimbursed Paul
// (Granite's advance of that day says so); the migration had put it on Chase.
var ADVANCE_PAID_TO_KNOWN = { 'adv-manual-20260601-b92364532cf6': 'Paul' };
// Paid from the personal Chase the draws went into (the receipts show Chase, and Recast had no
// Chase account before September 2026): Paul paid them. The migration put them on 1402.
var CHASE_WAS_PAUL_TXNS = ['migration-20260306-5481469e82a5', 'migration-20260313-591053b989d1'];

/** paid_to for an advance that has none, from its kind, its notes, then its account. */
function advancePaidToGuess_(kind, notes, account) {
  if (kind === 'purchase') return 'Seller';
  if (/^Draw\b/i.test(notes) || /reimbursed Paul/i.test(notes)) return 'Paul';
  if (/^Cash advance - /i.test(notes)) return 'Vendor';   // "Cash advance - Julio, labor": Dennis paid the worker
  return { '2030': 'Paul', '1401': 'Citizens', '1402': 'Chase' }[account] || '';
}

/** Void an advance's entry and post it again with its money on `target`. Void first, like a
 *  who-paid box: if the run stops between the two, the next run finds the voided entry and
 *  posts the new one. Then the Advances row points at the new entry. */
function repointAdvance_(ss, props, adv, ac, rowNum, a, target, why, user) {
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  if (!a.voided) voidEntry_(a.txn, why, today, user, props, true);
  var entry = buildEntry({
    type: 'advance', date: a.date, amount_cents: a.cents, property: a.property, into: target,
    description: a.description || 'Dennis advance', memo: (a.memo ? a.memo + ' ' : '') + '(' + why + ')',
    source: 'manual', posted_by: user, allow_duplicate_hash: true
  }, buildCtx_(ss));
  postEntry_(entry, props);
  adv.getRange(rowNum, ac['source_txn_id']).setValue(entry.txn_id);
  return entry.txn_id;
}

/** Editor helper (Paul, once): every advance gets its paid_to, and its money moves to where
 *  paid_to says. The first run (2026-09-28) moves the five Ashburne draws and Bowling Green's
 *  1,500 off Chase onto Paul, and the two Atlas Pools payments with them. Safe to run again:
 *  it changes only what disagrees. reportAdvancesPaidTo() is the same run changing nothing. */
function fixAdvancesPaidTo() { return advancesPaidTo_(false); }
function reportAdvancesPaidTo() { return advancesPaidTo_(true); }

function advancesPaidTo_(dryRun) {
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  var adv = ss.getSheetByName('Advances');
  if (!dryRun) {
    var need = TAB_HEADERS['Advances'].length - adv.getMaxColumns();
    if (need > 0) adv.insertColumnsAfter(adv.getMaxColumns(), need);
    ensureHeaders_(adv, TAB_HEADERS['Advances']);
    var pcol = headerIndex_(adv)['paid_to'];
    adv.getRange(2, pcol, adv.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(Object.keys(ADVANCE_PAID_TO), true).setAllowInvalid(false).build());
  }
  var ac = headerIndex_(adv);
  var journal = ss.getSheetByName('Journal');
  var jc = headerIndex_(journal);
  var jr = journal.getRange(2, 1, journal.getLastRow() - 1, journal.getLastColumn()).getValues();
  var g = function (r, n) { return jc[n] ? r[jc[n] - 1] : ''; };
  var cents = function (v) { return Math.round(Number(v || 0) * 100); };
  var byTxn = {}, voided = {}, bal = { '1402': 0, '2030': 0 };
  jr.forEach(function (r) {
    var t = String(g(r, 'txn_id')), v = String(g(r, 'void_of') || '');
    if (v) voided[v] = true;
    if (cents(g(r, 'debit')) > 0) byTxn[t] = { account: String(g(r, 'account')), description: String(g(r, 'description') || ''), memo: String(g(r, 'memo') || '') };
  });
  jr.forEach(function (r) {
    var acct = String(g(r, 'account'));
    if (acct in bal && String(g(r, 'source')) !== 'void' && !voided[String(g(r, 'txn_id'))]) bal[acct] += cents(g(r, 'debit')) - cents(g(r, 'credit'));
  });
  var before = { '1402': bal['1402'], '2030': bal['2030'] };
  var user = Session.getActiveUser().getEmail() || 'editor';
  var out = [], touched = {};
  var rows = adv.getLastRow() > 1 ? adv.getRange(2, 1, adv.getLastRow() - 1, adv.getLastColumn()).getValues() : [];
  rows.forEach(function (r, i) {
    var f = function (n) { return ac[n] ? r[ac[n] - 1] : ''; };
    var id = String(f('advance_id')), notes = String(f('notes'));
    var a = { txn: String(f('source_txn_id')), date: formatIsoDate_(f('date')), cents: toCents(f('amount')), property: String(f('property')) };
    var j = byTxn[a.txn] || {};
    a.description = j.description; a.memo = j.memo; a.voided = !!voided[a.txn];
    var paidTo = String(f('paid_to') || '') || ADVANCE_PAID_TO_KNOWN[id] || advancePaidToGuess_(String(f('kind')), notes, j.account || '');
    var label = a.date + '  ' + a.property + '  ' + fromCents(a.cents) + '  "' + notes.replace(/ \(migration\)$/, '') + '"';
    if (!ADVANCE_PAID_TO[paidTo]) { out.push('NO PAID TO  ' + label + '  - pick one on the Advances tab'); return; }
    if (paidTo === 'Vendor' && isPartnerDeal_(ss, a.property)) { out.push('REFUSED  ' + label + '  - Vendor on a partner deal (D-030)'); return; }
    if (!dryRun && !f('paid_to')) adv.getRange(i + 2, ac['paid_to']).setValue(paidTo);
    var target = ADVANCE_PAID_TO[paidTo];
    if (!a.voided && j.account === target) { out.push('ok  ' + paidTo + '  ' + label); return; }
    var why = 'paid to ' + paidTo + ': ' + (a.voided ? 'voided' : j.account) + ' -> ' + target;
    if (!a.voided && j.account in bal) bal[j.account] -= a.cents;
    if (target in bal) bal[target] += a.cents;
    if (dryRun) { out.push('WOULD MOVE  ' + label + '  ' + why); return; }
    try {
      out.push('MOVED  ' + label + '  ' + why + '  now ' + repointAdvance_(ss, props, adv, ac, i + 2, a, target, why, user));
      touched[a.property] = true;
    } catch (err) {
      out.push('FAILED  ' + label + '  ' + ((err && err.code) || '') + ' ' + String((err && err.message) || err));
    }
  });
  CHASE_WAS_PAUL_TXNS.forEach(function (t) {
    var line = jr.filter(function (r) { return String(g(r, 'txn_id')) === t && cents(g(r, 'credit')) > 0; })[0];
    if (!line || voided[t] || String(g(line, 'account')) !== '1402') { out.push('ok  ' + t + '  (not on Chase)'); return; }
    var label = formatIsoDate_(g(line, 'date')) + '  ' + g(line, 'property') + '  ' + g(line, 'payee') + '  ' + fromCents(cents(g(line, 'credit')));
    bal['1402'] += cents(g(line, 'credit')); bal['2030'] -= cents(g(line, 'credit'));
    if (dryRun) { out.push('WOULD MOVE  ' + label + '  paid from Chase -> Paul'); return; }
    var said = '';
    repaidFromTxn_({ user: Session.getActiveUser() }, ss, t, 0, function (m) { said = m; });   // k 0 = Paul Paid
    out.push((/^Re-posted/.test(said) ? 'MOVED  ' : 'FAILED  ') + label + '  paid from Chase -> Paul  ' + said);
    touched[String(g(line, 'property'))] = true;
  });
  if (!dryRun) {
    // The Description formula is new, so the heavy tab needs one rebuild; a light tab's
    // formulas read the Journal live. Leave room under Apps Script's six minutes.
    Object.keys(touched).forEach(function (p) {
      if (String((propertyRow_(ss, p) || {}).template || '').toLowerCase() !== 'heavy') return;
      if (Date.now() - started > 240000) { out.push(p + ' tab NOT rebuilt (out of time) - Recast Books -> Rebuild property tab'); return; }
      try { setupPropertyTab(p); out.push(p + ' tab rebuilt'); } catch (err) { out.push(p + ' tab rebuild FAILED ' + String((err && err.message) || err)); }
    });
    warmCache_();
  }
  var money = function (c) { return (c / 100).toFixed(2); };
  out.push('Chase (1402): ' + money(before['1402']) + ' -> ' + money(bal['1402']));
  out.push('Recast owes Paul (2030, credit): ' + money(-before['2030']) + ' -> ' + money(-bal['2030']));
  console.log(out.join('\n'));
  return out;
}

// STATUS: RE-RUNNABLE (Phase 3 tuning loop, in use).
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

// =============================================================================================
// 2. DATED ONE-OFFS, IN THE ORDER THEY WERE WRITTEN (ALL DONE)
// =============================================================================================

// STATUS: DONE 2026-09-28 ~10:15 PDT by Paul: seven bills posted (1,419.00). A rerun is refused DUPLICATE.
// Paul, 2026-09-28: seven of Dennis's direct payments to 104 Ashburne's workers were jobs missing from the tab
// (D-032's consequence; the 12-11 pool clean-out is the tab's 01-05 "Clean out" row). Each gets its bill, paid
// through the advance (PAUL -> 2030, like the migrated Julio rows), so the job is a cost of the house and the
// advance stops coming off what Recast owes Paul. Editor, once: a second run is refused as DUPLICATE.
// [date, payee, description, amount, account, trade] - the date is the advance's.
var ASHBURNE_MISSING_BILLS = [
  ["2025-12-10", "Julio", "Trash removal", 200.00, "1060", "Trash"],
  ["2026-04-16", "City of Corsicana", "Dump", 21.00, "1060", "Trash"],
  ["2026-04-22", "Joe Iley", "Listing fee", 199.00, "1330", "Marketing"],
  ["2026-05-04", "Julio", "Labor", 250.00, "1020", "Landscaping"],
  ["2026-05-07", "Joe Iley", "Listing fee", 299.00, "1330", "Marketing"],
  ["2026-07-13", "Julio", "Landscaping", 150.00, "1130", "Landscaping"],
  ["2026-07-27", "Julio", "Landscaping", 300.00, "1130", "Landscaping"]
];

function addAshburneMissingBills() {
  var props = PropertiesService.getScriptProperties();
  var ctx = buildCtx_(openWorkbook_(props));
  var user = Session.getActiveUser().getEmail() || 'editor';
  var entries = ASHBURNE_MISSING_BILLS.map(function (b) {
    return buildEntry({ type: 'expense', date: b[0], payee: b[1], description: b[2], amount_cents: toCents(b[3]),
      account: b[4], trade: b[5], property: '104 Ashburne', paid_from: 'PAUL', source: 'manual', posted_by: user,
      memo: b[1] + ' - ' + b[2] + ': paid by Dennis directly (his advance of ' + b[0] + '), missing from the tab (Paul, 2026-09-28)' }, ctx);
  });
  var result = postBatchEntries_(entries, props);
  warmCache_();
  console.log('Posted ' + result.posted.length + ' bills to 104 Ashburne, Journal rows ' + result.rows.join('-'));
  return result;
}

// STATUS: DONE. The 18 re-read and held 2026-09-28 10:18 PDT; the 11 at 13:40 PDT; Paul decided every card in the Sheets Inbox. reprocessParked_(docIds) itself is a re-usable loop that never writes.
// Paul, 2026-09-28 ("the books should be only in sheets now"): the 18 Ashburne receipts parked for
// "the card statement" (D-051, paul-answers.json mail_settled) go back to his Sheets Inbox for his word
// per line (Approve / Returned / Dismiss). Each is re-read and HELD - a reprocess never posts or
// dismisses (D-049) - whatever Blobs says today: six say "posted" from the 09-17 STAGING replay (none
// of those ids is on the production Journal, all six checked by id), the other twelve are dismissed.
// The route is the Inbox's own Reprocess button (inboxReprocess, Menu.gs). Editor, once; about one
// model read per receipt. Store, date, total as parked:
var PARKED_ASHBURNE_RECEIPTS = [
  'gm-19ba4950d7e2561c', // Lowe's 01-09 360.49 (part overhead)
  'gm-19c01b85d135afa6', // Amazon 01-20 276.22
  'gm-19c28c64aa9a29ea', // Lowe's 02-04 134.23
  'gm-19c617b59e734eb5', // Home Depot 02-15 137.68 (60.79 on the books)
  'gm-19c6823763f5cb17', // Home Depot 02-16 30.79
  'gm-19cd5479e52e3fe9', // Home Depot 03-09 83.83
  'gm-19cd5e12f4e9d9b7', // AllModern 03-09 214.34
  'gm-19cd5e3f4729e97b', // Ping Lighting 03-10 99.20
  'gm-19cddf3d9dcd3db2', // Home Depot 03-11 6.68
  'gm-19ce3297652cbfc8', // Home Depot 03-12 385.27 (100.54 on)
  'gm-19ced5e82e20e490', // McCoy's 03-14 61.53
  'gm-19cf927112794782', // Wayfair 03-16 93.08
  'gm-19d0716277e58567', // Lowe's 03-19 404.78
  'gm-19d20cf12a8888da', // Home Depot 03-21 389.93
  'gm-19d25017467ed73d', // Home Depot 03-25 241.50 (66.08 on)
  'gm-19d5e139b4ae4612', // Home Depot 04-05 288.44 (59.80 on)
  'gm-19d63f17bf22f9fa', // Home Depot 04-06 181.52 (no property read)
  'gm-19d960cfeccab6cd'  // Home Depot 04-16 88.83 (part overhead)
];

// 2026-09-28 (b): the rest of the migration's PARKED receipts (paul-answers.json mail_settled): the 35 less the 18
// above, less the five Amazon orders refunded in full (02-08 fans 1,001.21, 02-22 fans 283.74, 02-24 fans 246.78,
// 03-15 brackets 25.32, 08-13 Mesa item 36.99 - the refund notices are in pvb421's listing) and Home Depot 04-10
// 161.28 (on the books, C-32). None of the eleven is on the Journal by total or subtotal (checked 2026-09-28).
// Same route as the 18: a re-read that can only hold - Paul decides each card in the Sheets Inbox.
var PARKED_MIGRATION_RECEIPTS = [
  'gm-19c1fc34982c2b29', // Floor & Decor 02-02 e-receipt, image unreadable (104ashburne@)
  'gm-19d066ca90092950', // photo 03-19, Shell 7.57 (104ashburne@)
  'gm-19d5e0ce39d91e0d', // Home Depot 04-05 online order 271.52 less 40.80 = 230.72 (paul@)
  'gm-19d7d9e5cfb8c9f6', // photo 04-11, Taco Cabana 73.57 (104ashburne@)
  'gm-19d8db0dbb2e6309', // photo 04-14, Shell water and Gatorade 19.99 (104ashburne@)
  'gm-19d926697aea1558', // photo 04-15, Braum's 22.93 (104ashburne@)
  'gm-19ed69af26494e70', // Lowe's 06-17 49.17 (paul@)
  'gm-19f1526194ff1558', // photo 06-29, Home Depot 62.63 (1616granite@ - Granite is closed in the books)
  'gm-19f1e7a4d47322d9', // Amazon 07-01 Gerber toilet tank 106.75 (receipts@)
  'gm-19fc442272873900', // photo 08-02 (136bowlinggreen@)
  'gm-19fc454ddc47341f'  // photo 08-02, 7-Eleven 11.90 (136bowlinggreen@)
];

function reprocessParkedAshburneReceipts() { return reprocessParked_(PARKED_ASHBURNE_RECEIPTS); }
function reprocessParkedMigrationReceipts() { return reprocessParked_(PARKED_MIGRATION_RECEIPTS); }
function reprocessParked_(docIds) {
  var by = Session.getActiveUser().getEmail() || 'editor';
  var out = [];
  docIds.forEach(function (docId) {
    try {
      siteFetchJson_('/api/inbox', 'post', { action: 'reprocess', docId: docId, by: by });
      out.push('re-reading  ' + docId);
    } catch (err) {
      out.push('FAILED  ' + docId + '  ' + ((err && err.code) || '') + ' ' + String((err && err.message) || err));
    }
    Utilities.sleep(2000);   // ponytail: a gentle burst - the reads themselves run in the background on the site
  });
  console.log(out.join('\n'));
  return out;
}

// STATUS: DONE 2026-09-28 11:49 PDT: five linked, verified. A linked card is skipped on a rerun.
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

// STATUS: DONE 2026-09-28 12:55 PDT: Journal rows 2560-2561.
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

// STATUS: DONE 2026-09-28 13:04 PDT: 72 lines moved, tab rebuilt. A rerun finds nothing to move.
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

// STATUS: RE-RUNNABLE. Run 2026-09-28 13:06 PDT (replayed the last stuck receipt - and three pre-cutover documents by mistake, since guarded by REPLAY_CUTOVER and undone by undoReplayedMigrationDocs).
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

// STATUS: DONE 2026-09-28 13:14 PDT: three entries voided, their cards dismissed.
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

// STATUS: DONE 2026-09-28 13:20 PDT: Journal rows 2594-2595.
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

// STATUS: DONE 2026-09-28 ~14:10 PDT: the duplicate voided, the 20.54 filter posted to Cost Recapture (CHANGELOG 14:10).
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

// STATUS: DONE 2026-09-28 (CHANGELOG 16:15): rows 2649-2650 voided, 137.06 re-posted.
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

// STATUS: DONE 2026-09-28 ~15:30 PDT: the 91.35 voided, the 08-13 card put back; the 08-07 card re-read and entered right (rows 2647-2648).
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

// STATUS: DONE 2026-09-28 17:29 PDT by Paul: Journal rows 2659-2662, both bank lines tied, verified. A rerun is refused DUPLICATE.
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

// STATUS: DONE 2026-09-29 ~10:57 PDT by Paul: manual-20260812-22cd3e4a2bc0, the check tied to it and the payout, the card dismissed - all read back. A rerun is refused DUPLICATE.
// D-055, Paul 2026-09-29, on the card for his check of 08-12: he took 32,105.26 of his 280 Sparkling
// payout (the books' 32,246.84) and left the other 141.58 in the Citizens account as working money -
// which is why his deposit of 08-13 was 4,858.42 and not 5,000. Dr 1401 / Cr 2030, no house, no
// Advances row; his working money is 5,000.00, the same as Dennis's. The payout entry is untouched
// (280 Sparkling is closed and frozen): the check ties to the payout and this entry TOGETHER
// (-32,246.84 + 141.58 = -32,105.26). Editor-only, run once (a second run is refused DUPLICATE).
var PAYOUT_LEFT_IN_2026_08 = { date: '2026-08-12', cents: 14158, payee: 'Paul Bjork', feed_id: '202608120000000543525338',
  payout_txn: 'sale-20260806-e162353297b7',
  memo: 'Working money Paul left in the Citizens account out of his 280 Sparkling payout (took 32,105.26 of 32,246.84) - no house, no interest; with his 4,858.42 of 08-13 it is 5,000.00 (D-055)' };
function addPaulWorkingMoneyLeftIn() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var ctx = buildCtx_(ss);
  var user = Session.getActiveUser().getEmail() || 'editor';
  var r = PAYOUT_LEFT_IN_2026_08;
  var entry = buildEntry({ type: 'journal', date: r.date, memo: r.memo, source: 'manual', posted_by: user, lines: [
    { account: '1401', debit: r.cents, credit: 0, property: '', payee: r.payee, description: 'Working money left in the account', paid_from: '1401' },
    { account: '2030', debit: 0, credit: r.cents, property: '', payee: r.payee, description: 'Working money left in the account', paid_from: '1401' }
  ] }, ctx);
  var result = postBatchEntries_([entry], props, true);
  var tie = feedUpdateRows_(ss, [{ feed_id: r.feed_id, status: 'matched', txn_id: r.payout_txn + ', ' + entry.txn_id,
    match_note: 'Paul\'s 280 Sparkling payout, less the 141.58 he left in the account as working money (D-055)' }]);
  try { siteFetchJson_('/api/inbox', 'post', { action: 'dismiss', docId: 'feed-1401-' + r.feed_id, by: user, note: 'The 141.58 stayed in the account as Paul\'s working money (D-055)' }); }
  catch (e) { /* already decided, or not pending - the entry and the tie are what matter */ }
  warmCache_();
  var out = 'posted ' + entry.txn_id + ' (Journal rows ' + result.rows.join('-') + '); bank lines tied ' + tie.updated;
  Logger.log(out);
  return out;
}

// =============================================================================================
// 3. THE PHASE 4 MIGRATION AND THE CUTOVER (D-024..D-029; DONE 2026-09-21)
// =============================================================================================

// STATUS: RETIRED. Used on STAGING between reruns and ONCE on the real workbook at the 2026-09-21 cutover (D-013). It deletes the Journal - never again on the live books.
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

// STATUS: DONE 2026-09-21 (the cutover): 1,048 entries, 240,844.35, tied out both paths. MigrationData.gs is not in the project, so migrationPostRows() throws by design. Kept as the record of how the old books came across.
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
