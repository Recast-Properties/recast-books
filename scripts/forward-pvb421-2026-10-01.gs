// 2026-10-01 Paul (final migration register, answers of 10-01) - forwards the 19 costs whose only copy is in
// pvb421@gmail.com (Q15 travel, Q16 Adobe, Q17 Microsoft, Q8 Affirm interest, Q5 two Green Acres pictures) to the
// Recast mailboxes, each with Paul's answer as a note on top, so the live bookkeeper reads the note first.
// Posts nothing itself. Run before 104 Ashburne closes (the Affirm interest lands on Ashburne).
// STATUS: NOT YET RUN
/****************************************************************
 * ONE-OFF for pvb421@gmail.com  (Recast Books, 2026-10-01)
 * Lives in scripts/forward-pvb421-2026-10-01.gs - NOT in the writer's
 * oneOffScripts.gs: the writer runs as paul@ and cannot read this
 * personal mailbox. Copy of scripts/forward-remaining-pvb421.gs.
 *
 * docs/migration-leftovers-final.md, Paul 2026-10-01 "yes to everything":
 *   Q15  3 Dallas-trip costs          -> travel@        28.00 + 101.62 + 41.99
 *   Q16  10 Adobe charges (PayPal)    -> receipts@      10 x 34.49 = 344.90
 *   Q17  3 Microsoft 365 (PayPal)     -> receipts@      3 x 9.99 = 29.97
 *   Q8   Affirm loan, Aces photos     -> 104ashburne@   the 112.23 interest only
 *   Q5   2 phone pictures of 08-12 (the copies in Sent)
 *                                     -> 413greenacres@ look only, held for Paul
 * Never deletes, never touches other mail.
 *
 * Run `forwardFinalRegister` from the editor (the first Run asks for
 * Gmail permission - allow it). Safe to run again: a forwarded thread
 * gets the label "Forwarded to Recast Books" and is skipped. About a
 * minute. The log lists each one as sent / skip / NOT FOUND / FAILED,
 * then "sent N of 19" - paste it back to Claude.
 * Everything is inside the function on purpose: the older forward
 * scripts in a pvb421 project use the same global names (LABEL, MAILS).
 ****************************************************************/
