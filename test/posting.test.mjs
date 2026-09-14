import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PostingError,
  buildEntry,
  validateEntry,
  makeTxnId,
  periodOf,
  makeCtx,
} from "../lib/posting.mjs";
import { accountMap } from "../lib/coa.mjs";

function baseCtx(overrides = {}) {
  return makeCtx({
    properties: new Set(["881 Newport", "1616 Granite"]),
    periods: new Map([
      ["2026-07", "closed"],
      ["2026-09", "open"],
    ]),
    today: "2026-09-11",
    ...overrides,
  });
}

function journalLines(lines) {
  return { type: "journal", date: "2026-09-05", memo: "test", source: "manual", posted_by: "paul@recast-properties.com", lines };
}

function assertPostingError(fn, code) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof PostingError, `expected a PostingError, got ${err}`);
    assert.equal(err.code, code);
    return true;
  });
}

// --- periodOf -----------------------------------------------------------

test("periodOf derives YYYY-MM from an ISO date", () => {
  assert.equal(periodOf("2026-07-01"), "2026-07");
  assert.equal(periodOf("2026-12-31"), "2026-12");
});

// --- balanced entry / happy path -----------------------------------------

test("a balanced journal entry passes and comes back unchanged", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    journalLines([
      { account: "1030", debit: 21240, credit: 0, property: "881 Newport", payee: "Home Depot", description: "Drywall panel" },
      { account: "1401", debit: 0, credit: 21240, property: "881 Newport", description: "Paid from Citizens shared" },
    ]),
    ctx,
  );
  assert.equal(entry.lines.length, 2);
  assert.equal(entry.period, "2026-09");
  assert.match(entry.txn_id, /^manual-20260905-[0-9a-f]{12}$/);
});

test("validateEntry runs the same checks buildEntry does, for hand-assembled entries", () => {
  const ctx = baseCtx();
  const entry = {
    txn_id: "manual-20260905-deadbeef0000",
    date: "2026-09-05",
    period: "2026-09",
    memo: "hand built",
    source: "manual",
    posted_by: "paul@recast-properties.com",
    doc_url: "",
    void_of: "",
    lines: [
      { account: "1401", debit: 1000, credit: 0, property: "", cost_class: "", tax_treatment: "", trade: "", payee: "", description: "", paid_from: "", reconciled_ref: "", business_purpose: "", attendee: "", destination: "", odometer: "" },
      { account: "9000", debit: 0, credit: 1000, property: "", cost_class: "", tax_treatment: "", trade: "", payee: "", description: "", paid_from: "", reconciled_ref: "", business_purpose: "", attendee: "", destination: "", odometer: "" },
    ],
  };
  assert.equal(validateEntry(entry, ctx), entry);
});

// --- derived fields --------------------------------------------------------

test("period is derived from date", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    { type: "advance", date: "2026-09-01", amount_cents: 500000, property: "881 Newport", into: "1401", source: "manual", posted_by: "paul" },
    ctx,
  );
  assert.equal(entry.period, "2026-09");
});

test("cost_class and tax_treatment are derived from the account series when not supplied", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    {
      type: "expense",
      date: "2026-09-05",
      payee: "Home Depot",
      description: "Drywall panel",
      amount_cents: 21240,
      account: "1030",
      property: "881 Newport",
      paid_from: "1401",
    },
    ctx,
  );
  const debitLine = entry.lines[0];
  assert.equal(debitLine.cost_class, "Rehab");
  assert.equal(debitLine.tax_treatment, "Inventory (held)");
});

test("explicitly supplied cost_class/tax_treatment overrides the derived value", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    journalLines([
      { account: "1030", debit: 1000, credit: 0, property: "881 Newport", cost_class: "Custom", tax_treatment: "Custom treatment" },
      { account: "1401", debit: 0, credit: 1000, property: "881 Newport" },
    ]),
    ctx,
  );
  assert.equal(entry.lines[0].cost_class, "Custom");
  assert.equal(entry.lines[0].tax_treatment, "Custom treatment");
});

// --- txn_id determinism -----------------------------------------------------

test("makeTxnId is deterministic for identical inputs", () => {
  const line = { payee: "Home Depot", debit: 21240, description: "Drywall panel", paid_from: "1401", property: "881 Newport" };
  const id1 = makeTxnId("receipt", "2026-07-01", line);
  const id2 = makeTxnId("receipt", "2026-07-01", line);
  assert.equal(id1, id2);
});

