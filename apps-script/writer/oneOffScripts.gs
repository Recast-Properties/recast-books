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

// 2026-10-04 Paul: "ok i found where the loss is. it was with 1014 s view drive, molalla or. the house i bought
// and rehabbed at the end of 2025, but sold in 2026 ... import it into the new recast books?" (D-079) - his own
// deal (a hard money loan, no Dennis), sold 2026-01-12 at a loss and never in these books. Brought in as one
// closed house from the totals of his sheet "Recast 2025": a Properties row (sold), three entries dated at the
// sale (the costs, the sale, the release), and his own tab copied in as the record. Safe to run again.
// STATUS: NOT YET RUN
function importMolalla() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var out = [], M = MOLALLA;

  if (!propertyRow_(ss, M.name).name) {
    var added = addProperty({ name: M.name, address: M.address, status: 'sold', purchase_price: '350000', contract_price: '410000',
      dennis_share_pct: '0', settlement_date: M.date, dennis_funded: 'false' }, true);
    if (!added.ok) throw new Error('the Properties row was not added: ' + added.message);
    out.push('Properties row added (sold, no Dennis)');
  } else out.push('Properties row already there');

  // a sold house takes no entries from the menu or the mail; this one-off names it itself
  var ctx = buildCtx_(ss);
  ctx.properties.add(M.name);
  var entries = molallaIntents_().map(function (i) { return buildEntry(i, ctx); });
  var read = function () { var j = readTabData_(ss, 'Journal', { all: true }); return loadJournal(j.headers, j.rows); };
  var before = read(), have = {};
  before.forEach(function (l) { have[l.txn_id] = true; });
  var fresh = entries.filter(function (e) { return !have[e.txn_id]; });
  if (fresh.length && fresh.length !== entries.length) throw new Error('only some of the three entries are in the Journal - tell Claude');
  if (fresh.length) {
    var res = postBatchEntries_(fresh, props, true);
    out.push('posted 3 entries (Journal rows ' + res.rows.join('-') + '): ' + fresh.map(function (e) { return e.txn_id; }).join(', '));
  } else out.push('the three entries are already in the Journal');

  if (!ss.getSheetByName(M.name)) {
    var tab = SpreadsheetApp.openById(M.sheetId).getSheetByName(M.sheetTab).copyTo(ss).setName(M.name);
    try { ss.setActiveSheet(tab); ss.moveActiveSheet(ss.getSheetByName('280 Sparkling').getIndex() + 1); } catch (err) { out.push('tab left at the end: ' + err); }
    out.push('his tab copied in as "' + M.name + '"');
  } else out.push('the tab "' + M.name + '" is already there');

  try { setupTotals(); out.push('Totals rebuilt'); } catch (err) { out.push('Totals FAILED: ' + err); }
  refreshPnl_(ss);   // the P&L tab, then the Taxes tab
  warmCache_();

  var after = read(), mine = after.filter(function (l) { return l.property === M.name; });
  var bal = function (test) { return mine.filter(test).reduce(function (t, l) { return t + l.debit - l.credit; }, 0); };
  var pl = profitAndLoss(after, { from: '2026-01-01', to: '2026-12-31' });
  var house = pl.by_property.filter(function (p) { return p.property === M.name; })[0] || {};
  var dr = after.reduce(function (t, l) { return t + l.debit; }, 0), cr = after.reduce(function (t, l) { return t + l.credit; }, 0);
  var ok = function (v) { return v ? '  OK' : '  CHECK'; };
  out.push('', 'READ BACK:',
    '  sold for: ' + fromCents(house.income || 0) + ok(house.income === 41000000),
    '  all-in cost: ' + fromCents(house.cogs || 0) + ok(house.cogs === 44457910),
    '  the house on the P&L: ' + fromCents(house.gross || 0) + ok(house.gross === -3457910),
    '  left in the house accounts (must be 0.00): ' + fromCents(bal(function (l) { return /^1[0-3]\d\d$/.test(String(l.account)); })) + ok(bal(function (l) { return /^1[0-3]\d\d$/.test(String(l.account)); }) === 0),
    '  put in by Paul, net (his loss): ' + fromCents(-bal(function (l) { return String(l.account) === '9000'; })) + ok(-bal(function (l) { return String(l.account) === '9000'; }) === 3457910),
    '  Recast earned this year: ' + fromCents(profitAndLoss(before, { from: '2026-01-01', to: '2026-12-31' }).net_income) + ' -> ' + fromCents(pl.net_income),
    '  the Journal balances: ' + (dr === cr ? 'yes' : 'NO - debits ' + fromCents(dr) + ', credits ' + fromCents(cr)));
  out.unshift('importMolalla - ' + new Date());
  console.log(out.join('\n'));
  return out;
}

