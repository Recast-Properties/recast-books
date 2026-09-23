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
| C-19 | 2026-09-18 | MLS listing fees the old books left off: 136 Bowling Green and 881 Newport | not in the old books | added, $299.00 each, 1330, **Dennis paid** | Every listing goes through Mission Real Estate Group / Iley & Iley at a flat $299. Granite, Sparkling, Brushwood and Ashburne have their fee; Bowling Green and Newport did not. Bowling Green: PayPal receipt to Dennis of 07-01, and Paul's email to Mission that day - "We added and paid for a new listing ... It was for 136 Bowling Green Ave" - on the property's tab (held). Newport: Mission 07-13, "Mr. Iley sent an invoice to Dennis Little", listed 07-14; no receipt seen, amount is the flat fee; ~~Newport is sold, so the line is on Cost Recapture~~ **corrected 2026-09-21 (§47): Newport is under contract, not closed - the fee is a row on Newport's own tab, dated 07-13.** Paul: "yes add it and newport too." Owed to Dennis at closing, no interest (D-030) |
| C-20 | 2026-09-18 | 136 Bowling Green, TXU "Electricity" (07-29, row 8) | $102.12 | $102.16 | TXU took $102.16 on 07/25 (conf 806639700, card 9166, service address on the confirmation). Paul: "yes to both". Bowling Green is $0.04 above the old tab |
| C-21 | 2026-09-18 | 136 Bowling Green, two utility payments the old books left off | not in the old books | added, **$693.26**, 1120, paid from Citizens (1401) | TXU $164.02 of 08-21 (conf 808997400; Paul forwarded it to 136bowlinggreen@; CNB daily summary shows it on card 5450) and City of Red Oak $529.24 of 08-31 (conf JNGKGFWLFQ: $522.02 + $7.22 fees, Visa 5450). Searched within two cents on every old tab and in all three mailboxes first. Paul: "yes to both". Audit §29 |
| C-22 | 2026-09-18 | 104 Ashburne / Utilities, Energy Texas auto-pay of 09-03 | not in the old books | added, $484.43, 1120, Paul paid (card 9166) | The 08-17 bill (acct ET-7827592) paid by auto-pay, conf PAY04938659; the tab's last electric row is 08-03 $371.16. Paul: "ashburne has not closed. it is still held. file that 484.43 charge" - a row on the tab, not Cost Recapture. Ashburne is $484.43 above the old tab |
| C-23 | 2026-09-18 | RECAST BIZ / Travel, five American Airlines charges the old books left off | not in the old books | added, **$2,070.30**, 6700 overhead, Paul paid | Fares DFW-PDX 01/17 $316.50, PDX-DFW-PDX 02/01-02/04 $575.60, PDX-DFW-PDX 01/23 $665.80 (its $40.28 seat was already a row), PDX-DFW 02/09 $462.40, and a $50.00 seat of 05-25. Each is Paul's own forward with the travel date as subject; the old Travel block has the airport Uber rides of the same days but not the fares. Paul: "american is most likely NOT personal expenses", then "yes". Overhead is $2,070.30 above the old books. Audit §30 |
| C-24 | 2026-09-18 | 104 Ashburne, "Property Tax Paid" $16,031.25 (summary block, cell E10) | in the old tab's Total Project Cost, outside the expense rows - the inventory never read it, never posted | posted 2026-03-30, 1100, Paul paid | Ellis County paid-in-full receipt: 2025 levy $14,707.58 + 9% penalty and interest $1,323.67, check #5899 on Paul's personal Chase account. Paul: "i paid the property tax for ashburne for the year on 3/30 ... adjust the books for this however you see fit." Not a difference from the old books - a line of them the migration had missed (like C-12). D-034 |
| C-25 | 2026-09-18 | Falcon Creek Lawn Care, invoice lines paid and not in the old books | not in the old books | added, **$140.00**, 1130, Paul paid | Invoice 1374 (07-30): 136 Bowling Green $55.00 on its tab; 881 Newport $55.00 ~~on Cost Recapture (Newport is sold)~~ **on Newport's own tab, 07-30 - corrected 2026-09-21 (§47): Newport has not closed.** Invoice 1373 (07-19): 1616 Granite billed $140.00, the closed tab carries $110.00 - $30.00 on Cost Recapture. Paul's Chase Zelle history (`evidence/chase-zelle-sent-*.webp`) shows both invoices paid in full from his personal account (1373 $470.00 on 07-24, 1374 $235.00 on 08-11); Paul: "dennis only paid that $315 ... i paid those falcon invoices from my chase account". Audit §37 |
| C-26 | 2026-09-18 | 104 Ashburne / Paint & Flooring, Zelle payment to Armandre Vega | not in the old books | added, **$350.00** labor (1020), 04-04, Paul paid. ~~04-03 $379.18 materials~~ **retracted the same evening - Claude's error, see §38: it is the old row "Home Depot / Stair Moldings" $350.28** | On Paul's Chase Zelle history only (`evidence/chase-zelle-sent-1-mar-to-apr.webp`; memos "materials for ashburne", "104 ashburne glen"); on no old tab under any payee, in no mailbox. Paul: "treat the two vega payments as their own entries. materials and labor." No mail document - the entry carries `EVIDENCE:` and gets its Drive link at filing (item 7). Ashburne is $729.18 above the old tab |
| C-27 | 2026-09-18 | 104 Ashburne / Pest Control, Berret Pest Control $270.63 | dated 2026-01-14 | 2026-06-30 | Every Berrett message is one job: quote 06-29, service and payment 06-30 ($250.00 + $20.63 tax, card 9166), account opened with that quote; nothing in January. Paul: "yes 6/30". Amount unchanged |
| C-28 | 2026-09-18 | RECAST BIZ / Advertising, VistaPrint order of 06-11 | not in the old books | added, $241.71, 6000 overhead, Paul paid | Yard signs x2 + sign riders x2 (order VP_R3KPH54N). On no old tab at any amount or combination; the 05-08 / 05-13 order is the Ashburne Signage row, the 06-21 order the two overhead rows. Paul: "add vista print order". Overhead is $241.71 above the old books |
| C-29 | 2026-09-18 | 104 Ashburne / Paint & Flooring, Home Depot "Stair Moldings" (04-01, row 32) | $350.28 | $379.18 | The row is the pre-tax subtotal of Home Depot receipt `gm-19d54f9e0010bc8c` (04-03, cash, bought by Armandre Vega); with $28.90 tax it is $379.18, what Paul repaid Vega by Zelle that day (`evidence/chase-zelle-sent-1-mar-to-apr.webp`). Paul: "yes correct it". Ashburne is $28.90 above the old tab. Audit §38 |
| C-30 | 2026-09-21 | RECAST BIZ / Website, Netlify invoice #SFWGOE-00004 (06-13) | $0.00 (a row the old poller wrote without an amount; held back as ZERO_AMOUNT) | $13.40 | Netlify's "Payment received" for the same invoice number: Base Plan, Jun 13 - Jul 12, $13.40, paid by Paul. Claude's decision (the row names its own invoice); Paul can reverse it. Overhead is $13.40 above the old books |
| C-31 | 2026-09-21 | 413 Green Acres (pipeline property), Justice of the Peace Precinct 1 eviction filing fee | not in the old books (Green Acres has no tab) | added, $144.00, 1010 acquisition costs, 09-08, paid from Citizens (check #1022, memo "GREEN ACRES") | Paul's own forward "Green acres eviction check". Paul: "yes add it to green acres". A tenth property total now ties out: 413 Green Acres $144.00 |
| C-32 | 2026-09-21 | Four rows a few dollars off their receipt (differences list, §41-§43) | Window Man $858.68 (Ashburne 04-16) · Home Depot "Misc Supplies" $151.28 (Ashburne 04-10) · McCoy's "Trim" $45.56 (Bowling Green 08-06) · 50floor "Carpet" $1,319.00 (Granite 06-12) | $848.68 · $161.28 · $44.56 on their held tabs; Granite is sold, so its row stays and **+$20.00 posts on Cost Recapture** (trade 1616 Granite, D-031 extended) | Invoice #33688 ($784.00 + 8.25%); receipt subtotal $148.99 + $12.29 tax, debit 9166; 4 casings $41.16 + $3.40, Visa 9166; 50Floor Square receipt #PRrT $1,339.00. Paul: "match the receipts/invoices for these". Net +$19.00 |
| C-33 | 2026-09-21 | 104 Ashburne / Kitchen, Home Depot "Kitchen Faucet" $189.57 | dated 2026-04-10 | 2026-08-10 | Its only receipt is Home Depot 08/10 (`gm-19fed30f7359ded5`: Greydon pull-down faucet $199.00 less Pro pricing $23.88, + tax = $189.57, to the cent); no April receipt has a faucet. Paul: "8/10". Amount unchanged; the txn id keeps its typed-date prefix, as C-8 and C-27 do |

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

## 32 · Paul's notes are the documents for cash labor; CoreLogic parked; the Ashburne tax (2026-09-18 evening)

Paul, on the Julio notes and handwritten logs: "no receipts for these. a lot of them are cash payments."
So his own note is the document. Seven Ashburne Julio rows now carry the email that names their day:
"Julio 3/17" (03-17), "Julio 4/2, 4/3" (two rows), "Julio 4/7", and "Julio / Mon-wed + 100" of 04-16 = Mon
04-13 $200, Tue 04-14 $200, Wed 04-15 $300 (the day plus the extra $100). **884 linked.** Settled without a
posting: the second "Julio 150" copy, "Dennis $400" (his 04-10 cash advance, D-032), the handwritten ASHBURNE
worksheet (every line on it is one of Dennis's registered advances), the check register, and the two $299
listing-fee documents of 05-07 (the 05-07 advance).

CoreLogic / Cotality, eight monthly invoices against five payment rows: Paul - "cotality's payment system is
archaic and i cant see my payment history. will have to wait for a bank statement." Parked for Phase 3 under
`mail_settled`; the rows stay as typed.

Dry run unchanged in amount (1,039 entries, $223,876.09); the only entry changes are the seven links; link
audit unchanged. Lists: confirm 54, no document 108, **list 4: 68**.

**Found while checking the Ellis County tax receipt ($16,031.25, 03-30, check #5899):** §12 said it was "not
on the old tab by that name". It is - in the Ashburne summary block, **B10 "Property Tax Paid" / E10
$16,031.25**, part of the tab's Total Project Cost, not among the expense rows, so the inventory never saw it
and it has never been posted. It is the only paid tax in the workbook (the other tabs' "Property Tax
(Prorated)" lines are forecasts with a TODAY() formula). Put to Paul before adding: which account check #5899
was drawn on.

## 33 · Property tax (D-034): the Ashburne payment posted, the annual figures carried over (2026-09-18)

Paul asked whether selling in 2026 means paying prorated tax or getting a refund. Looked up: Texas tax is
billed in October and due 01-31 of the next year; the 03-30 payment was the whole of **2025** at the March
delinquency rate (7% + 2% = 9%; $14,707.58 x 9% = the receipt's $1,323.67). Nothing is paid toward 2026, so
there is no refund; at a 2026 closing the seller is charged Jan 1 → closing on the settlement statement (TREC
para. 13). Two tax years, no double payment. **C-24** posts the $16,031.25 (1100, Ashburne, Due to Paul,
receipt linked). `migrationRegisterProperties` now carries each old tab's annual tax figure into
`Properties.tax_annual` (Ashburne $14,707.58 - the levy, not the $16,031.25 the old tab prorated; Newport
$7,941.61, Bowling Green $9,357.00, White Rock $10,715.55, Mesa $470.57, Brushwood $7,854.00) so the new tab's
"Property Tax (prorated)" line = posted 1100 + the estimate, as the old tabs showed it; Ashburne's note no
longer says sold. `migrationRunStaging` refreshes the Properties rows itself (no extra tab rebuilds:
`addProperty(form, skipRebuild)`), so it is still one Run. Dry run **1,040 entries, $239,907.34** (Ashburne
$177,110.54), all build; the only change is the one entry; 885 linked; list 4: 67. Pushed to staging.

## 34 · "Effren" is Falcon Creek Lawn Care; its four invoices read against the rows (2026-09-18)

Paul: 'change "Effren" to Falcon Creek's official name.' New `rename_payee` rule in `paul-answers.json`
(applied in `migration-rows.py` after the txn id is fixed from the row as typed, so ids, amounts and links do
not move): 13 rows on Newport, Bowling Green, Granite and Sparkling now read **Falcon Creek Lawn Care**; an
invoice number typed after the name ("Effren - 1373") moves into the description ("Landscaping - INV 1373");
the typed name stays in each entry's correction note.

The invoices, line by line: **1372** (07-07, $535) = five rows, all linked, to the cent (the $300 flowerbed
job is Newport's row). **1373** (07-19, $470): its four rows were unlinked - now linked (Newport's is typed
"1372" by slip; it is dated 07-19 and is 1373's $110 Newport line). **1374** (07-30, $235): the Granite $70
and Sparkling $55 rows had been hung on invoice 1372 by the matcher - moved to 1374. **1390**: settled
earlier (C-10). 889 linked; amounts unchanged (1,040 entries, $239,907.34); link audit unchanged; list 4: 65.

**For Paul, from those invoices:** 1373 bills 1616 Granite 2 x $70 = **$140**; the Granite row is typed
**$110** ($30 short, on a closed tab). 1374 bills 136 Bowling Green $55 and 881 Newport $55 and **neither has
a row** (every $55 Falcon Creek row is accounted for by 1372 and 1390).

**Staging pass 7, 16:32-16:35 - tied out.** `migrationRunStaging` refreshed the eleven Properties rows itself
(tax_annual now on six properties), cleared 2,068 lines, kept 66, posted 1,040. Journal by property =
`rows/expected.json`, **$0.00 on all nine**: 1,040 entries, **$239,907.34** (Ashburne $177,110.54, overhead
$26,501.38), ids and per-entry amounts identical to the dry run, debits = credits ($2,301,318.26), 33 advances,
no orphans. The run used the C-24 push, a few minutes before §34 was pushed, so the Journal still reads
"Effren" on 13 rows and lacks six Falcon Creek links (885 linked vs the dry run's 889); ids and amounts are
the same either way - the next Run brings the names.

## 35 · Falcon Creek: what the reconciliation covered (Paul: "you reconciled against all falcon creek invoices? dennis wrote him a check for 136 bowling green")

Every Falcon Creek / Efren Ramirez message in the three mailboxes was listed (search on the sender, the name
and "lawn"): **four invoices** - 1372 (07-07, $535), 1373 (07-19, $470), 1374 (07-30, $235), 1390 (08-30,
$425) - and Paul's note "Effren $315" of 06-27, for which no invoice exists. That $315 is the Bowling Green
row of 06-27, **already Dennis paid**: Paul's handwritten Bowling Green log reads "6-26 FALCON 315.00 CK 1082"
(and "6-30 Carpet laid 160.00 CK 1088" - Lupe's row, now linked to the log; 890 linked). What the
reconciliation does **not** cover is Falcon Creek's side: payments. Mail shows only the CNB Zelle of 08-31
($275, invoice 1390) and that "Effren Landscaper" was added as a Zelle recipient on Paul's Chase on 07-09;
how 1373 and 1374 were paid, and by whom, is not in any mailbox.

## 36 · Singles on list 4, first findings (2026-09-18 evening)

- **Falcon Creek, Paul:** "dennis only paid that $315. my guess is i paid those falcon invoices from my chase
  account as zelle payments. let me look." Waiting on his Chase Zelle history before touching invoice 1373's
  Granite $140 / $110 or 1374's two missing $55 lines.
- **Berrett Pest Control $270.63:** the Ashburne row is typed 01-14; every Berrett message (quote 06-29,
  service and payment 06-30, card 9166) is one job in June and the account was opened with that quote. Row
  linked to the receipt (891 linked); the 01-14 date is a question for Paul (redate to 06-30?).
- **VistaPrint:** order of 05-08 $406.04 was cancelled on 05-13 for a $406.04 merchandise credit and re-placed
  the same day at $405.84 on the credit - one cost, the Ashburne "Signage" row of 05-08. Order of 06-21 totals
  $369.08 (items $294.39 + shipping $52.98 + tax $21.71) against two overhead rows of $170.99 + $147.69 =
  $318.68 - a $50.40 difference for the differences list. **Order of 06-11, $241.71 (yard signs + riders), has
  no row** - to put to Paul.
- **Apify $313.20 (05-15 annual plan):** C-5 recorded it as canceled; refund not yet confirmed in mail.

## 37 · Paul's Chase Zelle history against the books (2026-09-18 evening)

Paul sent five screenshots of his personal Chase "Money Sent" list, 03-05 → 09-07 (filed in `evidence/`), and
asked whether they reconcile other payments or uncover anything missed. Line by line:

| Zelle | memo | books |
|---|---|---|
| 09-07 Mariana Martinez $700.00 | "Brushwood and Ashburne" | Brushwood Cleaning $250.00 + Ashburne "Marianna" Cleaning $450.00, both on Paul's own forward of this payment ✓ |
| 09-01 Keith Pfaff $50.00, 08-20 $135.00 | Ashburne repair | the two Irrigation Repair rows ($135 is typed 09-05) ✓ |
| 08-31 Effren Landscaper $150.00 | invoice 1390 | Ashburne "Trim Bushes" $150.00, Paul paid ✓ (the other $275 of 1390 went from Citizens, §22) |
| 08-11 $235.00 | invoice 1374 | paid in full; rows carried $125 - **C-25** adds Bowling Green $55 and Newport $55 |
| 07-24 $470.00 | invoice 1373 | paid in full; rows carried $440 - **C-25** adds Granite's $30 |
| 07-09 $500.00 + 07-10 $35.00 | invoice 1372 pt 1, pt 2 | $535.00 = the five rows ✓ |
| 07-06 Mariana Martinez $500.00 | 881 Newport | Newport Cleaning $500.00 ✓ |
| 06-18 Armandre Vega $450.00 + $100.00 | "saving my ass", "ceiling" | Ashburne "Bath Fan and Vent" $550.00 ✓ |
| 04-04 Armandre Vega $350.00 | "104 ashburne glen" | **no row** at the amount, under any payee |
| 04-03 Armandre Vega $379.18 | "materials for ashburne" | **no row** at the amount; not in any mailbox |
| 03-05 Armandre Vega $524.81 (a first try rejected) | "104 Ashburne Supplies" | Vega "Flexible Quarter Round" $98.97 + Home Depot "Baseboards & Trim" $425.84 = $524.81 ✓ - Paul types what Vega bought under the store's name, which also explains that receipt's "difference" on list 1 |

Not on the screens: Mariana's two 06-29 payments (she was added as a Zelle recipient on 07-06 - cash before
that), Vega's $3,889.00 exterior paint of 03-24, and everything before 03-05 (the list cuts off at an Atlas
Pools line). Dry run **1,043 entries, $240,047.34** (Bowling Green $4,808.93, Cost Recapture $1,587.87), all
build; the only change is the three C-25 entries; pushed to staging. **Open with Paul:** the two Vega
payments of 04-03 and 04-04 ($729.18) - by the 03-05 pattern they may sit under Home Depot rows he typed
from Vega's receipts, but no row or combination of rows identifies them.

**Vega answered - C-26; Mariana's 06-29 payments were check or cash (Paul), recorded under
`no_document_accepted`.** An `add` with no mail document now names a file under `evidence/` instead
(`EVIDENCE:` flag, Drive link at filing). Dry run **1,045 entries, $240,776.52** (Ashburne $177,839.72), all
build; the only change is the two entries; pushed to staging. Paul's Zelle history is fully reconciled.

**Staging pass 8, 18:39-18:41 - tied out.** 2,090 lines cleared, 66 kept, 1,045 posted. Journal by property =
`rows/expected.json`, **$0.00 on all nine**: 1,045 entries, **$240,776.52**, ids, amounts, payees and
document links identical to the dry run (no "Effren" left; 894 linked), debits = credits ($2,302,187.44), 33
advances, no orphans. Staging = the dry run.

**C-27, C-28 (Paul: "yes 6/30 and add vista print order").** Berrett row redated to 06-30; VistaPrint 06-11
$241.71 added to overhead 6000. Dry run **1,046 entries, $241,018.23** (overhead $26,743.09), all build; the
only changes are that date and that entry; list 4: 62. Pushed to staging; staging holds pass 8 ($240,776.52).

## 38 · A double count caught the same evening: Vega's $379.18 was already a row (2026-09-18)

Going through the Home Depot receipts on list 4: receipt `gm-19d54f9e0010bc8c` of 04-03 - vinyl stair nose,
4-N-1 moldings, quarter round; **paid CASH $400.00, change $20.82; total $379.18** - is Vega's Zelle of 04-03
("materials for ashburne", $379.18) to the cent, and its **pre-tax subtotal $350.28 is the Ashburne row
"Home Depot / Stair Moldings" of 04-01**. Vega bought the trim with cash, Paul repaid him and typed the
subtotal. So C-26's materials entry doubled a cost the old books already carry: **retracted** (marked
`retracted` inside `add` so the later additions keep their index and their txn ids - `migration-rows.py`
skips it), the Stair Moldings row is linked to the receipt (896 linked), and the receipt leaves list 4. The
$350.00 labor entry stands. Why it was missed: the search before adding looked for $379.18 within two cents
and as sums of rows - never for the receipt's *subtotal*, and the receipt had not been tied to the Zelle.
Every addition made today was then re-checked against the subtotals and part-amounts printed on its document
(VistaPrint, the AA base fares, Red Oak, the tax levy): no other hit.

**Standing rule, sharpened again:** before adding a cost "not in the old books", search the amount within two
cents, as a sum of items, **and as the document's pre-tax subtotal** - and look for a store receipt of the
same amount when the payment is a reimbursement to a person.

Dry run **1,045 entries, $240,639.05** (Ashburne $177,460.54), all build; pushed to staging, which holds
pass 8 and so still carries the retracted entry until the next Run. **Open with Paul:** the Stair Moldings
row is $28.90 short of what was paid (tax) - correct it to $379.18 on the held tab, as C-20 did?

**C-29 (Paul: "yes correct it").** Stair Moldings $350.28 → $379.18, patched in `property-rows.json` with its
note like C-15 and C-20; pipeline rerun from the matcher: the row keeps its receipt, no other entry or link
moved (the row's txn id changes with its amount, as C-20's did). Dry run **1,045 entries, $240,667.95**
(Ashburne $177,489.44), all build; 896 linked; link audit unchanged. Pushed to staging.

**Staging pass 9, 19:17-19:20 - tied out to the dry run it ran on.** Paul started it 90 seconds before C-29
was pushed, so it posted the retraction dry run (`58d5506`): 1,045 entries, **$240,639.05**, $0.00 on all
nine against that run, payees, dates and links identical, 896 linked, 33 advances, no orphans; the retracted
Vega $379.18 is gone, Berrett reads 06-30, VistaPrint 06-11 is in. Against the current dry run ($240,667.95)
the one difference is C-29 itself (Stair Moldings $350.28 vs $379.18, one txn id, Ashburne -$28.90). The
staging project does hold the C-29 data now (checked with `clasp pull`); the next Run brings it.

## 39 · Offline pass, 2026-09-21: 26 false links from a coincidental-sum rule, found and removed

Working the Home Depot / Lowe's receipts left on list 4 (offline - all 968 envelopes are now cached in the
git-ignored `.cache/envelopes/env/`), the Lowe's receipt of 04-03 for a $113.64 handleset pointed at a row
already "strongly" linked elsewhere: to a Home Depot receipt of 04-02 whose four items are caulk, two washers
and grass seed. Six rows hung on that receipt - an angle stop of 03-11, wire connectors of 02-19 (the one the
handoff said belonged on d3b6197026) - and summed to its $271.24 to the cent. **Cause:** the matcher's
"rows that together equal a receipt / the remainder of a receipt" rule (§24) drew from every unplaced
same-vendor row within 45 days, cut the pool to its first 18, and accepted a subset when it was the only one
found. For a contractor with three rows that is sound (Shalom Granite); for Home Depot, with dozens of small
rows, some subset always equals any total, and the cut made the coincidence look unique. The link audit
counted "rows sum = receipt total" as its best case, so it never looked.

**Fix (`migration-compare.py`):** when more than 8 rows are candidates the set must lie within 3 days of the
receipt, and when the read itemised the whole receipt each row must equal an item (or two or three of them);
past 18 candidates, no guess. Contractor invoices paid in parts are untouched. `migration-audit-links.py`
gained a section that lists strong rows more than 3 days from their receipt that equal nothing on it (now:
Shalom's second payment only, which is right).

**Effect, read link by link:** 26 links removed, all on four receipts (Home Depot 03-01 $207.19 floor
protection + tape; Lowe's 03-16 $465.73 casing and trim boards; Home Depot 04-02 $271.24; Home Depot 04-06
$181.52, an unread e-receipt) - none of the 26 rows is an item on the receipt it sat on; they return to the
confirm / no-document lists. Nothing gained or moved by the rule. Three rows then linked by hand to their real
receipt: Front Door Lock Set $113.64 (typed "Home Depot"; it is the Lowe's handleset of 04-03), Grass Seed
$205.06 (the 04-02 receipt's $205.04 line), Kitchen Faucet $189.57 (Home Depot 08/10, to the cent with its Pro
discount; the row is typed 04-10 - the month looks like a slip, left as typed for Paul). **Linked: 873**
(it was 896 with the false ones). Amounts, ids and totals unchanged: 1,045 entries, $240,667.95. Lists:
differences 119, confirm 79, no document 99, list 4: 60.

## 40 · List 4 closed out offline (2026-09-21): 60 → 2

Paul asked for the rest of list 4 to be done without network calls. Every remaining document got its own
recorded decision in `paul-answers.json` (`mail_settled`, 56 entries) under the stopping rule put to him on
09-18: **no new cost unless it is proven paid and absent from the old books by total, by pre-tax subtotal and
item by item; otherwise park it for the bank and card statements.**

- **Not receipts / already carried (24):** five TEST uploads; seven Home Depot / Lowe's refund slips - each
  returned line checked against the rows of the 60 days before it: they return items Paul never entered
  (D-028), so nothing posts; the 06-29 $54.03 ticket, returned in full the next day; five second messages
  about a receipt already on the list; the Apify $313.20 annual plan (refunded and cancelled by Apify support
  on 05-18); the Texas SOS $2.00 slip (= the two $1.00 rows); two Floor & Decor notices whose rows have
  their receipts; a personal Klarna screenshot; Paul's "Julio $400 / Sat and for Dennis" note.
- **Parked for Phase 3 (32):** 26 purchase receipts (Home Depot 12, Lowe's 4, Amazon 5, AllModern, Wayfair,
  Ping Lighting, McCoy's, Walmart - about $5.9K) whose goods are on no old tab. Mail cannot tell kept from
  returned from personal; the refund slips alone return $941 of such purchases. Five food-and-drink receipts
  ($136) Paul did not enter. One unreadable Floor & Decor notice.
- **Linked:** the two Floor & Decor rows of 03-07 ($248.39, $136.40) to Paul's forward of that day's
  e-receipt notice. **C-30:** the $0.00 Netlify row is $13.40 (its own invoice number) and now posts, linked.

Dry run **1,046 entries, $240,681.35** (overhead $26,756.49), all build; **876 linked**; link audit clean
(the new far-from-receipt section lists only Shalom's second payment). Lists: differences 119, confirm 76,
no document 99, **list 4: 2 - both for Paul:** the Justice of the Peace $144.00 eviction filing fee for 413
Green Acres (check from Citizens, 09-08, Paul's own forward; on no tab - Green Acres has none), and the Home
Depot refund of 09-08, deck stain -$41.55, against Brushwood's two "Stain" rows of $41.55 (09-06 and 09-07).
**Not pushed to staging** (offline); staging holds pass 9 ($240,639.05).

**C-31 (Paul: "yes add it to green acres").** Dry run **1,047 entries, $240,825.35**, ten property totals
(413 Green Acres $144.00), all build; 877 linked (83.8% of rows, 77.8% of dollars); list 4: 1 (the Brushwood
stain refund). Not pushed (offline).

**Distance to cutover, as of 2026-09-21.** Done: every old row posts at Paul's amount or a registered
correction (C-1 … C-31), tied out to the cent on nine staging passes; advances and purchases registered;
list 4 closed. Left, in order: (1) the stain question; (2) list 1, 119 differences ($8.7K of gaps; 23 of
$100+, most already explained by decisions the list does not know - twins, Falcon Creek, Vega, C-7) - one
judgment pass, corrections only where a receipt proves a typed amount; (3) list 2, 76 weak matches ($3.6K, all
under $310) - one judgment pass; list 3, 99 rows with no document ($50.8K, of which $36.9K Paul has accepted)
needs nothing more before Phase 3; (4) item 7, Drive filing: 408 documents still carry a Gmail link, plus the
15 never-read paul@ messages (~$3 of reads) and the `evidence/` folder - needs a good connection and is the
largest single job; (5) cutover day: production writer push and deploy, Newport's settlement date,
`clearBooks` → register properties and advances → the same pass → tie-out → replay of the live receipts held
since 09-11 → `WRITER_URL` back to production → old workbook re-exported, diffed against the 09-17 snapshot
and set read-only.

**List 4 is empty (2026-09-21).** Brushwood stain - Paul: "i used two cans of stain at brushwood and returned
one": three bought, two used, so both $41.55 rows stand (`confirmed_as_is`) and the 09-08 refund is the third
can, never entered. Entries unchanged: 1,047, $240,825.35. Next: list 1 (differences), then list 2.

## 41 · Differences list, first offline pass: the 22 receipts whose rows exceed the receipt (2026-09-21)

- **Explained, nothing to do:** Waxahachie Glass (the second row is C-7's drop; list 1 does not know drops);
  Amazon 08-25 - the row $113.58 is the order (subtotal $104.92 + tax), the read's $37.90 is only what reached
  the card; eight receipts a cent or two under their rows (Paul's tax-share rounding); two meals 33-50 cents
  over (tip); Floor & Decor 20 cents; McCoy's $44.56 vs a $45.56 row and Window Man $848.68 vs an $858.68 row
  (a slip or a tip - under the $100 bar, left as typed).
- **The link audit's one standing flag is gone:** the Uber Travel row of 06-03 ($113.98) now carries Uber's
  final receipt with the tip; the old poller's id link pointed at the $94.98 pre-tip receipt.
- **Near-amount tolerance capped at 10% of the row** (`migration-compare.py`): $2 of slack had linked a $4.28
  row to a $2.84 receipt nine days away and an $8.63 row to a $6.68 one. Four such links dropped, read one by
  one; the Threaded Rod row of 02-28 ($2.48) is relinked by hand to that day's only receipt, $2.84 (digits
  transposed).
- **Home Depot 02-19, $390.12 (d3b6197026) - the receipt the handoff flagged - untangled.** The read itemised
  all twelve lines. Two rows on it belonged elsewhere (Light Bulbs $55.14 → the $178.48 receipt, Closet Light
  $32.44 → the $108.15 receipt, each listing that item); four rows that are its items were not on it (Wire
  Connectors $11.70, Saw Blade $54.09, Utility Blades $4.28 of $4.31, and the "Adjustable Square" $12.96 - the
  Empire rafter square, which had sat on a 02-17 receipt whose $12.96 line is a tub drain wrench). Now twelve
  items = ten rows + the two switch lines typed as one: $390.11 of $390.12.

Amounts and ids unchanged (1,047 entries, $240,825.35); **878 linked**; link audit: both sections clean
(section one now 0). Lists: differences 114, confirm 80, no document 94, list 4: 0. Not pushed (offline).

## 42 · Differences list closed out offline (2026-09-21): 114 → 0, and 22 more rows linked

Every receipt whose total differs from its rows now has a recorded reason under `differences_settled` in
`paul-answers.json` (new key; `migration-rows.py` takes them off list 1). **No typed amount was changed** -
nothing on the list contradicts a row by $100 or more.

| | receipts | |
|---|---:|---|
| explained | 22 | twin copies of one invoice (Falcon Creek 1372, 1390), registered corrections (C-7, C-25), Vega's Zelle, Paul's handwritten logs, tips, small slips left as typed (Window Man $10, 50Floor $20, McCoy's $1) |
| rounding | 14 | within five cents - Paul's per-item tax share |
| drinks and snacks | 7 | left out on purpose (D-028, amended) |
| payment fees | 3 | City of Ovilla $1.72, county records 30 cents twice |
| **parked for Phase 3** | 66 | the receipt lists items Paul did not enter - returned, left out or personal; the card statement shows the purchase and any refund |
| nine of those, re-read | | the day's unlinked rows were placed on them first (below), which explains two to the cent |

**Links gained (899 linked, 85.9% of rows):** a systematic check for rows sitting on a receipt that does not
list them while a neighbouring receipt does found none beyond §41. The two VistaPrint rows of 06-21 ($170.99,
$147.69) are the two items of the 06-21 order with tax (157.96 and 136.43 x 1.0825) - relinked to that order,
a never-read paul@ message; its $52.98 shipping is in neither row (under the bar). The Granite bubbler row
($1.87) joins the 05-30 receipt. **19 rows on nine vendor-days** linked by the 09-18 rule "the only
same-vendor receipt of that day, with room for the row": Lowe's 03-13 (Grout - the receipt now explained to
the cent), Home Depot 02-20 (Shark Bite connector - to the cent with its twin), Lowe's 02-03 (one of two
shower niches), Home Depot 09-06 (the second can of stain: the receipt's line is two cans), Home Depot 03-22
(five rows), Lowe's 03-21, 02-10, Home Depot 07-01, 06-26. None lost; link audit clean in both sections.

Lists now: **differences 0, in mail not in the books 0**, confirm the match 63, no document 90 (of which
Paul has accepted $36.9K of contractor checks and cash). Amounts and ids unchanged: 1,047 entries,
$240,825.35. Not pushed (offline); staging holds pass 9.

## 43 · Confirm list closed out offline (2026-09-21): every weak candidate linked or refused by name

All rows under $310, decided by judgment as agreed on 09-18, each decision recorded in `paul-answers.json`:
- **Linked, 20 rows:** same vendor, same day (±1), and the candidate receipt still had room for the row after
  the rows already on it (the read grouped its items, so the line cannot be shown one to one). One of them
  shows a slip: Home Depot 04-10 receipt $161.28, "Misc Supplies" row $151.28 - exactly $10.00 apart; under the
  $100 bar, left as typed.
- **Refused, per document (rule 4):** the candidate is another vendor's (Julio → CoreLogic, Energy Texas →
  Atmos, Waxahachie Water → Central States); a refund slip offered for a purchase row; more than three days
  away at a different amount; or a receipt other rows already explain in full (18). Duplicate refusals that
  had piled up in `no_link` were removed (191 → 140, then + 18).
- Six receipts that gained a row and still show a remainder joined `differences_settled` (parked, D-028).

**The lists are done:** differences 0 · in mail, not in the books 0 · confirm 3 (the three duplicate rows
Paul dropped - C-9 x2, C-17 - which the list still shows because it is built before drops) · no document
128 rows, **$51,426.24**, of which $36,880 Paul accepted on 09-18 (Juan Garcia 4 x $7,000, Salvador Campos,
the Mesa checks); the rest is cash labor (Julio, Mariana), the second 50Floor charge ($1,319) and small Home
Depot rows - all proven, or not, from the bank and card statements in Phase 3.

**Numbers:** 1,047 entries, $240,825.35, unchanged; **919 linked - 87.8% of rows, 78.6% of dollars**; link
audit clean in both sections. Not pushed (offline); staging holds pass 9.

**C-32 (Paul: "match the receipts/invoices for these").** Window Man → $848.68, Home Depot 04-10 → $161.28,
McCoy's → $44.56 on their held tabs; Granite's 50Floor $20.00 on Cost Recapture (the tab is closed). Pipeline
rerun from the matcher: those three amounts and the one new line are the only changes, links unmoved. Dry run
**1,048 entries, $240,844.35**, all build; 920 linked; link audit clean. Not pushed (offline).

## 44 · End of 2026-09-21: pushed to staging, docs and handoff current

`clasp` had expired (invalid_grant / invalid_rapt); Paul ran `npx clasp login`. The writer and the
1,048-entry `MigrationData.gs` were pushed to the STAGING project and **verified by pulling the project back
and comparing byte for byte** (Code, Menu, lib, MigrationData identical; 1,048 txn ids). Not yet run: staging
still holds pass 9 ($240,639.05). `CLAUDE.md`'s status block was rewritten to the current state and
`HANDOFF-2026-09-21.md` is the prompt for the next session: one Run + tie-out, then item 7 (Drive filing, with
`evidence/`), then cutover day.

## 45 · Staging pass 10, 2026-09-21 12:05 CT - the finished lists, tied out; item 7 built

The staging project was pulled and compared byte for byte with the repo (writer, `MigrationData.gs`, 1,048
txn ids) minutes before Paul ran `migrationRunStaging`, so no push race this time. Tie-out from the
`books-cache` snapshots (Journal fetched 12:05:55 CT, all lines posted 12:05:17), two paths:

1. `scripts/migration-journal-tieout.py` (new; the ad-hoc check of passes 1-9 made a script, proven first
   against pass 9, which it reproduced at $240,639.05 with C-29 … C-32 as the only differences): **1,048
   entries, $240,844.35, $0.00 on all ten properties** (Ashburne $177,489.44, overhead $26,756.49, Granite
   $12,204.87, Mesa $9,648.00, Bowling Green $4,807.93, Sparkling $3,179.78, Newport $3,089.17, Brushwood
   $1,916.80, Cost Recapture $1,607.87, Green Acres $144.00); txn ids identical to `rows/entries.json`; per
   txn, amount, date, property, payee, account and `doc_url` all equal the dry run - 0 differences; every txn
   balanced, debits = credits ($2,302,255.27); **920 linked**; 33 advances, none orphaned.
2. `scripts/migration-audit-indep.py` re-parse of the xlsx vs the Journal on date + amount: 1,006 of the
   1,027 numeric old cells match; the 21 left on the old side are C-3, C-5 … C-9, C-12, C-15, C-17, C-18,
   C-20, C-27, C-29, C-30, C-32 and two cells that are not rows (Granite's TXU account number, Sparkling's
   J34 `=SUM`); the 42 on the new side are those corrections at their new date or amount, the additions
   (C-10, C-11, C-16, C-19, C-21 … C-26, C-28, C-31, C-32's Cost Recapture line) and the four rows of the
   old Cost Recapture tab. Every difference is a register line. `rows/journal-tieout.json` records it.

**Staging = the dry run.** Open item 1 is closed.

**Item 7, Drive filing - built, not run.** Measured: 410 linked documents carry a Gmail link; **394 have
their envelope and bytes in the `books-docs` store** (180 with attachments - 212 files, 188 MB; 214 are
body-only mail), **16 were never read** (no bytes anywhere but Gmail), and `evidence/` holds 12 files.
`scripts/migration-file-docs.mjs` reuses the live path - bytes from `att/<docId>/<i>`, the writer's
`storeDocument`, `driveFileName`, folder `[year, property]` of the document's first entry - and files every
document's email as a `.txt` as well (subject, sender, Paul's note above a forward: for body-only mail and
cash labor that text is the document); `evidence/` goes to `Migration evidence/`. It writes
`data/migration/2026-09-17/drive-filing.json` (docId or `EVIDENCE:<file>` → Drive URL) after every document
and skips what is there, so it can stop and resume; it refuses any writer but staging's without
`--production`. `migration-rows.py` takes a filed document's Drive URL from that map - checked: with no map
the dry run is byte-identical; with one, only `doc_url` / `link_kind` change (ids and amounts never depend
on the link). Drive file URLs survive a move, so the folders can be dragged under the production root after
cutover without touching the Journal. After the filing: rerun from `migration-rows.py`, push, one more Run
and tie-out (links only).

**How item 7 runs (found the same hour).** `WRITER_URL` in Netlify's production context is the staging
deployment, as documented (the default `env:get` context still returns the dormant 09-14 standalone writer -
always pass `--context production`). `WRITER_SECRET` is a masked secret: the CLI returns asterisks, by
design, so the job cannot be started from a Claude session. Paul starts it in his own Terminal with the
secret typed at a hidden prompt (the script's header has the line; the value is Script property
`WRITER_SECRET` of the staging project). The script pings the writer first, so a wrong secret files nothing;
a document that fails is logged and retried on the next run. Bytes were checked end to end: `att/
gm-19b9ef373c8332d3/0` comes back from the store as 3,033,538 bytes of JPEG, the envelope's size. About 45
minutes, unattended. Not yet run; nothing was filed by the test (it stopped at the guard).

## 46 · Item 7 under way (2026-09-21 midday): filing running, the 15 paul@ messages read

**Filing.** Paul started `migration-file-docs.mjs` in his own Terminal at 12:22 CT (secret typed at the
hidden prompt). The 12 `evidence/` files went first (`Migration evidence/`), then the documents in docId
order. Pace measured: about 1.7 documents a minute, not the 8-9 estimated - a 3 MB photo is ~7 s out of the
store and ~15 s into Apps Script - so the 394 take about four hours, unattended and resumable.
**Known defect, harmless:** about one `storeDocument` reply in twelve comes back `ok` without `url` /
`fileId` although the file IS created in Drive (checked: `2026-01-12 Shell 46.14.jpeg`, id `11m30TBJ…`,
is in `2026/OVERHEAD`). Cause not found from here (the writer's code always returns both). The map keeps the
file's name; `migration-rows.py` leaves such an entry on its Gmail link; after the run each missing URL is
recovered by looking the exact name up in Drive (read-only search) and written into `drive-filing.json`.

**The 16 never-read messages (the handoff said 17).** Paul: "yes" to reading them (~$3.40). 15 are paul@
mail: list `books-replay-paul-unread-2026-09-21.json`, uploaded to Drive by Paul as `books-replay-paul.json`
(the old one-message file renamed `-noread-DONE`; Claude may rename in Drive but not create), one Run of
`replayIds` in the paul@ poller: sent=15, failed=0. All 15 read within ten minutes: 11 pending, 4 dismissed,
**none posted** - staging's Journal is untouched. The 16th (`gm-19c3e95a4b9ed901`, Amazon drawer pulls
$249.97) is a pvb421@ message forwarded to 104ashburne@gmail.com and needs that mailbox's project - open.
Their envelopes joined `.cache/envelopes/env/` (983). Pipeline rerun from the matcher, links diffed against
the last commit (rule 3): **no link lost, moved or gained; ids, amounts, dates, payers identical; 1,048
entries, $240,844.35, all build; link audit clean in both sections.** What the reads did change, decided and
recorded in `paul-answers.json`:
- **Refused, per document (4):** the 07-01 PayPal receipt is Bowling Green's fee (C-19) - the matcher offered
  it to Sparkling's fee row (strong) and Granite's (weak); a $500 Zelle notification offered to Carlos's
  $1,500 check and his $220 soffit row.
- **Differences settled (2):** VistaPrint 06-21 (receipt $369.08, rows $318.68 - shipping, known since §42);
  Atlas 03-30 ($2,152.00 received, row $2,177.00 - the $25 wire fee of §26).
- **Accounts (new key `account`, keyed by the old row, beats a hesitant read):** Atlas's 03-29 payment stays
  1020 with the other four payments of invoice 16097 (the read guessed 1130 from the monthly service rows);
  the four $500 "Siding Install" Zelles to Carlos are all 1020 (three reads said labor, one materials).
  Two accounts follow their new read under D-029: Wayfair tub and faucet, Lowe's ceiling fans 1030 → 1040.
- Linked: **921** - the Vega labor entry (C-26) now carries its Zelle screenshot from Drive.
The dry run in `rows/` holds the Drive links filed so far and is rebuilt when the filing ends; nothing is
pushed to staging until then.

## 47 · 881 Newport has NOT closed - under contract (Paul, 2026-09-21); only Granite and Sparkling are sold

Looking for Newport's settlement date (owed since 09-17) in the listed mail before asking: Bison Title file
#260910 - contract receipted 09-03, again 09-04 "now that the earnest money has been received", title
commitment and survey question 09-09, Paul paying the $375.00 HOA resale fee that day (it is the Newport
tab's "Neighborhood Management" row) - and the tab carries rows to 09-11. A sale in progress, not a closed
one. Paul: **"not closed. under contact."** The same error as Ashburne's (§32, D-033's correction), from the
same source: the old `Sales` tab lists Newport ($28,131.88) and Ashburne ($124,872.69) under "Income from
house sales" next to Granite, its holdback and Sparkling - those two figures are projections. **Sold =
1616 Granite and 280 Sparkling only** (the two tabs named RECONCILED).

Changed: the two Newport lines that sat on Cost Recapture "because the tab is closed" - C-19's listing fee
$299.00 (now dated 07-13, the invoice) and C-25's Falcon Creek $55.00 (07-30, like its Bowling Green twin) -
are rows on Newport's own tab, as C-22 did for Ashburne; `paul-answers.json` `add` 10 and 21 edited in place
(two txn ids change with their descriptions). The Properties note in `migrationRegisterProperties` says
under contract. Pipeline rerun from the matcher: **1,048 entries, $240,844.35, unchanged**; 881 Newport
$3,089.17 → **$3,443.17**, Cost Recapture $1,607.87 → **$1,253.87**; no link moved; all build; link audit
clean. No settlement date is owed for cutover any more: Newport closes in the new books (Phase 5).
For Phase 5: the Sales tab's $243,740.64 is not five past sales; the closed ones are Granite $28,489.22,
its lien holdback $30,000.00 and Sparkling $32,246.85.

## 48 · Was pvb421@ swept? Yes as a listing, never as reads - and four bounced forwards (2026-09-21)

Claude told Paul "no pvb421@ mail was ever read by the bookkeeper" from one grep; Paul: "you were supposed to
read pvb421@gmail.com as part of your email sweep. are you sure?" Checked against the listings and the 983
stored reads:
- **Swept: yes.** All 4,253 pvb421 messages were listed on 09-17 (sender, subject, amounts, first lines) and
  that listing is part of every "is it anywhere in mail" search - it is how the drawer-pulls order was found
  on 09-18. **Read through the bookkeeper: 0 of them**, by §10's design (a personal mailbox; "a few dozen by
  id" was planned and never run). 391 of the 955 mail reads are pvb421 *as sender* - his forwards, read where
  they arrived.
- **§10's claim tested:** of 500 pvb421 messages sent to a business address, 485 have a same-subject, same-day
  counterpart in the paul@ / properties@ listings. Of the 15 that do not, four are Amazon order forwards to
  104ashburne@gmail.com that **bounced** (a "Delivery Status Notification (Failure)" follows each within
  minutes: 02-08, 02-22 x2, 02-24) - they exist only in pvb421's Sent mail. The rest are tests, a screenshot,
  "cooktop hole", a "Return" note.
- The four: drawer pulls $249.97 (linked on 09-18, the 16th never-read message); **"60W Candelabra Light
  Bulbs" $10.81 = the Ashburne row "Light Bulbs" of 02-24, a no-document row until now - linked (922
  linked)**; six black ceiling fans $283.74 and two Sofucor fans $246.78 - on no tab by total or parts, with
  Amazon fan-return confirmations in pvb421 (02-19, 03-04): parked for the card statement (`mail_settled`).
- Every row still without a document (127) was searched again in the pvb421 listing by amount within two
  cents and ten days: 26 hits, all coincidences of round amounts (Julio's $200 against a TikTok order) but
  the light bulbs.
Amounts and ids unchanged: 1,048 entries, $240,844.35; link audit clean. Two documents now wait on a read
from pvb421: `gm-19c3e95a4b9ed901` and `gm-19c8730790dd20df`.

## 49 · Item 7 done; staging pass 11 ties out with every link on Drive (2026-09-21, 15:32 CT)

**Filing finished.** First pass 389 documents + the 12 `evidence/` files (5 failed on a non-JSON reply from
Apps Script, 16 replies came back without their link - all 16 recovered by exact name from Drive, the twin
Falcon Creek 1390 file told apart by the id already in the map). Paul forwarded the two bounced pvb421 orders
to receipts@ (read, pending, nothing posted; the drawer-pulls and light-bulbs rows name those copies). Second
pass: 22 documents, 0 failed, 0 missing links. **`drive-filing.json`: 423 keys, 636 files, 636 distinct file
ids. All 922 linked entries carry a Drive link; none carries a Gmail link.** Folders `2026/<property>` and
`Migration evidence/` under "Recast Books STAGING" (they can be dragged under the production root after
cutover; file links survive a move). The repo's `evidence/` is no longer the only copy.

**Pass 11.** Pushed and verified by pull (byte-identical, 1,048 ids, no `mail.google.com` in
`MigrationData.gs`), then Paul's Run: `entries=1048 already=0 posted=1048 left=0 - tabs rebuilt`.
Path 1 (`migration-journal-tieout.py`, exit 0): **1,048 entries, $240,844.35, $0.00 on all ten properties**
(Newport $3,443.17 and Cost Recapture $1,253.87 after §47); ids, amounts, dates, properties, payees, accounts
and `doc_url` identical to the dry run; debits = credits ($2,302,255.27); **922 linked, all on Drive**; 33
advances, none orphaned; Newport's Properties note reads under contract. Path 2 (independent re-parse):
1,005 of 1,027 old cells match; every residual is a register line - pass 10's plus C-33 on both sides.
`rows/journal-tieout.json` records it. **Staging = the dry run. Items 1 and 2 of the handoff are closed.**

Left before cutover (`docs/cutover-runbook.md` §0): the rehearsal Run of `migrationRegisterAdvances` in
staging (one rebuild per property - pushed, never run), then cutover day.

## 50 · Advances rehearsal in staging (2026-09-21, 15:40-15:47 CT) - the last untried cutover step

Paul ran `migrationRegisterAdvances` (one tab rebuild per property instead of one per advance; pushed on
09-18, never run). Log: `RESET advances: 66 Journal line(s) removed`, 33 lines `-> adv-manual-…`, none FAILED,
eight tabs rebuilt; **7 min 34 s** (the old way: 14 min) - registering is ~11 s an advance, the rebuilds ~10 s
each; inside Workspace's 30-minute limit. Tie-out from the snapshot fetched 15:55:26 CT: 33 advances, none
orphaned, 29 open and 4 repaid (Granite x3, Sparkling), account 1000 = **$1,863,647.50**; the migration lane
untouched - 1,048 entries, $240,844.35, $0.00 on all ten, ids and links identical, 922 linked, debits =
credits ($2,302,255.27), `migration-journal-tieout.py` exit 0. Every step of `docs/cutover-runbook.md` has
now run in staging; §0 of the runbook is all checked but the day's own items (fresh `clasp login`, tests).

## 51 · CUTOVER, 2026-09-21: the real Journal is born in one pass and ties out on both paths

Run from `docs/cutover-runbook.md`, one step at a time with Paul.
1. **Freeze and diff.** Paul stopped typing and downloaded the old workbook (`data/migration/
   cutover-2026-09-21/`). Cell by cell against the 09-17 snapshot: 130 changed cells - interest and summary
   formulas, Paul's two fixes already in the migration (`450,00` → 450.00; "Paul Paid" unticked on Lupe's
   $160), and three rows written by the OLD poller: the live Uber $33.30 of 09-18 (live lane) and **two
   duplicates Claude caused** - the pvb421 orders forwarded to receipts@ for filing were also itemised by the
   old poller into RECAST BIZ / Materials ($249.98, $10.81; both already on the Ashburne tab). Not migrated;
   Paul may delete them. **Delta to migrate: none.**
2. **Backup.** "Recast Books BACKUP 2026-09-21" (Drive id `11gNaxtT…M1kM`), confirmed before anything changed.
3. **Production writer** (Paul: "go"): pushed with `MigrationData.gs`, verified by pull (byte-identical, 1,048
   ids), `clasp deploy -i AKfycbxNisU…` → @2. Production had been on the 09-16 code - no migration functions.
4. **The pass, Paul's Runs in the production editor:** `clearBooks` behind `CLEAR_CONFIRM` - `CLEARED Journal:
   96 row(s) removed from "Recast Books"`; `migrationRegisterProperties` (10 created, Granite updated);
   `migrationRegisterAdvances` (33, none failed, 6 min); `migrationPostRows` - **`entries=1048 already=0
   posted=1048 left=0 - tabs rebuilt`**.
5. **Flip before the tie-out.** `WRITER_SECRET` is the same in both projects (Paul compared them); `WRITER_URL`
   set to the production deployment (`--context production`), `npm run deploy` (Paul). The cache served the real
   workbook from 16:42 CT.
6. **Tie-out on production.** Path 1 (`migration-journal-tieout.py`, exit 0): **1,048 entries, $240,844.35,
   $0.00 on all ten properties**, ids / amounts / dates / payees / accounts / links identical to the dry run,
   debits = credits ($2,302,255.27), **922 linked, every link a Drive file**, 33 advances, none orphaned, account
   1000 = $1,863,647.50. Every migration line equals staging pass 11 on eleven fields. Path 2 (independent
   re-parse): every residual a register line, nothing unexplained. `rows/journal-tieout.json` holds both.
7. **Cleaned up.** Production pushed again without `MigrationData.gs` (verified by pull), web app → @3.

**Phase 4's expense side is in the real books.** Open after the pass: the held live receipts and the Inbox's
history leftovers (runbook §5), closing the old workbook (§6), and the sale side in Phase 5 (D-033).

## 52 · Day after cutover (2026-09-22): the old poller switched off; the doGet misfire found and fixed

- **Two digests arrived** ("Bookkeeper | … filed" = old Recast-site system; "Books | … posted | N to review" =
  the new one) with different verdicts: the new gate's rails (ceiling, PAYER_UNKNOWN, meals) and its reading
  of Paul's note, plus 16 of 20 live receipts in error on the new side. Paul: paying twice is not acceptable.
  **With Paul's permission the old Receipts Bookkeeper project's two triggers (`pollReceipts` every 15 min,
  `dailySummary` 3 AM) were deleted through his signed-in browser** (project `1c7Y3GZ…Hei8`, Triggers page,
  2026-09-22 ~09:00 PT). No code in `../Recast-site/` was touched. The old system no longer reads mail or
  sends a digest; only "Books |" arrives now.
- **The misfire, root cause of the 16 errors and of the filing's missing links (§46):** under concurrent
  calls the follow-up of the writer's POST 302 lands on `doGet`, whose body is `{ok:true, service, version}`
  - "ok" with none of the action's fields. `lib/writer-client.mjs` now names that reply `REDIRECT_MISFIRE`
  (any non-ping reply carrying `service`), retries reads up to four times on any lost reply, never repeats
  a write. 397 tests; deployed by Paul 2026-09-22 ~08:50 PT. The 16 errored receipts are stored and wait
  for the warm job's automatic retry (no stored read, < 2 retries) or a Reprocess in the Inbox.

## 53 · The 104 Ashburne tab rebuilt to the old layout and reconciled (2026-09-22)

Paul: "the new tab is a disaster … how did this pass your tie out?" - the tie-out checked the Journal, never
the rendered tab. Found and fixed in the writer, five pushes, each verified by pull: (1) the heavy template's
trade blocks ran across the helper columns AI:AW, so every interest formula multiplied Pool receipts
(#VALUE!, $45,914 interest on a $200 draw); helpers now sit past the grid. (2) The light template's spare-
column delete removed the heavy tab's Interest column. (3) The summary and Dennis blocks now follow the old
tab, as Paul drew them: Rehab Total; Total Project Cost (All in) = purchase P+I, cash advance P+I, property
tax paid, prorated (from the amount paid, the old method); Profit Breakdown with typed Agent % and
Concession; Dennis Payout = P+I, cash P+I, 3% commission; cash draws carry their Advances memo; "P+I" on the
schedule heads. (4) A block holds the lines with its trade name - insurance and utilities had all been
pushed under Utilities, the property tax with them. (5) No Gas/Truck/Trailer, Property Tax or (no trade)
blocks. **Reconciled against today's export of the old tab:** purchase, 20 draws, both interest figures and
the tax paid identical to the cent; prorated tax $11,595.21 both ways (the old typed $11,639.13 is a day
older); 14 of 21 blocks identical; the seven that differ are C-7, C-9, C-10, C-15, C-18, C-22, C-26, C-29,
C-32 and the fuel block's move to overhead, summing to the $3,525.64 difference exactly (465 rows,
$161,458.19 vs 510 rows, $164,983.83).

## 54 · Every property tab reconciled to the old workbook (2026-09-22)

Old tab rows (today's export, independent parser) vs the new tab's source lines, then the live tabs read
back after `rebuildAllPropertyTabs`. Brushwood, Mesa, Sparkling, Granite, White Rock: identical to the cent
(Sparkling's `=SUM` cell and Granite's TXU account number are not rows). Newport +$354.00 (C-19, C-25 on its
tab since §47), Bowling Green +$1,361.28 (C-10, C-19, C-20, C-21, C-25, C-32), Green Acres $144.00 (C-31),
Cost Recapture $1,253.87 (C-16, C-25, C-32, C-10 less the Newport lines). **One display gap found and fixed:**
the light template's blocks and totals filtered by cost class and left the Selling class out (listing fees
1330, HOA resale 1310 - $2,769.29 across five tabs, all in the Journal, none on a tab); Selling now shows
under Rehab Costs as the old tabs had it. Live tabs after the rebuild: Ashburne $161,458.19, Newport
$3,443.17, Brushwood $1,916.80, Mesa $9,648.00, Bowling Green $4,807.93, Granite $12,204.87 - each equal to
its Journal lines.

## 55 · Inbox history leftovers dismissed (2026-09-22) - runbook step 15

The docs store held 1,025 envelopes, 405 `pending`. Read directly through `@netlify/blobs` with the CLI's
login (`scripts/inbox-leftovers.mjs`, read-only without `--dismiss`); each pending envelope was explained
against the migration data or left alone. **387 dismissed on Paul's yes** ("if you have accounted for them
and recommend i dismiss them then yes"), each with a note naming this section and its reason:

| Group | Count | Evidence |
|---|---|---|
| Row in the Journal | 265 | its docId is on a migration entry (`rows/entries.json`) whose txn_id is on the live Journal snapshot - 263 checked one by one (one, gm-19d405df…, is the Waxahachie Glass twin Paul dropped in C-7; the other $518.78 row is there), plus the two below |
| Recorded decision | 75 | its docId is in `paul-answers.json` (mail_settled or no_link; 7 are the "PARKED for Phase 3" answers of §40 - the decision stays recorded there, the envelope and its read stay in the store) |
| Second copy of a linked document | 36 | `comparison/B-by-match.csv` "twin of <id>" where <id> carries the Journal link (33) or a recorded decision (3) |
| By hand | 4 | Lowe's 02-19 $1,478.59 (its four rows link to gm-19c9b3740b0…) and Flexitions #8246 $653.34 (the row links to gm-19d02f0310a…) - same order, the link went to the other copy; Garcia Home Repair $1,000 and $1,200 - Paul 2026-09-18 (§16): errors, never post |
| Bookkeeper read "dismiss", held only for confidence | 7 | Uber personal ride 03-18 $14.13, Waxahachie Glass statement, three trustee sale receipts (White Rock $369,000 ×2, Sparkling $393,701 - purchases are registered, not receipts), two empty "Reimbursed" notes |

**Two received after the 09-17 cutoff were included on purpose:** the pvb421 Amazon orders forwarded on
09-21 for filing ($249.98 drawer slides, $10.81 bulbs) - their rows are on the Ashburne tab through the
migration (§51 step 1); approving them in the Inbox would have posted them twice.

**Left pending, on purpose - 18:** (a) **12 parked** Home Depot / Lowe's receipts of 01-11 … 03-02 (about
$2,490; the tender line on the ones read is a Discover card ending 3746, which is on no account) whose totals
are on no old tab - searched `entries.json` within two cents and by vendor-day - and which carry no recorded
decision (they never reached list 4: the read's verdict was hold, not post). Paul's stopping rule (§40)
parks them for the Phase 3 statements. (b) **6 live cards** for Paul: two Uber rides of 09-19, two Anthropic
receipts, Bison gift cards, Alaska Airlines.

After the run the store reads `pending 18` = 12 parked + 6 live; one dismissed envelope read back carries the
note (`review.by = "workbook"`, the poller-secret path). Nothing on the Journal or any tab changed.

## 56 · The properties@ poller switched on (2026-09-22) - and the first reads refused

**Set up (Paul, one step at a time):** signed in as properties@, a new project "Recast Books Poller —
properties" shared with paul@ as editor; pushed from `apps-script/poller/` with `clasp push -f -P
.clasp-properties.json` (git-ignored copy of `.clasp.json` with script id `1k2htSsuL2JV…RoTZ`), pulled back into a
scratch folder and `cmp`-identical; script properties set by hand before `setup` (`MAILBOX=properties`,
`POLLER_SECRET` = the writer's, `BOOKS_UPLOAD_URL`, `START_DATE=2026-09-17`); `setup` run 09:24 PT: "POLLER_SECRET
already set", one `pollBooks` trigger, no digest. The 09-17 listing project "Recast Books Poller (properties)"
(`1jbU7…`) has no triggers (Paul checked) and is left as is. Ids in `phase0-spec.md` §10.

**First run, 09:52 PT:** `books-cache` key `mailbox/labels` (absent until then - the instance had never run)
now holds 10 labels: 469 Brushwood, 280 Sparkling, 1616 Granite, 104 Ashburne, 206 Whiterock, 881Newport,
136 Bowling Green, 366 Mesa, 200 Janice, 413 Green Acres - every one normalises to a registered Properties
name (all ten rows are `held`; Granite and Sparkling are sold but stay `held` until Phase 5's sell wizard).
Five messages since 09-17 uploaded, all Paul's forwards of 09-21: Energy Texas $559.34 and Farmers
Insurance and Berrett Pest Control (104 Ashburne), Central States Water and a payment reminder (366 Mesa).

**All five reads came back as holds with no read:** `stop_reason: "refusal"`, `stop_details.category:
"reasoning_extraction"`, at the turn where the model would call `decide` (after its ledger and document
lookups). No fresh read had run since the morning deploy (§52's 12 "reads" at 14:16Z were re-posts from
stored reads, $0); the change that went out with it described the new `checked` field as **"Your working:
what you zoomed, reconciled, looked up…"** - a request for the model's reasoning, which is what that
classifier answers. Fix (commit 32398fa, 398 tests): `checked` is "the verification record for the
reviewer" (tool description and prompt), and every bookkeeper call now goes through `beta.messages` with
`betas: ["server-side-fallback-2026-07-01"], fallbacks: "default"` - a refusal re-runs the same request on
a fallback model inside the call; a fallback-served turn is written to the transcript. Deployed by Paul
10:0x PT. **Verified:** the Energy Texas bill re-read (reprocess, poller secret) on the normal model, no
fallback: verdict post, $559.34, 104 Ashburne, account 1120 - held by the gate for Paul (OVER_CEILING,
PAYER_UNKNOWN: the bill is set for auto pay on 10-05). No Journal twin (last Energy Texas row 09-03,
$484.43). The other four were re-read the same way.

## 57 · The old books closed; the two "lost links" (2026-09-22) - runbook steps 16-18, handoff item 4

**Old workbook (runbook §6).** Paul deleted the two duplicate Materials cells blocks the old poller wrote
on 09-21 (RECAST BIZ H5:L6 - Amazon.com 02-08 $249.98 Ravinte drawer pulls, 02-22 $10.81 candelabra
bulbs; both already on the 104 Ashburne tab and migrated from there, §51 step 1 - $260.79 of false
overhead). Share dialog: only paul@ has access (Owner), general access Restricted - nothing to change.
Renamed through the Drive API (metadata only, the content was never touched from here): **"Recast 2026
CLOSED 2026-09-21"** (`1isEbfNK…`); the staging copy is **"Recast Books ARCHIVED (staging, 2026-09-17 to
2026-09-21)"** (`1ElTwWQ4…`; its bound writer and web-app deployment stay dormant). Step 17 (dragging
the staging Drive folders into "Recast Books") not done - optional, Paul's call.

**Handoff item 4 - the two Journal lines "without their Drive link":**
- **Anthropic $13.06** (`receipt-20260917-9b8fac90fc67`): the line already carries its link - the 14:25Z
  re-post filed "2026-09-17 Anthropic, PBC 13.06.pdf" (`10o_AcOrE…`, in the 2026/OVERHEAD folder) and
  wrote `doc_url`; only the Inbox card was left in `error` ("Writer returned a non-JSON response" - the
  misfire). Card marked posted with `scripts/mark-posted.mjs` (txn_id + that url). Nothing else needed.
- **Wi-Fi Onboard $8.00** (`receipt-20260918-d5a55533911f`, docId `gm-1a0c5fc63ec8b929`): **not a lost
  link - the email has no attachment.** The live path files attachments only (`storeAttachmentsToDrive`),
  so a body-only email receipt never gets a Drive file and `doc_url` stays empty by design; the misfire
  is not involved. The three "Wi-Fi Onboard (Intelsat) 8.00.txt" files in Drive (04-29, 08-15, 09-09)
  are the migration's, which filed every email as a .txt (`migration-file-docs.mjs`). Berrett Pest
  Control $270.63 of today (§56) is the same class. Open question for Paul: file body-only email
  receipts as .txt on the live path too (one change in ingest), or leave the email as the document.
  The writer has no `setDocUrl` web action (`setDocUrl_` is reached only from the Inbox sidebar's
  approve), so a one-off link on an existing line would also need a small writer action.

## 58 · D-035: no attachment, the email is the receipt (2026-09-22)

Paul, on §57's finding: "file them. if there is no attachment then the email IS the reciept. make a rule."
**Rule (D-035):** `books-upload.mjs` stores a body-only message as its one attachment `email.txt` (subject,
sender, received, mailbox, Gmail link, body - the migration's .txt shape) at upload time, so every filing
path (auto-post, Inbox approve, repost) puts a copy in Drive and the Journal line gets its link with no
other change; the bookkeeper skips `text/plain` attachments (the body is already its prompt). The writer
gained a `setDocUrl` web action (the Inbox sidebar's `setDocUrl_` path) for documents filed after their
entry posted. 400 tests. Writer pushed to production, pulled back identical on 11 files, web app @4; site
deployed by Paul.

**Backfill (`scripts/file-email-receipts.mjs`, writer secret, Paul's Terminal):** Wi-Fi Onboard $8.00 →
`2026/OVERHEAD/2026-09-18 Wi-Fi Onboard (IntelsatAlaska Airlines) 8.00.txt`, doc_url on both lines of
`receipt-20260918-d5a55533911f`. Berrett Pest Control $270.63: the file landed (`2026-09-18 Berrett Pest
Control 270.63.txt`, 17:52:32Z) but the writer's reply came back as a 404 non-JSON page (a lost reply of the
§52 family; writes are never retried), so the link was written on a second run with the known Drive url -
both lines of `receipt-20260918-95eee0b0c78e`. That run split the argument at every "=", so the stored url
ends at `view?usp` (opens the same file; script fixed, Journal left as is).

## 59 · Granite's and Sparkling's advances were 8%, not the registered 9% (2026-09-22)

Building the Phase 5 fixtures, the accrual engine disagreed with both closed tabs' interest. The engine is
not wrong - it reproduces **881 Newport to the cent at 9%** on two independent dates (as of 2026-09-11
$3,799.52 and the cash advance's $31.13, the figures `docs/property-tab-anatomy.md` verified against the
live tab; as of the 09-21 export $4,324.81, the exported value exactly). The rate is the variable:

| Advance | Paid / typed on the old tab | Engine at 8% | Engine at 9% |
|---|---|---|---|
| Granite purchase $279,001, 04-07 → **07-27** | 6,873.90 | **6,882.27** (gap $8.37) | 7,751.35 (gap $877.45) |
| Sparkling purchase $196,850.50, 06-02 → 08-06 | 2,809.57 | **2,810.74** (gap $1.17) | 3,163.64 (gap $354.07) |
| Newport purchase $207,000, 06-29 → 09-21 | 4,324.81 (live formula) | 3,841.35 | **4,324.81** (exact) |

On the closed tabs the interest cells are **typed values, not formulas** - Dennis's agreed figures at closing.
Both match 8% within a few dollars and neither is close to 9%. `Advances.rate_pct` says **9** on all four
Granite / Sparkling rows (registered in the migration, audit §319: "purchases at 9%"), which looks wrong for
these two deals. Nothing posted depends on it - no 1200 interest line exists for any property (D-033 moved
interest to Phase 5) - so a correction is a data edit on four rows, not a void-and-repost.

**Also learned:** Granite closed **07-24** (Bison CD) but interest ran to **07-27**, the day Dennis was
actually repaid, which is what `Advances.repaid_date` already holds. At 07-24 the 8% figure misses by $181.37;
at 07-27 by $8.37. So the sale's settlement date and an advance's repayment date are two different dates and
the wizard must keep them apart - the engine already freezes accrual at `repaid_date`.

**Open for Paul (§60):** were Granite and Sparkling at 8%? Newport is provably 9%. If the rate changed
during the year, which rate applies to the four held properties whose advances also say 9% (136 Bowling
Green, 206 White Rock, 366 Mesa, 469 Brushwood)? Ashburne's 12% is confirmed (D-030/D-032). The remaining
few dollars are what D-015's true-up posts either way: Paul types the agreed figure, the engine's figure sits
beside it, the difference posts once.

**Answered (D-038, 2026-09-22):** Paul - "yes, they were at 8%. i leave it at 9% in case the rate
fluctuates." Granite's three advances and Sparkling's purchase go to 8; the four held properties keep 9 as a
deliberate high-side forecast buffer. `lib/sale.mjs`'s fixtures already use 8% for the two closed deals, and
the true-up is then $7.83 and $1.17 instead of $877.45 and $354.07.


## 60 · Phase 5 built and both closed sales posted (2026-09-22)

The sell wizard, end to end, and the two sales that had actually closed are now in the books. Spec:
`docs/phase5-spec.md` (rewritten to Paul's four steps); decisions D-036 … D-039.

**Shape, settled with Paul against two false starts.** He rejected a typed form with the document bolted
on ("this should all be one process ... i want it all in one menu item and dialog") and then set the order
himself: "first step, in the dialog: upload the closing doc. step 2: it extracts info and prepopulates the
input fields. step 3: preview. step 4 close." One menu item, `Sell property…`; the "Rebuild closing tab"
and "Attach closing document…" items were folded into the dialog's closed view, which is also where a late
statement and the escrow holdback are handled.

**Built:** `lib/sale.mjs` (the arithmetic and the order of the seven entries, D-037's share, the
distribution rule that reproduces Paul's own closed tabs), `lib/settlement.mjs` (the prompt, a strict tool
and the validation), `/api/settlement` + `/api/settlement-bg` (the read as a background job - a synchronous
function is cut off at ten seconds and a three-page disclosure takes a minute or two; Paul's first real
document came back 504), `Sell.html` (four steps), and in the writer `sellContext` / `sellReadDocument` /
`sellPreview` / `sellPost` / `sellUpdate` / `sellHoldback`, `propertyBalances_`, `writeClosingTab_`,
`closingFromJournal_`. 453 tests, both real statements as fixtures.

**How the property tab and the closing tab relate (Paul):** no new tab per sale - the property's own tab
becomes the closing statement, which is what the old workbook already did ("1616 Granite RECONCILED"). While
the layout is being proved it is written beside the live tab as `<property> - Closing`
(`CLOSING_TAB_IN_PLACE`); flip the constant when he signs it off. Labels he types on a settlement line or a
cost row survive a rebuild.

**1616 Granite, closed 2026-07-24 (typed from the PDF, before the read existed).** Seven entries, 32 lines.
Cash 347,343.03; project cost 320,821.44; **net profit 109,178.56**; shares 54,589.28 each; paid to Dennis
318,853.51 and **to Paul 28,489.52 - the old tab's figure to the cent**; each partner then owed exactly
30,000.00, which is the escrow holdback split in half. Interest: engine 6,966.43 at 8%, Dennis's agreed
6,958.60, one adjustment of −7.83. **Holdback released 2026-09-11** (three entries, six lines): 1510 is 0.00
and Dennis is paid in full; Paul's draws total 54,589.28, his whole half.

**280 Sparkling, closed 2026-08-06 (read from the PDF by Claude).** The read found the file number, both
sellers, the 50% share, eleven lines with their own wording and an account each, and caught both traps in
that document - the page-1 closing-costs total that would double count, and the "$65.00 of Title Premium"
row that carries no seller-paid amount. Seven entries, 33 lines, **all seven carrying the closing
disclosure**. Cash 263,769.94 (derived: Recast's share of net-to-seller floored, plus the 4,716.82 paid to
it by name - the odd cent went to the co-seller); revenue 275,000.00; **net profit 60,930.09, the old tab's
"Net after closing" exactly**; paid to Paul 32,246.84 against its 32,246.85. Nothing retained, nothing owed.

**The ledger after both:** 2,275 live rows, debits = credits at 4,457,856.90; 4000 = 705,000.00, 5000 =
619,945.68, 1510 = 0.00, 2000 = 0.00, 9010 = 85,054.32. 17 sale entries.

**Corrections and rules this produced:** D-036 (holdback arrived 09-11 split 50/50; 3% of the full price on a
bank deal; no reserve field; Drive only), D-037 (a co-owned deal is recorded at Recast's undivided share -
the co-owner is not a payee), D-038 (Granite and Sparkling were 8%, held properties stay 9% as a buffer),
D-039 (an HOA release is a selling cost: new account **1340**). Also: cash received is derived, never typed;
a statement line shown with no amount is noted rather than flagged.

**Three self-inflicted breakages, and the guard.** Replacing blocks of the writer by text match deleted a
live function twice and duplicated one once, and each time it looked like a rendering bug rather than code
that never ran. Three tests now stand in `writer-gs-lint`: no function declared twice, every menu item names
a function that exists, and every private helper called in the writer is declared somewhere. The second
found a pre-existing duplicate too - `colLetter_`, declared twice in `Code.gs` with different bodies since
before this session (verified equivalent over 1..5000, dead copy removed).

**Open:** the closing tab's layout is still Paul's to sign off (then `CLOSING_TAB_IN_PLACE`); 881 Newport and
104 Ashburne run through the same wizard when they close (Ashburne is the bank deal - 12%, 3% commission, no
profit share); then Phase 3.

## 61 · The heavy tab wrote into its own spacer columns (2026-09-22 evening)

**Reported (Paul):** "look at the 104 ashburne tab. the columns that are supposed to be spacers have
text in them. columns j, o, t, y, ad, ai, an, as, ax, bc, bh, br, bw, cb, cg, cl, cq, cv, da,
something got screwed up. also expenses that i cleared in the inbox did not show up in the 104
ashburne sheet."

**The twenty columns name the bug.** A heavy block is five columns - Payee, Date, Description,
Amount, spacer - from column J, so `10 + i * 5` is J, O, T, Y, AD, AI, AN, AS, AX, BC, BH, BM, BR,
BW, CB, CG, CL, CQ, CV, DA: exactly Paul's list (he skipped BM), and exactly the *first* column of
each block as it is BUILT. It is not the spacer at build time; it becomes the spacer afterwards,
because `setupPropertyTab` finishes with `sh.insertColumnBefore(1)` - the narrow left margin Paul
asked for on 09-15 - which shifts the whole grid one column right. The light template cancelled that
shift by deleting column H first (`sh.deleteColumn(8)`); commit `8b5138b` on the morning of 09-22
made that delete `if (!heavy)` so the heavy tab could keep column H as its Interest column, and from
that moment the heavy tab's net shift was +1 with nothing to cancel it.

`refreshHeavyBlocks_` - which runs after every Journal write that touches the property - still wrote
each block at its **built** column. So after the 09-22 rebuild:
- every new line landed one column left of its header, i.e. in the spacer (Paul's first symptom);
- the four columns under each header kept whatever the rebuild had put there, so nothing posted since
  appeared in a block (his second symptom);
- the block head `=SUM(...)` reads the block's own Amount column, so block totals froze too.

The summary was never affected: Rehab Total and Total Project Cost are SUMPRODUCTs over the Journal.
Every dollar was on the books the whole time - Berrett Pest Control $270.63 (09-22 12:35) and Energy
Texas $559.34 (09-22 16:47) are both in the Journal, tied out.

**Fix.** A block's column is read from its own header in row 4 (`head.indexOf(blk, 9) + 1`), never
recomputed. That is correct before the insert (during the build) and after it, and it also removes a
latent fault: a brand-new trade sorts into `heavyBlocks_` alphabetically ahead of Utilities, which
used to shift every later block's index and would have mis-written them all.

**A second fault the same tab exposed.** Energy Texas $559.34 posted with `trade` null - the model
is right that a utility bill is not a trade, but the heavy tab buckets by trade alone, so the line
belonged to no block and would have stayed invisible even after the column fix. An untraded Holding
line now falls under Utilities, which is where the old tab carried them. Ashburne has exactly one
such line; the other 263 untraded on-tab lines in the Journal are all on light-template properties,
which bucket by cost class and were never affected.

**Checks.** 454 tests, one new: `refreshHeavyBlocks_` must find its column through the header and
must not recompute it (mutation-tested - restoring the old expression fails it). Pushed to the
production writer and verified by `clasp pull` + `cmp`; no `clasp deploy` needed, `doPost` unchanged.

**Paul's one step:** open the 104 Ashburne tab, Recast Books -> Rebuild property tab. The rebuild is
what clears the text already sitting in the spacer columns; typed cells (Sale Price, Agent
Commission %, Concession) survive it.

## 62 · The Inbox card says what to do, and only that (2026-09-23)

Paul, on a card whose bullets were Claude's reasoning: "this is not actionable for me. this needs to be
explicit for the action i need to take. this is still too much." The card he was looking at (Anthropic
$10.49, read 09-17, medium) carried one real flag and six sentences of working - the duplicate check, the
unit-price comparison, the reason for "medium".

**The rule now:** a bullet is something Paul does. Gate reasons become imperatives ("Check the amounts,
then approve or dismiss", "No payer - pick who paid", "Over the auto-file limit - approve it yourself",
"Already posted as <txn> - dismiss it"); the missing-trade flag joins them; a card with no flag at all
still gets "Check it, then approve or dismiss", so the list never comes up empty. Claude's `why` and
`checked` are collapsed together under **Claude's read** - evidence when he wants it, not a wall when he
does not.

That card now reads, in full: **Check the amounts, then approve or dismiss.**

## 63 · Per-item property, and what "no general tools category" turned out to be (2026-09-23)

The card: Home Depot, 104 Ashburne, paid by Paul, four items - a Stanley sawhorse $59.52, an Anvil glass
scraper $5.39, a putty knife $11.89, a 6-in-1 painter's tool $6.47 - every one on **6510 Small tools &
equipment**, an overhead account, under a property. `buildEntry` refuses that combination outright
(OVERHEAD_ON_PROPERTY, D-010), so the card could not have posted as it stood.

Two things were wrong with the card, and neither was the chart of accounts. **6510 is** the general business
tools category; the picker just never said which accounts are the business's and which are a property's.
And property was a per-entry field, so there was no way to send the sawhorse to OVERHEAD and keep the
scraper on Ashburne without dismissing the card and typing it twice.

Fixed together (D-041): property on every item with the entry's select as the "set all" control; Approve
splits into one entry per property; the account picker grouped into Property costs / Business overhead /
Cash, prepaid and other; and a live check that raises "Business account on a property - set 6510 to
OVERHEAD" as he edits - the ingest gate only ever saw the model's first proposal, not his corrections.

**Answered the same day: "tools are overhead" (Paul).** D-010 stands and the chart is unchanged. The prompt
now states it and its consequence - a hardware receipt mixing tools and materials is two entries, tools on
6510 OVERHEAD and materials on 1030 with the property - so the bookkeeper should stop proposing the card
that started this. Not deployed (`npm run deploy` is Paul's step); it rides with the next one.

## 64 · The light property tabs: no commission, a Concession cell, Received split in two (2026-09-23)

Paul, going through 469 Brushwood tab by tab. Four changes, all on the **light** template; 104 Ashburne, the
one Heavy tab, is untouched by every one of them (D-042).

**What the screenshot showed first.** His 469 Brushwood capture already read `Paul Paid (direct)` at row 30
with rows 26 and 31 blank, while the repo at HEAD still wrote `Due to Paul (paid less reimbursed)` and both
commission rows - so the sheet was hand-edited to show the target, and a rebuild would have wiped it. That
settled the shape of the work: put it in the builder, not the sheet.

**1. The commission rows are gone.** `Dennis commission (x% of sale)` off the Dennis payout and
`Less Dennis commission` off Paul's - "he will never charge commission for these". Not a layout preference:
on a partnership property Dennis's return is principal + interest + his 50% share, and a commission was only
ever a bank-deal term. The bank path is untouched - `Properties.dennis_commission_pct`, the heavy tab's own
line, `lib/sale.mjs`'s 1210 entry at closing (D-036) - which is what 104 Ashburne will settle on. The two
block SUMs narrowed with the rows (Dennis `+5` → `+4`, Paul `+3` → `+2`).

**2. `Due to Paul (paid less reimbursed)` → `Paul Paid (direct)`**, the mirror of `Dennis Paid (direct)`
above it. Label only; the value is the same Paul Paid block net (`=G<dueToPaulRow>`).

**3. `Concession (type it here)`** below Closing % in the Profit Breakdown - the cell the heavy tab already
had, blue, kept across rebuilds by the same `readLabelledValue_` prefix match that keeps Sale Price (the read
was hoisted so both templates share it). Net Profit subtracts it as `-ABS(...)`: a seller concession is
always a reduction, and a minus sign typed by hand must not be able to turn a credit into profit. Brushwood's
Profit Breakdown gains a row, so everything below shifts down one - Net Profit 16 → 17, Payouts 20 → 21.

**4. Received split in two.** The question was how to tell an advance from a refund on a **single Journal
row** - a `txn_id` join to find the counter-account is exactly the O(rows²) lookup that stalled the staging
workbook in §38. The answer is row-local: `buildAdvance` (`lib/posting.mjs`) writes payee **`Dennis Little`
on both lines** of every advance, and a refund is a negative cost row carrying its vendor. So:

- `Received (advances)` = the block's debits where `payee = "Dennis Little"`
- `Received (refunds)`  = the block's debits where `payee <> "Dennis Little"`

An **exhaustive partition** by construction, which is the point: a payee the rule does not expect can only
move a line from one row to the other, never out of the block, so the head's SUM and the tie-out are
untouchable by a bad guess. Checked against the migrated books before writing it: all 33 advances are
`Dennis Little`, and all 7 negative-amount rows are vendors - Home Depot (REFUND: Front Door Latch, -$54.09,
paid_from 1401), Floor & Decor, Lowe's, Home Depot ×2, TXU, Anthropic. That Home Depot refund is the
`-$54.09` visible in Brushwood's Recast Account Paid block, which is how the debit-column behaviour was
confirmed from live data rather than assumed: a negative cost row lands as a **debit** to the paying account.

**5. Then one row came back off.** Shipped with all three blocks split, and flagged that the Dennis Paid
(direct) block's advances row was structurally always zero - a direct-paid Dennis cost *is* an advance
(`posting.mjs`), and an advance's own lines are 1401/2030 and 2010, never cost lines. Paul: "you are right.
for Dennis remove the row for 'Received (advances)'". Removed, and its Received formula put back to
unfiltered, so that block cannot lose a row to a payee mismatch either.

Final shape: Paul Paid and Recast Account Paid carry three rows each, Dennis Paid (direct) two. Each split
block grows a row, so on Brushwood the Cash Advances schedule moves from row 20 to 23.

455 tests. `clasp push -f` to the writer; no `clasp deploy` - D-023 moved the `propertyTab` action off
`doPost` into the menu, so nothing reaches `setupPropertyTab` through the web app. **`rebuildAllPropertyTabs`
from the editor is the one step that puts all of it on the ten tabs**, and it rebuilds 104 Ashburne on the
way, which is what clears the spacer-column text left by §61.

`docs/property-tab-anatomy.md` is deliberately NOT updated: it is the 2026-09-11 reading of the **old**
workbook's 881 Newport tab, the reference this system was built to reproduce, not a description of the tabs
the writer generates.

## 65 · What the sale did to the Granite and Sparkling tabs, and the 178.48 it hid (2026-09-23)

Paul, opening 1616 Granite after the day's tab work: *"what are these charges on granite? do they reconcile
with the old sheet? there are no explanations."* Eight rows dated 07/24/2026, no payee, no description:
+12,900.00, +4,133.60, -5,825.46, -3,248.68, -639.83, -4,598.60, -299.00, -12,900.00.

**What they are.** 2026-07-24 is Granite's closing date, so they are its settlement entries. The positives are
the statement's own Selling-class costs; the negatives are the wizard's "project cost released to COGS" entry,
which credits every cost account to zero at the sale. Each negative was matched against the account balance
rebuilt from the migrated rows, and every one ties to the cent: 1020 5,825.46 · 1030 3,248.68 · 1040 639.83 ·
1330 299.00 · 1300 12,900.00 · 1310 4,598.60 (= the 465.00 HOA right-to-sell already on the books plus the
4,133.60 from the statement). The eight rows sum to **-10,477.97**, exactly the Rehab + Selling cost above them
in the same block, so the block nets to zero.

**Why there were no explanations, and the fix.** `lib/sale.mjs` builds the release lines with no line
description, and Granite's settlement lines are blank because it was typed from the PDF before the document
reader existed. Nothing was missing from the books: every one of those rows carries the entry's `memo`
("1616 Granite sale 2026-07-24: project cost released to COGS"). `lineDescription_` now falls back to it,
trimming the `<property> sale <date>: ` prefix - which fixes Granite, Sparkling and every future sale without
writing a single byte to posted history. A backfill was authorised and turned out to be unnecessary.

**No, nothing is being reconciled.** Asked directly whether the numbers were bridging a discrepancy. The
release entry cannot: it debits COGS for the *sum* of the cost accounts and credits each account for *its own
balance*, so it balances by construction, with no difference line. It also cannot hide an error - a cost in
the wrong account is carried straight through. The only plug in the whole wizard is `splitStatement`'s
`rounding_cents`, capped at `max(5, one per statement line)`; past that it throws rather than absorbing.
Granite's one genuine reconciliation is the interest: engine 6,966.43 at 8% against Dennis's agreed 6,958.60,
a -7.83 true-up posted as its own entry.

**Granite's cost, from the migrated rows (all confirmed later by `reportStrandedCosts`):** purchase price plus
the rest of the seller's settlement costs 284,624.37 (derived) · rehab 9,713.97 (1020 5,825.46, 1030 3,248.68,
1040 639.83) · holding 1,726.90 · selling 17,797.60 · Dennis's interest 6,958.60 = **project cost 320,821.44**,
plus Dennis's 54,589.28 share = **375,410.72 released to COGS** against revenue of **430,000.00**, leaving
Paul 54,589.28. Paul's reaction to the rehab figure - *"the house didnt need much rehab"* - is right; it is
mostly carpet, landscaping, a plumbing call and Home Depot smalls.

**"the sum for rehab costs in granite is $178.48. that is WAY off."** It was a residual, not a total: the
block nets cost against release, so a sold property reads ~0 and 178.48 was whatever the release had not
covered. `reportStrandedCosts()` (new editor helper) found it - one entry,
`receipt-20260219-ffef9418064c-629c`, posted **2026-09-22 17:31:34**, one hour and forty-nine minutes after
the sale posted at 15:42:43. Its balances also confirmed every derived figure above: 4000 -430,000.00,
5000 375,410.72, 9010 54,589.28; **280 Sparkling was clean.**

**It was a duplicate on the wrong property, not a late charge.** Both its lines already exist in the books,
migrated onto **104 Ashburne**: 2026-02-19 Home Depot "Floor Protection" 123.34 (1030) and "Light Bulbs" 55.14
(1040), 178.48 together. And it cannot be Granite's at all - Granite's costs run 2026-05-08 to 2026-08-05, and
in February 2026 the only active cost centres were 104 Ashburne and OVERHEAD. So it was **voided**
(`void-receipt-20260219-ffef9418064c-629c`), not moved to Cost Recapture: there is nothing to recapture.
Paul's own migration stopping rule - no new cost unless proven absent from the old books - should have parked
it; it was not absent.

**The mechanism, and the hole it exposed (now closed, D-043).** `sellPost` writes `status = sold` straight to
the sheet, which neither goes through the upsert (which clears the cached posting ctx) nor fires the onEdit
trigger, and `buildCtx_` caches the postable property set for **six hours**. A February receipt replayed
through the live poller inside that window still saw Granite as open. `sellPost` now clears the `ctx` cache
the instant it writes the status. Worth noting this would have gotten worse, not better: with the frozen-tab
guards in place a post in that window is invisible on both tabs - the frozen tab never refreshes and the
closing tab sums by `trade`, not `property`.

**Still open from this:** the same replay could have put duplicates on a **held** property, where nothing
flags them because held properties are meant to carry balances. A sweep for live-poller entries matching a
migrated row on date, payee and amount is worth doing.
