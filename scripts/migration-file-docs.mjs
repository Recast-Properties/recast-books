#!/usr/bin/env node
// Phase 4 item 7 (audit §21, §45): every migration entry's document goes to Drive, because a
// Gmail link does not open across accounts. Reuses the live path: bytes from the books-docs
// store (att/<docId>/<i>, base64 text), the writer's storeDocument, driveFileName, [year, property].
// Every document also gets its email as a .txt (subject, sender, Paul's note above a forward -
// for body-only notes and cash labor that text IS the document). evidence/ is filed whole.
//
// Resumable: docId -> Drive URL is saved to data/migration/2026-09-17/drive-filing.json after
// every document; a key already there is skipped. migration-rows.py reads that file.
//
//   node scripts/migration-file-docs.mjs [--dry] [--limit N]
//
// WRITER_URL comes from Netlify's production context (staging until cutover). WRITER_SECRET is masked
// on Netlify - the CLI will not return it - so Paul supplies it in his own Terminal:
//   read -s "WRITER_SECRET?Writer secret: " && export WRITER_SECRET && node scripts/migration-file-docs.mjs
// (the value is Script property WRITER_SECRET of the staging project). A document that fails is
// logged and left for the next run.
// ponytail: sequential, ~3 s a file (~35 min in all); a crash mid-document re-files that one
// document's earlier attachments on the next run (a duplicate file in Drive, never a wrong link).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createWriter } from "../lib/writer-client.mjs";
import { driveFileName } from "../netlify/functions/_shared.mjs";

const INV = "data/migration/2026-09-17";
const MAP = path.join(INV, "drive-filing.json");
const ENV_DIR = ".cache/envelopes/env";
const STAGING = "AKfycbzXcpuGfFbKWCFXMLYbgsJVBYKj4DkOapjroT02IN2NMh";   // phase0-spec §10
const MIME = { ".webp": "image/webp", ".png": "image/png", ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/plain" };

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const cli = (...a) => execFileSync("npx", ["netlify-cli", ...a], { encoding: "utf8", maxBuffer: 1 << 27, stdio: ["ignore", "pipe", "ignore"] }).trim();

const entries = JSON.parse(readFileSync(path.join(INV, "rows/entries.json"), "utf8")).filter((e) => !e.skip);
const byDoc = new Map();
for (const e of entries) if (e.link_kind === "gmail") byDoc.set(e.docId, [...(byDoc.get(e.docId) || []), e]);
const filed = existsSync(MAP) ? JSON.parse(readFileSync(MAP, "utf8")) : {};
const todo = [...byDoc.keys()].sort().filter((d) => !filed[d]);
const unread = todo.filter((d) => !existsSync(path.join(ENV_DIR, d + ".json")));
const evidence = readdirSync(path.join(INV, "evidence")).filter((f) => !filed["EVIDENCE:" + f]);
console.log(`${byDoc.size} Gmail-linked documents: ${byDoc.size - todo.length} filed, ${todo.length - unread.length} to file, ${unread.length} never read (no bytes stored); evidence files to file: ${evidence.length}`);
if (unread.length) console.log("never read: " + unread.join(" "));
if (dry) process.exit(0);

const url = process.env.WRITER_URL || cli("env:get", "WRITER_URL", "--context", "production");
if (!url.includes(STAGING) && !args.includes("--production")) throw new Error("WRITER_URL is not the staging writer; pass --production on cutover day only");
if (!process.env.WRITER_SECRET) throw new Error("WRITER_SECRET is not set - see the header of this script");
const writer = createWriter({ url, secret: process.env.WRITER_SECRET });
await writer.ping();   // a wrong secret stops here, before anything is filed
const save = () => writeFileSync(MAP, JSON.stringify(filed, null, 1) + "\n");

let n = 0, failed = 0;
for (const f of evidence) {
  if (n >= limit) break;
  const ext = path.extname(f).toLowerCase();
  const s = await writer.storeDocument(f, MIME[ext] || "application/octet-stream", readFileSync(path.join(INV, "evidence", f)).toString("base64"), ["Migration evidence"]);
  filed["EVIDENCE:" + f] = { url: s.url, folder: "Migration evidence", files: [{ name: f, url: s.url, fileId: s.fileId }] };
  save(); n++; console.log(`evidence ${f}`);
}

for (const docId of todo) {
  if (n >= limit) break;
  if (unread.includes(docId)) continue;
  try {
  const env = JSON.parse(readFileSync(path.join(ENV_DIR, docId + ".json"), "utf8"));
  const rows = byDoc.get(docId).sort((a, b) => a.txn_id.localeCompare(b.txn_id));
  const folder = [rows[0].date.slice(0, 4), rows[0].property];
  const m = env.model || {};
  const model = m.date && m.vendor && Number.isFinite(Number(m.receipt_total_cents)) ? m
    : { date: rows[0].date, vendor: rows[0].payee, receipt_total_cents: rows.reduce((t, e) => t + e.amount_cents, 0) };
  const files = [];
  const atts = env.attachments || [];
  for (let i = 0; i < atts.length; i++) {
    const base64 = cli("blobs:get", "books-docs", atts[i].key || `att/${docId}/${i}`);
    if (!base64) { console.log(`  ${docId} attachment ${i} has no bytes in the store`); continue; }
    const name = driveFileName(model, atts[i].name || `attachment-${i}`, i);
    const s = await writer.storeDocument(name, atts[i].mime || "application/octet-stream", base64, folder);
    files.push({ name, url: s.url, fileId: s.fileId });
  }
  const text = [`Subject: ${env.subject || ""}`, `From: ${env.from || ""}`, `Received: ${env.receivedAt || ""}`, `Mailbox: ${env.channel || ""}`,
    `Gmail: ${env.gmailUrl || ""}`, `Books: ${rows.map((e) => e.txn_id).join(", ")}`, "", env.bodyText || ""].join("\n");
  const name = driveFileName(model, "email.txt", atts.length);
  const s = await writer.storeDocument(name, "text/plain", Buffer.from(text, "utf8").toString("base64"), folder);
  files.push({ name, url: s.url, fileId: s.fileId });
  filed[docId] = { url: files[0].url, folder: folder.join("/"), files };
  save(); n++; console.log(`${n} ${docId} ${folder.join("/")} ${files.length} file(s)`);
  } catch (err) { failed++; console.log(`  FAILED ${docId}: ${err.code || ""} ${err.message} - run again to retry`); }
}
console.log(`done: ${Object.keys(filed).length} keys in ${MAP}; ${failed} failed`);
process.exit(failed ? 1 : 0);
