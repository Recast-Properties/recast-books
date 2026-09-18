# Phase 3 — Banking from statement uploads

Written 2026-09-15 for Paul's review before any code. Supersedes the Plaid plan (D-019).
Extends the Phase 0/1/2 specs, which stay binding: every write through the writer, Claude
decides and code executes, dry run before anything touching history.

## 1 · What Paul does each month

For each of the three accounts (1401 Citizens shared, 1402 Chase operating, Paul's
personal card/checking for the 2030 lines), download the month's activity from the bank
and drop it on the **Banking** page, or forward the statement email to
`statements@recast-properties.com`. Preferred file: **OFX/QFX** ("Quicken" or "Money"
export — both Citizens and Chase offer it). Fallbacks: the bank's **CSV**, or the **PDF
statement**. That is the whole manual step: three files a month.

## 2 · Parsing → the Feed tab (deterministic)

`lib/statement.mjs` turns a file into lines `{feed_id, account, date, amount_cents, name,
memo, balance_cents?, source_file}`:

- **OFX/QFX**: SGML/XML `<STMTTRN>` blocks — `FITID` (the bank's stable id), `DTPOSTED`,
  `TRNAMT`, `NAME`, `MEMO`; `<LEDGERBAL>` gives the closing balance and date; `<ACCTID>`
  last-4 identifies the account against `Bank accounts.last4`. No model involved.
- **CSV**: column layouts differ per bank. The first time a layout is seen, Claude reads
  the header + three rows and returns a column map (date, amount or debit/credit,
  description, balance); the map is saved in Settings `csv_map:<institution>` and reused
  by code from then on. `feed_id` = hash of account|date|amount|description|row-index.
- **PDF**: existing PDF.co text extraction, then Claude with the Phase 2 tools reads the
  statement into lines and the closing balance. Held for Paul's confirmation before
  import, always (a model-read table is a proposal, not a fact).

`feed_id` is the dedupe key: a re-uploaded file adds nothing. Lines are appended to
`Feed` through a new writer action `feedBatch` (all-or-nothing, refuses a repeat
`feed_id`). Feed columns: `feed_id, account, date, amount, name, memo, balance,
status (unmatched|matched|proposed|excluded), txn_id, match_note, source_file,
imported_at`.

## 3 · Matching (Claude decides, code checks)

After an import, `books-match-background` runs the **feed-line job** from BUILD-PLAN §6
over the account's unmatched lines, oldest first, one model call per statement (the
lines are small; batching keeps context):

