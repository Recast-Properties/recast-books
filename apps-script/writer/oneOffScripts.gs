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
 *
 * ASCII ONLY - same paste-into-the-editor constraint as Code.gs.
 ****************************************************************/
