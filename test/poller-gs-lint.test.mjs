// test/poller-gs-lint.test.mjs
//
// apps-script/poller/Code.gs runs in the Apps Script V8 runtime and can't execute
// under node:test, so - like test/writer-gs-lint.test.mjs - this is a text-level
// lint against the contract in docs/phase2-spec.md section 6: setup() is the first
// function and the only hand-run entry point, the file is ASCII-only, the
// "books-done" label is used (and "receipts-done" never is - a completely separate
// project from the old receipts poller), no secret value is hardcoded (only the
// script-property NAME strings are literals), and both time triggers are installed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODE_PATH = path.join(__dirname, "..", "apps-script", "poller", "Code.gs");
const source = readFileSync(CODE_PATH, "utf8");

test("Code.gs exists and is non-empty", () => {
  assert.ok(source.length > 0);
});

test("setup is the first function declared", () => {
  const matches = [...source.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)];
  assert.ok(matches.length > 0, "no top-level function declarations found");
  assert.equal(matches[0][1], "setup", `first function declared was "${matches[0][1]}", expected "setup"`);
});

test("no non-ASCII bytes anywhere in the file", () => {
  const nonAscii = [...source].filter((ch) => ch.charCodeAt(0) > 127);
  assert.equal(nonAscii.length, 0, `found non-ASCII characters: ${JSON.stringify(nonAscii.slice(0, 10))}`);
});

test('uses the "books-done" label', () => {
  assert.match(source, /DONE_LABEL:\s*'books-done'/);
  assert.ok(source.includes("CONFIG.DONE_LABEL"), "pollBooks/setup do not reference CONFIG.DONE_LABEL");
});

test('never references "receipts-done" (a completely separate label from the old poller)', () => {
  assert.ok(!source.includes("receipts-done"), 'found a reference to "receipts-done" in the books poller');
});

