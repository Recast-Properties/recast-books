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
 *
 * ASCII ONLY - same paste-into-the-editor constraint as Code.gs.
 ****************************************************************/

// 2026-10-04 Paul ("yes restart them") - the four receipts whose read was refused by the API between the 10-02
// and 10-04 deploys (one nullable field too many, CHANGELOG 10-04) are read again, as the Inbox's Reprocess
// button does: each lands in the Inbox for Paul, nothing posts or is dismissed on its own. The 98.36 Uber
// receipt is read before its "charge summary" copy, so the copy is seen as one.
// STATUS: NOT YET RUN
function rereadFailedReads20261004() {
  var by = Session.getActiveUser().getEmail() || 'editor';
  var out = [];
  var reread = function (docId) {
    try {
      siteFetchJson_('/api/inbox', 'post', { action: 'reprocess', docId: docId, by: by });
      out.push('re-reading  ' + docId);
    } catch (err) {
      out.push('FAILED  ' + docId + '  ' + ((err && err.code) || '') + ' ' + String((err && err.message) || err));
    }
    Utilities.sleep(2000);   // ponytail: a gentle burst - the reads themselves run in the background on the site
  };
  var receipt = 'gm-1a105536170ab7fc';
  ['gm-1a101d67757990ce', 'gm-1a101e27a81e0ab2', receipt].forEach(reread);
  var status = 'processing';
  for (var i = 0; i < 24 && status === 'processing'; i++) {   // up to 4 minutes; a read takes about one
    Utilities.sleep(10000);
    status = ((siteFetchJson_('/api/inbox?docId=' + encodeURIComponent(receipt)).envelopes || [])[0] || {}).status || '';
  }
  out.push('the 98.36 receipt is now: ' + status);
  reread('gm-1a10326a7f72074c');
  console.log(out.join('\n'));
  return out;
}
