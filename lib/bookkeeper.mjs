// lib/bookkeeper.mjs - the director of the read, phase2-spec.md §3
//
// Claude is the bookkeeper (D-003, docs/decisions.md "claude-judgment-not-scripts"):
// it reads the document with tools, decides what it is, where it posts, and whether
// it is a duplicate. This module owns exactly one thing - the manual tool-use loop
// that gets Claude from "here is an email/receipt" to one `decide` call - and does
// NOT decide anything itself. What comes back from `decide` is a claim, not a fact;
// lib/gate.mjs is what turns a `model.verdict` into something that is allowed to post.
//
// Modelled on the proven pattern in ../Recast-site/netlify/functions/
// receipts-ingest-background.mjs (read-only reference, never modified): a tool loop
// with adaptive extended thinking, `zoom` for a closer look at a photo, ledger/vendor/
// property/prior-document lookups instead of a pre-chewed context dump, and server-side
// web search for SKU identification. The rails here are stricter: every `decide` field
// is a strict-schema tool call (not a best-effort JSON parse of free text), and a
// document that does not end in a clean `decide` call always comes back `hold` -
// never a guessed verdict.

import { Jimp, JimpMime } from "jimp";
import { fromCents } from "./money.mjs";

// The prompt is a generated module (scripts/build-prompt.mjs) so it ships inside the
// Netlify function bundle. Never read it from disk here: Netlify's bundler injects its
// own __dirname shim and a runtime file read would miss the .md anyway.
import { SYSTEM_PROMPT } from "./bookkeeper-prompt.mjs";

export const MODEL_ID = "claude-opus-5";
export const MAX_TURNS = 24;
export const MAX_TOKENS_PER_TURN = 8000;

// phase2-spec.md §3 "zoom": upscale a small crop so its short side is at least this
// many px, and cap the long side at this many px (the API downsamples beyond it).
const ZOOM_MIN_EDGE = 800;
const ZOOM_MAX_EDGE = 1568;
// A crop below this fraction of the source on either side is almost certainly a
// mis-specified box (a single digit at that size is unreadable even zoomed).
const ZOOM_MIN_FRACTION = 0.02;

// ---- tool schemas (strict, phase2-spec.md §3) ------------------------------------

const DECIDE_ENTRY_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["account", "amount_cents", "description", "trade", "business_purpose"],
  properties: {
    account: { type: "string", description: "Chart-of-accounts code, e.g. \"1030\"" },
    amount_cents: { type: "integer", description: "What was paid for this item, including its share of tax/shipping" },
    description: { type: "string" },
    trade: { type: ["string", "null"], description: "Trade this line belongs to (e.g. \"Paint & Flooring\"), or null" },
    business_purpose: { type: ["string", "null"], description: "Required (non-empty) for accounts 6600, 6700, 6710, 6720; null otherwise" },
  },
};

const DECIDE_ENTRY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["date", "payee", "memo", "property", "paid_from", "items"],
  properties: {
    date: { type: "string", description: "YYYY-MM-DD" },
    payee: { type: "string" },
    memo: { type: "string" },
    property: { type: "string", description: "An exact name from list_properties, or \"OVERHEAD\"" },
    paid_from: { type: "string", description: "A 14xx bank account code, \"PAUL\", or \"DENNIS\"" },
    items: { type: "array", items: DECIDE_ENTRY_ITEM_SCHEMA },
  },
};

const DECIDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "verdict", "confidence", "why", "document_type", "vendor", "date",
    "receipt_total_cents", "subtotal_cents", "tax_cents",
    "paid_from", "paid_from_reason", "duplicate_of", "supersedes", "invoice_number", "entries",
  ],
  properties: {
    verdict: { type: "string", enum: ["post", "hold", "dismiss"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    why: { type: "string", description: "What you verified (or what is unresolved). The human-facing note." },
    document_type: { type: "string", enum: ["receipt", "invoice", "statement", "other"] },
    vendor: { type: "string" },
    date: { type: ["string", "null"], description: "YYYY-MM-DD, or null if unknown" },
    receipt_total_cents: { type: "integer" },
    subtotal_cents: { type: ["integer", "null"] },
    tax_cents: { type: ["integer", "null"] },
    paid_from: { type: ["string", "null"], description: "A 14xx bank account code, \"PAUL\", or \"DENNIS\"; null if you could not tell" },
    paid_from_reason: { type: "string", description: "What you saw, or which default you fell back to" },
    duplicate_of: { type: ["string", "null"], description: "txn_id or docId this document duplicates (verdict dismiss); null otherwise" },
    supersedes: { type: ["string", "null"], description: "txn_id this document is the corrected/final version of; null otherwise" },
    invoice_number: { type: ["string", "null"], description: "The vendor's invoice, receipt, order or transaction number exactly as printed (the most specific one), or null. Duplicates are recognised by this number." },
    entries: { type: "array", items: DECIDE_ENTRY_SCHEMA, description: "One proposed entry per property (OVERHEAD counts as one)" },
  },
};

function buildTools() {
  const clientTools = [
    {
      name: "zoom",
      description:
        "Crop a region of an image attachment and return it at full resolution. The image you were shown is downscaled; use this on any digits, small print, handwriting or faded text you cannot read with certainty. Coordinates are fractions of the image (0..1) measured from the top-left corner. Not available on PDF attachments (those are already shown at full quality).",
      strict: true,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["attachment", "x0", "y0", "x1", "y1"],
        properties: {
          attachment: { type: "integer", description: "Index of the attachment, as labeled [attachment N: ...]" },
          x0: { type: "number", description: "fraction of the image, 0 to 1 (clamped)" },
          y0: { type: "number", description: "fraction of the image, 0 to 1 (clamped)" },
          x1: { type: "number", description: "fraction of the image, 0 to 1 (clamped)" },
          y1: { type: "number", description: "fraction of the image, 0 to 1 (clamped)" },
        },
      },
    },
    {
      name: "read_ledger",
      description:
        "Recent Journal rows, most relevant first: date, payee, amount, account, property, txn_id, description. Use it to see how a vendor was categorized before and whether a charge is already recorded. Up to 80 rows.",
      strict: true,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["payee", "days", "property"],
        properties: {
          payee: { type: ["string", "null"], description: "Filter by payee, or null for any" },
          days: { type: ["integer", "null"], description: "Lookback window in days, default 60 when null" },
          property: { type: ["string", "null"], description: "Filter by property, or null for any" },
        },
      },
    },
    {
      name: "find_vendor",
      description:
        "Look up a vendor by name: its canonical name/aliases (case-insensitive substring match) and the 5 most recent Journal payees that match, with the accounts they posted to. Use this for categorization precedent when a vendor name is ambiguous.",
      strict: true,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string" },
        },
      },
    },
    {
      name: "list_properties",
      description:
        "The properties currently held or under contract (name, address, purchase date), plus the literal value OVERHEAD. This is the only valid set of `property` values - never invent one.",
      strict: true,
      input_schema: { type: "object", additionalProperties: false, required: [], properties: {} },
    },
    {
      name: "search_docs",
      description:
        "Prior documents this bookkeeper has processed (docId, status, vendor, date, total, txn_ids, verdict), filtered by vendor/amount/day-window. Use alongside read_ledger before deciding something is new, a duplicate, or a supersede.",
      strict: true,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["vendor", "amount_cents", "days"],
        properties: {
          vendor: { type: ["string", "null"] },
          amount_cents: { type: ["integer", "null"] },
          days: { type: ["integer", "null"], description: "Lookback window in days, default 90 when null" },
        },
      },
    },
    {
      name: "decide",
      description:
        "The only way to end the loop. Call this exactly once, last, with your full verdict. " +
        "A verdict of post MUST include at least one entry with at least one item whose amounts sum to receipt_total_cents; " +
        "a post with no entries is rejected and you will be asked to call decide again.",
      strict: true,
      input_schema: DECIDE_SCHEMA,
    },
  ];

  // Server tool, no client execution. cache_control on the last tool in the array
  // caches the whole (stable) tool list - the volatile document lives in `messages`.
  const webSearch = { type: "web_search_20260209", name: "web_search", max_uses: 5, cache_control: { type: "ephemeral" } };

  return [...clientTools, webSearch];
}

