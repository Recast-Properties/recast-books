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
 *
 * ASCII ONLY - same paste-into-the-editor constraint as Code.gs.
 ****************************************************************/

// =============================================================================================
// 2026-10-01 - THE FINAL MIGRATION REGISTER (docs/migration-leftovers-final.md), PAUL'S ANSWERS OF 10-01
// Paul, 2026-10-01: "yes to everything. keep the doorbell. leave $200 dennis mowed off books."
// Six scripts, run once each in this order (a second run skips what is done - voids answer
// ALREADY_VOIDED, posts already on the Journal are skipped, links are re-written the same):
//   0. (paul@ poller, not here) replayIds - look-only reads of the 84 paul@ emails the writer cannot read
//   1. fixNewportBeforeClosing      - before 881 Newport's sale is posted
//   2. fixAshburneBeforeClosing     - before 104 Ashburne's sale is posted
//   3. relinkMigrationReceipts      - before 104 Ashburne's sale is posted (its tab freezes, D-043)
//   4. reprocessStoreReceipts       - the 29 store receipts back into the Sheets Inbox (Q6), after 3
//   5. fixOverheadAndTheRest        - no deadline
//   6. linkPhonePhotos              - after the reads of step 0 are in (Q5)
// Every entry is built through the engine (buildEntry, postBatchEntries_, voidEntry_, setDocUrl_,
// feedRetieRows_); a change of account, house, description or tax label is a void plus a corrected
// re-post. Each script ends with a report for Paul to paste back: what it did, then each balance it
// touched before -> after, beside the change this plan expects.
// =============================================================================================

