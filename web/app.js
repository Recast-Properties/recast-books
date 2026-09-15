// web/app.js — Recast Books app shell. Plain JS, no framework, no build step (spec §1).
//
// Money: amounts are entered as dollars and converted to integer cents with the local
// toCents() below before they ever leave the browser — this mirrors lib/money.mjs's
// parsing rules without importing lib/ into the browser (spec forbids that). Journal
// rows read back from the server are already dollar-denominated (the writer stores
// debit/credit as dollars ÷ 100, spec §4), so they're formatted directly, not re-converted.

"use strict";

// ---------------------------------------------------------------------------
// Money helpers (mirror lib/money.mjs; do not import it — browser code only)
// ---------------------------------------------------------------------------

function roundCents(n) {
  return n >= 0 ? Math.round(n) : -Math.round(-n);
}

function toCents(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new RangeError("toCents: not a finite number");
    return roundCents(input * 100);
  }
  if (typeof input !== "string") throw new RangeError("toCents: unsupported input type");
  let str = input.trim();
  if (str === "") throw new RangeError("toCents: empty string");
  let negative = false;
  const parenMatch = str.match(/^\((.*)\)$/);
  if (parenMatch) {
    negative = true;
    str = parenMatch[1].trim();
  }
  if (str.startsWith("-")) {
    negative = true;
    str = str.slice(1);
  } else if (str.startsWith("+")) {
    str = str.slice(1);
  }
  str = str.replace(/[$,\s]/g, "");
  if (str === "" || !/^\d+(\.\d+)?$/.test(str)) {
    throw new RangeError(`toCents: cannot parse amount: ${JSON.stringify(input)}`);
  }
  const value = Number(str);
  if (!Number.isFinite(value)) throw new RangeError("toCents: not a finite number");
  const cents = roundCents(value * 100);
  return negative ? -cents : cents;
}

function fromCents(cents) {
  const n = Number(cents) || 0;
  const negative = n < 0;
  const abs = Math.abs(Math.round(n));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${negative ? "-" : ""}${dollars}.${String(remainder).padStart(2, "0")}`;
}

// Format a dollar amount (already in dollars, e.g. from a Journal row) with 2 decimals
// and thousands separators, e.g. 212.4 -> "$212.40", -44.39 -> "-$44.39".
function fmtDollars(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value === "" || value == null ? "" : String(value);
  const negative = n < 0;
  const abs = Math.abs(n);
  const parts = abs.toFixed(2).split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${parts[0]}.${parts[1]}`;
}

// Same, but the source is integer cents (used for locally-computed totals).
function fmtCents(cents) {
  return fmtDollars(Number(cents) / 100);
}

// ---------------------------------------------------------------------------
// State + API
// ---------------------------------------------------------------------------

const SESSION_KEY = "recast_books_session";
const $ = (id) => document.getElementById(id);

const state = {
  session: localStorage.getItem(SESSION_KEY) || "",
  user: null, // {email, role, name} — decoded from the session for display only
  page: "dashboard",
  param: undefined, // optional sub-route, e.g. a property name for #properties/<name>
  cache: {}, // per-page data, refetched on navigation
};

function decodeSessionForDisplay(token) {
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const obj = JSON.parse(decodeURIComponent(escape(json)));
    return { email: obj.email, role: obj.role, name: obj.name };
  } catch {
    return null;
  }
}

