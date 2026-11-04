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
 * closeKings20261103 (2026-11-03, 3808 Kings sold to Dennis for 180,000: his 156,000 loan paid back 11-02, Paul's 24,000 owed,
 *   the three bills to Cost Recapture, tab frozen, closing tab; run by Paul 20:28 CT from the editor) is in commit afe6eac.
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
 * repointPaulDraw20261101 (2026-11-01, Paul: his 30,000.00 Chase draw of 10-14 is a payback for business expenses -
 *   voided and posted again on 2030 OVERHEAD / 1402, bank line re-tied; run 21:01 CT from the editor) is in commit 94de82d.
 * bookChaseAsPutIn20261101 (2026-11-01, D-103: Paul's money in the business Chase is his money in the business, not a
 *   loan - 146,891.61 moved off 2030 onto 9000; run 21:16 CT from the editor) is in commit 41c1711.
 * splitChasePutIn20261101 (2026-11-01: the D-103 entry voided and posted again in three amounts - put in 147,729.38 +
 *   2,000.00, bills Chase paid 2,837.77 - so Capital contributions shows its ledger; run 21:40 CT) is in commit 269bfa3.
 * truckLoanOwnRow20261101 (2026-11-01, Paul's yes: his 574.63 truck loan of 10-14 moved out of the bills the business
 *   Chase paid to its own P&L row, Taken out for Paul - inside 9000, no total changed; run 21:49 CT) is in commit 186387f.
 * chaseIsTheBusiness20261101 (2026-11-01, D-105 after the independent audit: the ten Chase-paid receipts re-posted as the
 *   business's costs, the 11-01 reclass as the two deposits only, the truck payment a draw, 1530 on Accounts, Totals rebuilt;
 *   run 22:48-22:53 CT from the editor, pushed as the file's only function) is in commit 7e6eaf7.
 ****************************************************************/
// 2026-11-02 Paul: "Post them" - round 2 of his personal-accounts check (D-100, D-101): the other cards (Discover,
// Capital One, Wells Fargo, Barclays) and Chase checking Dec 24 - Mar 29, matched against the books; every item answered
// by him in chat (~/Desktop/Personal 2026/penny-work/round2/corrections_round2.csv, answers.csv). 33 entries: 29 costs
// and refunds paid by Paul, and 2 taken out (the 02-20 "Juanito 7,000" that was check 5148 to Armandre Vega, and the
// 11-01 Nest thermostat that Discover shows refunded). 104 Ashburne's items go on the house with its release to COGS and
// his share lowered by the same net, listed on its frozen tab under the 11-01 block (the 11-01 shape, D-102). The
// December 2025 lines are 1014 S View's (Paul 11-02: "add them to 2025 ... all 1014 S View") - on Cost Recapture with
// the house in trade (D-031); period 2025-12 is opened for the run and closed again. Each entry carries its receipt
// (Drive) where one exists; where only the bank line exists the memo says so. PR2_MODE 'dry' builds and checks every
// entry and the tab block, changing nothing; 'post' does it. Safe to run again: an item whose memo is on the Journal is
// skipped, a void already done is skipped.
// STATUS: NOT YET RUN
var PR2_MODE = 'dry';
function recordPersonalReview20261102() {
  var DRY = PR2_MODE !== 'post';
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var who = Session.getActiveUser().getEmail();
  var journal = ss.getSheetByName('Journal');
  var cols = headerIndex_(journal);
  var memos = journal.getRange(2, cols['memo'], journal.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
  var have = {};
  memos.forEach(function (m) { var k = /^personal check 11-02 #(\d+)/.exec(m); if (k) have[k[1]] = true; });
  var ctx = buildCtx_(ss);
  ctx.properties.add('104 Ashburne');   // Paul 11-01: his alone - its corrections go on the house, not Cost Recapture
  var ASH = '104 Ashburne', FROZEN = ASH + ' - Frozen';
  var SOURCE = ' - from Paul\'s own bank and card statements, matched 2026-11-02; Paul in chat 2026-11-02';
  var PURPOSE = { '6600': 'Business truck (actual costs, D-009) - Paul 2026-11-01' };
  var entries = [], voids = [], out = [], ashNet = {}, ashTotal = 0, owed = 0;
  var lineOf = function (acct, cents, isDebit, prop, trade, it, desc) {
    var l = { account: acct, debit: isDebit ? cents : 0, credit: isDebit ? 0 : cents, property: prop,
              trade: trade || '', payee: it.payee, description: desc, paid_from: 'PAUL' };
    if (isDebit && PURPOSE[acct]) l.business_purpose = PURPOSE[acct];
    return l;
  };
  var rowsOf = function (txn) {
    return findAllRowsByValue_(journal, cols['txn_id'], txn).map(function (r) {
      var v = journal.getRange(r, 1, 1, journal.getLastColumn()).getValues()[0], o = {};
      Object.keys(cols).forEach(function (k) { o[k] = v[cols[k] - 1]; });
      return o;
    });
  };
  PR2_ITEMS.forEach(function (it) {
    var memo = 'personal check 11-02 #' + it.n + ': ' + it.ev + (it.doc ? '' : ' (no receipt exists - the bank line is the document)') + SOURCE;
    if (it.kind === 'void') {
      var orig = rowsOf(it.void);
      if (!orig.length) throw new Error('#' + it.n + ': ' + it.void + ' is not on the Journal - nothing changed');
      var done = findAllRowsByValue_(journal, cols['void_of'], it.void).length > 0;
      var paid = 0;
      orig.forEach(function (o) {
        var c = Math.round(Number(o.credit || 0) * 100), d = Math.round(Number(o.debit || 0) * 100);
        if (String(o.account) === '2030') paid += c;
        else if (o.property === ASH) { ashNet[o.account] = (ashNet[o.account] || 0) - d + c; ashTotal -= d - c; }
      });
      if (paid !== it.cents) throw new Error('#' + it.n + ': ' + it.void + ' paid ' + paid / 100 + ', expected ' + it.cents / 100 + ' - nothing changed');
      voids.push({ it: it, txn: it.void, date: formatIsoDate_(orig[0].date), done: done });
      out.push('#' + it.n + ' take out ' + it.void + ' ' + (paid / 100).toFixed(2) + (done ? ' (already done)' : ''));
      return;
    }
    var refund = it.kind === 'refund';
    var prop = it.prop;
    if (prop === ASH) { ashNet[it.acct] = (ashNet[it.acct] || 0) + (refund ? -it.cents : it.cents); ashTotal += refund ? -it.cents : it.cents; }
    if (have[it.n]) { out.push('#' + it.n + ' already recorded'); return; }
    var desc = (refund ? 'REFUND: ' : '') + it.what;
    var lines = [lineOf(it.acct, it.cents, !refund, prop, it.trade, it, desc), lineOf('2030', it.cents, refund, prop, '', it, desc)];
    if (prop !== ASH) owed += refund ? -it.cents : it.cents;
    entries.push(buildEntry({ type: 'journal', date: it.date, source: 'manual', posted_by: who, doc_url: it.doc || '', memo: memo, lines: lines }, ctx));
    out.push('#' + it.n + ' ' + it.kind + ' ' + it.date + ' ' + (it.cents / 100).toFixed(2) + ' ' + prop + ' ' + it.acct + (it.doc ? ' +doc' : ''));
  });
  // the 02-20 void is Ashburne too: Recast owed Paul 7,000 less for it (the check line above adds 7,190.73 back)
  var relMemo = ASH + ' sale 2026-09-23: project cost released to COGS - the costs found by Paul\'s personal-accounts check, round 2, 2026-11-02';
  var shareMemo = ASH + ' sale 2026-09-23: Paul\'s share of the profit, less the costs found by his personal-accounts check, round 2, 2026-11-02 (his payout stays the sale less what he owed Dennis)';
  if (ashTotal && memos.indexOf(relMemo) < 0) {
    var relDesc = 'Costs found by the personal-accounts check, round 2, 2026-11-02, released to COGS';
    var rel = [{ account: '5000', debit: ashTotal > 0 ? ashTotal : 0, credit: ashTotal > 0 ? 0 : -ashTotal, property: ASH, description: relDesc }];
    Object.keys(ashNet).sort().forEach(function (a) {
      var n = ashNet[a]; if (!n) return;
      rel.push({ account: a, debit: n < 0 ? -n : 0, credit: n > 0 ? n : 0, property: ASH, description: relDesc });
    });
    entries.push(buildEntry({ type: 'journal', date: '2026-09-23', source: 'sale', posted_by: who, memo: relMemo, lines: rel }, ctx));
    entries.push(buildEntry({ type: 'journal', date: '2026-09-23', source: 'sale', posted_by: who, memo: shareMemo,
      lines: [{ account: '2030', debit: ashTotal > 0 ? ashTotal : 0, credit: ashTotal > 0 ? 0 : -ashTotal, property: ASH, description: 'Paul\'s share of the 104 Ashburne profit, less the round-2 found costs' },
              { account: '9010', debit: ashTotal > 0 ? 0 : -ashTotal, credit: ashTotal > 0 ? ashTotal : 0, property: ASH, description: 'Paul\'s share of the 104 Ashburne profit, less the round-2 found costs' }] }, ctx));
  }
  console.log('recordPersonalReview20261102 (' + PR2_MODE + '): ' + entries.length + ' entries to post, ' +
    voids.filter(function (v) { return !v.done; }).length + ' to take out. 104 Ashburne costs ' + (ashTotal / 100).toFixed(2) +
    ' (by account ' + JSON.stringify(ashNet) + '), Paul\'s Ashburne share less the same. Owed to Paul for the rest: ' + (owed / 100).toFixed(2));
  for (var i = 0; i < out.length; i += 25) console.log(out.slice(i, i + 25).join('\n'));

  // the Ashburne tab block goes under the 11-01 block: first empty row in column B at or below row 28
  var tab = ss.getSheetByName(FROZEN);
  if (!tab) throw new Error('No "' + FROZEN + '" tab - stopped');
  var LABEL = { 0: '03-16 City of Ovilla - water/sewer (I3P)', 1: '02-23 City of Ovilla - card fee on the 02-23 water bill (bank 50.86 vs books 49.14)', 8: '01-07 Keith Ace Hardware - Red Oak TX', 14: '02-02 Lowe\'s - 30-ft pipe heat cable returned (bought 01-17', 15: '03-20 Lowe\'s - 3 Sailor Bay ceiling fans bought in store 03-19 (books 3 x 1', 16: '03-05 Armandre Vega - Zelle', 17: '02-20 Juan Garcia - VOID the migration row \'Paint & Floor Installation 7,000 02-', 18: '02-20 Armandre Vega - check 5148', 21: '03-26 LightsLux - part/shipping for the 03-21 pendant (books 160)', 29: '01-09 Lowe\'s - VOID my 11-01 posting \'Nest thermostat 145.43\'', 30: '01-09 Lowe\'s - two waters kept from the 01-09 order (the only part not refu', 31: '02-04 Lowe\'s - one Kerdi shower niche returned 02-04 (the books hold two: P', 32: '03-06 The Home Depot - MKE OMT Japanese blades returned the same day', 33: '03-17 The Home Depot - Charmaine pulls 7.55 + 28.52 returned 03-17', 34: '03-02 The Home Depot - 2 copper couplings returned 03-02 (inside the -114.55 return' };
  var tabRows = [], tabSum = 0;
  PR2_ITEMS.forEach(function (it) {
    if (it.prop !== ASH) return;
    if (!LABEL[it.n]) throw new Error('#' + it.n + ' has no label for the Ashburne tab - nothing changed');
    var c = it.kind === 'cost' ? it.cents : -it.cents;
    tabSum += c; tabRows.push([LABEL[it.n], c / 100]);
  });
  var HEAD = 'FOUND AFTER CLOSING - your personal-accounts check, round 2, 2026-11-02';
  var colB = tab.getRange(28, 2, Math.max(tab.getLastRow(), 60) - 27, 1).getValues().map(function (r) { return String(r[0]); });
  var TOP = -1, already = -1;
  for (var r = 0; r < colB.length; r++) { if (colB[r] === HEAD) already = 28 + r; }
  for (var r = colB.length - 1; r >= 0; r--) { if (colB[r] !== '') { TOP = 28 + r + 2; break; } }
  if (TOP < 0) TOP = 28;
  var block = [[HEAD, ''], ['Date - store - what', 'Amount']].concat(tabRows).concat([['Added to 104 Ashburne\'s costs', tabSum / 100],
    ['Your share of the profit is lower by the same amount, so your payout does not change (the sale less what you owed Dennis).', '']]);
  console.log('Ashburne tab: ' + tabRows.length + ' lines, net ' + (tabSum / 100).toFixed(2) + ' (books: ' + (ashTotal / 100).toFixed(2) + '), ' + (already > 0 ? 'already written at B' + already : 'goes to B' + TOP + ':C' + (TOP + block.length - 1)));
  if (tabSum !== ashTotal && already < 0) throw new Error('the tab list and the books disagree - nothing written');
  if (DRY) { console.log('dry run: nothing posted, nothing written'); return; }

  // period 2025-12 is closed (the old books); Paul 11-02: the December lines go into 2025 - open it for the run
  var periods = ss.getSheetByName('Periods'), pcols = headerIndex_(periods), prow = findAllRowsByValue_(periods, pcols['period'], '2025-12')[0];
  var wasClosed = prow && String(periods.getRange(prow, pcols['status']).getValue()) === 'closed';
  if (wasClosed) { periods.getRange(prow, pcols['status']).setValue('open'); ctx = buildCtx_(ss); }
  try {
    var plain = entries.filter(function (e) { return e.source !== 'sale'; }), sale = entries.filter(function (e) { return e.source === 'sale'; });
    if (plain.length) postBatchEntries_(plain, props, true);
    voids.forEach(function (v) {
      if (v.done) return;
      var res = voidEntry_(v.txn, 'personal check 11-02 #' + v.it.n + ': ' + v.it.what, v.date, who, props, true);
      console.log('took out ' + v.txn + ' -> ' + JSON.stringify(res).slice(0, 120));
    });
    if (sale.length) postBatchEntries_(sale, props, true);
  } finally {
    if (wasClosed) periods.getRange(prow, pcols['status']).setValue('closed');
  }
  if (already < 0) {
    var range = tab.getRange(TOP, 2, block.length, 2);
    range.setValues(block);
    tab.getRange(TOP + 2, 3, block.length - 2, 1).setNumberFormat('$#,##0.00;-$#,##0.00');
    tab.getRange(TOP, 2, 1, 2).setFontWeight('bold');
    tab.getRange(TOP + block.length - 2, 2, 1, 2).setFontWeight('bold');
  }
  // Bubblehub Pools Inc = Atlas Pools (Paul 11-02) - a Vendors row so the wires match by name next time
  var vend = ss.getSheetByName('Vendors'), vcols = headerIndex_(vend);
  if (!findAllRowsByValue_(vend, vcols['canonical'], 'Atlas Pools').length) {
    var vrow = []; Object.keys(vcols).forEach(function (k) { vrow[vcols[k] - 1] = ''; });
    vrow[vcols['canonical'] - 1] = 'Atlas Pools'; vrow[vcols['aliases'] - 1] = 'Bubblehub Pools Inc; Micky Atlas Pools; ATLAS POOLS ATLASPOOLSTX';
    vrow[vcols['entity_type'] - 1] = 'unknown'; vrow[vcols['form_1099'] - 1] = 'yes'; vrow[vcols['default_account'] - 1] = '1130';
    vrow[vcols['notes'] - 1] = 'Paul 2026-11-02: Bubblehub Pools Inc (Fort Worth, wires via Grasshopper Bank) is the same company as Atlas Pools (Micky). Pool contractor, 104 Ashburne.';
    vend.appendRow(vrow);
  }
  refreshLineBlocksFor_(ss, [{ property: 'Cost Recapture' }]);
  refreshPnl_(ss);
  warmCache_();
  console.log('posted: ' + entries.length + ' entries, ' + voids.filter(function (v) { return !v.done; }).length + ' taken out; the found items listed on "' + FROZEN + '"; P&L refreshed');
}

var PR2_ITEMS = [
{
"n": 0,
"kind": "cost",
"date": "2026-03-16",
"cents": 13613,
"payee": "City of Ovilla",
"what": "water/sewer (I3P) - repay from Chase (D-101)",
"ev": "Chase 8870 03-17 I3P*City of Ovilla 136.13; Paul 11-01 yes to the Ovilla bills",
"prop": "104 Ashburne",
"acct": "1120",
"trade": "",
"doc": ""
},
{
"n": 1,
"kind": "cost",
"date": "2026-02-23",
"cents": 172,
"payee": "City of Ovilla",
"what": "card fee on the 02-23 water bill (bank 50.86 vs books 49.14) - D-094 shape",
"ev": "Chase 8870 02-24 I3P*City of Ovilla 50.86",
"prop": "104 Ashburne",
"acct": "1120",
"trade": "",
"doc": ""
},
{
"n": 2,
"kind": "cost",
"date": "2026-01-10",
"cents": 1000,
"payee": "Midjourney",
"what": "monthly subscription - Paul 11-01: business",
"ev": "Chase 8870 01-12 Midjourney 10.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": "",
"doc": ""
},
{
"n": 3,
"kind": "cost",
"date": "2026-02-10",
"cents": 1000,
"payee": "Midjourney",
"what": "monthly subscription",
"ev": "Chase 8870 02-10 Midjourney 10.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": "",
"doc": ""
},
{
"n": 4,
"kind": "cost",
"date": "2026-03-10",
"cents": 1000,
"payee": "Midjourney",
"what": "monthly subscription",
"ev": "Chase 8870 03-10 Midjourney 10.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": "",
"doc": ""
},
{
"n": 5,
"kind": "cost",
"date": "2026-03-01",
"cents": 5000,
"payee": "Textgrid",
"what": "account top-up - Paul 11-01 yes to Textgrid",
"ev": "Chase 8870 03-02 Textgrid 50.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": "",
"doc": ""
},
{
"n": 6,
"kind": "cost",
"date": "2025-12-23",
"cents": 5000,
"payee": "Textgrid",
"what": "account top-up (2025 books - Paul 11-02 add them)",
"ev": "Chase 8870 12-24-2025 Textgrid 50.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": "",
"doc": ""
},
{
"n": 7,
"kind": "cost",
"date": "2026-01-04",
"cents": 4545,
"payee": "AutoZone",
"what": "truck part - Waxahachie",
"ev": "Barclays 6774 01-04 AutoZone #1338 Waxahachie 45.45",
"prop": "OVERHEAD",
"acct": "6600",
"trade": "",
"doc": ""
},
{
"n": 8,
"kind": "cost",
"date": "2026-01-07",
"cents": 1621,
"payee": "Keith Ace Hardware",
"what": "Red Oak TX - Texas store trip in the Ashburne months with no job name = Ashburne (Paul 11-01 rule)",
"ev": "Barclays 6774 01-07 16.21",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "",
"doc": ""
},
{
"n": 9,
"kind": "cost",
"date": "2026-01-07",
"cents": 4704,
"payee": "Exxon",
"what": "gas - Tiger Mart Waxahachie",
"ev": "Barclays 6774 01-07 47.04",
"prop": "OVERHEAD",
"acct": "6600",
"trade": "",
"doc": ""
},
{
"n": 10,
"kind": "cost",
"date": "2026-01-08",
"cents": 5922,
"payee": "Shell",
"what": "gas - Ovilla",
"ev": "Discover 3746 01-08 59.22",
"prop": "OVERHEAD",
"acct": "6600",
"trade": "",
"doc": ""
},
{
"n": 11,
"kind": "cost",
"date": "2026-01-16",
"cents": 3924,
"payee": "Shell",
"what": "gas - Shell Service Station Ovilla",
"ev": "Chase 8870 01-16 39.24",
"prop": "OVERHEAD",
"acct": "6600",
"trade": "",
"doc": ""
},
{
"n": 12,
"kind": "cost",
"date": "2026-02-12",
"cents": 1914,
"payee": "Exxon",
"what": "gas - Exxon TM Waxahachie",
"ev": "Chase 8870 02-13 19.14",
"prop": "OVERHEAD",
"acct": "6600",
"trade": "",
"doc": ""
},
{
"n": 13,
"kind": "cost",
"date": "2026-02-14",
"cents": 4353,
"payee": "Shell",
"what": "gas - Shell Waxahachie",
"ev": "Chase 8870 02-17 43.53",
"prop": "OVERHEAD",
"acct": "6600",
"trade": "",
"doc": ""
},
{
"n": 14,
"kind": "refund",
"date": "2026-02-02",
"cents": 10821,
"payee": "Lowe\'s",
"what": "30-ft pipe heat cable returned (bought 01-17 - books 108.20) - refund to Discover 3746",
"ev": "Discover 3746 02-02 -108.21",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "",
"doc": ""
},
{
"n": 15,
"kind": "refund",
"date": "2026-03-20",
"cents": 32469,
"payee": "Lowe\'s",
"what": "3 Sailor Bay ceiling fans bought in store 03-19 (books 3 x 108.23) returned 03-20 - refund to 9166; the 8 online fans stayed",
"ev": "Chase 8870 03-23 return -324.69",
"prop": "104 Ashburne",
"acct": "1040",
"trade": "",
"doc": ""
},
{
"n": 16,
"kind": "cost",
"date": "2026-03-05",
"cents": 52481,
"payee": "Armandre Vega",
"what": "Zelle - labor (paint)",
"ev": "Chase 8870 03-05 Zelle to Armandre Vega 524.81",
"prop": "104 Ashburne",
"acct": "1020",
"trade": "",
"doc": ""
},
{
"n": 17,
"kind": "void",
"date": "2026-02-20",
"cents": 700000,
"payee": "Juan Garcia",
"what": "VOID the migration row 'Paint & Floor Installation 7,000 02-20' - it was check 5148 to Armandre Vega (Paul 11-02: remove the 7,000 to Juanito)",
"ev": "check 5148 picture; txn manual-20260220-cc54bc4cb4c9 (the migration row 9cf657f5e831 is already voided - moved 1030->1020)",
"prop": "104 Ashburne",
"acct": "1020",
"trade": "",
"doc": "",
"void": "manual-20260220-cc54bc4cb4c9"
},
{
"n": 18,
"kind": "cost",
"date": "2026-02-20",
"cents": 719073,
"payee": "Armandre Vega",
"what": "check 5148 - exterior paint",
"ev": "Chase 8870 02-20 check 5148 7190.73; Paul 11-02",
"prop": "104 Ashburne",
"acct": "1020",
"trade": "",
"doc": ""
},
{
"n": 19,
"kind": "cost",
"date": "2026-06-16",
"cents": 39800,
"payee": "ZenBusiness",
"what": "business filing service - Paul 11-02: Recast, not the Texas registration; the order says what",
"ev": "Barclays 6774 06-16 398.00",
"prop": "OVERHEAD",
"acct": "6900",
"trade": "",
"doc": ""
},
{
"n": 20,
"kind": "cost",
"date": "2026-03-25",
"cents": 3859,
"payee": "Ellis County",
"what": "county records - card payment 972-835-8418",
"ev": "Chase 8870 03-25 38.59",
"prop": "OVERHEAD",
"acct": "6300",
"trade": "",
"doc": ""
},
{
"n": 21,
"kind": "cost",
"date": "2026-03-26",
"cents": 2999,
"payee": "LightsLux",
"what": "part/shipping for the 03-21 pendant (books 160)",
"ev": "Chase 8870 03-27 29.99",
"prop": "104 Ashburne",
"acct": "1040",
"trade": "",
"doc": ""
},
{
"n": 22,
"kind": "cost",
"date": "2025-12-23",
"cents": 698,
"payee": "Lowe\'s",
"what": "Milwaukie store job '1014' - 82.68 bought and 75.70 returned the same day; net",
"ev": "Barclays 6774 12-23 82.68 / -75.70",
"prop": "Cost Recapture",
"acct": "1030",
"trade": "1014 S View",
"doc": ""
},
{
"n": 23,
"kind": "cost",
"date": "2025-12-23",
"cents": 9985,
"payee": "Safeway",
"what": "fuel - Molalla",
"ev": "Barclays 6774 12-23",
"prop": "Cost Recapture",
"acct": "1030",
"trade": "1014 S View",
"doc": ""
},
{
"n": 24,
"kind": "cost",
"date": "2025-12-26",
"cents": 19900,
"payee": "Enphase",
"what": "solar monitoring (Paul 11-02: 1014 S View)",
"ev": "Barclays 6774 12-26",
"prop": "Cost Recapture",
"acct": "1030",
"trade": "1014 S View",
"doc": ""
},
{
"n": 25,
"kind": "cost",
"date": "2025-12-28",
"cents": 30948,
"payee": "The Home Depot",
"what": "Troutdale store (Paul 11-02: 1014 S View)",
"ev": "Barclays 6774 12-28",
"prop": "Cost Recapture",
"acct": "1030",
"trade": "1014 S View",
"doc": ""
},
{
"n": 26,
"kind": "cost",
"date": "2025-12-29",
"cents": 2855,
"payee": "Mountain Building Supply",
"what": "Welches (Paul 11-02: 1014 S View)",
"ev": "Barclays 6774 12-29",
"prop": "Cost Recapture",
"acct": "1030",
"trade": "1014 S View",
"doc": ""
},
{
"n": 27,
"kind": "cost",
"date": "2025-12-30",
"cents": 15577,
"payee": "The Home Depot",
"what": "Troutdale store (Paul 11-02: 1014 S View)",
"ev": "Barclays 6774 12-30",
"prop": "Cost Recapture",
"acct": "1030",
"trade": "1014 S View",
"doc": ""
},
{
"n": 28,
"kind": "cost",
"date": "2026-01-02",
"cents": 4000,
"payee": "USPS",
"what": "Molalla post office (Paul 11-02: 1014 S View)",
"ev": "Barclays 6774 01-02",
"prop": "Cost Recapture",
"acct": "1030",
"trade": "1014 S View",
"doc": ""
},
{
"n": 29,
"kind": "void",
"date": "2026-01-09",
"cents": 14543,
"payee": "Lowe\'s",
"what": "VOID my 11-01 posting 'Nest thermostat 145.43' - Discover shows the whole 360.49 order refunded 01-13 except 4.36",
"ev": "Discover 3746 01-09 360.49 / 01-13 -356.13; txn manual-20260109-a594700ef7f1 (my 11-01 add, no doc)",
"prop": "104 Ashburne",
"acct": "1040",
"trade": "",
"doc": "",
"void": "manual-20260109-a594700ef7f1"
},
{
"n": 30,
"kind": "cost",
"date": "2026-01-09",
"cents": 436,
"payee": "Lowe\'s",
"what": "two waters kept from the 01-09 order (the only part not refunded)",
"ev": "Discover 3746",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "",
"doc": ""
},
{
"n": 31,
"kind": "refund",
"date": "2026-02-04",
"cents": 9199,
"payee": "Lowe\'s",
"what": "one Kerdi shower niche returned 02-04 (the books hold two: Paul's old row 91.99 and the order's 92.00; one was kept) - refund to 9166",
"ev": "Chase 8870 02-04 return -91.99. NOT a Penny 11-01 add: the 92.00 row is the order read from his email (manual, 10-01)",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "",
"doc": ""
},
{
"n": 32,
"kind": "refund",
"date": "2026-03-06",
"cents": 3677,
"payee": "The Home Depot",
"what": "MKE OMT Japanese blades returned the same day - refund to 9166",
"ev": "Chase 8870 03-06 -36.77. NOT a Penny 11-01 add: the 36.77 row is the receipt read from his email (10-02)",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "",
"doc": ""
},
{
"n": 33,
"kind": "refund",
"date": "2026-03-17",
"cents": 3607,
"payee": "The Home Depot",
"what": "Charmaine pulls 7.55 + 28.52 returned 03-17 - refund to 9166",
"ev": "Chase 8870 03-17 -36.07. NOT a Penny 11-01 add: the rows are the receipt read from his email (10-01)",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "",
"doc": ""
},
{
"n": 34,
"kind": "refund",
"date": "2026-03-02",
"cents": 199,
"payee": "The Home Depot",
"what": "2 copper couplings returned 03-02 (inside the -114.55 return) - refund to 9166",
"ev": "Chase 8870 03-02 -114.55. NOT a Penny 11-01 add: the 1.99 row is the receipt read from his email (09-26)",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "",
"doc": ""
}
];
