# Handoff - current state

**This is the one "resume from" file. Overwrite it at the end of a session.** The dated `HANDOFF-2026-*.md` files are
history and are not written to; `CHANGELOG.md` keeps its dated entry per change. Rules are in `CLAUDE.md`; how-to in
`docs/ops.md`. The books' numbers live on the workbook's tabs (P&L, Totals, Citizens Bank, the house tabs) - read them
there; a figure written here is only as of its date.

## 2026-10-24 (afternoon) - the partner money is in the books; next: audit items 7-10

**Booked on Paul's word 10-24, each read back on the sheets (CHANGELOG has every id):** his 104 Ashburne payout
147,729.38 wired Citizens -> Chase 10-09 (payout + his working money in Chase + 25.00 fee); his 30,000.00 out of Chase
to personal 8870 on 10-14; the 2,000 earnest-money Chase line tied (D-051); Mariana Martinez's 300 (Poinsetta) and 350
(Erin Hills) re-posted paid from Chase; Dennis's 10-07 payouts - 17,829.27 Ashburne (all interest) and 240,895.21
Newport in full with 10,000.00 of it left in Citizens as his working money (D-055); the 574.63 Chase "To ALA 1201" =
Paul's truck loan paid from Recast by mistake, his money out; the 500.00 Charvale Zelle into Citizens = Paul's own money
by mistake, owed back to him. **Both closing tabs read paid in full to Dennis and to Paul (Newport: Paul still owed
27,609.53).** The Chase statement is tied line for line (books 118,439.75 vs bank 118,444.75, the 5.00 Telnyx after the
file's end is the gap). Citizens: 14 small lines open in the Inbox (1,473.51) - the three Dennis's-card charges with no
receipt, the Red Oak 298.72 + 2.00 pair (card asks whether to split the 2.00 off), two 1.00 ATM fees, 9.94 Waxahachie
fee, four Amazon charges, a Home Depot 37.84, Rockett 230.00 - ordinary cards, Paul's Inbox. Writer web app @42
deployed by Paul 10-24; Menu.gs changed after it (closingFromJournal_ sums every "paid to" entry) - no deploy needed.
**Small fix owed:** the Inbox store's two Mariana receipt records (`gm-1a132380fd81f253`, `gm-1a13d720f8a1aa80`) still
name the voided entries - let mark-posted in `books-inbox.mjs` re-point a posted record whose entries are all voided
(receipt-20261012-c9dbcd2427b4 and receipt-20261014-e2d5e17b44c4 are the live ones), then re-point them.
**Audit #7 built 10-24 evening (601 tests; CHANGELOG "Audit #7"): Paul said yes to the write (section 6 q2).** Site deployed
(`6add1ddf`, Paul 10-24); the two Mariana receipt records re-pointed (done). **Writer web app @43 deployed by Paul 10-24**; live = pushed.
Watch the first "will be remembered" card. **Audit #8 built (CHANGELOG "Audit #8"): `npm run ship` is Paul's one step from now on - owed: his first run, which
ships the ship script itself (expect writer @44 and a new site id; the read-back must say both carry the stamp).**
**Next: audit items 9 (index blob), 10 (poller label + heartbeat - section 6 q5).** `git push` owed after.
**Noted:** Match statement lines never offers a bank whose every open line already has a card (`unmatchedFeedCounts_`
counts `unmatched` only), so the ten-day sweep cannot run there until a card is dismissed - recorded, not changed.

## 2026-10-24 - the system audit, and its first six changes built and deployed (owed: the push)

`docs/audit-2026-10-24.md` is the ranked list (ten changes; no rebuild); `docs/audit-2026-10-24-agents.md` holds the five
agent reports and the live-store tally. **Built 10-24, tested (593), NOT deployed:** audit #1-#6 and #14 (CHANGELOG
"the audit's first six changes"). Site deployed 10-24 (`6adcd34f`): the ingest's bank-line tie, the matcher's
retire/reopen, the stuck-read retry, the cached document and the nightly Feed facts are live. Writer pushed 10-24 (Paul ran `clasp login`; `clasp pull` = repo): the swap-Save guard,
the Save-path bank-line tie, the partner-money cards and the void that frees its line run in the sheet now. Web app deployed @41 (Paul, 10-24). First Citizens matcher run done 10-24: 7 cards retired on their own (CHANGELOG). Site `6adcdcc9` deployed 10-24 (the
sweep ties a receipt saved split by house). Citizens run again 10-24: 1 more card cleared (the 52.85) - 8 of the morning's 30 gone by code. **Writer web app deployed @42 by Paul 10-24** (`/exec` answers ok 0.4.0; `clasp pull` = repo): the sweep's group rule and
the matcher's summary box run everywhere now. **Match statement lines on Chase is moot:** the menu offers only a bank with lines
nobody has asked about yet (`unmatchedFeedCounts_` counts `unmatched`), and every Chase line already has its card from the
10-23 import - the matcher has nothing to do there until Paul answers the six cards (then Dismiss all puts each line back
in front of it with his words). Owed: `git push` - commits 000dd25..HEAD are local only (the auto-mode check refuses the
push from a session). The three Dennis's-card cards
(Lowe's 08-10 130.87, Home Depot 09-24 90.23, 09-25 30.57) are real charges with no receipt - not leftovers; they wait
on Dennis like the rest.
**Still Paul's word:** the five partner-money cards (147,729.38 out and in 10-09, 30,000 to 8870 10-14, 2,000 deposit
09-28, 500 Charvale in) - after the push they show no Save; Dismiss all with what each was, Claude books them (D-055,
D-083, D-084). The Mariana Martinez 350.00 of 10-14 was saved as paid by Paul, but Chase 1402 shows the Zelle - say
which and Claude corrects it. The 10-11 Poinsetta photo gm-1a12d6f7780f7d94 is still in error: forward that email to
receipts@ again (the 2000-px fix is live) and Claude clears the old error card. Decisions only Paul can make: the
audit's section 6.

