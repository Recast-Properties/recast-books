# Phase 1 — technical contract: ledger core

Extends `docs/phase0-spec.md` (still binding). Read `BUILD-PLAN.md` §2, §4, §5 and
`docs/property-tab-anatomy.md` first. Same rules: zero npm dependencies, integer cents,
ASCII-only Apps Script, every write through the writer, nothing touches the old
workbook or `../Recast-site/`. If something is not written here, stop and ask.

Phase 1 delivers: Properties, Vendors, Bank accounts, Users/Settings editing, Dennis's
advances with the **accrual engine**, the **interest posting job**, and the first
**reports** — trial balance, balance sheet, P&L, property job cost, property balance
sheet, Dennis loan ledger. Plus the Phase 0 carry-overs (§6).

**Gate:** trial balance balances; balance sheet ties (assets = liabilities + equity
including current earnings); the accrual engine reproduces 881 Newport to the cent
($3,799.52 on $207,000 from 2026-06-29, $31.13 on $2,000 from 2026-07-09, both as of
2026-09-11); Paul adds a real property, a real advance, and posts one month of interest
from the app and sees it on the property balance sheet.

---

## 1 · Accrual engine — `lib/accrual.mjs`

Decisions D-006, D-010, D-011. Rule reproduced against the live tab in
`docs/property-tab-anatomy.md`:

- Monthly rate `r = interest_rate_annual / 12` (Settings; 0.09 → 0.0075).
- Interest starts the day the advance lands (`date`). Nothing accrues on that day itself.
- **Anniversaries** are the same day-of-month in each following month; when that month is
  shorter, clamp to its last day (an advance on the 31st has its February anniversary on
  the 28th/29th). Anniversary `k` = `addMonthsClamped(date, k)`.
- **Compounding:** after `k` anniversaries ≤ `asOf`, `balance = P × (1+r)^k`.
- **Stub:** `stubDays = daysBetween(anniversary_k, asOf)` (calendar days);
  `stubInterest = balance × r × stubDays / stub_days_basis` with basis **30** (Settings).
  Dividing by the real month length does not reproduce the tab.
- `accruedThrough(advance, asOf)` = `round2((balance − P) + stubInterest)` in cents;
  `0` when `asOf ≤ date`; frozen at `repaid_date` when the advance is repaid
  (`asOf` is clamped to `repaid_date`).
- **Period delta** (what the posting job books): `interestForPeriod(advance, "YYYY-MM")`
  = `accruedThrough(lastDayOf(period)) − accruedThrough(lastDayOf(previousPeriod))`, each
  side rounded to cents first, so the sum of posted deltas always equals the rounded
  cumulative. Zero for periods before the advance date.
- `payoffAt(advances, property, asOf)` → `{principal_cents, interest_cents, total_cents,
  advances:[{advance_id, date, amount_cents, anniversaries, stub_days, interest_cents}]}`
  for the advances of one property not yet repaid.

```js
export function addMonthsClamped(isoDate, months) -> isoDate
export function daysBetween(isoA, isoB) -> int
export function lastDayOf(period) -> isoDate
export function accruedThrough(advance, asOf, {rateAnnual=0.09, stubBasis=30}) -> cents
export function interestForPeriod(advance, period, opts) -> cents
export function payoffAt(advances, property, asOf, opts) -> {...}
export function schedule(advance, asOf, opts) -> [{anniversary, balance_cents}]  // for display
```
`advance = { advance_id, date, amount_cents, property, repaid_date? }`.

**Golden tests (must pass exactly):** 207000.00 from 2026-06-29 as of 2026-09-11 →
379952; 2000.00 from 2026-07-09 as of 2026-09-11 → 3113; as of the advance date → 0;
as of the first anniversary → `round2(P×r)` with no stub; a Jan-31 advance has
anniversaries Feb-28 (2026), Mar-31, Apr-30; period deltas for 881's purchase sum to the
cumulative for 2026-06 … 2026-09; repaid advance freezes.

## 2 · Reports — `lib/reports.mjs`

Pure functions over Journal rows as returned by the writer (`headers`, `rows`; money in
dollars → convert with `Math.round(x*100)` once, on the way in). Every function accepts
`{asOf?: isoDate, from?: isoDate, to?: isoDate}` and ignores rows outside. All money out
is cents. Void entries are ordinary rows (they net to zero by construction).

