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
| C-10 | 2026-09-18 | Costs on receipts the old books left off | not in the old books | added, **$451.09** | Paul: Ashburne - walk-off mats $81.11 (HD 04-08); Falcon Creek invoice 1390 (08-30) - Bowling Green $110.00 and Sparkling $55.00 (the latter to Cost Recapture, D-031), paid by Zelle from Citizens; Bowling Green TXU $204.98 (09-10). Each linked to its receipt. **Retracted, all Claude's errors:** a Brushwood microwave $339.99 (it is Brushwood 09-02 "Microwave"); the utility pump $172.11 + discharge hose $24.88 (they are RECAST BIZ / Tools 03-02 "Sunp Pump & Hose" $196.99); the contractor bags $64.88 (they are Ashburne / Trash 01-07 "Garbage Bags" $64.89). The matcher compared to the exact cent and never summed two items, so those old rows sat unlinked and their receipts looked unexplained |
| C-11 | 2026-09-18 | Returns the old books netted (D-028), confirmed by Paul | not in the old books | purchase + credit, net $0.00 | HD 06-16: 2 HP plunge router $172.12 ("returns"); HD 01-07: nitrile gloves $12.02 ("return gloves"). Posted gross with a RETURN credit on the purchase date; no return receipt exists - the card statement proves it in Phase 3. **Retracted:** the hole saw $47.59 pair - the old books carry it (RECAST BIZ / Tools 06-16 "Hole Saw" $47.60), so it migrates as that row |
| C-12 | 2026-09-18 | 1616 Granite, Mission Reg "Listing Fee" $299.00, Dennis Paid (cell J42) | no date on the old row - the inventory dropped it | 2026-06-02, migrated, 1330 | Independent audit finding 1: the row is inside the header SUM and the tab's "Dennis Paid $1,466.63". Paul: "june 2". Granite's target is **$12,204.87 / 61 rows**, not $11,905.87 / 60 |
| C-13 | 2026-09-18 | 136 Bowling Green, Lupe "Carpet Laying" $160.00 (06-30) | Paul Paid and Dennis Paid both ticked; migrated as PAUL | DENNIS | Paul: "dennis paid" |
| C-14 | 2026-09-18 | 280 Sparkling, Mission Real Estate Group "MLS Listing" $299.00 | account 1020 (a payee guess: labor) | 1330 | Paul: a listing fee "should be selling cost". Same for Granite's (C-12); Brushwood's and Ashburne's already were |
| C-15 | 2026-09-18 | 104 Ashburne / Trash, City of Corsicana "Dump", the second row dated 2026-01-16 | $27.30 | $22.50 | Two loads that day; the receipts read $27.30 and $22.50 (`gm-19bca1bc45709266`). Paul: "most likely yes". Every Corsicana row now has its own receipt. Ashburne is $4.80 below the old tab |
| C-16 | 2026-09-18 | 280 Sparkling, TXU "Electricity" $161.17 (06-16, row 36) | on the Sparkling tab **and** on 1616 Granite (row 6) | Sparkling row stays as closed; **Cost Recapture credit -$161.17** (trade 280 Sparkling, 1120, dated 2026-09-18, reduces Due to Paul) | Paul's TXU history for both accounts (`evidence/txu-history-*.png`): the 06/16 $161.17 is Granite's (acct 900084832931; Granite = $161.17 + $261.76 = $422.93, the old tab exactly). Sparkling's account shows only $228.64 (08/05) and $213.64 (08/18). Paul: "the discrepancies need to be accounted for in the cost recapture tab since those properties are actually locked in reality." The payment confirmation is relinked to the Granite row; it only arrived through the Sparkling mailbox |
| C-17 | 2026-09-18 | 104 Ashburne / Gas-Truck-Trailer, Shell "Gas" $65.48 (03-25), rows 32 and 33 | two rows | one row | Paul: "typed twice." One Shell receipt that day (18.714 gal @ $3.499, card 9166), linked to row 32; row 33 dropped. The fuel block migrates to overhead (D-026.9) and Ashburne closed on its cash draws, not its rows, so this is a plain drop like C-5 and C-9, not a Cost Recapture line. Overhead is $65.48 below the old books |
| C-18 | 2026-09-18 | 104 Ashburne / Pool, Atlas Pools "Service" $256.01 (06-30, row 22) | six monthly service rows | five | Atlas's payment portal (`evidence/atlas-pools-portal-payments-*.webp`) shows five service payments: 05/18, 06/11, 07/25, 09/01, 09/01. Paul: "use the screenshots i gave you as the guide. that is what was paid." July's invoice was typed when billed (06-30) and again when paid (07-30); the 06-30 row is dropped. Ashburne closed on its cash draws, so a plain drop like C-7, C-9. Ashburne is $256.01 below the old tab |
| C-19 | 2026-09-18 | MLS listing fees the old books left off: 136 Bowling Green and 881 Newport | not in the old books | added, $299.00 each, 1330, **Dennis paid** | Every listing goes through Mission Real Estate Group / Iley & Iley at a flat $299. Granite, Sparkling, Brushwood and Ashburne have their fee; Bowling Green and Newport did not. Bowling Green: PayPal receipt to Dennis of 07-01, and Paul's email to Mission that day - "We added and paid for a new listing ... It was for 136 Bowling Green Ave" - on the property's tab (held). Newport: Mission 07-13, "Mr. Iley sent an invoice to Dennis Little", listed 07-14; no receipt seen, amount is the flat fee; Newport is sold, so the line is on **Cost Recapture** (trade 881 Newport, dated 2026-09-18). Paul: "yes add it and newport too." Owed to Dennis at closing, no interest (D-030) |
| C-20 | 2026-09-18 | 136 Bowling Green, TXU "Electricity" (07-29, row 8) | $102.12 | $102.16 | TXU took $102.16 on 07/25 (conf 806639700, card 9166, service address on the confirmation). Paul: "yes to both". Bowling Green is $0.04 above the old tab |
| C-21 | 2026-09-18 | 136 Bowling Green, two utility payments the old books left off | not in the old books | added, **$693.26**, 1120, paid from Citizens (1401) | TXU $164.02 of 08-21 (conf 808997400; Paul forwarded it to 136bowlinggreen@; CNB daily summary shows it on card 5450) and City of Red Oak $529.24 of 08-31 (conf JNGKGFWLFQ: $522.02 + $7.22 fees, Visa 5450). Searched within two cents on every old tab and in all three mailboxes first. Paul: "yes to both". Audit §29 |
| C-22 | 2026-09-18 | 104 Ashburne / Utilities, Energy Texas auto-pay of 09-03 | not in the old books | added, $484.43, 1120, Paul paid (card 9166) | The 08-17 bill (acct ET-7827592) paid by auto-pay, conf PAY04938659; the tab's last electric row is 08-03 $371.16. Paul: "ashburne has not closed. it is still held. file that 484.43 charge" - a row on the tab, not Cost Recapture. Ashburne is $484.43 above the old tab |
| C-23 | 2026-09-18 | RECAST BIZ / Travel, five American Airlines charges the old books left off | not in the old books | added, **$2,070.30**, 6700 overhead, Paul paid | Fares DFW-PDX 01/17 $316.50, PDX-DFW-PDX 02/01-02/04 $575.60, PDX-DFW-PDX 01/23 $665.80 (its $40.28 seat was already a row), PDX-DFW 02/09 $462.40, and a $50.00 seat of 05-25. Each is Paul's own forward with the travel date as subject; the old Travel block has the airport Uber rides of the same days but not the fares. Paul: "american is most likely NOT personal expenses", then "yes". Overhead is $2,070.30 above the old books. Audit §30 |

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