test("makeTxnId changes when property changes", () => {
  const line1 = { payee: "Home Depot", debit: 21240, description: "Drywall panel", paid_from: "1401", property: "881 Newport" };
  const line2 = { ...line1, property: "1616 Granite" };
  assert.notEqual(makeTxnId("receipt", "2026-07-01", line1), makeTxnId("receipt", "2026-07-01", line2));
});

test("buildEntry produces the same txn_id for the same expense intent", () => {
  const ctx = baseCtx();
  const intent = {
    type: "expense",
    date: "2026-09-05",
    payee: "Home Depot",
    description: "Drywall panel",
    amount_cents: 21240,
    account: "1030",
    property: "881 Newport",
    paid_from: "1401",
  };
  assert.equal(buildEntry(intent, ctx).txn_id, buildEntry(intent, ctx).txn_id);
});

test("buildEntry produces a different txn_id when only property differs", () => {
  const ctx = baseCtx();
  const base = {
    type: "expense",
    date: "2026-09-05",
    payee: "Home Depot",
    description: "Drywall panel",
    amount_cents: 21240,
    account: "1030",
    paid_from: "1401",
  };
  const a = buildEntry({ ...base, property: "881 Newport" }, ctx);
  const b = buildEntry({ ...base, property: "1616 Granite" }, ctx);
  assert.notEqual(a.txn_id, b.txn_id);
});

test("allow_duplicate_hash appends a 4-hex suffix, distinct per call", () => {
  const ctx = baseCtx();
  const intent = {
    type: "expense",
    date: "2026-09-05",
    payee: "7-Eleven",
    description: "Cash purchase",
    amount_cents: 500,
    account: "6500",
    property: "OVERHEAD",
    paid_from: "PAUL",
    allow_duplicate_hash: true,
  };
  const a = buildEntry(intent, ctx);
  const b = buildEntry(intent, ctx);
  const baseId = a.txn_id.slice(0, a.txn_id.lastIndexOf("-"));
  assert.equal(b.txn_id.slice(0, b.txn_id.lastIndexOf("-")), baseId);
  const suffixA = a.txn_id.slice(a.txn_id.lastIndexOf("-") + 1);
  const suffixB = b.txn_id.slice(b.txn_id.lastIndexOf("-") + 1);
  assert.match(suffixA, /^[0-9a-f]{4}$/);
  assert.match(suffixB, /^[0-9a-f]{4}$/);
  assert.notEqual(suffixA, suffixB);
});

// --- expense intent: paid_from shorthand ------------------------------------

test("expense paid_from a 1400 bank account credits that account and names it", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    {
      type: "expense",
      date: "2026-09-05",
      payee: "Home Depot",
      description: "Drywall panel",
      amount_cents: 21240,
      account: "1030",
      property: "881 Newport",
      paid_from: "1401",
    },
    ctx,
  );
  const credit = entry.lines[1];
  assert.equal(credit.account, "1401");
  assert.equal(credit.credit, 21240);
  assert.equal(credit.description, `Paid from ${accountMap().get("1401").name}`);
  assert.equal(credit.property, "881 Newport", "credit line carries the same property as the debit line");
});

test("expense paid_from PAUL credits 2030 Due to owner", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    {
      type: "expense",
      date: "2026-09-05",
      payee: "Office Depot",
      description: "Toner",
      amount_cents: 3684,
      account: "6500",
      property: "OVERHEAD",
      paid_from: "PAUL",
    },
    ctx,
  );
  const credit = entry.lines[1];
  assert.equal(credit.account, "2030");
  assert.equal(credit.description, "Paid by Paul");
  assert.equal(credit.property, "OVERHEAD");
});

test("expense paid_from DENNIS credits 2010 Note payable and requires property", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    {
      type: "expense",
      date: "2026-09-05",
      payee: "ABC Rehab Supply",
      description: "Cabinets",
      amount_cents: 500000,
      account: "1040",
      property: "881 Newport",
      paid_from: "DENNIS",
    },
    ctx,
  );
  const credit = entry.lines[1];
  assert.equal(credit.account, "2010");
  assert.equal(credit.description, "Paid by Dennis");
  assert.equal(credit.property, "881 Newport");
});

