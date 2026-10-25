// lib/plain-words.mjs - every code that can reach Paul, in his words (audit 2026-10-24 #12; CLAUDE.md rule 7).
//
// The posting engine (lib/posting.mjs PostingError), the writer (Code.gs / Menu.gs fail_ and their {ok:false, error}
// answers), the site's /api answers and the dialogs' own codes all end in one of these: what happened and what to do,
// no code in the sentence. Every dialog shows them through Style.html's plainError_ (the map is written into the
// dialog when it is built), the menu's alerts through plainWords; test/plain-words.test.mjs fails on a code in any of
// those sources with no words here. Pure, no imports: scripts/build-gs.mjs puts it in lib.gs.

export const PLAIN_WORDS = {
  // the posting engine (lib/posting.mjs)
  BAD_ACCOUNT: "Nothing was saved - a line has no kind of cost picked. Choose it in the box just above the amount, then try again.",
  BAD_AMOUNT: "Nothing was saved - an amount is missing or is not a number. Type the dollars and cents, then try again.",
  BAD_DATE: "Nothing was saved - the date is missing or is not a real date. Type it like 2026-10-25, then try again.",
  BAD_INTENT: "Nothing was saved - the request was put together wrong. Tell Claude.",
  BAD_PROPERTY: "Nothing was saved - that house is not on the Properties tab, or it is sold. Pick a house from the list, or OVERHEAD.",
  MIN_LINES: "Nothing was saved - an entry needs at least two lines: what it was, and where the money came from. Tell Claude.",
  OVERHEAD_ON_PROPERTY: "Nothing was saved - a cost of running the business cannot go on a house. Pick a house cost, or set the house to OVERHEAD.",
  PENDING_ROUTING: "Nothing was saved - the description still says PENDING ROUTING. Say what it was, then try again.",
  PERIOD_CLOSED: "Nothing was saved - that month is closed. Change the date, or reopen the month (Recast Books -> Reopen period), then try again.",
  PROPERTY_REQUIRED: "Nothing was saved - money from Dennis, or a house cost, needs a house. Pick one, then try again.",
  PURPOSE_REQUIRED: "Nothing was saved - a meal or a gift needs who it was with and the business reason. Type them, then try again.",
  UNBALANCED: "Nothing was saved - the two sides of the entry do not add up. Check the amounts; if they look right, tell Claude.",
  // the writer (Code.gs, Menu.gs)
  ALREADY_VOIDED: "This entry was already taken out of the books - nothing to do.",
  AMBIGUOUS_DOCS_ROOT: "There is more than one Recast Books folder in Drive, so files cannot be saved. Tell Claude.",
  BAD_ACTION: "The site did not understand what the dialog asked for. Tell Claude.",
  BAD_ENTRY: "Nothing was saved - the entry is missing something it needs. Tell Claude.",
  BAD_JSON: "The answer that came back could not be read. Try once more; if it happens again, tell Claude.",
  BAD_KEY_COLUMN: "The tab does not have the column this needs. Tell Claude.",
  BAD_PERIOD: "The month must look like 2026-10. Type it that way, then try again.",
  BAD_REQUEST: "Something the dialog needed was missing. Close it, open it again and try once more; if it happens again, tell Claude.",
  BAD_STATUS: "That is not a status the Periods tab takes. Tell Claude.",
  BAD_TAB: "That tab cannot be read this way. Tell Claude.",
  DUPLICATE: "This is already in the books - nothing was added. If it really is a second, separate purchase, tell Claude.",
  FEED_HEADERS: "The Feed tab's columns are not as the bookkeeper expects, so bank lines cannot be written. Tell Claude.",
  FORBIDDEN: "Only the workbook's owner can do this. Open the workbook as paul@recast-properties.com.",
  NOT_FOUND: "The bookkeeper could not find that - it may have been taken out or answered already. Click Refresh and look again.",
  NOT_SETUP: "The workbook is not set up yet. Tell Claude.",
  NO_SECRET: "The writer has no key set, so the site cannot reach it. Tell Claude.",
  SELFTEST_FAILED: "The writer's self-test failed. Tell Claude.",
  UNAUTHORIZED: "The site did not accept the workbook's key. Tell Claude.",
  // the menu's dialogs (Menu.gs, the html)
  ALREADY_RECORDED: "This is already recorded - nothing was added.",
  HOLDBACK_DOES_NOT_TIE: "The holdback amounts do not add up to the statement. Check them, then try again.",
  NOT_THAT_CHARGE: "This receipt is not the charge you were waiting on - the amount or the account differs. Untick the box, or pick the right card.",
  NO_ACCOUNT: "No row on the Bank accounts tab ends in this file's account number. Type it in that row's last4 column, then import again.",
  NO_AMOUNT: "Type an amount first.",
  NO_DOCUMENT: "No document was chosen. Pick the file, then try again.",
  NO_FILE: "Choose the file the bank gave you first.",
  NO_JOB: "The read was never started. Click Read it again.",
  NO_SALE: "No sale is set up for this house yet. Run Recast Books -> Sell property first.",
  NO_STATEMENT_LINES: "The closing statement has no lines the bookkeeper could use. Check the file, or tell Claude.",
  OVER_HOLDBACK: "The holdback is more than the statement allows. Check the amount.",
  READ_FAILED: "The bookkeeper could not read the document. Try again in a minute; if it keeps failing, tell Claude.",
  READ_TIMED_OUT: "The read took too long. Try again in a minute.",
  SALE_DOES_NOT_TIE: "The sale's numbers do not add up to the closing statement. Check the amounts, then try again.",
  SCRIPT: "The dialog lost touch with the workbook. Close it, open it again and try once more.",
  // the site (/api)
  APPROVE_INVOKE_FAILED: "The site could not start the save. Try again in a minute; if it keeps failing, tell Claude.",
  ATTACHMENT_TOO_LARGE: "The file is too big to take in. Send a smaller copy.",
  BAD_IMAGE: "The picture could not be read as an image. Send it again, or as a PDF.",
  INGEST_INVOKE: "The site could not start reading the document. Try again in a minute; if it keeps failing, tell Claude.",
  INGEST_INVOKE_FAILED: "The site could not start reading the document. Try again in a minute; if it keeps failing, tell Claude.",
  INVALID_TOKEN: "That sign-in link has expired. Ask Claude for a new one.",
  MATCH_INVOKE_FAILED: "The site could not start the matching. Try again in a minute; if it keeps failing, tell Claude.",
  METHOD_NOT_ALLOWED: "The site did not accept the request. Tell Claude.",
  NOT_ALLOWED: "That is not allowed from here. Tell Claude.",
  NOT_CONFIGURED: "The site is missing a setting. Tell Claude.",
  NOT_DELETABLE: "That document cannot be deleted. Tell Claude.",
  NOT_PENDING: "That card is no longer waiting - it was saved or dismissed already. Click Refresh.",
  NOT_REVERTIBLE: "That card cannot be put back to waiting. Tell Claude.",
  NO_STORED_READ: "The bookkeeper has no read of this document yet. Click Reprocess.",
  NO_THUMB_FOR_PDF: "A PDF has no preview picture - open the file instead.",
  PLACEHOLDER_WAITING: "A charge like this is waiting on its receipt - check the yellow box on the card, then Save.",
  POSTING: "Nothing was saved - the books refused the entry. Tell Claude - the line below says why.",
  READ_INVOKE_FAILED: "The site could not start the read. Try again in a minute; if it keeps failing, tell Claude.",
  REPLACES_AN_ENTRY: "This card replaces an entry already in the books - check the yellow box, then Save.",
  STORE_ERROR: "The site could not save its record. Try again in a minute; if it keeps failing, tell Claude.",
  TOO_LARGE: "The file is too big to take in. Send a smaller copy, or split it.",
  WRITER_ERROR: "The site could not reach the workbook. Try again in a minute; if it keeps failing, tell Claude.",
  WRITER_UNAVAILABLE: "The site could not reach the workbook. Try again in a minute; if it keeps failing, tell Claude.",
  // anything else
  INTERNAL: "Something went wrong and nothing was saved. Tell Claude - the line below says what.",
  ERROR: "Something went wrong and nothing was saved. Tell Claude - the line below says what.",
  UNKNOWN: "Something went wrong and nothing was saved. Tell Claude - the line below says what.",
};

/** {text, raw}: Paul's words for `code` (UNKNOWN's when there are none), and the code with its message for the
 *  "Paste to Claude" line underneath. */
export function plainWords(code, message) {
  const c = String(code || "ERROR");
  const m = String(message == null ? "" : message);
  return { text: PLAIN_WORDS[c] || PLAIN_WORDS.UNKNOWN, raw: m && m !== c ? `${c} - ${m}` : c };
}
