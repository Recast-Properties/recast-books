# Handoff - current state

**This is the one "resume from" file. Overwrite it at the end of a session.** The dated `HANDOFF-2026-*.md` files are
history and are not written to; `CHANGELOG.md` keeps its dated entry per change. Rules are in `CLAUDE.md`; how-to in
`docs/ops.md`. The books' numbers live on the workbook's tabs (P&L, Totals, Citizens Bank, the house tabs) - read them
there; a figure written here is only as of its date.

## As of 2026-10-06 morning

Live: writer web app **@37**, site **`6ac23e11`**, both pollers pushed - all = the repo. 564 tests. Nothing owed on a
deploy. Every house of the old books is closed in the books (1616 Granite, 280 Sparkling, 881 Newport, 104 Ashburne)
plus Paul's own 1014 S View (D-079). Phase 3 (bank statements): import, matcher, the Citizens Bank tab and its bank
check are live; Citizens imported through 10-02 (87 lines, 73 reconciled).

## Owed - Paul's one step

**First (2026-10-06, D-085):** the Add property change (interest rate in, sale price and settlement date out) is
pushed (verified by `clasp pull` = HEAD) and live in the menu. **Deploy owed** because `Code.gs` and `Menu.gs`
changed: Paul runs `npx clasp deploy -i` with the writer id from `apps-script/writer/` (`docs/ops.md`). No house has a
rate typed yet, so nothing in the books moves.

Run `linkMolallaReceipts` (the only function in `oneOffScripts.gs`; pushed 10-05 06:46 CDT, a push only, no deploy -
commit 94f302a). It writes each receipt's Drive link on its Journal lines and in the Receipt cell of each matched row
of `1014 S View - Frozen`; safe to run twice. **Then read back and close it out** as `HANDOFF-2026-10-05.md` START
HERE says: the log line (65 receipts; 110 tab lines open a receipt, 11 none), gviz count of linked 1014 S View Journal
lines = 272, the Frozen tab's summary numbers unchanged, take the one-off out, push, `clasp pull` to confirm.

## Open, in order

1. **1014 S View:** 15 lines still without a receipt (12,578.10) and what was found while matching (money back not on
   his sheet, lines likely entered twice, paid and not on his sheet) - every item with its file in
   `HANDOFF-2026-10-05.md` and `data/molalla-receipts.json`. Paul decides; nothing changed in the books. The papers
   are in pvb421@gmail.com: forward to paul@ on his explicit yes, save to Drive with the poller one-off pattern
   (`git show 8d92e0f:apps-script/poller/OneOff.gs`), match, a second small link run. The Frozen and Closing tabs
   change only on his word, cell by cell.
2. **The bank box waits on two Inbox cards of Paul's:** the 10-01 500.00 Venmo to Ivett Avila (the books have
   Juanito Garcia 500.00 at 366 Mesa) and the Red Oak water 300.72 (the bank shows its 2.00 fee apart).
3. **The payout-line matcher is not built** (Paul: not yet). Build it when the first of the four payouts goes out -
   the amounts as of 10-05 are on the two closing tabs (Ashburne: Dennis 17,829.27, Paul 147,729.38; Newport: Dennis
   240,895.21, Paul 27,609.53; D-083, D-084, all still in Citizens). The bank line must land on what is owed
   (2010/2000 for Dennis, 2030/9010 for Paul); the matcher's cards offer house costs, so it may need a hand.
   `closingFromJournal_` reads "still owed" live but "paid so far" from the sale entry - a rebuild after a payout
   reads the Citizens Bank tab's truth (ponytail note in `writeClosingTab_` / `closingRows`).
4. **Phase 3's reconcile step** beyond the bank box (`docs/phase3-spec.md` section 4). Nothing else of Phase 3 is open.
5. **W-9 collection:** nine payees over the threshold, zero on file, **January 31 deadline** (`docs/policies.md`); the
   1099 block is not built (constraint 3).
6. Owed by others: Dennis's PayPal receipts for the Granite, Sparkling and Newport listing fees.
7. Optional, cutover runbook step 17: Paul drags `2026/` and `Migration evidence/` from the "Recast Books STAGING"
   Drive folder into "Recast Books" (links survive a move).
8. Taxes tab: `Other income in your household` is 0 while the 2025 return shows 421,292 of paychecks - put to Paul
   twice; his cell. Q-1 (tax home), Q-3, Q-4 in `docs/open-questions.md` stay the accountant's.

## Built, not yet seen on a real case

- D-057: a receipt taking a `NEED RECEIPT FROM <NAME>` placeholder's place; D-058: a held card replacing an entry
  (the yellow box); D-060: one charge, one card - all on real cards.
- D-077: a copy of a card still waiting on Paul (the prompt rule to dismiss the copy).
- D-076: a phone photo over 3 MB stored at full size - read back the next one's stored size.
- D-073: the read's `attachment` field on a new several-receipt email (the 10-04 fix is proven on the four re-reads).
- The first sort of the Advances tab on the hourly refresh after @37 (10-06).

## Watch

- `refreshBalanceSheetHourly` ran 241 s against the 360 s limit.
- The 3 AM Posted list files a card under the day it was read, not the day Paul saved it (seen, not chased).

## Ids

- Workbook "Recast Books": `12QVyxm3KnLD7CDC8mFAPd5ulZuRXRluNDi4qK4BBxKM`
- Paul's pre-2026 records, the sheet "Recast 2025" (tabs Recast / 1014 S View / 104 Ashburne Glen):
  `1d1TVK7c53cIguj2nSvc2Zknr99TiLUAJxB7YwMj37g8`
- Writer script (bound to the workbook): `1_V01CWkkO3MiGl1k4_lTgMZtInidFC4uTwQzj_h4aAPajL8cLMG1kl_y`; web app
  deployment `AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w` (always `clasp deploy -i` it)
- Poller script (paul@): `1jKtDx0eK458SP8jMKChqOBJhEegh1I6uAQeTusdFMPZhdsyddXUc0sqE`; the properties@ instance pushes
  with `-P .clasp-properties.json`
- Old workbook "Recast 2026 CLOSED 2026-09-21": `1isEbfNKPO32Wpf08EtLkNHX85c0rTIl8tpH9bUdgQbs` - never write to it
- Netlify site `recast-books` -> books.recast-properties.com; Drive folder "Recast Books" (staging folder ARCHIVED)
- Molalla one-offs: `bbcd0be` (importMolalla), `542847e` (importMolallaLines), `e708f40` / `8d92e0f` (poller one-off
  pattern)

## Prompt for the next session

> Work in `/Users/paulbjork/Desktop/Claude/Recast-books`. Read `CLAUDE.md`, then `HANDOFF.md`. I ran
> `linkMolallaReceipts`. Read the tab `1014 S View - Frozen` and the Journal back, tell me in plain words whether every
> line opens its receipt, close the one-off out, and then tell me the one next step for the lines that still have no
> receipt.
