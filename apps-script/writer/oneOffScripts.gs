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
 * moveCheckToBowlingGreen (2026-10-02, Paul's 607.05 check all on 136 Bowling Green) is in commit a3c3ff7.
 * rereadFailedReads20261004 (the four receipts the API refused 10-02..10-04, read again) is in commit e9d490f.
 * rematchRedOakFeeLines20261025 (2026-10-25, the Red Oak bill and its $2 online fee re-matched as one receipt) is in commit 2113638.
 * voidTypedHomeDepot3784_20261025 (2026-10-25, the 37.84 Home Depot typed while its receipt was being read - voided, line moved to the receipt) is in commit 08fad59.
 * addSuppliesOnHandAccount20261025 (2026-10-25, D-095: the 1530 Supplies on hand row onto the live Accounts tab) is in commit 4d09a8d.
 * importMolalla (2026-10-04, D-079: 1014 S View brought in as one closed house; run 19:07 CDT) is in commit bbcd0be.
 * importMolallaLines (2026-10-04, D-079: the same house line by line from his sheet, its frozen house tab and closing
 *   tab; run 19:28 CDT) is in commit 542847e.
 * followJournalOnTabs (2026-10-04, D-080: the closing tabs' Journal formulas rewritten in place and every house not
 *   sold rebuilt onto the range that follows the Journal; run 22:35 CDT) is in commit abf8a19.
 * setNewportInterest (2026-10-05, D-082: Dennis's figures on 881 Newport's two advances, the closing tab rewritten;
 *   run by Paul the same morning) is in commit 8ee100e.
 * unpayNewport (2026-10-05, D-083: Newport's two "paid" payout records voided - neither had gone out - and the
 *   closing tab rewritten; run by Paul the same afternoon) is in commit d9b785a.
 * bookPaulShareOwed (2026-10-05, D-084: Paul's profit from Ashburne and Newport booked as owed to him on 2030, both
 *   closing tabs rewritten; run by Paul that night) is in commit fdbf246.
 * recordPurchaseKingsErinHills (2026-10-06, D-086: Dennis's purchase loan recorded on 3808 Kings and 658 Erin Hills,
 *   added before Add property did it; run by Paul that night) is in commit 9525dc8.
 * moveLocksToHouses (2026-10-07, three keypad deadbolts off the shelf onto 3808 Kings, 413 Green Acres and 366 Mesa;
 *   run by Paul the same day) is in commit a2d14f3.
 * recordVenmoJuanito20261023 (2026-10-23, two Venmo payments to Juanito from Paul's screenshots - 1,500 on 413 Green
 *   Acres 10-08 and 450 on 241 Poinsetta 10-13; run by Penny from the editor the same day) is in commit 133156e.
 *
 * ASCII ONLY - same paste-into-the-editor constraint as Code.gs.
 * dismissKlarnaNotice20261025 (2026-10-25, the Klarna "Upcoming lease payment" notice taken out of the Inbox as not a payment; run 16:22 PT) is in commit 63d63c9.
 * voidPacerNotice20261025 (2026-10-25, PACER's 10-14 notice taken out until the card is charged - the entry voided on its own date, the email marked; run 17:48 PT) is in commit 697b606.
 * settleCheck20261026 (2026-10-26, the nightly check's four items: the Amazon 263.74 record noted, Lupe's 300 relinked to its screenshot, the USPS 40 overhead double voided, the 10-11 Poinsetta photo re-read; run 14:45 PT, pasted into the editor - clasp login was expired, so the live file keeps it until the next push) is in commit ed25343.
 * dismissPoinsettaPhoto20261026 (2026-10-26, the re-read 10-11 photo = the 37.84 Home Depot already in the books; its card dismissed; run 14:49 PT, pasted into the editor) is in commit 7608f28.
 * dryRunNightlyCheck20261027 (2026-10-27, D-097: one dry run of the new nightly check on the live books; run 08:25 PT, clean - no fix tried, none refused) is in commit 8881ae4.
 * recordPaulWorkingMoneyNewport20261029 (2026-10-29, Paul's 20,000 of the 881 Newport sale left in the Citizens account as his working money - one entry, paid to Paul and left in, the closing tab rewritten, the P&L refreshed; run 20:41 CT from the editor, pushed as the file's only function) is in commit 184684f.
 * mesaAdvanceToWorkingMoney20261029 (2026-10-29, Dennis's 10,000 of 08-12 off 366 Mesa and into the account as his working money, D-055 - the Advances row off, the entry voided and re-posted with no house, the bank line tied, the tab rebuilt; run 20:25 CT, pasted into the editor as the file's only function - clasp login was expired) is in commit b9590e9.
 ****************************************************************/

// 2026-10-29 Paul: "any expense that is paid for from the chase recast account should be reimbursed to me. the chase
// recast business account is not a shared account with dennis ... the checkbox should be paul paid vs recast account."
// D-098. Every live entry the Recast Chase account paid for (a 1402 credit, cost lines on a house or the business -
// not his own money moving in or out) is voided on its own date and posted again in the engine's new shape: the cost
// lines and a 2030 credit on the house carry PAUL (the tab ticks Paul Paid, the sale pays him back), then the cash
// out of Chase as his working money (Dr 2030 no house / Cr 1402). Same date, receipt link, trade, payee, wording.
// The Chase bank lines tied to the old entries follow the new ones; each receipt's Inbox record is pointed at its
// new entry; the held houses' tabs, the bank tabs and the P&L are refreshed. Safe to run twice: a corrected entry
// is found by its memo and an entry already in the shape is skipped.
// STATUS: NOT YET RUN
function chasePaysIsPaulPaid20261029() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var who = Session.getActiveUser().getEmail();
  var journal = ss.getSheetByName('Journal'), cols = headerIndex_(journal);
  var data = journal.getRange(2, 1, journal.getLastRow() - 1, journal.getLastColumn()).getValues();
  var g = function (r, n) { return r[cols[n] - 1]; };
  var cents = function (v) { return Math.round(Number(v || 0) * 100); };
  var voided = {}, ownVoid = {}, byTxn = {}, idByMemo = {};
  data.forEach(function (r) {
    var v = String(g(r, 'void_of') || ''); if (v) { voided[v] = true; if (/Recast Chase account is his own money/.test(String(g(r, 'memo')))) ownVoid[v] = true; }
    var id = String(g(r, 'txn_id')); (byTxn[id] = byTxn[id] || []).push(r);
    idByMemo[String(g(r, 'memo'))] = id;
  });
  var docOf = {   // the receipt's Inbox record, from index/docs (2026-10-29)
    'receipt-20261001-822eca180792': 'gm-1a0f7daccd2458b3', 'receipt-20261012-c9dbcd2427b4': 'gm-1a132380fd81f253',
    'receipt-20261014-e2d5e17b44c4': 'gm-1a13d720f8a1aa80', 'receipt-20261023-dbc4cdfe8ff1': 'gm-1a16b0265f1e644b',
    'receipt-20261025-6d718e53c790-f35a': 'gm-1a174c3d49890d62', 'receipt-20261026-9d2aa2e6ef8d': 'gm-1a17aad4339cd212',
    'receipt-20261028-a404a40c6479': 'gm-1a184b0db9756cc5'
  };
  var todo = Object.keys(byTxn).filter(function (id) {
    var rows = byTxn[id];
    if (String(g(rows[0], 'source')) === 'void') return false;
    if (voided[id] && !ownVoid[id]) return false;   // voided before this script: not ours; voided by an earlier run of it and not yet replaced: still to do
    var chaseOut = rows.some(function (r) { return String(g(r, 'account')) === '1402' && cents(g(r, 'credit')) > 0; });
    var ownMoney = rows.some(function (r) { return String(g(r, 'account')) === '2030' && String(g(r, 'property') || '') === ''; });
    return chaseOut && !ownMoney;   // a cost Chase paid, not his money moving (working money, a draw, the truck payment)
  });
  var ctx = buildCtx_(ss);
  var feed = ss.getSheetByName('Feed'), fCols = headerIndex_(feed);
  var fRows = feed.getRange(2, 1, feed.getLastRow() - 1, feed.getLastColumn()).getValues();
  var ties = [], marked = 0, posted = 0, houses = {};
  todo.forEach(function (oldId) {
    var rows = byTxn[oldId];
    var costs = rows.filter(function (r) { return String(g(r, 'account')) !== '1402'; });
    var bank = rows.filter(function (r) { return String(g(r, 'account')) === '1402'; })[0];
    var total = cents(g(bank, 'credit')) - cents(g(bank, 'debit'));
    var date = formatIsoDate_(g(costs[0], 'date')), payee = String(g(costs[0], 'payee') || '');
    var memo = String(g(costs[0], 'memo')) + ' - corrected 2026-10-29: paid from the Recast Chase account = paid by Paul, owed back to him (D-098, his rule)';
    var newId = idByMemo[memo];
    if (!newId) {
      var byHouse = {};
      var lines = costs.map(function (r) {
        var p = String(g(r, 'property') || ''); houses[p] = true;
        byHouse[p] = (byHouse[p] || 0) + cents(g(r, 'debit')) - cents(g(r, 'credit'));
        return { account: String(g(r, 'account')), debit: cents(g(r, 'debit')), credit: cents(g(r, 'credit')), property: p,
          trade: String(g(r, 'trade') || ''), payee: String(g(r, 'payee') || ''), description: String(g(r, 'description') || ''),
          paid_from: 'PAUL', business_purpose: String(g(r, 'business_purpose') || '') };
      });
      var what = costs.map(function (r) { return String(g(r, 'description') || ''); }).filter(Boolean).join('; ');
      Object.keys(byHouse).forEach(function (p) {
        var c = byHouse[p];
        lines.push({ account: '2030', debit: c < 0 ? -c : 0, credit: c > 0 ? c : 0, property: p, payee: payee, description: what, paid_from: 'PAUL' });
      });
      var text = 'Working money ' + (total >= 0 ? 'taken out of' : 'put back into') + ' the account - ' + payee + ': ' + what;
      var abs = Math.abs(total);
      lines.push({ account: '2030', debit: total >= 0 ? abs : 0, credit: total >= 0 ? 0 : abs, property: '', payee: payee, description: text, paid_from: '1402' });
      lines.push({ account: '1402', debit: total >= 0 ? 0 : abs, credit: total >= 0 ? abs : 0, property: '', payee: payee, description: text, paid_from: '1402' });
      Object.keys(byHouse).forEach(function (p) { if (p && p !== 'OVERHEAD') ctx.properties.add(p); });   // a sold house keeps its lines (104 Ashburne's lawn of 10-01)
      if (!voided[oldId]) voidEntry_(oldId, 'Paul, 2026-10-29: the Recast Chase account is his own money - posted again as paid by Paul (D-098)', date, who, props, true);
      // allow_duplicate_hash: the Mariana entries' first version of 10-12 / 10-14 was paid by PAUL, so the id would repeat
      var built = buildEntry({ type: 'journal', date: date, source: String(g(costs[0], 'source') || 'receipt'), posted_by: who, allow_duplicate_hash: true,
        doc_url: String(g(costs[0], 'doc_url') || ''), memo: memo, lines: lines }, ctx);
      postBatchEntries_([built], props, true);
      newId = built.txn_id; posted++;
      console.log(oldId + ' -> ' + newId + ' (' + (total / 100).toFixed(2) + ', ' + Object.keys(byHouse).join(', ') + ')');
    } else console.log(oldId + ': already corrected as ' + newId);
    fRows.forEach(function (fr) {
      if (String(fr[fCols['account'] - 1]) === '1402' && String(fr[fCols['txn_id'] - 1]) === oldId) {
        ties.push({ feed_id: String(fr[fCols['feed_id'] - 1]), status: 'matched', txn_id: newId,
          match_note: String(fr[fCols['match_note'] - 1] || '') + ' - paid by Paul through the Recast Chase account (D-098, 2026-10-29)' });
      }
    });
    if (docOf[oldId]) {
      try {
        var m = siteFetchJson_('/api/inbox', 'post', { action: 'mark-posted', docId: docOf[oldId], txn_ids: [newId], rows: null, doc_url: '', by: who, repoint: true,
          note: 'Paid by Paul through the Recast Chase account - posted again 2026-10-29 (D-098)' });
        if (m && m.status === 'posted') marked++;
      } catch (e) { console.log('receipt record ' + docOf[oldId] + ' not updated: ' + e); }
    } else console.log('no Inbox record known for ' + oldId);
  });
  var tied = ties.length ? feedUpdateRows_(ss, ties) : { updated: 0, missing: [] };
  Object.keys(houses).forEach(function (p) { if (p && p !== 'OVERHEAD' && ss.getSheetByName(p)) { try { refreshLineBlocks_(ss, p); } catch (e) { console.error('refreshLineBlocks_ ' + p + ': ' + e); } } });
  refreshBankSheets_(ss);
  refreshPnl_(ss);
  warmCache_();
  console.log('chasePaysIsPaulPaid20261029: ' + todo.length + ' Chase-paid entries found, ' + posted + ' posted again; ' + tied.updated + ' bank lines re-tied' +
    (tied.missing.length ? ' (not found: ' + tied.missing.join(', ') + ')' : '') + '; ' + marked + ' receipt records pointed at the new entries.');
}
