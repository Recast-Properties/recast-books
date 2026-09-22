# Phase 0 — technical contract

Read `BUILD-PLAN.md` §2–§4 first. This file is the binding contract between the three
Phase 0 modules. If a module needs something not written here, stop and say so rather
than inventing it.

**Constraint above all others:** nothing in Phase 0 touches `../Recast-site/`, the live
RECAST BIZ workbook (`1isEbfNKPO32Wpf08EtLkNHX85c0rTIl8tpH9bUdgQbs`), or the two live
Apps Script projects ("Receipts Bookkeeper", "Receipts Sheet Writer"). This repo has
its own workbook, its own Apps Script project, its own Netlify site (`recast-books`,
id `048233af-83fd-4885-8b28-1e88d5623c3e`, URL `https://recast-books.netlify.app`,
future `https://books.recast-properties.com`).

**Runtime:** Node 24 on Netlify Functions (ESM `.mjs`). **Zero npm dependencies** in
Phase 0 — WebCrypto, `fetch`, `node:test`, `node:crypto` cover everything. Do not add
packages. Apps Script is V8 runtime, plain `.gs`, ASCII only in string literals.

---

## 1 · Repo layout

```
web/                     static front end (Netlify publish dir)
  index.html app.js      app shell — sign-in, nav, Phase 0 pages
  kit.css colors_and_type.css fonts/    visual kit copied from the admin site — do not edit
netlify/functions/       books-*.mjs — every function verifies the session (see §5)
lib/                     pure modules, unit-tested, no Netlify/Google imports
  posting.mjs auth.mjs writer-client.mjs coa.mjs money.mjs
test/                    node:test — `npm test`
apps-script/writer/      the Google gateway: Code.gs, appsscript.json
docs/ data/ *.md         design docs
```

## 2 · Money

Integer **cents** everywhere inside code. Parse on the way in (`"212.40"` → `21240`),
format on the way out. Never `parseFloat` a total and add. `lib/money.mjs` exports
`toCents(str|number)`, `fromCents(int) -> "212.40"`, `sumCents([...])`.

## 3 · The journal entry

An **entry** is what the posting engine produces and the writer persists. It is
immutable once posted; corrections are new entries (`void` reverses).

```js
{
  txn_id:    "receipt-20260701-3f9a2c1b7d4e",   // §3.2
  date:      "2026-07-01",                      // ISO, the economic date
  period:    "2026-07",                         // derived from date
  memo:      "Home Depot — drywall panel, plug, roller trays",
  source:    "manual" | "receipt" | "feed" | "migration" | "close" | "void",
  posted_by: "paul@recast-properties.com" | "claude" | "system",
  doc_url:   "" | "https://drive.google.com/...",
  void_of:   "" | "<txn_id being reversed>",
  lines: [ { account:"1030", debit:21240, credit:0, property:"881 Newport",
             cost_class:"Rehab", tax_treatment:"Inventory (held)", trade:"Paint & Flooring",
             payee:"Home Depot", description:"Drywall panel", paid_from:"1401",
             reconciled_ref:"", business_purpose:"", attendee:"", destination:"", odometer:"" },
           { account:"1401", debit:0, credit:21240, property:"881 Newport", payee:"Home Depot",
             description:"Drywall panel", ... other fields "" } ]   // credit line names the item too (2026-09-15)
}
```

Rules the posting engine enforces (all → a thrown `PostingError` with a `code`):

| code | rule |
|---|---|
| `UNBALANCED` | Σdebit ≠ Σcredit (in cents) |
| `MIN_LINES` | fewer than 2 lines |
| `BAD_ACCOUNT` | account not in the chart of accounts |
| `BAD_AMOUNT` | a line with both debit and credit, or both zero, or negative |
| `BAD_DATE` | not a valid ISO date, or after today + 1 day |
| `OVERHEAD_ON_PROPERTY` | a 6000/7000-series line whose `property` is not `OVERHEAD` (D-010) |
| `PROPERTY_REQUIRED` | a 1000–1399-series line whose `property` is empty or `OVERHEAD` |
| `BAD_PROPERTY` | `property` not `OVERHEAD` and not in the registry passed in `ctx` |
| `PURPOSE_REQUIRED` | account 6600, 6700, 6710, 6720 with empty `business_purpose` |
| `PERIOD_CLOSED` | `period` is closed in `ctx.periods` and `source !== "void"` (adjusting entries post dated today into the open period with a memo naming the original) |

