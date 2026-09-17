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