## 2026-10-23 (later) - owed, in order (on top of everything below)

0e. **Paint and Flooring are two trades now (10-23):** the Inbox dropdown offers them apart (writer pushed, Menu.gs only -
   close and reopen the Inbox to see it); the bookkeeper's sections and field say the same on the site - **deployed, site `6adb9889`** (Paul said
   "deploy", run from the session 10-23). Nothing owed. Watch the first paint or flooring receipt's card pre-pick `Paint` or `Flooring`. Old lines
   keep `Paint & Flooring` (a light tab never shows the trade; the frozen Ashburne tab's block keeps its name).
0d. Done 10-23: drinks with job materials (D-092) live - site `6adb92f1`; the 155.41 Home Depot card posted on its own
   (Mesa parts, tools, 5.70 of drinks on 6710 with the read's purpose). Q-11 for the accountant: half as meals vs
   supplies in full. Watch the next hardware run with drinks on it.
0c. **Returns (D-091) are live:** site `6adb8c58`, writer @40, the four held Home Depot return cards re-read 10-23 - three
   posted on their own (3.36 Poinsetta; 52.37 Mesa; 94.33 split Green Acres / Mesa by the original purchases), the
   43.80 one saved by Paul 10-23 (his word; not read back) after picking the showerhead's house. The 67.60 slip is recorded (61.91 to 1401, 5.69 to Dennis - his Mastercard 1343
   and a store credit card, Paul 10-23). Then Match statement lines ties the Feed's refund lines (10-02 61.91 etc.).
   Watch the next return the poller reads on its own.

0g. **Paul imported Citizens 10-23 (lines through 10-21; Feed: 124 matched, 25 proposed, 2 unmatched).** Every Venmo to
   Ivett Avila and Zelle to Armandre Vega is tied: 413 Green Acres carries Juanito 1,500 (bank 10-07) + 2,100 (10-15)
   and Armandre 3,500 (10-09) + 3,500 (10-16) = 10,600.00, nothing waiting in the Inbox for either. Items 1 and 2
   below are closed by this import. **Not yet looked at: the 25 proposed cards** - the bank balance was 21,636.57 on
   10-23 against 438,304.21 on 10-06, so the sale payouts are among them; the payout-line matcher is not built (Open 3)
   and those cards must be tied to the sales by hand, not answered as house costs.
0f. **Done 10-23: the two Venmo payments to Ivett Avila (= Juanito) that reached no mailbox are in the books** - Paul:
   "log the expenses from those screenshots". 1,500.00 on 413 Green Acres dated 10-08 (labor, "work done at 413 Green
   Acres") and 450.00 on 241 Poinsetta dated 10-13 (trash removal), both paid from Citizens, each line opening Paul's
   Venmo screenshot filed in the house's Drive folder; both house tabs show them. One-off `recordVenmoJuanito20261023`
   (commit 133156e) run from the editor 10:38 CDT, then taken out. The dates are Venmo's "15d" / "10d" - **the next
   Citizens import gives the exact days and ties the lines** (the matcher allows about ten days). The other two in his
   feed were already in: 2,100.00 flooring 413 Green Acres (10-14) and 500.00 366 Mesa (10-01, tied).
1. **413 Green Acres, Armandre Vega (Chinos LLC):** draw 1, 3,500.00 Zelle 10-09, is on the tab as Chinos LLC. **Draw 2,
   3,500.00 Zelle 10-16 ("For work completed at 413 Green Acres"), is in no book** - owed: Paul forwards the bank's
   10-16 notice (paul@ Inbox, "Notification - Your $3,500.00 to Armandre Vega was sent") to receipts@ naming the house
   and the draw; it is over the ceiling, so it holds in the Inbox for his Save. The Citizens file has not been imported
   since 10-06 - the bank line ties on the next Import statement.
2. **Juanito on 413 Green Acres is on the tab now:** Paul saved the 10-14 2,100.00 Juan Garcia (via Ivett Avila)
   flooring card after the morning's answer (item 0 for its file). No Zelle from Citizens to him since he was added
   10-01 - this one is a Venmo to Ivett, paid from Citizens 10-14; the bank line ties on the next import. October's
   other Juanito entries (Mesa 500 / 400, Janice 800) are by his own emails and on the right houses.
3. Armandre's 850.00 Zelle of 10-10 is 200 Janice ("Trash removal at 200 Janice"), not in the books and not pending in
   the Inbox any more - settle with Paul when he answers the above (his rule: no payment to Armandre without an invoice).

## 2026-10-23 - done (on top of everything below)

- **Chase card 7416** (D-088): on the `Bank accounts` tab the Chase row's last4 reads `6317, 7416` (typed by Paul,
  read back by gviz). A receipt showing 7416 is paid from Chase (1402), not by Paul. He is moving the recurring charges
  onto it himself (the 10-20 list in CHANGELOG); as each one moves, its next receipt lands on Chase - watch the first.
- **`Chase Bank` tab** beside Citizens' (`BANK_SHEETS` has 1402): a stub ("No bank lines yet...") until the first
  Chase statement file is imported with Import statement... (a real Chase download is untried - 10-14 note below; the
  account has never been imported, so the first file brings Paul's own deposits in as working capital, D-055). Writer
  pushed and deployed **@39** (Paul, 10-23 08:40 PDT); live = repo by `clasp pull`; `/exec` answers ok 0.4.0. Nothing
  owed. "Bank sheet" is a menu item, not a tab - Paul looked for a tab first. **Paul asked how to make the Chase file
  (10-23 PM):** told QFX, widest range, Import statement... (CHANGELOG). If his first import says DOES NOT ADD UP, the
  account is older than the file - set `opening_balance` / `opening_date` on the Bank accounts tab from the file.

## 2026-10-20 - owed, in order (on top of everything below)

0. **Foremost 267.34 (Feed line of 10-06, status proposed, card "Paul (5450)")** is a NEW auto-pay enrolled 10-05 on the
   Citizens debit card 5450 (policy ***-*******269): the "registered for automatic payments" and "Payment Confirmation"
   emails of 10-05 sit in paul@'s Inbox, never forwarded, so the poller never saw them (it reads only mail to
   receipts@/travel@). Not Paul's 9166, and not the old 104 Ashburne 374.58 policy, which did not bill in October
   (Ashburne is sold). **Owed: Paul answers the Inbox card - which house.** Forwarding the 10-05 Payment Confirmation to
   receipts@ afterwards attaches the receipt to the line (D-087).
1. **October's Google Workspace (Squarespace, 50.40, due 10-04) and Roddy / Foreclosure Listing Service (84.44, due
   10-15) are not in the books because neither vendor emails a receipt to any mailbox.** On 10-01 Paul downloaded the
   PDFs himself (11 Squarespace invoices, 9 Roddy receipts) and sent them to receipts@ - the only way they arrive
   (`docs/ops.md`, Email intake). The October ones are owed the same way, Paul's step. The Squarespace account's own
   emails go to pvb421@gmail.com; Roddy's account is on paul@.
