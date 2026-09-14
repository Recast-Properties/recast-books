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
