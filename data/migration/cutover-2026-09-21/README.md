# Cutover day, 2026-09-21

`old-workbook-cutover.xlsx` - the old workbook as Paul downloaded it at 14:10 PT, after he stopped typing in it
(runbook step 1-2). Diffed against `../2026-09-17/old-workbook-snapshot.xlsx` cell by cell (130 changed cells)
and row by row with `scripts/migration-audit-indep.py` (1,029 → 1,032 rows).

**No row Paul typed since 09-17 is missing from the migration.** What changed:
- Interest and summary cells on every held tab and the Cash Advances tab - formulas moving with the date.
- 104 Ashburne AT16: the text `450,00` is now the number 450.00 (Paul's fix of C-1a; migrated at $450.00 already).
- 136 Bowling Green N38: "Paul Paid" unticked on Lupe's $160.00 (C-13, Dennis paid; migrated as DENNIS already).
- Three new rows, all written by the OLD receipts poller (`Receipt` marker), none typed by Paul:
  - RECAST BIZ / Materials: Amazon 02-08 drawer pulls $249.98 and Amazon 02-22 light bulbs $10.81 - the two
    pvb421 orders Paul forwarded to receipts@ today at Claude's request (audit §48). Both are ALREADY rows on the
    104 Ashburne tab ($249.97, $10.81) and in the migration: **duplicates in the old books, not migrated.**
    Claude's side effect - the forward to receipts@ feeds both pollers. Paul may delete the two rows before the
    old workbook goes read-only.
  - RECAST BIZ / Travel: Uber 09-18 $33.30 - a live receipt after the snapshot; it is pending in the new Inbox
    (`gm-1a0b79715229b822`) and enters the new books through the live lane after the flip (runbook step 13-14),
    not through the migration.
Delta to migrate: none. The dry run stands: 1,048 entries, $240,844.35.
