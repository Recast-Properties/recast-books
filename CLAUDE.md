# Recast Books — the bookkeeper app

Read `BUILD-PLAN.md` for what is being built and why, `docs/phase0-spec.md` for the
technical contract, and `docs/decisions.md` before proposing anything that reverses a
decision. `PLAN.md` is the accounting design the app implements.

## What this repo is

The **new, separate** bookkeeping system for Recast Properties LLC, built alongside the
current workbook and receipts bookkeeper (`../Recast-site/`), which Paul keeps using
until the parallel run proves this one. A Google Sheets workbook is the system of
record; Claude is the bookkeeper; a web app at **books.recast-properties.com** is the
front door.

- `web/` — static front end (Netlify publish dir); `netlify/functions/` — `/api/*`;
  `lib/` — pure modules (posting engine, auth, writer client, COA, money), unit-tested;
  `apps-script/writer/` — the only thing that writes the workbook; `docs/`, `data/` — design.
- Live ids (workbook, Apps Script project, Netlify site) are in `docs/phase0-spec.md` §10.
- `npm test` runs everything (node:test, zero dependencies). Deploy: `npm run deploy`
  (`netlify deploy --prod --no-build`). Writer: `clasp push -f` then
  `clasp deploy -i <deploymentId>` from `apps-script/writer/` — update the existing
  deployment so `WRITER_URL` never changes.

## Load-bearing constraints

1. **Never touch the old workbook** (`1isEbfNKPO32Wpf08EtLkNHX85c0rTIl8tpH9bUdgQbs`),
   anything under `../Recast-site/`, or the two live receipts Apps Script projects.
   Migration reads the old workbook; nothing here ever writes to it.
2. **Every write goes through the Apps Script writer** behind its ScriptLock. Functions
   read through it too. No Sheets API writes from anywhere else.
3. **Claude decides, code executes.** Model judgment for reading, classifying, matching;
   deterministic code for arithmetic, balanced entries, `txn_id` identity, the gates
   (autofile ceiling, period lock, 1099 block). The UI must show which was which.
4. **Overhead never touches a property** (D-010). **All Dennis interest is a property
   cost** (D-011). Both are enforced in `lib/posting.mjs`, not policy text.
5. **Dry run, back up, tie out twice** for anything touching history (Phase 4).
6. **Paul acts one step at a time.** When he must do something (console, editor,
   Terminal), give exactly one step and wait.

## Status

**Phase 0 and Phase 1 complete 2026-09-11.** Phase 0 gate: `docs/phase0-spec.md` §11.
Phase 1 gate: `docs/phase1-spec.md` §8 (accrual engine to the cent, reports tie, interest
posting). Next: **Phase 2 — receipts bookkeeper v2** per `BUILD-PLAN.md` §7 — on Paul's go.
Paul still owes Dennis's and the accountant's Google emails for the Users list (Settings
page can add them).

Test data in the live workbook: Journal holds the PHASE 0 and PHASE 1 gate entries, all
voided (append-only ledger — they stay); Properties has `TEST Phase 1 gate` and Advances
has its voided row — Paul may delete those two rows by hand.
