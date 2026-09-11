// netlify/functions/books-ingest-background.mjs — path /api/ingest-bg — phase2-spec.md
// section 5. Netlify BACKGROUND function (the "-background" filename suffix is what
// gives it the longer execution budget and an immediate 202 to its caller — see
// ../../../Recast-site/netlify/functions/receipts-ingest-background.mjs, the proven
// reference this mirrors for the async-invocation shape and the "never leave a half
// state" envelope discipline).
//
// Invoked by books-upload.mjs (after a document lands) or by books-inbox.mjs's
// `reprocess` verb, always with header x-poller-secret. Body: {docId}.
//
// Loads the envelope + attachment bytes, builds `deps` for runBookkeeper from the
// writer (lib/bookkeeper.mjs and lib/gate.mjs — see this file's header comment in
// the task brief: those two modules are being written concurrently by another agent
// and are imported here by their real paths, never stubbed in this file; if they are
// missing on disk this import throws at module load, which is expected until that
// agent's work lands), runs the tool-directed read, evaluates the deterministic
// gate, and executes exactly one of: post (file to Drive, optionally void a
// superseded entry, buildEntriesFromModel, postBatch) / hold -> pending / dismiss ->
// dismissed / dry -> file to Drive under _dry-runs, nothing written to the workbook.
// The envelope is rewritten at every status transition and never left half-written.

import {
  requireConfig,
  json,
  getWriter,
  getDocsStore,
  getPostingCtx,
  invalidateJournalCache,
  pollerSecretOk,
  rowsToObjectsPublic,
  todayChicago,
  storeAttachmentsToDrive,
  WriterError,
} from "./_shared.mjs";
import { runBookkeeper } from "../../lib/bookkeeper.mjs";
import { evaluateGate, buildEntriesFromModel } from "../../lib/gate.mjs";
import { toCents } from "../../lib/money.mjs";
import Anthropic from "@anthropic-ai/sdk";

const LEDGER_WINDOW_DAYS = 60;
const DOC_SEARCH_CAP = 40;
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
// A postBatch/void failure with one of these codes is a client-fixable conflict
// (retry later, or a human reviews it) -> the item waits in Pending with the reason
// attached, rather than the whole ingest surfacing as a hard "error" (task brief:
// "Add postBatch-aware error mapping (DUPLICATE/PERIOD_CLOSED -> pending with
// reason)"; ALREADY_VOIDED/NOT_FOUND are the equivalent conflict codes for the
// supersede void call this same posting path can make).
const PENDING_ON_WRITER_CODES = new Set(["DUPLICATE", "PERIOD_CLOSED", "ALREADY_VOIDED", "NOT_FOUND"]);

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ---- deps builders (phase2-spec.md section 3's client tools read through these) --

/** Flat, line-level rows (not grouped by entry) - what read_ledger's compact format needs. */
function flattenJournalLines(headers, rows) {
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const get = (row, name) => (idx[name] !== undefined ? row[idx[name]] : "");
  return rows.map((row) => {
    const debit = toCents(get(row, "debit") || 0);
    const credit = toCents(get(row, "credit") || 0);
    return {
      txn_id: String(get(row, "txn_id") || ""),
      date: String(get(row, "date") || ""),
      account: String(get(row, "account") || ""),
      amount_cents: debit - credit, // signed: positive on the debit line, negative on the credit line
      property: String(get(row, "property") || ""),
      payee: String(get(row, "payee") || ""),
      description: String(get(row, "description") || ""),
      source: String(get(row, "source") || ""),
      void_of: String(get(row, "void_of") || ""),
    };
  });
}

function makeLedgerDep(lines) {
  return {
    recent({ payee = "", days = LEDGER_WINDOW_DAYS, property = "" } = {}) {
      // The pre-fetch below is already scoped to LEDGER_WINDOW_DAYS; a caller asking
      // for a longer window still gets at most that much (see this task's report).
      const cutoff = isoDaysAgo(Math.min(days, LEDGER_WINDOW_DAYS));
      return lines
        .filter((l) => l.date >= cutoff)
        .filter((l) => !payee || l.payee.toLowerCase().includes(payee.toLowerCase()))
        .filter((l) => !property || l.property === property)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 80);
    },
  };
}

/**
 * Posted (non-void) entries in the same window, collapsed from lines to one row per
 * txn_id, for the gate's twin rail (phase2-spec.md section 4, condition 9). Void
 * mirror rows are excluded so a void never reads as a false twin of its original.
 */
function buildPostedEntries(lines) {
  const byTxn = new Map();
  for (const l of lines) {
    if (l.source === "void" || l.void_of) continue;
    if (!byTxn.has(l.txn_id)) {
      byTxn.set(l.txn_id, { txn_id: l.txn_id, date: l.date, payee: "", property: l.property, total_cents: 0 });
    }
    const e = byTxn.get(l.txn_id);
    if (!e.payee && l.payee) e.payee = l.payee;
    if (l.amount_cents > 0) e.total_cents += l.amount_cents;
  }
  return [...byTxn.values()];
}

