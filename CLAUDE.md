# Recast Books — accounting architecture

Read `README.md` for orientation, then `docs/decisions.md` before proposing anything.

## What this repo is

Documentation and migration tooling for standardizing Recast Properties LLC's books.
The books live in Google Sheets; this repo describes how they should be structured and
how to get there without breaking the live workbook.

**Not this repo:** the receipts automation itself (that is `../Recast-site/`, see its
`RECEIPTS.md`), the auction/title pipeline (`../Auction Sheets/`), the property app
(`../Recast-app/`).

## Load-bearing constraints

These are not preferences. Violating one loses data or money.

1. **Never write to the live workbook.** Migration reads it, Phase 0 snapshots it, and
   it goes read-only at cutover. It is never edited by a script.
2. **Dry run before apply, back up before write.** The existing `receipts-sheet-sort.gs`
   in `../Recast-site/apps-script/` is the reference implementation of this pattern —
   it locates blocks by NAME (never hardcoded columns), backs the tab up first, and
   refuses to finish if any block total moved.
3. **Tie out twice by different paths.** A script that cannot reconcile stops and
   reports. It never guesses and never auto-assigns an unmapped row.
4. **The receipts poller's 90-day window is load-bearing.** Documented in
   `../Recast-site/RECEIPTS.md`. Widening it re-ingests hand-entered historical rows as
   duplicates the writer's 6h cache cannot catch. Do not widen it. Backfills go through
   an explicit list of Gmail message ids.
5. **Paul declined QuickBooks** (2026-08-26, after a full case for it). The books stay
   in Sheets. Do not re-pitch it unprompted. The GL is kept export-shaped anyway so the
   decision stays reversible.

## Current phase

Planning complete, nothing built. Four of seven gating decisions are unanswered —
see `docs/open-questions.md`. Three of them are for Paul's accountant and block
Phase 1.

The exception is W-9 collection, which has no dependencies and is genuinely urgent.

## Working style

- Confirm plans before writing code. One task at a time.
- Flag scope drift rather than expanding into it.
- Smallest change that completes the named task.
- Mind token burn on multi-agent work — prefer cheap models for bulk passes.