// ---- building the initial user message -------------------------------------------

function clean(v) {
  return v == null ? "" : String(v);
}

function toBuffer(bytes) {
  if (bytes == null) return null;
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes);
  if (typeof bytes === "string") return Buffer.from(bytes, "base64");
  return null;
}

async function tryConvertHeic(buffer) {
  try {
    const img = await Jimp.read(buffer);
    return await img.getBuffer(JimpMime.jpeg, { quality: 85 });
  } catch {
    return null;
  }
}

function buildHeaderText(envelope) {
  const lines = [
    "--- Document ---",
    `Source: ${clean(envelope?.source)}`,
    `Channel: ${clean(envelope?.channel)}`,
    `Subject: ${clean(envelope?.subject)}`,
    `From: ${clean(envelope?.from)}`,
    `Received: ${clean(envelope?.receivedAt)}`,
    `Today: ${clean(envelope?.today)}`,
    "",
    clean(envelope?.bodyText) || "(no email body text)",
  ];
  const ctx = envelope?.context;
  if (ctx) {
    lines.push("", "--- Payment instruments on file (match a card's last four digits to these) ---");
    for (const b of ctx.payment_instruments || []) {
      lines.push(`${clean(b.code)} ${clean(b.name)}${b.last4 ? ` - card/debit ending ${clean(b.last4)}` : " - no card number on file"}`);
    }
    const personal = Array.isArray(ctx.paul_personal_last4) ? ctx.paul_personal_last4 : [ctx.paul_personal_last4].filter(Boolean);
    lines.push(personal.length ? `PAUL (personal card, Due to owner) - ending ${personal.map(clean).join(", ")}` : "PAUL (personal card) - no card number on file");
    lines.push(`Defaults when no card is shown: overhead -> ${clean(ctx.default_paid_from_overhead) || "(unset)"}, property cost -> ${clean(ctx.default_paid_from_property) || "(unset)"}`);
  }
  return lines.join("\n");
}

/**
 * phase2-spec.md §3: attachments as base64 image/document blocks, labelled
 * "[attachment N: name]". Returns the content array for the first user message and
 * `shown` - the same-order list of attachments the model can address by index N via
 * `zoom` (an attachment that could not be shown, e.g. an unconverted HEIC photo, gets
 * a text note explaining why instead of a number, and is not zoomable).
 */
async function buildUserContent(envelope, attachments) {
  const parts = [{ type: "text", text: buildHeaderText(envelope) }];
  const shown = [];

  for (const att of attachments || []) {
    const name = clean(att?.name) || "attachment";
    let mime = clean(att?.mime).toLowerCase();
    let buffer = toBuffer(att?.bytes);

    if (!buffer || buffer.length === 0) {
      parts.push({ type: "text", text: `[attachment: ${name} - no data received, skipped]` });
      continue;
    }

    if (mime === "image/jpg") mime = "image/jpeg";

    if (mime === "image/heic" || mime === "image/heif") {
      const converted = await tryConvertHeic(buffer);
      if (converted) {
        buffer = converted;
        mime = "image/jpeg";
      } else {
        parts.push({
          type: "text",
          text: `[attachment: ${name} - a HEIC photo that could not be converted for viewing. If it might matter, hold and say so.]`,
        });
        continue;
      }
    }

    if (mime === "application/pdf") {
      const n = shown.length;
      shown.push({ name, mime, buffer, kind: "pdf" });
      parts.push({ type: "text", text: `[attachment ${n}: ${name} (PDF - zoom is not available on PDFs)]` });
      parts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } });
      continue;
    }

    if (/^image\/(jpeg|png|gif|webp)$/.test(mime)) {
      const n = shown.length;
      shown.push({ name, mime, buffer, kind: "image" });
      parts.push({ type: "text", text: `[attachment ${n}: ${name} - you may zoom on this one]` });
      parts.push({ type: "image", source: { type: "base64", media_type: mime, data: buffer.toString("base64") } });
      continue;
    }

    parts.push({ type: "text", text: `[attachment: ${name} - unsupported file type "${mime || "unknown"}", could not be shown]` });
  }

  return { content: parts, shown };
}

