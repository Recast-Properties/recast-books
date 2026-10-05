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
 *
 * ASCII ONLY - same paste-into-the-editor constraint as Code.gs.
 ****************************************************************/

// 2026-10-04 Paul, on 1014 S View (D-079): "line by line into the ligth template. then freeze it and make a
// closing tab for it." - the three summary entries of importMolalla are voided and every line of his sheet
// "Recast 2025" goes in as its own entry (read from the sheet when this runs, each block checked against his
// own totals before anything is written); then the house tab is built in the light template as of the sale
// and frozen, and a closing tab is written in his layout. Safe to run again.
// STATUS: NOT YET RUN
function importMolallaLines() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var out = [], M = MOLALLA;
  var today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd'), by = Session.getActiveUser().getEmail() || 'editor';

  // 1. his sheet, as it reads today - nothing is written unless every block adds up to his own totals
  var plan = molallaPlan_(molallaParse_(SpreadsheetApp.openById(M.sheetId).getSheetByName(M.sheetTab).getDataRange().getDisplayValues()));
  var ctx = buildCtx_(ss);
  ctx.properties.add(M.name);   // a sold house takes no entries from the menu or the mail; this names it itself
  var entries = plan.intents.map(function (i) { return buildEntry(i, ctx); });
  var ids = {};
  entries.forEach(function (e) { if (ids[e.txn_id] || M.old.indexOf(e.txn_id) !== -1) throw new Error('two entries share the id ' + e.txn_id + ' - tell Claude'); ids[e.txn_id] = true; });
  out.push('his sheet: ' + plan.cost_lines + ' cost lines, every block adds up; all in ' + fromCents(plan.all_in) + ', sold ' + fromCents(plan.sold));

  // 2. the summary entries out, the lines in
  var read = function () { var j = readTabData_(ss, 'Journal', { all: true }); return loadJournal(j.headers, j.rows); };
  var before = read(), have = {}, voided = {};
  before.forEach(function (l) { have[l.txn_id] = true; if (l.void_of) voided[l.void_of] = true; });
  M.old.forEach(function (id) {
    if (!have[id] || voided[id]) return;
    voidEntry_(id, 'Paul, 2026-10-04: 1014 S View goes in line by line - this summary entry is replaced', today, by, props, true);
    out.push('voided  ' + id);
  });
  var fresh = entries.filter(function (e) { return !have[e.txn_id]; });
  if (fresh.length) {
    var res = postBatchEntries_(fresh, props, true);
    out.push('posted ' + fresh.length + ' entries (Journal rows ' + res.rows.join('-') + ')');
  } else out.push('the ' + entries.length + ' entries are already in the Journal');

  // 3. the tabs: his copied sheet steps aside, the house tab is built as of the sale and frozen, the closing tab is written
  var frozenName = M.name + ' - Frozen', oldName = M.name + ' - old sheet', closeName = closingTabName_(M.name);
  var pSheet = ss.getSheetByName('Properties');
  upsertRow_(pSheet, headerIndex_(pSheet), 'name', { name: M.name, purchase_date: M.bought });
  var plain = ss.getSheetByName(M.name);
  if (plain && String(plain.getRange(1, 1).getDisplayValue()).indexOf('1014 S View Drive') === 0) {   // his own sheet: its title is in A1
    if (ss.getSheetByName(oldName)) throw new Error('there are two copies of his sheet - tell Claude');
    plain.setName(oldName);
    out.push('his copied sheet is now "' + oldName + '"');
  }
  if (!ss.getSheetByName(frozenName)) {
    var built = setupPropertyTab(M.name, M.date);   // a fresh tab, or over a half-built one from a run that stopped
    SpreadsheetApp.flush();
    freezePropertyTab_(ss, M.name, M.date);
    ss.getSheetByName(M.name).setName(frozenName);
    out.push('house tab built in the light template (' + built.rows + ' rows), frozen, named "' + frozenName + '"');
  } else out.push('"' + frozenName + '" is already there');
  if (!ss.getSheetByName(closeName)) {
    writeClosingTab_(ss, M.name, { summary: { deal: 'partner', date: M.date }, rows: plan.closing.rows, title_note: plan.closing.title_note,
      after_label: 'Bills that came in after the sale', statementLines: [] }, closeName);
    out.push('closing tab written: "' + closeName + '"');
  } else out.push('"' + closeName + '" is already there');
  try {
    var anchor = ss.getSheetByName('280 Sparkling - Closing').getIndex();
    [frozenName, closeName, oldName].forEach(function (n, k) { var t = ss.getSheetByName(n); if (t) { ss.setActiveSheet(t); ss.moveActiveSheet(anchor + 1 + k); } });
  } catch (err) { out.push('tabs left where they are: ' + err); }

  try { setupTotals(); } catch (err) { out.push('Totals FAILED: ' + err); }
  refreshPnl_(ss);   // the P&L tab, then the Taxes tab
  warmCache_();

  // 4. read back
  var after = read(), gone = {};
  after.forEach(function (l) { if (l.void_of) gone[l.void_of] = true; });
  var mine = after.filter(function (l) { return l.property === M.name && l.source !== 'void' && !gone[l.txn_id]; });
  var bal = function (test) { return mine.filter(test).reduce(function (t, l) { return t + l.debit - l.credit; }, 0); };
  var year = { from: '2026-01-01', to: '2026-12-31' }, pl = profitAndLoss(after, year), pl0 = profitAndLoss(before, year);
  var house = pl.by_property.filter(function (p) { return p.property === M.name; })[0] || {};
  var dr = after.reduce(function (t, l) { return t + l.debit; }, 0), cr = after.reduce(function (t, l) { return t + l.credit; }, 0);
  var ok = function (v) { return v ? '  OK' : '  CHECK'; };
  var costs = bal(function (l) { return /^1[0-3]\d\d$/.test(String(l.account)); });
  var paul = bal(function (l) { return String(l.account) === '2030'; }), putIn = -bal(function (l) { return String(l.account) === '9000'; });
  out.push('', 'READ BACK:',
    '  sold for: ' + fromCents(house.income || 0) + ok(house.income === plan.sold),
    '  all-in cost: ' + fromCents(house.cogs || 0) + ok(house.cogs === plan.all_in),
    '  the house on the P&L: ' + fromCents(house.gross || 0) + ok(house.gross === plan.sold - plan.all_in),
    '  left in the house accounts (must be 0.00): ' + fromCents(costs) + ok(costs === 0),
    '  Recast owes Paul on this house (must be 0.00): ' + fromCents(-paul) + ok(paul === 0),
    '  put in by Paul, net (his loss): ' + fromCents(putIn) + ok(putIn === plan.all_in - plan.sold),
    '  Recast earned this year (must not move): ' + fromCents(pl0.net_income) + ' -> ' + fromCents(pl.net_income) + ok(pl0.net_income === pl.net_income),
    '  the Journal balances: ' + (dr === cr ? 'yes' : 'NO - debits ' + fromCents(dr) + ', credits ' + fromCents(cr)));
  out.unshift('importMolallaLines - ' + new Date());
  console.log(out.join('\n'));
  return out;
}

