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

---

## D-025 · The migration is ironed out in a staging copy; the real journal is born in one pass — 2026-09-17 · Paul

Paul: "i'm trying to make the transition/migration as clean as possible without a bunch of
crazy voids and changes that will make the journal a mess which is why i thought going to a
temp first to iron it out would ultimately give us a scratchpad." Answers Q-8.

**Decided:**
1. **Staging is a copy of the new books workbook** (File → Make a copy; the bound writer
   comes with it). One deploy of the copy's writer, `WRITER_URL` switched to it for the
   staging period. Every replay, and live receipts@/travel@ mail meanwhile, posts to the copy.
   The old workbook and old poller keep running for real.
2. **Never correct in place during staging.** A wrong result means a mapping or rule change,
   then clear and rerun. Nothing in staging is precious.
3. **Reads happen once.** The model read of each document is stored per document; every
   rerun re-posts from the stored read (a small path to add), so iterating costs nothing.
   Inbox decisions are stored per document too and are not asked twice.
4. **A rule-change log** between runs, with the rows each change moved, is part of the
   comparison report — the audit trail for the final pass.
5. **Cutover is one deterministic pass:** D-013 clear of the real workbook, post everything
   from the accepted reads and mapping, tie out. Append-only from the first row; voids exist
   only for real mistakes after cutover. Staging is archived beside the old workbook.

**Why:** the real journal must never see a draft; the mess lives in the copy.

---

## D-026 · Migration review rules — 2026-09-17 · Paul

Given once, applied to every stored read by `repostAll` overrides (D-025), never card by card.

1. **Cards on no account are personal.** 6774, 3746, 7952, 9179, 7274 are Paul's personal
   credit cards; 9166 is his personal debit card and default. All post `paid_from = PAUL`
   (2030 Due to owner).
2. **No card on the receipt:** before 2026-08-01 (Citizens 1401 opened in August) the payer
   is PAUL. From August on, an unknown payer stays held for Paul's approval — no default.
3. **Property attribution:** where the old books put a receipt on a property tab, that
   attribution wins over the bookkeeper's guess.
4. **`[Personal]` Uber rides:** airport runs are business; every other personal-tagged ride
   is dismissed.
5. **Utilities found in mail but on no tab** are added, deduplicated: Paul forwarded bills
   *and* payments for the same charge, so a bill and its payment are one cost (the payment
   wins). Paul stops forwarding bills.
6. Settlement dates for 104 Ashburne and 881 Newport: still owed by Paul.

**Addenda, same day.**
7. Acquisition receipts (trustee/auction sale receipts) and Dennis's cash draws leave the
   receipts lane: dismissed there, document kept; they migrate as Advances (D-011/D-022).
8. **The heavy template lives in the `trade` column.** Paul: "we need to create a large
   property template for Ashburne. it has more categories than Granite." Ashburne's 21
   old blocks (Paint & Flooring, Trash, Lighting & Electrical, Master Bath, … Marketing)
   become the `trade` of each migrated line (override at re-post), and the generated
   property tab gains a per-trade section for a property whose `template` is Heavy — a
   pivot over the Journal, not a second tab layout (D-002 kept both templates; this is how).
9. **Gas / truck / trailer is a general business expense**, never a property cost, even where
   the old Ashburne tab carried it: "make them all a general business expense." A re-post
   override never moves a fuel-only entry onto a property.

## D-027 · The old books are the target; the new books reproduce them, with the receipt linked — 2026-09-17 · Paul

Paul: "in the end i want the new books to match the old books as closely as possible but in
the new system with links to the receipts. that needs to be the priority."

**Decided:** the measure of Phase 4 is how closely the new Journal matches the old workbook,
property by property and row by row, with every entry linked to its receipt. In order:

