# Recast Books — the bookkeeper app

Read `BUILD-PLAN.md` for what is being built and why, `docs/phase0-spec.md` for the
technical contract, and `docs/decisions.md` before proposing anything that reverses a
decision. `PLAN.md` is the accounting design the app implements.

**This file is rules and a map, nothing else.** History is `CHANGELOG.md` and `docs/decisions.md` (index at its
top); the current state is `HANDOFF.md` and the workbook itself; how-to and gotchas are `docs/ops.md`. Never write a
dated event, a version number or a dollar figure into this file - they belong in those (cut to this shape 2026-10-06;
what was here before is `docs/status-archive-2026-10-06.md`, verbatim).

## What this repo is

The bookkeeping system for Recast Properties LLC - **the real books since the 2026-09-21
cutover** (D-024). The old workbook is closed and the old receipts bookkeeper in
`../Recast-site/` is switched off for the books. A Google Sheets workbook is the system of
record; Claude is the bookkeeper - **Paul calls the bookkeeper Penny**, and a message addressed to Penny is a
books task; the workbook's **Recast Books menu** is the front door
(D-023, constraint 8). The web app at books.recast-properties.com carries the `/api/*`
functions the menu, pollers and nightly jobs call - Paul is never sent there.

- `web/` — static front end (Netlify publish dir); `netlify/functions/` — `/api/*`;
  `lib/` — pure modules (posting engine, auth, writer client, COA, money), unit-tested;
  `apps-script/writer/` — the only thing that writes the workbook; `docs/`, `data/` — design.
- `npm test` runs everything (node:test, no test dependencies). Deploy: `npm run deploy`. Writer: `clasp push -f`
  from `apps-script/writer/`, then **`clasp deploy -i AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w`
  after every push that touches `Code.gs` or `lib.gs`** (same id, so `WRITER_URL` never changes) - the pollers and
  the web Inbox run the DEPLOYED version of the whole project, a push alone reaches only the menus, the sheet's Inbox
  and the triggers. Both are production deploys: Paul's step. A change only to `oneOffScripts.gs` needs the push
  alone (D-056). Steps, verification and what auto mode refuses: `docs/ops.md`.

## Load-bearing constraints

1. **Never touch the old workbook** (`1isEbfNKPO32Wpf08EtLkNHX85c0rTIl8tpH9bUdgQbs`),
   anything under `../Recast-site/`, or the two live receipts Apps Script projects.
   Migration reads the old workbook; nothing here ever writes to it.
2. **Every write goes through the Apps Script writer** behind its ScriptLock. No Sheets API
   writes from anywhere else. **Reads** come off it (D-047, 2026-09-25): with `SHEETS_SA_KEY`
   set, functions read the tabs through the Sheets API as a Viewer service account
   (`lib/sheets-reader.mjs`); without it, through the writer's `read` action as before.
3. **Claude decides, code executes.** Model judgment for reading, classifying, matching;
   deterministic code for arithmetic, balanced entries, `txn_id` identity, the gates
   (autofile ceiling, period lock). The UI must show which was which. A 1099 block (no payment
   to a payee over the threshold without a W-9, `docs/policies.md`) is planned, **not built**.
