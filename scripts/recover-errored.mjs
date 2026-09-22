#!/usr/bin/env node
// Re-runs documents stuck in `error` after the 2026-09-21 doGet misfire (audit §52).
// A document with a stored read is re-posted from it (repost-all, no model call, $0);
// one with no read is read again (reprocess, ~$0.21). Both go through the gate.
//
//   read -s "POLLER_SECRET?Poller secret: " && export POLLER_SECRET && node scripts/recover-errored.mjs
// (the value is Script property POLLER_SECRET of the Recast Books writer project). Ids come from argv
// or, with none, every doc/* envelope in `error`.
import { execFileSync } from "node:child_process";

const SITE = "https://books.recast-properties.com";
if (!process.env.POLLER_SECRET) throw new Error("POLLER_SECRET is not set - see the header of this script");
const H = { "content-type": "application/json", "x-poller-secret": process.env.POLLER_SECRET };
const cli = (...a) => execFileSync("npx", ["netlify-cli", ...a], { encoding: "utf8", maxBuffer: 1 << 26, stdio: ["ignore", "pipe", "ignore"] });

let ids = process.argv.slice(2);
if (!ids.length) {
  const list = JSON.parse(cli("blobs:list", "books-docs", "--json"));
  ids = (list.blobs || list).map((b) => b.key).filter((k) => k.startsWith("doc/gm-")).map((k) => k.slice(4));
}
const withRead = [], noRead = [];
for (const id of ids) {
  const env = JSON.parse(cli("blobs:get", "books-docs", `doc/${id}`));
  if (env.status !== "error") continue;
  (env.model && env.model.verdict ? withRead : noRead).push(id);
}
console.log(`${withRead.length} re-posted from their stored read ($0), ${noRead.length} read again (~$${(noRead.length * 0.21).toFixed(2)})`);

const post = async (body) => { const r = await fetch(`${SITE}/api/inbox`, { method: "POST", headers: H, body: JSON.stringify(body) }); return [r.status, await r.text()]; };
if (withRead.length) console.log("repost-all:", ...(await post({ action: "repost-all", only: withRead, limit: 100 })));
for (const id of noRead) { console.log("reprocess", id, ...(await post({ action: "reprocess", docId: id }))); await new Promise((r) => setTimeout(r, 3000)); }
console.log("done - the Inbox shows the result in a few minutes");
