import { test } from "node:test";
import assert from "node:assert/strict";
import { createWriter, WriterError } from "../lib/writer-client.mjs";

function fakeResponse(status, bodyText) {
  return {
    status,
    text: async () => bodyText
  };
}

test("success: resolves to the writer's JSON body on ok:true", async () => {
  let seenUrl, seenOptions;
  const fetchImpl = async (url, options) => {
    seenUrl = url;
    seenOptions = options;
    return fakeResponse(200, JSON.stringify({ ok: true, spreadsheet_url: "https://x", version: "0.1.0" }));
  };
  const writer = createWriter({ url: "https://script.google.com/exec", secret: "s3cret", fetchImpl });

  const result = await writer.ping();

  assert.equal(result.ok, true);
  assert.equal(result.version, "0.1.0");
  assert.equal(seenUrl, "https://script.google.com/exec");
  const sentBody = JSON.parse(seenOptions.body);
  assert.equal(sentBody.action, "ping");
  assert.equal(sentBody.secret, "s3cret");
});

test("post() sends the entry and secret in the body", async () => {
  let sentBody;
  const fetchImpl = async (url, options) => {
    sentBody = JSON.parse(options.body);
    return fakeResponse(200, JSON.stringify({ ok: true, rows: [2, 3] }));
  };
  const writer = createWriter({ url: "https://x/exec", secret: "s", fetchImpl });

  const entry = { txn_id: "manual-20260701-abc", lines: [{ debit: 100, credit: 0 }] };
  const result = await writer.post(entry);

  assert.deepEqual(result.rows, [2, 3]);
  assert.equal(sentBody.action, "post");
  assert.deepEqual(sentBody.entry, entry);
});

test("ok:false response throws WriterError carrying the writer's code", async () => {
  const fetchImpl = async () =>
    fakeResponse(409, JSON.stringify({ ok: false, error: "DUPLICATE", message: "txn_id already posted" }));
  const writer = createWriter({ url: "https://x/exec", secret: "s", fetchImpl });

  await assert.rejects(
    () => writer.post({ txn_id: "t1", lines: [] }),
    (err) => {
      assert.ok(err instanceof WriterError);
      assert.equal(err.code, "DUPLICATE");
      assert.equal(err.message, "txn_id already posted");
      assert.equal(err.status, 409);
      return true;
    }
  );
});

test("non-JSON body throws WriterError(\"BAD_RESPONSE\")", async () => {
  const fetchImpl = async () => fakeResponse(200, "<html>not json</html>");
  const writer = createWriter({ url: "https://x/exec", secret: "s", fetchImpl });

  await assert.rejects(
    () => writer.read("Accounts"),
    (err) => {
      assert.ok(err instanceof WriterError);
      assert.equal(err.code, "BAD_RESPONSE");
      return true;
    }
  );
});

test("every call passes redirect: \"follow\" (Apps Script /exec 302s on POST)", async () => {
  const seenRedirects = [];
  const fetchImpl = async (url, options) => {
    seenRedirects.push(options.redirect);
    return fakeResponse(200, JSON.stringify({ ok: true }));
  };
  const writer = createWriter({ url: "https://x/exec", secret: "s", fetchImpl });

  await writer.ping();
  await writer.read("Accounts");
  await writer.setPeriod("2026-07", "closed");
  await writer.upsert("Vendors", "canonical", { canonical: "Home Depot" });
  await writer.void("t1", "duplicate entry", "2026-09-11");

  assert.deepEqual(seenRedirects, ["follow", "follow", "follow", "follow", "follow"]);
});

test("read() forwards limit and since", async () => {
  let sentBody;
  const fetchImpl = async (url, options) => {
    sentBody = JSON.parse(options.body);
    return fakeResponse(200, JSON.stringify({ ok: true, headers: [], rows: [] }));
  };
  const writer = createWriter({ url: "https://x/exec", secret: "s", fetchImpl });

  await writer.read("Journal", { limit: 50, since: "2026-07-01" });

  assert.equal(sentBody.tab, "Journal");
  assert.equal(sentBody.limit, 50);
  assert.equal(sentBody.since, "2026-07-01");
});

test("a network error from fetchImpl surfaces as WriterError(\"NETWORK_ERROR\")", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNRESET");
  };
  const writer = createWriter({ url: "https://x/exec", secret: "s", fetchImpl });

  await assert.rejects(
    () => writer.ping(),
    (err) => {
      assert.ok(err instanceof WriterError);
      assert.equal(err.code, "NETWORK_ERROR");
      return true;
    }
  );
});
