import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateGate, buildEntriesFromModel } from "../lib/gate.mjs";
import { PostingError, makeCtx } from "../lib/posting.mjs";

function baseCtx(overrides = {}) {
  return makeCtx({
    properties: new Set(["881 Newport", "1616 Granite"]),
    periods: new Map([["2026-09", "open"]]),
    today: "2026-09-11",
    ...overrides,
  });
}

function baseSettings(overrides = {}) {
  return { autofile_ceiling_cents: 50000, ...overrides };
}

function baseEntry(overrides = {}) {
  return {
    date: "2026-09-05",
    payee: "Home Depot",
    memo: "Home Depot - Drywall panel",
    property: "881 Newport",
    paid_from: "1401",
    items: [
      { account: "1030", amount_cents: 21240, description: "Drywall panel", trade: "Paint & Flooring", business_purpose: "" },
    ],
    ...overrides,
  };
}

function baseModel(overrides = {}) {
  return {
    verdict: "post",
    confidence: "high",
    why: "Zoomed the total, reconciled to the cent, checked read_ledger for a twin.",
    document_type: "receipt",
    vendor: "Home Depot",
    date: "2026-09-05",
    receipt_total_cents: 21240,
    subtotal_cents: null,
    tax_cents: null,
    paid_from: "1401",
    paid_from_reason: "card ending 4471 matches Bank accounts 1401",
    duplicate_of: "",
    supersedes: "",
    entries: [baseEntry()],
    ...overrides,
  };
}

// --- baseline: everything holds ---------------------------------------------

test("a fully-valid post verdict passes with no reasons", () => {
  const result = evaluateGate(baseModel(), baseCtx(), baseSettings(), { postedEntries: [] });
  assert.deepEqual(result, { passed: true, reasons: [] });
});

test("evaluateGate defaults postedEntries to empty when opts is omitted", () => {
  const result = evaluateGate(baseModel(), baseCtx(), baseSettings());
  assert.equal(result.passed, true);
});

// --- condition 1: verdict + confidence --------------------------------------

test("NOT_POST_VERDICT: a hold verdict never passes", () => {
  const result = evaluateGate(baseModel({ verdict: "hold" }), baseCtx(), baseSettings());
  assert.equal(result.passed, false);
  assert.ok(result.reasons.includes("NOT_POST_VERDICT"));
  assert.ok(!result.reasons.includes("LOW_CONFIDENCE"));
});

test("NOT_POST_VERDICT: a dismiss verdict never passes", () => {
  const result = evaluateGate(baseModel({ verdict: "dismiss" }), baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("NOT_POST_VERDICT"));
});

test("LOW_CONFIDENCE: medium confidence never autofiles, even with verdict post", () => {
  const result = evaluateGate(baseModel({ confidence: "medium" }), baseCtx(), baseSettings());
  assert.equal(result.passed, false);
  assert.ok(result.reasons.includes("LOW_CONFIDENCE"));
  assert.ok(!result.reasons.includes("NOT_POST_VERDICT"));
});

test("LOW_CONFIDENCE: low confidence never autofiles", () => {
  const result = evaluateGate(baseModel({ confidence: "low" }), baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("LOW_CONFIDENCE"));
});

// --- condition 2: vendor + date ----------------------------------------------

test("MISSING_VENDOR: an empty vendor fails", () => {
  const result = evaluateGate(baseModel({ vendor: "" }), baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("MISSING_VENDOR"));
});

test("MISSING_VENDOR: a whitespace-only vendor fails", () => {
  const result = evaluateGate(baseModel({ vendor: "   " }), baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("MISSING_VENDOR"));
});

test("MISSING_DATE: an empty date fails", () => {
  const result = evaluateGate(baseModel({ date: "" }), baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("MISSING_DATE"));
  assert.ok(!result.reasons.includes("BAD_DATE"));
});

test("BAD_DATE: an invalid calendar date fails", () => {
  const result = evaluateGate(baseModel({ date: "2026-13-40" }), baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("BAD_DATE"));
});

test("BAD_DATE: a future date fails", () => {
  const result = evaluateGate(baseModel({ date: "2026-12-25" }), baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("BAD_DATE"));
});

test("a date equal to today is allowed", () => {
  const result = evaluateGate(baseModel({ date: "2026-09-11" }), baseCtx(), baseSettings());
  assert.ok(!result.reasons.includes("BAD_DATE"));
});

// --- condition 3: items reconcile to the receipt total ------------------------

