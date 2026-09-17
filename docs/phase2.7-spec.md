# Phase 2.7 — The bookkeeping front end moves into the workbook

Written 2026-09-15 for Paul's review before any code. Paul: the web app's calls to Sheets
take too long; the input side of the books should be custom menus in the workbook, and
the receipts poller and automation stay where they are. Phase 0/1/2 specs stay binding:
every write through the writer, Claude decides and code executes, D-010 enforced in code.

## 1 · Why it is faster

Today a click on the web app runs a Netlify function, which calls the writer over HTTP
(a cold Apps Script web app, 2–5 s), and reads come from Blobs snapshots that are up to
20 minutes old. A menu in the workbook runs in the workbook: `google.script.run` →
the same `action_*` functions → `SpreadsheetApp`, no network hop, live data. Roughly a
second per action.

## 2 · One project, bound to the workbook

Only a container-bound script can add menus, and the writer is standalone today. So:

- Paul creates the bound project from the workbook (Extensions → Apps Script). The whole
  writer (`apps-script/writer/`) is pushed there; `.clasp.json` gets the new script id.
- `openWorkbook_` prefers `SpreadsheetApp.getActiveSpreadsheet()` and stores its id as
  `SPREADSHEET_ID`; it never creates a workbook when bound. `setup()` adopts the existing
  Drive folder "Recast Books" as `DOCS_ROOT_FOLDER_ID` when exactly one exists, and fails
  loudly otherwise (a second folder would split the filing).
- The web app endpoint is deployed from the bound project. `WRITER_URL` and `WRITER_SECRET`
  on Netlify change once; nothing else on Netlify changes. The receipts poller never calls
  the writer, so it is untouched.
- The old standalone project's `onPropertyTabEdit` trigger is deleted (it would double-write
  `Advances.repaid_date`); the project itself stays as a dormant copy.
- Menu actions check the active user's row on `Users` (role `owner` to post; anyone listed
  may run reports). The workbook's own sharing is the outer gate, as it is for the tabs.

## 3 · Same engine, generated, not rewritten

`scripts/build-gs.mjs` writes `apps-script/writer/lib.gs` from `lib/coa.mjs`,
`lib/money.mjs`, `lib/posting.mjs`, `lib/accrual.mjs`, `lib/reports.mjs`,
`lib/property-key.mjs`: `import`/`export` lines stripped, files concatenated in dependency
order, a header naming the source, and a shim for the two Node calls `posting.mjs` makes
(`createHash("sha256")` → `Utilities.computeDigest`, `randomBytes(2)` → four random hex
chars). Nothing in `lib/` changes. `lib.gs` is never edited by hand; a test asserts it is
in sync with its sources (the `prompt-sync` pattern) and that no top-level name collides
with `Code.gs`. A `selfTest()` in the editor runs `buildEntry` on a fixture and
`accruedThrough` on 881 Newport's numbers after each push — the V8 runtime is expected to
take the modern syntax (`??`, `?.`, classes); this is where we find out.

## 4 · The **Recast Books** menu

Dialogs are `HtmlService` pages with the same fields as the web forms; pickers (accounts,
properties, bank accounts, vendors) are filled in-process. Every posting dialog shows the
balanced entry it built and the rule that fired (D-010, §274(d), period lock) before the
row lands — "which was Claude and which was code" is moot here, all of it is code.

