# Status diary archived 2026-10-06

Verbatim copies of the `## Status` section of `CLAUDE.md` (lines 75-415 as of commit 7c99472) and of the
`## Recast-books/` section of the root `../CLAUDE.md`, as they stood when CLAUDE.md was cut to rules only.
Nothing here is current. Standing rules were lifted into `CLAUDE.md`; the history is in `CHANGELOG.md` and
`docs/decisions.md`; the open items in `HANDOFF.md`. Kept so a grep still finds any sentence that was there.

---

# 1. Recast-books/CLAUDE.md "## Status" as of 2026-10-06

## Status

**Now (2026-10-04): LIVE on the real books since the 2026-09-21 cutover. Phases 0-2.7, 4 (migration) and 5 (sell wizard) done; THE MIGRATION IS CLOSED (D-067, `docs/migration-leftovers-final.md` - every leftover settled; a migration-era item that turns up later is Claude's to settle quietly, never a new list for Paul). Phase 3 (bank statements) in progress - import, matcher, Citizens Bank tab and its bank check live. Writer web app **@35** (10-06 = commit 69d8c6b's script: D-082, D-083, D-084, 562 tests, `/exec` answers ok 0.4.0 - nothing owed on the writer), site **`6ac23e11`** (10-04; no function loads `lib/tax.mjs` or `lib/reports.mjs`, so the site is the repo), writer and both pollers pushed = the repo. **881 Newport CLOSED in the books 2026-10-05 (settlement 10-02, sold 290,000; D-082: Dennis's interest is typed per advance in Sell property and the closing tab shows exactly that). 104 Ashburne CLOSED in the books 2026-10-05 (D-083; settlement 09-23, sold 775,000; profit 140,895.81, all Paul's; Dennis 567,829.27 on his one figure 545,149.27 + 3% commission 22,680.00 - 550,000 paid 09-25, 17,829.27 still owed; Paul 147,729.38 still in Citizens, nothing paid to him yet) - every house of the old books is closed; `104 Ashburne - Closing` is in the shape of Paul's own `104 Ashburne - Dennis` tab; the Citizens wires of the sale are tied; **writer web app @34 - nothing owed. D-083 extended the same afternoon: a payout is recorded only when the money leaves the account, every deal - 881 Newport's two payouts (Dennis 240,895.21, Paul 27,609.53) had been recorded paid and were NOT: voided (`unpayNewport`, ran), its closing tab shows them still owed; Sell property asks `Already paid to Dennis / you` on every house.** Citizens imported through 10-02 (87 lines, 73 reconciled, Newport's wire tied); the bank box waits on two Inbox cards of Paul's (the 500 Venmo, the Red Oak water fee). **D-084 (10-05 night): Paul's undrawn profit is owed to him on 2030 from the closing day (Dr 9010 / Cr 2030 at the close; the draw pays it) - Ashburne 140,895.81 and Newport 26,731.14 booked by `bookPaulShareOwed` (ran), Totals `Due to owner (Paul)` 214,574.78. Writer web app **@35** (10-06 on Paul's "deploy", `/exec` answers ok 0.4.0) = the repo; 104 Ashburne's tab rebuilt by Paul (commission note "on 756000"). Nothing owed on the writer.** Owed (10-05): Paul runs `setNewportInterest` (purchase 4,355.52, cash advance 43.31 - the posted total, no amount moves) and reads back `881 Newport - Closing`; ~~the writer web app deploy~~ (DONE @33 after the Ashburne close); and run `linkMolallaReceipts` (oneOffScripts.gs holds only it; pushed 06:46 CDT, a push only, no deploy) - see the 10-05 bullet below.** 560 tests. **Five closed sales are in the books: 1616 Granite, 280 Sparkling, 1014 S View** (Paul's own 2025 deal, D-079)**, 881 Newport and 104 Ashburne** (both 2026-10-05); the `Taxes` tab (D-075) is live beside `P&L`, with what Recast carries over from 2025 (D-078). **The closing tab's layout as it stands is `docs/phase5-spec.md` section 3a (decisions D-069..D-072).** **Resume from `HANDOFF-2026-10-05.md`** (1014 S View's receipts: matched, the link run is Paul's step, what was found) - then `HANDOFF-2026-10-04.md`, `HANDOFF-2026-10-02.md` (and `HANDOFF-2026-10-01.md` for the closing tab); the dated bullets below are the history, newest near the end.**
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
- **2026-10-06 (CHANGELOG):** the P&L tab's `Paul` line is three lines - `costs he paid` (held houses + business, 32,295.87), `money in Recast Citizens` (working money + sold-house payouts waiting, 180,338.91 = his closing tabs), `money in Recast Chase` (its balance, 1,940.00 - D-051, Chase is his). Writer web app **@36**. Later: **the Advances tab is kept newest on top** (`sortAdvances_`, run by Add advance and the hourly refresh; readers go by value, never row number). Writer web app **@37**, 564 tests, nothing owed.
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
  from 1401 (**C-34**; Recast owes Dennis 1,500 less). Paul's 607.05 check paid him back: first split Newport 206.14 / Bowling Green
  400.91, re-split 44.39 / 562.66 on 10-01, and **all 607.05 on 136 Bowling Green since 2026-10-02 on Paul's word
  ("move the entire amount to bowling green") - never split it again from the old Newport tab** (CHANGELOG 10-02 13:10). **A check with no name is booked from the bank's picture of it, not
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
- **2026-10-02 09:35 PDT (D-075, CHANGELOG): the `Taxes` tab** - an estimate of what Paul may owe the IRS and Oregon
  on the year's profit, beside `P&L`, rebuilt by the same hourly timer and at once when he changes a blue cell (how
  he files, other household income, what he already sent; `yes` beside a held house that sells this year).
  `lib/tax.mjs` holds the arithmetic and **one table per year - 2027's goes in when the IRS and Oregon publish it**
  (a year with no table shows "tell Claude"). **Deployed 09:40 PDT on Paul's "deploy": writer web app @28** (live script = HEAD by `clasp pull`,
  `/exec` answers ok 0.4.0; the site was not redeployed - no function loads `lib/reports.mjs` or `lib/tax.mjs`). 555 tests.
  **09:44 PDT: every held house is listed** (one with no sale price on its tab says so and adds nothing) - pushed, rebuilt
  and read back; **deployed @29 at 09:47 PDT on Paul's "deploy" - nothing owed.** Paul marked Ashburne and Newport `yes`:
  set aside 56,636.31. Built at 09:35 PDT and read back live; Paul picked married and typed 5,000 sent to the IRS - no house marked yes yet.
