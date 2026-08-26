# General ledger schema

One flat tab. One row per transaction. The only tab written to — property subledgers
and every report are generated views over this.

## Why flat

The current side-by-side category blocks cost three things already being paid:
blocks fill and the writer returns `BLOCKED`; rows land in processed order so a
separate sorter script exists to repair date order; and a payee's total is unknowable
without a custom scan. A flat ledger removes all three, and it is the shape QuickBooks
and Xero import natively (see D-001's hedge).

## Columns

| # | Column | Type | Purpose |
|---|---|---|---|
| 1 | `txn_id` | auto | Stable key for edits, dedupe, audit trail. Needs a generation rule — see open issue below. |
| 2 | `date` | date | Normalized `MM/DD/YYYY`, one format everywhere |
| 3 | `payee` | lookup | Canonical name from the vendor master — never free text |
| 4 | `description` | text | What was bought, itemized |
| 5 | `amount` | currency | Gross paid, tax included |
| 6 | `sales_tax` | currency | Split out where known |
| 7 | `account` | lookup | Chart of accounts code |
| 8 | `property` | lookup | Property tab name, or `OVERHEAD` |
| 9 | `cost_class` | enum | Acquisition / Rehab / Holding / Selling / Overhead / Financing / Owner |
| 10 | `tax_treatment` | enum | Expense / **Inventory (held)** / **COGS (released)** / Fixed asset / Non-deductible / Owner equity |
| 11 | `trade` | lookup | HVAC, Roofing, Paint & Flooring, Pool… replaces the heavy template's 14 blocks |
| 12 | `paid_by` | enum | Recast / Paul / Dennis — replaces the TRUE/FALSE flags |
| 13 | `reimbursed` | bool | Whether a personally-paid cost settled or went to capital |
| 14 | `pay_account` | lookup | Which card or bank — the hook for reconciliation |
| 15 | `is_1099` | bool | Derived from the vendor record, overridable per row |
| 16 | `receipt_url` | link | The existing HYPERLINK to source email, carried forward |
| 17 | `source` | enum | auto-filed / manual / bank-import / migrated |
| 18 | `reconciled` | text | What cleared it: a statement period, `ALTA <date>`, or a member-capital settlement |
| 19 | `business_purpose` | text | **Required non-null** for 6600, 6700, 6710, 6720 |
| 20 | `attendee_or_recipient` | text | Meals (6710) and gifts (6720) |
| 21 | `destination_nights` | text | Travel (6700) |
| 22 | `odometer` | text | Vehicle (6600), if the actual method survives Q-5 |

## On columns 19–22

§274(d) requires these contemporaneously. A business purpose drafted by the agent from
the email body at ingest is contemporaneous; one reconstructed in January is not. This
is why they are GL columns rather than something reconstructed at tax time.

Consequence for the autofile gate: **6700, 6710 and 6720 must not be autofile-eligible.**
No §274(d) category should reach the ledger without a person supplying the field the
statute requires.

## On `tax_treatment`

Held and released are separate enum values, not one collapsed `Inventory-COGS`. The
state transition has to be visible in the GL rather than inferred, or the year-end
inventory figure cannot be produced and the release rule has nothing to key on.

## Open issues

- **`txn_id` has no generation rule yet.** It needs to be stable across re-runs of the
  migration and unique across sources. Proposal: `<source>-<yyyymmdd>-<short hash of
  payee|amount|description>`, but this has not been settled. Raised by the
  implementation lens.
- **Duplicate protection has no durable key.** The current writer's guard is a 6h
  CacheService TTL, which is a race fix, not a permanent identity. A flat GL wants a
  real dedupe key that survives restarts.
- **Period locking via protected ranges** is awkward with a ledger that appends in
  processed order and is then date-sorted. Sorting moves rows across a lock boundary.
  Needs a design — probably lock by a `period` column rather than by row range.
