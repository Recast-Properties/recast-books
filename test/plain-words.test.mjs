// test/plain-words.test.mjs - lib/plain-words.mjs (audit 2026-10-24 #12): every code that can reach Paul has words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PLAIN_WORDS, plainWords } from "../lib/plain-words.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const codesIn = (src, re) => [...src.matchAll(re)].map((m) => m[1]);

test("every code the posting engine, the writer, the menu, the dialogs and the site can answer with has plain words", () => {
  const sources = { "lib/posting.mjs": codesIn(read("../lib/posting.mjs"), /new PostingError\("([A-Z_]+)"/g) };
  for (const f of ["Code.gs", "Menu.gs"]) {
    const src = read(`../apps-script/writer/${f}`);
    sources[f] = codesIn(src, /fail_\('([A-Z_]+)'/g).concat(codesIn(src, /error: '([A-Z_]+)'/g));
  }
  const dir = new URL("../apps-script/writer/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".html"))) sources[f] = codesIn(read(`../apps-script/writer/${f}`), /error: '([A-Z_]+)'/g);
  const fdir = new URL("../netlify/functions/", import.meta.url);
  for (const f of readdirSync(fdir).filter((n) => n.endsWith(".mjs"))) sources[`functions/${f}`] = codesIn(read(`../netlify/functions/${f}`), /error: "([A-Z_]+)"/g);
  const missing = [];
  for (const [file, codes] of Object.entries(sources)) for (const c of new Set(codes)) if (!PLAIN_WORDS[c]) missing.push(`${c} (${file})`);
  assert.deepEqual(missing, [], "codes with no plain words - add them to lib/plain-words.mjs");
  assert.ok(Object.values(sources).flat().length >= 60, "the sources were read");
});

test("plainWords: the words for a known code, UNKNOWN's for one it has never heard of, the code and message on the raw line; every sentence is Paul's", () => {
  const w = plainWords("PERIOD_CLOSED", "period 2026-09 is closed");
  assert.match(w.text, /that month is closed/);
  assert.equal(w.raw, "PERIOD_CLOSED - period 2026-09 is closed");
  assert.equal(plainWords("NEVER_HEARD_OF", "x").text, PLAIN_WORDS.UNKNOWN);
  assert.equal(plainWords("", "").raw, "ERROR");
  assert.equal(plainWords("DUPLICATE", "DUPLICATE").raw, "DUPLICATE");
  for (const [code, text] of Object.entries(PLAIN_WORDS)) {
    assert.ok(!/[A-Z]{2,}_[A-Z_]+/.test(text), `${code}: a code inside Paul's words`);
    assert.ok(/[.!]$/.test(text), `${code}: a full sentence`);
    assert.ok(text.length <= 160, `${code}: short`);
  }
});
