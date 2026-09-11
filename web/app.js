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
  goToPage(state.page);
}

function goToPage(page) {
  state.page = page;
  for (const a of document.querySelectorAll("#nav a")) {
    a.classList.toggle("active", a.dataset.page === page);
  }
  for (const el of document.querySelectorAll(".page")) {
    el.classList.toggle("hidden", el.id !== `page-${page}`);
  }
  const renderers = {
    dashboard: renderDashboard,
    journal: renderJournal,
    periods: renderPeriods,
    settings: renderSettings,
  };
  (renderers[page] || renderDashboard)();
}

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
    statCard("Journal entries", "…", "muted") + statCard("Open periods", "…", "muted");

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

    cards.innerHTML =
      statCard("Phase", "Phase 0", "") +
      statCardHtml("Workbook", wbHtml) +
      statCard("Journal entries", String(ledgerResp.entries.length), "") +
      statCard("Open periods", String(openCount), "");
  } catch (err) {
    cards.innerHTML = statCard("Phase", "Phase 0", "") + statCardHtml("Error", errorText(err));
  }
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
  expanded: new Set(),
  lines: [ // journal-mode grid rows
    { account: "", debit: "", credit: "", property: "", payee: "", description: "", paid_from: "" },
    { account: "", debit: "", credit: "", property: "", payee: "", description: "", paid_from: "" },
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
    $("entries-table").innerHTML = `<div class="banner error">${errorText(err)}</div>`;
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

function today() {
  return new Date().toISOString().slice(0, 10);
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
        <thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Property</th><th>Payee</th><th>Description</th><th>Paid from</th><th></th></tr></thead>
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
    journalState.lines.push({ account: "", debit: "", credit: "", property: "", payee: "", description: "", paid_from: "" });
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
        }));
    } catch {
      journalState.banner = { kind: "error", html: "One or more debit/credit amounts are not valid dollar amounts." };
      renderBanner();
      return;
    }

    const intent = { type: "journal", date, memo, lines };

    await submitIntent(intent, () => {
      journalState.lines = [
        { account: "", debit: "", credit: "", property: "", payee: "", description: "", paid_from: "" },
        { account: "", debit: "", credit: "", property: "", payee: "", description: "", paid_from: "" },
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
    const code = (err.body && err.body.error) || err.status;
    const details = err.body && err.body.details ? ` <code>${escapeHtml(JSON.stringify(err.body.details))}</code>` : "";
    journalState.banner = { kind: "error", html: `<code>${escapeHtml(code)}</code> — ${escapeHtml(err.message)}${details}` };
    renderBanner();
  }
}

function renderEntriesTable() {
  const wrap = $("entries-table");
  if (!journalState.entries.length) {
    wrap.innerHTML = `<p class="rc-small">No journal entries yet.</p>`;
    return;
  }

  const rows = journalState.entries
    .map((entry, idx) => {
      const total = entry.lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
      const expanded = journalState.expanded.has(entry.txn_id);
      // An entry that already has a reversing entry pointing at it is voided: show that
      // instead of offering Void again.
      const voidedBy = journalState.entries.find((e) => e.void_of === entry.txn_id);
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
              <thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th><th>Property</th><th>Payee</th><th>Description</th><th>Paid from</th></tr></thead>
              <tbody>${linesRows}</tbody>
            </table>
          </div></td>
        </tr>`;
    })
    .join("");

  wrap.innerHTML = `
    <table class="rc-table">
      <thead><tr><th>Date</th><th>Memo</th><th>Source</th><th>Posted by</th><th class="num">Total</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  wrap.querySelectorAll("[data-toggle]").forEach((tr) => {
    tr.onclick = (e) => {
      if (e.target.closest("[data-void]")) return;
      const idx = Number(tr.dataset.toggle);
      const txnId = journalState.entries[idx].txn_id;
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
        journalState.banner = { kind: "error", html: `<code>${escapeHtml((err.body && err.body.error) || err.status)}</code> — ${escapeHtml(err.message)}` };
        renderBanner();
      }
    };
  });
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
          $("periods-banner").innerHTML = `<div class="banner error">${errorText(err)}</div>`;
        }
      };
    });
  } catch (err) {
    $("periods-table").innerHTML = `<div class="banner error">${errorText(err)}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

async function renderSettings() {
  const el = $("page-settings");
  el.innerHTML = `<h1 class="page-title">Settings</h1><div id="settings-tables">Loading…</div>`;

  try {
    const [settingsResp, usersResp] = await Promise.all([
      api("meta?tab=Settings"),
      api("meta?tab=Users"),
    ]);

    const settingsRows = (settingsResp.rows || [])
      .map((row) => `<tr>${row.map((c, i) => `<td${i === 0 ? "" : ' class="num"'}>${escapeHtml(c)}</td>`).join("")}</tr>`)
      .join("");
    const usersRows = (usersResp.rows || [])
      .map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`)
      .join("");

    $("settings-tables").innerHTML = `
      <div class="section-card">
        <h3>Settings</h3>
        <table class="rc-table">
          <thead><tr>${(settingsResp.headers || []).map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
          <tbody>${settingsRows}</tbody>
        </table>
      </div>
      <div class="section-card">
        <h3>Users</h3>
        <table class="rc-table">
          <thead><tr>${(usersResp.headers || []).map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
          <tbody>${usersRows}</tbody>
        </table>
      </div>`;
  } catch (err) {
    $("settings-tables").innerHTML = `<div class="banner error">${errorText(err)}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

document.querySelectorAll("#nav a").forEach((a) => {
  a.addEventListener("click", () => goToPage(a.dataset.page));
});
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
