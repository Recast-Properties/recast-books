// Regenerates lib/bookkeeper-prompt.mjs from lib/bookkeeper-prompt.md so the prompt
// ships inside the function bundle (esbuild does not bundle a .md read at runtime).
// Run: node scripts/build-prompt.mjs   (a test asserts the two files are in sync)
import { readFileSync, writeFileSync } from "node:fs";
const md = readFileSync(new URL("../lib/bookkeeper-prompt.md", import.meta.url), "utf8");
const out = `// GENERATED from lib/bookkeeper-prompt.md by scripts/build-prompt.mjs - do not edit by hand.\nexport const SYSTEM_PROMPT = ${JSON.stringify(md)};\n`;
writeFileSync(new URL("../lib/bookkeeper-prompt.mjs", import.meta.url), out);
console.log("wrote lib/bookkeeper-prompt.mjs", md.length, "chars");
