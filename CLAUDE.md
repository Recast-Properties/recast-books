# Recast Books — the bookkeeper app

Read `BUILD-PLAN.md` for what is being built and why, `docs/phase0-spec.md` for the
technical contract, and `docs/decisions.md` before proposing anything that reverses a
decision. `PLAN.md` is the accounting design the app implements.

## What this repo is

The **new, separate** bookkeeping system for Recast Properties LLC, built alongside the
current workbook and receipts bookkeeper (`../Recast-site/`), which Paul keeps using
until the parallel run proves this one. A Google Sheets workbook is the system of
record; Claude is the bookkeeper; a web app at **books.recast-properties.com** is the
front door.

- `web/` — static front end (Netlify publish dir); `netlify/functions/` — `/api/*`;
  `lib/` — pure modules (posting engine, auth, writer client, COA, money), unit-tested;
  `apps-script/writer/` — the only thing that writes the workbook; `docs/`, `data/` — design.
- Live ids (workbook, Apps Script project, Netlify site) are in `docs/phase0-spec.md` §10.
- `npm test` runs everything (node:test, zero dependencies). Deploy: `npm run deploy`
  (`netlify deploy --prod --no-build`). Writer: `clasp push -f` from `apps-script/writer/` (menus and triggers run the
  pushed code at once); `clasp deploy -i AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w`
  only when `doPost` changes, so `WRITER_URL` never changes.

## Load-bearing constraints

1. **Never touch the old workbook** (`1isEbfNKPO32Wpf08EtLkNHX85c0rTIl8tpH9bUdgQbs`),
   anything under `../Recast-site/`, or the two live receipts Apps Script projects.
   Migration reads the old workbook; nothing here ever writes to it.
2. **Every write goes through the Apps Script writer** behind its ScriptLock. Functions
   read through it too. No Sheets API writes from anywhere else.
3. **Claude decides, code executes.** Model judgment for reading, classifying, matching;
   deterministic code for arithmetic, balanced entries, `txn_id` identity, the gates
   (autofile ceiling, period lock, 1099 block). The UI must show which was which.
4. **Overhead never touches a property** (D-010). **Every Dennis advance is against a
   property and its interest is that property's cost** (D-011, D-021, D-022). D-010 is
   enforced in `lib/posting.mjs`; the interest accrual is the close job in `books-dennis.mjs`.
5. **Dry run, back up, tie out twice** for anything touching history (Phase 4). **The old
   books are the target (D-027):** the migration reproduces them row by row in the new
   system with the receipt linked; the read is evidence, the old row wins, differences go
   through the corrections register.
6. **Paul acts one step at a time.** When he must do something (console, editor,
   Terminal), give exactly one step and wait.

## Status

