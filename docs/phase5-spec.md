# Phase 5 — the sell wizard (spec for Paul's review, 2026-09-22)

Closes one property in one pass (D-015, D-033): reads the settlement statement, posts the sale, the
interest true-up, the release to COGS, the payoffs and the owner's draw, builds the **Closing tab**, prints
the **Payout report**, and locks the property. First runs: **1616 Granite (and its $60,000 holdback)** and
**280 Sparkling**, the two sales that have actually closed; 881 Newport (under contract) and 104 Ashburne
(held, bank deal) run when they close. Not a title search; Paul's cost policy (profit %, carry, rehab) is
not re-litigated. Sources: BUILD-PLAN §5 (Payout report, Closing tab), `docs/property-tab-anatomy.md`,
D-006, D-010, D-011, D-015, D-017, D-021, D-022, D-030, D-031, D-032, D-034, `docs/phase4-audit.md` §47.

## 1 · What the wizard takes in

| Input | From | Rule |
|---|---|---|
| Property | dropdown of `held` properties (also "under contract" rows: D-017) | must have at least one Advances row or a 1000 purchase line |
| Settlement statement (ALTA / closing disclosure) | PDF or photo upload in the dialog | Claude reads it (one model call, ~$0.30) into typed lines; **Paul confirms every line** before anything posts. No statement → PRELIMINARY payout only, nothing posts |
| Settlement date | the statement | every entry of the run is dated this day |
| Dennis's interest figure | typed by Paul (D-015 §2) | the engine's accrual through the settlement date is shown beside it; the difference posts as one true-up |
| Reserve to leave in the shared account | typed, optional (BUILD-PLAN "Open 2026-09-11") | reduces the Recast account's payout, nothing else |
| Cost Recapture balance to settle | shown, tick to include (D-031, D-015 §4) | per-partner adjustment line on this payout |

Statement lines map to accounts like this (Claude proposes, Paul confirms; anything unmapped holds the run):

