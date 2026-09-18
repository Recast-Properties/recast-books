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
  (`netlify deploy --prod --no-build`). Writer: `clasp push -f` from `apps-script/writer/` (menus and triggers run the
  pushed code at once); `clasp deploy -i AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w`
  only when `doPost` changes, so `WRITER_URL` never changes.

## Load-bearing constraints

1. **Never touch the old workbook** (`1isEbfNKPO32Wpf08EtLkNHX85c0rTIl8tpH9bUdgQbs`),
   anything under `../Recast-site/`, or the two live receipts Apps Script projects.
   Migration reads the old workbook; nothing here ever writes to it.
2. **Every write goes through the Apps Script writer** behind its ScriptLock. Functions
   read through it too. No Sheets API writes from anywhere else.
3. **Claude decides, code executes.** Model judgment for reading, classifying, matching;
   deterministic code for arithmetic, balanced entries, `txn_id` identity, the gates
   (autofile ceiling, period lock, 1099 block). The UI must show which was which.
4. **Overhead never touches a property** (D-010). **Every Dennis advance is against a
   property and its interest is that property's cost** (D-011, D-021, D-022). D-010 is
   enforced in `lib/posting.mjs`; the interest accrual is the close job in `books-dennis.mjs`.
5. **Dry run, back up, tie out twice** for anything touching history (Phase 4). **The old
   books are the target (D-027):** the migration reproduces them row by row in the new
   system with the receipt linked; the read is evidence, the old row wins, differences go
   through the corrections register.
6. **Paul acts one step at a time.** When he must do something (console, editor,
   Terminal), give exactly one step and wait.

## Status