Derived fields: `period` from `date`; `cost_class` and `tax_treatment` from the account
series via `lib/coa.mjs` unless explicitly supplied.

### 3.1 Intents → entries

`buildEntry(intent, ctx)` accepts:

- **`journal`** — explicit `lines`; engine validates only.
- **`expense`** — `{type:"expense", date, payee, description, amount_cents, account,
  property, paid_from, trade?, business_purpose?, ...}` → Dr `account`, Cr the paying
  side. `paid_from` is a 1400-series bank account code, or `"PAUL"` → Cr **2030 Due to
  owner**, or `"DENNIS"` → Cr **2010 Note payable — Dennis** (a direct-paid cost is an
  advance) — in that case the caller must also supply `property`.
- **`advance`** — `{type:"advance", date, amount_cents, property, into:"1401"}` → Dr 1401,
  Cr 2010, property on both lines. (Interest accrual is Phase 1.)

`ctx = { accounts: Map<code,{name,series,...}>, properties: Set<string>,
periods: Map<"YYYY-MM","open"|"closed">, today: "YYYY-MM-DD" }`.

### 3.2 `txn_id`

`<source>-<yyyymmdd>-<first 12 hex of sha256(payee|amount_cents|description|paid_from|property)>`
where the hashed fields come from the first debit line. Deterministic, so a re-run of a
migration or a re-ingested receipt produces the same id and the writer refuses it.
Manual entries append a random 4-hex suffix if the caller passes `allow_duplicate_hash: true`
(two identical cash purchases the same day are legitimate).

## 4 · The writer (Apps Script web app)

One standalone Apps Script project, **"Recast Books Writer"**, deployed as a web app
(execute as Paul, access "Anyone"). It is the only thing that writes the workbook, and in
Phase 0 it also serves reads (a service account may take over reads later if speed
demands). Every request is `POST` JSON with `secret` in the body; compare with
`PropertiesService.getScriptProperties().getProperty("WRITER_SECRET")`. Responses are
JSON `{ok:true, ...}` or `{ok:false, error:"CODE", message}`.

First function in `Code.gs` is `setup()` — the single editor entry point (the editor's
function dropdown cannot be driven by automation). It: creates the workbook **"Recast
Books"** in Paul's Drive with every tab below, headers, frozen rows, seeds `Accounts`
from §6, seeds `Settings` and `Users` (paul@ as `owner`), seeds `Periods` with
2025-12 through the current month as `open`, generates a random `WRITER_SECRET` if none
exists, stores `SPREADSHEET_ID` and `WRITER_SECRET` in Script Properties, and logs the
workbook URL and the secret **once** for Paul to copy. Re-running `setup()` is a no-op
that logs the same URL (never creates a second workbook, never regenerates the secret).

Actions (`body.action`):

| action | body | behaviour |
|---|---|---|
| `ping` | | `{ok:true, spreadsheet_url, version}` |
| `post` | `entry` (§3) | Inside `LockService.getScriptLock()` (wait 30 s): re-check balance; refuse `DUPLICATE` if `txn_id` exists in the Journal `txn_id` column (`TextFinder`, whole cell) **or** in a `CacheService` 6 h key; refuse `PERIOD_CLOSED` from the `Periods` tab unless `source == "void"`; append one row per line; set cache key; return `{ok:true, rows:[first,last]}`. |
| `void` | `txn_id, reason, date, posted_by` | Reads the original lines, appends a mirror entry (debits↔credits) with `source:"void"`, `void_of`, `memo:"VOID: "+reason`, new `txn_id = "void-"+original`. Refuses if the original is already voided. |
| `read` | `tab, limit?, since?` | Returns `{ok:true, headers:[...], rows:[[...]]}` for `Accounts`, `Properties`, `Bank accounts`, `Vendors`, `Periods`, `Settings`, `Users`, `Journal` (Journal: last `limit` rows, default 200, or rows with `date >= since`). |
| `setPeriod` | `period, status` | `open` / `closed`; writes `closed_at`. Owner-only — the function layer enforces role; the writer trusts the secret. |
| `upsert` | `tab, key_column, row:{}` | For `Properties`, `Bank accounts`, `Vendors`, `Users`, `Settings`: insert or update by key. |

Tabs and header rows (row 1, frozen; the writer locates columns **by header name**,
never by letter):

