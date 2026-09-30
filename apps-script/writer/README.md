# Recast Books Writer - setup

phase2.7-spec.md (D-023): this project is bound to the "Recast Books" workbook
(Extensions > Apps Script from inside the sheet, not script.google.com).
Menu.gs adds a **Recast Books** menu to the workbook for posting/reports in-process; the /exec web endpoint below still serves what the site itself needs.


**Live project (do not re-create it):** script id `1_V01CWkkO3MiGl1k4_lTgMZtInidFC4uTwQzj_h4aAPajL8cLMG1kl_y`,
bound to the production workbook "Recast Books"; web-app deployment
`AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w` = Netlify `WRITER_URL`.

- Change: `clasp push -f` from this folder. It reaches the menus, the sheet's Inbox and the triggers at once.
- **Then, if `Code.gs` or `lib.gs` changed:** `clasp deploy -i AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w`
  (Paul's step). The web app - both pollers, the web Inbox and `approve-bg` post through it - runs the
  deployed version of the whole project (audit §67).
- **Never** Deploy -> New deployment: that makes a new `/exec` URL, and `WRITER_URL`, both pollers and the
  Inbox would still point at the old one. Always `-i` the same id.
- `setup` is safe to re-run (same workbook, same secret, no-op). The first-time setup of 2026-09-11 is in
  `docs/phase0-spec.md` §10-§11 and `docs/phase2.7-spec.md`.

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
