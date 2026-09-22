# Cutover day runbook (D-013, D-025) - written 2026-09-21; **steps 1-12 done 2026-09-21 (audit §51)**, step 16's old-poller part done 2026-09-22 (§52)

One step at a time with Paul. **P** = Paul acts (one step, then wait). **C** = Claude, no permission needed.
**P!** = production: Paul says go first. Every step has its check; nothing moves on a failed check.
Ids are in `docs/phase0-spec.md` §10 and `CLAUDE.md`.

## 0 · Before the day (all must be true)

- [x] Drive filing finished (2026-09-21, audit §49): `node scripts/migration-file-docs.mjs --dry` shows 0 to file; every key in
      `drive-filing.json` has a `url` (missing ones recovered by exact-name lookup in Drive, audit §46).
- [x] The two pvb421@ orders forwarded by Paul, read and filed (audit §48-§49).
- [x] Final staging pass (11) tied out on both paths with the Drive links (`scripts/migration-journal-tieout.py`
      exit 0; `migration-audit-indep.py` residuals = register lines) and recorded in `rows/journal-tieout.json`.
- [x] **Rehearsed in staging 2026-09-21 (audit §50):** `migrationRegisterAdvances` - 7 min 34 s (about 11 s an
      advance, then one rebuild per property; fine under Workspace's 30-minute limit - do not interrupt it). After
      it: 33 advances, none orphaned, account 1000 = $1,863,647.50, the 1,048 entries untouched, tie-out exit 0.
- [ ] `npx clasp login` fresh that morning (P - it expires every few days).
- [ ] Repo committed; `npm test` green; `node scripts/build-gs.mjs` leaves `lib.gs` unchanged.

Not needed any more: Newport's settlement date (under contract, not closed - audit §47).

## 1 · Freeze and back up

1. ~~**P**~~ ✓ - stop typing in the old workbook; do not forward receipts until step 6 says so.
2. ~~**P**~~ ✓ - old workbook: File → Download → .xlsx. **C** diffs it against
   `data/migration/2026-09-17/old-workbook-snapshot.xlsx` with `migration-audit-indep.py` on both. Every row
   typed since 09-17 is a **delta**: appended to the inventory (never inserted), pipeline rerun, links diffed
   against the last commit, staging Run + tie-out again. No delta → carry on.
3. ~~**P**~~ ✓ - production workbook "Recast Books": File → Make a copy → "Recast Books BACKUP <date>".
   Check: **C** finds the copy in Drive (read-only search).

## 2 · Production writer (P!)

4. ~~**C**~~ ✓, on Paul's go: copy `apps-script/writer/*.gs, *.html, appsscript.json` + `rows/MigrationData.gs` to a
   scratch folder whose `.clasp.json` has the PRODUCTION scriptId (`1_V01CW…kl_y`); `clasp push -f`;
   `clasp pull` into a second scratch folder and `cmp` every file. Carries the 09-18 formula fix, `postBatch
   skipRefresh`, `migrationPostRows`, Cost Recapture, the Inbox list - none of it is in production yet.
5. ~~**C**~~ ✓ - `clasp deploy -i AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w`
   (doPost changed). Check: deployment list shows a new version on the same id.

## 3 · The pass, in the production editor (P!, one Run each)

6. ~~**P**~~ ✓ - Script property `CLEAR_CONFIRM` = the production workbook id (`12QVyxm3…BxKM`), then Run
   `clearBooks`. Check in the log: `CLEARED Journal: N row(s) … "Recast Books"`. (It removes the PHASE 0/1
   gate entries and the 09-11…09-17 live posts - all of those are in the migration or settled, see §5.)
7. ~~**P**~~ ✓ - Run `migrationRegisterProperties`. Check: the 11 migration rows are on Properties (the
   `TEST Phase 1 gate` row and its voided Advances row are Paul's to delete by hand first - `clearBooks`
   only clears the Journal).
8. ~~**P**~~ ✓ - Run `migrationRegisterAdvances` (about 8 minutes - let it finish). Check: 33 lines `-> adv-manual-…`,
   none FAILED.
9. ~~**P**~~ ✓ - Run `migrationPostRows`; if the log ends "run again", run it again until `left=0`.
   (`migrationRunStaging` refuses a workbook not named STAGING - by design.)

## 4 · Point the site at production, then tie out (P!)

The tie-out reads `books-cache`, which is filled through `WRITER_URL` - so the flip comes BEFORE the tie-out,
not at the end as the 09-21 handoff listed it.

10. ~~**P**~~ ✓ - `npx netlify-cli env:set WRITER_URL <production /exec URL> --context production`, then
    `npm run deploy`. `WRITER_SECRET` / `DOCS_ROOT_FOLDER_ID`: confirm the production project's Script
    properties hold the same secret Netlify has (else the site gets UNAUTHORIZED).
    Check: `env:get WRITER_URL --context production` contains `AKfycbxNisU`.
11. ~~**C**~~ ✓ - wait for a fresh snapshot (`fetchedAt` after step 9), then
    `python3 scripts/migration-journal-tieout.py <tabs> data/migration/2026-09-17/rows` → exit 0: 1,048
    entries (plus any delta), $0.00 on every property, ids / amounts / dates / payees / accounts / links
    identical, debits = credits, 33 advances, no orphans. Then the independent path. Record both.
12. ~~**C**~~ ✓ - push the production project again WITHOUT `MigrationData.gs` and verify by pull (it is never
    kept in a project after its pass).

## 5 · Live receipts

Measured 2026-09-21: of the 25 documents received 09-11 … 09-17 that were posted or pending, **every one is
already in the migration (old row, docId linked) or recorded in `mail_settled`** - the old books carried
them. Nothing from that window is replayed. What is replayed is only what Paul held back:

13. **P** - forward the held receipts to receipts@ / the property addresses (known: Mesa Central States
    $49.54 of 09-18, the HILCO bill) - they flow through the live bookkeeper into production.
14. **C** - check each against the Journal for a twin (amount within two cents, ±3 days) before Paul
    approves it in Recast Books → Inbox.
15. ✅ 2026-09-22 (audit §55: 387 dismissed, 18 left on purpose). The `pending` history envelopes in the Inbox (several hundred, from the 09-17 reads) are migration leftovers: **C** lists them, Paul agrees,
    they are dismissed in bulk (their rows are in the Journal through the migration).

## 6 · Close the old books

16. ✅ 2026-09-22 (audit §57; only paul@ had access; renamed by Claude through Drive). **P** - old workbook: Share → everyone Viewer; rename "… CLOSED 2026-MM-DD". The old receipts poller
    (`../Recast-site/`) is switched off by the session that owns it, not from here.
17. **P**, optional - drag `2026/` and `Migration evidence/` from the "Recast Books STAGING" Drive folder
    into "Recast Books". File links survive a move; the Journal is untouched.
18. ✅ 2026-09-22 (audit §55-§57; staging renamed ARCHIVED). **C** - CLAUDE.md status, CHANGELOG, audit §, handoff; staging workbook renamed ARCHIVED (P).

## If something fails

- Before step 6: nothing in production has changed - stop, fix, rehearse in staging.
- Steps 6-9: `clearBooks` again (`CLEAR_CONFIRM` again) and rerun; the pass is resumable and idempotent.
  The backup of step 3 is the way back to the pre-cutover workbook.
- Step 10-11 tie-out fails: set `WRITER_URL` back to staging, `npm run deploy`, diagnose from the snapshot.
  Never correct in place (D-025.2).
