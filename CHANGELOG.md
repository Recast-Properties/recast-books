# Changelog

## 2026-08-26 — Repo created, plan drafted and reviewed

**Created** this repo as a fourth workstream under `Desktop/Claude/`, alongside
`Auction Sheets/`, `Recast-app/` and `Recast-site/`.

**Analyzed** the live workbook end to end: RECAST BIZ (11 category blocks, $18,947.31
overhead YTD), six property tabs across two templates, the cash-advance/draw tab, and
the contractor directory. Computed per-payee contractor totals across all property tabs
— work the workbook itself cannot do, since costs are scattered by trade and by property
with no payee roll-up anywhere.

**Found:** nine payees over the 2026 1099 threshold with zero W-9s on file; payee-name
fragmentation hiding the thresholds (Julio in 3 spellings, Effren in 3, Mariana in 2);
an unnamed property tab; two tabs for one property (280 Sparkling); rehab materials
sitting in company overhead because the receipts automation has no property routing;
and one property's interest (420 Alyssa) on the overhead tab while every other
property tracks its own.

**Decided:** books stay in Sheets, not QuickBooks (D-001). Both property templates
stay (D-002). Agent layer extends the existing bookkeeper rather than replacing it
(D-003). Bank statements are uploaded to a `statements@` channel rather than fed
(D-004).

**Reviewed** the plan adversarially — five expert lenses, each then forced to attack
its own findings. 35 findings, 1 withdrawn. Full record in
`docs/review-2026-08-26.md`.

**Revised** the plan in response. The substantive changes:

- **Added the entire income side of the chart of accounts.** The first draft had 1000s,
  6000s and 9000s and no revenue accounts at all — the $775,000 Ashburne sale had
  nowhere to post. Two reviewers found this independently. Added 4000s income, 5000s
  COGS, and the release rule that moves a property's accumulated costs to COGS on its
  settlement date.
- **Added the balance sheet accounts** that were missing: cash per account (1400),
  earnest money (1500), escrow receivable (1510, where Granite's $60,000 belongs), and
  member note payable (2010).
- **Added Phase 0.5**, an opening trial balance. Nothing ties to anything without an
  opening position.
- **Corrected the 1099 threshold.** It rose from $600 to $2,000 for 2026 under OBBBA;
  prior years stay at $600. Earlier guidance in this project used the stale number.
  Re-derived the payee list by tax year — the qualifying set changed, and confirmed
  there is no prior-year exposure.
- **Pulled W-9 collection out of Phase 3** to a "do now" step. It has no dependency on
  the migration and it is the only item with a statutory deadline.
- **Split Phase 2** into faithful copy then logged corrections, with separate gates.
  The single "tie out to the cent" gate contradicted corrections the plan itself
  mandated.
- **Added §274(d) substantiation columns** (business purpose, attendees, destination,
  odometer) and removed travel/meals/gifts from autofile eligibility.
- **Added an amount ceiling to the autofile gate.** A $13,500 charge could file itself
  on self-reported confidence alone.
- **Added tax home as a gating decision.** It governs $8,821.59 of travel — 47% of
  overhead — and was missing entirely.
- **Retracted the segregation-of-duties claim** (D-005). Substituted quarterly external
  review and distribution monitoring.
- **Moved the monthly close** off the first business day, which is courthouse auction
  week, to the second Friday. Added an open-items tolerance so one bad month does not
  end the habit.
- **Cut** per-property inboxes as ceremony — agent routing makes them redundant.

## 2026-09-11 — Build authorized; plan drafted

Paul directed that the bookkeeper be built as a completely new, separate system,
running alongside the current one until proven. Decisions D-006 (Dennis is a lender,
not a member; 9% compounding on each advance's monthly anniversary; 50/50 after payoff),
D-007 (Plaid bank feeds, three accounts), D-008 (separate Netlify site at `books.`,
Google sign-in with roles, code lives here, all 2026 history copied, nothing deleted),
D-009 (actual vehicle method on Dennis's truck). Q-2 and Q-5 closed; Q-1, Q-3, Q-4
become settings rather than blockers. `BUILD-PLAN.md` drafted — awaiting sign-off.
Later the same day, D-010: interest runs from deposit, one advance per property carried on
that property's balance sheet; overhead is Paul's alone, never allocated. Q-6 closed.
Spec added: the **Payout report** — on every sale, one ledger-generated, shareable report
of what Paul, Dennis and the shared Recast account each receive, tying to net proceeds.

## 2026-09-11 — Phase 0 built and gated

Repo became the application. Netlify site `recast-books` (books.recast-properties.com
attached, DNS pending), Google sign-in with roles, `/api/*` functions, posting engine
(double entry, integer cents, every rule from BUILD-PLAN §2 enforced in code), Apps
Script writer v0.1.1 (ScriptLock, header-name lookup, dedupe, period gate, void), new
workbook `12QVyxm3KnLD7CDC8mFAPd5ulZuRXRluNDi4qK4BBxKM` created by `setup()`. Three
Sonnet agents built the modules from `docs/phase0-spec.md`; Fable reviewed every file.
102 tests. Gate passed end to end (spec §11).

## 2026-09-11 — Phase 1 built and gated

Ledger core: accrual engine (`lib/accrual.mjs`, reproduces 881 Newport to the cent),
reports library, writer v0.2.0 (postBatch under one lock, Advances, Accounts upsert,
Bank accounts seed), `/api/dennis` (advances, interest preview/post dated period end),
`/api/reports`, pages for Properties (with property balance sheet, job cost, advances),
Vendors, Banking, Dennis, Reports (TB/BS/P&L/job cost with tie-out lines and CSV), Settings
(editable settings, users add/role/remove), hash routing, business purpose in the journal
grid. 174 tests. Gate passed end to end (`docs/phase1-spec.md` §8). Test rows left in
Properties/Advances are labelled and safe for Paul to delete by hand.

## 2026-09-11 — Plaid production access requested

Paul created the Plaid account (Recast Properties LLC), selected Transactions only,
Pay As You Go plan, verified business (Paul sole beneficial owner), submitted the
production request. Plaid quoted 2–3 days. Sandbox keys exist now; production keys go
on the Netlify site as `PLAID_CLIENT_ID` / `PLAID_SECRET` when approved (Phase 3).

## 2026-09-11 → 12 — Phase 2 built; gate in progress

Receipts bookkeeper v2: `lib/bookkeeper.mjs` (Claude Opus 5, adaptive thinking, manual
tool loop: zoom / read_ledger / find_vendor / list_properties / search_docs / web_search /
decide), `lib/bookkeeper-prompt.md` (shipped as a generated module), `lib/gate.mjs`
(deterministic autofile gate + invoice-number duplicate rail), `purchase` posting intent,
functions `/api/upload`, `/api/ingest-bg`, `/api/inbox`, `/api/file`, `/api/summary`,
writer v0.3.0 `storeDocument` (Drive filing under Recast Books/<year>/<property>),
Gmail poller project "Recast Books Poller" (label `books-done`, 15-min poll from
START_DATE, 3 AM digest, Drive-rendition shrink for big photos), Inbox + Upload pages.
350 tests. Three Sonnet agents built from `docs/phase2-spec.md`; Fable reviewed.

Gate so far: 25-document dry run over 30 days reviewed by Paul; live receipts posting
(Anthropic credits, American Airlines flight) with correct paid_from after card digits
were put on file. Bugs found and fixed during the gate: `__dirname` collision in the
bundle; strict tool schemas reject min/max; full Drive scope needed for folders; Blobs
client token expiry on warm instances; run-together string fields in `decide` output
(repair rail + nullable optionals); series compared as number vs text; post with no
entries bounced back to the model; payment instruments never shown to the model.
Decision D-012 recorded. Remaining: phone-upload check, first digest confirmation.

## 2026-09-12 — Phase 2 gate passed; D-013

Phone upload verified end to end: FedEx Office $12.75 photographed on the Upload page,
read by the model (zoomed totals, invoice number, duplicate check clean), gate PASS, posted
to Journal rows 32–33 as 6500 overhead postage, filed in Drive under
`Recast Books/2026/OVERHEAD/` with `doc_url` on the entry. First 3 AM digest arrived.
Phase 2 gate recorded as passed in `docs/phase2-spec.md` §11. Polish noted: filed photos
keep the phone's `image.jpg` name. D-013 recorded: the new workbook is cleared once at
the start of Phase 4 (test and parallel-run entries), then migrated and live receipts
replayed; append-only after that. Next: Phase 3 (Plaid) on Paul's go.

## 2026-09-12 — D-014: unknown payer is held, not defaulted; Drive file names

The FedEx gate receipt exposed a bad rule: the prompt told the model to fall back to a
Settings default account when no card was legible, and it did (1402); Paul had paid on
his personal Visa. D-014: the model now reports `paid_from = UNKNOWN`, the gate holds with
`PAYER_UNKNOWN`, the Inbox card shows "— assign account —" and Paul picks the account on
approve (an untouched placeholder is refused by the posting engine). Settings
`default_paid_from_*` are no longer read. Filed documents are named
`<date> <vendor> <total>.<ext>` from the verdict instead of the phone's `image.jpg`.
352 tests. The FedEx entry itself stays on 1402 by Paul's choice; it goes with the D-013 clear.

## 2026-09-12 — Phase 2.5: read cache (Plaid keys still pending)

Paul asked why the site is sluggish. Measured: every workbook read is an Apps Script
round trip, 2–13 s; everything inside Netlify is under a second. Built `readTab` in
`_shared.mjs`: whole-tab snapshots in Netlify Blobs `books-cache` (Journal 60 s TTL,
others 10 min), refreshed by every write handler for the tab it wrote, `fresh: true`
for the model's ledger view and the D-012 duplicate re-check, stale-beats-dead for
everything else under an 8 s timeout. Warm reads now 0.2–0.25 s. Settings page gained
"Refresh from sheet". Spec and gate: `docs/phase2.5-spec.md`. Sonnet built from the
spec; Fable's review fixed the fresh-read fallback and made post-write refresh best
effort. Paul also asked whether Sheets should stay the system of record; answer given
(Sheets stays; a database swap, if ever, belongs at the Phase 4 clear). Plaid
production keys have not arrived; Phase 3 spec waits.

## 2026-09-12 — Chart of accounts tax-bucket review

Paul asked whether the expense buckets are right for tax. Structure confirmed for a
dealer on Schedule C. Added **6350 Abandoned deal costs** (forfeited deposits were
pointed at Data & research) and **6930 Interest — other** (no home for non-property
interest). 9020/9030 were already gone from the live chart; the doc now says so. Doc
note that refunds reverse the expense rather than post to 4030. Three questions remain
the accountant's: tax home, capitalize-vs-deduct holding costs, the truck. In
`lib/coa.mjs`, the writer seed, the prompt and `docs/chart-of-accounts.md`; Paul adds
the two rows to the live Accounts tab by hand.

## 2026-09-14 — Night-of-09-13 comparison against the old bookkeeper; three fixes

Paul: the old system understood last night's receipts better. Compared both digests.
(1) **Anthropic $100 posted twice** — original and Paul's forward were read in parallel,
finished 3 s apart, and the D-012 pre-post ledger re-check lost the race to the writer's
own read latency. Fix: a receipt with an invoice number now gets a `txn_id` keyed by
payee + invoice + property, so the writer's lock refuses the twin (`DUPLICATE` → dismissed
with `duplicate_of`). (2) **Netlify PDF invoice "unsupported"** — Gmail labelled it
`application/octet-stream`; the new poller passed that through, the old one re-types by
extension. Fixed in the poller (needs `clasp push` after Paul's `clasp login`) and in the
bookkeeper. (3) Sign-in hung: the first Users read since the cache deploy had no snapshot
and the cold writer ran past 8 s. Added `books-warm` (scheduled every 5 min) →
`books-warm-background` refreshing every tab; Journal TTL to 10 min; the Settings read's
`ping` cached in Blobs. Not bugs: Netlify $20 held for the payer (D-014), Uber Eats
dismissed as personal (D-012) — the old system files without knowing who paid and holds
every Uber Eats.

## 2026-09-14 — Poller: two more behaviours ported from receipts-poller.gs

Paul: "it seems you rewrote the poller for the new system vs using what was working."
Correct — the Phase 2 agent re-derived it from the spec instead of copying the working
file. Diffed the two: besides the MIME fix, the new poller lacked the per-message
"addressed to receipts@/travel@" check (a reply in a receipt thread was being ingested
as a document) and the 6-attachment cap. Both ported. Lesson for the specs: "modelled
on X" means copy X and change the endpoints, not write X again.

## 2026-09-14 — Totals tab in the workbook

Paul: "where does it show totals?" — the workbook had raw Journal lines only; totals lived
in the app. Added writer `setupTotals()`: a formula-only **Totals** tab (trial balance by
account, key balances, cost by property, overhead by account, all SUMIFS over Journal as
of the date in B1). Paul ran it from the editor; TB ties to the app's trial balance
(4,137.80 both sides). Rerun `setupTotals` any time to rebuild; it is not in the writer's
readable/upsertable tab lists on purpose. Also added the 6350/6930 rows from the 09-12
chart review to the live Accounts tab (Claude, via the sheet). The 1401 bank account has a
blank name ("Cash - ") — Paul can fix it on the Banking page.

## 2026-09-14 — D-015: two locks

Paul: can the year be one period, given properties straddle quarters and Dennis's
interest only reconciles at the sale? Yes — tax period is the year. D-015 recorded:
overhead locks by period (OVERHEAD lines only); a property locks at sale via the sell
wizard with a true-up entry to Dennis's interest figure; post-sale bills post to COGS
under the sold property; Dennis's share of those accrues on a per-partner adjustment
balance settled on the next payout (Paul chose this over eating it or re-issuing the
payout). Shapes Phase 5. Also agreed, not built: open-period corrections show as one live
entry with history; Totals and the Journal hide voided pairs by default.

## 2026-09-14 — D-016: Dennis's rate is 8%

Paul sent two of Dennis's interest figures. A fit across rates and day-count conventions
shows 8% compounded on the monthly anniversary with simple stub days — our engine's
method — within $1–$9; 9% is off by hundreds. Paul: "it's 8%. i was using 9% as a hedge."
Settings `interest_rate_annual` set to 0.08 in the sheet (Claude), code defaults and the
writer seed to 0.08, docs updated, D-016 recorded; the accrual goldens (from the old tab
at 9%) now pass the rate explicitly, plus one test against Dennis's own figure.

## 2026-09-14 — Voided pairs hidden

Paul: "the mistakes stay in the system?" — yes (append-only, audit trail), but they should
not be in his face. Journal page now hides a voided entry and its reversal by default
("N voided entries hidden · Show"). Totals tab gross Debit/Credit columns exclude voided
pairs (helper column H flags voided txn_ids once; SUMPRODUCT per cell; codes coerced to
text so hand-typed numeric codes match). Nets are unchanged. Paul reruns `setupTotals`.

## 2026-09-14 — Phase 2.6 built: property mailboxes and property tabs

Spec `docs/phase2.6-spec.md`. Property mail lives in properties@ (each property email is
a Google Group with properties@ as member and a Gmail label named for the property, made
by the Recast-site email tool). A second copy of the poller runs as properties@
(`MAILBOX=properties`): each run it POSTs its labels to `/api/property-mailboxes`, GETs
the registered properties, matches by normalised name, searches `label:<name>` per match,
uploads with channel = property name; unmatched labels are skipped and logged; no digest
trigger on that instance. Upload accepts a registered property as channel; the ingest
tells the model which property mailbox the document came through (strong hint, not a
rail). Writer action `propertyTab` / `setupPropertyTab(name)` builds a formula-only tab
per property (summary by cost class, Dennis advances with in-sheet interest at the
Settings rate, preliminary payout, lines per class, post-sale block). Properties add form
offers the mailbox labels as a dropdown and builds the tab on save. Sonnet built from the
spec; review fixed the stub-basis cell, a double-subtracted payoff in the preliminary
payout, future-dated advances, Gmail's hyphenated label search, and the duplicate digest.
394 tests.

## 2026-09-14 — Empty Journal snapshot took the reports down

Paul opened 1616 Granite and got HTTP 502: `getJournalAll` returned no rows. The cached
Journal snapshot was `{"fetchedAt"}` only — the writer answers POST with a redirect and a
slow Journal read once landed on `doGet` (an "ok" body with no headers/rows), which
`refreshTab` stored. Fix: `refreshTab` refuses a read without header and row arrays
(`BAD_RESPONSE`), `readTab` treats a malformed snapshot as a miss and never serves one as
stale. Self-heals on the next read. 395 tests.

## 2026-09-14 — D-017: Held or Sold

Statuses reduced to held / sold; optional `contract_price` on Properties (column K) feeds
the property tab's preliminary payout. Sold properties now leave the posting allowlist
(they never had — latent bug). Mailboxes, upload and the model's property list all use
one rule: not sold = held.

## 2026-09-14 — Property tab laid out like the old workbook's tab

Paul sent the old `881 Newport` tab as CSV: "i want the property tabs to more closely
match this." `setupPropertyTab` rebuilt side by side — summary A:B (Total Project Cost,
Purchase Price, Interest to Date, Rehab Costs, Utilities, Property Tax, Profit Breakdown,
Payouts for Dennis / Paul / Back to Recast account), Dennis block D:H (per-advance Start /
End / Principal / Interest schedule, Paul Paid / Reimbursed / Due to Paul, Dennis Paid
direct, Recast Account paid / received / net), Rehab Costs J:P and Utilities R:X line
blocks with Paul Paid / Dennis Paid / Recast Account checkboxes, POST-SALE under rehab.
Not reproduced: the cash-advance interest charged to Paul personally (D-011 makes all
Dennis interest a project cost) and the typed property-tax proration (posted 1100 lines
show instead). New: a tie-out row — total payouts must equal net proceeds. (The
$446.67 utilities double count noted on 2026-09-11 is gone from the tab Paul sent: its
six summary lines tie to $219,638.04 exactly.) Spec §5 updated. 395 tests.

## 2026-09-14 — Property tax proration on the property tab

Paul: "explain to me how you are accounting for property tax?" — the new tab only showed
posted 1100 lines, so before a sale it read $0 where the old tab typed a Jan-1-to-date
proration of the annual bill ($7,942 → $5,591.76 on Newport). Added `tax_annual` to
Properties (column L; the writer's upsert writes a header missing from TAB_HEADERS on
first use, so no `setup()` re-run) and a field on the add/edit form. The tab's Property
Tax row is posted 1100 plus the proration while unsold; Net proceeds subtracts the same
estimate (it is netted on the ALTA), so the tie-out stays at zero. Once the property is
sold the estimate is zero and only the settlement statement's posted line remains.

## 2026-09-14 — D-018: Anthropic usage split by workspace

Paul asked how to tell what each Claude workload costs and log it accurately. Console
workspaces created (Recast Books, Receipts (old site), Title Search, Anything else); the
books site moved to a non-expiring key in its workspace (the old Personal key expired
2026-10-11). New `1520 Prepaid API credits`; the prompt sends Anthropic top-ups there.
New `/api/api-costs` (`netlify/functions/books-api-costs.mjs`): GET previews the month's
cost report by workspace mapped through Settings `api_cost_account:<workspace>`; POST
(owner or poller) posts Dr per workspace / Cr 1520 dated month end, skipping a month
already on the Journal, creating the 1520 Accounts row and any missing mapping rows on
first use. The paul@ poller's 3 AM digest calls it on the 2nd of the month. Needs
`ANTHROPIC_ADMIN_KEY` on Netlify. 410 tests.

## 2026-09-15 — D-019: Plaid dropped; Phase 3 spec rewritten around statement uploads

Plaid's production security questionnaire (access policy upload, MFA evidence, vulnerability
attestations) was out of proportion for three of Paul's own accounts: "this is not what i
expected and is too much." D-019 supersedes D-007: monthly OFX/QFX (CSV/PDF fallback)
downloads uploaded or forwarded to statements@, parsed by code into Feed, matched by the
bookkeeper, reconciled per account to the statement's closing balance. `docs/phase3-spec.md`
written for Paul's review; BUILD-PLAN and CLAUDE.md scrubbed of Plaid. The access control
policy written for the questionnaire is kept (`docs/access-control-policy.md`).

## 2026-09-15 — Property tab is the forecast; closing tab goes to Phase 5

Paul reviewed the rebuilt Granite tab: colours and layout copied from the old tab, gaps
closed, paid-by headers on the header row, post-sale block beside Utilities, line blocks
to the bottom of the sheet (one spilling SORT(FILTER) per block; the voided flag moved to
a hidden `Journal helpers` sheet so the array formula stops growing the tab), Sale Price a
typed input kept across rebuilds, Purchase Price from the registry until the purchase is
posted, advance block sized to the property's advances (the Dennis page rebuilds the tab
after each advance). Then: "i need two things: a working spreadsheet for showing me costs
and estimating profits, and a property reconciliation tab with actual costs from closing."
Split agreed: the property tab is the forecast (no posted selling costs, no tie-out row);
a closing tab with settlement actuals, the true-up and the payouts-equal-proceeds check is
built by the Phase 5 sell wizard beside it, estimate frozen against actual (BUILD-PLAN §5).
Test property removed from Properties, Advances and its tab.

## 2026-09-15 — Advances by kind; D-020 cash-advance interest is Paul's

Dennis page gained a Kind (purchase principal / cash advance) and the Advances tab a
`kind` column. A purchase principal posts as the purchase itself (Dr 1000 / Cr 2010 —
Dennis pays the seller, nothing lands in an account); a cash advance lands in a bank
account or, for checks Paul deposits personally, on 2030 Due to owner ("Paul Personal" in
the Into list). Bank accounts renamed Recast Citizens - Shared / Recast Chase - Operating.
Property tab: two schedules (Purchase Principal + Interest on top, Cash Advances + Interest
under the who-paid blocks), Paul's greens, left-aligned Dennis block, no Notes column, no
gaps. D-020: Dennis's payout adds the cash-advance interest "from Paul", Paul's subtracts
it "to Dennis", and the close job accrues it to 2030 instead of 1200. Add-advance button
shows progress and ignores repeat clicks; the tab rebuild runs after the post. 1616 Granite
carries its three real advances.

## 2026-09-15 — D-021: D-020 withdrawn within the hour

Paul asked whether he owes all or half of the cash-advance interest. Walked through it:
interest follows the money. The Granite checks reimbursed him for Granite expenses, so
they paid for the property and their interest is a property cost, split through the 50/50
as D-011 always said. Tab payouts and the close job put back; `kind` kept for the
schedules and the purchase posting.

## 2026-09-15 — D-022: personal loans, per-property share, per-advance rate

Dennis page: Kind gains "Personal loan to Paul" (2030/2010, no property; interest to 2030),
and an interest-rate field per advance (`Advances.rate_pct`, default from Settings).
Properties form: "Dennis profit share %" (`dennis_share_pct`, default 50; 0 for Ashburne
where Dennis was the bank only). Property tab: Dennis Share / Paul Share rows at the
property's split, per-row rate on the schedules. Accrual engine and Dennis ledger honour
the per-advance rate; personal loans group under "Paul (personal)". 408 tests.

## 2026-09-15 — Personal-loan kind withdrawn

Paul: every Dennis advance, partner deal or bank-only deal, is against a property. The
`personal` kind added an hour earlier is removed from the form, the function, the posting
engine and the ledger; the per-advance rate and per-property share stay. 407 tests.

## 2026-09-15 — Property tab: Paul's final pass

Summary rows read Purchase Principal + Interest / Cash Advance Interest (same total; the
cash-advance interest stays in Dennis's payout as "Cash Advances + Interest" because it is
his money — dropping it would leave payouts $158.16 short of net proceeds). End Date is
typed on the tab and written to `Advances.repaid_date` by a new onEdit trigger
(`installTriggers()`, run via `setup()`; manifest gained `script.scriptapp`); interest
freezes at that date in-sheet as in the engine. Cosmetics: End Date cells white, "Recast
Account Paid" head, payout totals `#fff2cc`. Granite with end dates 07/27 shows $6,882.27
purchase-principal interest against Dennis's $6,873.90. Everything on the tab reconciles:
payouts $408,500.00 = net proceeds $408,500.00 on a $430,000 estimate.

## 2026-09-15 — Phase 2.7 spec'd: front end moves into the workbook (D-023)

Paul asked for the bookkeeping input side to become custom Sheets menus, because the web
app's round trips through Netlify to the writer are too slow; the receipts poller and
automation stay on Netlify. `docs/phase2.7-spec.md`: the writer becomes a container-bound
project (menus need one), `lib/` is generated into `lib.gs` by a build script rather than
rewritten, a **Recast Books** menu carries expense/journal/void, add property, add advance,
post interest, close/reopen period, and reports written to tabs; Vendors, Bank accounts,
Settings, Users are edited directly with two small guards. The moved web pages and their
functions are deleted. Inbox review moves in a later step (queue to an `Inbox` tab first).
Phase 3 will be revised to the menu shape. Awaiting Paul's go.

## 2026-09-15 — Phase 2.7 built and gated: the books' input side moves into the workbook

Writer re-homed as the project bound to the workbook (new script id and web-app URL, one
Netlify env change; old project dormant, its trigger deleted). `scripts/build-gs.mjs`
generates `apps-script/writer/lib.gs` from `lib/` (coa, money, accrual, posting, reports,
property-key) with a crypto shim; `test/gs-lib.test.mjs` runs it under a `Utilities` stub
and proves the same entry and interest as the ESM source. `Menu.gs` + six HtmlService
dialogs: New expense, New journal entry, Void selected entry, Add property, Rebuild
property tab, Add advance, Post interest (preview/post), Close/Reopen period, Reports to
`Report - <name>` tabs, Self test. Writer 0.4.0: action internals callable in-process,
bound-workbook resolution, Drive folder adoption, cache-warm poke, Bank accounts→Accounts
mirror (create-only) and last-owner guard on the one onEdit trigger. Web app: Journal,
Properties, Vendors, Banking, Dennis, Reports, Periods pages and `books-dennis`,
`books-ledger`, `books-reports` functions deleted; `books-meta` is GET-only. Posting
engine: the credit line now carries the item description (Paul: "i want to know what the
item that was purchased is"), for receipts and menu entries alike. 381 tests. Gate record:
`docs/phase2.7-spec.md` §12.

## 2026-09-15 (late) — paid-by checkboxes on the property tab change the entry

Paul: "change who paid for an expense by changing the checkbox and have it update the
journal." Ticking Paul Paid / Dennis Paid / Recast Account on a Rehab Costs or Utilities
line voids the entry and re-posts it with the new `paid_from` (append-only; the void names
the reason). Sheets cannot toggle a checkbox that shows a formula result, so the line blocks
became values the writer writes (`refreshLineBlocks_`) after every post, void, batch and
rebuild, with the txn_id in a white-on-white column beside each block. Gated on 1616
Granite: 1401 -> PAUL, boxes flipped, Journal shows void + re-post.

## 2026-09-17 (late) — Staging re-post, Ashburne bank-only, heavy tab, advances migrated

Full read of both mailboxes done (946 documents). Re-post run 1 into staging with the D-026
overrides; findings and fixes in `docs/phase4-audit.md` §14: empty-Journal read now valid
(`_shared.mjs`), property override remaps 65xx → 1030 and never moves fuel (D-026.9),
`repostAll` resets on a new list, `readTab` #N/A cause on property tabs fixed (voided factor
from Journal columns). Heavy property tab rebuilt as the old Ashburne layout (trade blocks
side by side). Ashburne registered bank-only: `Properties.dennis_commission_pct` (new column),
payout rows for the commission, 12% advances. `migrationRegisterAdvances()` posted the old
Cash Advances schedule (30 rows). Pipeline properties 413 Green Acres and 200 Janice registered
so pre-acquisition costs are kept. Pending: deploy + targeted re-post of 257 documents, then
the tie-out.

## 2026-09-17 — Phase 4 staging replay, run 1 (D-024/D-025)

Built and ran the forensic migration's first pass into the **STAGING** copy of the workbook.
- Listings (read-only `listBooksMail`, `apps-script/poller/Listing.gs`): paul@ 3,454 messages,
  properties@ 530, pvb421@ 4,253 (personal; used by id only). Finding: no poller project ever
  existed under properties@ (Phase 2.6 instance never created); a fresh one holds the listing
  and the poller code now (`1jbU7FfRFTNgKPpy8aDm7kg8ll5oFJdPmzqWaxr8ZJmSvA9gN9p4cWFyB`).
- Staging: Drive copy of the workbook (bound writer came with it; script id in
  `phase0-spec.md` §10), its own Drive folder, `clearBooks()` (guarded by `CLEAR_CONFIRM`),
  `WRITER_URL` on Netlify switched to the staging deployment (Paul ran env:set + deploy),
  `migrationRegisterProperties()` registered all eight properties as **held** (the upload
  and the gate accept documents for held properties only; sold flips at tie-out).
- Replay: `replayIds` sends an explicit id list from a Drive file (`books-replay-<mailbox>.json`,
  `reprocess` flag for retries, `built` stamp resets the cursor, self-continues by trigger).
  `repost` / `repost-all` inbox verbs and the ingest's `fromStored` branch re-post from the
  stored read without a second model call.
- paul@: 396 sent. The API account's auto-recharge could not keep up with the burst; 136
  reads failed with "credit balance is too low" and came back as fake holds; retried after
  Paul topped up. Comparison run 2 (`scripts/migration-compare.py`,
  `data/migration/2026-09-17/comparison/`): 171 of 180 sheet-id documents tie to the cent,
  22 manual and 20 property rows now documented, 71 documents in mail with nothing in the old
  books (~$12.5K, mostly personal-tagged Uber rides, utilities, CoreLogic), 27 twins collapsed.
- properties@: 528 in flight (first 43 read: 42 real receipts - the Ashburne phone photos are
  the paper trail behind the 418 uncovered Ashburne rows).
- Dominant hold is `PAYER_UNKNOWN` (old receipts don't show the card; one is a Mastercard
  ending 6774 that is on no account). To be resolved by rules Paul gives once, applied at
  re-post, not card by card.

## 2026-09-16 (evening) — D-024: forensic migration next, old books close at cutover