2. 10-20 chat: Paul asked for the recurring charges on his personal card 9166 - answered from the Journal (the books
   mark "PAUL", not which card; 9166 is confirmed in the memo only on Apify, Workspace, Energy Texas, Berrett and the
   September Anthropic top-ups; Adobe and Microsoft 365 are PayPal from Chase 8870). No books change.

## 2026-10-14 - owed, in order (on top of everything below)

0. **Paul is taking a draw from Chase (6317)** - advice given 10-14 (CHANGELOG). When he gives the date and the amount:
   one entry Dr 2030 / Cr 1402, memo "Paul draw", no house, dated the day the money left (D-083); up to what is owed
   (2030 is 216,737.38 on Totals 10-14), past it 9010 (D-084). The books hold 1402 at 1,940.00 and **Chase has never
   been imported** (Feed is 1401 only): his first Chase import is the parser's first real Chase file; his own deposits
   are working capital (D-055, Dr 1402 / Cr 2030); the draw line ties to the entry by amount, no payout matcher needed.

## 2026-10-13 - owed, in order (on top of everything below)

0. Deployed 10-13 (site `6ace1cfb`): `lib/bookkeeper.mjs` now shows the model a copy of a photo scaled to 2000 px (a 4032 px
   iPhone photo for 241 Poinsetta, gm-1a12d6f7780f7d94, failed at turn 15 on the API's many-image 3000 px cap). **Owed: Paul clicks
   Reprocess** on that card in the Inbox (it is the 10-11 photo with no store name on its card). Both house mailboxes
   (241 Poinsetta, 658 Erin Hills) are being checked - labels present, mail flowing 10-07 to 10-12.
1. Waiting on Paul in the Inbox (as of 10-13 morning): 241 Poinsetta - Home Depot $3.36 refund (10-11), and the
   $226.58 Home Depot of 10-11 sent to receipts@ with no house (receipt 6505 00052 12022, the one the refund came
   from - pick 241 Poinsetta); 658 Erin Hills - Home Depot $1,023.29 carpet (over the ceiling), Lupe $300 carpet
   labor (which account paid), Home Depot $43.80 refund of 10-12 sent to receipts@; Lowe's $30.84 of 10-12 (which
   house for the Liquid Nails); 200 Janice - Armandre Vega $850 Zelle (over the ceiling; Paul's rule: no payment
   to him without an invoice).

