/****************************************************************
 * Recast Books Poller
 *
 * Standalone Apps Script. Polls receipts@/travel@recast-properties.com for new
 * mail and uploads each message (with attachments) to the Recast Books
 * /api/upload endpoint, which files it and hands it to the bookkeeper. See
 * ../../docs/phase2-spec.md section 6 for the contract this file implements.
 *
 * Modelled on ../../../Recast-site/apps-script/receipts-poller.gs (read-only
 * reference - this project is entirely separate: its own Gmail label
 * (CONFIG.DONE_LABEL below), never the old system's label, its own script
 * properties, its own triggers. Runs as paul@recast-properties.com.
 *
 * Setup: new standalone project (script.google.com), signed in as
 * paul@recast-properties.com. Paste this file and appsscript.json, then run
 * setup() once from the editor (see README.md).
 *
 * ASCII ONLY below - this file gets pasted into the Apps Script editor and
 * non-ASCII bytes get mangled in transit.
 ****************************************************************/

function setup() {
  var props = PropertiesService.getScriptProperties();

  var secret = props.getProperty('POLLER_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('POLLER_SECRET', secret);
    Logger.log('POLLER_SECRET (copy into the recast-books Netlify site env var of the same name): ' + secret);
  } else {
    Logger.log('POLLER_SECRET already set (not re-logged). Re-running setup() never regenerates it.');
  }

  if (!props.getProperty('BOOKS_UPLOAD_URL')) {
    props.setProperty('BOOKS_UPLOAD_URL', CONFIG.DEFAULT_UPLOAD_URL);
  }
  if (!props.getProperty('BOOKS_SUMMARY_URL')) {
    props.setProperty('BOOKS_SUMMARY_URL', CONFIG.DEFAULT_SUMMARY_URL);
  }
  if (!props.getProperty('START_DATE')) {
    props.setProperty('START_DATE', todayIso_());
  }

  GmailApp.getUserLabelByName(CONFIG.DONE_LABEL) || GmailApp.createLabel(CONFIG.DONE_LABEL);

  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pollBooks').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().atHour(3).everyDays(1).inTimezone('America/Chicago').create();

  Logger.log('Recast Books Poller set up. BOOKS_UPLOAD_URL=' + props.getProperty('BOOKS_UPLOAD_URL') +
    ' BOOKS_SUMMARY_URL=' + props.getProperty('BOOKS_SUMMARY_URL') +
    ' START_DATE=' + props.getProperty('START_DATE') + ' label=' + CONFIG.DONE_LABEL);
}

// One-time grant helper, same shape as receipts-poller.gs's authorize() - run it
// once from the editor if setup() fails with a permission error.
function authorize() {
  GmailApp.getInboxUnreadCount();
  UrlFetchApp.getRequest(CONFIG.DEFAULT_UPLOAD_URL);
  MailApp.getRemainingDailyQuota();
}

// ---- config -----------------------------------------------------------------

var CONFIG = {
  DEFAULT_UPLOAD_URL: 'https://books.recast-properties.com/api/upload',
  DEFAULT_SUMMARY_URL: 'https://books.recast-properties.com/api/summary',
  RECEIPT_ADDRESS: 'receipts@recast-properties.com',
  TRAVEL_ADDRESS: 'travel@recast-properties.com',
  DONE_LABEL: 'books-done',
  DEFAULT_DRY_QUERY: 'newer_than:30d',
  DIGEST_TO: 'paul@recast-properties.com',
  MAX_THREADS: 20,
  MAX_ATTACH_BYTES: 3 * 1024 * 1024 // raw bytes; base64 grows ~33%, and the whole POST must stay under 6 MB
};

// ---- pollBooks: real ingestion, labels processed threads --------------------

function pollBooks() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('Another poll is already running; skipping this run.');
    return;
  }
  try {
    var props = PropertiesService.getScriptProperties();
    var secret = requireProp_(props, 'POLLER_SECRET');
    var uploadUrl = requireProp_(props, 'BOOKS_UPLOAD_URL');
    var startDate = props.getProperty('START_DATE') || todayIso_();

    var doneLabel = GmailApp.getUserLabelByName(CONFIG.DONE_LABEL) || GmailApp.createLabel(CONFIG.DONE_LABEL);
    var query = '(to:' + CONFIG.RECEIPT_ADDRESS + ' OR to:' + CONFIG.TRAVEL_ADDRESS +
      ') after:' + startDate + ' -label:' + CONFIG.DONE_LABEL;
    var threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS);

    var sent = 0, failed = 0;
    threads.forEach(function (thread) {
      var threadOk = true;
      thread.getMessages().forEach(function (message) {
        try {
          var payload = buildPayload_(message, false);
          var res = postUpload_(uploadUrl, secret, payload);
          if (res.ok) {
            sent++;
          } else {
            threadOk = false;
            failed++;
            console.error('Upload failed for ' + message.getId() + ': ' + res.detail);
          }
        } catch (err) {
          threadOk = false;
          failed++;
          console.error('Poller error on ' + message.getId() + ': ' + String(err));
        }
      });
      if (threadOk) thread.addLabel(doneLabel);
    });

    console.log('Books poll: ' + sent + ' message(s) uploaded, ' + failed + ' failure(s).');
  } finally {
    lock.releaseLock();
  }
}

