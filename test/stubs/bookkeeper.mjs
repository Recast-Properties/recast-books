// test/stubs/bookkeeper.mjs — NOT imported by any production or test code in this
// repo. See test/stubs/gate.mjs's header comment for why this exists and how it is
// meant to be used (a scratch-copy dev aid, never lib/bookkeeper.mjs in this
// project's real lib/ directory).
//
// Matches this task's exact contract:
//   runBookkeeper({envelope, attachments, deps}) -> {model, transcript_summary, usage}
//   buildEntriesFromModel(model, ctx, {posted_by, doc_url, allow_duplicate_hash}) -> entries[]
//
// runBookkeeper here never calls a real model or touches `deps` (no zoom/read_ledger/
// find_vendor/list_properties/search_docs/web_search tool loop, no
// lib/bookkeeper-prompt.md) - it always returns a "hold", so a document exercised
// against it in a scratch copy always lands in Pending rather than posting. That is
// deliberate: this stub's only job is to let
// netlify/functions/books-ingest-background.mjs and books-inbox.mjs be run end to
// end before the real module lands, not to approximate its judgment.
//
// buildEntriesFromModel DOES do real work: it runs each proposed entry through the
// real posting engine (lib/posting.mjs's buildEntry, "purchase" intent), so a
// scratch-copy exercise of the approve path (which supplies its own model.entries)
// still gets genuine balanced-entry validation.

import { buildEntry } from "../../lib/posting.mjs";

export async function runBookkeeper({ envelope }) {
  const model = {
    verdict: "hold",
    confidence: "low",
    why: "stub bookkeeper (test/stubs/bookkeeper.mjs) - no real judgment implemented",
    document_type: "other",
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
  return {
    model,
    transcript_summary: [`stub: envelope ${envelope && envelope.docId} held without a real read`],
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 },
  };
}

export function buildEntriesFromModel(model, ctx, { posted_by, doc_url, allow_duplicate_hash } = {}) {
  const entries = (model && model.entries) || [];
  return entries.map((proposed) =>
    buildEntry(
      {
        type: "purchase",
        date: proposed.date,
        payee: proposed.payee,
        memo: proposed.memo,
        property: proposed.property,
        paid_from: proposed.paid_from,
        items: proposed.items,
        doc_url,
        source: "receipt",
        posted_by,
        allow_duplicate_hash,
      },
      ctx,
    ),
  );
}
