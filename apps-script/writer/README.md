# Recast Books Writer - setup

phase2.7-spec.md (D-023): this project is bound to the "Recast Books" workbook
(Extensions > Apps Script from inside the sheet, not script.google.com).
Menu.gs adds a **Recast Books** menu to the workbook for posting/reports in-process; the /exec web endpoint below still serves what the site itself needs.


1. script.google.com -> New project, named "Recast Books Writer".
2. Paste `Code.gs` in; add `appsscript.json` via Project Settings ->
   "Show appsscript.json in editor".
3. Run `setup` once (function dropdown -> setup -> Run). Grant permissions.
4. View -> Logs (or Executions) -> copy the workbook URL and WRITER_SECRET.
5. Deploy -> New deployment -> Web app. Execute as: Me. Access: Anyone.
6. Copy the `/exec` URL.
7. In the Netlify site `recast-books`, set env vars:
   `WRITER_URL` = the `/exec` URL, `WRITER_SECRET` = the secret from step 4.
8. Re-running `setup` is safe: same workbook, same secret, no-op.
9. Visit the `/exec` URL in a browser - it should show `{"ok":true,...}`.

Script properties the menu needs beyond what `setup` writes: `POLLER_SECRET` (the
Netlify env var of the same name) — the cache-warm poke and the Inbox sidebar send it as
`x-poller-secret`; optional `SITE_URL` (defaults to https://books.recast-properties.com).

## Files (D-056, 2026-09-28)

- `Code.gs` - the `/exec` web endpoint, the posting engine's Apps Script side, the property tabs, the
  onEdit trigger and the standing setup tools (`setup`, `installTriggers`, `setupTotals`,
  `rebuildAllPropertyTabs`, `selfTest`).
- `Menu.gs` - the Recast Books menu and everything its dialogs (`*.html`) call.
- `lib.gs` - GENERATED from `lib/*.mjs` by `scripts/build-gs.mjs`; never edited by hand.
- `oneOffScripts.gs` - every script run by hand from the editor: dated repairs, diagnostic reports,
  tuning helpers, the migration. **New ones go here, never in Code.gs or Menu.gs**; the file's header
  says how to add one and what its `// STATUS:` line means. `npm test` enforces the split: a function
  in Code.gs/Menu.gs that the menu, the dialogs, the trigger and `doPost` do not reach fails the lint,
  and so does a call from those files into oneOffScripts.gs. A one-off needs `clasp push`, not a deploy.
- `*.html` - the dialogs and the Inbox sidebar; `Style.html` is shared by all of them.
