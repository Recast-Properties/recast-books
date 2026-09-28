/****************************************************************
 * ONE-OFF for pvb421@gmail.com  (Recast Books, 2026-09-28, afternoon)
 *
 * The last of the personal-Gmail mail that never reached the books:
 * 14 Amazon orders of May-September, culled by Paul on 2026-09-28.
 * Five go to the house Paul named (or tools = overhead); nine he has
 * not decided go to receipts@ marked "not decided", so the card waits
 * for him and lists every item with its price.
 * Nothing else: it never deletes, never touches other mail.
 *
 * Run `forwardRemainingToRecastBooks` from the editor (first Run asks
 * for Gmail permission - allow it). Safe to run again: a forwarded
 * thread gets the label "Forwarded to Recast Books" and is skipped.
 * About 30 seconds. The log lists every one as sent / skipped / not found.
 ****************************************************************/
var LABEL = 'Forwarded to Recast Books';
var PAID = ' Paid by Paul (personal card).';
var UNDECIDED = 'NOT DECIDED: Paul has not said whether this order is a house cost or personal, nor which house - hold it for him and list every item with its price and the ship-to address.';
// [Gmail message id, date, what it is, mailbox, note the bookkeeper reads first]
var MAILS = [
  ['19de396feb3a864f', '2026-05-01', 'KAIWEETS circuit breaker finder', 'receipts@recast-properties.com',
    'Tools - overhead (Paul, 2026-09-28: "yes - tools").' + PAID],
  ['19df3736f3ee5d78', '2026-05-04', 'Chibery 50-pack 1/4 in. small hardware', '104ashburne@recast-properties.com',
    '104 Ashburne (Paul, 2026-09-28).' + PAID],
  ['19e5ccc0eb39a0a0', '2026-05-24', 'Osmocote fertilizer', '104ashburne@recast-properties.com',
    '104 Ashburne (Paul, 2026-09-28: "yes - Ashburne").' + PAID],
  ['19e718ea1cc1407c', '2026-05-28', 'Heath Zenith wired push button', '1616granite@recast-properties.com',
    '1616 Granite (Paul, 2026-09-28). Granite is closed in the books, so it goes to Cost Recapture under the 1616 Granite section, as the Home Depot air filter of 06-29 did.' + PAID],
  ['19efd353e119256f', '2026-06-25', 'Amazon Basics keypad deadbolt', '136bowlinggreen@recast-properties.com',
    'HOUSE NOT CONFIRMED: 136 Bowling Green is Claude\'s guess from the month - hold this for Paul with it pre-selected. One Amazon Basics keypad deadbolt was returned 08-19 and refunded 36.59 on 08-20; it may be this one (the other keypad order, 05-27, is already on Granite\'s books) - if so nothing is owed.' + PAID],
  ['19f6128b03e7347d', '2026-07-14', 'LanBlu solar fountain x2 + 5 items', 'receipts@recast-properties.com',
    UNDECIDED + ' Houses in play in July: 881 Newport, 136 Bowling Green, 280 Sparkling, 1616 Granite (sold 07-24).' + PAID],
  ['19fdbff63e687d93', '2026-08-07', '3 camera / lighting & fan items', 'receipts@recast-properties.com',
    UNDECIDED + ' Houses in play in August: 366 Mesa, 881 Newport, 136 Bowling Green.' + PAID],
  ['19ff0e489c37fcfe', '2026-08-11', '1 hardware item', 'receipts@recast-properties.com',
    UNDECIDED + ' Houses in play in August: 366 Mesa, 881 Newport, 136 Bowling Green.' + PAID],
  ['19ffcb1c98dc12e3', '2026-08-13', '4 hardware items', 'receipts@recast-properties.com',
    UNDECIDED + ' Houses in play in August: 366 Mesa, 881 Newport, 136 Bowling Green.' + PAID],
  ['1a002c5e6a6befef', '2026-08-14', '1 home improvement item', 'receipts@recast-properties.com',
    UNDECIDED + ' Houses in play in August: 366 Mesa, 881 Newport, 136 Bowling Green.' + PAID],
  ['1a05ea42eeb5a928', '2026-09-01', '2 hardware items', 'receipts@recast-properties.com',
    UNDECIDED + ' Houses in play in September: 469 Brushwood, 366 Mesa, 881 Newport, 136 Bowling Green.' + PAID],
  ['1a061d7c1e3f37a2', '2026-09-02', '1 camera item', 'receipts@recast-properties.com',
    UNDECIDED + ' Houses in play in September: 469 Brushwood, 366 Mesa, 881 Newport, 136 Bowling Green.' + PAID],
  ['1a06e56741310a6d', '2026-09-04', 'building supplies', 'receipts@recast-properties.com',
    UNDECIDED + ' Houses in play in September: 469 Brushwood, 366 Mesa, 881 Newport, 136 Bowling Green.' + PAID],
  ['1a09657c048a7c5e', '2026-09-12', 'wall lights', 'receipts@recast-properties.com',
    UNDECIDED + ' Houses in play in September: 469 Brushwood, 366 Mesa, 881 Newport, 136 Bowling Green.' + PAID]
];

function forwardRemainingToRecastBooks() {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var out = [], today = Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
  MAILS.forEach(function (o) {
    var msg;
    try { msg = GmailApp.getMessageById(o[0]); } catch (e) { out.push('NOT FOUND  ' + o[1] + '  ' + o[2]); return; }
    var thread = msg.getThread();
    if (thread.getLabels().some(function (l) { return l.getName() === LABEL; })) { out.push('skip, already forwarded  ' + o[1] + '  ' + o[2]); return; }
    var note = 'Amazon order of ' + o[1] + '. ' + o[4] + ' Forwarded from pvb421@gmail.com by script on ' + today + '.';
    msg.forward(o[3], { subject: 'Fwd: ' + msg.getSubject(), htmlBody: '<p>' + note + '</p><hr>' + msg.getBody() });
    thread.addLabel(label);
    out.push('sent  ' + o[1] + '  ' + o[2] + '  -> ' + o[3]);
    Utilities.sleep(1500);
  });
  Logger.log(out.join('\n'));
  return out;
}