// ---- dryRunBatch: same read, dryRun:true, never labels -----------------------

function dryRunBatch() {
  var props = PropertiesService.getScriptProperties();
  var secret = requireProp_(props, 'POLLER_SECRET');
  var uploadUrl = requireProp_(props, 'BOOKS_UPLOAD_URL');
  var dryQuery = props.getProperty('DRY_QUERY') || CONFIG.DEFAULT_DRY_QUERY;

  var query = '(to:' + CONFIG.RECEIPT_ADDRESS + ' OR to:' + CONFIG.TRAVEL_ADDRESS + ') ' + dryQuery;
  var threads = GmailApp.search(query, 0, CONFIG.MAX_THREADS);

  var sent = 0, failed = 0;
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      try {
        var payload = buildPayload_(message, true);
        var res = postUpload_(uploadUrl, secret, payload);
        if (res.ok) {
          sent++;
        } else {
          failed++;
          console.error('Dry-run upload failed for ' + message.getId() + ': ' + res.detail);
        }
      } catch (err) {
        failed++;
        console.error('Dry-run poller error on ' + message.getId() + ': ' + String(err));
      }
    });
    // Dry runs never label a thread - the same message is meant to be re-readable
    // on the next dryRunBatch() call, and pollBooks() must still pick it up for real.
  });

  console.log('Dry run (' + dryQuery + '): ' + sent + ' message(s) sent, ' + failed + ' failure(s). Nothing labeled.');
}

// ---- dailyDigest: GET /api/summary for yesterday, email Paul -----------------

function dailyDigest() {
  var props = PropertiesService.getScriptProperties();
  var secret = requireProp_(props, 'POLLER_SECRET');
  var summaryUrl = props.getProperty('BOOKS_SUMMARY_URL') || CONFIG.DEFAULT_SUMMARY_URL;
  var y = yesterdayIso_();

  var res = UrlFetchApp.fetch(summaryUrl + '?date=' + y, {
    method: 'get',
    headers: { 'x-poller-secret': secret },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    console.error('dailyDigest: summary fetch failed (' + res.getResponseCode() + '): ' +
      res.getContentText().slice(0, 300));
    return;
  }

  var data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) {
    console.error('dailyDigest: summary response was not JSON: ' + res.getContentText().slice(0, 300));
    return;
  }

  var postedTotal = (data.totals && data.totals.posted_total_cents) || 0;
  var pendingCount = (data.totals && data.totals.pending_count) || 0;
  var weekday = Utilities.formatDate(new Date(), 'America/Chicago', 'EEEE MM/dd');
  var subject = 'Books | ' + weekday + ' | $' + centsToDollars_(postedTotal) + ' posted | ' + pendingCount + ' to review';

  var lines = [];
  lines.push('Posted (' + (data.posted || []).length + '):');
  (data.posted || []).forEach(function (p) {
    lines.push('  ' + (p.vendor || '(unknown vendor)') + ' - $' + centsToDollars_(p.total_cents) +
      ' - ' + (p.property || '(no property)') + ' - ' + accountSummaryText_(p.account_summary));
  });
  lines.push('');
  lines.push('Pending review (' + (data.pending || []).length + '):');
  (data.pending || []).forEach(function (p) {
    lines.push('  ' + (p.vendor || '(unknown vendor)') + ' - $' + centsToDollars_(p.receipt_total_cents) +
      ' - ' + (p.why || '(no reason given)'));
  });
  if ((data.errors || []).length) {
    lines.push('');
    lines.push('Errors (' + data.errors.length + '):');
    data.errors.forEach(function (e) {
      lines.push('  ' + (e.vendor || e.subject || e.docId) + ' - ' + (e.error || ''));
    });
  }
  lines.push('');
  lines.push('Review: https://books.recast-properties.com/#inbox');

  MailApp.sendEmail({ to: CONFIG.DIGEST_TO, subject: subject, body: lines.join('\n') });
  console.log('Daily digest sent for ' + y);
}

// ---- shared helpers -----------------------------------------------------------

function requireProp_(props, name) {
  var value = props.getProperty(name);
  if (!value) fail_('NOT_SETUP', 'Missing script property ' + name + ' - run setup() first');
  return value;
}

function fail_(code, message) {
  var err = new Error(message);
  err.code = code;
  throw err;
}

// Which inbox this receipt came through: travel@ gets a Travel-category hint on
// the ingest side via the channel field.
function channelOf_(message) {
  var hdrs = ((message.getTo() || '') + ',' + (message.getCc() || '')).toLowerCase();
  return hdrs.indexOf(CONFIG.TRAVEL_ADDRESS) !== -1 ? 'travel' : 'receipts';
}