Paul asked whether the old RECAST BIZ books could be forensically recreated in the new
system from the receipts in paul@/receipts@/travel@, then decided: migrate everything old,
close those books, start fresh. Recorded as D-024. Phase 4 now runs before Phase 3, is
forensic (every old row matched to its mail document and replayed; manual rows carried with
a `NO_DOC` flag until statements prove them), and absorbs Phase 6 (no 14-day parallel run).
Method is in `BUILD-PLAN.md` §7 under the phase table. Facts that make it feasible: the
poller already runs as paul@ and all three addresses are one mailbox; its dry-run takes any
Gmail query; the old workbook is readable via gviz. Docs only — nothing ran. Starts tomorrow.

## 2026-09-16 — Poller audit; HEIC photos now convert

Independent audit of both receipts pollers over the 09-11..09-16 parallel run (27 Gmail
messages seen by both systems, compared envelope by envelope). The read is the same in
both; the divergence is the new gate's rails (`PAYER_UNKNOWN`, the $500 ceiling, meals
always hold, Uber Eats auto-dismiss) plus the old poller's `label:receipts OR label:travel`
clause, which ingests originals never addressed to receipts@ and is why the old system
sees original+forward twins. Old system live bug: a split forward double-filed CoreLogic
09-15 (its txn-number check is keyed on vendor|amount); Paul removed the row by hand.

Fixed here: **HEIC photos could never be read.** `docs/phase2-spec.md` §6 said "the
ingest converts with jimp if it can" — jimp has no HEIC decoder, so every iPhone HEIC under
the poller's 3 MB Drive-shrink cap would have held as "could not be converted", and the
test asserted that failure as correct. `tryConvertHeic` now uses `heic-convert` (the old
ingest's converter since 2026-06-26); `test/stubs/tiny.heic` is a real HEIC (made with
macOS `sips`) and the test proves it becomes a zoomable JPEG image block. Also from
the audit: **`error` envelopes are now retried.** The poller labels the thread `books-done`
at upload time, so nothing ever re-sent a document whose ingest crashed before the model
ran (a cold-writer 502 on the pre-read). `books-warm-background` — already kicked by the
poller every 15 min — now re-invokes ingest for every `error` envelope with no `model`
(nothing filed, voided or posted yet), at most twice (`retries` on the envelope); anything
that errored after the model ran still waits for the Inbox's Reprocess verb.

## 2026-09-16 — Inbox review in the workbook

`docs/phase2.7-spec.md` §6 (the deferred "step two"): **Recast Books → Inbox…** opens a 600 px
modeless dialog (a sidebar is fixed at 300 px) of pending receipts with the web card's fields, editable, plus thumbnail, Claude's
note and the gate reasons. Approve files the document to Drive and posts the entries
in-process (same `buildEntriesFromModel` — `lib/gate.mjs` joins the generated `lib.gs`),
then records it with a new `mark-posted` verb on `/api/inbox`; Dismiss and Reprocess proxy
the existing verbs. The queue stays in Blobs — the `Inbox` tab first planned would have
been a second copy of the same state. `/api/inbox` and `/api/file` now also accept
`x-poller-secret` (the sidebar's auth; the workbook checks the Users tab first). Web Inbox
unchanged. 389 tests. Gated the same evening: the Uber DFW ride held on `PAYER_UNKNOWN` was
assigned PAUL and approved from the sidebar; posted and marked in one click.

## 2026-09-16 (late) — Inbox approve: 8.4 s → ~2.5 s

Paul: "8.4 seconds is a lifetime." Timed the approve with a stopwatch in the result
(role 0.4, read envelope 1.1, ctx 1.1, fetch bytes 0.3, Drive file 2.6, post 2.0, mark
0.4, warm 0.3). Split it: `inboxApprove` now only builds, marks the card posted on the site
(so nothing can post twice; `mark-pending` reverts if the post then fails) and posts with
the line-block refresh deferred; `inboxFinish`, called by the dialog once "Posted" is on
screen, fetches the bytes, files to Drive, writes doc_url onto the Journal lines and the
envelope (`mark-posted` patches doc_url when the txn_ids match), rebuilds the property
tab's line blocks and pokes the cache. Caches, 6 h each, cleared by the writer's own
upserts/period changes and by the edit trigger on Accounts/Properties/Periods/Users: the
user's role, the posting ctx, Drive folder ids. Measured after: role 41 ms, ctx 53 ms, mark
~0.5 s, post 0.9–2.4 s (Sheets variance). The stopwatch line stays in the dialog.

Six seeded test receipts (`up-test-inbox-*-0916`, fake Home Depot $222.25) were approved
during this: six Journal entries on 1616 Granite paid from PAUL and six Drive files under
Recast Books/2026/1616 Granite - all to go in the Phase 4 clear (D-013).


## 2026-09-18 — Phase 4: forensic matcher, two staging bugs, and the switch to a row-driven migration

Deploy + `repostAll` of 257; comparison run 6; first tie-out by property
(`scripts/migration-tieout.py`). Paul: the receipts behind the "uncovered" rows exist. They do:
the matcher was too strict (exact amount, ±5 days). Rewritten - 19 old rows (~$60.5K, contractor
checks + Wayfair) have no document anywhere, the rest have one. **Bug 1:** 94 receipts could
never post because their only stored read was "dismiss, duplicate of <txn from an earlier
replay>"; the ingest now replays such a read as the read. **Bug 2 (root cause of five failed
re-post passes):** `1e8a823` inlined a 5000-row MATCH into every property tab SUMPRODUCT, so each
Journal append stalled the workbook for minutes; formulas read the helper column again through a
drift-proof range (`e2cf118`), staging writer @3, tabs rebuilt. **Production writer not yet
pushed.** Also: bulk re-posts skip the per-post tab rebuild; `repostWatch` in the poller.
Decisions D-027 (old books are the target, receipt linked), D-028 (omitted items hold for Paul:
return or not; report F), **D-029 (row-driven migration: post the old row, attach the
receipt)**. State and next steps: `docs/phase4-audit.md` §15.

## 2026-09-18 — Image type from the bytes; an API failure is an `error`, not a hold

