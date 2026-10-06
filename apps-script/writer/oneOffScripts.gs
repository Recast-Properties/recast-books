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
 * followJournalOnTabs (2026-10-04, D-080: the closing tabs' Journal formulas rewritten in place and every house not
 *   sold rebuilt onto the range that follows the Journal; run 22:35 CDT) is in commit abf8a19.
 * setNewportInterest (2026-10-05, D-082: Dennis's figures on 881 Newport's two advances, the closing tab rewritten;
 *   run by Paul the same morning) is in commit 8ee100e.
 *
 * ASCII ONLY - same paste-into-the-editor constraint as Code.gs.
 ****************************************************************/

// 2026-10-05 Paul: neither 881 Newport payout has gone out ("Neither yet") - the close this morning had recorded
// Dennis paid 240,895.21 and Paul 27,609.53 on 10-02. Takes those two records out (voided on their own date, so the
// Citizens history reads as it was), so both stay owed until the money leaves Citizens (D-083), and rewrites
// "881 Newport - Closing" in place the way Attach and rebuild does: Total to Dennis / Total to Paul, paid so far
// 0.00, still owed. Nothing else moves. Safe to run twice (a second run finds them voided and only rewrites the tab).
// STATUS: NOT YET RUN
function unpayNewport() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var name = '881 Newport';
  var ids = ['sale-20261002-51ec186f7dcf', 'sale-20261002-97890cf3ceb2'];   // paid to Dennis, paid to Paul
  var who = Session.getActiveUser().getEmail();
  var journal = ss.getSheetByName('Journal');
  var cols = headerIndex_(journal);
  var done = 0;
  ids.forEach(function (id) {
    if (!findAllRowsByValue_(journal, cols['txn_id'], id).length) throw new Error(id + ' is not on the Journal - nothing changed');
    if (findAllRowsByValue_(journal, cols['void_of'], id).length) { Logger.log(id + ' already voided'); return; }
    voidEntry_(id, 'Paul, 2026-10-05: not paid yet - the payout stays owed until the money leaves Citizens (D-083)', '2026-10-02', who, props, true);
    done++;
  });
  var built = closingFromJournal_(ss, name);
  if (!built) throw new Error('No posted sale for ' + name);
  var written = writeClosingTab_(ss, name, built, closingTabName_(name));
  warmCache_();
  Logger.log('Voided ' + done + ' payout records; rewrote ' + written.sheet + ' - Dennis still owed ' +
    (built.summary.owed_after.dennis_cents / 100).toFixed(2) + ', Paul ' +
    ((built.summary.owed_after.paul_cents + built.summary.owed_after.paul_undrawn_cents) / 100).toFixed(2));
}