```js
export function loadJournal(headers, rows) -> lines[]   // normalized {txn_id, date, period, account, debit, credit, property, cost_class, trade, payee, description, paid_from, source, void_of}
export function trialBalance(lines, {asOf}) -> { rows:[{account, name?, debit, credit, net}], total_debit, total_credit, balanced: bool }
export function balanceSheet(lines, {asOf}) -> { assets:[{account, balance}], liabilities:[...], equity:[...], current_earnings, total_assets, total_liabilities, total_equity, ties: bool }
   // assets = series 1000 (1000-1399 shown as "Property inventory" grouped by property, 1400s cash, 1500/1510) + 7000; liabilities = 2000s; equity = 9000s + current_earnings (= income − cogs − expenses through asOf)
export function profitAndLoss(lines, {from, to}) -> { income:[...], cogs:[...], gross_profit, expenses:[...], net_income, by_property:[{property, income, cogs, gross}] }
export function propertyJobCost(lines, property, {asOf}) -> { property, by_cost_class:[{cost_class, total}], by_account:[...], by_trade:[...], total_cost, released_to_cogs, lines:[...] }
export function propertyBalanceSheet(lines, property, {asOf}) -> { property, assets:[{account, balance}] (1000-1399 + 1500), liabilities:[{account, balance}] (2000, 2010 with this property), total_assets, total_liabilities, net }
export function dennisLedger(lines, advances, {asOf}, accrualOpts) -> { by_property:[{property, principal_outstanding, interest_posted, interest_accrued_to_date, interest_unposted, payoff}], totals }
   // principal_outstanding = Σ(2010 credit − debit) per property; interest_posted = Σ(2000 credit − debit) per property; accrued via lib/accrual.payoffAt
```
Tests: a small synthetic journal (purchase via advance, rehab paid from 1401, overhead
paid from 1402, a Paul-paid cost to 2030, an interest accrual, a void pair) → TB balances,
BS ties, P&L net equals BS current_earnings, job cost equals the property's 1000s,
property BS net = assets − liabilities.

## 3 · Writer v0.2.0 (`apps-script/writer/Code.gs`)

- `read`: add `Advances` to the readable tabs; Journal `limit` max **20000**; add
  `{action:"read", tab:"Journal", all:true}` returning every row (reports).
- `upsert`: add `Advances` (key `advance_id`) and `Accounts` (key `code`) to the allowed
  tabs. Accounts upsert is how a new bank account gets its 14xx code.
- New action `postBatch` `{entries:[...]}`: posts several entries under **one** lock, all
  or nothing — used by the interest posting job. Each entry gets the same checks as
  `post`; if any fails, nothing is written and the response names the failing `txn_id`
  and code. Returns `{ok:true, posted:[txn_id...], rows:[first,last]}`.
- `setup()`: seed **Bank accounts** if empty from the chart's Cash accounts (1401
  Citizens National Bank of Texas, shared with Dennis; 1402 Chase, operating — last4
  blank, opening_balance 0, opening_date blank, active true). Idempotent.
- Bump `WRITER_VERSION` to `0.2.0`. Keep every Phase 0 behaviour. Update the lint test.

## 4 · Functions

All under `netlify/functions/`, session-checked, owner-only for writes (partner and
accountant read). Reuse `_shared.mjs`.

- `books-meta.mjs`: `READABLE_TABS` += `Advances`; upsert allowed tabs += `Advances`,
  `Accounts`. Upsert of `Bank accounts` **also** upserts the matching `Accounts` row
  (`code`, `name: "Cash - <name>"`, series 1400, type asset, active true) and
  invalidates the ctx cache. Upsert of `Users` validates role ∈ owner|partner|accountant
  and refuses to demote or remove the last owner.
- `books-dennis.mjs` (path `/api/dennis`):
  - `GET ?asOf=YYYY-MM-DD` → `dennisLedger` output plus the raw advances.
  - `POST {action:"addAdvance", date, amount_cents, property, into:"1401", memo?}` →
    builds the `advance` intent through the posting engine, posts it, then upserts the
    `Advances` row `{advance_id: "adv-"+txn_id, date, amount, property, source_txn_id,
    status:"open", accrued_to:"", repaid_date:""}`. Refuses `BAD_PROPERTY` if the property
    is not in the registry.
  - `POST {action:"previewInterest", period}` → `{period, previews:[{advance_id, property,
    delta_cents, entry}]}` for every open advance; nothing written. Skips advances whose
    `accrued_to` ≥ period. Interest entries are **dated the last day of the period**.
  - `POST {action:"postInterest", period}` → owner; `postBatch` of one entry per advance
    with a non-zero delta: Dr **1200** (property, payee "Dennis Little", description
    `Interest <period> on <advance_id>`), Cr **2000** (property). `txn_id =
    "close-<period without dash>01-<hash(advance_id|period)>"` via `makeTxnId` with
    source `close` — deterministic, so re-running is refused as `DUPLICATE`. On success
    upsert each advance's `accrued_to = period`. Refuses if the period is closed.
- `books-reports.mjs` (path `/api/reports`): `GET ?report=tb|bs|pl|jobcost|propbs|dennis
  &asOf=&from=&to=&property=` → the matching `lib/reports.mjs` output plus
  `generated_at`. Reads Journal with `all:true`, cached 30 s in module scope, invalidated
  by any post (export `invalidateJournalCache()` from `_shared.mjs`; call it from
  ledger/dennis posts).

