# Phase 4 migration — independent audit, 2026-09-18

Run by a fresh Claude session that took no part in the migration. **Read-only:** nothing was
posted, pushed, deployed or changed in either workbook, staging, Blobs or Drive. No API money
spent. Method: the old workbook snapshot (`old-workbook-snapshot.xlsx`) was re-parsed from
scratch with a parser that shares no code with `scripts/migration-*.py`
(`scripts/migration-audit-indep.py`), then compared three ways - against the inventory JSON,
against the pending dry run (`rows/entries.csv`, commit `3e5df39`), and against what is actually
in the staging Journal (the `books-cache` `tab/Journal` snapshot, pass 2). Links were tested
against a fresh download of all 968 envelopes (`scripts/migration-audit-links.py`).

## Verdict

**The amounts are sound.** Every expense row in the old workbook is in the migration at the
amount Paul typed, on the right property and block, with **one exception ($299, finding 1)**.
Every difference between the old books and the new is on the corrections register and traces to
something Paul said. The "ties out to the cent" claim holds - against the inventory. The one
miss is a row the inventory itself dropped, which a tie-out against the inventory cannot see.

What is *not* finished is around the amounts: Granite's purchase and advances are absent from the
Journal, a handful of receipt links are wrong, and three items in the Phase 4 gate (sales,
net profit, opening balances) are on no pending list.

## What was verified and holds

| check | result |
|---|---|
| Old rows, independent parse: 1,024 expense rows + 4 Cost Recapture = 1,028 | matches the inventory's count and $221,389.05 **plus one row it lacks** (finding 1) |
| Every block header on every tab vs the rows under it | all equal, except the Ashburne ranges that stop short: +$6,435.91 in 5 blocks + two text cells $602.62 = **$7,038.53**, exactly C-4 |
| Text-typed amounts (`450,00`, `152,62`), the year-0126 date | found independently; C-1a, C-2, C-3 are right |
| Staging Journal (pass 2, 1,010 entries) vs old rows, row by row on property + date + amount | every residual is a registered item: 7 covered by advances, C-3, C-5..C-9, 4 refunds posted with sides swapped (signs correct) |
| Pending dry run (1,027 to post, $203,957.95) vs old rows | same; the 13 additions are each absent from every old tab (searched by amount on all tabs) |
| Block-level: all 11 RECAST BIZ blocks and all 21 Ashburne blocks, old vs posted + held | $0.00 difference on every block |
| Payer tick boxes (Paul / Dennis / Recast Account), re-read from the sheet for the 5 light tabs | 211 of 211 ticked rows agree with `paid_from` (19 Mesa rows carry no tick) |
| Dennis's Ashburne schedule in `migrationRegisterAdvances` vs the Cash Advances tab | 21 of 21 rows, $176,141.44 of draws, to the cent |
| Journal integrity | debits = credits ($1,976,816.25), no unbalanced txn, no duplicate `txn_id`, all dates in range |
| D-010 (overhead never on a property) | 0 violations in 1,027 entries |
| Posting engine | `migration-rows-check.mjs`: 1,027 of 1,027 build, totals = `expected.json`; `npm test` 392 pass |
| Falcon Creek invoice 1390 ($425) | read the envelope: four lines, Newport $110 + Ashburne $150 were in the old books, Bowling Green $110 + Sparkling $55 were not - the C-10 additions are correct, nothing doubled |

## Findings

### 1 · A Granite row is missing from the migration — $299.00 (amounts; fix before cutover)
`1616 Granite RECONCILED` cell J42: **Mission Reg / Listing Fee / $299.00 / no date / Dennis Paid
ticked.** It sits inside the header's `SUM(J3:J73)`, and the old tab's own "Dennis Paid - Rehab
Costs $1,466.63" includes it (the migrated Dennis-paid Granite rows sum to $1,167.63; + $299 =
$1,466.63). The inventory skipped it - apparently because it has no date - so `property-rows.json`
has Granite at 60 rows / $11,905.87 where the tab is **61 rows / $12,204.87**, and every tie-out
since has been against the short number. It changes what Granite owed Dennis by $299.
The two undated RECAST BIZ rows were caught (C-5, C-6); this is the only other undated row in the
workbook. **Needs from Paul:** a date (Sparkling's identical Mission fee is 06-25; Granite listed
earlier).