test("TOTAL_MISMATCH: items do not sum to receipt_total_cents (no subtotal/tax given -> exact match)", () => {
  const result = evaluateGate(
    baseModel({ entries: [baseEntry({ items: [{ account: "1030", amount_cents: 10000, description: "x", trade: "", business_purpose: "" }] })] }),
    baseCtx(),
    baseSettings(),
  );
  assert.ok(result.reasons.includes("TOTAL_MISMATCH"));
});

test("a small mismatch is tolerated (+/-0.5%) when subtotal_cents and tax_cents are both given", () => {
  // receipt_total_cents 21240; items sum 21200 -> 0.19% off, within tolerance.
  const model = baseModel({
    subtotal_cents: 19613,
    tax_cents: 1627,
    entries: [baseEntry({ items: [{ account: "1030", amount_cents: 21200, description: "x", trade: "", business_purpose: "" }] })],
  });
  const result = evaluateGate(model, baseCtx(), baseSettings());
  assert.ok(!result.reasons.includes("TOTAL_MISMATCH"));
});

test("a mismatch beyond 0.5% still fails even with subtotal_cents and tax_cents given", () => {
  const model = baseModel({
    subtotal_cents: 19613,
    tax_cents: 1627,
    entries: [baseEntry({ items: [{ account: "1030", amount_cents: 15000, description: "x", trade: "", business_purpose: "" }] })],
  });
  const result = evaluateGate(model, baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("TOTAL_MISMATCH"));
});

test("items summed across multiple entries must equal the receipt total", () => {
  const model = baseModel({
    receipt_total_cents: 30000,
    entries: [
      baseEntry({ property: "881 Newport", items: [{ account: "1030", amount_cents: 21240, description: "x", trade: "", business_purpose: "" }] }),
      baseEntry({ property: "1616 Granite", items: [{ account: "1030", amount_cents: 8760, description: "y", trade: "", business_purpose: "" }] }),
    ],
  });
  const result = evaluateGate(model, baseCtx(), baseSettings());
  assert.ok(!result.reasons.includes("TOTAL_MISMATCH"));
});

// --- condition 4: total > 0 and <= ceiling --------------------------------------

test("ZERO_TOTAL: a zero receipt total fails", () => {
  const result = evaluateGate(
    baseModel({ receipt_total_cents: 0, entries: [baseEntry({ items: [] })] }),
    baseCtx(),
    baseSettings(),
  );
  assert.ok(result.reasons.includes("ZERO_TOTAL"));
});

test("ZERO_TOTAL: a negative receipt total fails", () => {
  const result = evaluateGate(baseModel({ receipt_total_cents: -500 }), baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("ZERO_TOTAL"));
});

test("OVER_CEILING: a total above the ceiling fails even though everything else is valid", () => {
  const model = baseModel({
    receipt_total_cents: 100000,
    entries: [baseEntry({ items: [{ account: "1030", amount_cents: 100000, description: "x", trade: "", business_purpose: "" }] })],
  });
  const result = evaluateGate(model, baseCtx(), baseSettings({ autofile_ceiling_cents: 50000 }));
  assert.ok(result.reasons.includes("OVER_CEILING"));
});

test("a total exactly at the ceiling passes condition 4", () => {
  const model = baseModel({
    receipt_total_cents: 50000,
    entries: [baseEntry({ items: [{ account: "1030", amount_cents: 50000, description: "x", trade: "", business_purpose: "" }] })],
  });
  const result = evaluateGate(model, baseCtx(), baseSettings({ autofile_ceiling_cents: 50000 }));
  assert.ok(!result.reasons.includes("OVER_CEILING"));
});

// --- condition 5: sec 274(d) accounts always need a human ----------------------

test("6700 Travel with a written business purpose passes (PDX-DFW travel is business; Paul 2026-09-11)", () => {
  const model = baseModel({
    receipt_total_cents: 5000,
    paid_from: "PAUL",
    entries: [
      baseEntry({
        property: "OVERHEAD",
        paid_from: "PAUL",
        items: [{ account: "6700", amount_cents: 5000, description: "Flight PDX-DFW", trade: "", business_purpose: "PDX-DFW travel for Recast property operations" }],
      }),
    ],
  });
  const result = evaluateGate(model, baseCtx(), baseSettings());
  assert.ok(!result.reasons.includes("NEEDS_HUMAN_274D"), result.reasons.join(","));
});