`gm-19c521cfa5452bd9` (a forward to the 104 Ashburne mailbox; JPEG thumbnail `791f9390-...jpg`
declared `image/png`) was sent as `image/png`, the API answered 400 ("appears to be a
image/jpeg image"), and the ingest kept the failure text in `model.why` and left the document
in Pending with a zero total - a failure that looked like a normal hold. **Fix 1:**
`sniffImageMime` in `lib/bookkeeper.mjs` reads the magic bytes (JPEG, PNG, GIF, WEBP); the
declared MIME type and the extension are only the fallback. **Fix 2:** a failed
`messages.create` now throws out of `runBookkeeper` instead of returning a hold, so the ingest's
existing catch saves an `error` envelope (`error`, `error_stack`, no `model`) - which is exactly
what the warm job retries (max 2) and the Inbox shows as a failure. Refusal, `max_tokens` and
"no decide call" stay holds: those are answers, not failures. The old test that pinned
"network error -> hold" now pins the throw. **Not deployed** (`npm run deploy` is Paul's step).
After the deploy, `gm-19c521cfa5452bd9` itself needs Reprocess from the Inbox: it carries the
old hold `model`, so the warm job will not pick it up.

## 2026-09-18 (morning) — Row-driven migration built, two staging passes tied out, cleanup under way

D-029 in code: `scripts/migration-compare.py` exports the row ↔ document map (capacity rule,
exact-set rule, the read's property respected, whole-receipt rows first);
`scripts/migration-rows.py` turns it and `paul-answers.json` into entries, five review lists and
a generated `MigrationData.gs`; `scripts/migration-rows-check.mjs` builds every entry in the real
posting engine; the writer gained `migrationPostRows()` (one append under the lock),
`migrationClearReceiptLane()` (STAGING-only) and `migrationRunStaging()`. Staging pass 1 (980
entries) and pass 2 (1,010) both tied out to $0.00 on every property. Old-books findings: two
comma-typo text amounts the parser had inflated ($45,000 / $15,262 were $450.00 / $152.62), a
year-0126 date, the Ashburne header undercounting its rows by $7,038.53 (Paul: include them),
the Cost Recapture tab missing from the inventory. Decisions D-030 (interest by deal type) and
D-031 (Cost Recapture). Corrections C-1a … C-11. State and how to resume: `docs/phase4-audit.md`
§21.

## 2026-09-18 (later) — Independent audit of the migration, and its fixes

**Audited** by a fresh session, read-only: the snapshot re-parsed with a parser that shares no
code with the migration (`scripts/migration-audit-indep.py`), compared with the inventory, the dry
run and the staging Journal; links tested against all 968 envelopes
(`scripts/migration-audit-links.py`). Report: `docs/phase4-independent-audit.md`.

**Found:** amounts tie on every tab and block except one row the inventory dropped for having no
date (Granite, Mission Reg listing fee $299, Dennis paid); Granite's purchase and two cash
advances had Advances rows and no Journal entries (the registration skipped whatever had a row, and
`clearBooks` leaves that tab); about ten wrong "strong" links from row-by-row placement and two
loose rules; Ashburne $1,619 above the old tab through advances posted as costs.

**Fixed:** C-12 … C-14 and C-10 in the register; D-032 (Dennis's Ashburne lines are cash advances
on 2030, every tab row posts), D-033 (the sale side is Phase 5); `migrationRegisterAdvances` is
clear-and-rerun with Granite on the list; the matcher places best pair first with tighter
near-amount, exact-amount and twin rules. Dry run rebuilt: 1,035 entries, $220,779.39, all build;
link audit clean. **Pushed to the staging project; not run there, not committed.** State: `phase4-audit.md` §22.

**Paul's notes and the pollers (same day).** The bookkeeper prompt now reads the subject and
Paul's typed note first and lets them settle `paid_from` (new rule 3); before, only a card's last
four could. Falcon Creek 1390's payer came from the bank's Zelle confirmation memo in paul@ (the
two added lines → 1401); four Mesa rows linked to their Zelle confirmations. `phase3-spec.md` §6a:
Zelle "was sent" notices join the Daily Summary as a feed source. Prompt change not deployed.

**Staging pass 3 (13:03).** 33 advances re-registered (Granite included, none orphaned), 1,035
entries posted, $220,779.39; Journal = expected on all nine properties to the cent, and the
independent re-parse agrees row by row (`phase4-audit.md` §23).

**C-15.** Ashburne, City of Corsicana dump, second row of 01-16: $27.30 → $22.50 (Paul). Dry run
$220,774.59, pushed to staging, not yet rerun there.

**Deployed 2026-09-18 13:2x** (`npm run deploy`, deploy `6aad7fed`): the prompt change (Paul's subject and
note first) and the image-type / API-failure fix are live. Staging pass 4 (13:14) ties out at
$220,774.59 with C-15.

**Inbox is a collapsed list (2026-09-18).** Paul could not find a document: the sidebar loaded the
newest 100 of 387 pending and drew every one as a full card. Now each document is one row - vendor
(or "(no vendor)" + the subject), date, amount, confidence - that toggles open into the same editor;
thumbnails and fields load on first open; a filter box searches vendor, subject, date, amount,
property and docId; "Collapse all"; the whole pending queue loads (limit 500). Pushed to staging.

**One-cent blind spot (afternoon).** The matcher now accepts a receipt line within a cent and a row
equal to two same-day lines: 39 more rows linked (825), confirm list 232 → 185. It exposed three
wrong additions (pump + hose, contractor bags, hole saw pair) - in the old books all along; retracted.
Dry run 1,030 entries, $220,512.72. `phase4-audit.md` §24.

**C-16, TXU reconciled to the utility's own history.** Granite ties exactly; Sparkling carried Granite's
$161.17 too. Sparkling stays as closed; Cost Recapture takes a -$161.17 credit (D-031 extended: errors
found on a sold property go to Cost Recapture). Dry run 1,031 entries, $220,351.55.

**Confirm list by judgment; refusals are per document now.** 857 entries linked (83.0% of rows). A
bulk-refusal mistake of Claude's (row-level refusals built from the wrong "unlinked" set buried six good
links) was caught by diffing against the pre-audit links and fixed the same hour; the Shalom Granite
$4,950 regression too. C-17 (Shell typed twice). Dry run 1,030 entries, $220,286.07.

**The matcher only looked at what was read.** Paul produced the Luxury 4 Less invoice ($10,319.56) that
Claude had called undocumented; it sat in paul@, listed but never forwarded, so never read. All listed
mail searched by amount: nine rows linked by Gmail id, 866 linked, 72.6% of dollars. `phase4-audit.md` §25.

**Atlas Pools reconciled to its portal (§26).** 17 payments $18,595.17 vs 18 rows $18,926.18: $75 of
payment fees on the renovation invoice (kept), and a 06-30 service row with no payment behind it (asked).
Evidence folder indexed (`data/migration/2026-09-17/evidence/README.md`).


**C-18.** Atlas Pools 06-30 service $256.01 dropped - no payment behind it on Atlas's portal (Paul: the portal is the guide). Dry run 1,029 entries, $220,030.06.

**C-19.** MLS listing fees the old books left off - Bowling Green (07-01, its tab) and Newport (Cost
Recapture) - $299 each, Dennis paid (Paul). Dry run 1,031 entries, $220,628.06.

**End of day 2026-09-18.** Paul accepts $36,880 of contractor checks and cash with no receipt. 868 of 1,031
entries linked (84.2% of rows, 74.7% of dollars; 91% documented or accepted). Open items: `phase4-audit.md` §27.


## 2026-09-28 (late afternoon) - verify-first done; the eleven remaining parked receipts back to the Sheets Inbox

Verified on the live workbook (gviz queries from Chrome; the Blobs Journal snapshot of 13:25 PDT is identical - 2,594 lines,
both sides 4,801,073.37): rows 2560-2561 (hinge refund 78.65) and 2594-2595 (pickets 71.71); the three replays voided and
mirrored (432.98, 176.59, 87.64); Ashburne 2030 = 9,716.18; Bowling Green 2030 = 1,011.32; no row at 70.32 or 96.36; writer
deployment @8 present; site deploy `6abac7f7` live (20:03 UTC); `clasp pull` = repo. **Not clean:** the Ashburne tab shows six
section headers beyond `PT_HEAVY_ORDER` - the hinge refund (-78.65, `Cabinets & Millwork`: a manual credit line
`retagAshburneTrades` skips, it takes `source = receipt` debits only) and the ELYONA pendant (66.56, `Electrical & Lighting`:
replayed at 13:06, two minutes after the retag run) sit under names the tab never had; `Cabinets & Countertops`, `Electrical`
and `Plumbing` are empty headers `heavyBlocks_` builds from voided lines; Utilities is by design. Totals unaffected
(Rehab Total 185,857.62 = the books). Left for Paul's word. @8 predates the two editor-only helpers added since (the 18-list
and today's) - the web app never runs them.

**Item (b) settled:** the 17 PARKED ids outside the 18 = five Amazon orders refunded in full (02-08 fans 1,001.21 - refunds
03-04/05; 02-22 fans 283.74 - six 47.29 on 03-25; 02-24 fans 246.78 - 03-17; 03-15 brackets 25.32 - 03-17; 08-13 Mesa item
36.99 - 08-20; all in pvb421's listing) + Home Depot 04-10 161.28 (C-32, on the books) + **eleven on no book** (total and
subtotal, 2 cents, 10 days): Floor & Decor 02-02 (image unreadable), Shell 03-19 7.57, Home Depot 04-05 230.72, Taco Cabana
04-11 73.57, Shell 04-14 19.99, Braum's 04-15 22.93, Lowe's 06-17 49.17, Home Depot 06-29 62.63 (1616 Granite - closed),
Gerber 07-01 106.75, Walmart 08-02 37.86 and 7-Eleven 08-02 11.90 (136 Bowling Green). Three stored reads call themselves
duplicates of staging ids (Shell 03-19, Lowe's 06-17, 7-Eleven 08-02) - none on the production Journal; check each card's
"already in the books" claim after the re-read. `reprocessParkedMigrationReceipts()` (Code.gs; `reprocessParked_` is the one
loop both lists run) pushed, live = repo by `clasp pull`; lint: two disjoint lists of distinct ids, the hold-only route, no
write. 499 tests. Editor-only, so no deploy for it.

## 2026-09-28 (14:00 PDT) - the eleven decided by Paul in the Sheets Inbox; the Granite toilet kits are in twice

`reprocessParkedMigrationReceipts()` run by Paul 13:40 PDT; all eleven read and held by 13:43 (the two photos took three
minutes). Paul decided them 13:47-13:55: **nine recorded, two dismissed** (Floor & Decor - no amounts; Braum's - personal).
Journal 2,595 -> 2,620 rows, balanced (4,801,678.39 a side), every new line with its Drive link. Recorded: Shell 03-19 motor
oil 7.57 (6600, overhead); Home Depot 04-05 recessed trims 230.72 (Ashburne, Lighting & Electrical); Taco Cabana 04-11 73.57
and Shell 04-14 drinks 19.99 (6710, overhead - Paul's call); Lowe's 06-17 49.17 (Ashburne, four lines); Gerber toilet tank
106.75 (**881 Newport**, Small Baths - Paul's call); Walmart 08-02 37.86 (Bowling Green, "Thermostat" - Paul typed it);
7-Eleven 08-02 batteries 11.90 (Bowling Green); Home Depot 06-29 (Cost Recapture, trade 1616 Granite) **55.74 = the air
filter 20.54 AND both toilet kits 20.93 + 14.27**, candy and water dismissed. **Wrong: the two kits were already in the
books** as the migrated 06-28 "Toilet Kits" 40.01 on 1616 Granite (`migration-20260628-bb8c39c01cca`, NO_DOC, the shelf
prices plus tax - this receipt is its document); the card said so and I told Paul before he decided. The kits are now
counted twice (35.20 on Cost Recapture + 40.01 inside Granite's closing). Proposed fix, Paul's word: void
`receipt-20260629-54b0cdd99d86-0246` and re-post the filter alone (20.54, Cost Recapture, the receipt's link) - an editor
helper, one run. **Ashburne after the eleven:** fixing and holding 186,137.51, costs 511,137.51, **Recast owes Paul
9,996.07**, profit by the books **138,840.73** (= 148,836.80 - 9,996.07). Bowling Green 2030 1,061.08. All 2030 39,538.05.
Item (b) of the finite list is DONE; next (c)+(d) as one list, after the kit fix and the Ashburne section names (Paul's word).

## 2026-09-28 (14:10 PDT) - the Granite toilet kits fixed; the Ashburne sections clean; writer @9

Paul: *"there were two toilet kits purchased. if they are on the same receipt then they are duplicates"* - they are:
21.98 + 14.98 = 36.96 x 1.0825 = 40.01, the migrated 06-28 "Toilet Kits" row to the cent, and no other Home Depot row sits
on Granite in those weeks. `fixGraniteToiletKits()` (Menu.gs, editor, once; a lint builds the entry through the posting
engine) run by Paul ~14:04: `receipt-20260629-54b0cdd99d86-0246` (55.74) voided (rows 2621-2624), the air filter alone
re-posted as `manual-20260629-aa6acecb8fa3` (20.54, Cost Recapture, trade 1616 Granite, the receipt's link; rows
2625-2626), books balanced. The helper's `mark-posted` to re-point the envelope answered 409 NOT_PENDING (a posted
envelope takes only its own ids again) - left: the nightly check counts a voided entry as a decision and the new entry
carries the same Drive file, so nothing is reported missing. **Sections:** `retagAshburneTrades` now takes every live
Ashburne line, debit or credit, any source (the first run took receipt debits only, so it skipped the manual hinge
refund; the pendant replayed two minutes after it), never a voided one; `heavyBlocks_` builds no header from a voided
line. Run by Paul ~14:08: hinge refund -> Kitchen, pendant -> Lighting & Electrical; the tab reads back as the 19 sections
+ Utilities and nothing else, Kitchen 2,325.43, Lighting & Electrical 9,021.64, Rehab Total 186,137.51 = the books.
**Writer web app @9** on Paul's "deploy" (both parked lists on one loop, fixGraniteToiletKits, the header guard) = the
repo by `clasp pull`. 500 tests. Item (b) closed; next (c)+(d) as one list for Paul's word.

## 2026-09-28 (14:45 PDT) - item (c)+(d) culled with Paul: Cash App and Harbor Freight close to nothing; 17 Amazon orders to forward

Paul: *"this list never fucking ends"* / *"give me a list and i'll cull it down"*. The pvb421 listing's `head` field carries
each Cash App notice's text ("You paid <name> $<amount> for <memo>"): **41 "Payment sent" notices - 39 to family (Aden,
Suzie, Alec, Sarah), one already in the books (05-18 $380 "Vicktor Campos for roof" = Granite's Salvador Campos "Roof"
380 of 05-18), one personal (02-19 $35 Elijah Crane "for the casa" - Paul: not business).** Nothing to forward.
**Harbor Freight:** the handoff's "5 never forwarded" was stale - 01-31 x2 (16.99) are the migrated 01-21 trailer lights,
04-03 82.25 is the circ saw (row 182), 08-10 16.23 the Hercules blade (row 208); 08-27 Gresham 149.98 was returned (Paul).
Nothing to forward. **Amazon May-Sep (34 "Ordered" mails):** refunded in full (06-16 shower faucet order, 08-06 cameras,
08-13 Mesa item), personal (hair product, USB cable, graduation, book, apparel, Breville, personal care, office,
cookbooks) and the Gerber tank (done) left out; the 20 house-looking ones culled by Paul: **drop** 05-08 leaf blower
(Portland), 05-08 Latrcm blower, 06-01 Osmocote; **forward** 05-01 KAIWEETS (tools, overhead), 05-04 Chibery (Ashburne),
05-24 Osmocote (Ashburne), 05-27 keypad + 6 (Granite by date), 05-28 WAC light (Granite by date, Paul left it blank),
05-28 Heath Zenith (Granite), 05-31 AMZSEVEN rods (Granite), 06-25 keypad (Bowling Green by date), and 07-14 .. 09-12
(nine "N items" mails: LanBlu fountain + 5, 08-07 camera/lighting, 08-11, 08-13 x4, 08-14, 09-01, 09-02, 09-04, 09-12)
as "not decided - hold for Paul, the card lists the items". **Blocked:** auto mode refused to write the forwarding script
(`scripts/forward-remaining-pvb421.gs`, "Sensitive-Source Provenance") - Paul's step: permission mode off Auto, then go.

## 2026-09-28 (15:30 PDT) - the last of the mailbox receipts: the 14 Amazon orders settled; the finite list is DONE

The forwarding script was written after Paul had the session switched to Manual mode (`set_session_permission_mode` -
the write then asked him). Run by Paul 14:34, all 14 sent. The bookkeeper on its own: **KAIWEETS breaker finder 42.49 ->
6510 overhead; Chibery hinges 108.24 -> Ashburne (read as "Cabinets & Countertops" - a section the tab never had, moved to
Kitchen by `retagAshburneTrades`, map extended); Osmocote 14.54 -> Ashburne Landscaping; three dismissed as already in the
books, all three checked right on the Journal** (06-25 keypad = Bowling Green "Door Lock" 31.03; 08-11 hardware = Mesa
"Door Lock" 36.59; 09-02 camera = the overhead "Camera Gimbal" 126.61, typed without its 10.45 tax - left); seven held
for the house. **Amazon's newer order emails name no items** ("4 Hardware items", a total) - the cards were vague and the
"receipt" is that email as text; Paul looked each order up in his Amazon account by the order number (links given in
chat). Decided: 07-14 pool floats (Amazon.fr, 224.53) personal; 08-07 cameras 91.35 -> Bowling Green (pool lights 10.61
personal); 08-13 two keypad deadbolts 160.60 -> **6510 overhead, stock for the next house, paid on the Citizens card 5450**
(Paul: "inventory for the business" - no supplies-on-hand account, 6510 is the shelf); 08-14 gable vents 39.30 -> Mesa;
09-01 two keypad deadbolts 80.78 -> 6510 overhead, card 5450 (same stock); 09-04 weather stripping 13.80 -> Brushwood
(card 5450); 09-12 wall lights (Portland) personal. **Two stumbles, both fixed:** Paul saved the cameras through the
look-alike 08-13 card (`undoMisfiledCamerasCard`: the 91.35 voided, the card put back by `mark-pending`), then dismissed
the 08-07 card as "Duplicate" (`reprocessCamerasCard`: re-read, then entered right - rows 2647-2648, receipt attached).
**The Heath Zenith doorbell (Granite mailbox) was never read: the properties reader registers only held / under-contract
houses (`books-property-mailboxes.mjs`), so a sold house's label is skipped** - Paul: "just delete" it (never a cost;
the forward sits unread). Gap left for Paul's word: late bills mailed to a sold house's mailbox are silently skipped.
Ashburne tab read back clean: 19 sections + Utilities, Kitchen 2,433.67, Landscaping 11,712.82, Rehab Total 186,260.29 = the
books. **End of day: Ashburne costs 511,260.29, Recast owes Paul 10,118.85, profit by the books 138,717.95** (= 148,836.80 -
10,118.85); Bowling Green 2030 1,152.43; all 2030 39,808.94; Journal 2,648 rows, balanced. 501 tests; writer @9 + two
Menu.gs pushes (no deploy needed). **Every receipt that lives in any mailbox is now dealt with - the finite list of 09-17
is closed.** What no mailbox can surface: cash, check and in-store purchases on Paul's personal cards with no email.

## 2026-09-28 (16:15 PDT) - Paul's three answers: sold houses keep their mailbox (site `6abaed41`); the gimbal at 137.06; "Paid by Paul" and "Property Tax" on the Ashburne tab

**Sold houses' mail is read again** (Paul: "it should keep reading in case something comes in after it's closed. it would
be put on the recapture tab"): `books-property-mailboxes.mjs` registers held / under contract / sold; `books-upload.mjs`
accepts a sold house's name as the channel; the reader already routes a sold house's cost to Cost Recapture under that
house's section (`list_properties` stays held-only). Tests updated; **deployed `6abaed41`** on Paul's "deploy" (22:42 UTC).
**Camera gimbal:** `fixCameraGimbalTax()` run by Paul - the migrated 126.61 voided (rows 2649-2650), re-posted at the order
total 137.06 on 6510 overhead, same payer (Citizens - the Citizens first pass's open question, unchanged) and receipt (rows
2651-2652); books balanced. **Heavy tab:** (1) `Paid by Paul (not yet paid back)` = the house's 2030 balance (credits less
debits), inside Total Project Cost (All in), under Property Tax Paid (Prorated) - Ashburne C11 = 10,118.85, All-in
568,923.22, Profit 127,584.28 (the books say 138,717.95; the rest is the tab's estimates - 2% closing on top of the buyer's
agent, interest to today, tax prorated to today - which the sell wizard settles); the typed Sale Price moved to C14. (2)
Paul: "i want to see the 2025 property tax paid as a line item" - `Property Tax` is a section now (PT_HEAVY_ORDER after
Marketing; `heavyBlocks_` no longer skips it; `refreshHeavyBlocks_` no longer keeps 1100 out of a block), so the sections
add up to Rehab Total again. Paul asked about the spacer columns: the layout derives every column from the section list
(`10 + i * PT_HEAVY_STRIDE`, spacer at `c0 + PT_HEAVY_COLS`) and the refresh reads each block's column from its header.
Rebuilt by Paul and read back: 21 sections at 11 + 6i (the left spacer insert shifts the grid one column, as always), Property
Tax 16,031.25 with its receipt, block totals sum to Rehab Total 186,260.29 exactly. 502 tests, pushed, live = repo.
**Writer web app @10** (Code.gs: the two tab changes and the header guard), deployed 16:25 PDT on Paul's "deploy" = the repo by `clasp pull`.

## 2026-09-28 (evening) - Phase 3 started: the workbook imports a bank statement (Recast Books -> Import statement...)

The first Phase 3 push, the import only (`docs/phase3-spec.md`, amended for the menu shape - D-023). `lib/statement.mjs`
`parseOfx` (pure, no model; in `lib.gs` too) reads an OFX/QFX export - Citizens' SGML (one tag per line, no closing tag
on a leaf, `%23` for `#`, `&amp;`) and the XML form - into lines oldest first with integer cents, the account's last
four digits (never the number), the bank's ledger balance. **Recast Books -> Import statement...** (`Import.html`,
`importStatement` in Menu.gs): the file is read in the dialog, the account found by its last four against
`Bank accounts.last4` (a comma-separated list), the rows appended to the **Feed** tab under the writer's lock, deduped
on the bank's FITID (`feed_id`, forced to text - 24 digits, Sheets would round it), status `unmatched`; the file
name's account number is masked in `source_file`. The dialog reports the lines added and whether opening balance +
every Feed line = the bank's balance. The Feed tab's Phase 0 guess at columns is replaced (`feed_id, account, date,
amount, name, memo, status, txn_id, match_note, source_file, imported_at`); `ensureFeedHeaders_` rewrites row 1 on
first use and refuses a tab that already has rows; the tab is readable (writer `read`, `lib/sheets-reader.mjs`, meta).
Measured on Paul's real export (`~/Desktop/10632505.QFX`, never committed): 73 lines 2026-08-06 .. 09-25, sum
170,800.07 = the ledger balance to the cent; `test/statement.test.mjs` runs it whenever the file is on the Desktop.
511 tests. **Run by Paul 16:20 PDT** after `clasp deploy` @11 and the last4 cells (1401 `2505, 5450, 9301`, 1402 `6317`):
"73 new lines (2026-08-06 to 2026-09-25) ... 170800.07 ... it ties". Read back on the live tab (gviz): 73 rows on 1401,
all `unmatched`, sum 170,800.07, dates real (year() resolves), every feed_id 24 digits of text, source_file
`****2505.QFX`. Not yet: matching (spec section 3), reconciliation (section 4), the Daily Summary feed (6a).

## 2026-09-28 (night) - Phase 3 step 2: the matcher (Recast Books -> Match statement lines...)

Claude judges, code checks, Paul decides (`docs/phase3-spec.md` section 3 amendment). `lib/feed-match.mjs`: the
model sees the account's open Feed lines in batches of 30 and every Journal entry that touches the account and is
not yet tied to a line (`buildCandidates` - amounts signed as the bank shows them, voided and already-tied entries
left out), plus the houses with address, status and sections, and gives every line ONE verdict through
`record_verdicts` - match (candidate aliases), propose (a purchase entry), question (plain words), later (a sale not
closed in the books). `applyVerdicts` re-checks every claim: a match's candidates must add up to the lines to the
cent and be unused, else it is a question; a proposal's items must add up to the line, `paid_from` is forced to
the account, and it becomes a pending Inbox card gated like a receipt hold (nothing autofiles from a bank line); a
question is a card with the typed line; later and silence stay `unmatched` with a note. Verdicts land on the Feed
rows through the writer's new **`feedUpdate`** action (status, txn_id, match_note - one read, one write under the
lock). A card born from bank lines carries `feed.feed_ids` and ties its rows when Paul decides it (`tieFeedRows`
in `_shared.mjs`: mark-posted and approve-bg -> `matched` with the txn_ids, dismiss -> `excluded` with his note).
Site: `/api/feed-match` (the job) and `/api/feed-match-bg` (the run, exported `runFeedMatch`); the workbook's
**Match statement lines...** starts it, waits (5 s polls, five minutes) and says the counts in plain words. A
match never posts to the Journal. Golden set for the first run: the Citizens first pass in `HANDOFF-2026-09-28.md`
(32 exact, the itemised groups, six questions). 523 tests. Pushed; **writer deploy AND site deploy owed** - the job
reaches `feedUpdate` through the writer web app.

## 2026-09-28 (late night) - the first matcher run, graded: 49 / 22 / 2, every match right; three fixes

Run by Paul on Citizens (writer @12, site `6abafb46`): 73 lines, **49 matched, 22 cards, 2 later** (the Ashburne wire
and the 550,000). Read back on the Feed tab and checked against the Journal: **all 49 matches right** - the two Bison
wires to one sale entry, Red Oak 527.24 + its 2.00 fee as two lines to one entry, the 1,196.40 water to four entries
(Brushwood 100 + Cost Recapture 612.91 + 443.49 + a typed 40.00 "card service fee"), returns netted against their
purchases (Lowe's 270.50 - 191.02, HD 41.55 bought and taken back), the Granite holdback 60,000 in and the two 30,000
payouts, Dennis's 10,000 advance, the 09-02 gimbal at 137.06. The 22 cards all real: 08-13 Lowe's 542.40 vs six
entries 542.39 and 09-02 HD 109.01 vs nine entries 109.00 (the old books' pennies), F&D 42.21 vs 42.41 and HD 55.87
vs 55.71 (typos or a missing item), eight Citizens-card store charges with no receipt (Lowe's 130.87, AutoZone,
Mower Depot, Amazon 36.99, HD 14.72, HD 90.67 / 90.23 / 30.57), Deluxe 28.15, the TYL 47.26 (the real card fee for
the water bills - the typed 40 in the books is really water), and the six questions from the first pass. **One
card would double a cost: Zelle "EFFREN LANDSCAPER" 275 of 09-01 = the three Falcon Creek INV 1390 entries on 1401
(110 + 110 + 55)** - the model had the amount but not the name (the Vendors tab has no aliases). Fixes:
`MATCH_TOLERANCE_CENTS = 5` (Paul: "allow a few cents"; the note says by how much, the books are not changed); the
Vendors tab's aliases reach the model (VENDOR NAMES); the prompt on Zelle/check names and on refunds; `resetFeedCards()`
(Menu.gs, editor) dismisses the open bank-line cards and puts their rows back to `unmatched` for another run. **In the
books on Citizens but on no bank line** (for the reconcile step): Home Depot 08-14 x3 (11.88, 69.61, 44.08 = 125.57),
Neighborhood Management HOA release 375.00 (09-09), and the Granite sale lines of 07-24 (the known book fix - the
account opened 08-06). 524 tests.

## 2026-09-28 (late night, 2) - the Feed-row tie moves into the workbook: a synchronous site call cannot wait on the writer

`resetFeedCards()` died on its first site call - "Inactivity Timeout" from the proxy at 54 s: the site's `dismiss` had
gained `tieFeedRows` (a writer `feedUpdate` round trip plus a Feed refresh) inside a synchronous function, the same
wall that moved approve into a background job on 09-25. The sheet's own Inbox would have hit it too on every bank-line
card. So the tie is in-process now: `Inbox.html` sends the card's `feed` with the decision, Menu.gs `inboxApprove` and
`inboxDismiss` call `tieFeedRows_` -> `feedUpdateRows_` (Code.gs, shared with `action_feedUpdate_`, one lock, one
read, one write); the site's `mark-posted` and `dismiss` no longer touch the writer (lint); `approve-bg` (a background
function, the web path) keeps its tie. `resetFeedCards` dismisses the open bank-line cards on the site (a blob write
again) and puts every `proposed` row - and any row an interrupted run marked - back to `unmatched` in-process. 524 tests.

## 2026-09-28 (17:10 PDT) - second matcher run: 52 of 73 tied, 19 cards, 2 waiting; the Citizens statement is matched

`resetFeedCards` (18 cards dismissed, 22 lines back) then Match statement lines... on the 24 open lines: **3 more tied** -
exactly the three the grading predicted: the Effren Zelle 275 to the three Falcon Creek INV 1390 entries (the Vendors
alias), Lowe's 542.40 to its six 08-13 entries and Home Depot 109.01 to its nine 09-02 entries (a penny each, the
note says so). **Citizens, 2026-08-06..09-25: 52 matched, 19 cards for Paul's word, 2 waiting on the Ashburne close.**
The 19: Dennis's 5,000 in, the 1,500 check, the two checks to Paul (32,105.26 vs the books' 32,246.84; 607.05), the
4,858.42 deposit, the TYL 47.26 fee, F&D 42.21 vs 42.41, HD 55.87 vs 55.71, Juan Garcia 2,500, and ten Citizens-card
store charges with no receipt (proposed for a house or overhead). Site `6abb00aa`, writer pushed (deploy @13 owed).
**A dismissed bank-line card goes back to `unmatched` with "Paul: <note>" (never `excluded` - on Recast's own account
every line ends up tied), and the next run shows the model the note.** Next: Paul decides the cards in the Sheets Inbox; then the reconcile step (spec section 4) - it also owns the three
book-side findings (HD 08-14 x3 125.57 and HOA 375.00 on Citizens with no bank line; the Granite 07-24 sale lines).

## 2026-09-28 (17:40 PDT) - D-055: the partners' working money; the bank-line card says what to click

Paul's first card was Dennis's 5,000 of 08-06: *"the system is not set up for this type of thing ... cash deposit from
dennis to fund the account ... does not draw interest"*; he and Dennis each put working money in (his is the 4,858.42
deposit of 08-13). **D-055:** a plain loan from the partner - Dr 1401 / Cr 2010 or 2030, no house, no Advances row, no
interest; refilled by sales on its own; owed until taken out. `addWorkingCapital()` (Menu.gs, editor, once) posts both,
ties both bank lines (`feedUpdateRows_`) and clears both cards. The 10,000 of 08-12 stays a Mesa advance (Paul: "a
typical cash advance for 366 mesa"). **Inbox.html:** a card born from a bank line (`source = feed`) shows Claude's
question and which button answers it (`feedFlags_`), and its Dismiss-all note starts empty ("What was it? In your own
words") instead of Claude's question. 525 tests, pushed (saved code - no deploy needed). **Run by Paul 17:29 PDT:**
`manual-20260806-f3706ac74cae` (Dr 1401 5,000 / Cr 2010) and `manual-20260813-473f76068d7c` (Dr 1401 4,858.42 / Cr 2030),
Journal rows 2659-2662, no property, read back; both Feed lines `matched` to them. **Citizens: 54 of 73 tied, 17 cards, 2
waiting.**

## 2026-09-28 (17:45 PDT) - a Save hit a Sheets service error; nothing posted; where Phase 3 stands tonight

Paul's Save on the Mower Depot 3.24 card (6510 overhead, 08-14) answered "INTERNAL - Service Spreadsheets failed while
accessing document with id 12QV..." - Google's own transient refusal, not a rule. Checked on the live Journal: no Mower
Depot line, no 3.24 on 08-14, 2,661 rows balanced (4,812,704.54 a side); the Feed row is still `proposed`. Safe to Save
again (inboxApprove marks the card posted only after the post, and puts it back on a failure). **State:** Citizens
2026-08-06..09-25 imported and matched - 54 of 73 tied, 17 cards, 2 waiting on the Ashburne close; D-055 posted; writer
pushed = repo (web app @12, **@13 owed** before the next matcher run - Code.gs's feedUpdate refactor); site `6abb023f`;
525 tests. **Next:** Paul's 17 cards (a purchase: Save; anything else: Dismiss all with his words - Claude books it
and the next run ties it); then the reconcile step (spec section 4) with its three book-side findings; then the Daily
Summary feed (6a).

## 2026-09-28 (night) - the writer project tidied: hand-run scripts move to oneOffScripts.gs (D-056)

Paul: *"things are getting messy... we have a slew of scripts in both code.gs and menu.gs... do an audit and remove all
non essential or one-off scripts. then create a separate file called oneOffScripts.gs... get organized."* The audit
walked what the Recast Books menu, its dialogs (`callServer_`), the onEdit trigger and `doPost` reach, comments
stripped so a mention is not a reach. **33 functions in Code.gs and Menu.gs were reached by nothing:** the frozen-record
and duplicate-replay tools, `reportStrandedCosts`, the D-052 paid_to fix (`fixAdvancesPaidTo` and its helpers),
`resetFeedCards`, the fifteen dated 09-28 repairs (Ashburne bills, the parked lists and `reprocessParked_`, email-only
receipts, the hinge refund, the retag, the replay and its undo, pickets, toilet kits, the gimbal, the cameras pair,
working capital), `clearBooks` and the six Phase 4 migration functions. All moved verbatim into
`apps-script/writer/oneOffScripts.gs` (1,117 lines) in three sections - tools meant to be run again, dated one-offs in
the order written, the migration and cutover - each block under a `// STATUS:` line naming its run (date, Journal rows)
or RE-RUNNABLE / RETIRED. `ADVANCE_PAID_TO` and `isPartnerDeal_` stay in Code.gs (the Add advance dialog uses them).
**Deleted:** `centsRow_` (Menu.gs, called by nothing) and the eight lint tests that pinned the finished one-offs' dollar
amounts and ids (the entries above are the record). Code.gs 3,012 -> 2,293 lines, Menu.gs 2,228 -> 1,894, nothing added.
**Enforced:** `test/writer-gs-lint.test.mjs` now walks the same reach and fails on a function in Code.gs/Menu.gs that
nothing reaches, or a call from them into the one-off file; duplicate names are checked across all three files; the
one-off file is held to the ASCII and brace rules. 519 tests. The rule is written into `CLAUDE.md` (constraint 9), the
writer `README.md` (Files), `phase0-spec.md` (layout) and D-056. **Pushed** (14 files, 17:58) - no behaviour change; a
one-off runs from the editor, so it needs a push, not a deploy; the @13 deploy still owed from the feedUpdate refactor
covers the web app.

## 2026-09-21 — Phase 4: lists closed, Drive filing done, Newport held, cutover rehearsed end to end

**Morning, offline (audit §39-§44).** 26 false Home Depot / Lowe's links from a coincidental subset-sum rule
found and removed; near-amount tolerance capped at 10% of the row; list 4 (in mail, not in the books) 60 → 0,
differences 114 → 0, confirm list closed with every weak candidate linked or refused by name. C-30 (Netlify
$0.00 → $13.40), C-31 (Green Acres eviction filing fee $144.00 - a tenth property total), C-32 (four rows
matched to their receipts). Dry run 1,048 entries, $240,844.35; 920 linked. Pushed to staging.

**Pass 10 (§45).** `scripts/migration-journal-tieout.py` written (the ad-hoc tie-out of passes 1-9 as a
script: per txn amount, date, property, payee, account, link; property totals; advances; exit code) and proven
against pass 9. Paul's Run tied out on both paths.

**Drive filing, item 7 (§45, §46, §49).** `scripts/migration-file-docs.mjs`: bytes from the docs store, the
writer's `storeDocument`, `driveFileName`, `[year, property]`; every document's email filed as a `.txt` too;
resumable map `drive-filing.json`, read by `migration-rows.py`. `WRITER_SECRET` is masked on Netlify, so Paul
starts it in his Terminal. Two passes: 411 documents + the 12 `evidence/` files = 636 files; 5 non-JSON
replies retried, 16 replies without a link recovered by exact name from Drive. **Every one of the 922 linked
entries carries a Drive link.**

**The never-read messages (§46, §48).** 15 paul@ messages read through `replayIds` (none posted); four
refusals, two differences settled, a new `account` key in `paul-answers.json`. Paul asked whether pvb421@ had
been swept: listed in full, never read; four February forwards to 104ashburne@gmail.com had bounced - the
drawer-pulls and light-bulbs rows linked (Paul forwarded both to receipts@), two ceiling-fan orders parked.

**881 Newport has not closed (§47).** Under contract (Bison Title #260910); Paul: "not closed. under contact."
Its listing fee and Falcon Creek line moved from Cost Recapture to its own tab. Sold = Granite and Sparkling
only; the old Sales tab's Newport and Ashburne figures are projections. **C-33:** Kitchen Faucet 04-10 → 08-10.

**Pass 11 and the advances rehearsal (§49, §50).** 1,048 entries, $240,844.35, $0.00 on all ten properties,
922 linked on Drive, both paths clean. `migrationRegisterAdvances` rehearsed (7.5 min, 33 advances, entries
untouched). `docs/cutover-runbook.md` written - its §0 is all checked; the `WRITER_URL` flip moves before the
production tie-out. Next: cutover day. `HANDOFF-2026-09-22.md`.

## 2026-09-21 (evening) — CUTOVER: the real books are live

Runbook steps 1-12 with Paul, one at a time (audit §51): old workbook frozen and re-exported (no typed row
missing; two duplicate rows the old poller wrote from the day's forwards, left for Paul to delete), backup
copy made, production writer pushed and deployed (@2, then @3 without the migration data), `clearBooks`
(96 rows), properties, 33 advances, `migrationPostRows` → `posted=1048 left=0`, `WRITER_URL` flipped to
production and the site redeployed, tie-out on both paths: **1,048 entries, $240,844.35, $0.00 on all ten
properties, 922 linked on Drive, 33 advances**, every line equal to staging pass 11. Paul then forwarded the
receipts he had held since 09-17.

## 2026-09-22 — First day on the real books

- **The doGet misfire (§52).** 16 of Paul's 20 receipts errored: under concurrent calls the writer's POST
  redirect lands on `doGet`, whose `{ok, service, version}` reply carries none of the action's fields.
  `lib/writer-client.mjs` names it `REDIRECT_MISFIRE`, retries reads (never writes). Same fault as the
  filing's lost links. All 20 settled: 17 posted, 2 for Paul, 1 duplicate. `scripts/recover-errored.mjs`
  re-posts errored documents from their stored read (poller secret, Paul's Terminal).
- **Old receipts poller off** - both triggers deleted in the Receipts Bookkeeper project with Paul's
  permission; one digest now, one read per receipt.
- **Digest:** `why` is one sentence; the model's working moved to `checked` (collapsed in both Inboxes).
- **Property tabs (§53-§54).** Ashburne's heavy tab had its helper cells buried under the trade blocks
  (interest `#VALUE!`, totals wrong) - a display fault the Journal tie-out never covered. Fixed, then the
  heavy layout redone as Paul drew it (Rehab Total; Total Project Cost = purchase P+I + cash advance P+I +
  tax paid + prorated from the amount paid; Profit Breakdown with typed agent % and concession; Dennis
  Payout; draws carry their memo; P+I labels; insurance under its own block; no Gas/Truck/Trailer, Property
  Tax or (no trade) blocks). Light tabs: Selling-class lines (listing fees) now show and count. Every tab
  reconciled to today's export of the old workbook - each difference a register line.
- **Inbox leftovers (§55).** 387 pending envelopes from the migration reads dismissed on Paul's yes, each
  with a note naming why it is settled (`scripts/inbox-leftovers.mjs`); 18 left: 12 parked Home Depot / Lowe's
  receipts for Phase 3 and Paul's 6 live cards.
- **properties@ poller ON (§56).** Second poller instance created under properties@ and pushed with `clasp push -P`;
  first run posted 10 labels and uploaded the 5 property forwards of 09-21. All 5 reads were API refusals
  (`reasoning_extraction`): the new `checked` field asked for "your working". Reworded; every bookkeeper call now
  carries the server-side refusal fallback (`fallbacks: "default"`). Re-read clean on the normal model.
- **Old books closed (§57).** RECAST BIZ H5:L6 duplicates deleted by Paul; "Recast 2026 CLOSED 2026-09-21", staging
  "Recast Books ARCHIVED". Anthropic $13.06 card marked posted (its link was already there); Wi-Fi Onboard $8.00 has no
  attachment to file - body-only email receipts never get a Drive file on the live path (open question).
- **D-035 (§58): no attachment, the email is the receipt.** Upload stores the message as `email.txt`; every filing
  path links it. Writer `setDocUrl` action (web app @4). Wi-Fi Onboard and Berrett filed and linked by hand.
- **Phase 5 spec** written for Paul's review: `docs/phase5-spec.md` (six questions in §6).
- **Phase 5 built, both closed sales posted (§60).** One dialog, four steps, document first. `lib/sale.mjs`
  and `lib/settlement.mjs` pure and tested against both real statements; the read is a background job.
  Granite: profit 109,178.56, Paul 28,489.52, holdback 60,000 released 09-11, escrow and Dennis at zero.
  Sparkling: read from its PDF, profit 60,930.09 at Recast's 50% share, all seven entries documented.
  D-036…D-039 (share not payee; 8% on the closed deals; HOA release is a selling cost, account 1340).

## 2026-09-22 (evening) - The heavy tab was writing into its own spacer columns

Paul: "the columns that are supposed to be spacers have text in them ... also expenses that I
cleared in the inbox did not show up in the 104 Ashburne sheet." One cause, one consequence, plus
a second smaller fault.

**Root cause (audit §61).** `setupPropertyTab` writes the grid and THEN inserts the left spacer
column, so every block ends up one column right of where it was built. The light template deleted
column H first, which cancelled the insert exactly; `8b5138b` (09-22 morning) made that delete
`if (!heavy)` so the heavy tab could keep its Interest column - and nothing cancelled the insert
any more. `refreshHeavyBlocks_` still wrote each block at the column it was *built* at
(`10 + i * PT_HEAVY_STRIDE`), so after the 09-22 rebuild every Journal write dumped payee / date /
description / amount one column left, into the spacer (J, O, T, Y, AD ... DA - all twenty), while
the blocks under their headers kept whatever the rebuild had put there. That is both symptoms: text
in the spacers, and no new lines in the blocks. The summary was never wrong - Rehab Total and Total
Project Cost are SUMPRODUCTs over the Journal, not over the blocks.

**Fix:** a block's column is read from its own header in row 4, never recomputed - which also
immunises the refresh against a new trade reordering the blocks. Pushed and verified by pull; no
`clasp deploy` (doPost unchanged).

**Second fault, same tab.** Energy Texas $559.34 (posted 09-22 16:47) carries no `trade`: the model
leaves it null for a utility bill, which is fair, but the heavy tab buckets by trade alone, so the
line was itemized nowhere. An untraded Holding line now falls under Utilities, as the old tab carried
them. Ashburne had exactly one such line; the other 263 untraded lines are all on light tabs, which
bucket by cost class.

454 tests (one new lint: the block column must come from the header).

## 2026-09-23 - The Inbox card is a bulleted list that names the fix (D-040)

Paul: "the inbox descriptions of the expenses are too long and hard to understand. i need bulleted, short
concise and clear reasons listed. if there was a short clear bullet that said 'no trade - enter a trade'
that would have solved it."

- **Every bullet is an action, and nothing else is a bullet.** The first pass bulleted the model's `why`
  too, which turned an older six-sentence read into six bullets; shown that card Paul said "this is not
  actionable for me ... this is still too much". Now the list is only what he has to do - "Check the
  amounts, then approve or dismiss", "No payer - pick who paid", "Already posted as <txn> - dismiss it" -
  and it is never empty. Claude's reasoning (`why` and `checked`) sits collapsed under **Claude's read**.
  The raw-code chips are gone, and a lint fails if a new gate reason has no translation.
- **"No trade - enter a trade"**, raised on any property cost line outside the tab summary accounts, plus a
  **trade picker** on the item so the flag can be acted on where it is raised - the trades the property tabs
  group by, not free text (a typed trade that matches no block name gets no block until a rebuild).
- Measured on the document that caused it: Energy Texas $559.34 was held on OVER_CEILING and PAYER_UNKNOWN
  and approved with no trade. Under the new card it reads: over the ceiling / no payer / no trade, then one
  sentence of Claude's own.

455 tests. Pushed to the writer and verified by pull; no deploy (`doPost` unchanged).

## 2026-09-23 (later) - Each item gets its own property; the account picker says business or property (D-041)

Paul, on a Home Depot card with four tool items under 104 Ashburne: "i should be able to assign each
itemized item in a receipt to a different property or overhead. also, there is no general tools category
that is for the business vs a property."

- **Property per item.** Every item has its own Property select (OVERHEAD included); the entry's select
  became the "sets every item" control for the common one-house receipt. Approve splits the entry into one
  per property before posting - the ledger rule that an entry is one property does not move.
- **The account picker is grouped**: Property costs - needs a property / Business overhead - OVERHEAD only /
  Cash, prepaid and other. 6510 Small tools & equipment already WAS the business tools account; what the
  card never showed is that it cannot sit on a property (D-010), which is why that card could not have
  posted as it stood.
- **A live D-010 check on the card**: "Business account on a property - set 6510 to OVERHEAD", and the
  mirror for a property account left on OVERHEAD. It follows his edits, which the ingest gate cannot.

455 tests. Pushed to the writer and verified by pull; no deploy.

## 2026-09-23 - "Tools are overhead" (Paul), and the prompt says so

Asked because a Home Depot card put four tools on 6510 under 104 Ashburne. Paul's answer: tools are
overhead. D-010 stands, no chart change, no new account. The bookkeeper prompt now states it in his terms -
a tool is overhead even when bought for one job and carried to one house, because it is not consumed into
the property the way materials are - and spells out the consequence it kept getting wrong: a hardware
receipt mixing tools and materials is **two entries**, the tools on 6510 with OVERHEAD and the materials on
1030 with the property. `lib/bookkeeper-prompt.mjs` regenerated. **Not deployed** (`npm run deploy` is
Paul's step); the deterministic rail and the Inbox card already catch the case in the meantime.

## 2026-09-23 (later still) - The light property tabs: no commission, a Concession cell, Received split (D-042)

Paul, going through 469 Brushwood. Four changes, **light template only** - 104 Ashburne, the one Heavy tab,
is untouched by all of them. His screenshot already showed the target hand-typed on the sheet, where the
next rebuild would have wiped it; this puts it in the builder.

- **The Dennis commission rows are gone** - `Dennis commission (x% of sale)` off his payout and
  `Less Dennis commission` off Paul's. "he will never charge commission for these": on a partnership deal
  Dennis's return is principal + interest + his 50% share, and the commission was only ever a **bank deal**
  term. That path is untouched - `Properties.dennis_commission_pct`, the heavy tab's own line and
  `lib/sale.mjs`'s 1210 entry at closing (D-036) all stand, which is what Ashburne settles on.
- **`Due to Paul (paid less reimbursed)` → `Paul Paid (direct)`**, the mirror of `Dennis Paid (direct)` above
  it. Label only; same value.
- **`Concession (type it here)`** in the Profit Breakdown below Closing %, the cell the heavy tab already had:
  blue, typed, kept across rebuilds by the same `readLabelledValue_` that keeps Sale Price. Net Profit
  subtracts it as `-ABS(...)` - a concession is always a reduction, so a hand-typed minus sign cannot turn a
  credit into profit.
- **`Received (advances, refunds)` → `Received (advances)` + `Received (refunds)`**, split on payee: both
  lines of an advance carry `Dennis Little` (`buildAdvance`), a refund is a negative cost row carrying its
  vendor. Deliberately an exhaustive partition, so a payee the rule does not expect can only move a line
  between the two rows - never out of the block total. Checked first against the migrated books: 33/33
  advances are `Dennis Little`, and all 7 negative rows are vendors. Brushwood's `-$54.09` is the Home Depot
  REFUND on 1401, which is how the debit-column behaviour was confirmed from live data instead of assumed.
- **Then one row came back off.** Shipped with all three blocks split and flagged that Dennis Paid (direct)'s
  advances row is structurally always zero - a direct-paid Dennis cost *is* an advance, and an advance's own
  lines (1401/2030, 2010) are never cost lines. Paul: "you are right ... for Dennis remove the row". Removed,
  formula back to unfiltered.

455 tests. Pushed to the writer; no deploy (`doPost` unchanged - D-023 moved `propertyTab` into the menu).
**`rebuildAllPropertyTabs` from the editor is the one step that applies it to the ten tabs**, and it rebuilds
104 Ashburne on the way, clearing the spacer-column text left by audit §61.

## 2026-09-23 (evening) - Receipt columns, readable sale lines, and the property tab frozen at closing (D-043)

**Receipts get their own column.** Every line block, light and heavy, now runs Payee · Date · Description ·
Amount · **Receipt** · the paid-by boxes. `receiptCell_(doc_url)` writes a HYPERLINK, blank when the row has
no document, so the column also shows which lines have one. First shipped as a link on the payee; Paul: *"i
prefer a separate column for the receipts"*. The light block moved to `PT_BOX_OFFSET = 5` / `PT_TXN_OFFSET = 8`
/ `PT_BLOCK_COLS = [10, 19]`, and a heavy block is `PT_HEAVY_COLS = 5` plus one spacer, with the stride derived
as `PT_HEAVY_COLS + 1`. Paul: *"be careful to not disrupt the spacing columns. you have not accounted for
those in the past"* - and he was right: the spacer's own width was still being set from a literal `c0 + 4`,
which would have made every Receipt column 20px wide. Both offsets are constants now, with tests on them.

**Sale lines say what they are.** `lineDescription_` falls back to the entry's `memo` when a line has no
description of its own, trimming the `<property> sale <date>: ` prefix. Granite's settlement rows had read as
unexplained charges; they now read "settlement statement" and "project cost released to COGS". Nothing was
missing from the books - the memo was on every row - so no backfill was needed.

**The property tab is frozen at closing (D-043), reversing phase5-spec §3.** Paul, on what the sale had done
to the Granite and Sparkling tabs: *"i want the property tab frozen and i want a new closing tab ... i want to
keep it as a record."* `sellPost` now calls `freezePropertyTab_` immediately before it posts - formulas
replaced by the values they were showing, `as of` replaced with `SOLD <date> - frozen at closing`. Three
guards keep it that way: `setupPropertyTab` refuses to rebuild a sold property, `refreshLineBlocks_` skips
one, `onPropertyTabEdit` toasts instead of voiding and re-posting. **`CLOSING_TAB_IN_PLACE` stays `false`
permanently** and the sign-off it was waiting on is moot.

**A six-hour hole, found and closed.** `sellPost` writes `status = sold` straight to the sheet, which neither
goes through the upsert (which clears the cached posting ctx) nor fires the onEdit trigger, and `buildCtx_`
caches the postable property set for six hours. A receipt arriving in that window still posted onto a sold
property - and with the freeze guards it would have been invisible on both tabs. `sellPost` clears the `ctx`
cache the instant it writes the status.

**New editor helpers.** `reportStrandedCosts()` - any sold property whose accounts do not net to zero, with
the rows posted after its sale. `rebuildFrozenRecord(name)` / `rebuildAllFrozenRecords()` (no args, since the
Run button passes none) - reconstruct the pre-sale record for the two properties that sold before freezing
existed, via `setupPropertyTab(name, asOf)`, which drops `source = "sale"` rows **by source, not by date**:
Granite has a real cost dated the day it closed.

**Found with them (audit §65):** the 178.48 Paul spotted on Granite's Rehab Costs was a **duplicate on the
wrong property** - the 2026-02-19 Home Depot floor protection 123.34 and bulbs 55.14 already migrated onto
104 Ashburne, replayed through the live poller 1h49m after Granite's sale posted. Granite's costs run
2026-05-08 to 2026-08-05 and only Ashburne and OVERHEAD were active in February. Voided, not recaptured.
280 Sparkling was clean.

463 tests. Pushed to the writer; no deploy (`doPost` unchanged).

## 2026-09-23 (late) - The duplicate-replay sweep: four receipts voided, 488.67 (audit §66)

After the Granite duplicate (§65), Paul: *"yes do the sweep"*. A duplicate on a **sold** property shows up as a
stranded balance; on a **held** one nothing flags it, because held properties are meant to carry balances.

- **`reportDuplicateReplays()`** (no args) matches live entries against migrated rows on **date + payee + amount
  and nothing else** - not property, not account, because the Granite one crossed both. Vendor names normalise
  ("The Home Depot" = "Home Depot"), debit lines only. It groups by entry and prints **every** line of anything
  flagged, `MATCH` or `new?`, labelled WHOLE ENTRY or PARTIAL.
- **`voidDuplicateReplays()`** (no args) voids only an entry whose **every** debit line matched, and lists a
  partial for review rather than voiding it. That guard paid for itself on its first run.
- **Found:** 7 lines / 286.44, all on 104 Ashburne, all posted 2026-09-22 between 17:31:55 and 17:46:49 -
  minutes either side of the Granite one. Three Home Depot receipts from January and February, the parked items
  from that evening's Inbox clear-out (§55) approved instead of parked. Two of them carried the model's own
  doubt into the ledger: *"no eligible property on this date"*, *"PENDING ROUTING: ... reroute to 1030 if a
  Feb-2026 job is identified"*. An entry whose description says PENDING should not be postable - a gate rail for
  Phase 3.
- **The partial was a duplicate the matcher could not see.** Its three unmatched lines - glass scraper 5.39,
  putty knife 11.89, painter's tool 6.47 - **sum to 23.75, a migrated row: "Scrapers", OVERHEAD 6510**. The old
  books recorded the trip as one row; the replay itemised it, so no line amount could match. Voided whole.
- **Total voided 488.67**: 178.48 on 1616 Granite, 310.19 on 104 Ashburne across three receipts.

**Settled by this:** "tools are overhead" was never new - Paul's old workbook already had the scrapers and saw
horses on 6510. **Known blind spot:** the old books sometimes combined items into one row (D-029), so a
line-level matcher cannot see an itemising replay, and a receipt with no exact line match would never be
flagged. The parked Home Depot / Lowe's items must be checked by hand in Phase 3.

465 tests. Pushed to the writer; no deploy.

## 2026-09-25 - The Thursday softballs: why four clean reads sat in Pending, and what changed (D-044, D-045)

Paul, on the 09-25 digest: *"there are receipts in there that the poller should have been able to figure out on
thursday ... these should have been softballs."* Read every pending and errored envelope. None was a misread:

- **HILCO $56.03** and **FedEx $2.36** - correct in every field, held on `confidence: "medium"` alone.
  **D-044:** medium now posts when every other rail holds; low still holds.
- **Atmos $67.39** - "Visa Debit", no digits; every prior Atmos payment was PAUL. **D-045:** unanimous vendor
  precedent settles the payer when the document shows no card and Paul wrote no note (prompt rule 5).
- **Adobe $34.49** - PayPal funded from "Chase checking 8870", on no account we knew. It is Paul's personal
  account; `paul_personal_last4` becomes `9166, 8870` (Paul's Settings edit).
- **The HILCO screenshot** and one Anthropic receipt - `max_tokens` at 8,000 mid-thought (adaptive thinking
  counts against it). `MAX_TOKENS_PER_TURN` is 32,000. `checked` is now a required `decide` field, so a
  medium/low read carries its reason.
- **Three Anthropic receipts in `error`** (writer "no rows", a doGet misfire, a timeout) with good reads
  stored, never retried because the warm job skipped anything with a `model`. It now replays those from the
  stored read (`fromStored`, $0); a landed entry replayed is refused by the writer as a DUPLICATE.
- The digest's pending lines read "Posted: ..." (the model's `why`); they now lead with what the gate held
  the item on.

Commits `904c75f` + this one. Needs `npm run deploy` (prompt, gate, cap, warm retry), `clasp push` for the
poller (digest) and the writer (`lib.gs`).

## 2026-09-25 (later) - The first replay run: what it broke, what it posted twice, and the fixes

Deployed at 14:38 CT and re-ran the queue. Three faults in that hour, all measured:

- **32,000 `max_tokens` made the SDK refuse the call** ("Streaming is required for operations that may take
  longer than 10 minutes" - the non-streaming limit is about 21k). Five reads errored on it. Cap is **16,000**.
- **The warm job replayed every errored envelope at once, migration-era ones included.** Seven of the nine
  entries it posted were right (four 09-17 Anthropic top-ups, HILCO 56.03, FedEx 2.36, Anthropic 10.44). Two
  were **twins of migrated rows outside the 60-day duplicate window**: Sherwin-Williams 03-22 55.72
  (`receipt-20260322-1b60424fd494` = `migration-20260322-bbe93baf0aba`) and Keith Ace 06-28 10.81
  (`receipt-20260628-e15fc6c07678` = `migration-20260628-7782f5813d2d`). Both voided by Paul. The replay now
  takes only mail received on/after 2026-09-17 (`RETRY_SINCE`) and at most two per run.
- **The writer timed out under the burst** (six re-reads plus the replays, each five writer calls): four
  "read of Journal timed out", two doGet misfires *after* the write landed - HILCO and the 10.44 receipt are
  on the Journal but their envelopes read dismissed/error. `scripts/mark-envelope.mjs` sets an envelope's
  status by hand for exactly this case; re-runs are now spaced 75 s apart.

Two same-day Anthropic 10.07 top-ups on 09-17 are different receipt numbers, both real. 466 tests.

**Lost-reply fix (same day):** a postBatch whose reply is lost (`REDIRECT_MISFIRE`, `BAD_RESPONSE`,
`NETWORK_ERROR`) now asks the Journal for its txn_ids before erroring; found -> posted, with the Drive link.
Three of today's four hand repairs were exactly this. `confirmPosted` is injected like `recheckDuplicate`.
`scripts/mark-envelope.mjs` stays for the rest. 467 tests.

**`checked` was being dropped (same day).** Paul, on the Energy Texas $128.70 hold: *"i'm paying quite a bit
for the claude api to reason this stuff out. you can reason it out. why cant the api?"* It did: the decide
call carried a full `checked` record every time (the transcript shows it), and `normalizeDecide` never copied
it into the stored model - since the field was introduced on 2026-09-22. The Inbox's "Claude's read" and the
digest showed only the one-line `why`. Kept now (capped at 4,000 chars). 467 tests.

**Ledger window 60 -> 365 days (same day, not yet deployed).** Atmos 09-23, re-read after the 5-minute
timeout, held on PAYER_UNKNOWN: "Atmos ledger history has a single migration row, so no D-045 payer
precedent" - the four PAUL payments before it sat just outside 60 days. The fresh read is whole-tab anyway,
so the window is free. `HANDOFF-2026-09-25.md` written. 467 tests.


## 2026-09-25 (evening) - The plan, part 1: reads come off the writer (D-047)

Paul: *"i'm paying for a brain and getting blocked by stupid stuff. we need the brain's work to be used."*
Every read on 09-25 was right; every failure was the writer serialising reads and writes through one Apps
Script web app. Reads leave it.

- **`lib/sheets-reader.mjs`**: a Viewer service account reads a tab through the Sheets values API
  (`UNFORMATTED_VALUE` + `SERIAL_NUMBER`), RS256 JWT signed with `node:crypto`, token cached 50 min, no new
  dependency. Returns `readTabData_`'s exact shape: a serial in a date column becomes `yyyy-mm-dd`, in
  `posted_at`/`closed_at`/`added_at` an ISO timestamp, in `period` `yyyy-MM`; rows padded to the header width.
  The API has no cell type, so "Date cell" is decided by column (the writer's lists + `TAB_HEADERS`' date
  columns) - `scripts/reads-tieout.mjs` is what proves that guess against the writer, cell by cell.
- **`_shared.mjs`**: `fetchTabFromWriter` -> `fetchTab`, the reader when `SHEETS_SA_KEY` is set, the writer
  otherwise. `readTab`, `refreshTab`, the `books-cache` snapshots and `applyReadOpts` are untouched; nothing
  changes in production until the two env vars exist.
- **Writes are untouched.** The service account has read-only scope and Viewer, the writer keeps the lock,
  and its `read` action stays for the workbook menu.

Not yet done, waiting on the flip: `JOURNAL_READ_TIMEOUT_MS` back to 60 s, `MAX_RETRIES_PER_RUN` to 5.
Paul's steps (one per message): service account + JSON key in the site's Cloud project, Sheets API enabled,
share the workbook with its email as Viewer, run the tie-out, then `netlify env:set --context production`
for `SHEETS_SA_KEY` (base64 of the key file) and `SPREADSHEET_ID`, then deploy. 470 tests.

## 2026-09-25 (evening) - The plan, part 2: approve posts in the background

`approve` did Drive filing + postBatch + the envelope in one synchronous function; Netlify's proxy cuts that
off at ~26 s and did so twice on 09-25 (Energy Texas, Atmos), both times AFTER the write landed, leaving the
envelope at `posting`. Now `/api/inbox approve` validates, builds the entries, stores them on the envelope as
`posting_entries` with status `posting`, fires **`/api/approve-bg`** (`books-approve-background.mjs`, poller
secret, the settlement-bg pattern) and answers **202**. The job files the attachments, posts, writes the
envelope, and on a lost reply confirms the txn_ids on the Journal like ingest does; a refusal (DUPLICATE,
PERIOD_CLOSED, …) puts the card back in Pending with the reason. The web Inbox polls the card until it leaves
`posting`. Menu.gs's in-process `inboxApprove` never used HTTP and is untouched. 475 tests.

## 2026-09-25 (evening) - The plan, part 3: the nightly check, done by the brain

`books-reconcile-background.mjs` (`/api/reconcile-bg`, poller secret). **Code gathers the facts** from the
Journal snapshot and the docs store: (a) posted envelopes whose txn_ids are not on the Journal; (b) receipt
entries no posted envelope names; (c) live entries sharing date + normalised payee + debit total (the
`reportDuplicateReplays` key, live-vs-live and live-vs-migration); (d) receipt entries with no document;
(e) `processing`/`posting` older than an hour and every `error`; (f) the Pending count and oldest; (g) debits =
credits. **The model judges** in one call with no tools and writes at most eight bullets, each an action in
Paul's words, or "Books check: clean." Stored at `books-cache` `reconcile/<date>` and `reconcile/latest`;
`/api/summary` returns it as `check`; the paul@ poller gained `nightlyCheck` (trigger at 2 AM CT, `setup()`
installs it) and `dailyDigest` prints the check as its first section. It never writes to the workbook.
`gatherFacts` is pure and tested on the 09-25 cases (the Sherwin-Williams twin, a posted envelope with no
Journal row, a stuck `posting`, a migration-era error). 479 tests.

**Deploy order for the three parts** (Paul, one step per message): `npm run deploy` ships parts 1-3 in one
build, but each turns on separately - part 1 only when `SHEETS_SA_KEY` + `SPREADSHEET_ID` exist (after the
tie-out), part 2 at the deploy, part 3 when the poller is pushed (`clasp push -f` from `apps-script/poller/`)
and `setup()` re-run from the editor to install the 2 AM trigger. Read the Journal after each.

**First hand run of the check (same evening, deployed 15:10 CT):** the facts were right but two lists were
noise - 272 "posted, not on the Journal" were staging-era envelopes (posted 09-17/18, txn_ids that never
existed in production), and 25 of 27 duplicate groups were migration-vs-migration (the old books as Paul
kept them, D-027). Now: (a) only envelopes finished on/after the 2026-09-21 cutover; (c) only groups with a
live entry; every list capped at 40 in the prompt. The model call itself failed with "Connection error" -
`maxRetries: 4`. Real findings the run surfaced: four 09-17/18 receipts with no `doc_url` (Energy Texas
559.34, Central States Water 49.54, Uber 33.30, Alaska Airlines 166.00) and three Anthropic 10.49 entries on
09-17. Part 1 verified: the warm run refreshes all nine tabs in two seconds (the writer took 102 s for the
Journal alone in the tie-out). Poller pushed to both instances; `setup()` run; `nightlyCheck` trigger in.

## 2026-09-26 - The digest's Pending line is a snapshot; the frozen records re-run and tied out

**The digest.** The 09-26 3 AM email carried a 1,500-character Pending line for Harbor Freight $402.67:
`dailyDigest` printed the model's `why` whole, and a read made before 2026-09-22 (when `why` became one
sentence) carries its entire working there. Paul: *"i need a snapshot of the issue not a novel."* The poller
now prints one line per pending item - vendor, amount, document date and `digestReason_(p)`: the replay rule's
note in plain words when it fired; the gate's reasons when the model voted post and the gate held it (the 09-25
rule); else the model's `why` if it is 120 characters or fewer; else the card's bullets. Never the working. The
wording is the Inbox card's `GATE_TEXT` / `flagText_`, copied into the poller; a lint keeps the two maps
identical, pins the replay rule's wording and runs `digestReason_` on the Harbor Freight case. Pushed to both
instances, verified by `clasp pull`. 481 tests.

**"It knows the answer" - it did (corrected the same day).** Three copies of Harbor Freight receipt #287298
(03-19, pressure washer and gas can, Visa 9166): `gm-19d0639545d977c3` and `gm-19e8f7a71589f76e` are dismissed as
duplicates of `receipt-20260319-f3c59e4ca29f`, a staging-era entry (the 09-17/18 re-posts) that never existed in
production; `gm-19d072688657e4c8` is the pending one - its stored read said the same, and the replay rule
(`books-ingest-background.mjs`, "is not on the books") turned it into a hold. **The receipt IS on the books:**
`migration-20260319-6f2cfec4b22d`, "Harbor Frieght" (the old RECAST BIZ tab's spelling), Pressure Washer, 6510
OVERHEAD, 402.67 - the migration linked it to `gm-19d0639545d977c3`. Claude first told Paul it was on no book,
from the handoff's parked list and without searching the Journal by amount; retracted. The model was right that
it was a duplicate and named the wrong original: the row is dated March (outside the 60-day `read_ledger` window
of that read) and misspelled. The hold was the safe outcome - approving it would have double-posted it, as four
parked Home Depot receipts were on 09-22. **Lessons:** an old envelope's "already posted as receipt-..." can
name a staging txn; and old-book payees are misspelled - search the Journal by amount and date, never by name.

**Every document audited (Paul: "how do we know if there are other like it?").** All 1,021 envelopes (870
receipts once copies are grouped) against the production Journal, `rows/entries.json`'s document links, the
review notes and `paul-answers.json`. 161 documents were dismissed as duplicates of staging-only entries - the
same pattern - and every one resolves. By receipt: **667 on the books; 107 not a cost** (Uber Eats, promotions,
$0 notices, second copies); **64 off the books on purpose**, reason recorded; **5 in `error`** (863.89, known);
**27 parked for Phase 3 but not in the Inbox** (5,166.56 - 8 CoreLogic invoices waiting on the statement by Paul's
call, 17 purchases on no old tab, 2 small; recorded only in `mail_settled` and their review notes); **nothing
lost.** VistaPrint 405.84 looked lost and is the 05-08 Ashburne "Signage" row re-placed on a store credit
(`docs/phase4-audit.md` §36). **The nine in the Inbox, precisely:** five are fully on the books - Harbor Freight 402.67 and
Home Depot 02-10 200.87, 02-18 69.56, 03-01 207.19, 03-02 219.69 - so those copies are pure duplicates to dismiss;
four are partly on the books, **407.22 of items on no book**: Lowe's 02-03 238.81, Home Depot 03-02 (147.38) 86.90,
02-12 65.67, 01-11 15.84. Those four remainders are the real Phase 3 question (personal, returned, or missed).

**Frozen records.** Paul re-ran `rebuildAllFrozenRecords` (2026-09-25 17:04 PDT): 1616 Granite as of
2026-07-24 and 280 Sparkling as of 2026-08-06, 305 x 49 each, headstones in place, no error values on either.
Granite ties to the Journal: rehab block 8,951.51 (53 lines), utilities 515.12 (5), total project cost
295,239.73 = 288,467.63 of cost lines + 6,772.10 of in-sheet interest.

**Found, and left where they are:** the reconstruction pins the as-of cell to the settlement date, so three
Granite costs dated after its 07-24 closing are not on the frozen tab - TXU 261.76 (07-25), City of Waxahachie
950.02 (07-29), Verity Plumbing 1,526.46 (08-05), 2,738.24 in all. Paul: *"anything after the closing date
should go in the recapture costs tab"* (D-031). But all three were on the old Granite tab as closed and are
inside Granite's 09-22 closing: the sale released 1020 5,825.46 and 1120 1,476.90 (both including them) and paid
Paul 3,900.24 on 2030 (1,162.00 + 2,738.24). Moving them to Cost Recapture now would reimburse and split them a
second time at the next sale. Everything new already follows the rule (a sold property refuses posts).

**Parked by Paul:** 280 Sparkling's frozen tab has a blank Sale Price (never typed; `contract_price` is blank),
so its Profit Breakdown reads a net loss of 202,841.02 and a negative payout to Paul. The fix: `275000` (Recast's
half of the 550,000 sale, the revenue the books recorded) in C11 - the edit trigger ignores that column - then
`rebuildAllFrozenRecords` again, which keeps a typed Sale Price. It will read about 58,409 profit (the tab's 3%
and 2% estimates); the closing tab keeps the actual 60,930.09.

**Phase 3, put to Paul:** spec only (`docs/phase3-spec.md`, 2026-09-15), nothing built; it needs the menu shape
(D-023) first. Proposed order: import (Recast Books -> Import statement..., QFX/OFX, CSV or PDF -> a Feed tab),
matching by Claude, reconciliation by code (in the 2 AM check), then the Citizens Daily Summary emails. What it
will surface first: the books hold Chase Operating (1402) at 153,450 - 159,500 of Dennis's advances in
(Ashburne 158,000, Bowling Green 1,500), 6,050 out (two Atlas Pools payments) - while the migration recorded
189,149.44 of property costs as paid by Paul. Waiting on Paul's go.

**Docs:** the `CLAUDE.md` Open list's `rebuildAllFrozenRecords` step is done, the "tools are overhead" prompt
(committed 09-22) went live with the 09-25 deploys, and the test data note is gone - `clearBooks` removed the
PHASE 0/1 gate entries at cutover and the `TEST Phase 1 gate` rows are deleted (checked on the snapshots).

## 2026-09-26 (later) - The nightly check proves every receipt landed somewhere

Paul, after the full-envelope audit: *"yes add that to the nightly check."* `gatherFacts` gained (h)
`receipts_on_no_book`: every document the bookkeeper ever processed must end one of four ways - on the Journal, in
the queue, kept off the books with a recorded reason, or not a cost. A receipt is its copies (vendor, date, total;
two receipt numbers of the same format that differ are two receipts, so same-day Anthropic top-ups stay apart,
while an order number beside a store receipt number stays one). A copy is accounted when its entries are live (or
voided - a void is a decision), a migrated row carries it (`lib/migration-record.mjs`), its Drive file is on a live
row, its review note names a live row, it is settled (a `mail_settled` answer, a D-026 re-post rule, a "recorded
decision" note), or what it says it copies - the model's `duplicate_of`, the migration's "a second copy of" - is
accounted. A dismissal that claims nothing is not a cost; one that claims a duplicate (a pointer, Paul's
"Duplicate", a migration note or rule) must find it. Last resort: an entry no other document explains, same amount
within two cents (or the pre-tax subtotal), within ten days, sharing a word with the vendor or the same day - old-book
payees are misspelled. The prompt makes each one Claude's job ("Find ... - on no book", with a Paste to Claude line).

`lib/migration-record.mjs` is generated by `scripts/build-migration-record.mjs` from `rows/entries.json` (639
documents linked to migrated rows), `paul-answers.json` `mail_settled` (not `differences_settled` - those documents
are attached to rows and stand or fall with them), the D-026 dismiss overrides in `books-re*.json`, and the two
receipts the audit settled (VistaPrint 405.84, Uber Eats 143.12). A test keeps it in sync.

**Proved on the real books** (the 1,027 live envelopes and the Journal, offline): **0 flagged**, 5 ms. With Harbor
Freight's migrated row removed it flags exactly Harbor Freight, all three copies. Removing the rows of 25 random
linked receipts one at a time flags 16; each of the other 9 is still carried by another copy or settled by a
recorded decision (checked one by one). Three false alarms found and fixed on the way: `differences_settled` counted
as settled; the amount match borrowing a row another receipt already explains; reviewed dismissals trusted without
the duplicate they claim. 483 tests. **Deployed 2026-09-26** (Paul, deploy `6ab8584a`); the 2 AM check runs it from then on.

## 2026-09-26 (night) - The Inbox's four parked cards: one-click PDF, itemized reads, a safe reprocess

**1. A PDF opens in one click (writer, pushed).** Paul: *"why are these receipts three clicks deep ... they are
buried."* A PDF on a workbook Inbox card was a link to the WEB Inbox (open the site, find the card, click again); a
plain `/api/file` link cannot work because the site's session is a Bearer token. `inboxFile(key)` in `Menu.gs`
returns the bytes (same `siteFetchRaw_` as `inboxThumb`, no `thumb=1`); the card opens a tab inside the click (one
opened after the server round trip is a blocked pop-up) and points it at a Blob URL of them. The dialog's frame is
`allow-popups allow-popups-to-escape-sandbox allow-same-origin`, so Chrome's PDF viewer runs in the new tab. Verified
by Paul on The Home Depot 03-02 card: the receipt opened in a new tab.

**2. The bookkeeper itemizes, and a hold carries its entries (prompt, deploy).** Paul: *"the system is not
itemizing them."* The three Home Depot cards are 09-17 reads that held on "which house" (the registry held only
Granite then) and proposed **no entries** - the lines were in `why` - so the workbook card had no editor, no
"+ item" and nothing to approve; Lowe's 768.99 was **one line for 12 items**. The prompt never asked for either.
New `## Itemizing: one item per printed line` (description as printed, extended price plus the line's share of the
8.25% tax, discounts folded in, shipping or a fee its own item; one item only for a one-line document - fuel, a bill,
a ride, a folio, a meal); `## Tax treatment` now says how the share is computed and where the rounding cents go
(the largest taxable line, so the items equal the total exactly); and **a hold still proposes the entries** - only
what could not be settled is left for Paul (`paid_from` UNKNOWN, or `property` empty when the house is the question,
never OVERHEAD as a filler). The `decide` schema's `entries` description says the same. The workbook card now shows
"- pick a property -" when the property is empty (writer, pushed) - the web Inbox already had "- select -".
**Deployed** (Paul, `6ab85f03`) and **verified** by one dry run (Paul agreed): the stored Home Depot 03-02 PDF
re-uploaded as `dry-up-24a18349-eece-42d9-b7dd-d3476f86dc45` (nothing posts; the nightly check skips dry runs;
filed to `_dry-runs`). The read held ("receipt names no property and a dated March job cannot be identified") and
**proposed six items, one per printed line**: copper tube 16.19, couplings 1.99, flux/solder kit 45.47, shop towels
14.05 on 1030 with the property left empty; the torch kit 67.10 on 6510 OVERHEAD (a tool); the water 2.58 (marked N,
no tax) on 6710. Tax per line, the rounding cent on the largest line: **147.38 exactly, no TOTAL_MISMATCH**. What it
missed: 60.48 of this receipt is on the books as migrated rows, and `read_ledger` (payee "Home Depot", 240 days)
showed "no March-2026 Home Depot rows" - the tool returns the 80 newest matching lines, so March falls off. Item 3.

**3a. A Reprocess never posts or dismisses (deploy).** Reprocess was a fresh read through the normal path: a
"post" the gate passed was posted, a confident or duplicate dismiss was dismissed. On a parked receipt that is mostly
on the books as migrated rows, that can post it whole on top of them - how four were posted twice on 09-22 (audit
66). The Inbox verb (`books-inbox.mjs`, both Inboxes' Reprocess button) now sends `holdOnly: true`; `processDecision`
returns such a read to `pending` straight after the dry-run branch, with the read, the gate's reasons, and a note
in `why` when the model had voted post or dismiss ("[reprocess: read as post, held for Paul ...]", so neither the card
nor the digest says "Posted:" on a pending item). The warm job's retries of errored reads and the poller's re-upload
list do not send it and post as before; `scripts/recover-errored.mjs`'s re-reads now wait in the Inbox. Test: all
three outcomes a reprocess must not reach (post, confident dismiss, DUPLICATE_OF) end `pending` with nothing filed,
posted or voided - fails without the branch. 484 tests.

**3b. A read can say a receipt is partly on the books (deploy + writer + both pollers).** `decide` has
`already_posted_txn_ids` - the Journal entries that already carry some of the receipt's lines (the migrated old-book
rows) - and the entries then hold only the lines on no book. The gate takes those entries' amounts **from the Journal**
(`postedEntries`, never the model: a name on no live entry adds nothing and the total fails), adds them to the
entries for the TOTAL_MISMATCH check, returns `already_posted_cents`, leaves them out of the twin rail, and always holds
the read (`PARTLY_ON_BOOKS`: "Part is on the books already - check the rest, then approve") - otherwise a later copy
of a receipt could name the posted rows and post the lines Paul removed on the card. Both cards show "Entries $X +
already on the books $Y / receipt $Z". `read_ledger` takes a `date`: the rows within 10 days, nearest first, any payee -
the 80-newest cap had hidden March from the dry run, and old-book payees are misspelled. Prompt: `## A receipt
partly on the books` - find the receipt's rows by date, claim a row only when amount AND product fit (the migration
itself linked HD 03-02's second copy to a 03-23 "Shop Towels" 14.05 and an 04-09 "wire connectors" 16.19 by amount
alone: other purchases), hold with the rest, dismiss when rows carry every line. Test: the partial total ties from the
Journal, a ghost name fails, a named row carrying the receipt number is no duplicate (both mutations caught). 485 tests.
**Deployed** (Paul, `6ab86157` for 3a, `6ab86290` for 3b; writer and both pollers pushed and verified by pull), then
**the four parked cards reprocessed** (hold-only - nothing posted). Checked against the migrated rows by hand:
- **HD 02-12 156.67 - right.** Claimed Shovel, PEX (two lines), Sharkbite (two lines), Screws: 91.00 from the Journal;
  proposed the PEX clamp tool 48.68 (6510 OVERHEAD), clamps 7.99 and hangers 9.00 (1030, 104 Ashburne) = 65.67.
- **HD 03-02 147.38 - right.** Claimed Copper Pipe 16.19 and Paper Towels 14.05 = **30.24, not the handoff's 60.48**:
  the migration also linked this receipt's second copy to a 03-23 "Shop Towels" 14.05 and an 04-09 "wire connectors"
  16.19 by amount alone - other purchases, and the read rightly left them. Proposed couplings 1.99 and flux/solder kit
  45.47 (1030 Ashburne), torch kit 67.10 (6510 OVERHEAD), water 2.58 (6710) = **117.14 on no book, not 86.90**.
- **HD 01-11 170.63 - one line wrong.** Claimed the ten rows dated 01-11 (128.85) but proposed the light bulbs 25.93
  as unposted: the "Light Bulbs" 25.94 row is dated **01-16** (the old book booked it late; the migration linked it
  to this receipt; no 01-16 Home Depot receipt was ever read). My rule said a row "more than a few days away" is
  another purchase. Reworded: product AND amount decide, even when the old book dated the row days later, the tax
  share is a cent off, or the row is one unit of a quantity line; a same-product row a week or more away is claimed
  only when no nearer row carries the line.
- **Lowe's 768.99 - cannot be itemized from this document.** The screenshot shows 2 of 12 units; the read proposed the
  two niches 183.98 plus "remaining 10 items" 585.01 and claimed nothing. The order's own document is
  `gm-19c54bfd346362be`, **lowes.pdf** (dismissed 09-22 as a migration leftover), itemized on 09-17 into 7 lines: four
  are on the books (privacy knobs 219.14, deadbolt combo 70.10, smoke detectors 148.95, ONE of the two niches 91.99);
  the second niche 91.99, hinges 5.07 and 5.39 and passage knobs 136.35 - **238.81** - are on no book.

**The web Inbox kept the old read's entries after a Reprocess** (found reading the cards): `ensureEditingEntries`
cloned a card's entries once and never again, so after a re-read the card showed - and Approve would have posted - the
previous read's entries (on these four, the whole receipt). The clone now belongs to one read (`editingAt` keyed on
`finishedAt`). The workbook Inbox rebuilds its copies on every load and was never affected.
**Deployed** (Paul, `6ab86526`). The web fix verified live: the Inbox loaded before a re-read, the list reloaded
without a page refresh, the card showed the NEW read's item wording. **The Lowe's PDF re-read** (Paul: yes) **is right:**
claimed one niche 91.99, privacy knobs 219.14, smoke detectors 148.95 and the deadbolt combo 70.10 (530.18, from the
Journal - the "one unit of a quantity line" case), proposed the second niche 92.00, hinges 5.07 and 5.39 and passage
knobs 136.35 (238.81), payer unknown; it left the undocumented 02-04 "Door Knobs" 140.68 alone. The screenshot card
`gm-19c28915ee4c0912` is a copy of that order - Paul dismisses it. **HD 01-11 re-read: the same miss** - and not
the rule's fault: `read_ledger` by date returned 80 lines nearest first, and 80 Journal lines lie within 3 days of
01-11 (every migrated entry is a cost line and a payment line), so the 01-16 bulbs row never reached the model. By
date the tool now returns cost lines only, up to 150 (168 lines within 10 days of 01-11 halve to 84). Test: 40 entries
within 3 days plus a row booked 5 days late - the late row shows, cost lines only, nearest first; fails on the old
tool. 486 tests.
**Deployed** (Paul, `6ab86666`), HD 01-11 re-read: **right** - claimed all eleven rows including the 01-16 Light Bulbs
(154.79 from the Journal), proposed the two GRK screw lines 9.95 + 5.89 = 15.84. **Item 3 verified: the five cards,
checked line by line against the migrated rows** - HD 01-11 15.84, HD 02-12 65.67, HD 03-02 117.14, the Lowe's PDF
238.81 on no book: **437.46, not 407.22** (HD 03-02's look-alike rows were the 30.24); the Lowe's screenshot is a copy of
the PDF's order. Nothing was posted by any re-read. Approving or dismissing each remainder (personal, returned or
missed - the Phase 3 question) is Paul's call on the card.

**4. "Items do not add up" on a hold with nothing proposed (deploy + writer + both pollers).** The gate compared the
items with the receipt total on every read, so a hold with no items carried TOTAL_MISMATCH and its card said "Items do
not add up - fix the amounts" with nothing to fix (the workbook card has no editor without an entry). The total is
now checked only when something was proposed (items, or rows the read found on the books); nothing proposed is
`NO_ENTRIES` whatever the verdict (it was post-only), and its words are "Nothing proposed - reprocess it, or dismiss
it" - a reprocess is safe to suggest now that it never posts. Fixed in the gate, so the card, the digest and the web
chips all read it. Test: hold, post and dismiss with nothing proposed are NO_ENTRIES and never TOTAL_MISMATCH; fails on
the old gate. 487 tests.
**Deployed** (Paul, `6ab86769`); the writer and both pollers pushed and verified by pull. **5. The Books check:** the
09-26 2 AM run said "Books check: clean." - it predates `receipts_on_no_book`, whose first run is the 2 AM check on 09-27.

## 2026-09-26 (night, later) - Plain words everywhere Paul reads the books

Paul, on the Home Depot 01-11 card: *"it sounds like you're telling me this is a duplicate when you say 'Part is on
the books already - check the rest, then approve' and 'Entries $5.89 + already on the books' ... i THINK you are
asking if i returned them?"* - then *"i need you to add rules to talk to me in plain, easy to understand layman's
terms language. i'm not an accountant. talk to me like im 5 years old ... in the books stuff."*

**The rule** is load-bearing constraint 7 in `CLAUDE.md` (and a memory): everything Paul reads in the books - chat,
steps, Inbox cards, the digest, the bookkeeper's `why`, the nightly check - is in everyday words with the store, date
and dollar amount; no jargon or ids in his sentence; say what something is NOT when he could take it wrong. The same
rule is in the bookkeeper's prompt (`why` examples rewritten: "Held: two screw packs ($15.84) were never recorded -
did you keep them?"; no tax notes in item descriptions) and the nightly check's prompt (bullets lead with store, date,
amount and the click; ids at the end or on the Paste to Claude line).

**The card, rewritten** (`Inbox.html`; the digest's copy in the poller, kept identical by the lint): a partly-recorded
receipt says "$154.79 of this receipt is already in the books. The items below ($15.84) never got recorded. Kept them?
Approve. Returned them? Dismiss. Returned only some? Remove those (x), then Approve." The totals line says what Approve
records: "Receipt $170.63: $154.79 already in the books + $15.84 to record now" / "... + $5.89 to record now - $9.95
will not be recorded" / "Recording $45.00 - the whole receipt" (the web Inbox's line too). Every reason is a plain
action the card allows - the store-name and date reasons used to say "type one" on a card with no box for either; they
now say Reprocess or Dismiss. The account mismatch bullets name the account ("Rehab - materials is a house cost - pick
which house"), the Approve button asks "Click again to record it", the result says "Recorded" and "saving the receipt
to Drive". Test: the card's own functions run on HD 01-11 - the partial bullet, the three totals lines, a mismatch
bullet by name, and no "Entries $", "does not match" or "entry" anywhere. 488 tests. Left: the web Inbox still shows
the reason codes as raw chips (history cards; pending review is in the workbook).

**The Returned button (writer + both pollers).** Paul, on Home Depot 01-11: *"this was a return. how does this work?
do i dismiss? there is not return button"*, then *"there will be undocumented returns/credits from home depot when we
reconcile the bank statements"* (now `docs/phase3-spec.md` 3a: a credit whose items were never recorded books nothing,
one whose items were recorded is a refund on the same house, anything else is a plain question to Paul). The workbook
card has **Returned** beside Approve: first click "Click again - it all went back", second click files the card like a
Dismiss with the note "Returned (<amount>): <items>" and says "Marked returned - nothing was added to the books." The
note is the marker a store credit is matched to in Phase 3, pinned by the lint. The partly-recorded card and the digest
now say "Took them back to the store? Click Returned." Checked first: no refund of the 01-11 screws is on the books or
in any document read, so returning them changes nothing already recorded. The web Inbox has no Returned button.

**Approve / Returned / Dismiss on each line (writer + both pollers).** Paul, on the new card buttons: *"these buttons
need to be for each itemized item not the whole receipt. some itemized items will be returned, some dismissed, some
approved. its not a blanket response for all items. that defeats the purpose of itemizing."* Each line on a workbook
card now has **Approve** (the default), **Returned** and **Dismiss** (with an optional "why?"); a returned or dismissed
line greys out. The card's **Save** does what each line says - posts the approved lines (split per house as before)
and files the rest in the note, "Returned ($9.95): ... | Dismissed ($5.89): ... - personal", on the posted card
(`mark-posted` already keeps a note) or, when nothing was kept, on a dismissed one. **Dismiss all** (with a reason) is
for a document that is not a cost. The whole-card Returned button and the per-line x are gone. The totals line
accounts for every dollar: "Receipt $170.63: $154.79 already in the books + $0.00 to record now + $9.95 returned +
$5.89 dismissed". A kept meal or gift line asks for its who-and-why; a returned or dismissed one does not (the read's
static meal flag is now worked out from the card, so dismissing HD 03-02's water clears it); only kept lines need a
trade or a house. Card words say Save and Dismiss all (the digest's copy too). No server change: `inboxApprove` already
passes a note to `mark-posted`. Test: the card's own functions on HD 01-11 - the partial bullet, all-kept, one
returned and one dismissed (note and totals), one kept and one returned (only the kept line posts, its choice fields
stripped), the water's flag, and no whole-card button left. 488 tests.

**Deployed 2026-09-26 night (`6ab89032`, run from the session on Paul's "deploy"):** the plain-words bookkeeper prompt
(the receipt note), the plain-words nightly check prompt (first run at the 2 AM check on 09-27) and the web Inbox's
totals line - one file and two functions. Verified live: the site's `app.js` serves the new wording. The workbook card
changes (per-line Approve / Returned / Dismiss, Save) needed no deploy and were already live. Handoff:
`HANDOFF-2026-09-26.md`, section START HERE.

## 2026-09-26 (late) - The spacer text on 104 Ashburne came back: the web app was four days behind (audit §67)

Paul: *"the spacer columns have text in them starting in column J. this has been an issue before."* The production
web app still ran version 4 (09-22 morning, before the §61 fix): a push reaches the menus and triggers, but the web
app runs the deployed version of the whole project, so every receipt posted through it (pollers, web Inbox,
`approve-bg`) rewrote Ashburne's blocks in the old four-column layout, into what are now the spacers. §61 skipped the
deploy because `doPost` had not changed - it calls the refresh. The books were never wrong. **Fix:** `clasp deploy -i`
to the same id (Paul's step), then Rebuild property tab on 104 Ashburne. `CLAUDE.md`: every push touching `Code.gs` or
`lib.gs` is followed by a deploy. Deployed @5 by Paul the same night, verified identical to the repo; Ashburne rebuilt and read back clean, every other
tab checked and in the current layout.

## 2026-09-28 - Every advance says who got the money; Dennis's Ashburne draws come off the Chase account (D-051, D-052)

Paul, starting Phase 3: *"how will it work with all the charges on my personal account? ... is it better to write a
check to reimburse my personal account ... and reconcile against recast business bank accounts?"* Yes (D-051): the
reconciliation covers Recast's two accounts; personal-card charges keep arriving as receipts, paid by Paul; his
statements never come in. Before any repayment check, the Chase mix-up: the books held Chase at 153,450 - 159,500 of
Dennis's draws in, 6,050 of Atlas Pools out - and Paul confirmed the draws went into his personal accounts. Recast had
no Chase account then; the old books' "Chase" was his.

**Built (D-052):** `Advances.paid_to` (Paul / Vendor / Citizens / Chase / Seller): the Add advance dialog asks "Paid
to" in words instead of an account number, a Vendor advance is refused on a partner deal, and 104 Ashburne's advance
list reads "To Paul: Draw - rehab" / "To Vendor: Cash advance - Julio, labor". `fixAdvancesPaidTo()` fills the column by
rule and moves every advance whose money sits elsewhere (void, then re-post - a run that stops half way is finished by
the next), plus the two Atlas Pools payments to Paul Paid; `reportAdvancesPaidTo()` is its dry run. Dry run on today's
snapshot: six advances and two payments move, **Chase 153,450.00 -> 0.00, Recast owes Paul 185,116.88 -> 31,666.88**;
paid_to comes out Seller 8, Paul 9, Vendor 15, Citizens 1 (Mesa's 10,000). All periods open. 489 tests.
**Run 2026-09-28 07:27-07:38 by Paul, verified on the Journal the same hour:** pushed after Paul's `clasp login` (the live script = the repo, by `clasp pull`); `fixAdvancesPaidTo` moved all eight exactly as the dry run said. Chase 153,450.00 -> 0.00; Recast owes Paul 185,116.88 -> 31,666.88; Dennis (2010) unchanged at 1,584,286.37; no property's cost changed by a cent; all 33 advances have paid_to and one live entry on the right account; the two Atlas Pools payments are Paul Paid with their receipts; Journal 2,382 -> 2,414 rows (eight voids, eight re-posts). The run took 10.5 minutes (every re-post refreshes Ashburne's heavy blocks), so its own tab rebuild was skipped by the time guard - Paul rebuilds 104 Ashburne from the menu. Paul rebuilt 104 Ashburne from the menu, then said "deploy": writer web app **@6** (= the pushed code, which `clasp pull` showed identical to the repo), answering `{ok:true}`. D-052 is done.

## 2026-09-28 (later) - Ashburne's payoff checked; Dennis's commission on the price less the concession (D-053)

Paul: *"the interest should be computed at 12% amortized monthly ... i think the interest may be being calculated with
simple interest."* It is not: `lib/accrual.mjs` and the tab's formulas compound on each advance's monthly anniversary
(a simple stub only for the days after the last one). Ashburne to its 9/23 closing (Bison Title 260840, sale 775,000,
net 715,558.65 = the Citizens wire): interest 44,900.41 compounded vs 43,151.40 simple. No end dates to type: the sell
wizard ends every advance on the settlement date and takes the agreed figure as a true-up. Then *"dennis is taking 3%
on $756,000"* (775,000 less the 19,000 seller credit) and the buyer's agent 2.75% of 775,000: D-053 - `lib/sale.mjs`
takes 1320 concessions off the commission base; the heavy tab splits the old lumped 5.75% into a typed buyer's-agent %
(default 2.75) and a Dennis Commission row on the price less the concession, which the Dennis Payout now reads. Books'
payoff for Dennis 568,721.85, 18,721.85 after the 550,000 he took. 490 tests. Pushed (= repo by `clasp pull`) and deployed **@7** on Paul's "deploy".

## 2026-09-28 (evening) - Ashburne's tab counted the property tax twice (D-054); what can still move the 2,614.86

Reading the live tab for the handoff's first question (answered: Sale Price 775,000, Concession 19,000, Buyer's Agent
2.75% are typed) showed Profit 121,671.88 against the books' 146,221.94. 11,133.67 of the gap is the tab's estimates
(Closing 2%, this year's tax guess, interest to today, not 9/23); 13,416.39 was the heavy template: Total Project Cost
(All in) added Property Tax Paid (16,031.25) on top of Cash Advance P+I, whose principal had already paid all but
2,614.86 of it. D-054: the tax moves into Rehab Total and the prorate reads the tax paid itself. A lint in
`writer-gs-lint` fails on the old code. Pushed; the live script = the repo by `clasp pull` before and after. **Needs:**
Paul rebuilds 104 Ashburne, then `clasp deploy -i` on his word. Expected after the rebuild (09-28 figures): Rehab Total
178,756.30, Total Project Cost 558,804.36, Profit about 137,703 (still 2,614.86 above the books - D-054's open line).

**Cell numbers:** a gviz html table's first row is its header and gviz drops blank rows, so a row number counted off a
multi-row read is wrong. Name a cell only after reading that one row's range. This session first gave Paul C8/C9 for
Cash Advance P+I / Property Tax Paid (they are C9/C10), and Sparkling's Sale Price is C12, not C11 as the 09-26 notes said.

**Ashburne receipts still open (the 2,614.86 can only rise):** (1) the eight worker payments with no bill (D-032):
Julio 12-10 200, 12-11 200, 05-04 250, 07-13 150 (the tab has a Julio 150 on 07-07), 07-27 300; dump 04-16 21; Iley
listing fees 04-22 199, 05-07 299 = 1,619. (2) The receipts parked for the card statement (`mail_settled`), checked
against the live Journal (total or subtotal within 2 cents, 10 days either side) and the migration links: 15 Ashburne
receipts on no book (3,270.46), four Home Depot receipts partly on the books (02-15, 03-12, 03-25, 04-05; about 766 not
on), HD 04-06 181.52 with no property read, two Amazon fan orders (530.52) with return confirmations, Floor & Decor
02-02 unreadable. HD 04-10 161.28 is fully on the books (C-32) - its PARKED note is stale.

**(1) done 09:49 PDT - the eight worker payments, decided by Paul in chat:** seven were jobs missing from the tab
(Julio 12-10 trash removal 200, 05-04 labor 250, 07-13 landscaping 150, 07-27 landscaping 300; the dump 04-16 21; Iley
listing fees 04-22 199 and 05-07 299); the 12-11 pool clean-out is the tab's 01-05 "Clean out". `addAshburneMissingBills()`
(editor, run by Paul; a lint builds the table through the posting engine) posted them as bills paid through the advance
(cost Dr / 2030 Cr, trades Trash / Landscaping / Marketing): Journal rows 2418-2431. Verified the same minute: Ashburne
owes Paul 2,614.86 -> **4,033.86** (his own spending beyond the 158,000 of draws); costs other than the purchase and the
tax 162,725.05 -> 164,144.05; the books balance (4,461,194.25 a side); the tab's Rehab Total 180,175.30 with all seven
lines in their blocks; the tab's profit unchanged at 137,703.13 (it counts draws). Books' profit 146,221.94 -> 144,802.94.

**Stopped here (Paul).** Item (2), the 18 parked Ashburne receipts, was NOT started: I asked Paul to sign in to the web
app so I could re-read them into his Inbox, and he stopped it - *"the books should be only in sheets now"*, *"you are
drifting"*. The route is an editor helper calling `siteFetchJson_` reprocess (what the Sheets Inbox's Reprocess button
does) and his review in Recast Books -> Inbox... (CLAUDE.md rule 8). Also found and left for its own step: ~40 Amazon
house-item orders only in pvb421, on no book (handoff item 3). **Writer web app deployed @8** (D-054 + `addAshburneMissingBills`) on Paul's "deploy", 2026-09-28 ~10:15 PDT. Audited first, on the live workbook: the seven bills at Journal rows 2418-2431; Chase 0.00; Recast owes Paul 33,096.03 (= 31,666.88 + 1,419.00 + Anthropic 10.15 of 09-28); Dennis 1,584,286.37; all 33 advances with `paid_to` (Seller 8, Paul 9, Vendor 15, Citizens 1); Ashburne's tab as written; the six parked receipts that say "posted" carry staging ids - none of the six is on the production Journal (checked by id); the other twelve are dismissed. The live script = the repo (clasp pull, all ten files). Nothing to correct. Then `reprocessParkedAshburneReceipts()` (Code.gs, beside `addAshburneMissingBills`): the 18 ids through `siteFetchJson_` reprocess, the Inbox's own route - hold-only, never a post; a lint pins 18 distinct ids and no write. 492 tests, pushed (live = repo). Deploy of this push owed only for tidiness (the web app never calls an editor helper).
491 tests.

## 2026-09-28 (late morning) - the 18 parked Ashburne receipts decided in the Sheets Inbox; an empty card gets a typed line; loading shows progress

`reprocessParkedAshburneReceipts()` run by Paul 10:18 PDT: all 18 re-read and held (about 3 minutes). Read back before he
started: 15 cards right as shown; **HD 03-25 241.50** is the old books' 03-30 "Crawl Space Door" 261.42 (= 241.50 x 1.0825 -
the old books grossed up tax the Portland-shipped order never charged, 19.92 high, left); **HD 04-05 288.44** is seven
migrated rows of 04-05 totalling 281.41 (smoke alarms entered pre-tax, 7.03 light, left) - both dismissed; **Ping Lighting
03-10 99.20 was WRONGLY called "already in the books"**: the read trusted `search_docs`, which showed the earlier copy
`gm-19cd5d25a07e5bb1` as `posted` with `receipt-20260310-f075b4cf8017` - the 09-17 STAGING replay, not on the production
Journal (no Ping row, no 99.20). The last session's "66.08 on" (HD 03-25) and "59.80 on" (HD 04-05) were wrong; its "Ping on
no book" was right. **Lowe's 03-19: the old books already carry the RETURN of one fan (03-21, 108.23)**, so all three fans
were approved (a "Returned" there would count the return twice); the only other recorded Ashburne return is Floor & Decor
121.02 (03-19) - the HD/Lowe's refund slips of 03-26 .. 05-07 are NOT in the books, so "Returned" on their items is right.

**Paul decided all 18 (Inbox empty ~11:00 PDT). Posted 2,046.96 - 1,906.26 on 104 Ashburne, 140.70 overhead** (Lowe's 02-04
extension cord 134.23, HD 04-16 caulk gun 6.47): Amazon heaters 276.22; HD 02-15 Halo housing 74.65; HD 02-16 OSB 30.79;
HD 03-09 77.95 (the two GRK screws not kept); AllModern 214.34; Ping 99.20 (typed by Paul); McCoy's 61.53; Wayfair 93.08;
Lowe's fans 324.69; HD 03-21 paint 389.93; HD 04-06 lights 181.52; HD 04-16 88.83. Nothing kept from Lowe's 01-09 (360.49),
HD 03-11 (6.68), HD 03-12 (the trim and quarter round), HD 03-25, HD 04-05. **Paul's notes on the cards (read back from the
envelopes, for Phase 3's store-credit matching): Returned 455.65** - Lowe's 01-09 thermostat + deadbolt 356.13, Halo trim 18.91,
GRK screws 5.88, Husky wrench 6.68, tile trim + quarter round 68.05; HD 03-25 "already in the books", HD 04-05 "Duplicate". Verified on the Journal: Ashburne's fixing and
holding 180,175.30 -> **182,081.56**; **Recast owes Paul on Ashburne 4,033.86 -> 5,940.12**; all 2030 33,096.03 -> 35,142.99;
Ashburne profit by the books **144,802.94 -> 142,896.68** (cash check 148,836.80 - 5,940.12); the tab's blocks refreshed by
each Save. **Found, left:** the five email-only receipts (Amazon, Lowe's 02-04, AllModern, Wayfair, HD 04-06) posted with NO
Drive link - `inboxFinish` files attachments only; D-035's `email.txt` path lives in the site's ingest, not the sheet's Save.

**Inbox card, two changes on Paul's word** (Inbox.html, pushed, no deploy): (1) *"i need a way to enter the information if
none is present"* - a card the read left empty seeds one full line (Property, Paid from, account, amount, description,
trade, house, business reason, Approve/Returned/Dismiss), house = the mailbox it came in on; the first cut lacked `date`,
`payee`, `memo` and failed `periodOf: not a date string` - fixed. `NO_ENTRIES` wording updated in both GATE_TEXT maps.
(2) *"when the inbox is loading i want more information"* - `inboxList` split into `inboxEnvelopes` (site) + `inboxPickers`
(workbook) run side by side, each reported with a running clock, then "building N cards"; one bar for the whole load, built
once (a bar rebuilt every tick flashed - Paul: "going nuts"). Thumbnails say "picture loading...". 492 tests.

## 2026-09-28 (midday) - two fixes before the next batch: a practice-run "posted" copy is not proof; email-only receipts saved from the sheet get their Drive link

Paul: *"make the two fixes first"*. (1) `searchDocs` (books-ingest-background) takes the Journal's txn_ids and reports a
"posted" envelope none of whose rows is on the Journal as **"not on the books (posted only on a practice run...)"** with
no ids - the 09-17 staging replay left migration-era copies saying "posted", and the Ping re-read believed one. The tool's
description says the same; only `read_ledger` proves a thing is recorded. Test in `books-ingest-background.test.mjs`.
**Deployed `6abab654` on Paul's "deploy" (2026-09-28 midday).** (2) `inboxFinish` files the email text as `email.txt` when a card has no
attachment (`storeEmailText_`; the dialog now sends `bodyText`), as the site's ingest does since D-035; **`fileEmailReceipts()`**
(Menu.gs, editor, once) links the five email-only records of this morning (Amazon 01-20, Lowe's 02-04, AllModern, Wayfair,
HD 04-06) - a linked card is skipped, so it is safe to run again. Pushed (Menu.gs, Inbox.html - no clasp deploy needed). 493 tests.
**Run by Paul 11:49 PDT: all five linked; read back on the Journal - every one of the morning's 30 cost lines has its Drive link.**

## 2026-09-28 (afternoon) - the Amazon orders only in pvb421: list agreed with Paul ("these are all ashburne"), a one-off forwarding script for his personal Gmail

The handoff's "~40" is 112 Amazon "Ordered" mails in pvb421 for 2026; 78 in the Ashburne months, 16 plainly personal, 62
house-looking. Cross-checked against the paul@ and properties@ listings: **11 of the 62 were forwarded in Jan-Feb and
handled in the migration** (e.g. "SWRT 6 Pack Black" = black electrical tape 6.36, on Ashburne 01-20 - Paul asked), four
forwards bounced (audit §48), five orders Amazon refunded in full, the Dreo heaters posted this morning. **42 remain, never
forwarded, and Paul says all are 104 Ashburne.** I cannot read pvb421 (the listing has no totals; the Chrome profile the
extension uses is signed into paul@ only), so the route is the proper one: `scripts/forward-amazon-orders-pvb421.gs`, a
one-off Paul pastes into a script project under pvb421 and runs once - forwards the 42 by message id to
104ashburne@recast-properties.com with a note on top (house, paid by Paul, the order date, Amazon's refunds where known),
labels each thread so a second Run skips it, 1.5 s apart. The properties@ poller reads them into the Sheets Inbox; Paul
decides each card. The "on no book" claim for these 42 is by item name and the last session's amount search, not by a
document read - the cards' `read_ledger` check settles it per item.

**12:12-12:13 PDT: Paul ran the script - all 42 sent** (log: 42 x "sent", none skipped, none missing). Paul's rule for the
batch: *"i want the api to do its job and sort these. it should be able to handle that or we havent built it well
enough"* - no hold-only switch; the bookkeeper posts, dismisses or holds each on its own read, and this session checks
its calls against the Journal. Today's docIds: `gm-` + a hex whose first 11 digits are the ms timestamp - 12:12 PDT is
about `1a0e96e6000`, so list Blobs with prefix `doc/gm-1a0e96e6000`[:7]. Paul, 12:15: *"is this the last group of expenses lurking in the
ether. getting sick of batches popping up out of nowhere"* - answered with the finite list (HANDOFF START HERE): the
42, ~12 parked, ~16 May-Sep Amazon orders, Harbor Freight 5, Cash App 45; then Phase 3.

## 2026-09-28 (early afternoon) - the 42 sorted by the bookkeeper; the reader reuses a house's sections; the hinge refund; a replay for posts the writer refused

**The 42 Amazon forwards, read by the bookkeeper on its own (Paul's rule):** by 13:05, 33 posted, 7 dismissed (3 by
Claude as already in the books - candelabra bulbs = "Light Bulbs 10.81" of 02-24, rat traps 43.28 of 03-06 with the fan
refunded, the 03-17 AIPER order = three migrated rows; all three checked on the Journal - and 4 by Paul on held cards:
the returned curtains and rods), 1 stuck in error, 1 approved over the ceiling by Paul (ACE DECOR 768.49). **Eight
posts errored under the burst** ("Lock timeout", "Writer returned a non-JSON response" - 28 posts in a few minutes
against the serialised writer); the warm job's stored-read retries healed seven; the ELYONA pendant 66.56 (04-04)
spent both retries - `replayErroredReceipts()` (Menu.gs, editor) replays any "error" envelope with a stored read
through `/api/ingest-bg fromStored`, which confirms on the Journal before posting. **Paul's own call, corrected:** the
Ravinte hinges card (03-18, 198.42) approved whole though Amazon refunded one 60-pack, 78.65, on 04-16 -
`addAshburneHingeRefund()` posted the refund (rows 2560-2561, the cost entry with its sides swapped; Paul: "yes. that
was my mistake"). **Sections:** the reads gave Ashburne twelve trade names its tab never had (`refreshHeavyBlocks_`
warnings "no header for block") - `tradesByProperty(journalLines)` now feeds each house's sections into
`list_properties`, the prompt and the decide schema say to reuse them (**site deploy `6abac7f7`**); `retagAshburneTrades()`
(Menu.gs, editor, once) moves the live-receipt lines into the tab's own sections by trade, bath items by description
(master-bath list), then rebuilds the tab - a lint proves every target is a `PT_HEAVY_ORDER` section. **Inbox card:**
an empty read shows Claude's sentence and the click it means, the Dismiss-all reason pre-filled (Paul: "i cant do anything
with this"). 496 tests.

**13:14 PDT - the batch closed out.** All 42 settled: **31 recorded by Claude, 4 recorded after Paul approved a held card,
4 dismissed by Claude as already in the books (candelabra bulbs, rat traps/fans, the 03-17 AIPER order, the 02-08 drawer
pulls = migrated "Drawer pulls 249.97" of 02-09 - all four checked on the Journal), 3 dismissed by Paul (returned curtains
and rods)**; the ELYONA pendant replayed from its stored read. **Replay run 13:06 - my mistake:** `replayErroredReceipts`
took every "error" envelope, so three pre-cutover documents posted on top of their migrated rows (Seconds & Surplus 04-11
432.98; HD 06-25 Bowling Green 176.59; HD 03-29 Ashburne 87.64) - voided 13:14 by `undoReplayedMigrationDocs()` (cards
dismissed, Ashburne rebuilt), the helper now skips anything received before 2026-09-21 and reads the ingest's empty 202.
Two pre-cutover envelopes stay "error" (Keith Ace 06-30 70.32 BG = three migrated Ace rows; HD 06-18 96.36 Ashburne) -
nothing posted; one landed as a card (Uber 07-09 31.27, migrated) for Paul to dismiss. **Questions left for Paul:** the
11.01 Defiant knob on the HD 06-25 run and the 71.71 fence pickets on the HD 03-29 run match no migrated row.
`retagAshburneTrades` run 13:04: 72 lines into the tab's own sections; `addAshburneHingeRefund` 12:55: rows 2560-2561.
**Ashburne by the books after the 42 (read back 13:15):** fixing and holding 185,785.91 (182,081.56 + 3,704.35 net of
the 78.65 refund), costs **510,785.91**, **Recast owes Paul on Ashburne 9,644.47**, profit **139,192.33** (= 148,836.80 -
9,644.47 = 717,558.65 - 510,785.91 - 44,900.41 - 22,680.00). All 2030: 38,861.32. Bowling Green's 2030 unchanged by the
void (1,011.32). 498 tests.

**13:25 - Paul's answers:** the 11.01 Defiant knob (HD 06-25, Bowling Green) *"was a return"* - nothing to record, the
migration was right to leave it; the 71.71 fence pickets (HD 03-29) *"is a new expense for ashburne"* -
`addAshburnePickets()` (Menu.gs, editor, once) posts it on Landscaping with the receipt's Drive link.
**13:20 - pickets posted** (rows 2594-2595, `manual-20260329-a3af0b1e4474`). **Ashburne by the books, end of day:** fixing and
holding 185,857.62, costs **510,857.62**, **Recast owes Paul 9,716.18**, Paul's profit **139,120.62**. Session closed 13:25 PDT;
git pushed. Left in the Inbox for Paul: the Uber 07-09 31.27 card (already in the books - Dismiss all).

## 2026-09-29 - the Inbox has two tabs: Receipts and Bank statement

Paul: *"the unclear charges from the bank statement import are in the same inbox as unresolved expenses. i want to
separate them."* He offered a tab or two inboxes; tabs, because the cards and buttons are the same and two inboxes would
be two menu items and two copies of one screen. `Inbox.html` only: `tabOf_(env)` (`source === 'feed'` -> `bank`, else
`receipts`), each card carries `data-tab`, `filter_` shows the open tab's cards, `counts_` puts a count on each tab
("2 of 3" while a filter is typed) and the total beside "Inbox". It opens on Receipts, or on Bank statement when
Receipts is empty; Refresh keeps the tab. "Nothing waiting here." is per tab and never shows over a failed load.
Checked in a local copy with made-up cards (2 + 3), then pushed 07:38 PDT and pulled back: all 14 files = the repo.
No deploy (the sheet's Inbox runs the pushed code); the @13 deploy is still owed from 09-28. 520 tests.
**Paul opened it in the live workbook: "that worked".**

**07:55 PDT - writer web app @13** (Paul: "deploy", run from the session): the deploy owed since 09-28 (`feedUpdate`'s refactor,
D-056's tidy). `clasp deployments` reads @13, the web app answers (`ok`, 0.4.0), and the live code = the repo. Nothing owed.

## 2026-09-29 (08:05) - Match statement lines asks by the bank's name; Paul's three questions on reconciling

With two banks waiting, `matchStatementLines` asked "Which account?" and wanted an account code typed (1401 / 1402) -
against rule 7. It now asks by the bank's name from the Bank accounts tab, a Yes / No click per bank ("Match Citizens
(12 bank lines waiting) now?"), one bank per run (a run can take five of the script's six minutes), and the closing
box names any bank still waiting. One bank waiting: no question, as before. `Menu.gs` only - pushed 08:04 PDT, pulled
back = the repo, no deploy. The lint runs the picking loop (one bank, Yes, No-Yes, No-No, box closed). 520 tests.

**Paul's questions, answered:** reconcile monthly, each account, the first week after the month ends; the import
knows the bank from the file's account number (2505 Citizens, 6317 Chase) and needs the bank's QFX download, not the
PDF statement - Chase's file is untried; the daily emails are not enough on their own (Chase's names no payee,
Citizens' is a preview), the statement is the record. **Read off his two emails of 09-28:** Citizens 170,800.07 less
the day's 994.72 = the emailed 169,805.35; CondoCerts 375.00 (card 5450) looks like Newport's HOA release, in the
books since 09-09; Chase 6317 took in 2,000.00 (the earnest money, by the look of it); Dennis's card 9301 has four
charges (Home Depot 162.91, 33.07, 141.09; 2.65 at 1316 N Highway 77) - receipts not checked.

**Asked by Paul, not built:** a placeholder for a charge whose receipt may never come ("NEED RECEIPT FROM DENNIS").
Found: `supersedes` already voids an entry and posts its replacement (ingest), and `findDuplicate` would dismiss the
late receipt as a duplicate of a placeholder only when the payee strings are equal - so a placeholder needs a prompt
rule (a placeholder is superseded by its receipt) and the Feed row re-tied to the new entry. Put to Paul first.

## 2026-09-29 (morning) - the placeholder: a charge recorded before its receipt (D-057)

Paul: *"the reality is i may not get a receipt from him. is there a way to add a NEED RECEIPT FROM DENNIS thing"* -
and, offered two designs, *"go with the first"* (he picks the house; no holding account).

**The card (Inbox.html).** A Bank statement card for money out has a yellow row: *No receipt yet? Waiting on [Dennis |
Paul] - Waiting on receipt*. One click turns the card into the one placeholder line (`placeholderEntry_`: the bank's
amount, 1030, `NEED RECEIPT FROM DENNIS`, trade `Waiting on receipt`, the house already on the card or his to pick);
the bullets then say what Save does and that the receipt will take its place; Save records it and ties the bank line.
No `email.txt` is filed for it, so the tab's Receipt cell stays blank. A receipt card the gate tied to a placeholder
shows a ticked box naming the waiting charge; while it is ticked the card is paid from the placeholder's account (the
bank line is the proof) and "Who paid?" is not asked; unticked, the lines go back to what the receipt said.

**The rails (lib/gate.mjs, the ingest).** `findPlaceholder` - named in `supersedes` or `duplicate_of`, else the same
total within 7 days, payee not compared (the bank's name for a store is not the receipt's). `findDuplicate` skips
placeholders. Condition 10: a swap passes only when named + equal totals + paid from the same account, else
`PLACEHOLDER_WAITING:<txn_id>` and `gate.placeholder` on the card. The ingest never dismisses a document that touches
a placeholder; on a swap it voids the placeholder on the placeholder's date, posts, then moves the bank lines
(`writer.feedRetie` - a failure there is logged and never undoes the post). `buildPostedEntries` carries `paid_from`;
`read_ledger` rows end with "paid from ..." when the row says. The bank-line matcher's cards skip the rail
(`placeholders: false`) and carry `feed.amount_cents`.

**The writer.** New action `feedRetie` (`feedRetieRows_`, Code.gs; the write is `feedUpdateRows_`'s). `inboxApprove`
takes `supersedes`: `placeholderSwap_` refuses in plain words BEFORE anything is marked (not a waiting line, another
amount, another payer), then void (own date) -> post -> re-tie; a Save that died after the void is clicked again and
only posts. The web Inbox's approve refuses a card with `gate.placeholder` (409) - it cannot swap.

**The bookkeeper (prompt).** New section "A charge waiting on its receipt": look for the placeholder with
`read_ledger` by date, `supersedes` it, itemize in full, paid from the placeholder's account, the placeholder's house
unless the receipt or Paul's note says otherwise; never `dismiss`, `duplicate_of` or `already_posted_txn_ids`.

**The list (books-reconcile-background.mjs).** `waitingOnReceipts(journal)` - live placeholders, oldest first, with
the count and total - is appended by code to the nightly check's text (the 3 AM email prints it under the bullets);
placeholders are left out of `receipts_without_document`. The poller's `gateText_` has the new reason in the card's
words.

**Found and left, outside this change:** the sheet's and the web Inbox's approve never honoured ANY `supersedes` - a
held card whose read names an entry to replace posts beside it. Only placeholders are handled now; the general case
is a rideshare tip or an amended invoice held for another reason. **The card was checked in a local copy** with
made-up cards (button, bullets, box ticked and unticked, the Save payloads); **not yet tried in the workbook.** 532 tests.

**LIVE 08:35 PDT (Paul: "deploy", run from the session):** writer pushed 08:32 and pulled back (14 files = the repo),
web app **@14** (`clasp deployments` reads @14, `/exec` answers ok 0.4.0); site **`6abbda5b`** (12 functions uploaded,
`/api/meta` answers 401 as it should without a session); both pollers pushed and pulled back = the repo (receipts
`1jKtDx0e...`, properties `1k2htSsu...`). Nothing owed. The first real placeholder and the first swap are the test;
tonight's 2 AM check is the first to run `waitingOnReceipts` (an empty list prints nothing).

## 2026-09-29 (08:41) - a held card that replaces an entry takes it out on Save (D-058)

Paul: *"fix it"* - the gap found under D-057. `inboxApprove` takes out whatever the card says it replaces:
`replacedEntry_` (was `placeholderSwap_`) reads the entry off the Journal - a placeholder keeps D-057's rules (same
amount, same account, void on its own date); an earlier copy is voided today with `superseded by <doc>`, amount and
payer free to differ; an entry that is not in the books is refused ("Untick the yellow box and Save it as its own
purchase"). `feedRetieRows_` with an empty list puts the bank lines back to `unmatched` (the replacement is for
another amount); with the same amount they move. The ingest does the same after its own supersede. The gate returns
`replaces` for a live non-placeholder `supersedes`. The card's yellow box covers both kinds (`swapCandidate_`,
`swapOf_`): "This replaces one already in the books: Uber, 09-12, $25.00 ..." - a card read before today carries only
the entry's id, shown small under the sentence. Only a placeholder's bank line settles who paid; an earlier copy never
hides "Who paid?". The web Inbox's approve answers 409 `REPLACES_AN_ENTRY`. 534 tests.

**LIVE 08:50 PDT (Paul: "deploy, update git, repo and .md, handoff"):** writer pushed 08:41 and pulled back (14 files =
the repo), web app **@15** (`clasp deployments` reads @15, `/exec` answers ok 0.4.0); site **`6abbdd95`** (3 functions
changed; `/api/meta` answers 401 as it should). The pollers did not change. Nothing owed. Not yet run on a real card.
**`HANDOFF-2026-09-29.md` written** - it supersedes the 09-28 one for state. The live Feed tab and the Inbox's cards
were NOT read this session (the saved copy of the Feed tab is still 09-28 17:08 PDT: 52 matched, 19 proposed, 2
unmatched - before D-055), and the handoff says so. ~~Also noted there: the 2,000.00 into Chase on 09-28 did not leave
Citizens that day - ask Paul what it was before the planned 1401 -> 1402 transfer.~~

**RETRACTED 09:00 PDT - my error.** I asked Paul where Chase's 2,000.00 came from. He had already said, and D-051
records it in his words: Ashburne's earnest money, released by Bison Title as a check, which opened the Chase account
(*"i told you already, the $2,000 came from the 104 ashburne closing statement earnest money"*). I had read the
handoff's one line and not the decision. Nothing in the books changed and nothing was posted on the question. The
handoff now marks it SETTLED and says how the reconcile step ties it: Citizens' wire 715,558.65 to the sale cash
717,558.65 and the close's 2,000 entry 1401 -> 1402 together (the entry is the books catching up, not a bank
transfer); Chase's deposit to the entry's other side. The 08:05 entry's "(the earnest money, by the look of it)" was
a guess where the notes had the fact.

## 2026-09-29 (late morning) - the card that paid, read from the bank's daily email (D-059)

Paul has the new Citizens file on his Desktop (79 lines, 6 new, all 09-28; it parses with `parseOfx` to 169,805.35 =
the bank's balance; read only, NOT imported yet). The file names no card: *"there is no way to know what card was
used?"* - the daily email does; *"build it now"*.

Built: `netlify/functions/books-bank-mail.mjs` (`/api/bank-mail`, poller secret, the bank's address only, kept under
`bankmail/<id>`); the poller's `pollBankMail_` (paul@ mode, after the receipts, oldest first, `BANK_MAIL_LAST`, no
label, a failure stops at that message); `lib/bank-mail.mjs` (`parseDailySummary`, `cardsForLines`, `loadSummaries`);
`runFeedMatch` puts the card on each open line before the model sees it (a store that cannot be read is logged and
the run goes on); `lineText` and the prompt's LINES bullet carry it; the envelope's `feed.card` is the one card that
paid every line of the card; `Inbox.html` shows it on the card's top line and starts Waiting on with its holder.

**The reader was written from one picture and 180 characters** - Paul's email of 09-28 and the listing's head of the
09-01 email ("<description> (i) 5450 - PAUL V BJORK <link>", the amount after). `test/helpers/bank-mail-fixture.mjs`
says so. It must be checked against the stored emails as soon as they arrive; until then it is unproven. 542 tests.
Also read off the new file: the 2.65 of 09-28 is Target (the email's "1316 N HIGHWAY 77 WAXA"), the 280.00 Zelle went
to Ludivinia Gutierrez.

**LIVE 09:20 PDT (Paul: "deploy"):** site `6abbe34c` (`/api/bank-mail` answers 401 without the secret - it was 404
for the first seconds after the deploy); writer pushed 09:19 (Inbox.html only, no deploy - the web app stays @15);
both pollers pushed; all three read back = the repo.

**CHECKED AGAINST THE REAL EMAILS 09:35 PDT.** The poller's 09:28 run stored **35** Daily Summary emails
(`bankmail/`, 2026-08-06 .. 09-28). All 35 read as summaries, all 35 add up to the total each email prints. The
layout is the one assumed - nothing in the reader changed. Against Paul's new bank file (79 lines): **46 lines get
a card** - every card purchase on a day that has an email; the 33 without are wires, checks, Zelles and deposits
(no card by nature) and the **nine lines of 09-08, for which no email is stored** (the emails for 09-07 and 09-09
are there; whether the 09-08 one was never sent or is gone from the mailbox is not known). The six new lines of
09-28: Home Depot 162.91, 141.09, 33.07 and Target 2.65 on **Dennis 9301**, CondoCerts 375.00 on **Paul 5450**, the
Zelle 280.00 none. **Dennis's card before 09-28:** Lowe's 130.87 (08-10), Home Depot 90.67 (09-21), 90.23 (09-24),
30.57 (09-25) - all four were open Bank statement cards on 09-28 17:08; every other carded line is Paul's 5450.
**Not done:** a card already in the Inbox does not get its holder (its envelope was made before today) - only cards
made by a matching run from now on. Still unproven: a real matching run with cards, and the Inbox showing one.

## 2026-09-29 (09:55) - the first real import and match with cards; three charges on one card are three placeholders

**Paul imported the new Citizens file:** "6 new lines ... 73 already there, skipped ... it ties" (169,805.35).
**Match statement lines, 09:52 PDT:** 8 looked at, 1 tied, 5 need his word, 2 wait for a sale - no question about
which bank (one bank waiting). Read back from the Feed tab's fresh copy and the three new envelopes:
- tied: the Zelle 280.00 to Ludivinia Gutierrez = `receipt-20260928-9b87b4e1c617-...` (HVAC inspection, 881 Newport);
- **D-059 worked on the first real run** - every new card carries its card: Home Depot x3 and Target "on Dennis's
  card" (9301), CondoCerts "on your card" (5450), in the model's question and in `feed.card`;
- the cards: ONE card for the three Home Depot charges (337.07: 162.91 + 33.07 + 141.09 - "which house is each one
  for, 366 Mesa or 469 Brushwood?"), Target 2.65, CondoCerts 375.00 ("the books already show a 375.00 HOA release
  for 881 Newport dated 09-09 - the same fee, or a second charge?" - 19 days apart, outside the ten the prompt allows);
- the Feed tab: 55 matched, 22 proposed, 2 unmatched (the Ashburne wire and the 550,000). **So the 17 lines that
  were cards on 09-28 are all still cards** - the first live reading of the Inbox's state this session.

**Found before Paul opened the cards, fixed and pushed 09:55 (Inbox.html only, no deploy):** `placeholderEntry_` made
ONE line for the card's whole total, so the three Home Depot charges would have been recorded as one placeholder of
337.07 - and a receipt finds its placeholder by the amount, so none of the three receipts could ever have matched:
each would have posted beside the lump (counted twice). Now `placeholderEntries_` makes one entry per bank line
(`bankLines_` reads them off the card's own text and refuses unless they add up to the card; a refund among the lines
means no button; nothing is ever lumped). Each entry has its own house picker. Run on the three real cards: 3 + 1 + 1
placeholders, the amounts the bank's. The lint builds its cards with `applyVerdicts`, so the card's text is the real
thing. 542 tests. Workbook read back = the repo.

## 2026-09-29 (10:15) - the first real placeholders: Dennis's three Home Depot charges, recorded and tied

Paul opened the Home Depot card of 09-28 (337.07): the top line read "Dennis's card (9301)", the yellow row stood
on Dennis. **Waiting on receipt** made three lines (162.91, 33.07, 141.09); he picked **366 Mesa** for each and
saved: "Recorded $337.07". Read back:
- **Journal (2,667 rows, balanced 4,813,041.61):** three entries, each Dr 1030 / Cr 1401 on 366 Mesa, payee "Home
  Depot Waxahachie", description `NEED RECEIPT FROM DENNIS`, trade `Waiting on receipt`, paid from 1401, no document -
  `receipt-20260928-dfa34034c7f8-ba1d` (162.91), `receipt-20260928-211353bb0281-6dcb` (33.07),
  `receipt-20260928-f5bf62efe496-cf9c` (141.09).
- **Feed (read live, gviz):** the three bank lines are `matched`, each naming the three entries, "Recorded from the
  Inbox". Target 2.65 and CondoCerts 375.00 are still cards.
D-057 and D-059 have now run on real charges, end to end, except the swap (no receipt has come in yet) and the
3 AM list (first at tonight's check). Timings on the card: post 10.7 s, feed 3.8 s, line blocks 3.3 s.
**Paul asked** whether three separate charges should not be separate cards - yes; to build: one card per bank line
for a question (the prompt asks per line; code splits a question whose lines are all money out). Not built yet.
**Known wording slips seen on the card, not fixed:** a question card says "Claude thinks this bank line is a
purchase" (`feedFlags_` sees the blank typed line as an entry), and the total line says "Receipt" on a bank card.
**A slip of mine:** the first live read of the Feed tab used gviz's CSV form, which Chrome treats as a download;
the HTML form is the one to use (`tqx=out:html`).

## 2026-09-29 (10:30) - Paul's cards of the day decided; one charge, one card (D-060); a failed match in plain words

**Paul's three new cards, all read back live (gviz):**
- Home Depot x3 - recorded as three placeholders on 366 Mesa (the 10:15 entry).
- Target 2.65 (Dennis's card) - *"i do not know the house"*: the card stays, as D-057 says. Nothing recorded.
- CondoCerts 375.00 - *"same fee. dismissed"*: the line went back `unmatched` with "Paul: same fee as the 09-09 HOA
  release for 881 Newport"; the next run tied it to `migration-20260909-3663d0ddee0f` ("3 looked at, 1 tied, 0 need
  your word, 2 wait"). **The book entry with no bank line is gone from the reconcile step's list.**
- **Citizens now: 79 lines - 59 tied, 18 cards, 2 waiting on the Ashburne close.**

**A 529 from Anthropic ("Overloaded") ended the first of those two runs** after the SDK's default two retries, and
Paul was shown the raw error. Nothing had been written (the Feed tab read back as before: 58 / 18 / 3).
`matchFailure_` (Menu.gs, pushed 10:22) says it in plain words with the machine's text on a "Paste to Claude" line;
the matcher's client gets `maxRetries: 4` like the nightly check's (site - with the next deploy).

**D-060, one charge, one card** (site, with the next deploy): the prompt's "One charge, one card" paragraph;
`applyVerdicts` splits a question about several money-out lines into a card per line. **Card wording** (Inbox.html):
a bank card's total line says "The bank shows $337.07", not "Receipt"; a question card no longer says "Claude thinks
this bank line is a purchase" (the blank typed line is not a proposal); the match summary says "None need your word."
543 tests.

**LIVE 10:35 PDT (Paul: "deploy then update git, repo, .md and handoff"):** site **`6abbf585`** (one function changed -
the matcher; `/api/bank-mail` and `/api/meta` answer 401 as they should); the workbook's wording pushed 10:28 and
pulled back = the repo. The writer web app stays **@15**: since that deploy only `Inbox.html`, `Menu.gs` and the
poller changed. Nothing owed. **`HANDOFF-2026-09-29.md` rewritten** as the end-of-session state, with the 18 open
cards read live (and the card that paid each), what is proven and what is not, and a prompt for the next session.

## 2026-09-29 (11:00) - why Paul's working money was 4,858.42: the 141.58 he left in from the Sparkling payout (D-055)

Paul, on the card for his check of 08-12 (32,105.26 against the books' payout 32,246.84): *"the missing $141.58 to add
up to my matching $5,000 is the missing $141.58 from this sparkling payout."* Both gaps are 141.58 to the cent. One
entry, `addPaulWorkingMoneyLeftIn()` (oneOffScripts.gs, a copy of `addWorkingCapital`): 08-12, Dr 1401 / Cr 2030
141.58, no house, no interest. The payout entry `sale-20260806-e162353297b7` is untouched (280 Sparkling is closed
and frozen); the bank's check ties to the payout and the new entry together.

**Run by Paul ~10:57 PDT, read back live (gviz):** `manual-20260812-22cd3e4a2bc0`, two lines; Feed row
`202608120000000543525338` `matched` to `sale-20260806-e162353297b7, manual-20260812-22cd3e4a2bc0`; the card
`feed-1401-202608120000000543525338` is `dismissed` (books-docs). Journal 2,673 rows, balanced (4,813,228.64).
Paul's working money is 5,000.00, the same as Dennis's; Recast owes Paul rises by 141.58.
**Citizens now: 79 lines - 62 tied, 15 cards, 2 waiting** (this one, and two more cards Paul saved himself since
10:35 - not read here). The second check to Paul of 08-12 (607.05) is still a card. 543 tests; pushed, no deploy
(a one-off).

## 2026-09-29 (14:55) - two checks read from the bank's pictures: James Broussard 1,500 (C-34), Paul's 607.05

Paul first took the 1,500.00 "Inclearing" of 08-11 for a check paying him back for Bowling Green, then for Bowling
Green and Newport. **The books did not agree** (on 08-11 Recast owed him 704.96 + 206.14 = 911.10 on the two houses),
the bank's file and its daily email name nobody on it, so he was asked for the bank's picture of the check - and sent
both. *"i was wrong. this was paid to someone for siding for the mesa house. the 607 check was the reimbursement."*
A first helper built on his first answer (`addPaulPaidBackBowlingGreen`, 1,500 against Bowling Green) was never run
and is deleted.

- **1,500.00 to James Broussard** (written Aug 10 by Dennis on the Citizens account, memo "Mesa - Materials") is the
  old books' 366 Mesa row "James Haroce, Siding, 08-26, Dennis paid" - Paul: *"yes, the same payment. change the name
  in the file to match the check."* **C-34:** `migration-20260826-eb6baa542688` voided, `manual-20260810-83484ac5a466`
  posted (1020, paid from 1401). Mesa's costs unchanged; Recast owes Dennis 1,500 less. The other two Mesa checks of
  that list (Carlos #1146, Juanito #1147) are Dennis's own check numbers - not looked at here.
- **607.05 to Paul** (written 8/7, cleared 08-12, memo "Bowling Green + Newport"): Recast paying him back, not an
  advance. The check names no split and the old books never recorded it; Claude's call, told to Paul: 881 Newport
  206.14 (all it owed him), 136 Bowling Green 400.91. One entry per house, Dr 2030 / Cr 1401:
  `manual-20260812-d52b66b70320`, `manual-20260812-c821582576ac`.
- **Dennis's 1,500 of 06-01 on Bowling Green (the $7,000 check) is a different payment** and is untouched.

**Run by Paul 14:51 PDT (`addAugustChecks`), read back live (gviz):** Journal rows 2688-2693; both Feed rows
`matched`; both cards `dismissed`. Recast owes Paul: 881 Newport **0.00**, 136 Bowling Green **751.52**. Journal
2,692 rows, balanced (4,817,049.54). **Citizens: 79 lines - 64 tied, 13 cards, 2 waiting.** Also on the Journal
since 11:00, not from this session: two emailed receipts (Harbor Freight 157.94, Home Depot 55.91, both overhead,
Paul paid) and Paul's own Saves of the Mower Depot 3.24 and Floor and Decor 42.21 cards. No placeholder has been
swapped yet. 543 tests; pushed, no deploy (a one-off).

**Rule learned:** a check the bank calls "Inclearing" has no name anywhere in the file or the daily email - ask for
the bank's picture of the check before booking it on anyone's memory. Build the helper after the picture, not before.

## 2026-09-29 (15:20) - the bank account's own tab, "Citizens Bank" (D-061) - pushed; both deploys OWED

Paul asked for a running sheet of the Citizens account - each line, who paid, where it stands, newest on top - to
show Dennis what is reconciled and what is needed from him. **Built:** `lib/bank-sheet.mjs` (`bankSheetRows`,
`bankSheetSummary`; in `lib.gs`), `refreshBankSheets_` (Code.gs; called after the lock in `feedUpdateRows_`, in
`importStatement`, and by the new menu item **Recast Books -> Bank sheet**, `showBankSheet`); the Feed tab gets a
last column `card` (`ensureFeedHeaders_` now adds a missing column on the right end of a tab that has rows);
`feedUpdateRows_` writes it when a row brings one; the matcher (`books-feed-match-background.mjs`) looks up the card
for EVERY line of the account and sends it where the cell is empty - also on a run with no open lines.
`writeReportRows_` takes a tab name. 547 tests (4 new in `test/bank-sheet.test.mjs`).

**Run off to the side on the books' own data** (the real `refreshBankSheets_` text against fakes; the Journal copy,
the Feed copy of this morning, the 35 stored bank emails): 79 lines written, no error; 46 lines get a card (Paul 38,
Dennis 8), 33 none (checks, Zelles, wires, transfers, and 09-08, the day with no email).

**State:** the workbook's project pushed 15:18 and pulled back = the repo - the menu item works now, "Who paid" is
blank until the matcher has run on the new code. **OWED, on Paul's word "deploy": the writer web app (Code.gs and
lib.gs changed) and the site (the matcher).** Until then a matcher run neither writes the card nor rebuilds the tab.
Also read live at 15:10: Paul decided three more cards himself (Deluxe 28.15, check 1021 Juan Garcia 2,500, check
1023 Kopec 100) - **Citizens: 67 tied, 10 cards, 2 waiting.**

## 2026-09-29 (15:35) - the bank sheet is LIVE: writer web app @16, site `6abc3ad9`; who paid filled in

Paul opened the tab from the menu (79 lines, newest on top, read back against the Feed tab: 64 reconciled, 3
placeholders, 10 cards, 2 waiting), asked why the Target 2.65 waited on him (no card on the tab yet), said "deploy".
**Deployed 15:25 PDT:** writer web app **@16**, site **`6abc3ad9`** - both = the repo, nothing owed. His Match run
(2 looked at, 2 wait) wrote the card on **46 of 79 lines (Paul 38, Dennis 8)** and rebuilt the tab, read back live:
**waiting on Dennis 8** (the three placeholders on 366 Mesa, Home Depot 09-21 / 09-24 / 09-25, Target 2.65, Lowe's
130.87 of 08-10), **waiting on Paul 5**, 64 reconciled, 2 waiting for the Ashburne closing.

## 2026-09-29 (15:50) - 2026-09-30 (09:40) - who paid on the Inbox's bank cards; "Waiting for closing : <house>"; writer @17

Paul, on the Inbox's Bank statement tab: *"put '- Paul' or '- Dennis' or '- Unknown' after each item"* - `feedCardsOnto_`
(Menu.gs) puts the Feed tab's card column onto every bank card made before D-059 knew it (one name for all of the
card's lines, or none); `Inbox.html` ends a bank card's name with " - <holder>" or " - Unknown". The Lowe's 130.87 of
08-10 is Dennis's (his 9301 in the bank's email) - the tab already said so; the Inbox now does too.
Then, on the Citizens Bank tab: *"when it's waiting for closing put the property in the description"* -
`bankSheetRows` finds the house the note names (longest name first) and writes **"Waiting for closing : 104
Ashburne"**, the House column too; `bankSheetSummary` counts by prefix. 547 tests. Pushed 15:47 (the menus had it);
the deploy waited on `clasp login` (expired overnight, Paul's step, 09-30 09:38). **Writer web app @17, 09-30 09:40 -
= the repo; site `6abc3ad9` unchanged. Nothing owed.**

## 2026-09-30 (10:10) - Cost Recapture is a plain list (D-062); writer deploy owed

`lib/cost-list.mjs` (`costListRows`), a **List** template in `setupPropertyTab` / `refreshLineBlocks_`
(`writeCostList_`), `makeCostRecaptureAList()` (one-off, run by Paul ~10:10): the tab read back as 10 rows, newest on
top - Paul is owed on three lines (20.00, 30.00, 20.54, 15.71 less the 161.17 correction), five paid from the Recast
account, nothing paid back yet. 549 tests. Pushed 10:04. **OWED: the writer web app deploy (Code.gs / lib.gs changed;
@17 still serves the pollers and the web Inbox - a post through them rebuilds Cost Recapture in the OLD grid until then).**

## 2026-09-30 (10:05-11:35) - the Totals tab: every cell was #N/A; rebuilt, reordered, in Paul's colors

Paul: *"look at the totals tab. all of the values are errors."* Every SUMPRODUCT read "Array arguments to MULTIPLY are
of different size": the formulas were written with a 5,000-row bound, and Sheets had moved each plain reference by
itself as Journal rows were deleted at the cutover and added since (E2:E6807 against H2:H7164). Whole columns did not
do either - the helper is on Totals, the Journal has more rows. **Now:** every range is `INDIRECT` text over a fixed
bound (N = 20,000; both tabs given that many rows; a note in F2 if the Journal ever passes it), **SUMIFS** instead
of SUMPRODUCT (the SUMPRODUCT build over 20,000 rows timed out the Spreadsheets service mid-write), the helper column
named by R1C1 through COLUMN($H$1) so the spacer column's insert moves it too. The property tabs still use the
plain 5,000-row bound: they were rebuilt after the cutover and rows are never deleted now - left alone.
Then Paul's layout: no spare rows (every list exactly as long as its source; `addProperty` runs setupTotals so a new
house makes its own room; a new account needs setupTotals by hand), sections in his order - Key balances, Overhead
by account + TOTAL OVERHEAD, Overhead, Trial balance + TOTAL, Cost by property - his colors (header #a3f67f, its
total cells #ceffbc; TOTAL row #ffe599, its total cells #fff2cc), labels right over the numbers, "Totals as of" in
B1, a spacer column A like the property tabs (removed and re-inserted on each build), "D-010" off the tab. Six
editor runs by Paul; read back each time: trial balance 4,482,724.04 both sides, net 0.00; Citizens 4,368.02 (the
bank's 169,805.35 less the unbooked Ashburne wires 165,558.65 and 5 open cards 344.99 leaves 223.67 unexplained -
HD 08-14 x3 125.57 is part of it; the reconcile step's job); Chase 0 until Ashburne closes (D-051). "Trial balance"
stays as the name - Paul asked what it was, not to rename it. 549 tests. **Deployed 11:35: writer web app @18 = the repo;
site `6abc3ad9` unchanged. Nothing owed.**

## 2026-09-30 (afternoon) - 413 Green Acres and 200 Janice bought: purchase principal recorded, at 9%

Paul recorded both purchases through **Add advance... -> Purchase principal**: 413 Green Acres 127,000.00 on 2026-08-05
(`manual-20260805-55f2be9e8083`), 200 Janice 267,474.01 on 2026-07-07 (`manual-20260707-6fd33b85123a`); Dr 1000 /
Cr 2010, Advances rows kind purchase, paid_to Seller. The blank rate box gave 8% (the Settings rate, D-016); Paul:
*"change to 9"* - the hedge he keeps on held houses (D-038). He typed 9 in both rows' rate_pct; read back live.
No interest was posted on either, so nothing to correct - the tabs read the rate from the Advances tab. Dennis's
note (2010) rose 394,474.01 to 1,982,260.38.
Explained to Paul: Totals' "Accrued interest - Dennis" is posted-but-unpaid interest and reads 0 because nothing has
been posted since the two sales paid theirs; `Post interest...` records what is owed on the held houses.
**Open, Paul's step (told to him):** the Properties rows - Green Acres still reads "PIPELINE - not purchased" with no
purchase date, price or tax_annual; Janice's 267,474.01 sits in `contract_price` (the SALE price estimate the house tab
uses - its tab thinks it sells for what it cost) and its `purchase_price` is blank; Janice's tax_annual 814 looks low for
a full year. Then Rebuild property tab on both (a typed Sale Price cell survives a rebuild - check Janice's).

## 2026-09-30 (13:00-13:55) - the Properties row fills itself from a purchase; Properties cells by header; notes column gone; writer @19

Paul: *"why is the info not showing up properly in the properties tab for janice and green acres?"* Two causes: **Add
advance never wrote the Properties row** (only the Journal and Advances), and **Janice's purchase 267,474.01 was typed
into "Contract price"** on the Add property form - which is the SALE price estimate the house tab uses, so her tab sold
the house for what it cost. Fixed at the root: a purchase through Add advance now fills the row's purchase date and
price where blank and sets dennis_funded (`purchaseOntoProperty_`, Menu.gs); the form's box says **"Expected sale
price"**. Then *"just remove the notes column"* (it held the migration's "Phase 4 migration" labels and a PIPELINE note):
gone from the schema, the form and the tab. **Found before it bit:** the house tabs read contract_price, tax_annual,
dennis_share_pct and dennis_commission_pct by VLOOKUP column COUNT (11-14), so deleting notes (column 10) would have
shifted every one - the tax would have read Dennis's 50. Every Properties lookup is now by header (`propLookup_`: INDEX
+ MATCH on row 1); a lint fails on any VLOOKUP into Properties. `fixGreenAcresJanicePurchase()` (run by Paul ~13:40):
notes column deleted first, both rows filled, Janice's contract_price and her tab's kept Sale Price cleared (only where
equal to what she cost), every held tab rebuilt. Read back: Green Acres 08-05 / 127,000 / dennis funded; Janice 07-07 /
267,474.01 / sale price blank; Janice's tab "Property Tax (prorated, $814/yr)"; Newport's "$7,942/yr" (the lookup
right after the column moved). **Paul's, open:** Green Acres' tax_annual (blank); check Janice's 814 (low for a full
year). Also explained: Cost Recapture sits on Properties because the posting rules only accept a listed name (D-031) -
left there, Paul agreed by not asking to move it. 549 tests. **Deployed 13:52: writer web app @19 = the repo; site
`6abc3ad9` unchanged. Nothing owed.**

## 2026-09-30 (14:00-16:30) - the bank-vs-books box on the Citizens Bank tab (D-063); the 223.67 found and fixed; writer @20

**The 3 AM list proven:** the 2 AM check of 09-30 (`reconcile/2026-09-30` in books-cache, ran 07:33Z) listed Dennis's
three Home Depot placeholders of 09-28 (162.91, 33.07, 141.09, 366 Mesa, 337.07) - the digest prints it first. Its one
other bullet: leave the two June migration-era errors (gm-19edc17308bcd897, gm-19f1a71858c0d365) for Phase 3.

**Citizens read live (gviz):** 79 lines - 69 reconciled, 8 waiting on Dennis (the three placeholders + 130.87 Lowe's
08-10, 90.67 / 90.23 / 30.57 Home Depot 09-21/24/25 for 469 Brushwood, 2.65 Target 09-28), 0 on Paul, 2 waiting for the
Ashburne closing. The books-cache `tab/Feed` was ~22 h stale (five cards decided since) - read the Feed live.

**D-063, built instead of section 4's menu item** (Paul: no new steps to remember): `bankCheck` / `bankCheckRows`
(`lib/bank-sheet.mjs`) put a box above the tab's lines - bank, reasons, red unexplained lines, books;
`writeReportRows_` takes `top` rows between the title and the header. Test: bank + reasons + unexplained = books to
the cent. **The 223.67, found by the box, both from the receipts:** (1) 98.12 - Home Depot 55.71 (Liquid Nails, Goo
Gone, Paint) and Floor & Decor 42.41, 09-03, 469 Brushwood, were in the books TWICE: the old rows and the bank cards
Paul approved 09-29 (55.87, 42.21, the bank's amounts, card 5450) - the old rows voided. (2) 125.57 - Home Depot 08-14,
366 Mesa (Screws 11.88, Door Lock Sets 69.61, Siding Trim 44.08): the old books said Citizens, both receipts' tender
line is 9166, Paul's own card - voided and re-posted paid by Paul (Recast owes Paul 125.57 more). `fixCitizensGap()`,
run by Paul ~16:16 CT: the box reads **"they agree"** - bank 169,805.35, +344.99 open cards, -165,558.65 Ashburne
closing, 0.02 rounding, books **4,591.71**. A label starting "=" read as a formula (#ERROR) - reworded. **Blind spot
carried from 09-26, seen again:** approving a bank card can replay a purchase the old books already hold under
different cents - the box now catches it as a books line with no bank line. 550 tests. **Deployed 16:30: writer web
app @20 = the repo; site unchanged (`6abc3ad9`, it does not bundle bank-sheet). Nothing owed.**

## 2026-09-30 (16:30-17:15 CT) - the Balance Sheet tab (D-065); Claude credits are a software cost (D-064); writer @21, site `6abd881d`

**Evaluated the Reports -> Balance sheet**: run fresh it ties (owns 1,999,119.18 = owes + left) but (1) Dennis's
interest on the held houses is not in the books at all (only the two sold houses ever had interest posted), (2)
Ashburne still reads as owned until its close, (3) 1520 Prepaid API credits 1,081.45 was never drawn down, (4) Cost
Recapture was labelled "Property inventory", (5) the words were accounting words. Then Paul opened the tab itself: it
was the **Phase 1 test snapshot of ~09-11** - a report tab only changes when someone runs it.

**D-065, the `Balance Sheet` tab:** `balanceSheetTab` (`lib/reports.mjs`) relabels `balanceSheet()` in plain words and
adds Dennis's interest built up on each open advance less what is posted against it (`accruedThrough`, 1200 lines "...
on <advance_id>") to the house and to what Recast owes; zero lines left off. `refreshBalanceSheet_` (Code.gs) writes it
and deletes the old "Report - Balance sheet"; `refreshBalanceSheetHourly` runs every hour (`installTriggers`, run by
Paul 14:42 PDT: "Balance Sheet timer installed; the tab is built"). The menu's Balance sheet item is gone; the D-056 lint
lists the timer handler as an entry point. Read back live, 16:42 CT: owns 2,075,430.87 = owes 2,103,224.61 + left
-27,793.74; Dennis's unrecorded interest 76,311.69 (Ashburne 46,156.16 - it stops when Ashburne closes).

**What Recast owes Paul, explained to him by house:** 44,652.54 (overhead 28,364.80, Ashburne 10,146.27, working money
5,000, Bowling Green 751.52, Brushwood 300, Mesa 164.87, Cost Recapture -74.92). The -74.92 is not a payment to him: the
TXU 161.17 of 06-16 was on both the Granite and the Sparkling tab in the old books and the migration took one copy back
on Cost Recapture (Sparkling is frozen). The "paid back" column Claude first showed counted voids and correction
reversals as paybacks - only the net per house is right.

**D-064, Claude credits:** D-018's monthly job had never run (built 09-14, it ran on the 2nd for the previous month
only - first turn would have been 10-02, and May-August never). Paul dropped the split: the prompt posts a top-up to
6400 Software & subscriptions; `books-api-costs.mjs`, its test, the web Settings card and the poller's
`postApiCosts_` are deleted (both pollers pushed); `moveApiCreditsToSoftware()` (run by Paul 14:50 PDT) moved 1520's
1,081.45 to 6400 by month - 05 90.00, 06 100.00, 07 100.00, 08 322.67, 09 468.78, Journal rows 2736-2745. Read back:
the credits line gone, owns 2,074,349.42, business costs 28,875.19, adds up. 543 tests (the eight api-costs tests went
with the job). **Deployed 17:10 CT on Paul's "deploy": site `6abd881d` (`/api/api-costs` 404, the card gone from
app.js), writer web app @21 = the repo. Nothing owed.**

## 2026-09-30 (17:15-17:35 CT) - the Balance Sheet tab becomes the P&L tab (D-065 amended); writer @22

Paul asked whether the P&L was "basically the balance sheet" - explained: the P&L is a stretch of time (earned), the
balance sheet one moment (owns and owes), and the P&L's all-time total is inside the balance sheet's "left". Then:
*"change the name of the tab to P&L and put the P&L section at the top. remove any duplicate numbers and streamline
this as much as you can."* `pnlTab` (`lib/reports.mjs`) replaces `balanceSheetTab`, reusing `profitAndLoss` and
`balanceSheet`: PROFIT AND LOSS - 2026 SO FAR (Granite 54,589.28 sold 07-24, Sparkling 30,465.04 sold 08-06, business
costs -28,875.19, Recast earned 56,179.13), WHAT RECAST OWNS TODAY (houses still held (8) 2,068,467.59 as one line, costs
after a sale 1,290.12, Citizens 4,591.71), WHAT RECAST OWES TODAY (Dennis lent 1,982,260.38, his interest not recorded yet
76,311.69, Paul 44,652.54), LEFT FOR THE OWNERS (paid out to Paul -85,054.32, Left -28,875.19). 27 lines -> 19: the
per-house lines and their interest notes, "Profit on the houses sold" (= the payout) and the "Adds up" line (now in the
date line) went. All the books' activity is in 2026, so one column; "Earned before <year>" appears when it is not. The
tab is `P&L` (`refreshPnl_`, Code.gs; the hourly handler keeps its name `refreshBalanceSheetHourly` so the trigger Paul
installed still runs it); every run deletes `Balance Sheet`, `Report - Balance sheet` and `Report - P&L`; the menu's
P&L report is removed. The Left note wraps (it ran off the sheet) and says why Left equals the business costs - explained
to Paul: all the house profit went to him and none was kept to cover them; what he came out ahead is 56,179.13. Read
back live 17:26 CT: adds up. 543 tests. **Deployed 17:30 CT on Paul's "deploy": writer web app @22 = the repo; the site
needs nothing (no function bundles `lib/reports.mjs`), `6abd881d`. Nothing owed.**

## 2026-09-30 (17:40-18:15 CT) - the menu trimmed to what Paul uses; oneOffScripts.gs emptied (D-066); writer @23

Paul, one ask at a time. **Reports submenu removed** - Trial balance, Job cost, Dennis ledger, with `promptDate_` and
`promptProperty_` that only they used; `refreshPnl_` now also deletes their "Report - " tabs every hour. **Post
interest and Self test off the menu** - `Interest.html`, `showInterestDialog`, `previewInterest` and
`runSelfTestFromMenu` deleted; `selfTest` stays in Code.gs (now a lint entry point, a standing setup tool); explained to
Paul first: the house tabs and the P&L tab work Dennis's interest out and the sell wizard records it at closing, so
monthly posting is not needed - the open question from D-065 is settled (D-066). **Sell property** moved under Add
advance. **oneOffScripts.gs emptied** on *"remove all scripts in the oneOffScripts.gs"*: 42 scripts (the 39 in the file
plus `postInterest`, `buildInterestEntry_`, `advancesDueFor_` moved there an hour earlier), every one already run -
all in commit **774ecd3**. The file keeps its header: the rule, how to add one, and that a script comes out once it
has run. Three may come back from git: `postInterest` (year-end), `rebuildAllFrozenRecords` (280 Sparkling's Sale
Price, parked by Paul), `resetFeedCards` (matcher tuning). Tests 543 -> 539: four tested only removed scripts
(the replay sweep x2, `reprocessParked_`, `replayErroredReceipts`); three were trimmed to their live-file checks (the
frozen record's `setupPropertyTab` as-of, `ADVANCE_PAID_TO` and the Advance dialog, the feed tie). **Deployed 18:10 CT
on Paul's "deploy": writer web app @23 = the repo; the site unchanged (`6abd881d`). Nothing owed.**

## 2026-09-30 (17:45-18:20 CT) - docs drift fixed; the 3 AM email and the sheet's Inbox stop pointing at the web app

A read of all 44 `.md` files (a workflow: eight readers, one checker against the newest docs) found the docs behind
the live state. Fixed where a session could act on it wrongly (`5ada3cf`, `947d795`):
- `README.md` named the OLD workbook `1isEbfNK…` as "The live workbook" - now the production "Recast Books"
  `12QVyxm3…`, the old one listed as closed, never to be touched.
- `apps-script/writer/README.md` still gave the first-time setup (New deployment, copy the new `/exec` into
  `WRITER_URL`) - on the live project that would strand both pollers and the Inbox on the old URL. Now: the live ids,
  push, then `clasp deploy -i` the same id when `Code.gs` or `lib.gs` changed, never New deployment.
- `CLAUDE.md`: the status line (stuck at 09-16), "front door = web app", the monthly interest job in a
  `books-dennis.mjs` that does not exist (interest is recorded at closing, D-066), a "1099 block" the code does not
  have (marked planned), C-1…C-34, `paul_personal_last4` = `9166, 8870, 3746`, 1401's endings, `MAX_TOKENS_PER_TURN`
  16000, the Phase 3 spec already amended.
- `BUILD-PLAN.md`: status, the per-advance rate (D-022, D-038: 8% closed deals, 9% held, 12% Ashburne) recorded at
  closing, what Recast owes Paul repaid in one payment after reconciliation (D-051, D-052), no Plaid, Held/Sold.
- `data/vendors-1099-2026.md`: a stale-totals warning - Atlas 18,595.17 over 17 payments (audit §26), Vega missing
  (C-26), "Effren" is Falcon Creek Lawn Care, Dennis-direct payments uncounted; re-derive from the Journal before any
  W-9 request or filing. `docs/policies.md`: the payment-side 1099 block marked not built.
- The root router (`../CLAUDE.md`, not a repo): parallel run, web-app pages and "9% compounding" corrected.
Dated history (older specs, handoffs, the audit's retracted claims) left as written.

**Rule 8 in the code (`947d795`, `7b01718`):** the 3 AM email's last line was `Review:
https://books.recast-properties.com/#inbox` - now "open the Recast Books workbook, then Recast Books -> Inbox..." and
the workbook link (poller `dailyDigest`; pushed to both instances, read back by `clasp pull`). The sheet's Inbox had a
footer link "Posted, dismissed and errored items: web Inbox" - removed with the `site` field only it used
(`Inbox.html`, `inboxPickers` in Menu.gs); pushed, read back. No deploy: `Code.gs`/`lib.gs` untouched. 539 tests.
Writer web app @23, site `6abd881d`, nothing owed.

## 2026-10-01 - the migration closed (D-067): one final register, every leftover settled

Paul (09-30): *"THIS IS IT. LAST TIME. bring all outliers to the table now."* Two sweeps (seven finders + a critic, then
seven gap hunters; every finding refuted-or-confirmed by a skeptic, merged, recounted against the live Journal) ->
**45 items, `docs/migration-leftovers-final.md`** (43 + the three last checks: Anthropic 30.27 on no book, the 09-02
Home Depot microwave already on, three Ashburne doubles 1,097.15). Paul answered in one message (D-067).
Run by Paul from the editor, every read-back OK:
- **Look-only reads** (poller `replayIds` learned `dryRun` lists; it refuses two lists of one name): 84 paul@ emails
  read, nothing posted; three pictures too large to read - Paul: ignore them.
- **fixNewportBeforeClosing:** HOA certificate 375.00 to 1340 (the Accounts row was missing - added); the 607.05 check
  re-split 44.39 Newport / 562.66 Bowling Green as the old Newport tab had it; the 07-01 appliance 639.82 on Newport.
- **fixAshburneBeforeClosing:** 11 voids, 20 posts - doubles out, seven return slips and five online refunds credited,
  Juan Garcia's 21,000 to labor, Berrett and HILCO re-lined, the toner at 111.48, the Wayfair 03-25 order 324.69 on.
- **voidAshburneLateDoubles:** HD 04-16 51.38, Sunstate 904.18, Atmos March 141.59 out.
- **relinkMigrationReceipts:** 166 lines given their own receipt, 8 wrong links cleared, the Chinos note corrected.
- **reprocessStoreReceipts:** the 29 store receipts with items left off are Inbox cards for Paul.
- **fixOverheadAndTheRest + fixOverheadLeftovers:** the overhead doubles out (sawhorse, Granite sprinkler copies,
  software forwards, four Uber rides), the speeding ticket labelled non-deductible, the roto hammer at 105.81, Cotality
  June 200 on Paul's word and the 06-30 row to 6300, the Sparkling July water 187.50 off what Recast owes Paul, the AA
  upgrade 203.00 and the 06-14 ticket 476.40 refunded, Acuity 69.00, Twilio, county records, Airtable, Anthropic 20.00
  and 10.27; the STAGING Drive folder renamed "Old books receipts (migrated 2026-09-21) - do not delete" inside
  "Recast Books"; Granite's closing statement on its sale entries.
- **Paul's pvb421 forward** (19): Dallas trip x3, Adobe x10, Microsoft x3 (all posted by the bookkeeper), the Affirm
  interest 112.23 on Ashburne (posted), two Green Acres pictures (held for Paul).
- **linkPhonePhotos + addPhotoCosts:** six pictures linked; 1,061.77 of costs Paul paid (Granite and Sparkling items on
  Cost Recapture, Ashburne, Newport, tools, office, gas, tolls on 6610, meals with their purpose) and the Janice
  eviction fee 144.00 Dennis paid. The read-back's CHECK of 44.48 was the bookkeeper posting an Adobe and a Microsoft
  forward during the run - verified on the Journal.
Claude: PENDING ROUTING refused in `lib/posting.mjs` (+ test, 540); the nightly check sends migration-era errors to
Claude; the Keith Ace 06-30 envelope marked dismissed (on the books as three Ace rows); the W-9 list rebuilt from the
Journal (`data/vendors-1099-2026.md`, ten payees over $2,000); accountant note Q-10 (the Ashburne tax penalty 1,029.52,
the ticket). Recast owes Paul 43,529.66 at 11:22 PDT (41,980.79 after the money fixes, then the photo costs and the
bookkeeper's posts from the forwards). **Deployed 10-01 on Paul's "deploy": site `6abea6fd`, writer web app @24 (pinged ok) - nothing owed.** The Journal
then: 1,421 entries, 59 corrections (31 of them this day), 36 of the 1,048 migrated entries ever corrected.

## 2026-10-01 (13:10 PDT) - the closing tab reads the way the money arrived; 280 Sparkling's tab rewritten

Paul, on "280 Sparkling - Closing": *"we should have received the full $4,716.82 reimbursement at closing. it looks
like we only got half. this sheet is a bit confusing to me overall"*. Checked first: he did get it - Citizens shows
two Bison wires on 08-07, 259,053.12 and 4,716.82, = the tab's Cash received 263,769.94. Paul confirmed the deal: the
4,716.82 comes off the top before the split ("we paid all of the rehab costs"), which is what the title company did -
so the books are right and Sam H owes nothing. No entry changed; the tab's layout did. Three fixes, as he asked:

1. **The settlement block shows the two payments.** A line paid to Recast by name used to show as the net credit
   (2,358.41 - the payment less Recast's own half of the charge), which read as half a payment. Now the charge shows
   among the lines at Recast's share like every other line, then `Your half of the sale money` (the first wire),
   then the payment in full (the second wire), then Cash received. A `Rounding` row appears when the lines at the
   share miss by a cent, so the block always adds up. `lib/sale.mjs` `settlementRows`.
2. **The cost list adds up to its total.** `sellCostByClass_` counted the release entry's credits only; a rehab
   account the closing reimbursed past zero (Sparkling's 1030, -1,559.94) is released with a debit and was left off,
   so the rows came to 246,094.90 under a total of 244,534.96. Now net of both sides, with Rehab at what was spent
   (1,398.47) and `Less: the co-owner's half of the reimbursement` (2,358.41) under it. `lib/sale.mjs`
   `releasedCostRows`; Menu.gs's `sellCostByClass_` only supplies the chart's names.
3. **The forecast block.** The tab had been written while the frozen house tab's Sale Price was blank (a "loss" of
   202,841.02). The house tab has 275,000.00 now, so the rewrite reads 50,171.98 forecast against 60,930.09 actual; and
   a tab with no sale price now says so instead of printing costs as a loss.

Also: a closing tab keeps its statement lines with the sheet (developer metadata, `storedStatementLines_`), so a later
rebuild from the dialog (a late document, a holdback) keeps them when they still add up to the posted entry - the
Journal holds one line per account, not per statement line; and a rebuild reads Recast's share off the entry's memo
(`Properties` never had a share column, so a rebuilt co-owned tab would have said 100%).

`rebuildSparklingClosingTab()` (oneOffScripts.gs) run from the editor 13:08 PDT and read back on the live tab: the
lines come to 259,053.12, + 4,716.82 = 263,769.94; the cost rows add to 244,534.96; profit 60,930.09 and both payouts
unchanged. 544 tests (4 new: both lists add up for Sparkling and Granite). Pushed; **writer web app deploy owed**
(Code.gs and lib.gs changed; only the Sell dialog reaches this code, which runs the pushed version). Not committed.

**13:13 PDT, same change:** on the live tab the reimbursement's charge row was cut off at the column edge ("Expense
Reimbursement to RECAST PROPERTIES LL (2,358.41)" - the old confusion again). The explanation now leads the label
(`Your half of the charge: ...`) and the label column is 520 wide. Pushed, the tab regenerated and looked at in the
workbook. Deploy still owed; not committed.

**13:20 PDT, same change:** the cost list's single net row, "Less: the co-owner's half of the reimbursement (2,358.41)",
and Claude's explanation of it ("the other half was Sam H's money") were wrong for Paul: *"WE PAID THE ENTIRE 4,716.82.
SAM DIDNT PAY A PENNY. we were reimbursed as a separate wire for the full amount."* All true - Recast paid the bills,
Sam H paid nothing out of pocket, the wire was the full amount. The list now shows what the documents show:
`Less: reimbursement paid to Recast, in full` (4,716.82) and under it `Your half of the charge for it, taken out of
the sale money (same as above)` 2,358.41 - the settlement block's own two figures; same total. `releasedCostRows` takes
the tab's statement lines for the full figure; a test refuses the word "co-owner" in any row. Pushed, the tab
regenerated (61 rows) and read back. Open with Paul: taking Dennis's half out of the cost list (total cost, profit,
Dennis's half, your half). Deploy owed; not committed.

**13:25 PDT - a trial tab, `280 Sparkling - Closing (simple)`.** Paul: *"can you create a new tab so we can perserve
the current one? and try one that is simpler"*. `buildSparklingSimpleClosingTab()` (oneOffScripts.gs, run from the
editor) wrote it beside the closing tab, which is untouched. The cash view, 36 rows, no account numbers: MONEY IN (the
two wires, 263,769.94), WHAT THE HOUSE COST before closing (purchase, fixing up, HOA release, utilities, HOA dues,
interest to Dennis, listing = 202,839.85 - each account's balance before the sale entries), PROFIT 60,930.09 and its
two halves, WHO WAS PAID (Dennis 231,523.10, Paul 32,246.84, total = the cash), and the bills after the sale (live).
The title company's own charges are not listed - they came out before the first wire; the 2,358.41 does not appear at
all. The script refuses to write unless cash less cost is the books' profit. Read back on the live tab. Waiting on
Paul: keep it (then it becomes the closing tab's layout for every house) or drop it.

**13:31 PDT, the trial tab:** its "HOA dues 220.00" row was Claude's wrong label - Paul: *"HOA dues were part of the
closing costs no?"* Yes: the HOA dues are among the title company's charges. The 220.00 is three Falcon Creek lawn
bills Paul paid (55.00 07-07, 110.00 07-19, 55.00 08-05; the chart's 1130 is HOA and grounds). Relabelled `Lawn
care`, re-run, read back. A layout for every house must name that row from its lines, not from the account.

**13:38 PDT, the trial tab - PROJECT COSTS in Paul's rows and names.** Paul gave the structure: *"Rename it to 'Project
Costs'. I added cash advances. Sparkling does not have any, but other properties will."* - Purchase Principal, Purchase
Interest, Cash Advances Principal, Cash Advances Interest, Rehab Costs, Utilities; *"Rehab Costs should roll up Lawn
Care, HOA Release (if it's not in the title costs) and Listing and Marketing."* Built, re-run, read back: 196,850.50 /
2,809.57 / 0.00 / 0.00 / 2,402.47 (= 1,398.47 + 220.00 + 485.00 + 299.00, the old tab's rehab figure to the cent) /
777.31 = Total Project Costs 202,839.85; profit and payouts unchanged. **Open with Paul before any house with cash
advances uses this layout (Granite 6,838, Newport 2,000, Ashburne, Mesa, Bowling Green):** the advance money paid Paul
back for bills already in Rehab Costs, so a Cash Advances Principal row added beside the full Rehab Costs counts that
money twice - the script refuses such a house. Also open for the general layout: where property tax or insurance paid
before closing goes (Sparkling has none).

**13:45 PDT, the trial tab - Paul's own wording.** He typed on the tab itself and sent a picture: *"change the profit
section to match this"* - `Total Profit`, `Dennis 50%`, `Paul 50%` (the percentages from `Properties.dennis_share_pct`).
Read back before touching anything: he had also renamed `WHO WAS PAID FROM THE CASH` to `PAYOUTS`. Both are in
`buildSparklingSimpleClosingTab` now, so a rebuild keeps them. Not re-run - the live tab already reads this way from his
own edits, and a re-run would overwrite anything else he is typing. **Read the live tab before every re-run of this
script: Paul edits it by hand.**

**13:43 PDT, the trial tab:** `MONEY IN AT CLOSING` is `INCOMING CASH AT CLOSING` (Paul's wording). The live tab was
read first (it matched the script apart from this heading), then re-run and read back.

**13:58 PDT, the trial tab - PAYOUTS in Paul's layout.** He typed the layout on the tab and sent a picture (*"make this
section match this layout and styling"*): a green `Dennis` row, Purchase Principal / Purchase Interest / Cash Advances
Principal / Cash Advances Interest / Paid out of pocket / Half of profit, green `Total to Dennis`; green `Paul`, Paid out
of pocket / Half of profit, green `Total to Paul`; green `Refunded to Recast Citizens Account`; green `Total paid out`
with `Matches the cash received at closing`. In the script now, re-run and read back (43 rows). One figure differs
from his mock on purpose: Dennis's `Paid out of pocket` is **1,397.98** (the bills he paid directly), not 0.00 - with
0.00 his rows came to 230,125.12 under a total of 231,523.10. The script refuses to write if either partner's rows do
not add up to his total.

**14:02 PDT, the trial tab:** the notes column is bold, black and starts with a capital letter (Paul: the "Sold for
550,000.00..." line, "After the title company took out...", "Cash received less...", "Matches the cash received at
closing", "Not part of the numbers above..."). Live tab read first (he had capitalised one himself), re-run, seen in
the workbook.

**14:03 PDT, the trial tab:** the link reads `Title company closing document` (was "the title company document"),
Paul's wording. Re-run, seen in the workbook. The full closing tab's link is unchanged.

**14:05 PDT, the trial tab:** the top note reads `Sold for 550,000.00. Recast owned 50%.` (was "owned half of it"),
Paul's wording - the percentage is the sale's own share. Re-run, seen in the workbook.

**14:10 PDT - committed and pushed to GitHub** on Paul's "commit. update git, repo and .md": CLAUDE.md, this file,
`HANDOFF-2026-10-01.md` (an afternoon section with the next steps), `docs/phase5-spec.md` section 3a (the simple
layout) and the router `../CLAUDE.md` brought up to date. The live Apps Script project = the repo (last push 14:10).
Still owed: the writer web app deploy; Paul's answer on Cash Advances Principal.

**14:20 PDT - D-068: a cash advance is its own cost, never part of Rehab Costs.** Paul's answer to the open question:
*"cash advances shoudl never be added to rehab costs. they are their own costs."* In the trial tab's script, Rehab Costs
is now the bills less the cash advances' principal, and the refusal for a house with advances is gone; the total is
unchanged. 280 Sparkling has no advances, so its tab reads the same and was not re-run. Checked on 881 Newport's live
balances: bills other than utilities 3,842.64 less the 2,000.00 advance = Rehab Costs 1,842.64. `docs/decisions.md`
D-068, phase5-spec 3a, CLAUDE.md, the handoff and the router updated. Pushed and committed.

## 2026-10-01 (14:30 PDT) - Paul's simple layout is the closing tab of every partner deal (D-069)

Asked whether the layout he had shaped on the trial tab is what every house gets at closing, Paul: *"yes. with the
exception of ashburne"*.

- **`lib/sale.mjs`:** `costBeforeClosing(intents)` (what each cost account held before the sale entries) and
  `closingRows({summary, intents, lines, dennisPct, holdback})` - every row of the tab in his sections, names and
  order, D-068 included; it never throws (a tab is written after the sale has posted) - a figure that does not tie says
  so in its note. Two tests: Sparkling row for row, Granite for the cash advances (Rehab Costs 3,889.97 = the old tab's
  10,727.97 less 6,838.00) and the escrow, held and released.
- **`Code.gs`:** `writeClosingTab_` hands every deal that is not a bank deal to `writeSimpleClosingTab_`; the long
  layout stays for 104 Ashburne. `keepStatementLines_` is shared.
- **`Menu.gs` `closingFromJournal_`:** returns the entries and the escrow released since the closing; reads Dennis's
  money back and the part of his share paid at closing off their own two lines (it subtracted the WHOLE share, so
  Granite read 257,305.63 for 287,305.63); what Paul has not drawn no longer counts escrow already paid to him.
- **A regression made and fixed in the same half hour:** the first run of the shared code on the trial tab wrote one
  cash row of 263,769.94 - the two wires were gone. Paul had deleted the long `280 Sparkling - Closing` tab, and the
  statement lines (the reimbursement in full, the wires' wording) were stored on it. `rebuildClosedClosingTabs()`
  renamed the trial tab `280 Sparkling - Closing`, rewrote it with the eleven lines, and rewrote `1616 Granite -
  Closing`. **Never delete a closing tab to rebuild it.**
- **Read back on the live sheet, 14:21 PDT.** Sparkling: 259,053.12 + 4,716.82 = 263,769.94; costs 202,839.85; profit
  60,930.09; Dennis 231,523.10, Paul 32,246.84. Granite: cash 347,343.03 + 60,000.00 held; costs 298,164.47 (purchase
  279,001.00, interest 6,874.44 + 84.16, cash advances 6,838.00, Rehab Costs 3,889.97, utilities 1,476.90); profit
  109,178.56; Dennis 318,853.51, Paul 28,489.52 = the cash; the escrow released 2026-09-11, 30,000.00 each. Granite's
  interest total is Dennis's agreed 6,958.60; the adjustment sits in Purchase Interest, so the split differs from the
  old tab's 6,873.90 / 84.70 by 0.54.

546 tests. Pushed and committed. Owed: the writer web app deploy. Next: 881 Newport's closing, 10-02.

**14:24 PDT - deployed on Paul's "deploy": writer web app @25** (`clasp deploy -i` the same id; `clasp deployments`
reads @25, `/exec` answers ok 0.4.0) = the repo. The site was not redeployed: no function loads `lib/sale.mjs` (checked),
so `6abea6fd` still equals the repo for everything it runs. Nothing owed.

## 2026-10-01 (14:30-14:45 PDT) - why the house tabs and the closing tabs disagreed; lawn care is a rehab cost (D-070)

Paul: *"concerned the rehab costs on the granit and sparkling properties tabs is different than the closing tabs. whay
is that?"* Read both pairs live and reconciled them to the cent:

- **280 Sparkling:** house tab Rehab 2,182.47 / Utilities 997.31, closing tab 2,402.47 / 777.31 - the 220.00 of
  Falcon Creek lawn bills, under Utilities on one and Rehab Costs on the other. Same total, 3,179.78.
- **1616 Granite:** house tab Rehab 8,951.51 -> closing 3,889.97 = + 250.00 lawn care + 1,526.46 Verity Plumbing
  (08-05) - 6,838.00 cash advances (D-068). Utilities 515.12 -> 1,476.90 = - 250.00 lawn care + 261.76 TXU (07-25)
  + 950.02 City of Waxahachie water (07-29). The three later bills, 2,738.24, were settled in Granite's payout (the
  old reconciled tab: rehab 10,727.97, utilities 1,476.90) and the frozen house tab stops at 07-24.

Then *"then why arent those costs being represented in 'AFTER THE SALE'?"* - because they were settled in the payout;
the section's name was the fault. And *"yes, and lawn maintenance shodul be in rehab costs"*.

- **`Code.gs`:** `rehabF` / `holdingF` and `refreshLineBlocks_`'s two blocks put account 1130 in Rehab Costs on the
  light house tab (the heavy tab only uses their sum); `writeSimpleClosingTab_` ends with `AFTER THE PAYOUT` / `Bills
  that came in after the payout (not yet split with Dennis)`.
- **`applyLawnCareAndPayoutWording()`** (oneOffScripts.gs, run 14:32-14:35): every held tab rebuilt (Ashburne's typed
  Sale Price, Concession and agent % kept; Newport's 290,000 kept, Rehab 3,842.64 / Utilities 759.53), both frozen
  tabs rebuilt as of their closing date, both closing tabs rewritten in place (Sparkling's eleven statement lines came
  off the sheet - the two wires intact).
- **A mistake, found on the read-back and fixed:** 280 Sparkling's frozen house tab had a Profit Breakdown finished by
  hand since the 09-26 freeze - Sale Price 275,000.00, Property Tax (prorated) 8,237.00 (in no book and no setting),
  Total Project Cost 211,078.02, Net Profit 50,171.98, payouts 226,145.21 / 26,867.79. The rebuild replaced it with the
  code's figures (no tax line, profit 58,408.98). `restoreSparklingHouseTabSummary()` put the twelve cells back from
  the 13:05 read (14:41, read back). Granite's frozen tab changed only by the lawn-care move (total 295,239.73 and Net
  Profit 113,260.27 as before). **Read a frozen tab and compare before rebuilding it.**

Left as they are, asked of Paul: cash advances as their own row on the house tabs; Granite's three later bills on its
frozen house tab. 546 tests. Pushed and committed. **Owed: the writer web app deploy** (`Code.gs` changed - the web
app redraws a house tab's bill lists on every emailed receipt).

## 2026-10-01 (15:45-16:10 PDT) - the cash advances in the cost list: Paul's old reconciled sheet is the model (D-071, in progress)

Paul, looking at Granite's house tab: *"cash advnaces is not part of rehab costs"* - the closing tab (D-068 as Claude
built it) had taken the 6,838.00 out of Rehab Costs (3,889.97) and listed it as its own cost row. Asked which row can
go, he sent his old sheet "1616 Granite RECONCILED" (PDF; the same tab is in
`data/migration/cutover-2026-09-21/old-workbook-cutover.xlsx`): *"this makes sense to me"*. On it the costs are
Purchase Price, Interest on Purchase, Rehab Costs 10,727.97 (every bill) and Utilities; the cash advances are only in the
Paul Paid box (-6,838.00), the Dennis Paid box (+6,838.00) and the payouts.

- **`lib/sale.mjs` `closingRows`:** PROJECT COSTS has no `Cash Advances Principal` row and Rehab Costs is every bill
  (D-068's netting reversed); the principal stays under Dennis in PAYOUTS. Tests changed to his sheet's figures
  (Rehab 10,727.97, Reimbursement Dennis 8,304.63, Paul 3,900.24).
- **`rewriteClosingTabs()`** (15:59): both closing tabs rewritten in place, house tabs not touched; read back. A heading
  Paul had typed on Granite's closing tab (`AFTER THE SALE`, over the code's AFTER THE PAYOUT) was kept - **ask which
  he wants.**
- Then *"i want to understand. what is different between my way and your way?"* and *"keep the existing closing tabe
  and make a new one for comparison"*: **`buildGraniteClosingYourWay()`** (16:07) wrote **`1616 Granite - Closing (your
  way)`** beside the closing tab - his old sheet's layout from the books: profit 49,263.26 without the escrow, the
  cash-advance interest as +42.35 / -42.35 in the payouts rather than a cost, Dennis's payout 32,978.61 without the
  purchase money, the Paul Paid / Dennis Paid boxes. To the cent his old sheet (its interest split 6,873.90 / 84.70 is
  his; the books hold the total).

**Open:** which of the two Granite tabs he keeps, or which rows of his way go into the closing layout. Not written into
`docs/decisions.md` yet (D-071 when he decides). Pushed; **not committed; writer web app deploy owed** (D-070 and this).

**16:13 PDT - decided (D-071):** Paul, on the two Granite tabs: *"i like your way. i'm getting my head around it. let's
add the cash advance total after Cash Advances Interest so it would say Cash Advances Interest on $6,838"*. In
`closingRows` (plain `Cash Advances Interest` when a house has no advances); both closing tabs rewritten in place and
read back - Granite `Cash Advances Interest on $6,838` 84.16, Rehab Costs 10,727.97; Sparkling unchanged. D-071 written
(it replaces D-068), phase5-spec 3a, CLAUDE.md, the handoff and the router updated. 546 tests. Pushed and committed.
Still there: the comparison tab `1616 Granite - Closing (your way)` (ask before removing) and his typed `AFTER THE SALE`
heading on Granite's closing tab. **Owed: the writer web app deploy** (D-070, D-071).

**16:16 PDT:** Paul: the last heading is `AFTER THE PAYOUT` on every closing tab - the typed `AFTER THE SALE` on Granite's
is gone (`rewriteClosingTabs` no longer keeps it; re-run, read back). He asked why Granite's closing-tab Rehab Costs
(10,727.97) is larger than its house tab's (9,201.51): the 1,526.46 Verity Plumbing bill of 08-05, after the frozen
tab's 07-24 cut-off - offered to bring the three later bills onto the house tab (not answered yet).

## 2026-10-01 (16:20-16:30 PDT) - the house tab freezes when the closing is run; every after-payout bill listed (D-072)

Paul: *"i want the property tab to be frozen when we run the closing not the closing day. i have held ashburne and will
be holding newport until i am in person with dennis and utility bills will keep coming in. for granite add the verity
plumbing bill to the property tab since its not there. i want all the bills that come in after the payout to be listed
not just a sum of them all."*

- **`Code.gs`:** a frozen-tab rebuild (`setupPropertyTab(name, asOf)`, `refreshLineBlocks_`, `refreshHeavyBlocks_`)
  leaves out only the sale's own entries - no date cut-off (a held tab still stops at today). `sellPost` already froze
  the tab as it read when the closing was run. `writeSimpleClosingTab_`: AFTER THE PAYOUT is the total and a live list
  (date and payee / amount / what it was), 120 rows kept clear and formatted under it.
- **`applyFreezeAtRunAndListBills()`** (16:25, again 16:27): Granite's frozen house tab rebuilt only after its summary
  read what the code had written (no hand edits) - Rehab Costs 9,201.51 -> 10,727.97, Utilities 265.12 -> 1,476.90,
  Total Project Cost 295,239.73 -> 297,977.97, Net Profit 113,260.27 -> 110,522.03; it now equals its closing tab and
  the old reconciled sheet. **Sparkling's house tab was not touched** (no later bill; its Profit Breakdown is Paul's
  typing). Both closing tabs rewritten in place and read back: Granite lists 12 bills = 757.16, Sparkling 7 = 873.54.

546 tests (the lint's as-of test now asserts the new rule). Pushed and committed. **Owed: the writer web app deploy.**

**16:30 PDT, closing tab wording (Paul):** `Half of profit` carries no "(the part paid at closing)" suffix even when
escrow was held back; a sole-owner sale's cash row is `Payout from title company` (was "Sale money from the title
company"); its note is `After commission, closing costs and taxes` and is the one note that is not bold. In
`closingRows` (`note_plain`) and `writeSimpleClosingTab_`; both closing tabs rewritten in place and read back (Sparkling
keeps `Your half of the sale money (first wire)`, with the shorter note). 546 tests. Pushed and committed; deploy owed.

**16:34 PDT, closing tab formatting (Paul):** the escrow row's note (`Comes later - see the escrow section below`) is not
bold; the top note (`Sold for ...`) is size 13; C1:D1 have the light green `#ceffbc`; every cell of column D wraps. In
`closingRows` (`note_plain`) and `writeSimpleClosingTab_`; both closing tabs rewritten in place, the first three seen in
the workbook on both tabs (the wrap could not be scrolled to from the session). Paul removed the comparison tab
`1616 Granite - Closing (your way)` himself. 546 tests. Pushed and committed; deploy owed.

**16:38 PDT - deployed on Paul's "deploy": writer web app @26** (`clasp deploy -i` the same id; `clasp deployments` reads
@26, `/exec` answers ok 0.4.0) = the repo: D-070, D-071, D-072 and the closing tab's wording and formatting. The site
runs none of the changed code. Nothing owed. (A test expectation edited by mistake failed for the two minutes around
the deploy - the wrong test's label, not the code; fixed, 546 pass. Run the suite BEFORE a deploy, with `&&`.)

**16:39 PDT - "then update sparkling closing tab":** `updateSparklingClosingTab()` rewrote `280 Sparkling - Closing` in
place with everything decided on Granite's tab, and renamed its first cash row to match Granite's `Payout from title
company`: **`Your half of the payout from title company (first wire)`** (the wording lives in the statement lines kept
on the sheet; `closingRows`' default for a co-owned sale is the same without the wire). Read back: 259,053.12 +
4,716.82 = 263,769.94; costs 202,839.85; profit 60,930.09; seven bills after the payout = 873.54. The rename was
Claude's reading of "update"; Paul confirmed it ("yep").

## 2026-10-01 (17:00 PDT) - the Inbox card says what to click when no kind of cost is picked

Paul, on a Venmo screenshot (500.00 to Juanito, painting, 366 Mesa) whose amount Claude could not read and he typed in:
*"this wont let me submit this expense because it isnt set up for venmo. this was paid with venmo linked to the citizens
recast account"*. Not Venmo: the line's account box still read `Choose...`, the engine refused the empty account, and
the card showed `BAD_ACCOUNT - account is not in the chart of accounts` (rule 7 broken - a code he had to guess at).
`Inbox.html` only: the box reads `What kind of cost is this? Choose...`; Save stops before the books with what to
click ("pick what kind of cost this is ... Paying a worker is Rehab - subcontract labor ... how it was paid does not
matter here"); a BAD_ACCOUNT that still comes back is said in plain words; and a card whose read found no total says
`No total could be read on this one: $500.00 to record now` instead of the red "$500.00 more than the receipt".
Paid from 1401 was already right (Venmo draws on Citizens; the bank line ties it later). Pushed (the sheet's Inbox runs
the pushed code - no deploy), committed. 546 tests.

## 2026-10-02 (morning) - "what happened with the books last night?" - the long Books check, the red bank line, two saves that did not finish

Paul, on the 3 AM email: *"what happened with the books last night? suddenly the bank part is blown up. also, the
squarespace and roddy report expenses are emails with multiple receipts each and its showing up as one"*.

**What happened.** The 2 AM check of 10-02 was the first after the 10-01 final register (D-067) and after Paul's 33
Inbox saves of that evening (17:50-18:11 PDT). Every one of the 33 was read back against the Journal (all 1,257
documents pulled, each card's saved lines against its entries): 31 landed exactly as he saved them. The check's eight
lines:

- **Six "may not be in the books at all" (Atmos 141.59, Sunstate 904.18, four Uber rides) were false alarms.** Each is
  a double the final register voided on purpose on 10-01 (the Atmos bill paid inside the 05-08 197.00; Sunstate inside
  the 922.26 with its card fee; four Uber receipts before the tip). `receipts_on_no_book` counted a voided entry a card
  itself posted as a decision, but not a voided MIGRATED row the document was linked to. Fixed in `gatherFacts`: a
  linked row that was voided accounts for the document.
- **"Void one of the two Falcon Creek $110" was wrong.** INV 1404 bills 110.00 for each of two yards. One document
  split across houses is no longer a possible duplicate (`oneBillSplit`). **The real double on that invoice is the
  104 Ashburne $60**: recorded 10-01 morning from Paul's Zelle screenshot (Chase 6317, memo "104 Ashburne",
  `receipt-20261001-822eca180792`) and again that evening as INV 1404's Ashburne line, paid by Paul
  (`receipt-20260930-93c8983ebc93-dbe1`). `voidAshburneLawnCountedTwice()` waits for Paul's yes.
- **Home Depot 03-06, $36.77 (Ashburne, oscillating blades): REAL - saved, marked recorded, not in the books.**
  Executions: `inboxApprove` 6:04:20 PM PDT, 12.2 s, **Failed, no log** - the only failure of the evening.
  `inboxApprove` marks the card first and catches a failed post to put it back; this failure escaped the catch, which
  is what a buffered `setValues` failing at the end-of-execution flush does. **Fix: `SpreadsheetApp.flush()` straight
  after the Journal write, inside the lock, on all three write paths** (`postEntry_`, `voidEntry_`,
  `postBatchEntries_`) - a write that cannot land now throws where the catch puts the card back, and no second writer
  can read a stale last row.
- **Lowe's 03-21 $4.52: in the books, receipt link missing** (step two did not finish; the 25.89 downrod on that card
  was Returned by Paul, as saved).
- `repairLostSaves20261001()` (oneOffScripts.gs, first function): re-saves the Home Depot line through the Inbox's own
  two steps, links the Lowe's receipt, rebuilds the Citizens Bank tab.

**The bank box.** One red line: City of Red Oak 300.72, paid from Citizens 10-01, against a bank file that ends 09-28
(and the tab was last rebuilt 10-01 1:21 PM, so last night's Falcon Creek 700.00 and Juanito 500.00 would have been four
more). `bankCheck`: an entry dated after the file's last line is a reason - "5 payments recorded after 09-28, the last
day on the bank file - they tie when the next file is imported" - not a red line. On today's Journal the box adds up:
169,805.35 + 344.99 - 165,558.65 + 0.02 - 1,500.72 = 3,090.99, "they agree".

**Several receipts in one email.** Both cards were read right - six entries each, own dates and amounts (Squarespace
52.80 / 52.80 / 5.40 / 69.60 / 69.60 / 50.40; Roddy 6 x 84.44) - but the card and the email showed one vendor, one date
(the last), one total. Now: the card's head says `6 receipts`, each entry has a heading (`Receipt 2 of 6: 2026-02-04 -
$52.80 - invoice ...`), **Paid from picked on one receipt fills every receipt still unassigned**, and the 3 AM line reads
`(6 receipts, 01/04 to 08/04)` (`/api/summary` sends `dates`). Checked on the real two cards in a local copy of the
dialog (stubbed server) - not yet in the workbook. Both cards wait on one answer: whose card is Mastercard 7952
(seen before on Twilio, American Airlines, Uber Eats - all recorded as Paul's).

**Seen, not chased:** the 3 AM email's Posted list prints the read's proposed lines, not what Paul saved (Home Depot
$64.24 shows 27.49 + 36.75; he recorded 20.54 and returned 43.70) - `mark-posted` does not keep the saved entries.
`refreshBalanceSheetHourly` ran 241 s at 11 PM and 151 s at 8 AM (limit 360 s).

546 tests (new asserts in three). **Owed:** `clasp login` expired (invalid_rapt) - then push writer and poller, run
`repairLostSaves20261001`, deploy the site (the nightly check, `/api/summary`) and the writer web app (Code.gs, lib.gs).

## 2026-10-02 (08:30 PDT) - the 3 AM email's Posted list prints what Paul saved

The Posted list was built from the read (`e.model`), so a card Paul trimmed still printed the read's lines: The Home
Depot 08-05 (gm-19fd34b701a40539) showed `$64.24 ... 1030: $27.49, 6510: $36.75` when he had marked 43.70 Returned and
recorded 20.54 (receipt-20260805-4d5bcc478bad-e829). The sheet's Save sent `mark-posted` only the txn_ids and the note.

- `inboxApprove` (Menu.gs) sends the saved `entries` with `mark-posted`; `books-inbox.mjs` keeps them as
  `result.entries` (the later doc_url patch keeps them, `mark-pending` drops them). The web approve does the same
  through `saved_entries` -> `result.entries` in `books-approve-background.mjs`.
- `books-summary.mjs` `postedLine`: house, per-account lines and the amount come from `result.entries` when present -
  the amount is what was recorded, not the receipt's total - else from the read as before (an auto-post records the
  read as it stands). The email's subject total follows.

548 tests (two new, two extended). Writer pushed 08:28 PDT and read back with `clasp pull` (= the repo; this push also
carried the morning's writer changes). **Owed:** the site deploy (`npm run deploy`) - until then the email prints as
before; cards saved before the deploy keep printing the read (their saved lines were never stored). Still owed from the
morning: the poller push, `repairLostSaves20261001`, the writer web app deploy (Code.gs, lib.gs).

**Seen, not chased:** `/api/summary` files a card under the day it was READ (`finishedAt`), not the day Paul saved it -
a card read on one day and saved on a later one is in no day's Posted list.

## 2026-10-02 (08:25-08:35 PDT) - the morning's fixes pushed, the repair run, Paul's two answers

Paul ran `npx clasp login`, then: *"yes Mastercard ending 7952 is a personal card. yes ok to remove second $60"*.

- **Pushed:** the writer (from a clean export of HEAD - another session had uncommitted edits in this checkout; **live =
  commit afdd519**, checked with `clasp pull`) and the poller, both mailboxes.
- **`repairLostSaves20261001()` run from the editor 08:30 PDT, read back on the live sheet:**
  1. Home Depot 03-06, 36.77 on 104 Ashburne: recorded (`receipt-20260306-dd62aab4aabf-7d86`, rows 3088-3089), receipt filed.
  2. Lowe's 03-21 4.52: receipt linked.
  3. Citizens Bank tab rebuilt: **"they agree"** - 169,805.35 + 344.99 - 165,558.65 - 1,500.72 (5 payments recorded
     after 09-28) + 0.02 = 3,090.99.
  4. The second Ashburne 60.00 voided (`void-receipt-20260930-93c8983ebc93-dbe1`, rows 3090-3091); the 10-01 Zelle from
     Chase stays.
  5. Settings `paul_personal_last4` = `9166, 8870, 3746, 7952`; the bookkeeper's instructions name the Mastercard.
  Journal: 3,090 rows, 5,272,895.51 both sides.
- **104 Ashburne's tab rebuilt** (`rebuildAshburneTabForCabinetPulls()`, 08:35): the run logged "no header for block
  Cabinets & Countertops" - the two cabinet pulls Paul saved 10-01 (7.55 + 28.52) carry a section the tab had no block
  for, so the sections added to 36.07 less than Rehab Total. After: 22 sections = 184,975.01 = Rehab Total; Sale Price
  775,000.00, agent 2.75%, Concession 19,000.00 kept; Profit 128,040.09, Paid by Paul 8,773.57.
- **Still owed - Paul's "deploy":** the site (the nightly check's fixes, `/api/summary`, the instructions' 7952) and the
  writer web app (`clasp deploy -i`: the flush and the bank box on the pollers' path). Until the site deploys, tonight's
  2 AM check repeats the six false alarms. The Squarespace and Roddy cards are his to save: Paid from = PAUL, once.
- Not live: the other session's Menu.gs change (the saved lines sent with mark-posted) - its push was overwritten by the
  08:33 push from HEAD; it goes out with that session's own commit and push.

**08:40 PDT - deployed on Paul's "deploy":** site `6abfd01b` (the nightly check's two fixes, `/api/summary` `dates`
and the saved lines in the Posted list, the instructions' 7952) and **writer web app @27** (`clasp deploy -i` the same
id; live script = HEAD by `clasp pull`; `/exec` answers ok 0.4.0) - the flush inside the lock and the bank box on the
pollers' path. 548 tests. `gatherFacts` re-run on the live Journal (3,090 rows, balanced) and every card: nothing
missing, nothing unlinked, no receipt on no book; the four same-day look-alikes left are the Anthropic top-ups and
the 05-29 return the check has passed every night. **Nothing owed.** Not yet seen in the workbook itself: the
several-receipts card (checked on a local copy), and a save that fails going back to the Inbox.

**08:42 PDT - Paul saved the Squarespace and Roddy cards; read back.** Six entries each, every one on its own date,
all paid by Paul, all on OVERHEAD: Squarespace 52.80 (01-04), 52.80 (02-04), 5.40 (02-23), 69.60 (03-04), 69.60 (04-04),
50.40 (08-04) = 300.60, Workspace seats on 6400 and the website on 6410; Foreclosure Listing Service 6 x 84.44 = 506.64
on 6300 (02-15, 04-15, 05-15, 07-15, 08-15, 09-15). Neither was on the books before (only the 06-09 Acuity charge).
Journal 3,118 rows, 5,273,702.75 both sides. **The several-receipts card is proven in the workbook**, and both cards
kept their saved lines (`result.entries`, six each). Seen, not chased: every entry of such a card links the FIRST PDF
of the email (`inboxFinish` files all six, `setDocUrl_` gives every entry the first file's link). Months not in either
email: Squarespace May, June, July; the Roddy report January, March, June.

## 2026-10-02 (08:45-08:52 PDT) - the email reader dropped every attachment after the sixth

Paul, on the months missing from the two cards: *"those missing months should be in there. look in my folders on my
desktop"*. They were: `Desktop/Squarespace Invoices` holds 11 PDFs and `Desktop/Roddy Invoices` 9, and he attached all
of them. **The poller's `MAX_ATTACH_COUNT: 6` ended the attachment loop at six and said nothing** - no note, no error,
no card. Five Squarespace invoices and three Roddy receipts never reached the bookkeeper.

- **`buildPayload_` (poller `Code.gs`):** an email with more than six attachments, or more than 4 MB of them, becomes
  several documents - `gm-<id>`, `gm-<id>-2`, ... - each with Paul's subject and note and a poller note saying which
  part it is. `postUpload_` sends them all (`postOne_` is the request); if one fails the thread stays unlabelled and the
  site skips the parts it already has. Nothing is dropped any more; the size split also covers six 3 MB photos, which
  never fitted one 6 MB POST. A runnable test stubs Apps Script and checks 11 -> 6 + 5. 549 tests. Pushed to both
  mailbox projects (the poller runs the pushed code - no deploy).
- **The eight left-off receipts** went in through a one-off (`resendLeftOffAttachments`, run 08:49 PDT, then removed):
  each email sent again, the site skipped the first document and read the second. Both posted on their own (high, the
  cards now known as Paul's):
  Squarespace 69.60 (05-09), 69.60 (06-04), 6.16 (06-22), 50.40 (07-04), 50.40 (09-04) = 246.16;
  Foreclosure Listing Service 84.44 x 3 (01-15, 03-15, 06-15) = 253.32.
- **Read back:** every file in the two Desktop folders is in the books - Squarespace 11 invoices = 546.76 (01-04 to
  09-04), the Roddy report 9 months = 759.96 (01-15 to 09-15). Journal 3,136 rows, 5,274,202.23 both sides.
- **No other email ever hit the limit** but one: Verity Plumbing 08-06 (six attachments, the invoice and mail images),
  whose 1,526.46 is in the books from the migration.

## 2026-10-02 (09:00-09:10 PDT) - each bill of a several-receipt email opens its own PDF

Paul: *"link each bill to its own pdf"*. Both filing paths stored every attachment in Drive and then gave every
entry of the document the FIRST file's link (`filed[0]`, `setDocUrl_(txnIds, docUrl)`).

- **The 20 bills of today, relinked** (`linkEachBillToItsOwnPdf()`, run 09:08 PDT): each bill matched to its PDF by
  invoice / receipt number (the Desktop PDFs' text against the entry memos), the Drive file found by its filed name,
  the link written on its Journal lines. Read back: 20 bills, 20 different files; three opened through Drive and read
  (Squarespace 02-04 = #220870419, 06-22 = #239713210; Roddy 06-15 = receipt 2791-0440). Nothing posted.
- **From now on:** the read says which attachment each entry came from (`attachment` on a `decide` entry, null for a
  one-receipt document; one paragraph in the instructions); the ingest gives each entry its own file
  (`ownReceiptUrl` in `_shared.mjs`), and so does the sheet's Inbox on Save (`inboxFinish`). The read counts the
  attachments it was SHOWN, so the own-file link is used only when every attachment is a PDF or a plain image and
  every one was filed - otherwise the first file, as before. Not done: the web Inbox's approve (`approve-bg`), which
  Paul never uses. 550 tests. Writer pushed (Menu.gs - no web app deploy). **Owed: the site deploy** (the read's new
  field, the ingest) - until then a new several-receipt email still links the first file.

**09:11 PDT - deployed on Paul's "deploy": site `6abfd7ae`** (the read's `attachment` field, the ingest's own-file
link, D-073; 550 tests). The writer web app stays **@27** - Code.gs and lib.gs are unchanged since it. Not yet seen
live: a read made after this deploy (the first receipt in will show it).
**09:13 PDT - "update git, repo, md":** oneOffScripts.gs emptied (all 21 scripts of 10-01 and 10-02 had run and been
read back - they are in commit db9453f; pushed), decisions D-073 (several receipts in one email) and D-074 (Mastercard
7952 is Paul's), `HANDOFF-2026-10-02.md`, phase2-spec's attachment lines, CLAUDE.md's Now line. Everything committed
and on GitHub.

**09:35 PDT - the `Taxes` tab (D-075).** Paul: *"i want to add a tab to the recast books that shows me my tax exposure
for both IRS and Oregon State"*. `lib/tax.mjs` (`TAX_TABLES` for 2026 from the IRS's and Oregon's own publications,
`taxEstimate`, `taxFacts`, `taxTab`), in `lib.gs`; `refreshTax_` + `expectedProfits_` in Code.gs, called by the P&L
tab's hourly timer and by the edit trigger when a blue cell on the tab changes (the hour's Journal numbers are kept in
the script property `TAX_FACTS`, so a typed cell answers in seconds). `loadJournal` now carries `tax_treatment`.
Run against the live Journal snapshot before the push: Recast earned 53,848.42, 628.98 of meals and the traffic
ticket added back, single with nothing else typed = 14,353.08 to set aside; with 104 Ashburne marked yes at its
tab's 128,040.09 = 62,612.40 single, 52,330.25 married. 555 tests (5 new, two returns worked by hand). Writer pushed
09:30 PDT; **the writer web app deploy is owed** (lib.gs and Code.gs changed - the tab itself does not wait for it:
the timer and the edit trigger run the pushed code). Not yet read back live: the tab the timer builds.

**09:35-09:40 PDT - the `Taxes` tab is live and read back.** Paul: *"i dont see it in the sheets doc"* - the hourly
timer had not had its turn since the push (it runs at :05). `buildTaxesTabNow()` (the timer's own job, a one-off, in
commit c59abfc) run from the editor by Claude: 22 s, no errors. Read back through gviz: Recast earned 53,848.42, 628.98
added back, four held houses listed at their tabs' profit (104 Ashburne 128,040.09, 881 Newport 26,466.55, 366 Mesa
25,491.84, 469 Brushwood 36,483.81), none marked yes yet. **Paul had already used it:** married picked, 5,000.00
typed as sent to the IRS - the tab reworked itself at 9:37 (the edit trigger), set aside 7,327.22. The editor's
function dropdown would not take a selection by click, drag or script this time; a one-off alone in oneOffScripts.gs
is selected by default, which is the safe way to run one. The one-off is taken out and the writer pushed again.
The writer web app deploy is still owed.

**09:40 PDT - deployed on Paul's "deploy": writer web app @28** (`clasp deploy -i` the same id; `clasp deployments`
reads @28; live script = HEAD - `clasp pull` copies compared file by file and removed; `/exec` answers ok 0.4.0) = the
repo: the `Taxes` tab (D-075). The site was not redeployed - no function loads `lib/reports.mjs` or `lib/tax.mjs`
(checked), so site `6abfd7ae` is still the repo. Nothing owed. 555 tests.

**09:44 PDT - the `Taxes` tab lists every held house.** Paul: *"youre missing green acres, bowling green, janice,
white rock from the property list"*. Checked on the four tabs first: none has a sale price typed, and the first build
listed only houses that did (`expectedProfits_`). Now every held house is a row; one with no sale price says
`no sale price yet` and adds nothing until a price is typed on its own tab (`taxTab`, test extended). Pushed, rebuilt
by `rebuildTaxesTabNow()` (the timer's job, a one-off, in commit 2d91c40; 12 s, no errors) and read back: eight houses,
Bowling Green / White Rock / Green Acres / Janice with no price, Paul's `yes` beside 104 Ashburne and 881 Newport
kept across the rebuild - profit taxed 208,984.04, still owed IRS 41,507.11, Oregon 15,129.20, set aside 56,636.31
(married, 5,000.00 already sent). The one-off is taken out. **Owed: the writer web app deploy** (Code.gs, lib.gs
changed after @28). 555 tests.

**09:47 PDT - deployed on Paul's "deploy": writer web app @29** (`clasp deploy -i` the same id; `clasp deployments`
reads @29; live script = HEAD - `clasp pull` copies compared file by file and removed) = the repo: the `Taxes` tab's
full house list. `/exec` answers ok 0.4.0 three times running; the first call right after the deploy came back as a
Google page instead (the known doGet misfire - reads retry). Site `6abfd7ae` unchanged. Nothing owed. 555 tests.

**10:00 PDT - receipt photos are no longer shrunk at 3 MB (D-076).** Paul: *"the receipts that are being saved to
drive as pixelated and sometimes unreadable. i am sending high resolution images"*. Cause, measured on the stored
files: the poller replaced every photo over 3 MB with Drive's 2000px rendition before sending it (1500x2000 for
3024x4032; IMG_5798, IMG_5868), and that copy was read and filed - about 100 of 387 photos since January. Now
`MAX_ATTACH_BYTES` is 4 MB and `shrinkImageViaDrive_` walks `SHRINK_SIZES` largest first, logging the size kept; the
document carries a note when a copy was reduced. One new test (the cap, the ladder, the note). Both pollers pushed
10:00 PDT, live = repo (pull + cmp). No site or writer change. 556 tests. Not yet seen on a real photo; whether Drive
renders above 2000px is not proven (a refused size falls through, so never worse than before).

**10:20-11:05 PDT - the photos already stored small are put back (D-076; Paul: "yes, replace them").** The list:
102 shrunk photos by the poller's renamed files; 87 are linked from the Journal (90 Drive files, three filed twice) -
10 in the paul@ mail, 77 in the properties@ mail; 14 have no link from the Journal and were left (1 was a web upload,
not shrunk). `apps-script/poller/OneOff.gs` (commit e5ceac2): properties@ copied each original attachment out of its
mail into a Drive folder shared with paul@, from `pollBooks` on its own timer (three runs: 38, 10, 29 photos - the
second run got only ten in its four minutes); paul@'s `restoreOriginalPhotos()`, run from the editor six times,
uploaded each original into the EXISTING Drive file by a resumable upload (same file id, the small copy kept as the
previous version), only where the file was exactly the stored small copy and the original was bigger. Result: 87 of
87 replaced, 0 skipped, 0 failed; read back 90 files - all 4032x3024 or 5712x4284 (3.1-4.8 MB), 0 still small. No
entry changed, nothing re-read, the site's copies untouched.
- The first run (10:20) failed before touching anything: `DriveApp.searchFolders(... sharedWithMe = true)` ended in
  "server error occurred while reading from storage, DEADLINE_EXCEEDED" after two minutes. The folder is now found by id.
- The properties@ export first took its poll's whole turn; from 10:45 it runs for up to 4 minutes and then the mail
  is read as usual. Two polls (10:20, 10:35) read no property mail.
- The editor: a click on a file sometimes lands on the sign-in notice instead, leaving Code.gs open with `setup`
  selected - the selected function was read back before every Run. The Executions page hung the browser tab twice.
- Of the 87 originals, 10 are over the 4 MB cap (4,194,304 bytes; the largest 4.8 MB): those would still be reduced
  under the new cap - about 1 photo in 40 of the 387 since January.
- Tidy-up pushed 11:06 PDT: on its next poll each account clears the restore's script properties and properties@
  moves the export folder to its trash; then OneOff.gs and its line in pollBooks come out.
