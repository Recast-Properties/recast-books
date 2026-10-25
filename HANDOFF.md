# Handoff - current state

**This is the one "resume from" file. Overwrite it at the end of a session.** The dated `HANDOFF-2026-*.md` files are
history and are not written to; `CHANGELOG.md` keeps its dated entry per change. Rules are in `CLAUDE.md`; how-to in
`docs/ops.md`. The books' numbers live on the workbook's tabs (P&L, Totals, Citizens Bank, the house tabs) - read them
there; a figure written here is only as of its date.

## 2026-10-25 - the audit's list is done and live (START HERE)

**17:10 CT - Add receipt's first use went in twice, fixed (CHANGELOG, same date):** Paul added the 37.84 Home Depot PDF
and Saved the card by hand before the read finished; the typed copy is voided and the bank line points at the receipt
(37.84 once, 241 Poinsetta, PDF filed). The race is closed in code: the card closes on Add receipt, the site sets it
aside ten minutes (`receipt-added`), and a receipt that arrives after a by-hand Save replaces the typed copy
(`typedTwinOf`, `retireBankCard`). **Owed: `npm run ship` (Paul) - the site half is in the repo, not live.** Watch the
next Add receipt: the card goes away at once and does not come back on Refresh; the receipt's entry appears within two
minutes; nothing typed.

**16:55 CT - Add receipt on a bank card (CHANGELOG, same date):** a money-out bank card's yellow box takes a photo or PDF
from Paul's computer and sends it up /api/upload with a note naming the line, the account and the card; the bookkeeper
reads it as any receipt and D-087 retires the card when it matches. Writer pushed (the dialog only; no deploy). **Watch:**
Paul's first Add receipt - the card clears itself within two minutes, or the receipt comes back as its own card when the
total or the card differs. Not built: adding a receipt to a card he already saved as "Waiting on receipt" - that one still
comes by mail and replaces the placeholder (D-057).

**D-094 live since 10-25 16:28 CT; the live stamp is `420e3f3` 16:29 CT - web app @55, site `6ade74b4`, read-back OK (a
third ship of the same code); 618 tests. Nothing owed on the ship.**
Paul's rule: a utility's card or online fee under $50 is recorded on the house of the bill it came with, no card. In the
matching run the model sees RECENT BILLS, names the bill, and code records the one-item 1120 proposal for that house
(`bank-<account>-<feed_id>`); a waiting one-line fee card is offered again each run. **Proved 16:29 CT:** the 9.94
SERVFEE card of 10-08 cleared itself - 9.94 on 1120 for 469 Brushwood, line tied, card retired. The Bank statement tab
shows 9: Lowe's 130.87 (08-10), Home Depot 90.23 / 30.57 / 37.84, Amazon 361.35 / 16.25 / 65.86 / 197.88, Rockett 230.00
- every one a purchase or a question only Paul can answer. Watch: the next utility fee from a city not yet in
`isUtilityFeeLine` (SERVFEE, MUNICIPAL ONLINE PAYMEN) lands as a card - add its wording there.

**16:20 CT - the Red Oak $2 fee card and its 298.72 twin are gone (CHANGELOG, same date):** both lines tied to the 10-01
receipt by a rerun of the matching; the prompt now says in words that a utility bill and its online fee are one receipt.
Asked and answered (D-094, above): a utility's fee under $50 records itself on the house of its bill. The Bank
statement tab shows 10.

**15:56 CT - the two 1.00 ATM cards of 10-07 are gone (CHANGELOG, same date):** D-093 never got a turn because Match
statement lines refused a bank whose open lines all had cards; the menu now counts a waiting line as open (Menu.gs pushed,
no deploy). Both fees are on 6910 under OVERHEAD, lines tied, cards retired; the Bank statement tab shows 12. The 10-24
note "the ten-day sweep cannot run there until a card is dismissed" is closed.

**#19 live since 10-25 14:01 CT - web app @52, site `6ade522d`, 15 files (InboxCard.html among them), read-back OK; 615
tests.** The Inbox card's logic is
`lib/inbox-card.mjs`, included by the dialog as the generated `InboxCard.html` (build-gs writes it; the test keeps it
in sync); the card reads exactly as before. **Checked by Paul 14:05 CT (screenshot):** the Inbox renders on the new include - tabs, mail line, the Amazon card with
its bullets, per-item buttons and pickers. Not yet exercised on the new code: a Save and a Dismiss all (the handlers
are unchanged; their helpers moved) - the first of each is the last proof.

