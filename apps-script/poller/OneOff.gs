/****************************************************************
 * ONE-OFF 2026-10-02 (D-076), the tidy-up after the photo restore (the restore itself is in
 * commit history - `git log -- apps-script/poller/OneOff.gs`): on its next poll each account
 * clears the restore's script properties, and properties@ moves its folder of exported
 * originals ("books-restore-originals") to its Drive trash. Comes out with its line in pollBooks.
 * STATUS: NOT YET RUN
 ****************************************************************/
function restoreCleanup_(props) {
  try {
    var folderId = props.getProperty('RESTORE_FOLDER');
    if (folderId) DriveApp.getFolderById(folderId).setTrashed(true);
    ['RESTORE_FOLDER', 'RESTORE_EXPORTED', 'RESTORE_RUNS', 'RESTORE_DONE'].forEach(function (k) { props.deleteProperty(k); });
  } catch (err) {
    console.error('restoreCleanup_: ' + String((err && err.message) || err));
  }
}