// ---- shared by the six (they come out together) ----------------------------------------------
// STATUS: helpers for the six scripts below - nothing to run on its own
var MR_DAY = '2026-10-01';   // the date of a correction "made today": fixed, so a rerun on another day is refused DUPLICATE
function mrUser_() { return Session.getActiveUser().getEmail() || 'editor'; }
function mrToday_() { return Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd'); }
function mrDrive_(id) { return 'https://drive.google.com/file/d/' + id + '/view?usp=drivesdk'; }
function mrId_(s) { return /^(migration|manual|receipt|sale)-/.test(s) ? s : 'migration-' + s; }

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

/** The entry `id` as it stands, rebuilt as a manual entry with o.edit applied to a copy of each line
 *  (return null to drop a line). One credit line takes up any change in the debits. cost_class and
 *  tax_treatment come from the account again unless the edit sets them. */
function mrRepost_(J, id, o, ctx) {
  var orig = J.byTxn[id];
  if (!orig) throw new Error(id + ' is not on the Journal');
  var lines = orig.map(function (l) {
    var c = { account: l.account, debit: l.debit, credit: l.credit, property: l.property, trade: l.trade || '', payee: l.payee,
      description: l.description, paid_from: l.paid_from, business_purpose: l.business_purpose || '' };
    return o.edit ? o.edit(c) : c;
  }).filter(Boolean);
  var dr = lines.reduce(function (t, l) { return t + (l.debit || 0); }, 0), cr = lines.reduce(function (t, l) { return t + (l.credit || 0); }, 0);
  var credits = lines.filter(function (l) { return l.credit > 0; });
  if (dr !== cr) {
    if (credits.length !== 1) throw new Error(id + ': the re-post does not balance');
    credits[0].credit += dr - cr;
  }
  return buildEntry({ type: 'journal', date: o.date || orig[0].date, source: 'manual', posted_by: mrUser_(),
    doc_url: o.doc_url != null ? o.doc_url : String(orig[0].doc_url || ''), memo: o.memo, lines: lines }, ctx);
}

/** A refund or return: Dr 2030 (Paul is owed less) / Cr each returned item on the account and section it was bought on. */
function mrRefund_(r, ctx) {
  var total = r.lines.reduce(function (t, x) { return t + x[2]; }, 0);
  var lines = [{ account: '2030', debit: total, credit: 0, property: r.property, payee: r.payee, description: r.what, paid_from: 'PAUL' }]
    .concat(r.lines.map(function (x) {
      return { account: x[1], debit: 0, credit: x[2], property: r.property, trade: x[3], payee: r.payee,
        description: r.prefix + x[4] + ' (' + x[0] + ')', paid_from: 'PAUL', business_purpose: x[5] || '' };
    }));
  return buildEntry({ type: 'journal', date: r.date, source: 'manual', posted_by: mrUser_(), doc_url: r.doc_url || '', memo: r.memo, lines: lines }, ctx);
}

/** One envelope from the site (any status, a look-only read included), or null. */
function mrEnv_(docId) {
  try { return (siteFetchJson_('/api/inbox?docId=' + encodeURIComponent(docId)).envelopes || [])[0] || null; }
  catch (err) { return null; }
}

/** Files one document of an envelope to Drive under folder (the attachment whose name matches
 *  `prefer`, else the first; an email with none is filed as its text, D-035). Returns the url or ''. */
function mrFile_(env, folder, prefer, props) {
  if (!env) return '';
  try {
  var m = env.model || {};
  var atts = (env.attachments || []).filter(function (a) { return a && a.key; });
  var a = atts.filter(function (x) { return prefer && prefer.test(String(x.name || '')); })[0] || atts[0];
  if (a) {
    var bytes = siteFetchRaw_('/api/file?key=' + encodeURIComponent(a.key)).getContent();
    return storeDocument_(driveFileName_(m, a.name || 'receipt', 0), a.mime || 'application/octet-stream', Utilities.base64Encode(bytes), folder, props).url;
  }
  return env.bodyText ? storeEmailText_(m, String(env.bodyText), folder, props) : '';
  } catch (err) { console.error('mrFile_ ' + env.docId + ': ' + String((err && err.message) || err)); return ''; }
}

/** A look-only read of a paul@ email (step 0), when it is in. */
function mrRead_(gmailId, out) {
  var env = mrEnv_('dry-gm-' + gmailId);
  if (!env || env.status !== 'dry') { out.push('NOT READ YET - run replayIds in the paul@ poller, then run this again  ' + gmailId); return null; }
  return env;
}

function mrUrlOk_(url) {
  var id = (String(url || '').match(/\/d\/([\w-]{20,})/) || [])[1];
  try { return !!id && !DriveApp.getFileById(id).isTrashed(); } catch (err) { return false; }
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

// ---- 1 ---------------------------------------------------------------------------------------
// 2026-10-01 Paul (final migration register, answers of 10-01) - 881 Newport before its sale is posted:
// (a) register 19: the 09-09 HOA resale certificate 375.00 moves from 1310 closing costs to 1340 HOA release
//     (D-039); void + re-post, the CondoCerts bank line of 09-28 re-tied to the re-post.
// (b) register 28: Paul's 607.05 check of 8/7 re-split to the old books' 881 Newport tab (I11, F21:I21
//     "Reimbursement to Paul" 44.39): Newport 44.39, Bowling Green 562.66 (was 206.14 / 400.91); the bank line re-tied.
// (c) Q1 (Paul: yes, Newport): the Home Depot Pro appliance order H6505-462260 of 07-01, 639.82, paid by Paul
//     (before 08-01, D-026.2) - posted from its look-only read (step 0), receipt filed under 2026/881 Newport.
//     Not read yet, or the read disagrees (total, a card that is not Paul's): nothing posts, the report says why.
// STATUS: DONE 2026-10-01 10:26 PDT by Paul: HOA 375.00 to 1340 (row added to Accounts), the 607.05 check re-split 44.39 / 562.66, the appliance 639.82 on Newport; every read-back OK, Journal rows 2758-2766.
var MR_NEWPORT_HOA = { old: 'migration-20260909-3663d0ddee0f', feed: '202609280000000551667474' };
var MR_CHECK_60705 = { feed: '202608120000000543553682', cents: 60705,
  parts: [{ old: 'manual-20260812-d52b66b70320', property: '881 Newport', cents: 4439 },
          { old: 'manual-20260812-c821582576ac', property: '136 Bowling Green', cents: 56266 }] };
var MR_APPLIANCE = { gmail: '19f1ecf847d89a4c', date: '2026-07-01', total: 63982, invoice: 'H6505-462260',
  items: [[59654, 'Appliance, Home Depot Pro order H6505-462260 (599.00 less the 47.92 Pro discount, with tax)'],
          [4328, 'Add-on to the appliance, order H6505-462260 (39.98 with tax)']] };
function fixNewportBeforeClosing() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var out = [];
  // 1340 (D-039) is in the chart but never reached the live Accounts tab (the 10-01 first run stopped on it,
  // nothing written) - setup()'s ensureSeedRows_ adds a missing seed row and touches no other.
  if (ensureSeedRows_(ss.getSheetByName('Accounts'), ACCOUNTS_SEED)) { CacheService.getScriptCache().remove('ctx'); out.push('added to Accounts: 1340 Selling - HOA release'); }
  var ctx = buildCtx_(ss), J = mrJournal_(ss), today = mrToday_();   // J.all stays as read: the before of the report
  var c = MR_CHECK_60705;
  if (c.parts.reduce(function (t, p) { return t + p.cents; }, 0) !== c.cents) throw new Error('the parts do not add up to the check');
  // (a) and (b): every re-post is built (and so checked) before anything is voided
  var hoa = mrRepost_(J, MR_NEWPORT_HOA.old, { memo: 'old books: 881 Newport row 27; Neighborhood Management order GRJ-A40402, Standard Resale Certificate; moved from 1310 to 1340 under D-039 (' + MR_NEWPORT_HOA.old + ' voided 2026-10-01)',
    edit: function (l) { if (l.account === '1310') l.account = '1340'; return l; } }, ctx);
  var what = 'Check to Paul (memo "Bowling Green + Newport") - paid back for costs he paid himself';
  var paul = c.parts.map(function (p) {
    return buildEntry({ type: 'journal', date: '2026-08-12', source: 'manual', posted_by: mrUser_(),
      memo: 'Check of 607.05 from the Citizens account to Paul, written 8/7 - ' + (p.property === '881 Newport'
        ? 'Newport\'s part, 44.39, as the old books\' 881 Newport tab recorded it (I11; F21:I21 "Reimbursement to Paul")'
        : 'the rest of the check, 562.66 (the old Bowling Green tab: Paul paid 2,062.66 to 08-07, less 1,500.00 repaid 06-01)') +
        '; not an advance, no interest (' + p.old + ' voided 2026-10-01)', lines: [
        { account: '2030', debit: p.cents, credit: 0, property: p.property, payee: 'Paul Bjork', description: what, paid_from: '1401' },
        { account: '1401', debit: 0, credit: p.cents, property: p.property, payee: 'Paul Bjork', description: what, paid_from: '1401' }] }, ctx);
  });
  mrVoid_(J, MR_NEWPORT_HOA.old, 'D-039 (Paul, 2026-09-22): an HOA resale certificate is 1340 Selling - HOA release; read as 1310 on 09-17, before D-039 - re-posted on 1340', today, props, out);
  c.parts.forEach(function (p) {
    mrVoid_(J, p.old, 'the 607.05 check re-split to the old books: 881 Newport 44.39 (its tab I11 / F21:I21), 136 Bowling Green 562.66 - re-posted (2026-10-01)', today, props, out);
  });
  mrPost_(J, [hoa].concat(paul), props, out);
  feedRetieRows_(ss, MR_NEWPORT_HOA.old, [hoa.txn_id], 'The HOA release fee for 881 Newport (09-09, on its own HOA release line since 2026-10-01); the card cleared it on 09-28 through CondoCerts.');
  var note = 'Paul: his check paying him back for costs he paid himself - 881 Newport 44.39, 136 Bowling Green 562.66';
  c.parts.forEach(function (p, i) { feedRetieRows_(ss, p.old, [paul[i].txn_id], note); });
  out.push('bank lines re-tied: CondoCerts 375.00 (09-28) and the 607.05 check (08-12)');
  // (c) the appliance, from its read
  var a = MR_APPLIANCE, env = mrRead_(a.gmail, out), applied = 0;
  if (env) {
    var m = env.model || {};
    if (Number(m.receipt_total_cents) !== a.total) out.push('APPLIANCE NOT POSTED: the read says ' + fromCents(Number(m.receipt_total_cents) || 0) + ', not 639.82 - tell Claude');
    else if (m.paid_from === 'DENNIS' || /^14/.test(String(m.paid_from))) out.push('APPLIANCE NOT POSTED: the read says it was paid by ' + m.paid_from + ' (' + (m.paid_from_reason || '') + ') - tell Claude');
    else {
      var items = a.items.map(function (x) { return { account: '1040', amount_cents: x[0], description: x[1], trade: 'Appliances' }; });
      var entry = buildEntry({ type: 'purchase', date: a.date, payee: 'The Home Depot', property: '881 Newport', paid_from: 'PAUL',
        items: items, source: 'manual', posted_by: mrUser_(), invoice_number: a.invoice,
        memo: 'Home Depot Pro order ' + a.invoice + ', ordered 07-01, delivered 07-08 - in no book (register 39); Paul 2026-10-01: for 881 Newport. Paid by Paul (before 08-01, D-026.2; the read: ' + String(m.paid_from_reason || m.paid_from || 'no card shown').slice(0, 120) + ')' }, ctx);
      if (!J.byTxn[entry.txn_id]) entry.doc_url = mrFile_(env, ['2026', '881 Newport'], /Receipt/i, props);
      applied = mrPost_(J, [entry], props, out).length ? a.total : 0;
    }
  }
  return mrFinish_(ss, 'fixNewportBeforeClosing - ' + new Date(), J, [
    ['881 Newport, Recast owes Paul', '2030', '881 Newport', 16175 + applied, -1],
    ['881 Newport, closing costs (1310)', '1310', '881 Newport', -37500],
    ['881 Newport, HOA release (1340)', '1340', '881 Newport', 37500],
    ['881 Newport, fixtures and appliances (1040)', '1040', '881 Newport', applied],
    ['136 Bowling Green, Recast owes Paul', '2030', '136 Bowling Green', -16175, -1],
    ['Citizens (1401), all', '1401', null, 0],
    ['Recast owes Paul, all', '2030', null, applied, -1]
  ], ['881 Newport', '136 Bowling Green'], out);
}

// ---- 2 ---------------------------------------------------------------------------------------
// 2026-10-01 Paul (final migration register, answers of 10-01) - the money fixes that must be in before
// 104 Ashburne's sale is posted (plus the Mesa and overhead halves of the same items):
//   voids: register 9 the 03-30 Lowe's knobs 59.49 (same receipt as the 340.90 fans row, Paul 09-28 rule);
//          register 7 the C-10 walk-off mats 81.11 (the old books' 04-08 "Floor mats" is the same receipt);
//          register 37 the two Amazon orders Amazon cancelled before charging (10.81, 108.24);
//   void + re-post: register 10 the 09-26 Lowe's 02-03 card without the passage knobs (the old books' 02-04
//          "Door Knobs" row) - 102.46 kept; register 30 Juan Garcia 3 x 7,000 from 1030 to 1020 labor; register 31
//          Berrett 270.63 to 1130 and HILCO 200.00 to 1120 (its bank line re-tied); Q4 the 08-25 toner at 111.48;
//   credits: register 3 the seven Home Depot / Lowe's return slips (801.15) and Q3's GFCI (57.35), each slip
//          filed to Drive; register 23 the five online refunds (327.32);
//   new: Q7 the Wayfair order of 03-25, 324.69, on 104 Ashburne - only if its order email ships to Ashburne
//          (from its look-only read; otherwise nothing posts and the report says so).
// STATUS: DONE 2026-10-01 10:37 PDT by Paul: 11 voids, 20 posts incl. the Wayfair 03-25 324.69; every read-back OK, Journal rows 2792-2850.
var MR_VOIDS_ASHBURNE = [
  ['migration-20260330-ab7cb509e533', '1030', 5949, 'C-35: the same Lowe\'s receipt (invoice 90143) as migration-20260330-2f6012e9e7e0 "Exterior Ceiling Fans" 340.90, which already holds the knobs - Paul 2026-09-28: same receipt = duplicates'],
  ['migration-20260408-d6927b018c99', '1030', 8111, 'C-10 add retracted: the old books\' 04-08 "Floor mats" 81.22 (migration-20260408-f57255d49994) is the same mats receipt - one purchase'],
  ['receipt-20260328-66b46ec99f5a', '1030', 1081, 'Amazon cancelled order 114-7104560-3108250 before charging - cancellation email 19d3682e497bf1d1: "You have not been charged for this order"'],
  ['receipt-20260504-3c8ec67feca5', '1030', 10824, 'Amazon cancelled order 111-4085470-7753037 before charging - cancellation email 19df3850681d98f2: "You have not been charged for this order"']
];
var MR_FEB_KNOBS = { old: 'receipt-20260203-1f4ab93387c6-f23b', drop: 13635 };
var MR_JUAN_GARCIA = ['migration-20260123-0df1f5099f29', 'migration-20260209-744c051d774c', 'migration-20260220-9cf657f5e831'];
var MR_RELINE = [   // [old txn, from account, to account, bank line or '']
  ['migration-20260114-2c3965cb4dd8', '1040', '1130', ''],
  ['migration-20260819-01bbdf67424d', '1020', '1120', '202608190000000544742783']
];
var MR_TONER = { old: 'migration-20260825-f4f6d4ab6632', from: 11358, to: 11148 };
// the slips: [txn reversed, account, cents, section, what, purpose]
var MR_SLIPS = [
  { date: '2026-03-26', payee: 'The Home Depot', property: '104 Ashburne', doc: 'gm-19d2a51f5dffc8be', slip: 'HD 6505 00017 61956', lines: [
    ['migration-20260219-37bc174b7038', '1040', 3244, 'Lighting & Electrical', 'Stetson flush mount (old books: Closet Light)']] },
  { date: '2026-04-15', payee: 'The Home Depot', property: '104 Ashburne', doc: 'gm-19d9259fe2484c26', slip: 'HD 6505 00018 68488', lines: [
    ['receipt-20260309-16da307e5d40-c1ca', '1030', 690, 'Lighting & Electrical', 'one of the three Carlon box extenders'],
    ['migration-20260410-2227c109c440', '1030', 9953, 'Supplies', 'weed barrier and Goof Off'],
    ['migration-20260405-2cb48a69b3f0', '1040', 1514, 'Paint & Flooring', 'Varathane'],
    ['migration-20260405-cff93458cb5e', '1030', 2810, 'Lighting & Electrical', 'two bulb packs (12.98 each)'],
    ['migration-20260413-85bab1f4423d', '1040', 5121, 'Supplies', 'items from the 04-13 receipt 87435'],
    ['migration-20260413-7cb85fb706d8', '1030', 17205, 'Supplies', 'three GFCI outlets (04-13 receipt 83499)'],
    ['migration-20260219-9a630cb97258', '1040', 2163, 'Lighting & Electrical', 'one BR40 bulb'],
    ['migration-20260410-aa9c2303ff3b', '1030', 785, 'Supplies', '36 in. aluminum angle']] },
  { date: '2026-04-16', payee: 'Lowe\'s', property: '104 Ashburne', doc: 'gm-19d9617b3e88822b', slip: 'Lowe\'s 76671', lines: [
    ['migration-20260313-fdc6da763d61', '1030', 1611, 'Paint & Flooring', 'base moulding (03-13 receipt 93307)'],
    ['migration-20260321-fd67de526b2f', '1030', 1034, 'Master Bath', 'casing (03-21 receipt 89433)'],
    ['migration-20260321-66736242ecf0', '1030', 4313, 'Master Bath', 'stool (03-21 receipt 89433)'],
    ['migration-20260305-31a6e1a9f9f4', '1030', 1080, 'Paint & Flooring', 'moulding (03-05 receipt 73250)'],
    ['migration-20260403-c8260db65638', '1030', 2585, 'Paint & Flooring', 'quarter round (04-03 receipt 70222)'],
    ['migration-20260321-daf4842a9836', '1030', 2270, 'House Hardware', 'Baron bed/bath knob (03-21 receipt 89433)']] },
  { date: '2026-04-16', payee: 'The Home Depot', property: '104 Ashburne', doc: 'gm-19d960d58c421ba0', slip: 'HD 6505 00018 69296', lines: [
    ['migration-20260410-df0d386538f8', '1030', 1512, 'Supplies', 'item from the 04-10 receipt 05669'],
    ['migration-20260415-1c7e6e3046bc', '1030', 4841, 'Lighting & Electrical', 'items from the 04-15 receipt 76585'],
    ['migration-20260413-7cb85fb706d8', '1030', 6456, 'Supplies', 'three of the four rocker switches (04-13 receipt 83499)'],
    ['migration-20260326-46ec015846c0', '1030', 387, 'Lighting & Electrical', 'one 3-gang wall plate (03-26 receipt 62397)'],
    ['migration-20260414-1fe33d5b2e51', '1040', 2771, 'Supplies', 'cove moulding, 20 @ 1.28 (04-14 receipt 88706)']] },
  { date: '2026-05-07', payee: 'The Home Depot', property: '104 Ashburne', doc: 'gm-19e0304909d9e7ca', slip: 'HD 6505 00017 02414', lines: [
    ['migration-20260505-a7f6ae414be8', '1030', 4960, 'Supplies', 'items from the 05-05 receipt 35983'],
    ['migration-20260409-4defd39d44bb', '1030', 5735, 'Lighting & Electrical', 'one GFCI outlet (Paul 2026-10-01: the 04-09 "Outlets & Testet" row is the 04-11 receipt 56583)']] },
  { date: '2026-05-29', payee: 'The Home Depot', property: 'Cost Recapture', doc: 'gm-19e758f6dc2ba281', slip: 'HD 6505 00018 19093', lines: [
    ['migration-20260529-5e5870b64f21', '1030', 756, '1616 Granite', 'black spray paint (1616 Granite is closed - Cost Recapture, D-031)']] },
  { date: '2026-06-30', payee: 'The Home Depot', property: 'Cost Recapture', doc: 'gm-19f18a7ab38c52cf', slip: 'HD 6505 00017 52377', lines: [
    ['manual-20260629-aa6acecb8fa3', '1030', 2054, '1616 Granite', '20x25x1 air filter']] }
];
// the online refunds: one returned item each; the purchase's own receipt is the document (as the 04-16 hinge refund)
var MR_ONLINE_REFUNDS = [
  { date: '2026-04-26', payee: 'Amazon', property: '104 Ashburne', of: 'receipt-20260318-dabc9c1dc327-52e1', account: '1030', cents: 7865, trade: 'Kitchen',
    what: 'second Ravinte 60-pack hinges returned (of the two bought 03-18)', memo: 'Amazon advance refund of 04-26, 78.65, rma DFkdn8Y9RRMA (pvb421 19dcabd0140dd16e); the other 60-pack was refunded 04-16 (manual-20260416-762d31305502)' },
  { date: '2026-04-02', payee: 'AllModern', property: '104 Ashburne', of: 'receipt-20260309-5fafb240c714-587c', account: '1040', cents: 9459, trade: 'Lighting & Electrical',
    what: 'one Schultz teardrop pendant returned (99.00 + 8.17 tax less the 12.58 return fee)', memo: 'AllModern refund of 04-02, 94.59 (paul@ 19d50a61af7ff156, the only AllModern order, 19cd5dae163644e8); the 12.58 fee stays a cost' },
  { date: '2026-04-02', payee: 'Wayfair', property: '104 Ashburne', of: 'receipt-20260316-0f60aecc46e1-5b82', account: '1040', cents: 8050, trade: 'Lighting & Electrical',
    what: 'Areia wall sconce returned, order 4418553297 (85.99 + 7.09 tax less the 12.58 return fee)', memo: 'Wayfair refund of 04-02, 80.50 (paul@ 19d500a6055951d6); the 12.58 fee stays a cost' },
  { date: '2026-08-20', payee: 'Amazon', property: '366 Mesa', of: 'migration-20260811-1e2bbbe99740', account: '1030', cents: 3659, trade: '',
    what: 'Amazon keypad lock returned - the refund went to Paul\'s Amazon balance and paid part of the 08-25 toner', memo: 'Amazon advance refund of 08-20, 36.59 to Paul\'s Amazon balance (pvb421 1a020b5a768ba86c); the lock was paid from Citizens, so Recast owes Paul 36.59 less' },
  { date: '2026-08-20', payee: 'Amazon', property: 'OVERHEAD', of: 'receipt-20260814-72902c6e1581-c964', account: '6510', cents: 3699, trade: '',
    what: 'ForoGore attic vents returned, order 113-4509675-1605010 (the 08-14 charge was the vents, not door locks)', memo: 'Amazon advance refund of 08-20, 36.99 to Paul\'s Amazon balance (pvb421 1a0211e98eb368ca); paid part of the 08-25 toner' }
];
var MR_WAYFAIR_0325 = { gmail: '19d277ab1b334ad1', date: '2026-03-25', total: 32469 };
var MR_TRADE_FIX = { 'Electrical': 'Lighting & Electrical', 'Lighting': 'Lighting & Electrical', 'Electrical & Lighting': 'Lighting & Electrical',
  'Lighting & Fixtures': 'Lighting & Electrical', 'Fixtures': 'Lighting & Electrical', 'Plumbing & Fixtures': 'Small Baths', 'Plumbing': 'Small Baths' };
function fixAshburneBeforeClosing() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var ctx = buildCtx_(ss), J = mrJournal_(ss), out = [], today = mrToday_();
  // every re-post and credit is built (and so checked) before anything is voided
  var reposts = [];
  reposts.push(mrRepost_(J, MR_FEB_KNOBS.old, { memo: 'Lowe\'s order 686896678 without the passage knobs: they are the old books\' 02-04 "Door Knobs" row (migration-20260204-cb7331179346, typed 140.68 for 136.35); the other three lines re-posted (' + MR_FEB_KNOBS.old + ' voided 2026-10-01)',
    edit: function (l) { return l.debit === MR_FEB_KNOBS.drop ? null : l; } }, ctx));
  MR_JUAN_GARCIA.forEach(function (id) {
    reposts.push(mrRepost_(J, id, { memo: String((J.byTxn[id] || [{}])[0].memo || '') + '; moved 1030 -> 1020: Juan Garcia is the painter and floor installer - labor (chart of accounts 1020, audit 46 precedent); ' + id + ' voided 2026-10-01',
      edit: function (l) { if (l.account === '1030') l.account = '1020'; return l; } }, ctx));
  });
  var reline = MR_RELINE.map(function (r) {
    return mrRepost_(J, r[0], { memo: String((J.byTxn[r[0]] || [{}])[0].memo || '') + '; filed on the wrong cost line by the migration - moved ' + r[1] + ' -> ' + r[2] + ' (' + r[0] + ' voided 2026-10-01)',
      edit: function (l) { if (l.account === r[1]) l.account = r[2]; return l; } }, ctx);
  });
  reposts = reposts.concat(reline);
  reposts.push(mrRepost_(J, MR_TONER.old, { memo: 'old books typed 104.92 + 8.25% = 113.58; Amazon\'s invoice says 104.92 + 6.56 tax = 111.48 (73.58 of it paid from the keypad and vents refunds) - corrected on Paul\'s word 2026-10-01 (' + MR_TONER.old + ' voided)',
    edit: function (l) { if (l.debit === MR_TONER.from) l.debit = MR_TONER.to; if (l.credit === MR_TONER.from) l.credit = MR_TONER.to; return l; } }, ctx));
  var credits = MR_ONLINE_REFUNDS.map(function (r) {
    var of = J.byTxn[r.of];
    if (!of) throw new Error(r.of + ' is not on the Journal');
    return mrRefund_({ date: r.date, payee: r.payee, property: r.property, doc_url: String(of[0].doc_url || ''), what: 'REFUND: ' + r.what, prefix: 'REFUND: ',
      memo: r.memo + ' - a return of a recorded item is a negative cost (phase3-spec 3a(2))', lines: [[r.of, r.account, r.cents, r.trade, r.what]] }, ctx);
  });
  var slips = MR_SLIPS.map(function (s) {
    var total = s.lines.reduce(function (t, x) { return t + x[2]; }, 0);
    return mrRefund_({ date: s.date, payee: s.payee, property: s.property, what: 'RETURN: return slip ' + s.slip + ', ' + fromCents(total) + ' back to Paul\'s card 9166', prefix: 'RETURN: ',
      memo: 'Return slip ' + s.slip + ' (' + s.doc + '): these items were on the books and went back to the store - a return of a recorded item is a negative cost (phase3-spec 3a(2)' + (s.property === 'Cost Recapture' ? ', D-031: 1616 Granite is closed' : '') + ')', lines: s.lines }, ctx);
  });
  // the voids
  MR_VOIDS_ASHBURNE.forEach(function (v) { mrVoid_(J, v[0], v[3], today, props, out, { account: v[1], cents: v[2] }); });
  mrVoid_(J, MR_FEB_KNOBS.old, 'the passage knobs are the old books\' 02-04 "Door Knobs" row (migration-20260204-cb7331179346, typed 140.68 for 136.35); the other three lines re-posted', today, props, out);
  MR_JUAN_GARCIA.forEach(function (id) { mrVoid_(J, id, 'Juan Garcia is a contractor - labor, not materials (the store word "floor" matched "Paint & Floor Installation"); re-posted on 1020', today, props, out); });
  MR_RELINE.forEach(function (r) { mrVoid_(J, r[0], 'filed on the wrong cost line by the migration; re-posted on ' + r[2], today, props, out); });
  mrVoid_(J, MR_TONER.old, 'typed 113.58 (8.25% on 104.92); Amazon\'s invoice is 111.48 - re-posted (Paul, 2026-10-01)', today, props, out);
  // each slip's document, filed once (only for a slip not yet posted)
  slips.forEach(function (e, i) {
    if (J.byTxn[e.txn_id]) return;
    var url = mrFile_(mrEnv_(MR_SLIPS[i].doc), ['2026', MR_SLIPS[i].property], null, props);
    if (url) { e.doc_url = url; e.lines.forEach(function (l) { l.doc_url = url; }); } else out.push('slip NOT FILED (no envelope) - posted without its picture  ' + MR_SLIPS[i].doc);
  });
  mrPost_(J, reposts.concat(credits, slips), props, out);
  feedRetieRows_(ss, MR_RELINE[1][0], [reline[1].txn_id], 'HILCO electric for 366 Mesa.');
  // Q7: the Wayfair order of 03-25, from its read
  var w = MR_WAYFAIR_0325, env = mrRead_(w.gmail, out), wayfair = 0;
  if (env) {
    var m = env.model || {}, body = String(env.bodyText || '');
    if (Number(m.receipt_total_cents) !== w.total) out.push('WAYFAIR 03-25 NOT POSTED: the read says ' + fromCents(Number(m.receipt_total_cents) || 0) + ', not 324.69 - tell Claude');
    else if (!/Ashburne/i.test(body)) out.push('WAYFAIR 03-25 NOT POSTED: the order email does not ship to 104 Ashburne - ask Paul (Q7)');
    else {
      var items = [];
      (m.entries || []).forEach(function (en) { (en.items || []).forEach(function (it) { items.push(it); }); });
      var sum = items.reduce(function (t, it) { return t + (Number(it.amount_cents) || 0); }, 0);
      var ok = items.length && sum === w.total && items.every(function (it) { return /^10[34]0$/.test(String(it.account)); });
      items = ok ? items.map(function (it) {
        var t = MR_TRADE_FIX[it.trade] || it.trade;
        return { account: String(it.account), amount_cents: Number(it.amount_cents), description: String(it.description || ''), trade: PT_HEAVY_ORDER.indexOf(t) >= 0 ? t : 'Supplies' };
      }) : [{ account: '1040', amount_cents: w.total, description: 'Wayfair order of 03-25, 299.94 + 24.75 tax (see the order email)', trade: 'Supplies' }];
      var we = buildEntry({ type: 'purchase', date: w.date, payee: 'Wayfair', property: '104 Ashburne', paid_from: 'PAUL', items: items,
        source: 'manual', posted_by: mrUser_(), memo: 'Wayfair order of 03-25 (paul@ ' + w.gmail + '), shipped 03-27, nothing returned - in no book (register 25); ships to 104 Ashburne; Paul 2026-10-01 (Q7): kept for Ashburne' }, ctx);
      if (!J.byTxn[we.txn_id]) we.doc_url = mrFile_(env, ['2026', '104 Ashburne'], null, props);
      wayfair = mrPost_(J, [we], props, out).length ? w.total : 0;
    }
  }
  return mrFinish_(ss, 'fixAshburneBeforeClosing - ' + new Date(), J, [
    ['104 Ashburne, Recast owes Paul', '2030', '104 Ashburne', -148014 + wayfair, -1],
    ['104 Ashburne, materials (1030)', '1030', '104 Ashburne', -2215692],
    ['104 Ashburne, labor (1020)', '1020', '104 Ashburne', 2100000],
    ['104 Ashburne, fixtures (1040)', '1040', '104 Ashburne', -59385 + wayfair],
    ['104 Ashburne, HOA/lawn/pest (1130)', '1130', '104 Ashburne', 27063],
    ['366 Mesa, Recast owes Paul', '2030', '366 Mesa', -3659, -1],
    ['366 Mesa, contractor labor (1020)', '1020', '366 Mesa', -20000],
    ['366 Mesa, utilities (1120)', '1120', '366 Mesa', 20000],
    ['366 Mesa, materials (1030)', '1030', '366 Mesa', -3659],
    ['Cost Recapture, Recast owes Paul', '2030', 'Cost Recapture', -2810, -1],
    ['Cost Recapture, materials (1030)', '1030', 'Cost Recapture', -2810],
    ['Overhead, Recast owes Paul', '2030', 'OVERHEAD', -3909, -1],
    ['Overhead, office supplies (6500)', '6500', 'OVERHEAD', -210],
    ['Overhead, small tools (6510)', '6510', 'OVERHEAD', -3699],
    ['Citizens (1401), all', '1401', null, 0],
    ['Recast owes Paul, all', '2030', null, -158392 + wayfair, -1]
  ], ['104 Ashburne', '366 Mesa', 'Cost Recapture'], out);
}

