# Recast Books — build plan

**Drafted 2026-09-11** from the 2026-08-26 architecture plan (`PLAN.md`), its adversarial
review, and Paul's answers of 2026-09-11 (decisions D-006 through D-009). This is the
plan for the thing that actually gets built. `PLAN.md` stays as the accounting design it
implements.

**Status: awaiting Paul's sign-off before any code is written.**

---

## 1 · What is being built, in one paragraph

A new bookkeeping system for Recast Properties LLC, built alongside the current one and
never touching it. A new Google Sheets workbook is the system of record. A web app at
**books.recast-properties.com**, linked from the `/admin` hub, is the front door: upload
receipts, bank statements and settlement statements; connect bank accounts; review what
the bookkeeper held; add a property; record Dennis's advances; run the monthly close;
read the balance sheet, P&L, per-property job cost, Dennis's loan ledger, and the
accountant's packet. **Claude is the bookkeeper.** It reads every document, decides what
it is and where it posts, matches bank lines, and calls deterministic code for the
things code must own: arithmetic, the balanced double entry, duplicate identity, the
posting gate, period locks. Paul keeps using the old workbook and the old receipts
bookkeeper until the parallel run proves the new one, then the old workbook goes
read-only and is archived, never deleted.

## 2 · The accounting model

Taken from `PLAN.md` and `docs/chart-of-accounts.md`, with the 2026-09-11 changes.

**Double entry, not a flat expense list.** Every transaction is a journal entry with at
least two lines that sum to zero. This is the one place the build departs from the
2026-08-26 plan's 22-column single-entry ledger, and it is what makes a real balance
sheet, cash-per-account, and reconciliation fall out automatically instead of being
assembled. The 22 columns survive as attributes on the lines. Claude never has to
construct a balanced entry: it states an intent ("Home Depot, $212.40, rehab materials,
1616 Granite, paid from Citizens") and code produces the two lines.

**The release rule stands.** Property costs accumulate in the 1000s while held. On the
settlement date the whole balance moves to 5000 COGS. Year-end inventory is a filter.

**Dennis (D-006).** Lender and financial partner, not a member.

| What | Account | Behaviour |
|---|---|---|
| Advance received | 2010 Note payable — Dennis | Dr cash, Cr 2010. One row per advance in the `Advances` tab, tagged to a property (split allowed). |
| Interest accrual | 2000 Accrued interest — Dennis / 1200 Financing — interest (property cost) | 9% ÷ 12 = 0.75% per advance per month, compounding on each advance's **own monthly anniversary**; stub days at payoff pro-rated on the current month's day count. Posted monthly by the close job. |
| Repayment at sale | 2010 / 2000 | Principal plus accrued interest for that property, cleared from settlement proceeds. |
| Profit share | 1220 Profit participation — Dennis (property cost, released to COGS) | 50% of the property's net profit after all 1000s including interest. Paid at settlement. Not equity. |

**Advance mechanics (D-010).** Interest starts the day the money lands in the shared
Citizens account. Each advance is dedicated to one property and sits on **that
property's balance sheet** as a liability; a deposit meant for two properties is two
advances. There is no pooled loan, and no separate advances ledger for people to read — the
`Advances` tab is internal; every advance is displayed on its property's balance sheet
(D-011). Interest on **every** advance, purchase principal or cash advance, is a cost of
the property it funds, so both partners bear it through the split (D-011). The accrual
rule is reproduced to the cent against the live 881 Newport tab in
`docs/property-tab-anatomy.md`: 0.75% compounded on each advance's monthly anniversary,
stub days pro-rated over a 30-day month.

**Paul.** 9000 Owner contributions, 9010 Owner draws, **2030 Due to owner** for every
cost he paid personally in 2026 until the Chase account reimburses him. The `paid_from`
attribute on every line is what makes that balance knowable.

**Overhead (D-010).** RECAST BIZ-type costs post to the 6000s with `property = OVERHEAD`
and are Paul's alone. This is a rule, not a setting: no overhead ever touches a property
balance sheet or the 50/50 waterfall. The posting engine refuses a 6000-series line that
names a property, and a 1000-series line that names OVERHEAD.

**Tax questions the accountant has not answered** (tax home, dealer/investor,
cash/accrual) are **settings**, not blockers. `tax_treatment` and `cost_class` on each
line are derived by formula from account plus the settings, so an answer is a recompute.

**Vehicle (D-009, D-010).** Gas and truck expenses stay as they are: actual costs to
6600, overhead, Paul's. A `Trips` tab is available for the business-use percentage the
accountant will want, but it does not gate anything.

## 3 · Architecture

```
                    books.recast-properties.com  (new Netlify site, repo: Recast-books)
                    ┌──────────────────────────────────────────────────────────────┐
  Google sign-in ──►│ web app (static HTML/JS, same kit.css as the admin site)      │
  allowlist+roles   │  Dashboard · Inbox/Review · Properties · Dennis · Banking ·   │
                    │  Vendors/1099 · Close · Reports · Settings                    │
                    └───────────────┬──────────────────────────────────────────────┘
                                    │ netlify/functions/*  (verify Google ID token, role)
   receipts@ / travel@ ─ poller ─►  │
   web upload (receipt, statement,  │   ┌────────────── the bookkeeper ──────────────┐
   ALTA, W-9) ─────────────────────►│──►│ Claude (Opus 5) + tools, adaptive thinking  │
   Plaid /transactions/sync ───────►│   │ zoom · read_ledger · find_vendor ·          │
                                    │   │ find_property · search_feed · web_search ·  │
                                    │   │ propose_entry · match_feed_line · hold      │
                                    │   └───────────────────┬─────────────────────────┘
                                    │                       │ intent
                                    │   ┌───────────────────▼─────────────────────────┐
                                    │   │ posting engine (deterministic)              │
                                    │   │ balance the entry · txn_id · dedupe ·       │
                                    │   │ autofile gate · period lock · 1099 block    │
                                    │   └───────────────────┬─────────────────────────┘
                                    ▼                       ▼
        Netlify Blobs (queue state,     Apps Script writer (ScriptLock, single
        Plaid tokens, run logs)         serialized append/update/void) ──► Workbook
                                                                             │
        Google Drive "Recast Books" folder ◄── every source document, filed  │
        by property / year, linked from the journal line                     ▼
                                                  Google Sheets: Journal · Accounts ·
                                                  Properties · Vendors · Advances ·
                                                  Bank accounts · Feed · Periods ·
                                                  Trips · Settings · report tabs
```

**Why these choices**

- **Sheets as system of record.** Paul's preference and D-001. Paul and the accountant
  can open the books without the app. Volume is a few hundred entries a month, well
  inside Sheets' comfort.
- **One serialized writer.** The proven pattern from `receipts-sheet.gs`: every write
  goes through one Apps Script web app behind a ScriptLock, so duplicate detection
  cannot race. The functions read the workbook directly through the Sheets API for
  speed; they never write to it directly.
- **Claude directs, code executes.** The bookkeeper is a tool-using agent, not a
  one-shot classifier — the 2026-09-09 receipts rework already proved this shape. The
  model's verdict must always have a verb downstream (post, hold, supersede, dismiss,
  match, split). Code owns arithmetic, identity, and gates, and the UI shows which was
  which on every entry.
