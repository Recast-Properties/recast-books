# Audit of the MEMBER'S EQUITY section of the P&L tab
**Recast Properties LLC — as of November 1, 2026**

Prepared from the audit folder only: `tab/PandL.csv` (the tab as rendered 2026-11-01), `data/Journal.csv`
(4,330 lines), the supporting data tabs, and the code that builds the tab (`code/reports.mjs` and friends).
Every number below was recomputed independently in `recompute.py` (integer cents; run
`python3 -I recompute.py` in this folder; its output is saved as `recompute.out.txt`). Builder comments and
"D-xxx" decision references in the code were treated as claims to test, not as facts.

A few words used throughout, defined once:

- **Member's equity** — what would be left for the owner (the "member") if the business sold everything it
  owns and paid everyone it owes. Assets − Liabilities = Member's equity, always.
- **Capital contribution** — money or value the owner puts *into* the business as owner (not as a loan).
- **Distribution** (also "draw") — money or value the business pays *out* to the owner as owner.
- **Net income** — this period's profit: sales minus the cost of the houses sold minus business costs.
- **Retained earnings** — profit from earlier years that was kept in the business rather than paid out.
- **Liability** — a debt the business owes someone, including the owner when the business owes him money.
- **Trial balance** — the list of every account's balance; the debits and credits must be equal.
- **Void** — a cancelled entry. In this ledger a void is a second entry that mirrors the first with the sides
  swapped, so the two cancel.
- **Roll-forward** — the standard way to show equity: beginning balance + contributions − distributions
  + net income = ending balance.

---

## Summary

- **The math holds.** Every line of the MEMBER'S EQUITY section, every line of ASSETS and LIABILITIES, Net
  income, all-time net income and the "interest not recorded yet" figure recompute from the journal to the
  cent (30 of 30 compared lines, zero differences). The trial balance balances, every journal entry balances,
  and Assets (2,033,320.28) = Liabilities (1,923,448.11) + Member's equity (109,872.17).
- **The section is not presented in the standard way, and it cannot be added up by a reader.** Standard
  practice is a roll-forward: beginning balance + contributions − distributions + net income = ending balance.
  The tab shows Capital contributions 181,470.71 and Distributions −247,967.49, which sum to −66,496.78, then
  prints a total of 109,872.17. The missing 176,368.95 is this year's net income, which is in the total but has
  no row (`reports.mjs` line 519 only prints a "Retained earnings from before <year>" row, never current-year
  net income). This is the single biggest source of confusion.
- **"Distributions −247,967.49" overstates what Paul actually received.** Only 85,054.32 of it was cash that
  left Recast to Paul (1616 Granite and 280 Sparkling, paid from Citizens). 136,182.03 (104 Ashburne) was
  wired from Recast's Citizens account to Recast's Chase account and then re-booked as a 147,729.38
  "contribution"; 26,731.14 (881 Newport) has not been paid and sits in liabilities. The gross-up is
  defensible as a "distribution declared and reinvested", but only if the row says so. It does not.
- **Two items inside "Capital contributions" do not belong there.** "Bills the business Chase paid −2,263.14"
  treats business bills paid from the business's own bank account as if Paul paid them personally, reducing his
  contribution and creating a 2,263.14 debt to him that will be paid back to him later — in standard terms this
  overstates liabilities and understates equity by 2,263.14 and plants a future disguised payout. "Taken out
  for Paul −574.63" (his truck payment) is a distribution, not a negative contribution.
- **"Interest not recorded yet" 36,731.34 is added to both sides of the balance sheet without being in the
  ledger.** The figure is right (it reproduces only when the per-advance rate column is used: 9% on 136 Bowling
  Green and 206 White Rock, 8% elsewhere), but statements should agree to the books. Post the accrual.
- Everything else found is presentation or code fragility, listed and ranked below. No error in any amount.

---

## What each line means

The section as printed, then what is behind it. Journal references are `txn_id#line`.

### Capital contributions — 181,470.71
The balance of account 9000 "Owner contributions". It is the sum of the four indented rows.

