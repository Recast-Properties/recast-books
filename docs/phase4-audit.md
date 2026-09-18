# Phase 4 audit — what is in the old books, and what the forensic migration costs

Read 2026-09-17 from a full xlsx export of the old workbook (`data/migration/2026-09-17/`,
which is also the Phase 0 dated snapshot). Nothing was written anywhere and no API money was
spent. Row-level inventories: `recast-biz-rows.json`, `property-rows.json` in that folder.

## 1 · RECAST BIZ (overhead)

| | rows | $ |
|---|---|---|
| Total | 284 | 21,908.91 |
| Poller-filed, each row carries its Gmail message id in the `Receipt` HYPERLINK | 189 | 15,833.55 |
| Manual (no document) | 95 | 6,075.36 |

- **The 189 mail rows need no matching.** The link is `#all/<msgId>`; the replay list is
  exact. 180 unique messages; the 9 ids that appear twice are all one email split into two
  line items (airfare + seat, record copy + fee, two CoreLogic invoices). No duplicates found.
- **Manual rows** by block: Tools $4,049 (61 hand-entered Jan–Feb rows plus 7 later),
  Interest $666.67 (labelled "420 Alyssa" — **no such property tab exists any more**),
  Marketing $380, Meals $312, Gas $310, Subscriptions $287, Website $58, Office $12. By month:
  Jan 25, Feb 27, Mar 8, Apr 7, Jun 25 (the June stall), Aug 1, undated 2 (Apify $29,
  the Interest row).
