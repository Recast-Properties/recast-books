# Property tab anatomy — 881 Newport (light template), read 2026-09-11

Source: live workbook, tab gid `1642040933`. Read via gviz. This is the reference the new
system's property balance sheet, accrual engine and Payout report must reproduce.

## Layout (columns, 0-based)

| Cols | Block |
|---|---|
| 1–3 | Summary: Rehab Total (= Costs + Utilities), Total Project Cost, Profit Breakdowns, Payouts |
| 5–8 | Purchase Principal + Interest (Start, End, Principal, Interest); Paul Paid / Reimbursed / Dennis Paid / Recast Account; cash-advance schedule |
| 10–16 | Rehab Costs: payee, date, description, amount, ☐ Paul Paid, ☐ Dennis Paid, ☐ Recast Account |
| 18–24 | Utilities: same shape |

Checkbox meaning was inferred and confirmed arithmetically: Paul-Paid items sum to
$2,044.39 = the $2,000 cash-advance reimbursement + $44.39 Recast reimbursement; Recast
items ($356.92) + the $44.39 it reimbursed Paul = $401.31 "Back to Recast account".

## Interest math — reproduced to the cent

**Rule:** 9% ÷ 12 = 0.75% per month, compounded on each advance's own monthly
anniversary; stub days after the last anniversary accrue simple interest on the
compounded balance **over a 30-day month** (÷31 does not match).

| Advance | Start | As of | Anniversaries | Stub | Computed | Sheet |
|---|---|---|---|---|---|---|
| Purchase principal $207,000.00 | 6/29/2026 | 9/11/2026 | 2 | 13 d | $3,799.52 | $3,799.52 |
| Cash advance $2,000.00 | 7/9/2026 | 9/11/2026 | 2 | 2 d | $31.13 | $31.13 |

## Two kinds of Dennis money on this tab

1. **Purchase principal.** Interest is a **project cost** (inside Total Project Cost), so
   it reduces net profit and both shares equally.
2. **Cash advance ($2,000, 7/9/2026).** Went to reimburse Paul for costs he fronted. Its
   interest ($31.13) is **charged to Paul personally** — "+ from Paul" on Dennis's payout,
   "− to Dennis" on Paul's — not to the project. **Paul to confirm this is intentional**
   (2026-09-11 question).

## Waterfall as the tab computes it

```
Sale price 290,000 − Agent 3% 8,700 − Closing 2% 5,800 = net proceeds 275,500
Total Project Cost 219,173.99 → Net Profit 56,326.01 → Individual Share 28,163.00
Dennis: principal+interest 210,799.52 + share 28,163.00 + cash advance 2,000 + its interest 31.13 = 240,993.65
Paul:   share 28,163.00 − cash-advance interest 31.13 = 28,131.88
Back to Recast account: 401.31
Sum of payouts 269,526.84; gap to net proceeds 5,973.16 = prorated property tax 5,526.49 (a closing debit, correct) + 446.67 (see error below)
```

## Errors found on the tab

- **Utilities counted twice in Total Project Cost.** "Rehab Costs $2,401.31" is already
  Costs + Utilities, and "Utilities $446.67" is listed again. Net profit is understated by
  $446.67; each share by $223.33. Corrected net profit $56,772.68, share $28,386.34.
- Typos only: "Tiotal", "Inteest", "Reacst".

## What the new system takes from this

- Per-property balance sheet with Dennis's advances as liabilities, typed as
  *purchase principal* or *cash advance*.
- Accrual engine rule above, with a golden-set fixture from these two advances.
- Payout report must tie to net proceeds to the cent and show property-tax proration as a
  closing line, not a payout — the tab's gap proves why the tie-out check matters.
- Payer per line (Paul / Dennis / Recast) is exactly the `paid_from` attribute.
