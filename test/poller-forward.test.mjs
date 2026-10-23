// test/poller-forward.test.mjs - the file names an iPhone Mail forward lists in place of the files it left out
// (apps-script/poller/Code.gs placeholderNames_ / plainName_, 2026-10-23). The .gs runs in Apps Script, so the two pure
// functions are lifted out of the source text and run here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "apps-script", "poller", "Code.gs"), "utf8");
const lift = (name) => {
  const m = source.match(new RegExp(`function ${name}\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}|function ${name}\\([^)]*\\)\\s*\\{[^\\n]*\\}`));
  assert.ok(m, `${name} not found in Code.gs`);
  return m[0];
};
const fns = new Function(`${lift("plainName_")}\n${lift("placeholderNames_")}\nreturn { plainName_, placeholderNames_ };`)();

const COOL_HAND = [
  "Do not bill this to 366 Mesa. Bill it as general expense.",
  "",
  "Begin forwarded message:",
  "",
  "> From: Cool Hand Electric LLC <noreply@onservicetitan.com>",
  "> Subject: Your Invoice from Cool Hand Electric & Air",
  "> Please find your invoice from Cool Hand Electric & Air attached below!",
  "> <Today\u2019s Task.pdf>",
  "> <Invoice #68029768.pdf>",
  "> <c415efed-9db0-4aa4-af8a-46b9a3d9a415_cdv_photo_001.jpg>",
  "<53623e83-6e6d-4356-9963-84edc9523e05_cdv_photo_003.jpg>",
].join("\n");

test("the names a forward lists in place of its files, as the attachment spells them", () => {
  assert.deepEqual(fns.placeholderNames_(COOL_HAND), [
    "todaystask.pdf", "invoice68029768.pdf", "c415efed9db04aa4af8a46b9a3d9a415cdvphoto001.jpg", "53623e836e6d4356996384edc9523e05cdvphoto003.jpg",
  ]);
  assert.equal(fns.plainName_("Today\u2019s Task.pdf"), "todaystask.pdf", "the real attachment's name matches the placeholder");
});

test("an address in angle brackets or a plain email is not a file", () => {
  assert.deepEqual(fns.placeholderNames_("> From: Cool Hand <noreply@onservicetitan.com>\nPlease find the invoice.pdf attached"), []);
});