// `bought`: his sheet gives the purchase lines no date. 2025-09-16 is worked out from the sheet itself - 15 days
// of prepaid interest to 9/30 (1,260.00), the water account opened and the front door lock bought on 9/16.
var MOLALLA = { name: '1014 S View', date: '2026-01-12', bought: '2025-09-16',
  sheetId: '1d1TVK7c53cIguj2nSvc2Zknr99TiLUAJxB7YwMj37g8', sheetTab: '1014 S View',
  url: 'https://docs.google.com/spreadsheets/d/1d1TVK7c53cIguj2nSvc2Zknr99TiLUAJxB7YwMj37g8/edit?gid=1577976646',
  old: ['manual-20260112-77e138cb840a', 'sale-20260112-d5de02905c64', 'sale-20260112-3aff479a6516'] };

/** His sheet, read as it is shown (getDisplayValues): the left block by its labels, the rehab blocks by the
 *  headings of the Totals row - a heading every five columns, its lines beneath it down to its own Total. */
function molallaParse_(grid) {
  var cell = function (r, c) { var v = (grid[r] || [])[c]; return String(v == null ? '' : v).trim(); };
  var num = function (v) {
    var s = String(v).replace(/[$,\s]/g, ''), neg = /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g, '');
    return /^-?\d+(\.\d+)?$/.test(s) ? Math.round(Number(s) * 100) * (neg ? -1 : 1) : null;
  };
  var iso = function (v) {
    var m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    return m ? (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2) : '';
  };
  var head = -1, r, c;
  for (r = 0; r < grid.length && head < 0; r++) if (cell(r, 0) === 'Totals') head = r;
  if (head < 0) throw new Error('his sheet has no Totals row any more - tell Claude');

  var blocks = [];
  for (c = 5; c < grid[head].length; c += 5) {
    if (!cell(head, c)) continue;
    var b = { title: cell(head, c), lines: [], total: null };
    for (r = head + 1; r < grid.length; r++) {
      var who = cell(r, c), amt = num(cell(r, c + 3));
      if (who === 'Total') { b.total = amt; break; }
      if (who && amt !== null) b.lines.push({ payee: who, date: iso(cell(r, c + 1)), what: cell(r, c + 2), cents: amt });
    }
    blocks.push(b);
  }

  var L = { loan: [], title: [], interest: [], sale: [] }, section = '';
  for (r = head + 1; r < grid.length; r++) {
    var label = cell(r, 0), a2 = num(cell(r, 2)), a3 = num(cell(r, 3));
    if (!label) continue;
    if (section === 'done') { if (label === 'Profit/Loss') L.result = a3; if (label === 'Sold Price') L.sold = a3; continue; }
    if (label === 'Rehab Total') { L.rehab_total = a3; continue; }
    if (label === 'Purchase & Closing Costs') { L.purchase_total = a3; continue; }
    if (label === 'Purchase Price') { L.price = a3; continue; }
    if (label === 'Westfall Offers') { L.westfall = { date: iso(cell(r, 1)), cents: a3 }; continue; }
    if (label === 'County Taxes') { L.taxes = a3; continue; }
    if (label === 'Loan Costs') { section = 'loan'; L.loan_total = a2 !== null ? a2 : a3; continue; }
    if (label === 'Title & Escrow') { section = 'title'; L.title_total = a2 !== null ? a2 : a3; continue; }
    if (label === 'Interest Payments') { section = 'interest'; L.interest_total = a3; continue; }
    if (/^Sale Closing Costs/.test(label)) { section = 'sale'; L.sale_total = a3; L.sale_date = iso(label.replace(/^Sale Closing Costs\s*/, '')); continue; }
    if (/^Total Project Cost \(All in\)/.test(label)) { section = 'done'; L.all_in = a3; continue; }
    if (a3 === null) continue;
    if (section === 'loan') L.loan.push({ what: label, date: iso(cell(r, 1)), payee: a2 === null ? cell(r, 2) : '', cents: a3 });
    if (section === 'title') L.title.push({ what: label, cents: a3 });
    if (section === 'interest' && iso(label)) L.interest.push({ date: iso(label), cents: a3 });
    if (section === 'sale') L.sale.push({ what: label, cents: a3 });
  }
  return { blocks: blocks, left: L };
}