- **Plaid** for feeds (D-007). Paul connects each bank himself inside Plaid Link; no
  bank credential ever reaches this system. Statement PDF upload remains for anything
  Plaid cannot reach and as a reconciliation cross-check.
- **Separate Netlify site.** A deploy here cannot break the listings or Jennifer.
- **Drive for documents.** Permanent, browsable by the accountant, one folder per
  property per year. Blobs hold only processing state.
- **Google sign-in.** Email allowlist in `Settings` with a role per person.

**Service accounts and scopes.** The existing service account with domain-wide
delegation (used by `email-setup.mjs`) gains Sheets, Drive and Gmail-read scopes, or a
second one is created for the books. Paul authorizes the scopes in the Workspace admin
console — a one-time click.

## 4 · The workbook

| Tab | Written by | Contents |
|---|---|---|
| `Journal` | writer only | One row per line: `txn_id`, `line`, `date`, `account`, `debit`, `credit`, `property`, `cost_class`*, `tax_treatment`*, `trade`, `payee`, `description`, `paid_from`, `doc_url`, `source` (receipt / feed / manual / migration / close), `posted_by` (claude / paul / system), `posted_at`, `period`, `reconciled_ref`, `business_purpose`, `attendee`, `destination`, `odometer`, `void_of`. *derived by formula. |
| `Accounts` | Paul via app | Chart of accounts from `docs/chart-of-accounts.md`, plus 1220, 2030. |
| `Bank accounts` | app | One row per 1400 sub-account: name, institution, last4, Plaid item/account id, opening balance and date. |
| `Properties` | app | Registry: name, address, purchase date, price, status (held / under contract / sold), settlement date, ALTA url, template (light / heavy), Dennis-funded. **The allowlist** — nothing posts to a property not here. |
| `Vendors` | app | Canonical name, aliases, entity type, 1099 type, TIN status, W-9 url, default account. |
| `Advances` | app | Dennis: date landed in Citizens, amount, **one property**, source feed line, status, accrued-to date, repaid date. |
| `Feed` | Plaid sync | Every bank line: id, account, date, amount, name, merchant, match status, `txn_id`. |
| `Periods` | close job | Month, status (open / closing / closed), closed_at, snapshot url, open-items tolerance result. |
| `Trips` | app | Date, from, to, miles, purpose, property. Business-use % for 6600. |
| `Settings` | Paul via app | Autofile ceiling, 1099 thresholds by year, `dealer_status`, `de_minimis_elected`, `cash_or_accrual`, `tax_home`, login allowlist and roles. |
| Report tabs | formulas | Trial balance, balance sheet, P&L, property job cost, loan ledger, 1099 worksheet, reconciliation status. Read-only views; the app renders the same from the API. |

