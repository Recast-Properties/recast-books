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