// ---- tool execution ----------------------------------------------------------------

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** phase2-spec.md §3 zoom sizing: upscale so the short side >= 800px, cap the long
 * side at <= 1568px. Pure so it is unit-testable without an image. */
export function computeZoomScale(width, height) {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  let scale = shortSide < ZOOM_MIN_EDGE ? ZOOM_MIN_EDGE / shortSide : 1;
  if (longSide * scale > ZOOM_MAX_EDGE) scale = ZOOM_MAX_EDGE / longSide;
  return scale;
}

async function toolZoom(input, { shown }) {
  const idx = Number(input?.attachment);
  const att = shown[idx];
  if (!att) return { ok: false, error: `No attachment ${input?.attachment} (there are ${shown.length} shown)` };
  if (att.kind === "pdf") return { ok: false, error: "zoom is not available on PDF attachments" };

  const x0 = clamp01(input?.x0);
  const y0 = clamp01(input?.y0);
  const x1 = clamp01(input?.x1);
  const y1 = clamp01(input?.y1);
  if (x1 - x0 < ZOOM_MIN_FRACTION || y1 - y0 < ZOOM_MIN_FRACTION) {
    return { ok: false, error: "Region too small - give a box at least 2% of the image on each side" };
  }

  const img = await Jimp.read(att.buffer);
  const W = img.width;
  const H = img.height;
  const x = Math.floor(x0 * W);
  const y = Math.floor(y0 * H);
  const w = Math.max(8, Math.min(W - x, Math.ceil((x1 - x0) * W)));
  const h = Math.max(8, Math.min(H - y, Math.ceil((y1 - y0) * H)));

  const crop = img.clone().crop({ x, y, w, h });
  const scale = computeZoomScale(crop.width, crop.height);
  if (scale !== 1) {
    crop.resize({ w: Math.max(1, Math.round(crop.width * scale)), h: Math.max(1, Math.round(crop.height * scale)) });
  }
  const out = await crop.getBuffer(JimpMime.jpeg, { quality: 85 });

  return {
    ok: true,
    content: [
      { type: "text", text: `Crop of attachment ${idx}: source ${W}x${H}px, region x=${x} y=${y} w=${w} h=${h}, returned at ${crop.width}x${crop.height}px.` },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: out.toString("base64") } },
    ],
  };
}

function formatLedgerRow(r) {
  const amount = r?.amount_cents != null ? fromCents(r.amount_cents) : clean(r?.amount);
  return [clean(r?.date), clean(r?.payee), amount, clean(r?.account), clean(r?.property), clean(r?.txn_id), clean(r?.description)].join(" · ");
}

async function toolReadLedger(input, { deps }) {
  const payee = input?.payee || undefined;
  const days = input?.days == null ? 60 : Number(input.days);
  const property = input?.property || undefined;
  const rows = (await deps.ledger.recent({ payee, days, property })) || [];
  const capped = rows.slice(0, 80);
  const note = rows.length > capped.length ? ` (showing the first ${capped.length})` : "";
  const text = capped.map(formatLedgerRow).join("\n");
  return { ok: true, content: [{ type: "text", text: `${rows.length} matching row(s)${note}:\n${text || "(none)"}` }] };
}

function formatVendorMatch(v) {
  const aliases = Array.isArray(v?.aliases) && v.aliases.length ? ` (aka ${v.aliases.join(", ")})` : "";
  const recent = Array.isArray(v?.recent) && v.recent.length
    ? "\n  recent: " + v.recent.map((r) => `${clean(r.date)} ${clean(r.payee)} -> ${clean(r.account)}`).join("; ")
    : "";
  return `${clean(v?.canonical ?? v?.name)}${aliases}${recent}`;
}

async function toolFindVendor(input, { deps }) {
  const query = clean(input?.query).trim();
  if (!query) return { ok: false, error: "query is required" };
  const matches = (await deps.vendors.search(query)) || [];
  if (!matches.length) return { ok: true, content: [{ type: "text", text: `No vendor matches for "${query}".` }] };
  return { ok: true, content: [{ type: "text", text: matches.map(formatVendorMatch).join("\n") }] };
}