## 24 · The one-cent blind spot, 2026-09-18 afternoon

Preparing the confirm list, Claude tested every weak row against the line items of same-vendor
receipts. 60 rows had an item-level match the matcher had missed, for two reasons: it compared a row
to a receipt line **to the exact cent** (Paul typed each item with its tax share; the read rounds the
share the other way about half the time), and it never tried **two items typed as one row**. Three of
those rows were the "missing" items behind earlier additions - see C-10 and C-11: the pump + hose, the
contractor bags and the hole saw were in the old books all along. The independent audit's own check of
the additions (single exact amounts) missed them too. Retracted in `paul-answers.json`.

Matcher now: a line within one cent counts; a row equal to two lines of a same-day (±1) receipt counts.
Result: **825 entries linked** (was 786), confirm list 232 → **185**, no document 31 → 27. Dry run:
**1,030 entries, $220,512.72** (Ashburne $160,850.87, overhead $24,496.56), all build; link audit
clean. Pushed to staging; staging still holds pass 4 ($220,774.59) until the next Run.

Standing rule, sharpened: before telling Paul an item is not in his books, search every tab for the
amount **within two cents, and for the sum of the receipt's unexplained items**, not just the exact figure.

**Confirm list, first pass by judgment (2026-09-18 afternoon).** Paul confirmed the Aiper pool robot
($411.34, Amazon order of 03-17; the $1.50 is a coupon split). Claude then sorted the rest and recorded
each decision in `paul-answers.json`: linked the under-cabinet lights ($154.53, the other order in the
same envelope); refused 82 candidates that cannot be the receipt - another vendor's document (42), a
receipt that totals less than the row, a line with the right amount and the wrong product. Lists now:
confirm **102**, no document 109, linked **826** of 1,030. Two old-books findings to put to Paul, one
at a time: **TXU $161.17 of 06-16 is typed on both 1616 Granite (Utilities row 6) and 280 Sparkling
(row 36)** - one payment, confirmation 803295274, sent to the Sparkling mailbox; and **Shell $65.48 of
03-25 is typed twice in Ashburne's Gas block (rows 32, 33)** - one receipt. Receipt d3b6197026 (HD
02-19, $390.12) is over-claimed and two rows that belong on it (saw blade $54.09, wire connectors
$11.70) are not: a differences-list job (item 4).

