#!/usr/bin/env node
// D-047 tie-out: reads every tab through the writer AND through the Sheets API as the
// service account, diffs them cell by cell. Zero differences on all nine tabs = flip.
//
//   read -s "WRITER_SECRET?Writer secret: " && export WRITER_SECRET && \
//     node scripts/reads-tieout.mjs ~/Downloads/<service-account-key>.json
//
// WRITER_URL comes from the Netlify production env; SPREADSHEET_ID defaults to the
// production workbook (docs/phase0-spec.md §10). Read-only on both paths.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createWriter } from "../lib/writer-client.mjs";
import { createSheetsReader, READABLE_TABS } from "../lib/sheets-reader.mjs";

const keyPath = process.argv[2];
if (!keyPath) throw new Error("usage: node scripts/reads-tieout.mjs <service-account-key.json>");
if (!process.env.WRITER_SECRET) throw new Error("WRITER_SECRET is not set - see the header of this script");
const spreadsheetId = process.env.SPREADSHEET_ID || "12QVyxm3KnLD7CDC8mFAPd5ulZuRXRluNDi4qK4BBxKM";
const writerUrl = process.env.WRITER_URL ||
  execFileSync("npx", ["netlify-cli", "env:get", "WRITER_URL", "--context", "production"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const writer = createWriter({ url: writerUrl, secret: process.env.WRITER_SECRET });
const reader = createSheetsReader({ key: readFileSync(keyPath, "utf8"), spreadsheetId });

let total = 0;
for (const tab of READABLE_TABS) {
  const t0 = Date.now();
  const [w, s] = await Promise.all([writer.read(tab, tab === "Journal" ? { all: true } : undefined), reader.read(tab)]);
  const diffs = [];
  if (JSON.stringify(w.headers) !== JSON.stringify(s.headers)) diffs.push(`headers: writer ${JSON.stringify(w.headers)} vs sheets ${JSON.stringify(s.headers)}`);
  if (w.rows.length !== s.rows.length) diffs.push(`row count: writer ${w.rows.length} vs sheets ${s.rows.length}`);
  const n = Math.min(w.rows.length, s.rows.length);
  for (let r = 0; r < n && diffs.length < 25; r++) {
    for (let c = 0; c < w.headers.length; c++) {
      const a = w.rows[r][c], b = s.rows[r][c];
      if (a !== b && !(a === "" && b === undefined)) diffs.push(`row ${r + 2} ${w.headers[c]}: writer ${JSON.stringify(a)} vs sheets ${JSON.stringify(b)}`);
    }
  }
  total += diffs.length;
  console.log(`${tab}: ${w.rows.length} rows, ${diffs.length ? diffs.length + " difference(s)" : "identical"} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  diffs.forEach((d) => console.log("   " + d));
}
console.log(total ? `\n${total} difference(s) - do NOT flip yet` : "\nAll nine tabs identical - safe to set SHEETS_SA_KEY and SPREADSHEET_ID");
process.exit(total ? 1 : 0);