**Put into the business Chase — 149,729.38** (two journal lines, both dated 2026-11-01)
- `manual-20261101-00fc6f0ca1c0-aa63#2` — 147,729.38. On 2026-10-09 Recast wired 147,729.38 from its Citizens
  account to its Chase account (`sale-20261009-18627406fc12`, "paid to Paul — his 104 Ashburne payout";
  `manual-20261009-db29cb233826`, "working money Paul put into the Chase account"). At the time the Chase
  account was being treated as Paul's own money (the builder's D-098), so the books recorded this as: Recast
  paid Paul his 104 Ashburne payout, and Paul lent it back. On 2026-11-01 Paul decided the Chase money belongs
  to the business (D-103), and this line reclassified the "loan" into a capital contribution. In plain words:
  **this is Paul's 104 Ashburne profit (136,182.03) plus 11,547.35 of costs he had fronted on that house, left
  inside Recast and now counted as his capital.** The cash never went to a personal account.
- `manual-20261101-00fc6f0ca1c0-aa63#4` — 2,000.00. The earnest money refunded at the 104 Ashburne closing
  landed in Chase; it had been Paul's money (owed back to him) and is now counted as capital.

**Bills the business Chase paid — −2,263.14** (two lines netted)
- `manual-20261101-00fc6f0ca1c0-aa63#6` — −2,837.77, and `manual-20261101-2c3979d3a874-6256#1` — +574.63.
  Between 10-01 and 11-01 the Chase account paid ten business bills totalling 2,263.14 (Telnyx 5.00, airfare
  516.70, Claude API 80.02, Apple lease 57.99, Uber 141.03, tire shop 270.00, airfare 482.40, lawn care 60.00
  for 104 Ashburne, cleaning 300.00 for 241 Poinsetta, cleaning 350.00 for 658 Erin Hills) and Paul's personal
  truck payment of 574.63. Each bill was booked with four lines: the cost, "paid by Paul" (so Recast owes him
  for it, account 2030), and "Paul's working money taken out of Chase". On 11-01 the "working money taken out"
  legs (2,837.77) were reversed into account 9000 as a reduction of his contribution, then the truck payment
  (574.63) was split out to its own row. **In plain words: the books say Paul's contribution was 2,263.14
  smaller because "his" Chase money paid business bills, and that Recast owes him those 2,263.14 back.** The
  note on the row ("also counted as costs he paid — owed back to him") is the tell: the same dollars appear
  here as a negative and in LIABILITIES as a positive.

**Taken out for Paul — −574.63**
- `manual-20261101-2c3979d3a874-6256#2`. Paul's truck loan payment of 10-14 was paid from the Recast Chase
  account by mistake. The business paid a personal bill for its owner. That is a distribution (a draw).

**Covered 1014 S View's loss — 34,579.10**
- `sale-20260112-b338216e74e3#2` (dated 2026-01-12). 1014 S View (Molalla, Oregon) was Paul's own deal with an
  outside lender; Dennis was not in it. Its costs (420,856.83) were booked as paid by Paul, so Recast owed him
  that much (account 2030). The sale brought in 386,277.73 after closing costs, which went to pay off his
  lender and to Paul, reducing the debt to him. The 34,579.10 still "owed" to Paul was then moved from
  "owed to Paul" into "contributions". **In plain words: the house lost 34,579.10; Paul ate the loss and
  Recast does not owe it back to him. Forgiving a debt the business owes you counts as putting capital in.**
  The same 34,579.10 appears in the P&L section as "1014 S View −34,579.10". That is one fact shown in two
  places (the loss reduces equity through net income; the forgiveness increases it through contributions);
  it is not counted twice in the total.
- Two earlier summary entries for this house (420,856.83 and 386,277.73 through account 9000) were voided
  on 2026-10-04 and replaced line by line; they cancel and do not affect any number.

### Distributions — −247,967.49
The balance of account 9010 "Owner draws & distributions". Five houses, each at exactly its profit:

| House | Amount | Journal | What happened |
|---|---|---|---|
| 1616 Granite | 24,589.28 | `sale-20260724-c4844bddec7d#2` | Paid from Citizens 2026-07-24 (with 3,900.24 of costs he fronted; 28,489.52 total). |
| 280 Sparkling | 30,465.04 | `sale-20260806-e162353297b7#2` | Paid from Citizens 2026-08-06 (with 1,781.80 fronted; 32,246.84 total). |
| 1616 Granite holdback | 30,000.00 | `sale-20260911-03052ddbc3f9#1` | Paid from Citizens 2026-09-11. |
| 104 Ashburne | 136,182.03 | `sale-20260923-528bb281af8a#1` 140,895.81 less `sale-20260923-cc11975455b8#2` 4,713.78 | Declared owed to Paul 2026-09-23; wired Citizens → Chase 2026-10-09; re-booked as contribution 2026-11-01. Never left Recast. |
| 881 Newport | 26,731.14 | `sale-20261002-506757459ac7#1` | Declared owed to Paul 2026-10-02; still unpaid. 20,000 of it relabelled "working money left in Citizens" 2026-10-29; 7,609.53 shown as owed in LIABILITIES. (An earlier version paid in cash, `sale-20261002-97890cf3ceb2`, was voided the same day — "not paid yet".) |

Note the pattern: **every house's entire profit was declared as Paul's distribution on the day it sold.**
Nothing was retained to cover business costs (37,019.44) or the 1014 S View loss (34,579.10). That is exactly
why distributions (247,967.49) exceed all-time net income (176,368.95) by 71,598.54, and why the business can
only have positive equity because 184,308.48 was put back in (149,729.38 cash into Chase + 34,579.10 forgiven).

### Total member's equity — 109,872.17
Computed as all-time net income 176,368.95 + 181,470.71 − 247,967.49 (`reports.mjs` lines 513–515). The net
income is in the number but not on a row. Its note — "what Recast earned and Paul put in, less what was paid
out" — is accurate but refers to an amount ("earned") shown only at the top of the tab.

---

## Recomputation

All lines in the section plus the totals asked for. "Mine" is recomputed from `data/Journal.csv` with every
line dated on or before 2026-11-01 (voids net out naturally). Diff = tab − mine.

| Line | Tab | Mine | Diff |
|---|---:|---:|---:|
| Net income (2026 YTD) | 176,368.95 | 176,368.95 | 0.00 |
| Net income (all-time) | *(not shown)* | 176,368.95 | — |
| Retained earnings from before 2026 | *(not shown; code prints it only when all-time ≠ YTD)* | 0.00 | — |
| Dennis — interest not recorded yet | 36,731.34 | 36,731.34 | 0.00 |
| Total assets (ledger 1,996,588.94 + interest) | 2,033,320.28 | 2,033,320.28 | 0.00 |
| Total liabilities (ledger 1,886,716.77 + interest) | 1,923,448.11 | 1,923,448.11 | 0.00 |
| Capital contributions | 181,470.71 | 181,470.71 | 0.00 |
| — Put into the business Chase | 149,729.38 | 149,729.38 | 0.00 |
| — Bills the business Chase paid | −2,263.14 | −2,263.14 | 0.00 |
| — Taken out for Paul | −574.63 | −574.63 | 0.00 |
| — Covered 1014 S View's loss | 34,579.10 | 34,579.10 | 0.00 |
| Distributions | −247,967.49 | −247,967.49 | 0.00 |
| Total member's equity | 109,872.17 | 109,872.17 | 0.00 |
| Tie: Assets = Liabilities + Equity | adds up | 2,033,320.28 = 1,923,448.11 + 109,872.17 | holds |

Other lines also recomputed and tied to the cent: all five house profits, Business costs, Houses still held,
Costs paid after a house sold (2,288.53 and the 755.86 owed-detail), both cash accounts, Supplies on hand,
Dennis — money he lent, both "Paul — owed from" lines and all 11 of their detail rows (full list in
`recompute.out.txt`).

Trial balance: debits 14,236,660.35 = credits 14,236,660.35. Every journal entry balances individually. No
line is dated after 2026-11-01. 302 lines are dated in 2025; none of them touch income, cost of sales,
expenses or equity, so equity at 2025-12-31 was 0.00 — the beginning balance for 2026 is zero.

**Interest not recorded yet.** Recomputed with the `accrual.mjs` method (monthly compounding on each
advance's own anniversary, 30-day stub, round once) over the ten open advances in `Advances.csv`. With the
Settings rate (8%) alone the figure is 34,671.28. It reproduces the tab's 36,731.34 only when the unlabelled
column that reads "8", "9" or "12" is applied as each advance's own annual rate (9% on 136 Bowling Green's two
advances and 206 White Rock). No interest has been posted against any open advance (the 1200 lines are all
sale-date releases), so the whole 36,731.34 is unposted.