### 2 · Granite's purchase and cash advances are not in the Journal (structure; fix before cutover)
`migrationRegisterAdvances` skips Granite ("already on the tab from the Phase 2.6 gate"). In
staging the three Advances rows exist ($279,001 purchase, $5,500 and $1,338 cash) but their
`source_txn_id`s are **not in the Journal** - the Journal clear took them and nothing re-posts
them. Account 1000 totals $1,584,646.50 = seven purchases; Granite's is the eighth. The same will
happen in production: `clearBooks()` deletes the Journal, leaves the Advances tab, and the
registration's exists-check then skips Granite. Also on those three rows: `rate_pct` is blank and
`status` is `open` though Granite settled 2026-07-27, so an accrual run would keep charging
interest. **Fix:** add Granite's three to the list (9%, repaid 2026-07-27) and make the
exists-check look for the Journal txn, not just the Advances row.

### 3 · Some "strong" receipt links are wrong (links only - no amount is affected)
Of 782 linked entries, 520 rows on 464 receipts sum exactly to the receipt total and another 167
match a line item. Confirmed wrong:
- **City of Corsicana dump, $27.30** - the tab has two rows dated 01-16 but only one 01-16
  receipt at $27.30 (the other 01-16 dump receipt reads **$22.50** and was dismissed as a
  duplicate). The second row took the 02-12 receipt and pushed every later visit one receipt
  along (02-12 → 03-10, 03-10 → 03-23, 03-23 → 04-08), leaving the 04-08 row "weak" though its
  receipt exists. Four wrong links - and a question for Paul: is the second 01-16 row really the
  $22.50 load?
- **Shell** - 03-25 $65.48 is linked to the 05-04 $66.51 receipt, and 05-04 $66.51 to the 06-17
  $66.64 receipt; each row's own exact receipt exists.
- **Julio $200.00 (05-29) → a CoreLogic $200.00 invoice**; **NTTA toll $92.57 (06-11) → an Uber
  $94.98 ride receipt**; Atlas Pools 09-01 $256.01 → a 07-25 receipt while two 09-01 receipts
  exist; Home Depot $6.47 (01-14) → a $10.80 receipt while an exact $6.47 receipt is a day away.
- 17 receipts carry rows that add up to **more** than the receipt (most by cents - tips and rounding. Two are old-poller
  links by message id, not matcher output: Uber 06-03 $113.98 on a $94.98 read, Amazon 08-25
  $113.58 on a $37.90 read - the row may be right and the re-read partial; worth a look).

Cause: the near-amount rule and the "exact amount within 2 days regardless of vendor" rule
(`0f3f6c4`) place before exact same-vendor matches are exhausted. **Fix:** assign exact-total,
same-vendor, nearest-date pairs first across the whole set; require vendor resemblance for the
exact-amount rule; never let a near-amount link take a receipt that some row matches exactly.
Rerun `scripts/migration-audit-links.py` after - it should print 0 in its first section.

### 4 · Phase 4 gate items that are on no pending list (scope)
BUILD-PLAN §7 defines the Phase 4 gate as property totals **and net profit** tying out, plus
**opening balances**; audit §2 says the **Sales tab** ($243,740.64 across five closings) "must be"
in scope. §17 and §21 list none of the three. As staged, the books show all ten properties
`held` (four are sold), $1.58M of purchase price still in inventory, $1.78M owed to Dennis with
nothing repaid, no revenue, **$153,450 of draw money sitting in 1402 Chase** and **$178,041 due to
Paul** - because the draws landed in the bank and every pre-August cost credits 2030 (D-026.2).
None of that is wrong as a step, but it means "cutover" as listed produces books whose balance
sheet is not yet meaningful. Either fold the sale/settlement entries into Phase 4 or write down
that they are Phase 5 and the Phase 4 gate is amended.

### 5 · Nothing covers the gap between the snapshot and the cutover (process)
The snapshot is 2026-09-17 07:10; its last row is dated 09-16. `WRITER_URL` points at staging, so
live receipts post to staging and **every `migrationRunStaging` deletes them** (`receipt-*` is in
the clear). All 272 envelopes marked `posted` now point at transactions that exist in no
workbook. At cutover: (a) re-export the old workbook and diff it against the 09-17 snapshot -
anything Paul typed since is otherwise lost; (b) replay the live envelopes received since 09-11
that are not old rows (the original plan, audit §3, dropped from §17/§21); (c) reset envelope
status so the Inbox history matches the books.