| Menu item | Does | Rule |
|---|---|---|
| New expense… | expense dialog: date, payee, description, amount, account, property, paid from, trade, business purpose | `buildEntry({type:"expense"})` → `action_post_` |
| New journal entry… | grid dialog: date, memo, lines (account, debit, credit, property, payee, description, paid from, business purpose), live balance | `buildEntry({type:"journal"})` |
| Void selected entry… | the Journal row under the cursor → its `txn_id`; asks the reason | `action_void_` |
| Add property… | name, address, status, purchase date/price, contract price, tax annual, Dennis share %, settlement date, Dennis-funded, Drive folder, notes; then builds the tab | `action_upsert_("Properties")` + `setupPropertyTab` |
| Rebuild property tab | the tab under the cursor, or pick one | `setupPropertyTab` |
| Add advance… | date, amount, property, kind (purchase / cash), into (cash only: bank account or 2030), rate %, memo; posts, writes the Advances row, rebuilds the tab | the `addAdvance` flow from `books-dennis.mjs`, moved |
| Post interest… | period picker; lists each open advance's delta for the period; Post writes the batch and stamps `accrued_to` | `previewInterest` / `postInterest` flow, moved; refuses a period that has not ended |
| Close period… / Reopen period… | YYYY-MM prompt | `action_setPeriod_` (D-015 overhead lock; the property lock at sale is Phase 5) |
| Reports ▸ Trial balance / Balance sheet / P&L / Job cost / Dennis ledger | as-of (or from/to) prompt; writes the report to a tab named `Report · <name>`, overwritten each run, with its tie-out line at the bottom | `lib/reports.mjs` over the Journal read in-process; CSV is File → Download |

Vendors, Bank accounts, Settings, Users and Periods' notes are edited directly on their
tabs — they are plain tables and a dialog would only slow them down. Two guards keep the
rules that the web upserts enforced: an installable `onEdit` on `Bank accounts` mirrors a
new row into `Accounts` as `14xx Cash - <name>` (phase1-spec §4), and on `Users` refuses to
demote the last owner. Nothing else is guarded; the writer's own checks stand on every post.

## 5 · The web app afterwards

