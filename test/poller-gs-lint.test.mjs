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
    "Matched an entry that is not on the books - post or dismiss it");
  assert.equal(reason({ why: "Posted: HILCO, card 5450.", gate_reasons: ["PAYER_UNKNOWN", "OVER_CEILING"] }),
    "No payer - pick who paid; Over the auto-file limit - approve it yourself");
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
  const anchor = source.indexOf("function postUpload_(");
  assert.ok(anchor !== -1, "postUpload_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(body.includes("'x-poller-secret'") || body.includes('"x-poller-secret"'));
});
