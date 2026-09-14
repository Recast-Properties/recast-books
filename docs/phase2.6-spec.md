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

## 2 · Properties tab gains `email`

`TAB_HEADERS.Properties` appends `email` (the group address). The Properties page's add /
edit form gets the field. The property allowlist is unchanged (held / under contract).

## 3 · `GET /api/property-emails` (poller secret)

Returns `[{name, email}]` for properties with status held or under contract and a
non-empty email. Read through `readTab` (snapshot). The properties@ poller calls it once
per run and builds its search:

```
(to:1616granite@recast-properties.com OR to:<next>@...) after:<START_DATE> -label:books-done
```

`START_DATE` is this instance's own script property. For the Granite exercise it is set to
`2026-04-01` so the June–August mail is in scope. The per-message inbox check accepts any
address in that list; `channelOf_` returns the **property name** (from the same list) for
a match. `dryRunBatch` works the same way (DRY_QUERY over the same addresses).

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
exactly as the property), rebuildable from the editor. Layout (blocks by **cost class**
per the chart; "paid by" is `paid_from`, shown as PAUL / DENNIS / the bank account name):

```
<name>                                   status · purchase date · price · as of B1
SUMMARY                                  DENNIS
Acquisition / Rehab / Holding /          advances from Advances (date, amount, kind)
Financing / Selling / Total project      accrued interest to B1 at Settings rate
Paid by Paul (2030 lines on this prop)   payoff at B1
Paid by Dennis direct                    PRELIMINARY PAYOUT (Settings % estimates)
LINES — one block per cost class: date · payee · description · amount · paid by
POST-SALE (D-015): 5000 lines on this property dated after settlement
```

All SUMPRODUCT / FILTER over bounded Journal rows, voided pairs excluded via the same
helper-column trick as Totals. Interest is computed in-sheet with the D-006 method at
`Settings!interest_rate_annual` (8%, D-016): compounding on anniversaries, stub days
simple over `stub_days_basis`. The tab is a view; nothing on it is typed.

Sold properties keep their tab. `setupTotals` gains nothing.

## 6 · Tests

Writer lint (no A1 getRange, new action wired); `/api/property-emails` auth + shape;
upload accepts a property channel and refuses an unknown one; ingest passes the
mailbox hint; prompt-sync. `npm test` green.

## 7 · Gate (1616 Granite)

1. Paul registers 1616 Granite (status **under contract** for the exercise — the sell
   wizard is Phase 5), email `1616granite@recast-properties.com`, and records Dennis's
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
