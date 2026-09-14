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

/**
 * D-017: a property is "held" (open: costs post, interest accrues, mail is watched)
 * unless its status is "sold". Anything else - blank, a legacy "under contract" - is
 * treated as held. One rule for the allowlist, the mailbox registry and the upload.
 */
export function isOpenProperty(row) {
  return String(row?.status || "").trim().toLowerCase() !== "sold";
}
