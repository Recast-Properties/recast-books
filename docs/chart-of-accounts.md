# Chart of accounts

Numbered so the series encodes the treatment. Every account is populated by real
transactions already in the live workbook.

> **Provisional until Q-2 and Q-3 in `open-questions.md` are answered.** Entity type
> changes the 9000 series; dealer-vs-investor changes whether the 1000→5000 release
> below is the right mechanic at all.

## The release rule

Property costs accumulate in the **1000s** while the property is held. On the
settlement date recorded in the property registry, that property's **entire
accumulated 1000s balance moves to 5000 — Cost of goods sold.**

That single entry is what turns a pile of costs into a matched sale. The first draft of
this plan had no revenue accounts and no release mechanic at all — two independent
reviewers caught it (see `review-2026-08-26.md`, findings CPA-1 and IMPL-1).

Year-end inventory is then a filter, not an assembled report: sum the 1000s by property
where the registry says `status = held`.

---

## 1400 — Cash & other assets · balance sheet

| Code | Account | Notes |
|---|---|---|
| 1400 | Cash — one code per account | Each bank and card. Reconciliation needs something to reconcile *to*. |
| 1500 | Earnest money & auction deposits | Released to 1000 at close, or to 6350 when a deal dies |
| 1510 | Escrow & holdbacks receivable | 1616 Granite's $60,000 — currently inside a net-profit figure and in no account |

## 2000 — Liabilities

| Code | Account | Notes |
|---|---|---|
| 2000 | Accrued interest payable | Accrued but unpaid interest to Dennis |
| 2010 | Note payable — member | Dennis's $164,360.44 principal, readable as a balance at a date |
| 2020 | Backup withholding payable | Form 945 liability if a payment goes out with no W-9 |

## 4000 — Income

| Code | Account | Notes |
|---|---|---|
| 4000 | Property sale proceeds | $775,000 · $550,000 · $430,000 · $409,000 |
| 4010 | Wholesale assignment fees | Assignments that never close in Recast's name |
| 4020 | Escrow holdback released | Granite's $60,000 when it releases — not at closing |
| 4030 | Other income | Rebates, credits. **Not refunds** — a refund reverses the expense it refunds (credit path, Phase 2 follow-up) |

## 5000 — Cost of goods sold · the release target

| Code | Account | Notes |
|---|---|---|
| 5000 | COGS — property released | Ashburne's $567,656.87 on its settlement date |
| 5010 | COGS — wholesale | Costs on assigned deals |

## 1000 — Property costs · capitalize to inventory while held

| Code | Account | What lands here now |
|---|---|---|
| 1000 | Purchase price | Auction.com $325,000 · $294,651 · $207,000 · $393,701 |
| 1010 | Acquisition costs | Buyer premium, title, recording, HOA release |
| 1020 | Rehab — subcontract labor | Juan Garcia, Chinos LLC, Salvador Campos, Julio |
| 1030 | Rehab — materials | Home Depot, Lowe's, Floor & Decor, Amazon |
| 1040 | Rehab — fixtures & appliances | Luxury 4 Less, Shalom Granite, 50floor, MyKnobs |
| 1050 | Permits & inspections | Currently uncategorized |
| 1060 | Debris & haul-off | City of Corsicana dump fees |
| 1100 | Holding — property tax | Ashburne $16,031.25, prorated per tab |
| 1110 | Holding — insurance | Foremost Insurance $2,640.10 |
| 1120 | Holding — utilities | TXU, Atmos, Energy Texas, city water, Rocket Water |
| 1130 | Holding — HOA | HOA dues, Falcon Creek Lawn, pool service |
| 1200 | Financing — interest | Ashburne $40,030.92, per-property interest to date |
| 1210 | Financing — points & fees | Loan origination |
| 1300 | Selling — commission | Ashburne $46,500 (6%) |
| 1310 | Selling — closing costs | Ashburne $15,500 (2%) |
| 1320 | Selling — concessions & credits | Ashburne $19,000 |
| 1330 | Selling — staging & marketing | Aces Photography $628, Virtual Staging AI |

> **Open:** the CPA lens argues 1300–1330 are selling costs, not inventoriable costs,
> and that under §471(c) the book treatment becomes the tax method. Finding was
> weakened but not withdrawn. Confirm with the accountant before Phase 2 maps them.

## 6000 — Operating expenses · deduct currently

| Code | Account | What lands here now |
|---|---|---|
| 6000 | Advertising & signage | VistaPrint signs and riders |
| 6010 | Lead generation | Direct mail farming, inbound capture |
| 6100 | Contract labor — non-property | Currently none tracked |
| 6200 | Legal & professional | Attorney, title curative |
| 6210 | Accounting & bookkeeping | Accountant's fee |
| 6300 | Data & research | CoreLogic $600, Ellis County Clerk, LGS |
| 6350 | Abandoned deal costs | Forfeited deposits, fees on deals that died — an ordinary loss for a dealer (added 2026-09-12) |
| 6400 | Software & subscriptions | Anthropic, Adobe, Apify, PDF.co, Twilio, Telnyx |
| 6410 | Website & hosting | Netlify $162 — merges the current Website/Subscriptions overlap |
| 6500 | Office supplies & postage | Toner, boxes — $136.84 |
| 6510 | Small tools & equipment | $4,690.15, under de minimis if Q-7 is elected |
| 6600 | Vehicle | Mileage *or* actual — see Q-5, currently mixed |
| 6610 | Tolls & parking | NTTA — deductible under either method |
| 6700 | Travel | $8,821.59 — see Q-1, may not all be deductible |
| 6710 | Meals (50%) | $350.29 — segregated for the limitation |
| 6720 | Business gifts | The $100 Uber gift card — capped per recipient |
| 6800 | Insurance — entity | General liability, E&O |
| 6900 | Taxes & licenses | TX franchise tax, filing fees |
| 6910 | Bank & merchant fees | Wire fees, card fees |
| 6920 | Dues & education | MLS, association dues |
| 6930 | Interest — other | Business card / loan interest not tied to a property; never Dennis's (added 2026-09-12) |
| 7000 | Depreciable assets | Over the de minimis ceiling — feeds the asset schedule |

## 9000 — Equity · never an expense

| Code | Account | Notes |
|---|---|---|
| 9000 | Member contributions | Paul-paid / Dennis-paid costs, where not reimbursed |
| 9010 | Member draws & distributions | The $176,141.44 drawn against Ashburne |
| ~~9020~~ | ~~Loans from members~~ | Retired by D-006: Dennis is a lender — principal is 2010, interest is 1200 |
| ~~9030~~ | ~~Interest paid to members~~ | Retired by D-006/D-011 |

> **Note on 9030 (resolved 2026-09-11 by D-006):** the CPA lens flags that routing ~$52,000 of real interest through
> equity quarantines a deductible expense. If Dennis is a lender (Q-2), interest is a
> deduction, not an equity movement. Resolve with Q-2.

## Tax-bucket review — 2026-09-12

Reviewed against Schedule C for a dealer in a single-member LLC. Structure confirmed:
inventory in the 1000s released to 5000 on settlement; meals, gifts and travel
segregated; vehicle actual with `Trips`; de minimis tools at 6510. Added 6350 and 6930.
Still for the accountant (`open-questions.md`): Q-1 tax home (47% of overhead), whether
holding costs and interest are capitalized or deducted currently (small-business UNICAP
exemption; a recompute, since tax treatment derives from account + settings), and the
actual-expense method on a truck the LLC does not own (D-009).