**TXU, Granite and Sparkling reconciled to the utility (C-16).** Dry run: **1,031 entries, $220,351.55**
(Cost Recapture $1,203.87), 827 linked, all build. Rule from Paul for every sold property: the old tab
is migrated as closed, and any discrepancy found afterwards is a Cost Recapture line naming the
property - never an edit to the closed tab.

**Double-entry scan of the old books (2026-09-18, rows of $50+ with the same payee, date and amount and
fewer receipts than rows).** Five groups: TXU $161.17 → C-16; Shell $65.48 → C-17 (dropped; dry run
**1,030 entries, $220,286.07**); Mariana $500 06-29 → settled earlier (C-8); Effren $110 x3 / $55 x3 → the
per-property lines of invoices 1372 and 1373; Julio $200 06-12 on Granite and Sparkling → Paul: "keep it
as is. he did work for both properties on different days but was paid for both on the same day."
Recorded under `confirmed_as_is` in `paul-answers.json` so none of them is asked again.

**Confirm list worked by judgment (2026-09-18, item 3 of §17) - and a mistake of Claude's inside it,
caught the same hour.** First pass: 232 → 30, by linking the clear cases and refusing the impossible ones
in bulk. The bulk refusals were wrong in two ways: they were keyed on the **row**, so a refusal of one
bad candidate blocked the row from every document; and they took "unlinked" from `G-row-map.csv`, which
does not know about the links `migration-rows.py` adds itself - so six rows that were already correctly
linked (the HOA dues $259.09, three Uber Eats crew meals, two UPS Store receipts) were refused off their
own receipts. A comparison against the pre-audit links found it. Fixed: a refusal now names its document
and refuses that document only; all 136 bulk refusals were removed and rebuilt per document from the true
unlinked set (98: another vendor's document 35, receipt smaller than the row 13, receipt already
explained to the cent 48, right amount wrong product 2). Also fixed: the remainder of a partly explained
receipt can attach rows (the Shalom Granite $4,950 row had fallen off its $8,508 receipt).

Linked by judgment, each with its reason in `paul-answers.json`: the Aiper robot (Paul), the cabinet
lights, six Mesa Lowe's rows of 08-13 ($542.39 of a $542.40 receipt), 14 rows on the only same-vendor
receipt of their day, four exact matches with a misspelt or oddly named payee. **857 entries carry a
receipt: 83.0% of rows, 66.6% of dollars** (pre-audit: 76.1% / 68.1% - fewer dollars because $16.5K of
Ashburne rows that used to be held back now post, unlinked). Lists: confirm **57** (under $310 each),
no document 124, differences 117, in mail not in the books 168. What is unlinked is mostly what never had
a receipt - contractor checks and cash (Luxury 4 Less $10,319.56, Juan Garcia 4 x $7,000, Salvador
Campos, Atlas Pools, the Mesa checks): proven from the bank side in Phase 3. The 16 links the pre-audit
run had and this one lacks are all deliberate: wrong vendor (Julio → CoreLogic, toll → Uber), Sparkling's
TXU (C-16), and near-amount links more than 10 days apart.

