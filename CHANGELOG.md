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