### 6 · Smaller items
- **One invoice, two payers.** Falcon Creek 1390: the Newport line is `1401` (Paul ticked Recast
  Account) while the other three lines of the same $425 invoice are `PAUL`. One invoice is one
  payment; $315 is probably on the wrong side of Due-to-Paul. One question for Paul.
- **Bowling Green M38, Lupe $160.00** has both Paul Paid and Dennis Paid ticked; migrated as PAUL.
- **Ashburne is $1,619.00 above the old tab's rows** in the new books: eight of Dennis's direct
  payments (Julio 12-10, 12-11, 05-04, 07-27; dump $21; two Iley listing fees; Julio 07-13 $150)
  have no row on the Ashburne tab and enter only as advances. Consistent with the old tab's own
  note that draws are what count - but it is outside the "to the cent" tie-out, which only looks
  at `migration-*` lines. Worth one check: the 07-13 $150 advance against the tab's Julio $150
  dated 07-07 (same payment typed once in each place?).
- **Listing fees sit in three accounts:** Brushwood's Iley $299 → 1330, Ashburne's → 1330,
  Sparkling's Mission $299 → 1020 labor ("payee" guess). Should be 1330, as should Granite's.
- **Corrections register is stale at C-10:** it still says "$682.97" including the retracted
  microwave; the additions actually posting are $712.96 (pump, hose, bags, mats $342.98 + Falcon
  Creek $110 + $55 + Bowling Green TXU $204.98). The TXU addition is in no register line.
- `books-cache` `meta/spreadsheet_url` names the production workbook while the cached tabs are
  staging's.

## Already known, confirmed still open
Production writer not pushed · staging holds pass 2, not the `3e5df39` dry run · 245 rows
(~$65K) unlinked, 219 of them weak candidates awaiting Paul · items 4-7 of §17 · settlement dates
for Ashburne and Newport · the image-type fix not deployed.

## Suggested order
1 → 2 (both are small code/data changes, then one staging run proves them) → 3 (matcher, free
rerun) → decide 4 with Paul → write 5 into the cutover checklist → 6 as one question each.

## Resolution, 2026-09-18 (same day; detail in `phase4-audit.md` §22)

| finding | Paul | done |
|---|---|---|
| 1 Granite $299 | "june 2" | row added (C-12), 1330, Dennis paid; Granite target $12,204.87 |
| 2 Granite advances | "how do we fix this?" | `migrationRegisterAdvances` clears and re-posts the whole list, Granite's three included; takes effect on the next staging run |
| 3 links | "fix the links" | matcher fixed (best pair first, near-amount within 10 days on the document's own vendor, exact-amount needs property or name, invoice numbers split twins); the link audit is clean; 21 shaky links went back to Paul's confirm list |
| 4 sales / net profit | "we have not created the workflow for closing a property yet" | D-033: Phase 5; Phase 4 gate amended |
| 5 snapshot → cutover gap | "i'm holding any new receipts in the system until this migration is complete" | noted in D-033; the cutover still re-exports the old workbook and diffs it |
| 6 Lupe | "dennis paid" | C-13 |
| 6 Ashburne +$1,619 | "this is an error. dennis has no direct payments. only cash advances and loan for purchase" | D-032: the 15 lines are cash advances landing on 2030; every Ashburne row posts; Ashburne = the old tab |
| 6 listing fees | "it should be selling cost" | C-14, all four in 1330 |
| 6 register C-10 | "fix" | $712.96, itemised |
| 6 Falcon Creek 1390 payer | "expand on this" | open - one question for Paul || 3 Corsicana 01-16 second row | "most likely yes" ($22.50) | C-15; all ten dump rows on their own receipt |
| 6 Falcon Creek 1390 payer | "i noted how the invoice was paid in the email" | the bank's Zelle memo: $275 from Citizens for Newport, Bowling Green, Sparkling; the two added lines → 1401. Prompt now reads Paul's subject and note first (`phase4-audit.md` §22) |

Staging pass 3 (13:03) ties out to the cent on both paths - `phase4-audit.md` §23.

