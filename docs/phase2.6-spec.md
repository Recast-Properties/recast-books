# Phase 2.6 — Property mailboxes and property tabs

Written 2026-09-14 for Paul's go. Start with **1616 Granite** only, to work out the kinks;
every other property follows by registering it.

## 1 · Where property mail lives

Each property has a Google Group `<alias>@recast-properties.com` (e.g.
`1616granite@`) whose member is **properties@**, with a Gmail label named for the
property inside that mailbox (`Recast-site/ADMIN.md`, group model). The mail is
therefore in **properties@**, not paul@. The poller runs as the mailbox it reads, so:

- The existing "Recast Books Poller" project (runs as paul@) keeps reading receipts@ and
  travel@ exactly as today.
- A **second copy of the same poller code** runs as **properties@** ("Recast Books
  Poller — properties"). Same `Code.gs`, same `/api/upload`, same `POLLER_SECRET`; a script
  property `MAILBOX = properties` switches its search to the property addresses. Nothing
  in the old system is touched: this instance labels only `books-done` in properties@.

## 2 · Registration is the Gmail label (no email column)

Paul, 2026-09-14: "when a property email is created it should automatically register it
with the poller moving forward." The email-setup tool in Recast-site (never modified from
here) already creates, per property email, a **Gmail label in properties@ named for the
property** plus a filter that routes the group's mail into it. That label is the
registration. The properties@ poller lists the mailbox's user labels each run, drops
`books-done` and anything not matching a registered property, and searches the rest.

Match rule: label name ↔ Properties `name`, compared after lower-casing and removing
spaces and punctuation (`881Newport` ↔ `881 Newport`). An unmatched label is **skipped and
logged** — its mail is left untouched (no `books-done`), so registering the property later
picks all of it up on the next poll, subject to `START_DATE`.

## 3 · `GET /api/property-mailboxes` (poller secret)

Returns `[{name, key}]` for properties with status held or under contract (`key` is the
normalised name), read through `readTab`. The properties@ poller intersects this with its
labels and builds, per matched label:

```
label:"1616 Granite" after:<START_DATE> -label:books-done
```

**Labels flow the other way too.** Each run the properties@ poller first POSTs its user
labels (minus `books-done`) to `/api/property-mailboxes` (poller secret); the function
stores them in Blobs `books-cache` under `mailbox/labels` with a timestamp. The Properties
page's add form reads them (`GET /api/property-mailboxes` with a session returns
`{labels, registered, fetchedAt}`) and offers the **name as a dropdown of label names**
(labels already registered are marked; a final "no property email yet" option reveals the
free-text field). Paul, 2026-09-14: "remove any chance for error." The dropdown lists
exactly the mailboxes the poller can see, so a registered name always matches its label.

`START_DATE` is this instance's own script property (`2026-04-01` for the Granite
exercise). `channelOf_` returns the property **name** from the registry for the label the
thread carries; the per-message inbox check becomes "carries a matched label". `dryRunBatch`
uses the same label set with DRY_QUERY.

## 4 · Ingest: channel is a property name

`books-upload.mjs` accepts any channel string that is `receipts`, `travel`, `upload`, or the
name of a property in the allowlist (checked against `readTab("Properties")`). The
envelope carries it. `books-ingest-background.mjs` adds to the model's context:

> This document was sent to the mailbox for property **<name>**. Post it to that property
> unless the document itself plainly names a different one or is company overhead
> (then say why in `why`).

Prompt gains the matching paragraph under property routing. The gate is unchanged: the
property must be in the allowlist, so a sold and locked property refuses on its own.

## 5 · Property tab — writer `propertyTab` action + `setupPropertyTab(name)`

Formula-only, generated when a property is added (Properties page add → after the upsert,
POST `/api/meta {action:"propertyTab", name}` → writer creates/rebuilds the tab named
exactly as the property), rebuilt by the Dennis page after each advance, and rebuildable
from the editor (`rebuildAllPropertyTabs()`). **Layout (as of 2026-09-15, after a day of
Paul's review against the old workbook's `881 Newport` tab):** a narrow spacer column A,
then side by side —

```
B:C  SUMMARY                       E:H  DENNIS                            J:P  REHAB COSTS          R:X  UTILITIES
     Total Project Cost                 Purchase Principal + Interest          payee · date · desc ·     (Holding-class lines,
     Purchase Principal + Interest        Start · End (typed) · Principal ·    amount · Paul Paid ·      same shape)
       (1000 else registry price,         Interest to Date (one row)           Dennis Paid · Recast
       plus its interest)               Paul Paid / Received (advances,        Account (checkboxes
     Cash Advance Interest                refunds) — 2030                      from paid_from), 300
     Rehab Costs                       Dennis Paid direct / Received          rows, one spilling
     Utilities (Holding ex-1100)       Recast Account Paid / Received        SORT(FILTER) per block
     Property Tax (prorated, $x/yr)    Cash Advances + Interest
                                         Start · End (typed) · Principal ·
     PROFIT BREAKDOWN                    Interest to Date (n + 1 rows)
       Sale Price (typed, kept)
       Total Project Costs
       Agent x% · Closing x%
       Net Profit
       Dennis Share (p%) · Paul Share
     PAYOUTS
       Dennis = purchase principal & interest + cash advances + interest + Dennis share + direct
       Paul   = Paul share + due to Paul
       Back to Recast account
```

