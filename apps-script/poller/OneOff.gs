/****************************************************************
 * ONE-OFF 2026-10-04 (Paul: "yes match all the receipts and link them"): copy the receipts for
 * 1014 S View (Molalla) out of the paul@ mail into Drive, so each one can be read, matched to
 * its line in the books and linked from the tab "1014 S View - Frozen". No email address was
 * ever made for that house: its receipts are phone photos Paul mailed himself from pvb421@ and
 * store mail that names the house (HANDOFF-2026-10-04.md).
 *
 * Every photo and PDF attached to those emails, and each email itself as a PDF, lands in a new
 * folder "Receipts from email" inside the Drive folder "1014 S View", named
 * "<date> <sender> - <subject> - <attachment>". A file "_status.txt" there says how far it got.
 *
 * It runs by itself: the paul@ pollBooks gives it the rest of its turn after the mail is read
 * (about 4 minutes a run at most, every 15 minutes, never more than MOLALLA_MAX_RUNS runs). Running
 * exportMolallaMail from the editor does the same thing by hand.
 *
 * Posts nothing, labels nothing, changes no email and no entry in the books.
 * STATUS: NOT YET RUN
 ****************************************************************/

// Keep this the FIRST function in the file: the editor's Run picks it by default.
function exportMolallaMail() {
  console.log(exportMolallaMail_(Date.now()));
}

var MOLALLA_PARENT = '1GB7b-PHIIGsWMKbhEI6Dit2M-9Ih37l0';   // the Drive folder "1014 S View"
var MOLALLA_FOLDER_NAME = 'Receipts from email';
var MOLALLA_MAX_RUNS = 8;
var MOLALLA_QUERIES = [
  ['photo', 'from:pvb421@gmail.com has:attachment after:2025/07/01 before:2026/02/01'],
  ['store', '("1014 S View" OR "1014 South View" OR "1014 S. View" OR Molalla) after:2025/06/01 before:2026/10/01 ' +
    '-from:pvb421@gmail.com -from:auction.com -from:redfin -from:zillow'],
  // added after the first pass: the stores' own emailed receipts name no house (Home Depot's "Your Electronic
  // Receipt" for nearly every day of the job, Lowe's, Floor & Decor)
  ['store', '(from:homedepot OR from:lowes OR from:flooranddecor) (subject:receipt OR subject:invoice OR subject:"Thanks For Your Order") ' +
    'after:2025/09/01 before:2026/01/01']
];

/** One run: saves what is not saved yet, for about 4 minutes. Returns what it did, in one line. */
function exportMolallaMail_(started) {
  try {
    var props = PropertiesService.getScriptProperties();
    if (mailboxMode_(props) !== 'paul') return 'exportMolallaMail_: runs in the paul@ project only';
    var runs = Number(props.getProperty('MOLALLA_RUNS_2') || 0);
    if (props.getProperty('MOLALLA_FINISHED_2') || runs >= MOLALLA_MAX_RUNS) return 'exportMolallaMail_: nothing left to do';
    props.setProperty('MOLALLA_RUNS_2', String(runs + 1));
    var done = JSON.parse(props.getProperty('MOLALLA_DONE') || '{}');
    var folderId = props.getProperty('MOLALLA_FOLDER'), folder;
    if (folderId) folder = DriveApp.getFolderById(folderId);
    else {
      folder = DriveApp.getFolderById(MOLALLA_PARENT).createFolder(MOLALLA_FOLDER_NAME);
      props.setProperty('MOLALLA_FOLDER', folder.getId());
    }
    var left = 0, failed = [];
    MOLALLA_QUERIES.forEach(function (q) {
      var kind = q[0];
      for (var start = 0; start < 500; start += 100) {
        var threads = GmailApp.search(q[1], start, 100);
        threads.forEach(function (thread) {
          thread.getMessages().forEach(function (message) {
            var id = message.getId();
            if (done[id]) return;
            if (kind === 'photo' && !/pvb421@gmail\.com/i.test(message.getFrom())) return;
            if (Date.now() - started > 3.5 * 60000) { left++; return; }
            // Marked before it is saved: a message that fails is never saved twice, it is named in _status.txt.
            done[id] = 1;
            props.setProperty('MOLALLA_DONE', JSON.stringify(done));
            try {
              done[id] = molallaSave_(folder, message, kind);
            } catch (err) {
              done[id] = -1;
              failed.push(molallaBase_(message) + ': ' + String((err && err.message) || err).slice(0, 160));
            }
            props.setProperty('MOLALLA_DONE', JSON.stringify(done));
          });
        });
        if (threads.length < 100) break;
      }
    });
    var messages = 0, files = 0;
    Object.keys(done).forEach(function (k) { messages++; if (done[k] > 0) files += done[k]; });
    if (!left) props.setProperty('MOLALLA_FINISHED_2', '1');
    var said = 'run ' + (runs + 1) + ': ' + messages + ' emails, ' + files + ' files saved so far, ' + failed.length + ' failed this run, ' +
      left + ' emails left. ' + (left ? 'MORE TO DO.' : 'ALL DONE.');
    var old = folder.getFilesByName('_status.txt');
    var before = old.hasNext() ? old.next() : null;
    var text = (before ? before.getBlob().getDataAsString() + '\n' : '') + said + (failed.length ? '\nFAILED ' + failed.join('\nFAILED ') : '');
    if (before) before.setContent(text); else folder.createFile('_status.txt', text, 'text/plain');
    return 'exportMolallaMail_: ' + said;
  } catch (err) {
    return 'exportMolallaMail_ stopped: ' + String((err && err.message) || err);
  }
}

