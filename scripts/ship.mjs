// scripts/ship.mjs - the one ship step (audit 2026-10-24 #8). Paul runs: npm run ship
//   1. the tree is clean and the tests pass        4. clasp deploy -i (the web app, same id as always)
//   2. a build stamp (commit + time) is written    5. netlify deploy --prod (the site)
//      into Build.gs and web/build.json (ignored)  6. read back: /exec and /build.json carry the stamp
//   3. clasp push -f                               7. one dry-run upload, when POLLER_SECRET is in the shell
// Stops at the first failure and says what to do ("run npx clasp login" when that is it). 11 of the 97
// post-cutover incidents were a push or deploy left out, or a deploy that did not carry the fix.
// Flags: --dry (steps 1-2 and the stamp only, nothing pushed), --skip-dry-upload.
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const WRITER_DIR = new URL("../apps-script/writer/", import.meta.url);
const WEB_DIR = new URL("../web/", import.meta.url);
export const DEPLOY_ID = "AKfycbxNisU_atef_fjnELMBK0R9N1xcnP5e-0MT4LP0FdhpfdPRE1UwlIcb2u4-JS38gx1O3w";
export const EXEC_URL = `https://script.google.com/macros/s/${DEPLOY_ID}/exec`;
export const SITE = "https://books.recast-properties.com";

/** "Deployed <id> @43" -> "43"; "" when the line is not there. */
export const parseClaspDeploy = (out) => (String(out).match(/Deployed\s+\S+\s+[@＠](\d+)/) || [])[1] || "";
/** The Netlify CLI's "Unique deploy URL: https://<id>--recast-books.netlify.app" -> "<id>". */
export const parseNetlifyDeploy = (out) => (String(out).match(/https:\/\/([0-9a-f]{24})--/) || [])[1] || "";
/** clasp's expired login, in its three spellings. */
export const isClaspLoginFailure = (out) => /invalid_grant|invalid_rapt|not logged in|No credentials|Could not read API credentials/i.test(String(out));
/** The stamp both ends carry: short commit + the minute it shipped (Texas time). */
export const makeStamp = (sha, when = new Date()) =>
  `${sha} ${when.toLocaleString("sv-SE", { timeZone: "America/Chicago" }).slice(0, 16)}`;

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  return { code: r.status ?? 1, out: `${r.stdout || ""}${r.stderr || ""}` };
};
const die = (msg) => { console.error(`\nship stopped: ${msg}`); process.exit(1); };
const step = (n, what) => console.log(`\n[${n}] ${what}`);

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers, redirect: "follow" });
  const text = await r.text();
  try { return { status: r.status, json: JSON.parse(text) }; } catch { return { status: r.status, json: null, text: text.slice(0, 200) }; }
}

async function dryRunUpload(secret, stamp) {
  const docId = `dry-ship-${stamp.slice(0, 7)}-${Date.now().toString(36)}`;
  const body = {
    docId, source: "upload", channel: "upload", dryRun: true, subject: `ship check ${stamp}`, from: "ship",
    receivedAt: new Date().toISOString(), attachments: [],
    bodyText: "Home Depot #6530 Waxahachie TX\n2 x 4 x 8 stud  3.98\nSubtotal 3.98  Tax 0.33  Total 4.31\nVisa ending 2505",
  };
  const r = await fetch(`${SITE}/api/upload`, { method: "POST", headers: { "content-type": "application/json", "x-poller-secret": secret }, body: JSON.stringify(body) });
  if (r.status !== 202 && r.status !== 200) return `the dry-run upload was refused: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`;
  const until = Date.now() + 4 * 60 * 1000;
  while (Date.now() < until) {
    await new Promise((res) => setTimeout(res, 10000));
    const { json } = await getJson(`${SITE}/api/inbox?docId=${encodeURIComponent(docId)}`, { "x-poller-secret": secret });
    const env = json?.envelopes?.[0];
    if (env && env.status !== "processing") {
      return env.status === "dry" ? `dry-run read OK (${docId}: ${env.model?.verdict || "?"}, ${env.model?.vendor || "?"} ${((env.model?.receipt_total_cents || 0) / 100).toFixed(2)})`
        : `THE READ IS BROKEN: ${docId} ended as "${env.status}" - ${env.error || (env.gate?.reasons || []).join(", ")}`;
    }
  }
  return `the dry-run read did not finish in 4 minutes (${docId}) - look at the function logs`;
}