/**
 * find_vendor tool contract (lib/bookkeeper.mjs's toolFindVendor calls
 * `deps.vendors.search(query)` and expects `[{canonical, aliases:[...],
 * recent:[{date, payee, account}, ...]}]`, per its formatVendorMatch): Vendors rows
 * whose canonical or aliases match (case-insensitive substring), each enriched with
 * up to 5 recent Journal lines for that vendor, PLUS any recent Journal payee that
 * matches the query but has no Vendors row at all (a payee never added to Vendors),
 * surfaced as its own synthetic match so a first-time vendor still shows ledger
 * history. See this task's report for this reading of "Vendors rows... + the 5 most
 * recent Journal payees that match, with their accounts" (phase2-spec.md section 3).
 */
function makeVendorsDep(vendorRows, journalLines) {
  const recentFor = (matchName) =>
    journalLines
      .filter((l) => l.payee && l.payee.toLowerCase() === matchName.toLowerCase())
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .slice(0, 5)
      .map((l) => ({ date: l.date, payee: l.payee, account: l.account }));

  return {
    async search(query) {
      const q = String(query || "").toLowerCase();
      if (!q) return [];

      const rowMatches = vendorRows.filter((v) => {
        const canonical = String(v.canonical || "").toLowerCase();
        const aliases = String(v.aliases || "").toLowerCase();
        return canonical.includes(q) || aliases.includes(q);
      });
      const matched = new Set(rowMatches.map((v) => String(v.canonical || "").toLowerCase()));

      const out = rowMatches.map((v) => ({
        canonical: v.canonical,
        aliases: String(v.aliases || "")
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        recent: recentFor(v.canonical),
      }));

      const unregisteredPayees = [
        ...new Set(
          journalLines
            .filter((l) => l.payee && l.payee.toLowerCase().includes(q) && !matched.has(l.payee.toLowerCase()))
            .map((l) => l.payee),
        ),
      ].slice(0, 5);
      for (const payee of unregisteredPayees) {
        out.push({ canonical: payee, aliases: [], recent: recentFor(payee) });
      }

      return out;
    },
  };
}

/** list_properties tool contract (`deps.properties.list()`): registry rows with
 * status held/under contract only - OVERHEAD is appended by bookkeeper.mjs itself. */
function makePropertiesDep(writer) {
  return {
    async list() {
      const resp = await writer.read("Properties");
      const rows = rowsToObjectsPublic(resp.headers, resp.rows);
      return rows
        .filter((r) => r.status === "held" || r.status === "under contract")
        .map((r) => ({ name: r.name, address: r.address, purchase_date: r.purchase_date }));
    },
  };
}

async function loadVendorRows(writer) {
  const resp = await writer.read("Vendors");
  return rowsToObjectsPublic(resp.headers, resp.rows);
}

