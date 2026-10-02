# Recast Books — the bookkeeper app

Read `BUILD-PLAN.md` for what is being built and why, `docs/phase0-spec.md` for the
technical contract, and `docs/decisions.md` before proposing anything that reverses a
decision. `PLAN.md` is the accounting design the app implements.

## What this repo is

The bookkeeping system for Recast Properties LLC - **the real books since the 2026-09-21
cutover** (D-024). The old workbook is closed and the old receipts bookkeeper in
`../Recast-site/` is switched off for the books. A Google Sheets workbook is the system of
record; Claude is the bookkeeper; the workbook's **Recast Books menu** is the front door
(D-023, constraint 8). The web app at books.recast-properties.com carries the `/api/*`
functions the menu, pollers and nightly jobs call - Paul is never sent there.

- `web/` — static front end (Netlify publish dir); `netlify/functions/` — `/api/*`;
  `lib/` — pure modules (posting engine, auth, writer client, COA, money), unit-tested;
  `apps-script/writer/` — the only thing that writes the workbook; `docs/`, `data/` — design.
- Live ids (workbook, Apps Script project, Netlify site) are in `docs/phase0-spec.md` §10.
- `npm test` runs everything (node:test, no test dependencies). Deploy: `npm run deploy`
  (`netlify deploy --prod --no-build`). Writer: `clasp push -f` from `apps-script/writer/`, then **`clasp deploy -i
  AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w` after every push that touches `Code.gs`
  or `lib.gs`** (same id, so `WRITER_URL` never changes). A push reaches the menus, the sheet's Inbox and the triggers
  at once; the web app - what both pollers, the web Inbox and `approve-bg` post through - runs the deployed version of
  the WHOLE project, `refreshLineBlocks_` included, not just `doPost`. "doPost unchanged, no deploy" kept the §61
  spacer fix off that path for four days (audit §67). The deploy is a production deploy: Paul's step, like `npm run deploy`.
  A change only to `oneOffScripts.gs` needs the push alone - the editor runs the pushed code (D-056).

## Load-bearing constraints

1. **Never touch the old workbook** (`1isEbfNKPO32Wpf08EtLkNHX85c0rTIl8tpH9bUdgQbs`),
   anything under `../Recast-site/`, or the two live receipts Apps Script projects.
   Migration reads the old workbook; nothing here ever writes to it.
2. **Every write goes through the Apps Script writer** behind its ScriptLock. No Sheets API
   writes from anywhere else. **Reads** come off it (D-047, 2026-09-25): with `SHEETS_SA_KEY`
   set, functions read the tabs through the Sheets API as a Viewer service account
   (`lib/sheets-reader.mjs`); without it, through the writer's `read` action as before.
3. **Claude decides, code executes.** Model judgment for reading, classifying, matching;
   deterministic code for arithmetic, balanced entries, `txn_id` identity, the gates
   (autofile ceiling, period lock). The UI must show which was which. A 1099 block (no payment
   to a payee over the threshold without a W-9, `docs/policies.md`) is planned, **not built**.
4. **Overhead never touches a property** (D-010). **Every Dennis advance is against a
   property and its interest is that property's cost** (D-011, D-021, D-022). D-010 is
   enforced in `lib/posting.mjs`; the interest math is `lib/accrual.mjs`, and **Dennis's interest is
   recorded at closing** by the sell wizard, not monthly (D-066; each advance carries its own `rate_pct`, D-022).
5. **Dry run, back up, tie out twice** for anything touching history (Phase 4). **The old
   books are the target (D-027):** the migration reproduces them row by row in the new
   system with the receipt linked; the read is evidence, the old row wins, differences go
   through the corrections register.
6. **Paul acts one step at a time.** When he must do something (console, editor,
   Terminal), give exactly one step and wait.