test("expense paid_from DENNIS without a property throws PROPERTY_REQUIRED", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        {
          type: "expense",
          date: "2026-09-05",
          payee: "ABC Rehab Supply",
          description: "Cabinets",
          amount_cents: 500000,
          account: "1040",
          paid_from: "DENNIS",
        },
        ctx,
      ),
    "PROPERTY_REQUIRED",
  );
});

test("expense paid_from an unknown account throws BAD_ACCOUNT", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        {
          type: "expense",
          date: "2026-09-05",
          payee: "Home Depot",
          description: "Drywall panel",
          amount_cents: 21240,
          account: "1030",
          property: "881 Newport",
          paid_from: "9999",
        },
        ctx,
      ),
    "BAD_ACCOUNT",
  );
});

// --- advance intent -----------------------------------------------------

test("advance debits the target cash account and credits 2010, property on both lines", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    { type: "advance", date: "2026-09-01", amount_cents: 5000000, property: "881 Newport", into: "1401", posted_by: "paul" },
    ctx,
  );
  assert.equal(entry.lines[0].account, "1401");
  assert.equal(entry.lines[0].debit, 5000000);
  assert.equal(entry.lines[0].property, "881 Newport");
  assert.equal(entry.lines[1].account, "2010");
  assert.equal(entry.lines[1].credit, 5000000);
  assert.equal(entry.lines[1].property, "881 Newport");
});

test("advance without a property throws PROPERTY_REQUIRED", () => {
  const ctx = baseCtx();
  assertPostingError(
    () => buildEntry({ type: "advance", date: "2026-09-01", amount_cents: 5000000, into: "1401" }, ctx),
    "PROPERTY_REQUIRED",
  );
});

// --- §3 error codes ----------------------------------------------------------

test("UNBALANCED: debits do not equal credits", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "1030", debit: 1000, credit: 0, property: "881 Newport" },
          { account: "1401", debit: 0, credit: 900, property: "881 Newport" },
        ]),
        ctx,
      ),
    "UNBALANCED",
  );
});

test("MIN_LINES: fewer than two lines", () => {
  const ctx = baseCtx();
  assertPostingError(
    () => buildEntry(journalLines([{ account: "1030", debit: 1000, credit: 0, property: "881 Newport" }]), ctx),
    "MIN_LINES",
  );
});

test("BAD_ACCOUNT: account not in the chart of accounts", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "9999", debit: 1000, credit: 0, property: "881 Newport" },
          { account: "1401", debit: 0, credit: 1000, property: "881 Newport" },
        ]),
        ctx,
      ),
    "BAD_ACCOUNT",
  );
});

test("BAD_AMOUNT: a line with both debit and credit set", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "1030", debit: 1000, credit: 500, property: "881 Newport" },
          { account: "1401", debit: 0, credit: 500, property: "881 Newport" },
        ]),
        ctx,
      ),
    "BAD_AMOUNT",
  );
});

test("BAD_AMOUNT: a line with both debit and credit zero", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "1030", debit: 0, credit: 0, property: "881 Newport" },
          { account: "1401", debit: 0, credit: 0, property: "881 Newport" },
        ]),
        ctx,
      ),
    "BAD_AMOUNT",
  );
});

test("BAD_AMOUNT: a negative debit", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "1030", debit: -1000, credit: 0, property: "881 Newport" },
          { account: "1401", debit: 0, credit: -1000, property: "881 Newport" },
        ]),
        ctx,
      ),
    "BAD_AMOUNT",
  );
});

test("BAD_DATE: not a valid calendar date", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        {
          ...journalLines([
            { account: "1030", debit: 1000, credit: 0, property: "881 Newport" },
            { account: "1401", debit: 0, credit: 1000, property: "881 Newport" },
          ]),
          date: "2026-13-01",
        },
        ctx,
      ),
    "BAD_DATE",
  );
});

test("BAD_DATE: more than one day in the future of ctx.today", () => {
  const ctx = baseCtx({ today: "2026-09-11" });
  assertPostingError(
    () =>
      buildEntry(
        {
          ...journalLines([
            { account: "1030", debit: 1000, credit: 0, property: "881 Newport" },
            { account: "1401", debit: 0, credit: 1000, property: "881 Newport" },
          ]),
          date: "2026-09-13",
        },
        ctx,
      ),
    "BAD_DATE",
  );
});

