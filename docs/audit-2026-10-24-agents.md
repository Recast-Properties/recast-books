# System audit 2026-10-24 - the five agent reports and the data run

Companion to `docs/audit-2026-10-24.md`. Each report is as the agent handed it back (read-only audits of the code at commit c067d46); the lead's verification notes are in square brackets where added. The data section is the output of the tally script run against every post-cutover document in the Netlify store on 2026-10-24.

---

# Agent A — receipts ingest path (upload → read → gate → post → Inbox verbs)

## Executive summary

- The review load is mostly information Paul alone has, not self-distrust. October's held cards (HANDOFF.md 10-13, 10-20) are "which house", "who paid" for cash/Zelle, and over-ceiling (now 2,000). The rails that hold on distrust (LOW_CONFIDENCE, POSSIBLE_TWIN, PARTLY_ON_BOOKS) are rare or fading. The one code change that removes a class of reviews is a byte-hash twin rail (#3); the one that removes a class of downstream reviews is fixing the TOTAL_MISMATCH tolerance so a posted total always equals the receipt (#2).
- One real data-loss hole: a background ingest that dies mid-run leaves an envelope at `processing` forever. Nothing retries it (the warm job only retries `error`), the poller never re-sends it (thread labelled at upload), the Inbox never shows it. Only the 2 AM check lists it. One-line fix (#7).
- The biggest waste is the docs store scanned whole, sequentially, on every `search_docs` tool call and every 5-minute warm run — ~1,300 Blobs GETs per scan, ~16 scans an hour. It adds minutes to every read, and the Inbox GET (parallel scan inside a 10 s sync function) will stop loading when the store reaches a few thousand envelopes. One index blob fixes all five scan sites (#14/#15).
- Two approve paths and a migration-only posting path still live in production. The web approve (`approve` + `approve-bg` + `posting` state) is the weaker twin of the workbook's Save and unused by Paul (rule 8); `repost`/`repost-all`/`overrides`/dismiss-replay post from stored reads under rules D-067 closed. Deleting them is the strongest "fewer ways to post" change (#19/#20).
- Tests are good where it has hurt. The 17-nullable 400, the doGet misfire, the >6-attachment drop and the 3000 px cap are all pinned. Not a rebuild case: the gate/posting core is sound, generated into lib.gs with a sync test, and the state machine's gaps are patchable.

## Findings

| # | Finding | Evidence | Kind | Effort | Reward | Confidence |
|---|---|---|---|---|---|---|
| 1 | PAYER_UNKNOWN with a unanimous vendor history is prompt-only (D-045, rule 5); the data for a code rail is already in memory (`buildPostedEntries` carries payee + paid_from over the 365-day window) but no October hold shows the prompt failing since the window grew from 60 to 365 days | `lib/bookkeeper-prompt.md:270-275`; `netlify/functions/books-ingest-background.mjs:48,122-140` | review-load | S | low — the hold is now rare | verified |
| 2 | TOTAL_MISMATCH tolerance lets an entry post whose total ≠ receipt total: gate allows ±0.5% when subtotal+tax given, `buildPurchase` posts Σitems, the Feed matcher ties within 5¢ → the bank line later comes back as a card for Paul | `lib/gate.mjs:242-246`; `lib/posting.mjs:467-480`; `lib/feed-match.mjs:20` | review-load / correctness | S | high — one receipt becomes two reviews | verified (mechanism); frequency unmeasured |
| 3 | POSSIBLE_TWIN holds when payee/date/total match and no invoice number tells them apart. A byte-identical attachment is the same document by definition; no hash is stored at upload | `lib/gate.mjs:78-85`; `netlify/functions/books-upload.mjs:148-160` | review-load | S–M | med — kills the forwarded-twice twin; not the Uber summary/receipt pair (different bytes) | suspected (frequency) |
| 4 | LOW_CONFIDENCE as a hold on a `post` verdict is a policy line (D-044 chose medium, not low); the prompt makes low+post self-contradictory, so it is rare | `lib/gate.mjs:203`; prompt `:61-66` | review-load | — | low | verified |
| 5 | "Which house" and "who paid" (cash/Zelle) holds lack information the bank statement supplies days later; D-087 already self-resolves the reverse order (statement first, receipt second). A "wait for the bank" state instead of an Inbox card is a policy call | `books-ingest-background.mjs:724-743`; D-087 | review-load | M | high if Paul agrees | verified (mechanism) |
| 6 | D-092 drinks, D-046 utilities, trade reuse (`tradesByProperty`) are correctly placed: drinks in code, utilities as judgment, trades as a hint | `lib/gate.mjs:252-260`; `books-ingest-background.mjs:207-221` | review-load | — | fine | verified |
| 7 | Stuck `processing`: an ingest that dies (15-min cap, OOM on a large photo, platform fault) is never retried — warm retries `error` only; poller labelled the thread at upload; Inbox lists `pending` only; only the nightly check lists it as "stuck" | `netlify/functions/books-warm-background.mjs:35`; `apps-script/poller/Code.gs:328-340`; `netlify/functions/books-reconcile-background.mjs:92` | correctness | S | high — a silent lost receipt | verified |
| 8 | Envelope writes are blind overwrites (no etag); two ingests can run on one docId: upload does not skip `processing`, and a multi-part email re-sends every part when one part's upload fails. Blobs v11 supports `onlyIfMatch` | `books-upload.mjs:50`; `apps-script/poller/Code.gs:676-685`; `books-ingest-background.mjs:550-554`; `node_modules/@netlify/blobs/dist/main.d.ts:42` | correctness | S | med — double post if the two reads hash differently | verified (window); suspected (frequency) |
| 9 | Workbook Save marks `posted` before posting and reverts on failure; a script death between the two leaves `posted`+`in_process` with no Journal rows. Nothing sweeps `in_process`, but the nightly "posted, not on Journal" list catches it | `apps-script/writer/Menu.gs:858-881`; `netlify/functions/books-inbox.mjs:274,286` | correctness | — | acceptable | verified |
| 10 | Ingest voids the placeholder, then posts; if postBatch fails after the void, the retry finds the placeholder gone, voids again → ALREADY_VOIDED → `pending` with a writer code as the card's reason. Placeholder gone, receipt not posted, Paul reads a code name | `books-ingest-background.mjs:637-650,697-703` | correctness | S | low–med — needs a writer failure inside the window (lock timeouts under bursts, CHANGELOG 09-28) | verified |
| 11 | Drive filing runs before postBatch and is not idempotent; a retried post files a second copy | `books-ingest-background.mjs:632`; `lib/writer-client.mjs:78-79` | correctness | — | low | verified |
| 12 | Journal cache is coherent: fresh reads also write the snapshot; every post refreshes; `{fresh:true}` never falls back to stale | `netlify/functions/_shared.mjs:184-197,219-246` | correctness | — | fine | verified |
| 13 | A high-confidence `dismiss` with no `duplicate_of` is final with no human (by D-012); the digest's dismissed list is the only eye on it | `books-ingest-background.mjs:592-598`; `netlify/functions/books-summary.mjs:156` | correctness | — | fine, by design | verified |
| 14 | `searchDocs` lists and GETs every `doc/` blob sequentially on every `search_docs` call, stopping only at 40 matches; ~1,300 GETs ≈ 30–60 s per call, 1–3 calls per read | `books-ingest-background.mjs:254-284` | efficiency | M (shared fix with #15) | high — minutes per document, growing linearly | verified (shape); timing estimated |
| 15 | Five whole-store scans: Inbox GET (parallel, inside a 10 s sync function — a cliff at a few thousand envelopes), summary (daily), reconcile (nightly), warm retry (sequential, every 5 min by Netlify schedule + every 15 by the poller ≈ 16 scans/hour, ~500k GETs/day to find ≤2 retries) | `books-inbox.mjs:94-95`; `books-summary.mjs:99`; `books-reconcile-background.mjs:213`; `books-warm-background.mjs:30-33`; `netlify.toml:18`; `netlify/functions/books-warm.mjs:4`; `apps-script/poller/Code.gs:342` | efficiency | M | high | verified |
| 16 | Three whole-Journal reads per auto-post (pre-read, recheck, post-refresh); via the Sheets API service account each is seconds. The 365-day window of ~3,600 rows in memory is trivial | `books-ingest-background.mjs:363,494,664`; `docs/ops.md:57` | efficiency | — | fine | verified |
| 17 | Jimp + heic-convert in the bundle cost cold-start only and are needed (zoom, HEIC, thumbs). Opus-5, effort high, 16k/turn, 24 turns: usage is stored per envelope but never summed anywhere Paul sees | `lib/bookkeeper.mjs:19-30,671-681`; `books-ingest-background.mjs:559` | efficiency | S | low | verified |
| 18 | Prompt (446 lines) and tool list are cached (`cache_control` on system + last tool) | `lib/bookkeeper.mjs:193,654` | efficiency | — | fine | verified |
| 19 | Two approve paths. Web `approve` → `posting` → `approve-bg` is the weaker twin of the workbook's `inboxApprove` (refuses placeholders/supersedes with 409) and unused by Paul (rule 8) | `books-inbox.mjs:180-250`; `netlify/functions/books-approve-background.mjs`; `apps-script/writer/Menu.gs:828-885` | structure | M (deletion) | med — one place a post can start | verified |
| 20 | Migration-only posting code still live: `overrides` block (D-026 rules), dismiss-replay, `repost`/`repost-all`, `scripts/recover-errored.mjs`; D-067 closed the migration and constraint 10 forbids replaying pre-cutover docs. `fromStored` itself stays (the warm retry uses it) | `books-ingest-background.mjs:420-459`; `books-inbox.mjs:135-178`; `books-warm-background.mjs:37,45` | structure | S (deletion) | med — fewer ways to post | verified |
| 21 | Dead for Paul: `web/app.js` (1,320 lines) + session auth branches in upload/inbox/file; only the poller secret is ever used by the workbook and pollers | `web/app.js`; `netlify/functions/books-auth.mjs`; `_shared.mjs:73-80` | structure | M | low–med (attack surface) | verified |
| 22 | Small duplication: `DOC_ID_RE` in three files + `KEY_RE`; `driveFileName` copied into Menu.gs; `buildEntriesFromModelSafe` is a no-op wrapper | `books-upload.mjs:54`, `books-ingest-background.mjs:55`, `books-inbox.mjs:32`, `books-file.mjs:14`; `Menu.gs:811`; `books-ingest-background.mjs:752-754` | structure | S | low — fold on touch | verified |
| 23 | History-as-comments: "modules being written concurrently by another agent… import throws until that work lands" (×2), "see this task's report" (×6, no such report in repo) | `books-ingest-background.mjs:12-16,120,150,294,324,558`; `_shared.mjs:8-11` | structure | S | low | verified |
| 24 | One-case patches: `SPLIT_TRADES`, `allFuel` 66xx override, `practiceRun` status text, `PENDING ROUTING` regex, `repairDecideInput` for antml tags, `ownReceiptUrl` all-shown rule, `contentDisposition` | `books-ingest-background.mjs:206,438,269-275`; `lib/posting.mjs:233`; `lib/bookkeeper.mjs:527-564`; `_shared.mjs:382-387`; `books-file.mjs:85-90` | structure | — | mostly fine; the migration ones go with #20 | verified |
| 25 | lib/ → lib.gs is generated with a byte-equality test; poller/Inbox `GATE_TEXT` has a lint. No drift path | `test/gs-lib.test.mjs:34`; `test/poller-gs-lint.test.mjs:115-118` | structure | — | fine | verified |
| 26 | The four named breakages are pinned: 17-nullable, doGet misfire (client + cache), >6 attachments, 3000 px; `inboxApprove` ordering is pinned by source-text order | `test/bookkeeper.test.mjs:206,573`; `test/writer-client.test.mjs:203-238`; `test/shared.test.mjs:242`; `test/poller-gs-lint.test.mjs:189-212`; `test/writer-gs-lint.test.mjs:822-825` | tests | — | fine | verified |
| 27 | Protected only by a comment: the 21k streaming bound on `MAX_TOKENS_PER_TURN` (test checks the request carries the constant, not that it is ≤ 21k); the `processing` re-upload race (upload tests cover pending/error only); the `overrides`/dismiss-replay blocks (no ingest test — delete instead); stuck-`processing` recovery (none) | `test/bookkeeper.test.mjs:138`; `test/books-upload.test.mjs:271-294` | tests | S | med | verified |

## High-reward findings

**#7 Stuck `processing`.** In `retryErroredDocs` treat `status === "processing"` with `startedAt` older than ~30 minutes exactly like `error` (same `retries` budget, same `fromStored` choice). Also add `processing` to `TERMINAL_SKIP_STATUSES` in the upload when it is younger than 30 minutes so a re-sent multi-part email cannot start a second ingest on a live one (#8). Risk: a genuinely slow ingest could be retried while still running; the writer's txn_id DUPLICATE rail and the recheck-before-post absorb that, and the 30-minute bar is well past any observed run.

**#14/#15 One index blob.** Keep `index/docs` in `books-docs`: `{docId → {status, source, vendor, date, receipt_total_cents, txn_ids, verdict, startedAt, finishedAt, retries, dryRun}}` (~200 KB at 1,300 docs). The lazy version: the warm job already scans every blob — have it write the index at the end of that scan, and make `searchDocs`, the Inbox GET, summary, and `retryErroredDocs` read the index (≤15 min stale; a same-minute twin is already covered by `recheckDuplicate` + the writer's lock). The stricter version updates the index from every envelope save with `onlyIfMatch`. Then cut the warm schedule to one driver (the poller's 15-minute call or Netlify's, not both). Risk: a stale index during the window can make `search_docs` miss a copy processed moments ago — the exact case the fresh-Journal recheck already guards.

**#2 Tolerance remainder onto the largest item.** In `buildEntriesFromModel`, when the gate accepted on tolerance, put `receipt_total_cents − Σitems` on the largest item of the last entry before building (the prompt already tells the model to do exactly this, `lib/bookkeeper-prompt.md:244-246`). Then every posted total equals the receipt and the Feed matcher ties to the cent. Risk: hides a misread line of up to 0.5% — bounded at $10 on a $2,000 receipt and only when the model also gave a reconciling subtotal and tax.

**#19/#20 One approve path, no migration paths.** Delete the web `approve` verb, `books-approve-background.mjs`, the `posting` state and its 5-minute guard, and in the ingest the `overrides` block and dismiss-replay; delete `repost`/`repost-all` and `scripts/recover-errored.mjs`. Keep `fromStored` (the warm retry's $0 replay), `mark-posted`, `mark-pending`, `dismiss`, `reprocess`. Risk: none to the books — the workbook's Save already carries every rule the web path had plus the placeholder/supersede swap.

**#3 Byte-hash twins (medium).** At upload, store `sha256` per attachment on the envelope; in `searchDocs`/`findDuplicate`, a prior `posted` envelope (rows on the Journal) sharing a hash is a `DUPLICATE_OF`, auto-dismissed. Needs no policy: identical bytes are one document.

## What I would NOT change and why

- The gate/posting core and its generated lib.gs. Pure, tested, one path from read to entry, byte-equality test against the source.
- D-045 as a prompt rule (#1). The 365-day window gave the model the history it lacked; no October evidence it still misses.
- LOW_CONFIDENCE, OVER_CEILING, NEEDS_HUMAN_274D, PARTLY_ON_BOOKS. Each is a policy Paul set (D-044, D-090, D-050, tax law).
- The three whole-Journal reads per post, the 365-day in-memory window, Jimp/heic, the prompt length. Seconds and cents; cached where it counts.
- The ingest's lost-reply confirm, the placeholder/bank-card paths, `retireBankCard`. Correct and tested.
- The `repairDecideInput` antml-tag repair and the `PENDING ROUTING` refusal. Cheap defensive rails for failures that did happen.
- No rebuild. The architecture (Sheets as record, writer lock, deterministic gate, Blobs envelopes) is not the problem; the problems are a missing retry branch, a missing index, and leftover code.

## Open questions only the owner can answer

1. Defer instead of ask (#5): when a receipt lacks the house or the payer and the bank statement would answer it within days, should the card wait silently (say 10 days) for the statement before it reaches the Inbox?
2. Delete the web front end entirely (#21)?
3. Byte-identical copies auto-dismissed (#3) — confirm he never wants a second identical forward to reach him as a card.
4. Cost visibility (#17): a one-line "today's reads cost about $X" in the digest?

---

# Agent B — poller and email intake

## Executive summary

- The poller is basically sound. A thread is labelled `books-done` only after every eligible message's upload answered 200 (Code.gs:326-339); the server dedupes by `docId` and never skips `error`/`processing` (books-upload.mjs:50,139-144); `warm-bg` retries errored envelopes on the same 15-min cadence; a 6-minute kill mid-run self-heals. No path found where a message addressed To/Cc receipts@/travel@ is both lost and labelled - except finding 1.
- One regression from the port is real: `anyEligible` was dropped. A thread the search finds but whose messages all fail the To/Cc check is labelled done with nothing uploaded (Code.gs:321-322,339 vs receipts-poller.gs:149-151,171). Today that bites only Bcc/list/filter-forwarded deliveries; it is also the precondition for any label-based widening.
- Coverage, not reliability, is where money leaks. October's documented misses (Foremost auto-pay, the bank's $3,500 Zelle notice, Venmo to Juanito) all reached paul@ or pvb421@ but not `To: receipts@`. The smallest safe widening is the old poller's label clause: a `to-books` label the poller reads, set by hand or by Gmail filters for auto-pay senders and the bank's Zelle notices. Most of those documents answer a `NEED RECEIPT` placeholder and post on their own (D-087) - fewer reviews, not more. Do not build a pvb421@ poller.
- Nobody learns of a dead poller or a failing upload within a day. Per-message failures are caught and `console.error`'d into logs no one reads; Apps Script's failure emails fire only on throws, and the properties@ instance's go to properties@. The digest and the nightly check ride on the same paul@ script that would be the thing that died. One cheap signal: a per-mailbox heartbeat stamped server-side, shown in the Inbox header and the nightly check, with the writer project's existing hourly trigger as the independent watcher.
- Keep the digest (it is Paul's audit of what auto-posted, more important now the ceiling is 2,000); take Listing.gs's cutover-era functions out of the live projects per the writer's own rule; the lint protects the three historical breaks only partly (D-089's thread walk and the done-label decision are untested).

## Findings

| # | Finding | Evidence | Kind | Effort | Reward | Confidence |
|---|---|---|---|---|---|---|
| 1 | Thread labelled done when no message passed `isAddressedToInbox_` - silent skip of a Bcc/list/filter-forwarded delivery. Old poller guarded with `anyEligible`. | Code.gs:321-322,339; receipts-poller.gs:149-151,171 | reliability | S | high - one line; unlocks finding 3 safely | verified |
| 2 | Thread-level label vs a later reply: Gmail search is per message, so a new unlabelled reply should re-surface the thread; every earlier message is then re-POSTed with full attachments before the server says `skipped`. Self-healing but unproven. | Code.gs:311-313,318; books-upload.mjs:139-144 | reliability | S (test it) | low - cost, not loss | suspected |
| 3 | Mail with a real cost that never reaches the books: auto-pay confirmations in paul@, the bank's Zelle "was sent" notices, Venmo mail in pvb421@. The poller reads only `to:receipts@/travel@`. | ops.md:116-121; HANDOFF.md:36-40,63-68; CHANGELOG.md:36-46 | coverage | S poller + Paul's filters | high - turns placeholder reviews into auto-posts; closes silent misses | verified |
| 4 | No one is told the poller died or an upload keeps failing. Properties@ trigger failures mail properties@. The nightly check sees only envelopes that reached the server. | Code.gs:230,331,336; README.md:12-14; books-reconcile-background.mjs:91-95; Code.gs:445-510 | observability | S-M | high - a day, not a week, to notice | verified |
| 5 | Inline logos become the filed receipt: `includeInlineImages:true` takes every inline image, and the email text is stored only when there are zero attachments (PACER's Drive file is its logo). | Code.gs:557; books-upload.mjs:166-173; CHANGELOG.md:27 | reliability | S | med - the Drive record is wrong; the model still reads the body | verified |
| 6 | A PDF over 4 MB is dropped with a note; nothing can shrink it and Paul has no other way in. | Code.gs:587-595; CLAUDE.md constraint 8 | coverage | M | low - rare | verified |
| 7 | Properties mode uploads every message of a labelled thread - replies, quotes, "thanks" - with no per-message check (labels are thread-level). | Code.gs:219-237; phase2.6-spec.md:54-55 | reliability | S | low - model reads and dismisses; cost only | verified |
| 8 | 502 `INGEST_INVOKE_FAILED`: envelope `error`, thread unlabelled, poller re-uploads next run while `warm-bg` also retries - two retry paths overlap. Ingest's late-twin rails make a double post unlikely. | books-upload.mjs:216-233; Code.gs:328-331; books-warm-background.mjs:28-55 | reliability | - | low - leave it | verified |
| 9 | `pollBankMail_` stops forever on a permanent 400 (one bad email blocks all later ones); the symptom (cards lose their card holder, more PAYER_UNKNOWN holds) is silent. | Code.gs:374-377; books-bank-mail.mjs:29-31 | reliability | S (fold into 4) | low-med | verified |
| 10 | No time budget in `pollBooks`; the 6-min kill is self-healing but leaves `books-shrink-tmp` in Drive root if it lands mid-shrink, and skips bank mail + warm that run. | Code.gs:292-348,777,806 | reliability | S | low | verified |
| 11 | `MAX_THREADS=20`/run shared across labels in properties mode: a burst starves later labels for one run only. 1,920 threads/day. Fine. | Code.gs:82,213-217 | reliability | - | low | verified |
| 12 | Listing.gs: four cutover-era hand-run functions live in both production projects; `repostAll` posts for real and installs its own 5-min trigger; `replayIds`'s STATUS line is stale. `dryRunBatch`/`DRY_QUERY` superseded by `replayIds` dry lists, yet the lint requires `dryRunBatch`. | Listing.gs:123,190-236; poller-gs-lint.test.mjs:87-97 | structure | S | med - 3 AM safety; mirrors constraint 9 | verified |
| 13 | `buildPayload_` returns one payload with `.rest`; a caller using `postOne_` drops the extra documents silently. | Code.gs:634-635,676-685 | structure | S | low | verified |
| 14 | Lint gaps: the done-label decision, `postUpload_`'s failure branch, `forwardedAttachments_`'s thread walk, octet-stream `.pdf` re-typing (the 09-14 break), `labelQuery_` hyphenation, bank-mail cursor. | poller-forward.test.mjs:17; poller-gs-lint.test.mjs:195-212 | tests | S | med | verified |
| 15 | Doc drift: phase2-spec §6 says "skip > 6 MB" (cap is 4 MB); orphaned comment above `warmCache_`; `nightlyCheck` falls back to a default URL where `pollBooks` requires the property. | phase2-spec.md:221; Code.gs:526-530,434 | structure | S | low | verified |

## High-reward findings

**1. Restore `anyEligible` (S).** In `pollBooks`, label the thread only when at least one message was uploaded: `if (threadOk && anyEligible) thread.addLabel(doneLabel)`, exactly as receipts-poller.gs:171. Risk: a thread with nothing eligible is re-found every run until something in it is uploaded - the old poller lived with that for months. Add the lint row.

**3. The `to-books` label as the second way in (S + Paul's filters).** Port the old clause: query `(to:receipts@ OR to:travel@ OR label:to-books) after:<START_DATE> -label:books-done`, and a thread carrying `to-books` bypasses the To/Cc check (receipts-poller.gs:133-151 is the code). Then Paul, one step at a time, creates Gmail filters in paul@ that apply `to-books` to: Foremost's payment confirmations, the bank's Zelle "was sent" notices, PACER/Klarna, and anything filter-forwarded from pvb421@ (Venmo "You paid"). By hand it is one click instead of a forward - which also sidesteps the iPhone no-files forward (D-089). Honest accounting:
- Filter→forward to receipts@: not worth it alone - a filter forward keeps the original `To:` header, so neither the search nor the check matches. Filter→label is the working form.
- `to-books` label: worth it; the mechanism everything else rides on. Noise risk: the 09-16 audit blamed the old label clause for original+forward twins - those happen only when Paul labels AND forwards; the rule for him is one or the other, and the ingest's invoice-number and POSSIBLE_TWIN rails catch the rest.
- Zelle/Venmo notices: worth it, because these are reviews today, not silences - the Citizens import makes a `NEED RECEIPT` placeholder for every Zelle/Venmo line, and the bank's notice names payee, amount and memo. Read as a receipt it retires the placeholder on its own under 2,000 (D-087); over it, it holds - replacing the placeholder card, not adding one. Unverified: whether the bank's notice carries the memo in the email body.
- Polling pvb421@: not worth it - a third project on his personal account, personal noise, M effort. A pvb421@ filter forwarding Venmo/Klarna mail to receipts@ plus the label path gets the same documents with no new code.

**4. An intake heartbeat (S-M).** `/api/upload` and `/api/warm-bg` already see every poll; stamp `poller/last/<mailbox>` in `books-cache`, plus the newest `bankmail/` date. Show it in the Inbox dialog header and as a nightly-check fact that becomes a line only when older than 3 hours. Because the digest and the check run from the paul@ script, the independent watcher must be elsewhere: the writer project's existing hourly trigger reads the stamp through `siteFetchJson_` and mails Paul one line when stale. Stamp on every run, not on uploads, so quiet is not stale.

**5. Inline logos (S).** Skip inline images under ~20 KB in `buildPayload_` (logos, tracking pixels). When that leaves zero attachments, D-035 files the email text as today.

## What I would NOT change and why

- The thread-level label and server-side dedupe: simple, and every failure mode degrades to "re-send and skip", never to loss (bar finding 1).
- The two overlapping retry paths (poller re-upload + warm-bg): redundancy is the point.
- The digest: Paul reads it and it drives fixes. The Posted list is the audit of auto-posts; keep it.
- `GATE_TEXT` copy, the `normalizeKey_` mirror, ASCII-only: each is a paste constraint of the Apps Script runtime, and each has a lint that makes the copy safe.
- The count/size split of a big email.
- `MAX_THREADS`, `tryLock(1000)`, no time budget: the arithmetic and the self-healing hold at this volume.

## Open questions only the owner can answer

1. Do the old `receipts` / `travel` labels or filters still exist in paul@?
2. Does the bank's Zelle "was sent" email carry the memo text, and are Venmo's "You paid" emails going to pvb421@ or paul@?
3. Does anyone read properties@'s inbox?
4. Will he label instead of forward for the auto-pay vendors (one or the other, never both)?
5. Is the 3 AM digest still opened daily?

---

# Agent C — bank import, matching, bank mail, bank tab, nightly check, Inbox bank cards

Read-only. `npm test`: 579 tests, 578 pass, 1 skipped (the real QFX on the Desktop).

## Executive summary

- The bank-side review load is mostly not a matcher problem. A card exists because a receipt never reached a mailbox (store charges on Dennis's card; Foremost, Squarespace, Roddy) or because it is partner money. Code can safely remove about 2 of the 25 cards (bank fees, one address-named utility). The 4–6 sale-payout cards should be made safe, not removed.
- Three cheap correctness gaps are waiting to bite: a failed in-process tie leaves a Feed row `proposed` forever, silently, counted by the bank box as "still open in the Inbox"; a plain void never frees the bank line it was tied to; the matcher's `used` set spans accounts, so Chase's side of any Citizens→Chase move becomes a card at the first Chase import.
- The biggest single-click risk in scope: a payout question card carries an editable purchase line, and the workbook's Save runs no gate and no ceiling - one Save books a six-figure rehab cost. A rail is a few lines; the payout pre-fill is a day or two.
- The nightly check does not duplicate the bank box - it never reads the Feed at all. One cheap call a night, worth keeping; it should gather three Feed facts so the bank gaps above surface by themselves.
- Section 4 (monthly close) is not load-bearing. The bank box already does its arithmetic continuously and Paul refused the step (D-063). The payout path has the better reward per day.

## Findings

| # | Finding | Evidence | Kind | Effort | Reward | Conf. |
|---|---|---|---|---|---|---|
| 1 | A failed in-process tie is silent and never self-heals: `inboxApprove`/`inboxDismiss` return `ok:true` with `feed.ok:false`; the Inbox ignores `r.feed`; only `unmatched` rows are re-sent; the bank box counts the orphan as "still open in the Inbox" forever. The old repair (`resetFeedCards`) is gone. | Menu.gs:873-875, 989; Inbox.html:668-671, 695-698; books-feed-match-background.mjs:61; lib/bank-sheet.mjs:142; Code.gs:954 | correctness | S | high - self-healing Feed | verified (not yet bitten) |
| 2 | A plain void leaves the bank line `matched` to a dead entry: `voidEntry_` never calls `feedRetieRows_`; the tab shows "Needs a look" and the box a red line until someone hand-edits the Feed. | Code.gs:601, 935-950; lib/bank-sheet.mjs:66-68, 137 | correctness | S | high - one red line less, no hand edit | verified |
| 3 | `used` txn_ids are gathered from every account's rows, so an entry touching 1401 and 1402 tied on one side is no candidate on the other. §3 transfer verdict is not built. Bites at the first Chase import. | books-feed-match-background.mjs:62; lib/feed-match.mjs:89-106 | correctness | S | med-high - Chase import clean | verified by code; Chase never imported |
| 4 | Payout cards are a trap: the sale posts Dr 2010/2000/2030/9010 / Cr 1401 only when paid (D-083), so at match time there is no candidate - the model can only question; the card has an editable purchase line and `inboxApprove` runs no gate, no ceiling (`allow_duplicate_hash: true`). | lib/sale.mjs:300-323; lib/feed-match.mjs:33-34; Inbox.html:344-347; Menu.gs:848-867; HANDOFF.md 0g | not-built / correctness | S (rail) + M (pre-fill) | high - the one Save that can wreck a P&L | verified |
| 5 | No date rail on a match: code checks sum and candidate reuse only; "within about ten days" is prompt-only. | lib/feed-match.mjs:31, 311-326 | correctness | S | med | verified |
| 6 | No "already running" guard on `/api/feed-match`; `matchFailure_` says "Nothing was changed" on a poll timeout while the background run continues; a rerun on the same lines can yield two pending cards for one line. | books-feed-match.mjs:42-65; Menu.gs:1894-1901, 1884; lib/feed-match.mjs:227 | correctness | S | med | suspected |
| 7 | D-087 partial failure: `retireBankCard`'s `feedUpdate` fails → receipt posted, card still pending, rows `proposed`; Paul's Save posts a second entry (no duplicate rail in `inboxApprove`; the nightly duplicate key is payee, and the bank text ≠ receipt vendor). | books-ingest-background.mjs:724-748; Menu.gs:848-867; Code.gs:974-981; books-reconcile-background.mjs:77 | correctness | S | med | suspected |
| 8 | Bank fees are always a card: the prompt sends them to 6930 as a proposal and every proposal is held. | lib/feed-match.mjs:32, 302 | review-load | S | low-med - ~1 of 25 | verified |
| 9 | Deterministic 1:1 pre-match is possible but saves no reviews - matches already make no card; it only saves model cost and the 529 exposure. | lib/feed-match.mjs:311-326 | efficiency | S | low | verified |
| 10 | Daily Summary format change goes unnoticed: `parseDailySummary` returns null/`ok:false` quietly; `carded` is stored on the job but never shown; no alarm, no test. Scale of `loadSummaries` is ~21/month - fine for years. | lib/bank-mail.mjs:22-57, 94-98; books-feed-match-background.mjs:77-89, 110; Menu.gs:1904-1912 | correctness | S | med | verified |
| 11 | The nightly check reads the Journal and every envelope, never the Feed - the three bank gaps (#1, #2, unmatched > N days) are invisible to it. Its `receipts_on_no_book` heuristic is incident-shaped (regexes on review notes). | books-reconcile-background.mjs:211-215, 111-166 | structure / not-built | S | med | verified |
| 12 | Two tie implementations: `_shared.tieFeedRows` serves only the web `approve-bg` (a path Paul never uses); the web dismiss no longer ties, yet the test is titled "dismiss -> excluded". Live path is Menu.gs `tieFeedRows_`. | _shared.mjs:411-421; books-approve-background.mjs:76; books-inbox.mjs:294-305; test/feed-match.test.mjs:410; Menu.gs:1918-1926 | structure / tests | S | low | verified |
| 13 | Reprocess shows on bank cards and sends a "Bank line on …" envelope through the receipts bookkeeper; harmless (D-048) but pointless. | Inbox.html:506; books-inbox.mjs:18-21 | structure | S | low | suspected |
| 14 | Tests pin tolerance, D-060 split, candidate reuse, the no-verdict bounce; nothing pins `maxRetries: 4` or the sync-tie rule. | test/feed-match.test.mjs:136,154,172,268 | tests | S | low | verified |
| 15 | CLAUDE.md constraint 15 still says "then `resetFeedCards()` and rerun"; the function left the live files under constraint 9. | CLAUDE.md:15; Code.gs:954 | structure | S | low | verified |
| 16 | Same file twice: deduped per account on FITID - fine. Chase: 1402 is checking with debit cards; parser takes BANKACCTFROM or CCACCTFROM, signs identical; a real Chase file is untried. Opening-balance check needs `opening_balance` = the balance before the file's first line. | Menu.gs:1753-1782; lib/statement.mjs:78,102; Import.html:95-96 | correctness | - | none | verified |

## The high-reward changes, in plain terms

**#1 Self-healing `proposed` rows.** In `runFeedMatch`, list the pending `doc/feed-*` envelopes once and collect their `feed_ids`; any `proposed` row of the account whose id is in no pending card is treated as `unmatched` (note: "its card is gone - asked again"). Ten lines, one Blobs list the run already pays for. Risk: a card decided seconds before the run is re-asked once.

**#2 A void frees its bank line.** `voidEntry_` calls `feedRetieRows_(ss, txnId, [], 'The entry was taken out …')` after the void. Risk: a supersede path already calls `feedRetieRows_` itself; the second call finds the id gone and does nothing.

**#3 `used` per account.** Build `used` from `mine` (this account's rows), not `feed`. The only effect is that a transfer entry can be tied on both its lines - which is the right answer. Do before the first Chase import.

**#4 Payout cards.** Step one (S, do now): in `feedFlags_`/`renderCard_`, a bank card whose text names Dennis or Paul (or a wire/transfer with no store) or whose amount is over the autofile ceiling gets no purchase line - only "Dismiss all" with a note. Step two (M): the matcher reads what is still owed per house (2010+2000 and 2030/9010 balances by property from the Journal - the same figures `closingRows`/`owed_after` show), and when a money-out line equals a "still owed" figure to the cent it writes a `payout` card with the entry prefilled (Dr owed account(s) / Cr 1401, property), saved through a payout intent (`buildHoldbackRelease` in lib/sale.mjs:378 is the existing shape). The card stays - partner money is Paul's word (constraint 13) - but his click is now safe and one.

**#6/#7 Two five-line guards.** `/api/feed-match` refuses a POST while a job for the account is `matching` and under 15 minutes old. `inboxApprove` on a feed card reads the Feed row's status first and refuses a `matched` one in plain words.

**#10/#11 Say what the email said, and let the night see the Feed.** `feedMatchSummary_` prints "the bank's email named the card on N of M new lines"; `gatherFacts` adds three code-gathered lists from the Feed snapshot: proposed rows with no pending card, matched rows to a voided entry, unmatched rows older than 10 days.

## Question 1, honestly, per class

(a) 1:1 exact match - deterministic is possible but removes no review: a match already makes no card. Not worth the rail now. (b) Recurring utility/insurance - the card appears only when the bill reached no mailbox; 1–2 of 25; skip. (c) Contractor Zelle/Venmo - the card is wanted and already the lightest path: forward the bank's notice → D-087 posts or holds over the ceiling. Nothing to build. (d) Bank fees - a proposal whose only item is 6930 OVERHEAD under $50 with /FEE|SERVICE CHARGE|CHECK ORDER/ in the text can post directly from the run; ~1 of 25. (e) Refunds - D-091's posted return is a positive 1401 candidate; the match ties it with no card. Done. (f) Sale payouts - see #4; 4–6 of the 25.

Of the 25, roughly 4–6 are payouts, ~1 fee, 1–2 utilities, 1–2 small mismatches, and the rest store charges whose receipts Dennis or Paul owe - a people problem the 3 AM "Waiting on receipts" list already chases. Code removes ~2 cards and makes ~5 safe.

## Questions 3–5 in one line each

Bank mail: fails closed correctly; scale is a non-issue for years; the silent-on-format-change gap is #10. Nightly check: not a duplicate of the bank box - different domain; worth the call (one, 4k tokens max); its blind spot is the Feed (#11). Not built: §4 is already the bank box plus a month stamp nobody has asked for; the payout path is load-bearing (one wrong Save) and wins on reward per day.

## What I would NOT change, and why

- The "every proposal is held" rule. A bank line proves the payment, not the item or the house.
- `MATCH_TOLERANCE_CENTS = 5`, the 30-line batch, prompt caching, `maxRetries: 4` - all paid for.
- The bank box (D-063) as the reconciliation. Do not add a Reconcile step or a `reconciled_ref` stamp until the accountant asks.
- `loadSummaries` reading every blob - hundreds of small gets a run is nothing.
- The statement parser - tight, pure, in `lib.gs`, both OFX shapes tested.
- Plaid, a web page, a menu item - settled.

## Open questions only the owner can answer

1. For a payout line that equals "still owed" to the cent, is one pre-filled card with one Save enough - or does Paul want Penny to book payouts with no card at all?
2. Which lines may post with no card: bank fees under a small ceiling - yes or no?
3. Chase's first import brings his own deposits in as working capital (D-055): does he want each deposit asked once, or a standing rule "a deposit from Paul into Chase is working capital"?
4. Does he still want the Reprocess button on a bank card, or only Save / Waiting on receipt / Dismiss?

---

# Agent E — the review surface (workbook Inbox) and the state behind it

Line numbers are from HEAD `c067d46`.

## Executive summary

- The workbook Inbox is the only review path Paul uses, and it is sound in the main line. `inboxApprove` marks the card posted first, posts under the lock with the flush inside it, and puts the card back on any thrown error (Menu.gs:858-883). The 2026-10-01 "Failed, no log" class of lost Save is closed by the flush (Code.gs:902); what remains is a hard kill between `mark-posted` and the flush, which the nightly check's list (a) catches.
- One real correctness hole: on a swap Save (yellow box, D-057/D-058) `feedRetieRows_` is not wrapped in try/catch like `tieFeedRows_` is (Menu.gs:871-873 vs 1918-1926). If the Feed tab's lock or headers fail after the void and the post have landed, the catch marks the card pending; the next Save sees the old entry already voided and posts the receipt a second time (Menu.gs:864-867, 893-915). [Lead auditor: confirmed - `allow_duplicate_hash: true` on the Save path appends a random suffix to the txn_id (lib/posting.mjs:89-93), so the writer's DUPLICATE rail cannot catch the second post.]
- Feed-tie failures are invisible. Both `inboxApprove` and `inboxDismiss` return `feed: {ok:false}` and the dialog ignores it (Inbox.html:622-626, 654-660). A `proposed` Feed row whose card is gone is never revisited by the matcher (books-feed-match-background.mjs:61) and the nightly check never reads the Feed tab.
- The site's approve path (`approve` verb + `books-approve-background.mjs`) is dead for Paul - only web/app.js:1018 calls it. The rest of the web/session layer is not dead: it is Penny's read door into Blobs from Chrome (ops.md:55-58) and `/api/file` serves the workbook's thumbnails and PDFs under the poller secret (books-file.mjs:23-31).
- Lock contention is bursty, not steady. Since D-047 reads bypass the writer, so ops.md:83-84 and the ingest comment at books-ingest-background.mjs:48-52 ("75 s apart", "behind the warm job") are stale. What holds the lock today is the flush's workbook recalculation (~10 s for three entries, CHANGELOG:2256) plus, on every HTTP post, the house-tab rebuild run inside the lock (Code.gs:585, 652, 905).

## Findings

| # | Finding | Evidence | Kind | Effort | Reward | Confidence |
|---|---|---|---|---|---|---|
| 1 | Swap Save: `feedRetieRows_` uncaught → card back to pending after void+post landed → second Save double-posts | Menu.gs:871-873, 876-883, 893-915; Code.gs:935-954, 957 `waitLock` | correctness | S | high - closes a double-post | verified (code path; not reproduced) |
| 2 | Feed tie result ignored by the dialog; `proposed` rows never re-matched; nightly check blind to Feed | Inbox.html:622-626, 654-660; Menu.gs:1918-1926; books-feed-match-background.mjs:61; bank-sheet.mjs:78-82, 142 | correctness | S | high - the bank tab says "still open in the Inbox" for a card that is gone | verified |
| 3 | House-tab rebuild runs inside the ScriptLock on all three HTTP write paths (full Journal read + 2×300×9 `setValues` per house) | Code.gs:549-592 (585), 605-658 (652), 876-917 (905); refreshLineBlocks_ 2164-2200 | efficiency | S | high - cuts lock hold on every poller post; three line moves | verified |
| 4 | `waitLock(30000)` on HTTP posts; the 09-28 burst produced "Lock timeout" errors the warm job had to heal | Code.gs:876; CHANGELOG:2036 | efficiency | S | med - one constant | verified |
| 5 | Site approve path dead: `approve` verb, approve-bg, its test, web `approveDoc`; second posting path kept in parity for nobody | books-inbox.mjs:180-249; books-approve-background.mjs:30-78; web/app.js:1013-1031 | dead-code | S | med - one posting path to keep right, not two | verified |
| 6 | Bank "question" answer is two steps: Dismiss all with words, then menu → Match statement lines | HANDOFF.md:146-150 item 2; Menu.gs:981-993, 1819 `startFeedMatch` | review-load | S | high - the answer already carries the instruction | verified |
| 7 | Answers Paul gives are not remembered by code: card last4 → account only by hand on `Bank accounts`; vendor alias only by hand on `Vendors`; `Vendors.default_account` is read by nothing | Code.gs:147-148; HANDOFF.md:149; bookkeeper.mjs:265-267 | review-load | S-M | med - the 7952 card was asked on three receipts | verified |
| 8 | Every Save is two clicks ("Click again: record $X") on top of the card open; the totals line already states the same number | Inbox.html:614-620, totalsLine_ 356-376 | review-load | S | low-med - owner's call (safety rail) | verified |
| 9 | `inboxFinish` order: Drive filing before the tab rebuild, so a Drive failure also skips the rebuild and the cache poke | Menu.gs:940-973 | correctness | S | med - stale itemized block until the next post to that house | verified |
| 10 | Nightly check coverage: (a) posted-not-on-Journal, (b) receipt rows with no envelope, (c) twins, (d) receipt rows with no document, (e) stuck/error. Not covered: Feed↔Journal↔envelope, envelope `doc_url` vs Journal, house-tab blocks, orphaned Drive files | books-reconcile-background.mjs:36-100 | correctness | M | med | verified |
| 11 | Inbox GET loads every `doc/*` blob (1,000+) per open/Refresh; warm-bg rescans all of them sequentially every 5 min | books-inbox.mjs:94-96; books-warm-background.mjs:28-35; books-warm.mjs:4 | efficiency | M | low - works; cost unmeasured | verified (count), suspected (cost) |
| 12 | Hourly `refreshPnl_`: full Journal read, unconditional sort-and-rewrite of Advances, P&L + Taxes rebuild; ran 241 s of 360 | Code.gs:1068-1098; Menu.gs:604-622; HANDOFF.md:192-193 | efficiency | S | med - write Advances only when out of order; add the `lap()` stopwatch | suspected |
| 13 | `lib.gs` 3,240 lines / 162 KB; ~30 of 68 top-level exports are not referenced by Code.gs/Menu.gs/HTML but nearly all are internal deps of ones that are | build-gs.mjs:8 | dead-code | - | low | verified |
| 14 | build-gs strips every `import` blindly; the sync test never asserts the import graph is closed and ordered | build-gs.mjs:41; gs-lib.test.mjs:33-44 | tests | S | low-med | verified |
| 15 | Copies: `GATE_TEXT`+`flagText_`/`gateText_` (Inbox.html:234-259 ≡ poller Code.gs:718-743, lint); `driveFileName_` (Menu.gs:811-818 ≡ _shared.mjs:394-409, no lint); `DOC_ID_RE` ×4 | as cited | structure | S | low | verified |
| 16 | `timings` stopwatch text shown under the card ("role 300ms, ctx…") - jargon on Paul's screen | Menu.gs:831-832, 928-929; Inbox.html:629, 636 | structure | S | low | verified |
| 17 | The 996-line lint runs Inbox.html's card logic by text-grabbing functions into `new Function` | writer-gs-lint.test.mjs:428-505 | tests | M | med - real unit tests, ~150 lint lines gone | verified |

## The high-reward ones, in plain terms

**1 - the swap double-post.** Wrap the `feedRetieRows_` call in the same try/catch `tieFeedRows_` already has (return `{ok:false,…}`), so a Feed-tab failure after the post can never send the card back to pending. Risk: none - the entry is already posted; the tie becomes best-effort like its sibling. Then finding 2 makes the failure visible.

**2 - feed ties that fail silently.** Two small changes: the dialog shows `r.feed.ok === false` in red the way it shows a Drive failure ("recorded, but the bank line was not tied - tell Claude"), and the nightly `gatherFacts` takes the Feed tab (already in the cache store) and lists a `proposed`/`matched` row whose card is posted/dismissed or whose txn is voided.

**3 + 4 - the lock.** Move `refreshLineBlocksFor_` below `lock.releaseLock()` in `postEntry_`, `voidEntry_`, `postBatchEntries_` (three line moves; `inboxApprove` already defers it to `inboxFinish`). Two concurrent rebuilds of one house are idempotent full rewrites from the Journal - last writer wins, both correct. Raise `waitLock` on the HTTP paths to 120 s. What this does not fix is the ~10 s the flush costs (workbook recalculation of the formula tabs). Do not move the flush.

**5 - delete the site approve path.** Remove the `approve` verb, `books-approve-background.mjs`, its test and `approveDoc` in web/app.js; keep `mark-posted`/`mark-pending`/`dismiss`/`reprocess`/`delete` and the GET. What breaks: the web Inbox's Approve button, which rule 8 says Paul never sees.

**6 - one step for a bank question.** `inboxDismiss` on a feed card already writes the row back to `unmatched` with "Paul: …"; have it call `startFeedMatch(account)` for that card's account before returning (the Import dialog does the same on import). No new menu item, no new card.

**7 - remember the answer.** The cheapest fact to keep is the card: when Paul picks `paid_from` on a card whose read named a card number not on `Bank accounts`, `inboxApprove` can append that last4 to the chosen account's row with the existing `upsertRow_` (Code.gs:795). That is the one fact that recurs verbatim; vendor→house does not (a store serves every house) and vendor→account is already covered by the model's precedent lookup.

**9 - inboxFinish order.** Run `refreshLineBlocksFor_` and `warmCache_` first, then Drive, then `setDocUrl_`/`mark-posted`; wrap the Drive part in its own try.

## What I would NOT change, and why

- The armed double-click Save (8). It is the one rail between Paul and a wrong amount. Flag it to him; don't remove it on my say-so.
- GATE_TEXT duplicated into the poller with a lint. The poller is a separate Apps Script project; without a library there is no shared file. Same for `DOC_ID_RE`.
- The incident-narrating comments. They are how this codebase carries its rules into the code.
- lib.gs size (13). 400 KB of source is milliseconds; the seconds are the flush and the rebuilds.
- The whole web/ front end and the session layer. The sign-in is Penny's read-only door to Blobs from Chrome and `/api/file` + `SESSION_SECRET` are needed by the workbook's thumbnails. Delete only the write verbs the web still offers (approve, twins, delete) if anything.
- The flush inside the lock. It is the fix for the lost Save.
- The `timings` stopwatch. It is how the 10 s post is known.

## Open questions only the owner can answer

1. The autofile ceiling is now the largest source of "nothing to decide, just Save" cards (OVER_CEILING). Is the number right, or should a known vendor on a known card clear a higher one?
2. Two clicks on Save - keep the "Click again" step, or is the totals line enough?
3. A bank question answered in words - fine that it re-runs the matcher at once?
4. Remembering a card number on `Bank accounts` from his pick: does he want the system to learn it?
5. Hourly refresh at 241 s - is anyone editing the Advances tab by hand any more, or can the hourly sort go?

---

# Agent D — post-cutover pattern audit (2026-09-21 → 2026-10-23)

Sources: CHANGELOG.md (post-cutover regions), docs/decisions.md D-044..D-092, git log (408 commits since 09-21), HANDOFF.md, docs/ops.md, test/ (579 tests, 578 pass, 1 skipped). Ledger of 97 fixes/changes in the appendix. Line refs are CHANGELOG.md.

## Executive summary

- 97 fixes in 33 days. The biggest categories are self-inflicted/ops (20), missing rail (17), wording for Paul (15) and external limit/format (14). Model-judgment failures are rare (4): nearly every "the poller got it wrong" complaint traced to a rail, a limit or a stale state, not to the read.
- Three classes recurred four or more times: (A) the deploy/ops gap - push-without-deploy, six `clasp login` expiries, 50 "deploy owed" notes, a fix left unpushed 14 days (10-09→10-23); (B) a replay/re-read posting a twin of a migrated row - five incidents in nine days (09-22, 09-25, 09-28 ×2, 09-30), each guarded on the path that bit, never once at the posting engine; (C) stale envelope state believed as truth (staging "posted" ids, voided rows, read-vs-saved) - five consumers each taught separately to check the Journal.
- The core plumbing converged. Performance walls, writer misfires, state desync and replay twins have not recurred since 10-02. Tests went 454→579 and almost every code fix carries one. What still arrives is (1) a new external format per new receipt type and (2) a raw code reaching Paul from a surface the plain-words lint does not cover.
- Three fixes caused the next fix (D-073→17-param outage, D-076→3000 px refusal, D-077→D-087's six wrongful holds). Every one was a change deployed with no live smoke test; the 10-02 deploy silently failed every read for two days (line 3137).
- Verdict: (a) keep going, with four root fixes - a single ship script with a commit stamp; one pre-cutover guard in `postBatch`; delete the web-Inbox approve path instead of keeping three posting paths in sync; route every engine refusal through the one plain-words map. No subsystem earns a rebuild.

## 1. Pattern table

| Cat | Count | Recurs? | Instances (ledger #) |
|---|---|---|---|
| (1) External limit/format | 14 | yes - one per new input shape | doGet misfire #1 (09-22, again 09-25, 09-28, 10-02); max_tokens caps #14; 4 KB env #23; six-attachment cut-off #78; 6 MB/3 MB/4 MB photo #80; 17 nullable params #81 (two-day outage); 3000 px #84; Latin-1 header #89; iPhone `multipart/alternative` #90; vendor mail that never reaches receipts@ #87/#97 |
| (2) Model behaviour | 4 | no | untraded utility #5; invented trade names #44; Zelle alias/penny diffs #48; copy-of-waiting-card read as new #83 |
| (3) Data-shape drift | 2 | yes (new card last-4 ×4) | 8870/3746 #13, 7952 (10-02), 7416 #88 |
| (4) State desync | 7 | yes | ctx cache after sellPost #9; nightly check noise #24 → again #72; staging ids believed #26 → #38; web Inbox stale entries #32; Posted list prints the read #76 |
| (5) Missing rail | 17 | yes (3 patches on one tool window) | email.txt #4; warm never retried #15; `read_ledger` window #19→#27→#28; Reprocess posted #29; PARTLY_ON_BOOKS #31; NO_ENTRIES #33; supersedes never honoured #55; twin rail blind to cents #64; PENDING ROUTING #67; replayIds dryRun #68; attachments dropped #78; first-PDF link #79; refunds unpostable #94 |
| (6) Policy (D-0xx) | 12 | n/a | D-044/045/046, D-049, D-057/059/060, D-090/091/092, paint/flooring, sold-house mailboxes |
| (7) Wording/UI | 15 | yes | `why` length #3 → D-040 #6 → digest #25 → plain words #34 → BAD_ACCOUNT #71 → account-code prompt #53 → raw 529 #59 → PROPERTY_REQUIRED #93; per-item house select #7 → #92 |
| (8) Performance/timeouts | 6 | yes until 10-02, then none | writer burst #17 → #42; sync-function wall #22 → #49; Journal read timeout #20 → D-047 #21 |
| (9) Self-inflicted/ops | 20 | yes | replay twins #10/#16/#43/#47; path divergence #39; `checked` dropped #18; push-no-deploy #36; login expiries #62/#86/#98; failing-test deploy #70; cross-session overwrite #77; fix-caused-fix #85 |

**Top three recurring classes**

**A. Deploy/ops gap (11 incidents).** §67 (line 1883): a push "doPost unchanged, no deploy" left the web app four days behind. Then: @13 owed overnight 09-28; login expired 09-29 night (deploy waited 18 h); @17 serving pollers while Cost Recapture rebuilt in the old grid; a closing-tab deploy with a failing test; 10-02 login expired and a push from HEAD overwrote another session's Menu.gs; 10-02 09:11 deploy broke every read until 10-04; login expired 10-04 22:45; 10-09 login expired mid-push and commit 4c6d345 sat unpushed until 10-23; login expired again 10-23. `WRITER_VERSION` has read `0.4.0` through deployments @2..@40, so "`/exec` answers ok 0.4.0" verifies nothing; "live = repo" is a manual `clasp pull` diff every time.

**B. A replay posts a twin (5 incidents, 09-22..09-30).** Four receipts posted on migrated rows 09-22 (488.67); the warm job replayed migration-era envelopes 09-25 (two twins); `replayErroredReceipts` took every error envelope 09-28 (three pre-cutover docs); Paul's Save re-posted the Granite toilet kits the card had flagged; bank cards Paul approved replayed old rows at different cents. Each fix was local. The class ended only because the migration closed (D-067) and rule 10 in CLAUDE.md now tells Claude never to replay a pre-cutover document - a rule for the operator, not a rail in code.

**C. Stale envelope state believed (5).** 272 staging-era "posted" envelopes polluted the first nightly check; Harbor Freight was declared "on no book" from a staging duplicate pointer; Ping Lighting re-read trusted a staging `posted`; the nightly check flagged six voided migrated rows as missing; the 3 AM Posted list printed the read, not what Paul saved. Each consumer learned separately that the Blobs envelope is not the Journal.

Honourable mentions: three patches on `read_ledger`'s window in 48 h; four cards discovered by a hold each needing a Settings edit; three posting paths that drift.

## 2. Patch vs root cause

| Fix as shipped | What the general fix would have been |
|---|---|
| `RETRY_SINCE = "2026-09-17"` on the warm job (#16), then a separate "received before 09-21" skip in `replayErroredReceipts` (#43), then rule 10 in CLAUDE.md | One guard in `postBatch`/`buildEntry`: a `receipt-` entry dated before the cutover is refused unless it `supersedes` or claims `already_posted_txn_ids`. Never built; migration closure retired the class instead. |
| `read_ledger` window 60→365 days, cap 80→by date→150 cost-only (#19/#27/#28) | Compute the candidate rows in code (same vendor-normalised payee OR same date ±10 d OR same total ±5¢) and hand the model that list, so no window constant decides what it can see. |
| `MAX_TOKENS_PER_TURN` 8 000→32 000→16 000 in one day (#14) | Streaming, or a test that calls the SDK's own limit check. |
| `MAX_ATTACH_BYTES` 3→4 MB, rendition ladder (#80) → three weeks later the 4032 px original fails the API (#84) | Separate "what Drive stores" from "what the model is shown" at the first fix (done only at #84). |
| `attachment: ["integer","null"]` → sentinel `-1` + a test on the 16-param count (#81) | Right fix, but it reached production through a deploy with no live read for two days. A post-deploy dry-run upload would have caught it in minutes. |
| D-077 prompt rule "a pending card is not a new purchase" (#83) → six wrongful holds (#85) → D-087 splits on `source` | Match a receipt to a waiting bank card in code at ingest (same account, total ±tolerance, date ±10 d) and auto-supersede; the model never needed to be asked. |
| `MATCH_TOLERANCE_CENTS = 5` + Vendors aliases into the prompt (#48) | Fine as a constant; but the alias list is maintained by hand after each miss (Effren 09-28, Ivett Avila 10-09). A matched Zelle/Venmo name should write its own alias row. |
| email.txt filed in `inboxFinish` after the site ingest already did it (#39); own-PDF link "not done: approve-bg" (#79); refund sign "not done: `buildPostedEntries`" (#94); `supersedes` honoured by neither Inbox until D-058 (#55) | Three posting/filing paths re-implement file→post→tie. Delete `approve-bg` and the web Inbox clone and make the sheet's Save call the same `_shared` filing as ingest. |
| `GATE_TEXT` lint for gate codes (#6) - yet BAD_ACCOUNT (#71) and PROPERTY_REQUIRED (#93) reached Paul raw | One translation table for every string the card or digest can print, with the lint asserting no untranslated code leaves `inboxApprove`. |
| Four new personal/business cards each found by a hold and typed into Settings (#13, 7952, 7416) | A hold reason `UNKNOWN_CARD:<last4>` whose card offers "Paul's / Recast Chase / Dennis's" and writes the Settings row on Save. |
| `SpreadsheetApp.flush()` on three write paths (#73) | Correct root fix - the one case where the general rail was shipped first time. |

## 3. The prompt as a patch surface

`lib/bookkeeper-prompt.md` went from 285 lines / 11 sections at cutover (f79e835) to 446 / 16; 22 commits touched it since 09-21. Dated rules: 7 lines carry a 2026 date; 3 are literally "(Paul, 2026-xx-xx: …)".

Rules that are policy code could enforce instead of trusting the model to remember:
1. D-045 payer precedent - "three or more prior payments all one payer" is a Journal count; code can set `paid_from` and the reason.
2. D-046 utility confirmation - "matches nothing on the account" is an amount lookup against that account's bills/payments.
3. Tax-share arithmetic - the model allocates 8.25 % per line and the rounding cent; code already re-adds totals and could allocate tax from pre-tax lines.
4. D-077/D-087 waiting-card matching - a deterministic match on (account, total, date) at ingest; the model's `supersedes` is the only thing driving `retireBankCard` today.
5. Personal-card digits - the prompt hard-codes `9166, 8870, 3746, 7952` while D-088 says the bookkeeper reads `payment_instruments` fresh; the prompt copy is already a stale duplicate (7416 is not in it).

The remaining additions (itemizing, refunds' sign, placeholder naming, plain words, PDX↔DFW) are genuine judgment and belong in the prompt.

## 4. Deploy/ops incidents

Eleven incidents (list under class A) plus the one-off treadmill: 39 scripts emptied 09-30, 38 more by 10-02, ~18 since; 70 commits to `oneOffScripts.gs`; 47 commit subjects say "one-off"; 26 CHANGELOG notes "run by Paul". Four of the post-10-02 one-offs are the same script with different ids (`rereadFailedReads`, `rereadCoolHand`, `rereadRefunds`, `rereadDrinks`). `npm run deploy` is `--no-build` so it ships whatever is on disk (the 10-02 cross-session overwrite).

Smallest mechanism that makes the class impossible:
- `scripts/build-gs.mjs` already generates `lib.gs`; stamp `WRITER_VERSION` (and `/api/meta`'s version) with `git rev-parse --short HEAD` there. Then `/exec` and the sheet Inbox footer state which commit is live; "live = repo?" becomes one curl, not a `clasp pull` diff.
- One `npm run ship` = `npm test && [clean git status] && clasp push -f && clasp deploy -i <id> && netlify deploy --prod && curl /exec + /api/meta == HEAD && fire one dry-run upload`. First failure mode it will hit is `invalid_rapt`; it prints "run `npx clasp login`" as the one step.
- A standing re-runnable `reprocessDocs(ids)` in the RE-RUNNABLE section replaces the four `reread*` one-offs.

## 5. Time spent - firefight sessions per week

```
W1 09-21..27  ########           8 firefights   138 commits
W2 09-28..04  ##################18             227
W3 10-05..11  ###                3              78
W4 10-12..18  #                  1               3
W5 10-19..25  ######             6 (all 10-23)   33
```

The calendar rate falls hard after 10-04. Two readings: (i) the plumbing classes - perf, writer misfire, state desync, replay twins - have zero instances after 10-02, which is real convergence; (ii) weeks 3-4 are also weeks Paul barely used it (Citizens not imported 10-06→10-23; the 10-10 and 10-13 cards still waiting on 10-20). When he sat down on 10-23 the system produced six defects in one day - the same per-session rate as 09-26 or 09-28 - but of a different kind: external formats and policy, each one-off and each now tested. Converging in the core; flat per hour of real use at the edges. Other signals: tests 454→579; `Inbox.html` is the most-churned file (32 commits) and `oneOffScripts.gs` (70) the second; 13 "seen, not chased" items and 9 "not yet seen on a real case" - a backlog of latent surprises that is not shrinking.

## 6. The unseen - what is worth a check now

| Item | Risk | Action |
|---|---|---|
| D-088 first Chase import - "a real Chase QFX is still untried"; the Desktop-file statement test has been broken since 10-05 | High: the first import books Paul's deposits as working capital (D-055) while he is about to take a draw | Parse the Chase file with `parseOfx` before Import statement; re-pin `test/statement.test.mjs` to a real file |
| Payout matcher not built, 25 proposed cards from the 10-23 import include the sale payouts; "the matcher's cards offer house costs" | High, live now: a Save on a payout card books ~240 k as a house cost | Not a watch item - `resetFeedCards` those lines or build the 2010/2030 verdict before Paul opens the Bank tab |
| `refreshBalanceSheetHourly` 241 s / 360 s, growing with the Journal (3,836 rows 10-20) | High and certain: when it crosses 360 s the P&L and Taxes tabs silently stop | Read the last duration from Executions; split P&L/Taxes into two triggers or cache the Journal read |
| D-057/058/060 placeholder swap on a real receipt - three placeholders since 09-29, no receipt has arrived to swap | Medium: void→post→retie is a two-step; #73 showed a Save can die between steps | One deliberate test: forward one of Dennis's three Home Depot receipts and read back |
| D-087 `retireBankCard` live | Medium | Watch the first |
| D-073 `attachment` N>0 on a real multi-receipt email - proven only on `-1` re-reads | Medium, cosmetic | The next Squarespace/Roddy batch is the test |
| D-089 iPhone forward via the 15-min poll | Low-medium | Watch |

## 7. Verdict: (a) keep going, fix the recurring classes at their root

The history argues against a rebuild in three ways. First, the categories that signal bad design - model behaviour (4), performance (6, none since 10-02), state desync (7, none since 10-02) - are small and have stopped. Second, the largest category, external limits (14), is the knowledge a rebuild would have to re-buy; every one is now a test or a rail. Third, the two self-inflicted chains and the eleven ops incidents share one cause: there is no mechanism between "tests pass" and "it is live", only a human sequence of three commands and a diff. That is a 100-line script, not a subsystem.

Not (b) either. The one subsystem with a structural smell is the trio of posting paths (site ingest / sheet Save / `approve-bg`) - but the fix is deletion, not a rebuild. Not (c): a full rebuild would discard 579 tests, 92 recorded decisions and the migration, to arrive at the same Sheets-plus-model shape Paul has settled on.

The four root fixes, in order of payback: (1) the ship script with a commit stamp; (2) one translation table for every string the card prints, lint-enforced across engine refusals too; (3) delete `approve-bg`/the web Inbox clone and make the sheet's Save use the ingest's filing; (4) move D-045/D-046/D-087's matching into code so the prompt stops being where policy is patched. Then the three live risks in §6.

## Appendix - fix ledger (post-cutover; Cat: 1 ext, 2 model, 3 data, 4 state, 5 rail, 6 policy, 7 UI, 8 perf, 9 self/ops. Where: P prompt, C code, A Apps Script, D docs, O one-off. T = test added)

| # | Date | What broke / wanted | Cat | Fix shape | Where | Recurs | T | Commit |
|---|---|---|---|---|---|---|---|---|
| 1 | 09-22 | doGet misfire: 16/20 receipts errored | 1 | REDIRECT_MISFIRE retry on reads; recover-errored.mjs | C | 09-25, 09-28, 10-02 | y | 95f42c2 |
| 2 | 09-22 | properties@ reads API-refused | 1 | reword; server-side fallback | P/C | - | - | 32398fa |
| 3 | 09-22 | `why` far too long | 7 | one sentence; `checked` field | P | #6 #25 #34 | - | c0b83d2 |
| 4 | 09-22 | body-only receipt gets no Drive file (D-035) | 5 | email.txt; setDocUrl | C/A | #39 | y | 31c7929 |
| 5 | 09-22 | untraded utility itemized nowhere | 2 | →Utilities | A | #44 | lint | 2184546 |
| 6 | 09-23 | card unreadable (D-040) | 7 | bullets name the fix | A | - | lint | 72d5654 |
| 7 | 09-23 | property per item; D-010 check on card (D-041) | 7 | Inbox.html | A | #92 #93 | - | 879bcc3 |
| 8 | 09-23 | tools put on a property | 2/6 | prompt para | P | - | - | ebe2e55 |
| 9 | 09-23 | 6-h ctx cache after sellPost | 4 | clear cache | A | - | - | 78c5440 |
| 10 | 09-23 | 4 receipts replayed onto migrated rows (488.67) | 9 | sweep + void | O | #16 #43 #47 #64 | - | 30d18ee |
| 11 | 09-25 | medium reads held (D-044) | 6 | gate cond 1 | C | - | y | 1493bcd |
| 12 | 09-25 | payer precedent (D-045) | 6 | prompt rule 5 | P | #19 | - | 1493bcd |
| 13 | 09-25 | unknown cards 8870/3746 | 3 | Settings list | D | 7952, 7416 | - | f38dc7f |
| 14 | 09-25 | max_tokens 8k cut → 32k refused → 16k | 1/9 | constant ×3 | C | - | y | efb534a |
| 15 | 09-25 | errored reads never retried | 5 | warm replays fromStored | C | - | y | 904c75f |
| 16 | 09-25 | warm replayed migration-era → 2 twins posted | 9 | RETRY_SINCE, 2/run | C | #43 | - | efb534a |
| 17 | 09-25 | writer timed out under burst | 8 | 75 s spacing; confirmPosted | C | #42 | y | ac2ed8c |
| 18 | 09-25 | `checked` dropped since 09-22 | 9 | keep it | C | - | - | eb19b08 |
| 19 | 09-25 | ledger window 60 d hid precedent | 5 | 365 d | C | #27 #28 | - | 277d3a9 |
| 20 | 09-25 | Journal read timeout 2→5 min | 8 | constant | C | →#21 | - | d189148 |
| 21 | 09-25 | reads serialised behind the writer (D-047) | 8 | sheets-reader | C | - | y | 4b58dfb |
| 22 | 09-25 | sync approve cut at 26 s | 8 | approve-bg | C | #49 | y | f318bac |
| 23 | 09-25 | SA key > 4 KB env | 1 | two-field key | C | - | y | 9e42230 |
| 24 | 09-25 | nightly check noise | 4 | cutover filter; cap 40 | C | #72 | y | 46eb1ba |
| 25 | 09-26 | digest printed the working | 7 | digestReason_ | A | - | lint | aca9ef1 |
| 26 | 09-26 | staging dup pointer believed | 4 | audit; docs | D | #38 | - | fb80f1e |
| 27 | 09-26 | read_ledger 80-newest hid March | 5 | by date | C | #28 | - | bc26087 |
| 28 | 09-26 | by-date 80 lines hid late row | 5 | cost-only, 150 | C | - | y | 7797088 |
| 29 | 09-26 | Reprocess posted (D-048) | 5 | holdOnly | C | - | y | f138ee7 |
| 30 | 09-26 | not itemizing (D-049) | 2/6 | prompt section | P | - | y | f41a441 |
| 31 | 09-26 | partly on the books (D-050) | 5/6 | already_posted_txn_ids | C/P | - | y | bc26087 |
| 32 | 09-26 | web Inbox kept old entries after reprocess | 4 | editingAt | web | - | - | 65fb3be |
| 33 | 09-26 | TOTAL_MISMATCH with nothing proposed | 5 | NO_ENTRIES | C | - | y | 253ffaa |
| 34 | 09-26 | plain words everywhere | 7 | prompt+card+poller | P/A | #53 #59 #71 #93 | lint | 5a63f4a |
| 35 | 09-26 | Returned; per-line buttons | 7 | Inbox.html | A | - | lint | d81c2a8 |
| 36 | 09-26 | web app 4 days behind (§67) | 9 | deploy; CLAUDE.md rule | D | #62 #63 #86 | - | a26d6b5 |
| 38 | 09-28 | search_docs believed staging "posted" | 4 | check Journal ids | C | - | y | ff38e18 |
| 39 | 09-28 | sheet Save filed no email.txt | 9 | storeEmailText_ + one-off | A/O | #79 #94 | - | ff38e18 |
| 40 | 09-28 | empty read → nothing to type | 7 | seeded line | A | - | - | 3ca59ac |
| 41 | 09-28 | loading progress | 7 | Inbox.html | A | - | - | f4a7eef |
| 42 | 09-28 | 8 posts errored in 28-post burst | 8 | warm healed 7; replay one-off | O | - | - | b8c0e57 |
| 43 | 09-28 | replayErrored posted 3 pre-cutover docs | 9 | undo; date skip | O | - | - | 81875e0 |
| 44 | 09-28 | 12 invented trade names | 2 | tradesByProperty→prompt | C/P | - | y | 2c1843d |
| 45 | 09-28 | sold-house mailbox skipped | 6 | register sold | C | - | y | f4b064a |
| 46 | 09-28 | look-alike cards, wrong one saved | 7 | two one-offs | O | - | - | 8ead36f |
| 47 | 09-28 | toilet kits double-posted on Save | 9 | void+repost; mark-posted 409 | O | - | - | cb80fa7 |
| 48 | 09-28 | Zelle alias unknown; penny diffs | 2/3 | tolerance 5¢; aliases | C/P/D | Ivett 10-09 | - | d74c856 |
| 49 | 09-28 | resetFeedCards 54 s sync wall | 8 | tie in-process | A | - | lint | b8b8a54 |
| 51 | 09-28 | 33 unreachable functions (D-056) | 9 | oneOffScripts + lint | A | - | lint | 097a26d |
| 52 | 09-29 | two Inbox tabs | 7 | Inbox.html | A | - | - | 4c82358 |
| 53 | 09-29 | asked for an account code | 7 | by bank name | A | - | lint | 79b247f |
| 54 | 09-29 | placeholder (D-057) | 6 | gate 10 + prompt + feedRetie + card | C/P/A | - | y | a20eb5f |
| 55 | 09-29 | supersedes never honoured on Save (D-058) | 5 | replacedEntry_ | A/C | - | lint | d7d2312 |
| 57 | 09-29 | card from daily email (D-059) | 6 | bank-mail | C | - | y | bb1af95 |
| 58 | 09-29 | 3 bank lines lumped into one placeholder | 9 | one per line | A | - | lint | 05cdafc |
| 59 | 09-29 | 529 shown raw | 1/7 | matchFailure_; maxRetries 4 | A/C | - | - | c02a2a8 |
| 60 | 09-29 | one charge one card (D-060) | 6 | applyVerdicts split | C | - | y | c02a2a8 |
| 62 | 09-30 | login expired; deploy waited 18 h | 9 | - | - | ×6 | - | - |
| 64 | 09-30 | bank cards replayed old rows at other cents (223.67) | 5/2 | fixCitizensGap; bank box | O/C | - | y | 46b389b |
| 67 | 10-01 | PENDING ROUTING refused | 5 | posting.mjs | C | - | y | db134f6 |
| 68 | 10-01 | replayIds dryRun; refuse 2 lists | 5 | poller | A | - | - | 9dab69b |
| 70 | 10-01 | deploy with a failing test | 9 | "&&" note | D | - | - | - |
| 71 | 10-01 | BAD_ACCOUNT raw; Venmo Save | 7 | Inbox.html | A | - | - | 40821d7 |
| 72 | 10-02 | nightly: voided migrated row + split bill = false alarms | 4/5 | gatherFacts | C | - | part | 793cbaa |
| 73 | 10-02 | Save marked recorded, nothing landed | 1/5 | flush() in lock ×3 | A | - | - | 793cbaa |
| 74 | 10-02 | bank box red for post-file entries | 5 | reason row | C | - | y | 793cbaa |
| 76 | 10-02 | Posted list prints the read | 4 | result.entries | C/A | - | y | e5a8145 |
| 77 | 10-02 | cross-session overwrite on push | 9 | - | D | - | - | - |
| 78 | 10-02 | >6 attachments silently dropped | 5/1 | gm-id-2 split | A | - | lint | 690f44a |
| 79 | 10-02 | every entry links first PDF (D-073) | 5 | attachment + ownReceiptUrl | P/C/A | →#81 | y | 4ae7f5e |
| 80 | 10-02 | photos shrunk at 3 MB (D-076) | 1 | 4 MB + ladder; 87 restored | A/O | →#84 | lint | 8f61345 |
| 81 | 10-04 | 17th nullable param: every read failed 2 days | 1/9 | sentinel -1; count test | C | - | y | a1fdbac |
| 82 | 10-04 | errored docs have no Reprocess | 5 | one-off reread | O | ×4 | - | e9d490f |
| 83 | 10-04 | copy of waiting card read as new (D-077) | 2/6 | prompt only | P | →#85 | y | e446241 |
| 84 | 10-13 | 4032 px fails 3000 px cap | 1/9 | shownCopy 2000 px | C | - | y | 81524b3 |
| 85 | 10-10 | 6 receipts held because bank card waited (D-087) | 9/6 | source split; retireBankCard | P/C | - | y | 4de791b |
| 86 | 10-09 | login expired; fix unpushed 14 d | 9 | - | - | - | - | 4c6d345 |
| 87 | 10-20 | Oct Workspace/Roddy/Foremost never reach receipts@ | 1 | docs | D | #97 | - | 6be5cc5 |
| 88 | 10-23 | card 7416 (D-088) | 3/6 | Bank accounts tab | D | - | - | 6ece2e8 |
| 89 | 10-23 | Latin-1 header broke filing (U+202F) | 1/5 | RFC 5987 | C | - | y | e67f29e |
| 90 | 10-23 | iPhone forward carries no files (D-089) | 1 | from the thread | A | - | y | 11e98e5 |
| 91 | 10-23 | ceiling 500→2 000 (D-090) | 6 | Settings | D | - | - | 1934351 |
| 92 | 10-23 | per-item house select unlabelled | 7 | label | A | - | - | 70e31c1 |
| 93 | 10-23 | D-010 flag did not stop Save; raw code | 7/5 | Save stops, names line | A | - | - | 1ffcb43 |
| 94 | 10-23 | refunds unpostable (D-091) | 5/6 | posting+gate+prompt | C/P | buildPostedEntries not done | y | bb4efc5 |
| 95 | 10-23 | drinks held (D-092) | 6 | gate cond 5 + prompt | C/P | - | y | 9c2011d |
| 96 | 10-23 | Paint/Flooring split | 6/7 | picker + sections | A/C | - | y | 7fb7915 |
| 97 | 10-23 | Venmo payments in no book | 1 | one-off from screenshots | O | - | - | 133156e |
| 98 | 10-23 | login expired again | 9 | - | - | - | - | - |

---

# Data run - the live store on 2026-10-24

Every `doc/` key of the books-docs store (1,426), the 390 non-dry documents received on or after the 2026-09-21 cutover fetched with `netlify blobs:get` and tallied. 337 of them are post-cutover by receivedAt: 302 receipts, 35 bank-line cards.

```
post-cutover live envelopes: 337
by source: {'email': 302, 'feed': 35}

== RECEIPTS (email/upload) by outcome ==
   165  posted on its own
    64  posted by Paul
    60  dismissed on its own
    11  dismissed by Paul
     1  error
     1  pending

== RECEIPTS by month x outcome ==
  2026-09: {'posted on its own': 83, 'posted by Paul': 19, 'dismissed by Paul': 8, 'dismissed on its own': 18}
  2026-10: {'posted on its own': 82, 'posted by Paul': 45, 'dismissed on its own': 42, 'dismissed by Paul': 3, 'error': 1, 'pending': 1}

== RECEIPT cards Paul touched or still waiting: 76 of 302 ==
  gate reasons present (a card may carry several):
      39  NOT_POST_VERDICT
      27  PAYER_UNKNOWN
      17  OVER_CEILING
      14  BAD_PROPERTY
       6  LOW_CONFIDENCE
       4  NEEDS_HUMAN_274D
       3  ZERO_TOTAL
       3  ENTRY_INVALID
       3  NO_ENTRIES
       2  TOTAL_MISMATCH
       1  BAD_DATE
  primary reason (first reason other than verdict/confidence):
      18  PAYER_UNKNOWN
      17  OVER_CEILING
      13  BAD_PROPERTY
      10  NOT_POST_VERDICT
       4  (no gate reasons)
       4  NEEDS_HUMAN_274D
       3  ZERO_TOTAL
       2  LOW_CONFIDENCE
       2  NO_ENTRIES
       1  BAD_DATE
       1  TOTAL_MISMATCH
       1  ENTRY_INVALID
  top reason combinations:
      15  PAYER_UNKNOWN
      12  BAD_PROPERTY+NOT_POST_VERDICT
      10  NOT_POST_VERDICT
       7  OVER_CEILING
       5  OVER_CEILING+PAYER_UNKNOWN
       4  (none)
       3  NEEDS_HUMAN_274D+NOT_POST_VERDICT
       2  NOT_POST_VERDICT+OVER_CEILING+PAYER_UNKNOWN
       2  LOW_CONFIDENCE+PAYER_UNKNOWN
       2  LOW_CONFIDENCE
       2  ENTRY_INVALID+NOT_POST_VERDICT+ZERO_TOTAL
       2  NOT_POST_VERDICT+NO_ENTRIES

== model verdict/confidence vs outcome (receipts) ==
   158  verdict=post conf=high -> posted on its own
    56  verdict=dismiss conf=high -> dismissed on its own
    26  verdict=post conf=high -> posted by Paul
    23  verdict=hold conf=medium -> posted by Paul
     8  verdict=post conf=medium -> posted by Paul
     7  verdict=post conf=medium -> posted on its own
     7  verdict=hold conf=high -> posted by Paul
     3  verdict=dismiss conf=medium -> dismissed by Paul
     3  verdict=hold conf=medium -> dismissed by Paul
     3  verdict=dismiss conf=medium -> dismissed on its own
     2  verdict=post conf=high -> dismissed by Paul
     2  verdict=hold conf=high -> dismissed by Paul
     1  verdict=None conf=None -> error
     1  verdict=post conf=medium -> dismissed by Paul
     1  verdict=hold conf=high -> dismissed on its own
     1  verdict=hold conf=medium -> pending

== Paul's approvals: did he change the proposal? (cards with saved entries kept, 10-02 on) ==
  saved as proposed: 15   changed: 28   (no saved copy kept: 21)
  what changed when changed: {'paid_from': 22, 'property': 8, 'items/amounts/accounts': 3}
  by gate reason: saved-unchanged / changed
    PAYER_UNKNOWN            0 /  20
    NOT_POST_VERDICT         8 /  11
    OVER_CEILING             5 /   7
    BAD_PROPERTY             0 /   6
    ENTRY_INVALID            0 /   2
    NEEDS_HUMAN_274D         2 /   0
    BAD_DATE                 0 /   1
    ZERO_TOTAL               0 /   1

== PAYER_UNKNOWN: what Paul picked (vendor -> paid_from) ==
  Squarespace, Inc.: {'PAUL': 6}
  Foreclosure Listing Service: {'PAUL': 6}
  The Home Depot: {'DENNIS': 3, '1401': 1}
  TXU Energy: {'1401': 2}
  Vimeo: {'PAUL': 1}
  Cool Hand Electric &amp; Air: {'PAUL': 1}
  Amazon.com: {'1401': 1}
  Chinos LLC: {'1401': 1}
  Alaska Airlines: {'PAUL': 1}
  PACER (Public Access to Court Electronic Records): {'PAUL': 1}
  Juan Garcia: {'1401': 1}
  Xfinity (Comcast) - NOW WiFi Pass: {'PAUL': 1}
  Lupe Carpet Guy (ANL LLC): {'1401': 1}
  Family Dollar: {'DENNIS': 1}
  Ellis County Clerk: {'1401': 1}
  Mariana Martinez: {'PAUL': 1}

== BAD_PROPERTY / property empty: what Paul picked (vendor, channel -> property) ==
  ('The Home Depot', 'receipts'): {'OVERHEAD': 1, '658 Erin Hills': 2, '413 Green Acres': 2, '241 Poinsetta': 1}
  ("Lowe's Home Centers, LLC", 'receipts'): {'OVERHEAD': 1, '658 Erin Hills': 1}
  ('TXU Energy', 'receipts'): {'881 Newport': 1}
  ('HILCO Electric Cooperative', 'receipts'): {'200 Janice': 1}

== OVER_CEILING cards: totals and outcome ==
  2026-10-09 Chinos LLC                      3500.00 conf=medium other=['PAYER_UNKNOWN'] -> posted by Paul
  2026-10-17 Armandre Vega                   3500.00 conf=medium other=- -> posted by Paul
  2026-10-14 Juan Garcia                     2100.00 conf=high other=['PAYER_UNKNOWN'] -> posted by Paul
  2026-10-14 Lowe's Home Centers, LLC        1327.71 conf=high other=- -> posted by Paul
  2026-10-10 The Home Depot                  1023.29 conf=high other=- -> posted by Paul
  2026-10-08 HILCO Electric Cooperative       860.00 conf=medium other=['BAD_PROPERTY'] -> posted by Paul
  2026-10-10 Armandre Vega                    850.00 conf=high other=- -> posted by Paul
  2026-10-06 Juanito Garcia                   800.00 conf=high other=- -> posted by Paul
  2026-03-24 Amazon.com                       768.49 conf=high other=- -> posted by Paul
  2026-09-30 Falcon Creek Lawn Care           760.00 conf=high other=['PAYER_UNKNOWN'] -> posted by Paul
  2026-04-06 Amazon                           651.33 conf=medium other=['TOTAL_MISMATCH'] -> posted by Paul
  2026-10-22 The Home Depot                   624.77 conf=high other=- -> posted by Paul
  2026-03-17 Amazon.com                       596.71 conf=high other=['NO_ENTRIES'] -> dismissed on its own
  2026-10-08 Alaska Airlines                  579.40 conf=high other=['PAYER_UNKNOWN'] -> posted by Paul
  2026-09-17 Energy Texas                     559.34 conf=high other=['PAYER_UNKNOWN'] -> posted by Paul
  2026-09-23 Energy Texas                     559.34 conf=high other=['TOTAL_MISMATCH'] -> dismissed on its own
  2026-09-30 American Airlines                534.40 conf=high other=- -> posted by Paul
  2026-10-13 Cool Hand Electric &amp; Air     516.00 conf=medium other=['PAYER_UNKNOWN'] -> posted by Paul
  2026-09-15 Foreclosure Listing Service      506.64 conf=high other=['PAYER_UNKNOWN'] -> posted by Paul

== PENDING NOW (receipts) ==
  2026-10-07 age= 16d Amazon                        361.35 hold/medium BAD_PROPERTY ch=receipts
  count=1 median age=16d

== ERROR envelopes ==
  2026-10-12 gm-1a12d6f7780f7d94 retries=2 The Anthropic API call failed (turn 15): 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.2.image.s

reprocessed cards (why carries [reprocess): 3
retries present: {2: 30, 1: 34}

== MODEL USAGE per receipt read ==
  reads with usage: 298
  turns: median 3.0, max 7, >=15: 0
  per read: input(uncached) median 32,823  cache_read median 52,173  cache_write median 17,391  output median 2,152
  totals: input 10,448,396  cache_read 14,281,786  cache_write 3,553,707  output 742,070

== LATENCY receivedAt -> finishedAt (receipts, minutes) ==
  n=302 median 15 min, p90 981 min

== TOOL CALLS per read (from transcript_summary) ==
  read_ledger: 445 calls over 298 reads (1.5/read)
  search_docs: 343 calls over 298 reads (1.2/read)
  list_properties: 158 calls over 298 reads (0.5/read)
  zoom: 153 calls over 298 reads (0.5/read)
  find_vendor: 106 calls over 298 reads (0.4/read)
  web_search: 0 calls over 298 reads (0.0/read)
  fallback: 0 calls over 298 reads (0.0/read)

== BANK-LINE CARDS (source feed) ==
    30  status=pending review= by=
     3  status=posted review=approve by=paul@recast-properties.com
     2  status=dismissed review=dismiss by=paul@recast-properties.com
  pending feed cards now:
    2026-09-21 Home Depot                           0.00 card=- entries=1 why=Home Depot supplies for 469 Brushwood on 09-21.
    2026-09-24 Home Depot                           0.00 card=- entries=1 why=Home Depot supplies for 469 Brushwood on 09-24.
    2026-09-25 Home Depot                           0.00 card=- entries=1 why=Home Depot supplies for 469 Brushwood on 09-25.
    2026-09-28 DEPOSIT ID NUMBER 157399          2000.00 card=- entries=0 why=A $2,000.00 deposit landed on 09-28 with no name on it - where did tha
    2026-09-28 Target Waxahachie                   -2.65 card=Dennis entries=0 why=There is a $2.65 Target charge in Waxahachie on 09-28 on Dennis's card
    2026-09-30 09/30 ZELLE CHARVALE PRODUCTI      500.00 card=- entries=0 why=On 09-30 a $500 Zelle came into the account from Charvale Production i
    2026-10-01 Family Dollar                       -5.63 card=Dennis entries=1 why=Dennis picked up $5.63 of supplies at the Family Dollar in Ferris, boo
    2026-10-02 MUNICIPAL ONLINE PAYMEN 844-7       -2.00 card=Paul entries=0 why=On 10-02 the bank shows a separate $2.00 charge from Municipal Online 
    2026-10-02 Refund THE HOME DEPOT #6505         61.91 card=Dennis entries=0 why=On 10-02 Home Depot in Waxahachie refunded $61.91 to Dennis's card - w
    2026-10-02 Home Depot Waxahachie               -3.14 card=Dennis entries=0 why=On 10-02 there's a $3.14 Home Depot charge on Dennis's card - which ho
    2026-10-05 CITY OF RED OAK ECOMM 972-617     -298.72 card=Paul entries=0 why=The City of Red Oak water payment on 10-05 came through as $298.72, bu
    2026-10-05 Home Depot Waxahachie               -3.65 card=Dennis entries=0 why=There is a $3.65 Home Depot charge in Waxahachie on 10-05 on Dennis's 
    2026-10-06 THE HOME DEPOT #6505 WAXAHA        -71.38 card=Dennis entries=0 why=There is a $71.38 Home Depot charge in Waxahachie on 10-06 on Dennis's
    2026-10-06 1315 HWY 77 NORTH WAXAHACHIE       -52.85 card=Paul entries=0 why=A $52.85 charge on 10-06 shows only an address, 1315 Hwy 77 North in W
    2026-10-07 Citizens Bank                       -1.00 card=- entries=1 why=A second $1 outside-ATM charge from the bank on 10-07.
    2026-10-07 Citizens Bank                       -1.00 card=- entries=1 why=The bank's own $1 charge for using an outside ATM on 10-07.
    2026-10-07 AMAZON.COM SEATTLE WA              -16.25 card=Paul entries=0 why=There's a $16.25 Amazon charge on 10/07 with no receipt in the books -
    2026-10-07 AMAZON.COM SEATTLE WA             -361.35 card=Paul entries=0 why=There's a $361.35 Amazon charge on 10/07 with no receipt in the books 
    2026-10-08 City of Waxahachie - Utility B      -9.94 card=Paul entries=1 why=The $9.94 service fee that came with the Waxahachie water bill for 469
    2026-10-09 Wire transfer to RECAST PROPE  -147729.38 card=- entries=0 why=A wire of $147,729.38 went out on 10/09 to Recast Properties LLC - whi
    2026-10-09 FEDWIRE CREDIT VIA: THE BANKER  147729.38 card=- entries=0 why=A wire of $147,729.38 came in on 10-09 and the bank only shows it as c
    2026-10-09 Citizens Bank                      -25.00 card=- entries=1 why=The bank's $25 fee for the wire sent out on 10-09.
    2026-10-13 Zelle payment to Mariana Marti    -300.00 card=- entries=0 why=We paid Mariana Martinez $300.00 by Zelle on 10-13 - what work was tha
    2026-10-13 AMAZON.COM SEATTLE WA              -65.86 card=Paul entries=0 why=There's a $65.86 Amazon charge on your card on Oct 13 with no receipt 
    2026-10-13 AMAZON.COM SEATTLE WA             -197.88 card=Paul entries=0 why=There's a $197.88 Amazon charge on your card on Oct 13 with no receipt
    2026-10-13 Home Depot Waxahachie              -37.84 card=Paul entries=0 why=A $37.84 Home Depot charge in Waxahachie on 10/13 has no receipt in th
    2026-10-14 ROCKETT SPECIAL UTILIT 972-61     -230.00 card=Paul entries=0 why=A $230.00 payment to Rockett water utility went out on Oct 14 - which 
    2026-10-14 Online Transfer to CHK ...8870  -30000.00 card=- entries=0 why=$30,000.00 was transferred out on 10-14 to a checking account ending 8
    2026-10-14 Online Payment 31209116906 To     -574.63 card=- entries=0 why=An online payment of $574.63 went out on 10-14 to a company the bank o
    2026-10-14 Zelle payment to Mariana Marti    -350.00 card=- entries=0 why=We paid Mariana Martinez another $350.00 by Zelle on 10-14 - what was 
  decided feed cards: how
    2026-09-28 Home Depot Waxahachie             -337.07 -> posted/approve by=paul@recast-properties.com note=
    2026-09-23 Kopec Overhead Door LLC              0.00 -> posted/approve by=paul@recast-properties.com note=
    2026-10-01 VENMO *Ivett Avila New York N     -500.00 -> dismissed/dismiss by=paul@recast-properties.com note=Same as the $500 to Juanito Garcia for paint and l
    2026-09-28 CONDOCERTS TX 800-3106552 KS      -375.00 -> dismissed/dismiss by=paul@recast-properties.com note=same fee as the 09-09 HOA release for 881 Newport
    2026-10-06 FIC*FOREMOST INSURANCE 800-53     -267.34 -> posted/approve by=paul@recast-properties.com note=

== TOLERANCE POSTS: posted receipts where sum(items) != receipt_total (would not tie to the bank to the cent) ==
  2026-04-06 Amazon                       total=651.33 items=457.57 diff=-193.76 posted by Paul
  checked 228 posted receipts, 1 differ
```

## Follow-up checks

```
== Receipt cards Paul touched that had a bank card for the same amount within 10 days ==
  receipt 2026-10-06 The Home Depot             52.85 [posted/approve]  <-> bank card feed-1401-202610060000000553138052 [pending]
  receipt 2026-09-30 The Home Depot              3.14 [posted/approve]  <-> bank card feed-1401-202610020000000552537038 [pending]
  receipt 2026-10-01 Family Dollar               5.63 [posted/approve]  <-> bank card feed-1401-202610010000000552259775 [pending]
  receipt 2026-09-28 Target                      2.65 [posted/approve]  <-> bank card feed-1401-202609280000000551582880 [pending]
  receipt 2026-10-12 Lupe Carpet Guy (ANL L    300.00 [posted/approve]  <-> bank card feed-1402-202610130 [pending]
  receipt 2026-10-07 Amazon                    361.35 [pending/None]  <-> bank card feed-1401-202610070000000553333340 [pending]
  receipt 2026-10-05 The Home Depot             71.38 [posted/approve]  <-> bank card feed-1401-202610060000000553160868 [pending]
  receipt 2026-10-14 Mariana Martinez          350.00 [posted/approve]  <-> bank card feed-1402-202610142 [pending]
  receipt 2026-10-03 The Home Depot              3.65 [posted/approve]  <-> bank card feed-1401-202610050000000552896402 [pending]
  count=9

== uncached input per read by number of turns (the document is re-sent uncached each turn) ==
  turns=1: n=28 median uncached input=8,563 cache_read=0 cache_write=18,686
  turns=2: n=41 median uncached input=18,801 cache_read=18,957 cache_write=17,633
  turns=3: n=126 median uncached input=32,740 cache_read=43,995 cache_write=0
  turns=4: n=64 median uncached input=47,859 cache_read=56,871 cache_write=18,686
  turns=5: n=30 median uncached input=62,564 cache_read=75,828 cache_write=18,686
```

## The tally script

```python
#!/usr/bin/env python3
"""Review-load analysis of the live Recast Books envelopes (post-cutover, non-dry)."""
import json, glob, collections, sys, datetime, statistics

ENV = sys.argv[1]
CUTOVER = "2026-09-21"
TODAY = datetime.datetime(2026, 10, 24, 12, 0, 0)

def load():
    out = []
    for f in glob.glob(f"{ENV}/*.json"):
        try:
            e = json.load(open(f))
        except Exception:
            continue
        if not isinstance(e, dict) or e.get("dryRun"):
            continue
        rec = str(e.get("receivedAt") or e.get("startedAt") or "")[:10]
        if rec and rec < CUTOVER:
            continue
        out.append(e)
    return out

def pdate(s):
    try:
        return datetime.datetime.fromisoformat(str(s).replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None

def head(r):
    return str(r).split(":")[0]

def ent_sig(entries):
    sig = []
    for en in entries or []:
        items = tuple(sorted((str(i.get("account")), int(i.get("amount_cents") or 0)) for i in (en.get("items") or [])))
        sig.append((str(en.get("property")), str(en.get("paid_from")), items))
    return tuple(sorted(sig))

envs = load()
print(f"post-cutover live envelopes: {len(envs)}")
by_src = collections.Counter(e.get("source") for e in envs)
print("by source:", dict(by_src))
print()

receipts = [e for e in envs if e.get("source") != "feed"]
feeds = [e for e in envs if e.get("source") == "feed"]

def outcome(e):
    st = e.get("status")
    rv = e.get("review") or {}
    by = rv.get("by") or ""
    act = rv.get("action") or ""
    if st == "posted":
        return "posted by Paul" if act == "approve" else "posted on its own"
    if st == "dismissed":
        if act == "dismiss" and by != "claude":
            return "dismissed by Paul"
        return "dismissed on its own"
    return st or "?"

print("== RECEIPTS (email/upload) by outcome ==")
oc = collections.Counter(outcome(e) for e in receipts)
for k, v in oc.most_common():
    print(f"  {v:4d}  {k}")
print()

print("== RECEIPTS by month x outcome ==")
mo = collections.defaultdict(collections.Counter)
for e in receipts:
    mo[str(e.get("receivedAt") or "")[:7]][outcome(e)] += 1
for m in sorted(mo):
    print(f"  {m}: {dict(mo[m])}")
print()

touched = [e for e in receipts if outcome(e) in ("posted by Paul", "dismissed by Paul", "pending")]
print(f"== RECEIPT cards Paul touched or still waiting: {len(touched)} of {len(receipts)} ==")
reasons = collections.Counter()
first_reason = collections.Counter()
combos = collections.Counter()
for e in touched:
    rs = [head(r) for r in ((e.get("gate") or {}).get("reasons") or [])]
    for r in set(rs):
        reasons[r] += 1
    # the "real" reason: drop NOT_POST_VERDICT/LOW_CONFIDENCE when another reason exists
    core = [r for r in rs if r not in ("NOT_POST_VERDICT", "LOW_CONFIDENCE")]
    first_reason[core[0] if core else (rs[0] if rs else "(no gate reasons)")] += 1
    combos[tuple(sorted(set(rs)))] += 1
print("  gate reasons present (a card may carry several):")
for k, v in reasons.most_common():
    print(f"    {v:4d}  {k}")
print("  primary reason (first reason other than verdict/confidence):")
for k, v in first_reason.most_common():
    print(f"    {v:4d}  {k}")
print("  top reason combinations:")
for k, v in combos.most_common(12):
    print(f"    {v:4d}  {'+'.join(k) or '(none)'}")
print()

# model verdict vs outcome
print("== model verdict/confidence vs outcome (receipts) ==")
vc = collections.Counter()
for e in receipts:
    m = e.get("model") or {}
    vc[(m.get("verdict"), m.get("confidence"), outcome(e))] += 1
for k, v in sorted(vc.items(), key=lambda kv: -kv[1]):
    print(f"  {v:4d}  verdict={k[0]} conf={k[1]} -> {k[2]}")
print()

# Did Paul change anything when he approved?
print("== Paul's approvals: did he change the proposal? (cards with saved entries kept, 10-02 on) ==")
same = diff = nosave = 0
changed_fields = collections.Counter()
by_reason_same = collections.defaultdict(lambda: [0, 0])
for e in receipts:
    if outcome(e) != "posted by Paul":
        continue
    saved = (e.get("result") or {}).get("entries")
    model = (e.get("model") or {}).get("entries") or []
    rs = set(head(r) for r in ((e.get("gate") or {}).get("reasons") or []))
    if not saved:
        nosave += 1
        continue
    if ent_sig(saved) == ent_sig(model):
        same += 1
        for r in rs:
            by_reason_same[r][0] += 1
    else:
        diff += 1
        for r in rs:
            by_reason_same[r][1] += 1
        # what changed
        ms, ss = ent_sig(model), ent_sig(saved)
        mp = {x[0] for x in ms}; sp = {x[0] for x in ss}
        mf = {x[1] for x in ms}; sf = {x[1] for x in ss}
        mi = sorted(i for x in ms for i in x[2]); si = sorted(i for x in ss for i in x[2])
        if mp != sp: changed_fields["property"] += 1
        if mf != sf: changed_fields["paid_from"] += 1
        if mi != si: changed_fields["items/amounts/accounts"] += 1
print(f"  saved as proposed: {same}   changed: {diff}   (no saved copy kept: {nosave})")
print("  what changed when changed:", dict(changed_fields))
print("  by gate reason: saved-unchanged / changed")
for r, (a, b) in sorted(by_reason_same.items(), key=lambda kv: -(kv[1][0] + kv[1][1])):
    print(f"    {r:22s} {a:3d} / {b:3d}")
print()

# PAYER_UNKNOWN: what did Paul pick, by vendor
print("== PAYER_UNKNOWN: what Paul picked (vendor -> paid_from) ==")
pu = collections.defaultdict(collections.Counter)
for e in receipts:
    rs = set(head(r) for r in ((e.get("gate") or {}).get("reasons") or []))
    if "PAYER_UNKNOWN" not in rs or outcome(e) != "posted by Paul":
        continue
    saved = (e.get("result") or {}).get("entries") or []
    v = (e.get("model") or {}).get("vendor")
    for en in saved:
        pu[v][en.get("paid_from")] += 1
for v, c in sorted(pu.items(), key=lambda kv: -sum(kv[1].values())):
    print(f"  {v}: {dict(c)}")
print()

print("== BAD_PROPERTY / property empty: what Paul picked (vendor, channel -> property) ==")
bp = collections.defaultdict(collections.Counter)
for e in receipts:
    rs = set(head(r) for r in ((e.get("gate") or {}).get("reasons") or []))
    if "BAD_PROPERTY" not in rs or outcome(e) != "posted by Paul":
        continue
    saved = (e.get("result") or {}).get("entries") or []
    v = (e.get("model") or {}).get("vendor")
    for en in saved:
        bp[(v, e.get("channel"))][en.get("property")] += 1
for k, c in sorted(bp.items(), key=lambda kv: -sum(kv[1].values())):
    print(f"  {k}: {dict(c)}")
print()

# OVER_CEILING: amounts
print("== OVER_CEILING cards: totals and outcome ==")
for e in sorted(receipts, key=lambda e: -abs(int((e.get("model") or {}).get("receipt_total_cents") or 0))):
    rs = set(head(r) for r in ((e.get("gate") or {}).get("reasons") or []))
    if "OVER_CEILING" not in rs:
        continue
    m = e.get("model") or {}
    only = rs - {"OVER_CEILING", "NOT_POST_VERDICT", "LOW_CONFIDENCE"}
    print(f"  {m.get('date')} {str(m.get('vendor'))[:28]:28s} {int(m.get('receipt_total_cents') or 0)/100:10.2f} conf={m.get('confidence')} other={sorted(only) or '-'} -> {outcome(e)}")
print()

# pending now
print("== PENDING NOW (receipts) ==")
pend = [e for e in receipts if e.get("status") == "pending"]
ages = []
for e in sorted(pend, key=lambda e: str(e.get("receivedAt"))):
    m = e.get("model") or {}
    rs = [head(r) for r in ((e.get("gate") or {}).get("reasons") or [])]
    r = pdate(e.get("receivedAt"))
    age = (TODAY - r).days if r else None
    ages.append(age or 0)
    print(f"  {str(e.get('receivedAt'))[:10]} age={age:3}d {str(m.get('vendor'))[:26]:26s} {int(m.get('receipt_total_cents') or 0)/100:9.2f} {m.get('verdict')}/{m.get('confidence')} {'+'.join(r for r in rs if r not in ('NOT_POST_VERDICT',))[:60]} ch={e.get('channel')}")
print(f"  count={len(pend)} median age={statistics.median(ages) if ages else 0}d")
print()

# errors
print("== ERROR envelopes ==")
for e in receipts:
    if e.get("status") == "error":
        print(f"  {str(e.get('receivedAt'))[:10]} {e.get('docId')} retries={e.get('retries')} {str(e.get('error'))[:140]}")
print()

# reprocess
rp = sum(1 for e in receipts if "[reprocess" in str((e.get("model") or {}).get("why", "")))
print(f"reprocessed cards (why carries [reprocess): {rp}")
rt = collections.Counter(e.get("retries") for e in receipts if e.get("retries"))
print(f"retries present: {dict(rt)}")
print()

# usage
print("== MODEL USAGE per receipt read ==")
turns, inp, outp, cache_r, cache_w = [], [], [], [], []
for e in receipts:
    u = (e.get("model") or {}).get("usage") or {}
    if not u:
        continue
    turns.append(u.get("turns") or 0)
    inp.append(u.get("input_tokens") or 0)
    outp.append(u.get("output_tokens") or 0)
    cache_r.append(u.get("cache_read_input_tokens") or 0)
    cache_w.append(u.get("cache_creation_input_tokens") or 0)
if turns:
    n = len(turns)
    print(f"  reads with usage: {n}")
    print(f"  turns: median {statistics.median(turns)}, max {max(turns)}, >=15: {sum(1 for t in turns if t >= 15)}")
    print(f"  per read: input(uncached) median {statistics.median(inp):,.0f}  cache_read median {statistics.median(cache_r):,.0f}  cache_write median {statistics.median(cache_w):,.0f}  output median {statistics.median(outp):,.0f}")
    print(f"  totals: input {sum(inp):,}  cache_read {sum(cache_r):,}  cache_write {sum(cache_w):,}  output {sum(outp):,}")
print()

# latency
print("== LATENCY receivedAt -> finishedAt (receipts, minutes) ==")
lat = []
for e in receipts:
    a, b = pdate(e.get("receivedAt")), pdate(e.get("finishedAt"))
    if a and b and b > a:
        lat.append((b - a).total_seconds() / 60)
if lat:
    print(f"  n={len(lat)} median {statistics.median(lat):.0f} min, p90 {sorted(lat)[int(len(lat)*0.9)]:.0f} min")
print()

# tool use from transcript
print("== TOOL CALLS per read (from transcript_summary) ==")
tc = collections.Counter()
reads = 0
for e in receipts:
    ts = (e.get("model") or {}).get("transcript_summary") or ""
    if not ts:
        continue
    reads += 1
    for name in ("zoom", "read_ledger", "find_vendor", "list_properties", "search_docs", "web_search", "fallback"):
        tc[name] += ts.count(f": {name}(") if name != "fallback" else ts.count("fallback")
for k, v in tc.most_common():
    print(f"  {k}: {v} calls over {reads} reads ({v/reads:.1f}/read)")
print()

# FEED cards
print("== BANK-LINE CARDS (source feed) ==")
fo = collections.Counter()
for e in feeds:
    rv = e.get("review") or {}
    fo[(e.get("status"), rv.get("action") or "", rv.get("by") or "")] += 1
for k, v in fo.most_common():
    print(f"  {v:4d}  status={k[0]} review={k[1]} by={k[2]}")
print("  pending feed cards now:")
for e in sorted(feeds, key=lambda e: str(e.get("receivedAt"))):
    if e.get("status") != "pending":
        continue
    m = e.get("model") or {}
    f = e.get("feed") or {}
    print(f"    {str(e.get('receivedAt'))[:10]} {str(m.get('vendor'))[:30]:30s} {int(f.get('amount_cents') or 0)/100:10.2f} card={(f.get('card') or {}).get('holder','-')} entries={len(m.get('entries') or [])} why={str(m.get('why'))[:70]}")
print("  decided feed cards: how")
for e in feeds:
    if e.get("status") == "pending":
        continue
    m = e.get("model") or {}
    rv = e.get("review") or {}
    print(f"    {str(e.get('receivedAt'))[:10]} {str(m.get('vendor'))[:30]:30s} {int((e.get('feed') or {}).get('amount_cents') or 0)/100:10.2f} -> {e.get('status')}/{rv.get('action')} by={rv.get('by')} note={str(rv.get('note'))[:50]}")

# Agent A #2: posted-on-own receipts whose items sum differs from the receipt total (tolerance posts)
print()
print("== TOLERANCE POSTS: posted receipts where sum(items) != receipt_total (would not tie to the bank to the cent) ==")
n = off = 0
for e in receipts:
    if e.get("status") != "posted":
        continue
    m = e.get("model") or {}
    ents = (e.get("result") or {}).get("entries") or m.get("entries") or []
    tot = int(m.get("receipt_total_cents") or 0)
    s = sum(int(i.get("amount_cents") or 0) for en in ents for i in (en.get("items") or []))
    if not ents or not tot:
        continue
    n += 1
    if s != tot and not (m.get("already_posted_txn_ids")):
        off += 1
        print(f"  {m.get('date')} {str(m.get('vendor'))[:28]:28s} total={tot/100:.2f} items={s/100:.2f} diff={(s-tot)/100:+.2f} {outcome(e)}")
print(f"  checked {n} posted receipts, {off} differ")
```