7. **Plain words, always (Paul, 2026-09-26: "i'm not an accountant. talk to me like im 5 years
   old").** Everything Paul reads in the books - chat replies, the steps you give him, Inbox
   cards, the digest, the bookkeeper's `why`, the nightly check - is in everyday words: what
   happened, what it means for him, what to click, with the store, the date and the dollar
   amount. No accounting or system jargon (entries, posted rows, migrated, ledger, journal,
   gate, envelope, txn ids, account codes, reason codes like PARTLY_ON_BOOKS); if a word would
   need explaining, use a simpler one. Ids go on a separate line for Claude ("Paste to Claude:
   ..."), never in the sentence Paul has to understand. Say plainly what something is NOT when
   he could take it the wrong way ("not a duplicate - these two items were never recorded").
8. **The books are in Sheets (Paul, 2026-09-28: "the books should be only in sheets now").** Paul
   works in the workbook - its menus, the Inbox (Recast Books -> Inbox...), an editor helper he runs
   once. Never send him to books.recast-properties.com; re-reading documents from a session is an
   editor helper calling `siteFetchJson_` reprocess, as the Inbox's Reprocess button does. Stay on
   the task in hand; flag anything new in one line and ask before chasing it.
9. **Hand-run scripts live in `apps-script/writer/oneOffScripts.gs` (D-056, 2026-09-28) and come out once they have
   run (D-066, 2026-09-30) - git keeps them; all 42 up to 09-30 are in commit 774ecd3.** `Code.gs` and
   `Menu.gs` hold only what the workbook reaches (the menu, its dialogs, the trigger, `/exec`) plus the
   standing setup tools (`setup`, `installTriggers`, `setupTotals`, `rebuildAllPropertyTabs`, `selfTest`).
   Every dated repair, diagnostic report or tuning helper goes in `oneOffScripts.gs` with a `// STATUS:`
   line, appended to its section - the file's header says how. `test/writer-gs-lint.test.mjs` fails on a
   function in the live files that nothing reaches, or a call from them into the one-off file. A one-off
   needs a `clasp push`, not a deploy.

## Status

**Now (2026-10-02): LIVE on the real books since the 2026-09-21 cutover. Phases 0-2.7, 4 (migration) and 5 (sell wizard) done; THE MIGRATION IS CLOSED (D-067, `docs/migration-leftovers-final.md` - every leftover settled; a migration-era item that turns up later is Claude's to settle quietly, never a new list for Paul). Phase 3 (bank statements) in progress - import, matcher, Citizens Bank tab and its bank check live. Writer web app **@27** (10-02 08:40 PDT), site **`6abfd7ae`** (10-02 09:11 PDT), writer and both pollers pushed = the repo - nothing owed. 550 tests. **The closing tab's layout as it stands is `docs/phase5-spec.md` section 3a (decisions D-069..D-072).** Resume from `HANDOFF-2026-10-02.md` (then `HANDOFF-2026-10-01.md` for the closing tab); the dated bullets below are the history, newest near the end.**
History: Phases 0, 1 gated 2026-09-11; Phase 2 gated 2026-09-12; Phase 2.5 (read cache) shipped 2026-09-12; hardening 2026-09-14 (invoice-keyed txn_id, cache warmer, Totals tab, voided pairs hidden; D-015 two locks, D-016 Dennis 8%); Phase 2.6 (property mailboxes via a properties@ poller, property tabs, D-017 Held/Sold) built 2026-09-14. Poller audit 2026-09-16: HEIC photos now convert (`heic-convert`; jimp never could), `error` envelopes the model never reached are retried by the warm job (max 2).
Phase 0 gate: `docs/phase0-spec.md` §11. Phase 1 gate: `docs/phase1-spec.md` §8. Phase 2
(receipts bookkeeper — Claude directs the read with zoom/ledger/vendor/property/docs tools,
`lib/gate.mjs` enforces the rails, Gmail poller + web upload, Drive filing, Inbox/Upload
pages, 3 AM digest) is **live for receipts@/travel@ mail dated 2026-09-11 onward** and
posts to the new workbook only. Gate record: `docs/phase2-spec.md` §11. Reads come from Blobs snapshots (`readTab`,
`docs/phase2.5-spec.md`); every write handler refreshes the tab it wrote. Phase 2.6
(`docs/phase2.6-spec.md`) adds a second poller instance running as properties@ for the
property mailboxes and a formula tab per property (layout settled with Paul on 2026-09-15:
the tab is the forecast while held; the closing tab is Phase 5). D-022: advances are
`purchase` or `cash`, each with its own `rate_pct`; `Properties.dennis_share_pct` (50, or 0
for a bank-only deal) drives the split. **Phase 2.7 gated 2026-09-15 (D-023): the input side of the books is the Recast Books menu in
the workbook** (`docs/phase2.7-spec.md`): the writer is now the project bound to the workbook
(script id `1_V01CW…kl_y`, web-app deployment `AKfycbxNisU…3w`, update it with `clasp deploy -i`);
`lib/` is generated into `apps-script/writer/lib.gs` by `node scripts/build-gs.mjs` (never
edit it; a test keeps it in sync); the web app kept Dashboard, Inbox, Upload, Settings (API
costs) - since D-064 the API-costs page is gone and Paul is never sent to the web app (constraint 8). The old standalone writer project is dormant. **Inbox review in the sheet built 2026-09-16**
(spec §6: Recast Books → Inbox… sidebar; the queue stays in Blobs, Approve files and posts
in-process, `mark-posted` records it; `lib/gate.mjs` is in `lib.gs` now; approve is split so the
user waits only for the post, ~2.5 s - see CHANGELOG 2026-09-16 late). Next: **Phase 4
migration, forensic, ahead of Phase 3 (D-024, 2026-09-16)** — audit done 2026-09-17
(`docs/phase4-audit.md`, snapshot in `data/migration/2026-09-17/`). Listings, reads (946 docs)
and the staging re-posts done 2026-09-17/18. **Method changed 2026-09-18 (D-029): the
migration is row-driven - post the old row, attach the matched receipt (D-027 the old books
are the target, D-028 returns hold for Paul). **Resume from `HANDOFF-2026-09-30.md` (then `HANDOFF-2026-09-29.md`, `HANDOFF-2026-09-28.md`, `HANDOFF-2026-09-26.md`, `HANDOFF-2026-09-25.md`, `HANDOFF-2026-09-23.md`, `docs/phase4-audit.md` §51-§67)** - dated state from the migration (2026-09-23) through 2026-09-30 late (D-066):
- **Numbers:** dry run **1,048 entries, $240,844.35**, ten property totals (`rows/expected.json`), all build in the posting engine; **920 linked (87.8% of rows, 78.6% of dollars)**; 128 rows / $51.4K with no document, of which $36,880 Paul accepted (contractor checks and cash) - the rest is cash labor and small rows, proven in Phase 3. 33 advances. Corrections **C-1 … C-34** in audit §13 (C-34 added 2026-09-29); decisions D-027 … D-034 (D-034: property tax - payments post when paid, the closing proration posts at closing, the tab estimates in between).
- **CUTOVER DONE 2026-09-21 (audit §51):** the production Journal was born in one pass - 1,048 entries, $240,844.35, $0.00 on all ten properties, 922 linked (every link a Drive file), 33 advances - tied out on both paths and identical to staging pass 11. `WRITER_URL` points at PRODUCTION; the old receipts poller's triggers are deleted (2026-09-22, §52); live receipts post to the real books. Corrections C-1 … C-33. **2026-09-22 (§52-§54):** the doGet misfire found and fixed in `lib/writer-client.mjs` (reads retry, writes never); `why` is one sentence, the working is in `checked`; the property tabs rebuilt and every one reconciled to the old workbook (Ashburne's heavy layout redone as Paul drew it; Selling-class lines now show on the light tabs). **2026-09-22 later (§55-§56):** the Inbox's 387 migration leftovers dismissed (18 left: 12 parked Home Depot / Lowe's for Phase 3, 6 live); the properties@ poller is ON (project `1k2htSsuL…`, `MAILBOX=properties`, `START_DATE=2026-09-17`, `clasp push -P .clasp-properties.json`); its first reads were refused as `reasoning_extraction` - `checked` reworded, server-side fallback on every model call. The old workbook is **"Recast 2026 CLOSED 2026-09-21"** (duplicate Materials cells deleted, only paul@ has access) and staging is ARCHIVED (§57). Anthropic $13.06 was already linked (card fixed). **D-035 (§58): no attachment, the email is the receipt** - upload stores it as `email.txt`, every filing path links it; writer `setDocUrl` action (web app @4); Wi-Fi Onboard and Berrett linked. **PHASE 5 BUILT AND BOTH CLOSED SALES POSTED 2026-09-22 (audit §60, `docs/phase5-spec.md`, D-036…D-039):** one menu item `Sell property…`, four steps - upload the closing document, Claude reads it and fills the form (`/api/settlement` + `-bg`, a background job: a sync function dies at 10 s), preview, close. 1616 Granite (profit 109,178.56, Paul 28,489.52 = the old tab to the cent, holdback of 60,000 released 09-11) and 280 Sparkling (profit 60,930.09 = the old tab, read from its PDF at Recast's 50% share, D-037) are both closed, escrow and Dennis at zero. 453 tests. The closing tab is written beside the property tab (`CLOSING_TAB_IN_PLACE`) until Paul signs the layout off. **Open:** that sign-off; Newport and Ashburne when they close; then Phase 3.
- **2026-09-23, the heavy tab and the Inbox (audit §61-§63):** `setupPropertyTab` inserts the left spacer column AFTER writing the grid, so a block sits one column right of where it was built; the light template's `deleteColumn(8)` cancelled that, and `8b5138b` made the delete `!heavy` (to keep column H = Interest), so `refreshHeavyBlocks_` was writing every refresh one column left - into the spacer - and the blocks under their headers went stale. **Both of Paul's symptoms, one cause**; the summary was never wrong (SUMPRODUCTs over the Journal, not the blocks). A block's column is now read from its own header. Also: an untraded Holding line falls under Utilities (the model leaves `trade` null on a utility bill). **The Ashburne tab still needs one rebuild to clear the spacer text** - `rebuildAllPropertyTabs` now does it along with everything else. Inbox (D-040, D-041): every bullet is an action Paul takes and nothing else is a bullet (`why` and `checked` collapsed under "Claude's read"); gate codes are translated and a lint fails if a new one is not; **property is per item** with the entry's select as "set all", and Approve splits one entry per property; the account picker is grouped Property costs / Business overhead / Cash and other; live D-010 check ("Business account on a property - set 6510 to OVERHEAD"); a trade picker, offering the trades the tabs group by. 455 tests.
- **2026-09-23, the light property tabs (audit §64, D-042) - light template only, 104 Ashburne untouched:** the **Dennis commission rows are gone** from Payouts (his line and Paul's `Less Dennis commission`) - he charges none on a partnership deal; the commission stays a **bank-deal** term (`dennis_commission_pct`, the heavy tab's line, `lib/sale.mjs`'s 1210 entry at closing, D-036). **`Due to Paul (paid less reimbursed)` → `Paul Paid (direct)`** (label only). **`Concession (type it here)`** added to the Profit Breakdown below Closing % - the heavy tab's cell, blue, kept across rebuilds, subtracted as `-ABS(...)` so a hand-typed minus cannot turn a credit into profit. **`Received (advances, refunds)` split into `Received (advances)` + `Received (refunds)`** on payee (an advance's two lines both carry `Dennis Little`, `buildAdvance`; a refund is a negative cost row carrying its vendor) - an **exhaustive partition**, so a payee the rule does not expect can only move a line between the two rows, never out of the block total; verified against the books first (33/33 advances `Dennis Little`, all 7 negative rows vendors). **Dennis Paid (direct) keeps ONE Received row**, unfiltered: a direct-paid Dennis cost *is* an advance, so an advances row there could only read zero (Paul agreed, removed). 455 tests, pushed, no deploy.
- **2026-09-23 evening, receipts on the tabs and the frozen record (audit §65, D-043):** every line block (light AND heavy) gained a **Receipt** column after Amount - `receiptCell_(doc_url)` writes a HYPERLINK, blank when there is no document, so the column doubles as which lines have one. Offsets are constants now (`PT_BOX_OFFSET = 5`, `PT_TXN_OFFSET = 8`, `PT_BLOCK_COLS = [10, 19]`; heavy is `PT_HEAVY_COLS = 5` with `PT_HEAVY_STRIDE = PT_HEAVY_COLS + 1`) because **the spacer column is what gets missed when a block grows** - Paul warned about it and he was right, the spacer's width was still coming off a literal `c0 + 4`. `lineDescription_` falls back to the entry `memo` for a line with no description (a sale's release lines have none), so the settlement rows read "settlement statement" / "project cost released to COGS" instead of nothing - no backfill needed, the memo was always there. **D-043 REVERSES phase5-spec §3: the property tab is FROZEN at closing as the record, the closing tab stays separate, `CLOSING_TAB_IN_PLACE` stays false forever and its sign-off is moot.** `sellPost` freezes the tab (formulas -> values) immediately before it posts; `setupPropertyTab`, `refreshLineBlocks_` and `onPropertyTabEdit` all leave a sold property alone. `setupPropertyTab(name, asOf)` is the one exception - it reconstructs the pre-sale record by dropping `source = "sale"` rows **by source, not by date** (Granite has a real cost dated the day it closed). **Six-hour hole found and closed:** `sellPost` wrote `status = sold` straight to the sheet, which clears no cache and fires no trigger, while `buildCtx_` caches the postable property set for 6 h - so a receipt could post onto a just-sold property; it now clears `ctx` on the spot. New editor helpers: `reportStrandedCosts()`, `rebuildFrozenRecord(name)`, `rebuildAllFrozenRecords()`. **Granite's 178.48 was a duplicate on the wrong property** (the 2026-02-19 Home Depot rows already migrated onto 104 Ashburne, replayed 1h49m after the sale posted) - voided, not recaptured; 280 Sparkling clean. Granite: revenue 430,000.00, COGS 375,410.72, rehab only 9,713.97. 463 tests, pushed, no deploy.
- **2026-09-25 (D-044..D-046, `HANDOFF-2026-09-25.md`):** D-046 a utility payment matching nothing on the account posts; `checked` was being dropped by `normalizeDecide` since 09-22 - kept now; a lost postBatch reply is confirmed on the Journal; ledger window 365 days (deployed); two replay duplicates voided; Atmos 67.39 posted. Inbox: 9 parked hardware receipts only.
- **2026-09-25 evening - THE PLAN DEPLOYED (D-047, live 15:32 CT):** reads come off the writer (`lib/sheets-reader.mjs`, a Viewer service account `books-reader@recast-admin`; `SHEETS_SA_KEY` is the two-field JSON, not the base64 file - Netlify caps env at 4 KB; tie-out nine tabs identical, warm run 2 s), approve posts in `/api/approve-bg`, the nightly books check `/api/reconcile-bg` at 2 AM (code gathers, the model judges, digest prints it first; ran clean by hand). The four unlinked 09-17/18 email receipts are filed. Next-session list at the end of `HANDOFF-2026-09-25.md`. 480 tests.
- **2026-09-26 (`HANDOFF-2026-09-26.md`):** the 3 AM digest's Pending line is one short line per item - `digestReason_` in the poller, the Inbox card's wording (lint keeps the maps identical), never the model's working; pushed to both instances. Frozen records re-run by Paul and tied out (Granite = Journal). Found and left: three Granite costs dated after its closing (2,738.24) are inside its 09-22 closing, so moving them to Cost Recapture would count them twice. Phase 3 plan put to Paul - nothing built, waiting on his go. **Every document audited, nothing lost; the nightly check now proves it every night** (`receipts_on_no_book`, `lib/migration-record.mjs`) - 483 tests, **deployed 2026-09-26** (Paul) - first run at the 2 AM check.
- **2026-09-26 night (D-048..D-050, `HANDOFF-2026-09-26.md` top, CHANGELOG):** the Inbox's four parked cards - a PDF opens in one click (writer `inboxFile`); the bookkeeper itemizes one item per printed line and a hold still proposes its entries; **Reprocess never posts or dismisses** (`holdOnly`); a read can say a receipt is **partly on the books** (`already_posted_txn_ids`, amounts from the Journal, `PARTLY_ON_BOOKS` always holds; `read_ledger` takes `date`); nothing proposed is `NO_ENTRIES`; the web Inbox's editing copy belongs to one read. Five cards re-read and tied out: 437.46 on no book - **Paul decided all five that evening (Inbox empty 2026-09-28); not open.** Later: **plain words for Paul** (constraint 7) on the cards, in the receipt notes and the nightly check; **each card line has Approve / Returned / Dismiss, Save does what each says** (the rest goes in the note a store credit is matched to). 488 tests, all deployed (`6ab89032`). **Resume from `HANDOFF-2026-09-28.md` START HERE.**
- **2026-09-26 late (audit §67):** Paul's spacer text on 104 Ashburne came back because the writer **web app** was still on version 4 (09-22 morning) - a push reaches menus and triggers, the web app runs its deployed version of the whole project, so every emailed receipt rewrote the tab in the pre-§61 layout. Paul deployed @5 (= the repo) and rebuilt Ashburne; every tab read back clean. The writer rule above now deploys after every push touching `Code.gs` or `lib.gs`.
- **2026-09-28 (D-051..D-053, `HANDOFF-2026-09-28.md`):** Phase 3 started - it reconciles Recast's own accounts only (Citizens 1401 ends 2505, cards 5450 Paul / 9301 Dennis; Chase 1402 ends 6317, Paul's business only, opened with Ashburne's $2,000 earnest money); Paul's personal statements never come in. Every advance has `paid_to`; the migration's "Chase" was Paul's personal account, so `fixAdvancesPaidTo()` moved the draws off 1402 (Chase 153,450 -> 0, Recast owes Paul 185,116.88 -> 31,666.88, verified). D-053: Dennis's bank-deal commission is on the sale price less concessions. **104 Ashburne SOLD 9/23 (775,000), not closed in the books - waiting on Dennis's final interest (~10-05)**; the books say interest 44,900.41 (compounded), payoff 568,721.85 (550,000 already taken), Paul's profit 146,221.94. Writer **@7**; 490 tests. Citizens QFX first pass done (fixture on Paul's Desktop). **Evening (D-054):** Ashburne's heavy tab counted 13,416.39 of the property tax twice - the tax is in Rehab Total now (Paul rebuilt the tab, verified). Paul decided Dennis's eight direct worker payments: seven were missing jobs, posted by `addAshburneMissingBills()` (1,419.00, verified) - Recast owes Paul 4,033.86 on Ashburne, profit by the books 144,802.94. Writer web app **@8** (deployed 2026-09-28 on Paul's "deploy", = the repo). **Late morning:** the 18 parked Ashburne receipts re-read into the SHEETS Inbox (`reprocessParkedAshburneReceipts()`) and decided by Paul - 2,046.96 posted, Ashburne owes Paul 5,940.12, profit by the books 142,896.68; an empty card now shows a full typed line; the Inbox load reports progress (CHANGELOG 09-28 late morning). **Midday:** two fixes deployed (`search_docs` checks the Journal before believing a "posted" copy - site `6abab654`; the sheet's Save files email-only receipts as `email.txt`, this morning's five linked). **Afternoon:** the 42 Amazon orders only in pvb421 forwarded to 104ashburne@ by Paul's one-off script (`scripts/forward-amazon-orders-pvb421.gs`) - the bookkeeper sorts them itself (Paul's rule); the finite list of what is still out there is in `HANDOFF-2026-09-28.md` START HERE. **13:15:** the 42 settled (31 + 4 posted, 4 + 3 dismissed, Claude's four duplicate calls all verified); Ashburne at the end of the day: costs 510,857.62, owes Paul 9,716.18, profit 139,120.62 (pickets 71.71 added on Paul's word; the 11.01 knob was a return). The reader reuses a house's sections (site `6abac7f7`); `retagAshburneTrades` moved 72 lines. **A replay helper must never touch a pre-cutover document** - the first `replayErroredReceipts` run posted three onto migrated rows, voided the same hour (`undoReplayedMigrationDocs`). Next: the 18 parked Ashburne receipts into the SHEETS Inbox via an editor helper, then ~40 pvb421 Amazon orders - `HANDOFF-2026-09-28.md` START HERE.
- **2026-09-28 afternoon (`HANDOFF-2026-09-28.md` START HERE, CHANGELOG 13:15-16:15): THE FINITE RECEIPTS LIST IS CLOSED** - the 11
  parked (`reprocessParkedMigrationReceipts`, `reprocessParked_` runs both parked lists), Cash App (39 family, 1 in the books, 1
  personal), Harbor Freight (4 in the books, 1 returned), the 14 May-Sep Amazon orders (`scripts/forward-remaining-pvb421.gs`; 7
  recorded, 7 not; two card stumbles fixed). Fixes: the Granite toilet kits (void + the 20.54 filter alone), the 09-02 gimbal at
  137.06, the Ashburne sections (`retagAshburneTrades` takes every live line; `heavyBlocks_` builds no header from a voided line).
  **Sold houses keep their mailbox** (site `6abaed41`; costs land on Cost Recapture). **Heavy tab: `Paid by Paul (not yet paid
  back)` inside Total Project Cost (All in), and `Property Tax` is a section** (blocks sum to Rehab Total). Writer **@10**.
  Ashburne: costs 511,260.29, owes Paul 10,118.85, profit 138,717.95 (tab 127,584.28 - its estimates). 502 tests.
  Amazon's newer order emails name no items - give Paul the order link; the readers' `list_properties` stays held-only.
  **Next: Phase 3** (bank statements) - nothing else is open.
- **2026-09-28 evening - PHASE 3 STARTED, step 1 built (CHANGELOG "evening"):** `Recast Books -> Import statement...` lands a
  bank's QFX/OFX export on the **Feed** tab (`lib/statement.mjs` `parseOfx`, in `lib.gs`; `importStatement` in Menu.gs;
  deduped on FITID; account by `Bank accounts.last4`, comma-separated; the dialog says whether the Feed ties to the bank's
  balance). Paul's real Citizens export ties to the cent (73 lines, 170,800.07); **imported by Paul 16:20 PDT, tied out on
  the live Feed tab** (writer @11). **Step 2 built the same night (CHANGELOG "night"): the matcher** - `Recast Books ->
  Match statement lines...` runs `/api/feed-match` (`lib/feed-match.mjs`: Claude gives every line match / propose /
  question / later, code checks every match to the cent, verdicts land through the writer's `feedUpdate`, proposals and
  questions are Inbox cards that tie their Feed rows on approve/dismiss - `tieFeedRows`). Nothing autofiles from a bank
  line. **Run on Citizens the same evening and graded: 52 of 73 tied (every match checked right against the Journal), 19
  cards for Paul, 2 waiting on the Ashburne close** (CHANGELOG "late night", "late night, 2", "17:10"): a few cents
  tolerance, Vendors aliases in the prompt (Effren = Falcon Creek), `resetFeedCards()` for the tuning loop, and the
  Feed-row tie moved INTO the workbook (`tieFeedRows_` on the sheet's approve/dismiss) - a synchronous site function must
  never wait on the writer. Site `6abb023f`, writer @12 (+@13 owed). **D-055** (17:29): the partners' working money (Dennis 5,000 08-06, Paul
  4,858.42 08-13) is a plain loan - no house, no interest - posted by `addWorkingCapital()`; Citizens **54 of 73** tied,
  17 cards, 2 waiting. A dismissed bank-line card goes back to `unmatched` with "Paul: ..."; the card says which button
  answers it. Next: Paul's 17 cards; then reconciliation (§4), the Daily Summary feed (§6a). 525 tests.
  **Resume from `HANDOFF-2026-09-28.md` START HERE.**
- **2026-09-29: the sheet's Inbox has two tabs - Receipts | Bank statement** (Paul asked for the bank statement's
  questions apart from the receipts; one Inbox, not two). `Inbox.html` only: `tabOf_(env)` puts a `source === 'feed'`
  card on Bank statement, everything else on Receipts; each tab carries its count; the filter searches the open tab.
  Pushed, confirmed by Paul in the live workbook. 520 tests. **Writer web app @13** (deployed 2026-09-29 on Paul's
  "deploy", = the repo) - no deploy owed. **08:05:** `Match statement lines...` asks which bank by NAME, a Yes/No click,
  one bank per run (Menu.gs, pushed, no deploy). Asked by Paul, not built: a "need receipt from Dennis" placeholder
  (CHANGELOG 09-29 08:05 - `supersedes` is the swap; put to Paul first). **Built the same morning (D-057, CHANGELOG
  "morning"):** a Bank statement card's **Waiting on receipt** button records the charge as one line `NEED RECEIPT FROM
  <NAME>` on the house Paul picks; the receipt, if it comes, REPLACES it (on its own when the read names it and total
  and payer agree, else a ticked box on Paul's card); the placeholder is voided on its own date and its bank lines move
  (`feedRetie`); the 3 AM email lists what is still waiting. No holding account - a charge with no house stays a card.
  532 tests. **LIVE 08:35 PDT on Paul's "deploy": writer web app @14, site `6abbda5b`, both pollers pushed - all = the
  repo, no deploy owed.** Not yet used on a real charge. Known and left: a held card's `supersedes` that is NOT a
  placeholder is still not honoured by either Inbox's approve (CHANGELOG 09-29 "morning") - **FIXED 08:50 (D-058):** the
  card's yellow box names what it replaces, Save voids it (today) and moves or frees its bank lines; the web Inbox
  refuses such a card. 534 tests. **LIVE 08:50 PDT: writer web app @15, site `6abbdd95` - both = the repo, nothing
  owed.** Neither D-057 nor D-058 has run on a real charge yet; the live Feed tab and the Inbox were not read on
  09-29. Next: Paul's Bank statement cards, a fresh Citizens file for Dennis's 09-28 charges, then the reconcile step
  (spec section 4). **Resume from `HANDOFF-2026-09-29.md` START HERE.**
- **2026-09-29 late morning (D-059): which card paid a bank line is read from Citizens' Daily Summary email** - the
  bank's file names no card. The paul@ poller sends each summary to `/api/bank-mail` (kept as it came under
  `bankmail/`, no label on the mail, `BANK_MAIL_LAST`); `lib/bank-mail.mjs` reads it (code, not the model; fails
  closed - a summary must add up to its own total, one card per day-and-amount or none); `runFeedMatch` puts the card
  on the model's line and on the Inbox card (`feed.card`), which starts Waiting on with its holder. **Live: site
  `6abbe34c`, writer pushed (web app still @15), both pollers pushed.** Checked against the 35 real emails: all read,
  all add up, 46 of the new file's 79 lines carded. 542 tests.
- **2026-09-29, the rest of the morning (D-060; `HANDOFF-2026-09-29.md`):** Paul imported the new Citizens file (6
  lines of 09-28, ties to 169,805.35) and matched. **Citizens: 79 lines - 59 tied, 18 cards, 2 waiting on the
  Ashburne close.** The first real placeholders are in the books: Dennis's three Home Depot charges of 09-28
  (162.91, 33.07, 141.09) on 366 Mesa, each its own entry - the button makes ONE ENTRY PER BANK LINE
  (`placeholderEntries_`; the first version would have lumped them into 337.07, which no receipt could match - found
  before Paul saved). Target 2.65: he does not know the house, the card waits. CondoCerts 375.00 = Newport's 09-09
  HOA release, tied by his words. **D-060: one charge, one card** (prompt + `applyVerdicts` splits a question about
  several money-out lines). A failed match is said in plain words. **Live: site `6abbf585`, writer web app @15,
  nothing owed. 543 tests.** NOT proven yet: a receipt swapping a placeholder, the 3 AM waiting list, D-058 and D-060
  on real cards. **Resume from `HANDOFF-2026-09-29.md` START HERE** - it holds the prompt for the next session.
- **2026-09-29 afternoon (CHANGELOG 11:00, 14:55; C-34): three checks booked.** Paul's 32,105.26 check of 08-12 is
  his Sparkling payout less **141.58 he left in as working money** (his working money is 5,000.00 like Dennis's -
  D-055's addition; the payout entry untouched). The 1,500.00 "Inclearing" of 08-11 is a Citizens check Dennis wrote to
  **James Broussard** for Mesa siding - the old books' "James Haroce, Dennis paid" row, voided and re-posted as paid
  from 1401 (**C-34**; Recast owes Dennis 1,500 less). Paul's 607.05 check paid him back: Newport 206.14 (now owed
  0.00), Bowling Green 400.91 (now owed 751.52). **A check with no name is booked from the bank's picture of it, not
  from memory** - Paul named two other purposes before the picture. **Citizens: 79 lines - 64 tied, 13 cards, 2
  waiting.** Journal 2,692 rows, balanced. 543 tests; pushed, nothing owed.
- **2026-09-29 15:35 (D-061): the tab `Citizens Bank`** - every line of the account, newest on top, who paid, status,
  waiting on, house, note; built by `lib/bank-sheet.mjs` + `refreshBankSheets_` after every change to a bank line and
  from Recast Books -> Bank sheet. The Feed tab has a last column `card` (the matcher fills it). **LIVE: writer web app
  @19 (09-30 13:52), site `6abc3ad9`, nothing owed; 549 tests.** 09-30 afternoon: Green Acres and Janice bought (9%); Add
  advance fills the Properties row on a purchase; Properties `notes` removed; house tabs find Properties cells by header
  (`propLookup_`), never by column number. 09-30: D-062 Cost Recapture's tab is a plain list (newest on top, who
  paid, paid back); the Totals tab rebuilt (INDIRECT over a fixed bound + SUMIFS - the old 5,000-row references had
  drifted and every cell was #N/A), in Paul's order and colors, no spare rows, `addProperty` rebuilds it. The Inbox's bank cards end with who paid; a waiting-for-closing
  line names its house. Read back: 64 reconciled, 8 waiting on Dennis, 5 on Paul, 2 on the
  Ashburne closing. **Citizens: 67 tied, 10 cards, 2 waiting.**
- **2026-09-30 afternoon (D-063): the monthly bank check is a box at the top of the Citizens Bank tab** - not section 4's
  menu item or page (Paul: no new steps to remember; fold new things into what exists). `bankCheck` / `bankCheckRows` in
  `lib/bank-sheet.mjs`: bank, every reason the books differ, red lines for anything unexplained, books; rebuilt with the
  tab. It found the 223.67 - 09-03 Brushwood in the books twice (old rows voided) and 08-14 Mesa on Paul's own card 9166
  (re-posted paid by Paul) - `fixCitizensGap()`, run by Paul; the box reads **"they agree"** (books 4,591.71). The 3 AM
  waiting list is proven. **Citizens: 69 reconciled, 8 waiting on Dennis, 0 on Paul, 2 on the Ashburne closing. LIVE:
  writer web app @20, site `6abc3ad9`, nothing owed; 550 tests.** Resume from `HANDOFF-2026-09-30.md` START HERE.
- **2026-09-30 evening (D-064, D-065): the `P&L` tab** - this year's profit and loss on top, then what Recast owns and
  owes and what is left, plain words, each fact once, Dennis's interest not recorded yet on both sides, rebuilt every hour
  by a timer (`refreshBalanceSheetHourly` -> `refreshPnl_`, installed by `installTriggers`); the menu's Balance sheet and
  P&L reports and their stale tabs are gone. **Claude credits are a software cost (6400) when bought** - D-018's
  prepaid line, monthly split job (`/api/api-costs`), web card and poller call are deleted; the 1,081.45 moved by month
  (`moveApiCreditsToSoftware`). Earned 56,179.13; owns 2,074,349.42 = owes 2,103,224.61 + left -28,875.19.
- **2026-09-30 late (D-066): the menu holds only what Paul uses** - the Reports submenu, Post interest and Self test are
  gone (Sell property sits under Add advance); Dennis's interest is recorded at closing, not monthly (the year-end is
  `postInterest` from commit 774ecd3); **oneOffScripts.gs is emptied** - every script had run, git keeps them. **LIVE:
  writer web app @23, site `6abd881d`, nothing owed; 539 tests.**
- **2026-10-01 afternoon: the closing tab (CHANGELOG 13:10-14:05 PDT, phase5-spec section 3a, `HANDOFF-2026-10-01.md`).** Paul read
  280 Sparkling's closing tab as "we only got half" of the 4,716.82 reimbursement - he got all of it (two Bison wires
  08-07, 259,053.12 + 4,716.82). **Settled, never ask again: it came off the top before the split, Sam H owes nothing,
  no entry changed. Never word any of it as Sam H paying or "the co-owner's half"** (Paul: "WE PAID THE ENTIRE 4,716.82.
  SAM DIDNT PAY A PENNY. we were reimbursed as a separate wire for the full amount") - show the full figure, as on his
  wires. Three fixes on the full tab (`writeClosingTab_`, lists built and tested in `lib/sale.mjs` `settlementRows` /
  `releasedCostRows`): the settlement block ends `Your half of the sale money` + the payment to Recast in full; the cost
  list adds up (a rehab account reimbursed past zero was dropped) and shows the reimbursement in full; the forecast block
  is read off the house tab (Sparkling's Sale Price is typed, 275,000). The tab keeps its statement lines with the sheet
  (developer metadata), so a rebuild from the dialog keeps them. **Then Paul designed a simpler closing tab on Sparkling,
  line by line, and made it the standard: "yes. with the exception of ashburne" (D-069).** `writeClosingTab_` writes
  it for every partner deal (`writeSimpleClosingTab_`, rows from `lib/sale.mjs` `closingRows`, tested on both closed
  sales); the bank deal (104 Ashburne) keeps the long layout. His sections and words: INCOMING CASH AT CLOSING (the
  wires), PROJECT COSTS (Purchase Principal, Purchase Interest, Cash Advances Interest on $<total>, Rehab
  Costs, Utilities), PROFIT (`Total Profit`, `Dennis 50%`, `Paul 50%`), PAYOUTS (a green name row, each partner's rows,
  `Total to ...`, `Refunded to Recast Citizens Account`, `Total paid out`), an escrow section when some was held back,
  AFTER THE PAYOUT (each bill listed); notes bold black; no account numbers, no title-company charges. **D-071 (replaced D-068): Rehab Costs is EVERY bill and a cash advance's principal is NOT a cost row** - it shows only under Dennis in PAYOUTS; the cost list says `Cash Advances Interest on $6,838`. Never net the advances out of Rehab Costs. Both closed houses are in the layout (`280 Sparkling -
  Closing`, `1616 Granite - Closing`, rebuilt and read back 14:21 PDT by `rebuildClosedClosingTabs`). **Never delete a
  closing tab to rebuild it** - the statement lines live on the sheet (developer metadata) and only they know what was
  paid to Recast by name in full; Paul deleting Sparkling's long tab cost the two-wire split once. Paul edits these tabs
  by hand - read the live tab before a re-run. Fixed on the way: a rebuild read Dennis's money back wrong when escrow was
  held (Granite showed 257,305.63 for 287,305.63) and kept showing 30,000 "undrawn" after the escrow was paid. 546
  tests. Pushed, committed, and **deployed @25 on Paul's "deploy" (14:24 PDT, `/exec` answers ok 0.4.0)** - nothing owed. **Next: 881 Newport closes 10-02 through Sell property - its tab
  will be the first written in this layout at a sale** (expect `Cash Advances Interest on $2,000`, Rehab Costs 3,842.64,
  Utilities 759.53 before any last bills); read it back the moment it posts.
- **2026-10-01 14:30-14:45 PDT (D-070, CHANGELOG): lawn care is a rehab cost on every tab; the closing tab's last
  section is `AFTER THE PAYOUT`.** Paul asked why Rehab Costs differed between the Granite / Sparkling house tabs and
  their closing tabs: lawn care placement (fixed - 1130 sits in Rehab Costs on the light house tab now, summary and
  line block; every held tab rebuilt, Newport reads Rehab 3,842.64 / Utilities 759.53), cash advances (the closing tab
  took them out of Rehab Costs - **reversed by D-071, both tabs now show every bill**), and Granite's three bills dated after its
  closing day, 2,738.24, settled in its payout and so on the closing tab but not the frozen house tab (**not decided**).
  **A frozen house tab is Paul's record and he edits it by hand: 280 Sparkling's Profit Breakdown (Property Tax
  8,237.00, Net Profit 50,171.98) is his typing - the rebuild overwrote it and `restoreSparklingHouseTabSummary` put it
  back. Never rebuild a frozen tab without reading it and comparing first.** 546 tests; pushed, committed. Deployed with @26 (16:38 PDT).
- **2026-10-01 15:45-16:30 PDT (D-071, D-072, CHANGELOG):** Paul checked the closing tab against his house tab and his
  old sheet "1616 Granite RECONCILED" (it is in `data/migration/cutover-2026-09-21/old-workbook-cutover.xlsx` - **his
  old sheets are his model; read them when a layout is in dispute**), saw a comparison tab laid out his old way, and
  chose the closing tab's way ("i like your way"). **D-071 replaced D-068:** Rehab Costs is EVERY bill; a cash advance's
  principal is not a cost row (only under Dennis in PAYOUTS); the cost list says `Cash Advances Interest on $6,838`.
  **D-072: a house tab is frozen when its closing is RUN, not on the closing day** - Ashburne and Newport stay `held`
  and keep taking bills until Paul runs Sell property (he settles with Dennis in person); the frozen-tab rebuild has no
  date cut-off any more, and Granite's house tab gained its three later bills (Rehab 10,727.97, Utilities 1,476.90 - now
  equal to its closing tab). **AFTER THE PAYOUT lists every bill** (live), not a sum. (The comparison tab `1616 Granite - Closing (your way)` is gone - Paul removed it.) 546 tests; pushed, committed, **deployed @26 at 16:38 PDT on Paul's "deploy"** (`/exec` answers ok 0.4.0) - nothing owed. The
  rest of the afternoon was wording and formatting he dictated row by row (CHANGELOG 16:13-16:40): `Payout from title
  company`, plain `Half of profit`, the short unbolded note, the top line at size 13 on a light green band, column D
  wrapped; Sparkling's first cash row is `Your half of the payout from title company (first wire)`.
- **2026-10-02 morning (CHANGELOG; writer and pollers pushed 08:33 PDT = commit afdd519, repair run and read back; **deployed 08:40 PDT: site `6abfd01b`, writer web app @27 - nothing owed; 548 tests**):** the 2 AM check's eight
  lines were six false alarms (the 10-01 register's voided doubles - a voided MIGRATED row now accounts for its
  document), one wrong duplicate call (one bill split across houses is not a duplicate), and one real loss: Paul's
  Home Depot 03-06 save, 36.77 on Ashburne, was marked recorded and never reached the Journal (`inboxApprove` Failed
  with no log - a buffered write lost after the function returned). **Every Journal write now flushes inside the
  lock.** The bank box no longer turns red for a payment dated after the bank file's last day. A card holding several
  receipts (one email, six Squarespace bills) says so, heads each one, and takes who-paid once. **Done 08:30-08:35 PDT:** `repairLostSaves20261001()` (the 36.77 recorded, the Lowe's receipt linked, the bank tab "they agree" at 3,090.99, the second Ashburne lawn 60.00 voided on Paul's yes, Mastercard 7952 on `paul_personal_last4` - his personal card) and 104 Ashburne's tab rebuilt for a new section (22 sections = Rehab Total 184,975.01). Journal 3,090 rows, balanced. **The Squarespace and Roddy cards are Paul's to save (Paid from PAUL, picked once). Take the three 10-02 one-offs out of oneOffScripts.gs with the 10-01 ones (D-066).** **08:30 PDT: the 3 AM Posted list prints what Paul saved** (`result.entries` on the card, CHANGELOG) - writer pushed (`clasp login` works again; the push carried the morning's writer changes), **the site deploy is owed**. Seen, not chased:
  `refreshBalanceSheetHourly` ran 241 s (limit 360); the Posted list files a card under the day it was read, not the day Paul saved it.
- **2026-10-02 08:50 PDT (CHANGELOG): the poller no longer drops attachments.** `MAX_ATTACH_COUNT: 6` had ended the
  loop at six without a word - five of Paul's eleven Squarespace invoices and three of nine Roddy receipts never reached
  the bookkeeper. An email with more than six attachments (or 4 MB) is now several documents, `gm-<id>`, `gm-<id>-2`,
  ...; the eight were resent and posted (Squarespace 11 invoices = 546.76, Roddy 9 months = 759.96, every file in his
  two Desktop folders). Journal 3,136 rows, balanced. Pollers pushed; site `6abfd01b` and writer @27 unchanged; 549 tests.
- **2026-10-02 09:10 PDT (CHANGELOG): each bill of a several-receipt email opens its own PDF** - the 20 Squarespace and
  Roddy bills relinked and read back (20 bills, 20 files); from now on the read names the attachment per entry
  (`attachment`), the ingest and the sheet's Inbox link each entry's own file. **Deployed 09:11 PDT on Paul's "deploy": site
  `6abfd7ae`** (D-073, D-074); the writer web app stays @27 (Code.gs and lib.gs unchanged since). 550 tests.
  oneOffScripts.gs is emptied again - the 21 scripts of 10-01 and 10-02 are in commit db9453f (`git show db9453f:apps-script/writer/oneOffScripts.gs`). **Not yet seen live: a read made after the deploy** (the read's new `attachment` field) -
  look at the first receipt that comes in.
- **2026-09-25 (D-044, D-045):** the gate lets a **medium** read post when every other rail holds (low still holds); a vendor's unanimous payment history settles `paid_from` when the document shows no card and Paul wrote no note; Chase checking 8870 is Paul's personal (`paul_personal_last4` = `9166, 8870, 3746` - Discover 3746 added the same day); `MAX_TOKENS_PER_TURN` 16000 (32k broke: the SDK refuses a non-streaming call above ~21k); the warm job replays errored docs from their stored read; the digest names the gate reason. CHANGELOG 2026-09-25.
- **All five lists are done** (audit §40-§43): list 4 in mail not in the books 0 (`mail_settled`), differences 0 (`differences_settled`), confirm 0 real (the 3 shown are rows Paul dropped), questions answered; every decision, link, refusal (per document), drop, addition and retraction is in `data/migration/2026-09-17/paul-answers.json`. **Paul's stopping rule:** no new cost unless proven paid AND absent from the old books by total, pre-tax subtotal and items; otherwise park for Phase 3.
- **2026-09-28: 104 Ashburne SOLD** the week of 09-21 (Citizens: $715,558.65 from Bison Title 09-23, $550,000 to Raymond James 09-25) - **not closed in the books yet; Paul starts the sell wizard when he is ready.** Earlier: **Facts corrected on 2026-09-18:** 104 Ashburne had NOT closed then. **881 Newport has NOT closed either - under contract (Paul 2026-09-21, audit §47); sold = Granite and Sparkling only**; its two Cost Recapture lines moved to its own tab. "Effren" rows are **Falcon Creek Lawn Care** (`rename_payee`). Paul's notes are the documents for cash labor.
- **Matcher fixes 2026-09-21 (`migration-compare.py`):** coincidental subset sums (26 false Home Depot / Lowe's links removed), near-amount tolerance capped at 10% of the row, lone stale-duplicate dismissals are real receipts. `migration-audit-links.py` has a far-from-receipt section; both sections are clean (Shalom's second payment is the one expected line).
- **Never say "no document" or "not in the old books"** before searching the amount (within two cents, as a sum of items, and as the document's pre-tax subtotal) on every old tab and in ALL listed mail (`gmail-listing-*.json`), not only the 968 documents that were read. After any change to the inventory, matcher or answers: rerun the pipeline and both audit scripts and **diff the links against the last commit**; read every link that disappeared. One double count was made and caught this way (audit §38).
- **Envelopes are cached** in `.cache/envelopes/env/` (git-ignored, 968 files) - the pipeline and audits run offline: `--env .cache/envelopes/env`, `migration-audit-links.py .cache/envelopes`.
- **Open, in order:** (0) `rebuildAllFrozenRecords` **DONE** - re-run by Paul 2026-09-25 17:04 PDT, both tabs frozen, Granite ties to the Journal; 280 Sparkling's frozen tab has its Sale Price (275,000.00, read 2026-10-01) and its closing tab's forecast block was rebuilt from it - no longer parked. `rebuildAllPropertyTabs` is DONE (D-042 is on all ten tabs, Ashburne's spacer text cleared); (0b) **answered 2026-09-23: "tools are overhead"** - D-010 stands, no chart change; the prompt now says a tool is overhead even when bought for one job and that a mixed hardware receipt is two entries (live since the 09-25 deploys); (1) **duplicate-replay sweep DONE (audit §66):** four receipts voided, **488.67** (178.48 Granite, 310.19 Ashburne) - all replays of rows already in the old books, posted in one burst on 2026-09-22 17:31-17:46 when the parked Home Depot items were approved instead of parked. `reportDuplicateReplays()` / `voidDuplicateReplays()` are the editor helpers. **Blind spot to carry into Phase 3:** the old books sometimes combined several receipt items into ONE row (D-029), so a line-level matcher cannot see an itemising replay - the three tools that summed to the migrated "Scrapers" 23.75 were invisible to it. Check the parked Home Depot / Lowe's items by hand (**done 2026-09-26:** of the nine in the Inbox, five are fully on the books - Harbor Freight 402.67 and Home Depot 02-10, 02-18, 03-01, 03-02 219.69 - so dismiss them; four carry 407.22 of items on no book; and 27 more parked receipts, 5,166.56, are dismissed and so not in the Inbox - CHANGELOG 2026-09-26). An entry whose description says "PENDING ROUTING" is refused since 2026-10-01 (`lib/posting.mjs`, D-067). (The closing-tab sign-off is GONE - D-043 keeps the two tabs separate.); (2) 881 Newport (under contract) and 104 Ashburne through the same sell wizard when they close - Ashburne is the bank deal, 12%, 3% commission, no profit share; (3) runbook step 17, optional: Paul drags `2026/` and `Migration evidence/` from the STAGING Drive folder into "Recast Books"; (4) Phase 3 banking, where everything parked lands; (5) **W-9 collection** - nine payees over threshold, zero on file, January 31 deadline, no dependency on any phase. Owed by others: Dennis's PayPal receipts for the Granite, Sparkling and Newport listing fees. `clasp` needs a fresh `npx clasp login` every few days (Workspace re-auth).
- **Live since 2026-09-18:** the bookkeeper prompt reads Paul's subject and typed note first (they settle `paid_from`); image type sniffed from bytes; the Inbox is a collapsed, filterable list. Paul's live receipts post to production since the 09-21 cutover.
Staging ids in `phase0-spec.md` §10; staging is ARCHIVED and `WRITER_URL` points at PRODUCTION. Phase 3
(statement uploads — D-019 dropped Plaid) is in progress; `docs/phase3-spec.md` was amended for the menu
shape and Recast's own accounts on 2026-09-28 (D-051, D-023) - read its amendments at the top first.

Policy learned in the Phase 2 gate (D-012): the bookkeeper decides the easy cases itself —
PDX↔DFW travel posts with a written purpose; a confident dismiss is final; duplicates are
caught by invoice number with a fresh ledger read before any post. Card last-4s live on
`Bank accounts` (1401 → `2505, 5450, 9301`; 1402 → `6317`) and Settings `paul_personal_last4`
(`9166, 8870, 3746`); the model is
shown them with every document.

Operating notes: deploy = `npm run deploy`; writer = `clasp push -f` + `clasp deploy -i
<id>` from `apps-script/writer/`; poller = `clasp push -f` from `apps-script/poller/`
(runs latest saved code, no deploy). Netlify function logs:
`npx netlify-cli logs --source functions --function <name> --since 15m` (unreliable —
prefer the envelope's `error`/`error_stack`). Paul still owes Dennis's and the
accountant's Google emails for the Users list (added on the Users tab now, D-023). D-064 (reverses D-018): Anthropic
top-ups post to 6400 Software & subscriptions when bought; 1520 is unused and the monthly `/api/api-costs` job is gone. D-013: the new workbook is cleared once at the start of
Phase 4, then history is migrated and live receipts replayed; append-only from then on.

Test data in the live workbook: none. `clearBooks` removed the PHASE 0/PHASE 1 gate entries
at the cutover and the `TEST Phase 1 gate` Properties and Advances rows are deleted (checked
on the snapshots 2026-09-26).
