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
- **Decisions:** D-030 interest by deal type; D-031 Cost Recapture, extended - a sold property migrates as closed and anything found wrong afterwards is a Cost Recapture line; D-032 Ashburne's "Dennis paid" lines are cash advances landing on 2030; D-033 the sale side (sales, net profit, balances) is Phase 5. Corrections C-1 … C-31 in audit §13. Paul's answers, links, refusals (per document), drops, additions and accepted no-receipt rows: `data/migration/2026-09-17/paul-answers.json`; outside evidence he supplied: `data/migration/2026-09-17/evidence/` (indexed).
- **Numbers:** dry run 1,031 entries, $220,628.06, all build; 868 linked (84.2% of rows, 74.7% of dollars), $36,880 of contractor checks/cash accepted with no receipt. Staging passes 3 and 4 tied out to the cent; the current dry run is pushed to the staging project.
- **Never say "no document" or "not in the old books"** before searching the amount (within two cents, as a sum of items, and as the document's pre-tax subtotal) on every old tab and in ALL listed mail (`gmail-listing-*.json`), not only the 968 documents that were read.
- **Staging pass 5 (15:41) tied out** on both paths: 1,031 entries, $220,628.06, $0.00 on all nine, 868 linked, 33 advances (§28). Utilities pass (§29): 22 of 25 documents settled under `mail_settled` in `paul-answers.json`; Bowling Green answered (C-20 $102.12 → $102.16; C-21 TXU $164.02 + Red Oak $529.24 added): **dry run pushed to staging, needs one Run** (staging holds pass 5). C-22: Ashburne Energy Texas $484.43 added on its tab - **104 Ashburne has NOT closed, it is still held** (Paul; only Newport's settlement date is owed). Staging pass 6 (16:07) tied out at 1,034 / $221,805.79. C-23: five American Airlines charges added to overhead Travel ($2,070.30; Paul: AA is business).  List 4 had a hole (§30: receipts dismissed as duplicates of their own cleared staging post were bucketed as junk) - fixed. Evening pass (§31): Uber, copies and twins settled; then §32: Paul's Julio notes linked to their cash rows, CoreLogic invoices parked for Phase 3 (Paul cannot see Cotality's payment history); **list 4 is 68**, 884 linked. C-24 / D-034: Ashburne's paid 2025 property tax $16,031.25 (old tab cell E10, missed by the inventory) posted to 1100, Due to Paul; `tax_annual` carried into Properties by `migrationRegisterProperties`, which `migrationRunStaging` now calls. Staging pass 7 (16:35) tied out at 1,040 / $239,907.34. §34: 'Effren' rows renamed Falcon Creek Lawn Care (`rename_payee`), its invoices 1372-1374 relinked row by row; 889 linked, list 4 is 65. §37: Paul's Chase Zelle history (evidence/) proved 1373 and 1374 paid in full by him - **C-25** adds Bowling Green $55, and Newport $55 + Granite $30 on Cost Recapture; C-26 adds two Vega Zelle payments on Ashburne ($379.18 materials, $350.00 labor; evidence-only entries carry an `EVIDENCE:` flag). Staging pass 8 (18:41) tied out at 1,045 / $240,776.52. C-27 Berrett row redated 06-30, C-28 VistaPrint 06-11 $241.71 added: §38: C-26's $379.18 Vega materials entry RETRACTED the same evening - it is the old row 'Home Depot / Stair Moldings' $350.28, the pre-tax subtotal of the cash receipt Vega was repaid for (search subtotals too before adding). C-29 corrects that row to $379.18 (Paul). **§39 (2026-09-21, offline): the matcher's subset-sum rule had hung 26 Home Depot / Lowe's rows on four receipts weeks away - fixed (3-day window and item check when candidates are many), audit script extended; linked is 873, honestly.** Envelopes are cached in `.cache/envelopes/env/` (git-ignored) - no re-download needed on this Mac. **§40: list 4 closed out offline, 60 → 2** under the stopping rule (no new cost unless proven paid and absent by total, subtotal and items; else parked for Phase 3): 56 decisions under `mail_settled`, C-30 Netlify $0.00 → $13.40. C-31 adds the $144.00 Green Acres eviction fee (Paul). **Dry run 1,047 entries, $240,825.35, ten property totals - NOT yet pushed to staging** (staging holds pass 9). **List 4 is empty** (Brushwood stain: both rows stand, Paul). §41: first pass of the differences list - near-amount tolerance capped at 10% of the row, the HD 02-19 $390.12 receipt untangled, Uber 06-03 on its final receipt; then §42: **differences list closed, 114 → 0** (`differences_settled`: 22 explained, 14 rounding, 10 snacks/fees, 66 parked for Phase 3; no typed amount changed) and 22 more rows linked; §43: confirm list closed (20 linked, the rest refused per document). **All five lists are done: differences 0, list 4 0, confirm 0 real, no document 128 rows / $51.4K (Phase 3); 919 linked = 87.8% of rows, 78.6% of dollars; link audit clean.** Next: push + one staging Run and tie-out, then item 7 (Drive filing incl. evidence/), then cutover day. **Distance to cutover: end of audit §40** (lists 1 and 2 by judgment, Drive filing of 408 documents + evidence/, then cutover day). **Dry run 1,045 entries, $240,667.95, pushed, needs one Run** (staging holds pass 8, which still has the retracted entry);  Mesa's Central States $49.54 processes 09-18, after the snapshot: a held live receipt for the cutover replay. **Utilities closed.** Skip-rebuild flag for the advances registration built and pushed to staging, not yet run.
- **Open (§27):** differences list (117), in mail not in the books (142 left after the utilities), confirm list (57 small), Drive filing, listing search folded into `migration-compare.py`, Dennis's PayPal listing-fee receipts, the settlement date for Newport, production writer push, cutover. Pipeline steps: §21.
- **Item 7 must file `data/migration/2026-09-17/evidence/` to Drive** (Paul 2026-09-18: "save it for 7 as long as it doesnt get lost"): nine screenshots (Atlas portal x2, TXU history x2, Chase Zelle x5), the Luxury 4 Less invoice PDF and the Chinos estimate text - all committed in this repo, which has **no remote**, so until then the only copy is this Mac. Entries flagged `EVIDENCE:<file>` (C-26) get their `doc_url` from that filing.
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