// ---- 3 ---------------------------------------------------------------------------------------
// 2026-10-01 Paul (final migration register, answers of 10-01) - every old row that opens the wrong receipt or
// none gets its own receipt (registers 2, 3, 4, 5, 7, 10, 12, 14, 29, 36 and the Mission photo O2): 84 rows, plus
// 4 rows whose link pointed at a receipt that does not hold them are cleared. No amount moves. Also Chinos's
// estimate note gets its last sentence corrected (register 5). Before 104 Ashburne closes - its tab freezes.
// [Drive file id, or 'read:<gmail id>' (a look-only read of step 0) or 'env:<docId>' (filed from its envelope), rows]
// STATUS: DONE 2026-10-01 10:45 PDT by Paul: 166 lines linked, 8 cleared, the Chinos note corrected; no money moved.
var MR_RELINKS = [
  ['1ZVDEqXlk7twrRuzyK-JsTl3VhzsqLH7I', ['20260107-d565cdfe6bd3']],
  ['1qrl90s8gwpPdMy3Enq5XWHg5wyQQeJm8', ['20260114-af572d202fb7', '20260114-daaa35949332']],
  ['1G3v-_8yTlBY3ycVhNsHhJBnb067NzwbU', ['20260215-68f8abc52834', '20260215-aec736dc1cf0', '20260215-ef143d005c21']],
  ['1LWOHxyo0yarxeZRyUfHTkNcRJF-6NklW', ['20260216-9d5f6b42fca4']],
  ['1-UQRtyYI37yUJ_uLFNClOekeFA_vwrDf', ['20260305-e164f94a7320', '20260305-1c2bbf86d198']],
  ['1RR1QxC7JmRWQRmwa5SjyYAV5cRtduf-_', ['20260306-0302d2d5ab2e']],
  ['1gZA5gdGfSyjnCAn3lTYWXoJzuRYOiYSk', ['20260311-f923c6ae60da']],
  ['1RMeQFDpls9yzGZPbV5TpHGE7FRbsFkMo', ['20260312-4c0852172086', '20260312-b72aeed986da', '20260312-72ede646ac0b']],
  ['1-edI43EIwShtWAM_tngrOn0saxuC1osZ', ['20260315-3d6e9bd62dfb']],
  ['1ve7ryEJ1deObX96MR3wSBAeUHXcfrBxv', ['20260317-888912138824']],
  ['1QDFRkxKXWyH-FxzG2TLQq4girzPDRtV5', ['20260319-d9c9f081e656', '20260319-30a0d900fb58', '20260319-c97e54d535bc']],
  ['1HM8VakTScJcmLg3JbX6vNGs2Uvnn0vx9', ['20260321-41888591b1cd', '20260321-6d0a51ea5913']],
  ['1AOjWFoz1qVrqQ9gnPGmK3M9P4b72epJ8', ['20260322-f9e8db069ebc', '20260322-ccfd62f7ce9f']],
  ['1SxCJSApwrx9UUj4JfYT2cJh-XYgoSORO', ['20260323-cf412f235460', '20260323-98b4a420079d']],
  ['1qGwMdOP5f2cSs-B-Ew-6u9yLWGNyeXJo', ['20260325-8408c43ef1d4', '20260325-a9db809e9a4c', '20260325-4449f7a4a1d0']],
  ['1f2q_c3kYtJMlfqZ8mUpluTMBxHHn9C-_', ['20260326-e0387851e799', '20260326-46ec015846c0', '20260326-2e83f1e137d5', '20260326-580f09fa6961', '20260326-183eae043d3c']],
  ['1zpsw1UtLt56dMKgx0tBeOEqf_R9zHYQd', ['20260329-713a37584123']],
  ['1mURtDEWrlutJSHNq34Xo4v1EoIwBrwFr', ['20260329-7229fd2594d3', '20260329-ab7e4e6ce188', '20260330-5e96bd244b2d']],
  ['1DQUzfVhHrQ-KzJy5jqxXXLbJpVT687ld', ['20260401-8578b8282382', '20260401-57f84a155c08', '20260401-fdd6c1f40ce5', '20260401-fc74a05936d1', '20260401-ed0f6da98833', '20260401-81c8de733ef8']],
  ['1bv7Pp9Yb2Xc7unJLH327L9MUkbbPuswv', ['20260401-63bb6cb07c95']],
  ['1xCcg9al8SkPPJ4kXbkqYO4jE0314eIRX', ['20260402-13e6254c4aa8']],
  ['1v5kZKkdLcqaj_c_5PqJjBBZluqF0FskG', ['20260403-c8260db65638']],
  ['1Mfu4nYQ-PN91OkAOYTS4i10DoNp8I3Fp', ['20260405-91822b9effc4', '20260405-cff93458cb5e', '20260405-89040657ee3d', '20260405-95105940e5ea', '20260405-ad83542064da']],
  ['1Svs9tT6_SFjEh5BgW8lSLJaY_r-gdUjN', ['20260408-f57255d49994']],
  ['1oVwucDJ4e1Y9iN6uDeSYUKUG_4c3gHI9', ['20260409-f8961bd9ac48']],
  ['1t7itEZhq43AkjmJjP8csWKFd0O7ltlf-', ['20260409-4defd39d44bb']],
  ['1_lKX4wOqfz2MSJYUNf7DL0GaW_tNquYM', ['20260415-6fba4e96bc8b']],
  ['11lbgLiCzUaFjHZXuamxLhPSxe9CfOd7N', ['20260529-21bd2e089304', '20260529-e0ad38cf055e', '20260529-ead749c28d7e', '20260529-2d58e706b646']],
  ['1B1dGPUwTiBzqegKQxibYNT5iewFFY6Bu', ['20260529-71ceff7cc5f0']],
  ['1_XyC063auMBgq1IG86dLsE6grCl0LA27', ['20260530-1b44e4cee4e7', '20260530-92cb6df6bbd2']],
  ['1FrDxhMCwBRn2vPtPbmMhI4x4mDDEjBTs', ['20260531-3ad7e96890c2']],
  ['13lmoKP3M27zitW3HRAHZh0IvgkO9eQ-R', ['20260616-cd6a6c2a103c', '20260616-1ffb41695d25', '20260616-c1fac1e28942']],
  ['1THdunvjQR7KaqWX3CA4tsx_oF9rpw-mA', ['20260616-7dafe308cb96', '20260616-2e32362c4eaf', '20260616-60c90e33ff50']],
  ['1oC4cDReC1J_-74k5e8c9w0IpoETvMdva', ['20260617-4f1944a7ff6e']],
  ['1G8ILVb4CyjrFjMlXcjrFpzGmnX7YeVJe', ['20260626-a3549acac88a', '20260626-636f707d1ced', '20260626-cbdc3ff17397']],
  ['16WAwFSFb-106FQgrWz4qcKhNizEk6X0R', ['20260628-bb8c39c01cca']],
  ['1FGi9_EegpWd4aTwTVME7KCpdXgTVVCT0', ['20260628-66d225a78bfb', '20260628-102085715b3d']],
  ['1guyOxurOSZaVdn8_ISuDX1PZ02Vfx2YD', ['20260630-aff67e07e876']],
  ['1jMf7doY1B7-AZD0zPfSZKVmDWWJfDzwW', ['20260905-33a45c21d743']],
  ['1--2YsBQh7Cw1rRqxyC6JyZ9Wvhrjg810', ['20260210-dbe7157633c4']],                // Chinos: his estimate, not his logo
  ['1gjLDOsVASoSLgMXt7F1h3oSYmjKsl6Mr', ['20260204-cb7331179346']],                // the Lowe's 02-03 order PDF its siblings carry
  ['1_i9kDHypqq4b9ihqfHani5wi8Sxnmr8E', ['20260612-cc39d78d823e']],                // Q18 NO: the 08-07 Sparkling list, Julio's row only
  ['read:19bc4261a95d9c35', ['20260113-bf9539e2a447']],                            // Energy Texas 43.57
  ['read:19e3d490e2623c1c', ['20260604-14ae76431275']],                            // Energy Texas 139.21
  ['env:gm-19f3f6ba1c53dd95', ['manual-20260507-78f444522fa5']]                     // Mission "Premium MLS Showcase" 299.00
];
// rows whose link points at a receipt that does not hold them: PT 2x4's 60.79, Tape Measure 25.96, Drill bits 21.08, Channellock 27.03
var MR_UNLINK = ['migration-20260215-ddbfd9f51edb', 'migration-20260210-1c585429dfc0', 'migration-20260401-5adc9fe512de', 'migration-20260629-66ef2be7fb66'];
var MR_CHINOS = { file: '1--2YsBQh7Cw1rRqxyC6JyZ9Wvhrjg810', old: /It is an estimate, not a receipt:[^\n]*/,
  now: 'It is an estimate, not a receipt. The payment stands on Paul\'s own old-books row (D-027); his personal account is never imported (D-051), so no statement will add to it.' };