Tools: `read_ledger` (journal lines on that account ±7 days of the statement's range),
`search_docs` (receipts posted or pending), `find_vendor`, `list_properties`.

For each line the model returns one of:
- **match** `txn_id` — an existing journal entry on this account with the same amount
  (code verifies amount equality and that the txn_id is not already matched; a mismatch
  is bounced back once, then held).
- **transfer** — the other side is another of our accounts (a Citizens→Chase move, a
  card payment): code posts `Dr 14xx Cr 14xx` and matches both lines when the other
  account's line exists, else holds until it arrives.
- **propose** — an uncovered charge: `{payee, account, property, description}` in the
  Phase 2 `proposedEntry` shape, `paid_from` = this bank account. Goes through
  `evaluateGate` exactly like a receipt: autofile below the ceiling with high
  confidence and a non-§274(d) account, otherwise an Inbox card. A Dennis deposit into
  Citizens is proposed as an **advance** (BUILD-PLAN §6 "Advance" job) with the property
  it is for, always held — an advance starts interest (D-010), so Paul confirms it.
- **exclude** — bank interest/fees are proposals to 6910/6930; a personal line on the
  personal card is `excluded` with a note (it is not Recast's).

Every verdict is written to the Feed row (`status`, `txn_id`, `match_note`), so the
Banking page can show what was decided and why, and the model's verdict has a verb.

## 4 · Reconciliation (deterministic)

Per account per month: `opening_balance` (from `Bank accounts`, then the prior month's
closing) + Σ feed lines = the file's closing balance, or the import is flagged
`BALANCE_MISMATCH` and the month cannot close. Then: ledger balance of the 14xx account at
month end vs statement closing balance; the difference must be explained entirely by
`unmatched` + `proposed`-but-held lines (outstanding items). The **Banking** page shows
the three numbers and the outstanding list; when the list is empty the month is
**reconciled** and every matched journal line gets `reconciled_ref = <account>-<YYYY-MM>`.
This is what the Phase 5 overhead close checks (D-015).

## 5 · Pages

- **Banking**: per account — upload drop zone (or "forward to statements@"), months
  with status (imported / reconciled / mismatch), the feed with match status and the
  why-note, outstanding items, and the three reconciliation numbers. Owner verbs on a
  line: match to (pick a journal entry), mark transfer, exclude, or approve the proposal
  (which is the Inbox card).
- **Inbox**: feed proposals appear as cards alongside receipts, tagged `feed`.
- **Dashboard**: "unmatched feed lines" and "months not reconciled" counts.
- **Upload**: accepts statement files with an account picker (or auto by last-4).

## 6 · Poller

`statements@` is a Google Group whose member is paul@ (made with the Recast-site email
tool, never touched from here); the paul@ poller gains the address alongside receipts@ and
travel@ with channel `statements`. Attachments of type OFX/QFX/CSV/PDF go to
`/api/upload`; the ingest routes channel `statements` to the statement path instead of
the receipts bookkeeper.

### 6a · Daily Summary emails from Citizens — the first feed source (Paul, 2026-09-17)

CNB of Texas (`alerts@cnboftexas.com`, subject **"Daily Summary"**) sends paul@ one email
per business day for account …2505: the date, every **posted** debit and credit with the
bank's description, the **pending** authorizations, and the **ending balance**. 28 of them
sit in paul@ since late August 2026 (`data/migration/2026-09-17/gmail-listing-paul-2026-09-17.json`).
Paul: "we can use those to reconcile every day."

- The paul@ poller recognises the sender + subject and posts the email body to the
  statement path with channel `bankfeed` — no attachment, no Group, no new address.
- `lib/statement.mjs` gains a deterministic Daily Summary parser: posted lines →
  Feed rows (`feed_id` = hash of account|date|amount|description|ordinal), the ending
  balance → that day's `balance_cents`. Pending lines are stored as a preview
  (`status = pending`) and replaced when they post; they never match or reconcile.
- Matching (§3) runs per email, so a card charge or Zelle payment is matched to its
  receipt the day after it clears, and a line unmatched for more than N days (Settings,
  default 5) is the "receipt never forwarded" flag in the digest. The Zelle notices in the
  same mailbox (e.g. "$500.00 to Carlos A Ibarra was sent") are the contractor payments
  with no receipt; they resolve here, not in the receipts lane.
- Reconciliation (§4) can tie **daily** to the emailed ending balance, and the monthly
  statement upload becomes the check on the feed rather than the feed itself.
- Limits: one account (…2505), late-August onward, bank only — the personal Visa and the
  history before the alerts began still come from statement uploads (§1). Prior-day
  balances must chain: day N's ending balance minus day N+1's net must equal day N+1's
  ending balance, or the parser reports a gap (a missed email).

**Zelle confirmations carry Paul's memo (added 2026-09-18).** CNB also mails paul@ a
"Notification - Your $X to <payee> was sent" for every Zelle payment, and the body holds the
memo Paul typed at the bank: "$275.00 to Effren Landscaper - Invoice #1390 for Newport, Bowling
Green, Sparkling", "Carlos A Ibarra - 366 Mesa - removed old siding...". Six sit in paul@ for
2026. That memo is where Paul records how a contractor invoice was paid and for which properties;
the receipts poller never sees it, because the email is not sent to a receipts address, so the
invoice read comes back `paid_from UNKNOWN`. The bankfeed poller takes these too (same sender
family, subject "was sent"): the memo goes on the Feed row, and matching uses the invoice number
and property names in it to tie the payment to the invoice - payer 1401, split as the memo says.

## 7 · Not built

No live feed, no balance polling, no bank credentials anywhere, no Plaid. `Bank
accounts.plaid_item_id`/`plaid_account_id` stay empty. If a feed is ever wanted, it is one
more producer of Feed rows behind the same `feed_id` dedupe and the same matching job.

## 8 · Tests

`statement.mjs`: OFX fixtures from Citizens and Chase (real files with amounts and names
redacted), CSV map round-trip, PDF path hands off to the model; `feedBatch` writer lint
(dedupe by `feed_id`, all-or-nothing); matching job with a fake model (match / transfer /
propose / exclude, amount-mismatch bounce, already-matched refusal); reconciliation math
(balance mismatch flagged, outstanding items explain the difference, `reconciled_ref`
stamped only when the list is empty). `npm test` green.

## 9 · Gate

One full month of Citizens, from Paul's real download: the file imports with the closing
balance tying; every line is matched, a transfer, a proposal Paul approved, or excluded
with a reason; the month shows **reconciled**; the Dashboard counts read zero for that
account and month. Then Chase, then the personal card.

## 10 · Paul's steps (one at a time, when we start)

1. Download one Citizens month as OFX/QFX (I will tell you where it is in their site
   when we get there) and upload it.
2. Create `statements@` with the email tool.
3. Review the first month's cards.
