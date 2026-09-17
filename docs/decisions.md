# Decision log

Append-only. Each entry records what was decided, when, by whom, and why — so a later
session does not silently reverse it. Reversing a decision means adding a new entry
that supersedes the old one, not editing history.

---

## D-001 · Books stay in Google Sheets — 2026-08-26 · Paul

**Decided:** Not moving to QuickBooks Online.

**Context:** Full case was made for QBO — automatic bank feeds (which would close the
biggest structural gap), native 1099 tracking and e-filing, double-entry enforcement,
period locking, edit audit trail, free accountant access, ~$140/mo after the August
2026 price increase. Recommendation was to set it up backdated to Jan 1 2026 so the
year would close in one system.

**Paul's call:** No.

**Consequences accepted:** No double-entry enforcement, no period locking, no edit
audit trail, no native 1099 e-filing, no bank feeds. Substitutes are the tie-out
discipline (verify twice by different paths, halt on variance), protected ranges plus
dated snapshots for period locking, and a filing service or the accountant for 1099s.
The reconciliation layer becomes a build (Phase 4) rather than a switch.

**Hedge:** The flat GL schema is kept in the exact shape QBO and Xero import natively.
This costs nothing now and makes the decision reversible as an export rather than a
rebuild.

**Revisit if:** a third partner joins, an audit opens, or the accountant asks for
something the sheet cannot produce. Not before.

---

## D-002 · Keep both property templates — 2026-08-26 · Paul

**Decided:** The light and heavy property tab templates both stay.

**Context:** An early draft of the plan proposed collapsing them into one standardized
template. Paul corrected: the difference is deliberate. Some projects are light, some
much more involved.

**The data backs him up:** 104 Ashburne was a $156,543.72 rehab across ~14 trades.
136 Bowling Green was $2,780.91. 881 Newport $2,431.16. 280 Sparkling $2,402.47.
1616 Granite $10,727.97. A 14-block trade breakdown on a $2,400 paint-and-clean job is
all overhead and no signal.

**What standardizes instead:** only the reporting contract — property name in a fixed
cell, one summary vocabulary across both templates, light as a strict subset of heavy
so a creeping project upgrades additively. Layouts are untouched.

**Note:** the line-item roll-up already works across both layouts. The contractor
totals in `data/vendors-1099-2026.md` were computed by a scanner that knew nothing
about either template — both already share the thing that matters, 4-tuples of
(payee, date, description, amount) in that order.

---

## D-003 · Agent layer extends the existing bookkeeper — 2026-08-26 · Claude, Paul agreed

**Decided:** No new monolithic "accountant agent". Jobs get added behind the existing
receipts-bookkeeper gate one at a time, each with its own Pending lane and why-note.

**Rationale:** The receipts bookkeeper already is an accountant agent — it reads,
itemizes, decodes SKUs, categorizes, scores confidence, files what it is sure of and
escalates what it is not. Building a second thing alongside it produces something that
cannot be debugged and will not be trusted.

---

## D-004 · Bank statements are uploaded, not fed — 2026-08-26 · Paul

**Decided:** Reconciliation input is Paul uploading/forwarding statements to a new
`statements@` channel, through the same poller / Blobs / queue-page path receipts
already travel. The agent facilitates matching.

**Rationale:** Follows from D-001 (no QBO means no bank feeds). Reuses infrastructure
that already exists and is proven, including the PDF.co subscription already on the
books for PDF parsing.

---

## D-005 · Segregation of duties is NOT achieved — 2026-08-26 · Claude, correcting itself

**Decided:** Stop claiming the agent design preserves segregation of duties. It does
not, and no design internal to the system creates it in a two-person shop with one
bookkeeper and one automation.

**Substitute:** quarterly external review — the accountant reviews the trial balance
every quarter using a deliverable the plan already produces. Cuts detection lag from
twelve months to three.

**Internal control that actually works:** distribution monitoring (row count and dollar
total per account and per property, month over month and year over year), not anomaly
detection. A systematic misclassification is never an outlier, so an outlier detector
is structurally blind to the error shape that costs the most.