- **2026-10-02 10:00 PDT (D-076, CHANGELOG): receipt photos are no longer shrunk at 3 MB.** Paul: "pixelated and
  sometimes unreadable. i am sending high resolution images" - the poller swapped every photo over 3 MB for Drive's
  2000px copy (1500x2000 of a 3024x4032 original), and that copy is what was read and filed: about 100 of 387 photos
  since January. The cap is 4 MB now (what one 6 MB request carries) and a photo over it keeps the LARGEST copy that
  fits, with a note on the document. Both pollers pushed (live = repo by pull and cmp); 556 tests. **Not yet seen on
  a real photo - read back the next phone photo's stored size.** **The photos already stored small are put back
  (10:23-11:05 PDT, Paul: "yes, replace them"): 87 originals uploaded into their existing Drive files (90 files, same
  links), read back full size, none failed** - a poller one-off in two halves (properties@ exported its 77 on its own
  timer, paul@ uploaded; the one-off is out of both pollers since 11:21, live = repo); 14 small photos with no link
  from the Journal were left. 10 of the 87 originals are over 4 MB
  (about 1 photo in 40 overall), so a few new photos will still be stored reduced.
- **2026-10-04 (CHANGELOG): every receipt read since the 10-02 09:11 deploy failed** - D-073's `attachment` was the
  17th nullable parameter across the bookkeeper's strict tools and the API allows 16 (a 400 before the model sees
  anything; the scripted test client cannot see it). `attachment` is a plain integer now, -1 for "one receipt"; a test
  holds the count at 16 - **a new optional field in a tool schema takes a sentinel value, never `null`.** Four
  documents were caught (three Uber emails, one phone photo); 557 tests. **Deployed 10-04 on Paul's "deploy": site `6ac237cb`** (writer web app still @29). **The four were read again 06:34 CDT (Paul ran the one-off `rereadFailedReads20261004`; it is in commit e9d490f) - all read clean, so the fix is proven live; they are cards in his Inbox** (Uber to PDX 58.97, airport snacks 8.47, Uber from DFW 98.36, and that ride's "charge summary" 98.36 - a copy, his to dismiss). **Paul settled all four the same hour** (he kept the summary and dismissed the receipt - the ride is in the books once, 98.36). **D-077: a copy of a card still waiting on Paul is not a new purchase** - a prompt rule (dismiss the copy that adds nothing, hold the better record, say which to keep); not yet seen on a real pair. 558 tests. **Deployed 10-04 on Paul's "deploy": site `6ac23e11` - nothing owed.**