/** setDocUrl_ refuses an empty link by design; this clears the link cell of the given entries and nothing else
 *  (the same cells setDocUrl_ writes, under the same lock). Used only for MR_UNLINK. */
function mrClearDocUrl_(ss, ids) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = ss.getSheetByName('Journal'), cols = headerIndex_(sheet), last = sheet.getLastRow(), n = 0, want = {};
    ids.forEach(function (t) { want[t] = true; });
    var col = sheet.getRange(2, cols['txn_id'], last - 1, 1).getValues();
    var urls = sheet.getRange(2, cols['doc_url'], last - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      if (want[String(col[i][0])] && String(urls[i][0])) { sheet.getRange(i + 2, cols['doc_url']).setValue(''); n++; }
    }
    return n;
  } finally { lock.releaseLock(); }
}
function relinkMigrationReceipts() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var J = mrJournal_(ss), out = [], houses = {}, n = 0;
  MR_RELINKS.forEach(function (r) {
    var ids = r[1].map(mrId_).filter(function (t) {
      if (!J.byTxn[t]) { out.push('NOT ON THE BOOKS, skipped  ' + t); return false; }
      if (J.voided[t]) { out.push('voided, skipped  ' + t); return false; }
      return true;
    });
    if (!ids.length) return;
    var url = r[0], house = J.byTxn[ids[0]][0].property;
    if (/^(read|env):/.test(url)) {   // filed once: a row that already has a link is left alone
      if (ids.every(function (t) { return String(J.byTxn[t][0].doc_url || ''); })) { out.push('already linked  ' + ids.join(', ')); return; }
      var env = url.indexOf('read:') === 0 ? mrRead_(url.slice(5), out) : mrEnv_(url.slice(4));
      url = env ? mrFile_(env, ['2026', house], null, props) : '';
      if (!url) { out.push('NOT LINKED (no document yet)  ' + ids.join(', ')); return; }
    } else {
      url = mrDrive_(url);
      if (!mrUrlOk_(url)) { out.push('NOT LINKED - the Drive file is missing or in the trash: ' + url + '  ' + ids.join(', ')); return; }
    }
    var k = setDocUrl_(ids, url, props);
    n += k;
    ids.forEach(function (t) { houses[J.byTxn[t][0].property] = true; });
    out.push('linked ' + k + ' lines  ' + ids.join(', '));
  });
  var cleared = mrClearDocUrl_(ss, MR_UNLINK);
  MR_UNLINK.forEach(function (t) { if (J.byTxn[t]) houses[J.byTxn[t][0].property] = true; });
  out.push('links cleared on ' + cleared + ' lines (' + MR_UNLINK.join(', ') + ')');
  try {
    var f = DriveApp.getFileById(MR_CHINOS.file), text = f.getBlob().getDataAsString();
    if (MR_CHINOS.old.test(text)) { f.setContent(text.replace(MR_CHINOS.old, MR_CHINOS.now)); out.push('Chinos estimate note: last sentence corrected'); }
    else out.push('Chinos estimate note: already corrected');
  } catch (err) { out.push('Chinos estimate note FAILED  ' + String((err && err.message) || err)); }
  out.push(n + ' lines linked in all');
  var held = Object.keys(houses).filter(function (h) { return h && h !== 'OVERHEAD'; });   // a sold house's tab is frozen and left alone
  return mrFinish_(ss, 'relinkMigrationReceipts - ' + new Date(), J, [['Recast owes Paul, all (links move no money)', '2030', null, 0, -1]], held, out);
}