**Raised by:** the agentic-automation skeptic in the 2026-08-26 adversarial review.
The original claim was Claude's and it was wrong.

---

## D-006 · Dennis is a lender and financial partner, not a member — 2026-09-11 · Paul

**Decided:** Dennis Little is not a member of Recast Properties LLC. He is a financial
partner and lender. This answers Q-2.

**Terms, stated by Paul:** Dennis advances the cash for purchases and rehab. Advances
accrue **9% interest, compounding monthly on each advance's own monthly anniversary**.
(Rate corrected to **8%** by D-016, 2026-09-14; the method stands.)
When a property sells, proceeds first repay Dennis's principal plus accrued interest on
what he advanced for that property, then the remaining profit is split **50/50**.

**Bookkeeping consequence:** Dennis's principal is a note payable (2010), accrued
interest is a liability (2000), interest is a financing cost of the property (1200),
and his 50% is a profit-participation cost paid at settlement — not equity. The 9000
series is Paul's owner equity only; "member" language is dropped. The interest suspense
routing proposed in the 2026-08-26 review is no longer needed.

**Accountant still has to rule on:** whether a 50/50 profit share with a non-member
lender is treated as a partnership for tax purposes regardless of LLC membership, and
how Dennis's interest (1099-INT) and profit share are reported. The books are built so
either answer is a remap, not a rebuild.

---

## D-007 · Plaid bank feeds in the first build — 2026-09-11 · Paul

**Decided:** Connect bank accounts through Plaid. Supersedes the upload-only half of
D-004; statement upload stays as the fallback and as the source for accounts Plaid
cannot reach.

**Accounts:** Paul's personal checking (being retired from the business — all 2026
personal-paid expenses to be reimbursed), the shared Recast account at Citizens
National Bank of Texas (Dennis-funded property money), and a Chase business checking
being opened for Recast operating expenses that do not involve Dennis.

**Consequence:** every expense row records which account paid it, and the ledger can
say what Recast owes Paul at any date (2030 Due to owner).

---

## D-008 · New system, separate site, code lives in this repo — 2026-09-11 · Paul

**Decided:** Build the bookkeeper as a completely new and separate system. Paul keeps
using the existing workbook and receipts bookkeeper until it is built. The web app
deploys as its own Netlify site at a `books.` subdomain of recast-properties.com,
linked from the `/admin` hub. The application code lives in `Recast-books/` (this repo
stops being docs-only). No deploy of the new system touches the public site or the
scheduler.

**Login:** Google sign-in with an email allowlist and roles — Paul full access, Dennis
read-only on his loan ledger and project results, the accountant read-only on
everything. Not the shared `ADMIN_PASSWORD`.

**History:** all of 2026 is copied into the new system under the faithful-copy-then-
corrections gates. Nothing in the old workbook is ever deleted.

---

## D-009 · Vehicle: actual expenses on Dennis's truck — 2026-09-11 · Claude, Paul to confirm with accountant

**Fact:** Paul drives Dennis's truck and pays its gas and repairs. He does not own or
lease it. The standard mileage rate requires an owned or leased vehicle, so mileage is
not available. Answers Q-5 for now: **actual method, business-use percentage**, which
still requires a trip log to substantiate the percentage. Accountant question: whether
a written lease from Dennis would open the mileage method.

---

## D-010 · Advance mechanics and overhead — 2026-09-11 · Paul

**Advances.** Interest on a Dennis advance starts the day the money lands in the shared
Citizens account, not when it is spent. Every advance is dedicated to one specific
property and is carried on **that property's balance sheet** as a liability (2010
principal, 2000 accrued interest). There is no pooled loan. A deposit meant for two
properties is entered as two advances.

**Overhead (Q-6).** Business expenses are separate from every property balance sheet and
Paul pays them alone. Not a setting — a rule. No overhead is ever allocated to a
property or enters the 50/50 waterfall.

**Vehicle.** Gas and truck expenses stay as they are: actual costs, overhead, Paul's.

---

## D-011 · All Dennis interest is a project cost — 2026-09-11 · Paul