async function toolListProperties(_input, { deps }) {
  const rows = (await deps.properties.list()) || [];
  const lines = rows.map((p) => `${clean(p.name)} - ${clean(p.address)}${p.purchase_date ? ` (acquired ${clean(p.purchase_date)})` : ""}`);
  lines.push("OVERHEAD - not tied to any property");
  return { ok: true, content: [{ type: "text", text: lines.join("\n") }] };
}

async function toolSearchDocs(input, { deps }) {
  const vendor = input?.vendor || undefined;
  const amount_cents = input?.amount_cents == null ? undefined : Number(input.amount_cents);
  const days = input?.days == null ? 90 : Number(input.days);
  const rows = (await deps.docs.search({ vendor, amount_cents, days })) || [];
  const lines = rows.map((d) => {
    const total = d.receipt_total_cents != null ? fromCents(d.receipt_total_cents) : "";
    const txns = Array.isArray(d.txn_ids) ? d.txn_ids.join(",") : "";
    return `${clean(d.docId)} | ${clean(d.status)} | ${clean(d.vendor)} | ${clean(d.date)} | ${total} | txns:${txns} | verdict:${clean(d.verdict)}`;
  });
  return { ok: true, content: [{ type: "text", text: `${rows.length} document(s):\n${lines.join("\n") || "(none)"}` }] };
}

async function runTool(name, input, ctx) {
  try {
    switch (name) {
      case "zoom":
        return await toolZoom(input, ctx);
      case "read_ledger":
        return await toolReadLedger(input, ctx);
      case "find_vendor":
        return await toolFindVendor(input, ctx);
      case "list_properties":
        return await toolListProperties(input, ctx);
      case "search_docs":
        return await toolSearchDocs(input, ctx);
      default:
        return { ok: false, error: `Unknown tool "${name}"` };
    }
  } catch (err) {
    return { ok: false, error: String(err?.message || err).slice(0, 400) };
  }
}

// ---- decide normalization -----------------------------------------------------------

function normalizeItem(it) {
  return {
    account: clean(it?.account),
    amount_cents: Number.isFinite(Number(it?.amount_cents)) ? Number(it.amount_cents) : 0,
    description: clean(it?.description),
    trade: clean(it?.trade),
    business_purpose: clean(it?.business_purpose),
  };
}

function normalizeEntry(e) {
  return {
    date: clean(e?.date),
    payee: clean(e?.payee),
    memo: clean(e?.memo),
    property: clean(e?.property),
    paid_from: clean(e?.paid_from),
    items: Array.isArray(e?.items) ? e.items.map(normalizeItem) : [],
  };
}

