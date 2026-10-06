# Operating notes - Recast Books

How to push, deploy and verify; what the session can and cannot do; tool gotchas. Read before any push or deploy, or
when live behaviour differs from the repo. The rules are in `CLAUDE.md`; this is the how-to. Gathered 2026-10-06 from
CLAUDE.md's operating notes, the handoffs' "gotchas met" sections and Claude's memory - add to it in place.

## Push, deploy, verify

- **Site:** `npm run deploy` (`netlify deploy --prod --no-build`). A production deploy: Paul's step - hand him the
  command as his one step, or run it from the session when he says "deploy" in chat. Record the site id in the
  CHANGELOG entry.
- **Writer** (`apps-script/writer/`): `clasp push -f`. A push reaches the menus, the sheet's Inbox and the triggers at
  once. **If `Code.gs` or `lib.gs` changed, also `clasp deploy -i
  AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w`** - the pollers, the web Inbox and
  `approve-bg` post through the web app, which runs the DEPLOYED version of the whole project (`refreshLineBlocks_`
  included, not just `doPost`). "doPost unchanged, no deploy" kept a tab fix off every emailed receipt for four days
  (audit §67). Always the same id, so `WRITER_URL` never changes; **never Deploy -> New deployment** (a new `/exec`
  URL breaks `WRITER_URL` and both pollers). The deploy is Paul's step. Verify: the web app's `/exec` answers
  `ok 0.4.0`, and `clasp pull` into a scratch folder compared with `git show HEAD:` says live = repo.
- `lib.gs` is generated from `lib/` by `node scripts/build-gs.mjs` - never hand-edit it; a test keeps it in sync.
- **Pollers** (`apps-script/poller/`): `clasp push -f` for the paul@ instance and `npx clasp push -f -P
  .clasp-properties.json` for the properties@ instance (git-ignored copy of `.clasp.json`); no deploy - a poller runs
  its latest saved code. Verify by a pull into a scratch folder and `cmp`. Push both after any poller change.
- **One-off scripts** (`apps-script/writer/oneOffScripts.gs`, constraint 9): a push only, no deploy. Paul runs one:
  Extensions -> Apps Script -> `oneOffScripts.gs` -> Run - the first function in the file is the one selected, so keep
  one function in the file at a time. `Code.gs` defaults to `setup` in the editor - never press Run there. Once run,
  the script comes out with a header line naming its commit.
- **Before any push or deploy:** `git status`, `git log`, and compare `clasp pull` with HEAD. Other sessions share
  this folder and a deploy carries whatever is on disk. Commit only your own files; never `git add -A`.
- `clasp login` expires every few days (`invalid_grant` / `invalid_rapt`): Paul runs `npx clasp login`; verify a
  push with `clasp pull`.
- `npm test` runs everything (node:test). `test/writer-gs-lint.test.mjs` fails on a function in the live files that
  nothing reaches, a call from them into the one-off file, a Journal row number typed into a tab formula (D-080), or
  an Inbox gate code with no plain-words translation.

## What the session can and cannot do (auto mode)

- **Refused:** writes to Netlify Blobs (even preparing the JSON locally), reading credentials or secrets, driving the
  Apps Script editor or the workbook's dialogs (they render in `iframedAppPanel`; the Chrome extension's clicks and
  typing never reach them), writing a Gmail-forwarding script. Each is Paul's one step.
- **Allowed:** `clasp push`; `clasp deploy` on his "deploy"; reading Gmail and Sheets in Chrome; typing a letter into
  an empty cell of the Taxes tab to rebuild it at once (the rebuild clears it); moving a tab with the tab menu.
- Leaving auto mode when Paul asks: `set_session_permission_mode(self, "default")` - the write then asks him.
- The permission check sometimes gives no verdict (an Agent call, `git push`) - try once more.
- Netlify secrets are masked to the CLI; `netlify env:set --secret` needs `--context production` (without it the value
  lands in the wrong context) and `env:get WRITER_URL` needs `--context production`. Paul types secrets in his own
  Terminal.

## Reading the live books

- **gviz through Chrome:** `https://docs.google.com/spreadsheets/d/<id>/gviz/tq?tqx=out:csv&sheet=<name>&headers=1&tq=<query>`.
  A `sheet=` name that does not exist answers one empty row, never an error - check the tab list first. Values only:
  a Receipt cell that reads `Receipt` is a link, an empty one has none.