**Decided:** Interest on every Dennis advance — purchase principal and cash advances
alike — accrues as a financing cost of the property it funds (1200), repaid before the
50/50 split. Paul therefore bears half through the smaller profit. Supersedes the old
tab's practice of charging cash-advance interest to Paul alone (881 Newport, $31.13).

**Also:** the old workbook's separate cash-advance tab was superfluous. Advances live on
each property's balance sheet and nowhere else. Migration reads that tab only as a source
of historical advance dates and amounts, then attributes each to its property; the
property tabs are authoritative where the two disagree.

**Exception:** money Dennis lends Paul personally, not for a property, is outside
Recast's books.

---

## D-012 · The bookkeeper decides the easy cases itself — 2026-09-11 · Paul

After the first dry run held three items a bookkeeper should have settled, Paul: "the
system should have known what to do... this is all basic stuff."

**Decided:**
1. **Travel between PDX and DFW is business travel.** Flights, airport rideshares, baggage,
   in-flight Wi-Fi post to 6700 with a business purpose the bookkeeper writes at ingest
   (that note is the contemporaneous §274(d) record). Meals (6710) and gifts (6720) still
   wait for Paul. Supersedes the 2026-08-26 review's "travel never autofiles".
2. **A confident dismiss is final.** Promotions, points statements, $0 notices: when the
   model says dismiss with high confidence, the document is dismissed. Only a hesitant
   dismiss waits.
3. **Duplicates are recognised by invoice number.** The model extracts the vendor's
   invoice/receipt/order number; a posted entry carrying the same number for the same
   vendor is a duplicate and is dismissed by code. Same payee/date/total with different
   invoice numbers are two real charges. A fresh ledger read happens right before any
   post, so two copies processed in parallel cannot both post.

**Why:** the model's verdict must become the action, and a rail must never hold a
document while ignoring a fact the system already has (`claude-judgment-not-scripts`).

## D-013 · The books are cleared once, at migration — 2026-09-12 · Paul

Everything posted before Phase 4 is test or parallel-run data in a workbook that is not
yet the system of record. The append-only ledger rule protects real books; it does not
apply to the trial period.

**Decided:** the first step of Phase 4 is a one-time clear of the new workbook's Journal,
Inbox and Documents records and the test files in Drive. Then history is migrated from
the old workbook, and receipts processed since 2026-09-11 are replayed from their
documents. After that the Journal is append-only for good; corrections are voids.

**Why:** Paul: "not a button. just a step in the migration. when we decide to migrate we
clear the books one time." No reset exists in the app, and none will be built.

## D-014 · An unidentified payer is held for Paul, never defaulted — 2026-09-12 · Paul

The phone-upload gate check posted a FedEx receipt whose card line was cut off; the model
fell back to the Settings default (1402 Chase) as the prompt told it to. Paul had paid on
his personal Visa. Paul: "for the issue of not knowing which account something was paid
from, that should be a flag for my review to assign it to a bank account."

**Decided:** when nothing on the document identifies the payer, the model reports
`paid_from = UNKNOWN`. The gate holds the document with reason `PAYER_UNKNOWN`; Paul
picks the bank account (or PAUL / DENNIS) on the Inbox card and approves. There is no
default paying account; Settings `default_paid_from_overhead` / `default_paid_from_property`
are no longer read. Everything else about the verdict (vendor, total, account, property,
duplicate check) is decided by the model as before, so the only thing Paul supplies is the
one fact the document lacked.

**Why:** the paying account is a fact, not a judgment, and a wrong one misstates a bank
balance and Due to owner at the same time. A default is a guess dressed as a rule.

## D-015 · Two locks: overhead by period, a property at sale — 2026-09-14 · Paul

Paul asked whether the year can be one period, since properties straddle quarters and
Dennis's interest never matches his figure until they reconcile at the sale. The tax
period is the calendar year (Schedule C); closes are habits, not rules.

**Decided:**
1. **Overhead locks by period.** OVERHEAD lines reconcile against the operating account's
   statement monthly and are locked monthly or quarterly, Paul's choice. The period lock
   applies to OVERHEAD lines only.