**With #19 the audit's ranked list (#1-#19) is all live or built.** Left from the audit: section 6's decisions,
asked one at a time as they come up (q1 wait ten days for the bank, q4 payouts, q6 the ceiling, q7 Chase deposits,
q8 the two-click Save, q9 who reads properties@ / the digest); #5 step two (a pre-filled payout card) before the
next sale. Owed from before: Paul's Gmail filters for `to-books` (when he says); the 10-11 Poinsetta photo
(`gm-1a12d6f7780f7d94`) - Paul forwards it to receipts@ again; the 28.15 Deluxe check order of 08-11 on 6930, moved
only on his word. Watch: the first spike's `refreshPnl_ timings:` line; the next Dismiss all with a note (the card re-runs the matching); the next Lowe's or Home
Depot email (no logo filed as the receipt).

## 2026-10-25 (end of afternoon) - #15, #13, #16, #17, #12, #11, #18 live

**#18 live 10-25 11:50 PT - a poller push to both instances by Penny, verified by pull (611 tests); nothing for Paul
to run.** A picture under 20 KB in an email is a logo and is skipped with a poller note; an email with only a logo is
read from its text. The same bar in `isDocAttachment_` fixes a gap: a forward carrying only a logo now still borrows
the file it lists from the original message (D-089). `Listing.gs` (the cutover listing, `replayIds`, `repostAll`,
`repostWatch`) is gone from both pollers. **Watch:** the next Lowe's or Home Depot email - its card should show the
receipt (the body or the real picture), never a logo; the poller note names any skipped picture. **Known:** if the
properties@ or paul@ project had a live `repostWatch` trigger it is now a trigger to a missing function (it logs an
error every five minutes) - check the Triggers page of each poller project once; delete it there if present.

**Next work (end of afternoon; #19 done above):** nothing left on the audit's list.

## 2026-10-25 (late afternoon) - #15, #13, #16, #17, #12, #11 live

**#11 live since 10-25 13:47 CT - web app @51, site `6ade4eb7`, read-back OK; 610 tests. Nothing owed on the ship.** One posting path: the web Inbox's Approve
verb, its background half and button are gone; so are D-025's `repost` / `repost-all` replays, `recover-errored.mjs`
and the replay's migration rules in the ingest. What stays of the stored-read re-run is exactly what #7's card
learning uses (`applyPayerOverride`). Nothing Paul does changes: he saves in the workbook's Inbox as before. **Watch:** nothing visible; the next `relearn` (a card number placed on a card, the other cards with it
posting on their own) is the one live user of the kept path - it should still work. **Known:** the poller's
`Listing.gs` `repostAll` (cutover-era, never run since) now calls a verb that is gone - #18 removes it.

**Next work (late afternoon; #18 done above):** #19.

## 2026-10-25 (mid-afternoon) - #15, #13, #16, #17, #12 live

**#12 live since 10-25 13:39 CT - web app @50, site `6ade4d0b`, read-back OK; 620 tests. Nothing owed on the ship.** One map, `lib/plain-words.mjs`, holds
Paul's words for every code the posting engine, the writer, the menu, the dialogs and the site can answer with;
`Style.html`'s `plainError_` shows them in every dialog with a "Paste to Claude: CODE - message" line under, the
menu's void and period alerts the same through `plainWords`; `include_` evaluates Style.html as a template so the map
lands in each dialog. A new code without words fails `test/plain-words.test.mjs`. **Watch (not yet seen):** Paul opens any
dialog (Add expense, the Inbox) - it must render (Style.html is evaluated as a template now); the first refusal Paul meets should read as a sentence with the
grey Paste line under it, never a bold code.

**#15's first timings line (11:05 AM PT run, 17.7 s):** journal 7s, advances 1s, pnl math 1s, pnl tab 0s, taxes 5s.
A normal run. Read the next spike's line (Executions page, click the run) - that names the stage to split.

**Next work (mid-afternoon; #11 done above):** #18, #19.

## 2026-10-25 (afternoon) - #15, #13, #16, #17 live

**#17 live since 10-25 13:30 CT - web app @49, site `6ade4add`, read-back OK; 617 tests. Nothing owed on the ship.** A bank card answered in words (Dismiss all
with a note, or a Save that recorded nothing) starts the matching for that account from the card itself and shows the
run's summary there, with a Refresh link; the site's starter joins a run already going on the account (within ten
minutes) instead of starting a second, and the card then runs once more so the later answer is read. **Watch:** Paul's next Dismiss all with a note on a Bank statement card - the card's box should read "Claude is
reading your answer against the N open bank lines... 5 s" and end with the run's summary; the Feed row's note the
run leaves should answer his words.

**Next work (afternoon; #12 done above):** #11, #18, #19 - each with tests, CHANGELOG/HANDOFF, a commit and
`npm run ship` handed to him as one command.

## 2026-10-25 (midday) - #15, #13 and #16 live

**#16 live since 10-25 13:22 CT - web app @48, site `6ade48f6`, read-back OK; 614 tests. Nothing owed on the ship.** Paul's word: "a bank fee under $50 can be
recorded on its own, no card" (D-093). In the matching run, before the model: a line that is money out, under 50.00,
the bank's own words saying FEE or CHARGE (or a check order) is settled by code - tied to an entry the books already
hold within ten days, else recorded on 6910 under OVERHEAD on the id `bank-<account>-<feed_id>`; its card, if waiting,
is retired; the run's summary says "N bank fees recorded on their own". "WAXAHACHIE SERVFEE" (the city's processing
fee) is not one and stays a card. The matcher's prompt said 6930 for fees - wrong, it is interest; it says 6910 now.

**Watch:** the next Match statement lines (or Import statement) on Citizens - the two 1.00 FOREIGN ATM
CHARGE cards of 10-07 leave the Inbox on their own, their lines read matched to `bank-1401-2026100700000005533...`,
the 9.94 SERVFEE card stays; the summary box shows the fees line. **Flagged, not changed:** the 28.15 Deluxe check
order of 08-11 (`receipt-20260811-6f1e7f8fc6d9-f728`) is on 6930 (interest) - move to 6910 only on Paul's word (a void
and a re-post).

