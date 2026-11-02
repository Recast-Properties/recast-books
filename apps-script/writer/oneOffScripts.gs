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
 ****************************************************************/

// 2026-11-01 Paul: "post them" - the corrections from his personal-accounts check (D-100, D-101): 74 items found in his
// own bank, card and store records (Amazon, Home Depot Pro, Lowe's Pro, Uber), each answered by him in chat, the list
// beside his data (~/Desktop/Personal 2026/penny-work/corrections_to_post.csv). Paul, the same evening: "for ashburne
// ... its ok with me to adjust the frozen tabs since its just me, no partners. the other frozen tabs need to stay
// frozen ... those changes should land in cost recapture". So 104 Ashburne's items go on the house itself, with its
// release to COGS and his profit share lowered by the same net (his payout stays the sale less what he owed Dennis),
// and the found items are listed on its frozen tab under the summary (a rebuild from today's books would have changed
// 160 cells of the closing record - the dry run of 11-01). Granite, Sparkling and Newport items land on Cost
// Recapture; 136 Bowling Green is held, so its two go on the house. PR_MODE 'dry' builds and checks every entry and the
// tab list, changing nothing; 'post' does it. Safe to run
// again: an item whose memo is on the Journal is skipped, a void already done is skipped.
// STATUS: NOT YET RUN
var PR_MODE = 'post';
function recordPersonalReview20261101() {
  var DRY = PR_MODE !== 'post';
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var who = Session.getActiveUser().getEmail();
  var journal = ss.getSheetByName('Journal');
  var cols = headerIndex_(journal);
  var memos = journal.getRange(2, cols['memo'], journal.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
  var have = {};
  memos.forEach(function (m) { var k = /^personal check 11-01 #(\d+)/.exec(m); if (k) have[k[1]] = true; });
  var ctx = buildCtx_(ss);
  ctx.properties.add('104 Ashburne');   // Paul 11-01: his alone - its corrections go on the house, not Cost Recapture
  var ASH = '104 Ashburne', FROZEN = ASH + ' - Frozen';
  var SOURCE = ' - from Paul\'s own bank, card and store records (no Drive file: the store\'s purchase list and the bank line are the document); Paul in chat 2026-11-01';
  var PURPOSE = { '6600': 'Business truck (actual costs, D-009) - Paul 2026-11-01',
                  '6700': 'Ride to PDX for the Texas work trip of Jun 15 (Southwest PDX-DAL)' };
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
  PR_ITEMS.forEach(function (it) {
    var memo = 'personal check 11-01 #' + it.n + ': ' + it.ev + SOURCE;
    if (it.void) {
      var orig = rowsOf(it.void);
      if (!orig.length) throw new Error('#' + it.n + ': ' + it.void + ' is not on the Journal - nothing changed');
      var done = findAllRowsByValue_(journal, cols['void_of'], it.void).length > 0;
      var paid = 0;
      orig.forEach(function (o) {
        var c = Math.round(Number(o.credit || 0) * 100), d = Math.round(Number(o.debit || 0) * 100);
        if (String(o.account) === '2030') paid += c;
        else if (o.property === ASH) { ashNet[o.account] = (ashNet[o.account] || 0) - d + c; ashTotal -= d - c; }   // counted done or not: the release below needs the whole net
      });
      if (paid !== it.cents) throw new Error('#' + it.n + ': ' + it.void + ' paid ' + paid / 100 + ', expected ' + it.cents / 100 + ' - nothing changed');
      if (!done && orig[0].property !== ASH) owed -= paid;
      voids.push({ it: it, txn: it.void, date: formatIsoDate_(orig[0].date), done: done, orig: orig });
      out.push('#' + it.n + ' take out ' + it.void + ' ' + (paid / 100).toFixed(2) + (done ? ' (already done)' : ''));
      if (it.kind === 'redate' && !have[it.n]) {
        var o0 = orig.filter(function (o) { return Number(o.debit) > 0; })[0];
        entries.push(buildEntry({ type: 'journal', date: it.newDate, source: 'manual', posted_by: who, doc_url: String(o0.doc_url || ''),
          memo: memo + ' (re-dated from ' + formatIsoDate_(o0.date) + ' to the day the bank paid it)',
          lines: [lineOf(String(o0.account), it.cents, true, 'OVERHEAD', '', { payee: o0.payee }, String(o0.description)),
                  lineOf('2030', it.cents, false, 'OVERHEAD', '', { payee: o0.payee }, String(o0.description))] }, ctx));
        owed += it.cents;
      }
      return;
    }
    var refund = it.kind === 'refund';
    var prop = it.prop, desc = (refund ? 'REFUND: ' : '') + it.what;
    var parts = it.split || [[it.acct, it.trade, it.cents, it.what]];
    parts.forEach(function (p) {   // counted posted or not: the release below needs the whole net
      if (prop === ASH) { ashNet[p[0]] = (ashNet[p[0]] || 0) + (refund ? -p[2] : p[2]); ashTotal += refund ? -p[2] : p[2]; }
    });
    if (have[it.n]) { out.push('#' + it.n + ' already recorded'); return; }
    var lines = [];
    parts.forEach(function (p) {
      lines.push(lineOf(p[0], p[2], !refund, prop, p[1], it, (refund ? 'REFUND: ' : '') + p[3]));
    });
    lines.push(lineOf('2030', it.cents, refund, prop, '', it, desc));
    if (prop !== ASH) owed += refund ? -it.cents : it.cents;
    entries.push(buildEntry({ type: 'journal', date: it.date, source: 'manual', posted_by: who, doc_url: '', memo: memo, lines: lines }, ctx));
    out.push('#' + it.n + ' ' + it.kind + ' ' + it.date + ' ' + (it.cents / 100).toFixed(2) + ' ' + prop + ' ' + parts.map(function (p) { return p[0]; }).join('+'));
  });
  // 104 Ashburne: the found costs released to COGS as its sale did, and Paul's share of the profit lowered by the same
  // net - Recast owes him the costs he fronted and the same amount less profit, so his payout does not move.
  var relMemo = ASH + ' sale 2026-09-23: project cost released to COGS - the costs found by Paul\'s personal-accounts check 2026-11-01';
  var shareMemo = ASH + ' sale 2026-09-23: Paul\'s share of the profit, less the costs found by his personal-accounts check 2026-11-01 (his payout stays the sale less what he owed Dennis)';
  if (ashTotal && memos.indexOf(relMemo) < 0) {
    var relDesc = 'Costs found by the personal-accounts check 2026-11-01, released to COGS';   // the two entries' ids hash the first debit line, so each needs its own words
    var rel = [{ account: '5000', debit: ashTotal > 0 ? ashTotal : 0, credit: ashTotal > 0 ? 0 : -ashTotal, property: ASH, description: relDesc }];
    Object.keys(ashNet).sort().forEach(function (a) {
      var n = ashNet[a]; if (!n) return;
      rel.push({ account: a, debit: n < 0 ? -n : 0, credit: n > 0 ? n : 0, property: ASH, description: relDesc });
    });
    entries.push(buildEntry({ type: 'journal', date: '2026-09-23', source: 'sale', posted_by: who, memo: relMemo, lines: rel }, ctx));
    entries.push(buildEntry({ type: 'journal', date: '2026-09-23', source: 'sale', posted_by: who, memo: shareMemo,
      lines: [{ account: '2030', debit: ashTotal > 0 ? ashTotal : 0, credit: ashTotal > 0 ? 0 : -ashTotal, property: ASH, description: 'Paul\'s share of the 104 Ashburne profit, less the found costs' },
              { account: '9010', debit: ashTotal > 0 ? 0 : -ashTotal, credit: ashTotal > 0 ? ashTotal : 0, property: ASH, description: 'Paul\'s share of the 104 Ashburne profit, less the found costs' }] }, ctx));
  }
  console.log('recordPersonalReview20261101 (' + PR_MODE + '): ' + entries.length + ' entries to post, ' +
    voids.filter(function (v) { return !v.done; }).length + ' to take out. 104 Ashburne costs ' + (ashTotal / 100).toFixed(2) +
    ' (by account ' + JSON.stringify(ashNet) + '), Paul\'s Ashburne share less the same. Owed to Paul for the rest: ' + (owed / 100).toFixed(2));
  for (var i = 0; i < out.length; i += 25) console.log(out.slice(i, i + 25).join('\n'));

  if (!DRY) {
    var plain = entries.filter(function (e) { return e.source !== 'sale'; }), sale = entries.filter(function (e) { return e.source === 'sale'; });
    if (plain.length) postBatchEntries_(plain, props, true);
    voids.forEach(function (v) {
      if (v.done) return;
      var res = voidEntry_(v.txn, 'personal check 11-01 #' + v.it.n + ': ' + v.it.what, v.date, who, props, true);
      console.log('took out ' + v.txn + ' -> ' + JSON.stringify(res).slice(0, 120));
    });
    if (sale.length) postBatchEntries_(sale, props, true);
  }

  // The Ashburne tab: a rebuild from today's books changed 160 cells of the record as it stood at closing (Dennis's
  // advance schedule, interest, the closing totals - the 11-01 dry run), so the found items go on the frozen tab as a
  // list under its summary instead (Paul: "make the adjustments"); nothing above it is touched.
  var LABEL = { 6: '06-16 Home Depot - screws and a stud returned', 7: '06-18 Home Depot - vent tape and steel bar returned',
    8: '06-21 Home Depot - spray paint, felt pads, nails, threaded rod, glue returned', 10: '06-16 Home Depot - felt pads, nails, sealant were in twice',
    11: '04-03 Lowe\'s - front door handleset returned', 12: '02-13 Lowe\'s - grout returned', 13: '04-01 Lowe\'s - tape measure returned',
    14: '03-05 Lowe\'s - lattice and moulding returned', 17: '01-09 Lowe\'s - Nest thermostat', 22: '04-14 Lowe\'s - butcher block counters and toe kick',
    24: '02-12 Amazon - steam cleaner', 25: '04-01 Amazon - dog door', 26: '04-04 Amazon - keypad deadbolt, lava rock, shelf liner',
    27: '04-06 Amazon - attic ladder shipping and vanity lights the receipt missed', 30: '02-22 Amazon - candles and match holders (personal, taken out)',
    32: '08-07 Amazon - floating pool lights for staging', 33: '04-06 Juanito - cash for labor', 34: '06-18 Armandre Vega - installing the bath fan inside',
    42: '04-02 Wayfair - teardrop pendant returned', 43: '04-15 City of Ovilla - water', 44: '05-15 City of Ovilla - water', 45: '06-15 City of Ovilla - water',
    46: '07-15 City of Ovilla - water', 47: '09-15 City of Ovilla - water' };
  var tabRows = [], tabSum = 0;
  PR_ITEMS.forEach(function (it) {
    if (it.prop !== ASH) return;
    if (!LABEL[it.n]) throw new Error('#' + it.n + ' has no label for the Ashburne tab - nothing changed');
    var c = it.kind === 'purchase' ? it.cents : -it.cents;
    tabSum += c;
    tabRows.push([LABEL[it.n], c / 100]);
  });
  var tab = ss.getSheetByName(FROZEN);
  if (!tab) throw new Error('No "' + FROZEN + '" tab - stopped before the tab step');
  var TOP = 28, block = [['FOUND AFTER CLOSING - your personal-accounts check, 2026-11-01', ''], ['Date - store - what', 'Amount']]
    .concat(tabRows).concat([['Added to 104 Ashburne\'s costs', tabSum / 100],
      ['Your share of the profit is lower by the same amount, so your payout does not change (the sale less what you owed Dennis).', '']]);
  var range = tab.getRange(TOP, 2, block.length, 2);
  var already = String(tab.getRange(TOP, 2).getValue()) === block[0][0];
  var busy = range.getValues().some(function (r) { return r[0] !== '' || r[1] !== ''; });
  console.log('Ashburne tab: ' + tabRows.length + ' lines, net ' + (tabSum / 100).toFixed(2) + ' (books: ' + (ashTotal / 100).toFixed(2) + '), B' + TOP + ':C' + (TOP + block.length - 1) +
    (already ? ' already written' : busy ? ' NOT EMPTY - stopped' : ' empty, ready'));
  if (tabSum !== ashTotal && !already) throw new Error('the tab list and the books disagree - nothing written');
  if (busy && !already) throw new Error('B' + TOP + ':C' + (TOP + block.length - 1) + ' on "' + FROZEN + '" is not empty - stopped');
  if (DRY) { console.log('dry run: nothing posted, nothing written'); return; }
  if (!already) {
    range.setValues(block);
    tab.getRange(TOP + 2, 3, block.length - 2, 1).setNumberFormat('$#,##0.00;-$#,##0.00');
    tab.getRange(TOP, 2, 1, 2).setFontWeight('bold');
    tab.getRange(TOP + block.length - 2, 2, 1, 2).setFontWeight('bold');
  }
  refreshLineBlocksFor_(ss, [{ property: '136 Bowling Green' }, { property: 'Cost Recapture' }]);
  refreshPnl_(ss);
  warmCache_();
  console.log('posted: ' + entries.length + ' entries, ' + voids.filter(function (v) { return !v.done; }).length + ' taken out; the found items listed on "' + FROZEN + '"; P&L refreshed');
}

var PR_ITEMS = [
{
"n": 0,
"kind": "refund",
"date": "2026-08-10",
"cents": 16129,
"payee": "Home Depot",
"what": "M12 FUEL wet/dry vacuum returned - refund to 9166",
"ev": "HD receipt 00015-13324; books 08-07 purchase 60807-58b7e6d5d150",
"prop": "OVERHEAD",
"acct": "6510",
"trade": ""
},
{
"n": 1,
"kind": "refund",
"date": "2026-06-17",
"cents": 4760,
"payee": "Home Depot",
"what": "4-1/4 in. hole saw returned - refund to 9166",
"ev": "HD 00017-40513; books 06-16 Hole Saw 60616-ec221bbc1127",
"prop": "OVERHEAD",
"acct": "6510",
"trade": ""
},
{
"n": 2,
"kind": "refund",
"date": "2026-08-07",
"cents": 2054,
"payee": "Home Depot",
"what": "oscillating blade returned - refund to 9166",
"ev": "HD 00018-07262; books 08-05 receipt -4d5bcc478bad-e829",
"prop": "OVERHEAD",
"acct": "6510",
"trade": ""
},
{
"n": 3,
"kind": "refund",
"date": "2026-05-29",
"cents": 4327,
"payee": "Home Depot",
"what": "weed barrier returned - refund to 7274",
"ev": "HD 00018-18475; books 05-28 -f0414c343867-02d1",
"prop": "Cost Recapture",
"acct": "1030",
"trade": "1616 Granite"
},
{
"n": 4,
"kind": "refund",
"date": "2026-05-29",
"cents": 3742,
"payee": "Home Depot",
"what": "drip tubing 28.38 + wood glue 3.98 + roller frame 5.06 returned - refund to 9166",
"ev": "HD 00018-19093; books 05-29 manual rows + 05-31 Roller Cover",
"prop": "Cost Recapture",
"acct": "1030",
"trade": "1616 Granite"
},
{
"n": 5,
"kind": "refund",
"date": "2026-07-08",
"cents": 3244,
"payee": "Home Depot",
"what": "old-work box / lever nuts / 16-3 cord / blank plate returned - refund to 9166",
"ev": "HD 00018-67787; books 07-01 manual 60701-bc50ea5f8ba5 (32.43)",
"prop": "Cost Recapture",
"acct": "1030",
"trade": "881 Newport"
},
{
"n": 6,
"kind": "refund",
"date": "2026-06-16",
"cents": 4805,
"payee": "Home Depot",
"what": "star-drive screws 44.03 + 2x4 stud 4.02 returned - refund to 9166",
"ev": "HD 00018-40289; books 06-16 Screws 60616-1633cd970208 + 4.03 row",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "Supplies"
},
{
"n": 7,
"kind": "refund",
"date": "2026-06-18",
"cents": 2715,
"payee": "Home Depot",
"what": "dryer vent tape 8.10 + flat steel bar 19.05 returned - refund to 9166",
"ev": "HD 00017-41602; books 06-18 + 06-16 rows",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "Supplies"
},
{
"n": 8,
"kind": "refund",
"date": "2026-06-21",
"cents": 3762,
"payee": "Home Depot",
"what": "spray paint 7.56 + felt pads 5.75 + nails 6.04 + threaded rod (6) 14.29 + wood glue 3.98 returned - refund to 9166",
"ev": "HD 00018-45783; books 06-16 rows",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "Supplies"
},
{
"n": 9,
"kind": "refund",
"date": "2026-06-29",
"cents": 635,
"payee": "Home Depot",
"what": "roller returned - refund to 9166",
"ev": "HD 00015-82113; books 06-28 row",
"prop": "136 Bowling Green",
"acct": "1030",
"trade": "Paint & Flooring"
},
{
"n": 10,
"kind": "double",
"date": "2026-06-16",
"cents": 2582,
"payee": "Home Depot",
"what": "felt pads 5.75 + roofing nails 6.04 + clear sealant 14.03 recorded twice (manual-20260616-6da6a7856167 from his phone picture holds each once, as Home Depot receipt 00002-05021 does)",
"ev": "HD receipt 00002-05021 has each once",
"void": "receipt-20260616-ea4cf03e223f-54b4",
"prop": "104 Ashburne"
},
{
"n": 11,
"kind": "refund",
"date": "2026-04-03",
"cents": 15694,
"payee": "Lowe's",
"what": "Montara handleset returned - refund to 9166",
"ev": "Lowe's #318680935; books 04-03 Front Door Lock Set 156.94 migration",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "House Hardware"
},
{
"n": 12,
"kind": "refund",
"date": "2026-02-13",
"cents": 6488,
"payee": "Lowe's",
"what": "3 x Ultracolor FA grout returned - refund to 9166",
"ev": "Lowe's #921508321; books 02-10 receipt UCPFA 64.88",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "Paint & Flooring"
},
{
"n": 13,
"kind": "refund",
"date": "2026-04-01",
"cents": 2055,
"payee": "Lowe's",
"what": "100-ft tape returned - refund to 9166",
"ev": "Lowe's #483601614; books 04-01 \"Door Knobs\" 20.55 migration (mislabeled)",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "House Hardware"
},
{
"n": 14,
"kind": "refund",
"date": "2026-03-05",
"cents": 971,
"payee": "Lowe's",
"what": "lattice + shoe moulding returned - refund to 9166",
"ev": "Lowe's #273473896; books 03-05 Moldings 32.41",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "Paint & Flooring"
},
{
"n": 17,
"kind": "purchase",
"date": "2026-01-09",
"cents": 14543,
"payee": "Lowe's",
"what": "Nest thermostat 129.99 + 2 waters 4.36 + tax (the deadbolt on the same receipt was returned) - paid Discover 3746",
"ev": "Lowe's #822939470 PO 104 ash",
"prop": "104 Ashburne",
"acct": "1040",
"trade": "HVAC"
},
{
"n": 22,
"kind": "purchase",
"date": "2026-04-14",
"cents": 25971,
"payee": "Lowe's",
"what": "3 x hevea butcher block countertop 209.94 + toe kick 29.98 + tax - which house?",
"ev": "Lowe's #900457703 PO NA; Chase 04-14",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "Countertops & Backsplash"
},
{
"n": 23,
"kind": "purchase",
"date": "2026-06-28",
"cents": 2920,
"payee": "Lowe's",
"what": "the rest of receipt 187.64 (PO 136 typed at the register) - the books read 158.44 of it (8 items on receipt)",
"ev": "Lowe's #753771372 PO 136",
"prop": "136 Bowling Green",
"acct": "1030",
"trade": ""
},
{
"n": 24,
"kind": "purchase",
"date": "2026-02-12",
"cents": 7360,
"payee": "Amazon",
"what": "Gautye steam cleaner - shipped to 104 Ashburne; not returned; never in the books",
"ev": "Amazon order 111-8463325-5042644 (ship-to 104 Ashburne Glen); paid before the Chase checking file starts",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "Cleaning"
},
{
"n": 25,
"kind": "purchase",
"date": "2026-04-01",
"cents": 11906,
"payee": "Amazon",
"what": "Petoasis heavy-duty dog door - shipped to 104 Ashburne; never in the books",
"ev": "Amazon order 04-01 ship-to Ashburne; Chase checking 04-03 119.06",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "House Hardware"
},
{
"n": 26,
"kind": "purchase",
"date": "2026-04-04",
"cents": 10648,
"payee": "Amazon",
"what": "Amazon Basics keypad deadbolt + lava rock granules + shelf liner - shipped to 104 Ashburne; never in the books",
"ev": "Amazon order 04-04 ship-to Ashburne; Chase checking 04-06 106.48",
"prop": "104 Ashburne",
"acct": "1030",
"trade": "House Hardware"
},
{
"n": 27,
"kind": "purchase",
"date": "2026-04-06",
"cents": 19376,
"payee": "Amazon",
"what": "what the 04-06 receipt read missed: attic ladder shipping 159.00 + its tax (order 324.75 vs 152.63 in the books) and vanity lights 21.64 (order 243.49 vs 221.85) - the four orders cost 651.33 and the books hold 457.57",
"ev": "books receipt-20260406-9d57938da2d6-2357; Amazon orders 114-8424877-9936234 (ladder 141.00 + shipping 159.00 + tax 24.75 = 324.75; Chase debit 9166) and 114-5974986-1917854; Chase checking 04-07/04-08",
"prop": "104 Ashburne",
"acct": "",
"trade": "Split",
"split": [
[
"1030",
"House Hardware",
17212,
"attic ladder shipping 159.00 + tax the 04-06 receipt read missed"
],
[
"1040",
"Lighting & Electrical",
2164,
"vanity lights, the part of order 114-5974986-1917854 the receipt read missed"
]
]
},
{
"n": 28,
"kind": "purchase",
"date": "2026-01-05",
"cents": 1816,
"payee": "Amazon",
"what": "TROND USB-C power strip - Paul 11-01: office supplies",
"ev": "Amazon order 01-05 ship-to 145 Denali; paid before the Chase checking file starts",
"prop": "OVERHEAD",
"acct": "6500",
"trade": ""
},
{
"n": 29,
"kind": "purchase",
"date": "2026-02-16",
"cents": 11993,
"payee": "Amazon",
"what": "Apple AirTag 4-pack + 3 leather key holders - Paul 11-01: for tracking business items",
"ev": "Amazon order 111-0991804-7782651 ship-to 145 Denali",
"prop": "OVERHEAD",
"acct": "6510",
"trade": ""
},
{
"n": 30,
"kind": "void",
"date": "2026-02-22",
"cents": 3198,
"payee": "Amazon",
"what": "taper candles + match holders - Paul 11-01: personal (shipped to Portland) - void the books row",
"ev": "books receipt-20260222-f57a63e0c87a; Amazon order 111-6952010-3909058",
"void": "receipt-20260222-f57a63e0c87a",
"prop": "104 Ashburne"
},
{
"n": 31,
"kind": "purchase",
"date": "2026-07-05",
"cents": 7137,
"payee": "Amazon",
"what": "CAR PASS leather seat covers 60.76 + windshield chip repair kit 10.61 - Paul 11-01: business truck expense (D-009: actual costs on the truck; overhead; Paul's)",
"ev": "two Amazon orders 07-05 ship-to 145 Denali; Chase checking 07-06 60.76 and 10.61",
"prop": "OVERHEAD",
"acct": "6600",
"trade": ""
},
{
"n": 32,
"kind": "purchase",
"date": "2026-08-07",
"cents": 1061,
"payee": "Amazon",
"what": "solar floating pool lights 2-pack 9.99 + its share of tax - Paul 11-01: Ashburne staging",
"ev": "Amazon order 111-4955480-4533807 (101.96 = cameras 91.35 already in the books at Bowling Green + these 10.61); Chase debit 9166 08-10",
"prop": "104 Ashburne",
"acct": "1330",
"trade": "Marketing"
},
{
"n": 33,
"kind": "purchase",
"date": "2026-04-06",
"cents": 315000,
"payee": "Juan Garcia",
"what": "cash payment to Juanito for Ashburne - Paul 11-01; no receipt (checked: no Salvador Campos invoice or payment comes to 3150 - his are 3880 / 1900 / 2910 by check / 380)",
"ev": "Chase checking 04-06 WITHDRAWAL 3150.00 at the counter; Paul's word 11-01",
"prop": "104 Ashburne",
"acct": "1020",
"trade": "Paint & Flooring"
},
{
"n": 34,
"kind": "purchase",
"date": "2026-06-18",
"cents": 10000,
"payee": "Armandre Vega",
"what": "install the bath fan inside - Paul 11-01 (the 550 of the same day was installing the vent on the roof; it stays as is)",
"ev": "Chase checking 06-18 Zelle payment to Armandre Vega 100.00",
"prop": "104 Ashburne",
"acct": "1020",
"trade": "Small Baths"
},
{
"n": 35,
"kind": "purchase",
"date": "2026-04-10",
"cents": 1000,
"payee": "Midjourney",
"what": "Midjourney 04-10 - the month before the 05-10 one Paul called business (the first match paired this bank line with an unrelated 02-25 row)",
"ev": "Chase checking 04-10 MIDJOURNEY INC. 10.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 36,
"kind": "redate",
"date": "2026-04-07",
"cents": 20000,
"payee": "CoreLogic Inc",
"what": "the 06-30 manual row 'payment of an earlier monthly bill (no receipt)' is the 04-07 bank payment - the only CoreLogic bank line with no books row; void manual-20260630-8499fb58e83b and post the same at 04-07",
"ev": "Chase checking 04-07 CORELOGIC PAYMENTS 200.00",
"void": "manual-20260630-8499fb58e83b",
"newDate": "2026-04-07",
"prop": "OVERHEAD",
"acct": "6300",
"trade": ""
},
{
"n": 37,
"kind": "purchase",
"date": "2026-08-14",
"cents": 1000,
"payee": "JPMorgan Chase Bank",
"what": "official check fee for the 4858.42 cashier's check that put Paul's working money into Citizens on 08-13 (already in the books)",
"ev": "Chase checking 08-14 OFFICIAL CHECKS CHARGE 10.00",
"prop": "OVERHEAD",
"acct": "6910",
"trade": ""
},
{
"n": 38,
"kind": "purchase",
"date": "2026-08-28",
"cents": 300,
"payee": "JPMorgan Chase Bank",
"what": "counter checks fee - checks 1171-1173 (Oregon filing fee and Julio) came off these",
"ev": "Chase checking 08-28 COUNTER CHECK 3.00; same shape as manual-20260327-44a (counter checks 5896-5901)",
"prop": "OVERHEAD",
"acct": "6910",
"trade": ""
},
{
"n": 39,
"kind": "double",
"date": "2026-10-14",
"cents": 11978,
"payee": "Uber",
"what": "the Oct 14 Denali-to-DFW ride is in the books twice - 143.74 (with the 23.96 tip) and 119.78 (without); void receipt-20261014-ed9eb6635b4b",
"ev": "Uber trip list: one ride Oct 14 12:40 PM to DFW 119.78; Chase 10-14 119.78 + 10-15 tip 23.96 = 143.74 (receipt-20261014-db8322075715 keeps)",
"void": "receipt-20261014-ed9eb6635b4b",
"prop": "OVERHEAD",
"acct": "6700",
"trade": ""
},
{
"n": 40,
"kind": "void",
"date": "2026-05-23",
"cents": 3398,
"payee": "Uber",
"what": "ride to Restaurant St Jack in Portland - Paul 11-01: in Portland only airport rides are Recast; void migration-20260523-61139a84b3da",
"ev": "Uber trip list May 23 5:21 PM Restaurant St Jack 33.98",
"void": "migration-20260523-61139a84b3da",
"prop": "OVERHEAD",
"acct": "6700",
"trade": ""
},
{
"n": 41,
"kind": "purchase",
"date": "2026-06-15",
"cents": 4499,
"payee": "Uber",
"what": "second ride home to PDX (Jun 15 3:56 AM) - the books hold the Jun 14 one (44.99) and its 7.20 cancel; Jun 14's American flight was missed and refunded and he flew Southwest Jun 15",
"ev": "Uber trip list Jun 14 and Jun 15 PDX 44.99 each; Chase 06-15 two lines of 44.99",
"prop": "OVERHEAD",
"acct": "6700",
"trade": ""
},
{
"n": 42,
"kind": "refund",
"date": "2026-04-02",
"cents": 9891,
"payee": "Wayfair",
"what": "Hutchcraft teardrop pendant returned (111.49 less Wayfair's 12.58 return fee; the fee stays a cost) - refund to Chase checking",
"ev": "Wayfair order 4418179807; books 03-09 receipt row 111.49; Chase checking 04-03 WF *WAYFAIR4418179807 -98.91",
"prop": "104 Ashburne",
"acct": "1040",
"trade": "Lighting & Electrical"
},
{
"n": 43,
"kind": "purchase",
"date": "2026-04-15",
"cents": 21175,
"payee": "City of Ovilla",
"what": "water/sewer bill - Paul 11-01 yes",
"ev": "Chase checking I3P*CITY OF OVILLA",
"prop": "104 Ashburne",
"acct": "1120",
"trade": "Utilities"
},
{
"n": 44,
"kind": "purchase",
"date": "2026-05-15",
"cents": 28209,
"payee": "City of Ovilla",
"what": "water/sewer bill - Paul 11-01 yes",
"ev": "Chase checking I3P*CITY OF OVILLA",
"prop": "104 Ashburne",
"acct": "1120",
"trade": "Utilities"
},
{
"n": 45,
"kind": "purchase",
"date": "2026-06-15",
"cents": 18848,
"payee": "City of Ovilla",
"what": "water/sewer bill - Paul 11-01 yes",
"ev": "Chase checking I3P*CITY OF OVILLA",
"prop": "104 Ashburne",
"acct": "1120",
"trade": "Utilities"
},
{
"n": 46,
"kind": "purchase",
"date": "2026-07-15",
"cents": 17685,
"payee": "City of Ovilla",
"what": "water/sewer bill - Paul 11-01 yes",
"ev": "Chase checking I3P*CITY OF OVILLA",
"prop": "104 Ashburne",
"acct": "1120",
"trade": "Utilities"
},
{
"n": 47,
"kind": "purchase",
"date": "2026-09-15",
"cents": 21757,
"payee": "City of Ovilla",
"what": "water/sewer bill - Paul 11-01 yes",
"ev": "Chase checking I3P*CITY OF OVILLA",
"prop": "104 Ashburne",
"acct": "1120",
"trade": "Utilities"
},
{
"n": 48,
"kind": "purchase",
"date": "2026-05-15",
"cents": 31320,
"payee": "Apify",
"what": "Apify subscription - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 49,
"kind": "purchase",
"date": "2026-09-20",
"cents": 33100,
"payee": "Squarespace",
"what": "website renewal (card 6926) - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6410",
"trade": ""
},
{
"n": 50,
"kind": "purchase",
"date": "2026-07-06",
"cents": 2319,
"payee": "GoDaddy",
"what": "GoDaddy (card 6926) - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6410",
"trade": ""
},
{
"n": 51,
"kind": "purchase",
"date": "2026-10-04",
"cents": 5040,
"payee": "Squarespace",
"what": "Google Workspace October - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 52,
"kind": "purchase",
"date": "2026-09-08",
"cents": 1400,
"payee": "Matterport",
"what": "Matterport - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 53,
"kind": "purchase",
"date": "2026-10-08",
"cents": 1400,
"payee": "Matterport",
"what": "Matterport - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 54,
"kind": "purchase",
"date": "2026-07-13",
"cents": 2165,
"payee": "TexasFile",
"what": "TexasFile records - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6300",
"trade": ""
},
{
"n": 55,
"kind": "purchase",
"date": "2026-08-01",
"cents": 5000,
"payee": "Textgrid",
"what": "Textgrid - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 56,
"kind": "purchase",
"date": "2026-06-04",
"cents": 1000,
"payee": "Vapi",
"what": "Vapi - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 57,
"kind": "purchase",
"date": "2026-08-12",
"cents": 2705,
"payee": "Office Depot",
"what": "Office Depot - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6500",
"trade": ""
},
{
"n": 58,
"kind": "purchase",
"date": "2026-08-12",
"cents": 5004,
"payee": "Office Depot",
"what": "Office Depot - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6500",
"trade": ""
},
{
"n": 59,
"kind": "purchase",
"date": "2026-08-14",
"cents": 228,
"payee": "FedEx Office",
"what": "FedEx Office Waxahachie - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6500",
"trade": ""
},
{
"n": 60,
"kind": "purchase",
"date": "2026-05-10",
"cents": 1000,
"payee": "Midjourney",
"what": "Midjourney - Paul 11-01 business - sure software/office row, no objection",
"ev": "bank line same date/amount",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 61,
"kind": "purchase",
"date": "2026-07-14",
"cents": 1860,
"payee": "Community Archives",
"what": "card fee on the 465.00 HOA letter (D-094 shape)",
"ev": "bank line",
"prop": "Cost Recapture",
"acct": "1310",
"trade": "1616 Granite"
},
{
"n": 62,
"kind": "purchase",
"date": "2026-08-03",
"cents": 1940,
"payee": "Community Archives",
"what": "card fee on the 485.00 HOA letter (D-094 shape)",
"ev": "bank line",
"prop": "Cost Recapture",
"acct": "1010",
"trade": "280 Sparkling"
},
{
"n": 63,
"kind": "purchase",
"date": "2026-01-10",
"cents": 2000,
"payee": "OpenAI",
"what": "ChatGPT monthly - Paul 11-01 business",
"ev": "Chase card 6926 OPENAI *CHATGPT 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 64,
"kind": "purchase",
"date": "2026-02-10",
"cents": 2000,
"payee": "OpenAI",
"what": "ChatGPT monthly - Paul 11-01 business",
"ev": "Chase card 6926 OPENAI *CHATGPT 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 65,
"kind": "purchase",
"date": "2026-03-10",
"cents": 2000,
"payee": "OpenAI",
"what": "ChatGPT monthly - Paul 11-01 business",
"ev": "Chase card 6926 OPENAI *CHATGPT 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 66,
"kind": "purchase",
"date": "2026-04-10",
"cents": 2000,
"payee": "OpenAI",
"what": "ChatGPT monthly - Paul 11-01 business",
"ev": "Chase card 6926 OPENAI *CHATGPT 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 67,
"kind": "purchase",
"date": "2026-05-15",
"cents": 2000,
"payee": "OpenAI",
"what": "ChatGPT monthly - Paul 11-01 business",
"ev": "Chase checking OPENAI *CHATGPT 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 68,
"kind": "purchase",
"date": "2026-06-10",
"cents": 2000,
"payee": "OpenAI",
"what": "ChatGPT monthly - Paul 11-01 business",
"ev": "Chase checking OPENAI *CHATGPT 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 69,
"kind": "purchase",
"date": "2026-07-10",
"cents": 2000,
"payee": "OpenAI",
"what": "ChatGPT monthly - Paul 11-01 business",
"ev": "Chase checking OPENAI *CHATGPT 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 70,
"kind": "purchase",
"date": "2026-08-10",
"cents": 2000,
"payee": "OpenAI",
"what": "ChatGPT monthly - Paul 11-01 business",
"ev": "Chase checking OPENAI *CHATGPT 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 71,
"kind": "purchase",
"date": "2026-09-10",
"cents": 2000,
"payee": "OpenAI",
"what": "ChatGPT monthly - Paul 11-01 business",
"ev": "Chase checking OPENAI *CHATGPT 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 72,
"kind": "purchase",
"date": "2026-10-10",
"cents": 2000,
"payee": "OpenAI",
"what": "ChatGPT monthly - Paul 11-01 business",
"ev": "Chase checking OPENAI *CHATGPT 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 73,
"kind": "purchase",
"date": "2026-04-10",
"cents": 2000,
"payee": "The Greenery",
"what": "WP*THE GREENERY monthly - Paul 11-01: general business, not a house",
"ev": "Chase checking WP*THE GREENERY 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 74,
"kind": "purchase",
"date": "2026-05-10",
"cents": 2000,
"payee": "The Greenery",
"what": "WP*THE GREENERY monthly - Paul 11-01: general business, not a house",
"ev": "Chase checking WP*THE GREENERY 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 75,
"kind": "purchase",
"date": "2026-06-10",
"cents": 2000,
"payee": "The Greenery",
"what": "WP*THE GREENERY monthly - Paul 11-01: general business, not a house",
"ev": "Chase checking WP*THE GREENERY 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 76,
"kind": "purchase",
"date": "2026-07-10",
"cents": 2000,
"payee": "The Greenery",
"what": "WP*THE GREENERY monthly - Paul 11-01: general business, not a house",
"ev": "Chase checking WP*THE GREENERY 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 77,
"kind": "purchase",
"date": "2026-08-10",
"cents": 2000,
"payee": "The Greenery",
"what": "WP*THE GREENERY monthly - Paul 11-01: general business, not a house",
"ev": "Chase checking WP*THE GREENERY 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 78,
"kind": "purchase",
"date": "2026-09-10",
"cents": 2000,
"payee": "The Greenery",
"what": "WP*THE GREENERY monthly - Paul 11-01: general business, not a house",
"ev": "Chase checking WP*THE GREENERY 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
},
{
"n": 79,
"kind": "purchase",
"date": "2026-10-10",
"cents": 2000,
"payee": "The Greenery",
"what": "WP*THE GREENERY monthly - Paul 11-01: general business, not a house",
"ev": "Chase checking WP*THE GREENERY 20.00",
"prop": "OVERHEAD",
"acct": "6400",
"trade": ""
}
];
