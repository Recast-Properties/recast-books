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
  var mailbox = props.getProperty('MAILBOX') || 'paul';   // same property the poller uses
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

// ---- Phase 4 replay: send an EXPLICIT list of Gmail message ids to /api/upload ----
// Copied from Recast-site backfill-scan.gs `backfillRun`. The list lives in a Drive
// file named books-replay-<mailbox>.json: {"ids":[{"id":"<gmailMsgId>","ch":"receipts"|"travel"}, ...]}
// written by Claude from the listing (never by widening the poller's search). Nothing
// outside the list is touched and no thread is labelled; /api/upload is idempotent by
// docId (gm-<id>), so re-running is safe. Resumable: click Run until done=true.
// Requires Code.gs in the same project (buildPayload_, postUpload_, CONFIG) and the
// script properties POLLER_SECRET + BOOKS_UPLOAD_URL.

function replayIds() {
  var t0 = Date.now();
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('POLLER_SECRET');
  var uploadUrl = props.getProperty('BOOKS_UPLOAD_URL') || CONFIG.DEFAULT_UPLOAD_URL;
  if (!secret) throw new Error('Missing script property POLLER_SECRET');
  var mailbox = props.getProperty('MAILBOX') || 'paul';
  var files = DriveApp.getFilesByName('books-replay-' + mailbox + '.json');
  if (!files.hasNext()) throw new Error('No Drive file books-replay-' + mailbox + '.json');
  var spec = JSON.parse(files.next().getBlob().getDataAsString());
  var list = spec.ids || [];
  var reprocess = spec.reprocess === true;   // retry list: re-ingest docs the API failed on

  // A new list (different `built` stamp) starts from index 0 on its own.
  var built = String(spec.built || '');
  if (props.getProperty('replay_built') !== built) { props.setProperty('replay_built', built); props.deleteProperty('replay_idx'); }
  var i = parseInt(props.getProperty('replay_idx') || '0', 10);
  var log = [], ok = 0, skipped = 0, bad = 0;
  for (; i < list.length; i++) {
    if (Date.now() - t0 > 240000) break;          // resume on the next Run
    var it = list[i];
    try {
      var m = GmailApp.getMessageById(it.id);
      var payload = buildPayload_(m, false, it.ch || undefined);
      if (reprocess) payload.reprocess = true;
      var res = postUpload_(uploadUrl, secret, payload);
      if (res.ok) { if (res.skipped) skipped++; else ok++; }
      else { bad++; }
      log.push(i + ' ' + it.id + ' -> ' + (res.ok ? (res.skipped ? 'skipped' : 'ok') : res.detail) + '  ' + (m.getSubject() || '').slice(0, 46));
    } catch (e) {
      bad++;
      log.push(i + ' ' + it.id + ' -> ERROR ' + String(e).slice(0, 90));
    }
    Utilities.sleep(400);                          // don't stampede the ingest
  }
  props.setProperty('replay_idx', String(i));
  var done = i >= list.length;
  // Continue unattended: a one-off trigger re-runs replayIds a minute from now until
  // the list is exhausted (or a run has failures - then stop and let a human look).
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'replayIds') ScriptApp.deleteTrigger(t); });
  if (!done && bad === 0) ScriptApp.newTrigger('replayIds').timeBased().after(60 * 1000).create();
  console.log('REPLAY ' + mailbox + ' sent=' + ok + ' skipped=' + skipped + ' failed=' + bad +
              '  through ' + i + '/' + list.length + '  done=' + done +
              '  elapsed=' + ((Date.now() - t0) / 1000) + 's');
  console.log(log.join('\n'));
  return { sent: ok, skipped: skipped, failed: bad, idx: i, done: done };
}

function replayIdsReset() {
  PropertiesService.getScriptProperties().deleteProperty('replay_idx');
  console.log('replay index cleared');
}

// ---- Phase 4 re-post: post again from the STORED reads, no model call ---------------
// Drives /api/inbox {action:"repost-all"} page by page (D-025). Optional Drive file
// books-repost-<mailbox>.json: {"only":[docId,...], "overrides":{docId|"*":{paid_from,property}}}
// carries Paul's review rules; without it every stored read re-posts as is. Used after a
// clearBooks() on staging, and once at cutover on the real workbook.
function repostAll() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('POLLER_SECRET');
  if (!secret) throw new Error('Missing script property POLLER_SECRET');
  var mailbox = props.getProperty('MAILBOX') || 'paul';
  var base = (props.getProperty('BOOKS_UPLOAD_URL') || CONFIG.DEFAULT_UPLOAD_URL).replace(/\/api\/upload$/, '');
  var spec = {};
  var files = DriveApp.getFilesByName('books-repost-' + mailbox + '.json');
  if (files.hasNext()) spec = JSON.parse(files.next().getBlob().getDataAsString());
  // A new list (different `built` stamp) starts from the top on its own.
  var built = String(spec.built || '');
  if (props.getProperty('repost_built') !== built) { props.setProperty('repost_built', built); props.deleteProperty('repost_after'); }
  var after = props.getProperty('repost_after') || '';
  var t0 = Date.now(), fired = 0, skipped = 0, done = false;
  while (Date.now() - t0 < 200000) {
    var res = UrlFetchApp.fetch(base + '/api/inbox', {
      method: 'post', contentType: 'application/json', headers: { 'x-poller-secret': secret },
      payload: JSON.stringify({ action: 'repost-all', after: after, limit: 20, only: spec.only || undefined, overrides: spec.overrides || undefined }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) { console.error('repost-all HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200)); break; }
    var data = JSON.parse(res.getContentText());
    fired += data.fired.length; skipped += data.skipped.length; after = data.after || after; done = !!data.done;
    props.setProperty('repost_after', after);
    if (done) break;
    Utilities.sleep(20000);   // let the ingests drain before the next page
  }
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'repostAll') ScriptApp.deleteTrigger(t); });
  if (!done) ScriptApp.newTrigger('repostAll').timeBased().after(60 * 1000).create();
  if (done) props.deleteProperty('repost_after');
  console.log('REPOST ' + mailbox + ' fired=' + fired + ' skipped=' + skipped + ' after=' + after + ' done=' + done);
  return { fired: fired, skipped: skipped, done: done };
}

function repostAllReset() {
  PropertiesService.getScriptProperties().deleteProperty('repost_after');
  console.log('repost cursor cleared');
}