4. **Overhead never touches a property** (D-010). **Every Dennis advance is against a
   property and its interest is that property's cost** (D-011, D-021, D-022). D-010 is
   enforced in `lib/posting.mjs`; the interest math is `lib/accrual.mjs`, and **Dennis's interest is
   recorded at closing** by the sell wizard, not monthly (D-066; each advance carries its own `rate_pct`, D-022; blank =
   the house's rate typed at Add property, D-085). **Add property records a Dennis-funded house's purchase loan** -
   never make Paul type the price again in Add advance; one purchase loan per house (D-086).
5. **Dry run, back up, tie out twice** for anything touching history (Phase 4). **The old
   books are the target (D-027):** the migration reproduces them row by row in the new
   system with the receipt linked; the read is evidence, the old row wins, differences go
   through the corrections register.
6. **Paul acts one step at a time.** When he must do something (console, editor,
   Terminal), give exactly one step and wait.
7. **Plain words, always (Paul, 2026-09-26: "i'm not an accountant. talk to me like im 5 years
   old").** Everything Paul reads in the books - chat replies, the steps you give him, Inbox
   cards, the digest, the bookkeeper's `why`, the nightly check - is in everyday words: what
   happened, what it means for him, what to click, with the store, the date and the dollar
   amount. No accounting or system jargon (entries, posted rows, migrated, ledger, journal,
   gate, envelope, txn ids, account codes, reason codes like PARTLY_ON_BOOKS); if a word would
   need explaining, use a simpler one. Ids go on a separate line for Claude ("Paste to Claude:
   ..."), never in the sentence Paul has to understand. Say plainly what something is NOT when
   he could take it the wrong way ("not a duplicate - these two items were never recorded").
8. **The books are in Sheets (Paul, 2026-09-28: "the books should be only in sheets now").** Paul
   works in the workbook - its menus, the Inbox (Recast Books -> Inbox...), an editor helper he runs
   once. Never send him to books.recast-properties.com; re-reading documents from a session is an
   editor helper calling `siteFetchJson_` reprocess, as the Inbox's Reprocess button does. Stay on
   the task in hand; flag anything new in one line and ask before chasing it.
9. **Hand-run scripts live in `apps-script/writer/oneOffScripts.gs` (D-056, 2026-09-28) and come out once they have
   run (D-066, 2026-09-30) - git keeps them; all 42 up to 09-30 are in commit 774ecd3.** `Code.gs` and
   `Menu.gs` hold only what the workbook reaches (the menu, its dialogs, the trigger, `/exec`) plus the
   standing setup tools (`setup`, `installTriggers`, `setupTotals`, `rebuildAllPropertyTabs`, `selfTest`).
   Every dated repair, diagnostic report or tuning helper goes in `oneOffScripts.gs` with a `// STATUS:`
   line, appended to its section - the file's header says how. `test/writer-gs-lint.test.mjs` fails on a
   function in the live files that nothing reaches, or a call from them into the one-off file. A one-off
   needs a `clasp push`, not a deploy.

10. **The migration is closed (D-067).** A migration-era item that turns up later is Claude's to settle quietly,
    never a new list for Paul. Never replay or reprocess a document received before the 2026-09-21 cutover through
    the posting path (a replay helper once posted three onto migrated rows; voided).
11. **A sold house's tab is Paul's record.** It freezes when its closing is RUN in Sell property, not on the closing
    day (D-072; a held house keeps taking bills until he settles with Dennis), is renamed `<house> - Frozen` (never
    look one up by the bare name) and he edits it by hand - never rebuild one without reading it and comparing first
    (Sparkling's was overwritten once and put back). `1014 S View - Frozen` and every `- Closing` tab are his
    records: rewrite a closing tab in place, only on his word, after reading the live tab; **never delete a closing
    tab to rebuild it** (its statement lines live in developer metadata and only they know what was paid to Recast
    in full). `CLOSING_TAB_IN_PLACE` stays false forever (D-043).
12. **The closing tab is Paul's layout** (D-069, `docs/phase5-spec.md` 3a) for every house but 104 Ashburne, which
    keeps the long bank-deal layout. Rehab Costs is EVERY bill and a cash advance's principal is not a cost row - it
    shows only under Dennis in PAYOUTS (D-071); never net advances out of Rehab Costs. Lawn care is a rehab cost on
    every tab (D-070). The tab ends with AFTER THE PAYOUT listing every bill. His old sheets
    (`data/migration/cutover-2026-09-21/old-workbook-cutover.xlsx`) are his model when a layout is in dispute.
13. **A sale:** a payout is recorded only when the money leaves the account - ask Paul before any close (D-083);
    his undrawn profit is owed to him on 2030 from the closing day (D-084); Dennis's interest is typed per advance
    at the sale and the closing tab shows exactly that (D-082); a bank deal takes Dennis's one figure and his
    commission is 3% of the price less concessions (D-053); he charges no commission on a partnership deal (D-042).
14. **Settled on Paul's word - never reopen or re-ask:** 280 Sparkling's reimbursement came in full and off the top
    before the split - show the full wire, never word it as Sam H paying or "the co-owner's half"; Chase's 2,000 of
    09-28 is 104 Ashburne's earnest money (D-051); Paul's 607.05 check is all on 136 Bowling Green - never re-split
    it from the old Newport tab; the partners' working money is a plain loan, no house, no interest (D-055); 1014 S
    View's loss sits on 9000, never 2030 (D-079); a one-time tool is overhead and a mixed hardware receipt is two
    entries (D-010).
15. **Bank lines:** a check with no name is booked from the bank's picture of it, never from memory (to-the-cent
    ties confirm; anything else needs the document). One charge, one card (D-060). `NEED RECEIPT FROM <NAME>` is
    the exact placeholder marker the Inbox and the lint share - never reword it; a receipt replaces a placeholder on
    its own only on an exact match (name, total, payer), otherwise it holds for Paul (D-057); a held card that is
    the corrected copy of an entry takes the old one out when he saves it (D-058). No holding account for a charge
    with no house - it stays a card. Tune the matcher through the prompt and data, then `resetFeedCards()` and
    rerun - never edit verdicts by hand. The monthly bank check is the box at the top of the Citizens Bank tab
    (D-063), not a menu item - fold new things into what exists.
16. **Recast's own accounts only** (D-051): Citizens 1401 and Chase 1402 (Paul's business account, never Dennis);
    Paul's personal statements never come in and what Recast owes him is repaid by one payment after reconciling.
    Card last-4s and `paul_personal_last4` live on the `Bank accounts` tab and Settings - read them there, they
    change (D-074).
17. **Tabs:** never type a Journal row number into a tab formula - `journalRange_`, the D-080 lint fails on it;
    house tabs find Properties cells by header and readers of the Advances tab go by value, never row number; the
    Taxes tab's inputs are found BY LABEL - never reword `TAX_INPUTS` or a house's name row; never put the "for your
    accountant" section or a travel row back on the Taxes tab (D-081) and never add Paul's personal items to it
    (D-078). Each fall the new year's tables and `CARRIED_OVER` go into `lib/tax.mjs` when published (D-075, D-078).
18. **The bookkeeper:** a medium read posts when every other rail holds (D-044); a vendor's unanimous payment
    history settles the payer (D-045); a utility payment matching nothing on the account posts (D-046); a copy of a
    card still waiting on Paul is not a new purchase (D-077) but the receipt for a waiting BANK-LINE card posts and
    retires the card on its own (D-087); Reprocess never posts or dismisses (D-048); no
    attachment means the email is the receipt (D-035); sold houses keep their mailbox and their costs land on Cost
    Recapture; an entry whose description says PENDING ROUTING is refused; Claude credits are a software cost when
    bought (D-064). Paul's subject line and typed note settle who paid - read them first.
19. **One `HANDOFF.md`**, overwritten at the end of a session: what is live, what is owed, what is open, what is
    built but unproven. The dated `HANDOFF-2026-*.md` files are history and are not written to. Every change still
    gets its dated CHANGELOG entry. **Penny keeps the record and the backup herself (Paul: "tell me when its time to
    update any git, repo or md and just do it"):** after a piece of work, update CHANGELOG / HANDOFF / decisions,
    commit only this session's files and `git push` - no asking, one line to Paul saying what went up. Production
    deploys (`clasp deploy -i`, `npm run deploy`) and `clasp login` stay his.

## Where things are

- **Why:** `docs/decisions.md` - D-001 onward, one-line index at the top. **What happened:** `CHANGELOG.md`,
  chronological. **Now:** `HANDOFF.md`, then the workbook - P&L, Totals, Citizens Bank and the house tabs are the
  numbers; never take a figure from a doc when the tab is there.
- **How-to:** `docs/ops.md` - push, deploy and verify; what auto mode refuses; reading the live sheet (gviz, the
  Drive mount, Chrome accounts); runtime limits; email intake quirks.
- **Design:** `BUILD-PLAN.md`, `PLAN.md`, `docs/phase*-spec.md` (phase3-spec's amendments at its top first;
  phase5-spec 3a is the closing tab), `docs/property-tab-anatomy.md`, `docs/chart-of-accounts.md`,
  `docs/policies.md`, `docs/open-questions.md` (the accountant's), `docs/cutover-runbook.md`,
  `docs/migration-leftovers-final.md` (the closed register).
- **Ids:** `docs/phase0-spec.md` §10 and `HANDOFF.md` (workbook, writer, pollers, Paul's pre-2026 sheet "Recast
  2025"). Before concluding from a document which deal it belongs to, ask which house.
- **Code:** `lib/` (pure, tested; generated into `apps-script/writer/lib.gs`), `netlify/functions/` (`/api/*`),
  `apps-script/writer/` (the only writer; `oneOffScripts.gs` per constraint 9), `apps-script/poller/` (paul@ and
  properties@ instances), `web/`, `test/`, `scripts/`, `data/` (`migration/`, `molalla-receipts.json`).
