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