// 2026-10-05 Paul: "yes match all the receipts and link them" (1014 S View). Each receipt found for the house - in
// its Drive folder "1014 S View" and in the mail, copied to Drive by the poller one-off - is written on its own
// lines in the books (65 receipts, 136 lines; the pairs are data/molalla-receipts.json, matched on store, date and
// the amounts printed on the receipt). On the tab "1014 S View - Frozen" the Receipt cell of each of those lines
// becomes a link that opens it; a line with no receipt found gets an empty cell (the freeze had left the plain
// word "Receipt" on every row). Nothing is posted, no amount moves, the tab is not rebuilt. Safe to run twice.
// STATUS: NOT YET RUN
function linkMolallaReceipts() {
  var props = PropertiesService.getScriptProperties();
  var ss = openWorkbook_(props);
  requireOwner_(ss);
  var sh = ss.getSheetByName('1014 S View - Frozen');
  if (!sh) throw new Error('No tab "1014 S View - Frozen" - nothing changed');
  var pairs = [   // [the receipt in Drive, the entries it is the receipt for]
    ['https://drive.google.com/file/d/1R_mtyKgCRFj9FLzLdMVH1OFBiWIvLszQ/view', ['migration-20250724-9dfc0f80e364']],
    ['https://drive.google.com/file/d/1iw-YXO-pRScVdZjrVPoBPG0BVZt96aUl/view', ['migration-20250805-a81ff32d7be0']],
    ['https://drive.google.com/file/d/19Im8QhuWSR1UIKh3OdlNzxPo8oXg5hXe/view', ['migration-20250911-c1942d1c90c4']],
    ['https://drive.google.com/file/d/1o_tQwFwMraIre-vNxbSAvk3IqQm6Nndx/view', ['migration-20250916-5ad511a21e3e']],
    ['https://drive.google.com/file/d/1zDFhR7yGmPOPov7wgHBPujxBb8_yU8OG/view', ['migration-20250917-8b6e2f49a112']],
    ['https://drive.google.com/file/d/18ONxYpKJ6Io7nfHV3YUC7JcfsksoLvu3/view', ['migration-20250917-724226c1bd39']],
    ['https://drive.google.com/file/d/1t-0qDmWNisv_NvG56alKZkq2eTWZK-za/view', ['migration-20250917-96c744a287c3']],
    ['https://drive.google.com/file/d/14JNJLoFzkH9Fvxj9GbHowXKu0dldmdOA/view', ['migration-20250922-409a633a9a3d']],
    ['https://drive.google.com/file/d/1rCztPcuftelhEi8kaf72tPwTknYz04qn/view', ['migration-20250922-ecde0ade1047']],
    ['https://drive.google.com/file/d/1nqR9pwA3inZqu_q2mygEeSfeQbqGVcts/view', ['migration-20250924-48a5b7b2a26a', 'migration-20250924-61aed92a4799']],
    ['https://drive.google.com/file/d/1HbmSNmfXbAff3JsuuBhdsFsY_Ptd2tHS/view', ['migration-20250925-17d52e82d0f6']],
    ['https://drive.google.com/file/d/1sh6243-JzfOKIArR4XTWll09mWcmeHy7/view', ['migration-20250925-e466dd0e8772']],
    ['https://drive.google.com/file/d/1LQ_vxElZ6OYy6il1TpTaKysRJsTcRtFr/view', ['migration-20250925-a72d1ee05159']],
    ['https://drive.google.com/file/d/1dNnKCKq9TsT14vVNgPA3_zZuAQCkMcbI/view', ['migration-20251017-70d6e4516a1d']],
    ['https://drive.google.com/file/d/1twdCGRE4T8KXzM3RmQmMlX7hjRuMQ6DT/view', ['migration-20250924-6235d4ffcb05']],
    ['https://drive.google.com/file/d/1o30ipuV7QkdtAKhddw12cdUaPkSULZUu/view', ['migration-20250927-a0b04d93a382']],
    ['https://drive.google.com/file/d/1n-_g7froELPiVl8RuIapkkzq_c0AHU4d/view', ['migration-20250929-28f9e28350bd']],
    ['https://drive.google.com/file/d/1NElo0tKT8_3Bn3PqURI3Sh6chFY-nSO8/view', ['migration-20250929-5b0249bacf6f']],
    ['https://drive.google.com/file/d/1joFsrJwb2qxULl7XKRVuvaFKx_iMQ85W/view', ['migration-20251002-f022d75efef1']],
    ['https://drive.google.com/file/d/1lLdEWMDrs9glLCK-NKgblMk_JBmrxCF8/view', ['migration-20251002-a5fc88ef243c']],
    ['https://drive.google.com/file/d/12Gz-mc2EFuA7zJvn9DY2qPFBb2rG2ACG/view', ['migration-20251002-c65f5960f8c4']],
    ['https://drive.google.com/file/d/1r4LuQJfCrbP7-RSDKPML3CiGUSORfiMH/view', ['migration-20251009-6133a19664b1']],
    ['https://drive.google.com/file/d/165Ug6YvwZx7hSRnrU8aToyt88yLwoEuR/view', ['migration-20251011-76cbeffb2f3f', 'migration-20251011-8933cc23322f', 'migration-20251011-48f70dd3f24c']],
    ['https://drive.google.com/file/d/13XGrnDzt9i1A96eQmBC3IPLzwbAHGGs-/view', ['migration-20251011-f8422c1aa432', 'migration-20251011-3456aa04eefc', 'migration-20251011-5931025373e8', 'migration-20251011-1401b26bdfa0', 'migration-20251011-b418692473a7', 'migration-20251011-ce464f0b5b54', 'migration-20251011-74aefeeb7e27', 'migration-20251011-e1525b85e164', 'migration-20251011-1f71b00a4cc6', 'migration-20251011-d55d48610e92', 'migration-20251011-36d478473165']],
    ['https://drive.google.com/file/d/1QKASahWIW8MHsRNJrUXcjnbKx4TEmEc5/view', ['migration-20251012-401c8e6468bd']],
    ['https://drive.google.com/file/d/1TiFUDRXocUfeh4KhHod7ULNQI2zngmhK/view', ['migration-20251012-f152b9e43c0f']],
    ['https://drive.google.com/file/d/15_Z8vSGsWaeB3RJAxWnsDMDAsgvURUAX/view', ['migration-20251013-415c2950a69b', 'migration-20251013-5c1291a72ca9']],
    ['https://drive.google.com/file/d/1ltkT0Y8Gq8ozM_oI-B9M2NfmMdP-J7v0/view', ['migration-20251014-129112f499b0']],
    ['https://drive.google.com/file/d/1NDHcSRTFvfJnhkfr12SUtBpcvrOLHKQS/view', ['migration-20251014-9185b6df11d9']],
    ['https://drive.google.com/file/d/1NI23sTmYL6BZiSLWOiJLEX1klFdhAFyn/view', ['migration-20251015-129112f499b0']],
    ['https://drive.google.com/file/d/1--J_UcK-RsRNGXla8blo6Mcnd5AV3IeR/view', ['migration-20251016-17e8a8a7fd79']],
    ['https://drive.google.com/file/d/1zwFZD3RFC5nGZby1YWQ3Ho5_cpgHVPDK/view', ['migration-20251016-2dbeec2c3a6e', 'migration-20251016-aec1ef8ba402', 'migration-20251016-46677144b142']],
    ['https://drive.google.com/file/d/1NRSH4EijQupZ3U9vTVr_fJE4K2jUQVRg/view', ['migration-20251019-ee033a08bd05']],
    ['https://drive.google.com/file/d/1vHyR5P8jMqelc7-x9qL5sIhuX704s_Au/view', ['migration-20260102-68238cd9d13b']],
    ['https://drive.google.com/file/d/1YXmq9KJoCJsi9vgmGnfcAMvYlqwygBz0/view', ['migration-20250916-a6e320e7d3f5', 'migration-20250916-0e8baf1027df', 'migration-20250916-0b97290337e2', 'migration-20250916-22c14321efe4', 'migration-20250916-5612d83b907b', 'migration-20250916-f3b8cbd4a144', 'migration-20250916-51bb787c0aad', 'migration-20250916-309af9ac9740', 'migration-20250916-417b2b8e085a', 'migration-20250916-0aa65865354e', 'migration-20250916-144fd1ae48e4', 'migration-20250916-21f2f377f2a6', 'migration-20250916-94cf4189f317', 'migration-20250916-ccb7465d27ba', 'migration-20250916-dd7a6ef8f534', 'migration-20250916-434ebf4f12d6', 'migration-20250916-dcf418bff049', 'migration-20250916-ff011aea33a9', 'migration-20250916-030a250ddf76', 'migration-20250916-eb91d2d2eb08', 'migration-20250916-96bb0087fab2', 'migration-20250916-64006686095e', 'migration-20250916-fb65c2bd332e']],
    ['https://drive.google.com/file/d/1zjXUFvbvJ3f_1hObqaMEfeCb_s1MvvGU/view', ['migration-20250916-036d61189b7b', 'migration-20250916-49c3221f220d']],
    ['https://drive.google.com/file/d/1IhwpN8iSk0A-aghs2zhlMId2VoswnN2J/view', ['migration-20251009-019355c7e500', 'migration-20251009-ef7baeb60c2c', 'migration-20251009-d4d3c7e3f706']],
    ['https://drive.google.com/file/d/13Yzilykaxg3ygLfeDeMHdM3BtuKlQADX/view', ['migration-20250918-d2678d88937e']],
    ['https://drive.google.com/file/d/1DTPu0KnNOpDEzCygOKQ1PJ-c5T28g-3R/view', ['migration-20250923-92e612eb92d5', 'migration-20250923-32b448d9b9af', 'migration-20250923-62688c07aaa5', 'migration-20250923-b2f3cbdc75c3']],
    ['https://drive.google.com/file/d/1-i8IOF0c7UDKmyAyLQCvxjoRHzaVZBvD/view', ['migration-20250923-3026cc43afc3', 'migration-20250923-2e5841d2762b']],
    ['https://drive.google.com/file/d/151hOdh0XAWN10VwWAqpA-C_Z3SkQIsZM/view', ['migration-20250925-0b32e9fbb327', 'migration-20250925-697ce2d26976']],
    ['https://drive.google.com/file/d/1anSK9TRiRBGbDegTX_DkVxOIeuuY_4Cx/view', ['migration-20250927-255d29463225', 'migration-20250927-7399d77b9679', 'migration-20250927-f7ee7f07ccfb', 'migration-20250927-f816aab61d02', 'migration-20250927-be9b15c7df38']],
    ['https://drive.google.com/file/d/1begyhrZaV070TVdEDeVbTNahMTUsSEnA/view', ['migration-20250928-782ab94c6128', 'migration-20250928-ed9acc2f226b', 'migration-20250928-92e612eb92d5']],
    ['https://drive.google.com/file/d/1iUIUt17G5E6F7YEURA20KSE4RvMHay4l/view', ['migration-20250930-5be8afb6bb8e', 'migration-20250930-379dd4fc8b0e', 'migration-20250930-32105d9f9e2c', 'migration-20250930-99a5e00b1984', 'migration-20250930-d5f9201628fe']],
    ['https://drive.google.com/file/d/1yeHbymncNoanIA8uwSGQS_trif4CpOd5/view', ['migration-20251001-9d560f64a558', 'migration-20251001-7fc32a3c7bcf']],
    ['https://drive.google.com/file/d/1UqRQ57ak4EaDf5fqB3z4RhOZETUFRliW/view', ['migration-20251002-bfc1f65b5649']],
    ['https://drive.google.com/file/d/1c-mqzTGxRKtPakFvZQrS5NW4spq495gx/view', ['migration-20251002-4f6e142cdb3a', 'migration-20251002-8d4595eb78b8', 'migration-20251002-f2300643de85']],
    ['https://drive.google.com/file/d/1cAqDHYfD_iuG_a70lvLKuwzWk5WZBMGF/view', ['migration-20251010-74c9ddb797db']],
    ['https://drive.google.com/file/d/1gPOulmN88kr6QsZOr_jZWJu9plo4j7G-/view', ['migration-20251013-a5e8e66f5642']],
    ['https://drive.google.com/file/d/1QU9z61RmuR_tlnT9IpNxuJcWUvYbuWsr/view', ['migration-20251013-98a92a17ad2a']],
    ['https://drive.google.com/file/d/1Jbk7b3MlmB0uxxdcXi6rbFl_zFJw9d4s/view', ['migration-20251013-44b0de963749']],
    ['https://drive.google.com/file/d/1NWxoReF9QbISGD9hR_oqIzJyacSCypMO/view', ['migration-20251014-7a81376c90ed', 'migration-20251014-6b28a2b9fcd6', 'migration-20251014-95507ab49ac1']],
    ['https://drive.google.com/file/d/1JGA8U_6VNgbiVHzFlmo8oTDz53ggbLPN/view', ['migration-20251015-7838bed44d4a', 'migration-20251015-af620cd974f3', 'migration-20251015-379dd4fc8b0e', 'migration-20251015-0c0d8672df31', 'migration-20251015-32b6ca41c46c', 'migration-20251015-fa811435cd7d', 'migration-20251015-23612cee7449', 'migration-20251015-c16d310b6ea0']],
    ['https://drive.google.com/file/d/1mL8pv4GMusLO_z_pSwmpshpRU5k8y7wa/view', ['migration-20251016-0ff86dae10e2', 'migration-20251016-c791159ce42e', 'migration-20251016-bff19c7fd752']],
    ['https://drive.google.com/file/d/16Exf0IfP8NziMLTCHNHQHQmXGht7nSEU/view', ['migration-20251017-0933aa9d1f86', 'migration-20251017-74f39630c27c']],
    ['https://drive.google.com/file/d/19La_TRlX3TDgaY-1qPW4DOcu4PyN8T_1/view', ['migration-20251223-dd23c2930b6f']],
    ['https://drive.google.com/file/d/1rrUEtX2gVzavk7HMD3R1lezxrMSDcseH/view', ['migration-20251002-4b61f459ffec']],
    ['https://drive.google.com/file/d/1enCDtPmchr9TLkbuccVYEXS2sH22TMWx/view', ['migration-20250911-1345261cdb07']],
    ['https://drive.google.com/file/d/1pdvmKLKU-AXTLt8mWe_bhjIPy8YDYd6w/view', ['migration-20251014-e44f33bac144']],
    ['https://drive.google.com/file/d/1N4YvBKFEVIB6MhOOkRzKtsh-YtR75NCO/view', ['migration-20251210-6f3847805119']],
    ['https://drive.google.com/file/d/1jul2a6oAa2nNoA5MnR2kAM8C0swj6AHE/view', ['migration-20251210-b07116e5dd95']],
    ['https://drive.google.com/file/d/1BOTU3VVn6mmoH3-M0ZSuPSI4XHgd5ig0/view', ['migration-20251231-f748998bda04']],
    ['https://drive.google.com/file/d/1oqMfOCxlfDmoTbZrhR1bVz6mdJzfCQFC/view', ['migration-20250929-f7ee7f07ccfb']],
    ['https://drive.google.com/file/d/1WIFs2BDHI97B0GhHoTGw3wUIQRyAO-Wx/view', ['migration-20251204-aa745f2873a6']],
    ['https://drive.google.com/file/d/1DveUXdoVztmK8RWPI38tlNacsvkXg1bJ/view', ['migration-20251012-d263d59e28df']]
  ];
  var urlOf = {};
  pairs.forEach(function (p) { p[1].forEach(function (id) { if (urlOf[id]) throw new Error(id + ' is under two receipts - nothing changed'); urlOf[id] = p[0]; }); });

  // The tab is read and checked before anything is written. A line's entry id sits in its block's last
  // column and its Receipt cell four columns to the left - found by the id, never by a column number.
  var v = sh.getDataRange().getValues(), cells = [];
  for (var r = 0; r < v.length; r++) {
    for (var c = 4; c < v[r].length; c++) {
      var id = String(v[r][c]);
      if (!/^migration-\d{8}-[0-9a-f]+$/.test(id)) continue;
      var now = String(v[r][c - 4]);
      if (now !== 'Receipt' && now !== '') throw new Error('Row ' + (r + 1) + ': expected the Receipt cell, found "' + now + '" - nothing changed, tell Claude');
      cells.push([r + 1, c - 3, id]);
    }
  }
  if (cells.length < 100) throw new Error('Only ' + cells.length + ' lines found on the tab - nothing changed, tell Claude');

  var journal = 0;
  pairs.forEach(function (p) { journal += setDocUrl_(p[1], p[0], props); });
  var linked = 0, blank = 0;
  cells.forEach(function (x) {
    var cell = sh.getRange(x[0], x[1]);
    if (urlOf[x[2]]) { cell.setFormula(receiptCell_(urlOf[x[2]])); linked++; }
    else { cell.clearContent(); blank++; }
  });
  SpreadsheetApp.flush();
  warmCache_();
  console.log('linkMolallaReceipts: ' + pairs.length + ' receipts written on ' + journal + ' Journal lines; on the tab ' + linked +
    ' lines now open their receipt and ' + blank + ' have none (' + cells.length + ' lines on the tab).');
}
