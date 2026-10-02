/****************************************************************
 * Recast Books - one-off and hand-run scripts (D-056, 2026-09-28)
 *
 * THE RULE. Code.gs and Menu.gs hold only what the workbook itself reaches: the
 * Recast Books menu, its dialogs (callServer_ in the .html files), the timers and
 * the onEdit trigger, the /exec web endpoint, and the standing setup tools (setup,
 * installTriggers, setupTotals, rebuildAllPropertyTabs, selfTest). EVERYTHING
 * run by hand from the editor's function dropdown lives in THIS file: a dated
 * repair, a diagnostic report, a tuning helper. Nothing in Code.gs or Menu.gs may
 * call into this file. test/writer-gs-lint.test.mjs enforces both (the D-056 test).
 *
 * ADDING ONE. Put it below with this header above it:
 *   // <date> <who asked, the decision> - what it does, in one or two lines.
 *   // STATUS: NOT YET RUN
 * Build every entry through the engine (buildEntry, postBatchEntries_, voidEntry_) -
 * never setValue on the Journal. A one-off runs from the editor, so it needs a clasp
 * push, not a web-app deploy.
 *
 * REMOVING ONE (Paul, 2026-09-30: "remove all scripts in the oneOffScripts.gs"). Once
 * a script has run and been checked on the books, it comes out, so the editor's list
 * stays short. Git keeps every one, and CHANGELOG.md says what was run and when:
 * every script up to 2026-09-30 is in commit 774ecd3 -
 *   git show 774ecd3:apps-script/writer/oneOffScripts.gs
 * (postInterest, for recording Dennis's interest at the year-end, is in that commit's
 * Menu.gs; rebuildAllFrozenRecords, for 280 Sparkling's Sale Price, is in the file.)
 * The 21 scripts of 2026-10-01 and 10-02 (the final register, the closing tabs, the
 * 10-02 repair and the receipt relink) are in commit db9453f -
 *   git show db9453f:apps-script/writer/oneOffScripts.gs
 *
 * ASCII ONLY - same paste-into-the-editor constraint as Code.gs.
 ****************************************************************/

// 2026-10-02 Paul ("let's move the entire amount to bowling green") - his 607.05 check of 8/7 (cleared 08-12, memo
// "Bowling Green + Newport") goes on 136 Bowling Green in full. Voids the 10-01 split (881 Newport 44.39, 136 Bowling
// Green 562.66), posts one entry of 607.05 on Bowling Green, re-ties the bank line. Paul's word overrides the old
// Newport tab's 44.39 line (register 28). Newport owes Paul 44.39 more, Bowling Green 44.39 less; the total, the
// costs and the bank do not change. Before Newport's sale is run.
// STATUS: DONE 2026-10-02 13:10 PDT (run from the editor as paul@ on his word): both voided, manual-20260812-36df34b30c02 posted (Journal rows 3142-3143), bank line re-tied; every read-back OK - Newport owes Paul 834.00 -> 878.39, Bowling Green 596.12 -> 551.73.
var MC_CHECK = { feed: '202608120000000543553682', cents: 60705,
  old: [['manual-20260812-072e078314cd', 4439], ['manual-20260812-82db3caac4fd', 56266]] };
function moveCheckToBowlingGreen() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var out = [], ctx = buildCtx_(ss), J = mrJournal_(ss), today = mrToday_();   // J.all stays as read: the before of the report
  var c = MC_CHECK;
  if (c.old.reduce(function (t, p) { return t + p[1]; }, 0) !== c.cents) throw new Error('the parts do not add up to the check');
  var what = 'Check to Paul (memo "Bowling Green + Newport") - paid back for costs he paid himself';
  // built (and so checked) before anything is voided
  var entry = buildEntry({ type: 'journal', date: '2026-08-12', source: 'manual', posted_by: mrUser_(),
    memo: 'Check of 607.05 from the Citizens account to Paul, written 8/7 - all of it on 136 Bowling Green (Paul, 2026-10-02: ' +
      '"move the entire amount to bowling green"; his word overrides the old 881 Newport tab\'s 44.39 line); not an advance, ' +
      'no interest (' + c.old[0][0] + ' and ' + c.old[1][0] + ' voided 2026-10-02)', lines: [
      { account: '2030', debit: c.cents, credit: 0, property: '136 Bowling Green', payee: 'Paul Bjork', description: what, paid_from: '1401' },
      { account: '1401', debit: 0, credit: c.cents, property: '136 Bowling Green', payee: 'Paul Bjork', description: what, paid_from: '1401' }] }, ctx);
  c.old.forEach(function (p) {
    mrVoid_(J, p[0], 'Paul, 2026-10-02: the whole 607.05 check goes on 136 Bowling Green - re-posted as one entry', today, props, out,
      { account: '2030', cents: p[1] });
  });
  if (c.old.every(function (p) { return J.voided[p[0]]; })) {   // true on a rerun too, so a failed post can be run again
    mrPost_(J, [entry], props, out);
    feedUpdateRows_(ss, [{ feed_id: c.feed, status: 'matched', txn_id: entry.txn_id,
      match_note: 'Paul: his check paying him back for costs he paid himself - all of it on 136 Bowling Green (his word, 2026-10-02)' }]);
    out.push('bank line re-tied: the 607.05 check (08-12)');
  } else out.push('NOT POSTED: both old entries must be voided first - tell Claude');
  return mrFinish_(ss, 'moveCheckToBowlingGreen - ' + new Date(), J, [
    ['881 Newport, Recast owes Paul', '2030', '881 Newport', 4439, -1],
    ['136 Bowling Green, Recast owes Paul', '2030', '136 Bowling Green', -4439, -1],
    ['Citizens (1401), all', '1401', null, 0],
    ['Recast owes Paul, all', '2030', null, 0, -1]
  ], ['881 Newport', '136 Bowling Green'], out);
}

