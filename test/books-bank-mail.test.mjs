// test/books-bank-mail.test.mjs — the bank's Daily Summary emails, kept as they came (D-059)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";

process.env.POLLER_SECRET ||= "poller-secret";
const { resetCacheStoreForTests } = await import("../netlify/functions/_shared.mjs");
const { default: handler } = await import("../netlify/functions/books-bank-mail.mjs");

const post = (body, secret = "poller-secret") => handler(new Request("https://x/api/bank-mail", {
  method: "POST", headers: { "content-type": "application/json", "x-poller-secret": secret }, body: JSON.stringify(body) }));
const MAIL = { id: "19f0aa11bb22cc33", from: "CNB Of Texas <alerts@cnboftexas.com>", subject: "Daily Summary", receivedAt: "2026-09-29T12:07:00.000Z", bodyText: "Daily Summary Account: 2505 Date: 09/28/26" };

test("bank-mail: the poller's secret, the bank's address and a Gmail id - then the email is kept as it came", async () => {
  const store = makeFakeCacheStore();
  resetCacheStoreForTests(store);
  assert.equal((await post(MAIL, "wrong")).status, 401);
  assert.equal((await post({ ...MAIL, from: "Someone <alerts@cnboftexas.com.evil.test>" })).status, 400);
  assert.equal((await post({ ...MAIL, id: "../doc/x" })).status, 400);
  assert.equal((await post({ ...MAIL, bodyText: "  " })).status, 400);
  assert.equal((await handler(new Request("https://x/api/bank-mail", { method: "GET", headers: { "x-poller-secret": "poller-secret" } }))).status, 405);

  const res = await post(MAIL);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, id: MAIL.id });
  const kept = await store.get(`bankmail/${MAIL.id}`, { type: "json" });
  assert.equal(kept.bodyText, MAIL.bodyText);
  assert.equal(kept.receivedAt, MAIL.receivedAt);
});

test("the poller sends the bank's summaries oldest first, remembers the newest sent, puts no label on the mail and never stops the receipts poll", () => {
  const source = readFileSync(new URL("../apps-script/poller/Code.gs", import.meta.url), "utf8");
  const a = source.indexOf("function pollBankMail_(");
  const fn = source.slice(a, source.indexOf("\n}\n", a) + 3);
  assert.match(source, /pollBankMail_\(props, secret, uploadUrl\);\n    warmCache_/, "pollBooks runs it in paul@ mode, after the receipts");
  assert.match(fn, /messages\.sort\(function \(a, b\) \{ return a\.getDate\(\)\.getTime\(\) - b\.getDate\(\)\.getTime\(\); \}\)/);
  assert.match(fn, /if \(res\.getResponseCode\(\) !== 200\) \{[^}]*break;/, "a failure stops at that message so it is tried again");
  assert.match(fn, /props\.setProperty\('BANK_MAIL_LAST'/);
  assert.doesNotMatch(fn, /addLabel|createLabel|markRead|moveTo/, "the bank's mail is left exactly as it is");
  assert.match(fn, /\} catch \(err\) \{\n    console\.error/);
  assert.match(source, /BANK_MAIL_QUERY: 'from:alerts@cnboftexas\.com subject:"Daily Summary"'/);

  // the run, against a stand-in mailbox: two already sent, three new, the second new one refused
  const mail = (id, ms) => ({ getId: () => id, getDate: () => new Date(ms), getFrom: () => "CNB <alerts@cnboftexas.com>", getSubject: () => "Daily Summary", getPlainBody: () => "body " + id });
  const T = Date.parse("2026-09-25T12:00:00Z"), DAY = 86400000;
  const box = [mail("m5", T + 3 * DAY), mail("m1", T - DAY), mail("m3", T + DAY), mail("m2", T), mail("m4", T + 2 * DAY)];
  const stored = {}, posts = [];
  const props = { getProperty: (k) => stored[k] ?? null, setProperty: (k, v) => { stored[k] = v; } };
  const run = (refuse) => new Function("CONFIG", "GmailApp", "UrlFetchApp", "Utilities", "console", fn + " return pollBankMail_;")(
    { BANK_MAIL_QUERY: "q", BANK_MAIL_START: "2026-08-01", BANK_MAIL_MAX: 60 },
    { search: (q) => { posts.push(["search", q]); return [{ getMessages: () => box }]; } },
    { fetch: (url, o) => { const b = JSON.parse(o.payload); posts.push([url, b.id, o.headers["x-poller-secret"]]); return { getResponseCode: () => (b.id === refuse ? 502 : 200), getContentText: () => "" }; } },
    { formatDate: (d) => d.toISOString().slice(0, 10).replace(/-/g, "/") }, { log() {}, error() {} });
  stored.BANK_MAIL_LAST = String(T);
  run("m4")(props, "s3cret", "https://books.test/api/upload");
  assert.deepEqual(posts, [["search", "q after:2026/09/24"], ["https://books.test/api/bank-mail", "m3", "s3cret"], ["https://books.test/api/bank-mail", "m4", "s3cret"]]);
  assert.equal(stored.BANK_MAIL_LAST, String(T + DAY), "the refused one is not remembered");
  posts.length = 0;
  run(null)(props, "s3cret", "https://books.test/api/upload");
  assert.deepEqual(posts.slice(1).map((p) => p[1]), ["m4", "m5"]);
  assert.equal(stored.BANK_MAIL_LAST, String(T + 3 * DAY));
});