| ALTA line | Account | Side |
|---|---|---|
| Contract sales price | 4000 Property sale proceeds | credit |
| Commissions (listing, buyer's agent) | 1300 Selling — commission | debit (property cost) |
| Title, escrow, recording, attorney, owner's policy, HOA transfer | 1310 Selling — closing costs | debit |
| Seller concessions, repairs credited, home warranty | 1320 Selling — concessions & credits | debit |
| Seller's property-tax proration (Jan 1 → closing) | 1100 Holding — property tax (D-034 §2) | debit |
| Payoff of anything on title (lien, prior loan) | the account it belongs to — a question for Paul when it appears | debit |
| Escrow holdback withheld at closing | 1510 Escrow & holdbacks receivable | debit |
| Reimbursements received at closing (Sparkling's "Rehab Reimbursement" $4,716.82) | credit to the cost it reimburses, or 4030 Other income — Paul decides per line | credit |
| **Net to seller** | 1401 Cash — Citizens shared | debit; **must equal the statement's figure to the cent** |

## 2 · What posts (one batch, all dated the settlement date, `source = sale`, txn ids `sale-<date>-…`)

1. **The sale.** Dr 1401 net to seller, Dr each selling/holding line above, Dr 1510 holdback, Cr 4000 sale price.
   Balanced by construction; the statement's own arithmetic is the check.
2. **Interest to settlement.** For each open Advances row of the property: Dr 1200 / Cr 2000, the engine's
   `accruedThrough(advance, settlement_date)` less interest already posted for it (`Post interest…` may have
   run for earlier months). Then **one true-up** Dr or Cr 1200 / Cr or Dr 2000 so the property's 2000 balance
   equals Paul's typed figure (D-015 §2). The Advances rows get `repaid_date` = settlement and `status = repaid`
   (the same fields the tab's End Date trigger writes today).
3. **Net profit** = 4000 sale price − every 1000-series balance on the property after steps 1-2 (purchase,
   rehab, holding, financing interest, selling). Overhead never enters (D-010).
4. **Partner share.** Partner deal (`dennis_share_pct` > 0): Dr 1220 Profit participation — Dennis / Cr 2010,
   `dennis_share_pct` × net profit. Bank deal (Ashburne, D-030/D-032): no share; instead Dr 1210 Financing —
   points & fees / Cr 2010 for the 3% commission (`dennis_commission_pct`; **base = sale price - confirm, §6**).
5. **Release.** Dr 5000 COGS — property released / Cr each 1000-series account on the property for its balance
   (including 1200, 1220, 1300s). The property's 1000s are zero after this line; the P&L now shows the sale.
6. **Payoffs, each Cr 1401:** Dennis — Dr 2010 (purchase principal + cash advances + direct payments D-030 +
   the share from step 4) and Dr 2000 (interest incl. true-up); Paul — Dr 2030 Due to owner for what he paid on
   this property, and Dr 9010 Owner draws for his share of net profit (`100 − dennis_share_pct`, all of it on a
   bank deal); the shared Recast account keeps the rest = its own reimbursement + the reserve.
7. **Tie.** Dennis + Paul + what stays in 1401 = net to seller to the cent, or the wizard refuses to post
   (BUILD-PLAN rule). Every figure links to the journal lines behind it.
8. **Lock.** `Properties.status = sold`, `settlement_date`; the property leaves the posting allowlist (D-017);
   from now on a charge naming it is a Cost Recapture line (D-031). Its tab stays (the release zeroes the summary).

**Holdback release (a second, smaller run, when the money arrives):** Dr 1401 / Cr 1510 for the amount
received; any cost the escrow paid out first is Dr the matching account / Cr 1510. The released cash is then
distributed by the same split as the sale (step 6 again: Dennis's share via 2010, Paul's via 9010), and the
Payout report gets a dated "holdback released" section. Granite: $60,000 withheld, $30,000 to Paul per the old
Sales tab - confirm the other $30,000 went to Dennis and nothing was deducted (§6).

**Post-sale costs** need nothing from the wizard: the bookkeeper posts them to Cost Recapture naming the
property in `trade` (D-031); the next sale's step 6 settles the balance between the partners (D-015 §4).

## 3 · The Closing tab (`<property> — Closing`, built beside the property tab)

The Payout report as formulas over the posted `sale-*` and release entries, in this order: sale price; each
statement line; net to seller; project cost by class (acquisition, rehab, holding, financing, selling) released;
net profit; the waterfall (principal per advance, interest per advance with the true-up on its own line, direct
payments, share, reimbursements, owner's draw, reserve); payouts; **payouts = net to seller** check cell.
Beside each line: the property tab's estimate **frozen as values the day of the sale** and the difference.
Below: the post-sale section (Cost Recapture lines naming this property, and the partner adjustment they
feed). Same colours and helper-column conventions as the property tab (`phase2.6-spec.md` §5); a view, nothing
typed. Rebuilt by `Rebuild property tab` like any other.

## 4 · The Payout report

BUILD-PLAN §5's layout, generated from the ledger. **PRELIMINARY** any time while held (estimate percentages from
Settings, `contract_price` when present, interest to today) - the property tab already shows this; the wizard's
preview is the same numbers in the report layout. **FINAL** only from a confirmed statement; the estimate
percentages never appear on it. Printable to PDF (Drive, in the property's folder) and shareable with Dennis.

## 5 · The two past sales, re-run (the gate)

The wizard re-runs Granite and Sparkling from their statements (Paul uploads them; the old tabs' "Cash from
closing" is the only figure the old books kept). Expected, from the closed old tabs (cutover export):

| | 1616 Granite | 280 Sparkling |
|---|---|---|
| Sale price | 430,000.00 | 550,000.00 |
| Cash from closing (old tab) | 347,343.03 (after agent, closing **and the $60,000 holdback**) | 259,053.12 (+ 4,716.82 "Rehab Reimbursement" = 263,769.94 gross) |
| Purchase principal / interest | 279,001.00 / 6,873.90 (04-07 → 07-27) | 196,850.50 / 2,809.57 (06-02 → 08-06) |
| Rehab / utilities on the old tab | 10,727.97 / 1,476.90 | 2,402.47 / 777.31 |
| Net profit / share each | 49,263.26 / 24,631.63 | 60,930.09 / 30,465.05 |
| Dennis payout | 32,978.61 (share + 8,304.63 reimbursed + 42.35 cash-advance interest) | 31,863.03 (share + 1,397.98) |
| Paul payout | 28,489.52 (share + 3,900.24 − 42.35) | 32,246.85 (share + 1,781.80) |

The Sales tab's $243,740.64 is **Paul's** payouts (28,489.22 + 30,000 holdback + 32,246.85 for the closed sales;
Newport 28,131.88 and Ashburne 124,872.69 are projections, §47). **Acceptance:** each re-run's Dennis and Paul
payouts equal the old tab's after the differences below, each named on the Closing tab; net to seller ties to
the statement; the property's 1000s are zero; `status = sold`.

Known differences, by rule, not error: (a) Granite's cash-advance interest $84.70 - the old tab charged Paul
half (±42.35); D-011/D-021 make all of it a property cost, so each payout moves by $42.35; (b) the Journal's
rehab/utility totals differ from the old tabs by the register lines (C-16 TXU $161.17 to Cost Recapture,
listing fees on 1330, C-19, C-25, C-32 …) - the Closing tab's difference column lists them; (c) Sparkling's
"Rehab Reimbursement" $4,716.82 is whatever Paul says it is in §6; (d) commissions, closing costs and the tax
proration post as their own lines instead of being buried in "cash from closing" - net to seller is the same.

## 6 · Questions for Paul (answer in any order; each one is a line on the spec)

1. **Granite holdback:** $60,000 withheld at closing; the Sales tab shows $30,000 to you. Was the whole
   $60,000 released, split 50/50, nothing deducted? When did it arrive?
2. **Sparkling's statement:** $550,000 sale, $259,053.12 cash to you - roughly $291,000 came off on the ALTA.
   What was it (a payoff on title? the lien?), and what is the "Rehab Reimbursement" $4,716.82 (the
   "Sparkling for Title" tab's total) - money the title company paid you back, or a credit on the statement?
3. **Ashburne commission (bank deal):** 3% of the sale price, or of something else? Paid to Dennis at closing
   with the principal and 12% interest?
4. **Cash-advance interest on partner deals:** the old Granite tab charged you the $84.70 personally
   (half each way). D-011/D-021 say interest on every advance is a property cost. The re-run will follow
   D-021 unless you say otherwise - confirm.
5. **Reserve:** do you want the "leave $X in the Recast account" field, or does the shared account simply keep
   what it fronted?
6. **Dennis's copy:** should the wizard email the FINAL Payout report PDF to Dennis, or only save it to Drive?

## 7 · Build order (after Paul's answers)

1. `lib/sale.mjs` (pure): `buildSaleBatch({property, statementLines, advances, journal, interestFigure,
   reserve, recapture})` → the entries of §2 in order, plus the tie check; unit tests with Granite and
   Sparkling fixtures from §5 (expected payouts to the cent after the listed differences). Reuses
   `lib/accrual.mjs` `payoffAt` / `accruedThrough` and `lib/posting.mjs` `buildEntry`. Generated into `lib.gs`.
2. Writer: `Sell.html` dialog (property, statement upload, Claude's read of the lines for confirmation, interest
   figure, reserve, recapture tick, preview = Payout report, Post) → `postBatchEntries_` in one lock; `Release
   holdback…` dialog; the Closing tab template; `Properties` lock. Menu: **Recast Books → Sell property…**,
   **Release holdback…**. The statement read is one `/api/…` call to the bookkeeper's model with the ALTA
   (same tools, a "settlement statement" document type), no gate - Paul confirms every line.
3. Payout report PDF (Drive) - from the Closing tab (`Spreadsheet → PDF` export of that sheet).
4. Gate: re-run Granite (with the holdback release) and Sparkling in production - the Journal is append-only,
   a wrong run is voided and re-posted; tie-out per §5. Then Newport and Ashburne when they close.