**Next work (midday; #17 done above):** #12, #11, #18, #19.

## 2026-10-25 (morning) - audit #15 and #13 live

**Live since 10-25 13:03 CT - `npm run ship` by Paul: web app @47, site `6ade4486`, read-back OK; 612 tests. Nothing owed on
the ship.** **#15:** the hourly P&L run was measured first from the writer's Executions log (26 runs, 10-24
08:05 to 10-25 10:05 PT): most take 15-55 s, five took 140-354 s, and the 10-24 3:05 PM run finished 6 s under the 360 s
cap - a spike, not a steady climb. `refreshPnl_` now logs `refreshPnl_ timings: journal Ns, advances Ns, pnl math Ns,
pnl tab Ns, taxes Ns` every run; the hourly handler leaves `PNL_RUN_STARTED` in Script Properties while it runs, and the
next run logs a leftover mark as a death, counts it (`PNL_RUN_DEATHS`) and after two in a row mails Paul one line (once
a day, `mailPaulOnce_`, which the mail heartbeat now shares). Not done: splitting the run - wait for the first spike's
timings line to say which stage. **#13:** the three HTTP write paths (`postEntry_`, `voidEntry_`, `postBatchEntries_`)
and the import give the lock back right after the rows land and rebuild the house / bank tabs after it; every
`waitLock` is `LOCK_WAIT_MS` = 120 s.

**Watch (live from the 2:05 PM CT run on):** the next hourly run's Executions entry carries the timings line (Chrome, the writer's
Executions page; the 9:05 AM, 3:05 PM and 1:05 AM PT runs have spiked before) - the first spike's line names the stage
to split; a `console.error` "never finished" line is a death; Paul's first Save or void after the ship still shows the
house tab updated (the rebuild moved after the lock, it did not go away).

**Owed, in order:** (1) From 10-24, unchanged: Paul's Gmail filters that apply `to-books`,
one at a time when he says; the 10-11 Poinsetta photo (`gm-1a12d6f7780f7d94`) - Paul forwards that email to receipts@
again, Claude clears the old error card.

**Next work (10-25 morning; #16 done above):** #16 bank fees - asked and answered ($50, D-093) - then #17, #12, #11, #18, #19, each with
tests, CHANGELOG/HANDOFF, a commit and `npm run ship` handed to him as one command. Section 6's other decisions (q1, q4,
q6, q7, q8, q9) are asked one at a time as they come up, never all at once. The Inbox is read back with the Netlify CLI
(`blobs:list books-docs --prefix doc/feed-`, `blobs:get books-docs index/docs`), not the API.

## 2026-10-24 - the audit's ten changes are live; the partner money is in the books