- **2026-10-04 16:30-16:48 CDT (D-078, CHANGELOG): the Taxes tab shows what Recast carries over from 2025** - a block
  `WHAT RECAST CARRIES OVER FROM 2025` with ONE row, `Less home office costs carried over from 2025` -1,111.00 (shown as taken off - Paul read "could not use" as "cannot take"; `CARRIED_OVER` in `lib/tax.mjs`,
  typed in each fall with the tables from the return's Carryover Worksheet). Paul's 2025 return (on his Desktop) carries
  no net operating loss: the 2025 business and rental losses (32,135) were used in 2025 and only come off what the 20%
  deduction is worked on (in the arithmetic, no row). **The household's 37,452 loss on stocks is NOT on the tab or in
  its numbers - Paul: "only show me what recast can take from 2025"; never add personal items to this tab.** Set aside
  56,438.79 -> 56,120.21, read back live 16:48 CDT (to rebuild the tab at once: type a letter in an empty cell of it,
  e.g. E1 - the rebuild clears it). The return files Recast on Schedule C with the houses as inventory, cash method.
  559 tests; deployed @30 at 16:55 CDT on Paul's "deploy"; the 16:54 relabel went out with **@31 at 19:48 CDT - nothing owed.** Put to Paul, his cell: `Other income in your household` is 0 and
  the 2025 return shows 421,292 of paychecks.
- **2026-10-04 19:07 CDT (D-079, CHANGELOG): 1014 S View, Molalla OR is in the books.** The loss Paul meant in D-078
  is a house of his own (hard money loan, **no Dennis**), bought and rehabbed in 2025, sold 2026-01-12 for 410,000
  against 444,579.10 all in: a **2026 loss of 34,579.10**, in no book until now. Brought in as ONE closed house by
  the one-off `importMolalla` (commit bbcd0be; Paul ran it - auto mode refuses the session's browser a write to the
  live books): Properties row (sold, Dennis 0), three entries dated 01-12 from his sheet's totals with the money side
  on **9000** (never 2030: Recast does not owe it back), his own sheet tab copied in as `1014 S View` (the last tab;
  his record - never rebuild it). Read back live: P&L `1014 S View -34,579.10`, **Recast earned 19,103.52**, `Put in
  by Paul 34,579.10` its own row; Taxes **set aside 43,502.30**. Open for his closing papers: 1,260.00 (first
  interest) and 101.67 (City of Molalla) look entered twice on his sheet - loss 33,217.43 if so, one small entry.
  559 tests; writer pushed = repo; deployed with @31 at 19:48 CDT.
- **2026-10-04 19:30 CDT (CHANGELOG): 1014 S View is in line by line, with a frozen house tab and a closing tab.**
  Paul: "line by line into the ligth template. then freeze it and make a closing tab for it." The one-off
  `importMolallaLines` (commit 542847e; Paul ran it) read his sheet at run time, voided the three summary entries and
  posted 151 cost lines (source `migration` - rows of his old books; paid by Paul; **the purchase side - price,
  assignment fee, title, loan costs, loan interest - on 1000**) plus the sale, the release and the loss (2030 -> 9000):
  Journal rows 3222-3546. Tabs: `1014 S View - Frozen` (light template as of 2026-01-12: Purchase 391,218.04, Rehab
  Costs 23,574.59, Utilities 3,305.30, Property Tax 2,758.90 = 420,856.83; its Net Profit is the template's forecast,
  as on Granite), `1014 S View - Closing` (his layout, no Dennis rows; `writeSimpleClosingTab_` takes a house's own
  rows as `plan.rows`), `1014 S View - old sheet` (his own; **Paul removed that tab himself later on 10-04**). **The Frozen and Closing tabs are his records - never rebuild them.**
  The purchase lines carry 2025-09-16, worked out from the sheet, not a document. P&L and Taxes unchanged (Recast
  earned 19,103.52; set aside 43,502.30). Still open for his closing papers: 1,260.00 and 101.67 may be entered
  twice. 559 tests; writer pushed = repo; **deployed @31 at 19:48 CDT on Paul's "deploy"** (`/exec` answers ok 0.4.0; live
  script = commit cd57933 by `clasp pull`) - nothing owed. The 5,000-row Journal bound on the house tabs became D-080 (next bullet).
