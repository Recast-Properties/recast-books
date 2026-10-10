# Handoff - current state

**This is the one "resume from" file. Overwrite it at the end of a session.** The dated `HANDOFF-2026-*.md` files are
history and are not written to; `CHANGELOG.md` keeps its dated entry per change. Rules are in `CLAUDE.md`; how-to in
`docs/ops.md`. The books' numbers live on the workbook's tabs (P&L, Totals, Citizens Bank, the house tabs) - read them
there; a figure written here is only as of its date.

## 2026-10-10 - owed, in order (on top of everything below)

0. **Paul: `npm run deploy`** - D-087 (a receipt answers its waiting bank card; a free line folds into the memo) is
   committed and tested, not deployed. Then the Inbox clean-up: round 1 (twelve Saves, listed in the 10-10 chat),
   round 2 (Dismiss all on the seven bank cards whose receipts he saved, plus the $67.60 return card and the $5.00
   clerk duplicate; then Match statement lines... once), round 3 (three bank lines with no receipt - Lowe's 08-10
   130.87, Home Depot 09-24 90.23 and 09-25 30.57: Waiting on Dennis -> Waiting on receipt). Answers still owed:
   HILCO 860.00 which house; Alaska 579.40 is Visa 7274 his; Chino's 3,500.00 paid and by whom; the four old
   sold-house receipts (cards 2749 / 3274, 33.62) count or drop; Foremost 267.34 which house; Zelle in 500.00 Charvale.

## 2026-10-09 - owed, in order (on top of everything below)

1. **Paul: `npx clasp login`** (expired 10-09 mid-push). Then Claude: `clasp push -f` from `apps-script/writer/` and
   `clasp pull` to confirm Code.gs = the repo (commit 4c6d345: "Recast Account Paid" follows the who-paid box).
2. **Paul: rebuild three tabs** - open the tab, Recast Books -> Rebuild property tab: 3808 Kings (Back to Recast
   should read 140.15), 366 Mesa (9,373.55), 413 Green Acres (344.39). Sale Price / Concession cells survive a rebuild.
3. **Paul: `clasp deploy -i AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w`** - Code.gs changed.
4. Still unanswered: how much Dennis moved out of Citizens and for which house (below).

## 2026-10-07 (morning) - on top of the 10-06 state below

- **Import statement now matches too** (Menu.gs/Import.html, a push, no deploy): the dialog starts the matching on the
  account it imported and shows the progress and summary in its own box. Seen on Paul's real import: Citizens, 8 new
  lines to 10-06, 3 tied, 5 to the Inbox; the bank box adds up. Match statement lines... stays for reruns.
- **Paul says Dennis moved money out of Citizens.** Not in the bank yet: the file Paul downloaded at 08:37 runs to 10-06
  and the bank's balance is still 438,304.21. Asked Paul how much and for which house (Ashburne / Newport) - **no answer
  yet**. It is the first payout: build the payout-line matcher (Open 3) before he imports the file that has it.
- Three keypad deadbolts moved off the shelf (6510) onto 3808 Kings, 413 Green Acres, 366 Mesa (`moveLocksToHouses`,
  run and taken out). Two left on the shelf: one satin nickel, one matte black, 40.15 each.

## As of 2026-10-06 night

Live: writer web app **@38**, writer pushed after it (D-085 Add property asks the interest rate; D-086 it records a
Dennis-funded house's purchase loan - 3808 Kings and 658 Erin Hills added 10-06 and fixed), site **`6ac23e11`**, both
pollers pushed - all = the repo. 566 tests. Nothing owed on a
deploy. Every house of the old books is closed in the books (1616 Granite, 280 Sparkling, 881 Newport, 104 Ashburne)
plus Paul's own 1014 S View (D-079). Phase 3 (bank statements): import, matcher, the Citizens Bank tab and its bank
check are live; Citizens imported through 10-02 (87 lines, 73 reconciled).

## Owed - Paul's one step

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
2. **The bank box waits on one Inbox card of Paul's:** the Red Oak water 300.72 (the bank shows its 2.00 fee apart).
   The 10-01 500.00 Venmo to Ivett Avila is tied (10-10): she is Juanito's wife (Paul), the line is his 500.00 paint and
   labor at 366 Mesa. The way to answer a "same payment?" card: Dismiss all with the answer typed in, then Recast Books
   -> Match statement lines... (inboxDismiss -> unmatched carrying "Paul: ...", the matcher reads it and ties). The alias goes on the Vendors tab (Juan Garcia | Juanito, Juanito Garcia, Ivett Avila) so
   the matcher and the bookkeeper know her name next time. Paul's rule from 10-09: no payment to Juanito or Armandre
   Vega without an invoice; W-9s he is collecting himself.
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

- D-087: a receipt that answers a waiting bank-line card posts, ties the line and dismisses the card on its own
  (`retireBankCard`); a $0.00 item folds into the memo. Watch the first one: the Feed row matched with the new txn
  id, the card gone from the Inbox, the note "The receipt came in (...) and the bookkeeper tied it".
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