test("6710 Meals still needs a human even with a purpose written", () => {
  const model = baseModel({
    receipt_total_cents: 5000,
    paid_from: "PAUL",
    entries: [
      baseEntry({
        property: "OVERHEAD",
        paid_from: "PAUL",
        items: [{ account: "6710", amount_cents: 5000, description: "Team lunch", trade: "", business_purpose: "Lunch with contractor - 881 Newport" }],
      }),
    ],
  });
  const result = evaluateGate(model, baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("NEEDS_HUMAN_274D"));
});

test("NEEDS_HUMAN_274D fires for 6710 Meals and 6720 Business gifts too", () => {
  for (const account of ["6710", "6720"]) {
    const model = baseModel({
      receipt_total_cents: 2000,
      paid_from: "PAUL",
      entries: [
        baseEntry({
          property: "OVERHEAD",
          paid_from: "PAUL",
          items: [{ account, amount_cents: 2000, description: "x", trade: "", business_purpose: "Client lunch" }],
        }),
      ],
    });
    const result = evaluateGate(model, baseCtx(), baseSettings());
    assert.ok(result.reasons.includes("NEEDS_HUMAN_274D"), `expected NEEDS_HUMAN_274D for account ${account}`);
  }
});

// --- condition 6: property must be OVERHEAD or in the registry -----------------

test("BAD_PROPERTY: a property not in the registry fails, without a redundant ENTRY_INVALID", () => {
  const result = evaluateGate(
    baseModel({ entries: [baseEntry({ property: "999 Nonexistent" })] }),
    baseCtx(),
    baseSettings(),
  );
  assert.ok(result.reasons.includes("BAD_PROPERTY"));
  assert.ok(!result.reasons.some((r) => r.startsWith("ENTRY_INVALID")), "buildEntry should not even be attempted for a structurally-bad property");
});

test("OVERHEAD is always a valid property", () => {
  const model = baseModel({
    paid_from: "PAUL",
    entries: [baseEntry({ property: "OVERHEAD", paid_from: "PAUL", items: [{ account: "6500", amount_cents: 21240, description: "Toner", trade: "", business_purpose: "" }] })],
  });
  const result = evaluateGate(model, baseCtx(), baseSettings());
  assert.ok(!result.reasons.includes("BAD_PROPERTY"));
});

// --- condition 7: paid_from must resolve ----------------------------------------

test("BAD_PAID_FROM: an unknown paid_from account fails, without a redundant ENTRY_INVALID", () => {
  const result = evaluateGate(
    baseModel({ entries: [baseEntry({ paid_from: "9999" })] }),
    baseCtx(),
    baseSettings(),
  );
  assert.ok(result.reasons.includes("BAD_PAID_FROM"));
  assert.ok(!result.reasons.some((r) => r.startsWith("ENTRY_INVALID")));
});

test("BAD_PAID_FROM: DENNIS with no property fails", () => {
  const result = evaluateGate(
    baseModel({ entries: [baseEntry({ property: "", paid_from: "DENNIS" })] }),
    baseCtx(),
    baseSettings(),
  );
  assert.ok(result.reasons.includes("BAD_PAID_FROM"));
});

test("PAUL and DENNIS (with a property) both resolve", () => {
  const paulResult = evaluateGate(
    baseModel({ paid_from: "PAUL", entries: [baseEntry({ paid_from: "PAUL" })] }),
    baseCtx(),
    baseSettings(),
  );
  assert.ok(!paulResult.reasons.includes("BAD_PAID_FROM"));

  const dennisResult = evaluateGate(
    baseModel({ paid_from: "DENNIS", entries: [baseEntry({ paid_from: "DENNIS" })] }),
    baseCtx(),
    baseSettings(),
  );
  assert.ok(!dennisResult.reasons.includes("BAD_PAID_FROM"));
});

// --- condition 8: buildEntry must succeed (D-010/D-011/PURPOSE_REQUIRED etc.) ---

test("ENTRY_INVALID:OVERHEAD_ON_PROPERTY: an overhead account posted to a real property fails (D-010)", () => {
  const result = evaluateGate(
    baseModel({ entries: [baseEntry({ items: [{ account: "6500", amount_cents: 21240, description: "Toner", trade: "", business_purpose: "" }] })] }),
    baseCtx(),
    baseSettings(),
  );
  assert.ok(result.reasons.includes("ENTRY_INVALID:OVERHEAD_ON_PROPERTY"));
});