// Build the /api/upload payload for one Gmail message. docId is computed here
// (gm-<gmailMessageId>) because only this layer has the raw Gmail message id -
// books-upload.mjs accepts it as-is rather than re-deriving it (phase2-spec.md
// section 1's docId scheme, applied by the caller that knows the source id).
function buildPayload_(message, dryRun) {
  var attachments = [];
  var notes = [];
  var atts = message.getAttachments({ includeInlineImages: true, includeAttachments: true });
  for (var i = 0; i < atts.length; i++) {
    var att = atts[i];
    var type = (att.getContentType() || '').toLowerCase();
    var lname = (att.getName() || '').toLowerCase();
    var isPdf = type === 'application/pdf' || /\.pdf$/.test(lname);
    var isImg = /^image\//.test(type) || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/.test(lname);
    if (!isPdf && !isImg) continue;

    var bytes = att.getBytes();
    var mime = type || (isPdf ? 'application/pdf' : 'image/jpeg');
    var attName = att.getName();
    if (bytes.length > CONFIG.MAX_ATTACH_BYTES) {
      // Phone photos routinely exceed the cap (base64 must stay under Netlify's 6 MB
      // request limit). Ask Drive for a ~2000px JPEG rendition of the image (Drive
      // renders HEIC too) - the proven approach from the receipts poller. PDFs cannot
      // be shrunk this way and are skipped with a note.
      var shrunk = isImg ? shrinkImageViaDrive_(att) : null;
      if (!shrunk) {
        notes.push('Skipped oversized attachment "' + attName + '" (' + bytes.length + ' bytes, over the cap; shrink ' + (isImg ? 'failed' : 'not possible for PDFs') + ').');
        continue;
      }
      bytes = shrunk;
      mime = 'image/jpeg';
      attName = attName.replace(/\.[^.]+$/, '') + '.jpg';
    }
    attachments.push({ name: attName, mime: mime, base64: Utilities.base64Encode(bytes) });
  }

  var body = (message.getPlainBody() || '').slice(0, 20000);
  if (notes.length) body = body + '\n\n[poller notes]\n' + notes.join('\n');

  return {
    docId: 'gm-' + message.getId(),
    source: 'email',
    channel: channelOf_(message),
    gmailUrl: 'https://mail.google.com/mail/u/0/#all/' + message.getId(),
    subject: message.getSubject(),
    from: message.getFrom(),
    receivedAt: message.getDate() ? message.getDate().toISOString() : '',
    bodyText: body,
    dryRun: !!dryRun,
    attachments: attachments
  };
}

function postUpload_(url, secret, payload) {
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-poller-secret': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  var data = {};
  try { data = JSON.parse(res.getContentText()); } catch (e) {}
  if (code === 200 && data.docId) return { ok: true, docId: data.docId, skipped: !!data.skipped };
  return { ok: false, detail: '(' + code + ') ' + res.getContentText().slice(0, 300) };
}

function centsToDollars_(cents) {
  var n = Number(cents) || 0;
  var neg = n < 0;
  n = Math.abs(Math.round(n));
  var dollars = Math.floor(n / 100);
  var rem = n % 100;
  return (neg ? '-' : '') + dollars + '.' + (rem < 10 ? '0' + rem : String(rem));
}

function accountSummaryText_(summary) {
  if (!summary || !summary.length) return '(no line items)';
  return summary.map(function (s) { return s.account + ': $' + centsToDollars_(s.amount_cents); }).join(', ');
}

function todayIso_() {
  return Utilities.formatDate(new Date(), 'America/Chicago', 'yyyy-MM-dd');
}

function yesterdayIso_() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return Utilities.formatDate(d, 'America/Chicago', 'yyyy-MM-dd');
}


// Drive renders a resized JPEG of any image it stores (HEIC included). Upload a temp
// copy, fetch the ~2000px rendition, trash the temp file. Returns bytes or null.
function shrinkImageViaDrive_(att) {
  var fileId = null;
  try {
    var file = DriveApp.createFile(att.copyBlob().setName('books-shrink-tmp'));
    fileId = file.getId();
    for (var attempt = 0; attempt < 6; attempt++) {
      var metaRes = UrlFetchApp.fetch(
        'https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=thumbnailLink',
        { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      if (metaRes.getResponseCode() === 200) {
        var meta = JSON.parse(metaRes.getContentText());
        if (meta.thumbnailLink) {
          var url = meta.thumbnailLink.replace(/=s\d+(-[a-z]+)?$/, '=s2000');
          var imgRes = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
          if (imgRes.getResponseCode() === 200) {
            var out = imgRes.getContent();
            if (out.length > 0 && out.length <= CONFIG.MAX_ATTACH_BYTES) return out;
          }
        }
      }
      Utilities.sleep(1500);
    }
    console.warn('Drive rendition never became available for "' + att.getName() + '"');
    return null;
  } catch (err) {
    console.warn('shrinkImageViaDrive_ failed: ' + String(err));
    return null;
  } finally {
    if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e2) {} }
  }
}
