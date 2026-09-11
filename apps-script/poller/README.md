# Recast Books Poller - setup

1. script.google.com -> New project, named "Recast Books Poller". Sign in as paul@.
2. Paste `Code.gs` in; add `appsscript.json` via Project Settings -> "Show appsscript.json in editor".
3. Run `setup` once (function dropdown -> setup -> Run). Grant Gmail, external-request and mail-send permissions.
4. View -> Logs -> copy POLLER_SECRET.
5. In the Netlify site `recast-books`, set env var `POLLER_SECRET` to that value.
6. Re-running `setup` is safe: it never regenerates the secret and never duplicates the `pollBooks`/`dailyDigest` triggers.
7. `dryRunBatch` (run manually from the editor) re-reads `DRY_QUERY` (default `newer_than:30d`) with `dryRun:true` and never labels a thread.
8. Script Properties `BOOKS_UPLOAD_URL`, `BOOKS_SUMMARY_URL` and `START_DATE` can be edited by hand if the deploy URL or the "never look before this date" cutoff changes.