function forwardFinalRegister() {
  var LABEL = 'Forwarded to Recast Books';
  var TRAVEL = 'travel@recast-properties.com', RECEIPTS = 'receipts@recast-properties.com';
  var DALLAS = 'Dallas trip, paid by me (Paul, 2026-10-01). Travel 6700, overhead, paid by Paul. ';
  var ADOBE = 'Recast software, account 6400, overhead - never a house cost. Paid by Paul through PayPal from his ' +
    'own Chase checking 8870. Paul, 2026-10-01: yes, these Adobe charges are Recast\'s. Recast pays two Adobe plans ' +
    'of 34.49 each - Illustrator, billed on the 3rd, and a second plan billed on the 23rd - so two in one month is ' +
    'not a duplicate. Charged ';
  var MSFT = 'Microsoft 365 - Recast software, account 6400, overhead, payee Microsoft Corporation (via PayPal). ' +
    'Paid by Paul through PayPal from his own Chase checking 8870. Paul, 2026-10-01: yes, Recast\'s. The 01-28, ' +
    '02-27, 06-27 and 07-27 charges of this plan are already on the books as Recast software; "Personal" is the ' +
    'name of Microsoft\'s plan, not a personal cost. Charged ';
  var LOOK = 'LOOK ONLY - hold for Paul (Paul, 2026-10-01). A picture Paul sent from his phone to 413 Green Acres ' +
    'on 2026-08-12 that no one ever read. Do not post it and do not dismiss it: hold it for Paul, even if it is not ' +
    'a receipt, and say what it shows - a receipt (store, date, amount, card), a house photo, or nothing. Already on ' +
    'the books for 413 Green Acres: the 144.00 Justice of the Peace filing fee of 2026-09-08.';
  // [Gmail message id, date, what it is, mailbox, note the bookkeeper reads first, attach its pictures]
  var MAILS = [
    ['19bccfd77acdcf22', '2026-01-17', 'American Airlines Wi-Fi 28.00', TRAVEL, DALLAS +
      'In-flight Wi-Fi of 01-17, 28.00, on AA 2496 DFW-PDX that day (airfare already on the books, conf YAAYXQ). ' +
      'The 25.00 Wi-Fi of 01-03 on the books is a different flight.'],
    ['19bec3c4d97fd1ca', '2026-01-23', 'Uber 101.62', TRAVEL, DALLAS +
      'The Uber ride of 01-23 at 12:01 PM, 101.62, on the same-day Portland-Dallas trip (conf KAIZZQ). Business, ' +
      'whatever the [Personal] tag says. It is NOT the 45.98 ride to PDX or the 101.43 ride from 104 Ashburne to ' +
      'DFW of the same day - both are already on the books.'],
    ['19c5dff78ec6f234', '2026-02-14', 'American award ticket DFW-PDX 41.99', TRAVEL, DALLAS +
      'The American award ticket DFW-PDX booked 2026-02-14: 41.99 paid in all (5.60 + 36.39). The flight down, ' +
      'PDX-DFW of 02-09 (conf LRQUCA), is already on the books. The 5.60 American Airlines entry of 2026-05-19 is ' +
      'a different award ticket (the May 26 flight).'],
    ['19b84d9ac879f38d', '2026-01-03', 'Adobe 34.49', RECEIPTS, ADOBE + '2026-01-03.'],
    ['19c2401eb09e6e3a', '2026-02-03', 'Adobe 34.49', RECEIPTS, ADOBE + '2026-02-03.'],
    ['19c8b73f8a756951', '2026-02-23', 'Adobe 34.49', RECEIPTS, ADOBE + '2026-02-23.'],
    ['19cb541641406507', '2026-03-03', 'Adobe 34.49', RECEIPTS, ADOBE + '2026-03-03.'],
    ['19d1bb166a7d4c1e', '2026-03-23', 'Adobe 34.49', RECEIPTS, ADOBE + '2026-03-23.'],
    ['19d54d6e209e2e6f', '2026-04-03', 'Adobe 34.49', RECEIPTS, ADOBE + '2026-04-03.'],
    ['19deef5a68e69bc8', '2026-05-03', 'Adobe 34.49', RECEIPTS, ADOBE + '2026-05-03.'],
    ['19e55b59fef3c868', '2026-05-23', 'Adobe 34.49', RECEIPTS, ADOBE + '2026-05-23.'],
    ['19e8e33301752011', '2026-06-03', 'Adobe 34.49', RECEIPTS, ADOBE + '2026-06-03.'],
    ['19ef5f28468731e8', '2026-06-23', 'Adobe 34.49', RECEIPTS, ADOBE + '2026-06-23.'],
    ['19d33b855fafefab', '2026-03-28', 'Microsoft 365 9.99', RECEIPTS, MSFT + '2026-03-28.'],
    ['19dd2f5be1f067f7', '2026-04-28', 'Microsoft 365 9.99', RECEIPTS, MSFT + '2026-04-28.'],
    ['19e6cd4e369aeac3', '2026-05-27', 'Microsoft 365 9.99', RECEIPTS, MSFT + '2026-05-27.'],
    ['19dcfdb063eb7d94', '2026-04-27', 'Affirm loan on the Aces listing photos', '104ashburne@recast-properties.com',
      '104 Ashburne (Paul, 2026-10-01). Post ONLY the loan interest: 112.23 (the plan repays 740.23 on a 628.00 ' +
      'loan), dated 2026-04-27, on 104 Ashburne, account 1330 (staging and marketing), section Marketing, payee ' +
      'Affirm, paid by Paul (his own Affirm loan FZTC-PQNK, repaid by him), description "Affirm interest on the ' +
      'Aces photos, paid over 12 months (loan FZTC-PQNK)". NOT account 1200 - that is Dennis\'s interest only. Do ' +
      'NOT post the 628.00: the Aces photos are already on the books (Aces Photography, 628.00, 2026-04-24).'],
    ['19ff785b0802a589', '2026-08-12', '413 Green Acres picture 1 of 2', '413greenacres@recast-properties.com', LOOK, true],
    ['19ff7775d805df9f', '2026-08-12', '413 Green Acres picture 2 of 2', '413greenacres@recast-properties.com', LOOK, true]
  ];
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var out = [], sent = 0, today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  MAILS.forEach(function (o) {
    var msg = null;
    try { msg = GmailApp.getMessageById(o[0]); } catch (e) {}
    if (!msg) { out.push('NOT FOUND  ' + o[1] + '  ' + o[2]); return; }
    var thread = msg.getThread();
    if (thread.getLabels().some(function (l) { return l.getName() === LABEL; })) {
      out.push('skip, already forwarded  ' + o[1] + '  ' + o[2]); return;
    }
    // The date in the subject keeps each forward its own thread (the 10 Adobe subjects are otherwise the same);
    // the two phone pictures have no subject at all.
    var opts = { subject: 'Fwd: ' + (msg.getSubject() || o[2]) + ' (' + o[1] + ')',
      htmlBody: '<p>' + o[4] + ' Forwarded from pvb421@gmail.com by script on ' + today + '.</p><hr>' + msg.getBody() };
    // A phone picture is an inline image, which an htmlBody forward drops: send it as an attachment.
    var pics = o[5] ? msg.getAttachments({ includeInlineImages: true, includeAttachments: false }) : [];
    if (pics.length) opts.attachments = pics;
    try {
      msg.forward(o[3], opts);
      thread.addLabel(label);
    } catch (e) { out.push('FAILED  ' + o[1] + '  ' + o[2] + '  ' + e); return; }
    sent++;
    out.push('sent  ' + o[1] + '  ' + o[2] + '  -> ' + o[3] + (o[5] ? '  (' + pics.length + ' picture(s))' : ''));
    Utilities.sleep(1500);
  });
  out.push('sent ' + sent + ' of ' + MAILS.length + ' this run');
  Logger.log(out.join('\n'));
  return out;
}
