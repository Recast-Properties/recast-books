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

test("upload requests authenticate with x-poller-secret, not a body token", () => {
  const anchor = source.indexOf("function postUpload_(");
  assert.ok(anchor !== -1, "postUpload_ not found");
  const nextFn = source.indexOf("\nfunction ", anchor + 1);
  const body = source.slice(anchor, nextFn === -1 ? source.length : nextFn);
  assert.ok(body.includes("'x-poller-secret'") || body.includes('"x-poller-secret"'));
});