- `Journal`: `txn_id, line, date, period, account, debit, credit, property, cost_class, tax_treatment, trade, payee, description, paid_from, doc_url, source, posted_by, posted_at, memo, reconciled_ref, business_purpose, attendee, destination, odometer, void_of`
- `Accounts`: `code, name, series, type, cost_class, tax_treatment, active, notes`
- `Properties`: `name, address, status, purchase_date, purchase_price, settlement_date, template, dennis_funded, drive_folder, notes`
- `Bank accounts`: `code, name, institution, last4, plaid_item_id, plaid_account_id, opening_balance, opening_date, active`
- `Vendors`: `canonical, aliases, entity_type, form_1099, tin_status, w9_url, default_account, notes`
- `Advances`: `advance_id, date, amount, property, source_txn_id, status, accrued_to, repaid_date, notes`
- `Periods`: `period, status, closed_at, snapshot_url, notes`
- `Settings`: `key, value, notes` — seeds: `autofile_ceiling_cents=50000`, `threshold_1099_2026=200000`, `threshold_1099_prior=60000`, `estimate_agent_pct=3`, `estimate_closing_pct=2`, `interest_rate_annual=0.09`, `stub_days_basis=30`, `dealer_status=unknown`, `cash_or_accrual=unknown`, `de_minimis_elected=unknown`, `tax_home=unknown`
- `Users`: `email, role, name, added_at` — roles `owner`, `partner`, `accountant`
- `Trips`, `Feed`: headers only (Phase 1/3)

Debit/credit are written as **numbers in dollars** (cents ÷ 100) so the sheet reads
naturally; the writer converts. Dates are written as real date values.

`appsscript.json`: `"timeZone":"America/Chicago"`, `"runtimeVersion":"V8"`,
`"webapp":{"access":"ANYONE_ANONYMOUS","executeAs":"USER_DEPLOYING"}`, oauth scopes:
spreadsheets, drive.file (creating the workbook), script.scriptapp not needed.

## 5 · Auth

**Sign-in:** Google Identity Services button in `web/index.html`, client id fetched from
`GET /.netlify/functions/books-config` → `{google_client_id, site_name}`. On credential:
`POST /.netlify/functions/books-auth {id_token}`.

`lib/auth.mjs`:
- `verifyGoogleIdToken(idToken, {clientId, fetchJwks})` — decode header, fetch
  `https://www.googleapis.com/oauth2/v3/certs` (cache 1 h in module scope), verify RS256
  with WebCrypto, check `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`},
  `aud === clientId`, `exp > now`, `email_verified === true`. Returns `{email, name, picture}`.
- `issueSession({email, role, name}, secret, ttlSeconds=43200)` → HS256 JWT.
- `verifySession(token, secret)` → payload or throws `AuthError("UNAUTHENTICATED")`.
- `requireRole(payload, roles[])` → throws `AuthError("FORBIDDEN")`.

`books-auth` looks the email up in `Users` (writer `read`, cached 5 min in module scope);
unknown email → `403 {error:"NOT_ALLOWED"}` with no session. Returns
`{session, user:{email, role, name}}`. Client stores it in `localStorage`
(`recast_books_session`) and sends `Authorization: Bearer <session>` on every call.
Every other function calls `verifySession` first. Role matrix for Phase 0: `owner` can
do everything; `partner` and `accountant` can only `read`.

## 6 · Chart of accounts seed (`lib/coa.mjs`, also seeded into `Accounts`)

From `docs/chart-of-accounts.md` with the 2026-09-11 changes. `series` is the first digit
group; `type` ∈ asset, liability, income, cogs, expense, equity.