**Phases 0, 1 gated 2026-09-11; Phase 2 gated 2026-09-12; Phase 2.5 (read cache) shipped 2026-09-12; hardening 2026-09-14 (invoice-keyed txn_id, cache warmer, Totals tab, voided pairs hidden; D-015 two locks, D-016 Dennis 8%); Phase 2.6 (property mailboxes via a properties@ poller, property tabs, D-017 Held/Sold) built 2026-09-14, gate in progress on 1616 Granite. Poller audit 2026-09-16: HEIC photos now convert (`heic-convert`; jimp never could), `error` envelopes the model never reached are retried by the warm job (max 2).**
Phase 0 gate: `docs/phase0-spec.md` §11. Phase 1 gate: `docs/phase1-spec.md` §8. Phase 2
(receipts bookkeeper — Claude directs the read with zoom/ledger/vendor/property/docs tools,
`lib/gate.mjs` enforces the rails, Gmail poller + web upload, Drive filing, Inbox/Upload
pages, 3 AM digest) is **live for receipts@/travel@ mail dated 2026-09-11 onward** and
posts to the new workbook only. Gate record: `docs/phase2-spec.md` §11. Reads come from Blobs snapshots (`readTab`,
`docs/phase2.5-spec.md`); every write handler refreshes the tab it wrote. Phase 2.6
(`docs/phase2.6-spec.md`) adds a second poller instance running as properties@ for the
property mailboxes and a formula tab per property (layout settled with Paul on 2026-09-15:
the tab is the forecast while held; the closing tab is Phase 5). D-022: advances are
`purchase` or `cash`, each with its own `rate_pct`; `Properties.dennis_share_pct` (50, or 0
for a bank-only deal) drives the split. **Phase 2.7 gated 2026-09-15 (D-023): the input side of the books is the Recast Books menu in
the workbook** (`docs/phase2.7-spec.md`): the writer is now the project bound to the workbook
(script id `1_V01CW…kl_y`, web-app deployment `AKfycbxNisU…3w`, update it with `clasp deploy -i`);
`lib/` is generated into `apps-script/writer/lib.gs` by `node scripts/build-gs.mjs` (never
edit it; a test keeps it in sync); the web app keeps Dashboard, Inbox, Upload, Settings (API
costs). The old standalone writer project is dormant. **Inbox review in the sheet built 2026-09-16**
(spec §6: Recast Books → Inbox… sidebar; the queue stays in Blobs, Approve files and posts
in-process, `mark-posted` records it; `lib/gate.mjs` is in `lib.gs` now; approve is split so the
user waits only for the post, ~2.5 s - see CHANGELOG 2026-09-16 late). Next: **Phase 4
migration, forensic, ahead of Phase 3 (D-024, 2026-09-16)** — audit done 2026-09-17
(`docs/phase4-audit.md`, snapshot in `data/migration/2026-09-17/`). Listings, reads (946 docs)
and the staging re-posts done 2026-09-17/18. **Method changed 2026-09-18 (D-029): the
migration is row-driven - post the old row, attach the matched receipt (D-027 the old books
are the target, D-028 returns hold for Paul). **Resume from `docs/phase4-audit.md` §27** - state at the end of 2026-09-18:
- **Independent audit** (`docs/phase4-independent-audit.md`; rerun `scripts/migration-audit-indep.py` and `scripts/migration-audit-links.py` after any inventory, matcher or answers change, and diff the links against the last commit): amounts sound; fixed the dropped Granite $299 row, the advances registration (clear-and-rerun, Granite's three included), the matcher (best pair first, one-cent tolerance, two-item rows, remainder of a receipt, invoice numbers split twins), three false additions retracted.
- **Decisions:** D-030 interest by deal type; D-031 Cost Recapture, extended - a sold property migrates as closed and anything found wrong afterwards is a Cost Recapture line; D-032 Ashburne's "Dennis paid" lines are cash advances landing on 2030; D-033 the sale side (sales, net profit, balances) is Phase 5. Corrections C-1 … C-22 in audit §13. Paul's answers, links, refusals (per document), drops, additions and accepted no-receipt rows: `data/migration/2026-09-17/paul-answers.json`; outside evidence he supplied: `data/migration/2026-09-17/evidence/` (indexed).
- **Numbers:** dry run 1,031 entries, $220,628.06, all build; 868 linked (84.2% of rows, 74.7% of dollars), $36,880 of contractor checks/cash accepted with no receipt. Staging passes 3 and 4 tied out to the cent; the current dry run is pushed to the staging project.
- **Never say "no document" or "not in the old books"** before searching the amount (within two cents, and as a sum of items) on every old tab and in ALL listed mail (`gmail-listing-*.json`), not only the 968 documents that were read.
- **Staging pass 5 (15:41) tied out** on both paths: 1,031 entries, $220,628.06, $0.00 on all nine, 868 linked, 33 advances (§28). Utilities pass (§29): 22 of 25 documents settled under `mail_settled` in `paul-answers.json`; Bowling Green answered (C-20 $102.12 → $102.16; C-21 TXU $164.02 + Red Oak $529.24 added): **dry run pushed to staging, needs one Run** (staging holds pass 5). C-22: Ashburne Energy Texas $484.43 added on its tab - **104 Ashburne has NOT closed, it is still held** (Paul; only Newport's settlement date is owed). Dry run now **1,034 entries, $221,805.79**. Mesa's Central States $49.54 processes 09-18, after the snapshot: a held live receipt for the cutover replay. **Utilities closed.** Skip-rebuild flag for the advances registration built and pushed to staging, not yet run.
- **Open (§27):** differences list (117), in mail not in the books (142 left after the utilities), confirm list (57 small), Drive filing, listing search folded into `migration-compare.py`, Dennis's PayPal listing-fee receipts, the settlement date for Newport, production writer push, cutover. Pipeline steps: §21.
- **Live since 2026-09-18:** the bookkeeper prompt reads Paul's subject and typed note first (they settle `paid_from`); image type sniffed from bytes; the Inbox is a collapsed, filterable list (staging writer only until the production push). Paul is holding live receipts until the migration is complete.
The production writer still needs the 2026-09-18 formula fix pushed (§15).
Staging ids in `phase0-spec.md` §10; `WRITER_URL` points at STAGING until cutover. Phase 3
(statement uploads — D-019 dropped Plaid; `docs/phase3-spec.md` to be revised for the menu
shape) follows.

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
accountant's Google emails for the Users list (added on the Users tab now, D-023). D-018: Anthropic
top-ups post to 1520; `/api/api-costs` expenses usage monthly by Console workspace
(needs `ANTHROPIC_ADMIN_KEY`; the poller calls it on the 2nd). D-013: the new workbook is cleared once at the start of
Phase 4, then history is migrated and live receipts replayed; append-only from then on.

Test data in the live workbook: Journal holds the PHASE 0/PHASE 1 gate entries, all
voided (append-only ledger — they stay); Properties has `TEST Phase 1 gate` and Advances
its voided row — Paul may delete those two rows by hand.
