// test/sheets-reader.test.mjs — lib/sheets-reader.mjs (D-047): the Sheets API read returns
// the writer's readTabData_ shape, the JWT is a valid RS256 token, the token is cached.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { createSheetsReader, formatCell, serialToDate } from "../lib/sheets-reader.mjs";
import { readTab, resetWriterForTests, resetCacheStoreForTests } from "../netlify/functions/_shared.mjs";
import { makeFakeCacheStore } from "./helpers/fake-cache-store.mjs";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY = {
  client_email: "books-reader@proj.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  token_uri: "https://oauth2.googleapis.com/token",
};
const KEY_B64 = Buffer.from(JSON.stringify(KEY)).toString("base64");

function fakeSheets(valuesByTab) {
  const calls = { token: 0, reads: [] };
  const fetchImpl = async (url, opts = {}) => {
    if (url === KEY.token_uri) {
      calls.token++;
      const assertion = new URLSearchParams(opts.body).get("assertion");
      const [h, c, sig] = assertion.split(".");
      assert.ok(createVerify("RSA-SHA256").update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, "base64url")), "JWT signature verifies");
      const claims = JSON.parse(Buffer.from(c, "base64url"));
      assert.equal(claims.iss, KEY.client_email);
      assert.equal(claims.scope, "https://www.googleapis.com/auth/spreadsheets.readonly");
      return new Response(JSON.stringify({ access_token: "tok-1", expires_in: 3600 }), { status: 200 });
    }
    const m = /\/spreadsheets\/(\w+)\/values\/([^?]+)\?/.exec(url);
    assert.ok(m, `sheets url: ${url}`);
    assert.equal(opts.headers.authorization, "Bearer tok-1");
    assert.match(url, /valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER/);
    const tab = decodeURIComponent(m[2]).replace(/^'|'$/g, "");
    calls.reads.push(tab);
    if (!(tab in valuesByTab)) return new Response(JSON.stringify({ error: { message: "Unable to parse range" } }), { status: 400 });
    return new Response(JSON.stringify({ values: valuesByTab[tab] }), { status: 200 });
  };
  return { fetchImpl, calls };
}

test("serial numbers become the writer's ISO strings, by column", () => {
  assert.equal(serialToDate(46290).toISOString(), "2026-09-25T00:00:00.000Z");
  assert.equal(formatCell("date", 46290), "2026-09-25");
  assert.equal(formatCell("posted_at", 46290 + 0.5 + 27 / 86400), "2026-09-25T12:00:27");
  assert.equal(formatCell("period", 46266), "2026-09"); // a Date typed into Periods.period
  assert.equal(formatCell("debit", 46290), 46290, "a number in a money column stays a number");
  assert.equal(formatCell("date", "2026-09-25"), "2026-09-25", "text passes through untouched");
  assert.equal(formatCell("active", true), true);
});

test("read returns {ok, headers, rows} padded to the header width, one token for many reads", async () => {
  const { fetchImpl, calls } = fakeSheets({
    Journal: [["txn_id", "date", "debit", "credit", "posted_at", "memo"], ["t1", 46290, 12.5, "", 46290.75], []],
    Periods: [["period", "status", "closed_at"], [46266, "open"]],
  });
  let now = 1_000_000;
  const reader = createSheetsReader({ key: KEY_B64, spreadsheetId: "sheet1", fetchImpl, now: () => now });
  const j = await reader.read("Journal");
  assert.deepEqual(j, { ok: true, headers: ["txn_id", "date", "debit", "credit", "posted_at", "memo"], rows: [["t1", "2026-09-25", 12.5, "", "2026-09-25T18:00:00", ""], ["", "", "", "", "", ""]] });
  const p = await reader.read("Periods");
  assert.deepEqual(p.rows, [["2026-09", "open", ""]]);
  assert.equal(calls.token, 1, "token cached across reads");
  now += 55 * 60 * 1000;
  await reader.read("Periods");
  assert.equal(calls.token, 2, "a new token after ~50 min");
  await assert.rejects(reader.read("Trips"), /not readable/);
  await assert.rejects(reader.read("Vendors"), /HTTP 400/);
});

test("readTab uses the Sheets reader when SHEETS_SA_KEY is set and never calls the writer", async () => {
  resetCacheStoreForTests(makeFakeCacheStore());
  const { fetchImpl } = fakeSheets({ Accounts: [["code", "name"], [1030, "Rehab"]] });
  const realFetch = globalThis.fetch;
  process.env.SHEETS_SA_KEY = KEY_B64;
  process.env.SPREADSHEET_ID = "sheet1";
  globalThis.fetch = fetchImpl;
  resetWriterForTests();
  try {
    const writer = { read: async () => { throw new Error("writer must not be read"); } };
    const r = await readTab(writer, "Accounts");
    assert.deepEqual(r, { headers: ["code", "name"], rows: [[1030, "Rehab"]] });
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.SHEETS_SA_KEY;
    delete process.env.SPREADSHEET_ID;
    resetWriterForTests();
  }
});
