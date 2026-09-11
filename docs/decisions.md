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
