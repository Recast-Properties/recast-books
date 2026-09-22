# Recast Books Poller - setup

1. script.google.com -> New project, named "Recast Books Poller". Sign in as paul@.
2. Paste `Code.gs` in; add `appsscript.json` via Project Settings -> "Show appsscript.json in editor".
3. Run `setup` once (function dropdown -> setup -> Run). Grant Gmail, external-request and mail-send permissions.
4. View -> Logs -> copy POLLER_SECRET.
5. In the Netlify site `recast-books`, set env var `POLLER_SECRET` to that value.
6. Re-running `setup` is safe: it never regenerates the secret and never duplicates the `pollBooks`/`dailyDigest` triggers.
7. `dryRunBatch` (run manually from the editor) re-reads `DRY_QUERY` (default `newer_than:30d`) with `dryRun:true` and never labels a thread.
8. Script Properties `BOOKS_UPLOAD_URL`, `BOOKS_SUMMARY_URL` and `START_DATE` can be edited by hand if the deploy URL or the "never look before this date" cutoff changes.

## Second instance: properties@ (phase2.6-spec.md §1, set up 2026-09-22)

Same code, running as properties@ so it can read the property labels. Paul (as properties@) creates the project and shares it with paul@ as Editor; from here `npx clasp push -f -P .clasp-properties.json` (a copy of `.clasp.json` with that project's script id, git-ignored), verified by a pull into a scratch folder and `cmp`. Script Properties are set by hand BEFORE `setup` runs (it would otherwise invent a new secret): `MAILBOX=properties`, `POLLER_SECRET` = the writer's, `BOOKS_UPLOAD_URL=https://books.recast-properties.com/api/upload`, `START_DATE=2026-09-17`. `setup` then creates only the `pollBooks` trigger (no digest in this mode). Each run POSTs the mailbox's labels to `/api/property-mailboxes` (`books-cache` key `mailbox/labels`) and searches every label that matches a registered property.
