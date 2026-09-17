/****************************************************************
 * ONE-OFF: Phase 4 mailbox listing  (added 2026-09-17, D-024/D-025)
 *
 * READ-ONLY. Lists EVERY non-chat message in this mailbox for 2026 and
 * writes the rows to Drive JSON part files. It never labels a thread,
 * never sends mail, never POSTs to /api/upload, never touches a sheet.
 * Copied from Recast-site's backfill-scan.gs (backfillStep2), which did
 * the same job on 2026-08-24; only the windows and file names differ.
 *
 * Run `listBooksMail` from the editor. Each Run processes ~4 minutes of
 * mail and writes `books-mail-<mailbox>-part-N.json`; click Run again
 * until the log says done=true. `listBooksMailReset` starts over.
 *
 * Scopes: GmailApp (read) + DriveApp (create) -- both already in this
 * project's manifest, so no new consent prompt.
 ****************************************************************/

var BM_WINDOWS = [
  ['2026/01/01', '2026/02/01', 'jan'],
  ['2026/02/01', '2026/03/01', 'feb'],
  ['2026/03/01', '2026/04/01', 'mar'],
  ['2026/04/01', '2026/05/01', 'apr'],
  ['2026/05/01', '2026/06/01', 'may'],
  ['2026/06/01', '2026/07/01', 'jun'],
  ['2026/07/01', '2026/08/01', 'jul'],
  ['2026/08/01', '2026/09/01', 'aug'],
  ['2026/09/01', '2026/10/01', 'sep'],
  ['2026/10/01', '2026/11/01', 'oct'],
  ['2026/11/01', '2026/12/01', 'nov'],
  ['2026/12/01', '2027/01/01', 'dec']
];

function listBooksMail() {
  var t0 = Date.now();
  var LIMIT_MS = 230000;          // stay well inside the 6-minute ceiling
  var props = PropertiesService.getScriptProperties();
  var cur = JSON.parse(props.getProperty('bm_cursor') || '{"w":0,"off":0,"part":0}');
  var mailbox = Session.getActiveUser().getEmail().split('@')[0] || 'unknown';
  var rows = [];
  var stopped = false;

  while (cur.w < BM_WINDOWS.length && !stopped) {
    var w = BM_WINDOWS[cur.w];
    var threads = GmailApp.search('-in:chats after:' + w[0] + ' before:' + w[1], cur.off, 50);
    if (!threads.length) { cur.w++; cur.off = 0; continue; }
    for (var i = 0; i < threads.length; i++) {
      try { rows.push.apply(rows, bmRowsForThread_(threads[i], w[2])); }
      catch (e) { rows.push({ win: w[2], err: String(e).slice(0, 120) }); }
      cur.off++;
      if (Date.now() - t0 > LIMIT_MS || rows.length > 3000) { stopped = true; break; }
    }
  }

  cur.part++;
  var done = cur.w >= BM_WINDOWS.length;
  var name = 'books-mail-' + mailbox + '-part-' + cur.part + '.json';
  var f = DriveApp.createFile(name,
    JSON.stringify({ mailbox: mailbox, cursor: cur, done: done, rows: rows }),
    MimeType.PLAIN_TEXT);
  props.setProperty('bm_cursor', JSON.stringify(cur));
  console.log('WROTE ' + name + '  id=' + f.getId() + '  rows=' + rows.length +
              '  window=' + (BM_WINDOWS[cur.w] ? BM_WINDOWS[cur.w][2] : 'END') +
              '  offset=' + cur.off + '  done=' + done +
              '  elapsed=' + ((Date.now() - t0) / 1000) + 's');
  return { part: cur.part, rows: rows.length, done: done, fileId: f.getId() };
}

function bmRowsForThread_(th, win) {
  var labels = th.getLabels().map(function (l) { return l.getName(); }).join(',');
  return th.getMessages().map(function (m) {
    var body = '';
    try { body = m.getPlainBody() || ''; } catch (e) { body = ''; }
    var flat = body.replace(/\s+/g, ' ');
    var amts = (flat.match(/-?\$\s?[\d,]+\.\d{2}/g) || []);
    var uniq = [];
    amts.forEach(function (a) { a = a.replace(/\s/g, ''); if (uniq.indexOf(a) < 0) uniq.push(a); });
    var att = [];
    try {
      att = m.getAttachments({ includeInlineImages: false }).map(function (a) {
        return a.getName().slice(0, 40);
      }).slice(0, 4);
    } catch (e) {}
    return {
      id: m.getId(),
      tid: th.getId(),
      d: Utilities.formatDate(m.getDate(), 'America/Chicago', 'yyyy-MM-dd'),
      from: (m.getFrom() || '').slice(0, 70),
      to: (m.getTo() || '').slice(0, 60),
      subj: (m.getSubject() || '').slice(0, 110),
      amts: uniq.slice(0, 12),
      att: att,
      lbl: labels,
      win: win,
      head: flat.slice(0, 180)
    };
  });
}

// Start the listing over from scratch (clears the cursor, leaves part files).
function listBooksMailReset() {
  PropertiesService.getScriptProperties().deleteProperty('bm_cursor');
  console.log('listing cursor cleared');
}
