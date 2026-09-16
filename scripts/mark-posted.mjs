// Marks a books-docs envelope posted by hand, for the case where the writer posted the
// entry but /api/inbox timed out before writing the envelope (2026-09-16). Run from the
// repo root, Netlify-linked: node scripts/mark-posted.mjs <docId> <txn_id> [doc_url]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const [docId, txnId, docUrl = ""] = process.argv.slice(2);
if (!docId || !txnId) { console.error("usage: node scripts/mark-posted.mjs <docId> <txn_id> [doc_url]"); process.exit(1); }
const key = `doc/${docId}`;
const d = JSON.parse(execFileSync("npx", ["netlify-cli", "blobs:get", "books-docs", key], { encoding: "utf8" }));
if (d.status === "posted") { console.log("already posted"); process.exit(0); }
d.status = "posted";
d.result = { txn_ids: [txnId], rows: null, doc_url: docUrl || d.result?.doc_url || "" };
d.review = { action: "approve", by: "paul@recast-properties.com", at: new Date().toISOString(), note: "marked posted by scripts/mark-posted.mjs after a 504 on approve" };
const tmp = `/tmp/${docId}.json`;
writeFileSync(tmp, JSON.stringify(d));
execFileSync("npx", ["netlify-cli", "blobs:set", "books-docs", key, "--input", tmp], { stdio: "inherit" });
console.log("marked posted:", key, txnId);