class ApiError extends Error {
  constructor(status, body) {
    super((body && (body.message || body.error)) || `HTTP ${status}`);
    this.status = status;
    this.body = body || {};
  }
}

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "content-type": "application/json" };
  if (auth) {
    if (!state.session) throw new ApiError(401, { error: "UNAUTHENTICATED" });
    headers.authorization = `Bearer ${state.session}`;
  }
  const res = await fetch(`/api/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (res.status === 401 && auth) {
    signOut();
    throw new ApiError(401, data);
  }
  if (!res.ok) {
    throw new ApiError(res.status, data);
  }
  return data;
}

// Fetch a binary resource (an image/PDF served by /api/file) with the session's
// Authorization header and hand back an object URL. <img src="..."> and a plain
// window.open() cannot carry a custom header, so every thumbnail / full-size /
// PDF-in-a-new-tab view in the Inbox goes through this instead of a bare src.
// Callers are responsible for URL.revokeObjectURL()-ing what they get back
// (see trackBlobUrl/revokeTrackedBlobUrls below) once it's no longer shown.
async function authFetchBlobUrl(path) {
  if (!state.session) throw new ApiError(401, { error: "UNAUTHENTICATED" });
  const res = await fetch(`/api/${path}`, {
    headers: { authorization: `Bearer ${state.session}` },
  });
  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON, e.g. a plain 404 */ }
    throw new ApiError(res.status, body);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function signOut() {
  state.session = "";
  state.user = null;
  localStorage.removeItem(SESSION_KEY);
  $("app").classList.add("hidden");
  $("signin").classList.remove("hidden");
}

// ---------------------------------------------------------------------------
// Sign-in (Google Identity Services)
// ---------------------------------------------------------------------------

function showSigninError(text) {
  const el = $("signin-error");
  el.textContent = text;
  el.classList.remove("hidden");
}

async function handleCredentialResponse(response) {
  try {
    const data = await api("auth", { method: "POST", body: { id_token: response.credential }, auth: false });
    state.session = data.session;
    state.user = data.user || decodeSessionForDisplay(data.session);
    localStorage.setItem(SESSION_KEY, state.session);
    showApp();
  } catch (err) {
    if (err instanceof ApiError && err.status === 403 && err.body && err.body.error === "NOT_ALLOWED") {
      showSigninError("This Google account is not on the books' access list.");
    } else {
      showSigninError(`${(err.body && err.body.error) || "ERROR"}: ${err.message}`);
    }
  }
}
// Google's SDK calls this by name via the initialize({callback}) reference below;
// exposed on window only so it's easy to spot in devtools, not required otherwise.
window.__recastBooksCredentialResponse = handleCredentialResponse;

function initSignIn() {
  api("config", { auth: false })
    .then((cfg) => {
      const start = () => {
        if (!window.google || !window.google.accounts || !window.google.accounts.id) {
          setTimeout(start, 100);
          return;
        }
        window.google.accounts.id.initialize({
          client_id: cfg.google_client_id,
          callback: handleCredentialResponse,
        });
        window.google.accounts.id.renderButton($("gsi-button"), {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          width: 300,
        });
      };
      start();
    })
    .catch((err) => showSigninError(`${err.body?.error || "ERROR"}: ${err.message}`));
}

// ---------------------------------------------------------------------------
// App shell / nav
// ---------------------------------------------------------------------------

function showApp() {
  $("signin").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("userbox-name").textContent = state.user?.name || state.user?.email || "";
  $("userbox-role").textContent = state.user?.role || "";
  render();
  startInboxBadgePolling();
  initModal();
}

// ---------------------------------------------------------------------------
// Hash routing — real hrefs on #nav a (e.g. href="#properties"), deep-link on
// reload. A route is "#page" or "#page/param" (param URL-encoded, used today
// only by Properties row -> property view, e.g. "#properties/881%20Newport").
// ---------------------------------------------------------------------------

const PAGE_RENDERERS = {
  dashboard: renderDashboard,
  inbox: renderInbox,
  upload: renderUpload,
  journal: renderJournal,
  properties: renderProperties,
  vendors: renderVendors,
  banking: renderBanking,
  dennis: renderDennis,
  reports: renderReports,
  periods: renderPeriods,
  settings: renderSettings,
};

function currentRoute() {
  const h = (location.hash || "").replace(/^#/, "");
  if (!h) return { page: "dashboard", param: undefined };
  const slash = h.indexOf("/");
  if (slash === -1) return { page: h, param: undefined };
  return { page: h.slice(0, slash), param: decodeURIComponent(h.slice(slash + 1)) };
}

// Navigate to a page (optionally with a sub-route param). Updates the hash,
// which is the single source of truth for the current route; render() reads
// it back. Used by in-app links (property rows, "back" links) — plain #nav a
// hrefs need no JS at all, the browser's own hash change drives render().
function navigate(page, param) {
  const hash = "#" + page + (param !== undefined && param !== "" ? "/" + encodeURIComponent(param) : "");
  if (("#" + location.hash.replace(/^#/, "")) === hash) {
    render(); // same route (e.g. re-clicking "All properties") — hashchange won't fire
  } else {
    location.hash = hash;
  }
}

function render() {
  const { page, param } = currentRoute();
  state.page = page;
  state.param = param;
  for (const a of document.querySelectorAll("#nav a")) {
    a.classList.toggle("active", a.dataset.page === page);
  }
  for (const el of document.querySelectorAll(".page")) {
    el.classList.toggle("hidden", el.id !== `page-${page}`);
  }
  (PAGE_RENDERERS[page] || renderDashboard)(param);
}

window.addEventListener("hashchange", () => {
  if (state.session) render();
});

function isOwner() {
  return state.user && state.user.role === "owner";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function renderDashboard() {
  const el = $("page-dashboard");
  el.innerHTML = `<h1 class="page-title">Dashboard</h1><div class="cards-row" id="dash-cards"></div>`;
  const cards = $("dash-cards");
  cards.innerHTML = statCard("Phase", "Phase 0", "") + statCard("Workbook", "Loading…", "muted") +
    statCard("Journal entries", "…", "muted") + statCard("Open periods", "…", "muted") +
    statCard("Waiting for review", "…", "muted") + statCard("Posted by the bookkeeper (7 d)", "…", "muted");

  let baseHtml = statCard("Phase", "Phase 0", "") + statCardHtml("Error", "");
  try {
    const [settingsResp, ledgerResp, periodsResp] = await Promise.all([
      api("meta?tab=Settings"),
      api("ledger?limit=1000"),
      api("meta?tab=Periods"),
    ]);

    const rows = rowsToObjects(settingsResp.headers, settingsResp.rows);
    const wbSetting = rows.find((r) => r.key === "spreadsheet_url");
    const wbHtml = wbSetting && wbSetting.value
      ? `<a href="${escapeHtml(wbSetting.value)}" target="_blank" rel="noopener">Open workbook &rarr;</a>`
      : `<span class="muted">Workbook: not linked</span>`;

    const periodRows = rowsToObjects(periodsResp.headers, periodsResp.rows);
    const openCount = periodRows.filter((r) => r.status === "open").length;

    baseHtml =
      statCard("Phase", "Phase 0", "") +
      statCardHtml("Workbook", wbHtml) +
      statCard("Journal entries", String(ledgerResp.entries.length), "") +
      statCard("Open periods", String(openCount), "");
  } catch (err) {
    baseHtml = statCard("Phase", "Phase 0", "") + statCardHtml("Error", errorText(err));
  }

  // Receipts-bookkeeper stats (spec §8) are fetched separately so a hiccup here
  // never blanks out the core workbook stats above.
  let inboxHtml = statCard("Waiting for review", "—", "muted") + statCard("Posted by the bookkeeper (7 d)", "—", "muted");
  try {
    const [pendingResp, postedResp] = await Promise.all([
      api("inbox?status=pending&limit=500"),
      api("inbox?status=posted&limit=500"),
    ]);
    const pending = pendingResp.envelopes || pendingResp.rows || pendingResp.items || [];
    const posted = postedResp.envelopes || postedResp.rows || postedResp.items || [];
    setInboxBadge(typeof pendingResp.total === "number" ? pendingResp.total : pending.length);

    const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const postedTotalCents = posted.reduce((sum, env) => {
      const whenRaw = env.finishedAt || env.startedAt || "";
      const when = whenRaw ? new Date(whenRaw).getTime() : NaN;
      if (!Number.isFinite(when) || when < cutoffMs) return sum;
      return sum + (Number(env.model && env.model.receipt_total_cents) || 0);
    }, 0);

    inboxHtml =
      statCard("Waiting for review", String(pending.length), "") +
      statCard("Posted by the bookkeeper (7 d)", fmtCents(postedTotalCents), "");
  } catch {
    // Non-fatal — inbox API may not be deployed yet; dashes are shown instead.
  }

  cards.innerHTML = baseHtml + inboxHtml;
}

function statCard(label, value, valueClass) {
  return statCardHtml(label, `<span class="${valueClass || ""}">${escapeHtml(value)}</span>`);
}
function statCardHtml(label, valueHtml) {
  return `<div class="card stat-card"><p class="label">${escapeHtml(label)}</p><div class="value">${valueHtml}</div></div>`;
}
function errorText(err) {
  const code = (err.body && err.body.error) || err.status;
  return `<span style="color:var(--error-700);font-size:13px;">${escapeHtml(code)}: ${escapeHtml(err.message)}</span>`;
}

// Standard error-banner body: "CODE — message" with a native <details> toggle
// for the raw details JSON when the server sent one. Use inside
// `<div class="banner error">...</div>`.
function errorBannerHtml(err) {
  const code = (err.body && err.body.error) || String(err.status || "ERROR");
  const message = err.message || "";
  const details = err.body && err.body.details;
  const detailsHtml = details
    ? `<details class="details-toggle"><summary>Show details</summary><pre>${escapeHtml(JSON.stringify(details, null, 2))}</pre></details>`
    : "";
  return `<code>${escapeHtml(code)}</code> — ${escapeHtml(message)}${detailsHtml}`;
}

// ---------------------------------------------------------------------------
// Shared date / money / CSV helpers used across the Phase 1 pages
// ---------------------------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function currentPeriodStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Normalize a dollars text input to a fixed "123.45" string (for tab columns
// that store plain dollars, e.g. Properties.purchase_price, Bank
// accounts.opening_balance — see the interpretation note in the build report).
// Throws on unparsable non-empty input; returns "" for empty when allowed.
function normalizeDollarsInput(raw, { allowEmpty = true } = {}) {
  const trimmed = (raw == null ? "" : String(raw)).trim();
  if (!trimmed) {
    if (allowEmpty) return "";
    throw new RangeError("required");
  }
  return fromCents(toCents(trimmed));
}

function csvField(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function downloadCsv(filename, headers, rows) {
  const lines = [headers.map(csvField).join(",")].concat(rows.map((r) => r.map(csvField).join(",")));
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Shared <select> option builders (reused across Journal/Properties/Vendors/
// Banking/Dennis/Reports so property/account/bank pickers stay consistent).
function realPropertyOptions(selected, properties) {
  const opts = (properties || [])
    .map((p) => `<option value="${escapeHtml(p.name)}" ${p.name === selected ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
    .join("");
  return `<option value="">— select —</option>${opts}`;
}
function bankAccountSelectOptions(selected, bankAccounts) {
  const opts = (bankAccounts || [])
    .filter((b) => String(b.active).toLowerCase() !== "false")
    .map((b) => `<option value="${escapeHtml(b.code)}" ${String(b.code) === selected ? "selected" : ""}>${escapeHtml(b.code)} — ${escapeHtml(b.name)}</option>`)
    .join("");
  return `<option value="">— select —</option>${opts}`;
}
function accountSelectOptions(selected, accounts) {
  const opts = (accounts || [])
    .filter((a) => String(a.active).toLowerCase() !== "false")
    .map((a) => `<option value="${escapeHtml(a.code)}" ${a.code === selected ? "selected" : ""}>${escapeHtml(a.code)} — ${escapeHtml(a.name)}</option>`)
    .join("");
  return `<option value="">— select —</option>${opts}`;
}

function rowsToObjects(headers, rows) {
  return (rows || []).map((row) => {
    const obj = {};
    (headers || []).forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

const journalState = {
  mode: "expense", // "expense" | "journal"
  entries: [],
  showVoided: false, // 2026-09-14: voided pairs (an entry + its reversal) are hidden by default
  expanded: new Set(),
  lines: [ // journal-mode grid rows
    { account: "", debit: "", credit: "", property: "", payee: "", description: "", paid_from: "", business_purpose: "" },
    { account: "", debit: "", credit: "", property: "", payee: "", description: "", paid_from: "", business_purpose: "" },
  ],
  banner: null, // {kind:"error"|"success", html}
  accounts: [],
  properties: [],
  bankAccounts: [],
};

async function loadJournalRefData() {
  const [accountsResp, propertiesResp, banksResp] = await Promise.all([
    api("meta?tab=Accounts"),
    api("meta?tab=Properties"),
    api("meta?tab=Bank%20accounts"),
  ]);
  journalState.accounts = rowsToObjects(accountsResp.headers, accountsResp.rows);
  journalState.properties = rowsToObjects(propertiesResp.headers, propertiesResp.rows);
  journalState.bankAccounts = rowsToObjects(banksResp.headers, banksResp.rows);
}

async function loadJournalEntries() {
  const resp = await api("ledger?limit=200");
  journalState.entries = resp.entries;
}

async function renderJournal() {
  const el = $("page-journal");
  el.innerHTML = `<h1 class="page-title">Journal</h1><div id="journal-banner"></div><div id="new-entry"></div><div id="entries-table"></div>`;
  renderBanner();
  renderNewEntryPanel();
  $("entries-table").innerHTML = `<p class="rc-small">Loading…</p>`;

  try {
    await Promise.all([loadJournalRefData(), loadJournalEntries()]);
    renderNewEntryPanel();
    renderEntriesTable();
  } catch (err) {
    $("entries-table").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
  }
}

function renderBanner() {
  const el = $("journal-banner");
  if (!el) return;
  if (!journalState.banner) {
    el.innerHTML = "";
    return;
  }
  const { kind, html } = journalState.banner;
  el.innerHTML = `<div class="banner ${kind}">${html}</div>`;
}

function accountOptions(selected) {
  const opts = journalState.accounts
    .filter((a) => String(a.active).toLowerCase() !== "false")
    .map((a) => `<option value="${escapeHtml(a.code)}" ${a.code === selected ? "selected" : ""}>${escapeHtml(a.code)} — ${escapeHtml(a.name)}</option>`)
    .join("");
  return `<option value="">— select —</option>${opts}`;
}
function propertyOptions(selected) {
  const opts = journalState.properties
    .map((p) => `<option value="${escapeHtml(p.name)}" ${p.name === selected ? "selected" : ""}>${escapeHtml(p.name)}</option>`)
    .join("");
  return `<option value="">— select —</option>${opts}<option value="OVERHEAD" ${selected === "OVERHEAD" ? "selected" : ""}>OVERHEAD</option>`;
}
function paidFromOptions(selected) {
  // Cash accounts come from the Bank accounts tab; until that tab is populated
  // (Phase 1), fall back to the cash accounts in the chart of accounts (14xx "Cash").
  let banks = journalState.bankAccounts.filter((b) => String(b.active).toLowerCase() !== "false");
  if (banks.length === 0) {
    banks = journalState.accounts.filter((a) => String(a.code).startsWith("14") && /^Cash/i.test(String(a.name)));
  }
  const opts = banks
    .map((b) => `<option value="${escapeHtml(b.code)}" ${String(b.code) === selected ? "selected" : ""}>${escapeHtml(b.code)} — ${escapeHtml(b.name)}</option>`)
    .join("");
  return `<option value="">— select —</option>${opts}` +
    `<option value="PAUL" ${selected === "PAUL" ? "selected" : ""}>PAUL (personal)</option>` +
    `<option value="DENNIS" ${selected === "DENNIS" ? "selected" : ""}>DENNIS (direct)</option>`;
}

const PURPOSE_REQUIRED_ACCOUNTS = new Set(["6600", "6700", "6710", "6720"]);

function renderNewEntryPanel() {
  const wrap = $("new-entry");
  if (!wrap) return;
  if (!isOwner()) {
    wrap.innerHTML = "";
    return;
  }

  wrap.innerHTML = `
    <div class="section-card">
      <h3>New entry</h3>
      <div class="tabbar">
        <button data-mode="expense" class="${journalState.mode === "expense" ? "active" : ""}">Expense</button>
        <button data-mode="journal" class="${journalState.mode === "journal" ? "active" : ""}">Journal</button>
      </div>
      <div id="entry-form"></div>
    </div>`;

  wrap.querySelectorAll(".tabbar button").forEach((btn) => {
    btn.onclick = () => {
      journalState.mode = btn.dataset.mode;
      renderNewEntryPanel();
    };
  });

  if (journalState.mode === "expense") renderExpenseForm();
  else renderJournalGridForm();
}

function renderExpenseForm() {
  const form = $("entry-form");
  form.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>Date</label><input type="date" id="f-date" value="${today()}"></div>
      <div class="field"><label>Payee</label><input type="text" id="f-payee" placeholder="Home Depot"></div>
      <div class="field full"><label>Description</label><input type="text" id="f-description" placeholder="Drywall panel, plug, roller trays"></div>
      <div class="field"><label>Amount</label><input type="text" id="f-amount" placeholder="212.40" inputmode="decimal"></div>
      <div class="field"><label>Account</label><select id="f-account">${accountOptions("")}</select></div>
      <div class="field"><label>Property</label><select id="f-property">${propertyOptions("")}</select></div>
      <div class="field"><label>Paid from</label><select id="f-paidfrom">${paidFromOptions("")}</select></div>
      <div class="field"><label>Trade</label><input type="text" id="f-trade" placeholder="Paint & Flooring"></div>
      <div class="field full" id="f-purpose-wrap"><label>Business purpose <span id="f-purpose-req" class="req-mark hidden">(required)</span></label><input type="text" id="f-purpose" placeholder="Why this cost is business-related"></div>
    </div>
    <button class="btn btn-primary" id="f-post" style="margin-top:8px;">Post expense</button>
  `;

  $("f-account").addEventListener("change", updatePurposeRequirement);
  updatePurposeRequirement();

  $("f-post").onclick = async () => {
    journalState.banner = null;
    renderBanner();

    const date = $("f-date").value;
    const payee = $("f-payee").value.trim();
    const description = $("f-description").value.trim();
    const account = $("f-account").value;
    const property = $("f-property").value;
    const paid_from = $("f-paidfrom").value;
    const trade = $("f-trade").value.trim();
    const business_purpose = $("f-purpose").value.trim();
    let amount_cents;
    try {
      amount_cents = toCents($("f-amount").value);
    } catch {
      journalState.banner = { kind: "error", html: "Enter a valid dollar amount, e.g. 212.40." };
      renderBanner();
      return;
    }

    const intent = {
      type: "expense",
      date,
      payee,
      description,
      amount_cents,
      account,
      property,
      paid_from,
    };
    if (trade) intent.trade = trade;
    if (business_purpose) intent.business_purpose = business_purpose;

    await submitIntent(intent, () => {
      $("f-payee").value = "";
      $("f-description").value = "";
      $("f-amount").value = "";
      $("f-trade").value = "";
      $("f-purpose").value = "";
    });
  };
}

function updatePurposeRequirement() {
  const account = $("f-account")?.value;
  const required = PURPOSE_REQUIRED_ACCOUNTS.has(account);
  const mark = $("f-purpose-req");
  if (mark) mark.classList.toggle("hidden", !required);
}

function computeJournalBalance() {
  let debit = 0, credit = 0, nonEmptyLines = 0;
  for (const l of journalState.lines) {
    let d = 0, c = 0;
    try { d = l.debit ? toCents(l.debit) : 0; } catch { /* ignore, validated on post */ }
    try { c = l.credit ? toCents(l.credit) : 0; } catch { /* ignore */ }
    if (d || c) nonEmptyLines += 1;
    debit += d;
    credit += c;
  }
  return { debit, credit, balanced: debit === credit, nonEmptyLines };
}

function renderJournalGridForm() {
  const form = $("entry-form");
  const rowsHtml = journalState.lines
    .map((l, i) => `
      <tr>
        <td><select data-i="${i}" data-f="account">${accountOptions(l.account)}</select></td>
        <td><input data-i="${i}" data-f="debit" value="${escapeHtml(l.debit)}" placeholder="0.00" inputmode="decimal"></td>
        <td><input data-i="${i}" data-f="credit" value="${escapeHtml(l.credit)}" placeholder="0.00" inputmode="decimal"></td>
        <td><select data-i="${i}" data-f="property">${propertyOptions(l.property)}</select></td>
        <td><input data-i="${i}" data-f="payee" value="${escapeHtml(l.payee)}"></td>
        <td><input data-i="${i}" data-f="description" value="${escapeHtml(l.description)}"></td>
        <td><select data-i="${i}" data-f="paid_from">${paidFromOptions(l.paid_from)}</select></td>
        <td><input data-i="${i}" data-f="business_purpose" value="${escapeHtml(l.business_purpose)}" placeholder="${PURPOSE_REQUIRED_ACCOUNTS.has(l.account) ? "required for this account" : ""}"></td>
        <td><button class="rm-btn" data-rm="${i}" title="Remove line">&times;</button></td>
      </tr>`)
    .join("");

  const bal = computeJournalBalance();

  form.innerHTML = `
    <div class="form-grid" style="margin-bottom:14px;">
      <div class="field"><label>Date</label><input type="date" id="j-date" value="${today()}"></div>
      <div class="field"><label>Memo</label><input type="text" id="j-memo" placeholder="What this entry is"></div>
    </div>
    <div style="overflow-x:auto;">
      <table class="lines-grid">
        <thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Property</th><th>Payee</th><th>Description</th><th>Paid from</th><th>Business purpose</th><th></th></tr></thead>
        <tbody id="j-lines">${rowsHtml}</tbody>
      </table>
    </div>
    <button class="btn btn-secondary" id="j-add-line" style="font-size:13px;padding:8px 14px;">+ Add line</button>
    <div class="balance-row ${bal.balanced ? "ok" : "off"}">
      <span>Debits ${fmtCents(bal.debit)} &nbsp;·&nbsp; Credits ${fmtCents(bal.credit)}</span>
      <span>${bal.balanced ? "Balanced" : `Out of balance by ${fmtCents(Math.abs(bal.debit - bal.credit))}`}</span>
    </div>
    <button class="btn btn-primary" id="j-post" ${bal.balanced && bal.nonEmptyLines >= 2 ? "" : "disabled"}>Post journal entry</button>
  `;

  form.querySelectorAll("#j-lines select, #j-lines input").forEach((elx) => {
    elx.addEventListener("input", () => {
      const i = Number(elx.dataset.i);
      const f = elx.dataset.f;
      journalState.lines[i][f] = elx.value;
      renderJournalGridForm(); // cheap full re-render keeps the balance row live
      refocusLine(i, f);
    });
    elx.addEventListener("change", () => {
      const i = Number(elx.dataset.i);
      const f = elx.dataset.f;
      journalState.lines[i][f] = elx.value;
      renderJournalGridForm();
    });
  });

  form.querySelectorAll("[data-rm]").forEach((btn) => {
    btn.onclick = () => {
      const i = Number(btn.dataset.rm);
      if (journalState.lines.length <= 2) return; // MIN_LINES
      journalState.lines.splice(i, 1);
      renderJournalGridForm();
    };
  });

  $("j-add-line").onclick = () => {
    journalState.lines.push({ account: "", debit: "", credit: "", property: "", payee: "", description: "", paid_from: "", business_purpose: "" });
    renderJournalGridForm();
  };

  $("j-post").onclick = async () => {
    journalState.banner = null;
    renderBanner();

    const date = $("j-date").value;
    const memo = $("j-memo").value.trim();

    let lines;
    try {
      lines = journalState.lines
        .filter((l) => l.account && (l.debit || l.credit))
        .map((l) => ({
          account: l.account,
          debit: l.debit ? toCents(l.debit) : 0,
          credit: l.credit ? toCents(l.credit) : 0,
          property: l.property,
          payee: l.payee,
          description: l.description,
          paid_from: l.paid_from,
          business_purpose: l.business_purpose,
        }));
    } catch {
      journalState.banner = { kind: "error", html: "One or more debit/credit amounts are not valid dollar amounts." };
      renderBanner();
      return;
    }

    const intent = { type: "journal", date, memo, lines };

    await submitIntent(intent, () => {
      journalState.lines = [
        { account: "", debit: "", credit: "", property: "", payee: "", description: "", paid_from: "", business_purpose: "" },
        { account: "", debit: "", credit: "", property: "", payee: "", description: "", paid_from: "", business_purpose: "" },
      ];
    });
  };
}

function refocusLine(i, f) {
  const elx = document.querySelector(`[data-i="${i}"][data-f="${f}"]`);
  if (elx && document.activeElement !== elx && elx.tagName === "INPUT") {
    // Re-render moved focus off the field the user was typing in — put it back.
    elx.focus();
    const v = elx.value;
    elx.value = "";
    elx.value = v;
  }
}

async function submitIntent(intent, onSuccess) {
  try {
    const result = await api("ledger", { method: "POST", body: { intent } });
    const rows = result.rows ? ` (rows ${result.rows[0]}–${result.rows[1]})` : "";
    journalState.banner = { kind: "success", html: `Posted <code>${escapeHtml(result.entry.txn_id)}</code>${rows}.` };
    onSuccess();
    renderNewEntryPanel();
    renderBanner();
    await loadJournalEntries();
    renderEntriesTable();
  } catch (err) {
    journalState.banner = { kind: "error", html: errorBannerHtml(err) };
    renderBanner();
  }
}

function renderEntriesTable() {
  const wrap = $("entries-table");
  if (!journalState.entries.length) {
    wrap.innerHTML = `<p class="rc-small">No journal entries yet.</p>`;
    return;
  }

  // A voided entry and its reversal are a pair that nets to zero: the books keep both
  // (append-only), the page shows neither unless asked.
  const voidedIds = new Set(journalState.entries.map((e) => e.void_of).filter(Boolean));
  const isPair = (e) => e.source === "void" || String(e.txn_id).startsWith("void-") || voidedIds.has(e.txn_id);
  const hiddenCount = journalState.entries.filter(isPair).length;
  const visible = journalState.showVoided ? journalState.entries : journalState.entries.filter((e) => !isPair(e));
  const toggle = hiddenCount
    ? `<p class="rc-small" style="margin:0 0 8px;">${journalState.showVoided ? "Showing voided entries and their reversals" : `${hiddenCount} voided ${hiddenCount === 1 ? "entry" : "entries"} hidden`} · <a href="#" id="journal-toggle-voided">${journalState.showVoided ? "Hide" : "Show"}</a></p>`
    : "";

  const rows = visible
    .map((entry, idx) => {
      const total = entry.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
      const expanded = journalState.expanded.has(entry.txn_id);
      // An entry that already has a reversing entry pointing at it is voided: show that
      // instead of offering Void again.
      const voidedBy = voidedIds.has(entry.txn_id);
      const voidBtn = voidedBy
        ? `<span class="muted" style="font-size:12px;">Voided</span>`
        : isOwner() && entry.source !== "void" && !String(entry.txn_id).startsWith("void-")
          ? `<button class="btn btn-secondary" data-void="${escapeHtml(entry.txn_id)}" style="padding:5px 10px;font-size:12px;">Void</button>`
          : "";
      const linesRows = entry.lines
        .map((l) => `
          <tr>
            <td>${escapeHtml(l.account)}</td>
            <td class="num">${l.debit ? fmtDollars(l.debit) : ""}</td>
            <td class="num">${l.credit ? fmtDollars(l.credit) : ""}</td>
            <td>${escapeHtml(l.property)}</td>
            <td>${escapeHtml(l.payee)}</td>
            <td>${escapeHtml(l.description)}</td>
            <td>${escapeHtml(l.paid_from)}</td>
            <td>${escapeHtml(l.business_purpose)}</td>
          </tr>`)
        .join("");

      return `
        <tr class="clickable" data-toggle="${idx}">
          <td>${escapeHtml(entry.date)}</td>
          <td>${escapeHtml(entry.memo)}</td>
          <td>${escapeHtml(entry.source)}</td>
          <td>${escapeHtml(entry.posted_by)}</td>
          <td class="num">${fmtDollars(total)}</td>
          <td>${voidBtn}</td>
        </tr>
        <tr class="lines-row ${expanded ? "" : "hidden"}" id="lines-${idx}">
          <td colspan="6"><div class="lines-wrap">
            <table class="rc-table" style="box-shadow:none;">
              <thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th><th>Property</th><th>Payee</th><th>Description</th><th>Paid from</th><th>Business purpose</th></tr></thead>
              <tbody>${linesRows}</tbody>
            </table>
          </div></td>
        </tr>`;
    })
    .join("");

  wrap.innerHTML = `${toggle}
    <table class="rc-table">
      <thead><tr><th>Date</th><th>Memo</th><th>Source</th><th>Posted by</th><th class="num">Total</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6" class="rc-small">Nothing to show.</td></tr>`}</tbody>
    </table>`;

  const toggleLink = $("journal-toggle-voided");
  if (toggleLink) toggleLink.onclick = (e) => { e.preventDefault(); journalState.showVoided = !journalState.showVoided; renderEntriesTable(); };

  wrap.querySelectorAll("[data-toggle]").forEach((tr) => {
    tr.onclick = (e) => {
      if (e.target.closest("[data-void]")) return;
      const idx = Number(tr.dataset.toggle);
      const txnId = visible[idx].txn_id;
      if (journalState.expanded.has(txnId)) journalState.expanded.delete(txnId);
      else journalState.expanded.add(txnId);
      renderEntriesTable();
    };
  });

  wrap.querySelectorAll("[data-void]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const txn_id = btn.dataset.void;
      const reason = prompt(`Reason for voiding ${txn_id}:`);
      if (!reason) return;
      if (!confirm(`Void entry ${txn_id}? This posts a reversing entry dated today.`)) return;
      try {
        await api("ledger", { method: "POST", body: { action: "void", txn_id, reason } });
        journalState.banner = { kind: "success", html: `Voided <code>${escapeHtml(txn_id)}</code>.` };
        renderBanner();
        await loadJournalEntries();
        renderEntriesTable();
      } catch (err) {
        journalState.banner = { kind: "error", html: errorBannerHtml(err) };
        renderBanner();
      }
    };
  });
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

const propertiesState = { rows: [], addOpen: false, banner: null };
const PROPERTY_STATUSES = ["held", "sold"]; // D-017

async function renderProperties(param) {
  if (param) {
    await renderPropertyDetail(param);
    return;
  }
  const el = $("page-properties");
  el.innerHTML = `<h1 class="page-title">Properties</h1><div id="properties-banner"></div>
    <div id="properties-add"></div>
    <div id="properties-table">Loading…</div>`;
  renderPropertiesBanner();
  renderPropertiesAddForm();
  try {
    const resp = await api("meta?tab=Properties");
    propertiesState.rows = rowsToObjects(resp.headers, resp.rows);
    renderPropertiesTable();
  } catch (err) {
    $("properties-table").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
  }
}

function renderPropertiesBanner() {
  const el = $("properties-banner");
  if (!el) return;
  el.innerHTML = propertiesState.banner ? `<div class="banner ${propertiesState.banner.kind}">${propertiesState.banner.html}</div>` : "";
}

// GET /api/property-mailboxes (session, any role) - the labels the properties@
// poller can see this run plus who's already registered (phase2.6-spec.md §3/§6).
// Fetched once per "Add property" open; a failure just falls back to the plain
// text field (never blocks adding a property).
async function fetchPropertyMailboxes() {
  try {
    return await api("property-mailboxes");
  } catch {
    return { labels: [], registered: [], fetchedAt: null };
  }
}

// prefill: an existing Properties row when editing from the detail view; undefined for "Add property".
async function renderPropertiesAddForm(prefill) {
  const wrap = $("properties-add");
  if (!wrap) return;
  if (!isOwner()) {
    wrap.innerHTML = "";
    return;
  }
  const p = prefill || {};
  if (!propertiesState.addOpen && !prefill) {
    wrap.innerHTML = `<button class="btn btn-secondary toggle-add-btn" id="properties-add-toggle">+ Add property</button>`;
    $("properties-add-toggle").onclick = () => {
      propertiesState.addOpen = true;
      renderPropertiesAddForm();
    };
    return;
  }

  // Name becomes a dropdown of mailbox labels for a brand-new property ("remove any
  // chance for error" - Paul, 2026-09-14) — a registered one is marked, and a final
  // option reveals the free-text field for a property with no mailbox yet. Editing
  // an existing property keeps the plain read-only name field, as before.
  let mailboxes = null;
  if (!prefill) {
    wrap.innerHTML = `<div class="section-card">Loading…</div>`;
    mailboxes = await fetchPropertyMailboxes();
  }
  const registeredNames = new Set((mailboxes?.registered || []).map((r) => r.name));
  const labelOptions = mailboxes ? [...new Set([...(mailboxes.labels || []), ...registeredNames])].sort() : [];
  const useNameSelect = !prefill && labelOptions.length > 0;
  const MANUAL = "__manual__";

  const nameFieldHtml = prefill
    ? `<input type="text" id="p-name" value="${escapeHtml(p.name || "")}" placeholder="881 Newport" readonly>`
    : useNameSelect
    ? `<select id="p-name">
        <option value="">Choose a mailbox…</option>
        ${labelOptions
          .map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}${registeredNames.has(n) ? " (registered)" : ""}</option>`)
          .join("")}
        <option value="${MANUAL}">— no property email yet —</option>
      </select>
      <input type="text" id="p-name-manual" placeholder="881 Newport" style="margin-top:6px;display:none;">`
    : `<input type="text" id="p-name" value="${escapeHtml(p.name || "")}" placeholder="881 Newport">`;

  wrap.innerHTML = `
    <div class="section-card">
      <h3>${prefill ? `Edit ${escapeHtml(prefill.name)}` : "Add property"}</h3>
      <div class="form-grid">
        <div class="field"><label>Name</label>${nameFieldHtml}</div>
        <div class="field"><label>Address</label><input type="text" id="p-address" value="${escapeHtml(p.address || "")}"></div>
        <div class="field"><label>Status</label><select id="p-status">${PROPERTY_STATUSES.map((s) => `<option value="${s}" ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <div class="field"><label>Template</label><input type="text" id="p-template" value="${escapeHtml(p.template || "")}"></div>
        <div class="field"><label>Purchase date</label><input type="date" id="p-purchase-date" value="${escapeHtml(p.purchase_date || "")}"></div>
        <div class="field"><label>Purchase price</label><input type="text" id="p-purchase-price" value="${escapeHtml(p.purchase_price || "")}" placeholder="207000.00" inputmode="decimal"></div>
        <div class="field"><label>Contract price (optional, buyer under contract)</label><input type="text" id="p-contract-price" value="${escapeHtml(p.contract_price || "")}" placeholder="290,000"></div>
        <div class="field"><label>Annual property tax (prorates Jan 1 to date until sold)</label><input type="text" id="p-tax-annual" value="${escapeHtml(p.tax_annual || "")}" placeholder="7,942" inputmode="decimal"></div>
        <div class="field"><label>Dennis profit share (%; 0 when Dennis is the bank only)</label><input type="text" id="p-dennis-share" value="${escapeHtml(p.dennis_share_pct === undefined || p.dennis_share_pct === "" ? "50" : String(p.dennis_share_pct))}" inputmode="decimal"></div>
        <div class="field"><label>Settlement date</label><input type="date" id="p-settlement-date" value="${escapeHtml(p.settlement_date || "")}"></div>
        <div class="field"><label>Dennis-funded</label><select id="p-dennis-funded"><option value="true" ${String(p.dennis_funded) === "true" ? "selected" : ""}>Yes</option><option value="false" ${String(p.dennis_funded) !== "true" ? "selected" : ""}>No</option></select></div>
        <div class="field full"><label>Drive folder</label><input type="text" id="p-drive-folder" value="${escapeHtml(p.drive_folder || "")}" placeholder="https://drive.google.com/..."></div>
        <div class="field full"><label>Notes</label><input type="text" id="p-notes" value="${escapeHtml(p.notes || "")}"></div>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;">
        <button class="btn btn-primary" id="p-save">${prefill ? "Save changes" : "Add property"}</button>
        <button class="btn btn-secondary" id="p-cancel">Cancel</button>
      </div>
    </div>`;

  if (useNameSelect) {
    const sel = $("p-name");
    const manual = $("p-name-manual");
    sel.onchange = () => {
      const isManual = sel.value === MANUAL;
      manual.style.display = isManual ? "" : "none";
      if (isManual) manual.focus();
      else manual.value = "";
    };
  }

  $("p-cancel").onclick = () => {
    propertiesState.addOpen = false;
    if (prefill) renderPropertyDetail(prefill.name);
    else renderPropertiesAddForm();
  };
  $("p-save").onclick = async () => {
    const name = (useNameSelect
      ? $("p-name").value === MANUAL
        ? $("p-name-manual").value
        : $("p-name").value
      : $("p-name").value
    ).trim();
    if (!name) {
      propertiesState.banner = { kind: "error", html: "Name is required." };
      renderPropertiesBanner();
      return;
    }
    let purchase_price;
    try {
      purchase_price = normalizeDollarsInput($("p-purchase-price").value);
    } catch {
      propertiesState.banner = { kind: "error", html: "Purchase price is not a valid dollar amount." };
      renderPropertiesBanner();
      return;
    }
    const row = {
      name,
      address: $("p-address").value.trim(),
      status: $("p-status").value,
      purchase_date: $("p-purchase-date").value,
      purchase_price,
      contract_price: $("p-contract-price").value.trim() ? normalizeDollarsInput($("p-contract-price").value) : "",
      tax_annual: $("p-tax-annual").value.trim() ? normalizeDollarsInput($("p-tax-annual").value) : "",
      dennis_share_pct: $("p-dennis-share").value.trim().replace("%", "") || "50",
      settlement_date: $("p-settlement-date").value,
      template: $("p-template").value.trim(),
      dennis_funded: $("p-dennis-funded").value,
      drive_folder: $("p-drive-folder").value.trim(),
      notes: $("p-notes").value.trim(),
    };
    // Two writer round trips (the upsert, then a 400-row formula tab): say so on the
    // button instead of leaving Paul staring at a static form (2026-09-14).
    const saveBtn = $("p-save");
    const busy = (label) => { saveBtn.disabled = true; saveBtn.textContent = label; };
    busy("Saving\u2026");
    try {
      await api("meta", { method: "POST", body: { action: "upsert", tab: "Properties", key_column: "name", row } });
      let html = `Saved <code>${escapeHtml(name)}</code>.`;
      // New property, not an edit: build its formula-only tab now (phase2.6-spec.md
      // §5/§6) rather than leaving it to a later manual run from the editor.
      if (!prefill) {
        try {
          busy("Building the property tab in the workbook\u2026 (about 20 s)");
          const tabResult = await api("meta", { method: "POST", body: { action: "propertyTab", name } });
          html += ` Property tab built (${tabResult.rows} rows).`;
        } catch (tabErr) {
          html += ` Property tab could not be built: ${errorBannerHtml(tabErr)}`;
        }
      }
      propertiesState.banner = { kind: "success", html };
      propertiesState.addOpen = false;
      if (prefill) navigate("properties", name);
      else await renderProperties();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = prefill ? "Save changes" : "Add property";
      propertiesState.banner = { kind: "error", html: errorBannerHtml(err) };
      renderPropertiesBanner();
    }
  };
}

function renderPropertiesTable() {
  const wrap = $("properties-table");
  if (!propertiesState.rows.length) {
    wrap.innerHTML = `<p class="rc-small">No properties yet.</p>`;
    return;
  }
  const rows = propertiesState.rows
    .map(
      (p) => `
      <tr class="clickable" data-property="${escapeHtml(p.name)}">
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.address)}</td>
        <td><span class="pill ${p.status === "sold" ? "closed" : "open"}">${escapeHtml(p.status)}</span></td>
        <td>${escapeHtml(p.purchase_date)}</td>
        <td class="num">${p.purchase_price ? fmtDollars(p.purchase_price) : ""}</td>
        <td>${String(p.dennis_funded) === "true" ? "Yes" : "No"}</td>
        <td>${escapeHtml(p.template)}</td>
      </tr>`
    )
    .join("");
  wrap.innerHTML = `
    <table class="rc-table">
      <thead><tr><th>Name</th><th>Address</th><th>Status</th><th>Purchase date</th><th class="num">Purchase price</th><th>Dennis-funded</th><th>Template</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  wrap.querySelectorAll("[data-property]").forEach((tr) => {
    tr.onclick = () => navigate("properties", tr.dataset.property);
  });
}

async function renderPropertyDetail(name) {
  const el = $("page-properties");
  el.innerHTML = `<a class="back-link" id="prop-back">&larr; All properties</a>
    <h1 class="page-title">${escapeHtml(name)}</h1>
    <div id="prop-detail-banner"></div>
    <div id="prop-status"></div>
    <div class="detail-grid" id="prop-detail-cards">Loading…</div>`;
  $("prop-back").onclick = () => navigate("properties");

  const asOf = today();
  try {
    const [propsResp, propbsResp, jobcostResp, dennisResp] = await Promise.all([
      api("meta?tab=Properties"),
      api(`reports?report=propbs&property=${encodeURIComponent(name)}&asOf=${asOf}`),
      api(`reports?report=jobcost&property=${encodeURIComponent(name)}&asOf=${asOf}`),
      api(`dennis?asOf=${asOf}`),
    ]);
    propertiesState.rows = rowsToObjects(propsResp.headers, propsResp.rows);
    const propRow = propertiesState.rows.find((p) => p.name === name);
    renderPropertyStatusEditor(propRow);
    if (!propRow) {
      $("prop-detail-cards").innerHTML = `<p class="rc-small">Property not found.</p>`;
      return;
    }
    $("prop-detail-cards").innerHTML = renderPropertyBsCard(propbsResp) + renderPropertyJobCostCard(jobcostResp) + renderPropertyAdvancesCard(name, dennisResp);
    if (isOwner()) {
      $("prop-detail-cards").insertAdjacentHTML(
        "beforebegin",
        `<button class="btn btn-secondary" id="prop-edit-btn" style="margin-bottom:16px;">Edit property</button>`
      );
      $("prop-edit-btn").onclick = () => {
        propertiesState.addOpen = true;
        const holder = document.createElement("div");
        holder.id = "properties-add";
        $("prop-edit-btn").replaceWith(holder);
        renderPropertiesAddForm(propRow);
      };
    }
  } catch (err) {
    $("prop-detail-cards").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
  }
}

function renderPropertyStatusEditor(propRow) {
  const wrap = $("prop-status");
  if (!wrap) return;
  if (!propRow) {
    wrap.innerHTML = "";
    return;
  }
  if (!isOwner() || propRow.status === "sold") {
    wrap.innerHTML = `<p class="rc-small">Status: <strong>${escapeHtml(propRow.status)}</strong>${propRow.status === "sold" ? " — read-only; the sell wizard is Phase 5." : ""}</p>`;
    return;
  }
  wrap.innerHTML = `
    <div class="status-editor">
      <label class="rc-small" style="font-weight:700;">Status</label>
      <select id="prop-status-select">
        ${["held"].map((s) => `<option value="${s}" ${propRow.status === s ? "selected" : ""}>${s}</option>`).join("")}
      </select>
    </div>`;
  $("prop-status-select").onchange = async (e) => {
    const status = e.target.value;
    try {
      const row = { ...propRow, status };
      await api("meta", { method: "POST", body: { action: "upsert", tab: "Properties", key_column: "name", row } });
      $("prop-detail-banner").innerHTML = `<div class="banner success">Status updated to ${escapeHtml(status)}.</div>`;
      propRow.status = status;
    } catch (err) {
      $("prop-detail-banner").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
    }
  };
}

function renderPropertyBsCard(propbs) {
  const assetsRows = (propbs.assets || []).map((a) => `<tr><td>${escapeHtml(a.account)}</td><td class="num">${fmtCents(a.balance)}</td></tr>`).join("");
  const liabRows = (propbs.liabilities || []).map((a) => `<tr><td>${escapeHtml(a.account)}</td><td class="num">${fmtCents(a.balance)}</td></tr>`).join("");
  return `
    <div class="section-card">
      <h3>Property balance sheet</h3>
      <table class="mini-table">
        <thead><tr><th>Assets</th><th class="num"></th></tr></thead>
        <tbody>${assetsRows || `<tr><td colspan="2" class="rc-small">None</td></tr>`}<tr class="total"><td>Total assets</td><td class="num">${fmtCents(propbs.total_assets)}</td></tr></tbody>
      </table>
      <table class="mini-table">
        <thead><tr><th>Liabilities</th><th class="num"></th></tr></thead>
        <tbody>${liabRows || `<tr><td colspan="2" class="rc-small">None</td></tr>`}<tr class="total"><td>Total liabilities</td><td class="num">${fmtCents(propbs.total_liabilities)}</td></tr></tbody>
      </table>
      <table class="mini-table"><tbody><tr class="total"><td>Net</td><td class="num">${fmtCents(propbs.net)}</td></tr></tbody></table>
    </div>`;
}

function renderPropertyJobCostCard(jc) {
  const classRows = (jc.by_cost_class || []).map((c) => `<tr><td>${escapeHtml(c.cost_class)}</td><td class="num">${fmtCents(c.total)}</td></tr>`).join("");
  const tradeRows = (jc.by_trade || []).map((c) => `<tr><td>${escapeHtml(c.trade || "(none)")}</td><td class="num">${fmtCents(c.total)}</td></tr>`).join("");
  return `
    <div class="section-card">
      <h3>Job cost</h3>
      <table class="mini-table">
        <thead><tr><th>By cost class</th><th class="num"></th></tr></thead>
        <tbody>${classRows || `<tr><td colspan="2" class="rc-small">None</td></tr>`}</tbody>
      </table>
      <table class="mini-table">
        <thead><tr><th>By trade</th><th class="num"></th></tr></thead>
        <tbody>${tradeRows || `<tr><td colspan="2" class="rc-small">None</td></tr>`}</tbody>
      </table>
      <table class="mini-table"><tbody>
        <tr class="total"><td>Total cost</td><td class="num">${fmtCents(jc.total_cost)}</td></tr>
        <tr><td>Released to COGS</td><td class="num">${fmtCents(jc.released_to_cogs)}</td></tr>
      </tbody></table>
    </div>`;
}

// The Advances card needs per-advance accrued interest as of today, which the
// dennisLedger output only carries inside each property's `payoff.advances`
// (from lib/accrual.payoffAt) — matched here to the raw Advances rows by
// advance_id. See the build report for why this reading of §4 was chosen.
function renderPropertyAdvancesCard(name, dennisResp) {
  const byProp = (dennisResp.by_property || []).find((p) => p.property === name);
  const payoffAdvances = (byProp && byProp.payoff && byProp.payoff.advances) || [];
  const accruedById = new Map(payoffAdvances.map((a) => [a.advance_id, a.interest_cents]));
  const advances = (dennisResp.advances || []).filter((a) => a.property === name);
  const rows = advances
    .map((a) => {
      const accrued = accruedById.has(a.advance_id) ? fmtCents(accruedById.get(a.advance_id)) : "—";
      return `<tr>
        <td>${escapeHtml(a.date)}</td>
        <td class="num">${a.amount ? fmtDollars(a.amount) : ""}</td>
        <td>${escapeHtml(a.status)}</td>
        <td class="num">${accrued}</td>
        <td>${escapeHtml(a.repaid_date)}</td>
      </tr>`;
    })
    .join("");
  const summary = byProp
    ? `<table class="mini-table"><tbody>
        <tr><td>Principal outstanding</td><td class="num">${fmtCents(byProp.principal_outstanding)}</td></tr>
        <tr><td>Interest posted</td><td class="num">${fmtCents(byProp.interest_posted)}</td></tr>
        <tr><td>Interest accrued to date</td><td class="num">${fmtCents(byProp.interest_accrued_to_date)}</td></tr>
        <tr class="total"><td>Interest unposted</td><td class="num">${fmtCents(byProp.interest_unposted)}</td></tr>
      </tbody></table>`
    : `<p class="rc-small">No Dennis advances on this property.</p>`;
  return `
    <div class="section-card">
      <h3>Advances</h3>
      ${summary}
      ${
        advances.length
          ? `<table class="mini-table" style="margin-top:10px;">
        <thead><tr><th>Date</th><th class="num">Amount</th><th>Status</th><th class="num">Accrued interest (today)</th><th>Repaid</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`
          : ""
      }
    </div>`;
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

const vendorsState = { rows: [], accounts: [], addOpen: false, editing: null, banner: null };

async function renderVendors() {
  const el = $("page-vendors");
  el.innerHTML = `<h1 class="page-title">Vendors</h1><div id="vendors-banner"></div><div id="vendors-add"></div><div id="vendors-table">Loading…</div>`;
  renderVendorsBanner();
  try {
    const [vendorsResp, accountsResp] = await Promise.all([api("meta?tab=Vendors"), api("meta?tab=Accounts")]);
    vendorsState.rows = rowsToObjects(vendorsResp.headers, vendorsResp.rows);
    vendorsState.accounts = rowsToObjects(accountsResp.headers, accountsResp.rows);
    renderVendorsAddForm();
    renderVendorsTable();
  } catch (err) {
    $("vendors-table").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
  }
}

function renderVendorsBanner() {
  const el = $("vendors-banner");
  if (!el) return;
  el.innerHTML = vendorsState.banner ? `<div class="banner ${vendorsState.banner.kind}">${vendorsState.banner.html}</div>` : "";
}

function renderVendorsAddForm() {
  const wrap = $("vendors-add");
  if (!wrap) return;
  if (!isOwner()) {
    wrap.innerHTML = "";
    return;
  }
  const v = vendorsState.editing || {};
  if (!vendorsState.addOpen && !vendorsState.editing) {
    wrap.innerHTML = `<button class="btn btn-secondary toggle-add-btn" id="vendors-add-toggle">+ Add vendor</button>`;
    $("vendors-add-toggle").onclick = () => {
      vendorsState.addOpen = true;
      renderVendorsAddForm();
    };
    return;
  }
  wrap.innerHTML = `
    <div class="section-card">
      <h3>${vendorsState.editing ? `Edit ${escapeHtml(v.canonical)}` : "Add vendor"}</h3>
      <div class="form-grid">
        <div class="field"><label>Canonical name</label><input type="text" id="v-canonical" value="${escapeHtml(v.canonical || "")}" ${vendorsState.editing ? "readonly" : ""} placeholder="Home Depot"></div>
        <div class="field"><label>Entity type</label><input type="text" id="v-entity-type" value="${escapeHtml(v.entity_type || "")}" placeholder="LLC / individual / corp"></div>
        <div class="field full"><label>Aliases (comma-separated)</label><input type="text" id="v-aliases" value="${escapeHtml(v.aliases || "")}" placeholder="The Home Depot, HD #1234"></div>
        <div class="field"><label>Form 1099</label><select id="v-1099"><option value="no" ${v.form_1099 !== "yes" ? "selected" : ""}>No</option><option value="yes" ${v.form_1099 === "yes" ? "selected" : ""}>Yes</option></select></div>
        <div class="field"><label>TIN status</label><input type="text" id="v-tin-status" value="${escapeHtml(v.tin_status || "")}" placeholder="on file / requested / missing"></div>
        <div class="field"><label>Default account</label><select id="v-default-account">${accountSelectOptions(v.default_account || "", vendorsState.accounts)}</select></div>
        <div class="field full"><label>Notes</label><input type="text" id="v-notes" value="${escapeHtml(v.notes || "")}"></div>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;">
        <button class="btn btn-primary" id="v-save">${vendorsState.editing ? "Save changes" : "Add vendor"}</button>
        <button class="btn btn-secondary" id="v-cancel">Cancel</button>
      </div>
    </div>`;

  $("v-cancel").onclick = () => {
    vendorsState.addOpen = false;
    vendorsState.editing = null;
    renderVendorsAddForm();
  };
  $("v-save").onclick = async () => {
    const canonical = $("v-canonical").value.trim();
    if (!canonical) {
      vendorsState.banner = { kind: "error", html: "Canonical name is required." };
      renderVendorsBanner();
      return;
    }
    const row = {
      canonical,
      aliases: $("v-aliases").value.trim(),
      entity_type: $("v-entity-type").value.trim(),
      form_1099: $("v-1099").value,
      tin_status: $("v-tin-status").value.trim(),
      w9_url: v.w9_url || "",
      default_account: $("v-default-account").value,
      notes: $("v-notes").value.trim(),
    };
    try {
      await api("meta", { method: "POST", body: { action: "upsert", tab: "Vendors", key_column: "canonical", row } });
      vendorsState.banner = { kind: "success", html: `Saved <code>${escapeHtml(canonical)}</code>.` };
      vendorsState.addOpen = false;
      vendorsState.editing = null;
      await renderVendors();
    } catch (err) {
      vendorsState.banner = { kind: "error", html: errorBannerHtml(err) };
      renderVendorsBanner();
    }
  };
}

function renderVendorsTable() {
  const wrap = $("vendors-table");
  if (!vendorsState.rows.length) {
    wrap.innerHTML = `<p class="rc-small">No vendors yet.</p>`;
    return;
  }
  const rows = vendorsState.rows
    .map(
      (v) => `
    <tr>
      <td>${escapeHtml(v.canonical)}</td>
      <td>${escapeHtml(v.aliases)}</td>
      <td>${escapeHtml(v.entity_type)}</td>
      <td>${v.form_1099 === "yes" ? "Yes" : "No"}</td>
      <td>${escapeHtml(v.tin_status)}</td>
      <td>${escapeHtml(v.default_account)}</td>
      <td>${isOwner() ? `<button class="btn btn-secondary" data-edit="${escapeHtml(v.canonical)}" style="padding:5px 10px;font-size:12px;">Edit</button>` : ""}</td>
    </tr>`
    )
    .join("");
  wrap.innerHTML = `
    <table class="rc-table">
      <thead><tr><th>Canonical</th><th>Aliases</th><th>Entity type</th><th>1099</th><th>TIN status</th><th>Default account</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  wrap.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => {
      vendorsState.editing = vendorsState.rows.find((v) => v.canonical === btn.dataset.edit);
      vendorsState.addOpen = true;
      renderVendorsAddForm();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });
}

// ---------------------------------------------------------------------------
// Banking
// ---------------------------------------------------------------------------

const bankingState = { rows: [], addOpen: false, banner: null };
const BANK_CODE_RE = /^14\d{2}$/;

async function renderBanking() {
  const el = $("page-banking");
  el.innerHTML = `<h1 class="page-title">Banking</h1>
    <div class="muted-note">Bank connections (Plaid) arrive in Phase 3 — accounts are added manually for now and balances are not synced automatically.</div>
    <div id="banking-banner"></div>
    <div id="banking-add"></div>
    <div id="banking-table">Loading…</div>`;
  renderBankingBanner();
  renderBankingAddForm();
  try {
    const resp = await api("meta?tab=Bank%20accounts");
    bankingState.rows = rowsToObjects(resp.headers, resp.rows);
    renderBankingTable();
    renderBankingAddForm(); // re-render so the uniqueness check sees the loaded codes
  } catch (err) {
    $("banking-table").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
  }
}

function renderBankingBanner() {
  const el = $("banking-banner");
  if (!el) return;
  el.innerHTML = bankingState.banner ? `<div class="banner ${bankingState.banner.kind}">${bankingState.banner.html}</div>` : "";
}

function renderBankingAddForm() {
  const wrap = $("banking-add");
  if (!wrap) return;
  if (!isOwner()) {
    wrap.innerHTML = "";
    return;
  }
  if (!bankingState.addOpen) {
    wrap.innerHTML = `<button class="btn btn-secondary toggle-add-btn" id="banking-add-toggle">+ Add bank account</button>`;
    $("banking-add-toggle").onclick = () => {
      bankingState.addOpen = true;
      renderBankingAddForm();
    };
    return;
  }
  wrap.innerHTML = `
    <div class="section-card">
      <h3>Add bank account</h3>
      <div class="form-grid">
        <div class="field"><label>Code (14xx)</label><input type="text" id="b-code" placeholder="1403" maxlength="4"></div>
        <div class="field"><label>Name</label><input type="text" id="b-name" placeholder="Cash - New account"></div>
        <div class="field"><label>Institution</label><input type="text" id="b-institution" placeholder="Chase"></div>
        <div class="field"><label>Last 4</label><input type="text" id="b-last4" maxlength="4" placeholder="1234"></div>
        <div class="field"><label>Opening balance</label><input type="text" id="b-opening-balance" placeholder="0.00" inputmode="decimal"></div>
        <div class="field"><label>Opening date</label><input type="date" id="b-opening-date"></div>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;">
        <button class="btn btn-primary" id="b-save">Add bank account</button>
        <button class="btn btn-secondary" id="b-cancel">Cancel</button>
      </div>
    </div>`;

  $("b-cancel").onclick = () => {
    bankingState.addOpen = false;
    renderBankingAddForm();
  };
  $("b-save").onclick = async () => {
    const code = $("b-code").value.trim();
    if (!BANK_CODE_RE.test(code) || code === "1400") {
      bankingState.banner = { kind: "error", html: "Code must be 1401-1499 (not 1400)." };
      renderBankingBanner();
      return;
    }
    if (bankingState.rows.some((r) => String(r.code) === code)) {
      bankingState.banner = { kind: "error", html: `Code ${escapeHtml(code)} is already in use.` };
      renderBankingBanner();
      return;
    }
    const name = $("b-name").value.trim();
    if (!name) {
      bankingState.banner = { kind: "error", html: "Name is required." };
      renderBankingBanner();
      return;
    }
    let opening_balance;
    try {
      opening_balance = normalizeDollarsInput($("b-opening-balance").value);
    } catch {
      bankingState.banner = { kind: "error", html: "Opening balance is not a valid dollar amount." };
      renderBankingBanner();
      return;
    }
    const row = {
      code,
      name,
      institution: $("b-institution").value.trim(),
      last4: $("b-last4").value.trim(),
      plaid_item_id: "",
      plaid_account_id: "",
      opening_balance,
      opening_date: $("b-opening-date").value,
      active: "true",
    };
    try {
      await api("meta", { method: "POST", body: { action: "upsert", tab: "Bank accounts", key_column: "code", row } });
      bankingState.banner = { kind: "success", html: `Added <code>${escapeHtml(code)}</code>.` };
      bankingState.addOpen = false;
      await renderBanking();
    } catch (err) {
      bankingState.banner = { kind: "error", html: errorBannerHtml(err) };
      renderBankingBanner();
    }
  };
}

function renderBankingTable() {
  const wrap = $("banking-table");
  if (!bankingState.rows.length) {
    wrap.innerHTML = `<p class="rc-small">No bank accounts yet.</p>`;
    return;
  }
  const rows = bankingState.rows
    .map(
      (b) => `
    <tr>
      <td>${escapeHtml(b.code)}</td>
      <td>${escapeHtml(b.name)}</td>
      <td>${escapeHtml(b.institution)}</td>
      <td>${b.last4 ? "••" + escapeHtml(b.last4) : ""}</td>
      <td class="num">${b.opening_balance !== "" && b.opening_balance != null ? fmtDollars(b.opening_balance) : ""}</td>
      <td>${escapeHtml(b.opening_date)}</td>
      <td>${String(b.active).toLowerCase() === "false" ? "No" : "Yes"}</td>
    </tr>`
    )
    .join("");
  wrap.innerHTML = `
    <table class="rc-table">
      <thead><tr><th>Code</th><th>Name</th><th>Institution</th><th>Last 4</th><th class="num">Opening balance</th><th>Opening date</th><th>Active</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ---------------------------------------------------------------------------
// Dennis
// ---------------------------------------------------------------------------

const dennisState = {
  asOf: today(),
  ledger: null,
  properties: [],
  bankAccounts: [],
  banner: null,
  period: currentPeriodStr(),
  preview: null,
  payoffProperty: "",
  payoffAsOf: today(),
  settings: {},
};

async function renderDennis() {
  const el = $("page-dennis");
  el.innerHTML = `<h1 class="page-title">Dennis</h1>
    <div id="dennis-banner"></div>
    <div class="cards-row" id="dennis-summary"></div>
    <div class="section-card"><h3>By property</h3><div id="dennis-by-property">Loading…</div></div>
    <div id="dennis-add"></div>
    <div class="section-card"><h3>Interest</h3><div id="dennis-interest"></div></div>
    <div class="section-card"><h3>Payoff calculator</h3><div id="dennis-payoff"></div></div>`;
  renderDennisBanner();
  try {
    const [dennisResp, propsResp, banksResp, settingsResp] = await Promise.all([
      api(`dennis?asOf=${dennisState.asOf}`),
      api("meta?tab=Properties"),
      api("meta?tab=Bank%20accounts"),
      api("meta?tab=Settings"),
    ]);
    dennisState.settings = Object.fromEntries(rowsToObjects(settingsResp.headers, settingsResp.rows).map((r) => [r.key, r.value]));
    dennisState.ledger = dennisResp;
    dennisState.properties = rowsToObjects(propsResp.headers, propsResp.rows);
    dennisState.bankAccounts = rowsToObjects(banksResp.headers, banksResp.rows);
    renderDennisSummary();
    renderDennisByProperty();
    renderDennisAddForm();
    renderDennisInterestPanel();
    renderDennisPayoffPanel();
  } catch (err) {
    $("dennis-by-property").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
  }
}

function renderDennisBanner() {
  const el = $("dennis-banner");
  if (!el) return;
  el.innerHTML = dennisState.banner ? `<div class="banner ${dennisState.banner.kind}">${dennisState.banner.html}</div>` : "";
}

function renderDennisSummary() {
  const t = dennisState.ledger.totals || {};
  $("dennis-summary").innerHTML =
    statCard("Principal outstanding", fmtCents(t.principal_outstanding || 0), "") +
    statCard("Interest posted", fmtCents(t.interest_posted || 0), "") +
    statCard("Interest accrued to date", fmtCents(t.interest_accrued_to_date || 0), "") +
    statCard("Interest unposted", fmtCents(t.interest_unposted || 0), "");
}

function renderDennisByProperty() {
  const rows = (dennisState.ledger.by_property || [])
    .map(
      (p) => `
    <tr class="clickable" data-property="${escapeHtml(p.property)}">
      <td>${escapeHtml(p.property)}</td>
      <td class="num">${fmtCents(p.principal_outstanding)}</td>
      <td class="num">${fmtCents(p.interest_posted)}</td>
      <td class="num">${fmtCents(p.interest_accrued_to_date)}</td>
      <td class="num">${fmtCents(p.interest_unposted)}</td>
    </tr>`
    )
    .join("");
  $("dennis-by-property").innerHTML = rows
    ? `<table class="rc-table">
        <thead><tr><th>Property</th><th class="num">Principal outstanding</th><th class="num">Interest posted</th><th class="num">Interest accrued to date</th><th class="num">Interest unposted</th></tr></thead>
        <tbody>${rows}</tbody>
      </table><p class="rc-small" style="margin-top:8px;">Click a row to open the property view.</p>`
    : `<p class="rc-small">No open advances.</p>`;
  document.querySelectorAll("#dennis-by-property [data-property]").forEach((tr) => {
    tr.onclick = () => navigate("properties", tr.dataset.property);
  });
}

function renderDennisAddForm() {
  const wrap = $("dennis-add");
  if (!wrap) return;
  if (!isOwner()) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = `
    <div class="section-card">
      <h3>Add advance</h3>
      <div class="form-grid">
        <div class="field"><label>Date</label><input type="date" id="d-date" value="${today()}"></div>
        <div class="field"><label>Amount</label><input type="text" id="d-amount" placeholder="207000.00" inputmode="decimal"></div>
        <div class="field"><label>Property</label><select id="d-property">${realPropertyOptions("", dennisState.properties)}</select></div>
        <div class="field"><label>Kind</label><select id="d-kind"><option value="purchase">Purchase principal (paid to the seller, posts as the purchase price)</option><option value="cash">Cash advance (for the property; lands in an account)</option><option value="personal">Personal loan to Paul (not a property cost; Paul repays)</option></select></div>
        <div class="field" id="d-into-field" hidden><label>Into</label><select id="d-into">${bankAccountSelectOptions("1401", dennisState.bankAccounts)}<option value="2030">2030 — Paul Personal (reimburses Paul, Due to owner)</option></select></div>
        <div class="field"><label>Interest rate (% per year)</label><input type="text" id="d-rate" inputmode="decimal" value="${escapeHtml(String(Math.round(Number(dennisState.settings.interest_rate_annual || 0.08) * 10000) / 100))}"></div>
        <div class="field full"><label>Memo</label><input type="text" id="d-memo" placeholder="Optional"></div>
      </div>
      <button class="btn btn-primary" id="d-save" style="margin-top:10px;">Add advance</button>
    </div>`;
  $("d-kind").onchange = () => {
    $("d-into-field").hidden = $("d-kind").value !== "cash";
    $("d-property").disabled = $("d-kind").value === "personal";
  };
  $("d-save").onclick = async () => {
    const saveBtn = $("d-save");
    if (saveBtn.disabled) return; // a second click while posting is ignored
    const date = $("d-date").value;
    const property = $("d-property").value;
    const into = $("d-into").value;
    const memo = $("d-memo").value.trim();
    const kindNow = $("d-kind").value;
    if (!property && kindNow !== "personal") {
      dennisState.banner = { kind: "error", html: "Choose a property." };
      renderDennisBanner();
      return;
    }
    let amount_cents;
    try {
      amount_cents = toCents($("d-amount").value);
    } catch {
      dennisState.banner = { kind: "error", html: "Enter a valid dollar amount." };
      renderDennisBanner();
      return;
    }
    const kind = kindNow;
    const body = { action: "addAdvance", date, amount_cents, property: kind === "personal" ? "" : property, kind };
    if (kind === "cash") body.into = into;
    const rateRaw = $("d-rate").value.trim();
    if (rateRaw !== "") {
      const rate_pct = Number(rateRaw.replace("%", ""));
      if (!(Number.isFinite(rate_pct) && rate_pct > 0 && rate_pct < 100)) {
        dennisState.banner = { kind: "error", html: "Enter the interest rate as a percent, like 8." };
        renderDennisBanner();
        return;
      }
      body.rate_pct = rate_pct;
    }
    if (memo) body.memo = memo;
    saveBtn.disabled = true;
    saveBtn.textContent = "Posting advance…";
    dennisState.banner = { kind: "", html: "Posting the advance to the books…" };
    renderDennisBanner();
    try {
      const result = await api("dennis", { method: "POST", body });
      const txnHtml = result && result.entry && result.entry.txn_id ? ` <code>${escapeHtml(result.entry.txn_id)}</code>` : "";
      dennisState.banner = { kind: "", html: `Advance posted.${txnHtml} Rebuilding the ${escapeHtml(property)} tab…` };
      renderDennisBanner();
      saveBtn.textContent = "Rebuilding property tab…";
      // The property tab sizes its advance schedules to the Advances rows; the rebuild is
      // slow (Apps Script), so it runs after the post rather than inside it.
      let tabNote = "";
      try {
        if (kind !== "personal") await api("meta", { method: "POST", body: { action: "propertyTab", name: property } });
        tabNote = kind === "personal" ? "" : ` The ${escapeHtml(property)} tab is rebuilt.`;
      } catch (tabErr) {
        tabNote = ` The ${escapeHtml(property)} tab was not rebuilt (${escapeHtml(tabErr.message || String(tabErr))}); run rebuildAllPropertyTabs in the editor.`;
      }
      dennisState.banner = { kind: "success", html: `Advance posted.${txnHtml}${tabNote}` };
      await renderDennis();
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Add advance";
      dennisState.banner = { kind: "error", html: errorBannerHtml(err) };
      renderDennisBanner();
    }
  };
}

// The exact response shape of previewInterest isn't nailed down in phase1-spec
// §4 beyond prose ("the period delta and the entry that would post") — this
// reads several plausible field names defensively and falls back to a raw-JSON
// dump so the panel stays useful either way. See the build report.
function extractPreviewItems(resp) {
  const arr = resp.previews || resp.preview || resp.entries || resp.items || [];
  return Array.isArray(arr) ? arr : [];
}

function renderDennisInterestPanel() {
  const wrap = $("dennis-interest");
  const previewRows = dennisState.preview ? extractPreviewItems(dennisState.preview) : [];
  const knownShape = dennisState.preview && (dennisState.preview.previews || dennisState.preview.preview || dennisState.preview.entries || dennisState.preview.items);
  wrap.innerHTML = `
    <div class="form-grid" style="margin-bottom:10px;">
      <div class="field"><label>Period</label><input type="month" id="di-period" value="${escapeHtml(dennisState.period)}"></div>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:14px;">
      <button class="btn btn-secondary" id="di-preview">Preview</button>
      ${isOwner() ? `<button class="btn btn-primary" id="di-post">Post interest</button>` : ""}
    </div>
    <div id="di-result">
      ${
        dennisState.preview
          ? previewRows.length
            ? `<table class="rc-table">
              <thead><tr><th>Advance</th><th>Property</th><th class="num">Period delta</th><th>Entry</th></tr></thead>
              <tbody>${previewRows
                .map(
                  (r) => `<tr>
                <td>${escapeHtml(r.advance_id || r.advance || "")}</td>
                <td>${escapeHtml(r.property || "")}</td>
                <td class="num">${fmtCents(r.delta_cents ?? r.period_delta_cents ?? r.amount_cents ?? 0)}</td>
                <td>${escapeHtml(r.description || r.memo || (r.entry && r.entry.memo) || "")}</td>
              </tr>`
                )
                .join("")}</tbody>
            </table>`
            : knownShape
              ? `<p class="rc-small">No unposted interest for ${escapeHtml(dennisState.period)}.</p>`
              : `<p class="rc-small">Preview response (unrecognized shape — shown raw):</p><pre style="white-space:pre-wrap;font-size:11.5px;">${escapeHtml(JSON.stringify(dennisState.preview, null, 2))}</pre>`
          : ""
      }
    </div>`;

  $("di-period").onchange = (e) => {
    dennisState.period = e.target.value;
    dennisState.preview = null;
    renderDennisInterestPanel();
  };
  $("di-preview").onclick = async () => {
    try {
      const resp = await api("dennis", { method: "POST", body: { action: "previewInterest", period: dennisState.period } });
      dennisState.preview = resp;
      renderDennisInterestPanel();
    } catch (err) {
      dennisState.banner = { kind: "error", html: errorBannerHtml(err) };
      renderDennisBanner();
    }
  };
  const postBtn = $("di-post");
  if (postBtn) {
    postBtn.onclick = async () => {
      if (!confirm(`Post interest for ${dennisState.period}? This writes to the workbook and cannot be undone from here.`)) return;
      try {
        const resp = await api("dennis", { method: "POST", body: { action: "postInterest", period: dennisState.period } });
        const posted = resp && resp.posted ? resp.posted.length : null;
        dennisState.banner = { kind: "success", html: `Posted interest for ${escapeHtml(dennisState.period)}${posted != null ? ` (${posted} ${posted === 1 ? "entry" : "entries"})` : ""}.` };
        dennisState.preview = null;
        renderDennisBanner();
        await renderDennis();
      } catch (err) {
        if (err instanceof ApiError && err.body && err.body.error === "DUPLICATE") {
          dennisState.banner = { kind: "error", html: `Interest for ${escapeHtml(dennisState.period)} was already posted.` };
        } else {
          dennisState.banner = { kind: "error", html: errorBannerHtml(err) };
        }
        renderDennisBanner();
      }
    };
  }
}

function renderDennisPayoffPanel() {
  const wrap = $("dennis-payoff");
  wrap.innerHTML = `
    <div class="form-grid" style="margin-bottom:10px;">
      <div class="field"><label>Property</label><select id="dp-property">${realPropertyOptions(dennisState.payoffProperty, dennisState.properties)}</select></div>
      <div class="field"><label>As of</label><input type="date" id="dp-asof" value="${escapeHtml(dennisState.payoffAsOf)}"></div>
    </div>
    <button class="btn btn-secondary" id="dp-calc">Calculate</button>
    <div id="dp-result" style="margin-top:14px;"></div>`;

  $("dp-calc").onclick = async () => {
    const property = $("dp-property").value;
    const asOf = $("dp-asof").value;
    dennisState.payoffProperty = property;
    dennisState.payoffAsOf = asOf;
    if (!property) {
      $("dp-result").innerHTML = `<p class="rc-small">Choose a property.</p>`;
      return;
    }
    $("dp-result").innerHTML = `<p class="rc-small">Loading…</p>`;
    try {
      const resp = asOf === dennisState.asOf && dennisState.ledger ? dennisState.ledger : await api(`dennis?asOf=${asOf}`);
      const byProp = (resp.by_property || []).find((p) => p.property === property);
      const payoff = byProp && byProp.payoff;
      if (!payoff) {
        $("dp-result").innerHTML = `<p class="rc-small">No open advances for ${escapeHtml(property)} as of ${escapeHtml(asOf)}.</p>`;
        return;
      }
      const scheduleRows = (payoff.advances || [])
        .map(
          (a) => `<tr>
        <td>${escapeHtml(a.advance_id)}</td>
        <td>${escapeHtml(a.date)}</td>
        <td class="num">${fmtCents(a.amount_cents)}</td>
        <td class="num">${a.anniversaries}</td>
        <td class="num">${a.stub_days}</td>
        <td class="num">${fmtCents(a.interest_cents)}</td>
      </tr>`
        )
        .join("");
      $("dp-result").innerHTML = `
        <table class="mini-table" style="max-width:420px;">
          <tbody>
            <tr><td>Principal</td><td class="num">${fmtCents(payoff.principal_cents)}</td></tr>
            <tr><td>Interest</td><td class="num">${fmtCents(payoff.interest_cents)}</td></tr>
            <tr class="total"><td>Total payoff</td><td class="num">${fmtCents(payoff.total_cents)}</td></tr>
          </tbody>
        </table>
        <p class="rc-small" style="margin:10px 0 4px;">Anniversary schedule</p>
        <table class="rc-table">
          <thead><tr><th>Advance</th><th>Date</th><th class="num">Principal</th><th class="num">Anniversaries reached</th><th class="num">Stub days</th><th class="num">Interest</th></tr></thead>
          <tbody>${scheduleRows}</tbody>
        </table>`;
    } catch (err) {
      $("dp-result").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
    }
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const reportsState = {
  tab: "tb",
  asOf: today(),
  from: firstOfMonthIso(),
  to: today(),
  property: "",
  properties: [],
  spreadsheetUrl: "",
  csv: null, // {filename, headers, rows} for the currently-shown table
};

const REPORT_TABS = [
  { key: "tb", label: "Trial balance" },
  { key: "bs", label: "Balance sheet" },
  { key: "pl", label: "P&L" },
  { key: "jobcost", label: "Job cost" },
];

async function renderReports() {
  const el = $("page-reports");
  el.innerHTML = `<h1 class="page-title">Reports</h1>
    <div class="page-toolbar">
      <div class="tabbar" id="reports-tabbar"></div>
      <span id="reports-workbook-link" class="rc-small"></span>
    </div>
    <div id="reports-controls" class="section-card"></div>
    <div id="reports-banner"></div>
    <div id="reports-body"></div>`;
  renderReportsTabbar();
  try {
    const [settingsResp, propsResp] = await Promise.all([api("meta?tab=Settings"), api("meta?tab=Properties")]);
    const settingsRows = rowsToObjects(settingsResp.headers, settingsResp.rows);
    const wb = settingsRows.find((r) => r.key === "spreadsheet_url");
    reportsState.spreadsheetUrl = (wb && wb.value) || "";
    $("reports-workbook-link").innerHTML = reportsState.spreadsheetUrl
      ? `<a href="${escapeHtml(reportsState.spreadsheetUrl)}" target="_blank" rel="noopener">Open in workbook &rarr;</a>`
      : "";
    reportsState.properties = rowsToObjects(propsResp.headers, propsResp.rows);
  } catch {
    // Non-fatal — the report itself can still run without the workbook link / property list.
  }
  renderReportsControls();
  await loadReport();
}

function renderReportsTabbar() {
  $("reports-tabbar").innerHTML = REPORT_TABS.map((t) => `<button data-tab="${t.key}" class="${reportsState.tab === t.key ? "active" : ""}">${t.label}</button>`).join("");
  document.querySelectorAll("#reports-tabbar button").forEach((btn) => {
    btn.onclick = async () => {
      reportsState.tab = btn.dataset.tab;
      reportsState.csv = null;
      renderReportsTabbar();
      renderReportsControls();
      await loadReport();
    };
  });
}

function renderReportsControls() {
  const wrap = $("reports-controls");
  const needsRange = reportsState.tab === "pl";
  const needsProperty = reportsState.tab === "jobcost";
  wrap.innerHTML = `
    <div class="form-grid">
      ${
        needsRange
          ? `<div class="field"><label>From</label><input type="date" id="r-from" value="${escapeHtml(reportsState.from)}"></div>
           <div class="field"><label>To</label><input type="date" id="r-to" value="${escapeHtml(reportsState.to)}"></div>`
          : `<div class="field"><label>As of</label><input type="date" id="r-asof" value="${escapeHtml(reportsState.asOf)}"></div>`
      }
      ${needsProperty ? `<div class="field"><label>Property</label><select id="r-property">${realPropertyOptions(reportsState.property, reportsState.properties)}</select></div>` : ""}
    </div>
    <div style="margin-top:10px;display:flex;gap:10px;">
      <button class="btn btn-primary" id="r-run">Run report</button>
      <button class="btn btn-secondary" id="r-csv" ${reportsState.csv ? "" : "disabled"}>Download CSV</button>
    </div>`;
  $("r-run").onclick = async () => {
    if (needsRange) {
      reportsState.from = $("r-from").value;
      reportsState.to = $("r-to").value;
    } else {
      reportsState.asOf = $("r-asof").value;
    }
    if (needsProperty) reportsState.property = $("r-property").value;
    await loadReport();
  };
  $("r-csv").onclick = () => {
    if (reportsState.csv) downloadCsv(reportsState.csv.filename, reportsState.csv.headers, reportsState.csv.rows);
  };
}

function updateCsvButton() {
  const btn = $("r-csv");
  if (btn) btn.disabled = !reportsState.csv;
}

function tieRowHtml(ok, label) {
  return `<div class="balance-row ${ok ? "ok" : "off"}"><span>${escapeHtml(label)}</span><span>${ok ? "✓" : "✗"}</span></div>`;
}

async function loadReport() {
  const body = $("reports-body");
  const tab = reportsState.tab;
  if (tab === "jobcost" && !reportsState.property) {
    body.innerHTML = `<p class="rc-small">Choose a property to run the job cost report.</p>`;
    reportsState.csv = null;
    updateCsvButton();
    return;
  }
  body.innerHTML = `<p class="rc-small">Loading…</p>`;
  try {
    let qs;
    if (tab === "pl") qs = `report=pl&from=${reportsState.from}&to=${reportsState.to}`;
    else if (tab === "jobcost") qs = `report=jobcost&asOf=${reportsState.asOf}&property=${encodeURIComponent(reportsState.property)}`;
    else qs = `report=${tab}&asOf=${reportsState.asOf}`;
    const resp = await api(`reports?${qs}`);
    renderReportBody(tab, resp);
  } catch (err) {
    body.innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
    reportsState.csv = null;
    updateCsvButton();
  }
}

function renderReportBody(tab, data) {
  const body = $("reports-body");
  if (tab === "tb") {
    const rows = data.rows || [];
    body.innerHTML = `
      <div class="section-card">
        <table class="rc-table">
          <thead><tr><th>Account</th><th>Name</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Net</th></tr></thead>
          <tbody>
            ${rows.map((r) => `<tr><td>${escapeHtml(r.account)}</td><td>${escapeHtml(r.name || "")}</td><td class="num">${fmtCents(r.debit)}</td><td class="num">${fmtCents(r.credit)}</td><td class="num">${fmtCents(r.net)}</td></tr>`).join("")}
            <tr style="font-weight:700;"><td colspan="2">Total</td><td class="num">${fmtCents(data.total_debit)}</td><td class="num">${fmtCents(data.total_credit)}</td><td></td></tr>
          </tbody>
        </table>
        ${tieRowHtml(data.balanced, "Debits = Credits")}
      </div>`;
    reportsState.csv = {
      filename: `trial-balance-${reportsState.asOf}.csv`,
      headers: ["Account", "Name", "Debit", "Credit", "Net"],
      rows: rows.map((r) => [r.account, r.name || "", fromCents(r.debit), fromCents(r.credit), fromCents(r.net)]),
    };
  } else if (tab === "bs") {
    const section = (label, rows) => `
      <h4 style="margin:14px 0 6px;">${label}</h4>
      <table class="mini-table"><tbody>
        ${(rows || []).map((r) => `<tr><td>${escapeHtml(r.account)}</td><td class="num">${fmtCents(r.balance)}</td></tr>`).join("") || `<tr><td colspan="2" class="rc-small">None</td></tr>`}
      </tbody></table>`;
    body.innerHTML = `
      <div class="section-card">
        ${section("Assets", data.assets)}
        <table class="mini-table"><tbody><tr class="total"><td>Total assets</td><td class="num">${fmtCents(data.total_assets)}</td></tr></tbody></table>
        ${section("Liabilities", data.liabilities)}
        <table class="mini-table"><tbody><tr class="total"><td>Total liabilities</td><td class="num">${fmtCents(data.total_liabilities)}</td></tr></tbody></table>
        ${section("Equity", data.equity)}
        <table class="mini-table"><tbody>
          <tr><td>Current earnings</td><td class="num">${fmtCents(data.current_earnings)}</td></tr>
          <tr class="total"><td>Total equity</td><td class="num">${fmtCents(data.total_equity)}</td></tr>
        </tbody></table>
        ${tieRowHtml(data.ties, "Assets = Liabilities + Equity")}
      </div>`;
    const csvRows = []
      .concat((data.assets || []).map((r) => ["Asset", r.account, fromCents(r.balance)]))
      .concat([["Asset", "Total assets", fromCents(data.total_assets)]])
      .concat((data.liabilities || []).map((r) => ["Liability", r.account, fromCents(r.balance)]))
      .concat([["Liability", "Total liabilities", fromCents(data.total_liabilities)]])
      .concat((data.equity || []).map((r) => ["Equity", r.account, fromCents(r.balance)]))
      .concat([
        ["Equity", "Current earnings", fromCents(data.current_earnings)],
        ["Equity", "Total equity", fromCents(data.total_equity)],
      ]);
    reportsState.csv = { filename: `balance-sheet-${reportsState.asOf}.csv`, headers: ["Section", "Account", "Balance"], rows: csvRows };
  } else if (tab === "pl") {
    const section = (label, rows) => `
      <h4 style="margin:14px 0 6px;">${label}</h4>
      <table class="mini-table"><tbody>
        ${(rows || []).map((r) => `<tr><td>${escapeHtml(r.account)}</td><td class="num">${fmtCents(r.balance ?? r.total)}</td></tr>`).join("") || `<tr><td colspan="2" class="rc-small">None</td></tr>`}
      </tbody></table>`;
    const byPropRows = (data.by_property || [])
      .map((p) => `<tr><td>${escapeHtml(p.property)}</td><td class="num">${fmtCents(p.income)}</td><td class="num">${fmtCents(p.cogs)}</td><td class="num">${fmtCents(p.gross)}</td></tr>`)
      .join("");
    const sumIncome = (data.income || []).reduce((s, r) => s + (r.balance ?? r.total ?? 0), 0);
    const sumCogs = (data.cogs || []).reduce((s, r) => s + (r.balance ?? r.total ?? 0), 0);
    const sumExpenses = (data.expenses || []).reduce((s, r) => s + (r.balance ?? r.total ?? 0), 0);
    const tieOk = Math.round(sumIncome - sumCogs) === Math.round(data.gross_profit) && Math.round(data.gross_profit - sumExpenses) === Math.round(data.net_income);
    body.innerHTML = `
      <div class="section-card">
        ${section("Income", data.income)}
        ${section("COGS", data.cogs)}
        <table class="mini-table"><tbody><tr class="total"><td>Gross profit</td><td class="num">${fmtCents(data.gross_profit)}</td></tr></tbody></table>
        ${section("Expenses", data.expenses)}
        <table class="mini-table"><tbody><tr class="total"><td>Net income</td><td class="num">${fmtCents(data.net_income)}</td></tr></tbody></table>
        <h4 style="margin:14px 0 6px;">By property</h4>
        <table class="rc-table"><thead><tr><th>Property</th><th class="num">Income</th><th class="num">COGS</th><th class="num">Gross</th></tr></thead><tbody>${byPropRows || `<tr><td colspan="4" class="rc-small">None</td></tr>`}</tbody></table>
        ${tieRowHtml(tieOk, "Gross profit − Expenses = Net income")}
      </div>`;
    const csvRows = []
      .concat((data.income || []).map((r) => ["Income", r.account, fromCents(r.balance ?? r.total)]))
      .concat((data.cogs || []).map((r) => ["COGS", r.account, fromCents(r.balance ?? r.total)]))
      .concat([["", "Gross profit", fromCents(data.gross_profit)]])
      .concat((data.expenses || []).map((r) => ["Expense", r.account, fromCents(r.balance ?? r.total)]))
      .concat([["", "Net income", fromCents(data.net_income)]]);
    reportsState.csv = { filename: `pl-${reportsState.from}-to-${reportsState.to}.csv`, headers: ["Section", "Account", "Amount"], rows: csvRows };
  } else if (tab === "jobcost") {
    const classRows = (data.by_cost_class || []).map((r) => `<tr><td>${escapeHtml(r.cost_class)}</td><td class="num">${fmtCents(r.total)}</td></tr>`).join("");
    const acctRows = (data.by_account || []).map((r) => `<tr><td>${escapeHtml(r.account)}</td><td class="num">${fmtCents(r.total)}</td></tr>`).join("");
    const tradeRows = (data.by_trade || []).map((r) => `<tr><td>${escapeHtml(r.trade || "(none)")}</td><td class="num">${fmtCents(r.total)}</td></tr>`).join("");
    const classSum = (data.by_cost_class || []).reduce((s, r) => s + (r.total || 0), 0);
    const tieOk = Math.round(classSum) === Math.round(data.total_cost);
    body.innerHTML = `
      <div class="section-card">
        <h4 style="margin:0 0 6px;">By cost class</h4>
        <table class="mini-table"><tbody>${classRows || `<tr><td colspan="2" class="rc-small">None</td></tr>`}</tbody></table>
        <h4 style="margin:14px 0 6px;">By account</h4>
        <table class="mini-table"><tbody>${acctRows || `<tr><td colspan="2" class="rc-small">None</td></tr>`}</tbody></table>
        <h4 style="margin:14px 0 6px;">By trade</h4>
        <table class="mini-table"><tbody>${tradeRows || `<tr><td colspan="2" class="rc-small">None</td></tr>`}</tbody></table>
        <table class="mini-table" style="margin-top:8px;"><tbody>
          <tr class="total"><td>Total cost</td><td class="num">${fmtCents(data.total_cost)}</td></tr>
          <tr><td>Released to COGS</td><td class="num">${fmtCents(data.released_to_cogs)}</td></tr>
        </tbody></table>
        ${tieRowHtml(tieOk, "Cost classes = Total cost")}
      </div>`;
    const csvRows = (data.by_cost_class || [])
      .map((r) => ["Cost class", r.cost_class, fromCents(r.total)])
      .concat((data.by_account || []).map((r) => ["Account", r.account, fromCents(r.total)]))
      .concat((data.by_trade || []).map((r) => ["Trade", r.trade || "(none)", fromCents(r.total)]))
      .concat([
        ["Total", "Total cost", fromCents(data.total_cost)],
        ["Total", "Released to COGS", fromCents(data.released_to_cogs)],
      ]);
    reportsState.csv = { filename: `job-cost-${reportsState.property}-${reportsState.asOf}.csv`, headers: ["Group", "Item", "Amount"], rows: csvRows };
  }
  updateCsvButton();
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

async function renderPeriods() {
  const el = $("page-periods");
  el.innerHTML = `<h1 class="page-title">Periods</h1><div id="periods-banner"></div><div id="periods-table">Loading…</div>`;

  try {
    const resp = await api("meta?tab=Periods");
    const rows = rowsToObjects(resp.headers, resp.rows);
    rows.sort((a, b) => (a.period < b.period ? 1 : -1));

    const trs = rows
      .map((r) => {
        const nextStatus = r.status === "open" ? "closed" : "open";
        const toggleBtn = isOwner()
          ? `<button class="btn btn-secondary" data-toggle-period="${escapeHtml(r.period)}" data-next="${nextStatus}" style="padding:6px 12px;font-size:12.5px;">Mark ${nextStatus}</button>`
          : "";
        return `<tr>
          <td>${escapeHtml(r.period)}</td>
          <td><span class="pill ${r.status === "open" ? "open" : "closed"}">${escapeHtml(r.status)}</span></td>
          <td>${escapeHtml(r.closed_at)}</td>
          <td>${escapeHtml(r.notes)}</td>
          <td>${toggleBtn}</td>
        </tr>`;
      })
      .join("");

    $("periods-table").innerHTML = `
      <table class="rc-table">
        <thead><tr><th>Period</th><th>Status</th><th>Closed at</th><th>Notes</th><th></th></tr></thead>
        <tbody>${trs}</tbody>
      </table>`;

    document.querySelectorAll("[data-toggle-period]").forEach((btn) => {
      btn.onclick = async () => {
        const period = btn.dataset.togglePeriod;
        const status = btn.dataset.next;
        if (!confirm(`Mark ${period} as ${status}?`)) return;
        try {
          await api("meta", { method: "POST", body: { action: "setPeriod", period, status } });
          $("periods-banner").innerHTML = `<div class="banner success">Marked ${escapeHtml(period)} as ${escapeHtml(status)}.</div>`;
          await renderPeriods();
        } catch (err) {
          $("periods-banner").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
        }
      };
    });
  } catch (err) {
    $("periods-table").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const settingsState = { settings: [], users: [] };

async function renderSettings() {
  const el = $("page-settings");
  const refreshLink = isOwner()
    ? ` <a href="#" id="settings-refresh-link" style="font-size:13px;font-weight:normal;">Refresh from sheet</a>`
    : "";
  el.innerHTML = `<h1 class="page-title">Settings${refreshLink}</h1><div id="settings-banner"></div><div id="settings-tables">Loading…</div>`;
  renderSettingsBanner();
  const link = $("settings-refresh-link");
  if (link) {
    link.onclick = async (e) => {
      e.preventDefault();
      link.textContent = "Refreshing…";
      try {
        await Promise.all([api("meta?tab=Settings&fresh=1"), api("meta?tab=Users&fresh=1")]); // bypasses the books-cache TTL (phase2.5-spec.md section 2)
        await renderSettings();
      } catch (err) {
        renderSettingsBanner({ kind: "error", html: errorBannerHtml(err) });
      }
    };
  }
  try {
    const [settingsResp, usersResp] = await Promise.all([api("meta?tab=Settings"), api("meta?tab=Users")]);
    settingsState.settings = rowsToObjects(settingsResp.headers, settingsResp.rows);
    settingsState.users = rowsToObjects(usersResp.headers, usersResp.rows);
    renderSettingsTables();
  } catch (err) {
    $("settings-tables").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
  }
}

/** YYYY-MM of the month before today (for the API usage month picker). */
function previousMonthStr() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function renderSettingsBanner(banner) {
  if (banner !== undefined) settingsState.banner = banner;
  const el = $("settings-banner");
  if (!el) return;
  el.innerHTML = settingsState.banner ? `<div class="banner ${settingsState.banner.kind}">${settingsState.banner.html}</div>` : "";
}

function ownerCount(users) {
  return users.filter((u) => u.role === "owner").length;
}

function renderSettingsTables() {
  const wrap = $("settings-tables");
  const owner = isOwner();

  const settingsRows = settingsState.settings
    .map((s, i) =>
      owner
        ? `<tr>
        <td><code>${escapeHtml(s.key)}</code></td>
        <td><input type="text" data-setting-value="${i}" value="${escapeHtml(s.value)}"></td>
        <td><input type="text" data-setting-notes="${i}" value="${escapeHtml(s.notes || "")}"></td>
        <td><button class="btn btn-secondary" data-setting-save="${i}" style="padding:5px 10px;font-size:12px;">Save</button></td>
      </tr>`
        : `<tr><td><code>${escapeHtml(s.key)}</code></td><td>${escapeHtml(s.value)}</td><td>${escapeHtml(s.notes || "")}</td><td></td></tr>`
    )
    .join("");

  const usersRows = settingsState.users
    .map((u) => {
      const isRemoved = u.role === "removed";
      const lastOwner = u.role === "owner" && ownerCount(settingsState.users) <= 1;
      let roleControl;
      if (!owner) roleControl = escapeHtml(u.role);
      else if (isRemoved) roleControl = `<span class="pill closed">removed</span>`;
      else
        roleControl = `<select data-role-select="${escapeHtml(u.email)}" ${lastOwner ? 'disabled title="Cannot demote the last owner"' : ""}>
          ${["owner", "partner", "accountant"].map((r) => `<option value="${r}" ${u.role === r ? "selected" : ""}>${r}</option>`).join("")}
        </select>`;
      const removeBtn =
        owner && !isRemoved
          ? `<button class="btn btn-secondary" data-remove-user="${escapeHtml(u.email)}" style="padding:5px 10px;font-size:12px;" ${lastOwner ? 'disabled title="Cannot remove the last owner"' : ""}>Remove</button>`
          : "";
      return `<tr>
      <td>${escapeHtml(u.email)}</td>
      <td>${roleControl}</td>
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.added_at)}</td>
      <td>${removeBtn}</td>
    </tr>`;
    })
    .join("");

  wrap.innerHTML = `
    <div class="section-card">
      <h3>Settings</h3>
      <table class="rc-table">
        <thead><tr><th>Key</th><th>Value</th><th>Notes</th><th></th></tr></thead>
        <tbody>${settingsRows}</tbody>
      </table>
    </div>
    <div class="section-card">
      <h3>Users</h3>
      <table class="rc-table">
        <thead><tr><th>Email</th><th>Role</th><th>Name</th><th>Added</th><th></th></tr></thead>
        <tbody>${usersRows}</tbody>
      </table>
      ${owner ? `<div id="settings-add-user" style="margin-top:14px;"></div>` : ""}
    </div>
    <div class="section-card">
      <h3>Anthropic API usage by workspace (D-018)</h3>
      <p style="font-size:13px;color:#666;margin:0 0 10px;">Anthropic's cost report for a month, one line per Console workspace, mapped to an account by the <code>api_cost_account:</code> settings above. Posting debits each account and credits 1520 Prepaid API credits, dated the last day of the month. The poller posts the previous month on the 2nd; a month already posted is skipped.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <input type="month" id="api-costs-month" value="${escapeHtml(previousMonthStr())}">
        <button class="btn btn-secondary" id="api-costs-load" style="padding:5px 10px;font-size:12px;">Load</button>
        ${owner ? `<button class="btn" id="api-costs-post" style="padding:5px 10px;font-size:12px;" disabled>Post to Journal</button>` : ""}
      </div>
      <div id="api-costs-result" style="margin-top:10px;"></div>
    </div>`;

  const costsMonth = $("api-costs-month");
  const costsOut = $("api-costs-result");
  const costsPost = $("api-costs-post");
  const renderCosts = (b) => {
    const rows = b.lines.map((l) => `<tr><td>${escapeHtml(l.workspace)}</td><td style="text-align:right;">$${fromCents(l.cents)}</td><td><code>${escapeHtml(l.account)}</code>${l.mapped ? "" : " <span style=\"color:#999;\">(default)</span>"}</td></tr>`).join("");
    costsOut.innerHTML = `<table class="rc-table"><thead><tr><th>Workspace</th><th style="text-align:right;">Spend</th><th>Account</th></tr></thead><tbody>${rows}<tr><td><strong>Total</strong></td><td style="text-align:right;"><strong>$${fromCents(b.total_cents)}</strong></td><td>dated ${escapeHtml(b.date)}</td></tr></tbody></table>` +
      (b.posted === true ? `<div class="banner success" style="margin-top:8px;">Posted <code>${escapeHtml(b.txn_id)}</code>.</div>` : "") +
      (b.posted === false ? `<div class="banner" style="margin-top:8px;">Not posted: ${escapeHtml(b.reason)}.</div>` : "");
  };
  $("api-costs-load").onclick = async () => {
    costsOut.textContent = "Loading…";
    try {
      renderCosts(await api(`api-costs?month=${encodeURIComponent(costsMonth.value)}`));
      if (costsPost) costsPost.disabled = false;
    } catch (err) {
      costsOut.innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
    }
  };
  if (costsPost) {
    costsPost.onclick = async () => {
      if (!confirm(`Post Anthropic usage for ${costsMonth.value} to the Journal?`)) return;
      costsPost.disabled = true;
      try {
        renderCosts(await api("api-costs", { method: "POST", body: { month: costsMonth.value } }));
      } catch (err) {
        costsOut.innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
      }
    };
  }

  if (!owner) return;

  wrap.querySelectorAll("[data-setting-save]").forEach((btn) => {
    btn.onclick = async () => {
      const i = Number(btn.dataset.settingSave);
      const s = settingsState.settings[i];
      const value = wrap.querySelector(`[data-setting-value="${i}"]`).value;
      const notes = wrap.querySelector(`[data-setting-notes="${i}"]`).value;
      try {
        await api("meta", { method: "POST", body: { action: "upsert", tab: "Settings", key_column: "key", row: { key: s.key, value, notes } } });
        renderSettingsBanner({ kind: "success", html: `Saved <code>${escapeHtml(s.key)}</code>.` });
        await renderSettings();
      } catch (err) {
        renderSettingsBanner({ kind: "error", html: errorBannerHtml(err) });
      }
    };
  });

  wrap.querySelectorAll("[data-role-select]").forEach((sel) => {
    sel.onchange = async () => {
      const email = sel.dataset.roleSelect;
      const role = sel.value;
      const u = settingsState.users.find((x) => x.email === email);
      if (!confirm(`Change ${email}'s role to ${role}?`)) {
        sel.value = u.role;
        return;
      }
      try {
        await api("meta", { method: "POST", body: { action: "upsert", tab: "Users", key_column: "email", row: { ...u, role } } });
        renderSettingsBanner({ kind: "success", html: `Updated ${escapeHtml(email)} to ${escapeHtml(role)}.` });
        await renderSettings();
      } catch (err) {
        renderSettingsBanner({ kind: "error", html: errorBannerHtml(err) });
      }
    };
  });

  wrap.querySelectorAll("[data-remove-user]").forEach((btn) => {
    btn.onclick = async () => {
      const email = btn.dataset.removeUser;
      const u = settingsState.users.find((x) => x.email === email);
      if (!confirm(`Remove ${email}? They will lose access to Recast Books.`)) return;
      try {
        await api("meta", { method: "POST", body: { action: "upsert", tab: "Users", key_column: "email", row: { ...u, role: "removed" } } });
        renderSettingsBanner({ kind: "success", html: `Removed ${escapeHtml(email)}.` });
        await renderSettings();
      } catch (err) {
        renderSettingsBanner({ kind: "error", html: errorBannerHtml(err) });
      }
    };
  });

  renderSettingsAddUserForm();
}

function renderSettingsAddUserForm() {
  const wrap = $("settings-add-user");
  if (!wrap) return;
  wrap.innerHTML = `
    <h3 style="font-size:14px;">Add user</h3>
    <div class="form-grid">
      <div class="field"><label>Email</label><input type="text" id="u-email" placeholder="name@recast-properties.com"></div>
      <div class="field"><label>Name</label><input type="text" id="u-name" placeholder="Full name"></div>
      <div class="field"><label>Role</label><select id="u-role"><option value="owner">owner</option><option value="partner">partner</option><option value="accountant" selected>accountant</option></select></div>
    </div>
    <button class="btn btn-primary" id="u-save" style="margin-top:10px;">Add user</button>`;
  $("u-save").onclick = async () => {
    const email = $("u-email").value.trim();
    const name = $("u-name").value.trim();
    const role = $("u-role").value;
    if (!email) {
      renderSettingsBanner({ kind: "error", html: "Email is required." });
      return;
    }
    try {
      await api("meta", { method: "POST", body: { action: "upsert", tab: "Users", key_column: "email", row: { email, role, name, added_at: today() } } });
      renderSettingsBanner({ kind: "success", html: `Added ${escapeHtml(email)} as ${escapeHtml(role)}.` });
      await renderSettings();
    } catch (err) {
      renderSettingsBanner({ kind: "error", html: errorBannerHtml(err) });
    }
  };
}

// ---------------------------------------------------------------------------
// Inbox / Upload shared helpers (spec §8)
// ---------------------------------------------------------------------------

// Object URLs created from authFetchBlobUrl() (thumbnails, full-size views, PDF
// tabs) are tracked here so they can be revoked in bulk when a tab reloads —
// otherwise every render leaks one blob per thumbnail.
let trackedBlobUrls = [];
function trackBlobUrl(url) {
  trackedBlobUrls.push(url);
}
function revokeTrackedBlobUrls() {
  trackedBlobUrls.forEach((u) => {
    try { URL.revokeObjectURL(u); } catch { /* already revoked */ }
  });
  trackedBlobUrls = [];
}

function cssEsc(v) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(String(v)) : String(v).replace(/["\\]/g, "\\$&");
}

// ---- Lightbox modal (thumbnail -> full-size image) -------------------------

function initModal() {
  const overlay = $("modal-overlay");
  if (!overlay || overlay.dataset.wired) return;
  overlay.dataset.wired = "1";
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  const closeBtn = $("modal-close");
  if (closeBtn) closeBtn.onclick = closeModal;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
}
function openImageModal(url) {
  $("modal-box").innerHTML = `<img src="${url}" alt="" style="max-width:88vw;max-height:88vh;display:block;">`;
  $("modal-overlay").classList.remove("hidden");
}
function closeModal() {
  const overlay = $("modal-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  $("modal-box").innerHTML = "";
}

// ---- Sidebar pending-count badge -------------------------------------------
// Spec §8: "poll /api/inbox?status=pending&limit=1 count every 60 s, or derive
// from the loaded list." The §5 contract doesn't document a total-count field
// on the response separate from the (limit-bounded) envelope array, so this
// reads resp.total when present and falls back to the array length otherwise
// (accurate whenever limit isn't clipping it — see the build report).

let inboxBadgeTimer = null;
function startInboxBadgePolling() {
  refreshInboxBadge();
  if (inboxBadgeTimer) clearInterval(inboxBadgeTimer);
  inboxBadgeTimer = setInterval(refreshInboxBadge, 60000);
}
async function refreshInboxBadge() {
  if (!state.session) return;
  try {
    const resp = await api("inbox?status=pending&limit=1");
    const list = resp.envelopes || resp.rows || resp.items || [];
    const count = typeof resp.total === "number" ? resp.total : list.length;
    setInboxBadge(count);
  } catch {
    // Non-fatal — leave the badge as it was.
  }
}
function setInboxBadge(count) {
  const el = $("inbox-badge");
  if (!el) return;
  if (count > 0) {
    el.textContent = count > 99 ? "99+" : String(count);
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

const inboxState = {
  tab: "pending",
  envelopes: [],
  banner: null,
  refData: { accounts: [], properties: [], bankAccounts: [] },
  editing: {}, // docId -> deep-cloned, editable proposedEntry[] (pending tab only)
  focusDocId: undefined, // docId to highlight/poll, set when arriving from Upload
};

const INBOX_TABS = [
  { key: "pending", label: "Pending", status: "pending" },
  { key: "posted", label: "Posted", status: "posted" },
  { key: "dismissed", label: "Dismissed", status: "dismissed" },
  { key: "dry", label: "Dry runs", status: "dry" },
  { key: "error", label: "Errors", status: "error" },
];
const STATUS_TO_TAB = { pending: "pending", posted: "posted", dismissed: "dismissed", dry: "dry", error: "error" };

// Property/paid_from <select> option builders that add OVERHEAD / PAUL / DENNIS
// on top of the shared realPropertyOptions()/bankAccountSelectOptions() helpers
// (kept separate from journalState so the Inbox doesn't need the Journal page
// ever loaded).
function inboxPropertyOptions(selected, properties) {
  return realPropertyOptions(selected, properties) +
    `<option value="OVERHEAD" ${selected === "OVERHEAD" ? "selected" : ""}>OVERHEAD</option>`;
}
function inboxPaidFromOptions(selected, bankAccounts) {
  // D-014: UNKNOWN never silently becomes the first account in the list. Approve with
  // this placeholder still selected is refused by the posting engine (BAD_ACCOUNT).
  const assign = !selected || selected === "UNKNOWN" ? `<option value="UNKNOWN" selected>— assign account —</option>` : "";
  return assign + bankAccountSelectOptions(selected, bankAccounts) +
    `<option value="PAUL" ${selected === "PAUL" ? "selected" : ""}>PAUL (personal)</option>` +
    `<option value="DENNIS" ${selected === "DENNIS" ? "selected" : ""}>DENNIS (direct)</option>`;
}

let inboxProcessingTimer = null;

async function renderInbox(param) {
  inboxState.focusDocId = param || undefined;
  const el = $("page-inbox");
  el.innerHTML = `
    <h1 class="page-title">Inbox</h1>
    <div id="inbox-banner"></div>
    <div id="inbox-processing"></div>
    <div class="page-toolbar">
      <div class="tabbar" id="inbox-tabbar"></div>
      <div id="inbox-actions"></div>
    </div>
    <div id="inbox-list">Loading…</div>`;
  renderInboxBanner();
  renderInboxTabbar();

  if (inboxProcessingTimer) {
    clearInterval(inboxProcessingTimer);
    inboxProcessingTimer = null;
  }
  if (inboxState.focusDocId) pollFocusDoc();

  try {
    await loadInboxRefData();
  } catch {
    // Non-fatal — editable selects on cards just render empty until the next load.
  }
  await loadInboxTab();
}

function renderInboxBanner() {
  const el = $("inbox-banner");
  if (!el) return;
  el.innerHTML = inboxState.banner ? `<div class="banner ${inboxState.banner.kind}">${inboxState.banner.html}</div>` : "";
}

function renderInboxTabbar() {
  const wrap = $("inbox-tabbar");
  if (!wrap) return;
  wrap.innerHTML = INBOX_TABS.map((t) => `<button data-tab="${t.key}" class="${inboxState.tab === t.key ? "active" : ""}">${t.label}</button>`).join("");
  wrap.querySelectorAll("button").forEach((btn) => {
    btn.onclick = async () => {
      inboxState.tab = btn.dataset.tab;
      renderInboxTabbar();
      await loadInboxTab();
    };
  });
}

// "Dismiss all confirmed twins" — spec §8: only pending cards whose model
// verdict was "dismiss" with a duplicate_of set but the deterministic gate
// held them anyway (the twin rail, gate.mjs §4 condition 9).
function renderInboxActions() {
  const wrap = $("inbox-actions");
  if (!wrap) return;
  const candidates = inboxState.tab === "pending"
    ? inboxState.envelopes.filter((e) => e.status === "pending" && e.model && e.model.verdict === "dismiss" && e.model.duplicate_of)
    : [];
  wrap.innerHTML = isOwner() && candidates.length
    ? `<button class="btn btn-secondary" id="inbox-dismiss-twins">Dismiss all confirmed twins (${candidates.length})</button>`
    : "";
  const btn = $("inbox-dismiss-twins");
  if (btn) btn.onclick = dismissAllConfirmedTwins;
}

async function loadInboxRefData() {
  const [accountsResp, propertiesResp, banksResp] = await Promise.all([
    api("meta?tab=Accounts"),
    api("meta?tab=Properties"),
    api("meta?tab=Bank%20accounts"),
  ]);
  inboxState.refData.accounts = rowsToObjects(accountsResp.headers, accountsResp.rows);
  inboxState.refData.properties = rowsToObjects(propertiesResp.headers, propertiesResp.rows);
  inboxState.refData.bankAccounts = rowsToObjects(banksResp.headers, banksResp.rows);
}

async function loadInboxTab() {
  const wrap = $("inbox-list");
  wrap.innerHTML = `<p class="rc-small">Loading…</p>`;
  renderInboxActions();
  closeModal();
  try {
    const status = (INBOX_TABS.find((t) => t.key === inboxState.tab) || INBOX_TABS[0]).status;
    const resp = await api(`inbox?status=${status}&limit=100`);
    const list = resp.envelopes || resp.rows || resp.items || [];
    inboxState.envelopes = list;
    if (inboxState.tab === "pending") setInboxBadge(typeof resp.total === "number" ? resp.total : list.length);
    revokeTrackedBlobUrls();
    renderInboxList();
    renderInboxActions();
    if (inboxState.focusDocId) {
      const card = document.querySelector(`.inbox-card[data-doc-id="${cssEsc(inboxState.focusDocId)}"]`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch (err) {
    wrap.innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
  }
}

function renderInboxList() {
  const wrap = $("inbox-list");
  if (!inboxState.envelopes.length) {
    wrap.innerHTML = `<p class="rc-small">Nothing here.</p>`;
    return;
  }
  wrap.innerHTML = inboxState.envelopes.map((env) => renderInboxCard(env)).join("");
  inboxState.envelopes.forEach((env) => wireInboxCard(env));
}

function renderProcessingCard() {
  const wrap = $("inbox-processing");
  if (!wrap) return;
  wrap.innerHTML = inboxState.focusDocId
    ? `<div class="processing-card">Processing <code>${escapeHtml(inboxState.focusDocId)}</code>… this updates automatically.</div>`
    : "";
}

// Polls /api/inbox?status=all every 5 s for a just-uploaded docId until its
// status leaves "processing" (spec §8), then switches to the matching tab.
async function pollFocusDoc() {
  const docId = inboxState.focusDocId;
  if (!docId) return;
  renderProcessingCard();
  let resolved = false;
  const check = async () => {
    try {
      const resp = await api("inbox?status=all&limit=100");
      const list = resp.envelopes || resp.rows || resp.items || [];
      const env = list.find((e) => e.docId === docId);
      if (!env || env.status === "processing") return; // keep polling
      resolved = true;
      if (inboxProcessingTimer) {
        clearInterval(inboxProcessingTimer);
        inboxProcessingTimer = null;
      }
      const wrap = $("inbox-processing");
      if (wrap) wrap.innerHTML = "";
      const targetTab = STATUS_TO_TAB[env.status] || "pending";
      if (targetTab !== inboxState.tab) {
        inboxState.tab = targetTab;
        renderInboxTabbar();
      }
      await loadInboxTab();
    } catch {
      // Network hiccup — keep polling silently.
    }
  };
  await check();
  if (!resolved) inboxProcessingTimer = setInterval(check, 5000);
}

function confidencePillClass(confidence) {
  if (confidence === "high") return "open";
  if (confidence === "medium") return "warn";
  return "error"; // "low" or unknown
}

// Dry-run outcome label (spec §8: "would POST / would HOLD / would DISMISS"
// from gate.passed + model.verdict), mirroring gate.mjs's own verdict handling.
function dryRunOutcome(env) {
  const model = env.model || {};
  const gate = env.gate || {};
  if (model.verdict === "dismiss" && model.duplicate_of) return { label: "would DISMISS", cls: "closed" };
  if (model.verdict === "post" && gate.passed) return { label: "would POST", cls: "open" };
  return { label: "would HOLD", cls: "warn" };
}

function cardSummaryLine(env) {
  const m = env.model || {};
  const entries = m.entries || [];
  const properties = [...new Set(entries.map((e) => e.property).filter(Boolean))];
  return `
    <div class="card-summary">
      <div><span class="k">Vendor</span>${escapeHtml(m.vendor || "—")}</div>
      <div><span class="k">Date</span>${escapeHtml(m.date || "—")}</div>
      <div><span class="k">Total</span>${m.receipt_total_cents != null ? fmtCents(m.receipt_total_cents) : "—"}</div>
      <div><span class="k">Property</span>${escapeHtml(properties.length ? properties.join(", ") : "—")}</div>
      <div><span class="k">Paid from</span>${escapeHtml(m.paid_from || "—")}</div>
    </div>`;
}

// entries is either the raw model.entries (read-only tabs) or the editing-state
// clone for the pending tab; editable toggles inputs/selects on vs. plain text.
function renderEntriesEditor(env, entries, editable) {
  const blocks = entries.map((entry, ei) => {
    const items = entry.items || [];
    const itemsRows = items.map((it, ii) => editable
      ? `<tr>
          <td><select data-doc="${escapeHtml(env.docId)}" data-e="${ei}" data-i="${ii}" data-f="account">${accountSelectOptions(it.account, inboxState.refData.accounts)}</select></td>
          <td><input data-doc="${escapeHtml(env.docId)}" data-e="${ei}" data-i="${ii}" data-f="amount" value="${escapeHtml(fromCents(it.amount_cents))}" inputmode="decimal" style="width:90px;"></td>
          <td><input data-doc="${escapeHtml(env.docId)}" data-e="${ei}" data-i="${ii}" data-f="description" value="${escapeHtml(it.description || "")}"></td>
          <td><input data-doc="${escapeHtml(env.docId)}" data-e="${ei}" data-i="${ii}" data-f="business_purpose" value="${escapeHtml(it.business_purpose || "")}"></td>
          <td><button class="rm-btn" data-doc="${escapeHtml(env.docId)}" data-rm-item="${ei}:${ii}" type="button" title="Remove item">&times;</button></td>
        </tr>`
      : `<tr>
          <td>${escapeHtml(it.account || "")}</td>
          <td class="num">${fmtCents(it.amount_cents)}</td>
          <td>${escapeHtml(it.description || "")}</td>
          <td>${escapeHtml(it.business_purpose || "")}</td>
        </tr>`
    ).join("");

    const entryTotal = items.reduce((s, it) => s + (Number(it.amount_cents) || 0), 0);

    return `
      <div class="entry-block">
        <div class="form-grid" style="margin-bottom:8px;">
          <div class="field"><label>Property</label>${editable
            ? `<select data-doc="${escapeHtml(env.docId)}" data-e="${ei}" data-f="property">${inboxPropertyOptions(entry.property, inboxState.refData.properties)}</select>`
            : `<span>${escapeHtml(entry.property || "—")}</span>`}</div>
          <div class="field"><label>Paid from</label>${editable
            ? `<select data-doc="${escapeHtml(env.docId)}" data-e="${ei}" data-f="paid_from">${inboxPaidFromOptions(entry.paid_from, inboxState.refData.bankAccounts)}</select>`
            : `<span>${escapeHtml(entry.paid_from || "—")}</span>`}</div>
        </div>
        <div style="overflow-x:auto;">
          <table class="lines-grid">
            <thead><tr><th>Account</th><th>Amount</th><th>Description</th><th>Business purpose</th>${editable ? "<th></th>" : ""}</tr></thead>
            <tbody>${itemsRows}</tbody>
          </table>
        </div>
        ${editable ? `<button class="btn btn-secondary" data-add-item="${ei}" data-doc="${escapeHtml(env.docId)}" type="button" style="font-size:12px;padding:6px 10px;">+ Add item</button>` : ""}
        <div class="entry-total">Entry total ${fmtCents(entryTotal)}</div>
      </div>`;
  }).join("");

  const grandTotal = entries.reduce((s, e) => s + (e.items || []).reduce((s2, it) => s2 + (Number(it.amount_cents) || 0), 0), 0);
  const receiptTotal = Number((env.model && env.model.receipt_total_cents) || 0);
  const ok = grandTotal === receiptTotal;
  const totalRow = `<div class="balance-row ${ok ? "ok" : "off"}">
      <span>Entries total ${fmtCents(grandTotal)}</span>
      <span>Receipt total ${fmtCents(receiptTotal)}${ok ? " — matches" : " — does not match"}</span>
    </div>`;

  return blocks + totalRow;
}

function ensureEditingEntries(env) {
  if (!inboxState.editing[env.docId]) {
    inboxState.editing[env.docId] = JSON.parse(JSON.stringify((env.model && env.model.entries) || []));
  }
  return inboxState.editing[env.docId];
}

function renderInboxCard(env) {
  const m = env.model || {};
  const gate = env.gate || {};
  const editable = env.status === "pending";
  const entries = editable ? ensureEditingEntries(env) : (m.entries || []);
  const highlighted = inboxState.focusDocId && inboxState.focusDocId === env.docId;

  const thumbsHtml = (env.attachments || []).map((att) => {
    const isImage = String(att.mime || "").startsWith("image/");
    if (isImage) {
      return `<div class="thumb-tile" data-thumb-tile="1" data-doc="${escapeHtml(env.docId)}" data-key="${escapeHtml(att.key)}" data-mime="${escapeHtml(att.mime)}">
        <span class="rc-small">…</span>
      </div>`;
    }
    return `<div class="thumb-tile pdf-tile" data-doc="${escapeHtml(env.docId)}" data-key="${escapeHtml(att.key)}" data-mime="${escapeHtml(att.mime)}">
      <span>PDF</span><span class="rc-small">${escapeHtml(att.name || "")}</span>
    </div>`;
  }).join("");

  const chipsHtml = (gate.reasons || []).length
    ? `<div class="chip-row">${gate.reasons.map((r) => `<span class="chip">${escapeHtml(r)}</span>`).join("")}</div>`
    : "";

  let statusHtml = "";
  if (env.status === "posted") {
    const txns = (env.result && env.result.txn_ids) || [];
    const txnHtml = txns.length ? txns.map((t) => `<a href="#journal">${escapeHtml(t)}</a>`).join(", ") : "—";
    const docUrl = env.result && env.result.doc_url;
    statusHtml = `<p class="rc-small">Posted &middot; ${txnHtml}${docUrl ? ` &middot; <a href="${escapeHtml(docUrl)}" target="_blank" rel="noopener">Drive file &rarr;</a>` : ""}</p>`;
  } else if (env.status === "dismissed") {
    const note = env.review && env.review.note;
    statusHtml = `<p class="rc-small">Dismissed${note ? ` &mdash; ${escapeHtml(note)}` : ""}</p>`;
  } else if (env.status === "dry") {
    const outcome = dryRunOutcome(env);
    statusHtml = `<p class="rc-small"><span class="pill ${outcome.cls}">${outcome.label}</span></p>`;
  } else if (env.status === "error") {
    statusHtml = `<p class="rc-small" style="color:var(--error-700);">${escapeHtml(env.error || "Error")}</p>`;
  }

  const verbs = [];
  if (isOwner()) {
    if (env.status === "pending") {
      verbs.push(`<button class="btn btn-primary" data-approve="${escapeHtml(env.docId)}" type="button">Approve</button>`);
      verbs.push(`<button class="btn btn-secondary" data-dismiss="${escapeHtml(env.docId)}" type="button">Dismiss</button>`);
      verbs.push(`<button class="btn btn-secondary" data-reprocess="${escapeHtml(env.docId)}" type="button">Reprocess</button>`);
    } else if (env.status === "dry" || env.status === "error") {
      verbs.push(`<button class="btn btn-secondary" data-reprocess="${escapeHtml(env.docId)}" type="button">Reprocess</button>`);
      verbs.push(`<button class="btn btn-secondary" data-delete="${escapeHtml(env.docId)}" type="button">Delete</button>`);
    }
  }

  return `
    <div class="inbox-card ${highlighted ? "highlight" : ""}" data-doc-id="${escapeHtml(env.docId)}">
      <div class="card-head">
        ${cardSummaryLine(env)}
        <div style="text-align:right;">
          <div class="doc-id">${escapeHtml(env.docId)}</div>
          <span class="pill ${confidencePillClass(m.confidence)}">${escapeHtml(m.confidence || "—")}</span>
        </div>
      </div>
      <div class="thumb-row">${thumbsHtml}</div>
      ${m.why ? `<div class="why-note"><span class="lbl">Claude's note</span>${escapeHtml(m.why)}</div>` : ""}
      ${chipsHtml}
      ${statusHtml}
      ${entries.length ? renderEntriesEditor(env, entries, editable) : ""}
      <div class="card-verbs">${verbs.join("")}</div>
    </div>`;
}

async function openAttachmentFull(docId, key, mime) {
  try {
    const url = await authFetchBlobUrl(`file?key=${encodeURIComponent(key)}`);
    trackBlobUrl(url);
    if (String(mime || "").startsWith("image/")) openImageModal(url);
    else window.open(url, "_blank", "noopener");
  } catch (err) {
    inboxState.banner = { kind: "error", html: errorBannerHtml(err) };
    renderInboxBanner();
  }
}

// Re-renders one card in place (after an edit changes the editing-state clone)
// instead of the whole list, and refocuses the field the user was typing in —
// same trick renderJournalGridForm()/refocusLine() use above.
function rerenderInboxCard(docId) {
  const env = inboxState.envelopes.find((e) => e.docId === docId);
  if (!env) return;
  const card = document.querySelector(`.inbox-card[data-doc-id="${cssEsc(docId)}"]`);
  if (!card) return;
  const active = document.activeElement;
  const wasField = active && active.matches && active.matches(`.inbox-card[data-doc-id="${cssEsc(docId)}"] [data-f]`);
  const focusSel = wasField
    ? `[data-doc="${cssEsc(active.dataset.doc)}"][data-e="${cssEsc(active.dataset.e)}"]${active.dataset.i !== undefined ? `[data-i="${cssEsc(active.dataset.i)}"]` : ""}[data-f="${cssEsc(active.dataset.f)}"]`
    : null;
  const temp = document.createElement("div");
  temp.innerHTML = renderInboxCard(env);
  card.replaceWith(temp.firstElementChild);
  wireInboxCard(env);
  if (focusSel) {
    const toFocus = document.querySelector(focusSel);
    if (toFocus) {
      toFocus.focus();
      if (toFocus.tagName === "INPUT") {
        const v = toFocus.value;
        toFocus.value = "";
        toFocus.value = v; // move the caret to the end, same trick as refocusLine()
      }
    }
  }
}

function wireInboxCard(env) {
  const card = document.querySelector(`.inbox-card[data-doc-id="${cssEsc(env.docId)}"]`);
  if (!card) return;

  // Thumbnails — img src can't carry the Authorization header, so each tile
  // starts as a placeholder and is filled in once authFetchBlobUrl() resolves.
  card.querySelectorAll("[data-thumb-tile]").forEach((tile) => {
    const key = tile.dataset.key;
    authFetchBlobUrl(`file?key=${encodeURIComponent(key)}&thumb=1`)
      .then((url) => {
        trackBlobUrl(url);
        tile.innerHTML = `<img src="${url}" alt="">`;
      })
      .catch(() => {
        tile.innerHTML = `<span class="thumb-err">No preview</span>`;
      });
  });

  card.querySelectorAll(".thumb-tile").forEach((tile) => {
    tile.onclick = () => openAttachmentFull(tile.dataset.doc, tile.dataset.key, tile.dataset.mime);
  });

  card.querySelectorAll("select[data-f], input[data-f]").forEach((elx) => {
    const handler = () => {
      const docId = elx.dataset.doc;
      const ei = Number(elx.dataset.e);
      const ii = elx.dataset.i !== undefined ? Number(elx.dataset.i) : undefined;
      const f = elx.dataset.f;
      const entries = inboxState.editing[docId];
      if (!entries) return;
      if (ii === undefined) {
        entries[ei][f] = elx.value;
      } else if (f === "amount") {
        try {
          entries[ei].items[ii].amount_cents = toCents(elx.value);
        } catch {
          return; // leave the previous value; the running total shows the mismatch
        }
      } else {
        entries[ei].items[ii][f] = elx.value;
      }
      rerenderInboxCard(docId);
    };
    elx.addEventListener("change", handler);
    if (elx.tagName === "INPUT") elx.addEventListener("input", handler);
  });

  card.querySelectorAll("[data-rm-item]").forEach((btn) => {
    btn.onclick = () => {
      const docId = btn.dataset.doc;
      const [ei, ii] = btn.dataset.rmItem.split(":").map(Number);
      const entries = inboxState.editing[docId];
      if (!entries || entries[ei].items.length <= 1) return; // keep at least one item
      entries[ei].items.splice(ii, 1);
      rerenderInboxCard(docId);
    };
  });

  card.querySelectorAll("[data-add-item]").forEach((btn) => {
    btn.onclick = () => {
      const docId = btn.dataset.doc;
      const ei = Number(btn.dataset.addItem);
      const entries = inboxState.editing[docId];
      if (!entries) return;
      entries[ei].items.push({ account: "", amount_cents: 0, description: "", trade: "", business_purpose: "" });
      rerenderInboxCard(docId);
    };
  });

  const approveBtn = card.querySelector("[data-approve]");
  if (approveBtn) approveBtn.onclick = () => approveDoc(env.docId);
  const dismissBtn = card.querySelector("[data-dismiss]");
  if (dismissBtn) dismissBtn.onclick = () => dismissDoc(env.docId);
  const reprocessBtn = card.querySelector("[data-reprocess]");
  if (reprocessBtn) reprocessBtn.onclick = () => reprocessDoc(env.docId);
  const deleteBtn = card.querySelector("[data-delete]");
  if (deleteBtn) deleteBtn.onclick = () => deleteDoc(env.docId);
}

async function approveDoc(docId) {
  const env = inboxState.envelopes.find((e) => e.docId === docId);
  const entries = inboxState.editing[docId] || (env && env.model && env.model.entries) || [];
  if (!confirm(`Approve ${docId} and post ${entries.length} entr${entries.length === 1 ? "y" : "ies"}?`)) return;
  try {
    await api("inbox", { method: "POST", body: { action: "approve", docId, entries } });
    delete inboxState.editing[docId];
    inboxState.banner = { kind: "success", html: `Approved <code>${escapeHtml(docId)}</code>.` };
    renderInboxBanner();
    await loadInboxTab();
  } catch (err) {
    inboxState.banner = { kind: "error", html: errorBannerHtml(err) };
    renderInboxBanner();
  }
}

async function dismissDoc(docId) {
  const note = prompt(`Reason for dismissing ${docId}:`);
  if (note === null) return; // cancelled
  try {
    await api("inbox", { method: "POST", body: { action: "dismiss", docId, note } });
    delete inboxState.editing[docId];
    inboxState.banner = { kind: "success", html: `Dismissed <code>${escapeHtml(docId)}</code>.` };
    renderInboxBanner();
    await loadInboxTab();
  } catch (err) {
    inboxState.banner = { kind: "error", html: errorBannerHtml(err) };
    renderInboxBanner();
  }
}

async function reprocessDoc(docId) {
  if (!confirm(`Reprocess ${docId}? This re-runs the bookkeeper on the same document.`)) return;
  try {
    await api("inbox", { method: "POST", body: { action: "reprocess", docId } });
    inboxState.banner = { kind: "success", html: `Reprocessing <code>${escapeHtml(docId)}</code>…` };
    renderInboxBanner();
    inboxState.focusDocId = docId;
    pollFocusDoc();
    await loadInboxTab();
  } catch (err) {
    inboxState.banner = { kind: "error", html: errorBannerHtml(err) };
    renderInboxBanner();
  }
}

async function deleteDoc(docId) {
  if (!confirm(`Delete ${docId} permanently? This cannot be undone.`)) return;
  try {
    await api("inbox", { method: "POST", body: { action: "delete", docId } });
    delete inboxState.editing[docId];
    inboxState.banner = { kind: "success", html: `Deleted <code>${escapeHtml(docId)}</code>.` };
    renderInboxBanner();
    await loadInboxTab();
  } catch (err) {
    inboxState.banner = { kind: "error", html: errorBannerHtml(err) };
    renderInboxBanner();
  }
}

async function dismissAllConfirmedTwins() {
  const candidates = inboxState.envelopes.filter(
    (e) => e.status === "pending" && e.model && e.model.verdict === "dismiss" && e.model.duplicate_of
  );
  if (!candidates.length) return;
  if (!confirm(`Dismiss ${candidates.length} confirmed twin${candidates.length === 1 ? "" : "s"}?`)) return;
  let failed = 0;
  for (const env of candidates) {
    try {
      await api("inbox", {
        method: "POST",
        body: { action: "dismiss", docId: env.docId, note: `Confirmed twin of ${env.model.duplicate_of}` },
      });
    } catch {
      failed++;
    }
  }
  const ok = candidates.length - failed;
  inboxState.banner = failed
    ? { kind: "error", html: `Dismissed ${ok} of ${candidates.length}; ${failed} failed.` }
    : { kind: "success", html: `Dismissed ${ok} confirmed twin${ok === 1 ? "" : "s"}.` };
  renderInboxBanner();
  await loadInboxTab();
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

const MAX_ATTACHMENT_BYTES = 6 * 1024 * 1024;

const uploadState = {
  files: [], // {file, name, mime, size, tooLarge, localUrl}
  property: "",
  note: "",
  dryRun: false,
  properties: [],
  banner: null,
  submitting: false,
};

async function renderUpload() {
  const el = $("page-upload");
  el.innerHTML = `
    <h1 class="page-title">Upload a receipt</h1>
    <div id="upload-banner"></div>
    <div class="section-card">
      <div class="dropzone" id="upload-dropzone">
        <div class="dz-title">Drop a receipt here, or tap to choose a file</div>
        <p class="rc-small">Images or PDFs, up to 6 MB each.</p>
      </div>
      <input type="file" id="upload-file-input" accept="image/*,application/pdf" multiple class="hidden">
      <input type="file" id="upload-camera-input" accept="image/*" capture="environment" class="hidden">
      <div style="margin-top:10px;">
        <button class="btn btn-secondary" id="upload-camera-btn" type="button">Take photo</button>
      </div>
      <div class="upload-filelist" id="upload-filelist"></div>
      <div class="form-grid" style="margin-top:6px;">
        <div class="field"><label>Property (optional)</label><select id="upload-property"></select></div>
        <div class="field full"><label>Note (optional)</label><input type="text" id="upload-note" placeholder="Anything Claude should know"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;margin:14px 0;font-size:13.5px;font-weight:700;">
        <input type="checkbox" id="upload-dryrun" style="width:auto;"> Dry run (don't post — just show what would happen)
      </label>
      <button class="btn btn-primary" id="upload-submit" type="button">Upload</button>
    </div>`;

  renderUploadBanner();
  renderUploadFilelist();
  try {
    const resp = await api("meta?tab=Properties");
    uploadState.properties = rowsToObjects(resp.headers, resp.rows);
  } catch {
    uploadState.properties = [];
  }
  $("upload-property").innerHTML = inboxPropertyOptions(uploadState.property, uploadState.properties);

  const dz = $("upload-dropzone");
  const fileInput = $("upload-file-input");
  const cameraInput = $("upload-camera-input");

  dz.onclick = () => fileInput.click();
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("dragover"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("dragover"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    dz.classList.remove("dragover");
    addUploadFiles(e.dataTransfer.files);
  });
  fileInput.onchange = () => { addUploadFiles(fileInput.files); fileInput.value = ""; };
  $("upload-camera-btn").onclick = () => cameraInput.click();
  cameraInput.onchange = () => { addUploadFiles(cameraInput.files); cameraInput.value = ""; };

  $("upload-property").onchange = (e) => { uploadState.property = e.target.value; };
  $("upload-note").oninput = (e) => { uploadState.note = e.target.value; };
  $("upload-dryrun").onchange = (e) => { uploadState.dryRun = e.target.checked; };

  $("upload-submit").onclick = submitUpload;
}

function renderUploadBanner() {
  const el = $("upload-banner");
  if (!el) return;
  el.innerHTML = uploadState.banner ? `<div class="banner ${uploadState.banner.kind}">${uploadState.banner.html}</div>` : "";
}

function addUploadFiles(fileList) {
  for (const file of fileList) {
    uploadState.files.push({
      file,
      name: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      tooLarge: file.size > MAX_ATTACHMENT_BYTES,
      localUrl: file.type && file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    });
  }
  renderUploadFilelist();
}

function renderUploadFilelist() {
  const wrap = $("upload-filelist");
  if (!wrap) return;
  if (!uploadState.files.length) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = uploadState.files
    .map((f, i) => `
      <div class="upload-file-row ${f.tooLarge ? "invalid" : ""}">
        ${f.localUrl
          ? `<img class="uf-thumb" src="${f.localUrl}" alt="">`
          : `<span class="uf-thumb" style="display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">${f.mime === "application/pdf" ? "PDF" : "FILE"}</span>`}
        <span class="uf-name">${escapeHtml(f.name)} &middot; ${(f.size / 1024 / 1024).toFixed(2)} MB${f.tooLarge ? " — over 6 MB, will be skipped" : ""}</span>
        <button class="uf-rm" data-rm-upload="${i}" type="button" title="Remove">&times;</button>
      </div>`)
    .join("");
  wrap.querySelectorAll("[data-rm-upload]").forEach((btn) => {
    btn.onclick = () => {
      const i = Number(btn.dataset.rmUpload);
      const f = uploadState.files[i];
      if (f && f.localUrl) URL.revokeObjectURL(f.localUrl);
      uploadState.files.splice(i, 1);
      renderUploadFilelist();
    };
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function submitUpload() {
  if (uploadState.submitting) return;
  uploadState.banner = null;
  renderUploadBanner();

  const valid = uploadState.files.filter((f) => !f.tooLarge);
  if (!valid.length) {
    uploadState.banner = { kind: "error", html: "Add at least one file under 6 MB." };
    renderUploadBanner();
    return;
  }

  uploadState.submitting = true;
  const btn = $("upload-submit");
  if (btn) { btn.disabled = true; btn.textContent = "Uploading…"; }

  try {
    const attachments = await Promise.all(
      valid.map(async (f) => ({ name: f.name, mime: f.mime, base64: await fileToBase64(f.file) }))
    );
    // §5/§8 give the /api/upload body as {source, channel, dryRun, bodyText,
    // attachments} — there's no dedicated `property` field for the Upload
    // page's optional property select, so it's folded into bodyText as a
    // leading hint line the bookkeeper's tool-directed read will see. See
    // the build report for this interpretation.
    const bodyTextParts = [];
    if (uploadState.property) bodyTextParts.push(`Property: ${uploadState.property}`);
    if (uploadState.note) bodyTextParts.push(uploadState.note);
    const bodyText = bodyTextParts.join("\n\n");

    const resp = await api("upload", {
      method: "POST",
      body: { source: "upload", channel: "upload", dryRun: uploadState.dryRun, bodyText, attachments },
    });

    valid.forEach((f) => { if (f.localUrl) URL.revokeObjectURL(f.localUrl); });
    uploadState.files = [];
    uploadState.note = "";
    uploadState.property = "";
    uploadState.dryRun = false;

    const skippedNote = resp.skipped ? " (already processed — showing the existing card)" : "";
    uploadState.banner = { kind: "success", html: `Uploaded. Doc <code>${escapeHtml(resp.docId)}</code>${skippedNote} — opening the Inbox…` };
    renderUploadBanner();
    navigate("inbox", resp.docId);
  } catch (err) {
    uploadState.banner = { kind: "error", html: errorBannerHtml(err) };
    renderUploadBanner();
  } finally {
    uploadState.submitting = false;
    const btn2 = $("upload-submit");
    if (btn2) { btn2.disabled = false; btn2.textContent = "Upload"; }
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

// #nav a elements carry real hrefs (href="#properties" etc.) — the browser's own
// hash navigation drives render() via the hashchange listener above; no click
// handler needed here.
$("signout-btn").addEventListener("click", signOut);

async function boot() {
  if (state.session) {
    state.user = decodeSessionForDisplay(state.session);
    // Confirm the session still verifies server-side (it may have expired) before
    // showing the app; api()'s 401 handling calls signOut() and we fall through to sign-in.
    try {
      await api("meta?tab=Settings");
      showApp();
      return;
    } catch {
      // fall through to sign-in below
    }
  }
  $("signin").classList.remove("hidden");
  $("app").classList.add("hidden");
  initSignIn();
}

boot();