test("ENTRY_INVALID:PURPOSE_REQUIRED: a 6600 vehicle item with no business_purpose fails", () => {
  const model = baseModel({
    paid_from: "PAUL",
    entries: [baseEntry({ property: "OVERHEAD", paid_from: "PAUL", items: [{ account: "6600", amount_cents: 21240, description: "Gas", trade: "", business_purpose: "" }] })],
  });
  const result = evaluateGate(model, baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("ENTRY_INVALID:PURPOSE_REQUIRED"));
});

test("ENTRY_INVALID:PROPERTY_REQUIRED: a 1000-series item tagged OVERHEAD fails", () => {
  const model = baseModel({
    paid_from: "PAUL",
    entries: [baseEntry({ property: "OVERHEAD", paid_from: "PAUL", items: [{ account: "1030", amount_cents: 21240, description: "Drywall", trade: "", business_purpose: "" }] })],
  });
  const result = evaluateGate(model, baseCtx(), baseSettings());
  assert.ok(result.reasons.includes("ENTRY_INVALID:PROPERTY_REQUIRED"));
});

test("ENTRY_INVALID:BAD_ACCOUNT: an item account not in the chart of accounts fails", () => {
  const result = evaluateGate(
    baseModel({ entries: [baseEntry({ items: [{ account: "9999", amount_cents: 21240, description: "x", trade: "", business_purpose: "" }] })] }),
    baseCtx(),
    baseSettings(),
  );
  assert.ok(result.reasons.includes("ENTRY_INVALID:BAD_ACCOUNT"));
});

// --- condition 9: twin rail ------------------------------------------------------

test("POSSIBLE_TWIN: a posted entry with the same payee/date/total not named as duplicate_of or supersedes holds", () => {
  const postedEntries = [{ txn_id: "receipt-20260905-abc123abc123", date: "2026-09-05", payee: "Home Depot", total_cents: 21240 }];
  const result = evaluateGate(baseModel(), baseCtx(), baseSettings(), { postedEntries });
  assert.ok(result.reasons.includes("POSSIBLE_TWIN:receipt-20260905-abc123abc123"));
  assert.equal(result.passed, false);
});

test("POSSIBLE_TWIN does not fire when the model named it in duplicate_of", () => {
  const postedEntries = [{ txn_id: "receipt-20260905-abc123abc123", date: "2026-09-05", payee: "Home Depot", total_cents: 21240 }];
  const result = evaluateGate(baseModel({ verdict: "dismiss", duplicate_of: "receipt-20260905-abc123abc123" }), baseCtx(), baseSettings(), { postedEntries });
  assert.ok(!result.reasons.some((r) => r.startsWith("POSSIBLE_TWIN")));
});

test("POSSIBLE_TWIN does not fire when the model named it in supersedes", () => {
  const postedEntries = [{ txn_id: "receipt-20260905-abc123abc123", date: "2026-09-05", payee: "Home Depot", total_cents: 21240 }];
  const result = evaluateGate(baseModel({ supersedes: "receipt-20260905-abc123abc123" }), baseCtx(), baseSettings(), { postedEntries });
  assert.ok(!result.reasons.some((r) => r.startsWith("POSSIBLE_TWIN")));
});

test("POSSIBLE_TWIN does not fire for a different date or amount", () => {
  const postedEntries = [
    { txn_id: "receipt-20260904-abc123abc123", date: "2026-09-04", payee: "Home Depot", total_cents: 21240 },
    { txn_id: "receipt-20260905-def456def456", date: "2026-09-05", payee: "Home Depot", total_cents: 999 },
  ];
  const result = evaluateGate(baseModel(), baseCtx(), baseSettings(), { postedEntries });
  assert.ok(!result.reasons.some((r) => r.startsWith("POSSIBLE_TWIN")));
});

test("POSSIBLE_TWIN payee match is case-insensitive", () => {
  const postedEntries = [{ txn_id: "receipt-20260905-abc123abc123", date: "2026-09-05", payee: "HOME DEPOT", total_cents: 21240 }];
  const result = evaluateGate(baseModel(), baseCtx(), baseSettings(), { postedEntries });
  assert.ok(result.reasons.includes("POSSIBLE_TWIN:receipt-20260905-abc123abc123"));
});

// --- reasons accumulate rather than short-circuit --------------------------------

