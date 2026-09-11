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