**Period locking** is by the `period` column, not by row range: the writer refuses any
line dated into a closed period unless it is flagged as an adjusting entry, which posts
into the current period with a memo naming the original. A closed period also gets a
dated snapshot copy of the workbook in Drive.

**`txn_id`** is `<source>-<yyyymmdd>-<hash of payee|amount|description|paid_from>`, stable
across re-runs. The writer holds a lookup of every id and refuses a repeat. Human
approve is the only bypass.

## 5 · The web app, page by page

Same visual kit as the admin site. Mobile-usable, because receipts arrive from a phone.

1. **Dashboard** — cash per account today, what Recast owes Paul, Dennis's balance,
   properties held at cost, items waiting for review, feed lines unmatched, days to next
   close, 1099 payees over threshold without a W-9.
2. **Inbox / Review** — the exception lane. Every held item with the bookkeeper's
   why-note, the document beside it, and one-tap verbs: approve, fix, split, reassign
   property, dismiss. Bulk-safe actions only where the plan says they are safe.
3. **Upload** — drag or photograph a receipt, statement, settlement statement or W-9.
   The bookkeeper reads it within a minute. Tagging a property is optional; Claude routes.
4. **Properties** — add a property (registry row, Drive folder, both templates as
   generated views). Per property: a **property balance sheet** (costs capitalized as
   assets; Dennis's principal and accrued interest as liabilities; the net), job cost by
   cost class and trade, documents, status. **Sell wizard:** upload the ALTA, confirm
   the settlement lines, release 1000s to COGS, compute the waterfall, post it, and
   produce the **Payout report** (below).
5. **Dennis** — the loan ledger: every advance, accrued interest to date per property,
   payoff as of any date, history of repayments. This page is Dennis's read-only view.
6. **Banking** — connect accounts (Plaid Link), see each account's feed, match status,
   and reconciliation per month. Unmatched lines carry Claude's proposal. Statement
   uploads land here too.
7. **Vendors / 1099** — canonical vendors, alias merges proposed by Claude, YTD paid by
   tax year against the year's threshold, W-9 status, TIN check status, the
   payment-side block.
8. **Close** — the second-Friday checklist pre-computed: unmatched feed lines, held
   items, unposted interest, open-items tolerance, then lock. The 3am digest gains a
   monthly variant.
9. **Reports** — trial balance, balance sheet, P&L (with property vs overhead), property
   job cost, loan ledger, 1099 worksheet, reconciliation report, and **Accountant
   packet** as one export (PDF plus the Journal as CSV in QuickBooks import shape).
10. **Settings** — the `Settings` tab with guardrails, login allowlist, model and cost
    counters.

### The Payout report (required, added 2026-09-11)

When a property sells, the system produces one report that says exactly who gets paid
what. Three payees, every time: **Paul**, **Dennis**, and the **shared Recast account**.
It is generated from the ledger, not typed, and it is printable and shareable with
Dennis as a PDF.

**Two versions (Paul, 2026-09-11).** A **preliminary payout** is available any time a
property is held or under contract; it uses the estimate percentages in `Settings`
(today 3% agent, 2% closing) and is clearly stamped PRELIMINARY. The **final Payout
report** exists only after the title company's settlement statement is uploaded. Claude
reads the statement, maps every line to an account, and the actuals replace the
estimates. The final report must tie to the settlement statement's net-to-seller figure
to the cent, or the sale does not post. The estimate percentages never appear on a final
report.

```
PAYOUT — <property>  FINAL            settlement <date>   settlement statement attached
─────────────────────────────────────────────────────────────────────────────
Sale price                                                       $ 775,000.00
  less selling costs netted on the ALTA (commission, closing,
       concessions, payoff of anything on title)                 (  81,000.00)
Net proceeds received                                            $ 694,000.00

Project cost (every 1000-series line on this property)
  Purchase price and acquisition                                 $ ...
  Rehab (labor, materials, fixtures, permits, haul-off)            ...
  Holding (tax, insurance, utilities, HOA)                         ...
  Financing — Dennis's interest accrued through settlement         ...
  Selling costs (from above)                                       ...
Total project cost                                               $ ...
Net profit                                                       $ ...

WATERFALL
 1. Dennis — principal repaid (each advance listed, date, amount)   $ ...
 2. Dennis — interest, 9% compounded on each advance's anniversary,
    stub days pro-rated to the settlement date                     $ ...
 3. Reimbursements — costs fronted by a payer other than Dennis's
    advances: the shared Recast account, Paul personally (2030)     $ ...
 4. Net profit split 50 / 50
      Dennis                                                       $ ...
      Paul                                                         $ ...

PAYOUTS
  Dennis        principal + interest + 50% share                 $ ...
  Paul          50% share + personal reimbursement               $ ...
  Shared Recast account   reimbursement of costs it fronted
                          + reserve held back (if any)           $ ...
─────────────────────────────────────────────────────────────────────────────
  Total payouts = net proceeds received                          $ ...  ✓ ties
```

Rules the report enforces in code: the three payouts must sum to net proceeds to the
cent or the wizard will not post; overhead never appears (D-010); every number links to
the journal lines behind it; Dennis's interest schedule is shown advance by advance so
he can check it. Posting the wizard writes the release entry, the payoff entries, the
profit-participation entry, the reimbursements, and the owner's draw, all dated the
settlement date, and stamps the property `sold`.

**Open (2026-09-11), Paul:** what the shared Recast account's line consists of. Default:
reimbursement of any property cost it paid that did not come from Dennis's advance money,
plus an optional reserve Paul enters on the wizard to leave in the account for the next
purchase.

## 6 · The bookkeeper's jobs

Each is a job behind the same gate with its own hold lane (D-003). Model: Claude Opus 5
for every posting decision; a cheaper model only for pre-parsing bulk statement text
into lines, never for a judgment. Every job keeps a golden set and re-runs it whenever
the prompt or model changes.

| Job | Reads | Decides | Code owns |
|---|---|---|---|
| Receipt | email or upload, attachments, `read_ledger`, `find_vendor`, `find_property`, web | itemization, vendor, account, property, trade, tax, business purpose draft, duplicate verdict | subtotal reconcile, balanced entry, dedupe, ceiling, §274(d) hold, 1099 block |
| Feed line | Plaid line, receipts posted ±5 days, vendor history | match to an existing entry, or propose account/property for an uncovered charge, or flag a transfer between own accounts | match uniqueness, amount equality, proposal above ceiling → hold |
| Statement PDF | upload | parse lines, reconcile against feed and ledger for the period, name every difference | totals tie-out; variance halts the close |
| Advance | feed line into Citizens, or Paul's entry | recognise a Dennis deposit, propose which property it is for | 2010 entry on that property, anniversary schedule from the deposit date |
| Interest accrual | `Advances`, calendar | nothing — pure math | 0.75%/month compounding on anniversary, stub pro-rating, one entry per advance per month |
| Settlement | ALTA PDF, property job cost | map every ALTA line to an account; spot netted costs that never hit a bank | release rule, waterfall arithmetic, balanced multi-line entry |
| Vendor hygiene | `Vendors`, journal payees | alias merges, entity type from a W-9, 1099 applicability | threshold by year, TIN presence block |
| Close narrative | the month's journal and distributions | plain-English what moved and why, distribution shifts vs prior month and year | row counts and totals per account and property (the control that catches systematic misclassification) |

**Autofile gate**, all seven conditions from `docs/policies.md`, with the ceiling set at
**$500** unless Paul changes it. Travel, meals and gifts never autofile.

## 7 · Build phases

Each phase ships something Paul can use, has a gate, and gets his go before the next.
Order is chosen so that value arrives early and migration happens once, late, against
a proven system.

| # | Phase | Delivers | Gate |
|---|---|---|---|
| 0 | **Foundations** | Repo restructure; new workbook shell with tabs, COA and settings; service account scopes; Netlify site and `books.` DNS; Google sign-in with roles; Apps Script writer with lock, `txn_id`, period check; posting engine with balanced entries. | Paul signs in; a manual entry posts, a duplicate is refused, a closed-period post is refused. |
| 1 | **Ledger core** | Properties (add one), Vendors, Bank accounts, manual journal entry, Dennis `Advances` with accrual engine, all reports from the journal. | Reports tie: TB balances; BS = P&L + equity; the accrual engine reproduces the existing cash-advance tab to the cent on Paul's real advances. |
| 2 | **Receipt bookkeeper v2** | Gmail poller on receipts@/travel@ under its own label, plus web upload; Claude director with the tools above; Inbox/Review; morning digest. Writes only to the new workbook. | Golden set of 30 receipts from the live system: every autofile decision matches or is judged better by Paul; zero duplicates across the twin set. |
| 3 | **Banking** | Plaid Link, sync, Feed tab, matching job, proposals, per-account monthly reconciliation, statement PDF upload as cross-check. | One full month of Citizens reconciles with every line matched or explained. |
| 4 | **Migration** | One-time clear of the new workbook (D-013); Phase 0 snapshot of the old workbook (dated copy in Drive, block totals recorded); 2a faithful copy of every property tab, RECAST BIZ block, and the cash-advance tab as journal entries with `source = migration`; 2b logged corrections; opening balances; Due-to-Paul ledger built from every Paul-paid row. | 2a: every property total, net profit and RECAST BIZ block total matches the baseline to the cent. 2b: sum of dated corrections explains the entire difference. |
| 5 | **Close, 1099, packet, sell wizard** | Monthly close with lock and snapshot (OVERHEAD lines only; a property locks at sale with a Dennis interest true-up, post-sale costs to COGS, partner adjustment balance — D-015); 1099 module; accountant packet export; Sell wizard with the **Payout report**; Dennis and accountant read-only views. | A dry-run close of the prior month passes; a past sale (Ashburne) re-run through the wizard reproduces the recorded outcome. |
| 6 | **Parallel run and cutover** | Both bookkeepers run for 14 days; daily diff of row count, dollar total, per-account and per-property distribution. | 14 consecutive days of zero unexplained variance. Then: old workbook read-only, archived; old poller off; new one live. |

**Guardrails, every phase:** nothing ever writes to the old workbook; every script dry-runs
and reports before applying; the writer backs up before its first write of the day;
totals are verified twice by different paths; a tie-out that fails stops and reports,
never guesses.

## 8 · How the work gets done

Claude Fable orchestrates, specifies, reviews, and QAs. Cheaper models write the bulk of
the code from written specs.

- **Per module:** Fable writes the spec (interface, tests, acceptance). A Sonnet-class
  agent implements in an isolated worktree. Fable reviews the diff, runs the tests and
  the dry runs, and either merges or sends it back with findings. Nothing ships unreviewed.
- **Bulk passes** (fixtures, golden-set adjudication drafts, CSV parsing, migration
  parsers for the two templates) go to the cheapest model that passes the tests.
- **Judgment code** — the bookkeeper's prompts and tools, the posting engine, the
  accrual engine, the migration tie-out — Fable writes or line-reviews itself.
- **Paul's touchpoints:** sign-off on this plan; the Workspace and Google Cloud clicks in
  Phase 0; creating the Plaid account (Claude cannot create accounts); connecting banks in
  Plaid Link; adjudicating the golden set once; the phase gates.

## 9 · Costs

| Item | Estimate | Note |
|---|---|---|
| Claude API | a few dollars a day at current volume | Opus 5 with tools per document; the receipts system today is the reference |
| Plaid | pay-as-you-go, low tens of dollars a month for three accounts | confirm at signup; production access needs Plaid's approval, usually days |
| Netlify second site | $0 on the existing plan | functions and Blobs usage are small |
| Google Workspace, Drive, Sheets | already paid | |
| PDF.co | already on the books | statement PDFs |

## 10 · What I need from Paul before Phase 0 starts

1. ~~Advance mechanics and overhead~~ — answered 2026-09-11 (D-010, D-011).
2. Dennis's and the accountant's Google email addresses for the allowlist.
3. Access to add a DNS record for `books.recast-properties.com` (or confirm DNS is at Netlify).
4. A Plaid developer account, created by Paul, with the client id and secret set as
   Netlify environment variables. I will send the exact steps.
5. The Workspace admin click authorizing the service account's Sheets, Drive and Gmail
   read scopes, when I hand him the scope list.
6. ~~Cash-advance tab~~ — superfluous; property tabs are authoritative (D-011).

## 11 · Explicitly not in this build

- Payroll, invoicing customers, sales tax filing — Recast has none of these.
- Editing the old workbook, ever.
- A tax return. The packet is for the accountant to prepare it.
- Segregation of duties. Not achievable here (D-005); the substitute is the quarterly
  trial balance to the accountant, which the packet produces.