/** The entries and the closing tab's rows from the parsed sheet. Throws, before anything is written, unless every
 *  block adds up to his own total and the whole to the figures brought in on 2026-10-04 (444,579.10 / 410,000.00).
 *  Every cost is "paid by Paul" (his own money and his lender's - 2030), the sale money pays that back, and what
 *  it did not cover is his loss, put in by him (9000): Recast owes him nothing on this house.
 *  The purchase side - price, assignment fee, title, loan costs, loan interest - is on 1000, so the light
 *  template's first row reads the way his sheet does and Rehab Costs + Utilities come to his Rehab Total. */
function molallaPlan_(parsed) {
  var M = MOLALLA, L = parsed.left, sum = function (a) { return a.reduce(function (t, x) { return t + x.cents; }, 0); };
  var must = function (what, got, want) { if (got !== want) throw new Error(what + ': ' + fromCents(got || 0) + ' does not match ' + fromCents(want || 0) + ' - his sheet changed, tell Claude'); };
  must('loan costs', sum(L.loan), L.loan_total);
  must('title and escrow', sum(L.title), L.title_total);
  must('purchase and closing', L.price + L.westfall.cents + L.taxes + L.loan_total + L.title_total, L.purchase_total);
  must('interest payments', sum(L.interest), L.interest_total);
  must('sale closing costs', sum(L.sale), L.sale_total);
  parsed.blocks.forEach(function (b) { must(b.title, sum(b.lines), b.total); });
  must('rehab total', parsed.blocks.reduce(function (t, b) { return t + b.total; }, 0), L.rehab_total);
  must('all in', L.purchase_total + L.rehab_total + L.interest_total + L.sale_total, L.all_in);
  must('profit or loss', L.sold - L.all_in, L.result);
  must('all in, as brought in on 2026-10-04', L.all_in, 44457910);
  must('sold price, as brought in on 2026-10-04', L.sold, 41000000);
  if (L.sale_date !== M.date) throw new Error('the sale date on his sheet is ' + L.sale_date + ' - tell Claude');

  var LABOR = /^(Aleksandr Kislyi|Lineage Legacy LLC|Anastasiia Osadchuk|Lumin Landscaping)$/;
  var BLOCK = { 'Trash': '1060', 'Appliances': '1040', 'Insurance': '1110', 'Utilities': '1120' };
  var title = 'Fidelity National Title', lender = 'Hard money lender', seen = {}, costs = [];
  var cost = function (account, group, date, payee, what, cents) {
    var late = date > M.date, d = late ? M.date : (date || M.bought);
    var description = (what === '?' || !what ? (what === '?' ? 'Item not named on his sheet' : group) : what) + (late ? ' (billed ' + date + ', after the sale)' : '');
    var key = [d, payee, cents, description].join('|');
    seen[key] = (seen[key] || 0) + 1;
    if (seen[key] > 1) description += ' (' + seen[key] + ')';   // his sheet has the same line twice: each is its own entry
    costs.push({ type: 'expense', date: d, payee: payee, description: description, amount_cents: cents, account: account, property: M.name,
      // 'migration': these are the rows of his old books, like every row the cutover brought in - the nightly
      // check does not call two alike rows of old books a possible duplicate (his sheet has several)
      paid_from: 'PAUL', trade: group, source: 'migration', posted_by: 'importMolallaLines', doc_url: M.url,
      memo: M.name + ' - ' + group + ': ' + description + ' (' + payee + ') - from his sheet "Recast 2025"' });
  };
  cost('1000', 'Purchase', '', 'Seller, at the purchase closing', 'Purchase price', L.price);
  cost('1000', 'Purchase', L.westfall.date, 'Westfall Offers', 'Assignment fee (deposit)', L.westfall.cents);
  cost('1100', 'Purchase', '', 'County, at the purchase closing', 'County taxes', L.taxes);
  L.loan.forEach(function (x) { cost('1000', 'Loan Costs', x.date, x.payee || lender, x.what, x.cents); });
  L.title.forEach(function (x) { cost('1000', 'Title & Escrow', '', title, x.what, x.cents); });
  L.interest.forEach(function (x) { cost('1000', 'Loan Interest', x.date, lender, 'Loan interest payment', x.cents); });
  parsed.blocks.forEach(function (b) {
    b.lines.forEach(function (x) { cost(BLOCK[b.title] || (LABOR.test(x.payee) ? '1020' : '1030'), b.title, x.date, x.payee, x.what, x.cents); });
  });

  var line = function (account, cents, description, extra) {
    var l = { account: account, debit: cents > 0 ? cents : 0, credit: cents < 0 ? -cents : 0, property: M.name, description: description };
    Object.keys(extra || {}).forEach(function (k) { l[k] = extra[k]; });
    return l;
  };
  var by = {};
  costs.forEach(function (i) { by[i.account] = (by[i.account] || 0) + i.amount_cents; });
  var saleLines = L.sale.map(function (x) { return line(/^Agent/i.test(x.what) ? '1300' : '1310', x.cents, x.what); });
  saleLines.forEach(function (l) { by[l.account] = (by[l.account] || 0) + l.debit; });
  var paid = sum(costs.map(function (i) { return { cents: i.amount_cents }; })), cash = L.sold - L.sale_total, loss = paid - cash;
  if (loss <= 0) throw new Error('this was written for a house that lost money - tell Claude');
  var memo = M.name + ' sale ' + M.date + ': ', sale = { type: 'journal', date: M.date, source: 'sale', posted_by: 'importMolallaLines', doc_url: M.url };
  var entry = function (text, lines) { var i = { memo: memo + text, lines: lines }; Object.keys(sale).forEach(function (k) { i[k] = sale[k]; }); return i; };
  var intents = costs.concat([
    entry('sold for ' + fromCents(L.sold) + ' - the sale figures of his sheet "Recast 2025" (no statement on file)',
      saleLines.concat([line('2030', cash, 'Sale money after the closing costs - it paid off his lender and the rest went to Paul', { payee: 'Paul Bjork' }),
        line('4000', -L.sold, 'Sold ' + M.date)])),
    entry('project cost released to COGS',
      [line('5000', paid + L.sale_total, 'All-in cost of the house')].concat(Object.keys(by).sort().map(function (a) { return line(a, -by[a], 'released at the sale'); }))),
    entry('the loss - what the sale did not cover is Paul\'s own money, not owed back to him',
      [line('2030', loss, 'What the sale did not cover', { payee: 'Paul Bjork' }), line('9000', -loss, 'Put in by Paul - the loss on this house', { payee: 'Paul Bjork' })])
  ]);

  // the closing tab, in his sections and words; a house with no Dennis has no Dennis rows
  var rows = [], rehab = (by['1020'] || 0) + (by['1030'] || 0) + (by['1040'] || 0) + (by['1060'] || 0);
  var add = function (style, label, cents, note, plain) { rows.push({ label: style === 'row' ? '  ' + label : label, cents: cents, note: note || '', style: style, note_plain: !!plain }); };
  add('head', 'INCOMING CASH AT CLOSING', null);
  add('row', 'Sale money after commission and closing costs', cash, 'It paid off your lender first; the rest came to you', true);
  add('total', 'Cash received', cash);
  add('blank', '', null);
  add('head', 'PROJECT COSTS', null);
  var money = function (cents) { return fromCents(cents).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  add('row', 'Purchase, closing costs, loan costs and interest', by['1000'], 'Price ' + money(L.price) + ', assignment fee ' + money(L.westfall.cents) + ', title ' +
    money(L.title_total) + ', loan costs ' + money(L.loan_total) + ', interest ' + money(L.interest_total), true);
  add('row', 'Rehab Costs', rehab);
  add('row', 'Utilities', by['1120'] || 0);
  add('row', 'Property Tax', by['1100'] || 0);
  add('row', 'Insurance', by['1110'] || 0);
  add('total', 'Total Project Costs', paid);
  add('blank', '', null);
  add('head', 'PROFIT', null);
  add('total', 'Total Profit', -loss, cash - paid === -loss ? 'Cash received less total project costs' : 'DOES NOT MATCH cash received less total project costs');
  add('row', 'Paul 100%', -loss);
  add('blank', '', null);
  add('head', 'PAYOUTS', null);
  add('total', 'Paul', null);
  add('row', 'Paid out of pocket', paid, 'Your own money and your lender\'s loan', true);
  add('row', '100% of profit', -loss, 'A loss', true);
  add('total', 'Total to Paul', cash, 'Your lender was paid off out of this');
  add('blank', '', null);
  add('total', 'Total paid out', cash, 'Matches the cash received at closing');
  must('the house accounts', paid, by['1000'] + rehab + (by['1120'] || 0) + (by['1100'] || 0) + (by['1110'] || 0));

  return { intents: intents, cost_lines: costs.length, all_in: L.all_in, sold: L.sold, by_account: by,
    closing: { rows: rows, title_note: 'Sold for ' + money(L.sold) + '. Your own deal - Dennis was not in it.' } };
}
