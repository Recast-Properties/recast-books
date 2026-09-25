#!/usr/bin/env node
// Sets one envelope's status by hand when the API cannot: the entry is on the Journal but
// the envelope says error/dismissed (a doGet misfire after the write landed), or an entry
// was voided by hand and its envelope still says posted. Same store access as
// inbox-leftovers.mjs (the Netlify CLI's login). Paul runs it from this folder:
//
//   node scripts/mark-envelope.mjs <docId> posted --txn <txn_id> --doc <drive url> --note "<why>"
//   node scripts/mark-envelope.mjs <docId> dismissed --note "<why>"
//
// Nothing else on the envelope changes; the previous status and the note go in `review`.
import { getStore } from "@netlify/blobs";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const [docId, status, ...rest] = process.argv.slice(2);
const opt = (name) => { const i = rest.indexOf(`--${name}`); return i < 0 ? "" : rest[i + 1] || ""; };
if (!docId || !["posted", "dismissed"].includes(status) || !opt("note")) {
  console.error("usage: mark-envelope.mjs <docId> posted|dismissed [--txn <txn_id>] [--doc <url>] --note <why>");
  process.exit(2);
}
if (status === "posted" && !opt("txn")) { console.error("posted needs --txn"); process.exit(2); }

const cli = JSON.parse(readFileSync(`${homedir()}/Library/Preferences/netlify/config.json`, "utf8"));
const token = Object.values(cli.users)[0].auth.token;
const siteID = JSON.parse(readFileSync(".netlify/state.json", "utf8")).siteId;
const store = getStore({ name: "books-docs", siteID, token, consistency: "strong" });

const key = `doc/${docId}`;
const env = await store.get(key, { type: "json" });
if (!env) { console.error(`no envelope ${key}`); process.exit(1); }

const model = { ...(env.model || {}) };
if (status === "posted") { model.duplicate_of = ""; model.why = String(model.why || "").split(" [rail:")[0]; }
const patched = {
  ...env,
  status,
  model,
  error: "",
  error_stack: "",
  gate: status === "posted" ? { passed: true, reasons: [] } : env.gate,
  result: status === "posted"
    ? { txn_ids: [opt("txn")], rows: null, doc_url: opt("doc") || (env.result && env.result.doc_url) || "" }
    : { txn_ids: [], rows: null, doc_url: (env.result && env.result.doc_url) || "" },
  review: { action: "mark-by-hand", by: "paul", at: new Date().toISOString(), was: env.status, note: opt("note") },
};
await store.setJSON(key, patched);
console.log(`${docId}: ${env.status} -> ${status}${status === "posted" ? " " + opt("txn") : ""}`);