Rule for next time: after any change to the matcher or the answers, diff the links against the last
committed run and read every link that disappeared before moving on.

## 25 · The matcher only ever looked at what was read (2026-09-18, Paul's Luxury 4 Less invoice)

Paul, on the $10,319.56 Luxury 4 Less row listed as "never had a receipt": he produced invoice 3158 from
his mail - "this was in this email that you should have found". He is right. The matcher works from the
968 documents the bookkeeper read, and those are only the mails sent to a receipts or property address.
Vendor mail that stayed in paul@ (or pvb421) was listed on 2026-09-17, amounts and all
(`gmail-listing-*.json`, 8,237 messages), and never consulted. Searching every listed message for each
unlinked row's exact amount found 43 rows with a hit; nine are certain (vendor, amount and date agree) and
are linked by Gmail id in `paul-answers.json`: **Luxury 4 Less $10,319.56** (QuickBooks payment
confirmation of 04-10; invoice PDF in `evidence/`; its $175.00 balance is the 04-16 cooktop-install row, so
the $10,494.56 invoice is explained to the cent), Lowe's ceiling fans $898.30, Wayfair tub $816.18, Red Oak
water $447.47, Sparkling TXU $228.64, Amazon drawer pulls $249.97 and heaters $169.98, the toll tag $92.57
(Paul's own note), Wayfair bath bar $76.85. **866 entries linked: 83.9% of rows, 72.6% of dollars.**

Still to settle from that search: Atlas Pools' deposits against invoice 16097 (three payment confirmations
on 03-12, one on 03-28 - the $2,000 / $2,177 rows), the two $299 Mission listing fees (one PayPal receipt
of 07-01 forwarded by Dennis - which property?), and the Mesa checks 1146 / 1147 / James Haroce (Dennis's
checks; nothing in mail). Juan Garcia's 4 x $7,000: two are Dennis's cash advances of 01-12 and 01-23 (the
Cash Advances tab is their record); nothing in any mailbox for the other two. Salvador Campos $3,880: nothing.

**Standing rule:** "no document" is only said after the row's amount has been searched in ALL listed mail
(three mailboxes), not only in the documents that were read. To do before cutover: fold this search into
`migration-compare.py` so the listing is a second source of candidates, and queue the never-read messages
that match for a read (about $0.21 each) so they can be filed to Drive.

## 26 · Atlas Pools reconciled to its own payment portal (2026-09-18)

Paul supplied the Atlas Pools customer-portal payment list (`evidence/atlas-pools-portal-payments-*.webp`):
17 succeeded payments, **$18,595.17**. The Ashburne Pool block has 18 Atlas rows, **$18,926.18**.
The $331.01 difference is two things.

| Atlas received | old row | |
|---|---|---|
| 02/12 $2,000.00 (inv 16097) | 02-12 Deposit $2,000.00 | ✓ |
| 03/02 $2,000.00 | 03-01 Deposit $2,000.00 | ✓ |
| 03/06 $2,000.00 | 03-06 Deposit **$2,025.00** | +$25.00 |
| 03/14 $4,000.00 | 03-13 Payment **$4,025.00** | +$25.00 |
| 03/21 $490.00 (16525), $21.65 (16528, card 9166) | 03-20 $490.00, $21.65 | ✓ |
| 03/30 $2,152.00 by check | 03-29 Payment **$2,177.00** | +$25.00 |
| 04/01 $2,120.00 (16542) | 03-31 New Pump $2,120.00 | ✓ |
| 04/17 $1,800.00 (16950, card 6926), $185.00 (16925, card 5655), $196.47 (16768) | 04-17, three rows | ✓ |
| 05/18 $350.00 (17517), $256.01 (17310) | 05-18, two rows | ✓ |
| 06/11 $256.01 (17785) | 06-11 Service | ✓ |
| - | **06-30 Service $256.01** | no payment at Atlas |
| 07/25 $256.01 (18218) | 07-30 Service | ✓ |
| 09/01 $256.01 (18723), $256.01 (18972) | 09-01 Service - August, - Sept | ✓ |