test("a date exactly one day in the future is allowed", () => {
  const ctx = baseCtx({ today: "2026-09-11" });
  const entry = buildEntry(
    {
      ...journalLines([
        { account: "1030", debit: 1000, credit: 0, property: "881 Newport" },
        { account: "1401", debit: 0, credit: 1000, property: "881 Newport" },
      ]),
      date: "2026-09-12",
    },
    ctx,
  );
  assert.equal(entry.date, "2026-09-12");
});

test("OVERHEAD_ON_PROPERTY: a 6000-series line naming a real property", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "6400", debit: 1000, credit: 0, property: "881 Newport" },
          { account: "1401", debit: 0, credit: 1000, property: "881 Newport" },
        ]),
        ctx,
      ),
    "OVERHEAD_ON_PROPERTY",
  );
});

test("OVERHEAD_ON_PROPERTY: a 7000-series line naming a real property", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "7000", debit: 1000, credit: 0, property: "881 Newport" },
          { account: "1401", debit: 0, credit: 1000, property: "881 Newport" },
        ]),
        ctx,
      ),
    "OVERHEAD_ON_PROPERTY",
  );
});

test("PROPERTY_REQUIRED: a 1000-series line with an empty property", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "1030", debit: 1000, credit: 0, property: "" },
          { account: "1401", debit: 0, credit: 1000, property: "" },
        ]),
        ctx,
      ),
    "PROPERTY_REQUIRED",
  );
});

test("PROPERTY_REQUIRED: a 1000-series line tagged OVERHEAD", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "1030", debit: 1000, credit: 0, property: "OVERHEAD" },
          { account: "1401", debit: 0, credit: 1000, property: "OVERHEAD" },
        ]),
        ctx,
      ),
    "PROPERTY_REQUIRED",
  );
});

test("BAD_PROPERTY: property is not OVERHEAD and not in the registry", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "1030", debit: 1000, credit: 0, property: "999 Nonexistent Ave" },
          { account: "1401", debit: 0, credit: 1000, property: "" },
        ]),
        ctx,
      ),
    "BAD_PROPERTY",
  );
});

test("PURPOSE_REQUIRED: 6700 Travel with no business_purpose", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        journalLines([
          { account: "6700", debit: 1000, credit: 0, property: "OVERHEAD" },
          { account: "1401", debit: 0, credit: 1000, property: "" },
        ]),
        ctx,
      ),
    "PURPOSE_REQUIRED",
  );
});

test("PURPOSE_REQUIRED is satisfied when business_purpose is supplied", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    journalLines([
      { account: "6700", debit: 1000, credit: 0, property: "OVERHEAD", business_purpose: "Trip to Ellis County courthouse" },
      { account: "1401", debit: 0, credit: 1000, property: "" },
    ]),
    ctx,
  );
  assert.equal(entry.lines[0].business_purpose, "Trip to Ellis County courthouse");
});

test("PERIOD_CLOSED: an entry dated into a closed period is refused", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        {
          ...journalLines([
            { account: "1401", debit: 1000, credit: 0, property: "" },
            { account: "9000", debit: 0, credit: 1000, property: "" },
          ]),
          date: "2026-07-15",
        },
        ctx,
      ),
    "PERIOD_CLOSED",
  );
});

test("PERIOD_CLOSED is bypassed when source is void", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    {
      ...journalLines([
        { account: "1401", debit: 1000, credit: 0, property: "" },
        { account: "9000", debit: 0, credit: 1000, property: "" },
      ]),
      date: "2026-07-15",
      source: "void",
      void_of: "manual-20260715-abc123abc123",
    },
    ctx,
  );
  assert.equal(entry.source, "void");
  assert.equal(entry.period, "2026-07");
});

test("buildEntry rejects an unknown intent type", () => {
  const ctx = baseCtx();
  assertPostingError(() => buildEntry({ type: "nonsense" }, ctx), "BAD_INTENT");
});

// --- purchase intent (phase2-spec.md §2) ------------------------------------

function purchaseIntent(overrides = {}) {
  return {
    type: "purchase",
    date: "2026-09-05",
    payee: "Home Depot",
    property: "881 Newport",
    paid_from: "1401",
    items: [
      { account: "1030", amount_cents: 21240, description: "Drywall panel", trade: "Paint & Flooring" },
    ],
    doc_url: "https://drive.google.com/file/d/abc",
    source: "receipt",
    posted_by: "claude",
    ...overrides,
  };
}