test("no hardcoded secret value - only the POLLER_SECRET property name is a literal", () => {
  // The secret itself must always come from PropertiesService, generated with
  // Utilities.getUuid() in setup(), or passed through as the props.getProperty(...)
  // return value - never a literal token/hex/base64 string assigned to a variable
  // that looks like a secret.
  assert.ok(source.includes("PropertiesService.getScriptProperties()"), "does not read script properties at all");
  assert.ok(source.includes("Utilities.getUuid()"), "setup() does not generate POLLER_SECRET via Utilities.getUuid()");
  // A crude but effective heuristic: no long (20+) run of base64/hex-looking
  // characters inside a quoted string literal anywhere in the file.
  const suspiciousLiteral = /['"][A-Za-z0-9+/_-]{20,}['"]/;
  assert.ok(!suspiciousLiteral.test(source), "found a suspiciously long quoted literal that could be a hardcoded secret");
});

test("setup() installs both pollBooks and dailyDigest time triggers", () => {
  const anchor = source.indexOf("function setup(");
  assert.ok(anchor !== -1, "setup() not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);

  assert.match(body, /newTrigger\('pollBooks'\)[\s\S]*?everyMinutes\(15\)/, "pollBooks trigger not installed every 15 minutes");
  assert.match(
    body,
    /newTrigger\('dailyDigest'\)[\s\S]*?atHour\(3\)[\s\S]*?inTimezone\('America\/Chicago'\)/,
    "dailyDigest trigger not installed daily at 3 AM America/Chicago",
  );
});

test("setup() clears existing triggers before installing new ones (idempotent re-run)", () => {
  const anchor = source.indexOf("function setup(");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(body.includes("ScriptApp.getProjectTriggers()") && body.includes("deleteTrigger"),
    "setup() does not clear existing triggers first");
});

test("setup() never regenerates POLLER_SECRET once it exists", () => {
  const anchor = source.indexOf("function setup(");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.match(body, /if\s*\(\s*!secret\s*\)\s*\{/, "setup() does not guard secret generation behind an existence check");
});

test("pollBooks and dryRunBatch both exist and dryRunBatch never adds the done label", () => {
  assert.ok(source.includes("function pollBooks("), "pollBooks not found");
  assert.ok(source.includes("function dryRunBatch("), "dryRunBatch not found");

  const anchor = source.indexOf("function dryRunBatch(");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(!body.includes("addLabel"), "dryRunBatch must never label a thread");
  assert.ok(body.includes("dryRun: true") || body.includes("dryRun:true") || body.includes("buildPayload_(message, true)"),
    "dryRunBatch does not pass dryRun:true through to the upload payload");
});

test("dailyDigest exists and reads /api/summary via the poller secret header", () => {
  const anchor = source.indexOf("function dailyDigest(");
  assert.ok(anchor !== -1, "dailyDigest not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(body.includes("x-poller-secret"), "dailyDigest does not send the x-poller-secret header");
  assert.ok(body.includes("MailApp.sendEmail"), "dailyDigest does not send an email");
});

test("the digest's pending line is a snapshot in the Inbox card's words, never the model's working", () => {
  // Paul, 2026-09-26, on a 1,500-character Harbor Freight line: "i need a snapshot of the issue not a novel".
  const fn = (s, name) => {
    const a = s.indexOf("function " + name + "(");
    const b = s.indexOf("\nfunction ", a + 1);
    return s.slice(a, b === -1 ? s.length : b);
  };
  const mapOf = (s) => s.slice(s.indexOf("var GATE_TEXT = {"), s.indexOf("};", s.indexOf("var GATE_TEXT = {")) + 2);
  const inbox = readFileSync(path.join(__dirname, "..", "apps-script", "writer", "Inbox.html"), "utf8");
  const bare = (m) => m.replace(/\/\/.*$/gm, "").replace(/\s+/g, "");
  assert.equal(bare(mapOf(source)), bare(mapOf(inbox)), "the digest's GATE_TEXT drifted from the Inbox card's");

  const reason = new Function([mapOf(source), fn(source, "gateText_"), fn(source, "digestReason_"), "return digestReason_;"].join("\n"))();
  const novel = "Harbor Freight e-receipt, tender 9166, search_docs found gm-19d0639545d977c3. ".repeat(20) +
    "[rule: receipt-20260319-f3c59e4ca29f is not on the books, the dismiss was against an earlier run's ledger - replayed as hold]";
  assert.equal(reason({ why: novel, gate_reasons: ["NOT_POST_VERDICT", "TOTAL_MISMATCH"] }),
    "Claude matched this to a record that is not in the books - Save it, or Dismiss all");
  assert.equal(reason({ why: "Posted: HILCO, card 5450.", gate_reasons: ["PAYER_UNKNOWN", "OVER_CEILING"] }),
    "Who paid? Pick the card or account; Too big for Claude to record on its own - check it, then Save");
  assert.equal(reason({ why: "Held: no card or note says who paid.", gate_reasons: ["NOT_POST_VERDICT", "TOTAL_MISMATCH"] }),
    "Held: no card or note says who paid.");
  assert.equal(reason({ why: "x".repeat(400), gate_reasons: ["NOT_POST_VERDICT"] }), "Open it in the Inbox");

  const ingest = readFileSync(path.join(__dirname, "..", "netlify", "functions", "books-ingest-background.mjs"), "utf8");
  assert.ok(ingest.includes("is not on the books, the dismiss was against"), "the replay rule's wording changed - update digestReason_");
  assert.ok(fn(source, "dailyDigest").includes("digestReason_(p)"), "dailyDigest no longer goes through digestReason_");
  assert.ok(!/p\.why/.test(fn(source, "dailyDigest")), "dailyDigest prints the model's why raw again");
});

test("phase2.6-spec.md: MAILBOX script property switches pollBooks/dryRunBatch into label-driven properties mode", () => {
  assert.ok(source.includes("function mailboxMode_("), "mailboxMode_ not found");
  assert.match(source, /getProperty\('MAILBOX'\)\s*\|\|\s*'paul'/, "mailboxMode_ does not default to 'paul'");

  const pollAnchor = source.indexOf("function pollBooks(");
  const pollNext = source.indexOf("\nfunction ", pollAnchor + 1);
  const pollBody = source.slice(pollAnchor, pollNext === -1 ? source.length : pollNext);
  assert.match(pollBody, /mailboxMode_\(props\)\s*===\s*'properties'/, "pollBooks does not branch on properties mode");
  assert.ok(pollBody.includes("pollBooksProperties_("), "pollBooks does not call pollBooksProperties_");

  const dryAnchor = source.indexOf("function dryRunBatch(");
  const dryNext = source.indexOf("\nfunction ", dryAnchor + 1);
  const dryBody = source.slice(dryAnchor, dryNext === -1 ? source.length : dryNext);
  assert.match(dryBody, /mailboxMode_\(props\)\s*===\s*'properties'/, "dryRunBatch does not branch on properties mode");
  assert.ok(dryBody.includes("dryRunBatchProperties_("), "dryRunBatch does not call dryRunBatchProperties_");
});

test("normalizeKey_ lower-cases and strips everything but [a-z0-9] (mirrors lib/property-key.mjs)", () => {
  const anchor = source.indexOf("function normalizeKey_(");
  assert.ok(anchor !== -1, "normalizeKey_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(body.includes("toLowerCase()"), "normalizeKey_ does not lower-case");
  assert.ok(body.includes("[^a-z0-9]"), "normalizeKey_ does not strip everything but [a-z0-9]");
});

test("pollBooksProperties_ replaces isAddressedToInbox_ with the matched-label search and caps total threads at MAX_THREADS", () => {
  const anchor = source.indexOf("function pollBooksProperties_(");
  assert.ok(anchor !== -1, "pollBooksProperties_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(!body.includes("isAddressedToInbox_"), "properties mode must not use the to/cc check - labels live on threads");
  assert.ok(body.includes("CONFIG.MAX_THREADS"), "does not bound total threads at CONFIG.MAX_THREADS");
  assert.ok(body.includes("m.skipped"), "does not log skipped unmatched labels");
});

test("dryRunBatchProperties_ never labels a thread", () => {
  const anchor = source.indexOf("function dryRunBatchProperties_(");
  assert.ok(anchor !== -1, "dryRunBatchProperties_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(!body.includes("addLabel"), "dryRunBatchProperties_ must never label a thread");
});

test("upload requests authenticate with x-poller-secret, not a body token", () => {
  const anchor = source.indexOf("function postOne_(");   // the request itself; postUpload_ sends each document of an email through it
  assert.ok(anchor !== -1, "postOne_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(body.includes("'x-poller-secret'") || body.includes('"x-poller-secret"'));
});

test("an email with more attachments than one document holds becomes several documents - nothing is dropped", () => {
  // 2026-10-02: the poller took the first six attachments and dropped the rest without a word
  // (five of eleven Squarespace invoices). The two functions are run here with Apps Script stubbed.
  const fn = (name) => { const a = source.indexOf(`function ${name}(`); const b = source.indexOf("\nfunction ", a + 1); return source.slice(a, b === -1 ? source.length : b); };
  const posted = [];
  const build = new Function("CONFIG", "Utilities", "channelOf_", "shrinkImageViaDrive_", "UrlFetchApp",
    `${fn("buildPayload_")}\n${fn("postUpload_")}\n${fn("postOne_")}\nreturn { buildPayload_, postUpload_ };`)(
    { MAX_ATTACH_BYTES: 3 * 1024 * 1024, MAX_ATTACH_COUNT: 6, MAX_PART_BYTES: 4 * 1024 * 1024 },
    { base64Encode: (b) => `b64:${b.length}` }, () => "receipts", () => null,
    { fetch: (url, o) => { const p = JSON.parse(o.payload); posted.push(p); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ docId: p.docId, skipped: p.docId === "gm-m1" }) }; } });
  const att = (name, size, type = "application/pdf") => ({ getContentType: () => type, getName: () => name, getBytes: () => ({ length: size }) });
  const message = (atts) => ({ getAttachments: () => atts, getPlainBody: () => "note", getId: () => "m1", getSubject: () => "s", getFrom: () => "f", getDate: () => null });

  const eleven = build.buildPayload_(message([...Array(11)].map((_, i) => att(`squarespace ${i + 1}.pdf`, 50000))), false);
  assert.equal(eleven.docId, "gm-m1");
  assert.deepEqual([eleven, ...eleven.rest].map((p) => p.attachments.length), [6, 5]);
  assert.equal(eleven.rest[0].docId, "gm-m1-2");
  assert.match(eleven.rest[0].bodyText, /This email had 11 attachments, read as 2 documents; this is document 2 of 2 and holds 5 of them\./);
  assert.deepEqual(eleven.rest[0].attachments[0], { name: "squarespace 7.pdf", mime: "application/pdf", base64: "b64:50000" });

  // every document is sent, the first one's answer is the message's; "rest" never goes over the wire
  const res = build.postUpload_("https://x/api/upload", "s", eleven);
  assert.deepEqual(res, { ok: true, docId: "gm-m1", skipped: true });
  assert.deepEqual(posted.map((p) => [p.docId, p.attachments.length, "rest" in p]), [["gm-m1", 6, false], ["gm-m1-2", 5, false]]);

  // big files split on size too (the POST limit), a spreadsheet is not a document, one receipt stays one document
  assert.deepEqual([build.buildPayload_(message([att("a.pdf", 2.5e6), att("b.pdf", 2.5e6), att("c.xlsx", 10, "application/vnd.ms-excel")]), false)].flatMap((p) => [p, ...p.rest]).map((p) => p.attachments.length), [1, 1]);
  const one = build.buildPayload_(message([att("r.pdf", 1000)]), false);
  assert.deepEqual([one.docId, one.rest.length, one.bodyText], ["gm-m1", 0, "note"]);
  assert.equal(build.buildPayload_(message([]), false).attachments.length, 0);
});

test("a phone photo under the cap is stored exactly as sent; one over it keeps the largest copy that fits, and says so", () => {
  // 2026-10-02 (Paul: "pixelated and sometimes unreadable. i am sending high resolution images"): the cap was
  // 3 MB and the fallback was always Drive's 2000px copy, so about one photo in four was stored at 1500x2000.
  const fn = (name) => { const a = source.indexOf(`function ${name}(`); const b = source.indexOf("\nfunction ", a + 1); return source.slice(a, b === -1 ? source.length : b); };
  const CONFIG = new Function(`${source.slice(source.indexOf("var CONFIG = {"), source.indexOf("};", source.indexOf("var CONFIG = {")) + 2)}\nreturn CONFIG;`)();
  assert.equal(CONFIG.MAX_ATTACH_BYTES, 4 * 1024 * 1024, "a 3-4 MB phone photo goes up whole");
  assert.ok(CONFIG.MAX_ATTACH_BYTES * 4 / 3 < 5.9 * 1024 * 1024, "its base64 still fits one 6 MB request");
  assert.deepEqual(CONFIG.SHRINK_SIZES, [...CONFIG.SHRINK_SIZES].sort((a, b) => b - a), "largest first");

  // the rendition ladder: 8000 is refused, 5000 is too big, 4032 fits - never straight to 2000
  const asked = [];
  const sizes = { 8000: { code: 400, n: 0 }, 5000: { code: 200, n: 5e6 }, 4032: { code: 200, n: 2.2e6 }, 3000: { code: 200, n: 1.4e6 }, 2000: { code: 200, n: 5e5 } };
  const shrink = new Function("CONFIG", "DriveApp", "UrlFetchApp", "ScriptApp", "Utilities", "console", `${fn("shrinkImageViaDrive_")}\nreturn shrinkImageViaDrive_;`)(
    CONFIG,
    { createFile: () => ({ getId: () => "tmp1" }), getFileById: () => ({ setTrashed: () => {} }) },
    { fetch: (url) => {
      if (/files\/tmp1/.test(url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ thumbnailLink: "https://lh3/x=s220" }) };
      const px = Number(url.match(/=s(\d+)$/)[1]); asked.push(px);
      return { getResponseCode: () => sizes[px].code, getContent: () => ({ length: sizes[px].n }) };
    } },
    { getOAuthToken: () => "t" }, { sleep: () => {} }, { log: () => {}, warn: () => {} });
  const photo = { copyBlob: () => ({ setName: (n) => n }), getName: () => "IMG_1.JPG" };
  assert.equal(shrink(photo).length, 2.2e6);
  assert.deepEqual(asked, [8000, 5000, 4032]);

  const build = new Function("CONFIG", "Utilities", "channelOf_", "shrinkImageViaDrive_", `${fn("buildPayload_")}\nreturn buildPayload_;`)(
    CONFIG, { base64Encode: (b) => `b64:${b.length}` }, () => "receipts", () => ({ length: 2.2e6 }));
  const att = (name, size) => ({ getContentType: () => "image/jpeg", getName: () => name, getBytes: () => ({ length: size }) });
  const p = build({ getAttachments: () => [att("IMG_5869.JPG", 3.6e6), att("IMG_9000.JPG", 7e6)], getPlainBody: () => "", getId: () => "m2", getSubject: () => "s", getFrom: () => "f", getDate: () => null }, false);
  const all = [p, ...p.rest].flatMap((d) => d.attachments);
  assert.deepEqual(all[0], { name: "IMG_5869.JPG", mime: "image/jpeg", base64: "b64:3600000" }, "3.6 MB: untouched");
  assert.deepEqual(all[1], { name: "IMG_9000.jpg", mime: "image/jpeg", base64: "b64:2200000" }, "7 MB: the reduced copy");
  assert.match(p.bodyText, /Photo "IMG_9000\.JPG" was too big to store whole \(6\.7 MB\); a reduced copy \(2\.1 MB\)/);
});

test("ONE-OFF (OneOff.gs, 1014 S View receipts): plain file names, paul@ only, and the poll hands over its spare minutes after the mail", () => {
  const oneOff = readFileSync(new URL("../apps-script/poller/OneOff.gs", import.meta.url), "utf8");
  assert.ok(!/[^\x00-\x7f]/.test(oneOff), "ASCII only");
  assert.equal(oneOff.match(/^function\s+([A-Za-z0-9_]+)/m)[1], "exportMolallaMail", "the editor's Run picks the first function");
  const a = oneOff.indexOf("function molallaName_("), b = oneOff.indexOf("\nfunction ", a + 1);
  const name = new Function(`${oneOff.slice(a, b)}\nreturn molallaName_;`)();
  assert.equal(name('2025-09-17 Lowe\'s - Fwd: "Receipt" 1014/S View\r\n'), "2025-09-17 Lowe's - Fwd Receipt 1014 S View");
  assert.equal(name("x".repeat(300)).length, 110);
  assert.match(oneOff, /mailboxMode_\(props\) !== 'paul'\) return/);
  const c = oneOff.indexOf("function molallaPictureSrc_("), e = oneOff.indexOf("\n}\n", c) + 2;
  const src = new Function(`${oneOff.slice(c, e)}\nreturn molallaPictureSrc_;`)();
  assert.equal(src('<img src="https://x/logo.png" alt="Logo"><img alt="eReceipt" width="350" src="https://x/r?a=1&amp;b=2">'), "https://x/r?a=1&b=2");
  assert.equal(src('<img src="https://x/logo.png" alt="Logo">'), "");
  assert.match(source, /warmCache_\(uploadUrl, secret\);\n[^\n]*\n[^\n]*\n\s+if \(Date\.now\(\) - t0 < 60000\) console\.log\(exportMolallaMail_\(Date\.now\(\)\)\);/);
});
