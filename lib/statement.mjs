// lib/statement.mjs - Phase 3: a bank's OFX/QFX export as feed lines (docs/phase3-spec.md section 2).
//
// Pure and deterministic: no model, no I/O. It also runs inside the workbook (scripts/build-gs.mjs
// puts it in lib.gs), so nothing here uses a Node API. Citizens (CNB of Texas, "S1 IBS") exports
// OFX 1.02 SGML: one tag per line, leaf values with no closing tag, `%23` where the bank meant `#`
// ("CK%23 1023" is check 1023) and `&amp;` for `&`. The account number sits in ACCTID; only its
// last four digits come out of here - the whole number never leaves the file.

import { toCents } from "./money.mjs";

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" };

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function pick(head, keys) {
  for (const k of keys) if (head[k] != null && head[k] !== "") return head[k];
  return "";
}

/** A NAME/MEMO as the bank meant it: entities and %23 decoded, whitespace collapsed. */
export function decodeOfxText(s) {
  return String(s == null ? "" : s)
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITIES[m])
    .replace(/%23/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

/** "20260901" or "20260928230510.000[-5:CDT]" -> "2026-09-01"; "" when it is not a date. */
export function ofxDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(s || "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

/**
 * Parse an OFX/QFX file (SGML 1.x or XML 2.x) into
 *   {account_last4, account_type, currency, start, end, ledger_balance_cents, ledger_date,
 *    lines: [{fitid, date, amount_cents, type, name, memo}]}
 * lines oldest first (date, then FITID). Throws {code: NOT_OFX | NO_ACCOUNT | NO_LINES | BAD_LINE}.
 */
export function parseOfx(text) {
  const src = String(text || "");
  const at = src.indexOf("<OFX>");
  if (at < 0) fail("NOT_OFX", "This is not a bank export: there is no OFX statement inside the file.");
  const tokens = src.slice(at).match(/<\/?[A-Za-z0-9._]+>[^<]*/g) || [];

  // Leaves outside a transaction are keyed "<innermost open aggregate>.<tag>", so LEDGERBAL's
  // BALAMT and AVAILBAL's never collide. A tag with nothing after it opens an aggregate (SGML
  // never closes a leaf; XML closes both, and a close for a tag not on the stack is ignored).
  const head = {};
  const lines = [];
  const stack = [];
  let trn = null;
  for (const tok of tokens) {
    const m = /^<(\/?)([A-Za-z0-9._]+)>([^<]*)$/.exec(tok);
    const closing = m[1] === "/";
    const tag = m[2];
    const value = m[3].trim();
    if (closing) {
      const i = stack.lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      if (tag === "STMTTRN" && trn) { lines.push(trn); trn = null; }
      continue;
    }
    if (value === "") {
      stack.push(tag);
      if (tag === "STMTTRN") trn = {};
      continue;
    }
    if (trn) trn[tag] = value;
    else head[`${stack[stack.length - 1] || ""}.${tag}`] = value;
  }

  const acctId = pick(head, ["BANKACCTFROM.ACCTID", "CCACCTFROM.ACCTID"]);
  if (!acctId) fail("NO_ACCOUNT", "The file names no account.");
  if (!lines.length) fail("NO_LINES", "The file has no transactions in it.");

  const out = lines.map((t) => {
    const fitid = String(t.FITID || "").trim();
    const date = ofxDate(t.DTPOSTED);
    if (!fitid || !date || t.TRNAMT == null) {
      fail("BAD_LINE", `A line in the file is missing its id, date or amount: ${JSON.stringify(t)}`);
    }
    return {
      fitid,
      date,
      amount_cents: toCents(String(t.TRNAMT)),
      type: String(t.TRNTYPE || "").trim().toUpperCase(),
      name: decodeOfxText(t.NAME),
      memo: decodeOfxText(t.MEMO),
    };
  });
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.fitid < b.fitid ? -1 : a.fitid > b.fitid ? 1 : 0));

  const bal = pick(head, ["LEDGERBAL.BALAMT"]);
  return {
    account_last4: acctId.replace(/\D/g, "").slice(-4),
    account_type: pick(head, ["BANKACCTFROM.ACCTTYPE"]) || (head["CCACCTFROM.ACCTID"] ? "CREDITCARD" : ""),
    currency: pick(head, ["STMTRS.CURDEF", "CCSTMTRS.CURDEF"]) || "USD",
    start: ofxDate(pick(head, ["BANKTRANLIST.DTSTART"])) || out[0].date,
    end: ofxDate(pick(head, ["BANKTRANLIST.DTEND"])) || out[out.length - 1].date,
    ledger_balance_cents: bal === "" ? null : toCents(String(bal)),
    ledger_date: ofxDate(pick(head, ["LEDGERBAL.DTASOF"])),
    lines: out,
  };
}