async function loadSettingsMap(writer) {
  const resp = await writer.read("Settings");
  const rows = rowsToObjectsPublic(resp.headers, resp.rows);
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

/** search_docs tool: prior envelopes matching vendor/amount within `days`, self excluded. */
async function searchDocs(docsStore, { vendor = "", amount_cents, days = 90 } = {}, excludeDocId) {
  const { blobs } = await docsStore.list({ prefix: "doc/" });
  const cutoffMs = Date.now() - days * 86400000;
  const out = [];
  for (const b of blobs || []) {
    if (out.length >= DOC_SEARCH_CAP) break;
    const id = b.key.slice("doc/".length);
    if (id === excludeDocId) continue;
    const env = await docsStore.get(b.key, { type: "json" });
    if (!env || !env.model) continue;
    const when = Date.parse(env.finishedAt || env.startedAt || "") || 0;
    if (when && when < cutoffMs) continue;
    if (vendor && !String(env.model.vendor || "").toLowerCase().includes(vendor.toLowerCase())) continue;
    if (Number.isFinite(amount_cents) && env.model.receipt_total_cents !== amount_cents) continue;
    out.push({
      docId: env.docId,
      status: env.status,
      vendor: env.model.vendor || "",
      date: env.model.date || "",
      receipt_total_cents: env.model.receipt_total_cents ?? 0,
      txn_ids: (env.result && env.result.txn_ids) || [],
      verdict: env.model.verdict || "",
    });
  }
  return out;
}

async function loadAttachmentBytes(docsStore, envelope) {
  const out = [];
  for (const att of envelope.attachments || []) {
    const base64 = await docsStore.get(att.key, { type: "text" });
    if (!base64) continue;
    // phase2-spec.md section 3: attachments: [{name, mime, bytes}] - `bytes` here is
    // the attachment's actual content (base64), not a byte count, since runBookkeeper
    // needs real image/PDF data to show the model and to crop for the zoom tool. See
    // this task's report for this interpretation.
    out.push({ name: att.name, mime: att.mime, bytes: base64 });
  }
  return out;
}

// ---- Drive filing helper ----------------------------------------------------------

/** Folder path for a real post: ["<year>", "<property or OVERHEAD>"], from the
 * model's own first proposed entry - filed before the posting-engine entries are
 * built, since only the model's proposedEntry carries date/property at this point. */
function postFolderFor(model) {
  const first = (model.entries || [])[0] || {};
  const year = (first.date || todayChicago()).slice(0, 4);
  const property = first.property || "OVERHEAD";
  return [year, property];
}

// ---- writer-error -> pending mapping ----------------------------------------------

function isPendingWorthy(err) {
  return err instanceof WriterError && PENDING_ON_WRITER_CODES.has(err.code);
}

export default async (req) => {
  const configErr = requireConfig(["WRITER_URL", "WRITER_SECRET", "ANTHROPIC_API_KEY", "POLLER_SECRET"]);
  if (configErr) return configErr;

  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  if (!pollerSecretOk(req)) return json(401, { error: "UNAUTHORIZED" });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "BAD_REQUEST", message: "expected a JSON body" });
  }

  const docId = String(body.docId || "");
  if (!docId || !DOC_ID_RE.test(docId)) {
    return json(400, { error: "BAD_REQUEST", message: "docId is required" });
  }

  const docsStore = getDocsStore();
  const envelopeKey = `doc/${docId}`;
  const writer = getWriter();

  const envelope = await docsStore.get(envelopeKey, { type: "json" });
  if (!envelope) return json(404, { error: "NOT_FOUND", message: `no envelope for docId ${docId}` });

  try {
    const attachmentsForModel = await loadAttachmentBytes(docsStore, envelope);

    const [ctx, journalResp, vendorRows, settings] = await Promise.all([
      getPostingCtx(writer),
      writer.read("Journal", { since: isoDaysAgo(LEDGER_WINDOW_DAYS), limit: 20000 }),
      loadVendorRows(writer),
      loadSettingsMap(writer),
    ]);

    const journalLines = flattenJournalLines(journalResp.headers, journalResp.rows);
    const ledger = makeLedgerDep(journalLines);
    const postedEntries = buildPostedEntries(journalLines);
    const vendors = makeVendorsDep(vendorRows, journalLines);
    const properties = makePropertiesDep(writer);
    const docs = { search: (opts) => searchDocs(docsStore, opts, docId) };
    const anthropic = new Anthropic();

    // lib/bookkeeper.mjs's exact deps contract: {anthropic, ledger, vendors,
    // properties, accounts, settings, docs, now} - `now` is the "Today:" date shown
    // to the model (see buildUserContent's `envelope.today = deps.now`); `accounts`/
    // `settings` are not read directly by the tool loop today (the chart of
    // accounts and paid_from defaults are baked into lib/bookkeeper-prompt.md) but
    // are still supplied per the task brief's deps shape, for forward compatibility.
    const deps = { ledger, vendors, properties, accounts: ctx.accounts, settings, docs, anthropic, now: ctx.today };

    // task brief's exact contract: runBookkeeper({envelope, attachments, deps}) ->
    // {model, transcript_summary, usage}.
    const { model, transcript_summary, usage } = await runBookkeeper({
      envelope,
      attachments: attachmentsForModel,
      deps,
    });

    const gateResult = evaluateGate(model, ctx, settings, { postedEntries });

    // Everything from here down (dry/dismiss/post/hold, Drive filing, void+post,
    // postBatch error mapping) is the deterministic part - split into
    // processDecision() below, which never calls runBookkeeper/evaluateGate/
    // Anthropic itself, so test/books-ingest-background.test.mjs can exercise every
    // branch of it directly with hand-built model/gate fixtures and zero network
    // calls (see that file's header comment for why: a real end-to-end test here
    // would otherwise require faking Anthropic's wire protocol, which risks either
    // an unmaintainable fake or, worse, an accidental real paid API call).
    const finalEnvelope = await processDecision({
      envelope,
      docId,
      model,
      transcript_summary,
      usage,
      gateResult,
      ctx,
      writer,
      docsStore,
    });
    return json(200, { docId, status: finalEnvelope.status });
  } catch (err) {
    // Re-read rather than reuse the pre-fetch `envelope` const: processDecision may
    // have already saved model/gate (or even a "pending" transition, on a
    // postBatch error not worth downgrading to pending) before throwing, and this
    // must not clobber that with a stale copy.
    const current = (await docsStore.get(envelopeKey, { type: "json" }).catch(() => null)) || envelope;
    const errored = {
      ...current,
      status: "error",
      error: String((err && err.message) || err),
      error_stack: String((err && err.stack) || "").split("\n").slice(0, 6).join("\n"),
      finishedAt: new Date().toISOString(),
    };
    try {
      await docsStore.setJSON(envelopeKey, errored);
    } catch {
      // best-effort only - the last successfully-saved envelope is still the trail
    }
    return json(200, { docId, status: "error" });
  }
};