// ---- 4 ---------------------------------------------------------------------------------------
// 2026-10-01 Paul (final migration register, answers of 10-01) - Q6 "yes" (register 2): the 29 old store receipts
// whose left-off items never reached the books go back to his Sheets Inbox, 104 Ashburne first. A re-read only holds (D-048..D-050): each card shows
// what the books already hold; Paul marks every other line Approve / Returned / Dismiss. Run after
// relinkMigrationReceipts (the cards then see the right rows) - the Inbox's own Reprocess route, as 09-28.
// STATUS: DONE 2026-10-01 10:48 PDT by Paul: all 29 sent for re-reading; Paul decides the cards.
var MR_STORE_RECEIPTS = [
  // 104 Ashburne (19)
  'gm-19b9ef373c8332d3', 'gm-19bcc629a4d83e4e', 'gm-19c484998d6bf67a', 'gm-19c5d297b5829e55', 'gm-19cc387a05beb25b',
  'gm-19ccf1f38113d4f9', 'gm-19cd60fc58534aca', 'gm-19cd8db842855d26', 'gm-19cf2444d6efb00f', 'gm-19d01359eb674ac2',
  'gm-19d11a93764263f8', 'gm-19d2647307183ef9', 'gm-19d2556d29835a4b', 'gm-19d2a6dc500a3a1c', 'gm-19d3a708f16b12eb',
  'gm-19d4918fa3edc702', 'gm-19ed8190a6945042', 'gm-19edc17308bcd897', 'gm-19f18b33a88ea898',
  // 136 Bowling Green (4)
  'gm-19f0e855936a44de', 'gm-19f0fbce663c9387', 'gm-19f0e8b993f57cd0', 'gm-19fd34b701a40539',
  // overhead (4), 1616 Granite (1, Cost Recapture), 280 Sparkling (1, really an overhead PVC cutter)
  'gm-19ed8195997d06ad', 'gm-19f386e1e70d7f5a', 'gm-19bc4186ab17e432', 'gm-19eea46b8e933be6',
  'gm-19e8f7927b019869', 'gm-19f13a69198b2b6c'
];
function reprocessStoreReceipts() {
  var by = mrUser_(), out = [];
  MR_STORE_RECEIPTS.forEach(function (docId) {
    try { siteFetchJson_('/api/inbox', 'post', { action: 'reprocess', docId: docId, by: by }); out.push('re-reading  ' + docId); }
    catch (err) { out.push('FAILED  ' + docId + '  ' + ((err && err.code) || '') + ' ' + String((err && err.message) || err)); }
    Utilities.sleep(2000);   // ponytail: a gentle burst - the reads themselves run in the background on the site
  });
  out.unshift('reprocessStoreReceipts - ' + new Date() + ' - ' + MR_STORE_RECEIPTS.length + ' receipts; the cards appear in the Inbox over the next few minutes');
  console.log(out.join('\n'));
  return out;
}

// ---- 5 ---------------------------------------------------------------------------------------
// 2026-10-01 Paul (final migration register, answers of 10-01) - everything with no deadline:
//   voids: 12 the 09-22 sawhorse replay 59.52; 29 the overhead copies of the Lowe's 05-30 Granite sprinkler parts
//          10.53; 15 three software forwards typed twice (33.82) + the 23.83 the D-064 move took twice (1520 -> 6400);
//          42 four Uber rides booked before and after the tip (301.57);
//   void + re-post: 41 the speeding ticket marked not deductible (void dated 05-08); Q10 the roto hammer at 105.81;
//          1 Cotality's 06-30 line becomes the February bill's payment on 6300, dated COTALITY_FEB_PAID;
//          35 the 09-01 water "card fee" 40.00 relabelled as water (its bank line re-tied);
//   new: Q12 Cotality June 200.00 (Paul paid, his word); 35 the July Sparkling water 187.50 back off what Recast owes
//          Paul (Cost Recapture); 38 the 203.00 American upgrade credit; Q19 the 06-14 ticket 476.40 refunded;
//          24 Acuity 69.00; 40 Twilio 10.25, county records 2.30, Airtable April; late finding: Anthropic 20.00 (06-26)
//          and 10.27 (08-01);
//   links: 1 the 06-18 CoreLogic line to its Stripe receipt; 20 the June Claude Max lines to June's receipt;
//          18 the 1616 Granite closing statement on its 10 sale entries (sellUpdate);
//   Drive: 13 (Q20) the STAGING folder renamed "Old books receipts (migrated 2026-09-21) - do not delete" and moved
//          inside "Recast Books" (file ids, and so every link, unchanged).
// Documents that are paul@ emails come from the look-only reads of step 0; one not read yet is skipped and named.
// STATUS: NOT YET RUN
var COTALITY_FEB_PAID = '2026-05-11';   // Claude sets this from the 05-12 statement's read (dry-gm-19e1cc39cf4e2255) before the Run; never 05-12
var MR_VOIDS_REST = [
  ['receipt-20260216-bbf30d98c8da-5e0f', '6510', 5952, 'duplicate - the sawhorse on Home Depot receipt 6505 00053 48149 is already in the old books as migration-20260216-678771dda3c4 "Saw Horses" 59.51 (tax rounding); the rest of this receipt was voided 09-23 as void-receipt-20260216-526b7608d4b2-c670'],
  ['migration-20260530-b6b2af9944c6', '6500', 92, 'duplicate of 1616 Granite RECONCILED row 23 (migration-20260530-1b44e4cee4e7), same Lowe\'s receipt gm-19e79a903622d62d'],
  ['migration-20260530-1531c27e5719', '6500', 961, 'duplicate of 1616 Granite RECONCILED row 24 (migration-20260530-92cb6df6bbd2), same Lowe\'s receipt gm-19e79a903622d62d'],
  ['migration-20260806-2a85a9deb146', '6400', 999, 'in the books twice - Paul\'s forward of PDF.co receipt #2593-8928; the vendor\'s own email is the kept row (migration-20260806-99b8b09ceba5)'],
  ['migration-20260822-0269ee138b3a', '1520', 1357, 'in the books twice - Paul\'s forward of Anthropic receipt #2540-4444-8353; the vendor\'s own email is the kept row (migration-20260822-564787358eda)'],
  ['migration-20260822-f47d633f496d', '1520', 1026, 'in the books twice - Paul\'s forward of Anthropic receipt #2592-0542-6839; the vendor\'s own email is the kept row (migration-20260822-016b0c8717ce)'],
  ['migration-20260526-386709dda174', '6700', 4498, 'superseded by gm-19e63f46ec94b47a: the receipt before the tip; the ride is migration-20260525-9857ec48d1bb (54.98 with the tip) - D-058, Paul 09-28 same receipt = duplicates'],
  ['migration-20260526-9e7747ae3e74', '6700', 8399, 'superseded by gm-19e65c38cfb62bff: a charge summary before the tip ("not a payment receipt"); the ride is migration-20260526-ccd7bd7531fb (100.79) - D-058'],
  ['migration-20260704-85b5af0c1d32', '6700', 9835, 'superseded by gm-19f32a4a9ea6a310: the receipt before the tip; the ride is migration-20260704-e2b3462d5255 (118.02 with the tip) - D-058'],
  ['migration-20260705-8232347a4735', '6700', 7425, 'superseded by gm-19f33c1870883145: a charge summary before the tip ("not a payment receipt"); the ride is migration-20260705-2a199b26e2d0 (89.10) - D-058']
];
var MR_TICKET = 'migration-20260508-5890ee7cb60e';
var MR_ROTO = 'migration-20260216-4af9f8e28f91';
var MR_COTALITY = { feb: 'migration-20260630-8944923e4a0f', june18: 'migration-20260618-e28394ab0348', juneBill: '1nwxU7TA-Qsj0iY3quDlknFNhpl1ZItlw',
  letter: '1eV3Y_zCcp372JH7mB6fMP1nGYoDfZXRD', stripe: '19edca711a732d84', statement: '19e1cc39cf4e2255' };