- Invoice 16097 (the renovation): Atlas received $12,152.00 exactly; the rows carry **$75.00 more, $25.00
  on each of three payments**. Paul, after seeing the portal: "those were most likely wire transfer
  charges" - $25.00 a wire, which fits the portal showing them as "Other", not card. Rows kept as typed
  (D-027): the fee was a real cost of paying the contractor. The three wires show on the bank statements
  in Phase 3.
- **The 06-30 "Service" $256.01 has no payment behind it.** Atlas took five monthly payments (05/18, 06/11,
  07/25, 09/01, 09/01); the books have six. July's invoice 18218 arrived 07-03 and was paid 07/25 - it
  looks typed once when billed (06-30) and again when paid (07-30). **Paul: the portal is the guide - dropped, C-18.**
- Cards 6926 and 5655 are on no account → Paul's personal cards (D-026.1); the rows are PAUL already.
- The two Atlas rows that had no receipt (02-12 $2,000, 03-29 $2,177) are linked to Atlas's payment
  confirmations in paul@. All 18 Atlas rows but the 06-30 one now carry a document. 868 entries linked.

**After C-18:** the Ashburne Atlas rows are 17, $18,670.17 = the portal's $18,595.17 + the three $25.00
wires. Dry run **1,029 entries, $220,030.06** (Ashburne $160,594.86).

**Listing fees (C-19).** Paul asked whether Bowling Green has an Iley / Mission row: it has none, and
neither has Newport, though both were listed through Mission (07-02 and 07-14). Both added, Dennis paid:
Bowling Green on its tab ($4,060.63 now), Newport on Cost Recapture ($1,502.87 now). The Granite and
Sparkling fees stay without a receipt - Dennis paid them and the PayPal receipts went to him; asked for.
Dry run **1,031 entries, $220,628.06**, all build; 870 linked.

## 27 · Where the documentation stands at the end of 2026-09-18

Paul, on the contractor checks and cash with nothing in any mailbox - Juan Garcia 4 x $7,000, Salvador
Campos $3,880, the Mesa checks #1146 / #1147 and James Haroce, **$36,880.00**: "yep, those just have to
roll with no receipts." Recorded under `no_document_accepted`; they migrate at his amounts, flagged
NO_DOC, and are proven from the bank statements in Phase 3.

| | entries | $ |
|---|---:|---:|
| To post | 1,031 | 220,628.06 |
| Linked to a receipt | 868 (84.2%) | 164,461.57 (74.7%) |
| No document, accepted by Paul | 8 | 36,880.00 |
| Other unlinked: cash labor (Julio, Mariana), small Home Depot rows, the second 50Floor charge | 155 | 19,286.49 |

So **91% of the dollars are either documented or a known no-receipt payment**; the remaining $19.3K is 155
rows averaging $124. Morning of the same day, before the audit: 76.1% of rows, 68.1% of dollars, one row
missing, three false additions and about ten wrong links.

**Still open before cutover (§17):** the confirm list (57 rows, all under $310); item 4 differences
(117 receipts whose total differs from their rows - returns or omitted items, D-028); item 5 in mail and
not in the books (168 documents - utilities first); item 7 Drive filing, including the never-read paul@
messages now linked by Gmail id; the listing search folded into `migration-compare.py`; a skip-rebuild
flag for the advances registration; Dennis's PayPal receipts for the Granite, Sparkling and Newport
listing fees; settlement dates for Ashburne and Newport; then the production writer push and the cutover.
Staging holds pass 4 ($220,774.59); the current dry run ($220,628.06) is pushed and needs one Run.


## 28 · Staging pass 5, 2026-09-18 15:41 - the end-of-day books, tied out