var MOLALLA = { name: '1014 S View', address: '1014 S View Drive, Molalla OR 97038', date: '2026-01-12',
  sheetId: '1d1TVK7c53cIguj2nSvc2Zknr99TiLUAJxB7YwMj37g8', sheetTab: '1014 S View',
  url: 'https://docs.google.com/spreadsheets/d/1d1TVK7c53cIguj2nSvc2Zknr99TiLUAJxB7YwMj37g8/edit?gid=1577976646' };

/** The three entries, in cents, from the totals of Paul's own sheet (its four subtotals: purchase and closing
 *  383,802.36, rehab 26,879.89, interest 10,174.58, sale closing costs 23,722.27; sold for 410,000.00). His own
 *  money and the lender's went in and the sale money came back outside Recast's bank accounts, so the other side
 *  of both is 9000 (put in by Paul): 420,856.83 in, 386,277.73 back, 34,579.10 left in - the loss. */
function molallaIntents_() {
  var M = MOLALLA, by = 'Paul, 2026-10-04', sheet = 'his sheet "Recast 2025", tab 1014 S View';
  var L = function (account, cents, description, extra) {
    var l = { account: account, debit: cents > 0 ? cents : 0, credit: cents < 0 ? -cents : 0, property: M.name, description: description };
    Object.keys(extra || {}).forEach(function (k) { l[k] = extra[k]; });
    return l;
  };
  var costs = [
    L('1000', 35000000, 'Purchase price'),
    L('1010', 1000000, 'Assignment fee to Westfall Offers (7/24/2025)', { payee: 'Westfall Offers' }),
    L('1010', 564440, 'Title, escrow and recording at the purchase, with government fees 366.00 and HOA fees 190.40'),
    L('1100', 275890, 'County taxes paid at the purchase'),
    L('1210', 1539906, 'Loan costs at the purchase: points 4,554.53, origination 4,554.53, lender and broker fees 4,830.00, prepaid interest 1,260.00, bid consultation 200.00'),
    L('1030', 1007183, 'Paint and flooring, with the flooring install', { trade: 'Paint & Flooring' }),
    L('1060', 121897, 'Dumpster and dump fees', { trade: 'Trash' }),
    L('1030', 29519, 'Lighting and electrical', { trade: 'Lighting & Electrical' }),
    L('1030', 181213, 'Bathrooms', { trade: 'Bathrooms' }),
    L('1020', 190994, 'Landscaping', { trade: 'Landscaping' }),
    L('1030', 108070, 'Kitchen', { trade: 'Kitchen' }),
    L('1040', 397382, 'Appliances', { trade: 'Appliances' }),
    L('1030', 64013, 'House hardware', { trade: 'House Hardware' }),
    L('1110', 206851, 'Insurance (OCI)', { trade: 'Insurance' }),
    L('1120', 123679, 'Utilities', { trade: 'Utilities' }),
    L('1020', 191498, 'Cleaning', { trade: 'Cleaning' }),
    L('1030', 65690, 'Supplies', { trade: 'Supplies' }),
    L('1210', 1017458, 'Loan interest paid to the lender, five payments 9/30/2025 to 1/12/2026')
  ];
  var sale = [
    L('1300', 2050000, 'Agent commissions'),
    L('1310', 322227, 'Seller closing costs: title insurance 1,170.00, settlement fee 1,055.00, release 200.00, government fee 35.00, home warranty 499.00, HOA dues 161.60, City of Molalla utilities 101.67')
  ];
  var sum = function (lines) { return lines.reduce(function (t, l) { return t + l.debit - l.credit; }, 0); };
  var released = {};
  costs.concat(sale).forEach(function (l) { released[l.account] = (released[l.account] || 0) + l.debit; });
  var base = { type: 'journal', date: M.date, posted_by: 'importMolalla', doc_url: M.url };
  var intent = function (source, memo, lines) { var i = { source: source, memo: memo, lines: lines }; Object.keys(base).forEach(function (k) { i[k] = base[k]; }); return i; };
  return [
    intent('manual', M.name + ': what the house cost, bought and rehabbed in 2025 - the totals of ' + sheet + ' (' + by + '). His own money and a hard money loan, no Dennis',
      costs.concat([L('9000', -sum(costs), 'Paid with Paul\'s own money and the lender\'s loan', { payee: 'Paul Bjork' })])),
    intent('sale', M.name + ' sale ' + M.date + ': sold for 410,000.00 - ' + sheet,
      sale.concat([L('9000', 41000000 - sum(sale), 'Sale money after the closing costs - it paid off the lender and the rest went to Paul', { payee: 'Paul Bjork' }),
        L('4000', -41000000, 'Sold 1/12/2026')])),
    intent('sale', M.name + ' sale ' + M.date + ': project cost released to COGS',
      [L('5000', sum(costs) + sum(sale), 'What the house cost, all in')].concat(Object.keys(released).sort().map(function (a) { return L(a, -released[a], 'released at the sale'); })))
  ];
}