- Jan–May was already swept once against Gmail on 2026-08-24 (old system, 1,999 messages,
  47 posted, VistaPrint left out by Paul's call). Those decisions stand; the new sweep
  reports the gap but does not relitigate them.

## 2 · Property tabs

| tab | expense rows | $ | template |
|---|---|---|---|
| 881 Newport | 30 | 3,089.17 | light, Paul/Dennis/Recast flags |
| 469 Brushwood | 33 | 1,916.80 | light |
| 366 Mesa | 26 | 9,648.00 | light |
| 136 Bowling Green | 47 | 3,446.65 | light |
| 1616 Granite RECONCILED | 60 | 11,905.87 | light |
| 280 Sparkling RECONCILED | 34 | 3,179.78 | light |
| Sparkling for Title | 29 | 4,716.82 | duplicate of 280 Sparkling; totals differ |
| 206 White Rock | 0 | — | summary only (sale price, share); no cost rows |
| 104 Ashburne | ~510 | see note | heavy, 21 trade blocks; header Rehab Total $157,945.30 |

- Light-template rows: 259, $37,903. All have Paul Paid / Dennis Paid / Recast flags. These
  are contractor and utility payments with **no email receipts** — they migrate as
  `source = migration` entries, no model read.
- **Ashburne** needs a per-block map before its tie-out: a naive scan of the tab captures
  $224.6K of rows against the $157,945 header, because the draws list and utilities/insurance
  blocks sit beside the trade blocks and some rows are listed twice by design ("Cash Draws
  are what count against project cost"). Sold and reconciled; the tie-out target is the header.
- **Two Sparkling tabs** still exist (the 2026-08-26 review asked for one). Pick RECONCILED.
- **Cost Recapture**: 4 post-close utility rows (Sparkling, Granite; Sept water and TXU),
  all Recast-account paid — post-sale costs to COGS (D-015).
- **Cash Advances**: 21 rows (purchases + draws + "Dennis Paid Julio"); the accrual engine
  already reproduces this tab (Phase 1 gate).
- **Sales**: five closed sales, $243,740.64 of "income from house sales" (Granite 28,489.22
  + lien holdback 30,000; Sparkling 32,246.85; Newport 28,131.88; Ashburne 124,872.69) and a
  pipeline list. Not in the Phase 4 2a list — it must be; it is the revenue side.

## 3 · The new books since 2026-09-11

Blobs hold 54 document records: 22 dry runs, 7 test uploads (`up-test-*-0916`), 25 real
(11 posted, 14 dismissed/held). D-013 clears all of them; the 25 replay after history.

## 4 · What it costs

Per-document model read, **measured** on the 25 live documents (Opus 5, cache included):
mean **$0.21**, range $0.11–$0.32.

| step | reads | $ |
|---|---|---|
| Gmail sweep (read-only listing, Apps Script, Paul clicks Run once) | 0 | 0 |
| Replay the 180 unique RECAST BIZ messages through the bookkeeper | 180 | ~38 |
| Replay unfiled receipts@/travel@ mail the sweep turns up (unknown; old system's pending tail was 24) | 0–100 | 0–21 |
| Replay the 25 documents since 09-11 | 25 | ~5 |
| Manual RECAST BIZ rows, all property rows, Cash Advances, Sales, Cost Recapture: migration entries, account mapping done in-session by Claude, no API call | 0 | 0 |
| **Total** | 205–305 | **≈ $45–65, ceiling ~$90** |

Wall-clock: the ingest job takes roughly 30–60 s per document, so the replays are 2–4 hours
of background processing, in batches of 20 per poller run.

## 5 · Next steps, in order

1. Paul: one click — run the read-only Gmail listing (to be added to the poller project as
   `listBooksMail`, modelled on the old `backfill-scan.gs`: never labels, never posts).
2. Diff the listing against the 189 ids + the 25 new-system docs → the alignment report.
3. Paul reviews the report and the Ashburne block map.
4. D-013 clear → migration entries (deterministic) → replays (paid) → tie-out.

## 6 · Forensic check of the manual rows (added same day)

The old system's 2026-08-24 sweep left the whole mailbox listing in Drive
(`backfill-mail-part-1/2.json`, 1,999 messages, mostly Jan–Jun 2026; copied to
`data/migration/2026-09-17/gmail-dump-2026-08-24.json`). Matched against the 95 manual
RECAST BIZ rows by vendor, date and amount, with no Gmail access:

| result | rows |
|---|---|
| Vendor email on the same day (mostly Home Depot "Your Electronic Receipt") | 63 |
| Exact amount + vendor match | 4 |
| Amount match only (Amazon fwd, toll tag) | 3 |
| Nothing in the mailbox | 25 |

- The hand-entered Tools rows are **line items from Home Depot e-receipts** Paul got at the
  register (33 e-receipts in the dump; 47 of the 68 manual tool rows, $1,878 of $4,049, fall
  on an e-receipt date). Replaying those 33 emails recreates them with documents.
- No document exists in the mailbox for: Harbor Freight (8 rows, in-store), crew meals
  (Taco Casa, Uber Eats, Shell — 6 rows), the $625.69 finish nailer (03-12), three June
  Office rows, the toll-tag replenishment, the 420 Alyssa interest row. These stay
  `NO_DOC` until bank statements (Phase 3) prove them.
- Original receipts land in Paul's personal Gmail accounts (`pvb421@gmail.com`,
  `recastpropertiestravel@gmail.com`, `104ashburne@gmail.com`) and reach the Workspace
  mailbox only when forwarded. The migration can only see what was forwarded.
- Property-tab rows (contractors paid by check/Zelle, utilities) were not matched here;
  utilities likely have emailed bills, contractor labor does not.

Replay cost for the forensic bucket: ~33 Home Depot e-receipts + ~15 other matched
messages ≈ 50 reads ≈ **$10**, on top of §4.

## 7 · Paul's additions, 2026-09-17 (folded into BUILD-PLAN §7, Phase 4 method)

- **Receipts are itemized across tabs.** Many tool receipts sit with the property receipts
  and were split by hand between RECAST BIZ and a property tab, especially 104 Ashburne. A
  full re-run routes each line where the receipt supports; the old split is not reproduced.
- **Scan every mailbox**: pvb421@gmail.com, paul@, travel@, and the property addresses
  (104ashburne, 1616granite, 881newport, 136bowlinggreen, 366mesa, 413greenacres,
  469brushwood, 200janice, 206whiterock, 280sparkling). Workspace groups are read via
  properties@; gmail.com accounts need a per-account run (Q-9).
- **Temp workbook** proposed by Paul; Claude recommends the new books workbook as the staging
  area (Q-8).
- **Returns were netted in the manual rows.** Paul omitted returned items rather than posting
  purchase + credit. Comparison is therefore on net per vendor per day; the new books carry
  gross + credit; unexplained net gaps are the findings. Home Depot Pro Xtra purchase history
  (CSV) and card statements are the secondary sources.

## 8 · paul@ mailbox listing, 2026-09-17 (`listBooksMail`, 5 parts, read-only)

`data/migration/2026-09-17/gmail-listing-paul-2026-09-17.json` (3,454 messages, all of
2026), `paul-mail-classified.json`, `paul-replay-list.json`.

| bucket | messages |
|---|---|
| Addressed to receipts@/travel@ | 474 |
| … of which in the old sheet (all 180 sheet ids present) | 180 |
| … in the new system since 09-11 (all 25 present) | 25 |
| … unfiled: receipt-shaped (66 Uber rides, 33 Paul forwards, 8 travel-gmail forwards, 9 unsure) | 123 |
| … unfiled: junk by subject (check-in, promos, surveys, shipping notices) | 220 |
| Vendor receipts/bills **never addressed to receipts@**, amount not on RECAST BIZ or any property tab | 93 |

The 93 are the "in mail but not in the books" bucket: Home Depot 35 (the e-receipts behind
the hand-entered tool rows), TXU 14, Atmos 12, CoreLogic 10, Lowe's 5, VistaPrint 5,
Waxahachie Water 4, Apify 3, Telnyx 2, Energy Texas 2, Netlify 1. Utilities here may be
bills the property tabs carry under a different amount (partial payments, autopay); the
comparison decides.

**Replay reads for paul@: 180 + 123 + 93 + 25 = 421 → ≈ $63–88** (junk dismissals read
cheaper than posts). Still to list: properties@ (Workspace, one click as properties@) and
the gmail.com accounts (Q-9).

## 9 · properties@ mailbox listing, 2026-09-17 (new project under properties@, 2 parts)

`data/migration/2026-09-17/gmail-listing-properties-2026-09-17.json` (530 messages),
`properties-replay-list.json`. **Finding:** no Recast Books Poller project exists under
properties@ — the Phase 2.6 instance described in `docs/phase2.6-spec.md` was never created
there; the listing ran from a fresh project.

| bucket | messages |
|---|---|
| All of 2026 in properties@ | 530 |
| Labelled 104 Ashburne (333 addressed to `104ashburne@gmail.com`, forwarded in) | 369 |
| Other property labels (Granite 33, Bowling Green 30, Sparkling 22, Brushwood 20, Mesa 15, Newport 14, Green Acres 3, White Rock 2, multi-label 17) | 157 |
| Receipt-shaped by subject/attachment | 194 |
| … amount already on a property tab or RECAST BIZ | 107 |
| … amount on no tab (Ashburne 36, Granite 20, the rest spread) | 87 |
| Blank subject from pvb421@gmail.com, Jan–Apr — phone photos of receipts, no text body | 281 |
| Junk | 5 |

The blank-subject photos are receipts too (the Ashburne rehab, sent from Paul's phone);
they replay like any photo upload. So the properties@ replay is effectively the whole
mailbox less junk: **≈ 525 reads → $79–110**.

**Combined replay so far (paul@ + properties@): ≈ 946 reads → $140–200.** Still unlisted:
pvb421@gmail.com and recastpropertiestravel@gmail.com as accounts of their own (Q-9); the
104ashburne@gmail.com history appears to be already inside properties@ (333 messages
addressed to it), to be confirmed against that account.

## 10 · pvb421@gmail.com listing, 2026-09-17 (personal Gmail, new project, 3 parts)

`data/migration/2026-09-17/gmail-listing-pvb421-2026-09-17.json` (4,253 messages),
`pvb421-candidates.json`. This is Paul's personal mailbox: Amazon (476), Chase alerts
(180), PropertyMax, Fandango, Capital One, Robinhood, family Venmo. The business items
were forwarded out of it (46 to receipts@, 264 to 104ashburne@, 79 to paul@, 21 to
136bowlinggreen@) and are already in the other listings.

**Do not replay this mailbox wholesale.** It is personal, most of it would be dismissed at
$0.11–0.20 a read, and it puts personal mail through the business system. Use it as a
lookup for named gaps only:

- **Harbor Freight**: 8 e-receipts here, 5 never forwarded — the documents behind the
  no-document Harbor Freight tool rows (see the match printed in the session log; carried in
  `pvb421-candidates.json`).
- **Amazon**: orders whose amount appears on a tab are pulled by id; the rest is personal.
- **Chase**: "Your latest statement is now available" and transaction alerts are the
  personal-Visa source for Phase 3 (statement uploads), not receipts.
- Uber Eats, Venmo to family, Fandango etc.: personal, never read.

Replay reads from pvb421: **a few dozen by id**, ≈ $5–10.

## 11 · Staging replay, run 1 — what it produced and what Paul decides next (2026-09-17 afternoon)

Machinery: `apps-script/poller/Listing.gs` (`listBooksMail`, `replayIds`, `repostAll`),
`clearBooks()` + `migrationRegisterProperties()` in the writer, `repost`/`repost-all` +
`fromStored` + `overrides` in the functions, `scripts/migration-compare.py`. Staging ids in
`phase0-spec.md` §10. CHANGELOG 2026-09-17 has the run log (API auto-recharge outran once).

**paul@ (412 envelopes, comparison run 2):** 171 of 180 sheet-id documents tie to the cent;
22 manual and 20 property rows now carry a document; 27 twins collapsed; 71 documents in
mail with nothing in the old books (~$12.5K). **properties@:** 528 in flight; the first 43
were 42 real receipts (the Ashburne phone photos).

**Why most of it sits in Pending:** `PAYER_UNKNOWN` on 111 post-verdict documents ($9,269):
69 receipts show no card at all, 24 mention 5450 in a way the model did not accept, a
handful name cards on no account (6774, 3746, 7952, 9179, 7274). Overall `paid_from`:
PAUL 204, UNKNOWN 204.

**Decisions Paul gives once (applied by `repostAll` with `books-repost-<mailbox>.json`
overrides, never card by card):**
1. Which account each unlisted card is: 6774, 3746, 7952, 9179, 7274.
2. The default payer when a receipt shows no card, by period (e.g. "Jan–May personal Visa,
   June onward Citizens 1401") or by vendor (Anthropic 33, Uber 14, AA 9, Adobe 7, Netlify 6).
3. Property attribution: where the old books put a receipt on a property tab, the old
   attribution wins over the model's guess (recommended) — or not.
4. `[Personal]`-tagged Uber rides (16 unfiled + the ones already on Travel): business
   airport runs stay; which are personal.
5. Utilities found in mail but on no tab (Atmos 10, TXU 7, Waxahachie 3, Energy Texas 2):
   property costs to add, or already paid from an account the property tabs never tracked.
6. Sold properties flip from `held` to `sold` (with settlement dates for Ashburne and
   Newport, still missing) only at the tie-out.

## 12 · Comparison run 3 — both mailboxes, 937 envelopes (2026-09-17 13:30)

`data/migration/2026-09-17/comparison/`. Status: 240 posted, 499 pending, 139 dismissed,
59 errors (staging writer overloaded under ~100 concurrent ingests; 48 of them keep their
stored read and just re-post, 8 need a paid re-read). Verdicts: 620 post, 168 hold, 141
dismiss.

- **A:** 180 sheet-id documents, 171 net-equal. **B:** 260 property rows and 50 manual rows
  now documented; 64 twins; 266 "in mail, not in old books". **C:** 285 old rows still
  uncovered (from 1,000+), 155 of them Ashburne.
- The "not in old books" $1.56M is mostly the **acquisition receipts** (ServiceLink /
  Auction.com sale receipts: Sparkling $393,701, White Rock $369,000, Bowling Green
  $294,651) and Dennis's **$20,000 draws** - they belong to the Advances lane (D-011/D-022),
  not the receipts lane → **D-026.7**: dismissed from the ledger lane, document kept.
- **Old-books finding:** FNF Irrigation on 2026-03-19 is $45,000.00 on the Ashburne tab; the
  two documents read $900. Almost certainly a typo in the old books (a $450 or $4,500 job).
  Paul to confirm; it changes Ashburne's rehab total by up to $44,100.
- Ellis County property tax $16,031.25 (Ashburne, 2026-03-30) read cleanly, held only for
  the $500 ceiling; not on the old tab by that name.
- Rules (`scripts/migration-rules.py`) now produce 405 overrides: 273 pre-August payer =
  PAUL, 59 personal cards, 106 old-tab property attributions, 6 acquisition/draw dismissals,
  5 non-airport rides, 3 utility bill/payment twins.

Next: clear staging, `repostAll` with the overrides (no model cost), comparison run 4, then
the tie-out per property against the snapshot.

## 13 · Corrections register (Phase 4 2b — every intentional difference from the snapshot)

| # | date | where | was | now | who / why |
|---|---|---|---|---|---|
| C-1 | 2026-09-17 | 104 Ashburne, FNF Irrigation 2026-03-19 | $45,000.00 | $450.00 | Paul: typo in the old books; fixed in the old workbook the same day; `property-rows.json` patched with the note |
| C-1a | 2026-09-18 | same row | — | — | The snapshot cell is the **text** `450,00` (comma for decimal). The $45,000 was the inventory parser's misreading, never a number in the old books; as text the row was never in the header total |
| C-2 | 2026-09-18 | 104 Ashburne, "Wayfiar" Dining Room Light 2026-03-09 | $15,262.00 (parser) | $152.62 | Same typo: the cell is the text `152,62`. Never counted in the old header |
| C-3 | 2026-09-18 | 104 Ashburne, Amazon Shower Glass | date `2/11/0126` | 2026-02-11 | Date typo; it hid the row from the matcher |
| C-4 | 2026-09-18 | 104 Ashburne header "Rehab Total" | $157,945.30 | $164,983.83 of typed rows | **Confirmed by Paul 2026-09-18: "those totals outside the ranges should be included."** The header's block SUM ranges stop short: 22 rows typed below them ($6,435.91: Lighting & Electrical 2, Pool 3, Landscaping 13, Chimney 1, Utilities 3 - `ashburne-rows-outside-header.json`) plus the two text cells ($602.62) were never counted. Header + $7,038.53 = the rows, to the cent. The migration posts the rows |
| C-5 | 2026-09-18 | RECAST BIZ / Website, Apify $29.00, undated | one of five $29 rows | dropped | Paul: a duplicate. The subscription began 2026-05-18 (first invoice 05-15 canceled); four charges May-Aug, all dated and in mail. Overhead is $29.00 below the old sheet |
| C-6 | 2026-09-18 | RECAST BIZ / Interest, "420 Alyssa" $666.67, undated, no description | in overhead | removed | Paul: "remove it from the books." No such property exists in either workbook; the amount is one month at 8% on $100,000. Overhead is $666.67 below the old sheet |
| C-7 | 2026-09-18 | 104 Ashburne, Waxahachie Glass $518.78, 2026-03-30 | typed twice: "Glass Deposit" (House Hardware) and "Window Replacement" (Chimney/Fireplace/Glass) | one row | Paul: "use the deposit only." One payment, one receipt; the Chimney-block row is dropped and the receipt moves to the deposit row. Ashburne is $518.78 below the old tab |
| C-8 | 2026-09-18 | 1616 Granite, Mariana $500.00 | dated 2026-06-01 | 2026-06-29 | Paul: "use the email date" (his note "Mariana / Cleaning / $500" of 06-29) |
| C-9 | 2026-09-18 | 104 Ashburne: Julio $200.00 (02-18) and $100.00 (02-12), each typed under both Landscaping and Trash; Lowe's toilet $107.17 (03-25) under both Small Baths and Master Bath | six rows | three rows | Paul: "the toilet is a duplicate and so are the julio charges if they are the same date." Kept: the Landscaping rows and the Master Bath row (Small Baths already has its own toilet of 03-05); dropped: the two Trash rows and the Small Baths row. Ashburne is $407.17 below the old tab |
| C-10 | 2026-09-18 | Costs on receipts the old books left off | not in the old books | added, **$712.96** | Paul: Ashburne Pool - utility pump $172.11 + discharge hose $24.88 (HD 03-02, "kept, not returned"); Ashburne Trash - contractor bags $64.88 (HD 01-07); Ashburne - walk-off mats $81.11 (HD 04-08); Falcon Creek invoice 1390 (08-30) - Bowling Green $110.00 and Sparkling $55.00 (the latter to Cost Recapture, D-031); Bowling Green TXU $204.98 (09-10, "after seeing the screenshot"). Each linked to its receipt. (The line read $682.97 until the independent audit: it still counted a Brushwood microwave $339.99 added on Claude's wrong statement and retracted the same day - it is in the old books, Brushwood 09-02 - and left out the Falcon Creek and TXU additions) |
| C-11 | 2026-09-18 | Returns the old books netted (D-028), confirmed by Paul | not in the old books | purchase + credit, net $0.00 | HD 06-16: 2 HP plunge router $172.12 and hole saw $47.59 ("returns"); HD 01-07: nitrile gloves $12.02 ("return gloves"). Posted gross with a RETURN credit on the purchase date; no return receipt exists - the card statement proves it in Phase 3 |
| C-12 | 2026-09-18 | 1616 Granite, Mission Reg "Listing Fee" $299.00, Dennis Paid (cell J42) | no date on the old row - the inventory dropped it | 2026-06-02, migrated, 1330 | Independent audit finding 1: the row is inside the header SUM and the tab's "Dennis Paid $1,466.63". Paul: "june 2". Granite's target is **$12,204.87 / 61 rows**, not $11,905.87 / 60 |
| C-13 | 2026-09-18 | 136 Bowling Green, Lupe "Carpet Laying" $160.00 (06-30) | Paul Paid and Dennis Paid both ticked; migrated as PAUL | DENNIS | Paul: "dennis paid" |
| C-14 | 2026-09-18 | 280 Sparkling, Mission Real Estate Group "MLS Listing" $299.00 | account 1020 (a payee guess: labor) | 1330 | Paul: a listing fee "should be selling cost". Same for Granite's (C-12); Brushwood's and Ashburne's already were |
| C-15 | 2026-09-18 | 104 Ashburne / Trash, City of Corsicana "Dump", the second row dated 2026-01-16 | $27.30 | $22.50 | Two loads that day; the receipts read $27.30 and $22.50 (`gm-19bca1bc45709266`). Paul: "most likely yes". Every Corsicana row now has its own receipt. Ashburne is $4.80 below the old tab |

## 14 · Where the staging run stands at end of day, 2026-09-17

**Done in staging (`Recast Books STAGING`, `1ElTwWQ4…xWBw`):**
- All 946 documents read once (paul@ 396 + retries, properties@ 528 + 9). Reads are stored on
  the envelopes in Blobs; every rerun re-posts from them at no cost.
- Re-post run 1 with the D-026 overrides (414): 127 posted, 342 pending, 274 dismissed
  (205 by the duplicate rail: the same receipt arriving twice, original + forward or photo
  + e-receipt; 62 by the model; 7 by rule), 190 errored.
- Errors explained: 125 "writer read of Journal returned no rows" - `readTab` treated an
  empty Journal (right after `clearBooks`) as a bad response; fixed in `_shared.mjs`. 61
  "non-JSON response" / 4 timeouts - the staging writer under ~20 concurrent ingests.
- 67 held `ENTRY_INVALID:OVERHEAD_ON_PROPERTY`: old-tab attribution (D-026.3) put 65xx tool
  lines and 66xx fuel lines on Ashburne. Fixed: 65xx → 1030 under a property override;
  66xx stays overhead by Paul's rule (D-026.9).
- Properties: all ten registered held (eight real + 413 Green Acres and 200 Janice as
  pipeline); Ashburne bank-only (`dennis_share_pct` 0, new `dennis_commission_pct` 3, 12%).
- Advances: `migrationRegisterAdvances()` posted the old Cash Advances schedule - 30 rows,
  purchases at 9% (Ashburne 12%), Sparkling repaid 2026-08-06. Granite's three were
  already there. Newport and Ashburne settlement dates still owed by Paul.
- Heavy tab = old Ashburne layout (trade blocks side by side from column J, in the old
  block order, `refreshHeavyBlocks_`); the voided factor now comes from Journal columns
  (the helper-sheet range drifted to 5000 vs 5008 rows → every SUMPRODUCT was #N/A).
- Corrections register: C-1 FNF Irrigation $45,000 → $450.

**Not yet run (next session, in order):**
1. Paul: `npm run deploy` (readTab fix, 65xx remap, fuel rule are committed, not deployed).
2. Paul: `repostAll` in the paul@ poller - `books-repost-paul.json` (built "2026-09-17
   repost-2") re-posts only the 257 errored/held documents with the trimmed overrides.
3. Re-download envelopes, comparison run 6, then the tie-out: staging Journal by property
   vs the snapshot (`old-workbook-snapshot.xlsx`) with the corrections register.
4. Paul reviews Pending (342: OVER_CEILING 74, PAYER_UNKNOWN 52 August-onward, holds).
   Decide whether OVER_CEILING approves in bulk for migrated history.
5. Flip the four sold properties to `sold` with settlement dates; then cutover (D-025).

## 15 · 2026-09-18 early morning — what the re-post taught us, the change of method, next steps

**Done since §14** (commits `0d457bb` … `0206063`):
- Deploy of the three fixes; `repostAll` of the 257 (repost-2). Comparison run 6 and the first
  tie-out by property (`scripts/migration-tieout.py`, `data/migration/2026-09-17/tieout/`).
- **Matcher rewritten** (`scripts/migration-compare.py`): 45-day window, amounts also read from
  the mail body, a twin dismissed as `duplicate_of` credited to its original, weak matches
  reported as candidates (report C carries the candidate), never counted as documented.
  Result: of 278 rows the strict matcher called uncovered, **19 have no document anywhere**
  (~$60.5K: Juan Garcia 2 × $7,000, Chinos LLC $13,500, Wayfair $15,262 + $816, Shalom Granite
  $4,950, Salvador Campos $3,880, checks 1146/1147, James Haroce, Marianna, Julio + friend,
  50 Floors, 420 Alyssa, small Amazon / Sherwin-Williams / Apify). Nothing for them in the
  pvb421 listing. These are D-024's `NO_DOC` rows.
- **Stale-duplicate bug:** 94 receipts (177 old rows, $13.5K, 64 on Ashburne) existed only as a
  read that said "dismiss, duplicate of receipt-…" where that transaction came from an earlier
  replay and vanished at `clearBooks`. Reads happen once, so every re-post replayed the dismiss.
  Rule added in the ingest: a stored dismiss whose `duplicate_of` txn is not in the Journal
  replays as the read (post with entries, hold without). After five passes: **74 posted, 10
  dismissed, 2 pending, 8 not yet through** (`books-repost-paul-8.json`, in Drive, not run).
- **Why the passes kept failing (root cause, fixed):** commit `1e8a823` had put the "is this txn
  voided" lookup - `ISNA(MATCH(Journal!A2:A5000, Journal!Y2:Y5000, 0))` - inside every
  SUMPRODUCT of every property tab. Each Journal append made the workbook recalculate for
  minutes; writer reads timed out, misfired onto doGet ("returned no rows") or came back as
  HTML. Page size (20 → 5 → 3 → 1) was never the cause. Fixed `e2cf118`: formulas read the
  helper column again, through a drift-proof `INDEX(...):INDEX(..., ROWS(Journal range)+1)`.
  Staging writer pushed and deployed (@3); Paul ran `rebuildAllPropertyTabs` on staging.
  **The production writer has NOT been pushed** - do it before anything rebuilds a production
  property tab (`clasp push -f` + `clasp deploy -i` from `apps-script/writer/`, then rebuild).
- Also fixed: a bulk re-post skips the per-post property tab rebuild (`postBatch skipRefresh`,
  it ran inside the writer's lock); `repostWatch` in the poller re-posts on its own when the
  Drive list carries a new build stamp (**not installed** - it installs on the next manual
  `repostAll`; with D-029 it may never be needed).
- **Decisions:** D-027 (the old books are the target, receipt linked), D-028 (items on a
  receipt and absent from the old books hold for Paul: return or omitted; report F), **D-029
  (the migration is row-driven)**.

**Why the method changed (D-029).** The document-driven re-post measured the bookkeeper, not
the books: 396 documents in Pending behind live-mail rails, amounts following the receipt, and
a post path that cannot do bulk. Paul's priority is the match with the link. So history posts
from the old rows and the matched receipt is attached.

**Next steps, in order:**
1. Re-run `migration-compare.py` + `migration-tieout.py` on the fresh envelope download (the
   94 changed state) and freeze the row↔document map: strong / weak candidate / none.
2. Build `scripts/migration-rows.py`: old rows + map → entries (D-029.1-2), a difference list
   (D-029.3, with report F), a confirm-the-match list (weak), a `NO_DOC` list, and the
   in-mail-not-in-books review list. Dry run only; Paul reads the lists.
3. Writer: `migrationPostRows()` - one bulk pass under one lock, `source = migration`,
   `doc_url` set, tabs rebuilt once. Drive filing for matched documents not yet filed is a
   separate, resumable job (it is slow: ~2.4 MB photos through Apps Script).
4. `clearBooks` on staging, register properties and advances, run the pass, tie out every
   property and RECAST BIZ block to the snapshot + corrections register. Expect exact.
5. Paul reviews the four lists; rules change, rerun. Then sold properties flip with settlement
   dates (Ashburne and Newport still owed), then cutover (D-025) with the same pass.

Loose ends: `books-repost-paul.json` (repost-8) sits in Paul's Drive, harmless; poller pages 1
document at a time; acquisition receipts and Dennis draws are still Pending in staging
(D-026.7 - irrelevant once history is row-driven); staging holds a half-finished
document-driven Journal that step 4 clears.

**Frozen map, 2026-09-18 05:00 (968 envelopes, fresh download; `comparison/` and `tieout/`):**
of 1,053 old rows, **893 have a strong document match** (171 of 180 sheet-id documents tie to
the cent; 285 property rows and 44 manual rows documented by match), **141 have a weak
candidate** to confirm (75 on a pending document, 49 on a posted one, 15 on a dismissed one,
2 on an errored one; $48.4K) and **19 have no document anywhere** ($60.5K). 166 documents are
in mail and match no old row. Report F: 59 receipts total more than the rows they explain
(12 resolve to one subset of items, $292.72; 47 hold). Staging Journal: 781 lines, 272
documents posted, 387 pending - the half-finished document-driven state that D-029 replaces.

## 16 · Row-driven dry run, 2026-09-18 (D-029 steps 1-2 done; nothing posted)

`scripts/migration-rows.py` → `data/migration/2026-09-17/rows/` (entries + five lists + README).
The row ↔ document map it posts from is `comparison/G-row-map.csv`.

- **The entries reproduce the old rows to the cent:** 1,024 rows, $220,079.01, by property
  exactly the old tab totals. The one intended difference: the Ashburne Gas/Truck/Trailer block
  (43 rows, $3,283.32) posts as overhead 66xx (D-026.9).
- **Old-books findings (corrections register C-1a … C-4):** the two "huge" rows were comma
  typos stored as text (`450,00`, `152,62`) that the inventory parser inflated - the Wayfair
  "$15,262" is a $152.62 light; one date was typed year 0126; and the **Ashburne header
  undercounts its own rows by $7,038.53** (22 rows typed below the block SUM ranges + the two
  text cells). Header $157,945.30 + $7,038.53 = $164,983.83 = the rows, to the cent. Paul to
  confirm the rows are the target (C-4).
- **Matcher, capacity rule:** a receipt explains rows only up to its own total (before it,
  nineteen $200 Julio payments hung on one $500 receipt). Result: 189 rows linked by sheet id,
  533 strong, **284 weak (confirm), 18 none** ($45,094: contractor checks, Wayfair $816,
  50 Floors, 420 Alyssa, small). Every linked row carries a Drive file (217) or a Gmail link
  (505, to be filed).
- `Sparkling for Title` is excluded (duplicate of RECONCILED); its two rows RECONCILED lacks
  (Juanito Garcia $1,000 + $1,200, late June) are on the questions list - documents for a
  $2,200 Garcia Home Repair job exist in mail.
- Accounts: 589 from the matched read, 58 fuel block, 96 block map, 281 by payee (labor 1020 /
  retailer 1030 / utilities 1120 …) - every entry says which. Paid from: ticked box where the
  tab has one; else the read; else PAUL before August (D-026.2); 36 unknown → questions.
  **Assumption to confirm:** a ticked "Recast Account" box = Chase 1402 before 2026-08-01,
  Citizens 1401 after.
- Lists: 1 differences 112 (86 receipt > rows - D-028 return/omitted; 26 rows > receipt; 31
  within $2) · 2 confirm the match 284 · 3 no document 18 · 4 in mail, not in the books 160 ·
  5 questions 74 (36 payer unknown, 34 Dennis-paid rows to check against the registered
  Advances, 2 Sparkling, 2 undated).

**Next:** Paul answers the three questions that change numbers (C-4, the Recast Account
assumption, the two Sparkling rows); then step 3 (`migrationPostRows()` bulk pass in the writer)
and step 4 (clear staging, post, tie out). The weak-match and difference lists do not block the
pass - rows post either way; links and return credits follow Paul's review.

**Paul, 2026-09-18:** (1) C-4 confirmed - the rows below the header ranges are included. (2) The
"Recast Account" boxes are all August-September rows → Citizens 1401; no assumption needed.
(3) The two Juanito Garcia rows on `Sparkling for Title` ($1,000 + $1,200): "those were removed.
those were errors. do not document those. do not create a new sparkling title tab." Not
migrated, not listed; their two Garcia Home Repair documents (`gm-19f57268…`, `gm-19f57221…`)
are excluded from the review list and are to be dismissed by rule, never posted. The new books
have one Sparkling tab. No open question now changes a number: next is step 3, the bulk pass.

## 17 · Cleanup sequence before cutover (Paul, 2026-09-18: "all migrated, mapped and clean before we switch over")

After the staging pass ties out, Paul is walked through these one at a time, biggest closure
first. Each answer becomes a rule or a register line, then a rerun (clear + post, minutes, free).
1. **Who paid** - the 34 August-onward rows with no payer (mostly RECAST BIZ subscriptions and
   fuel): answered by group, not row by row. Then the 2 undated rows. → amounts reach 100%.
2. **Dennis-paid rows** (31, light tabs, $8,656.54): interest-bearing advances, or settled at
   closing without interest? One answer per property.
3. **Confirm the match** (284 weak candidates): shown largest first with the receipt link;
   yes / no / different receipt. Confirmed links raise documented dollars from 49% to ~79%.
4. **Differences** (112 receipts whose total differs from their rows): D-028 - return, omitted
   item, or a typed amount to correct (register).
5. **In mail, not in the books** (158 documents): real cost to add (register), personal, or
   belongs to the Advances lane.
6. **No document** (18 rows, $45,094, contractor checks): post `NO_DOC`, proven in Phase 3.
7. Drive filing of the Gmail-linked receipts (resumable job), sold properties flipped with
   settlement dates (Ashburne and Newport owed), production writer pushed, then cutover (D-025):
   the same pass into the real workbook, tie-out, old workbook read-only.
**Clean means:** every old row is in the Journal at the amount Paul typed or a registered
correction; every row that has a receipt carries its link; every exception is on a list Paul
has seen and answered; and the property totals equal the old tabs plus the register.

## 18 · Staging pass 1, 2026-09-18 05:33 - ties out to the cent

`migrationRunStaging` cleared the receipt lane (721 lines removed, the 60 advance/purchase lines
kept) and `migrationPostRows` posted **980 entries, $199,680.40**, debits = credits, tabs rebuilt.
Journal by property = the old tab − held-back rows ± the fuel rule, **difference $0.00 on every
property and on overhead** (`rows/journal-tieout.json`). 686 posted entries carry a receipt link.
Held back, $20,398.61: 7 Ashburne rows already in the Journal through Dennis's advances
($16,522.44), 34 rows with no payer ($3,180.50), 2 undated ($695.67), one $0.00 row.
Reconciled against the old books: **98.2% of dollars** (posted + covered by advances); the rest
is §17 item 1. First pass took 4.5 min for 300 entries (per-entry TextFinder lookup in
`postBatchEntries_`); the pass now appends once under the lock - 680 entries in seconds.

**Link finding, 2026-09-18:** a Gmail link only opens in the account that holds the message.
Documents that arrived through a property mailbox live in properties@, so their links show Paul
his own inbox. The durable link is the Drive file: §17 item 7 files **every** linked document
to Drive, including a text rendering of body-only notes (Paul's "1670 Juan", "Mariana /
Cleaning / $500"), and the Journal carries the Drive URL. Until then, show Paul the stored
content, not the Gmail link, for anything from a property mailbox.

## 19 · Cleanup progress, 2026-09-18 morning (items 1-3 of §17)

Paul's answers live in `data/migration/2026-09-17/paul-answers.json` (who said what, when) and
are applied by `scripts/migration-rows.py`; corrections C-5 … C-9 are in §13.
- **Item 1 closed:** the gimbal was the Citizens joint account; the other 33 no-payer rows were
  Paul's personal card (9166) → PAUL. Apify duplicate dropped (C-5), "420 Alyssa" interest
  removed (C-6). **Every old row is accounted for:** 1,010 posting ($201,934.95), 7 already in
  through the Ashburne advances ($16,522.44), 6 removed by Paul ($1,621.62), one $0.00 row.
- **Item 2 closed (D-030):** Ashburne is the bank deal - 12% on everything in its cash advance
  column, direct payments included, as migrated. Every other property is a partner deal:
  interest on purchase and cash advances only; the 31 Dennis-paid rows are owed back at closing
  with no interest.
- **Item 3:** the 20 largest likely matches decided (5 linked, 14 refused, the 50floor pair per
  Paul); Waxahachie Glass typed twice (C-7), Granite Mariana redated (C-8), three more Ashburne
  double entries dropped (C-9); Mariana's six cleanings reconciled with Paul's account, the 9/7
  $700 screenshot covering Ashburne $450 + Brushwood $250. Rules: near-amount (Paul) linked 1 -
  73 of its candidates were coincidences on receipts that belong to other rows - and
  exact-amount-same-day (Claude) linked 8. **Linked: 765 rows, 60.4% of dollars, 75.7% of rows.**
  The 245 unlinked rows are $79,936; the top 12 are $53,094 (Chinos LLC $13,500, Luxury 4 Less
  $10,319.56, Juan Garcia 2 × $7,000, Salvador Campos, Atlas Pools, the Mesa checks). Leads in
  the personal Gmail listing, not yet read: "Flooring" 2026-02-12 (Chinos?) and "Receipt from
  50Floor" 2026-06-12.
- Still to do: item 4 differences (113), item 5 in mail not in the books (153), item 6, item 7.
  Staging holds pass 1; the cleaned pass (1,010 entries) is pushed and waits for one Run of
  `migrationRunStaging`.

**2026-09-18, the two personal-Gmail leads:** both had been forwarded to property mailboxes and
were already in the envelopes - no spend. "Receipt from 50Floor" is the $1,339 receipt already
linked. "Flooring" (02-12, to 104ashburne@) is "Chinos LLC - Estimate 126" on invoicesimple.com;
it was never read - the model call failed (`image/png` label on a JPEG → API 400) and the
document sat in hold with a zero total. One document only. The Chinos $13,500 row is linked to
it as an estimate. **Bug to fix before live traffic depends on it:** sniff the image type from
its bytes instead of trusting the attachment's MIME label, and do not let an API failure pass
as a quiet "hold".

## 20 · Staging pass 2, 2026-09-18 06:38 - the cleaned books, tied out

`migrationRunStaging`: 1,960 lines of pass 1 cleared, **1,010 entries posted in one write**,
$201,934.95, debits = credits, tabs rebuilt (2 min 20 s in all). Journal by property = old tab −
rows already in through the Ashburne advances − rows Paul removed (C-5 … C-9) ± the fuel rule,
**$0.00 difference on every property and on overhead**. 766 entries carry their receipt link
(75.8% of rows, 67.1% of dollars).

**2026-09-18, Cost Recapture (D-031).** The old `Cost Recapture` tab was outside the inventory;
its four rows ($1,310.04: Sparkling and Granite water 09-01, a $40.00 card fee on both, Sparkling
TXU 08-18, all Recast-account paid) are now in `property-rows.json` and migrate to the
`Cost Recapture` property with the sold property in `trade`; three of the four found their
receipt. Old books are now **1,028 rows, $221,389.05**. Falcon Creek invoice 1390 (08-30): the
$110.00 Bowling Green line is an ordinary cost of that held property, the $55.00 Sparkling line
(sold 08-06) goes to Cost Recapture - both added under C-10. `migrationRunStaging` registers the
property before the pass. Dry run: 1,027 entries, $204,092.96, all build.

**2026-09-18, matcher corrected after Paul's challenge ("this should be easy … the addresses are
right there").** The bookkeeper's reads of the two TXU screenshots were correct (amount, card,
account, service address, property). The failures were in `migration-compare.py`: (1) it never
used the property the read assigned, so Bowling Green's receipt documented a Newport row; (2) a
stale-duplicate dismiss was resolved to "the same vendor that day", a different charge; (3) rows
were placed on receipts in an order that let small rows whose amounts appeared in the mail text
claim a receipt ahead of the row equal to its total. Fixed: a receipt routed to one property never
documents a row on another property's tab; a stale duplicate resolves only to a same-total twin,
otherwise the document stands; a row equal to the receipt total places first, and mail-text
amounts count only when the read has no lines. 214 links changed. **Consequence found and
retracted:** Claude had told Paul the $339.99 Brushwood microwave and an $897.00 Home Depot
receipt were unexplained; both are in the old books as single rows. The microwave addition is
withdrawn (`paul-answers.json` → `retracted`). Every other addition was re-verified against the
old rows. Rule for the rest of the cleanup: before telling Paul something is not in his books,
search the old rows for that amount on any tab.

## 21 · PAUSED 2026-09-18 mid-morning - where we are, what is pending, how to resume

**Method (settled):** D-029 row-driven migration. The old row is the entry, the receipt is the
evidence; D-027 the old books are the target; D-028 items absent from the old books are Paul's
call; D-030 interest by deal type (Ashburne = bank deal, 12% on everything in its cash advance
column; every other property = partner deal, interest on purchase and cash advances only);
D-031 Cost Recapture for charges after a sale.

**The pipeline (each step is deterministic, minutes, free):**
1. `python3 scripts/migration-compare.py --env <envelopes> --inv data/migration/2026-09-17 --out data/migration/2026-09-17/comparison`
   → `G-row-map.csv` (row ↔ document). Envelopes: fresh download of `books-docs` (968 files; the
   copy used today is in the session scratchpad and must be re-downloaded in a new session -
   `netlify-cli blobs:list/get books-docs`, ~10 min).
2. `python3 scripts/migration-rows.py --inv … --cmp …/comparison --out …/rows` applies
   `paul-answers.json` (who paid, drops, redates, links, refusals, additions, retractions) →
   `entries.csv`, five lists, `MigrationData.gs`, `expected.json`.
3. `node scripts/migration-rows-check.mjs <dir with tab-Accounts/Properties/Periods.json> …/rows`
   builds every entry in the real posting engine; totals must equal `expected.json`.
4. Push to STAGING: copy `apps-script/writer/*` + `rows/MigrationData.gs` into a scratch folder
   whose `.clasp.json` has scriptId `1Hh0ppVeZepu8GClShAINt4bxNZNNxW1dzZK_xFdmlh6hQ5fCtqdwvtL5`,
   `clasp push -f`. (Never keep MigrationData.gs in the repo's writer folder.)
5. Paul runs `migrationRunStaging` in the staging editor (~2.5 min); tie out from the
   `books-cache` `tab/Journal` snapshot against `expected.json` and the old tabs.

**State of the numbers (dry run `3e5df39`, pushed to staging, NOT yet run there):**
old books 1,028 rows $221,389.05 (the Cost Recapture tab now included) → 1,027 entries to post,
$203,957.95, all build; 7 Ashburne rows already in through Dennis's advances ($16,522.44); 6 rows
removed by Paul (C-5 … C-9, $1,621.62); one $0.00 row; 13 additions (C-10 costs the old books
left off, C-11 three returns posted gross + credit, net $0). Linked to a receipt: 782 entries,
76.1% of rows, 68.1% of dollars. **Staging currently holds pass 2** (1,010 entries, tied out §20)
- it predates Cost Recapture, the additions and the matcher correction.

**Cleanup (§17) status:** item 1 closed (payers, undated rows). Item 2 closed (D-030). Item 3:
the 20 largest decided, rules applied, 223 likely matches remain unlinked at Paul's amounts.
Item 4 differences: batch 1 done (A-E, F, G); ~28 un-itemised Home Depot receipts parked until
the receipts open from Drive. Item 5 (156 documents in mail, not in the books): not started -
**proposal waiting on Paul:** Claude sorts the utility documents first (pair bill + payment, tie
each to a property by service address, post-sale → Cost Recapture, drop what the books already
carry) and brings one short table per property. Items 6-7 not started.

**Pending on Paul:** (a) yes/no to the utilities proposal; (b) one Run of `migrationRunStaging`;
(c) `npm run deploy` for the image-type fix below; (d) settlement dates for Ashburne and Newport.

**Open engineering items:**
- **Production writer not pushed** (formula fix `e2cf118`, `postBatch skipRefresh`,
  `migrationPostRows`, Cost Recapture). Push + `clasp deploy -i` before anything rebuilds a
  production property tab; at cutover the same pass runs there behind `clearBooks`.
- The image-type / API-failure fix (`lib/bookkeeper.mjs`, CHANGELOG 2026-09-18) was written by a
  separate session in this same folder and was swept into commit `f32b435` ("Staging pass 2 ties
  out") by `git add -A`. Code and tests are fine (392 pass); **not deployed**. After the deploy,
  `gm-19c521cfa5452bd9` needs Reprocess from the Inbox.
- Gmail links do not open across accounts: item 7 files every linked document to Drive
  (including a text rendering of body-only notes) so the Journal carries a Drive URL.
- `books-repost-paul.json` (repost-8) still sits in Paul's Drive, unused; `repostWatch` was never
  installed; the poller pages one document at a time. All harmless under D-029.

**Lessons recorded today (Claude's errors, corrected):** a "Windex duplicate" that was Wall
Flanges; a microwave "not in the books" that was; a near-amount rule estimated at ~50 links that
made 1; a matcher that ignored the property the read had assigned. Standing rules: search the old
rows for an amount on every tab before telling Paul it is missing; show Paul the stored document,
not a Gmail link; one question at a time.

## 22 · Independent audit and its fixes, 2026-09-18 (`docs/phase4-independent-audit.md`)

A fresh session re-parsed the snapshot with its own parser and checked the inventory, the dry run,
the staging Journal and the links. Amounts held except one row; the fixes below are made, the dry
run is rebuilt and **pushed to the staging project (2026-09-18 07:41); nothing has been run there
yet, and nothing is pushed to production.**

- **Granite $299 listing fee** (C-12) added to `property-rows.json` - appended, because
  `paul-answers.json` keys rows by index. Lupe → DENNIS (C-13). Listing fees → 1330 (C-14).
- **Advances (D-032, finding 2):** `migrationRegisterAdvances` now clears the Advances tab and the
  advances' Journal lines and posts the whole list (staging, or an empty Journal at cutover; it
  refuses anywhere else). Granite's three are on the list (9%, repaid 2026-07-27). Ashburne's 15
  "Dennis Paid ..." lines land on 2030 instead of a rehab account; the seven Ashburne rows held
  back as `COVERED_BY_ADVANCE` post as typed; an Ashburne row never credits 2010.
  `advances-direct.json` is gone.
- **Matcher:** pairs are placed best-first across all rows (row-by-row placement pushed four
  Corsicana dump runs and two Shell fill-ups one receipt along); a near amount is strong only
  within 10 days and on the document's own vendor name (not a word in the mail body); the
  exact-amount rule needs the read's property to agree or the names to resemble (Julio $200 had
  taken a CoreLogic $200 invoice); a stale duplicate is not a twin when the invoice numbers differ
  (Atlas Pools paid 18723 and 18972 on one day). 21 links dropped to "confirm", 8 gained, 9 moved.
  `scripts/migration-audit-links.py` now finds no strong link that a better receipt contradicts.
- **Scope (D-033):** sales, net profit and balances are Phase 5. Paul is holding live receipts
  until the migration is complete.

**State of the numbers:** old books 1,029 rows $221,688.05 → **1,035 entries to post,
$220,779.39**, all build in the posting engine; held back: 6 removed by Paul, one $0.00 row.
By property: Ashburne $161,117.54, Granite $12,204.87, Bowling Green $3,761.63, Mesa $9,648.00,
Newport $3,089.17, Sparkling $3,179.78, Brushwood $1,916.80, Cost Recapture $1,365.04, overhead
$24,496.56. Linked: 777 entries, 75.1% of rows, 63.6% of dollars (the dollar share fell because
the two $7,000 Juan Garcia rows and the other formerly held-back Ashburne rows now post, unlinked).
Lists: differences 110 · confirm 232 · no document 31 · in mail, not in the books 170 · questions 37.

**To run (staging, in this order):** the writer + `rows/MigrationData.gs` are pushed (§21 step
4); Paul runs `migrationRegisterAdvances` (resets and re-posts all 33 advances),
then `migrationRunStaging`; tie out against `rows/expected.json`; rerun
`scripts/migration-audit-indep.py` and `migration-audit-links.py`.

**Open with Paul:** who paid Falcon Creek invoice 1390 (the Newport line is ticked Recast
Account, the other three lines are PAUL - one invoice, one payment); whether the second City of
Corsicana row on 01-16 ($27.30) is really the $22.50 load; the eight Ashburne cash advances with no
tab row (D-032 consequence).

**Later the same day - Falcon Creek 1390 answered from the mail, and why the pollers miss Paul's
notes.** Paul: "they ignore my email titles or text that provide information and context. Falcon
Creek invoice 1390 is an example. i noted how the invoice was paid in the email." The forwarded
invoice itself carries no note (both stored copies begin at "Forwarded message"). The note is the
memo on the bank's Zelle confirmation of 08-31 in paul@ (`gm-1a05aabd4a07b3ac`): "$275.00 to Effren
Landscaper - Invoice #1390 for Newport, Bowling Green, Sparkling" = $110 + $110 + $55 from the
Recast Citizens account. So the Newport tick was right and the two added lines are now `1401`, not
PAUL; Ashburne's $150 was not in that payment and stays as Paul answered. The five Zelle
confirmations to Carlos Ibarra ($500 each, 08-15 … 08-20) are the documents for the Mesa siding
rows: four linked (the fifth already had its receipt). Two causes, both real:
1. **The prompt never said Paul's words count.** `paid_from` keyed on card last-fours; subject and
   note were passed to the model and left to chance ("Julio / $250 / Dennis paid him" → DENNIS, but
   "Dennis $400" → PAUL, and "Julio $400 / Sat and for Dennis" → PAUL with the hint noticed and
   dropped). Fixed in `lib/bookkeeper-prompt.md`: "Read what Paul wrote first" in the method and a
   new `paid_from` rule 3. **Needs `npm run deploy`** (Paul); live mail is on hold, so no hurry.
2. **Context that lives in another email never reaches the bookkeeper** - the bank's Zelle
   notices. That is Phase 3; `phase3-spec.md` §6a now names them as a feed source.
The old receipts poller in `Recast-site/` has the same first gap; it is out of bounds from here.
Dry run now: 1,035 entries, $220,779.39, 783 linked; pushed to staging again.

## 23 · Staging pass 3, 2026-09-18 13:03 - the audited books, tied out

Paul ran `migrationRegisterAdvances` (12:43-12:58: 60 old advance lines removed, **33 advances
posted, none orphaned**; Granite's three back at 9%, repaid 2026-07-27; account 1000 =
$1,863,647.50, eight purchases; the 15 Ashburne "Dennis Paid ..." lines on 2030, no advance in a
rehab account) and then `migrationRunStaging` (13:00-13:03: 2,020 lines of pass 2 cleared, 66
advance lines kept, **1,035 entries posted in one write, $220,779.39**, tabs rebuilt).

Tie-out from the `books-cache` Journal snapshot, two paths: (1) Journal by property =
`rows/expected.json`, **$0.00 on all nine** (Ashburne $161,117.54, Granite $12,204.87, Bowling
Green $3,761.63, Mesa $9,648.00, Newport $3,089.17, Sparkling $3,179.78, Brushwood $1,916.80, Cost
Recapture $1,365.04, overhead $24,496.56), txn ids identical to the dry run, debits = credits
($2,281,963.15); (2) the independent re-parse of the xlsx vs the Journal, row by row: every old row
is there, and the only differences are register lines C-3, C-5 … C-9, C-12 and the 13 additions
(C-10, C-11). 781 entries carry a receipt link. `rows/journal-tieout.json` records it.

Registering 33 advances took 14 minutes because `addAdvance` rebuilds the property tab each time
(19 rebuilds of Ashburne). Before the cutover run, give the migration path a skip-rebuild flag.

**Next (§17):** item 3 the confirm list (232), item 4 differences (110), item 5 in mail not in
the books (170), item 6 no document (31), item 7 Drive filing; open questions in §22; then the
production writer push and the cutover.

**After pass 3 - C-15.** The second City of Corsicana load of 01-16 is $22.50, not $27.30 (Paul:
"most likely yes"); all ten Corsicana rows now sit on their own receipt. Dry run: 1,035 entries,
**$220,774.59** (Ashburne $161,112.74), 784 linked, all build; pushed to staging. **Staging still
holds pass 3 at $220,779.39** - one more Run of `migrationRunStaging` brings it to this number; it
can wait and ride along with the next batch of cleanup answers.

**Pass 4, 13:14, and the deploy.** Paul reran `migrationRunStaging`: 1,035 entries, $220,774.59, $0.00 on
every property, ids identical to the dry run, 782 linked. `npm run deploy` done (deploy `6aad7fed`):
the prompt change and the image-type fix are live. Still owed from §21: Reprocess `gm-19c521cfa5452bd9`
(the Chinos estimate) from the Inbox.

**Chinos LLC, closed (2026-09-18 13:27).** Paul reprocessed `gm-19c521cfa5452bd9` after the deploy: the
read now succeeds (the JPEG-labelled-PNG failure is gone) and it opens with Paul's subject, as the new
prompt asks - but the attachment is only the company logo; the estimate is behind an invoicesimple
link the bookkeeper cannot open. Opened in a browser: **Estimate 126, 02/10/2026, $13,500.00, "Flooring
Materials", 5,250 sq ft of vinyl plank, to Paul at 104 Ashburne Glen** - the old row's date and amount
exactly; the row is already 1030 materials. Text saved in `data/migration/2026-09-17/evidence/`. It is an
estimate, not proof of payment (Phase 3). The document stays held in the Inbox with a $0 total; it needs
no posting - the row is migrated and linked. **Gap noted, not built:** documents whose content sits
behind a link (invoicesimple, Yardbook) read as empty; a fetch-the-link tool for the bookkeeper would
close it if it keeps happening.

