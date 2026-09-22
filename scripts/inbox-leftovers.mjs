#!/usr/bin/env node
// Lists the Inbox's migration leftovers (cutover runbook step 15, audit §55): envelopes still
// `pending` from the 09-17/18 migration reads whose cost is already settled - the row is in the
// Journal through the migration, or a recorded decision covers the document.
//
//   node scripts/inbox-leftovers.mjs             prints the groups + writes $LEFTOVERS_OUT (default /tmp/leftovers.json)
//   POLLER_SECRET=… node scripts/inbox-leftovers.mjs --dismiss    dismisses the list via /api/inbox
//
// Reads books-docs straight through @netlify/blobs with the Netlify CLI's login (the CLI does the
// same one blob at a time). The dismiss is the only write and needs the poller secret (masked on
// Netlify): read -s "POLLER_SECRET?Poller secret: " && export POLLER_SECRET && node scripts/inbox-leftovers.mjs --dismiss
import { getStore } from "@netlify/blobs";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";

const CUTOFF = "2026-09-17"; // received on/after this day = live mail, never touched (except AFTER_CUTOFF below)
const SITE = "https://books.recast-properties.com";
const OUT = process.env.LEFTOVERS_OUT || "/tmp/leftovers.json";
const MIG = "data/migration/2026-09-17";
const NOTE = "Migration leftover (audit §55): already settled by the 2026-09-21 migration - ";

// Documents received after the cutoff that belong to the migration anyway: the pvb421 Amazon orders
// Paul forwarded on 09-21 so they could be filed; their rows are on the Ashburne tab (audit §51 step 1).
const AFTER_CUTOFF = new Set(["gm-1a0c5a14c5d12e1e", "gm-1a0c5a197b578924"]);
// Explained by hand (audit §55): the same order as a linked document, or a rule of Paul's.
const BY_HAND = {
  "gm-19d02f1149cf34d6": "Flexitions order #8246 - the row of 03-18 $653.34 is linked to the other copy",
  "gm-19c76792ce5e1fe9": "Lowe's 02-19 $1,478.59 - its four rows are linked to the other copy (gm-19c9b3740b0…)",
  "gm-19f57221a343c4d6": "Garcia Home Repair $1,000 - Paul 2026-09-18 (audit §16): an error, never posted",
  "gm-19f57268c36be87a": "Garcia Home Repair $1,200 - Paul 2026-09-18 (audit §16): an error, never posted",
};

const cli = JSON.parse(readFileSync(`${homedir()}/Library/Preferences/netlify/config.json`, "utf8"));
const token = Object.values(cli.users)[0].auth.token;
const siteID = JSON.parse(readFileSync(".netlify/state.json", "utf8")).siteId;
const store = getStore({ name: "books-docs", siteID, token, consistency: "strong" });

const entries = JSON.parse(readFileSync(`${MIG}/rows/entries.json`, "utf8"));
const answers = JSON.parse(readFileSync(`${MIG}/paul-answers.json`, "utf8"));
const inJournal = new Map(entries.filter((e) => e.docId).map((e) => [e.docId, e]));
const settled = new Map();
for (const [list, v] of Object.entries(answers)) if (Array.isArray(v)) for (const x of v) if (x.docId && !settled.has(x.docId)) settled.set(x.docId, `${list}: ${x.why || x.row || ""}`);
const twins = new Map(); // docId -> the twin the comparison named (comparison/B-by-match.csv "twin of <id>")
for (const line of readFileSync(`${MIG}/comparison/B-by-match.csv`, "utf8").split("\n").slice(1)) {
  const m = line.match(/^(gm-[0-9a-f]+|dry-gm-[0-9a-f]+|receipt-[^,]+),.*?,twin of ((?:dry-)?gm-[0-9a-f]+|receipt-[^,]+)/);
  if (m) twins.set(m[1], m[2]);
}

const keys = [];
for await (const { blobs } of store.list({ prefix: "doc/", paginate: true })) keys.push(...blobs.map((b) => b.key));
const envs = [];
for (let i = 0; i < keys.length; i += 50) envs.push(...(await Promise.all(keys.slice(i, i + 50).map((k) => store.get(k, { type: "json" })))));
const pending = envs.filter((e) => e && e.status === "pending");

function explain(e) {
  const d = e.docId;
  if (inJournal.has(d)) { const r = inJournal.get(d); return ["journal", `${r.skip ? "its row was dropped by Paul (" + r.skip.slice(0, 40) + ")" : "its row is in the Journal"}: ${r.txn_id} ${r.date} ${r.payee} $${(r.amount_cents / 100).toFixed(2)}`]; }
  if (settled.has(d)) return ["settled", `recorded decision - ${settled.get(d).slice(0, 160)}`];
  if (BY_HAND[d]) return ["by-hand", BY_HAND[d]];
  const t = twins.get(d);
  if (t && (inJournal.has(t) || settled.has(t))) return ["twin", `a second copy of ${t}, which ${inJournal.has(t) ? "carries the Journal link" : "has a recorded decision"}`];
  if (e.model?.verdict === "dismiss") return ["model-dismiss", `the bookkeeper's read was "dismiss", held only for confidence: ${(e.model.why || "").slice(0, 120)}`];
  return [null, ""];
}
const groups = { journal: [], settled: [], twin: [], "by-hand": [], "model-dismiss": [] };
const parked = [], live = [];
for (const e of pending) {
  const received = e.receivedAt || e.startedAt || "";
  const brief = { docId: e.docId, receivedAt: received.slice(0, 10), subject: (e.subject || "").slice(0, 60), channel: e.channel, vendor: e.model?.vendor, total: e.model?.receipt_total_cents == null ? "" : (e.model.receipt_total_cents / 100).toFixed(2) };
  if (received >= CUTOFF && !AFTER_CUTOFF.has(e.docId)) { live.push(brief); continue; }
  const [g, why] = explain(e);
  if (g) groups[g].push({ ...brief, why }); else parked.push(brief);
}
const leftovers = Object.values(groups).flat();
console.log(`envelopes ${envs.length}, pending ${pending.length}: leftovers ${leftovers.length} (` +
  Object.entries(groups).map(([k, v]) => `${k} ${v.length}`).join(", ") + `), parked ${parked.length}, live ${live.length}`);
console.log("PARKED (stay pending):", parked.map((p) => `${p.receivedAt} ${p.vendor} $${p.total}`).join(" | "));
console.log("LIVE (untouched):", live.map((p) => `${p.receivedAt} ${p.subject}`).join(" | "));
writeFileSync(OUT, JSON.stringify({ groups, parked, live }, null, 1));
console.log("written", OUT);

if (process.argv.includes("--dismiss")) {
  if (!process.env.POLLER_SECRET) throw new Error("POLLER_SECRET is not set - see the header of this script");
  const H = { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET };
  let ok = 0, bad = 0;
  for (const e of leftovers) {
    const r = await fetch(`${SITE}/api/inbox`, { method: "POST", headers: H, body: JSON.stringify({ action: "dismiss", docId: e.docId, note: NOTE + e.why }) });
    if (r.ok) ok++; else { bad++; console.log("FAILED", e.docId, r.status, await r.text()); }
  }
  console.log(`dismissed ${ok}, failed ${bad}`);
}