export async function main(argv = process.argv.slice(2)) {
  const dry = argv.includes("--dry");
  step(1, "clean tree, tests");
  const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim();
  if (status) die(`the tree is not clean - commit first:\n${status}`);
  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  const tests = run("node", ["--test"]);
  const summary = (tests.out.match(/^ℹ (tests|pass|fail) \d+$/gm) || []).join(", ");
  if (tests.code !== 0 || /^ℹ fail [1-9]/m.test(tests.out)) die(`tests failed (${summary})\n${tests.out.split("\n").filter((l) => /^not ok|AssertionError/.test(l)).slice(0, 10).join("\n")}`);
  console.log(`    ${summary} at ${sha}`);

  step(2, "build stamp");
  const stamp = makeStamp(sha);
  writeFileSync(new URL("Build.gs", WRITER_DIR), `// written by scripts/ship.mjs - not in git; the ping returns it\nvar BUILD_STAMP = '${stamp}';\n`);
  writeFileSync(new URL("build.json", WEB_DIR), JSON.stringify({ commit: sha, stamp, built: new Date().toISOString() }) + "\n");
  console.log(`    ${stamp}`);
  if (dry) { console.log("\n--dry: nothing pushed or deployed."); return; }

  step(3, "clasp push -f (the sheet's menus, Inbox and triggers run it at once)");
  const push = run("npx", ["clasp", "push", "-f"], { cwd: WRITER_DIR });
  if (isClaspLoginFailure(push.out)) die("clasp is logged out. Run this, then npm run ship again:\n    cd apps-script/writer && npx clasp login");
  if (push.code !== 0) die(`clasp push failed:\n${push.out.slice(-800)}`);
  console.log(`    pushed ${(push.out.match(/Pushed (\d+) files/) || [])[1] || "?"} files`);

  step(4, "clasp deploy -i (the web app the pollers and the site call)");
  const dep = run("npx", ["clasp", "deploy", "-i", DEPLOY_ID, "-d", stamp], { cwd: WRITER_DIR });
  const at = parseClaspDeploy(dep.out);
  if (dep.code !== 0 || !at) die(`clasp deploy failed:\n${dep.out.slice(-800)}`);
  console.log(`    web app @${at}`);

  step(5, "netlify deploy --prod (the site)");
  const site = run("npx", ["netlify-cli", "deploy", "--prod", "--no-build"]);
  const siteId = parseNetlifyDeploy(site.out);
  if (site.code !== 0 || !siteId) die(`netlify deploy failed:\n${site.out.slice(-800)}`);
  console.log(`    site ${siteId}`);

  step(6, "read back");
  const ping = await getJson(EXEC_URL);
  if (!ping.json?.ok || ping.json.build !== stamp) die(`the web app does not carry this build - /exec says ${JSON.stringify(ping.json || ping.text)} (wanted build "${stamp}")`);
  const built = await getJson(`${SITE}/build.json`);
  if (built.json?.stamp !== stamp) die(`the site does not carry this build - /build.json says ${JSON.stringify(built.json || built.text)}`);
  console.log(`    /exec ok ${ping.json.version} build "${ping.json.build}"; site build.json matches`);

  step(7, "dry-run upload");
  if (argv.includes("--skip-dry-upload")) console.log("    skipped (--skip-dry-upload)");
  else if (!process.env.POLLER_SECRET) console.log("    skipped: POLLER_SECRET is not in this shell (export it to have ship read one test receipt)");
  else console.log(`    ${await dryRunUpload(process.env.POLLER_SECRET, stamp)}`);

  console.log(`\nshipped ${stamp}: web app @${at}, site ${siteId}. Record them in CHANGELOG/HANDOFF.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => die(String((err && err.stack) || err)));
}