- **2026-10-04 19:45 CDT (D-080, CHANGELOG): the house tabs and closing tabs follow the Journal to its last row.**
  They summed Journal rows 2-5,000 (the Journal is at row 3,546, about 100 rows a day). Every Journal range in a tab
  formula is now `journalRange_(col)` - row 2 to the last row, kept in B1 of the hidden `Journal helpers` sheet; the
  voided flag ends on the same row. **Never type a Journal row into a formula - the D-080 lint fails on it.** Totals
  keeps its own 20,000 bound (it says so on the tab when passed); the Advances ranges keep 5,000 (40 rows). A post
  does NOT rewrite a held tab's formulas (only its line blocks), so the one-off `followJournalOnTabs` does it once:
  closing tabs rewritten in place (never rebuilt), every house not sold rebuilt and timed. **Run by Paul 22:35 CDT
  (127 s) and read back live:** the three closing tabs read as before (Granite 800.43, Sparkling 891.45, 1014 S
  View 0.00), all eight held house tabs read as before, no formula anywhere still stops at a fixed Journal row, the
  tabs read to row 3,546 = the Journal's last; 366 Mesa Rehab Costs 12,787.78, 881 Newport 3,952.64 and 104
  Ashburne Rehab Total 184,975.01 each equal the Journal worked out separately. A tab's sums recalculate in
  0.4-1.0 s, the same or a little quicker than before; a rebuild takes 8-16 s. The one-off is out of the repo (commit
  abf8a19 keeps it); its Code.gs went out with web app @31 at 19:48 CDT, so no deploy. Pushed 22:44 CDT after Paul's
  `npx clasp login` (live script = repo by `clasp pull`, no function left in oneOffScripts.gs) - **nothing owed.**
  560 tests.
- **2026-10-04 22:50 CDT (CHANGELOG): a rebuild no longer makes an empty tab for a sold house.** `setupPropertyTab`
  returns for a sold house BEFORE it looks the tab up (their records are named `<house> - Frozen`, so the lookup
  would have created an empty tab under the plain name); a lint assertion holds the order. The live workbook has no
  such empty tab (32 tabs read from the tab bar) - nothing to delete. **gviz answers a `sheet=` name that does not
  exist with one empty row, never an error - check the tab list.** Pushed 22:48 CDT; **deployed @32 at 22:51 CDT on Paul's "deploy"** - the live script was commit 5c0c0f6 file by
  file before and after, so @32 carries D-081's `lib.gs` too; `/exec` answers ok 0.4.0. **Nothing owed.**
  `1014 S View - old sheet` is gone from the workbook: Paul removed it himself ("yes i removed it"). 560 tests.
- **2026-10-04 22:50 CDT (D-081, CHANGELOG): the Taxes tab ends on `SET ASIDE FOR BOTH`.** Paul asked why he could
  not write off his flights (he can - the books count them; the row was the accountant's open question Q-1), then:
  "remove this section: NOT IN THESE NUMBERS - FOR YOUR ACCOUNTANT". Its three rows are gone (flights 12,421.27,
  Portland-area local income taxes, interest for paying late) and `taxFacts` no longer carries travel; no number on
  the tab changed. **Never put that section or a travel row back on the tab.** Commit 5c0c0f6, pushed 22:50 CDT =
  repo; **read back live after the 23:05 CDT hourly rebuild: the section is gone, the tab ends on `SET ASIDE FOR BOTH`
  43,502.30 (unchanged)**; deployed with @32 at 22:51 CDT (the bullet above) - nothing owed.
- **2026-10-05 06:50 CDT - 1014 S View's receipts are matched; the linking script is Paul's ONE step (`HANDOFF-2026-10-05.md`,
  CHANGELOG 10-05):** 65 receipts -> 136 of the 151 lines (`data/molalla-receipts.json` - every pair, the receipts with no
  line, the lines with no receipt). The emailed ones were copied into Drive (`1014 S View` / `Receipts from email`, 245
  files) by a poller one-off that has run and is out (live poller = repo). **Owed: Paul runs `linkMolallaReceipts`
  (oneOffScripts.gs, pushed 06:46 CDT, a push only) - then read back the tab `1014 S View - Frozen` (110 of its 121 lines
  should open a receipt, 11 blank) and the Journal, set the STATUS line, take the one-off out.** Still without a receipt:
  the lender's interest and PGE (papers in pvb421@gmail.com), NW Natural, Lineage Legacy 1,600, county taxes 2,758.90.
  **Found, not changed - Paul's to decide:** money back not on his sheet (Floor & Decor return 307.80, Lowe's credit
  200.00, City of Molalla refund 57.10), likely entered twice (first interest 1,260.00, the 100.00 city deposit, PGE 3.37),
  paid and not on his sheet (Home Depot paint 9/28 668.06, Venmo Ramon Garcia Alcaraz 325.00, appraisal 1,065.00, LUMIN
  card fees 55.98). The Drive folder is mounted on this Mac - read receipts there (`xattr` gives the Drive id).
