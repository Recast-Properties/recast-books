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
 * fixThreePayers20261030 (2026-10-30, Paul: the 185.00 writ and the 19.66 Home Depot paid by Dennis's own check and card, the 5.00 deed copy by Paul's own card - none from Citizens; each voided on its own date and posted again, the receipt records repointed, 200 Janice, 366 Mesa, the bank tabs and the P&L refreshed; run 07:02 CT from the editor, pushed as the file's only function) is in commit 3de786a.
 * voidMesaHomeDepotDouble20261030 (2026-10-30, Paul: "Yes, take it out" - the 19.66 Home Depot on 366 Mesa dated 08-03, migrated from the old books, was the 09-03 receipt paid by Dennis with the month typed wrong; voided on its own date, 366 Mesa and the P&L refreshed; run 08:57 CT from the editor, pushed as the file's only function) is in commit e17c48c.
 * addDennisCard2749_20261030 (2026-10-30, D-099: Settings dennis_personal_last4 seeded with Dennis's own card 2749; run 09:01 CT from the editor, pushed as the file's only function) is in commit afde4ea.
 * tieOldHomeDepotCards20261031 (2026-10-31, the 90.23 / 30.57 Home Depot cards of 09-24/25 tied to their receipts and retired;
 *   run 05:59 CT from the editor, pasted in as the file's only function - clasp login was expired) is in commit 6be69f4.
 * linkMolallaReceipts (2026-10-05, 1014 S View's receipts on its Journal lines and frozen tab; Paul's word of 10-05,
 *   finally run 2026-10-31 21:43 CT inside relinkFrozenReceipts20261031) is in commit ba509dd.
 * relinkFrozenReceipts20261031 (2026-10-31, every frozen tab's plain "Receipt" cells made links again - 695 cells,
 *   none left; run 21:42-21:46 CT from the editor after a clasp push) is in commit 0fa2055.
 * recordPersonalReview20261101 (2026-11-01, Paul's "post them": the personal-accounts check's corrections - 70 entries,
 *   5 taken out, 104 Ashburne's found costs 4,713.78 released with his share lowered the same and listed on its frozen
 *   tab; owed to Paul +1,098.79; run 20:06 and 20:09 CT from the editor, pasted in - clasp login was expired) is in commit f2f550f.
 ****************************************************************/

// 2026-11-01 Paul: "i took a $30,000 draw from the chase account ... i want the to be applied as a reimbursement for
// business expenses owed." The 30,000.00 to his checking 8870 on 10-14 - recorded 10-24 as his working money out of Chase
// (manual-20261014-711c18794e32, no house) - is voided on its own date and posted again as Recast paying him back for
// business costs he paid: Dr 2030 on OVERHEAD / Cr 1402, the D-101 repayment shape. On the P&L, Business expenses owed
// falls by it instead of Operating cash; the total owed from Chase is the same. Its Chase bank line (Feed 202610140) is
// tied to the new entry; the bank tabs and the P&L are refreshed. Safe to run twice: the new entry is found by its memo.
// STATUS: NOT YET RUN
function repointPaulDraw20261101() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var who = Session.getActiveUser().getEmail();
  var oldId = 'manual-20261014-711c18794e32';
  var memo = 'Paid to Paul 2026-10-14 from the Chase account to his personal checking 8870 - a payback for business expenses he paid (Paul, 2026-11-01; D-101)';
  var journal = ss.getSheetByName('Journal'), cols = headerIndex_(journal);
  var data = journal.getRange(2, 1, journal.getLastRow() - 1, journal.getLastColumn()).getValues();
  var g = function (r, n) { return r[cols[n] - 1]; };
  var cents = function (v) { return Math.round(Number(v || 0) * 100); };
  var newId = '', voided = false, old = [];
  data.forEach(function (r) {
    if (String(g(r, 'memo')) === memo) newId = String(g(r, 'txn_id'));
    if (String(g(r, 'void_of')) === oldId) voided = true;
    if (String(g(r, 'txn_id')) === oldId) old.push(r);
  });
  if (!newId) {
    if (voided) throw new Error(oldId + ' was voided by something else - stopped here, tell Claude');
    var paul = old.filter(function (r) { return String(g(r, 'account')) === '2030'; });
    if (old.length !== 2 || paul.length !== 1 || cents(g(paul[0], 'debit')) !== 3000000 || String(g(paul[0], 'property') || '') !== '') {
      throw new Error(oldId + ' is not the 30,000.00 draw as recorded 10-24 - stopped here, tell Claude');
    }
    var line = { payee: 'Paul Bjork', description: 'Paid back to Paul for business expenses he paid', paid_from: '1402' };
    // built (and checked by the engine) before the old one is voided, so a refusal changes nothing
    var built = buildEntry({ type: 'journal', date: '2026-10-14', source: 'manual', posted_by: who, doc_url: '', memo: memo, allow_duplicate_hash: true,
      lines: [Object.assign({ account: '2030', debit: 3000000, credit: 0, property: 'OVERHEAD' }, line),
              Object.assign({ account: '1402', debit: 0, credit: 3000000, property: '' }, line)] }, buildCtx_(ss));
    voidEntry_(oldId, 'Paul, 2026-11-01: the 30,000.00 draw is a payback for business expenses he paid - posted again', '2026-10-14', who, props, true);
    postBatchEntries_([built], props, true);
    newId = built.txn_id;
  } else console.log('already posted again as ' + newId);
  var tied = feedUpdateRows_(ss, [{ feed_id: '202610140', status: 'matched', txn_id: newId,
    match_note: 'Paul took 30,000.00 out of Chase to his personal checking 8870 - a payback for business expenses he paid (Paul, 2026-11-01)' }]);
  refreshPnl_(ss);
  warmCache_();
  console.log('repointPaulDraw20261101: ' + oldId + ' -> ' + newId + '; ' + tied.updated + ' bank line tied' +
    (tied.missing.length ? ' (not found: ' + tied.missing.join(', ') + ')' : '') + '; P&L refreshed.');
}