2. **A property locks at sale.** Property lines are never blocked by a period lock; the
   property stays open across every month it is held. The sell wizard (Phase 5) closes it
   in one pass: Paul enters Dennis's interest figure, code posts one **true-up** entry for
   the difference (dated at settlement, to that property's 1200 / 2000), costs release to
   COGS, the payout report ties to the settlement statement, and the property is locked.
   After that the writer refuses any line naming the property except:
3. **Post-sale costs.** A bill that arrives after the sale (final utilities, a late
   contractor invoice) posts to 5000 COGS with the property's name, dated the day it
   arrives, flagged post-sale. It never touches the 1000s or the closed payout. The
   bookkeeper posts these itself when the address is a sold property; the job-cost report
   shows them in their own section under the sale.
4. **Partner settlement of post-sale costs — option 2.** Dennis's share of any post-sale
   cost (per the waterfall) accrues on a running per-partner adjustment balance and is
   settled as one line on the next sale's payout report. No re-issued payout, no
   immediate transfer. Paul may ignore trivial amounts by leaving them there.

**Why:** the ledger already separates the two populations (D-010: overhead never names a
property; property costs never name OVERHEAD), so two independent locks cost nothing.
Dennis's figure is the authority for interest at the sale; the monthly accruals are
estimates and the true-up is the standard way to reconcile an estimate. Post-sale costs are
routine in this business and must not reopen a closed sale.

**Follow-up:** Paul to send one property's interest calculation from Dennis so the monthly
accrual convention can be matched and the true-up made near zero.

## D-016 · Dennis's rate is 8%, not 9% — 2026-09-14 · Paul

Paul sent two of Dennis's own interest figures ($279,001.00 from 2026-04-07 to 07-27 =
$6,873.90; $196,850.50 from 06-02 to 08-06 = $2,809.57). Fitted against every common
convention: only **8% compounded on the monthly anniversary with stub days simple** comes
within a few dollars of both; 9% is off by hundreds. That is the accrual engine's method
at a different rate. Paul: "it's 8%. i was using 9% as a hedge. make it accurate."

**Decided:** `interest_rate_annual` = 0.08 (Settings tab, code defaults, writer seed).
D-006's method is unchanged. The few dollars of residual are the true-up's job (D-015).
No posted accruals needed re-posting: the only accrual in the books is the voided Phase 1
gate test.

## D-017 · Property status is Held or Sold — 2026-09-14 · Paul

"Under contract" meant a buyer under contract, not acquisition, and the form never said
which; Paul: "statuses should be Held or Sold." **Decided:** status is `held` (owned, open:
costs post, interest accrues, its mailbox is watched) or `sold` (settled, locked per
D-015). A buyer's contract is a fact on the property — optional `contract_price` — which
the preliminary payout uses when present. Anything not `sold` is treated as held (so the
one legacy "under contract" row keeps working until edited). Sold properties leave the
posting allowlist, which they had not before (latent bug fixed).

## D-018 · API credits are prepaid; usage is expensed monthly by workspace — 2026-09-14 · Paul

Paul: "i want to split where these charges are being logged so i know what each is
costing me and to more accurately log." An Anthropic receipt is a credit top-up and never
says which system spent the money, and the Console splits dollars only by workspace.

**Decided:**
1. Each Claude workload runs in its own Anthropic Console workspace with its own key:
   **Recast Books**, **Receipts (old site)**, **Title Search**, and **Anything else** /
   Default. The workspace is the marker.
2. An Anthropic top-up or auto-reload receipt posts to **1520 Prepaid API credits**
   (asset, overhead), not 6400. The bookkeeper's prompt says so.
3. On the 2nd of each month code pulls Anthropic's cost report for the prior month,
   grouped by workspace, and posts one entry dated the last day of that month: a debit
   per workspace to the account in Settings `api_cost_account:<workspace>` (Recast Books
   and Receipts → 6210 Accounting & bookkeeping; Title Search → 6300 Data & research;
   anything else → 6400), one credit to 1520. `/api/api-costs`, triggered by the paul@
   poller's digest run; a month already posted is skipped. No model judgment: the split
   is Anthropic's number and the mapping is a setting.
4. 1520's balance is credits bought and not yet used. It is Paul's overhead throughout
   (D-010).

