# Phase 2 — technical contract: the receipts bookkeeper

Extends phase0/phase1 specs (still binding). Read `BUILD-PLAN.md` §3 and §6, `docs/policies.md`
(autofile gate, what never gets automated), `docs/decisions.md` D-003, D-010, D-011, and
`../Recast-site/RECEIPTS.md` + `../Recast-site/netlify/functions/receipts-ingest-background.mjs`
+ `../Recast-site/apps-script/receipts-poller.gs` **read-only** — they are the proven
reference for the tool-directed read, the Gmail poller, the Blobs upload path, and the
duplicate failure modes. Nothing under `../Recast-site/` is modified, ever.

**Claude is the bookkeeper (D-003, `claude-judgment-not-scripts`).** The model reads
the document with tools, decides what it is, where it posts, and whether it is a
duplicate. Code owns: arithmetic, the balanced entry, `txn_id` identity, the autofile
gate, the Drive filing, and the writer. Every verdict the model can reach has a verb
downstream (post / hold / dismiss / supersede), and a deterministic rail never holds a
document while ignoring a fact the system already has.

**Parallel run.** The old receipts bookkeeper keeps running untouched. This one reads the
same Gmail messages, tags them with its own label `books-done` (never touching
`receipts-done`), and writes only to the new workbook. Both file the same receipts to
their own books until Phase 6.

**Dependencies now allowed:** `@anthropic-ai/sdk`, `@netlify/blobs`, `jimp` (installed).
Nothing else.

---

## 1 · Documents and storage

Netlify Blobs store **`books-docs`** (strong consistency for writes that gate posting):

- `doc/<docId>` — envelope. `docId` = `gm-<gmailMessageId>` for email, `up-<uuid>` for web
  uploads, prefix `dry-` added in front for dry runs (`dry-gm-...`).
- `att/<docId>/<i>` — attachment bytes (image or PDF), ≤ 6 MB each.

```js
envelope = {
  docId, source: "email"|"upload", channel: "receipts"|"travel"|"upload", dryRun: bool,
  gmailUrl, subject, from, receivedAt, bodyText,            // email fields ("" for uploads)
  attachments: [{ key, name, mime, bytes, width?, height? }],
  status: "processing"|"posted"|"pending"|"dismissed"|"error"|"dry",
  startedAt, finishedAt, error,
  model: {                                                  // what Claude concluded
    verdict: "post"|"hold"|"dismiss", confidence: "high"|"medium"|"low", why,
    document_type: "receipt"|"invoice"|"statement"|"other", vendor, date,
    receipt_total_cents, subtotal_cents, tax_cents, paid_from, paid_from_reason,
    entries: [ proposedEntry ], duplicate_of: docId|txn_id|"",
    tools_used: [...], usage: { input_tokens, output_tokens, cache_read_input_tokens }, turns
  },
  gate: { passed: bool, reasons: [...] },                   // deterministic verdict
  result: { txn_ids: [...], rows, doc_url },                // after posting
  review: { action, by, at, note }                          // human verbs
}
proposedEntry = { date, payee, memo, property, paid_from,
  items: [{ account, amount_cents, description, trade, business_purpose }] }
```

`amount_cents` on an item is what was paid for that item **including its share of tax**;
the entry total equals the receipt total. One entry per property; a receipt spanning two
properties is two entries; overhead items are their own entry with `property: "OVERHEAD"`.

## 2 · Posting engine addition — `purchase` intent (`lib/posting.mjs`)

```js
buildEntry({ type:"purchase", date, payee, memo, property, paid_from, items:[{account, amount_cents, description, trade, business_purpose}], doc_url, source:"receipt", posted_by, allow_duplicate_hash }, ctx)
```
→ one debit line per item (property from the intent on every line, `payee` on every
line), one credit line for the paying side resolved exactly as `expense` does (14xx /
PAUL→2030 / DENNIS→2010). All Phase 0 rules apply (OVERHEAD_ON_PROPERTY, PROPERTY_REQUIRED,
PURPOSE_REQUIRED, …). `txn_id` hashes the first debit line as before, so an identical
receipt re-ingested collides and the writer refuses it.

## 3 · The director — `lib/bookkeeper.mjs`