Is showing an unposted accrual on the balance sheet standard? **No.** Financial statements are prepared from
the adjusted ledger; an accrual belongs in the ledger as a monthly entry (debit the house's financing cost
1200, credit accrued interest 2000), after which it appears on the tab because it is in the books, not
because the tab added it. Adding it on both sides keeps the sheet tying, and labelling it is honest, but it
means the tab disagrees with the Totals tab's trial balance by 36,731.34 on both sides and the houses' own
tabs will not foot to "Houses still held". The builder already has `interestForPeriod()` for exactly this.

---

## Findings

Ranked: **Material** = misstates what a line is, or makes the section unreadable in substance; **Presentation**
= right amount, wrong label/place/visibility; **Minor** = fragility or housekeeping.

### Material

**M1. The section does not add up on its face; this year's net income is invisible.**
Evidence: `reports.mjs` lines 513–519 and 540. Visible rows: 181,470.71 − 247,967.49 = −66,496.78. Printed
total: 109,872.17. The 176,368.95 gap is net income, included via `allTime` but never printed as a row; line
519 prints only a "Retained earnings from before <year>" row, and only when all-time ≠ YTD (never, so far).
Standard practice (statement of member's equity) always shows the beginning balance, net income,
contributions, distributions and the ending balance.
Fix: print the roll-forward (see Proposed presentation). Also rename the line-519 row when it does fire — it is
"Net income from before <year>", not "Retained earnings" (retained earnings would be prior net income *less*
prior distributions, and all-time distributions already sit on the Distributions row).

**M2. Business bills paid from the business's own Chase account are booked as if Paul paid them personally.**
Evidence: ten receipt entries 10-01 to 11-01 (`receipt-20261001-035905d0b9e6`, `receipt-20261012-7f1c3cb74663-5db5`,
`receipt-20261014-4f6a1bf2573f-283b`, `receipt-20261023-7efa88fa7894`, `receipt-20261025-03c081b13f4d-0e97`,
`receipt-20261026-cf29ede8e390-567b`, `receipt-20261028-22de28ac82f1-ee0d`, `receipt-20261029-b7b6f9d67b01-c649`,
`receipt-20261030-6061a37559fd`, `receipt-20261101-339a65af9bcc`), each with a "paid by PAUL → owed to Paul (2030)"
leg; `manual-20261101-00fc6f0ca1c0-aa63#5–6` reclassifying 2,837.77 out of contributions; `reports.mjs` line 531
note "also counted as costs he paid — owed back to him". `Bank_accounts.csv` lists the Chase account as "Recast
Chase — Operating", and the tab itself calls it "the business Chase account".
Effect: liabilities "owed to Paul" overstated by 2,263.14 (1,553.14 in "Business expenses owed", 300.00 under
241 Poinsetta, 350.00 of the 353.80 under 658 Erin Hills, 60.00 under 104 Ashburne), Capital contributions
understated by 2,263.14. Total liabilities + equity unchanged, so the sheet still ties — which is why it went
unnoticed. When those houses sell, Citizens will pay Paul 650.00 for bills the business already paid: a
distribution that will look like a reimbursement.
Standard: a payment from an entity bank account is an entity payment, two lines (cost / cash). The owner's
contribution is the cash he put in; what the business then spends it on does not reduce his contribution.
Fix: post plain two-line entries for Chase-paid bills going forward (and for these ten), reverse
`manual-20261101-00fc6f0ca1c0-aa63#5–6`, and delete the "Bills the business Chase paid" row. With P1 applied as
well, Capital contributions becomes 184,308.48 (149,729.38 + 34,579.10), Distributions −248,542.12, "owed to
Paul" drops from 41,888.90 to 39,625.76 (Chase line 4,726.21, Citizens line 34,899.55), and Total member's
equity becomes 112,135.31. The balance sheet still ties (verified by recomputation).

**M3. "Distributions −247,967.49" reads as cash Paul received; most of it is not.**
Evidence: the five 9010 entries above; `sale-20261009-18627406fc12` + `manual-20261009-db29cb233826` (the
Citizens → Chase wire, memo "wired from Citizens to the Recast Chase account"); `manual-20261101-00fc6f0ca1c0-aa63#2`
(reclass to contribution). Of 247,967.49: 85,054.32 was cash paid out of Citizens to Paul (Granite, Sparkling,
Granite holdback); 136,182.03 (Ashburne) moved from one Recast account to another and is now also counted as
147,729.38 of contributions; 26,731.14 (Newport) is unpaid and sits in liabilities (7,609.53 shown as his
Newport payout plus 20,000 relabelled working money).
Standard: a distribution is recorded when assets leave the entity to the member. A declared distribution the
member leaves in and designates as capital may be shown gross (distribution, then contribution) **if** that is
disclosed; silently it misleads — a reader concludes Paul took 248k while the business holds 134k of cash.
The row's note "his share of the house profits" and the Capital contributions note "his 104 Ashburne payout"
are the only clues, on different rows.
Fix (either is acceptable; pick one and say it): (a) keep gross and add a detail row under Distributions —
"of which put back into the business Chase as capital, 10-09: 147,729.38" and "of which not yet paid (881
Newport): 26,731.14"; or (b) net: treat the 10-09 wire as an internal transfer, leave the Ashburne profit
share in "owed to Paul" (2030) until he either takes it or formally converts it, which removes 136,182.03
from Distributions and 147,729.38 from Contributions. Total liabilities + equity is unchanged either way; under
(b) equity itself is 11,547.35 lower, because that part of the wire (costs he had fronted, repaid into Recast's
own account) becomes money owed to him rather than capital.

