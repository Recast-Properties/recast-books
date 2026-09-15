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
   cost** (D-011, reaffirmed D-021: interest follows the money). D-010 is enforced in
   `lib/posting.mjs`; the interest accrual is the close job in `books-dennis.mjs`.
5. **Dry run, back up, tie out twice** for anything touching history (Phase 4).
6. **Paul acts one step at a time.** When he must do something (console, editor,
   Terminal), give exactly one step and wait.

## Status

**Phases 0, 1 gated 2026-09-11; Phase 2 gated 2026-09-12; Phase 2.5 (read cache) shipped 2026-09-12; hardening 2026-09-14 (invoice-keyed txn_id, cache warmer, Totals tab, voided pairs hidden; D-015 two locks, D-016 Dennis 8%); Phase 2.6 (property mailboxes via a properties@ poller, property tabs, D-017 Held/Sold) built 2026-09-14, gate in progress on 1616 Granite.**
Phase 0 gate: `docs/phase0-spec.md` §11. Phase 1 gate: `docs/phase1-spec.md` §8. Phase 2
(receipts bookkeeper — Claude directs the read with zoom/ledger/vendor/property/docs tools,
`lib/gate.mjs` enforces the rails, Gmail poller + web upload, Drive filing, Inbox/Upload
pages, 3 AM digest) is **live for receipts@/travel@ mail dated 2026-09-11 onward** and
posts to the new workbook only. Gate record: `docs/phase2-spec.md` §11. Reads come from Blobs snapshots (`readTab`,
`docs/phase2.5-spec.md`); every write handler refreshes the tab it wrote. Phase 2.6
(`docs/phase2.6-spec.md`) adds a second poller instance running as properties@ for the
property mailboxes and a formula tab per property. Next is Phase 3 (banking from statement uploads — D-019 dropped Plaid on
2026-09-15; spec `docs/phase3-spec.md` awaiting Paul's review).

Policy learned in the Phase 2 gate (D-012): the bookkeeper decides the easy cases itself —
PDX↔DFW travel posts with a written purpose; a confident dismiss is final; duplicates are
caught by invoice number with a fresh ledger read before any post. Card last-4s live on
`Bank accounts` (1401 → 5450) and Settings `paul_personal_last4` (9166); the model is
shown them with every document.

Operating notes: deploy = `npm run deploy`; writer = `clasp push -f` + `clasp deploy -i
<id>` from `apps-script/writer/`; poller = `clasp push -f` from `apps-script/poller/`
(runs latest saved code, no deploy). Netlify function logs:
`npx netlify-cli logs --source functions --function <name> --since 15m` (unreliable —
prefer the envelope's `error`/`error_stack`). Paul still owes Dennis's and the
accountant's Google emails for the Users list (Settings page can add them). D-018: Anthropic
top-ups post to 1520; `/api/api-costs` expenses usage monthly by Console workspace
(needs `ANTHROPIC_ADMIN_KEY`; the poller calls it on the 2nd). D-013: the new workbook is cleared once at the start of
Phase 4, then history is migrated and live receipts replayed; append-only from then on.

Test data in the live workbook: Journal holds the PHASE 0/PHASE 1 gate entries, all
voided (append-only ledger — they stay); Properties has `TEST Phase 1 gate` and Advances
its voided row — Paul may delete those two rows by hand.
