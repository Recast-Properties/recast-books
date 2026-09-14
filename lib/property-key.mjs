// lib/property-key.mjs — the Gmail-label <-> Properties.name normalisation rule,
// phase2.6-spec.md §2: "compared after lower-casing and removing spaces and
// punctuation (881Newport <-> 881 Newport)". Shared by
// netlify/functions/books-property-mailboxes.mjs (and its tests) and mirrored by
// hand in apps-script/poller/Code.gs's normalizeKey_ (Apps Script can't import ESM,
// so that copy has to stay textually in sync with this one — see
// test/poller-gs-lint.test.mjs).
export function normalizePropertyKey(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