/** A file name Drive and a person can both live with. */
function molallaName_(s) {
  return String(s || '').replace(/[\/\\:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 110);
}

/** "<date> <sender> - <subject>" - the start of every file name of a message. */
function molallaBase_(message) {
  var when = Utilities.formatDate(message.getDate(), 'America/Los_Angeles', 'yyyy-MM-dd');
  var from = String(message.getFrom() || '').replace(/<[^>]*>/g, '').replace(/"/g, '').trim() || String(message.getFrom() || '');
  return molallaName_(when + ' ' + from + ' - ' + (message.getSubject() || 'no subject'));
}

/** Saves a message's photos and PDFs, and the email itself as a PDF when it is store mail, when it
 *  has nothing attached, or when Paul typed a note in it. Returns how many files it made. */
function molallaSave_(folder, message, kind) {
  var base = molallaBase_(message), n = 0;
  message.getAttachments({ includeInlineImages: true, includeAttachments: true }).forEach(function (att) {
    var type = (att.getContentType() || '').toLowerCase(), lname = (att.getName() || '').toLowerCase();
    var isPdf = type === 'application/pdf' || /\.pdf$/.test(lname);
    var isImage = /^image\//.test(type) || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/.test(lname);
    if (!isPdf && !isImage) return;
    if (isImage && att.getSize() < 30000) return;   // logos and icons
    var blob = att.copyBlob(), name = att.getName() || 'attachment';
    if (/hei[cf]/.test(type) || /\.hei[cf]$/.test(lname)) {   // the Drive reader takes jpeg and png only
      var jpeg = shrinkImageViaDrive_(att);
      if (jpeg) { blob = Utilities.newBlob(jpeg, 'image/jpeg'); name = name.replace(/\.hei[cf]$/i, '') + '.jpg'; }
    }
    n++;
    folder.createFile(blob.setName(base + ' - ' + n + ' ' + molallaName_(name)));
  });
  var plain = String(message.getPlainBody() || '');
  var note = plain.replace(/Sent from my iPhone/gi, '').replace(/\[[^\]]*\]/g, '').trim();
  if (kind === 'store' || !n || note) {
    var esc = function (s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var head = '<p><b>From:</b> ' + esc(message.getFrom()) + '<br><b>To:</b> ' + esc(message.getTo()) + '<br><b>Date:</b> ' +
      esc(Utilities.formatDate(message.getDate(), 'America/Los_Angeles', 'yyyy-MM-dd HH:mm')) + ' Pacific<br><b>Subject:</b> ' +
      esc(message.getSubject()) + '</p><hr>';
    var pdf;
    try {
      // no pictures: the converter would go and fetch each one, and a receipt is its words
      pdf = Utilities.newBlob(head + String(message.getBody() || '').replace(/<img\b[^>]*>/gi, ''), 'text/html', 'email.html').getAs('application/pdf');
    } catch (err) {
      pdf = Utilities.newBlob(head + '<pre>' + esc(plain) + '</pre>', 'text/html', 'email.html').getAs('application/pdf');
    }
    n++;
    folder.createFile(pdf.setName(base + ' - email.pdf'));
  }
  return n;
}