Paul ran `migrationRunStaging` at 15:41 on the dry run of §27. Tie-out from the `books-cache` Journal
snapshot (fetched 15:41:37), two paths. (1) Journal by property = `rows/expected.json`, **$0.00 on all
nine** (Ashburne $160,594.86, Granite $12,204.87, Bowling Green $4,060.63, Mesa $9,648.00, Newport
$3,089.17, Sparkling $3,179.78, Brushwood $1,916.80, Cost Recapture $1,502.87, overhead $24,431.08):
**1,031 entries, $220,628.06**, txn ids identical to `rows/entries.csv`, every entry's amount equal to
its dry-run amount, debits = credits ($2,282,038.98), no unbalanced txn, **868 entries carry a link**.
33 advances, none orphaned, account 1000 = $1,863,647.50 (the advances were not re-registered - the list
did not change). (2) `scripts/migration-audit-indep.py` re-parse vs the Journal on date + amount: every
old row is there; the residuals are the $0.00 Netlify row, C-3, C-5 … C-9, C-12, C-15, C-17, C-18 on the
old side (plus four cells the independent parser reads that are not rows: three account numbers and
Sparkling J34, a `=SUM` subtotal), and C-10 x4, C-11 x4, C-16, C-19 x2 and the four Cost Recapture tab
rows on the new side. `rows/journal-tieout.json` records it. Staging = the dry run; next is §27's list.

## 29 · Item 5, utilities: 25 documents in mail and not in the books (2026-09-18 late afternoon)

Each bill was paired with its payment, tied to a property by service address or account number (TXU
900084832931 Granite, 900085271816 Sparkling, 900085271895 Bowling Green; Atmos 3076066788 and Energy Texas
ET-7827592 Ashburne; Red Oak 026-0031064-002 Bowling Green; Waxahachie 2-050-03330-003 Granite,
1-022-11500-002 Sparkling), and every amount was searched on every old tab and in all listed mail first.

**22 need no posting** - recorded one by one under `mail_settled` in `paul-answers.json` (new key;
`migration-rows.py` takes them off list 4, which is now **146**): 13 bills or reminders whose payment is
already a row (Atmos $57.65 sits inside the 03-08 $642.60 - "Previous Balance 57.65"; Waxahachie $913.92 +
$36.10 card fee = the $950.02 Granite row; Red Oak $401.04 paid late as $441.06 + $6.41 fees = the $447.47
row), two paul@ copies of TXU payments already linked, the Energy Texas usage screenshot of 03-06 (a running
cycle, not a payment), two bills that only announce an open payment below, three bills with no payment in
any mailbox yet (Atmos Ashburne $31.60 → $67.39 carried forward; HILCO Mesa $56.03 due 09-24), and the
Corsicana $21.00 landfill ticket, which is Dennis's 04-16 cash advance (D-032), not a row. Entries, links and
`MigrationData.gs` are unchanged (1,031, $220,628.06), so nothing to push or rerun.

**Four payments are in mail and on no old tab - Paul's call (D-028), one property at a time:**

| property | date | payment | amount | paid with |
|---|---|---|---:|---|
| 136 Bowling Green (held) | 08-21 | TXU, conf 808997400 - Paul forwarded it to 136bowlinggreen@ | 164.02 | Citizens 5450 (CNB daily summary 08-21) |
| 136 Bowling Green (held) | 08-31 | Red Oak water, conf JNGKGFWLFQ: 522.02 + 5.22 + 2.00 | 529.24 | Citizens Visa 5450 |
| 104 Ashburne | 09-03 | Energy Texas auto-pay, conf PAY04938659 (bill of 08-17) | 484.43 | card 9166 |
| 366 Mesa (held) | 09-16 | Central States Water, invoice 173914055: 48.45 + 1.09 fee | 49.54 | not shown |

Also Bowling Green: TXU took **$102.16** on 07/25 (conf 806639700); the row of 07-29 is typed **$102.12**.
Ashburne's line depends on its closing date (title had 09/10 on 08-31; still unconfirmed on 09-08): before
the closing it is a row the tab lacks, after it a Cost Recapture line either way (D-031 extended). Energy
Texas was still sending weekly usage reports for Ashburne on 09-16 and Atmos billed it on 09-14 - if the
house has closed, both accounts are still open in Recast's name.

