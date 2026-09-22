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