Stays: sign-in, Dashboard (automation status: queue counts, last poll, last digest, the
workbook link), Inbox, Upload, property mailboxes, and Settings reduced to the API-costs
section (D-018; it calls Anthropic, so it lives on Netlify). Goes: Journal, Properties,
Vendors, Banking, Dennis, Reports, Periods, and the Settings/Users editors — deleted from
`web/app.js`, not hidden. Functions deleted with them: `books-dennis`, `books-ledger`,
`books-reports`, and the POST side of `books-meta` (its GET reads still feed the Inbox
pickers and the model's tools). Their tests go too; `lib/` and its tests stay whole.

**Cache.** Netlify's Blobs snapshots refresh on Netlify writes and every 15 minutes from
the poller. A menu write bypasses both, so each menu action ends with the same fire-and-
forget `POST /api/warm-bg` the poller makes (`apps-script/poller/Code.gs` ~line 459,
copied), with `POLLER_SECRET` as a script property. Worst case without it: a property
added in the sheet is unknown to the Inbox pickers and the model's `list_properties` for
up to 15 minutes. The D-012 duplicate check already reads fresh.

## 6 · Inbox review in the workbook — built 2026-09-16

**Recast Books → Inbox…** opens a 600 px modeless dialog (`Inbox.html`; Sheets fixes a sidebar at 300 px) listing every pending document:
vendor, date, total, confidence, thumbnail (click to enlarge; PDFs link to the web Inbox),
Claude's note, the gate's reasons, and the same editable entries as the web card (property,
paid from, items with account/amount/description/purpose, running total against the
receipt). Approve, Dismiss (with a reason), Reprocess.

The queue **stays in Netlify Blobs** — one source of truth that the poller, the ingest job,
the web Inbox, the digest and the model's `search_docs` all read. The `Inbox` tab this
section once planned would have been a second copy of that state. What moved in-process is
the slow part, in two steps so the user waits only for the ledger write (8.4 s → ~2.5 s,
2026-09-16 late):

- **`inboxApprove`** (the click): owner check and posting ctx from 6-hour caches (cleared by
  every writer upsert or period change and by a hand edit on Accounts/Properties/Periods/
  Users), `buildEntriesFromModel` (`lib/gate.mjs`, generated into `lib.gs`) on the possibly
  edited entries, `POST /api/inbox {action:"mark-posted"}` **first** — refused `NOT_PENDING` if
  the web Inbox or the ingest got there, nothing posted yet — then `postBatchEntries_` under
  the writer's lock with the line-block refresh deferred. If the post fails after the mark,
  `mark-pending` puts the card back. The dialog shows "Posted <txn_id> · filing…" and the
  stopwatch line.
- **`inboxFinish`** (the dialog calls it at once; Apps Script runs it to completion even if
  the window closes): fetch the bytes from `/api/file`, file to Drive through
  `storeDocument_` (folder ids cached 6 h), write `doc_url` onto the Journal lines
  (`setDocUrl_`) and the envelope (`mark-posted` again with the same txn_ids patches only
  `doc_url`), rebuild the property tab's line blocks, poke the cache. A failure here is
  reported in red on the card but the entry is already posted.

Dismiss and Reprocess are the existing `/api/inbox` verbs, proxied.

Auth: the sidebar calls the site with the same `POLLER_SECRET` script property `warmCache_`
uses (`x-poller-secret`, now accepted by `/api/inbox` and `/api/file`); the Users-tab owner
check runs in the workbook first, and `by` carries the user's email into the envelope's
review record. The web Inbox stays as it was — it is still the place for Posted, Dismissed,
Dry runs and Errors.

Gate, 2026-09-16: from the sidebar, the day's Uber DFW ride (held on `PAYER_UNKNOWN`) was
assigned PAUL and approved; `receipt-20260916-4537a2213720-a381` posted and the envelope
was marked posted in the same click. No Drive file, correctly — the email had no attachment.

## 7 · Phase 3 under this shape

`docs/phase3-spec.md` is revised before it starts: "Import statement…" becomes a menu item
(file picker → `lib/statement.mjs` generated into `lib.gs` → `Feed` rows in-process), the
matching job stays a Netlify background function (it runs the model), and the Banking page
becomes the `Feed` tab plus a `Report · Reconciliation` tab.

## 8 · Not built

No library project, no add-on publishing, no second copy of the posting rules, no web
pages kept "in parallel", no change to the receipts poller, the ingest job, the gate, the
Drive filing, or `../Recast-site/`.

## 9 · Tests

`build-gs` sync test; lint of `lib.gs` + `Code.gs` for duplicate top-level names and for
Node-only globals (`process`, `Buffer`, `require`, `import`); the moved Dennis/ledger flows
keep their existing tests by testing the `lib/` functions they call (the handler tests are
deleted with the handlers); `npm test` green. In the editor: `selfTest()` passes.

## 10 · Gate

From the workbook, with the web app never opened: post an expense to 1616 Granite and see
it on the property tab; add a cash advance and watch the schedule row appear; preview and
post interest for 2026-08; void the expense; close 2026-08 and have a back-dated expense
refused with `PERIOD_CLOSED`; run the balance sheet to a tab and tie it out. Then, from
the web app, approve one Inbox card and confirm the writer at the new URL took it.

## 11 · Paul's steps (one at a time, when we start)

1. Open the workbook → Extensions → Apps Script; paste me the script id from Project
   settings.
2. Run `setup()` in the new editor and authorize.
3. Deploy → New deployment → Web app (execute as me, anyone) → paste me the URL.
4. Set `WRITER_URL` and `WRITER_SECRET` on Netlify (production context) and redeploy.
5. In the old project, delete its triggers.
6. Reload the workbook and run the gate with me.

## 12 · Gate result — 2026-09-15

Passed from the workbook, web app closed: two expenses posted to 1616 Granite through
the dialog (about a second each; the credit line named the item once that wording was
fixed), both voided from the Journal row under the cursor, 2026-08 closed and a back-dated
expense refused `PERIOD_CLOSED`, then reopened, the balance sheet written to
`Report - Balance sheet` and tying out, interest preview for 2026-09 showing all three
Granite advances (after clearing End Dates typed during yesterday's tab review, which had
marked them repaid 2026-07-27). From the web app, the Dashboard's Workbook card resolved
through the new writer URL. Found and fixed on the way: three manifest scopes the bound
project needed (`userinfo.email`, `script.external_request`, `script.container.ui`),
menu entry points that had private (underscore) names and so could not be invoked,
dialogs that closed before their result could be read, and the Netlify-era bank-account
mirror that had renamed Accounts 1401/1402 (mirror is now create-only; names repaired by
hand). Not exercised yet: Add property, Add advance, Journal grid, the other reports —
same code paths, to be used as they come up.