- **Functions read** through `lib/sheets-reader.mjs` with `SHEETS_SA_KEY` set - the two-field JSON, not the base64
  file (Netlify caps an env value at 4 KB); without it, through the writer's `read` action.
- **The web app** is scriptable from Chrome with `localStorage.recast_books_session` sent as `Bearer` (never print
  it). Read-only calls (`GET /api/inbox?docId=<id>`) are fine; a reprocess or an upload needs Paul's yes first. Keep
  each call under 45 s (CDP timeout) and replace `=`, `&`, `?` in returned text (the extension blocks output that
  looks like a query string). Paul himself is never sent to the web app (constraint 8).
- **Chrome accounts:** `u/0` = paul@recast-properties.com, `u/1` = pvb421@gmail.com (script.google.com opens as
  pvb421 by default - never "Request access").
- **Gmail from Chrome:** rows are `tr.zA` (sender `.yW`, subject `.bog`, date `td.xW span[title]`);
  `get_page_text` returns nothing for the list and `javascript_tool` cuts its answer near 1.1 KB - keep rows short
  and read `window.__txt.slice(...)` in pieces; page with the `Older` button.
- **Drive is mounted on this Mac:** `~/Library/CloudStorage/GoogleDrive-paul@recast-properties.com/My Drive/`.
  `xattr -p 'com.google.drivefs.item-id#S' <file>` gives the Drive file id; `pypdf` reads the PDFs (the Read tool
  cannot render a PDF here - no `pdftoppm`); `os.rename` inside the folder is a Drive move. Far cheaper than the
  Drive connector, whose `read_file_content` returns empty text for some phone photos and long receipts - open those
  in Chrome and read by eye.
- **A lost Save:** the Apps Script editor's Executions page shows `inboxApprove` Failed when a card was marked
  recorded and nothing landed. Every Journal write now flushes inside the lock; the nightly check lists a document on
  no book.
- Sold houses' tabs are named `<house> - Frozen` - never look one up by the bare name. `ss.moveActiveSheet` after
  `setActiveSheet` in an editor run once scattered three tabs.

## Runtime limits

- The writer serialises every call behind its ScriptLock: fire re-reads one at a time, about 75 s apart. A lost
  `postBatch` reply usually landed - confirm on the Journal before posting again.
- A synchronous Netlify function dies at about 10 s (the proxy at 26 s) - never wait on the writer from one; the
  `-bg` background jobs do that (`approve-bg`, `settlement-bg`, `reconcile-bg`).
- Anthropic SDK: a non-streaming call above about 21k `max_tokens` throws "Streaming is required";
  `MAX_TOKENS_PER_TURN` is 16000.
- The bookkeeper's strict tools carry at most 16 nullable parameters - a 17th is a 400 before the model sees
  anything, and the scripted test client cannot see it. A new optional field takes a sentinel value, never `null`;
  a test holds the count.
- A "posted" envelope cannot be re-pointed at a new txn (`mark-posted` answers 409); `mark-pending` takes an
  in-process one back.
- `refreshBalanceSheetHourly` has run 241 s against a 360 s limit - watch it.
- The Mac sleeps and background work stalls (subagents die with "no progress for 600s"; a local read "took"
  1,058 s): run `caffeinate -i -t <seconds>` in the background before a long wait; save in small batches.
- Netlify function logs: `npx netlify-cli logs --source functions --function <name> --since 15m` - unreliable;
  prefer the envelope's `error` / `error_stack`.
- Apps Script: an underscore-suffixed function cannot be called from a menu or `google.script.run`; manifest scopes
  are explicit (`script.scriptapp` for triggers). The Netlify bundle injects `__dirname`.

## Email intake

- Home Depot's emailed receipt comes twice (the attached `eReceipt.pdf` and the body) - link the attachment. Lowe's
  "Your Lowe's Purchase Receipt" is the body. Floor & Decor's is a picture in the body.
- Amazon's newer order emails name no items - give Paul the order link
  `https://www.amazon.com/gp/your-account/order-details?orderID=<111-...>`.
- An email with more than six attachments or over 4 MB becomes several documents (`gm-<id>`, `gm-<id>-2`, ...).
  Before saying Paul left a receipt out, check his Desktop folders (`Squarespace Invoices/`, `Roddy Invoices/`) and
  these intake limits.
- A photo over 4 MB is stored as the largest Drive copy that fits (about 1 in 40), with a note on the document.
- Paul's subject lines, the notes above a forward and Zelle memos carry who paid and which house - the reader takes
  them first; search the mail listings before asking him.