test("purchase with one item produces a debit line and a credit line, both carrying property and payee", () => {
  const ctx = baseCtx();
  const entry = buildEntry(purchaseIntent(), ctx);
  assert.equal(entry.lines.length, 2);
  const [debit, credit] = entry.lines;
  assert.equal(debit.account, "1030");
  assert.equal(debit.debit, 21240);
  assert.equal(debit.credit, 0);
  assert.equal(debit.property, "881 Newport");
  assert.equal(debit.payee, "Home Depot");
  assert.equal(debit.description, "Drywall panel");
  assert.equal(debit.trade, "Paint & Flooring");
  assert.equal(credit.account, "1401");
  assert.equal(credit.credit, 21240);
  assert.equal(credit.debit, 0);
  assert.equal(credit.property, "881 Newport");
  assert.equal(credit.payee, "Home Depot");
  assert.equal(credit.description, `Paid from ${accountMap().get("1401").name}`);
});

test("purchase with multiple items produces one debit line per item, property/payee on every line, credit is the sum", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    purchaseIntent({
      items: [
        { account: "1030", amount_cents: 15000, description: "Drywall panel" },
        { account: "1030", amount_cents: 6240, description: "Roller trays" },
        { account: "1040", amount_cents: 8000, description: "Cabinet pull" },
      ],
    }),
    ctx,
  );
  assert.equal(entry.lines.length, 4);
  const debits = entry.lines.slice(0, 3);
  const credit = entry.lines[3];
  for (const line of debits) {
    assert.equal(line.property, "881 Newport");
    assert.equal(line.payee, "Home Depot");
  }
  assert.equal(debits.reduce((t, l) => t + l.debit, 0), 29240);
  assert.equal(credit.credit, 29240);
  assert.equal(credit.account, "1401");
});

test("purchase entry total equals the receipt total across items (balanced)", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    purchaseIntent({
      items: [
        { account: "1030", amount_cents: 10000, description: "A" },
        { account: "1030", amount_cents: 5000, description: "B" },
      ],
    }),
    ctx,
  );
  const totalDebit = entry.lines.filter((l) => l.debit > 0).reduce((t, l) => t + l.debit, 0);
  const totalCredit = entry.lines.filter((l) => l.credit > 0).reduce((t, l) => t + l.credit, 0);
  assert.equal(totalDebit, 15000);
  assert.equal(totalCredit, 15000);
});

test("purchase paid_from PAUL credits 2030 Due to owner", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    purchaseIntent({ property: "OVERHEAD", paid_from: "PAUL", items: [{ account: "6500", amount_cents: 3684, description: "Toner" }] }),
    ctx,
  );
  const credit = entry.lines[entry.lines.length - 1];
  assert.equal(credit.account, "2030");
  assert.equal(credit.description, "Paid by Paul");
  assert.equal(credit.property, "OVERHEAD");
});

test("purchase paid_from DENNIS credits 2010 Note payable and requires property", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    purchaseIntent({ paid_from: "DENNIS", items: [{ account: "1040", amount_cents: 500000, description: "Cabinets" }] }),
    ctx,
  );
  const credit = entry.lines[entry.lines.length - 1];
  assert.equal(credit.account, "2010");
  assert.equal(credit.description, "Paid by Dennis");
  assert.equal(credit.property, "881 Newport");
});

test("purchase paid_from DENNIS without a property throws PROPERTY_REQUIRED", () => {
  const ctx = baseCtx();
  assertPostingError(
    () => buildEntry(purchaseIntent({ property: "", paid_from: "DENNIS" }), ctx),
    "PROPERTY_REQUIRED",
  );
});

test("purchase overhead item not marked OVERHEAD throws OVERHEAD_ON_PROPERTY (D-010)", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        purchaseIntent({ items: [{ account: "6500", amount_cents: 3684, description: "Toner" }] }),
        ctx,
      ),
    "OVERHEAD_ON_PROPERTY",
  );
});

test("purchase item on a §274(d) account without business_purpose throws PURPOSE_REQUIRED", () => {
  const ctx = baseCtx();
  assertPostingError(
    () =>
      buildEntry(
        purchaseIntent({
          property: "OVERHEAD",
          paid_from: "PAUL",
          items: [{ account: "6700", amount_cents: 5000, description: "Flight PDX-DFW" }],
        }),
        ctx,
      ),
    "PURPOSE_REQUIRED",
  );
});

