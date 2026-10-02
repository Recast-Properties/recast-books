// ONE-OFF 2026-10-02 (comes out of the project once run - git keeps it). Paul's two emails of 10-01
// ("quarespace receipts", 11 PDFs; "roddy report receipts", 9 PDFs) were read as their first six
// attachments only. With buildPayload_ now splitting a large email, each is sent again: the site
// skips the first document (already recorded) and reads the second - the five Squarespace invoices
// and three Roddy receipts that were dropped.
function resendLeftOffAttachments() {
  var props = PropertiesService.getScriptProperties();
  var secret = requireProp_(props, 'POLLER_SECRET');
  var uploadUrl = requireProp_(props, 'BOOKS_UPLOAD_URL');
  ['1a0fa2c63f283335', '1a0fa2cc1f917ff7'].forEach(function (id) {
    var payload = buildPayload_(GmailApp.getMessageById(id), false);
    var docs = [payload].concat(payload.rest).map(function (p) { return p.docId + ' (' + p.attachments.map(function (a) { return a.name; }).join(', ') + ')'; });
    var res = postUpload_(uploadUrl, secret, payload);
    console.log(docs.join(' | ') + ' -> ' + JSON.stringify(res));
  });
}