Model **`claude-opus-5`**, `thinking: {type:"adaptive"}`, `output_config: {effort:"high"}`,
`max_tokens: 8000` per turn, manual tool loop (`stop_reason === "tool_use"` → execute all
tool_use blocks → return all `tool_result`s in ONE user message), `MAX_TURNS = 24`.
Use `@anthropic-ai/sdk` (`new Anthropic()` — the key comes from `ANTHROPIC_API_KEY`).
Follow the TypeScript/JS shapes in the claude-api skill docs at
`/private/tmp/claude-501/bundled-skills/2.1.266/486172e125b01624b5f245b73e4ba02e/claude-api/typescript/claude-api/README.md`
and `tool-use.md` (read them; do not use `budget_tokens`, prefill, or `output_format`).
`system` and `tools` carry `cache_control: {type:"ephemeral"}` on the last block; the
volatile document goes in `messages`. Parse every `tool_use.input` as an object, never
by string matching. Handle `stop_reason === "refusal"` and `max_tokens` as `hold`.

`runBookkeeper({ envelope, attachments: [{name, mime, bytes}], deps })` → `{ model, messages_summary }`
where `deps = { ledger, vendors, properties, accounts, settings, docs, anthropic }` are
injected so tests run with fakes and no network.

**Client tools** (all `strict: true`, `additionalProperties:false`):

| tool | input | returns |
|---|---|---|
| `zoom` | `{attachment: int, x0,y0,x1,y1: fractions 0–1}` | an `image` block: jimp crop of that attachment, upscaled so the short side ≥ 800 px, long side ≤ 1568 px, JPEG q85 |
| `read_ledger` | `{payee?: string, days?: int (default 60), property?: string}` | compact rows `date · payee · amount · account · property · txn_id · description` from the Journal (via the injected `ledger.recent()`), max 80 rows |
| `find_vendor` | `{query}` | Vendors rows whose canonical or aliases match (case-insensitive, substring) + the 5 most recent Journal payees that match, with their accounts |
| `list_properties` | `{}` | registry rows with status `held` or `under contract` (name, address, purchase_date), plus the literal `OVERHEAD` |
| `search_docs` | `{vendor?: string, amount_cents?: int, days?: int (default 90)}` | prior envelopes' `{docId, status, vendor, date, receipt_total_cents, txn_ids, verdict}` — for twin reasoning |
| `decide` | the terminal call — see below | ends the loop |

**Server tool:** `{type:"web_search_20260209", name:"web_search", max_uses: 5}` for SKU / vendor lookups.

`decide` input (strict):
```
{ verdict: "post"|"hold"|"dismiss", confidence: "high"|"medium"|"low", why: string,
  document_type, vendor: string, date: "YYYY-MM-DD"|"", receipt_total_cents: int,
  subtotal_cents: int|null, tax_cents: int|null,
  paid_from: "14xx"|"PAUL"|"DENNIS"|"", paid_from_reason: string,
  duplicate_of: string, supersedes: string,
  entries: [ proposedEntry ] }
```
- `dismiss` + `duplicate_of` = "this document is already on the books" (a forwarded twin,
  an invoice/receipt pair). Cite the txn_id or docId.
- `supersedes` = "this document is the final version of a posted entry" (tipped ride
  after the base fare). Code voids the old entry and posts the new one.
- `hold` = anything the model is not sure of. `why` must say what a human should check.

**System prompt content** (write it as a file `lib/bookkeeper-prompt.md`, loaded at
module scope; ASCII-safe): who Recast is; the chart of accounts with one line per account
on when to use it (from `docs/chart-of-accounts.md` — rehab materials vs small tools vs
office; holding costs; 6600 fuel/repairs on Dennis's truck; travel PDX↔DFW is business;
[Personal] in a subject is NOT a signal); D-010 overhead never names a property; property
routing (a Home Depot run for a house is a property cost — use `list_properties`, choose
the property the receipt or email names, hold if two properties are plausible); tax
treatment (TX sales tax 8.25% is part of the item cost; shipping/fees are part of the
cost); paid_from rules (card last-4 on the receipt matched to Bank accounts `last4` →
that account; a last-4 in Settings `paul_personal_last4` → PAUL; Dennis paying directly →
DENNIS; otherwise `UNKNOWN` — never a default — and `paid_from_reason` says what was
missing; D-014); the **method** from the
2026-09-09 rework: zoom before deciding a blurry digit; make arithmetic reconcile (items
↔ subtotal ↔ tax ↔ total; gallons × a real x.xx9 price ↔ total); check `read_ledger` and
`search_docs` before any duplicate call; "high" means "because I checked"; say what you
verified in `why`. Travel (6700), meals (6710) and gifts (6720) always need a human, so
draft `business_purpose` from the email but expect `hold` unless the purpose is explicit.