var MR_WATER_40 = { old: 'migration-20260901-3ea66ac80e09', feed: '202609010000000547047666' };
var MR_ANTHROPIC_JUNE = { gmail: '19ec2402c3c0945b', rows: ['migration-20260613-205db3299d3b', 'migration-20260613-20fa226e3ac0'], july: '1UO8uf8sX6oPwPzKEIvGpxw5SRY4rEvD7' };
// email-only costs never booked: [gmail id, date, payee, account, cents (0 = take the read's), description, memo]
var MR_EMAIL_COSTS = [
  ['19eaeb28bffd4eb2', '2026-06-09', 'Squarespace (Acuity Scheduling)', '6400', 6900, 'Acuity Scheduling, one month (Jun 9 - Jul 9, 2026), cancelled Jun 10, ran to term', 'not in the old books; paul@ mail only (register 24)'],
  ['19e9eb525576d0f9', '2026-06-06', 'Twilio', '6400', 1025, 'Twilio account auto-recharge (balance top-up to $20.00)', 'not in the old books; paul@ mail only (register 40)'],
  ['19d5fc9cd76b5b0b', '2026-04-05', 'Local Government Solutions (Online Record Search)', '6300', 230, 'Ellis County online record search (Certified Payments receipt, 04-05)', 'not in the old books; a separate payment from 05-04 (register 40)'],
  ['19dd62aab51688da', '2026-04-28', 'Airtable', '6400', 0, 'Airtable Team plan, first month (Apr 28 - May 28, 2026) - the Recast Properties workspace', 'not in the old books; May-July are (register 40)'],
  ['19f0445e1b3b78ae', '2026-06-26', 'Anthropic, PBC', '6400', 2000, 'Claude API credits (Anthropic API), receipt #2736-1854-1889, invoice A90U2FHF-0001', 'in no book; the API account\'s first bill - not the 06-03 Claude Pro bill (D-064: credits are a software cost when bought)'],
  ['19fbdff0b4d955c3', '2026-08-01', 'Anthropic, PBC', '6400', 1027, 'Auto-recharge credits (Anthropic API), receipt #2721-0230-2904, invoice A90U2FHF-0003 (8:43 AM)', 'NOT a duplicate: a different receipt from #2246-0080-6200 (11:26 AM, migration-20260801-950ed4d951fd); dismissed by amount on 09-17 by mistake (D-064)']
];
var MR_AA = { credit: '19e8e8bac46f3744', refund: '19edb64cd9341671', refundCents: 47640 };
var MR_STAGING = { folder: '1jNk7O9ozdjd8YT-4y4N7YfC_WLwJVbkm', name: 'Old books receipts (migrated 2026-09-21) - do not delete' };
var MR_GRANITE_CLOSING = '10Iz6FAyc4OMKF0vuK_yjnKnfrU8zwEmP';
function fixOverheadAndTheRest() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var ctx = buildCtx_(ss), J = mrJournal_(ss), out = [], today = mrToday_(), posts = [], fileFor = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(COTALITY_FEB_PAID) || COTALITY_FEB_PAID === '2026-05-12') throw new Error('COTALITY_FEB_PAID must be a date and never 2026-05-12');
  // the re-posts, built (and so checked) before anything is voided
  var ticket = mrRepost_(J, MR_TICKET, { memo: 'old books: 104 Ashburne / Gas/Truck/Trailer row 44; MOVED_TO_OVERHEAD:104 Ashburne; traffic fine 270.00 + fees 10.95 - a government fine is not deductible (IRC 162(f)); envelope gm-19e091cb11fddeec (' + MR_TICKET + ' voided, tax label only)',
    edit: function (l) { if (l.account === '6600') l.tax_treatment = 'Non-deductible'; return l; } }, ctx);
  var roto = mrRepost_(J, MR_ROTO, { doc_url: mrDrive_('14z9vZmtqHAK1N0leTQA0I8gIIKgT9g-5'),
    memo: 'old books: RECAST BIZ / Tools, typed at the 114.99 shelf price; the receipt shows 17.25 off, so 105.81 paid - corrected on Paul\'s word 2026-10-01 (' + MR_ROTO + ' voided)',
    edit: function (l) {
      if (l.debit) l.debit = 10581; else l.credit = 10581;
      l.description = 'Roto Hammer Drill - Bauer D-handle SDS-Plus rotary hammer SKU 58214, $114.99 less $17.25 discount, with tax';
      return l;
    } }, ctx);
  var cotFeb = mrRepost_(J, MR_COTALITY.feb, { date: COTALITY_FEB_PAID, doc_url: mrDrive_(MR_COTALITY.letter),
    memo: 'no receipt; Cotality\'s letters of 05-12, 06-07 and 08-10 each show it paid (register 1; ' + MR_COTALITY.feb + ' voided)',
    edit: function (l) {
      if (l.account === '6400') l.account = '6300';
      l.payee = 'CoreLogic Inc';
      l.description = 'Payment of the February bill #30843590 (no receipt email; Cotality\'s past-due letters show it paid)';
      return l;
    } }, ctx);
  var water40 = mrRepost_(J, MR_WATER_40.old, { memo: 'old books: Cost Recapture row 6 "Card Service Fee" 40.00 - it was water: the card fee is the separate 47.26 of 09-02 (3.95% of 1,196.40) (register 35; ' + MR_WATER_40.old + ' voided, label only)',
    edit: function (l) { l.description = 'Water - rest of the 09-01 city payment of 1,196.40 (the card fee is the separate 47.26 of 09-02)'; return l; } }, ctx);
  posts.push(ticket, roto, cotFeb, water40);
  // new entries whose document is already in Drive
  var api = 'Claude API credits - the 08-22 top-ups counted twice (the D-064 move manual-20260831-ec597918fefa took 322.67; true 298.84)';
  posts.push(buildEntry({ type: 'journal', date: MR_DAY, source: 'manual', posted_by: mrUser_(),
    memo: 'D-064 took 322.67 off 1520 for August; 23.83 of it was the two 08-22 Anthropic top-ups typed twice (voided today) - the true August is 298.84 (register 15)', lines: [
      { account: '1520', debit: 2383, credit: 0, property: 'OVERHEAD', payee: 'Anthropic', description: api },
      { account: '6400', debit: 0, credit: 2383, property: 'OVERHEAD', payee: 'Anthropic', description: api }] }, ctx));
  posts.push(buildEntry({ type: 'expense', date: '2026-08-10', payee: 'CoreLogic Inc', account: '6300', property: 'OVERHEAD', paid_from: 'PAUL', amount_cents: 20000,
    description: 'June bill #30883298 - paid by Paul through Cotality\'s pay link around Aug 10, no receipt email', doc_url: mrDrive_(MR_COTALITY.juneBill), source: 'manual', posted_by: mrUser_(),
    memo: 'Paul 2026-10-01 (Q12): paid - posted on his word; Cotality\'s 08-10 letter asked for June\'s 200 and Sep 15 paid only July and August (register 1)' }, ctx));
  posts.push(mrRefund_({ date: MR_DAY, payee: 'Waxahachie Water', property: 'Cost Recapture', doc_url: 'https://drive.google.com/file/d/1eSRLRX3f8YZh9_gfQcjB_LhYJ8DsUMDh/view',
    what: 'Correction: the 07-31 water bill $187.50 (acct 1-022-11500-002) was not paid by Paul - the city\'s final bill of 08-14 carried it unpaid and Citizens paid it on 09-01 inside the $612.91', prefix: '',
    memo: 'CORRECTION_TO_A_CLOSED_PROPERTY: Paul was paid it back at the 280 Sparkling sale (migration-20260805-871f2e28618d); the frozen tab stays as it is (D-031, D-043; register 35)',
    lines: [['migration-20260805-871f2e28618d', '1120', 18750, '280 Sparkling', 'Correction: the 07-31 water bill $187.50 was paid by Citizens on 09-01, not by Paul']] }, ctx));
  // American Airlines: the upgrade's Trip Credit (register 38) and, on Paul's answer (Q19), the 06-14 ticket
  var aaCredit = 0, aaRefund = 0, aa = mrRead_(MR_AA.credit, out);
  if (aa) {
    var ce = mrRefund_({ date: '2026-06-03', payee: 'American Airlines', property: 'OVERHEAD', prefix: 'REFUND: ',
      what: 'REFUND: the 203.00 Instant Upgrade of trip YVJBCJ, cancelled by American on 06-02 - given back as Trip Credit 0014498690523',
      memo: 'American\'s Trip Credit of 06-03 "for the cost of your upgrade" (paul@ 19e8e8bac46f3744); the credit then paid 203.00 of CVMBBG, which is booked at its full 476.40 (register 38)',
      lines: [['migration-20260602-e62f263c8681', '6700', 20300, '', 'Instant Upgrade LAX-PDX, conf YVJBCJ, not flown - American gave it back', 'Refund of an unflown business trip upgrade (PDX-DFW travel)']] }, ctx);
    posts.push(ce); fileFor[ce.txn_id] = [aa, null]; aaCredit = 20300;
  }
  var rf = mrRead_(MR_AA.refund, out);
  if (rf) {
    var rc = Number((rf.model || {}).receipt_total_cents) || 0;
    if (rc && rc !== MR_AA.refundCents) out.push('AA 06-14 REFUND NOT POSTED: the refund email\'s read says ' + fromCents(rc) + ' - Paul\'s answer was "else the whole ticket 476.40"; tell Claude');
    else {
      var re = mrRefund_({ date: '2026-06-18', payee: 'American Airlines', property: 'OVERHEAD', prefix: 'REFUND: ',
        what: 'REFUND: AA 982 PDX-DFW of Jun 14 (conf CVMBBG) not flown - the whole ticket came back',
        memo: 'American\'s "Your refund is complete" of 06-18 (paul@ 19edb64cd9341671) shows no amount; Paul 2026-10-01 (Q19): the whole 476.40 came back (to his card or as American credit - his money either way) (register 38)',
        lines: [['migration-20260611-615fc76343cd', '6700', MR_AA.refundCents, '', 'Airfare PDX-DFW, AA 982, Jun 14 (conf CVMBBG), not flown - refunded', 'Refund of an unflown PDX-DFW business trip']] }, ctx);
      posts.push(re); fileFor[re.txn_id] = [rf, null]; aaRefund = MR_AA.refundCents;
    }
  }
  // the email-only costs never booked (registers 24, 40, the late Anthropic finding)
  var emailBy = { '6300': 0, '6400': 0 };
  MR_EMAIL_COSTS.forEach(function (x) {
    var env = mrRead_(x[0], out);
    if (!env) return;
    var readCents = Number((env.model || {}).receipt_total_cents) || 0, cents = x[4] || readCents;
    if (!cents) { out.push('NOT POSTED - the read shows no amount: ' + x[2] + ' ' + x[1] + ' (tell Claude)'); return; }
    if (x[4] && readCents && readCents !== x[4]) { out.push('NOT POSTED - the read says ' + fromCents(readCents) + ', the plan ' + fromCents(x[4]) + ': ' + x[2] + ' ' + x[1]); return; }
    var e = buildEntry({ type: 'expense', date: x[1], payee: x[2], account: x[3], property: 'OVERHEAD', paid_from: 'PAUL', amount_cents: cents,
      description: x[5], source: 'manual', posted_by: mrUser_(), memo: x[6] + '; paid by Paul (before Recast had a bank account, D-026.2)' }, ctx);
    posts.push(e); fileFor[e.txn_id] = [env, /^Receipt-/i]; emailBy[x[3]] += cents;
  });
  // the voids
  MR_VOIDS_REST.forEach(function (v) { mrVoid_(J, v[0], v[3], today, props, out, { account: v[1], cents: v[2] }); });
  mrVoid_(J, MR_TICKET, 'tax label only: a traffic fine is not deductible (IRC 162(f)); re-posted unchanged otherwise', '2026-05-08', props, out, { account: '6600', cents: 28095 });
  mrVoid_(J, MR_ROTO, 'typed at the 114.99 shelf price; the receipt shows 17.25 off - re-posted at 105.81 (Paul, 2026-10-01)', today, props, out, { account: '6510', cents: 12448 });
  mrVoid_(J, MR_COTALITY.feb, 'this 200 is the February bill\'s payment (no receipt), on 6300 data and research - re-posted (register 1)', today, props, out, { account: '6400', cents: 20000 });
  mrVoid_(J, MR_WATER_40.old, 'not a card fee: the rest of the 09-01 city water payment - re-posted with that label (register 35)', today, props, out, { account: '1120', cents: 4000 });
  // documents, filed once (only for an entry not yet posted), then the posts
  posts.forEach(function (e) {
    var f = fileFor[e.txn_id];
    if (!f || J.byTxn[e.txn_id]) return;
    var url = mrFile_(f[0], ['2026', 'OVERHEAD'], f[1], props);
    e.doc_url = url; e.lines.forEach(function (l) { l.doc_url = url; });
  });
  mrPost_(J, posts, props, out);
  feedRetieRows_(ss, MR_WATER_40.old, [water40.txn_id], 'City of Waxahachie water - Brushwood plus the old Sparkling and Granite bills and 40.00 more water.');
  // links: CoreLogic 06-18 to its own Stripe receipt; June's Claude Max receipt in place of July's
  var j18 = J.byTxn[MR_COTALITY.june18];
  if (j18 && String(j18[0].doc_url || '').indexOf(MR_COTALITY.juneBill) >= 0) {
    var st = mrRead_(MR_COTALITY.stripe, out), u18 = st ? mrFile_(st, ['2026', 'OVERHEAD'], null, props) : '';
    if (u18) out.push('linked ' + setDocUrl_([MR_COTALITY.june18], u18, props) + ' lines  ' + MR_COTALITY.june18 + ' (CoreLogic Stripe receipt #1404-5515)');
  } else out.push('CoreLogic 06-18 already relinked');
  var aj = J.byTxn[MR_ANTHROPIC_JUNE.rows[0]];
  if (aj && String(aj[0].doc_url || '').indexOf(MR_ANTHROPIC_JUNE.july) >= 0) {
    var am = mrRead_(MR_ANTHROPIC_JUNE.gmail, out), uj = am ? mrFile_(am, ['2026', 'OVERHEAD'], /^Receipt-/i, props) : '';
    if (uj) out.push('linked ' + setDocUrl_(MR_ANTHROPIC_JUNE.rows, uj, props) + ' lines  ' + MR_ANTHROPIC_JUNE.rows.join(', ') + ' (June\'s receipt #2237-3434-8635)');
  } else out.push('Claude Max June already relinked');
  // the other two American emails (Q19 covers only the 06-14 ticket): what their reads say, for Claude
  ['19e8b84c873fa38b', '19ec6cb26d867e91'].forEach(function (g) {
    var x = mrEnv_('dry-gm-' + g), xm = (x && x.model) || {};
    out.push('American read ' + g + ': ' + (x ? fromCents(Number(xm.receipt_total_cents) || 0) + ' - ' + String(xm.why || '').slice(0, 200) : 'not read yet'));
  });
  // the Cotality statement's read, for the record (the February payment's date)
  var cs = mrEnv_('dry-gm-' + MR_COTALITY.statement);
  out.push('Cotality 05-12 statement read: ' + (cs && cs.model ? String(cs.model.why || '').slice(0, 300) : 'not read yet') + '  (COTALITY_FEB_PAID = ' + COTALITY_FEB_PAID + ')');
  // 1616 Granite's closing statement on its sale entries (register 18)
  var gs = J.all.filter(function (l) { return l.property === '1616 Granite' && l.source === 'sale'; });
  if (gs.length && gs.every(function (l) { return String(l.doc_url || '').indexOf(MR_GRANITE_CLOSING) >= 0; })) out.push('Granite closing statement already linked');
  else out.push('Granite closing statement: ' + JSON.stringify(sellUpdate({ property: '1616 Granite', doc_url: 'https://drive.google.com/file/d/' + MR_GRANITE_CLOSING + '/view' })));
  // the retired STAGING Drive folder (Q20): renamed, then moved whole inside "Recast Books" (file ids unchanged)
  try {
    var fo = DriveApp.getFolderById(MR_STAGING.folder), root = getOrCreateDocsRootFolder_(props), parents = fo.getParents();
    if (fo.getName() !== MR_STAGING.name) fo.setName(MR_STAGING.name);
    if (!parents.hasNext() || parents.next().getId() !== root.getId()) fo.moveTo(root);
    out.push('STAGING folder: "' + fo.getName() + '", inside "' + root.getName() + '"');
  } catch (err) { out.push('STAGING folder FAILED  ' + String((err && err.message) || err)); }
  var owed = -5952 - 1053 - 3382 - 30157 - 1867 + 20000 - aaCredit - aaRefund + emailBy['6300'] + emailBy['6400'];
  return mrFinish_(ss, 'fixOverheadAndTheRest - ' + new Date(), J, [
    ['Overhead, Recast owes Paul', '2030', 'OVERHEAD', owed, -1],
    ['Overhead, software (6400)', '6400', 'OVERHEAD', -999 - 2383 - 20000 + emailBy['6400']],
    ['Overhead, data and research (6300)', '6300', 'OVERHEAD', 20000 + 20000 + emailBy['6300']],
    ['Overhead, small tools (6510)', '6510', 'OVERHEAD', -5952 - 1867],
    ['Overhead, office supplies (6500)', '6500', 'OVERHEAD', -1053],
    ['Overhead, travel (6700)', '6700', 'OVERHEAD', -30157 - aaCredit - aaRefund],
    ['Overhead, vehicle (6600)', '6600', 'OVERHEAD', 0],
    ['Prepaid API credits (1520), all', '1520', null, 0],
    ['Cost Recapture, Recast owes Paul', '2030', 'Cost Recapture', -18750, -1],
    ['Cost Recapture, utilities (1120)', '1120', 'Cost Recapture', -18750],
    ['Citizens (1401), all', '1401', null, 0],
    ['Recast owes Paul, all', '2030', null, owed - 18750, -1]
  ], ['Cost Recapture'], out);
}