**Phases 0, 1 gated 2026-09-11; Phase 2 gated 2026-09-12; Phase 2.5 (read cache) shipped 2026-09-12; hardening 2026-09-14 (invoice-keyed txn_id, cache warmer, Totals tab, voided pairs hidden; D-015 two locks, D-016 Dennis 8%); Phase 2.6 (property mailboxes via a properties@ poller, property tabs, D-017 Held/Sold) built 2026-09-14, gate in progress on 1616 Granite. Poller audit 2026-09-16: HEIC photos now convert (`heic-convert`; jimp never could), `error` envelopes the model never reached are retried by the warm job (max 2).**
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
edit it; a test keeps it in sync); the web app keeps Dashboard, Inbox, Upload, Settings (API
costs). The old standalone writer project is dormant. **Inbox review in the sheet built 2026-09-16**
(spec §6: Recast Books → Inbox… sidebar; the queue stays in Blobs, Approve files and posts
in-process, `mark-posted` records it; `lib/gate.mjs` is in `lib.gs` now; approve is split so the
user waits only for the post, ~2.5 s - see CHANGELOG 2026-09-16 late). Next: **Phase 4
migration, forensic, ahead of Phase 3 (D-024, 2026-09-16)** — audit done 2026-09-17
(`docs/phase4-audit.md`, snapshot in `data/migration/2026-09-17/`). Listings, reads (946 docs)
and the staging re-posts done 2026-09-17/18. **Method changed 2026-09-18 (D-029): the
migration is row-driven - post the old row, attach the matched receipt (D-027 the old books
are the target, D-028 returns hold for Paul). **Resume from `HANDOFF-2026-09-23.md`, then `docs/phase4-audit.md` §51-§66** - state on 2026-09-23:
- **Numbers:** dry run **1,048 entries, $240,844.35**, ten property totals (`rows/expected.json`), all build in the posting engine; **920 linked (87.8% of rows, 78.6% of dollars)**; 128 rows / $51.4K with no document, of which $36,880 Paul accepted (contractor checks and cash) - the rest is cash labor and small rows, proven in Phase 3. 33 advances. Corrections **C-1 … C-33** in audit §13; decisions D-027 … D-034 (D-034: property tax - payments post when paid, the closing proration posts at closing, the tab estimates in between).
- **CUTOVER DONE 2026-09-21 (audit §51):** the production Journal was born in one pass - 1,048 entries, $240,844.35, $0.00 on all ten properties, 922 linked (every link a Drive file), 33 advances - tied out on both paths and identical to staging pass 11. `WRITER_URL` points at PRODUCTION; the old receipts poller's triggers are deleted (2026-09-22, §52); live receipts post to the real books. Corrections C-1 … C-33. **2026-09-22 (§52-§54):** the doGet misfire found and fixed in `lib/writer-client.mjs` (reads retry, writes never); `why` is one sentence, the working is in `checked`; the property tabs rebuilt and every one reconciled to the old workbook (Ashburne's heavy layout redone as Paul drew it; Selling-class lines now show on the light tabs). **2026-09-22 later (§55-§56):** the Inbox's 387 migration leftovers dismissed (18 left: 12 parked Home Depot / Lowe's for Phase 3, 6 live); the properties@ poller is ON (project `1k2htSsuL…`, `MAILBOX=properties`, `START_DATE=2026-09-17`, `clasp push -P .clasp-properties.json`); its first reads were refused as `reasoning_extraction` - `checked` reworded, server-side fallback on every model call. The old workbook is **"Recast 2026 CLOSED 2026-09-21"** (duplicate Materials cells deleted, only paul@ has access) and staging is ARCHIVED (§57). Anthropic $13.06 was already linked (card fixed). **D-035 (§58): no attachment, the email is the receipt** - upload stores it as `email.txt`, every filing path links it; writer `setDocUrl` action (web app @4); Wi-Fi Onboard and Berrett linked. **PHASE 5 BUILT AND BOTH CLOSED SALES POSTED 2026-09-22 (audit §60, `docs/phase5-spec.md`, D-036…D-039):** one menu item `Sell property…`, four steps - upload the closing document, Claude reads it and fills the form (`/api/settlement` + `-bg`, a background job: a sync function dies at 10 s), preview, close. 1616 Granite (profit 109,178.56, Paul 28,489.52 = the old tab to the cent, holdback of 60,000 released 09-11) and 280 Sparkling (profit 60,930.09 = the old tab, read from its PDF at Recast's 50% share, D-037) are both closed, escrow and Dennis at zero. 453 tests. The closing tab is written beside the property tab (`CLOSING_TAB_IN_PLACE`) until Paul signs the layout off. **Open:** that sign-off; Newport and Ashburne when they close; then Phase 3.
- **2026-09-23, the heavy tab and the Inbox (audit §61-§63):** `setupPropertyTab` inserts the left spacer column AFTER writing the grid, so a block sits one column right of where it was built; the light template's `deleteColumn(8)` cancelled that, and `8b5138b` made the delete `!heavy` (to keep column H = Interest), so `refreshHeavyBlocks_` was writing every refresh one column left - into the spacer - and the blocks under their headers went stale. **Both of Paul's symptoms, one cause**; the summary was never wrong (SUMPRODUCTs over the Journal, not the blocks). A block's column is now read from its own header. Also: an untraded Holding line falls under Utilities (the model leaves `trade` null on a utility bill). **The Ashburne tab still needs one rebuild to clear the spacer text** - `rebuildAllPropertyTabs` now does it along with everything else. Inbox (D-040, D-041): every bullet is an action Paul takes and nothing else is a bullet (`why` and `checked` collapsed under "Claude's read"); gate codes are translated and a lint fails if a new one is not; **property is per item** with the entry's select as "set all", and Approve splits one entry per property; the account picker is grouped Property costs / Business overhead / Cash and other; live D-010 check ("Business account on a property - set 6510 to OVERHEAD"); a trade picker, offering the trades the tabs group by. 455 tests.
- **2026-09-23, the light property tabs (audit §64, D-042) - light template only, 104 Ashburne untouched:** the **Dennis commission rows are gone** from Payouts (his line and Paul's `Less Dennis commission`) - he charges none on a partnership deal; the commission stays a **bank-deal** term (`dennis_commission_pct`, the heavy tab's line, `lib/sale.mjs`'s 1210 entry at closing, D-036). **`Due to Paul (paid less reimbursed)` → `Paul Paid (direct)`** (label only). **`Concession (type it here)`** added to the Profit Breakdown below Closing % - the heavy tab's cell, blue, kept across rebuilds, subtracted as `-ABS(...)` so a hand-typed minus cannot turn a credit into profit. **`Received (advances, refunds)` split into `Received (advances)` + `Received (refunds)`** on payee (an advance's two lines both carry `Dennis Little`, `buildAdvance`; a refund is a negative cost row carrying its vendor) - an **exhaustive partition**, so a payee the rule does not expect can only move a line between the two rows, never out of the block total; verified against the books first (33/33 advances `Dennis Little`, all 7 negative rows vendors). **Dennis Paid (direct) keeps ONE Received row**, unfiltered: a direct-paid Dennis cost *is* an advance, so an advances row there could only read zero (Paul agreed, removed). 455 tests, pushed, no deploy.
- **2026-09-23 evening, receipts on the tabs and the frozen record (audit §65, D-043):** every line block (light AND heavy) gained a **Receipt** column after Amount - `receiptCell_(doc_url)` writes a HYPERLINK, blank when there is no document, so the column doubles as which lines have one. Offsets are constants now (`PT_BOX_OFFSET = 5`, `PT_TXN_OFFSET = 8`, `PT_BLOCK_COLS = [10, 19]`; heavy is `PT_HEAVY_COLS = 5` with `PT_HEAVY_STRIDE = PT_HEAVY_COLS + 1`) because **the spacer column is what gets missed when a block grows** - Paul warned about it and he was right, the spacer's width was still coming off a literal `c0 + 4`. `lineDescription_` falls back to the entry `memo` for a line with no description (a sale's release lines have none), so the settlement rows read "settlement statement" / "project cost released to COGS" instead of nothing - no backfill needed, the memo was always there. **D-043 REVERSES phase5-spec §3: the property tab is FROZEN at closing as the record, the closing tab stays separate, `CLOSING_TAB_IN_PLACE` stays false forever and its sign-off is moot.** `sellPost` freezes the tab (formulas -> values) immediately before it posts; `setupPropertyTab`, `refreshLineBlocks_` and `onPropertyTabEdit` all leave a sold property alone. `setupPropertyTab(name, asOf)` is the one exception - it reconstructs the pre-sale record by dropping `source = "sale"` rows **by source, not by date** (Granite has a real cost dated the day it closed). **Six-hour hole found and closed:** `sellPost` wrote `status = sold` straight to the sheet, which clears no cache and fires no trigger, while `buildCtx_` caches the postable property set for 6 h - so a receipt could post onto a just-sold property; it now clears `ctx` on the spot. New editor helpers: `reportStrandedCosts()`, `rebuildFrozenRecord(name)`, `rebuildAllFrozenRecords()`. **Granite's 178.48 was a duplicate on the wrong property** (the 2026-02-19 Home Depot rows already migrated onto 104 Ashburne, replayed 1h49m after the sale posted) - voided, not recaptured; 280 Sparkling clean. Granite: revenue 430,000.00, COGS 375,410.72, rehab only 9,713.97. 463 tests, pushed, no deploy.
- **All five lists are done** (audit §40-§43): list 4 in mail not in the books 0 (`mail_settled`), differences 0 (`differences_settled`), confirm 0 real (the 3 shown are rows Paul dropped), questions answered; every decision, link, refusal (per document), drop, addition and retraction is in `data/migration/2026-09-17/paul-answers.json`. **Paul's stopping rule:** no new cost unless proven paid AND absent from the old books by total, pre-tax subtotal and items; otherwise park for Phase 3.
- **Facts corrected on 2026-09-18:** 104 Ashburne has NOT closed - still held. **881 Newport has NOT closed either - under contract (Paul 2026-09-21, audit §47); sold = Granite and Sparkling only**; its two Cost Recapture lines moved to its own tab. "Effren" rows are **Falcon Creek Lawn Care** (`rename_payee`). Paul's notes are the documents for cash labor.
- **Matcher fixes 2026-09-21 (`migration-compare.py`):** coincidental subset sums (26 false Home Depot / Lowe's links removed), near-amount tolerance capped at 10% of the row, lone stale-duplicate dismissals are real receipts. `migration-audit-links.py` has a far-from-receipt section; both sections are clean (Shalom's second payment is the one expected line).
- **Never say "no document" or "not in the old books"** before searching the amount (within two cents, as a sum of items, and as the document's pre-tax subtotal) on every old tab and in ALL listed mail (`gmail-listing-*.json`), not only the 968 documents that were read. After any change to the inventory, matcher or answers: rerun the pipeline and both audit scripts and **diff the links against the last commit**; read every link that disappeared. One double count was made and caught this way (audit §38).
- **Envelopes are cached** in `.cache/envelopes/env/` (git-ignored, 968 files) - the pipeline and audits run offline: `--env .cache/envelopes/env`, `migration-audit-links.py .cache/envelopes`.
- **Open, in order:** (0) **Paul: Extensions -> Apps Script -> run `rebuildAllFrozenRecords`** - reconstructs and freezes the 1616 Granite and 280 Sparkling tabs as they stood the moment before each sale posted (they sold before freezing existed). `rebuildAllPropertyTabs` is DONE (D-042 is on all ten tabs, Ashburne's spacer text cleared); (0b) **answered 2026-09-23: "tools are overhead"** - D-010 stands, no chart change; the prompt now says a tool is overhead even when bought for one job and that a mixed hardware receipt is two entries (**not deployed** - rides with the next `npm run deploy`); (1) **duplicate-replay sweep DONE (audit §66):** four receipts voided, **488.67** (178.48 Granite, 310.19 Ashburne) - all replays of rows already in the old books, posted in one burst on 2026-09-22 17:31-17:46 when the parked Home Depot items were approved instead of parked. `reportDuplicateReplays()` / `voidDuplicateReplays()` are the editor helpers. **Blind spot to carry into Phase 3:** the old books sometimes combined several receipt items into ONE row (D-029), so a line-level matcher cannot see an itemising replay - the three tools that summed to the migrated "Scrapers" 23.75 were invisible to it. Check the parked Home Depot / Lowe's items by hand. Also for Phase 3: an entry whose description says "PENDING ROUTING" should not be postable. (The closing-tab sign-off is GONE - D-043 keeps the two tabs separate.); (2) 881 Newport (under contract) and 104 Ashburne through the same sell wizard when they close - Ashburne is the bank deal, 12%, 3% commission, no profit share; (3) runbook step 17, optional: Paul drags `2026/` and `Migration evidence/` from the STAGING Drive folder into "Recast Books"; (4) Phase 3 banking, where everything parked lands; (5) **W-9 collection** - nine payees over threshold, zero on file, January 31 deadline, no dependency on any phase. Owed by others: Dennis's PayPal receipts for the Granite, Sparkling and Newport listing fees. `clasp` needs a fresh `npx clasp login` every few days (Workspace re-auth).
- **Live since 2026-09-18:** the bookkeeper prompt reads Paul's subject and typed note first (they settle `paid_from`); image type sniffed from bytes; the Inbox is a collapsed, filterable list. Paul's live receipts post to production since the 09-21 cutover.
Staging ids in `phase0-spec.md` §10; staging is ARCHIVED and `WRITER_URL` points at PRODUCTION. Phase 3
(statement uploads — D-019 dropped Plaid; `docs/phase3-spec.md` to be revised for the menu
shape) follows.

Policy learned in the Phase 2 gate (D-012): the bookkeeper decides the easy cases itself —
PDX↔DFW travel posts with a written purpose; a confident dismiss is final; duplicates are
caught by invoice number with a fresh ledger read before any post. Card last-4s live on
`Bank accounts` (1401 → 5450) and Settings `paul_personal_last4` (9166); the model is
shown them with every document.

Operating notes: deploy = `npm run deploy`; writer = `clasp push -f` + `clasp deploy -i
<id>` from `apps-script/writer/`; poller = `clasp push -f` from `apps-script/poller/`
(runs latest saved code, no deploy). Netlify function logs:
`npx netlify-cli logs --source functions --function <name> --since 15m` (unreliable —
prefer the envelope's `error`/`error_stack`). Paul still owes Dennis's and the
accountant's Google emails for the Users list (added on the Users tab now, D-023). D-018: Anthropic
top-ups post to 1520; `/api/api-costs` expenses usage monthly by Console workspace
(needs `ANTHROPIC_ADMIN_KEY`; the poller calls it on the 2nd). D-013: the new workbook is cleared once at the start of
Phase 4, then history is migrated and live receipts replayed; append-only from then on.

Test data in the live workbook: Journal holds the PHASE 0/PHASE 1 gate entries, all
voided (append-only ledger — they stay); Properties has `TEST Phase 1 gate` and Advances
its voided row — Paul may delete those two rows by hand.
