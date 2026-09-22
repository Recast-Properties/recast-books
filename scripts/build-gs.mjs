// Generates apps-script/writer/lib.gs from the lib/ modules the workbook menus need, so
// the posting/accrual/report rules exist once (phase2.7-spec.md section 3). Each module
// becomes an IIFE; its exports are re-declared as globals so later modules (and Code.gs)
// see them by their bare names, exactly as the ESM imports did.
// Run: node scripts/build-gs.mjs   (test/gs-lib.test.mjs asserts the file is in sync)
import { readFileSync, writeFileSync } from "node:fs";

export const MODULES = ["coa", "money", "accrual", "posting", "gate", "reports", "property-key", "sale"];

const PRELUDE = `// GENERATED from lib/*.mjs by scripts/build-gs.mjs - do not edit by hand.
// Apps Script stand-ins for the two node:crypto calls lib/posting.mjs makes.
function createHash(algo) {
  if (algo !== 'sha256') throw new Error('createHash: only sha256 is shimmed');
  var parts = [];
  var api = {
    update: function (s) { parts.push(String(s)); return api; },
    digest: function (enc) {
      if (enc !== 'hex') throw new Error('digest: only hex is shimmed');
      var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, parts.join(''), Utilities.Charset.UTF_8);
      return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
    }
  };
  return api;
}
function randomBytes(n) {
  var bytes = [];
  for (var i = 0; i < n; i++) bytes.push(Math.floor(Math.random() * 256));
  return { toString: function (enc) {
    if (enc !== 'hex') throw new Error('randomBytes.toString: only hex is shimmed');
    return bytes.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  } };
}
`;

export function buildGs(read = (name) => readFileSync(new URL(`../lib/${name}.mjs`, import.meta.url), "utf8")) {
  let out = PRELUDE;
  for (const name of MODULES) {
    const src = read(name);
    const exported = [];
    const body = src
      .replace(/^import[^\n]*\n/gm, "")
      .replace(/^export (function|const|class|let) ([A-Za-z_$][\w$]*)/gm, (_, kw, id) => { exported.push(id); return `${kw} ${id}`; });
    if (/^export\b/m.test(body)) throw new Error(`${name}.mjs: unsupported export form`);
    const tag = `M_${name.replace(/-/g, "_")}`;
    const indented = body.replace(/^(?=.)/gm, "  "); // module bodies indented: only real top-level names start a line
    out += `\n// ---- lib/${name}.mjs ----\nvar ${tag} = (function () {\n${indented}\n  return { ${exported.join(", ")} };\n})();\n`;
    out += exported.map((id) => `var ${id} = ${tag}.${id};`).join("\n") + "\n";
  }
  return out;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const target = new URL("../apps-script/writer/lib.gs", import.meta.url);
  const out = buildGs();
  writeFileSync(target, out);
  console.log("wrote apps-script/writer/lib.gs", out.length, "chars");
}
