/****************************************************************
 * ONE-OFF 2026-10-02 (D-076; Paul: "yes, replace them"): put the ORIGINAL photo back on every
 * receipt whose Drive file is the small copy the poller made before the cap was raised
 * (1500x2000 for a 3024x4032 photo). 87 photos linked from the Journal: 10 came through
 * receipts@ (the paul@ mail), 77 through the property mailboxes (the properties@ mail). The
 * Drive files belong to paul@ and are not shared, so it takes both accounts:
 *
 *   1. properties@ - exportOriginalsForRestore_(), called from pollBooks on that account's own
 *      timer: copies each original attachment out of the mail into a Drive folder
 *      ("books-restore-originals") it shares with paul@ to view. Up to 4 minutes at the start
 *      of a run, then the mail as usual; it stops after RESTORE_MAX_RUNS runs whatever happened.
 *   2. paul@ - restoreOriginalPhotos(), run from the editor, again until it says ALL DONE:
 *      takes each original (from the paul@ mail, or from that folder) and uploads it INTO the
 *      existing Drive file - same file id, so every link in the books still opens it, and Drive
 *      keeps the small copy as the previous version for 30 days. It touches a file only when the
 *      file is exactly the small copy on record (same size in bytes) and the original is bigger.
 *
 * Posts nothing, reads nothing again, changes no entry. The copies kept on the site (what the
 * Inbox shows) stay as they are.
 * STATUS: DONE 2026-10-02 10:23-11:05 PDT, run from the editor by Claude (six runs; the first, at 10:20, failed on a Drive
 * folder search before touching anything): 87 of 87 replaced, 0 skipped, 0 failed; read back 90 Drive files, 90 full
 * size (4032x3024 or 5712x4284), 0 still small. properties@ exported its 77 in three timer runs (38, 10, 29).
 ****************************************************************/

// Keep this the FIRST function in the file: the editor's Run picks it by default.
function restoreOriginalPhotos() {
  var props = PropertiesService.getScriptProperties();
  if (mailboxMode_(props) !== 'paul') throw new Error('restoreOriginalPhotos runs in the paul@ project only');
  var done = JSON.parse(props.getProperty('RESTORE_DONE') || '{}');
  var shared = {};   // "<docId>__<i>" -> the original, as properties@ exported it
  if (RESTORE_FOLDER_ID) {   // by id: a Drive search for the shared folder timed out on the first run (10:20 PDT, nothing touched)
    var files = DriveApp.getFolderById(RESTORE_FOLDER_ID).getFiles();
    while (files.hasNext()) { var f = files.next(); shared[f.getName().split('__').slice(0, 2).join('__')] = f; }
  }
  var started = Date.now(), waiting = 0, failed = [];
  for (var k = 0; k < RESTORE_ITEMS.length && Date.now() - started < 4.5 * 60000; k++) {
    var item = RESTORE_ITEMS[k], key = item[0] + '__' + item[1];
    if (done[key]) continue;
    try {
      var blob = null;
      if (item[5] === 'paul') {
        var att = restoreOriginal_(item[0].replace(/^gm-/, ''), item[1], item[3]);
        if (!att) done[key] = 'SKIP: the photo is not in the email any more';
        else blob = att.copyBlob();
      } else if (shared[key]) blob = shared[key].getBlob();
      else { waiting++; continue; }
      if (blob) {
        var said = restorePut_(item, blob);
        console.log(key + ' ' + item[3] + ': ' + said);
        done[key] = /^OK/.test(said) ? 'OK' : said.slice(0, 90);   // short: a script property holds 9 KB
      }
    } catch (err) {
      failed.push(key + ': ' + String((err && err.message) || err));
    }
    props.setProperty('RESTORE_DONE', JSON.stringify(done));
  }
  var ok = 0, skipped = [];
  RESTORE_ITEMS.forEach(function (it) {
    var d = done[it[0] + '__' + it[1]];
    if (/^OK/.test(d || '')) ok++; else if (d) skipped.push(it[0] + ' ' + it[3] + ': ' + d);
  });
  failed.forEach(function (m) { console.error('FAILED ' + m); });
  skipped.forEach(function (m) { console.warn(m); });
  var left = RESTORE_ITEMS.length - ok - skipped.length;
  if (!left) {   // the last run reads every file back: its size and the photo's width and height, as Drive has them now
    var auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, small = 0, files = 0;
    RESTORE_ITEMS.forEach(function (it) {
      it[4].forEach(function (fileId) {
        var m = JSON.parse(restoreFetch_('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=name,size,imageMediaMetadata(width,height)', { headers: auth }).getContentText());
        var px = m.imageMediaMetadata || {};
        files++;
        if (Number(m.size) <= it[2] || (px.width && Math.max(px.width, px.height) <= 2000)) { small++; console.warn('STILL SMALL "' + m.name + '" ' + m.size + ' bytes ' + px.width + 'x' + px.height); }
        else console.log('read back "' + m.name + '" ' + m.size + ' bytes ' + (px.width ? px.width + 'x' + px.height : '(Drive has not measured it yet)'));
      });
    });
    console.log('read back ' + files + ' Drive files: ' + (files - small) + ' full size, ' + small + ' still small');
  }
  console.log('restoreOriginalPhotos: ' + ok + ' of ' + RESTORE_ITEMS.length + ' replaced, ' + skipped.length + ' skipped, ' + failed.length + ' failed this run, ' +
    waiting + ' waiting on the properties@ export. ' + (left ? 'RUN AGAIN - ' + left + ' left.' : 'ALL DONE.'));
}