```
1000 Purchase price · 1010 Acquisition costs · 1020 Rehab — subcontract labor ·
1030 Rehab — materials · 1040 Rehab — fixtures & appliances · 1050 Permits & inspections ·
1060 Debris & haul-off · 1100 Holding — property tax · 1110 Holding — insurance ·
1120 Holding — utilities · 1130 Holding — HOA & grounds · 1200 Financing — interest (Dennis) ·
1210 Financing — points & fees · 1220 Profit participation — Dennis · 1300 Selling — commission ·
1310 Selling — closing costs · 1320 Selling — concessions & credits · 1330 Selling — staging & marketing
   → type asset, cost_class by range (Acquisition 1000–1019, Rehab 1020–1099, Holding 1100–1199,
     Financing 1200–1299, Selling 1300–1399), tax_treatment "Inventory (held)"
1401 Cash — Citizens shared · 1402 Cash — Chase operating · 1500 Earnest money & deposits ·
1510 Escrow & holdbacks receivable → asset
2000 Accrued interest — Dennis · 2010 Note payable — Dennis · 2020 Backup withholding payable ·
2030 Due to owner (Paul) → liability
4000 Property sale proceeds · 4010 Wholesale assignment fees · 4020 Escrow holdback released ·
4030 Other income → income
5000 COGS — property released · 5010 COGS — wholesale → cogs, tax_treatment "COGS (released)"
6000 Advertising & signage · 6010 Lead generation · 6100 Contract labor — non-property ·
6200 Legal & professional · 6210 Accounting & bookkeeping · 6300 Data & research ·
6400 Software & subscriptions · 6410 Website & hosting · 6500 Office supplies & postage ·
6510 Small tools & equipment · 6600 Vehicle (actual) · 6610 Tolls & parking · 6700 Travel ·
6710 Meals (50%) · 6720 Business gifts · 6800 Insurance — entity · 6900 Taxes & licenses ·
6910 Bank & merchant fees · 6920 Dues & education → expense, cost_class Overhead, tax_treatment Expense
7000 Depreciable assets → asset, tax_treatment "Fixed asset"
9000 Owner contributions · 9010 Owner draws & distributions → equity, tax_treatment "Owner equity"
```

## 7 · Environment variables (Netlify site `recast-books`)

| var | set by | purpose |
|---|---|---|
| `WRITER_URL` | Paul, after the web app deploy | Apps Script `/exec` URL |
| `WRITER_SECRET` | Paul, copied from `setup()` log | shared secret to the writer |
| `GOOGLE_CLIENT_ID` | Paul, from Google Cloud console | GIS sign-in |
| `SESSION_SECRET` | Paul, `openssl rand -hex 32` | HS256 session signing |

Functions fail closed with `503 {error:"NOT_CONFIGURED", missing:[...]}` when any is
unset — never with a stack trace.

## 8 · Phase 0 gate (what "done" means)

1. `npm test` green; posting engine tests cover every code in §3.
2. Paul runs `setup()` once; the workbook exists with every tab and seed.
3. Paul signs in at `recast-books.netlify.app` with Google; an unlisted account is refused.
4. From the Journal page, an `expense` entry posts and appears in the workbook as two
   balanced rows; posting the same entry again is refused as `DUPLICATE`.
5. Paul closes `2026-07` on the Periods page; an entry dated in July is refused
   `PERIOD_CLOSED`; a `void` of a July entry still posts (dated today).
6. A 6400 line naming a property is refused; a 1030 line naming OVERHEAD is refused.

## 9 · Module interfaces (so the three modules can be built in parallel)

`lib/posting.mjs`
```js
export class PostingError extends Error { code; details }
export function buildEntry(intent, ctx) -> entry          // §3, §3.1; throws PostingError
export function validateEntry(entry, ctx) -> entry        // same checks, used by `journal`
export function makeTxnId(source, date, firstDebitLine, {allow_duplicate_hash}) -> string
export function periodOf(isoDate) -> "YYYY-MM"
```
`lib/coa.mjs`
```js
export const ACCOUNTS  // array of {code,name,series,type,cost_class,tax_treatment}
export function accountMap() -> Map<code, account>
export function seriesOf(code) -> "1000"|"1400"|"2000"|"4000"|"5000"|"6000"|"7000"|"9000"
```
`lib/money.mjs` — §2.

`lib/writer-client.mjs`
```js
export class WriterError extends Error { code; status }
export function createWriter({url, secret, fetchImpl = fetch}) -> {
  ping(), post(entry), void(txn_id, reason, date, posted_by), read(tab, {limit, since} = {}),
  setPeriod(period, status), upsert(tab, key_column, row) }
// each resolves to the writer's JSON body with ok:true, or throws WriterError(body.error)
// Apps Script /exec answers POSTs with a 302 to a googleusercontent URL — follow redirects.
```
`lib/auth.mjs` — §5.

Functions build `ctx` for the posting engine from three writer reads (`Accounts`,
`Properties`, `Periods`), cached 60 s in module scope; `today` from `America/Chicago`.

Function routes (all JSON; all but `books-config` require `Authorization: Bearer`):
- `GET  books-config` → `{google_client_id, site_name}` (public)
- `POST books-auth {id_token}` → `{session, user}`
- `GET  books-ledger?limit=200` → `{entries:[...grouped by txn_id]}`; `POST books-ledger {intent}` → `{entry, rows}`; `POST books-ledger {action:"void", txn_id, reason}` → `{entry}` (owner)
- `GET  books-meta?tab=Accounts|Properties|Periods|Settings|Users|Bank%20accounts|Vendors` → `{headers, rows}`; `POST books-meta {action:"setPeriod"|"upsert", ...}` (owner)