**Needs:** an Admin API key (`ANTHROPIC_ADMIN_KEY` on the books site), which only Paul
can create. Title screening stays overhead: it runs across many pre-purchase properties
and never capitalizes to one.

## D-019 · No Plaid — bank activity comes from statement downloads — 2026-09-15 · Paul

Plaid's production review (security questionnaire, policy uploads, MFA evidence,
vulnerability-management attestations, ongoing vendor compliance) is built for apps that
connect strangers' accounts at scale. Recast connects three of its own. Paul: "plaid is
feeling really intense for my business needs ... this is not what i expected and is too
much."

**Decided:** supersedes D-007. No bank aggregator. Once a month Paul downloads each
account's activity from the bank (OFX/QFX preferred; CSV or the PDF statement as
fallback) and uploads it, or forwards the statement email. Code parses the file into the
`Feed` tab; the bookkeeper matches lines to receipts and journal entries and proposes
postings for what is uncovered; the month reconciles per account against the statement's
closing balance. The Feed tab and matching are the same as they would have been with a
feed, so a live feed can be added later as another input without a redesign.

**Consequences:** transactions are visible at month end rather than within a day; the
Dashboard's cash figures are the ledger's view, not the bank's live balance; the Plaid
account stays dormant (sandbox keys only, production request withdrawn); no Plaid
credentials on Netlify; `Bank accounts.plaid_item_id`/`plaid_account_id` stay unused.
The security policy written for the questionnaire (`docs/access-control-policy.md`)
stays — it is true and worth having.

## D-020 · Cash-advance interest is Paul's, settled out of his share — 2026-09-15 · Paul

Granite's cash advances were checks Dennis wrote that Paul deposited in his personal
account. Paul, reviewing the payouts: "for dennis and paul need to account for cash
advance interest. paul pays dennis out of his profit share." This partly reverses D-011,
which had made interest on every advance a property cost.

**Decided:**
1. Interest on the **purchase principal** stays a property cost (1200, inside Total
   Project Cost, borne by both through the split).
2. Interest on a **cash advance** is Paul's: it is not a property cost and does not
   reduce net profit. At the sale Dennis receives the cash-advance principal plus that
   interest, and Paul's payout is his share less that interest — the old tab's "+ from
   Paul / − to Dennis" lines.
3. In the books, the close job accrues cash-advance interest as Dr 2030 Due to owner /
   Cr 2000 (Recast owes Paul that much less, and owes Dennis the interest), not Dr 1200.
   Which is which comes from `Advances.kind` (purchase / cash), set on the Dennis page.

**Why:** money Paul held personally is Paul's borrowing, not the property's. D-011's
other parts stand: purchase-principal interest is a project cost, advances sit on the
property's balance sheet, no separate advances ledger.

## D-021 · Cash-advance interest is a property cost after all — 2026-09-15 · Paul

D-020 was recorded an hour earlier on the reading that Granite's cash advances were
Paul's personal borrowing. Asked what the checks were for: "they reimbursed me for
granite expenses." The money paid for the property, so its interest is the property's.

**Decided:** D-020 is withdrawn; D-011 stands in full. Interest on every Dennis advance,
purchase principal or cash advance, is a property cost (1200), inside Total Project Cost,
borne half each through the 50/50 split. Dennis receives principal plus interest on every
advance at the sale; there is no "from Paul / to Dennis" interest line.

**The rule, for next time:** interest follows the money. An advance that paid for the
property (directly, or by reimbursing Paul for property costs) is a property cost. Only an
advance Dennis hands Paul for Paul's own use would be Paul's borrowing — and that is
outside Recast's books (D-011's exception), not a Recast advance at all.

`Advances.kind` (purchase / cash) stays: it drives the two schedules on the property tab
and which account the purchase posts to, not the interest treatment.

## D-022 · Personal loans, per-property profit share, per-advance rate — 2026-09-15 · Paul

Paul: "there will be scenarios where dennis gives me a personal cash advance. the first
property we did (104 ashburne) was a different arrangement where dennis was the bank
only." And: "there should also be an interest input for all cash advances."