test("multiple independent failures are all reported together", () => {
  const result = evaluateGate(
    baseModel({ verdict: "hold", vendor: "", receipt_total_cents: 0, entries: [baseEntry({ items: [] })] }),
    baseCtx(),
    baseSettings(),
  );
  assert.ok(result.reasons.includes("NOT_POST_VERDICT"));
  assert.ok(result.reasons.includes("MISSING_VENDOR"));
  assert.ok(result.reasons.includes("ZERO_TOTAL"));
  assert.equal(result.passed, false);
});

// --- buildEntriesFromModel: the shared post path --------------------------------

test("buildEntriesFromModel builds one posting-engine entry per proposed entry", () => {
  const model = baseModel({
    receipt_total_cents: 30000,
    entries: [
      baseEntry({ property: "881 Newport", items: [{ account: "1030", amount_cents: 21240, description: "Drywall", trade: "", business_purpose: "" }] }),
      baseEntry({ property: "1616 Granite", items: [{ account: "1030", amount_cents: 8760, description: "Paint", trade: "", business_purpose: "" }] }),
    ],
  });
  const entries = buildEntriesFromModel(model, baseCtx(), { posted_by: "claude", doc_url: "https://drive.google.com/x" });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].lines[0].property, "881 Newport");
  assert.equal(entries[1].lines[0].property, "1616 Granite");
  assert.equal(entries[0].doc_url, "https://drive.google.com/x");
  assert.equal(entries[0].posted_by, "claude");
});

test("buildEntriesFromModel propagates PostingError for an invalid entry (all-or-nothing)", () => {
  const model = baseModel({ entries: [baseEntry({ items: [{ account: "6500", amount_cents: 21240, description: "Toner", trade: "", business_purpose: "" }] })] });
  assert.throws(
    () => buildEntriesFromModel(model, baseCtx(), { posted_by: "claude" }),
    (err) => err instanceof PostingError && err.code === "OVERHEAD_ON_PROPERTY",
  );
});

test("buildEntriesFromModel honors allow_duplicate_hash for a human-edited approval", () => {
  const model = baseModel();
  const a = buildEntriesFromModel(model, baseCtx(), { posted_by: "paul@recast-properties.com", allow_duplicate_hash: true });
  const b = buildEntriesFromModel(model, baseCtx(), { posted_by: "paul@recast-properties.com", allow_duplicate_hash: true });
  assert.notEqual(a[0].txn_id, b[0].txn_id);
});

test("buildEntriesFromModel returns an empty array for a model with no entries", () => {
  const entries = buildEntriesFromModel(baseModel({ entries: [] }), baseCtx(), {});
  assert.deepEqual(entries, []);
});

import { findDuplicate } from "../lib/gate.mjs";

test("findDuplicate: same vendor + invoice number already posted -> duplicate", () => {
  const model = { vendor: "Anthropic, PBC", date: "2026-09-11", invoice_number: "A90U2FHF-0025", receipt_total_cents: 1034,
    entries: [{ payee: "Anthropic, PBC", date: "2026-09-11", items: [{ amount_cents: 1034 }] }] };
  const posted = [{ txn_id: "receipt-1", payee: "Anthropic, PBC", date: "2026-09-11", total_cents: 1034, text: "Auto-recharge credits invoice A90U2FHF-0025" }];
  assert.deepEqual(findDuplicate(model, posted), { kind: "duplicate", txn_id: "receipt-1" });
});

test("findDuplicate: same vendor/date/total but different invoice numbers -> two real charges", () => {
  const model = { vendor: "Netlify", date: "2026-09-11", invoice_number: "INV-200200", receipt_total_cents: 2000,
    entries: [{ payee: "Netlify", date: "2026-09-11", items: [{ amount_cents: 2000 }] }] };
  const posted = [{ txn_id: "receipt-2", payee: "Netlify", date: "2026-09-11", total_cents: 2000, text: "Hosting invoice INV-200199" }];
  assert.equal(findDuplicate(model, posted), null);
});

test("findDuplicate: same vendor/date/total with no invoice numbers anywhere -> possible twin (hold)", () => {
  const model = { vendor: "Netlify", date: "2026-09-11", invoice_number: "", receipt_total_cents: 2000,
    entries: [{ payee: "Netlify", date: "2026-09-11", items: [{ amount_cents: 2000 }] }] };
  const posted = [{ txn_id: "receipt-3", payee: "Netlify", date: "2026-09-11", total_cents: 2000, text: "Hosting" }];
  assert.deepEqual(findDuplicate(model, posted), { kind: "possible_twin", txn_id: "receipt-3" });
});
