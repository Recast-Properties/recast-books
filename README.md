# Recast Books

Bookkeeping and accounting architecture for **Recast Properties LLC** — the chart of
accounts, the general ledger schema, the 1099 program, and the phased migration from
the current Google Sheets workbook to a standardized one.

Since 2026-09-11 this repo is also **the application**: the new, separate bookkeeper
(web app at books.recast-properties.com, Netlify functions, the Apps Script writer, the
posting engine). The current receipts automation in `../Recast-site/` keeps running
untouched until the parallel run in Phase 6. See `BUILD-PLAN.md` and `CLAUDE.md`.

## Status

**Phases 0–2.7 built and gated (2026-09-11 → 15)**, see `CLAUDE.md` for the current
state and `CHANGELOG.md` for the day-by-day. The receipts bookkeeper is live in parallel;
since Phase 2.7 (D-023) the input side of the books is the **Recast Books** menu in the
workbook, with the writer bound to it, and the web app keeps sign-in, Inbox, Upload and
API costs. The accounting plan went through one adversarial review (five expert lenses,
35 findings, `docs/review-2026-08-26.md`).

Nothing here ever writes to the old workbook; migration (Phase 4) reads it.

## Start here

| File | What it is |
|---|---|
| `PLAN.md` | The architecture plan — 13 sections, source of record |
| `docs/decisions.md` | Decision log. Read before proposing anything that reverses one |
| `docs/open-questions.md` | The seven gating decisions, four still unanswered |
| `docs/chart-of-accounts.md` | Full COA with account codes |
| `docs/ledger-schema.md` | The 22-column GL spec |
| `docs/policies.md` | Capitalize-vs-expense, autofile, 1099 rules |
| `docs/review-2026-08-26.md` | Adversarial review findings and dispositions |
| `data/vendors-1099-2026.md` | Per-payee totals and W-9 status |
| `plan.html` | Rendered plan (published as a Claude artifact) |

## The one thing that is actually urgent

W-9 collection. Nine payees cleared the 2026 threshold, zero W-9s on file, and the
January 31 deadline does not move. It has no dependency on any phase of this plan.
See `data/vendors-1099-2026.md`.

## The live workbook

Google Sheet `1isEbfNKPO32Wpf08EtLkNHX85c0rTIl8tpH9bUdgQbs`
- `RECAST BIZ` — company overhead, 11 side-by-side category blocks
- One tab per property — project P&L, two templates (light / heavy)
- Cash-advance/draw tab, contractor directory

## Conventions

- Every migration script dry-runs before it applies and backs up before it writes.
- No script ever writes to the old workbook.
- Totals are verified twice by different paths. A script that cannot tie out stops
  and reports rather than guessing.