// ---- 6 ---------------------------------------------------------------------------------------
// 2026-10-01 Paul (final migration register, answers of 10-01) - Q5 "read the photos" (register 21): after the
// look-only reads of step 0, each phone picture
// that is the receipt of a row already in the books is linked to it (no money moves), and every read is listed for
// Claude, who sorts the rest - house photos set aside, anything new goes to Paul as one short list. (The two
// 413 Green Acres pictures come as Inbox cards through Paul's pvb421 forward, not here.)
// STATUS: NOT YET RUN
// [gmail id, [[row, cents], ...]] - a picture is linked only when its read's total is the rows' sum (within 2 cents)
var MR_PHOTO_LINKS = [
  ['19ef04247581e8fd', [['migration-20260622-b654bc0e353f', 5470]]],
  ['19efa25271396978', [['migration-20260624-7642dc3cab5e', 4545]], [['migration-20260624-220b6b8cffac', 673]]],
  ['19efab5b40d7e709', [['migration-20260624-7642dc3cab5e', 4545]], [['migration-20260624-220b6b8cffac', 673]]],
  ['19eff4ea68385f8b', [['migration-20260625-c86fe937bcd3', 247], ['migration-20260625-6e026d355b24', 247], ['migration-20260625-1970fe4c9ed8', 751]]],
  ['19f057e3fbdf52b2', [['migration-20260626-55feed84fc83', 6940]]],
  ['19fc944f7cfccdbb', [['migration-20260803-8e490acaeacd', 10715]]],
  ['19f13a9a7b8c4af9', [['migration-20260629-66ef2be7fb66', 2703]]]
];
function linkPhonePhotos() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var J = mrJournal_(ss), out = [], houses = {};
  MR_PHOTO_LINKS.forEach(function (p) {
    var env = mrRead_(p[0], out);
    if (!env) return;
    var got = Number((env.model || {}).receipt_total_cents) || 0;
    var rows = p.slice(1).filter(function (opt) {
      return Math.abs(opt.reduce(function (t, r) { return t + r[1]; }, 0) - got) <= 2;
    })[0];
    if (!rows) { out.push('NOT LINKED - the picture reads ' + fromCents(got) + ', none of its rows  ' + p[0]); return; }
    var ids = rows.map(function (r) { return r[0]; }).filter(function (t) { return J.byTxn[t] && !J.voided[t]; });
    if (!ids.length) return;
    if (ids.every(function (t) { return String(J.byTxn[t][0].doc_url || '') && String(J.byTxn[t][0].doc_url).indexOf('1FGi9_EegpWd4aTwTVME7KCpdXgTVVCT0') < 0; })) { out.push('already linked  ' + ids.join(', ')); return; }
    var house = J.byTxn[ids[0]][0].property;
    var url = mrFile_(env, ['2026', house], null, props);
    if (url) { out.push('linked ' + setDocUrl_(ids, url, props) + ' lines  ' + ids.join(', ') + '  <- ' + p[0]); houses[house] = true; }
  });
  // every read of step 0, one line each, for Claude
  var spec = DriveApp.getFilesByName('books-replay-paul.json');
  var list = spec.hasNext() ? (JSON.parse(spec.next().getBlob().getDataAsString()).ids || []) : [];
  out.push('', 'THE READS (paste to Claude):');
  list.forEach(function (it) {
    var env = mrEnv_('dry-gm-' + it.id), m = (env && env.model) || {};
    if (!env) { out.push(it.id + '  not read'); return; }
    var first = ((m.entries || [])[0] || {}), item = ((first.items || [])[0] || {});
    out.push([it.id, env.status, m.document_type || '', m.vendor || '', m.date || '', fromCents(Number(m.receipt_total_cents) || 0),
      m.paid_from || '', first.property || '', String(item.description || '').slice(0, 60), (env.result || {}).doc_url || ''].join(' | '));
  });
  var held = Object.keys(houses).filter(function (h) { return h && h !== 'OVERHEAD'; });
  return mrFinish_(ss, 'linkPhonePhotos - ' + new Date(), J, [['Recast owes Paul, all (links move no money)', '2030', null, 0, -1]], held, out);
}