- **2026-10-04 23:15 CDT - the task as it was handed over (`HANDOFF-2026-10-04.md`):** Paul: "yes match all the receipts
  and link them" - every receipt for 1014 S View matched to its Journal line and linked, so each line on `1014 S View
  - Frozen` opens its own receipt. Located: about 20 photo emails he sent himself (pvb421@ -> paul@, subject
  "Receipt", 2025-09-16..10-20) plus store mail (Lowe's 17, Home Depot 3, LUMIN, the dumpster, Kislyi) in paul@; the
  loan, purchase and sale papers in pvb421@; the big receipts in the Drive folder `1014 S View`. No email address was
  ever made for the house. The method (Drive receipts first; a poller one-off to copy the emailed ones into Drive; the
  Drive connector reads the photos; a writer one-off to set `doc_url` and write the frozen tab's links, whose Receipt
  cells are plain text after the freeze) is in the handoff.
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

---

# 2. Root CLAUDE.md "## Recast-books/" section as of 2026-10-06

## Recast-books/ — the new bookkeeper app (Phases 0–2.7 + Inbox-in-sheet done; receipts live; LIVE on the real books since the 2026-09-21 cutover)

**The real books since the 2026-09-21 cutover:** its own Google Sheets workbook ("Recast Books")
as system of record, Claude as the bookkeeper, the input side as a **Recast Books menu in the
workbook** (D-023, 2026-09-15; the writer is the Apps Script project bound to it), and a web app at
books.recast-properties.com (Netlify site `recast-books`) that carries the `/api/*` functions -
Paul is never sent there (Recast-books CLAUDE.md rule 8). The Inbox is **Recast Books → Inbox…** in
the workbook; the queue stays in Netlify Blobs. The old workbook is closed and the old receipts
poller is off. **Nothing in Recast-books ever writes to
the old workbook or touches `Recast-site/`.** Read `Recast-books/CLAUDE.md`, then
`BUILD-PLAN.md`. Paul wants exactly one step at a time when he has to act.

- `docs/decisions.md` D-001..D-012 are settled (Sheets not QuickBooks; Dennis is a
  lender, compounding on each advance's monthly anniversary at that advance's own rate - 8% on the
  closed deals, 9% held, 12% Ashburne (D-022, D-038) - recorded at closing (D-066); all his interest is a
  property cost; overhead is Paul's alone; Google sign-in; the bookkeeper decides the
  easy cases itself). D-019 dropped Plaid for statement uploads; D-023 moved the input side
  into the workbook. Do not re-pitch QuickBooks or Plaid.
- The Phase 2 receipts bookkeeper is **live** for receipts@/travel@ mail from 2026-09-11
  onward, posting to the new workbook only; the old one keeps running in parallel.
- **CUTOVER DONE 2026-09-21 - the real books are live (D-024..D-034, audit §51):** the production "Recast Books" Journal
  holds the migrated old books (1,048 entries, $240,844.35, 922 Drive-linked, 33 advances, tied out both paths) plus live
  receipts since 09-17; `WRITER_URL` = production; the old receipts poller is OFF (triggers deleted 2026-09-22); the old
  workbook "Recast 2026" is frozen - never write to it. **Closed in the books = 1616 Granite, 280 Sparkling, 1014 S View and 881 Newport (closed 2026-10-05; D-082 - Dennis's interest typed per advance at the sale). 104 Ashburne SOLD ~2026-09-23 (Bison Title wire) but is NOT closed in the books yet.** Done since: the Inbox leftovers dismissed, the properties@ poller switched on,
  the old workbook closed and view-only (2026-09-22, audit §55-§57); **Phase 5 built and both closed sales posted**
  (§60, D-036..D-039). 2026-09-23 (§61-§64): the heavy tab was writing every refresh into its own spacer columns - fixed;
  the Inbox card is now actions-only bullets with property per item (D-040, D-041); "tools are overhead" answered - D-010
  stands, no chart change, prompt updated (live since the 09-25 deploys); and the **light property tabs** changed (D-042) - the
  Dennis commission rows removed (he charges none on a partnership deal; it stays a bank-deal term), `Due to Paul` renamed
  `Paul Paid (direct)`, a typed `Concession` cell added, and `Received` split into advances and refunds on payee (Dennis
  Paid (direct) keeps one Received row). Evening (§65, **D-043**): every line block gained a **Receipt** column
  (`receiptCell_`), blank descriptions fall back to the entry memo, and **the property tab is now FROZEN at closing as the
  record** - `CLOSING_TAB_IN_PLACE` stays false forever, the closing tab stays separate, and its sign-off is moot. A
  six-hour hole was closed (`sellPost` wrote `status = sold` without clearing the 6 h posting-ctx cache, so a receipt could
  land on a just-sold property); the 178.48 it let onto Granite was a **duplicate of rows already on 104 Ashburne** and was
  voided. The Granite and Sparkling tabs were then reconstructed as of each settlement date and frozen (re-run and tied
  out 2026-09-25), and the
  **duplicate-replay sweep is DONE (§66): four receipts voided, 488.67** (178.48 Granite, 310.19 Ashburne) - all replays
  of rows already in the old books, posted in one burst on 09-22 17:31-17:46 when the parked Home Depot items were
  approved instead of parked. **Open:** Newport and Ashburne when they close; then Phase 3, carrying two notes - the old
  books sometimes combined several receipt items into ONE row, so an itemising replay is invisible to a line-level
  matcher (check the parked Home Depot / Lowe's items by hand), and an entry whose description says "PENDING ROUTING"
  should not be postable.
  **2026-09-25:** the "Thursday softballs" day - D-044 (medium posts when the rails hold), D-045 (vendor precedent
  settles the payer; 8870 and 3746 are Paul's personal), D-046 (a utility payment matching nothing on the account
  posts); `checked` had been dropped since 09-22 (the API's reasoning was never shown - that was the whole
  "why cant the api" complaint); lost postBatch replies now confirmed on the Journal; ledger window 365 days.
  **2026-09-25 evening, deployed (D-047):** reads come off the writer through a Viewer service account (`lib/sheets-reader.mjs`),
  approve posts in the background (`/api/approve-bg`), and a nightly books check (`/api/reconcile-bg`, 2 AM) leads the 3 AM
  digest - code gathers the facts, the model writes Paul's actions, nothing is auto-fixed.
  **2026-09-26:** the 3 AM digest's Pending section is one short line per item (poller `digestReason_`, the Inbox card's
  wording) - Paul: "a snapshot of the issue not a novel". Three Granite costs dated after its closing stay on Granite:
  they are inside its 09-22 closing, so moving them to Cost Recapture would count them twice.
  **2026-09-26 night (D-048..D-050):** the Inbox's parked cards - a PDF opens in one click; the bookkeeper itemizes one
  item per printed line and a hold still proposes its entries; **a Reprocess never posts or dismisses**; a read can say a
  receipt is partly on the books (the Journal supplies those amounts, it always holds). Five cards re-read and tied out
  to the migrated rows: 437.46 on no book - **Paul decided all five the evening of 09-26 (Inbox empty 09-28); not open.** Later: **plain words for Paul** everywhere in the books (`Recast-books/CLAUDE.md` rule 7 - he is not an accountant); **each card line has Approve / Returned / Dismiss** and one Save; returns with no receipt are planned in `docs/phase3-spec.md` 3a. **Phase 3 (bank statement
  import + reconciling) STARTED 2026-09-28** (D-051..D-053): Recast's own accounts only (Citizens; Chase ending 6317 is Paul's business account, never Dennis); Paul's personal statements never come in; what Recast owes Paul is repaid by one payment AFTER reconciliation. Every advance has `paid_to`; the old books' "Chase" was Paul's personal account (draws moved: Chase 153,450 -> 0, owes Paul 185,116.88 -> 31,666.88). **104 Ashburne SOLD 9/23 for 775,000 but is NOT closed in the books - Paul waits for Dennis's final interest (~10-05)**; Dennis's commission is 3% of the price less concessions (D-053). Next: the statement importer, built from Paul's Citizens QFX. **2026-09-28 evening:** D-054 - Ashburne's tab counted 13,416.39 of the property tax twice, fixed; seven missing Ashburne bills posted (Recast owes Paul 4,033.86 on Ashburne, profit by the books 144,802.94); writer web app deploy owed; next = the 18 parked Ashburne receipts into the SHEETS Inbox, then ~40 Amazon orders found only in Paul's personal Gmail. **The books are Sheets-only for Paul** - never send him to the web app (Recast-books CLAUDE.md rule 8). **2026-09-29:** the sheet's Inbox has two tabs, Receipts | Bank statement (one Inbox; bank-line cards on their own tab) - live, confirmed by Paul. Same day, **D-057 live (writer @14, site `6abbda5b`)**: a Bank statement card's **Waiting on receipt** button records a charge as `NEED RECEIPT FROM <NAME>` on the house Paul picks; the receipt, if it comes, replaces it; the 3 AM email lists what is still waiting. Paul turned down a holding account with no house. `Match statement lines` asks which bank by name. **D-058 live (writer @15, site `6abbdd95`):** a held card that is the corrected copy of an entry (a ride with its tip) takes the old one out when Paul saves it - the yellow box, ticked. Neither has run on a real charge yet. **D-059 live (site `6abbe34c`):** which card paid a bank line is read from Citizens' Daily Summary emails (the bank's file names none) - checked against 35 real emails; the Inbox card says "Dennis's card (9301)". Paul imported the new Citizens file and matched: **Citizens 79 lines - 59 tied, 18 cards, 2 waiting on the Ashburne close**; the first placeholders are in the books (Dennis's three Home Depot charges of 09-28 on 366 Mesa, each its own entry). **D-060: one charge, one card.** Live at the end: site `6abbf585`, writer web app @15, 543 tests, nothing owed. Not proven yet: a receipt taking a placeholder's place, the 3 AM waiting list. Chase's 2,000 of 09-28 is Ashburne's earnest money (D-051) - never ask Paul again. **Afternoon:** three checks booked from Paul's words and the bank's pictures - his working money is 5,000.00 (141.58 was left in from the Sparkling payout), the 1,500 check of 08-11 was Dennis's Citizens check to James Broussard for Mesa siding (the old "James Haroce, Dennis paid" row, C-34), his 607.05 check paid him back and is **all on 136 Bowling Green since 10-02 on his word** (never re-split it from the old Newport tab); A check with no name is booked from the bank's picture of it, never from memory. **D-061 live (writer @19, site `6abc3ad9`): the tab `Citizens Bank`** - every bank line, newest on top, who paid, status, waiting on - what Paul shows Dennis; **Citizens 67 tied, 10 cards, 2 waiting** (8 lines wait on Dennis). **D-063 live (writer @20, 09-30 afternoon): the monthly bank check is a box at the top of the Citizens Bank tab** (Paul: fold new things into what is already built, no new steps) - it found the 223.67 (09-03 Brushwood counted twice; 08-14 Mesa paid on Paul's own card), fixed by `fixCitizensGap`; the box reads "they agree"; Citizens 69 reconciled, 8 waiting on Dennis, 2 on the Ashburne close. **Evening (D-064, D-065, writer @22, site `6abd881d`):** a `P&L` tab in plain words that rebuilds itself every hour - this year's profit and loss on top (Recast earned 56,179.13), then what Recast owns and owes, each fact once (it replaced the menu's Balance sheet and P&L reports, whose tabs were stale 09-11 test snapshots) - it counts Dennis's interest not recorded yet (76,311.69) and adds up; **late (D-066, writer @23):** the menu holds only what Paul uses (Reports, Post interest, Self test gone; Dennis's interest is recorded at closing, not monthly) and oneOffScripts.gs is emptied; Claude credits are a software cost when bought (D-018's prepaid line and monthly job dropped, 1,081.45 moved). **2026-10-01: THE MIGRATION IS CLOSED (D-067)** - one final register (`Recast-books/docs/migration-leftovers-final.md`, 45 items, Paul's answers of 10-01), every leftover settled and posted; never bring Paul another migration-leftover list. Deployed: site `6abea6fd`, writer @26 (16:38 PDT) - nothing owed. **Resume from `Recast-books/HANDOFF-2026-10-05.md`** (1014 S View's receipts are matched - 65 receipts on 136 of 151 lines; owed: Paul runs `linkMolallaReceipts` once, then read back; what was found on the way is listed there; earlier state in `HANDOFF-2026-10-04.md`). **2026-10-02:** the long 3 AM Books check was six false alarms (doubles voided on purpose the day before), one wrong duplicate call and one real loss - a Home Depot save of 36.77 marked recorded that never reached the books (every Journal write now lands before its lock is released); the bank box no longer goes red for a payment dated after the bank file ends; **the email reader had been dropping every attachment after the sixth** - an email with more is now several documents, and Paul's 11 Squarespace invoices (546.76) and 9 Roddy report receipts (759.96) are all in, each bill opening its own PDF (D-073); Mastercard 7952 is Paul's personal card (D-074); the 3 AM email's Posted list shows what he saved. Live: site `6abfd7ae`, writer web app @27, pollers pushed, nothing owed; 550 tests. **10-02 09:35 PDT (D-075): a `Taxes` tab** beside `P&L` - an estimate of what Paul may owe the IRS and Oregon on the year's profit, rebuilt hourly and when he changes a blue cell (`lib/tax.mjs`; the 2027 tables go in when published); live and read back (Paul picked married, typed 5,000 sent to the IRS); deployed 09:40 PDT: writer web app @28, site `6abfd7ae` unchanged; 09:44 every held house is listed (one with no sale price on its tab adds nothing) - pushed, read back and **deployed @29 at 09:47 PDT - nothing owed**; 555 tests. **10-04 (D-078): the Taxes tab shows what Recast carries over from 2025** - one row, home office costs 1,111 (`CARRIED_OVER` in `lib/tax.mjs`); the 2025 business losses were already used in 2025 (no net operating loss) and Paul's personal 37,452 stock loss stays OFF the tab and out of its numbers (his word: only what Recast can take); writer web app @30. **10-04 evening (D-079): 1014 S View, Molalla OR** - Paul's own house (hard money loan, no Dennis), bought and rehabbed 2025, sold 2026-01-12 at a loss of 34,579.10 and in no book until now - brought in from his sheet "Recast 2025" line by line (151 cost lines, the purchase side on 1000, paid by Paul; the loss put in by him, not owed back), with `1014 S View - Frozen` (light template), `1014 S View - Closing` and his own sheet copied in as `1014 S View - old sheet` (Paul removed that tab himself later on 10-04) - the Frozen and Closing tabs are his records, never rebuild them; a 2026 loss in full: Recast earned 19,103.52, Taxes set aside 43,502.30; two lines on his sheet (1,260.00 and 101.67) may be entered twice - his closing papers settle it; **D-080 (same evening): the house tabs and closing tabs follow the Journal to its last row instead of stopping at row 5,000** (`journalRange_` in Code.gs, the last row kept on the hidden `Journal helpers` sheet; never type a Journal row into a tab formula - a lint fails on it) - run by Paul 22:35 CDT and read back (every held tab and closing tab reads as before and equals the Journal; no slower), the one-off is out; Totals keeps its own 20,000-row bound, about March 2027 at 100 rows a day, and says so on the tab when passed; **D-081 (22:50 CDT): the Taxes tab's last section, `NOT IN THESE NUMBERS - FOR YOUR ACCOUNTANT` (flights 12,421.27, local taxes, late interest), is removed on Paul's word - never put it or a travel row back; the flights are still counted as a business cost and the tax-home question (Q-1) stays the accountant's; read back live after the 23:05 rebuild, the tab ends on `SET ASIDE FOR BOTH` 43,502.30**; writer web app **@32** (22:51 CDT: the sold-house fix - a rebuild no longer makes an empty tab for a sold house, whose record is `<house> - Frozen` - and D-081's lib.gs), nothing owed, 560 tests, pushed to GitHub. **10:00 PDT (D-076): receipt photos over 3 MB had been stored as 1500x2000 copies (about 100 of 387)** - the poller's cap is 4 MB now and an over-cap photo keeps the largest copy that fits; both pollers pushed, not yet seen on a real photo; **the 87 small photos linked from the books were replaced with their originals the same morning (90 Drive files, same links, read back full size)**; 10 of those originals are over 4 MB, so about 1 new photo in 40 is still stored reduced; 556 tests. **10-01 afternoon: the closing tab** - Sparkling's 4,716.82 reimbursement arrived in full and came off the top (settled; never call any of it Sam H's money). Paul then designed a simpler closing tab himself and made it the standard for every house except 104 Ashburne (D-069): INCOMING CASH AT CLOSING, PROJECT COSTS, PROFIT, PAYOUTS, in his rows and wording; D-071 (replaced D-068) - Rehab Costs is every bill and a cash advance's principal is not a cost row (it is under Dennis in Payouts; the cost list says `Cash Advances Interest on $6,838`). Both closed houses are in it. Never delete a closing tab to rebuild it. Next: 881 Newport closes 10-02 through Sell property - read its new tab back. D-070: lawn care is a rehab cost on the house tabs too; the closing tab ends with AFTER THE PAYOUT. Frozen house tabs are Paul's hand-edited records - read and compare before any rebuild (Sparkling's was overwritten once and put back). D-072: a house tab is frozen when its closing is RUN in the books, not on the closing day (Ashburne and Newport stay held and keep taking bills until Paul settles with Dennis in person); the closing tab's AFTER THE PAYOUT lists every bill. Paul's old sheets (the cutover xlsx in Recast-books/data/migration) are his model. Writer web app @26 (16:38 PDT), nothing owed. **09-30 evening:** docs drift fixed (README had named the OLD workbook live; the writer README said New deployment - never, always `clasp deploy -i` the same id); the 3 AM email and the sheet's Inbox now point at the workbook, never the web app. Older Recast-books specs and handoffs are dated history - `Recast-books/CLAUDE.md` and `docs/decisions.md` win.
  **2026-09-26 late (audit §67):** the spacer text on 104 Ashburne came back - the writer web app (what the pollers and
  the web Inbox post through) was still on version 4 from 09-22, so the §61 fix never reached emailed receipts. Deployed
  @5, Ashburne rebuilt, every tab read back clean. **A writer push that touches `Code.gs` or `lib.gs` needs `clasp
  deploy -i` too** (Paul's step) - a push alone only changes the menus and triggers. **Hand-run scripts (repairs, diagnostics, the migration) live in `apps-script/writer/oneOffScripts.gs` (D-056, 2026-09-28), never in `Code.gs`/`Menu.gs` - the lint enforces it; a one-off needs a push, not a deploy; it comes out once it has run - git keeps it, all 42 to 09-30 are in commit 774ecd3 (D-066).**
- W-9 collection is still the one urgent item with a statutory deadline (Jan 31).
- 2026-09-16 parallel-run audit of both receipts pollers (`Recast-books/CHANGELOG.md`,
  `Recast-site/RECEIPTS.md` change log): the read is the same in both; the new gate's
  rails (`PAYER_UNKNOWN`, $500 ceiling, meals hold, Uber Eats dismiss) and the old
  poller's `label:receipts` clause explain the different outcomes. Fixed the same day:
  HEIC photos (new), error-envelope retry (new), split-forward and twin-race holds (old).