// Observed 2026-09-11: the model's structured output occasionally runs one string
// field into the next, so a field such as supersedes arrives carrying a tag-like
// marker followed by the serialized remainder of the call (often the entries array).
// Repair deterministically: cut every string at the first marker and recover any
// swallowed field whose JSON is still legible. The repair is noted in `why`.
const TAG_MARKER = /<\/?\s*antml[^\s>]*parameter|<\/?\s*parameter\b/i;
const SWALLOWED_FIELD = /name=["']([a-z_]+)["']\s*>\s*([\s\S]*?)(?=<\/?\s*antml[^\s>]*parameter|<\/?\s*parameter\b|$)/gi;
const REF_OK = /^[A-Za-z0-9][A-Za-z0-9_.:-]{3,120}$/;

export function repairDecideInput(input) {
  if (!input || typeof input !== "object") return { input, repaired: false, notes: [] };
  const out = { ...input };
  const notes = [];
  let repaired = false;
  for (const [key, value] of Object.entries(out)) {
    if (typeof value !== "string") continue;
    const m = TAG_MARKER.exec(value);
    if (!m) continue;
    repaired = true;
    const tail = value.slice(m.index);
    out[key] = value.slice(0, m.index).trim();
    notes.push(`repaired field ${key}`);
    let sw;
    SWALLOWED_FIELD.lastIndex = 0;
    while ((sw = SWALLOWED_FIELD.exec(tail)) !== null) {
      const [, name, raw] = sw;
      if (!(name in DECIDE_SCHEMA.properties)) continue;
      const text = raw.trim();
      if (!text) continue;
      let parsed = text;
      if (/^[\[{]/.test(text)) {
        try { parsed = JSON.parse(text); } catch { continue; }
      } else if (/^-?\d+$/.test(text)) {
        parsed = Number(text);
      } else if (text === "null") {
        parsed = null;
      }
      const empty = out[name] == null || out[name] === "" || (Array.isArray(out[name]) && out[name].length === 0);
      if (empty) { out[name] = parsed; notes.push(`recovered ${name}`); }
    }
  }
  return { input: out, repaired, notes };
}

function normalizeDecide(rawInput) {
  const { input, repaired, notes } = repairDecideInput(rawInput);
  const verdict = ["post", "hold", "dismiss"].includes(input?.verdict) ? input.verdict : "hold";
  const confidence = ["high", "medium", "low"].includes(input?.confidence) ? input.confidence : "low";
  const out = {
    verdict,
    confidence,
    why: clean(input?.why),
    document_type: clean(input?.document_type),
    vendor: clean(input?.vendor),
    date: clean(input?.date),
    receipt_total_cents: Number.isFinite(Number(input?.receipt_total_cents)) ? Number(input.receipt_total_cents) : 0,
    subtotal_cents: input?.subtotal_cents == null ? null : Number(input.subtotal_cents),
    tax_cents: input?.tax_cents == null ? null : Number(input.tax_cents),
    paid_from: clean(input?.paid_from),
    paid_from_reason: clean(input?.paid_from_reason),
    // A reference that is not shaped like an id is never acted on (no void, no dismiss-as-duplicate).
    duplicate_of: REF_OK.test(clean(input?.duplicate_of)) ? clean(input.duplicate_of) : "",
    supersedes: REF_OK.test(clean(input?.supersedes)) ? clean(input.supersedes) : "",
    invoice_number: clean(input?.invoice_number).slice(0, 80),
    entries: Array.isArray(input?.entries) ? input.entries.map(normalizeEntry) : [],
  };
  if (repaired) out.why = `${out.why} [output repaired: ${notes.join(", ")}]`.trim();
  return out;
}

function holdModel(why) {
  return {
    verdict: "hold",
    confidence: "low",
    why,
    document_type: "",
    vendor: "",
    date: "",
    receipt_total_cents: 0,
    subtotal_cents: null,
    tax_cents: null,
    paid_from: "",
    paid_from_reason: "",
    duplicate_of: "",
    supersedes: "",
    entries: [],
  };
}

function accumulateUsage(totals, usage) {
  if (!usage) return;
  totals.input_tokens += usage.input_tokens || 0;
  totals.output_tokens += usage.output_tokens || 0;
  totals.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
  totals.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
}

function summarizeToolInput(input) {
  try {
    const s = JSON.stringify(input);
    return s && s.length > 160 ? s.slice(0, 160) + "..." : s;
  } catch {
    return "";
  }
}

function parseToolInput(block) {
  if (block.input == null) return {};
  if (typeof block.input === "string") return JSON.parse(block.input);
  return block.input;
}

/**
 * phase2-spec.md §3: run the manual tool-use loop to a `decide` call (or a forced
 * `hold` when the loop ends any other way) and return the raw material the gate and
 * the functions layer need.
 *
 * @param {{envelope: object, attachments: Array<{name:string, mime:string, bytes: any}>, deps: object}} args
 * @param {object} args.deps injected: { anthropic, ledger, vendors, properties, accounts, settings, docs, now }
 * @returns {Promise<{model: object, transcript_summary: string, usage: object}>}
 */
export async function runBookkeeper({ envelope, attachments, deps }) {
  const { content: initialContent, shown } = await buildUserContent({ ...envelope, today: deps?.now }, attachments);
  const messages = [{ role: "user", content: initialContent }];
  const tools = buildTools();
  const system = [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }];

  const toolCtx = { shown, deps, envelope };
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, turns: 0 };
  const transcript = [];

  const finish = (model) => ({ model, transcript_summary: transcript.join("\n"), usage });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    usage.turns = turn + 1;

    let res;
    try {
      res = await deps.anthropic.messages.create({
        model: MODEL_ID,
        max_tokens: MAX_TOKENS_PER_TURN,
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system,
        tools,
        messages,
      });
    } catch (err) {
      const msg = String(err?.message || err);
      transcript.push(`turn ${turn + 1}: request failed - ${msg}`);
      return finish(holdModel(`The Anthropic API call failed: ${msg}`));
    }

    accumulateUsage(usage, res?.usage);

    if (res.stop_reason === "refusal") {
      const category = res.stop_details?.category || "unspecified";
      const explanation = res.stop_details?.explanation || "";
      transcript.push(`turn ${turn + 1}: refusal (${category})`);
      return finish(holdModel(`Claude declined to process this document (category: ${category}). ${explanation}`.trim()));
    }

    if (res.stop_reason === "max_tokens") {
      transcript.push(`turn ${turn + 1}: hit max_tokens before finishing`);
      return finish(holdModel("Claude's response hit the max_tokens limit before it could call decide. Needs a human look."));
    }

    if (res.stop_reason === "pause_turn") {
      // A server tool (web_search) needs another turn to continue; nothing for us to
      // execute - just carry the turn forward.
      transcript.push(`turn ${turn + 1}: pause_turn (server tool continuing)`);
      messages.push({ role: "assistant", content: res.content });
      continue;
    }

    if (res.stop_reason !== "tool_use") {
      // end_turn / stop_sequence with no decide call: the model stopped talking
      // without finishing. Never invent a verdict from prose.
      transcript.push(`turn ${turn + 1}: stopped (${res.stop_reason}) without calling decide`);
      return finish(holdModel(`Claude stopped (${res.stop_reason}) without calling decide. Needs a human look.`));
    }

    messages.push({ role: "assistant", content: res.content });

    const toolUseBlocks = res.content.filter((b) => b.type === "tool_use");
    const results = [];
    let decideInput = null;

    for (const block of toolUseBlocks) {
      let input;
      try {
        input = parseToolInput(block);
      } catch (err) {
        transcript.push(`turn ${turn + 1}: ${block.name} - bad tool input JSON`);
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: [{ type: "text", text: `Error: could not parse tool input: ${err.message}` }],
          is_error: true,
        });
        continue;
      }

      transcript.push(`turn ${turn + 1}: ${block.name}(${summarizeToolInput(input)})`);

      if (block.name === "decide") {
        // Rail: every verdict needs a verb downstream. A "post" with nothing to post is
        // bounced back to the model instead of silently becoming a hold.
        const entriesOk = Array.isArray(input?.entries) && input.entries.some((e) => Array.isArray(e?.items) && e.items.length > 0);
        if (input?.verdict === "post" && !entriesOk) {
          transcript.push(`turn ${turn + 1}: decide(post) had no entries - bounced back`);
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: [{ type: "text", text: "Rejected: verdict \"post\" requires entries[] with at least one item whose amount_cents sum to receipt_total_cents. Call decide again with the entries (account, amount_cents, description per item; property and paid_from per entry), or use verdict \"hold\" if you cannot itemize." }],
          });
          continue;
        }
        decideInput = input;
        results.push({ type: "tool_result", tool_use_id: block.id, content: [{ type: "text", text: "Recorded." }] });
        continue;
      }

      const outcome = await runTool(block.name, input, toolCtx);
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: outcome.ok ? outcome.content : [{ type: "text", text: `Error: ${outcome.error}` }],
        is_error: !outcome.ok,
      });
    }

    if (decideInput) {
      const model = normalizeDecide(decideInput);
      transcript.push(`turn ${turn + 1}: decide -> ${model.verdict} (${model.confidence})`);
      return finish(model);
    }

    // All tool_use blocks in this turn get their tool_results back in ONE user message.
    messages.push({ role: "user", content: results });
  }

  transcript.push(`hit MAX_TURNS (${MAX_TURNS}) without a decide call`);
  return finish(holdModel(`The bookkeeper used all ${MAX_TURNS} tool turns without reaching a decision. Needs a human look.`));
}