var RESTORE_FOLDER_NAME = 'books-restore-originals';
var RESTORE_FOLDER_ID = '1CbqVH8hwHE5dwjuI6dDu6uX-7lpbXLIN';   // the folder properties@ made - filled in once it exists
var RESTORE_MAX_RUNS = 12;   // the second run got 10 photos in its 4 minutes (the first, 38)

/** The pdf/image attachments of a message, as buildPayload_ counts them, and the one that is the
 *  original of the stored copy (restorePick_). Null when it is not there. */
function restoreOriginal_(messageId, index, storedName) {
  var atts = GmailApp.getMessageById(messageId).getAttachments({ includeInlineImages: true, includeAttachments: true }).filter(function (a) {
    var type = (a.getContentType() || '').toLowerCase(), lname = (a.getName() || '').toLowerCase();
    return type === 'application/pdf' || /\.pdf$/.test(lname) || /^image\//.test(type) || /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/.test(lname);
  });
  var at = restorePick_(atts.map(function (a) { return a.getName(); }), index, storedName);
  return at === -1 ? null : atts[at];
}

/** Which attachment is the original of the stored copy: the one with the same file name before
 *  its extension (the poller renamed IMG_5798.JPG / .HEIC to IMG_5798.jpg) - at the stored position
 *  when that name comes twice, -1 when it is not there. */
function restorePick_(names, index, storedName) {
  var stem = function (n) { return String(n || '').replace(/\.[^.]+$/, '').toLowerCase(); };
  var same = [];
  names.forEach(function (n, i) { if (stem(n) === stem(storedName)) same.push(i); });
  if (same.length === 1) return same[0];
  return same.indexOf(index) !== -1 ? index : -1;
}

/** Uploads the original into each Drive file of the item. Returns "OK ..." or "SKIP: ..." (never
 *  retried); throws on anything that may work on a second try. */
