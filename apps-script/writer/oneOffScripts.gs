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
 * importMolalla (2026-10-04, D-079: 1014 S View brought in as one closed house; run 19:07 CDT) is in commit bbcd0be.
 * importMolallaLines (2026-10-04, D-079: the same house line by line from his sheet, its frozen house tab and closing
 *   tab; run 19:28 CDT) is in commit 542847e.
 *
 * ASCII ONLY - same paste-into-the-editor constraint as Code.gs.
 ****************************************************************/

// 2026-10-04 (D-080) - the house tabs and the closing tabs added up Journal rows 2 to 5,000, and the Journal is
// past row 3,500. This moves every tab onto the range that follows the Journal (journalRange_): a formula on any
// other tab that names a fixed stretch of Journal rows is rewritten where it stands (a closing tab is never
// rebuilt, and must read the same after), then every house not sold is rebuilt, timed, and the top of its tab
// compared with how it read before. How long a tab's sums take to work themselves out is measured before and
// after (the as-of date is set back a day and forward again, which makes every one of them add up afresh).
// A sold house's tab is values and is not touched. Stops before the six-minute limit and picks up where it
// left off; safe to run again.
// STATUS: NOT YET RUN
function followJournalOnTabs() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var out = [], t0 = Date.now();
  var secs = function (t) { return ((Date.now() - t) / 1000).toFixed(1) + ' s'; };
  ensureJournalHelpers_(ss);
  var stillFixed = /Journal!\$[A-Z]+\$\d/;   // a Journal range with a typed row number
  var fixedFormulas = function (sh) {
    if (sh.getLastRow() < 1) return [];
    var hits = [];
    sh.getDataRange().getFormulas().forEach(function (row, r) { row.forEach(function (text, c) { if (stillFixed.test(text)) hits.push([r + 1, c + 1, text]); }); });
    return hits;
  };

  var pSheet = ss.getSheetByName('Properties'), pc = headerIndex_(pSheet);
  var held = (pSheet.getLastRow() < 2 ? [] : pSheet.getRange(2, 1, pSheet.getLastRow() - 1, pSheet.getLastColumn()).getValues())
    .filter(function (r) { return r[pc['name'] - 1] && String(r[pc['status'] - 1]).toLowerCase() !== 'sold'; })
    .map(function (r) { return String(r[pc['name'] - 1]); });

  // 1. every tab that is not a held house: rewritten in place, and each rewritten cell must show what it showed
  ss.getSheets().forEach(function (sh) {
    var tab = sh.getName();
    if (held.indexOf(tab) !== -1 || tab === HELPER_SHEET || tab === 'Journal') return;
    var cells = fixedFormulas(sh);
    if (!cells.length) return;
    var before = cells.map(function (x) { return sh.getRange(x[0], x[1]).getDisplayValue(); });
    cells.forEach(function (x) {
      sh.getRange(x[0], x[1]).setFormula(x[2]
        .replace(/ROWS\(Journal!\$[A-Z]+\$2:\$[A-Z]+\$\d+\)\+1/g, JOURNAL_LAST)
        .replace(/Journal!\$([A-Z]+)\$2:\$\1\$\d+/g, function (m, col) { return journalRange_(col); }));
    });
    SpreadsheetApp.flush();
    var changed = cells.filter(function (x, i) { return sh.getRange(x[0], x[1]).getDisplayValue() !== before[i]; });
    out.push('"' + tab + '": ' + cells.length + ' formula(s) rewritten in place - ' +
      (changed.length ? 'CHECK, ' + changed.length + ' read differently, first at row ' + changed[0][0] : 'each reads as before (' + before.join(' | ').slice(0, 80) + ')'));
  });

  // 2. every house not sold: rebuilt, timed, the top of the tab compared
  var top = function (sh) { return sh.getRange(1, 1, Math.min(120, sh.getMaxRows()), Math.min(9, sh.getMaxColumns())).getDisplayValues(); };
  var waiting = [];
  // every Journal sum on a house tab reads the as-of date (row 1): changing it and changing it back makes them all add up again
  var recalc = function (sh) {
    var c = sh.getRange(1, 3);
    if (c.getFormula() !== '=TODAY()') return null;
    var t = Date.now();
    ['=TODAY()-1', '=TODAY()'].forEach(function (f) { c.setFormula(f); SpreadsheetApp.flush(); sh.getRange(4, 3, 30, 1).getValues(); });
    return ((Date.now() - t) / 2000).toFixed(2) + ' s';
  };
  held.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { out.push('"' + name + '": no tab, left alone'); return; }
    if (!fixedFormulas(sh).length) { out.push('"' + name + '": already follows the Journal'); return; }
    if (Date.now() - t0 > 270000) { waiting.push(name); return; }
    var slow = recalc(sh), before = top(sh), t = Date.now();
    setupPropertyTab(name);
    SpreadsheetApp.flush();
    sh = ss.getSheetByName(name);
    var after = top(sh), took = secs(t), fast = recalc(sh), diffs = [];
    before.forEach(function (row, r) { row.forEach(function (v, c) { if (v !== ((after[r] || [])[c] || '')) diffs.push('row ' + (r + 1) + ' col ' + (c + 1) + ': ' + v + ' -> ' + (after[r] || [])[c]); }); });
    out.push('"' + name + '": rebuilt in ' + took + (fast ? ', its sums add up in ' + fast + ' (' + slow + ' before)' : '') + ' - ' + (diffs.length ? 'CHECK, ' + diffs.length + ' cell(s) read differently: ' + diffs.slice(0, 5).join('; ') : 'the top of the tab reads as before'));
  });

  // 3. nothing anywhere may still name a fixed stretch of Journal rows
  var left = [];
  ss.getSheets().forEach(function (sh) { if (sh.getName() !== 'Journal') { var n = fixedFormulas(sh).length; if (n) left.push(sh.getName() + ' (' + n + ')'); } });
  var helper = ss.getSheetByName(HELPER_SHEET), journalLast = ss.getSheetByName('Journal').getLastRow();
  out.push('', 'the Journal ends on row ' + journalLast + '; the tabs read down to row ' + helper.getRange(1, 2).getValue() +
    (Number(helper.getRange(1, 2).getValue()) === journalLast ? '  OK' : '  CHECK'),
    'formulas still stopping at a fixed Journal row: ' + (left.length ? left.join(', ') : 'none  OK'),
    waiting.length ? 'OUT OF TIME - RUN AGAIN for: ' + waiting.join(', ') : 'every house done', 'took ' + secs(t0));
  out.unshift('followJournalOnTabs - ' + new Date());
  console.log(out.join('\n'));
  return out;
}