## 4 · The gate — `lib/gate.mjs` (deterministic)

`evaluateGate(model, ctx, settings)` → `{ passed, reasons[] }`. Posts only when **all** hold
(`docs/policies.md` conditions 1–7 plus the property/paid_from checks):

1. `verdict === "post"` and `confidence === "high"`
2. `vendor` and `date` present, date valid and not in the future
3. every entry's items sum to the receipt total across entries (±0.5 % when `subtotal_cents`
   and `tax_cents` are given, exact otherwise)
4. `receipt_total_cents > 0` and `≤ settings.autofile_ceiling_cents`
5. no item account in `{6700, 6710, 6720}`
6. every entry's `property` is `OVERHEAD` or in the registry with status held/under contract
7. `paid_from` resolves (14xx in Bank accounts / Accounts, or PAUL / DENNIS with a property);
   `UNKNOWN` holds with reason `PAYER_UNKNOWN` and Paul assigns the account on approve (D-014)
8. `buildEntry` succeeds for every entry (this also runs D-010/D-011 and PURPOSE_REQUIRED)
9. **twin rail:** no *posted* Journal entry with the same payee, date and total that the
   model did not name in `duplicate_of`/`supersedes` — if one exists → hold with reason
   `POSSIBLE_TWIN <txn_id>` (never silently double-post; never silently drop either)

Failing → status `pending`, reasons kept. `dismiss` with `duplicate_of` → `dismissed`.
`supersedes` naming a posted txn_id → passes the gate like a post; the poster voids the
old entry first (reason `superseded by <docId>`), then posts.

## 5 · Functions (`netlify/functions/`)

- `books-upload.mjs` (`/api/upload`, sync, ≤ 6 MB): auth = session **or** header
  `x-poller-secret` = `POLLER_SECRET`. Body JSON `{docId?, source, channel, gmailUrl, subject,
  from, receivedAt, bodyText, dryRun, attachments:[{name, mime, base64}]}` → writes the
  attachments to `att/<docId>/<i>`, writes a `processing` envelope, and **invokes**
  `books-ingest-background` (fetch to its own URL with the secret) → `{docId}`.
  A repeated `docId` that is already `posted|dismissed|pending` returns `{docId, skipped:true}`
  unless `reprocess: true`.
- `books-ingest-background.mjs` (`/api/ingest-bg`, Netlify **background** function,
  filename must end in `-background`): loads the envelope and bytes, builds `deps` from
  the writer (ledger recent 60 d, vendors, properties, accounts, settings, docs store),
  calls `runBookkeeper`, runs `evaluateGate`, then: post → `buildEntry(purchase)` per entry
  → `writer.postBatch` (all or nothing) → `storeDocument` on the writer (§7) → `doc_url`
  set on… (the entry is already posted; store the Drive URL in `result.doc_url` and pass
  `doc_url` into the entries BEFORE posting: file the document first, then post);
  hold → `pending`; dismiss → `dismissed`; supersede → void + post. `dryRun` → status `dry`,
  `gate` computed, nothing written to the workbook, but the document IS filed in Drive
  under `Recast Books/_dry-runs/`. Any thrown error → status `error` with message; never
  a half-written state: the envelope is rewritten at every transition.
- `books-inbox.mjs` (`/api/inbox`): `GET ?status=pending|posted|dismissed|dry|error|all&limit=`
  → envelopes newest first (no bytes). `POST {action, docId, ...}` (owner):
  `approve {entries?}` — human bypass: posts the (possibly edited) entries with
  `allow_duplicate_hash: true`, `posted_by` = session email, `source: "receipt"`, gate NOT
  applied (the human is the gate), but `buildEntry` rules still apply (D-010 etc.);
  `dismiss {note}`; `reprocess` (re-invokes ingest, `reprocess:true`); `delete` — only for
  `dry` or `error` envelopes (removes the envelope and its bytes).