test("purchase item on a §274(d) account with business_purpose passes", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    purchaseIntent({
      property: "OVERHEAD",
      paid_from: "PAUL",
      items: [{ account: "6700", amount_cents: 5000, description: "Flight PDX-DFW", business_purpose: "Site visit — 881 Newport walkthrough" }],
    }),
    ctx,
  );
  assert.equal(entry.lines[0].business_purpose, "Site visit — 881 Newport walkthrough");
});

test("purchase txn_id hashes the first debit line (items[0]), same intent -> same id", () => {
  const ctx = baseCtx();
  const intent = purchaseIntent();
  assert.equal(buildEntry(intent, ctx).txn_id, buildEntry(intent, ctx).txn_id);
});

test("purchase txn_id changes when the first item differs, even with the same total", () => {
  const ctx = baseCtx();
  const a = buildEntry(
    purchaseIntent({ items: [{ account: "1030", amount_cents: 21240, description: "Drywall panel" }] }),
    ctx,
  );
  const b = buildEntry(
    purchaseIntent({ items: [{ account: "1030", amount_cents: 21240, description: "Different item" }] }),
    ctx,
  );
  assert.notEqual(a.txn_id, b.txn_id);
});

test("purchase re-ingesting an identical receipt reproduces the same txn_id (writer-level DUPLICATE refusal)", () => {
  const ctx = baseCtx();
  const intent = purchaseIntent();
  const first = buildEntry(intent, ctx);
  const second = buildEntry({ ...intent }, ctx);
  assert.equal(first.txn_id, second.txn_id);
});

test("purchase allow_duplicate_hash appends a distinct 4-hex suffix per call", () => {
  const ctx = baseCtx();
  const intent = purchaseIntent({ allow_duplicate_hash: true });
  const a = buildEntry(intent, ctx);
  const b = buildEntry(intent, ctx);
  assert.notEqual(a.txn_id, b.txn_id);
  assert.match(a.txn_id.slice(a.txn_id.lastIndexOf("-") + 1), /^[0-9a-f]{4}$/);
});

test("purchase with an unknown paid_from account throws BAD_ACCOUNT", () => {
  const ctx = baseCtx();
  assertPostingError(() => buildEntry(purchaseIntent({ paid_from: "9999" }), ctx), "BAD_ACCOUNT");
});

test("purchase default memo names the payee and, for one item, the item description", () => {
  const ctx = baseCtx();
  const entry = buildEntry(purchaseIntent(), ctx);
  assert.equal(entry.memo, "Home Depot — Drywall panel");
});

test("purchase default memo for multiple items names the item count", () => {
  const ctx = baseCtx();
  const entry = buildEntry(
    purchaseIntent({
      items: [
        { account: "1030", amount_cents: 10000, description: "A" },
        { account: "1030", amount_cents: 5000, description: "B" },
      ],
    }),
    ctx,
  );
  assert.equal(entry.memo, "Home Depot — 2 items");
});

test("purchase honors an explicit memo over the default", () => {
  const ctx = baseCtx();
  const entry = buildEntry(purchaseIntent({ memo: "Custom memo" }), ctx);
  assert.equal(entry.memo, "Custom memo");
});

test("purchase txn_id is keyed by vendor + invoice number when one is given (D-012 rule 3 in code)", async () => {
  const { buildEntry } = await import("../lib/posting.mjs");
  const ctx = baseCtx();
  const base = { type: "purchase", date: "2026-09-10", payee: "Anthropic, PBC", property: "OVERHEAD", paid_from: "PAUL",
    items: [{ account: "6400", amount_cents: 10000, description: "Max plan" }] };
  const a = buildEntry({ ...base, invoice_number: "2268-3974-1772" }, ctx);
  const b = buildEntry({ ...base, invoice_number: "2268-3974-1772", items: [{ account: "6400", amount_cents: 10000, description: "Max plan 5x (forwarded copy)" }] }, ctx);
  const c = buildEntry({ ...base, invoice_number: "UT8RYVIC-0008" }, ctx);
  const d = buildEntry(base, ctx);
  assert.equal(a.txn_id, b.txn_id, "same invoice, different wording -> same id");
  assert.notEqual(a.txn_id, c.txn_id, "different invoice -> different id");
  assert.notEqual(a.txn_id, d.txn_id, "no invoice falls back to the line hash");
});