function restorePut_(item, blob) {
  var bytes = blob.getBytes(), auth = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
  var ext = ((String(blob.getName() || '').match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || 'jpg').toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  var mime = String(blob.getContentType() || '').toLowerCase();
  if (!/^image\//.test(mime)) mime = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
  if (bytes.length <= item[2]) return 'SKIP: the photo in the email (' + bytes.length + ' bytes) is not bigger than the stored copy (' + item[2] + ')';
  var out = [];
  item[4].forEach(function (fileId) {
    var api = 'https://www.googleapis.com/drive/v3/files/' + fileId;
    var meta = JSON.parse(restoreFetch_(api + '?fields=name,size,mimeType', { headers: auth }).getContentText());
    if (Number(meta.size) === bytes.length) { out.push('already the original'); return; }
    if (Number(meta.size) !== item[2]) { out.push('SKIP: "' + meta.name + '" is ' + meta.size + ' bytes, not the small copy on record (' + item[2] + ') - left alone'); return; }
    // a resumable upload: the simple one stops at 5 MB
    var start = restoreFetch_('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=resumable', {
      method: 'patch', contentType: 'application/json', payload: '{}',
      headers: { Authorization: auth.Authorization, 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(bytes.length) } });
    var headers = start.getHeaders(), session = headers['Location'] || headers['location'];
    if (!session) throw new Error('no upload session for ' + fileId);
    restoreFetch_(session, { method: 'put', contentType: mime, payload: bytes });
    var curExt = ((String(meta.name).match(/\.([A-Za-z0-9]{1,5})$/) || [])[1] || '').toLowerCase();
    if (curExt === 'jpeg') curExt = 'jpg';
    if (curExt && curExt !== ext) {
      restoreFetch_(api, { method: 'patch', contentType: 'application/json', headers: auth, payload: JSON.stringify({ name: String(meta.name).replace(/\.[A-Za-z0-9]{1,5}$/, '.' + ext) }) });
    }
    var after = JSON.parse(restoreFetch_(api + '?fields=name,size', { headers: auth }).getContentText());
    if (Number(after.size) !== bytes.length) throw new Error('"' + after.name + '" is ' + after.size + ' bytes after the upload, expected ' + bytes.length);
    out.push('"' + after.name + '" ' + item[2] + ' -> ' + bytes.length + ' bytes');
  });
  var skips = out.filter(function (m) { return /^SKIP/.test(m); });
  return (skips.length === out.length ? '' : 'OK ') + out.join('; ');
}

function restoreFetch_(url, options) {
  options.muteHttpExceptions = true;
  var res = UrlFetchApp.fetch(url, options), code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Drive answered ' + code + ': ' + res.getContentText().slice(0, 200));
  return res;
}

/** properties@ only, from pollBooks: copies the originals out of the mail into a folder paul@ can
 *  read. True when this run did some copying. Every photo is tried once, 4 minutes a run at most,
 *  and never more than RESTORE_MAX_RUNS runs. */
function exportOriginalsForRestore_() {
  try {
    var props = PropertiesService.getScriptProperties();
    var done = JSON.parse(props.getProperty('RESTORE_EXPORTED') || '{}');
    var todo = RESTORE_ITEMS.filter(function (it) { return it[5] === 'properties' && !done[it[0] + '__' + it[1]]; });
    var runs = Number(props.getProperty('RESTORE_RUNS') || 0);
    if (!todo.length || runs >= RESTORE_MAX_RUNS) return false;
    props.setProperty('RESTORE_RUNS', String(runs + 1));
    var folderId = props.getProperty('RESTORE_FOLDER'), folder;
    if (folderId) folder = DriveApp.getFolderById(folderId);
    else {
      folder = DriveApp.createFolder(RESTORE_FOLDER_NAME);
      folder.addViewer('paul@recast-properties.com');
      props.setProperty('RESTORE_FOLDER', folder.getId());
    }
    var started = Date.now(), tried = 0;
    for (var k = 0; k < todo.length && Date.now() - started < 4 * 60000; k++) {
      var item = todo[k], key = item[0] + '__' + item[1];
      try {
        var att = restoreOriginal_(item[0].replace(/^gm-/, ''), item[1], item[3]);
        if (!att) done[key] = 'NOT IN THE EMAIL';
        else { folder.createFile(att.copyBlob().setName(key + '__' + att.getName())); done[key] = att.getBytes().length; }
      } catch (err) {
        done[key] = 'ERROR ' + String((err && err.message) || err).slice(0, 120);
      }
      tried++;
      props.setProperty('RESTORE_EXPORTED', JSON.stringify(done));
    }
    console.log('exportOriginalsForRestore_: ' + tried + ' tried this run, ' + (todo.length - tried) + ' left');
    return true;
  } catch (err) {
    console.error('exportOriginalsForRestore_: ' + String((err && err.message) || err));
    return false;
  }
}

// [docId, attachment index, bytes of the stored small copy, its name, the Drive file ids linked from the Journal, whose mail]
var RESTORE_ITEMS = [
  ['gm-19b8f5147938f4fc', 0, 709234, 'IMG_2966.jpg', ['19fi_x3yLOTjBTua8E6r-7rXG1IQNgUq_'], 'properties'],
  ['gm-19bae80800798f37', 0, 781646, 'IMG_3134.jpg', ['1ZVDEqXlk7twrRuzyK-JsTl3VhzsqLH7I'], 'properties'],
  ['gm-19bae832dd56cffa', 0, 634766, 'IMG_3135.jpg', ['1MSEWqlv-p5Io13ETuZrQjNog8nPylIEO'], 'properties'],
  ['gm-19bbcabe2cd4e9fa', 0, 398196, 'IMG_3161.jpg', ['1I4PhRLEM588aeHRnVegPmYTFtWBLh3KH'], 'properties'],
  ['gm-19bc8a7d88d9c798', 0, 597412, 'IMG_3197.jpg', ['1HRiasAgJr663TR4x8K8eAsqbZv0tbdLq'], 'properties'],
  ['gm-19c1616e0c3f33fa', 0, 728810, 'IMG_3268.jpg', ['1lB-e50Dm7zsmtj6AQPet2yRBj9vkqDWQ'], 'properties'],
  ['gm-19c1afb3be5acff0', 0, 405075, 'IMG_3275.jpg', ['1bphhPlreTEqYPoHirLwh3ZmHVnhdq09h'], 'properties'],
  ['gm-19c1afb84540f732', 0, 438372, 'IMG_3276.jpg', ['1x03DsJLQm6hfnb6SImRSSftj5cMFPJnh'], 'properties'],
  ['gm-19c23984521412b9', 0, 331868, 'IMG_3319.jpg', ['1FBjIDsbhFbXc7SClY_U_YkKLhxy3wF-g'], 'properties'],
  ['gm-19c66a1cdb487a56', 0, 569100, 'IMG_3490.jpg', ['1LWOHxyo0yarxeZRyUfHTkNcRJF-6NklW'], 'properties'],
  ['gm-19c6823763f5cb17', 0, 677269, 'IMG_3493.jpg', ['1EMY_pX8NZK1hmBDPL4i29cnJSORnIpTh'], 'properties'],
  ['gm-19c6cab5d43c229e', 0, 660187, 'IMG_3501.jpg', ['1lN409tbYx_e2N3E3JktiQo-QrT14GoQt'], 'properties'],
  ['gm-19c7092d542413e0', 0, 633680, 'IMG_3513.jpg', ['1ZaeV34-njGwfksiujmaF7ZrC-ABFg6bA'], 'properties'],
  ['gm-19c72576226cdb22', 0, 377642, 'IMG_3514.jpg', ['1-NPffsWlf-3l97RLR6Z76WCoqykcvB6-'], 'properties'],
  ['gm-19c768d3b6197026', 0, 753332, 'IMG_3536.jpg', ['1981pmNyhpzmog5-cgUGTTb3rjMxSE14Q'], 'properties'],
  ['gm-19cab6a1acffa793', 0, 642471, 'IMG_3631.jpg', ['1gqTvSfqhLJi8u00EiPaSDH_dOhybu-28'], 'properties'],
  ['gm-19caf33c58069d0d', 0, 669422, 'IMG_3637.jpg', ['1Eyjx5_Y6ulPGf2iyfT0A5AnHXTp_9-rP'], 'properties'],
  ['gm-19cba38a160751ad', 0, 353639, 'IMG_3670.jpg', ['1Y9qYerlBxArH8OjSqeQwGAA4dQ72kX6b'], 'properties'],
  ['gm-19cbac340f4e5a7b', 0, 533274, 'IMG_3671.jpg', ['1-SMbKyfFZRxYlmDrvtLeR2jHbBN8D33G'], 'properties'],
  ['gm-19cbf798cd5a28c5', 0, 643908, 'IMG_3690.jpg', ['1-UQRtyYI37yUJ_uLFNClOekeFA_vwrDf'], 'properties'],
  ['gm-19cc95f39c8dcc89', 0, 337278, 'IMG_3741.jpg', ['1CjXpnGbcyej7NwcCAqmIk-wpDPNC2Cl7'], 'properties'],
  ['gm-19cc98e8a2850d78', 0, 468146, 'IMG_3742.jpg', ['1yAgF-YnqQt0T17-tr3DS2cS9P1siNpIw'], 'properties'],
  ['gm-19ced5e82e20e490', 0, 327888, 'IMG_3833.jpg', ['111Y40bdEe2RB16dxC0Jli4bFANY-Tv5K'], 'properties'],
  ['gm-19cf2444d6efb00f', 0, 640908, 'IMG_3838.jpg', ['1eVkJQSDk3M9Y0rzvLhbgk1EGeIQgX-3w'], 'properties'],
  ['gm-19cf81ba91c8c90f', 0, 347991, 'IMG_3848.jpg', ['1-_iWnY7EXOlSslZMI3IlvJqJ3fZajSF-'], 'properties'],
  ['gm-19d018e208f5ce58', 0, 322266, 'IMG_3873.jpg', ['1bSshZBerAQ2qKYoBv2KPVvWZPu6QiKs4'], 'properties'],
  ['gm-19d0716277e58567', 0, 638486, 'IMG_3899.jpg', ['13Llpczoe-OvCZjX7ssO-C0yK6RhYpDun'], 'properties'],
  ['gm-19d0b8a1ba69dd09', 0, 445103, 'IMG_3917.jpg', ['1X1T_VxxqTcjboxGuOowLzNwd7tXJQq_I'], 'properties'],
  ['gm-19d0d690ad99ec5c', 0, 543471, 'IMG_3923.jpg', ['1Ivb6jdkPmjHGVK-xo6IXv8PLNmfcXXW8'], 'properties'],
  ['gm-19d11a93764263f8', 0, 320789, 'IMG_3948.jpg', ['1Cei7Liz9D1OIAac5Abp3hMOg4Jk0137V'], 'properties'],
  ['gm-19d169241a90532d', 0, 531480, 'IMG_3962.jpg', ['1WMylXzV7ggUDaFF7cC3XVds81X1WLi9A', '14vCiyvhORQYgaQhmhUV6uBpHsvPi-XdQ'], 'properties'],
  ['gm-19d1b148cdad166d', 0, 360487, 'IMG_3967.jpg', ['1FAScy6NDZ4TU57vEQ0tZBShmQwvr1S46'], 'properties'],
  ['gm-19d1bf70a202aea4', 0, 721070, 'IMG_3971.jpg', ['1vv0FqmvyRdF82G0YtIyC8HdYTUtSiQUN'], 'properties'],
  ['gm-19d2647307183ef9', 0, 644526, 'IMG_3992.jpg', ['19m6h1ZOwoA95qhlcZRHPOabrLjrimcIr'], 'properties'],
  ['gm-19d2b6120ef5187f', 0, 566811, 'IMG_3999.jpg', ['1SdDL73kUhzXfcgnbgzkMoV4YkuJbCRVr'], 'properties'],
  ['gm-19d3118d6bcc3a7f', 0, 359815, 'IMG_4013.jpg', ['17vyLW_Lov7jy1DD4VDzk-aNnKVcNm7w1'], 'properties'],
  ['gm-19d31434155164f2', 0, 460663, 'IMG_4015.jpg', ['1eCr7RcwPvSY5P8GQ4WP3X-VfYeVSsLea'], 'properties'],
  ['gm-19d3a4c4d7090e19', 0, 824971, 'IMG_4036.jpg', ['1qe2md31FSoN9I4rWO54ZVOD_JmjVQu9i', '1d1IOm9B-Vcj7uitHuVADusVdDDMlOMYN'], 'properties'],
  ['gm-19d3a708f16b12eb', 0, 617966, 'IMG_4037.jpg', ['1BtBaPshrV4mVSrLwRBOenc7Gvt8BGxAJ'], 'properties'],
  ['gm-19d3ee7e210a8af3', 0, 506241, 'IMG_4041.jpg', ['1mURtDEWrlutJSHNq34Xo4v1EoIwBrwFr'], 'properties'],
  ['gm-19d3fc513d1b8d07', 0, 438939, 'IMG_4044.jpg', ['1emFBemGhAl_r4LtPJF6MNfeJwIxzLiFM'], 'properties'],
  ['gm-19d400cec1201a16', 0, 325071, 'IMG_4049.jpg', ['1cHz0gwC_02zc6K2-80tiZsltYwk-V7Pl'], 'properties'],
  ['gm-19d4918fa3edc702', 0, 441908, 'IMG_4074.jpg', ['1h4YxdKFRSpAbUHO_7-2oB8MCQ9Em2Gsl'], 'properties'],
  ['gm-19d551c2e7db7daf', 0, 388353, 'IMG_4099.jpg', ['10v08OZCtgyCFNq0kw0EQenGZuw677oPG'], 'properties'],
  ['gm-19d5549008d4307d', 0, 519656, 'IMG_4101.jpg', ['18w1Eb2mmLWZlg0P0vhkuE4t1yvMRMF-u'], 'properties'],
  ['gm-19d62dc0a36bb7bd', 0, 667259, 'IMG_4141.jpg', ['1IFn_TDabMSIM9qWlUtXhbMTQKc4Sgbrq'], 'properties'],
  ['gm-19d6461d769e7e56', 0, 677421, 'IMG_4143.jpg', ['1C7ZiYTILoKbZKdoe7W9l8qekhlNuxSLe'], 'properties'],
  ['gm-19d6ec0ee16a06b1', 0, 425979, 'IMG_4168.jpg', ['1prvG_qA1CUtGWhs1xWYNQlU0MtrGGKN3'], 'properties'],
  ['gm-19d724c5c326c549', 0, 524671, 'IMG_4177.jpg', ['1VynliTBCglRE2pcQ_tceYqI8HUFy36Mu'], 'properties'],
  ['gm-19d74595d34b67cc', 0, 443434, 'IMG_4209.jpg', ['1qtfwfZ5rHggYY09Mo-Git2URX_YTNZSF'], 'properties'],
  ['gm-19d775f16740a511', 0, 788511, 'IMG_4211.jpg', ['1ZZWXBGKWFAz2naMpYCN9EWej-44hzf7h'], 'properties'],
  ['gm-19d86af34f4c2840', 0, 341323, 'IMG_4236.jpg', ['1WLb9yBnPVPFC-Xn2-uCZG2apqX9LlnC4'], 'properties'],
  ['gm-19d86e82a24ba657', 0, 793252, 'IMG_4237.jpg', ['1HHYSi4mYT9KjVqd9VTm-NxoP1Saj5bGQ'], 'properties'],
  ['gm-19d9299078f0128e', 0, 357447, 'IMG_4269.jpg', ['1GykOVMtogNUz8Pik2PBqfBiEIYgeV3d4'], 'properties'],
  ['gm-19df4b2c6e1e5aee', 0, 351420, 'IMG_4389.jpg', ['1aofcaYQVlfTB32MBbCFHKD2GfFiHEZy7'], 'properties'],
  ['gm-19dfabd73aaac412', 0, 181283, 'IMG_4395.jpg', ['1zee2qXfLQPYwbM3aONmsgiD9l9PRDQ9a'], 'properties'],
  ['gm-19e032c2f5fd1063', 0, 364121, 'IMG_4413.jpg', ['1B1FbFlGNqozUk0doeO0MOR7Fm8lyyrS0'], 'properties'],
  ['gm-19e07440dfd3573d', 0, 491395, 'IMG_4418.jpg', ['1Md0WohnlKtYa7dQuwlGD51rvwQ3wuKn8'], 'properties'],
  ['gm-19e69ec679ab8f42', 0, 733419, 'IMG_4558.jpg', ['1-OIs50ZrKPG9rof0jJp12VUkThYkvuYw'], 'properties'],
  ['gm-19e83a9d2e976907', 0, 376198, 'IMG_4622.jpg', ['1SRPWYMp3ZpRblhP89q105viEVitp--Lj'], 'paul'],
  ['gm-19e8f76c3b9efa8e', 0, 720519, 'IMG_4565.jpg', ['1KDhFh27_UAb0rDWG8DOgO68S8emtlIBm'], 'properties'],
  ['gm-19e8f79855b1df77', 0, 1104744, 'IMG_4594.jpg', ['11lbgLiCzUaFjHZXuamxLhPSxe9CfOd7N'], 'properties'],
  ['gm-19e8f7d48435a6ab', 0, 640029, 'IMG_4612.jpg', ['19h7m-zH1V0hkXqeWnCswf3R9A6W3v1eY'], 'properties'],
  ['gm-19e8f7ef66615f5a', 0, 698355, 'IMG_4634.jpg', ['1otRamOjlSOzJjS5fgFqNGZSfqty2E0XN'], 'properties'],
  ['gm-19ed8190a6945042', 0, 558976, 'IMG_4742.jpg', ['13lmoKP3M27zitW3HRAHZh0IvgkO9eQ-R', '1JpmFSfgWbeij8UmPeaKE2KJzwczu0KyV'], 'properties'],
  ['gm-19eea5d1a93a9656', 0, 821255, 'IMG_4785.jpg', ['1TCuGcstnP2KBJcC9loCD_5AzWMKCGOC1'], 'properties'],
  ['gm-19ef063b7f56ea6f', 0, 714689, 'IMG_4790.jpg', ['1V57oFP9HHqrdCTwVOxZz18JicVofDTa_'], 'properties'],
  ['gm-19f059f5de8379eb', 0, 689989, 'IMG_4836.jpg', ['1G8ILVb4CyjrFjMlXcjrFpzGmnX7YeVJe'], 'properties'],
  ['gm-19f15c359e34964b', 0, 700403, 'IMG_4902.jpg', ['1agh769exx2DuoCNce50dUuza_YlTSxpW'], 'paul'],
  ['gm-19f22f9951be5a8d', 0, 775159, 'IMG_4989.jpg', ['1RLMUeoNO3L3Zv1eHOXoyRmNykG_V3Bs8'], 'properties'],
  ['gm-19f386e6271bf3a3', 0, 371600, 'IMG_5020.jpg', ['1_jWAOGI5MIchSv9hMa4OIajKgyvP9HBs'], 'paul'],
  ['gm-19f3f696a2755181', 0, 776149, 'IMG_5073.jpg', ['1AmxXx39zdByBTNK79XAZcedLRHlfU3ci'], 'properties'],
  ['gm-19f3f6a3d8a8000d', 0, 533048, 'IMG_5074.jpg', ['1hNQpK-N75exrsr1D8ta2q_NbikCad0y1'], 'properties'],
  ['gm-19f3f6d3919a5816', 0, 482002, 'IMG_5078.jpg', ['1IQlL8qEdjwbQjV2QeFx__G2gFPVBf978'], 'properties'],
  ['gm-19f3f6e400041553', 0, 195646, 'IMG_5079.jpg', ['1fWwlZii0HrQ8xrzhHdA7m0HCULJa6w8R'], 'properties'],
  ['gm-19f3f6f42dde4929', 0, 481280, 'IMG_5080.jpg', ['1ZJ0zd0LF5MsGnUIJY5UzEjLMRMNLfnn-'], 'properties'],
  ['gm-19f44aea0050f298', 0, 319004, 'IMG_5119.jpg', ['1a7nt-uA_g_LBJseVa_KR4N7XAVIxIQg7'], 'paul'],
  ['gm-19fd41148faee741', 0, 292296, 'IMG_5350.jpg', ['1iZDw2_mFO5ogSpuCgBPWgnEaZu8ckhwV'], 'paul'],
  ['gm-19fdd35803f9b383', 0, 343318, 'IMG_5364.jpg', ['1WCU8QttxHfTpt3bnKqVueSWLonsJ8msv'], 'paul'],
  ['gm-19ff17e1bc0effd7', 0, 668073, 'IMG_5443.jpg', ['1Sf3mLx-4yZEnb5vdBm4ovpjufF9RS30M'], 'properties'],
  ['gm-1a04a3178e6ef1c7', 0, 656177, 'IMG_5601.jpg', ['1sF9pmJaUOwwXOzxuruTLMfuDI-ZrVHwF'], 'paul'],
  ['gm-1a05ef58a15ddc6b', 0, 706095, 'IMG_5630.jpg', ['112olxXa0Re96wCdbnOVkCIEH_3HBingi'], 'properties'],
  ['gm-1a063139bc9a9a33', 0, 934341, 'IMG_5652.jpg', ['1xTqOhPymTY3Rmsr6cS7cXB6gg6eclsr9'], 'properties'],
  ['gm-1a0679d10dfb58fc', 0, 679745, 'IMG_5663.jpg', ['1Cc5n079-sBSgOR_WLedbPXyISMXyWHyF'], 'properties'],
  ['gm-1a06f0f01ef0ea25', 0, 403077, 'IMG_5681.jpg', ['18c5l1cXnd3TTi4xDLRrxlaLC2wLLfysz'], 'paul'],
  ['gm-1a0c5fc0804acccb', 0, 358441, 'IMG_5798.jpg', ['1O9Onbxl6-7E60Yvl44VtNMa1oSehQraD'], 'paul'],
  ['gm-1a0eeb2f953e6bbd', 0, 701911, 'IMG_5868.jpg', ['1RqS64n8JkjqRGidlIdJJcXYJkJrGI7KF'], 'paul']
];