**Decided:**
1. **Advance kinds:** `purchase` (posts as the purchase, Dr 1000 / Cr 2010), `cash` (for
   the property; lands in a bank account or on 2030 when Paul deposited the check), and
   **`personal`** — Dennis lending to Paul, no property: Dr 2030 / Cr 2010. Its interest
   accrues Dr 2030 / Cr 2000 (Paul owes Recast; Recast owes Dennis) and never touches a
   property. It shows on the Dennis page under "Paul (personal)" and is settled between
   the partners at the next payout (the D-015 partner-adjustment mechanism), not on any
   property tab. This is the treatment D-020 briefly gave to all cash advances, now
   applied only where it belongs; D-011/D-021 stand for property advances.
2. **Dennis's profit share is a term on the property:** `Properties.dennis_share_pct`,
   default 50; 0 when Dennis is the bank only (Ashburne). The property tab shows "Dennis
   Share (x%)" and "Paul Share (y%)"; the sell wizard and closing tab read the same field.
3. **Each advance carries its own rate:** `Advances.rate_pct`, entered on the Dennis
   page, defaulting to Settings `interest_rate_annual`. The accrual engine, the Dennis
   ledger and the property tab honour it per advance.

**Addendum, same day.** Paul: "that never happens. all cash advances from dennis whether
he's a 50/50 partner or just the bank are against a property." Item 1's `personal` kind is
withdrawn before it was ever used: kinds are `purchase` and `cash` only, every advance names
a property, and every advance's interest is that property's cost (D-011/D-021). Items 2 and
3 stand. Who received the check (the seller, Citizens, or Paul's account as reimbursement)
decides only which account the money lands on, never the interest treatment.

---

## D-023 · The bookkeeping front end lives in the workbook — 2026-09-15 · Paul

Paul: "i want to move the front end of the admin for books to sheets menus. keep the
receipts poller and automation there ... the calls between the app and sheets takes too
long."

**Decided:** partly supersedes D-008. The input side of the books (journal entries, void,
properties, advances, interest, periods, reports) is a custom **Recast Books** menu in the
workbook, run by the writer project bound to it. The web app keeps sign-in, Dashboard,
Inbox, Upload, property mailboxes and API costs; the receipts poller, ingest job, gate and
Drive filing do not change. The moved pages are deleted from the web app, not kept in
parallel. One posting engine: `lib/` is generated into `lib.gs`, never rewritten.

**Consequences:** the writer becomes container-bound (new script id and `WRITER_URL`,
once); menu writes poke Netlify's cache warmer; Dennis and the accountant see the books by
workbook sharing rather than a web role. Inbox review moves later, as its own step, once
the bound project has proven itself (spec §6). Spec: `docs/phase2.7-spec.md`.

---

## D-024 · Migrate everything, close the old books, start fresh — 2026-09-16 · Paul

Paul: "what i would want is to do the migration of all the old stuff and close those books
and start fresh from that point in the new system." Context: "the old books are a
combination of manually entered receipts and the first version of the receipts poller" and
"the two systems are not aligned in how they are tracking."

**Decided:** Phase 4 (migration) moves ahead of Phase 3 (banking) and absorbs Phase 6: the
old workbook closes at a cutover date and there is no 14-day parallel run, the tie-out is
the proof. The migration is **forensic**, not a copy of block totals: every expense row in
the old workbook is matched to its source document in the paul@ mailbox (receipts@ and
travel@ deliver there) and replayed through the new bookkeeper so it carries a real read
and a Drive filing. Rows with no document (manually entered) migrate as
`source = migration` with `doc_url` empty and a `NO_DOC` flag, to be proven against bank
statements when Phase 3 lands. Rows found in mail but absent from the old workbook, and
rows duplicated in it, are reported as the alignment findings before anything posts.
D-013 stands: the clear happens first, then history posts, then receipts since 2026-09-11
replay.

**Order:** inventory the old workbook (read-only) → dry-run mail sweep (no posting, no
labels) → three-way match report → Paul reviews the findings → D-013 clear → post → tie
out each property total and RECAST BIZ block to the baseline, with every intentional
difference as a dated correction (Phase 4 2b).
