// test/gs-lib.test.mjs - apps-script/writer/lib.gs is generated from lib/ (phase2.7-spec
// section 3): it must be in sync, parse as a plain script, define no name Code.gs also
// defines, use no Node-only global, and - run under a Utilities stub - produce the same
// txn_id and entry as the ESM source it came from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { buildGs } from "../scripts/build-gs.mjs";
import { buildEntry, makeCtx } from "../lib/posting.mjs";
import { accruedThrough } from "../lib/accrual.mjs";
import { ACCOUNTS } from "../lib/coa.mjs";

const LIB = new URL("../apps-script/writer/lib.gs", import.meta.url);
const CODE = new URL("../apps-script/writer/Code.gs", import.meta.url);
const libSrc = readFileSync(LIB, "utf8");

const utilitiesStub = {
  DigestAlgorithm: { SHA_256: "sha256" },
  Charset: { UTF_8: "utf8" },
  computeDigest: (algo, s) => [...createHash("sha256").update(s).digest()].map((b) => (b > 127 ? b - 256 : b)),
};

function load() {
  const ctx = vm.createContext({ Utilities: utilitiesStub });
  new vm.Script(libSrc, { filename: "lib.gs" }).runInContext(ctx);
  return ctx;
}

test("lib.gs is in sync with lib/ (run node scripts/build-gs.mjs)", () => {
  assert.equal(libSrc, buildGs());
});

test("lib.gs has no Node-only globals and no duplicate top-level names with Code.gs", () => {
  assert.doesNotMatch(libSrc, /\b(process|require|Buffer)\b|^import |^export /m);
  const names = (src) => [...src.matchAll(/^(?:var|function|const|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const code = new Set(names(readFileSync(CODE, "utf8")));
  const lib = names(libSrc);
  assert.deepEqual(lib.filter((n) => code.has(n)), []);
  assert.deepEqual(lib.filter((n, i) => lib.indexOf(n) !== i), []);
});

test("lib.gs builds the same expense entry as lib/posting.mjs", () => {
  const gs = load();
  const accounts = new Map(ACCOUNTS.map((a) => [a.code, a]));
  const intent = {
    type: "expense", date: "2026-09-10", payee: "Home Depot", description: "Drywall", amount_cents: 21240,
    account: "1030", property: "1616 Granite", paid_from: "1401", source: "manual", posted_by: "paul@recast-properties.com",
  };
  const mk = (env) => env.makeCtx({ accounts, properties: new Set(["1616 Granite"]), periods: new Map(), today: "2026-09-15" });
  const expected = buildEntry(intent, mk({ makeCtx }));
  const got = gs.buildEntry(intent, mk(gs));
  assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(expected)));
  assert.match(got.txn_id, /^manual-20260910-[0-9a-f]{12}$/);
});

test("lib.gs accrues interest like lib/accrual.mjs and random suffixes are 4 hex chars", () => {
  const gs = load();
  const adv = { date: "2026-03-05", amount_cents: 20700000 };
  assert.equal(gs.accruedThrough(adv, "2026-09-15"), accruedThrough(adv, "2026-09-15"));
  assert.match(gs.makeTxnId("manual", "2026-09-10", { payee: "x" }, { allow_duplicate_hash: true }), /-[0-9a-f]{4}$/);
});