// ---- helpers for moveCheckToBowlingGreen (copied as they ran on 10-01, commit db9453f; they come out with it) ----
function mrUser_() { return Session.getActiveUser().getEmail() || 'editor'; }
function mrToday_() { return Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd'); }

/** Every Journal line by txn_id (amounts in cents) and the set of voided txn_ids. */
function mrJournal_(ss) {
  var data = readTabData_(ss, 'Journal', { all: true });
  var byTxn = {}, voided = {}, all = [];
  data.rows.forEach(function (r) {
    var o = {};
    data.headers.forEach(function (h, i) { o[h] = r[i]; });
    o.debit = Math.round((Number(o.debit) || 0) * 100);
    o.credit = Math.round((Number(o.credit) || 0) * 100);
    o.date = String(o.date).slice(0, 10);
    o.account = String(o.account);
    (byTxn[o.txn_id] = byTxn[o.txn_id] || []).push(o);
    if (o.void_of) voided[o.void_of] = true;
    all.push(o);
  });
  return { byTxn: byTxn, voided: voided, all: all };
}

/** debit - credit on one account for one house (voids included: they cancel their originals). */
function mrBal_(J, account, property) {
  return J.all.reduce(function (t, l) {
    return l.account === String(account) && (property == null || l.property === property) ? t + l.debit - l.credit : t;
  }, 0);
}

/** Voids a live entry, optionally only when it still has a line on `want.account` of `want.cents`. */
function mrVoid_(J, id, why, date, props, out, want) {
  var lines = J.byTxn[id];
  if (!lines) { out.push('NOT ON THE BOOKS, skipped  ' + id); return false; }
  if (J.voided[id]) { out.push('already voided  ' + id); return false; }
  if (want && !lines.some(function (l) { return l.account === want.account && l.debit === want.cents; })) {
    out.push('NOT VOIDED, it differs from the plan (' + want.account + ' ' + fromCents(want.cents) + ')  ' + id); return false;
  }
  try { voidEntry_(id, why, date, mrUser_(), props, true); J.voided[id] = true; out.push('voided  ' + id); return true; }
  catch (err) { out.push('void FAILED  ' + id + '  ' + String((err && err.message) || err)); return false; }
}

/** Posts the entries not already on the Journal, in one batch (the tabs are rebuilt once, at the end). */
function mrPost_(J, entries, props, out) {
  var fresh = entries.filter(function (e) {
    if (J.byTxn[e.txn_id]) { out.push('already posted  ' + e.txn_id); return false; }
    return true;
  });
  if (!fresh.length) return [];
  var res = postBatchEntries_(fresh, props, true);
  fresh.forEach(function (e) {
    J.byTxn[e.txn_id] = e.lines;
    out.push('posted  ' + e.txn_id + '  ' + e.date + '  ' + fromCents(e.lines.reduce(function (t, l) { return t + (l.debit || 0); }, 0)));
  });
  out.push('  (Journal rows ' + res.rows.join('-') + ')');
  return fresh;
}

/** Rebuilds what was touched, then the report: each balance before -> after, beside the planned change. */
function mrFinish_(ss, title, J0, checks, houses, out) {
  houses.forEach(function (h) {
    try { setupPropertyTab(h); out.push('rebuilt  ' + h); } catch (err) { out.push('rebuild FAILED ' + h + '  ' + String((err && err.message) || err)); }
  });
  refreshBankSheets_(ss);
  refreshPnl_(ss);
  warmCache_();
  var J1 = mrJournal_(ss);
  out.push('', 'READ BACK (Recast owes Paul = minus the 2030 balance; "planned" is for a first run - on a later run only what that run posted counts):');
  checks.forEach(function (c) {   // [label, account, property, planned change in cents, sign]
    var s = c[4] || 1, b = s * mrBal_(J0, c[1], c[2]), a = s * mrBal_(J1, c[1], c[2]);
    out.push('  ' + c[0] + ':  ' + fromCents(b) + ' -> ' + fromCents(a) + '  (change ' + fromCents(a - b) + ', planned ' + fromCents(c[3]) + ')' + (a - b === c[3] ? '  OK' : '  CHECK'));
  });
  var dr = J1.all.reduce(function (t, l) { return t + l.debit; }, 0), cr = J1.all.reduce(function (t, l) { return t + l.credit; }, 0);
  out.push('  the Journal balances: ' + (dr === cr ? 'yes' : 'NO - debits ' + fromCents(dr) + ', credits ' + fromCents(cr)));
  out.unshift(title);
  console.log(out.join('\n'));
  return out;
}