**End Date is typed on the tab.** Each schedule row's End Date cell holds
`Advances.repaid_date` as a value; an installable onEdit trigger in the writer project
(`onPropertyTabEdit`, installed by `setup()` / `installTriggers()`) writes a typed or
cleared date back to the matching Advances row (same property, start date, principal)
and flips its status. Interest on that row stops at the End Date on the tab and in the
app's accrual engine alike (D-011). It is the one other typed cell besides Sale Price.

Colours (Paul's): heads `#a3f67f`, totals `#ceffbc`, sub-heads `#ffe599`, checkbox
columns `#fff2cc`, payout totals `#fff2cc`, share rows yellow, the typed Sale Price `#cfe2f3`. Helpers sit in
AI:AV greyed (rate, stub basis, settlement_date, contract_price, per-advance math incl.
the advance's own `rate_pct`, tax_annual, proration estimate, `dennis_share_pct`); the
Journal-wide voided flag is on the hidden `Journal helpers` sheet so no array formula
grows the tab past its 305 rows. `Advances.kind` (purchase / cash) picks the schedule;
`Advances.rate_pct` (blank = Settings rate) and `Properties.dennis_share_pct` (blank = 50)
feed the interest and the split (D-022).

Rehab Costs = Rehab class plus Acquisition class other than account 1000 (the old tab
put the HOA release in Rehab). Property Tax is posted 1100 lines plus, while the property
is unsold, the Texas seller proration of `Properties.tax_annual` (column L, from the add
form) from January 1 of the as-of year to the as-of date over 365 — the figure the old tab
typed; Net proceeds subtracts the same estimate, since the proration is netted on the ALTA
and never paid from an account. At the sale the wizard posts the settlement statement's
actual tax line and the estimate drops to zero. Interest to Date is computed in-sheet with the D-006
method at `Settings!interest_rate_annual` (8%, D-016) on every Advances row for the
property, so Financing-class (1200) accruals are left out of Total Project Cost and
nothing double-counts. **The tab is the forecast while held** (Paul, 2026-09-15): Sale
Price is the one typed cell (kept across rebuilds; seeded from `contract_price`), the
agent/closing percentages are estimates, and there is no settlement tie-out here. The
actuals from the settlement statement, Dennis's interest true-up and the
payouts-equal-net-proceeds check live on the **closing tab** the Phase 5 sell wizard
builds beside this one (BUILD-PLAN §5). Helpers live in AI:AS, greyed; the voided flag on
the hidden `Journal helpers` sheet. All SUMPRODUCT / FILTER over
bounded Journal rows, voided pairs excluded via the same helper-column trick as Totals.
The tab is a view; nothing on it is typed except Sale Price, the End Dates and the paid-by
boxes. **The Rehab Costs and Utilities rows are values written by the writer**
(`refreshLineBlocks_`, after every post/void and on rebuild), not a formula spill, because
a checkbox showing a formula's result cannot be clicked: ticking Paul Paid / Dennis Paid /
Recast Account on a line voids that entry and re-posts it with the new `paid_from` through
the same onEdit trigger (Paul, 2026-09-15). Recast Account from Paul or Dennis lands on 1401. Sold properties keep their tab; the Phase 5
release/payoff entries zero the summary, which the sell wizard owns.

## 6 · Tests

Writer lint (no A1 getRange, new action wired); `/api/property-mailboxes` auth + shape +
name normalisation;
upload accepts a property channel and refuses an unknown one; label POST stores and
session GET returns them; ingest passes the
mailbox hint; prompt-sync. `npm test` green.

## 7 · Gate (1616 Granite)

1. Paul registers 1616 Granite (status **under contract** for the exercise — the sell
   wizard is Phase 5; the name must match the Gmail label "1616 Granite") and records Dennis's
   three advances ($279,001 on 2026-04-07; $5,500 on 06-01; $1,338 on 06-05).
2. The properties@ poller is set up (Paul signs in as properties@, creates the project,
   pastes the same `POLLER_SECRET`, runs `setup()`), `START_DATE = 2026-04-01`.
3. Dry run over the 21 Granite threads; Paul reviews the cards; kinks fixed.
4. Live run; the tab shows the posted lines by cost class, Dennis's block shows
   interest to 2026-07-27 within a few dollars of his $6,873.90.
5. Old receipts system untouched; properties@ mail carries only the `books-done` label.

Known limit: the mailbox holds a third of Granite's history (Home Depot runs went to
receipts@); the rest arrives with the Phase 4 migration. Everything posted here is
cleared under D-013.