## 5 · Web app pages

Same kit, same patterns as Phase 0 (`web/app.js`). Owner sees edit controls; others read.

- **Nav** gets real `href="#dashboard|#journal|#properties|#vendors|#banking|#dennis|#reports|#periods|#settings"`
  with hash routing; deep links work on reload.
- **Properties**: table (name, address, status, purchase date/price, Dennis-funded,
  template). "Add property" form → upsert `Properties`. Row click → property view with
  three cards: **Property balance sheet** (from `/api/reports?report=propbs`), **Job
  cost** (by cost class and by trade, `jobcost`), **Advances** (this property's rows from
  `/api/dennis`, with accrued interest to today). Status select: held / under contract /
  sold (sold is read-only here — the sell wizard is Phase 5).
- **Vendors**: table + add/edit (canonical, aliases comma-separated, entity_type,
  form_1099 yes/no, tin_status, default_account). No 1099 logic yet (Phase 5).
- **Banking**: Bank accounts table + add (code 14xx validated unique and not 1400,
  name, institution, last4, opening_balance, opening_date). Plaid comes in Phase 3; say so
  on the page.
- **Dennis**: summary cards (principal outstanding, interest posted, accrued to date,
  unposted); per-property table from `/api/dennis`; "Add advance" form (date, amount,
  property, into account); "Interest" panel: pick a period → **Preview** shows each
  advance's delta and the entries; **Post interest** (owner, confirm) posts them; shows
  the result or the DUPLICATE notice if already posted. Payoff calculator: property +
  as-of date → principal, interest, total, with the anniversary schedule.
- **Reports**: tabs TB / Balance sheet / P&L / Job cost, with as-of or from–to date
  pickers and a property picker for job cost; each shows its tie-out line
  ("Debits = Credits ✓" / "Assets = Liabilities + Equity ✓") in green or red.
  "Open in workbook" link. CSV download of the shown table (client-side).
- **Settings**: Settings key/value editable (owner); **Users** table with add
  (email, role, name) and role change; cannot remove the last owner.
- **Journal**: grid mode gains `business_purpose` per line; error banner shows
  `CODE — message` only (details behind a "show details" toggle); entries show a
  "Voided" tag as in Phase 0.

## 6 · Phase 0 carry-overs (done in this phase)

business_purpose in the grid; nav hrefs; tidy banners; Bank accounts seeded; clear the
two `PHASE 0 GATE TEST` rows — **not by script**: the plan says the old workbook is never
scripted, and the new Journal is append-only, so those rows stay as the first
posted-and-voided entry in the books. Note it in the CHANGELOG and move on.

## 7 · Out of scope for Phase 1

Receipts ingestion (2), Plaid (3), migration (4), close/1099/packet/sell wizard (5).

## 8 · Gate result — 2026-09-11

Passed, driven through Paul's signed-in browser against the live workbook:

- Bank accounts 1401 (Citizens National Bank of Texas, shared) and 1402 (Chase operating)
  registered from the Banking page; each upsert also kept the Accounts row.
- Property `TEST Phase 1 gate` added (clearly labelled test row; Paul may delete it by hand).
- Advance $1,000.00 dated 2026-06-29 into 1401 posted (`manual-20260629-d3707f95379e`);
  accrued to 2026-09-11 = **$18.36**, matching the engine's rule by hand
  (1000×1.0075² − 1000 = 15.06; stub 13 d on 1,015.06 = 3.30).
- Preview for 2026-07 = **$7.75** (8.00 through 7/31 minus 0.25 through 6/30); posted as
  `close-20260731-6b3848bfdb9a`, dated 2026-07-31, Dr 1200 / Cr 2000 on the property;
  Dennis page then showed posted 7.75, unposted 10.61, total 18.36.
- Trial balance: debits = credits = $1,045.75 ✓. Balance sheet: assets $1,007.75 =
  liabilities $1,007.75 + equity $0 ✓. Property balance sheet: 1200 $7.75 asset; 2000
  $7.75 and 2010 $1,000 liabilities. Job cost: Financing $7.75.
- Cleanup: both test entries voided (`VOID: PHASE 1 GATE TEST cleanup`); the Advances row
  set `status=voided, repaid_date=2026-06-29`, so the ledger reads zero everywhere.

Fixes made during the gate: interest entries are dated the period's last day (were the
1st); posting a period that has not ended is refused `PERIOD_NOT_ENDED` (preview still
works); the Dennis preview renders `previews[]`; the Users "removed" role is accepted by
the server (it is how a login is revoked). Known cosmetic: success banners persist across
page changes; a property's unspent advance cash sits in 1401 and is not shown on the
property balance sheet, so its Net reads as negative funding until the cash is spent on
the property — by design, but worth a caption (Phase 2 polish).
