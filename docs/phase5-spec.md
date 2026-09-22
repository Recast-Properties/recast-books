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
| Dennis's interest figure | typed by Paul (D-015 §2) | the engine's accrual **through each advance's repayment date, not the settlement date** (they differ: Granite closed 07-24, Dennis was repaid 07-27 - audit §59) is shown beside it; the difference posts as one true-up |
| Reserve to leave in the shared account | typed, optional (BUILD-PLAN "Open 2026-09-11") | reduces the Recast account's payout, nothing else |
| Cost Recapture balance to settle | shown, tick to include (D-031, D-015 §4) | per-partner adjustment line on this payout |

**The advances are edited in the dialog, never in a Terminal** (Paul, 2026-09-22: "i don't want to have to
run terminal every time we reconcile"). The Sell dialog lists this property's advances - date, amount, kind,
rate, repayment date - all editable in place beside Dennis's interest figure, because the sale is exactly
when the two of them reconcile. The writer posts the corrected rows itself: it is the project bound to the
workbook, so it needs no secret (D-023). The masked-secret Terminal path exists only for callers outside the
workbook. For a held property the same edit already has a home: the property tab's typed End Date cell is
written back to `Advances` by `onPropertyTabEdit`, and the rate cell works the same way.

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

## 3 · How a sale is represented: the property tab becomes the closing statement

**Decided with Paul 2026-09-22.** No new tab per sale. When a property sells, its own tab is rebuilt as the
closing statement - which is what the old workbook already did ("1616 Granite RECONCILED", "280 Sparkling
RECONCILED" are the property tabs reworked, and their layout is a closing statement: purchase principal and
interest, cash advances, Paul paid, Dennis paid, Profit Breakdowns, the two payouts). The forecast version
stops meaning anything the moment the costs release to COGS, so keeping both would leave a dead tab per sale
and grow the workbook by one tab every flip.

Sections, in the shape Paul already uses:
1. The settlement statement as posted, line by line at Recast's share, ending in cash received.
2. Project cost released, by class: acquisition, rehab, holding, financing (interest), selling.
3. The waterfall and the three payouts, with the **payouts = cash received** check cell.
4. Beside the payouts, the forecast frozen the day of the sale, and the difference.
5. Post-sale section: Cost Recapture lines naming this property, and the partner adjustment they feed
   (D-015 §4, D-031).

**Staged, Paul 2026-09-22: "while we test i want to generate a new tab and get it working before we change
the existing property tabs."** The builder takes its target sheet name, so during the gate it writes
`<property> — Closing` and the live property tab is untouched. When Paul signs the layout off, the target
becomes the property tab itself and the test tabs are deleted. One constant in the writer, not a setting.

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

## 6 · Paul's answers (2026-09-22) — D-036

1. **Granite holdback:** the whole $60,000 was released, split 50/50, nothing deducted; **it arrived 2026-09-11.**
   So the holdback release is a second run dated 09-11: Dr 1401 $60,000 / Cr 1510 $60,000, then $30,000 to
   Dennis (2010) and $30,000 to Paul (9010). The old Sales tab's $30,000 is Paul's half.
2. **Sparkling's $4,716.82 "Rehab Reimbursement":** "we had other partners on that deal. that is the agreed
   upon rehab costs that we were reimbursed" - money Recast got back at closing for rehab it had paid, so it
   credits the rehab accounts it reimburses, not income. **Still open: the rest of the ALTA** (§6a below).
3. **Ashburne commission (bank deal):** **3% of the full sale price**, paid to Dennis at closing together with
   the purchase cost and the cash advances plus 12% interest. (Paul quoted the $775,000 of BUILD-PLAN §5's
   illustration; the rule is a percentage of the full price, whatever the price turns out to be.) No profit
   share on a bank deal (D-030/D-032).
4. **Cash-advance interest on partner deals:** D-021 is `docs/decisions.md` (2026-09-15, "Cash-advance
   interest is a property cost after all"): it withdrew D-020 and restored D-011 in full - interest on every
   advance, purchase or cash, is a property cost in 1200, borne half each through the 50/50 split, and there
   is no "from Paul / to Dennis" interest line. The Granite re-run therefore moves each payout by $42.35
   against the old tab. Paul asked where it was written, not to change it; **the re-run follows D-021** and
   the Closing tab names the $42.35 as a difference.
5. **Reserve field: dropped.** ("what wizard?" - the sell wizard is this Phase 5 dialog, Recast Books → Sell
   property…, the thing being specced here; it did not exist to be known about.) Default: the shared Recast
   account simply keeps what it fronted. No field, no setting. Add one only if Paul later wants to hold money
   back for the next purchase.
6. **Dennis's copy:** save the FINAL Payout report PDF to Drive only; the wizard never emails it.

### 6a · Answered from the statements themselves (2026-09-22) - both were already in Drive

Paul: "they were financial partners and their payout is shown in the title settlement statement." Both
seller closing disclosures are in his property folders and were read from there, not asked for:

- **1616 Granite** - `1616 Granite/Seller Settlement Statement/seller cd.pdf` (`10Iz6FAyc4OMKF0vuK_yjnKnfrU8zwEmP`),
  Bison Title file 260648, closed 2026-07-24. **Seller: RECAST PROPERTIES LLC alone.** Sale price $430,000.00;
  due from seller $82,656.97 = closing costs $15,361.60 + **escrow holdback $60,000.00** + owner's policy
  adjustment $1,672.00 + county taxes 1/1 → 7/24 $5,623.37; **cash to seller $347,343.03** - the old tab's
  figure to the cent. Commission $12,900.00 to KW Ellis County (split with Mission Real Estate Group).
- **280 Sparkling** - `280 Sparkling Springs/Closing Doc/260725 Seller CD..PDF` (`1GflISmyHKDJETEd4zKIETqa78mMw_CYR`),
  Bison file 260725, closed 2026-08-06. **Two sellers: SAM H PROPERTIES LLC** (Kamal Hantouli, Kennedale TX)
  **and RECAST PROPERTIES LLC** (Dennis Little signing). Due to sellers $550,686.37 (price $550,000.00 + HOA
  dues 8/7→12/31 $201.37 + HOA resale certificate $485.00); due from sellers $32,580.12 (closing costs
  $22,297.20 + owner's policy $2,903.00 + county taxes 1/1 → 8/6 $7,379.92); **cash to sellers $518,106.25**.
  **Half of that is $259,053.12 - the old tab's "Cash from closing" exactly.** Commission $16,500.00 to Texas
  Connect Realty.

**So the "other partners" are one co-seller, and the answer is a share, not a payee.** Sparkling was owned
50/50 with Sam H Properties: each side put in half the purchase ($196,850.50 of the $393,701.00 auction
price - which is exactly what `Properties.purchase_price` already holds) and took half the proceeds. The
co-owner's half never passes through Recast's books, so **the waterfall keeps its three payees** (Dennis,
Paul, the shared account) and needs no change.

**The $4,716.82 is statement line H.01, "Expense Reimbursement to RECAST PROPERTIES LLC"** - a seller-paid
closing cost disbursed to Recast, i.e. Sam H reimbursing the rehab Recast had fronted. Recast's cash from the
closing is therefore half of $518,106.25 plus that $4,716.82 = **$263,769.94**, the old tab's "Total Gross
Proceeds" to the cent. (Half of the reimbursement came out of Recast's own side of the closing costs, so the
net new money from the co-owner was $2,358.41; the arithmetic above already accounts for it.)

**D-037 (proposed, for Paul's confirmation): a co-owned deal is recorded at Recast's undivided share.**
Every statement line is posted at Recast's percentage, except a line payable to Recast by name, which posts
in full. The purchase side already follows this (Sparkling at half). The sell dialog takes "Recast's share of
this sale" as a typed percentage, default 100%; Granite runs at 100%, Sparkling at 50%. No new Properties
column and no change to the property tab's forecast - `ponytail`: one typed field on the dialog, add a stored
column if a second co-owned deal appears.

**Also learned, for the estimates:** the selling commission was **3.00% in both sales** and covered both
brokers - not 3% a side. Closing costs other than the commission and the tax proration ran **0.96% (Granite)
and 0.72% (Sparkling)** of the price, so Settings' 2% closing estimate is about double what these two cost.
Recommend changing `closing_pct` to 1%; the preliminary payout is the only thing it touches (D-034 already
estimates the tax proration on its own line). Paul's call, not a blocker.

## 7 · Build order (after Paul's answers)

1. ✅ **`lib/sale.mjs` built 2026-09-22** (13 tests in `test/sale.test.mjs`, 413 in the suite; generated into
   `lib.gs`). `splitStatement(settlement)` applies D-037's share and returns the sale entry's lines;
   `buildSalePlan({property, settlement, advances, balances, interestFigureCents, recaptureCents})` returns
   the ordered journal **intents** of §2 (the caller maps them through `lib/posting.mjs` `buildEntry`, so ids
   and validation stay in one place), a summary, and the checks (`balanced`, `cash_ties`, `released_ties`).
   `buildHoldbackRelease(...)` is the second run. **Both closed sales are fixtures and both reproduce Paul's
   own tabs:**

   | | 1616 Granite | 280 Sparkling |
   |---|---|---|
   | Recast's share | 100% | 50% (D-037) |
   | Cash in | 347,343.03 | 263,769.94 |
   | Project cost before the share | 320,821.44 | 214,069.91 |
   | **Net profit** | 109,178.56 | **60,930.09** = the old tab exactly |
   | Share each | 54,589.28 | 30,465.05 / 30,465.04 |
   | Paid to Dennis at closing | 318,853.51 | 231,523.09 |
   | **Paid to Paul at closing** | **28,489.52** = the old tab exactly | 32,246.84 (old tab 32,246.85) |
   | Owed after closing | 30,000.00 each - the holdback halves | nil |
   | Interest: engine 8% / agreed / true-up | 6,966.43 / 6,958.60 / −7.83 | 2,810.74 / 2,809.57 / −1.17 |

   Granite's profit is $84.70 above the old tab's 109,263.26 for one reason: D-021 makes the cash-advance
   interest a project cost instead of Paul's personal charge, so it leaves profit and each share moves by
   $42.35. Everything else agrees to the cent or to one cent of share rounding.
2. ✅ **Writer built 2026-09-22, pushed and verified by pull (12 files identical).** Menu: **Recast Books →
   Sell property…** (`showSellDialog`). `Sell.html` takes the property, settlement date, Recast's share, sale
   price, net-to-seller, the statement lines (label, account, amount, kind: charge / adjustment / holdback /
   paid to Recast), the advances **editable in place** (rate, repayment date), Dennis's agreed interest and
   any Cost Recapture, then **Preview** (read-only: the waterfall and the checks) and **Post the sale**.
   Server side in `Menu.gs`: `sellContext` / `sellPreview` / `sellPost`, with `propertyBalances_` and
   `writeClosingTab_` in `Code.gs`. `sellPost` posts every intent as one batch under the writer's lock,
   writes each advance's repayment date, status and corrected rate, flips `Properties` to `sold` with its
   settlement date, and writes the closing statement as values to `closingTabName_()` — `<property> -
   Closing` until `CLOSING_TAB_IN_PLACE` is set true. **Still to build:** the statement upload and Claude's
   read of the ALTA (the gate types the lines from the PDF, which is enough), and `Release holdback…` as its
   own dialog (`buildHoldbackRelease` is built and tested).
3. Payout report PDF (Drive) - from the Closing tab (`Spreadsheet → PDF` export of that sheet).
4. Gate: re-run Granite (with the holdback release) and Sparkling in production - the Journal is append-only,
   a wrong run is voided and re-posted; tie-out per §5. Then Newport and Ashburne when they close.