## 2026-10-10 - owed, in order (on top of everything below)

0. D-087 (a receipt answers its waiting bank card; a free line folds into the memo) is **live - site `6aca41c9`,
   deployed by Paul 10-10**. Then the Inbox clean-up: round 1 (twelve Saves, listed in the 10-10 chat),
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

Live: writer web app **@39** (10-23, D-088; was @38 from 10-06), writer pushed after it (D-085 Add property asks the interest rate; D-086 it records a
Dennis-funded house's purchase loan - 3808 Kings and 658 Erin Hills added 10-06 and fixed), site **`6aca41c9`** (10-10, D-087), both
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

- D-089: the next iPhone forward that lists its files without carrying them - the poller takes them from the original
  message in the conversation and the card's poller note says so (built 10-23, exercised once by the one-off, not yet
  by the 15-minute poll).
- D-088: the first receipt showing card 7416 posting as paid from Chase (1402), not PAUL; the first Chase statement
  import filling the `Chase Bank` tab and its bank box (the stub is replaced on the same refresh).
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

> Work in `/Users/paulbjork/Desktop/Claude/Recast-books`. Read `CLAUDE.md`, then `HANDOFF.md` (the 2026-10-24 section
> first), then `docs/audit-2026-10-24.md` section 3. The audit's items 1-6 and 14 are built, deployed (site `6adcdcc9`,
> writer @41 + a later push) and tested (594). Pick up in this order, one step at a time and in plain words: (a) I run
> Match statement lines on Chase and paste the box - read the Inbox back with the Netlify CLI (`blobs:list books-docs
> --prefix doc/feed-`), not the API; (b) the clasp deploy and `git push` are mine - hand me each as one command;
> (c) the five partner-money bank cards and the Mariana Martinez 350 payer need my word - ask, then book them;
> (d) then audit item 7 (learn an unknown card number once), 8 (the ship script with a commit stamp), 9 (the index
> blob), 10 (the poller's `to-books` label and heartbeat), each with tests, each recorded in CHANGELOG/HANDOFF and
> committed. The audit's section 6 lists the decisions only I can make - ask them when they come up, not all at once.
