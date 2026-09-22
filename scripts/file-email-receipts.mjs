#!/usr/bin/env node
// D-035 backfill: files a body-only email receipt to Drive and links its Journal lines - for
// documents posted before the rule (Wi-Fi Onboard $8.00 gm-1a0c5fc63ec8b929, Berrett $270.63
// gm-1a0c5fe6adfe0cdd). New uploads get email.txt at upload time; this only serves the old ones.
//
//   read -s "WRITER_SECRET?Writer secret: " && export WRITER_SECRET && node scripts/file-email-receipts.mjs <docId> [<docId>…]
// A docId given as <docId>=<drive url> is already filed (the reply was lost): only the link is written.
// (WRITER_SECRET is masked on Netlify; WRITER_URL is read from Netlify's production context.)
// Per docId: stores email.txt in books-docs if the envelope has no attachment, files it through
// the writer's storeDocument under <year>/<property>, writes doc_url on the posted lines
// (writer setDocUrl) and on the envelope. A docId that already has a doc_url is skipped.
import { getStore } from "@netlify/blobs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createWriter } from "../lib/writer-client.mjs";
import { driveFileName } from "../netlify/functions/_shared.mjs";

if (!process.env.WRITER_SECRET) throw new Error("WRITER_SECRET is not set - see the header of this script");
const ids = process.argv.slice(2);
if (!ids.length) { console.error("usage: node scripts/file-email-receipts.mjs <docId> [<docId>…]"); process.exit(1); }

const cli = JSON.parse(readFileSync(`${homedir()}/Library/Preferences/netlify/config.json`, "utf8"));
const token = Object.values(cli.users)[0].auth.token;
const siteID = JSON.parse(readFileSync(".netlify/state.json", "utf8")).siteId;
const store = getStore({ name: "books-docs", siteID, token, consistency: "strong" });
const writerUrl = execFileSync("npx", ["netlify-cli", "env:get", "WRITER_URL", "--context", "production"], { encoding: "utf8" }).trim();
const writer = createWriter({ url: writerUrl, secret: process.env.WRITER_SECRET });

for (const arg of ids) {
  const [docId, knownUrl = ""] = arg.split("=", 2);
  const env = await store.get(`doc/${docId}`, { type: "json" });
  if (!env) { console.log(`${docId}: no envelope`); continue; }
  const txnIds = env.result?.txn_ids || [];
  if (env.status !== "posted" || !txnIds.length) { console.log(`${docId}: not posted (${env.status}) - nothing to link`); continue; }
  if (env.result?.doc_url) { console.log(`${docId}: already linked ${env.result.doc_url}`); continue; }
  let atts = env.attachments || [];
  if (!atts.length) {
    const text = [`Subject: ${env.subject || ""}`, `From: ${env.from || ""}`, `Received: ${env.receivedAt || ""}`, `Mailbox: ${env.channel || ""}`,
      `Gmail: ${env.gmailUrl || ""}`, `Books: ${txnIds.join(", ")}`, "", env.bodyText || ""].join("\n");
    const key = `att/${docId}/0`;
    await store.set(key, Buffer.from(text, "utf8").toString("base64"), { metadata: { contentType: "text/plain", filename: "email.txt" } });
    atts = [{ key, name: "email.txt", mime: "text/plain", bytes: Buffer.byteLength(text, "utf8"), email_as_receipt: true }];
  }
  const first = env.model?.entries?.[0] || {};
  const folder = [String(first.date || env.receivedAt || "").slice(0, 4), first.property || "OVERHEAD"];
  let docUrl = knownUrl;
  for (let i = 0; i < atts.length && !knownUrl; i++) {
    const base64 = await store.get(atts[i].key || `att/${docId}/${i}`, { type: "text" });
    if (!base64) continue;
    const name = driveFileName(env.model, atts[i].name || `attachment-${i}`, i);
    const stored = await writer.storeDocument(name, atts[i].mime || "application/octet-stream", base64, folder);
    if (!docUrl) docUrl = stored.url;
    console.log(`${docId}: filed ${folder.join("/")}/${name}`);
  }
  if (!docUrl) { console.log(`${docId}: nothing filed`); continue; }
  const r = await writer.setDocUrl(txnIds, docUrl);
  await store.setJSON(`doc/${docId}`, { ...env, attachments: atts, result: { ...env.result, doc_url: docUrl } });
  console.log(`${docId}: doc_url on ${r.updated} Journal line(s) - ${docUrl}`);
}
console.log("done - the Journal snapshot refreshes on the next poll (warm job)");
