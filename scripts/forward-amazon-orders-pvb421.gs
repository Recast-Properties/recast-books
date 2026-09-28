/****************************************************************
 * ONE-OFF for pvb421@gmail.com  (Recast Books, 2026-09-28)
 *
 * Forwards 42 Amazon order emails for 104 Ashburne - the ones that
 * were never forwarded - to the house's mailbox, one at a time, with
 * a note on top that the bookkeeper reads first (house, who paid, the
 * order date, and any return Amazon already refunded). Nothing else:
 * it never deletes, never touches other mail.
 *
 * Run `forwardAshburneAmazonOrders` from the editor (first Run asks
 * for Gmail permission - allow it). Safe to run again: a forwarded
 * thread gets the label "Forwarded to Recast Books" and is skipped.
 * About 90 seconds. The log lists every one as sent / skipped.
 ****************************************************************/
var TO = '104ashburne@recast-properties.com';
var LABEL = 'Forwarded to Recast Books';
// [Gmail message id, order date, what it is, note about returns]
var ORDERS = [
  ['19c3e951871ac239', '2026-02-08', "Ravinte drawer pulls 25-pack x7", ""],
  ['19c53c92aadec550', '2026-02-12', "Saker silicone caulking tool", ""],
  ['19c5921cc3bf8fe5', '2026-02-13', "Niagara Conservation + 1 item", ""],
  ['19c8804177f03703', '2026-02-22', "Leor & Lair ivory tapers + 1 item", ""],
  ['19c872f93ec1d9fb', '2026-02-22', "60W candelabra bulbs", ""],
  ['19cc60c499147e1d', '2026-03-06', "Passky ceiling fans + 2 items", "RETURNED IN PART: Amazon refunded the fans, 102.83 on 2026-03-17; the other two items were kept."],
  ['19cd3f9b57c3a5f0', '2026-03-09', "Ravinte hinges 2-pack", "A return was requested on 2026-04-09."],
  ['19cfbe3dbee98f62', '2026-03-17', "AIPER Surfer S2 solar skimmer + 5 items", ""],
  ['19d0305c19e98471', '2026-03-18', "slochi LED flush mounts 6-pack", ""],
  ['19d0302e64ef16cd', '2026-03-18', "Taloya 12-inch flush mounts x2", ""],
  ['19d02fdb1d3f96ea', '2026-03-18', "hinge pin door stops 12-pack + 2 items", ""],
  ['19d0292e6e6ce5ef', '2026-03-18', "Ravinte hinges 60-pack x2 + 1 item", "RETURNED IN PART: one pack refunded, 78.65 on 2026-04-16."],
  ['19d06f803dd9edcd', '2026-03-19', "skimmer lids x2", ""],
  ['19d06d238719b807', '2026-03-19', "frosted glass window film x2", ""],
  ['19d16c05098c40d0', '2026-03-22', "OFFO shower arm flange", ""],
  ['19d161ad5f1eddbb', '2026-03-22', "BONEWEI 72x36 mirror + 1 item", ""],
  ['19d2340f4357f281', '2026-03-24', "Midwest Hearth lava rock", ""],
  ['19d220b88328874d', '2026-03-24', "ACE DECOR shower door + 5 items", ""],
  ['19d26bd62d7f088f', '2026-03-25', "Arlington Industries", ""],
  ['19d367f96f40a460', '2026-03-28', "GOHDLAMP G9 LED bulbs", ""],
  ['19d45de1959c9fcb', '2026-03-31', "Midwest Hearth lava rock x2", ""],
  ['19d45b92741661f1', '2026-03-31', "12-inch LED flush mount + 1 item", ""],
  ['19d4520f65ea49f1', '2026-03-31', "Intermatic timer", ""],
  ['19d4ab6c53f8c917', '2026-04-01', "BONEWEI 36x48 bathroom mirrors x3", ""],
  ['19d5bae848cc8f03', '2026-04-04', "ELYONA pendant light", ""],
  ['19d5ba50f28970c0', '2026-04-04', "Aipsun black LED wall light", ""],
  ['19d66436066afd90', '2026-04-06', "aluminum attic ladder + 5 items", ""],
  ['19d64ffc7129801a', '2026-04-06', "beige linen kitchen curtain + 11 items", "RETURNED IN PART: Amazon refunded 24.89 on 2026-05-07."],
  ['19d641fb2c543ded', '2026-04-06', "natural linen curtains x6", "RETURNED: Amazon issued refunds on 2026-05-07 (see the refund emails)."],
  ['19d64171cc9afa26', '2026-04-06', "YaFex curtain rods x8", "RETURNED: Amazon issued refunds on 2026-05-07 (see the refund emails)."],
  ['19d63e439b51c4ab', '2026-04-06', "22-inch drawer slides + 1 item", ""],
  ['19d757e78cd8d837', '2026-04-09', "LamQee 20-inch drum chandelier", ""],
  ['19d741471ee57e40', '2026-04-09', "Ravinte hinges 50-pack x2", ""],
  ['19d72a6ef4a78941', '2026-04-09', "Peohud door strike plates", ""],
  ['19d72513bfa05fe1', '2026-04-09', "Luvkczc recessed can lights", ""],
  ['19d7c847b7c3a374', '2026-04-11', "bathroom hardware sets x3", ""],
  ['19d821e403b2ea59', '2026-04-12', "Aoceley outdoor LED wall light", ""],
  ['19d81d98e9ff6295', '2026-04-12', "Sunaiony LED flickering bulbs", ""],
  ['19d886d622a0c3a7', '2026-04-13', "Kingdder 3-gang wall plates x2", ""],
  ['19d87e186d232eb6', '2026-04-13', "Sunco outdoor flood lights 6-pack", ""],
  ['19d869069fc02bba', '2026-04-13', "Gerber elongated toilet", ""],
  ['19d8cfc00b68bb10', '2026-04-14', "sousac metal shower shelves x3", ""]
];

function forwardAshburneAmazonOrders() {
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var out = [];
  ORDERS.forEach(function (o) {
    var msg;
    try { msg = GmailApp.getMessageById(o[0]); } catch (e) { out.push('NOT FOUND  ' + o[1] + '  ' + o[2]); return; }
    var thread = msg.getThread();
    if (thread.getLabels().some(function (l) { return l.getName() === LABEL; })) { out.push('skip, already forwarded  ' + o[1] + '  ' + o[2]); return; }
    var when = Utilities.formatDate(msg.getDate(), 'America/Chicago', 'yyyy-MM-dd');
    var note = '104 Ashburne - Amazon order of ' + when + ', paid by Paul (personal card).' + (o[3] ? ' ' + o[3] : '') +
      ' Forwarded from pvb421@gmail.com by script on ' + Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd') + '.';
    msg.forward(TO, { subject: 'Fwd: ' + msg.getSubject(), htmlBody: '<p>' + note + '</p><hr>' + msg.getBody() });
    thread.addLabel(label);
    out.push('sent  ' + o[1] + '  ' + o[2]);
    Utilities.sleep(1500);
  });
  Logger.log(out.join('\n'));
  return out;
}