- `books-file.mjs` (`/api/file?key=att/...`): session-gated; streams the bytes with the
  stored mime; `?thumb=1` returns a jimp-resized 480 px JPEG (PDFs return 404 for thumb).
- `books-summary.mjs` (`/api/summary?date=YYYY-MM-DD`): session or poller secret →
  `{date, posted:[{docId, vendor, total_cents, property, account_summary, txn_ids}],
  pending:[...why], dismissed:[...], errors:[...], totals}` for the digest.

Env vars added: `ANTHROPIC_API_KEY` (Paul sets), `POLLER_SECRET` (Paul sets from the
poller's setup log). `requireConfig` fails closed as before.

## 6 · Poller — `apps-script/poller/` (new project "Recast Books Poller", runs as Paul)

Modelled on `receipts-poller.gs` (read it). `setup()` first: generates `POLLER_SECRET` if
absent (logged once), stores `BOOKS_UPLOAD_URL` (`https://books.recast-properties.com/api/upload`),
`START_DATE` (default today, ISO — messages older than this are never touched in live mode),
creates the Gmail label `books-done`, installs triggers `pollBooks` every 15 min and
`dailyDigest` at 3 AM America/Chicago. Second function `pollBooks()`: Gmail search
`(to:receipts@recast-properties.com OR to:travel@recast-properties.com) after:<START_DATE> -label:books-done`,
up to 20 threads per run; per message: collect attachments (images, PDFs; skip > 6 MB
with a note in `bodyText`; convert HEIC to JPEG is NOT required — pass the bytes, the
ingest converts with jimp if it can, else holds), base64, POST to `/api/upload` with
`x-poller-secret`, channel from the `to:` address, then add the `books-done` label.
`dryRunBatch()`: `DRY_QUERY` script property (default `newer_than:30d`), same path with
`dryRun:true`, does NOT label. `dailyDigest()`: GET `/api/summary?date=<yesterday>` and
`MailApp.sendEmail` to Paul: subject `Books | <weekday date> | $X posted | N to review`,
plain-text body listing each posted item (vendor, amount, account, property), each pending
item with its why, and any errors, plus a link to `/#inbox`. ASCII only. `appsscript.json`
scopes: gmail.modify, script.external_request, script.scriptapp, mail send (`gmail.send`
via MailApp uses `https://www.googleapis.com/auth/script.send_mail`).

## 7 · Writer v0.3.0 — `storeDocument`

New action `{action:"storeDocument", name, mime, base64, folder:[...segments]}` → creates
(once) a root folder **"Recast Books"** in Paul's Drive (id in Script Properties), then the
path segments under it (e.g. `["2026", "881 Newport"]` or `["2026", "OVERHEAD"]` or
`["_dry-runs"]`), saves the file, returns `{ok:true, fileId, url, folderUrl}`. Payload cap:
Apps Script accepts ~50 MB POST; we send ≤ 6 MB. Scope stays `drive.file` (files the
script created). Bump `WRITER_VERSION` to `0.3.0`; lint test updated.

## 8 · Web — Inbox and Upload (`web/`)

- Nav gains **Inbox** (before Journal) with a pending count badge, and **Upload**.
- **Inbox**: filter tabs Pending / Posted / Dismissed / Dry runs / Errors. Card per document:
  thumbnail(s) (`/api/file?...&thumb=1`; click → full size in a modal, PDF opens in a new
  tab), vendor · date · total · property · paid_from, **Claude's why-note**, gate reasons
  (as chips, e.g. `POSSIBLE_TWIN`, `OVER_CEILING`, `NEEDS_PURPOSE`), and the proposed
  entries as an editable grid (account select, property select, paid_from select, amount,
  description, business_purpose). Verbs: **Approve** (owner; posts as edited), **Dismiss**
  (note), **Reprocess**, **Delete** (dry/error only). "Dismiss all confirmed twins" acts only
  on pending cards whose model verdict was `dismiss` with a `duplicate_of` but the gate
  held them. Posted cards show txn_ids linking to the Journal and the Drive link.
- **Upload**: drop zone / file picker / phone camera (`accept="image/*,application/pdf"`),
  optional property select and note, **Dry run** checkbox; shows the docId and jumps to
  the Inbox card, which polls until the status leaves `processing`.
- Dashboard: "Waiting for review" count and "Posted by the bookkeeper (7 d)" total.

## 9 · Tests

- `test/posting.test.mjs` +: `purchase` intent (multi-item, credit side, property on all lines).
- `test/gate.test.mjs`: every condition in §4 with a passing baseline and one failing variant each; twin rail.
- `test/bookkeeper.test.mjs`: fake Anthropic client that returns scripted tool_use turns
  (zoom → read_ledger → decide); asserts tools executed, all tool_results returned in one
  message, `decide` parsed, `max_tokens`/`refusal` → hold, MAX_TURNS → hold.
- `test/writer-gs-lint.test.mjs` +: storeDocument, version 0.3.0. New `test/poller-gs-lint.test.mjs`: setup first, ASCII, label name, no hardcoded secrets.
- Functions: `books-upload` auth paths (session / secret / neither), skip logic; `books-inbox` approve builds entries with `allow_duplicate_hash`.

## 10 · Gate (what "done" means)

1. `npm test` green.
2. Dry run over the last 30 days of receipts@/travel@ (`dryRunBatch`): every card lands in
   Inbox → Dry runs with a verdict, a why-note and gate reasons; Paul reads them.
   Acceptance: no dry card that "would POST" is a duplicate of something already on the
   old books; Paul agrees with ≥ 90 % of would-post decisions or judges the rest better.
3. One real receipt uploaded from the phone posts end to end: Inbox card → Journal rows →
   Drive file under `Recast Books/2026/<property or OVERHEAD>/` → `doc_url` on the entry.
4. The morning digest arrives.
5. The old receipts bookkeeper's behaviour is unchanged (its `receipts-done` labels and
   its sheet untouched — verified by reading its STATUS and a spot check of RECAST BIZ).

