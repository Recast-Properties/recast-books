# Phase 2.5 — Read cache: the pages stop waiting on Apps Script

Written 2026-09-12. Why: measured from Paul's browser, every call that reads the workbook
takes 2–13 s (Apps Script scheduling, not our code) while calls that stay inside Netlify
take under a second. A cold call past the 10 s function timeout returns Netlify's HTML
502, which the app shows as `BAD_RESPONSE` and boot drops to the sign-in card. Plaid
(Phase 3) is waiting on production keys, so this ships first.

Constraint 2 in `CLAUDE.md` stays: **every write goes through the writer.** Reads come
from a snapshot the functions keep; the writer is read only to fill or refresh it.
(`BUILD-PLAN.md` §3 already said functions read directly "for speed"; Phase 0 chose the
writer for reads to keep one credential. This keeps that too — no new credential.)

## 1 · `readTab` in `netlify/functions/_shared.mjs`

```
readTab(writer, tab, { fresh = false, since, limit, all } = {}) -> { headers, rows }
refreshTab(writer, tab) -> { headers, rows }     // read the writer, store, return
```

- Store: Netlify Blobs `books-cache` (strong consistency), key `tab/<tab name>`, value
  `{ fetchedAt, headers, rows }` — the **whole tab**. `since`/`limit` are applied in the
  function after the read, so one snapshot serves every shape of Journal read. Journal is
  a few thousand rows at most this year; Blobs values can be MBs.
- TTL: `Journal` 60 s; every other tab 10 min. `fresh: true` bypasses the TTL.
- **Every write refreshes.** After `post`, `postBatch`, `void` → `refreshTab("Journal")`;
  after `upsert(tab)` → `refreshTab(tab)`; after `setPeriod` → `refreshTab("Periods")`.
  So a post made by one function instance is visible to every other instance at once,
  which the module-scope caches never were. Paul's hand edits to the sheet (Settings,
  Users, deleting test rows) show within 10 min.
- **Stale beats dead.** The writer read runs under an 8 s `AbortController`. If it
  aborts or throws and a snapshot exists (any age), return the snapshot and note
  `stale: true` on the result; if none exists, throw as today. A cold Apps Script call
  can no longer take the page down.
- The existing module-scope caches (`getPostingCtx` 60 s, `getUsersByEmail` 5 min,
  `getJournalAll` 30 s) become thin wrappers over `readTab` — same signatures, the
  `invalidate*` functions now call `refreshTab`. No caller outside `_shared.mjs` changes
  its call shape.

## 2 · Call sites (22 reads across the functions)

Replace every `writer.read(...)` in `books-meta`, `books-ledger`, `books-reports`,
`books-dennis`, `books-ingest-background` with `readTab(...)`, **except** the D-012
duplicate re-check in `books-ingest-background.mjs` (the "fresh ledger read right before
any post") which becomes `readTab(writer, "Journal", { fresh: true, since })`. The ingest's
first ledger read (for the model's `read_ledger` tool) also passes `fresh: true` — the
model must see what is posted, not a minute-old view. Everything else takes the snapshot.

`books-meta` gains `?fresh=1` (owner only) so the Settings and Users pages can force a
re-read after Paul edits the sheet by hand; the Settings page gets a small "Refresh from
sheet" link that uses it. Nothing else in `web/` changes — the pages already fetch in
parallel; they were waiting on the writer, not on each other.

## 3 · Tests

`test/shared.test.mjs`: fake store + fake writer. Cases: miss → writer read, stored;
hit within TTL → no writer call; expired → writer call; `fresh` → writer call; write
paths refresh; writer abort with a snapshot → stale result, no throw; writer abort with
no snapshot → throws; `since`/`limit` applied to the Journal snapshot identically to the
writer's own filtering (same rows as `writer.read("Journal", {since, limit})` on a
fixture). `books-ingest-background.test.mjs`: the duplicate re-check still calls the
writer directly. Existing tests keep passing with the fake store already used for
`books-docs`.

## 4 · Gate

From Paul's browser, warm: Journal, Dashboard, Inbox, Reports each render in under 1.5 s
(measured as the slowest API call on the page). A post from the Journal page appears in
the list on the next load without waiting. A cold writer call (first call after
minutes idle) no longer produces `BAD_RESPONSE` or the sign-in card. `npm test` green.