/**
 * The deterministic half of ingest: given an already-computed `model` (from
 * runBookkeeper) and `gateResult` (from evaluateGate), rewrites the envelope
 * through exactly one terminal transition (dry / dismissed / posted / pending /
 * error) and returns the final envelope. Exported so it can be tested directly with
 * hand-built model/gate fixtures - see this file's default export for how it's
 * wired into the real flow.
 */
export async function processDecision({
  envelope: initialEnvelope,
  docId,
  model,
  transcript_summary,
  usage,
  gateResult,
  ctx,
  writer,
  docsStore,
}) {
  let envelope = initialEnvelope;
  const envelopeKey = `doc/${docId}`;
  const save = async (patch) => {
    envelope = { ...envelope, ...patch };
    await docsStore.setJSON(envelopeKey, envelope);
    return envelope;
  };

  // envelope.model (phase2-spec.md section 1) folds in usage/transcript_summary
  // alongside the decide() fields runBookkeeper returned as `model` - see this
  // task's report for why the two return shapes are merged this way.
  await save({ model: { ...model, usage, transcript_summary } });
  await save({ gate: gateResult });

  // ---- dry run: gate computed, filed to Drive under _dry-runs, nothing posted ----
  if (envelope.dryRun) {
    const filed = await storeAttachmentsToDrive(writer, docsStore, envelope, ["_dry-runs"]);
    return save({
      status: "dry",
      result: { txn_ids: [], rows: null, doc_url: filed[0]?.url || "" },
      finishedAt: new Date().toISOString(),
    });
  }

  // ---- dismiss: the model is certain this document is already on the books ----
  if (model.verdict === "dismiss" && model.duplicate_of) {
    return save({
      status: "dismissed",
      result: { txn_ids: [], rows: null, doc_url: "" },
      finishedAt: new Date().toISOString(),
    });
  }

  // ---- post: verdict "post" and every gate condition holds (a valid `supersedes`
  // naming a posted txn_id is gate.mjs's job to treat as passing, per spec section 4) --
  if (model.verdict === "post" && gateResult.passed) {
    try {
      const folder = postFolderFor(model);
      const filed = await storeAttachmentsToDrive(writer, docsStore, envelope, folder);
      const doc_url = filed[0]?.url || "";

      if (model.supersedes) {
        await writer.void(model.supersedes, `superseded by ${docId}`, todayChicago(), "claude");
      }

      const entries = buildEntriesFromModelSafe(model, ctx, {
        posted_by: "claude",
        doc_url,
        allow_duplicate_hash: false,
      });

      const postResult = await writer.postBatch(entries);
      invalidateJournalCache();

      return save({
        status: "posted",
        result: { txn_ids: entries.map((e) => e.txn_id), rows: postResult.rows, doc_url },
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (isPendingWorthy(err)) {
        return save({
          status: "pending",
          gate: { passed: false, reasons: [...(envelope.gate?.reasons || []), `${err.code}: ${err.message}`] },
          finishedAt: new Date().toISOString(),
        });
      }
      throw err;
    }
  }

  // ---- hold, or a "post" verdict the gate refused, or a malformed dismiss with no
  // duplicate_of: waits for a human, with the model's why and the gate's reasons ----
  return save({
    status: "pending",
    result: { txn_ids: [], rows: null, doc_url: "" },
    finishedAt: new Date().toISOString(),
  });
}

// buildEntriesFromModel (lib/gate.mjs) is expected to already run every
// posting-engine check (gate condition 8), but this thin wrapper is a last-resort
// net: a throw here still lands the item in processDecision's caller as a labeled
// "error" status rather than crashing the invocation with no envelope update at
// all. Deliberately not wrapped in its own try/catch here - the throw propagates on
// purpose: buildEntriesFromModel failing after the gate passed is a real bug worth
// surfacing loudly, not silently downgrading to "pending".
function buildEntriesFromModelSafe(model, ctx, opts) {
  return buildEntriesFromModel(model, ctx, opts);
}

// The "-background" filename suffix (not this config) is what makes Netlify invoke
// this as a background function (immediate 202, ~15 min budget); the custom path
// just matches the route name books-upload.mjs and books-inbox.mjs POST to.
export const config = { path: "/api/ingest-bg" };