// 2026-10-01 Paul (final migration register, answers of 10-01) - voids the three 104 Ashburne doubles the last
// item-by-item pass found (register, "THE THREE LAST CHECKS" (c), each checked by a skeptic): Home Depot 04-16
// 51.38, the Sunstate scissor lift 904.18 (its bill and its payment both on the books), the Atmos March gas 141.59
// (alone and again inside the May 197.00). Paul's 09-28 rule - the same item counted twice comes out - and his
// "yes to everything" of 10-01. The copy kept is the whole receipt or payment (Paul's 09-28 "same receipt =
// duplicates"): the Home Depot receipt 88.83, the Sunstate card payment 922.26, the Atmos payment 197.00. Each void
// is dated the run day (the 09-28..30 voids' pattern); nothing is posted. All three were paid by Paul, so
// Ashburne's costs and what Recast owes Paul each drop by 1,097.15. Ashburne is held (not closed in the books), so
// the voids go on the house itself - the function stops if it has been closed. A bank line tied to a double goes
// back to unmatched (the copy kept is another amount). Safe to run twice: a double already out is skipped.
// STATUS: DONE 2026-10-01 10:40 PDT by Paul: three voided (51.38, 904.18, 141.59), read back.
var ASHBURNE_LATE_DOUBLES = [
  { out: 'migration-20260415-6fba4e96bc8b', cents: 5138, keep: ['receipt-20260416-94803fc0a520-8cd4', 'receipt-20260416-d23e7cd176ca-e747'], keepCents: 8883,
    what: 'Home Depot 04-16, 51.38',
    why: 'in the books twice - Home Depot receipt 6505 00054 77666 of 04-16 (gm-19d960cfeccab6cd) is 88.83 = 37.45 store credit + 51.38 on Paul\'s card 9166, and is already in whole as receipt-20260416-94803fc0a520-8cd4 (82.36) + receipt-20260416-d23e7cd176ca-e747 (6.47 caulk gun); this old "Misc Supplies" 51.38 (Supplies row 106, no receipt) is its card part again (Paul 09-28: same receipt = duplicates; final register 2026-10-01)' },
  { out: 'migration-20260505-a68070d6a2b5', cents: 90418, keep: ['migration-20260421-7241dc8add8a'], keepCents: 92226,
    what: 'Sunstate lift, 904.18',
    why: 'in the books twice - Sunstate invoice 14354633-001 of 05-05 (gm-19f0781872fdb552, 904.18, the one 32 ft lift, 5/4 at 104 Ashburne) was paid 05-18 on VISA 5839 (Billtrust conf 356300979, gm-19e3b8a5fee70d22): 904.18 + 18.08 card fee = 922.26, already in as migration-20260421-7241dc8add8a, kept as what left the card; no second rental in the mail (final register 2026-10-01)' },
  { out: 'migration-20260327-26a317dd4b9c', cents: 14159, keep: ['migration-20260508-c8c15142023e'], keepCents: 19700,
    what: 'Atmos March gas, 141.59',
    why: 'in the books twice - the Atmos March bill 141.59 (gm-19ce9537b630b426, account 3076066788) was never paid alone: the 04-14 bill carries it past due (197.00 = 141.59 + 55.41) and the 05-08 payment of 197.00 (gm-19e09b39421dc9af, conf 200609622064) paid both, already in as migration-20260508-c8c15142023e (final register 2026-10-01)' }
];
function voidAshburneLateDoubles() {
  var HOUSE = '104 Ashburne';
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  if (String(propertyRow_(ss, HOUSE).status || '').toLowerCase() === 'sold') {
    throw new Error(HOUSE + ' is closed in the books, so its tab is frozen (D-043) and these belong on Cost Recapture now - nothing done, ask Claude');
  }
  var user = Session.getActiveUser().getEmail() || 'editor';
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  // A void mirrors its original, so plain sums over every line are the live balances.
  var read = function () {
    var lines = journalLines_(ss), voided = {}, by = {}, owed = 0, owedAll = 0;
    lines.forEach(function (l) {
      if (l.void_of) voided[l.void_of] = true;
      if (l.source !== 'void') (by[l.txn_id] = by[l.txn_id] || []).push(l);
      if (l.account === '2030') { owedAll += l.credit - l.debit; if (l.property === HOUSE) owed += l.credit - l.debit; }
    });
    return { voided: voided, by: by, cost: propertyJobCost(lines, HOUSE).total_cost, owed: owed, owedAll: owedAll };
  };
  var sum = function (ls, f) { return ls.reduce(function (s, l) { return s + f(l); }, 0); };
  var debits = function (l) { return l.debit; };
  var before = read(), out = [], expCost = 0, expOwed = 0, done = 0;
  ASHBURNE_LATE_DOUBLES.forEach(function (d) {
    if (before.voided[d.out]) { out.push('already out  ' + d.what + '  (' + d.out + ') - skipped'); return; }
    var ls = before.by[d.out] || [];
    var keep = [].concat.apply([], d.keep.map(function (k) { return before.voided[k] ? [] : (before.by[k] || []); }));
    var problem = !ls.length ? 'not on the Journal'
      : sum(ls, debits) !== d.cents ? 'it is ' + fromCents(sum(ls, debits)) + ', expected ' + fromCents(d.cents)
      : ls.some(function (l) { return l.property !== HOUSE; }) ? 'not all on ' + HOUSE
      : d.keep.some(function (k) { return before.voided[k] || !before.by[k]; }) ? 'the copy kept is not on the books (' + d.keep.join(', ') + ')'
      : sum(keep, debits) !== d.keepCents ? 'the copy kept is ' + fromCents(sum(keep, debits)) + ', expected ' + fromCents(d.keepCents) : '';
    if (problem) { out.push('LEFT ALONE  ' + d.what + '  (' + d.out + '): ' + problem); return; }
    try { voidEntry_(d.out, d.why, today, user, props, true); }
    catch (err) { out.push('void FAILED  ' + d.what + '  (' + d.out + '): ' + String((err && err.message) || err)); return; }
    done++;
    expCost += sum(ls, function (l) { return isProjectCostAccount(l.account) ? l.debit - l.credit : 0; });
    expOwed += sum(ls, function (l) { return l.account === '2030' ? l.credit - l.debit : 0; });
    // A bank line tied to the double goes back to unmatched: the copy kept is another amount, so an empty
    // `to` (Code.gs feedRetie contract). feedUpdateRows_ refreshes the bank tab when it frees one.
    var freed = feedRetieRows_(ss, d.out, [], 'the double ' + d.out + ' was taken out ' + today + ' (in the books twice) - match this line again').updated || 0;
    out.push('voided  ' + d.what + '  (' + d.out + ' -> void-' + d.out + '); kept ' + d.keep.join(' + ') +
      (freed ? '; ' + freed + ' bank line(s) freed - match them again' : ''));
  });
  var rebuilt = HOUSE + ' tab rebuilt';
  try { setupPropertyTab(HOUSE); }   // the voids skipped their own refresh
  catch (err) { rebuilt = HOUSE + ' tab rebuild FAILED  ' + String((err && err.message) || err) + ' - Recast Books -> Rebuild property tab'; }
  warmCache_();
  var after = read();
  var line = function (label, b, a, exp) {
    return label + ': ' + fromCents(b) + ' -> ' + fromCents(a) + ' (down ' + fromCents(b - a) + ', expected ' + fromCents(exp) + ')' + (b - a === exp ? '' : '  <- CHECK');
  };
  out.push('', done + ' double(s) taken out this run; ' + rebuilt,
    line(HOUSE + ' costs', before.cost, after.cost, expCost),
    line('Recast owes Paul on ' + HOUSE, before.owed, after.owed, expOwed),
    line('Recast owes Paul in all', before.owedAll, after.owedAll, expOwed));
  Logger.log(out.join('\n'));
  return out;
}