## 10 · Live resource ids (2026-09-11)

- Apps Script project **Recast Books Writer**: script id `14P4vLsFHCZPcRs1NVOvyUQTTrWJUhB_x-yrQs9NTNSQtq1-nApno9DqU`
  (https://script.google.com/d/14P4vLsFHCZPcRs1NVOvyUQTTrWJUhB_x-yrQs9NTNSQtq1-nApno9DqU/edit).
  `.clasp.json` for it is gitignored; recreate with `clasp clone <id>` or copy from the
  scratch folder. Push with `clasp push -f` from `apps-script/writer/`.
- Netlify site `recast-books`, id `048233af-83fd-4885-8b28-1e88d5623c3e`, custom domain
  `books.recast-properties.com` attached; `SESSION_SECRET` set (production contexts).
- Workbook **Recast Books**: `12QVyxm3KnLD7CDC8mFAPd5ulZuRXRluNDi4qK4BBxKM`
- Workbook **Recast Books STAGING** (D-025, Drive copy made 2026-09-17, the Phase 4 scratchpad;
  archived after cutover): `1ElTwWQ4xekYjtiXEybOuRfC28vWtkWNI5-NcjVOxWBw`
  - its bound writer (copied with the workbook): script id
    `1Hh0ppVeZepu8GClShAINt4bxNZNNxW1dzZK_xFdmlh6hQ5fCtqdwvtL5`, pushed from the repo
    2026-09-17; web-app deployment `AKfycbzXcpuGfFbKWCFXMLYbgsJVBYKj4DkOapjroT02IN2NMh-HhltmmDv-dE9DaLy8_FUXNw`
    (`WRITER_URL` on Netlify points here during staging, back to production at cutover)
  - its Drive filing folder **Recast Books STAGING**: `1jNk7O9ozdjd8YT-4y4N7YfC_WLwJVbkm`
    (set as `DOCS_ROOT_FOLDER_ID` on the staging project so nothing files into the real folder)
  (https://docs.google.com/spreadsheets/d/12QVyxm3KnLD7CDC8mFAPd5ulZuRXRluNDi4qK4BBxKM/edit),
  created by `setup()` on 2026-09-11. The writer is the only thing that writes to it.

## 11 · Gate result — 2026-09-11

All six checks in §8 passed, driven through Paul's signed-in browser: Paul signed in as
owner; `manual-20260911-4429916508de` posted as Journal rows 2–3 (6400 / 1402, $19.00);
re-posting refused `DUPLICATE`; 1030 with OVERHEAD refused `PROPERTY_REQUIRED`; with
2026-07 closed, a July-dated post refused `PERIOD_CLOSED`; the void posted rows 4–5
attributed to Paul; a second void refused `ALREADY_VOIDED`. Bug found and fixed during the
gate: Sheets auto-converted "2026-09" period text to dates (writer v0.1.1 forces text
format and repairs). `OVERHEAD_ON_PROPERTY` is covered by unit tests only — the UI cannot
yet select a property because the registry is empty until Phase 1.
- Apps Script project **Recast Books Poller**: script id `1jKtDx0eK458SP8jMKChqOBJhEegh1I6uAQeTusdFMPZhdsyddXUc0sqE`
  (https://script.google.com/d/1jKtDx0eK458SP8jMKChqOBJhEegh1I6uAQeTusdFMPZhdsyddXUc0sqE/edit).
  Runs as Paul; Gmail label `books-done`; triggers pollBooks (15 min) and dailyDigest (3 AM CT).
- Apps Script project **Recast Books Poller — properties** (2026-09-22, phase2.6-spec §1): script id
  `1k2htSsuL2JV2336uTbsT44RmTpDGhqypJunHayL6Cp-9TKaiho2JRoTZ`, owned by properties@ (paul@ is an editor;
  `clasp push -f -P .clasp-properties.json` from `apps-script/poller/`, the file is git-ignored). Same code;
  script properties `MAILBOX=properties`, `START_DATE=2026-09-17`, the same `POLLER_SECRET`; trigger pollBooks
  (15 min) only, no digest. The 09-17 listing project "Recast Books Poller (properties)" (`1jbU7…`) has no
  triggers and is left as is.
