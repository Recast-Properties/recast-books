// test/ship.test.mjs - the parsers scripts/ship.mjs relies on to know a deploy happened (audit 2026-10-24 #8)
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClaspDeploy, parseNetlifyDeploy, isClaspLoginFailure, makeStamp } from "../scripts/ship.mjs";

test("ship reads the deploy number and the site deploy id off the CLIs' output, in both @ spellings", () => {
  assert.equal(parseClaspDeploy("Deployed AKfycbxNisU_atef @42\n"), "42");
  assert.equal(parseClaspDeploy("Deployed AKfycbxNisU_atef ＠43"), "43");
  assert.equal(parseClaspDeploy("Error: invalid_grant"), "");
  assert.equal(parseNetlifyDeploy("   Unique deploy URL:\n   https://6add1ddf0e7c8df55e3efb32--recast-books.netlify.app\n"), "6add1ddf0e7c8df55e3efb32");
  assert.equal(parseNetlifyDeploy("Deploy failed"), "");
});

test("ship names an expired clasp login, and stamps the commit with the minute in Texas time", () => {
  assert.equal(isClaspLoginFailure("Error retrieving access token: invalid_grant"), true);
  assert.equal(isClaspLoginFailure("invalid_rapt"), true);
  assert.equal(isClaspLoginFailure("Pushed 13 files."), false);
  assert.match(makeStamp("ae03e89", new Date("2026-10-24T19:05:00Z")), /^ae03e89 2026-10-24 14:05$/);
});