## 11 · Gate progress — 2026-09-12

- ✅ `npm test` green (350).
- ✅ Dry run over 30 days: 25 documents. Would-post (gate PASS): Adobe $34.49 → 6400;
  Anthropic $10.69 ×2 (original + forwarded twin) → 6400; Oregon Registered Agent $84.00 →
  6200 + 6500. Correctly held: Lowe's, Shell, OpenAI (medium confidence), Home Depot refund,
  Klarna screenshot, Rosa's Cafe meal. Correctly dismissed: Uber/Uber Eats promotions,
  Southwest points statement, Uber Eats food orders. Paul reviewed the cards, dismissed
  the points statement and approved the flight by hand, then set the policy in D-012.
- ✅ Live receipts (2026-09-11 mail): Anthropic $10.34 and American Airlines $341.40 posted
  with `paid_from = PAUL` (Visa 9166 on file) → 2030 Due to owner; the forwarded Anthropic
  copy auto-dismissed as a duplicate by invoice number; Southwest statement auto-dismissed.
  Journal shows the corrected re-posts with the earlier Chase-routed versions voided.
- ✅ Phone upload (2026-09-12 09:24 CT): FedEx Office receipt photographed on the Upload page;
  model read it (zoomed the totals band, $12.75, receipt # MRIKN00746832, no duplicate),
  gate PASS, posted `receipt-20260828-473559fae0a0` → Journal rows 32–33 (6500 dr / 1402
  cr, OVERHEAD), Drive file under `Recast Books/2026/OVERHEAD/`, `doc_url` on both lines.
  Card tender was cut off in the photo, so the model used the overhead default 1402 and
  said so in `paid_from_reason`.
- ✅ First 3 AM digest received 2026-09-12 (Paul confirmed).

**Gate passed 2026-09-12.**
- ✅ Old receipts bookkeeper untouched: no file under `../Recast-site/` changed; the poller
  labels only `books-done`.

Known follow-ups (Phase 2 polish, not gate blockers): the writer is slow on cold calls
(10–15 s for a Settings read on 2026-09-12, past the function timeout, so the page saw an
HTML 502 as `BAD_RESPONSE` and boot fell to the sign-in card) — measure the writer's `read`
and cache Settings/Accounts in the function, or warm the script; ~~name filed documents~~
(done 2026-09-12); refunds/credits (negative totals)
need a credit path; success banners persist across pages; `_shared.mjs` is deployed as a
(harmless) function — move it under `netlify/lib/`; Home Depot's debit card 5450 now maps
to 1401 so future property-store receipts route to Citizens.
