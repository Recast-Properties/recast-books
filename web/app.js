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
// Hash routing — real hrefs on #nav a (e.g. href="#inbox"), deep-link on
// reload. A route is "#page" or "#page/param" (param URL-encoded, used today
// only by Upload -> Inbox to focus the just-uploaded doc, e.g. "#inbox/abc123").
// ---------------------------------------------------------------------------

const PAGE_RENDERERS = {
  dashboard: renderDashboard,
  inbox: renderInbox,
  upload: renderUpload,
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
    statCard("Open periods", "…", "muted") +
    statCard("Waiting for review", "…", "muted") + statCard("Posted by the bookkeeper (7 d)", "…", "muted");

  let baseHtml = statCard("Phase", "Phase 0", "") + statCardHtml("Error", "");
  try {
    const [settingsResp, periodsResp] = await Promise.all([
      api("meta?tab=Settings"),
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
// Shared money / select-option helpers used by Inbox and Settings
// ---------------------------------------------------------------------------

// Shared <select> option builders (reused by the Inbox editor and, until
// Phase 2.7, the removed Vendors/Dennis/Reports pages).
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
// Settings
// ---------------------------------------------------------------------------

// D-023 (2026-09-15, phase2.7-spec.md §5): Settings and Users are now edited
// directly on their workbook tabs via the Recast Books menu — this page keeps
// only the API-costs card (it calls Anthropic, so it has to live on Netlify).
async function renderSettings() {
  const el = $("page-settings");
  el.innerHTML = `<h1 class="page-title">Settings</h1><div id="settings-banner"></div><div id="settings-tables">Loading…</div>`;
  try {
    const settingsResp = await api("meta?tab=Settings");
    const rows = rowsToObjects(settingsResp.headers, settingsResp.rows);
    const wbUrl = (rows.find((r) => r.key === "spreadsheet_url") || {}).value;
    renderSettingsTables(wbUrl);
  } catch (err) {
    renderSettingsTables();
    $("settings-banner").innerHTML = `<div class="banner error">${errorBannerHtml(err)}</div>`;
  }
}

/** YYYY-MM of the month before today (for the API usage month picker). */
function previousMonthStr() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function renderSettingsTables(wbUrl) {
  const wrap = $("settings-tables");
  const owner = isOwner();
  const wbNote = wbUrl
    ? `<a href="${escapeHtml(wbUrl)}" target="_blank" rel="noopener">the workbook</a>`
    : "the workbook";

  wrap.innerHTML = `
    <p class="muted-note">Settings and Users are edited on their tabs in ${wbNote} (Recast Books menu) — not here.</p>
    <div class="section-card">
      <h3>Anthropic API usage by workspace (D-018)</h3>
      <p style="font-size:13px;color:#666;margin:0 0 10px;">Anthropic's cost report for a month, one line per Console workspace, mapped to an account by the <code>api_cost_account:</code> setting on the Settings tab. Posting debits each account and credits 1520 Prepaid API credits, dated the last day of the month. The poller posts the previous month on the 2nd; a month already posted is skipped.</p>
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
    const txnHtml = txns.length ? txns.map((t) => `<code>${escapeHtml(t)}</code>`).join(", ") : "—";
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
// instead of the whole list, and refocuses the field the user was typing in.
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