**Skip-rebuild flag (§23's 14 minutes), same afternoon.** `addAdvance(form, skipRebuild)`: the menu dialog
calls it with one argument and behaves as before; `migrationRegisterAdvances` passes `true`, then rebuilds
each property's tab once and warms the cache once. Syntax-checked, `npm test` 392 pass, pushed to the
STAGING project with the unchanged `MigrationData.gs`; **not yet run** - it is proven the next time the
advances list changes or at the cutover rehearsal. Link audit rerun on a fresh download of all 968
envelopes: clean (section one lists only the old poller's Uber id link); 15 links point at never-read
paul@ messages by Gmail id, to be read and filed (item 4 of the handoff).

**Bowling Green answered (Paul: "yes to both") - C-20, C-21.** The $102.12 row is $102.16; the TXU $164.02
(08-21) and Red Oak $529.24 (08-31) payments are added on the tab from Citizens. An `add` document now
leaves list 4 by itself. Pipeline rerun from the matcher on the fresh envelopes: the only entry changes are
those three (txn-id diff against the previous run; no link disappeared), link audit clean. Dry run **1,033
entries, $221,321.36** (Bowling Green $4,753.93), all build; differences 116, list 4 **143**. Pushed to
staging; **staging still holds pass 5 ($220,628.06)** until the next Run of `migrationRunStaging` (the
advances list did not change). Still open from the table above: Ashburne $484.43, Mesa $49.54.

**Ashburne answered - C-22, and a fact corrected: 104 Ashburne has NOT closed (Paul, 2026-09-18: "it is
still held").** The $484.43 Energy Texas payment is a row on the Ashburne tab. Earlier notes that call
Ashburne sold or closed (D-033's list of past sales, "closed on its cash draws" in C-17 / C-18, the owed
"settlement date") were wrong about the closing: title had 09/10 pencilled in and the lender never
confirmed; the Sales tab's $124,872.69 is an expected figure. Nothing already done changes - the Ashburne
corrections were plain drops on its own tab, which is exactly right for a held property, and no Ashburne line
was ever sent to Cost Recapture. Its open Atmos and Energy Texas accounts are ordinary holding costs. Only
Newport's settlement date is owed. Dry run **1,034 entries, $221,805.79** (Ashburne $161,079.29), all build;
the only change against the previous run is the one new entry; pushed to staging, which still holds pass 5.
Left from §29's table: Mesa, Central States Water $49.54.

**Mesa, Central States Water $49.54 - not a migration item.** The 09-16 email is a *scheduled* payment, "to
be processed on 9/18/2026": it postdates the 09-17 snapshot, so it is one of the live receipts Paul is
holding and posts in the cutover replay (independent audit finding 5b), where the Inbox asks who paid.
Recorded under `mail_settled`. **The utilities are closed:** 25 documents → 22 settled, 3 added (C-21, C-22),
plus C-20; list 4 stands at 142 documents.

**Staging pass 6, 16:05-16:07 - tied out.** Paul ran `migrationRunStaging` (2,062 lines of pass 5 cleared, 66
advance lines kept, 1,034 posted). Journal by property = `rows/expected.json`, **$0.00 on all nine**: 1,034
entries, **$221,805.79**, txn ids and per-entry amounts identical to the dry run, debits = credits
($2,283,216.71), 871 linked, 33 advances, no orphans. The differences from pass 5 are exactly C-20, C-21 x2
and C-22. Staging = the dry run.

## 30 · A hole in list 4: receipts dismissed as duplicates of their own earlier staging post (2026-09-18)

Paul: "american is most likely NOT personal expenses." Checking the American Airlines documents against the
old Travel block found a ticket that was on **no list at all**: AA $316.50 (DFW-PDX 01/17), status
`dismissed` with the rail note "the writer already holds receipt-20260110-... posted moments earlier by a
twin". That earlier post was the 09-17 document-driven replay, cleared since (D-029) - so the only read of
the receipt sat in the comparison's "junk (dismissed)" bucket. The matcher already lets such a lone
stale-duplicate dismiss *link* to a row (`live`, §22); the bucket line did not use the same test. Fixed in
`migration-compare.py` (one line). 23 documents joined list 4 that way (nine Home Depot, two Lowe's, the AA
ticket, AllModern $214.34, McCoy's, two Uber rides, small subscriptions).

Second fix, `migration-rows.py`: list 4 was built from the comparison alone, so it still showed documents
that `paul-answers.json` had since linked, and forwarded twins of linked receipts. A document an entry
carries, or its same-day same-total twin, now leaves the list: 33 left (16 carried by an entry, 17 twins -
each checked, every twin is the same vendor). **List 4: 132.** Entries, links and `MigrationData.gs` are
byte-identical to pass 6; link audit unchanged.

## 30 · A hole in list 4: receipts dismissed as duplicates of their own earlier staging post (2026-09-18)

Paul: "american is most likely NOT personal expenses." Checking the American Airlines documents against the
old Travel block found a ticket that was on **no list at all**: AA $316.50 (DFW-PDX 01/17), status
`dismissed`. Paul: "who marked it junk?" - nobody's judgment. (1) The live pipeline's duplicate-invoice rail
dismissed it during the 09-17 document-driven replay ("the writer already holds receipt-20260110-... posted
moments earlier by a twin"), over the model's own verdict of "new charge, post"; that post was cleared under
D-029, and no second copy of the ticket exists among the 968 envelopes (most likely the same message
processed twice at once). (2) `migration-compare.py` then bucketed every dismissed document with no matching
row as "junk (dismissed)". The matcher already lets such a lone stale-duplicate dismiss *link* to a row
(`live`, §22); the bucket line did not use the same test. Fixed (one line). 23 documents joined list 4 that
way (nine Home Depot, two Lowe's, the AA ticket, AllModern $214.34, McCoy's, two Uber rides, small
subscriptions).

Second fix, `migration-rows.py`: list 4 was built from the comparison alone, so it still showed documents
that `paul-answers.json` had since linked, and forwarded twins of linked receipts. A document an entry
carries, or its same-day same-total twin, now leaves the list: 33 left (16 carried by an entry, 17 twins -
each checked, every twin is the same vendor). **List 4: 132.** Entries, links and `MigrationData.gs` are
byte-identical to pass 6; link audit unchanged.

**American Airlines answered - C-23.** Five charges, $2,070.30, added to overhead Travel, paid by Paul, each
linked to its receipt; `add` entries can now carry a `business_purpose` (the posting engine requires one on
6700 and refused the first build). Two AA twins settled. Dry run **1,039 entries, $223,876.09** (overhead
$26,501.38), all build; the only change against pass 6 is the five new entries; 876 linked; link audit
unchanged; list 4 **125**. Pushed to staging; staging holds pass 6 until the next Run.

## 31 · List 4 by judgment, continued (2026-09-18 evening)

**Uber, 18 documents, nothing to post.** Nine are Uber's first receipt for a ride, before the tip - the old
Travel row is the final amount (e.g. 06-03 $94.98 + $19.00 tip = the $113.98 row; 08-30 $99.44 + $30.00 =
$129.44); five are second copies of a receipt whose row is already linked; three are the $9.99 Uber One
membership, never once entered in the old books; one is a $200 gift card ("gift to Sarah"). Each is recorded
under `mail_settled` against its named row (the script asserted that exactly one such row exists).

**Copies and twins, 20 documents, nothing to post.** Six dry-run copies (`dry-gm-…`) of a document an entry
carries; twelve second copies of a subscription receipt (Anthropic x7, Apify x2, Netlify, FedEx, Telnyx) -
the script required a same-vendor row of the same amount within a day carrying a *different* document;
a second photo of the Shell fill-up of 04-09; Paul's "Interest" $666.67 note, which is the 420 Alyssa row he
removed (C-6). **One link gained:** the Ashburne Gas row of 03-10 "Shell" $69.27 is a Mobil pump receipt of
the same day and amount (877 linked). Entries and amounts unchanged (1,039, $223,876.09); link audit
unchanged. **List 4: 86** - what is left: Home Depot / Lowe's (37), CoreLogic invoices against five payment
rows (8), Amazon (5), Paul's Julio notes and handwritten logs (evidence for cash-labor rows, to be linked),
four unread Floor & Decor e-receipts, the Ellis County tax bill $16,031.25, Falcon Creek $470 + $235,
Berrett Pest $270.63, VistaPrint $241.71, Apify $313.20, and small singles.