**Live (every piece shipped by `npm run ship` or deployed by Paul 10-24; the last ship: web app @46, site `6add438a`,
poller pushed to both instances):** audit #1-#6 and #14 (CHANGELOG "the audit's first six changes"), **#7** a card number
the read cannot place is remembered on the row Paul picks and the other waiting cards with it post on their own
(`/api/inbox relearn`; Paul's yes to the write, section 6 q2), **#8** `npm run ship` is Paul's one ship step (tests, build
stamp, push, both deploys, read-back of `/exec` and `/build.json`; `--dry` for the checks only), **#9** the document
index `index/docs` (1,428 documents, 1.1 MB; a scan is one list call plus the changed documents), **#10** the poller marks
a thread done only after an upload, the `to-books` Gmail label is a second way in (Paul: "ok, lets try it"; the label or
a forward, never both), and a heartbeat per mailbox (`poller/last/<mailbox>` in books-cache, stamped by every poll;
the Inbox header says "Mail last checked ...", red past three hours; the nightly check names it when stale; the
writer's hourly trigger mails Paul one line when paul@ has gone three hours unchecked). Heartbeats verified 10-24
evening for both mailboxes. `mark-posted` takes `repoint: true` for a posted record whose entries were voided.

**The books (all on Paul's word 10-24, each read back; ids in CHANGELOG):** his 104 Ashburne payout 147,729.38 wired
Citizens -> Chase 10-09 (payout + his working money in Chase + 25.00 fee); his 30,000.00 to personal 8870 10-14; the
2,000 earnest-money line tied (D-051); Mariana Martinez's 300 (Poinsetta) and 350 (Erin Hills) re-posted paid from
Chase (their Inbox records re-pointed); Dennis's 10-07 payouts - 17,829.27 Ashburne (all interest), 240,895.21 Newport
in full with 10,000.00 left in Citizens as his working money (D-055); the 574.63 Chase "To ALA 1201" = Paul's truck
loan paid from Recast by mistake, his money out; the 500.00 Charvale Zelle = Paul's own money by mistake, owed back.
Both closing tabs read paid in full to Dennis; Paul still owed 27,609.53 on Newport. Chase is tied line for line.
Citizens: 14 ordinary cards in the Inbox (1,473.51 - three Dennis's-card charges with no receipt, Red Oak 298.72 +
2.00, two 1.00 ATM fees, 9.94 fee, four Amazon, Home Depot 37.84, Rockett 230.00). `closingFromJournal_` now counts
every "paid to" entry toward paid so far (a second payment to a partner used to be left off the PAYOUTS block).

**Owed, in order:** (1) done - the two note commits were on GitHub by 10-25. (2) Paul's Gmail filters that apply `to-books` -
Foremost, the bank's Zelle "was sent" notices, PACER, Venmo forwards - one at a time, when he says ("we'll do the
filters later"); the label works by hand now. (3) The 10-11 Poinsetta photo `gm-1a12d6f7780f7d94` is still in error:
Paul forwards that email to receipts@ again (the 2000-px fix is live), Claude clears the old error card.

**Watch:** the first card that says "card ending NNNN will be remembered" (the row's digits after the Save, the other
cards with that number posting on their own); the first `to-books` email coming in; the writer's hourly Executions log
for `checkMailHeartbeat_` (no permission prompt came when Penny ran the writer after the scope was added - if the log
shows an authorization error, Paul runs any function in the editor and clicks Allow); the Inbox header's time.

**Next work, Paul's pick (audit section 3's second list; he asked what is left; #15 and #13 done 10-25, above):** #15 measure
`refreshBalanceSheetHourly` (241 of 360 s, a silent stop past it) and #13 the house-tab rebuild out from under the
writer's lock on the three HTTP paths + `waitLock` 30 -> 120 s - both small, both against silent failures - then #16
bank fees under a ceiling posting from the matcher (needs his yes and the amount, section 6 q3), #17 a bank answer
re-running the matcher by itself, #12 plain words for every code, #11 one posting path, #18 inline logos + the pollers'
cutover code, #19 the Inbox lint as unit tests. #5 step two (a pre-filled payout card) only before the next sale.
Decisions still his, asked one at a time as they come up: section 6 q1 (wait ten days for the bank), q3, q4, q6, q7,
q8, q9. **Noted, not changed:** Match statement lines never offers a bank whose every open line already has a card
(`unmatchedFeedCounts_` counts `unmatched` only), so the ten-day sweep cannot run there until a card is dismissed.

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

> Work in `/Users/paulbjork/Desktop/Claude/Recast-books` as Penny. Read `CLAUDE.md`, then `HANDOFF.md` (the 2026-10-24
> START HERE section first), then `docs/audit-2026-10-24.md` section 3's second list and section 6. The audit's ten
> ranked changes are all live (last ship: web app @46, site `6add438a`); the partner money is in the books. Pick up in
> this order, one step at a time and in plain words: (a) if two note commits are still local, hand me `git push` as one
> command; (b) audit #15 (measure the hourly P&L refresh and stop it silently dying past 360 s) and #13 (the house-tab
> rebuild out from under the writer's lock on the three HTTP paths, `waitLock` 30 -> 120 s), each with tests, recorded in
> CHANGELOG/HANDOFF, committed, shipped with `npm run ship` (my step - hand it to me as one command); (c) then #16
> (ask me the bank-fee ceiling, section 6 q3, before building), #17, #12, #11, #18, #19 in that order, the same way.
> The Gmail filters for `to-books` are mine, later - when I say. Read the Inbox back with the Netlify CLI
> (`blobs:list books-docs --prefix doc/feed-`, `blobs:get books-docs index/docs`), not the API. Deploys are `npm run
> ship`; `clasp login` is mine. Section 6's decisions: ask them when they come up, not all at once.
