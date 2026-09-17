# Open questions

Seven decisions gate the build. **Updated 2026-09-11:** Q-2 answered (D-006), Q-5 answered
for now (D-009), Q-6 answered (D-010). Q-1, Q-3, Q-4 still need the accountant; the new system stores each as a
setting so they no longer block the build.

---

## Q-1 · Where is Paul's tax home? — UNANSWERED · accountant

Governs $8,821.59, which is **47% of all overhead**.

Frequent PDX↔DFW flights between a residence and the market where the properties are
is the exact fact pattern where travel becomes non-deductible commuting rather than
business travel. The travel bucket also needs splitting: away-from-home travel (6700)
versus local jobsite driving that belongs in vehicle (6600).

Settle before another ticket is booked. Raised by the audit lens on 2026-08-26;
it was missing from the plan's first draft entirely.

---

## Q-2 · Entity type, and what is Dennis? — ANSWERED 2026-09-11 · Paul (D-006)

Every property tab splits profit 50/50 as "Individual Share". The cash-advance tab
charges Dennis interest on his advances (`Dennis Little 10203687 $164,360.44` →
`10632505 - Recast Properties LLC`).

- Equity partner → Form 1065, K-1s, capital accounts
- Lender → Schedule C plus interest expense
- Both → the two roles must be separated in the COA (2010/9030 vs 9000/9010)

Determines the entire equity section and the chart of accounts' 9000 series.
**Blocks Phase 1.**

---

## Q-3 · Dealer or investor? — UNANSWERED · accountant

Buying at auction to rehab and resell is dealer activity: properties are inventory,
profit is ordinary income subject to self-employment tax, no 1031, no long-term
capital gains treatment.

Decides whether property costs are COGS or basis, and therefore whether the 1000→5000
release rule in `docs/chart-of-accounts.md` is the right mechanic. **Blocks Phase 1.**

---

## Q-4 · Cash or accrual? — UNANSWERED · accountant

Drives when a rehab cost lands and whether year-end work-in-progress sits on a balance
sheet. With properties straddling year-end this is not academic. **Blocks Phase 0.5**
(the opening trial balance depends on it).

---

## Q-5 · Mileage or actual vehicle? — ACTUAL, for now · 2026-09-11 (D-009)

Cannot take both. Currently doing neither properly: fuel and tolls are logged (actual
method) while a Driversnote subscription is paid for (mileage method), and none of
insurance, repairs, registration or depreciation is captured — so actual is not
substantiated either.

2026 standard rate is 72.5¢/mile. At the DFW↔Midlothian volume, mileage probably wins
and is far less bookkeeping. Answer determines whether the `odometer` GL column or the
fuel receipts are the ones that matter.

**This one costs money every day it stays open.**

---

## Q-6 · Does overhead hit the projects? — NO, ANSWERED 2026-09-11 · Paul (D-010)

Today RECAST BIZ sits above the 50/50 split, so Paul absorbs all $18,947.31 of it
alone. Either allocate overhead to projects on a stated basis, or make absorbing it a
deliberate term of the deal with Dennis rather than an accident of layout.

---

## Q-7 · De minimis safe harbor election? — LIKELY YES · Paul + accountant

Lets sub-$2,500 items be expensed rather than depreciated. The $4,690.15 of tools is
all small-ticket, so this is almost certainly worth electing. Requires an annual
election statement on the return — it is not automatic.

## Q-8 · Staging workbook for the re-run? — ANSWERED 2026-09-17 · Paul (D-025)

Paul proposed a temp Sheets doc to re-run all receipts into and compare before committing.
Claude's recommendation: the new books workbook already is the temp until the D-013 clear
becomes final; a third workbook needs a second bound writer, a second `WRITER_URL`, and a
second paid run. **Answered:** staging is a *copy* of the new workbook with its bound writer; reads stored once, reruns re-post from them; cutover is one clean pass into the real workbook (D-025).

## Q-9 · Which property addresses are gmail.com accounts? — ANSWERED 2026-09-17 · Paul

`104ashburne@gmail.com`, `pvb421@gmail.com` and `recastpropertiestravel@gmail.com` appear in
the mailbox as forwarders. The @recast-properties.com property addresses are Google Groups
into properties@. For Paul's list (104ashburne, 1616granite, 881newport, 136bowlinggreen,
366mesa, 413greenacres, 469brushwood, 200janice, 206whiterock, 280sparkling) the gmail.com
ones each need a sign-in and a consent to scan; the groups need none.
**Answered:** all property addresses are @recast-properties.com groups into properties@;
`104ashburne@gmail.com` was migrated into the properties@ group (its 333 messages are
there). `pvb421@gmail.com` is Paul's personal mailbox — listed, used by id only (audit §10).
`recastpropertiestravel@gmail.com` is a forwarder, not listed. Listings complete: paul@,
properties@, pvb421@.
