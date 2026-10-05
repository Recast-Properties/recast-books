# Recast Books

Bookkeeping and accounting architecture for **Recast Properties LLC** — the chart of
accounts, the general ledger schema, the 1099 program, and the phased migration from
the current Google Sheets workbook to a standardized one.

Since 2026-09-11 this repo is also **the application**: the new, separate bookkeeper
(web app at books.recast-properties.com, Netlify functions, the Apps Script writer, the
posting engine). Since the 2026-09-21 cutover it keeps the real books; the old receipts
automation in `../Recast-site/` is switched off for the books. See `CLAUDE.md` first, then `BUILD-PLAN.md`.

## Status

**Phases 0–2.7 built and gated (2026-09-11 → 15); pollers audited 2026-09-16**, see `CLAUDE.md` for the current
state and `CHANGELOG.md` for the day-by-day. Since Phase 2.7 (D-023) the input side of the
books is the **Recast Books** menu in the workbook, with the writer bound to it; Paul works only
in the workbook (CLAUDE.md constraint 8) and the web app carries the `/api/*` functions. **Cutover done 2026-09-21: the real books hold the migrated old books (1,048 entries tied out to the cent, every
receipt link a Drive file) and live receipts since; the old workbook is closed (`docs/phase4-audit.md` §51,
`HANDOFF-2026-09-23.md`).** The accounting plan went through one adversarial review (five expert lenses,
35 findings, `docs/review-2026-08-26.md`).

**As of 2026-10-04:** three closed sales are in the books - 1616 Granite, 280 Sparkling and 1014 S View (Paul's own
2025 deal in Molalla OR, brought in line by line from his sheet "Recast 2025", D-079) - each with a frozen house tab
and a closing tab; eight houses are held. The workbook's `P&L` and `Taxes` tabs rebuild themselves every hour (D-064,
D-075, D-078); the bank statement work (Phase 3) is in progress. The house tabs and closing tabs add up the Journal
to its last row, however long it gets (D-080; they stopped at row 5,000 before).

Nothing here ever writes to the old workbook; migration (Phase 4) reads it.

## Start here

| File | What it is |
|---|---|
| `CLAUDE.md` | Current state and the rules; resume from the newest `HANDOFF-*.md`, section START HERE |
| `PLAN.md` | The 2026-08-26 architecture plan (historical; BUILD-PLAN.md and decisions.md supersede it) |
| `docs/decisions.md` | Decision log. Read before proposing anything that reverses one |
| `docs/open-questions.md` | The seven gating decisions, four still unanswered |
| `docs/chart-of-accounts.md` | The first COA draft; the binding chart is `docs/phase0-spec.md` §6 and `lib/coa.mjs` |
| `docs/ledger-schema.md` | The 22-column GL spec |
| `docs/policies.md` | Capitalize-vs-expense, autofile, 1099 rules |
| `docs/review-2026-08-26.md` | Adversarial review findings and dispositions |
| `data/vendors-1099-2026.md` | Per-payee totals and W-9 status |
| `plan.html` | Rendered plan (published as a Claude artifact) |

## The one thing that is actually urgent

W-9 collection. Nine payees cleared the 2026 threshold, zero W-9s on file, and the
January 31 deadline does not move. It has no dependency on any phase of this plan.
See `data/vendors-1099-2026.md`.

## The workbooks

- **Live: "Recast Books"** `12QVyxm3KnLD7CDC8mFAPd5ulZuRXRluNDi4qK4BBxKM` - the real books since the
  2026-09-21 cutover. Only the Apps Script writer writes to it.
- **Old, closed: "Recast 2026 CLOSED 2026-09-21"** `1isEbfNKPO32Wpf08EtLkNHX85c0rTIl8tpH9bUdgQbs` -
  frozen and view-only. Never write to it (CLAUDE.md constraint 1); the migration only read it.

## Conventions

- Every migration script dry-runs before it applies and backs up before it writes.
- No script ever writes to the old workbook.
- Totals are verified twice by different paths. A script that cannot tie out stops
  and reports rather than guessing.