### Presentation

**P1. "Taken out for Paul −574.63" is a distribution, shown as a negative contribution.**
Evidence: `manual-20261014-246c56d5cf36` (truck payment from Chase), `manual-20261101-2c3979d3a874-6256#2`,
`reports.mjs` lines 526, 532. Standard: a personal bill paid by the business is an owner draw (account 9010).
Fix: move the 574.63 to 9010; Distributions becomes −248,542.12. Total unchanged.

**P2. "Covered 1014 S View's loss 34,579.10" is correct in substance but the label invites double-counting.**
Evidence: `sale-20260112-b338216e74e3`. It is a conversion of a debt Recast owed Paul into capital (debt
forgiveness by the member = contribution). The owner sees "−34,579.10" in the P&L and "+34,579.10" here and
reasonably wonders which is real; both are, and they offset. Fix: label it "1014 S View: what Recast owed Paul
for the shortfall, forgiven — counted as capital" and keep it. Separate question, not verifiable from the
folder: whether a house titled and financed in Paul's own name belongs on Recast's books at all (see "What I
could not verify"). If it does not, the −34,579.10 loss and this +34,579.10 line both come off and nothing
else changes.

**P3. No beginning balance, no year-end closing, all-time and year-to-date mixed in one section.**
Evidence: `reports.mjs` lines 513–519; accounts 9000/9010 are never closed. Contributions and Distributions
are all-time balances, net income is this year's, and the only prior-year row is the mislabelled one in M1.
This year it happens to work because the business's equity started 2026 at zero. From 2027 on the section
will show 2026's net income under "Retained earnings" while 2026's distributions stay inside "Distributions"
— a mismatch. Fix: show "Balance at January 1" (contributions − distributions + net income through the prior
December 31), then the current year's contributions, distributions and net income, then the ending balance.

**P4. The three footnotes on Total member's equity (`reports.mjs` lines 540–542).**
The first fires only when `left === -costs` exactly — a special case written for one past state of the books;
it is dead weight that will fire again only by coincidence. The second ("below zero — more was paid out than
Recast earned") ignores contributions. The third ("what Recast earned and Paul put in, less what was paid
out") describes a number that is not shown (M1). Fix: once the roll-forward is printed, one footnote suffices:
"Assets 2,033,320.28 less liabilities 1,923,448.11."

**P5. Unposted interest shown on the face of the balance sheet.**
Evidence: `reports.mjs` lines 430–434, 455, 462, 497, 510. See Recomputation. Fix: post monthly accruals
(1200 / 2000) with the existing `interestForPeriod`; the tab then needs no side calculation and the houses'
tabs, Totals tab and P&L tab will agree. Until then, label the line "not yet in the books".

**P6. Account 2030 "Due to owner (Paul)" is a legitimate liability, but it carries four different things and
money is shuttled between it and equity.**
Evidence: the two "Paul — owed from" ledgers; `manual-20261101-00fc6f0ca1c0-aa63`; `manual-20261101-75929a194bdd-5343`
(same reclass posted, voided, re-posted in three amounts the same day). In a single-member LLC, carrying the
owner's reimbursable costs and declared-but-unpaid payouts as a liability is standard and fine. Carrying his
"working money" with no interest and no repayment date is borderline — it behaves like capital. Having both
2030 and 9000 is normal; the problem is that the same dollars (M2) sit in both, and that 2030 mixes (i) costs
he paid for houses, (ii) costs he paid for the business, (iii) profit shares declared but not paid, and (iv)
working money. Fix: sub-accounts — 2030 reimbursable costs, 2031 distributions payable (declared, unpaid),
2032 member loan (working money) — and no reclass from 2030 to 9000 without a written member decision stating
the amount and date.

**P7. Negative rows inside "Capital contributions"; the Distributions note.**
Contributions should be a gross positive figure; reductions belong on their own line (P1, M2). The
Distributions note "his share of the house profits" should say "declared" — 26,731.14 is unpaid. Number
formatting (red minus for negatives, indented grey detail rows) is fine.

**P8. Corrections back-dated to the sale date.**
`sale-20260923-cc11975455b8` and `sale-20260923-a1c02af58e28` carry the 9-23 sale date but were made on
2026-11-01 (memo: "personal-accounts check 2026-11-01"). Standard is to date a correction when it is made (or
at least to mark it), so a printout of 9-23 made on 10-15 and one made on 11-02 would differ without anyone
knowing why. Minor in amount (4,713.78), but a habit to stop.

### Minor

**m1. Detail rows are classified by matching text in the description (`reports.mjs` lines 525–534).**
`isBill` = description starts "Paul's money in the business Chase"; `isOut` = starts "Taken out of the
business Chase for Paul"; anything else without a house is "Put into the business Chase"; anything with a
house is "Covered <house>'s loss". All seven live 9000 lines land where intended and the four rows sum to the
account balance (verified). But: the 574.63 correction credit ("…spent — less his truck loan, which was not a
bill") is counted as a "bill" because it happens to start with the right words — it only works because the
description was written to match. A contribution of cash into Citizens, or a non-cash contribution, would be
labelled "Put into the business Chase". A refund of a contribution on a house would print as a negative
"Covered X's loss". The row note is built from text after " — " in the description (line 528). Fix: a `kind`
column on the journal line (deposit / bill / draw / forgiveness) and group on it; descriptions are for people.

**m2. `profitAndLoss()`/`balanceSheet()` read all lines; the detail rows read the void-excluded `live` subset.**
Evidence: `reports.mjs` lines 424, 437, 450, 513 vs 524. Today they agree because every void is dated on or
before today. For any as-of date between an original and its void, they disagree: as of 2026-10-03 the
balance-sheet 9000 balance is 69,158.20 (the 1014 S View summary entries, voided 10-04, are still in) while the
detail rows sum to 34,579.10 — "Capital contributions" would not equal its own detail. Latent, since the tab is
only built for today. Fix: one filter for both; the simplest is to feed `live` to both report functions too.

**m3. The Totals tab's trial balance leaves out account 1530 (Supplies on hand, 377.60), so its TOTAL row shows
(377.60) out of balance.** The ledger itself balances. Add the account to that tab's list.

**m4. `Advances.csv` has blank header names for its date, amount, repaid-date and rate columns**, and the
live interest figure depends on the rate column (see Recomputation). Name them.

**m5. Dates.** The journal export carries dates as M/D/YYYY; `reports.mjs` compares dates as ISO strings
(line 424 and `inWindow`). The loader that normalises them (`journalLines_`) is not in the folder, so this was
not verified; the tab's correct numbers imply it works.

**m6. Housekeeping on 2026-11-01.** The contribution reclass was posted as one 146,891.61 line, voided, and
re-posted as three lines the same day (`manual-20261101-75929a194bdd-5343` and its void). Harmless, but three
same-day voids of large equity entries is the kind of thing a reviewer asks about; a one-line memo on the void
("re-posted as 00fc6f0ca1c0-aa63 to show three amounts") would answer it.

---

## Proposed presentation

Same numbers as booked today (ties to the tab's 109,872.17), laid out as a standard roll-forward. Rows marked
▲ exist only because of findings M2/P1 and would disappear or move once those are fixed.

```
MEMBER'S EQUITY — Paul's stake in Recast, January 1 to November 1, 2026

Balance at January 1, 2026                                               0.00
   (the business had no profit, contributions or payouts before 2026)

Add: Net income, 2026 year to date                                 176,368.95
   (the "Net income" line at the top of this tab)

Add: Capital contributions                                         184,308.48
      Cash Paul put into the business Chase account                149,729.38
         (his 104 Ashburne payout 147,729.38, wired from Citizens 10-09,
          and the 2,000.00 earnest money refund — see Distributions)
      1014 S View shortfall Paul absorbed — what Recast owed him,
         forgiven and counted as capital                            34,579.10

Less: Distributions                                               -248,542.12
      Profit shares on sold houses                                -247,967.49
         1616 Granite 54,589.28 and 280 Sparkling 30,465.04 — paid to Paul from Citizens
         104 Ashburne 136,182.03 — put back into the business Chase as capital (above)
         881 Newport 26,731.14 — not yet paid; owed to Paul (LIABILITIES)
      Personal truck payment paid from the business Chase 10-14 ▲     -574.63

Less: Contributed cash re-booked as owed back to Paul ▲             -2,263.14
      (business bills the Chase account paid, treated as paid by Paul — see M2;
       the same 2,263.14 appears in LIABILITIES under "owed from the Chase account")

Balance at November 1, 2026                                        109,872.17
   = Total assets 2,033,320.28 less Total liabilities 1,923,448.11
```

Check: 0.00 + 176,368.95 + 184,308.48 − 248,542.12 − 2,263.14 = 109,872.17.

If M2 and P1 are fixed (Chase-paid bills booked as ordinary business payments; the truck payment a
distribution), the ▲ 2,263.14 row goes away and the ▲ truck row moves up into Distributions. Ending balance
112,135.31; "owed to Paul" 39,625.76 instead of 41,888.90 — the Chase line 4,726.21 instead of 6,339.35, the
Citizens line 34,899.55 instead of 35,549.55 (241 Poinsetta and 658 Erin Hills lose 300.00 and 350.00). Total
liabilities + equity does not move. (Computed, not estimated: `python3 -I variants.py` applies these
corrections to a copy of the journal and shows every variant still ties.)

If M3 is also resolved the net way (the 10-09 wire treated as Recast moving its own money between its own
accounts, and the 104 Ashburne profit treated as retained rather than paid out), Distributions shows
−112,360.09, Capital contributions 36,579.10 (the forgiven S View shortfall plus the 2,000.00 earnest money),
and the ending balance is 100,587.96 — 11,547.35 lower, because the costs Paul fronted on 104 Ashburne
(11,487.35 after the earnest money and the 60.00 lawn bill) go back to "owed to Paul" (51,173.11 in total)
instead of being counted as capital. Total liabilities + equity is unchanged. The gross way, shown above with
the explanatory sub-rows, is equally acceptable; the point is that the reader can see which it is.

---

## What I could not verify

- **Whose name is on the Chase account.** `Bank_accounts.csv` and the tab call it Recast's operating
  account; the builder's D-098 (10-09 to 10-29) treated its money as Paul's own; D-103 (11-01) reversed that.
  Findings M2 and M3 assume the account is the LLC's. If it is Paul's personal account, the 10-09 wire really
  was a payout, the 11-01 reclass to contributions is then a genuine cash contribution, and M2's bills really
  were paid by Paul — in which case M2 falls away and the "Operating cash" line should not be on Recast's
  balance sheet at all.
- **Whether 1014 S View is Recast's house.** Oregon property, outside lender, bought 2025-09-16, Dennis not in
  it. If title and loan were in Paul's name, standard practice keeps it off the LLC's books (see P2).
- **The loaders not in the folder**: `journalLines_` (date normalisation), `loadAdvances_` (which column
  becomes `rate_annual`), `getAccrualOpts_`, `paulOnlyHouses_`'s source column. The numbers imply they behave
  as assumed; I could not read them.
- **Where the Citizens payouts went.** The 1616 Granite and 280 Sparkling distributions credit Citizens
  (cash left Recast) with payee "Paul Bjork"; no bank statement is in the folder to confirm the destination.
- **That the advances tab is complete** — the interest figure is only as good as the open-advance list.
- **Tax treatment** (`Settings.csv`: dealer_status, cash_or_accrual and de_minimis_elected are all
  "unknown"). Nothing in this section depends on them, but a CPA preparing the return would need them.

---

## Appendix — every journal line on accounts 9000 and 9010

| Date | Acct | Debit | Credit | Status | Entry | House | Description |
|---|---|---:|---:|---|---|---|---|
| 2026-01-12 | 9000 | | 420,856.83 | voided 10-04 | `manual-20260112-77e138cb840a#19` | 1014 S View | Paid with Paul's own money and the lender's loan (summary, replaced line by line) |
| 2026-01-12 | 9000 | | 34,579.10 | live | `sale-20260112-b338216e74e3#2` | 1014 S View | Put in by Paul — the loss on this house |
| 2026-01-12 | 9000 | 386,277.73 | | voided 10-04 | `sale-20260112-d5de02905c64#3` | 1014 S View | Sale money after closing costs (summary, replaced) |
| 2026-07-24 | 9010 | 24,589.28 | | live | `sale-20260724-c4844bddec7d#2` | 1616 Granite | Paid to Paul — costs he fronted and his share |
| 2026-08-06 | 9010 | 30,465.04 | | live | `sale-20260806-e162353297b7#2` | 280 Sparkling | Paid to Paul — costs he fronted and his share |
| 2026-09-11 | 9010 | 30,000.00 | | live | `sale-20260911-03052ddbc3f9#1` | 1616 Granite | Holdback: Paul's share |
| 2026-09-23 | 9010 | 140,895.81 | | live | `sale-20260923-528bb281af8a#1` | 104 Ashburne | Paul's share of the profit, owed to him until he draws it |
| 2026-09-23 | 9010 | | 4,713.78 | live (made 11-01) | `sale-20260923-cc11975455b8#2` | 104 Ashburne | Less the costs found by the personal-accounts check |
| 2026-10-02 | 9010 | 26,731.14 | | voided 10-05 | `sale-20261002-97890cf3ceb2#2` | 881 Newport | Paid to Paul (not paid yet — voided) |
| 2026-10-02 | 9010 | 26,731.14 | | live | `sale-20261002-506757459ac7#1` | 881 Newport | Paul's share of the profit, owed to him until he draws it |
| 2026-10-04 | 9000 | 420,856.83 | | void entry | `void-manual-20260112-77e138cb840a#19` | 1014 S View | VOID of the summary entry |
| 2026-10-04 | 9000 | | 386,277.73 | void entry | `void-sale-20260112-d5de02905c64#3` | 1014 S View | VOID of the summary entry |
| 2026-10-02 | 9010 | | 26,731.14 | void entry | `void-sale-20261002-97890cf3ceb2#2` | 881 Newport | VOID — not paid yet |
| 2026-11-01 | 9000 | | 146,891.61 | voided 11-01 | `manual-20261101-75929a194bdd-5343#3` | — | Put into the business Chase by Paul (one amount; re-posted as three) |
| 2026-11-01 | 9000 | 146,891.61 | | void entry | `void-manual-20261101-75929a194bdd-5343#3` | — | VOID — shown in three amounts, not one |
| 2026-11-01 | 9000 | | 147,729.38 | live | `manual-20261101-00fc6f0ca1c0-aa63#2` | — | Put into the business Chase by Paul — his 104 Ashburne payout |
| 2026-11-01 | 9000 | | 2,000.00 | live | `manual-20261101-00fc6f0ca1c0-aa63#4` | — | Put into the business Chase by Paul — 104 Ashburne's earnest money |
| 2026-11-01 | 9000 | 2,837.77 | | live | `manual-20261101-00fc6f0ca1c0-aa63#6` | — | Paul's money in the business Chase spent — bills it paid before 11-01 |
| 2026-11-01 | 9000 | | 574.63 | live | `manual-20261101-2c3979d3a874-6256#1` | — | …less his truck loan, which was not a bill |
| 2026-11-01 | 9000 | 574.63 | | live | `manual-20261101-2c3979d3a874-6256#2` | — | Taken out of the business Chase for Paul — truck loan payment of 10-14 |

Live 9000: credits 184,883.11 − debits 3,412.40 = **181,470.71**. Live 9010: debits 252,681.27 − credits
4,713.78 = **247,967.49**. Voided pairs cancel exactly.