1. **Every old row gets its document.** The comparison's job is to find the receipt behind
   each old row, in any mailbox, before anything else - a row is `NO_DOC` only after the
   search has failed everywhere (D-024's bucket, now the last resort, not a residual).
2. **Where the receipt and the old row disagree, the old row wins by default** - property,
   trade block, amount as typed (D-026.3 generalised). The receipt's read is evidence, the
   old row is the target; a difference the receipt clearly proves (a typo like C-1) is fixed
   through the corrections register, dated, and nowhere else.
3. **The new system's rails are not a reason to differ.** A gate that holds migrated
   history (ceiling, unknown payer, a stale duplicate) is a rule to set once for the
   migration, never a reason to leave old rows out.
4. **Done** = each property's Journal total equals the snapshot plus the corrections register,
   and each Journal entry carries its `doc_url`.

Supersedes the wording in BUILD-PLAN §7 step 3 ("lands as the receipt supports, not as the
old split"): the old split is the target; the finer read stays on the envelope.

## D-028 · Returns the old books netted are inferred from the receipt and posted as credits — 2026-09-17 · Paul

Paul: "i did not enter items that i knew were going to be returned and do not have any
documentation of those returns … what about a rule that we compare all itemized entries
against the old books and if they are not there but on a receipt then they most likely are a
return." Confirmed: "yes use that rule."

**Decided:**
1. For each receipt matched to old rows, the gap = receipt total − the old rows it explains.
   A positive gap is a suspected return.
2. Code finds the subset of the receipt's line items that sums to the gap **to the cent**.
   Exactly one subset → those items are the return: the purchase posts gross (every item,
   receipt linked) and a return credit posts against the same receipt and date, flagged
   `RETURN_INFERRED`, no document. Net equals the old row (D-027).
3. No subset, or more than one → the receipt holds with the candidates shown; Paul decides.
4. Inferred, not proven: an item on the receipt and absent from the old books may also be a
   forgotten item or a personal one. The card statements (Phase 3) are the proof - each
   inferred return should appear as a card credit; the flag is cleared or corrected then.
5. ~~The credit posts automatically when the subset is unique.~~ **Amended the same day:**
   the first measurement found the unique subsets were bottled water, snacks, batteries and a
   sawhorse - items left off on purpose, not returns. So every inferred item **holds for
   Paul**, who marks it a return (credit posts, `RETURN_INFERRED`) or an omitted item (posts
   as read: a real cost the old books dropped, or personal - due to owner). Paul: "lets make
   it so i manually determine if its a return or just something like a bottled water."

## D-029 · The migration is row-driven: the old row is posted, the receipt is attached — 2026-09-18 · Paul

Context: through 2026-09-17/18 the staging migration was document-driven - every receipt
re-posted through the live bookkeeper pipeline (model read → gate → post). Result after a full
day: 396 documents in Pending behind rails built for live mail (ceiling, unknown payer, low
confidence), amounts and splits following the receipt rather than Paul's row, D-027's "the old
row wins" implemented nowhere but the property/trade overrides, and a post path (three full
Journal reads + Drive filing per document) too slow and fragile for bulk. Paul: "are we
drifting?" - yes. Asked whether to switch method: "yes."

**Decided:** Phase 4 posts **from the old rows**, not from the documents.
1. For each old row (property tabs + RECAST BIZ, corrections register applied): one entry with
   the old row's date, amount, property and trade block; account from the matched read when
   there is one, else from the block map. `source = migration`.
2. The receipt the matcher found (comparison reports A/B, strong matches only) is attached:
   `doc_url` on the entry, the model's read kept on the envelope as evidence. One document may
   carry several rows (the old books split receipts by block).
3. Receipt total ≠ the rows it explains → listed for Paul's return-or-omitted review (D-028);
   nothing posts from the difference until he marks it.
4. Rows with only a weak candidate are listed for Paul to confirm the match; rows with no
   document anywhere post `NO_DOC` (D-024), proven against bank statements in Phase 3.
5. Documents in mail that match no old row ("in mail, not in old books") are a review list,
   not postings: utilities already decided (D-026.5) post; the rest wait for Paul.
6. Posting is one bulk, deterministic pass inside the writer (no gates, no per-document Journal
   reads, property tabs rebuilt once at the end). The tie-out is exact by construction;
   what remains to check is the links and the difference list.
7. The receipts pipeline is for live mail from the cutover date forward. Its gates never
   apply to history. The 946 stored reads and the matcher are what supply the links.

Supersedes the re-post loop of D-025.3 as the way history reaches the Journal (staging,
clear-and-rerun and "never correct in place" all stand). D-024, D-026, D-027, D-028 stand.

## D-030 · Dennis's direct payments carry no interest - 2026-09-18 · Paul

Paul, on the 31 rows ticked "Dennis Paid" on Mesa, Sparkling, Granite and Bowling Green
($8,656.54): "no interest on these. only on cash advances and purchase."

**Decided:** a cost Dennis pays directly (a contractor, a store) posts Dr cost / Cr 2010, owed to
him and repaid at closing, with **no Advances row and no interest**. Interest accrues only on
purchase principal and cash advances (D-011, D-022). Refines D-011's "every Dennis advance
accrues": a direct payment is a payable to Dennis, not an advance.
**104 Ashburne is the exception, confirmed by Paul the same day:** "for ashburne those were cash
advances at 12% .. they were in the cash advance column in the ashburne tab. for ashburne dennis
is the bank at 12%. for all other properties he is my partner and he does not charge interest on
direct expenses, only cash advances and property purchase." So the 15 direct payments on the
Ashburne Cash Draws list ($18,141.44) are advances at 12%, exactly as migrated
(`migrationRegisterAdvances`); nothing changes there. The rule by deal type:
- **Bank deal (Ashburne):** everything Dennis puts in - purchase, draws, and what he pays
  directly - is an advance at the deal's rate (12%), plus his commission (3%); no profit share.
- **Partner deal (every other property):** interest on purchase principal and cash advances
  only; a direct payment is owed back at closing with no interest.

## D-031 · Cost Recapture: charges after a property has sold - 2026-09-18 · Paul

Paul: "for charges that happen after the sale date on a property i want to create a tab that
track them to be reconciled when the next property sells." The old workbook already had it in
small: the `Cost Recapture` tab ("Recaptured costs after properties have closed and
reconciled"), four rows, $1,310.04, with the Paul / Dennis / Recast boxes.

**Decided:** a sold property is locked (D-015, D-017), so a charge dated after its settlement
posts to **`Cost Recapture`**, registered in Properties like any property so the existing tab,
posting rules and payout machinery apply unchanged. The sold property's name goes in the line's
`trade` column ("280 Sparkling"), the account says what it was (1120 utilities, 1130 grounds).
The balance is reconciled between the partners when the next property sells (Phase 5's sell
wizard picks it up). The old tab's four rows migrate there; so does anything the cleanup finds
dated after a sale (first: Falcon Creek's $55.00 Sparkling grass cutting, invoice of 2026-08-30,
Sparkling sold 2026-08-06).

**Extended 2026-09-18 (Paul):** "if there are discrepancies then the discrepancies need to be accounted
for in the cost recapture tab since those properties are actually locked in reality." A sold property's
tab migrates exactly as it was closed; an error found afterwards (first: TXU $161.17 typed on both
Granite and Sparkling, C-16) is a Cost Recapture line - a credit when the closed tab was too high -
naming the property in `trade`. It is never an edit to the closed tab.

## D-032 · Dennis has no direct payments on Ashburne: only cash advances and the purchase loan - 2026-09-18 · Paul

The independent audit found 104 Ashburne $1,619.00 above the old tab: `migrationRegisterAdvances`
had posted the 15 "Dennis Paid Julio / Juanito / Robinson Air / dump / listing fee" lines of the
Cash Advances tab ($18,141.44) as Dr rehab / Cr 2010, so each advance *was* a cost. Seven of them
also sat on the Ashburne tab (held back as `COVERED_BY_ADVANCE`); eight had no row there and
became cost the old tab never carried. Paul: "this is an error. dennis has no direct payments.
only cash advances and loan for purchase."

**Decided:** an advance is financing, never a cost. Those 15 lines are cash advances at 12%
(D-030's bank deal, unchanged) that land on **2030** (Dr 2030 / Cr 2010 - the money paid a
contractor on Paul's behalf, or reimbursed him, as on Granite and Newport). Every row of the
Ashburne tab posts as typed, and a row whose receipt says Dennis paid credits 2030, not 2010, so
the liability to Dennis is counted once - through the advance. Ashburne's cost is the old tab's,
to the cent. Supersedes the "as migrated" sentence in D-030; the interest rule there stands.
**Consequence to know:** the eight advances with no tab row ($1,619.00) now reduce Due-to-Paul
instead of raising Ashburne's cost. If any of those eight was a real job missing from the tab,
it is added as a row through the corrections register.

## D-033 · The sale side is Phase 5; the Phase 4 gate is expense rows and advances - 2026-09-18 · Paul

The audit noted that BUILD-PLAN's Phase 4 gate names net profit, opening balances and the Sales
tab, and none is on the cleanup list. Paul: "we have not created the workflow for closing a
property yet."

**Decided:** Phase 4 migrates every expense row, the advances and the purchases, tied out to the
old tabs. Sales, settlement entries, repayment of Dennis, payouts, the flip of sold properties to
`sold`, net profit and the bank / Due-to-Paul balances that depend on them belong to the Phase 5
sell wizard, which re-runs the five past sales (Granite, Sparkling, Newport, Ashburne, and the
Granite holdback) against the Sales tab's $243,740.64. Until then the new books' balance sheet is
knowingly incomplete: sold properties show as held inventory, 1402 carries the Ashburne draws,
2030 carries every Paul-paid cost. Live receipts are held by Paul until the migration is complete,
so nothing new posts to staging between the snapshot and the cutover; the cutover checklist still
re-exports the old workbook and diffs it against the 2026-09-17 snapshot.

**Corrected 2026-09-18 (Paul): "ashburne has not closed. it is still held."** **Corrected again 2026-09-21 (Paul, on
Newport): "not closed. under contact."** The past sales the Phase 5 wizard re-runs are Granite (and its holdback) and
Sparkling only; Newport and Ashburne join them when they close (the old Sales tab's figures for those two are projections).
Until then Ashburne is an ordinary held property: corrections are made on its tab, a cost found in mail is a
row on its tab (C-22), and D-031's Cost Recapture rule does not apply to it.

## D-034 · Property tax: payments post when paid, the closing proration posts at closing, the tab estimates in between - 2026-09-18 · Paul

Paul: "i paid the property tax for ashburne for the year on 3/30. i will also pay pro-rated property tax when
we sell ... change the way property tax is being logged if needed. i defer to you now that you know the facts."
Facts checked: Texas property tax is paid in arrears (billed October, due January 31, 7% on February 1 and
+2% a month). The 03-30 payment was tax year **2025** with 9% penalty and interest; a 2026 sale charges the
seller January 1 → closing on the settlement statement (TREC para. 13), or, once the bill is out, pays the
bill at closing and credits the seller for the rest of the year. Different tax years - never the same tax twice.

**Decided:** no new mechanism.
1. A tax payment posts on the day it is paid: Dr 1100 Holding - property tax on the property, penalty and
   interest included (it is a cost of holding that property), credit whoever paid.
2. The seller's proration is a line of the closing statement and posts with the sale (Phase 5 sell wizard).
3. While a property is held, its tab shows posted 1100 plus an estimate of the proration from
   `Properties.tax_annual` (the latest levy, without penalties). The estimate is a forecast and never posts.
4. A foreclosure purchase late in the year inherits the whole year's bill (Ashburne: bought 12-02, paid all of
   2025). That is a cost of the deal, on the property, not overhead.

## D-035 · No attachment: the email is the receipt - 2026-09-22 · Paul

Wi-Fi Onboard $8.00 (09-18) and Berrett Pest Control $270.63 (09-22) were read and posted from the email body,
but the live path filed attachments only, so neither Journal line had a Drive link (audit §57). Paul: "file
them. if there is no attachment then the email IS the reciept. make a rule."

**Decided:** an upload with no attachment stores the message itself (subject, sender, received, mailbox, Gmail
link, body) as its one attachment, `email.txt`, at upload time (`books-upload.mjs`). Every filing path then
files it to Drive unchanged (auto-post, Inbox approve, repost) and the Journal line gets its link; the
bookkeeper is not shown it again (the body is already in its prompt). Same shape as the migration's email
.txt, so old and new rows link the same way. The writer gained a `setDocUrl` action so a document filed after
its entry posted can be linked (`scripts/file-email-receipts.mjs` for the two above).

## D-036 · Phase 5 answers: holdback, bank-deal commission, no reserve field, Drive only - 2026-09-22 · Paul

Answers to `docs/phase5-spec.md` §6, which the sell wizard is built from.

1. **Granite's escrow holdback:** all $60,000 released, split 50/50, nothing deducted, **received 2026-09-11**.
   It posts as its own run dated 09-11 (Dr 1401 / Cr 1510, then $30,000 to 2010 Dennis and $30,000 to 9010 Paul).
2. **A closing reimbursement of rehab** (Sparkling's $4,716.82, from other partners on that deal) credits the
   rehab accounts it reimburses - it is not income.
3. **Bank deal commission** is **3% of the full sale price**, paid to Dennis at closing with the purchase cost
   and the cash advances plus their 12% interest (104 Ashburne). No profit share on a bank deal (D-030, D-032).
4. **D-021 stands** for partner deals - Paul, asked again the same day: "re: granite interest - it should be
   a shared expense." Interest on every advance is a property cost, split 50/50; the old
   Granite tab's personal $84.70 treatment is not reproduced (each payout differs by $42.35, named as a
   difference on the Closing tab).
5. **No reserve field** on the wizard: the shared Recast account keeps what it fronted. Closes the
   BUILD-PLAN §5 "Open (2026-09-11)" item.
6. **The final Payout report is saved to Drive only** - the wizard never emails Dennis.

**Open, blocking Sparkling only:** what the other $263,446.88 of Sparkling's ALTA was (other partners were on
that deal) and whether a fourth payee belongs in the waterfall - spec §6a. Granite can be re-run without it.

## D-037 · A co-owned deal is recorded at Recast's undivided share - 2026-09-22 · proposed, awaiting Paul

280 Sparkling was sold by **two** sellers: SAM H PROPERTIES LLC and RECAST PROPERTIES LLC (seller CD, Bison
file 260725). Cash to the sellers was $518,106.25 and Recast received exactly half, $259,053.12 - the old
tab's "Cash from closing" to the cent - plus statement line H.01 "Expense Reimbursement to RECAST PROPERTIES
LLC" $4,716.82, giving the old tab's $263,769.94 gross. The purchase side already works this way: Recast's
$196,850.50 is half of the $393,701.00 auction price.

**Proposed:** Recast's books record Recast's undivided share of a co-owned property, never the whole deal.
At a sale, every settlement-statement line posts at that share; a line payable to Recast by name posts in
full. The co-owner is not a payee in the waterfall and never appears in the books - the three payees (Dennis,
Paul, the shared Recast account) split Recast's share. The share is typed on the sell dialog (default 100%),
not stored, until a second co-owned deal justifies a column.

**Why it matters:** the alternative - booking the whole property and showing the co-owner as a payee - would
double every Sparkling cost already migrated and break the old-books tie-out (D-027). This decision is what
the migrated numbers already assume.

## D-038 · The advance rate is per advance: the two closed deals were 8%, held stays 9% - 2026-09-22 · Paul

Audit §59 found the engine and both closed tabs disagreeing on interest. The engine is right - it reproduces
881 Newport's live formula to the cent at 9% on two dates - so the rate was the variable: Granite's and
Sparkling's agreed interest matches **8%** (within $7.83 and $1.17), not the 9% their advance rows carry.

Paul: "yes, they were at 8%. i leave it at 9% in case the rate fluctuates."

**Decided:**
1. **`rate_pct` is a fact of each advance** (D-022 already), not a global. Granite's three advances and
   Sparkling's purchase are corrected to **8** - the rate Dennis was actually paid on deals that are closed.
2. **The four held properties stay at 9%** (136 Bowling Green, 206 White Rock, 366 Mesa, 469 Brushwood) - a
   deliberate forecast buffer, high rather than low, in case Dennis's rate moves before they sell. 881
   Newport is 9% by evidence; 104 Ashburne is 12% (D-030, D-032). A tab that forecasts interest high is the
   safe direction; the figure that settles the payout is Dennis's agreed one, trued up once (D-015 §2).
3. Nothing posted depends on either number today - no 1200 interest line exists for any property (D-033) -
   so this is a four-cell edit on the Advances tab, not a void-and-repost.

## D-039 · An HOA release is a selling cost, not an acquisition cost - 2026-09-22 · Paul

280 Sparkling's closing tab showed the $485.00 HOA release, paid to Community Archives on 2026-07-24,
under **Acquisition costs** (1010, where the migration put it, and where the chart of accounts had listed
"HOA release" since Phase 0). Paul: "the HOA release is the opposite of acquisition costs. its required for
the SALE. this needs to be labeled what it is: HOA Release."

**Decided:** a new account **1340 Selling - HOA release**, cost class Selling. Everything an association
charges to complete a sale goes there - the resale certificate, the transfer fee, the release itself, and a
reimbursement of one. 1010 Acquisition costs is only what was paid to **buy** a property (buyer premium,
title work, recording). 1130 Holding - HOA stays what it is: dues, lawn care and pool service for a period
while the house was held. Both prompts now say so, the settlement read is told explicitly that such a line
is "1340, not 1130 and not 1010", and the Sell dialog offers it.

**The two closed sales keep the classification they closed with.** 280 Sparkling's $485.00 sits on 1010 and
1616 Granite's $140.00 HOA transfer fee on 1130. A sold property is locked (D-015, D-017) - the posting
allowlist refuses a line naming it - and both accounts release to 5000 COGS, so the misclassification moves
no dollar, no profit and no payout. Nothing is re-posted for it (the spirit of D-031: a closed property's
books stand as closed). What did change: a **cost row renamed on a closing tab now survives a rebuild**, the
same courtesy the settlement lines already had, so Sparkling's row can read "HOA Release" without touching
the ledger.


## D-040 · The Inbox card lists short bullets that name the fix, not a paragraph - 2026-09-23 · Paul

Paul, reviewing the Inbox after the 104 Ashburne tab went wrong: "the inbox descriptions of the expenses
are too long and hard to understand. i need bulleted, short concise and clear reasons listed. if there was
a short clear bullet that said 'no trade - enter a trade' that would have solved it."

**Decided, in two passes the same day.** First the explanation became a bulleted list with the model's `why`
split into one bullet per sentence - which on an older read turned a six-sentence paragraph into six
bullets. Paul, shown that card: "this is not actionable for me. this needs to be explicit for the action i
need to take. this is still too much."

**So: every bullet is something Paul must DO, and nothing else is a bullet.** "Check the amounts, then
approve or dismiss", "No payer - pick who paid", "No trade - enter a trade", "Already posted as <txn> -
dismiss it". The gate's reason codes are never shown raw (a lint fails if a new one has no translation),
and a card with no flag still says what to do ("Check it, then approve or dismiss"), so the list is never
empty. Claude's reasoning - `why` and `checked` both - is one click away under **Claude's read**; it is
evidence for a question, not an instruction, and it does not belong in the way.

**A flag has to be actionable where it is raised.** The item editor gained a **trade** picker, offering the
trades the property tabs group by (the heavy block order plus every trade the Journal has seen) rather than
free text: a typed trade that does not match a block name gets no block until the tab is rebuilt. The
missing-trade flag is raised for any property cost line except the ones that live in the tab summary
(1000 purchase, 1100 property tax, 1200/1210/1220 financing and profit share); OVERHEAD never asks for one.

**Why it matters, measured.** Energy Texas $559.34 (INV05275451, 104 Ashburne) was held on OVER_CEILING and
PAYER_UNKNOWN, approved from the Inbox with `trade` empty, and then appeared in no block on the property
tab - counted in Total Project Cost, itemized nowhere. Both halves are now fixed: the card asks for the
trade, and an untraded Holding line falls under Utilities on the tab (audit 61).

## D-041 · Property is per item on the Inbox card; the post still splits one entry per property - 2026-09-23 · Paul

Paul, on a Home Depot card whose four line items were all 6510 Small tools & equipment under property
104 Ashburne: "i should be able to assign each itemized item in a receipt to a different property or
overhead. also, there is no general tools category that is for the business vs a property."

**Decided:** the card carries **Property on every item**, with the entry's own Property select kept as the
"set all of them" control for the ordinary receipt that belongs to one house. The ledger is unchanged - a
posted entry is still exactly one property (`lib/posting.mjs`) - so Approve splits the edited entry into one
entry per property it carries, which is the same shape the bookkeeper is already told to propose when a
receipt spans two houses. Payee, date, paid_from and the document travel onto each.

**On the tools category:** 6510 Small tools & equipment **is** the business one, and it was already picked
on all four items - what the card never said is that 6510 can only be OVERHEAD (D-010) while the entry named
a property, a combination `buildEntry` refuses outright (OVERHEAD_ON_PROPERTY). No new account: instead the
account picker is grouped - **Property costs - needs a property**, **Business overhead - OVERHEAD only**,
**Cash, prepaid and other** - so the distinction is visible where the choice is made, and the card raises
"Business account on a property - set 6510 to OVERHEAD" live as he edits, since the ingest gate only ever
saw what the model first proposed. A tool bought for one house still goes to 6510 as overhead (D-010).

**Asked and answered the same day - "tools are overhead" (Paul, 2026-09-23).** No new account, no change
to D-010: a tool is overhead however specific the job it was bought for, because it is not consumed into
the property the way materials are. The bookkeeper prompt now says it in those words, with the consequence
spelled out - a hardware receipt mixing tools and materials is two entries, the tools on 6510 OVERHEAD and
the materials on 1030 with the property - which is exactly the split the card can now do by hand.

## D-042 · Dennis charges no commission on a partnership deal; the light property tab gains a Concession cell and splits Received - 2026-09-23 · Paul

Paul, reviewing the 469 Brushwood tab: "remove Dennis commission rows. he will never charge commission for
these"; "change 'Due to Paul (paid less reimbursed)' to 'Paul Paid (direct)'"; "add a row to Profit Breakdown
that is an input field for any seller concession ... as you did in 104 Ashburne"; then "split 'Received
(advances, refunds)' into two separate rows". All four apply to the **light** template only - 104 Ashburne,
the one Heavy tab, is untouched.

**Decided, and why each is safe:**

1. **No commission on a partnership deal.** The Payouts block's `Dennis commission (x% of sale)` and Paul's
   matching `Less Dennis commission` are gone. This is a fact about the deals, not a layout preference:
   Dennis's return on a partnership property is his principal, his interest and his 50% share (D-011, D-022),
   and a commission was only ever a **bank deal**'s term. Nothing about the bank path moved -
   `Properties.dennis_commission_pct`, the heavy tab's own commission line and `lib/sale.mjs`'s 1210 entry at
   closing (D-036) all stand, which is what 104 Ashburne will settle on.
2. **`Due to Paul (paid less reimbursed)` → `Paul Paid (direct)`**, the mirror of `Dennis Paid (direct)`
   directly above it. Label only; the figure is the same Paul Paid block net.
3. **`Concession (type it here)`** in the Profit Breakdown, below Closing % - the same typed, blue input cell
   the heavy tab already had, kept across rebuilds by `readLabelledValue_`. Net Profit subtracts it as
   `-ABS(...)`: a seller concession is always a reduction, so a minus sign typed by hand must not be able to
   turn a credit into profit. The tab's blue cells are now the two things Paul types, both positive.
4. **`Received (advances, refunds)` → `Received (advances)` + `Received (refunds)`.** Split on payee: both
   lines of an advance carry `Dennis Little` (`buildAdvance`), while a refund is a negative cost row carrying
   its vendor. Deliberately an **exhaustive partition** of what the one line summed - `payee = "Dennis Little"`
   and `payee <> "Dennis Little"` - so a payee that does not match the rule can only move a line between the
   two rows and can never change the block total or break the tie-out. Verified against the migrated books:
   all 7 negative-amount rows are vendors (Home Depot, Lowe's, Floor & Decor, TXU, Anthropic) and all 33
   advances are `Dennis Little`.
5. **The Dennis Paid (direct) block keeps ONE Received row**, unfiltered, after Paul agreed the point: a
   direct-paid Dennis cost *is* an advance (`posting.mjs`, "a direct-paid cost is an advance"), and an
   advance's own lines are 1401/2030 and 2010 - never cost lines - so an advances row on that block could
   only ever read zero.

**Not re-opened:** D-010 (overhead never touches a property), D-011/D-021 (all Dennis interest is a property
cost), D-022 (`dennis_share_pct` drives the split). The heavy template's Profit Breakdown, its Agent
Commission % cell and its own Dennis Payout commission line are unchanged.

## D-043 · The property tab is frozen at closing as the record; the closing tab stays separate - 2026-09-23 · Paul

**This reverses the second half of `docs/phase5-spec.md` §3** (decided 2026-09-22: "no new tab per sale ...
its own tab is rebuilt as the closing statement"). `CLOSING_TAB_IN_PLACE` stays `false` permanently and the
layout sign-off it was waiting on is moot.

Paul, after looking at what the sale had done to the 1616 Granite and 280 Sparkling tabs - *"they got totally
fucked when the closing tab was created. why? is it necessary?"* - and then: *"i want the property tab frozen
and i want a new closing tab. so like we are doing it now, but i want to keep the property tab frozen as it
is when the closing tab is created. i want to keep it as a record."*

**What actually broke them, for the record:** not the closing tab. The property tab is a live formula view
over the Journal, and the sale's release entry credits every cost account to zero, so every total nets to ~0
and each cost appears twice - once as the charge, once as its reversal. The tab was doing exactly what it was
built to do, on data that no longer suited it.

**Why the 09-22 decision was wrong:** it assumed the forecast tab "stops meaning anything the moment the costs
release to COGS". It stops meaning anything *as a live view*, but its content is the only record of what the
house cost to own and fix - every line with its payee, description, who paid, and now its receipt link.
Rebuilding it as a by-class summary statement throws that away. They are two different documents: the property
tab is the cost history, the closing tab is the sale and everything after it.

**Decided:** `sellPost` calls `freezePropertyTab_` immediately **before** it posts - the formulas are replaced
by the values they are showing at that instant, and the `as of` cell becomes `SOLD <date> - frozen at closing,
see the closing tab`. Checkbox validations stay, so the frozen tab still looks like itself. Three guards keep
it: `setupPropertyTab` refuses to rebuild a sold property, `refreshLineBlocks_` skips one, and
`onPropertyTabEdit` toasts instead of firing a void-and-repost. The one exception is
`setupPropertyTab(name, asOf)`, which reconstructs the pre-sale record for a property that sold before
freezing existed (1616 Granite, 280 Sparkling) by dropping every `source = "sale"` row - by source, not by
date, because Granite has a real cost dated the day it closed.

**A charge arriving after the freeze** is refused on the sold property outright (`isOpenProperty` is
`status !== "sold"`, so it leaves the postable set and `buildEntry` rejects any entry naming it) and belongs
on Cost Recapture with the property's name in `trade` (D-031), where the closing tab's live POST-SALE COSTS
SUMIF picks it up. Nothing falls between the two tabs.

**One hole found closing this, and closed:** `sellPost` writes `status = sold` straight to the sheet, which
neither goes through the upsert (which clears the cached posting ctx) nor fires the onEdit trigger (script
writes never do), and `buildCtx_` caches the postable property set for **six hours**. So for up to six hours
after a sale closed, the sold property still looked open to the gate. `sellPost` now clears the `ctx` cache
the instant it writes the status. That window is how the 178.48 reached 1616 Granite (audit §65).

## D-044 · "Medium" confidence posts when every other rail holds - 2026-09-25 · Paul

The gate held anything the model did not call "high". On 2026-09-23 it held HILCO $56.03 (card 5450 matched
Citizens, 366 Mesa from its own mailbox, transaction id recorded) and FedEx $2.36 (card 9166, Paul's) on
"medium" alone - reads with nothing wrong in them. Paul: *"these should have been softballs."*

`docs/policies.md` already said it: self-reported confidence is a weak control; the arithmetic, the ceiling,
the invoice-number duplicate check, the property registry and the payer rail are the controls. So condition 1
of `phase2-spec.md` §4 is now `high` **or** `medium`; `low` (or no confidence at all) still holds. Everything
else in the gate is unchanged, and the $500 autofile ceiling bounds what a medium read can put on the books
unreviewed.

## D-045 · A vendor's own payment history settles the payer when the document shows no card - 2026-09-25 · Paul

Amends D-014, which was about a blind Settings default (1402) that posted a personal-card FedEx receipt to
Chase. This is narrower: when the document shows no last four and Paul wrote no note, but `read_ledger` shows
three or more prior payments to the same vendor **all** from one payer, the model uses that payer and says so
in `paid_from_reason`. Atmos 09-23 ("Visa Debit", no digits) is the case: the four Atmos payments on the books
were all PAUL. A visible card or a note still wins; a split history is no precedent and falls through to
`UNKNOWN` as before. Prompt rule 5 in `lib/bookkeeper-prompt.md`; no gate change.

Also recorded: **Chase checking ending 8870 is Paul's personal account** (it funds his PayPal - Adobe 09-23
showed it) and **Discover ending 3746 is his personal credit card** (the tender on the nine parked Home Depot /
Lowe's / Harbor Freight receipts of Jan-Mar 2026), so `paul_personal_last4` is a list, `9166, 8870, 3746`,
and all three read as `PAUL`. The nine stay parked for the Phase 3 statement - the card settles who paid, not
whether the goods were kept.

## D-046 · A utility payment confirmation that matches nothing on the account is a new charge and posts - 2026-09-25 · Paul

Energy Texas "All set! We received your payment" $128.70 on 104 Ashburne's account, card 9166, 2026-09-25.
The model held it - "may be partial against the $559.34 bill already posted 9/17" - because the same account
had just produced a bill (posted 09-17) and a payment confirmation of it (dismissed as the duplicate, 09-23).
Paul: *"energy texas is a separate bill ... its a different amount by a lot. you cant tell?"*

Rule (prompt section "Utility payment confirmations"): a payment confirmation on a registered property's
account whose amount matches no bill and no payment on the books for that account is a new charge and posts;
one that matches a posted bill or payment stays a duplicate. The amount mismatch is the evidence. Found the
same day: the model's `checked` record - which had this reasoning in full - was being dropped by
`normalizeDecide` since the field was added on 09-22, so neither the Inbox nor the digest ever showed it.


## D-047 · Reads come off the Apps Script writer; writes stay under its lock - 2026-09-25 · Paul ("go")

Constraint 2 said every function read went through the writer's `read` action too. The writer is one Apps
Script web app that serialises every call, and reads were ~95% of its traffic (five per ingest, nine tabs per
warm run, the whole Journal each time) against a handful of writes a day. Every 2026-09-25 failure was
plumbing around that: Atmos timed out four times on the Journal read, and postBatch replies were lost behind
reads (the doGet misfire) while the write itself had landed. *"I'm paying for a brain and getting blocked by
stupid stuff."*

**Decided:** a service account with **Viewer** on the workbook reads every tab through the Sheets values API
(`lib/sheets-reader.mjs`, RS256 JWT with `node:crypto`, no dependency); `_shared.mjs`'s `fetchTab` uses it
whenever `SHEETS_SA_KEY` is set and the writer's `read` otherwise, so nothing changes until the env is in.
Same output shape as `readTabData_` (Date cells recognised by column: the writer's timestamp/period columns
plus the date columns of `TAB_HEADERS`). **Writes are untouched:** the writer keeps the lock, the property-tab
refresh, `txn_id` identity and every gate; the service account has no write scope and no Editor role. The
writer's `read` action stays for the workbook menu and the clasp helpers. Flip only after
`scripts/reads-tieout.mjs` shows zero cell differences on all nine tabs.


## D-048 · A Reprocess never posts or dismisses - 2026-09-26 · Paul (the parked-cards complaint), Claude

Reprocess was a fresh read through the normal path: a "post" the gate passed was posted, a confident or duplicate
dismiss was dismissed. The four parked hardware receipts were mostly on the books already as migrated old-book rows,
and all three Home Depot totals were under the $500 ceiling - a re-read could post a whole receipt on top of its rows,
which is how four were posted twice on 09-22 (audit §66). Paul: *"cant you just copy the receipts over and run them
again?"*

**Decided:** the Inbox's Reprocess (both Inboxes, `books-inbox.mjs`) sends `holdOnly`; the read, the gate's reasons and a
note when the model voted post or dismiss come back to the card in `pending`. The warm job's retries of errored reads
and the poller's re-upload list are not a Reprocess and post as before.


## D-049 · One item per printed line; a hold still proposes its entries - 2026-09-26 · Paul ("the system is not itemizing them")

D-003 says the bookkeeper itemizes and D-041 gives each item its own property, but the prompt required neither: the
three parked Home Depot reads listed every line in `why` and proposed no entries (so the workbook card had nothing to
approve), and the Lowe's read was one line for twelve items.

**Decided:** a receipt or invoice that lists lines gets one item per printed line - the line's extended price plus its
share of the 8.25% tax (taxable lines only; the rounding cents on the largest taxable line, so the items equal the
total), discounts folded in, shipping or a fee its own item; one item only for a one-line document (fuel, a bill, a
ride, a folio, a meal). A hold proposes its entries exactly as it would post them, leaving only what it could not
settle for Paul (`paid_from` UNKNOWN, or `property` empty - never OVERHEAD as a filler).


## D-050 · A read may say a receipt is partly on the books; the Journal supplies the amounts and it always holds - 2026-09-26 · Claude, from the parked cards

The migration posted many hardware receipts line by line as old-book rows - often some lines, sometimes one row for
several, under the old spelling of the payee, and now and then dated days after the purchase (Home Depot 01-11's bulbs
on 01-16). A read that cannot say so either proposes the whole receipt (a double post on approve) or dismisses it (the
unrecorded lines are lost).

**Decided:** `decide` names the entries that already carry lines (`already_posted_txn_ids`) and proposes only the rest.
Their amounts come from the Journal, never the model - a name on no live entry adds nothing and the total fails; they
are left out of the twin rail; and the read always holds (`PARTLY_ON_BOOKS`), because a later copy of a receipt could
otherwise name the posted rows and post lines Paul removed on the card. A row counts only when product AND amount fit;
the same product a week or more away counts only when no nearer row carries the line. `read_ledger` takes `date` (cost
lines within 10 days, nearest first) so the rows can be found at all. Proved on the five parked documents: each ties to
the migrated rows line by line - 437.46 on no book, not the 407.22 the migration's amount-only links implied.

## D-051 · Bank reconciliation covers Recast's own accounts; Paul's personal statements stay out - 2026-09-28 · Paul

Paul: *"how will it work with all the charges on my personal account? i fear it will be very messy. is it better to
write a check to reimburse my personal account as business expenses and reconcile against recast business bank
accounts?"* - the retirement of his personal account that D-007 already recorded.

**Decided:** Phase 3 reconciles Recast's accounts only - Citizens (1401) and Chase (1402). A business charge on a
personal card still comes in as a receipt, paid by Paul (2030), as today; Paul's personal statements are never imported.
Supersedes `docs/phase3-spec.md` §1's third account and §9's "then the personal card". What Recast owes Paul is paid
back with one payment from a Recast account - one statement line against 2030 - and not before reconciliation has made
2030 right (the migration's Chase mix-up, D-052). House costs Paul paid still come back to him at each sale.
**Consequences:** a refund to a personal card is seen only when its return receipt is forwarded; the 27 receipts parked
for "the card statement" (5,166.56, `paul-answers.json` `mail_settled`) need Paul's word per item instead.
**Chase (1402) is Recast's account ending 6317** (Paul, same day): *"i used it to open a new recast business account at
chase bank. the new account will be just for me and for my business expenses and cash holdings that do not involve
dennis. that account number ends in 6317."* "It" is Ashburne's $2,000 earnest money, released to Recast before closing
as a check from Bison Title - so at the Ashburne close that $2,000 lands on 1402, not 1401 (the sell wizard puts all the
sale cash on 1401: post a 2,000 transfer 1401 -> 1402 with the close). Citizens (1401) is account ending 2505, cards
5450 (Paul) and **9301 (Dennis)**. Bank accounts' `last4` gets these when the importer is built.

## D-052 · Every advance says who the money was paid to; the old books' "Chase" was Paul's personal Chase - 2026-09-28 · Paul

Paul: *"yes it went into my personal account(s) i may have put them into two separate personal accounts. some of those
"cash advances" for 104 ashburne were paid directly to the vendor and not put into my account. we need some kind of
checkbox or something for 104 ashburne to identify if the money was paid to me or a vendor"*, then *"anything labeled
"Draw" was cash into one of my personal accounts"*.

**Decided:** `Advances.paid_to` - Paul / Vendor / Citizens / Chase / Seller - a dropdown on the Advances tab, asked by
Add advance, and shown on the heavy tab's advance Description ("To Paul: Draw - rehab"). The advance's money sits on
the account it names: Paul and Vendor 2030 (D-032 unchanged: the worker's bill is a row credited to 2030, so the two
cancel), Citizens 1401, Chase 1402, Seller 1000. Vendor is refused on a partner deal (D-030). Which of Paul's own
accounts the money went into does not matter to the books.
The migration had put the five Ashburne draws (158,000) and Bowling Green's 1,500 (the rest of the $7,000 check that
reimbursed Paul on 06-01 - Granite's advance of that day says so) on Chase, and the two Atlas Pools payments (2,025 on
03-06, 4,025 on 03-13; the receipts show Chase) as paid from it. Recast had no Chase account before September 2026: that
Chase was Paul's. `fixAdvancesPaidTo()` (editor, once; `reportAdvancesPaidTo()` is its dry run) fills paid_to by rule
- a purchase is Seller, "Draw" or "reimbursed Paul" is Paul, "Cash advance - <name>" is Vendor, else the account -
and moves the eight: **Chase 153,450.00 -> 0.00; Recast owes Paul 185,116.88 -> 31,666.88** (dry run on the 09-28
snapshot; run by Paul the same morning and verified on the Journal). Interest does not change: it follows the Advances row, not the account.
**Left:** the eight Ashburne vendor advances with no bill on the tab ($1,619, D-032's consequence) still come off what
Recast owes Paul; each is Paul's call - a job missing from the tab gets its row, the same job typed on another date gets
nothing. ponytail: changing a paid_to between Paul/Vendor and a bank does not move the money by itself - run
`fixAdvancesPaidTo()` again (an edit trigger when that is ever a real case).

## D-053 · Dennis's bank-deal commission is on the sale price less the seller's concessions - 2026-09-28 · Paul

Paul, on 104 Ashburne (sold 9/23 for 775,000 with a 19,000 seller credit): *"he will be taking 3% on the purchase
price minus the $19,000 seller concession. so his 3% is derived from $756,000"*, then *"the buyer agent is taking 2.75%
on the full 775,000 and dennis is taking 3% on $756,000"*.

**Decided:** amends D-036 §3 ("3% of the full sale price"). The bank deal's commission is `dennis_commission_pct` of the
sale price less every seller concession or credit on the statement (the lines on 1320) - Ashburne: 3% of 756,000 =
**22,680.00**, not 23,250.00. `lib/sale.mjs` takes it off the base and says so in the entry's memo; the heavy tab's
Profit Breakdown now has the buyer's agent (typed %, default 2.75, a new label so the old lumped 5.75 is not carried
over) and Dennis's commission as separate rows, and the Dennis Payout reads the same row. Dennis's Ashburne payoff by
the books: 501,141.44 + interest 44,900.41 + 22,680.00 = **568,721.85**, less the 550,000 he took = **18,721.85**.

## D-054 · On the bank-deal tab the property tax paid is in Rehab Total, not a second line in Total Project Cost - 2026-09-28 · Paul

Paul, shown that 104 Ashburne's tab read a profit of 121,671.88 against the books' 146,221.94: *"so would moving the
property tax paid amount out of total project cost and into rehab total fix it?"*, then *"fix the tax cost"*.

**Why:** the heavy tab's Total Project Cost (All in) was Purchase P+I + Cash Advance P+I + Property Tax Paid + the
prorated estimate. Ashburne's cash advances (176,141.44, Advances C15:C34) paid for everything it cost except the
purchase and what Recast still owes Paul (2,614.86): 162,725.05 of other costs (the tab's Rehab Total) + the 16,031.25
tax (Journal row 2148, paid by Paul with check #5899 on 3/30, the day of a 20,000 draw) = 178,756.30. So 13,416.39 of
the tax sat inside Cash Advance P+I and again on its own line. The old tab had the same line (C-24's cell E10).

**Decided:** Rehab Total = rehab + all holding, the tax included; Total Project Cost loses its Property Tax Paid line;
the prorated estimate reads the tax paid directly (the same figure). Light tabs are unchanged - they count costs, not
draws, so the tax was only ever counted once there. **Left, Paul's call:** the heavy tab still leaves out what Recast
owes Paul on the property (2,614.86 on 09-28), so its profit reads that much above the books until a "Paid by Paul,
not yet paid back" line goes into Total Project Cost. That figure can still rise, never fall: the eight worker payments
with no bill (1,619, D-032) and the Ashburne receipts parked for the card statement (D-051). Each one added raises what
Recast owes Paul and lowers the profit by the same amount, so Paul's cash from the sale does not change.

## D-055 · The partners' working money in the shared account is owed back, earns no interest and belongs to no house - 2026-09-28 · Paul

Paul, on the matcher's card for Dennis's 5,000 transfer of 2026-08-06: *"the system is not set up for this type of
thing. this was a cash deposit from dennis to fund the account"*, *"but this advance does not draw interest"*, then
*"dennis and i both put $5,000 into the account for operating capital. this was cash injected into the business that we
use for rehabs, operating costs whatever. when we sell a property that used money from this account, the money is put
back."* His own deposit is the 4,858.42 of 08-13 ("there was a reason why it was less than $5,000 and i cannot
remember why"). The 10,000 of 08-12 ("Loan 10K for oper exp mesa") is *"a typical cash advance for 366 mesa"* - it
stays the interest-bearing Mesa advance it is.

**Decided:** money a partner puts into a Recast account as working capital is a plain loan from that partner: Dr the
bank account, Cr 2010 (Dennis) or 2030 (Paul), no property, no Advances row, no interest (D-011 and D-022 govern
advances, which this is not). The account refills on its own when a sale lands; the amount stays owed until the
partner takes it out, and that withdrawal is a bank line that ties to a repayment entry. Posted by
`addWorkingCapital()` (Menu.gs, editor, once): Dennis 5,000.00 on 08-06, Paul 4,858.42 on 08-13, both bank lines
tied, both cards cleared. **Consequence:** Recast owes Paul rises by 4,858.42 (it is his money in the account).

**Added 2026-09-29 - why Paul's was less than 5,000 (Paul, on the card for his check of 08-12):** *"the missing
$141.58 to add up to my matching $5,000 is the missing $141.58 from this sparkling payout."* His 280 Sparkling
payout was 32,246.84 (`sale-20260806-e162353297b7`); the check he wrote himself was 32,105.26; the 141.58 he left in
the account is the rest of his working money (4,858.42 + 141.58 = 5,000.00, the same as Dennis's). **Decided:** one
entry of 141.58 dated 08-12, Dr 1401 / Cr 2030, no house, no interest; the payout entry is NOT changed (280
Sparkling is closed and frozen) - the bank's check ties to the payout and this entry together. Posted by
`addPaulWorkingMoneyLeftIn()` (oneOffScripts.gs). His second check of 08-12 (607.05) is a separate card, not
answered by this.

## D-056 · Hand-run scripts live in oneOffScripts.gs; Code.gs and Menu.gs hold only what the workbook reaches - 2026-09-28 · Paul

Paul: *"things are getting messy. i want to stop and clean up the apps scripts in the books file. we have a slew of
scripts in both code.gs and menu.gs... do an audit and remove all non essential or one-off scripts. then create a
separate file called oneOffScripts.gs... get organized."* The audit walked what the Recast Books menu, its dialogs,
the onEdit trigger and `doPost` reach: 33 functions in the two files were reached by nothing - fifteen dated
repairs from 2026-09-28 alone, the Phase 4 migration and the cutover's `clearBooks`, and the diagnostic and tuning
tools - sitting between the menu handlers and the posting engine; plus one dead helper (`centsRow_`, deleted).

**Decided:** `Code.gs` and `Menu.gs` hold only what the workbook itself reaches - the menu, its dialogs, the
trigger, the `/exec` endpoint - plus the standing setup tools (`setup`, `installTriggers`, `setupTotals`,
`rebuildAllPropertyTabs`, `selfTest`). Everything run by hand from the editor lives in
`apps-script/writer/oneOffScripts.gs`, in three sections (tools meant to be run again; dated one-offs in the order
written; the migration and the cutover), each block under a `// STATUS:` line (RE-RUNNABLE, DONE <date> <result>,
NOT YET RUN, RETIRED). The live files never call into the one-off file. `test/writer-gs-lint.test.mjs` enforces
both by the same walk. A DONE script stays as the record of what was done to the books by hand; deleting one is a
CHANGELOG entry. A one-off needs a `clasp push`, not a web-app deploy. Earlier entries that place such a script in
"Menu.gs" or "Code.gs" (D-052, D-055, the CHANGELOG) now mean this file; the function names did not change.

## D-057 · A charge can be on the books before its receipt: the placeholder, and the receipt takes its place - 2026-09-29 · Paul

Paul, on Dennis's four card charges of 09-28 (Home Depot 162.91, 33.07, 141.09 and 2.65 on card 9301): *"the reality
is i may not get a receipt from him. is there a way to add a NEED RECEIPT FROM DENNIS thing or something for a
placeholder?"* Asked whether he usually knows the house Dennis was buying for, he chose the first of two designs:
he picks the house; a charge whose house he does not know yet stays a card under the Bank statement tab. **No
holding account that belongs to no house** (the alternative, a "Waiting on Dennis" account, was not taken).

**Decided:**
1. **The placeholder** is an ordinary purchase entry recorded from a Bank statement card by one button, **Waiting on
   receipt** (who: Dennis or Paul): the bank's date, amount and store name, the whole amount on ONE line, 1030 Rehab -
   materials, the house Paul picks, paid from the account the line is on, trade `Waiting on receipt`, description
   **`NEED RECEIPT FROM <NAME>`** (`NEED_RECEIPT` in `lib/gate.mjs`; the books find a placeholder by those words). It
   ties its bank line like any entry, so the account still reconciles. Its Receipt cell stays blank. Money out only -
   a deposit or a refund is never a placeholder.
2. **It says only what the bank says** - this much, this store, this day, this house. It is not a guess at what was
   bought.
3. **The receipt, if it comes, REPLACES it** - never posts beside it and is never a duplicate of it. On its own
   (`supersedes`, the ingest) only when the read names the placeholder, the totals agree to the cent and every entry is
   paid from the placeholder's account; anything else that touches a placeholder (the same amount within 7 days, a read
   that calls the receipt "already recorded") **holds for Paul** (`PLACEHOLDER_WAITING`), whose card carries a ticked
   box "This is the receipt I was waiting for". The placeholder is voided on ITS OWN date, so the bank account's
   balance is right on every day; the bank lines tied to it move to the entries that replaced it (`feedRetie`).
4. **If the receipt never comes the charge stays as recorded** - the bank line is the proof it was paid.
5. **The list of what is still waiting** is printed by code under the nightly check in the 3 AM email, oldest first,
   with the total - what Paul sends Dennis. A placeholder is not a "receipt without a document" finding.
6. A sale's closing takes a placeholder with the house like any other cost; a placeholder on a house that has since
   sold is for Paul to settle by hand (Cost Recapture, D-031) - not built, not yet needed.

## D-058 · A held card that replaces an entry takes it out when Paul saves it - 2026-09-29 · Paul

Found while building D-057: the read can say a document is the corrected copy of an entry already in the books
(`supersedes` - a ride with the tip added later, an amended invoice). The ingest honoured that only when it posted on
its own; a card HELD for any other reason (over the ceiling, a meal, low confidence) and then saved by Paul posted
beside the old entry, in both Inboxes - the purchase counted twice. Put to Paul in plain words; *"fix it"*.

**Decided:** the card says what it replaces and Paul decides with a tick. A receipt card whose read names an entry
shows the yellow box, ticked: "This replaces one already in the books: <store>, <date>, <amount>". Save takes the old
entry out (a void dated today, reason `superseded by <doc>` - the ingest's own rule) and records the card; unticked,
the card is its own purchase. The amount may differ - that is what a tip is - so nothing is compared (a placeholder,
D-057, still must match to the cent). What the card names must be in the books, or Save is refused in plain words.
The bank lines tied to the old entry move to the new one when the amount is the same and go back to `unmatched`
when it is not, on Save and in the ingest alike. The web Inbox refuses to approve such a card (409) - it has no tick.
The gate reports the entry (`gate.replaces`) so the card can name it; naming one never holds a document by itself.

## D-059 · Which card paid a bank line is read from the bank's daily email - 2026-09-29 · Paul

Paul, importing the Citizens file with Dennis's four charges of 09-28: *"there is no way to know what card was
used?"* The bank's file (QFX) carries the date, the amount and the store for each line and nothing else. Citizens'
"Daily Summary" email, which paul@ gets every business day, names the card under every line ("9301 - DENNIS C
LITTLE", "5450 - PAUL V BJORK"). Told both, and offered the build: *"build it now"*.

**Decided:**
1. The paul@ poller sends each Daily Summary email to the site as it came (`/api/bank-mail`, the text only); the
   site keeps it (`books-cache`, `bankmail/<gmail id>`). No label is put on the bank's mail; the newest one sent is
   remembered (`BANK_MAIL_LAST`). Parsing happens when the email is READ, so the reader can be corrected without
   asking the mailbox again.
2. **Code reads the card, not the model** (`lib/bank-mail.mjs`) - it is matching, not judgment. A bank line gets a
   card when every POSTED email line for that day and amount names the same card. It fails closed: a summary whose
   lines do not add up to the total the email prints is not used; the same amount on the same day on two cards
   leaves both lines without one; a pending line never counts; another account's emails never count.
3. The card is a help, never a need: the matcher runs the same without it. It shows on the model's line ("card 9301
   (Dennis)"), on the Inbox card's top line ("Dennis's card (9301)") and it starts the **Waiting on** box (D-057) on
   its holder. `paid_from` does not change - both cards are on the Citizens account.
4. This is the first piece of `docs/phase3-spec.md` 6a (the Daily Summary feed). The emails do NOT become Feed rows -
   the bank's file stays the record (told to Paul the same day: the email is a preview). Chase's daily email names no
   payee and no card; it is not read.

## D-060 · One charge, one card - 2026-09-29 · Paul

The matcher asked about Dennis's three Home Depot charges of 09-28 on ONE card (337.07). Paul, looking at it: *"are
those three separate charges? if so shouldn't they be separate expenses not grouped?"* They were recorded as three
entries (D-057's one placeholder per bank line), but the card had made him decide all three at once.

**Decided:** every separate charge gets its own card - its own amount on the top line, its own house, its own
decision. The prompt asks for it ("One charge, one card"), and code does not rely on that: a question the read asks
about several lines that are ALL money out is split into one card per line (`applyVerdicts`), each naming its store,
amount and day before the read's question. Lines of both signs stay on one card - a purchase and its refund are one
event. A proposal is not split by code (its one entry adds up to its lines - a check and its fee), and neither is a
match the books could not back up; `placeholderEntries_` covers those: one entry per bank line whatever the card holds.

## D-061 · The bank account has its own tab: every line, newest on top, who paid and where it stands - 2026-09-29 · Paul

Paul: *"i want a tab dedicated to the citizens bank account. i want a running sheet that shows each charge, who paid
(me or dennis) and its status (reconciled or waiting for receipt, waiting on dennis etc) so i can easily show dennis
that a) its been reconciled and B) what i need from him"*, then *"i want it to populate at the top, not the bottom"*.

**Decided:** a tab **Citizens Bank** in the workbook, built by code from the Feed tab and the Journal
(`lib/bank-sheet.mjs`, `refreshBankSheets_` in Code.gs) - values, not formulas, rebuilt after every change to a bank
line (`feedUpdateRows_`, `importStatement`) and from **Recast Books -> Bank sheet**. Newest line on top. Columns: Date,
Amount, What the bank says, Who paid, Status, Waiting on, House, Note - with a filter on the header, so "Waiting on =
Dennis" is the list to show him. Statuses, in Paul's words: Reconciled; Waiting for receipt (a placeholder of D-057, or
a card charge still in the Inbox - on the card's holder); Waiting for an answer (anything else in the Inbox - on
Paul); Waiting for the closing; Being recorded; New - not looked at yet; Needs a look (tied to an entry since taken
out). No ids and no system words on the tab (a test keeps them off).
**Who paid** is the card the bank's daily email names (D-059), kept on the Feed tab in a new last column `card`
("Dennis (9301)"), written by the matcher for every line of the account where the cell is empty - a name typed there
by hand (a check's signer) is never written over. The bank names nobody on a check, a Zelle or a wire: those stay blank.
A card of several bank lines ties each line to all of its entries; the entry for the line's own amount speaks for it.
ponytail: one tab per account named in `BANK_SHEETS`; Chase gets its line with its first file. Nothing typed on the
tab survives a refresh.

## D-062 · Cost Recapture's tab is a plain list, not the property grid (Properties.template = List) - 2026-09-30 · Paul

Paul: *"the Cost Recapture tab is a nightmare. i just need a simple list that shows the expenses, who is owed and
whether it was reimbursed if it was paid for from a personal account. right now its in a property template that
makes no sense"*, then *"i want it to put the newest at the top"*.

**Decided:** a third template, **List** (`lib/cost-list.mjs`, `writeCostList_` in Code.gs): one row per cost line -
Date, Store, What, For (the sold house in `trade`), Amount, Paid by (Paul / Dennis / Recast account), Paid back (Yes /
No / Part, worked out oldest-first from the person's paybacks on the property - entries with no cost line) - newest on
top, with one line above it: Paul is owed, Dennis is owed, paid from the Recast account. Rebuilt after every post like
any property tab and by Rebuild property tab. D-031 stands: the books underneath are unchanged, only the tab. Nothing
typed on the tab survives a rebuild.

## D-063 · The monthly bank check is a box on the bank's own tab, not a new step - 2026-09-30 · Paul

Paul, on phase3-spec section 4 (a Reconcile menu item and a Banking page): *"whatever the solution it should be part of
something that is already built. i dont want to keep adding steps for me to remember. if anything things should be
becoming more streamlined."*

**Decided:** the bank-vs-books check is a box at the top of the account's tab (`Citizens Bank`), rebuilt with it every
time a bank line changes (`bankCheck` / `bankCheckRows` in `lib/bank-sheet.mjs`, `refreshBankSheets_`): what the bank
says (opening balance + every bank line - the import already ties the file to the bank's own balance), each reason the
books differ (bank lines open in the Inbox, waiting for a closing, not looked at yet, left out; pennies under a dollar),
anything with no reason as a red line with its date, store and amount, and what the books say. Green "they agree" or
red "N things not explained". **Replaces section 4's menu item, Banking page and month stamp** (`reconciled_ref`) - the
stamp waits until the accountant or the year-end close needs it. Code, not judgment. Books lines dated before the
bank's first line are one line of their own (Granite's 07-24 sale clearing nets to zero, so it shows nothing).

## D-064 · Claude API credits are a software cost when bought; the prepaid line and the monthly split are dropped (reverses D-018) - 2026-09-30 · Paul

The Balance Sheet showed 1,081.45 of "Prepaid API credits": 67 top-ups since May, never drawn down. D-018's monthly
job (`/api/api-costs`, on the 2nd, previous month only) had never had a turn - built 09-14, first run would have been
10-02 - and would never have reached May-August. The admin key was in place. Offered: finish D-018 (catch every month
up, per-system costs kept) or drop the split. Paul: *"Drop the split. Every top-up just counts as a business cost when
you buy it, and this line disappears. It's simpler, but you lose knowing what each system costs."*

**Decided:** an Anthropic top-up or auto-reload posts to **6400 Software & subscriptions** the day it is bought (the
bookkeeper prompt). 1520 stays in the chart, unused; the Balance Sheet names anything left on it "recorded the old way
- tell Claude". `moveApiCreditsToSoftware()` moved the 1,081.45 to 6400 one entry per month, dated each month's last
day (rerunnable: it moves only what is left). The monthly job, its web card and the poller's call are deleted. The
Console workspaces and `ANTHROPIC_ADMIN_KEY` are no longer used by the books.

## D-065 · The Balance Sheet is its own tab, in plain words, that updates itself - 2026-09-30 · Paul

The menu's Reports -> Balance sheet wrote "Report - Balance sheet" only when someone ran it; Paul opened it on 09-30
and found the Phase 1 test snapshot of ~09-11 (TEST Phase 1 gate, Granite still owned). Paul: *"i want Balance Sheet as
its own tab"* (not a section of Totals).

**Decided:** a `Balance Sheet` tab - what Recast owns (each house at its cost with Dennis's interest not recorded yet,
costs after a sale, cash), what it owes (Dennis's loans, his interest recorded and not recorded yet, what Recast owes
Paul), what is left for the owners (profit on the sales, business costs, paid out) and an "Adds up" line
(`balanceSheetTab` in `lib/reports.mjs`, `refreshBalanceSheet_` in Code.gs). Rebuilt **every hour** by a timer
(`installTriggers` installs it; Paul ran it 2026-09-30) - nothing to run. Dennis's interest that has built up on the
open advances but is not posted is counted on BOTH sides (a house cost and owed to Dennis, D-011), so the sheet adds up
and the houses read what they really cost. The menu item is removed and the old tab deleted. Whether Dennis's interest
should be POSTED monthly (the Post interest menu, never run on the held houses) is still Paul's call - not decided.

**Amended the same evening (Paul): the tab is `P&L`** - *"change the name of the tab to P&L and put the P&L section at
the top. remove any duplicate numbers and streamline this as much as you can."* `pnlTab` (replacing `balanceSheetTab`):
this year's profit and loss first (each house sold with its sale date, other income, business costs, "Recast earned"),
then what Recast owns (the houses as ONE line - each house's tab has its number - costs after a sale, cash), what it
owes (Dennis's loans, his interest recorded and not recorded yet - named once, Paul), and what is left (paid out to Paul,
Left). Each fact once; "adds up" is in the date line (red when it does not). One value may show twice when two facts
share it - today Left equals the business costs, because all the house profit went to Paul - and its note says so. The
menu's P&L report is removed with its tab; the timer handler keeps its first name so the installed trigger still finds it.
The P&L shows the current year only; tax season needs last year's column before January 2027.

## D-066 · The menu holds only what Paul uses; Dennis's interest is recorded at closing, not monthly; one-off scripts come out once run - 2026-09-30 · Paul

Paul trimmed the workbook the same evening, one ask at a time: *"remove the three reports from the menu"* (Trial
balance, Job cost, Dennis ledger - the Totals tab has the live trial balance, each house tab its costs, the P&L tab
Dennis's interest), *"remove both from menu"* (Self test - a code check, never his - and Post interest), *"move sell
property into the same section as add property and just below add advance"*, then *"remove all scripts in the
oneOffScripts.gs"*.

**Decided:**
1. **The menu** is New expense, New journal entry, Void selected entry, Inbox / Add property, Rebuild property tab, Add
   advance, Sell property / Import statement, Match statement lines, Bank sheet / Close period, Reopen period. The
   reports' old "Report - " tabs are deleted by the hourly P&L run. `selfTest` stays in Code.gs, run from the editor.
2. **Dennis's interest is not recorded monthly** (the open question since D-065): each house tab and the P&L tab work
   it out themselves, and the sell wizard records it at closing (`lib/sale.mjs` trues up anything already posted), so
   monthly posting would only move the P&L tab's number from "not recorded yet" to "recorded". At the year-end the
   accountant may want the held houses' interest recorded through 12-31 - Claude restores `postInterest` (commit
   774ecd3, Menu.gs) and runs it from the editor. The Post interest dialog is deleted.
3. **One-off scripts come out once they have run and been checked** (amends D-056) - the editor's list stays short.
   Git keeps every one: all 42 up to 2026-09-30 are in commit 774ecd3 (`git show
   774ecd3:apps-script/writer/oneOffScripts.gs`; `postInterest` and its helpers in that commit's Menu.gs). The rule
   of where they live is unchanged: never in Code.gs or Menu.gs.

## D-067 · The migration is closed: one final register, every leftover settled - 2026-10-01 · Paul

Paul, 2026-09-30: *"i'm sick of constantly being told there are more hidden things to deal with from the migration. i
want all of it done this time and documented. THIS IS IT. LAST TIME. bring all outliers to the table now."* Two full
sweeps (seven finders and a critic, then seven gap hunters; every finding checked by a skeptic, merged and recounted
against the live Journal of 10-01) produced **one register of 45 items** - `docs/migration-leftovers-final.md`, the
record. Paul answered it in one message: *"yes to everything. keep the doorbell. leave $200 dennis mowed off books."*,
then for the phone pictures *"yes to all recommendations"* except the Portland dump run and Dennis's 380 check to Julio
("leave off") and the NTTA tolls in Linda Little's name ("keep under truck/gas etc"), and *"ignore them"* for the three
pictures too large to read.

**Decided:**
1. **The migration is closed.** Everything it left is settled in the register - posted, voided, relinked, re-labelled,
   in the Inbox for Paul's cards, or closed by his word. Nothing from the old books, the 09-17 mail indexes or the
   documents read is open outside it. A migration-era item that shows up later is Claude's to settle quietly (the
   nightly check now says so), never a new list for Paul.
2. Paul's personal statements still never come in (D-051), so "the statement will prove it" is retired: the old
   books' no-receipt rows stay as he typed them (register item 11), and a receipt with items left off is settled by
   his card in the Inbox, line by line.
3. **Dennis's 06-17 mowing of 280 Sparkling ($200) stays off the books** (Paul's no); the 08-07 photo is only linked
   to the Julio row.
4. A charge is proven by Paul's own note on the email when the email itself shows no payment (the Squarespace welcome
   email he forwarded to himself as "INVOICE").
5. An entry whose description or memo still says PENDING ROUTING is refused (`lib/posting.mjs`, a void is exempt).

## D-068 · On the closing tab a cash advance is its own cost, never part of Rehab Costs - 2026-10-01 · Paul

Paul shaped the closing tab's PROJECT COSTS himself (the trial tab `280 Sparkling - Closing (simple)`,
`docs/phase5-spec.md` section 3a): Purchase Principal, Purchase Interest, Cash Advances Principal, Cash Advances
Interest, Rehab Costs, Utilities. Asked how the advance principal sits beside the rehab bills it paid for, he answered:
*"cash advances shoudl never be added to rehab costs. they are their own costs."*

**Decided:** `Cash Advances Principal` is a cost row of its own and counts in Total Project Costs. `Rehab Costs` is the
bills (rehab, lawn care, an HOA release paid before closing, listing) **less the money the cash advances covered** - an
advance pays a worker directly or pays Paul back for bills he paid, and the books hold both the advance and the bill
(D-052), so the same dollars must not sit in both rows. The total is unchanged by the split: every cost the books hold,
once, which is what makes cash received less Total Project Costs the books' profit.

Worked on 881 Newport (2026-10-01, before its closing): bills other than utilities 3,842.64, cash advance 2,000.00 ->
Cash Advances Principal 2,000.00, Rehab Costs 1,842.64, Utilities 759.53, Purchase Principal 207,000.00.

**Not touched:** the house tabs (the light tab's Total Project Cost has only the cash advances' interest and shows
Rehab Costs in full; the heavy tab is by funding already), the Journal, and the PAYOUTS block, where Dennis is simply
repaid his advances. In PAYOUTS, `Paid out of pocket` is bills a partner paid that no advance covered.

