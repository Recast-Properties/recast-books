import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SYSTEM_PROMPT } from "../lib/bookkeeper-prompt.mjs";

test("lib/bookkeeper-prompt.mjs is generated from lib/bookkeeper-prompt.md (run scripts/build-prompt.mjs)", () => {
  const md = readFileSync(new URL("../lib/bookkeeper-prompt.md", import.meta.url), "utf8");
  assert.equal(SYSTEM_PROMPT, md);
});
