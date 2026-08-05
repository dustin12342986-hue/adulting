/* ==========================================================================
   Adulting — application logic & rendering
   Plain JS, event delegation, no build step. STATE is the single source of
   truth; every mutation calls persist() which saves to localStorage and
   re-renders the current tab.
   ========================================================================== */

let STATE = loadState();
let currentTab = "dashboard";
let expandedIds = new Set(); // UI-only: which cards are expanded
let focusState = null; // { tripId, phase, index } — UI-only
let boardMode = location.hash === "#board"; // UI-only: standalone status-light board
let pendingImportCandidates = []; // UI-only: last calendar-scan results awaiting review

// ---------------------------------------------------------------------------
// Icons — colorful (emoji) or minimal (line SVG), toggled in Settings
// ---------------------------------------------------------------------------
function icon(key, size) {
  size = size || 18;
  if (STATE.settings.iconStyle === "minimal") {
    const shape = MINIMAL_ICON_SVGS[key] || MINIMAL_ICON_SVGS.tag;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;flex-shrink:0">' + shape + "</svg>";
  }
  return '<span style="font-size:' + size + 'px;line-height:1;display:inline-block">' + (EMOJI_ICONS[key] || "🏷️") + "</span>";
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function applyTheme() {
  document.documentElement.dataset.theme = STATE.settings.theme || "sunset";
  document.documentElement.style.setProperty("--accent-h", STATE.settings.customHue != null ? STATE.settings.customHue : 18);
  const banner = document.getElementById("heroBanner");
  if (banner) banner.innerHTML = heroBannerMarkup();
}

// A calm beach/sunset scene — sky, sun, ocean with a breaking wave, a couple
// of clouds, a small palm silhouette. Colors come entirely from CSS
// variables so it re-tints automatically with the active theme.
function heroBannerMarkup() {
  return '<div class="hero-banner-inner"><svg viewBox="0 0 1200 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" style="stop-color:var(--hero-sky-top)"/>' +
    '<stop offset="55%" style="stop-color:var(--hero-sky-mid)"/>' +
    '<stop offset="100%" style="stop-color:var(--hero-sky-bottom)"/>' +
    '</linearGradient></defs>' +
    '<rect x="0" y="0" width="1200" height="200" fill="url(#skyGrad)"/>' +
    '<circle cx="620" cy="118" r="46" style="fill:var(--hero-sun)" opacity="0.55"/>' +
    '<circle cx="620" cy="118" r="30" style="fill:var(--hero-sun-core)"/>' +
    '<ellipse cx="150" cy="52" rx="46" ry="15" style="fill:var(--hero-cloud)" opacity="0.85"/>' +
    '<ellipse cx="185" cy="46" rx="30" ry="12" style="fill:var(--hero-cloud)" opacity="0.85"/>' +
    '<ellipse cx="980" cy="40" rx="52" ry="16" style="fill:var(--hero-cloud)" opacity="0.75"/>' +
    '<ellipse cx="1025" cy="34" rx="30" ry="11" style="fill:var(--hero-cloud)" opacity="0.75"/>' +
    '<path d="M70 200 L70 92 Q60 88 58 78 Q68 84 72 78 Q76 66 80 78 Q84 70 88 80 Q80 88 72 84 Q76 92 70 96 Z" style="fill:var(--hero-palm)" opacity="0.9"/>' +
    '<path d="M0 150 Q100 130 200 150 T400 150 T600 150 T800 150 T1000 150 T1200 150 V200 H0 Z" style="fill:var(--hero-ocean)"/>' +
    '<path d="M0 150 Q100 130 200 150 T400 150 T600 150 T800 150 T1000 150 T1200 150" style="fill:none;stroke:var(--hero-foam);stroke-width:4" opacity="0.8"/>' +
    '<path d="M0 172 Q100 158 200 172 T400 172 T600 172 T800 172 T1000 172 T1200 172 V200 H0 Z" style="fill:var(--hero-ocean-dark)"/>' +
    "</svg></div>";
}

// Compact version of the same scene for the sidebar brand mark.
function logoMarkMarkup(size) {
  size = size || 30;
  return '<span class="logo-mark"><svg viewBox="0 0 40 40" width="' + size + '" height="' + size + '" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="logoGrad" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" style="stop-color:var(--hero-sky-top)"/>' +
    '<stop offset="100%" style="stop-color:var(--hero-sky-bottom)"/>' +
    '</linearGradient></defs>' +
    '<rect x="0" y="0" width="40" height="40" rx="10" fill="url(#logoGrad)"/>' +
    '<circle cx="24" cy="16" r="8" style="fill:var(--hero-sun-core)"/>' +
    '<path d="M0 28 Q10 23 20 28 T40 28 V40 H0 Z" style="fill:var(--hero-ocean)"/>' +
    '<path d="M0 32 Q10 28 20 32 T40 32 V40 H0 Z" style="fill:var(--hero-ocean-dark)"/>' +
    "</svg></span>";
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function fmtMoney(n) {
  n = Number(n) || 0;
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtRelativeDays(iso) {
  if (!iso) return "";
  const d = daysBetween(todayISO(), iso);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1) return "in " + d + " days";
  if (d === -1) return "1 day overdue";
  return Math.abs(d) + " days overdue";
}

function persist() {
  saveState(STATE);
  render();
}

function toast(msg) {
  const root = $("#toastRoot");
  root.innerHTML = '<div class="toast">' + escapeHtml(msg) + "</div>";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { root.innerHTML = ""; }, 2600);
}

function openModal(html) {
  $("#modalRoot").innerHTML = '<div class="modal-backdrop" data-action="close-modal-backdrop">' +
    '<div class="modal" role="dialog" aria-modal="true">' + html + "</div></div>";
}
function closeModal() { $("#modalRoot").innerHTML = ""; }

function findById(list, id) { return list.find((x) => x.id === id); }

// ---------------------------------------------------------------------------
// Calendar sync helper (shared by budget/household/vehicles/travel)
// ---------------------------------------------------------------------------
async function syncToCalendar(opts) {
  if (!Calendar.isConnected()) {
    const ok = await Calendar.ensureToken();
    if (!ok) { toast("Connect Google Calendar in Settings first."); return null; }
  }
  try {
    const calId = STATE.settings.defaultCalendarId || "primary";
    const event = await Calendar.upsertEvent(calId, opts);
    toast("Synced “" + opts.title + "” to Google Calendar");
    return event.id;
  } catch (e) {
    console.error(e);
    toast("Calendar sync failed: " + e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Startup: refresh recurring periods so nothing shows stale state
// ---------------------------------------------------------------------------
function refreshAll() {
  STATE.assets.forEach(refreshRecurringTask);
  saveState(STATE);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "📋" },
  { id: "budget", label: "Budget", icon: "💰" },
  { id: "household", label: "Household", icon: "🧹" },
  { id: "groceries", label: "Groceries", icon: "🛒" },
  { id: "vehicles", label: "Vehicles", icon: "🚗" },
  { id: "travel", label: "Travel", icon: "✈️" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

function renderNav() {
  const attn = getAttentionCount();
  $("#sidebar").innerHTML =
    '<div class="brand">' + logoMarkMarkup(32) + '<div><div class="brand-title">Adulting</div><div class="brand-sub">' +
    escapeHtml(STATE.settings.householdName || "Household") + "</div></div></div>" +
    TABS.map((t) => {
      const dot = t.id === "dashboard" && attn > 0 ? '<span class="dot" style="background:var(--attention)"></span>' : "";
      return '<button class="nav-item' + (currentTab === t.id ? " active" : "") + '" data-tab="' + t.id + '">' +
        icon(t.id, 17) + " " + t.label + dot + "</button>";
    }).join("") +
    '<div style="margin-top:auto;padding-top:10px"><button class="nav-item" data-action="open-board-mode">' + icon("board", 17) + " Board view</button></div>";
}

function getAttentionCount() {
  let n = 0;
  STATE.assets.forEach((a) => { if (a.needsAttention && a.needsAttention.flag) n++; });
  STATE.vehicles.forEach((v) => (v.tasks || []).forEach((t) => { if (t.needsAttention && t.needsAttention.flag) n++; }));
  STATE.trips.forEach((t) => { if (t.needsAttention && t.needsAttention.flag) n++; });
  STATE.groceries.forEach((g) => { if (groceryStatus(g) === "expired") n++; });
  return n;
}

function render() {
  window.STATE = STATE; // keep the Blue Bonnet widget's live view of household data in sync
  applyTheme();
  document.body.classList.toggle("board-mode-active", boardMode); // hides the Blue Bonnet bubble on the kiosk/shared-display board
  if (boardMode) { renderBoardPage(); return; }
  $("#appShell").style.display = "";
  $("#boardRoot").style.display = "none";
  renderNav();
  const fn = { dashboard: renderDashboard, budget: renderBudget, household: renderHousehold, groceries: renderGroceries, vehicles: renderVehicles, travel: renderTravel, settings: renderSettings }[currentTab];
  $("#main").innerHTML = fn();
}

// ---------------------------------------------------------------------------
// Board Mode — a distraction-free, no-editing status board meant to be left
// open on a tablet or shared screen. Same page, same local data; open it via
// the nav button (new tab) or by visiting this page with #board in the URL.
// ---------------------------------------------------------------------------
let boardTimer = null;

function openBoardMode(inNewTab) {
  if (inNewTab) { window.open(location.pathname + location.search + "#board", "_blank"); return; }
  enterBoardMode();
}

function enterBoardMode() {
  boardMode = true;
  location.hash = "board";
  render();
}

function exitBoardMode() {
  boardMode = false;
  history.replaceState(null, "", location.pathname + location.search);
  clearInterval(boardTimer);
  render();
}

function renderBoardPage() {
  $("#appShell").style.display = "none";
  const root = $("#boardRoot");
  root.style.display = "block";
  const lights = collectStatusLights();
  const now = new Date();
  root.innerHTML =
    '<button class="btn-primary board-exit" data-action="exit-board-mode">Exit board view</button>' +
    '<div class="board-header"><div class="board-title">' + logoMarkMarkup(40) + "<h1>" + escapeHtml(STATE.settings.householdName || "Household") + "</h1></div>" +
    '<div class="board-clock">' + now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) + " · " + now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) + "</div></div>" +
    (lights.length ? renderLightGrid(lights, "board-light-grid") : '<div class="board-empty">Nothing tracked yet. Add a household area, vehicle, bill, or trip to see it here.</div>');
  clearInterval(boardTimer);
  boardTimer = setInterval(() => { if (boardMode) renderBoardPage(); }, 60000);
}

// ===========================================================================
// DASHBOARD
// ===========================================================================
function renderDashboard() {
  const attentionItems = [];
  STATE.assets.forEach((a) => { if (a.needsAttention && a.needsAttention.flag) attentionItems.push({ label: a.icon + " " + a.name, note: a.needsAttention.note, tab: "household" }); });
  STATE.vehicles.forEach((v) => (v.tasks || []).forEach((t) => { if (t.needsAttention && t.needsAttention.flag) attentionItems.push({ label: "🚗 " + v.name + " — " + t.title, note: t.needsAttention.note, tab: "vehicles" }); }));
  STATE.trips.forEach((t) => { if (t.needsAttention && t.needsAttention.flag) attentionItems.push({ label: "✈️ " + t.name, note: t.needsAttention.note, tab: "travel" }); });
  STATE.groceries.forEach((g) => { if (groceryStatus(g) === "expired") attentionItems.push({ label: "🛒 " + g.name + " expired", note: "Expired " + fmtDate(g.expirationDate), tab: "groceries" }); });

  const todayItems = collectTodayItems();

  const householdDone = STATE.assets.filter((a) => computeStatus(a.items) === "done").length;
  const billsThisPeriod = STATE.bills.filter((b) => b.recurring !== false);
  const paidCount = billsThisPeriod.filter((b) => (b.paidPeriods || {})[currentBillingPeriodKey()]).length;
  const regularTotal = STATE.bills.filter((b) => b.type === "regular").reduce((s, b) => s + Number(b.amount || 0), 0);
  const discTotal = STATE.bills.filter((b) => b.type === "discretionary").reduce((s, b) => s + Number(b.amount || 0), 0);

  return '<h1>Dashboard</h1><p class="page-sub">Everything that needs eyes on it today — nothing more.</p>' +
    (attentionItems.length
      ? '<div class="attention-banner"><h3>🚩 Needs attention (' + attentionItems.length + ')</h3><ul>' +
        attentionItems.map((i) => "<li><strong>" + escapeHtml(i.label) + "</strong>" + (i.note ? " — " + escapeHtml(i.note) : "") + "</li>").join("") +
        "</ul></div>"
      : '<div class="reassure"><span class="icon">✅</span> Nothing is flagged right now. You’re caught up.</div>') +
    '<div class="section-title">Today &amp; this week</div>' +
    (todayItems.length
      ? '<div class="card"><table><tbody>' + todayItems.map((i) =>
          "<tr><td>" + i.icon + " " + escapeHtml(i.label) + "</td><td class=\"muted small\">" + escapeHtml(i.when) + "</td></tr>").join("") + "</tbody></table></div>"
      : '<div class="reassure"><span class="icon">🌤️</span> Nothing due today or this week. Nothing will be missed if you close this tab.</div>') +
    '<div class="section-title">Overview</div>' +
    '<div class="grid">' +
      dashCard("household", "Household", householdDone + " / " + STATE.assets.length + " areas caught up", "household") +
      dashCard("vehicles", "Vehicles", STATE.vehicles.length ? STATE.vehicles.length + " vehicle(s) tracked" : "No vehicles yet", "vehicles") +
      dashCard("groceries", "Groceries", STATE.groceries.filter((g) => groceryStatus(g) === "soon").length + " expiring soon", "groceries") +
      dashCard("travel", "Travel", STATE.trips.length ? STATE.trips.length + " trip(s) planned" : "No trips planned", "travel") +
      dashCard("budget", "Budget this month", fmtMoney(regularTotal + discTotal) + " total · " + paidCount + "/" + billsThisPeriod.length + " paid", "budget") +
    "</div>" +
    '<div class="row between" style="margin:22px 0 8px"><div class="section-title" style="margin:0">Status board</div>' +
    '<button class="btn-sm btn-ghost" data-action="open-board-mode">' + icon("board", 15) + " Open full-screen board view</button></div>" +
    '<p class="muted small" style="margin:-4px 0 12px">A green/amber/gray/red light per area — safe to leave open on a tablet or shared screen so anyone can see progress at a glance.</p>' +
    renderLightGrid(collectStatusLights(), "light-grid");
}

function dashCard(iconKey, title, sub, tab) {
  return '<div class="card" data-action="goto-tab" data-tab="' + tab + '" style="cursor:pointer">' +
    '<div class="card-header"><span class="card-icon">' + icon(iconKey, 20) + '</span><span class="card-title">' + title + "</span></div>" +
    '<div class="muted small">' + escapeHtml(sub) + "</div></div>";
}

// ---------------------------------------------------------------------------
// Status-light board — shared by the Dashboard section and standalone Board Mode
// ---------------------------------------------------------------------------
function collectStatusLights() {
  const lights = [];
  STATE.assets.forEach((a) => {
    lights.push({
      label: a.name,
      sub: a.recurrence.type === "weekly" ? "Resets weekly" : "Resets monthly",
      status: (a.needsAttention && a.needsAttention.flag) ? "attention" : computeStatus(a.items),
    });
  });
  STATE.vehicles.forEach((v) => {
    const tasks = v.tasks || [];
    const overdue = tasks.filter((t) => vehicleTaskStatus(t, v).overdue).length;
    const dueSoon = tasks.filter((t) => vehicleTaskStatus(t, v).dueSoon).length;
    const flagged = tasks.some((t) => t.needsAttention && t.needsAttention.flag);
    lights.push({
      label: v.name,
      sub: overdue ? overdue + " task(s) overdue" : dueSoon ? dueSoon + " due soon" : "Up to date",
      status: flagged || overdue ? "attention" : dueSoon ? "partial" : "done",
    });
  });
  if (STATE.bills.length) {
    const key = currentBillingPeriodKey();
    const paid = STATE.bills.filter((b) => (b.paidPeriods || {})[key]).length;
    const anyOverdueUnpaid = STATE.bills.some((b) => !((b.paidPeriods || {})[key]) && billDueDateThisPeriod(b) < todayISO());
    lights.push({
      label: "Budget this month",
      sub: paid + " / " + STATE.bills.length + " bills paid",
      status: anyOverdueUnpaid ? "attention" : paid === STATE.bills.length ? "done" : paid > 0 ? "partial" : "none",
    });
  }
  if (STATE.groceries.some((g) => !g.used && !g.thrown)) {
    const active = STATE.groceries.filter((g) => !g.used && !g.thrown);
    const expired = active.filter((g) => groceryStatus(g) === "expired").length;
    const soon = active.filter((g) => groceryStatus(g) === "soon").length;
    lights.push({
      label: "Groceries",
      sub: expired ? expired + " expired" : soon ? soon + " expiring soon" : "All fresh",
      status: expired ? "attention" : soon ? "partial" : "done",
    });
  }
  STATE.trips.forEach((t) => {
    const prog = tripProgress(t);
    const daysOut = daysBetween(todayISO(), t.startDate);
    lights.push({
      label: t.name,
      sub: daysOut >= 0 ? daysOut + " days out" : "In progress / past",
      status: (t.needsAttention && t.needsAttention.flag) ? "attention" : prog.status,
    });
  });
  return lights;
}

function renderLightGrid(lights, gridClass) {
  if (!lights.length) return emptyState("🌤️", "Nothing tracked yet", "Add a household area, vehicle, bill, or trip to see it here.");
  return '<div class="' + gridClass + '">' + lights.map((l) =>
    '<div class="' + (gridClass === "light-grid" ? "light-card" : "board-light-card") + '"><span class="light-bulb ' + l.status + '"></span>' +
    "<div><div class=\"light-label\">" + escapeHtml(l.label) + "</div><div class=\"light-sub\">" + escapeHtml(l.sub) + "</div></div></div>"
  ).join("") + "</div>";
}

function collectTodayItems() {
  const items = [];
  const horizon = addDaysISO(todayISO(), 7);
  STATE.assets.forEach((a) => {
    if (a.dueDate && a.dueDate <= horizon && computeStatus(a.items) !== "done") {
      items.push({ icon: "🧹", label: a.name + " checklist", when: fmtRelativeDays(a.dueDate) });
    }
  });
  STATE.bills.forEach((b) => {
    const due = billDueDateThisPeriod(b);
    const paid = (b.paidPeriods || {})[currentBillingPeriodKey()];
    if (!paid && due <= horizon) items.push({ icon: "💰", label: b.name + " (" + fmtMoney(b.amount) + ")", when: fmtRelativeDays(due) });
  });
  STATE.vehicles.forEach((v) => (v.tasks || []).forEach((t) => {
    const s = vehicleTaskStatus(t, v);
    if (s.overdue || s.dueSoon) items.push({ icon: "🚗", label: v.name + " — " + t.title, when: s.overdue ? "overdue" : (t.dueDate ? fmtRelativeDays(t.dueDate) : "due soon (mileage)") });
  }));
  STATE.groceries.forEach((g) => {
    const s = groceryStatus(g);
    if (s === "soon" || s === "expired") items.push({ icon: "🛒", label: g.name, when: s === "expired" ? "expired " + fmtDate(g.expirationDate) : "use by " + fmtDate(g.expirationDate) });
  });
  STATE.trips.forEach((t) => {
    t.prep.forEach((p) => { if (!p.checked && p.dueDate && p.dueDate <= horizon) items.push({ icon: "✈️", label: t.name + ": " + p.text, when: fmtRelativeDays(p.dueDate) }); });
  });
  return items.sort((a, b) => (a.when > b.when ? 1 : -1)).slice(0, 12);
}

// ===========================================================================
// BUDGET
// ===========================================================================
function renderBudget() {
  const periodKey = currentBillingPeriodKey();
  const regular = STATE.bills.filter((b) => b.type === "regular");
  const disc = STATE.bills.filter((b) => b.type === "discretionary");
  const regularTotal = regular.reduce((s, b) => s + Number(b.amount || 0), 0);
  const discTotal = disc.reduce((s, b) => s + Number(b.amount || 0), 0);
  const total = regularTotal + discTotal;

  function billRow(b) {
    const due = billDueDateThisPeriod(b);
    const paid = (b.paidPeriods || {})[periodKey];
    return "<tr>" +
      "<td><label class=\"row\"><input type=\"checkbox\" data-action=\"toggle-paid\" data-id=\"" + b.id + "\" " + (paid ? "checked" : "") + " /> " + escapeHtml(b.name) + "</label></td>" +
      "<td><span class=\"tag " + b.type + "\">" + (b.type === "regular" ? "Regular" : "Discretionary") + "</span></td>" +
      "<td class=\"muted small\">" + escapeHtml(b.category || "") + "</td>" +
      "<td>" + fmtMoney(b.amount) + "</td>" +
      "<td class=\"muted small\">" + fmtDate(due) + (paid ? "" : " · " + fmtRelativeDays(due)) + "</td>" +
      "<td><div class=\"row\">" +
        "<button class=\"btn-sm\" data-action=\"open-bill-modal\" data-id=\"" + b.id + "\">Edit</button>" +
        "<button class=\"btn-sm\" data-action=\"sync-bill-calendar\" data-id=\"" + b.id + "\">📅</button>" +
        "<button class=\"btn-sm btn-danger\" data-action=\"delete-bill\" data-id=\"" + b.id + "\">Delete</button>" +
      "</div></td></tr>";
  }

  return '<h1>Budget</h1><p class="page-sub">Regular = fixed necessities. Discretionary = spending by choice. Keeping them separate makes trade-offs visible.</p>' +
    '<div class="grid" style="margin-bottom:20px">' +
      '<div class="card"><div class="muted small">Total this month</div><div style="font-size:26px;font-weight:800">' + fmtMoney(total) + "</div></div>" +
      '<div class="card"><div class="muted small">Regular (fixed)</div><div style="font-size:26px;font-weight:800;color:var(--primary-dark)">' + fmtMoney(regularTotal) + "</div></div>" +
      '<div class="card"><div class="muted small">Discretionary</div><div style="font-size:26px;font-weight:800;color:#7c3fd6">' + fmtMoney(discTotal) + "</div></div>" +
    "</div>" +
    '<div class="row between" style="margin-bottom:10px">' +
      '<h2 style="margin:0">Bills &amp; spending</h2>' +
      '<div class="row"><button class="btn-ghost btn-sm" data-action="sync-all-bills-calendar">📅 Sync all to calendar</button>' +
      '<button class="btn-primary" data-action="open-bill-modal" data-id="">+ Add bill</button></div>' +
    "</div>" +
    (STATE.bills.length
      ? '<div class="card"><table><thead><tr><th>Name</th><th>Type</th><th>Category</th><th>Amount</th><th>Due</th><th></th></tr></thead><tbody>' +
        STATE.bills.slice().sort((a, b) => (a.dueDay || 1) - (b.dueDay || 1)).map(billRow).join("") + "</tbody></table></div>"
      : emptyState("💰", "No bills yet", "Add rent, utilities, subscriptions — anything that repeats each month."));
}

function openBillModal(id) {
  const b = id ? findById(STATE.bills, id) : { name: "", amount: "", type: "regular", category: "", dueDay: 1, recurring: true };
  const cats = BUDGET_CATEGORIES.regular.concat(BUDGET_CATEGORIES.discretionary);
  openModal(
    "<h3>" + (id ? "Edit bill" : "Add bill") + '</h3><form data-form="bill" data-id="' + (id || "") + '">' +
    '<div class="field"><label>Name</label><input type="text" name="name" required value="' + escapeHtml(b.name) + '" /></div>' +
    '<div class="field-row"><div class="field"><label>Amount</label><input type="number" step="0.01" name="amount" required value="' + escapeHtml(b.amount) + '" /></div>' +
    '<div class="field"><label>Due day of month</label><input type="number" min="1" max="31" name="dueDay" value="' + (b.dueDay || 1) + '" /></div></div>' +
    '<div class="field-row"><div class="field"><label>Type</label><select name="type"><option value="regular"' + (b.type === "regular" ? " selected" : "") + '>Regular (fixed)</option><option value="discretionary"' + (b.type === "discretionary" ? " selected" : "") + ">Discretionary</option></select></div>" +
    '<div class="field"><label>Category</label><select name="category">' + cats.map((c) => '<option ' + (b.category === c ? "selected" : "") + ">" + c + "</option>").join("") + "</select></div></div>" +
    '<label class="row"><input type="checkbox" name="recurring" ' + (b.recurring !== false ? "checked" : "") + ' style="width:18px;height:18px" /> Repeats every month</label>' +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Save</button></div></form>'
  );
}

function collectFormData(form) {
  const fd = new FormData(form);
  const out = {};
  fd.forEach((v, k) => { out[k] = v; });
  $all('input[type="checkbox"]', form).forEach((cb) => { out[cb.name] = cb.checked; });
  return out;
}

function saveBillForm(form) {
  const id = form.dataset.id;
  const data = collectFormData(form);
  if (id) {
    const b = findById(STATE.bills, id);
    Object.assign(b, { name: data.name, amount: Number(data.amount), dueDay: Number(data.dueDay), type: data.type, category: data.category, recurring: !!data.recurring });
  } else {
    STATE.bills.push({ id: uid("bill"), name: data.name, amount: Number(data.amount), dueDay: Number(data.dueDay), type: data.type, category: data.category, recurring: !!data.recurring, paidPeriods: {}, calendarEventId: null });
  }
  closeModal();
  persist();
  toast("Bill saved");
}

function deleteBill(id) { STATE.bills = STATE.bills.filter((b) => b.id !== id); persist(); }

function togglePaid(id) {
  const b = findById(STATE.bills, id);
  const key = currentBillingPeriodKey();
  b.paidPeriods = b.paidPeriods || {};
  b.paidPeriods[key] = !b.paidPeriods[key];
  persist();
}

async function syncBillCalendar(id) {
  const b = findById(STATE.bills, id);
  const rrule = b.recurring !== false ? "RRULE:FREQ=MONTHLY;BYMONTHDAY=" + Math.min(b.dueDay || 1, 28) : null;
  const eventId = await syncToCalendar({
    title: "Bill due: " + b.name, description: fmtMoney(b.amount) + " · " + (b.type === "regular" ? "Regular" : "Discretionary") + (b.category ? " · " + b.category : ""),
    dateISO: billDueDateThisPeriod(b), rrule, kind: "bill", refId: b.id, existingEventId: b.calendarEventId,
  });
  if (eventId) { b.calendarEventId = eventId; persist(); }
}

async function syncAllBillsCalendar() {
  for (const b of STATE.bills) await syncBillCalendar(b.id);
  toast("All bills synced");
}

// ===========================================================================
// HOUSEHOLD
// ===========================================================================
function renderHousehold() {
  const cards = STATE.assets.map((a) => {
    const status = computeStatus(a.items);
    const overdue = isTaskOverdue(a);
    const open = expandedIds.has(a.id);
    const checkedN = a.items.filter((i) => i.checked).length;
    return '<div class="card">' +
      '<div class="card-header" data-action="toggle-asset-open" data-id="' + a.id + '" style="cursor:pointer">' +
        '<span class="card-icon">' + icon(a.key || "custom", 20) + '</span><span class="card-title">' + escapeHtml(a.name) + "</span>" +
        (a.needsAttention && a.needsAttention.flag ? '<span class="status-dot attention"></span>' : '<span class="status-dot ' + status + '"></span>') +
      "</div>" +
      '<div class="muted small">' + a.recurrence.type + ' · resets ' + (a.recurrence.type === "weekly" ? "weekly" : "monthly") + " · due " + fmtDate(a.dueDate) + (overdue ? " · <span style=\"color:var(--attention)\">overdue</span>" : "") + "</div>" +
      '<div class="progress-bar"><div style="width:' + (a.items.length ? (checkedN / a.items.length * 100) : 0) + '%"></div></div>' +
      (a.needsAttention && a.needsAttention.flag ? '<div class="attention-banner" style="margin:10px 0 0"><strong>Needs attention:</strong> ' + escapeHtml(a.needsAttention.note || "") + '<div style="margin-top:8px"><button class="btn-sm" data-action="clear-attention" data-domain="asset" data-id="' + a.id + '">Mark resolved</button></div></div>' : "") +
      (open ? renderAssetDetail(a) : "") +
      "</div>";
  }).join("");

  return '<h1>Household</h1><p class="page-sub">Each area has its own short checklist. Check things off as you go — it saves automatically.</p>' +
    '<div class="row" style="margin-bottom:16px"><button class="btn-primary" data-action="open-add-asset-modal">+ Add area</button></div>' +
    (STATE.assets.length ? '<div class="grid">' + cards + "</div>" : emptyState("🧹", "No areas yet", "Add your kitchen, bathroom, HVAC filters — whatever needs regular upkeep."));
}

function renderAssetDetail(a) {
  const items = a.items.map((it, idx) =>
    '<li class="' + (it.checked ? "checked" : "") + '"><input type="checkbox" id="ai_' + a.id + "_" + idx + '" data-action="toggle-asset-item" data-id="' + a.id + '" data-index="' + idx + '" ' + (it.checked ? "checked" : "") + ' /><label for="ai_' + a.id + "_" + idx + '">' + escapeHtml(it.text) + "</label>" +
    '<button class="btn-ghost btn-sm" data-action="remove-asset-item" data-id="' + a.id + '" data-index="' + idx + '" title="Remove item">✕</button></li>').join("");
  const status = computeStatus(a.items);
  return '<div class="hr"></div>' +
    (status === "done" ? '<div class="reassure" style="margin-bottom:12px"><span class="icon">✅</span> All done here. Nothing left for ' + a.recurrence.type + '.</div>' : "") +
    '<ul class="checklist">' + items + "</ul>" +
    '<form class="row" data-form="add-asset-item" data-id="' + a.id + '" style="margin-top:8px"><input type="text" name="text" placeholder="Add a checklist item" style="flex:1" /><button class="btn-sm" type="submit">Add</button></form>' +
    '<div class="hr"></div>' +
    '<label class="row"><input type="checkbox" data-action="asset-signal-up" data-id="' + a.id + '" ' + (a.signalUp ? "checked" : "") + ' style="width:18px;height:18px" /> I’m calling this fully caught up</label>' +
    '<div class="row" style="margin-top:10px;flex-wrap:wrap">' +
      '<button class="btn-sm btn-danger" data-action="open-attention-modal" data-domain="asset" data-id="' + a.id + '">🚩 Flag needs attention</button>' +
      '<button class="btn-sm" data-action="sync-asset-calendar" data-id="' + a.id + '">📅 Sync to calendar</button>' +
      '<button class="btn-sm btn-ghost" data-action="delete-asset" data-id="' + a.id + '">Delete area</button>' +
    "</div>";
}

function openAddAssetModal() {
  const templates = DEFAULT_HOUSEHOLD_ASSETS.map((t, i) => '<option value="' + i + '">' + t.icon + " " + t.name + "</option>").join("");
  openModal(
    '<h3>Add area</h3><form data-form="asset-template"><div class="field"><label>Start from a template</label><select name="templateIndex"><option value="-1">— Custom (blank) —</option>' + templates + "</select></div>" +
    '<div class="field"><label>Or name it yourself (used if Custom)</label><input type="text" name="customName" placeholder="e.g. Garage" /></div>' +
    '<div class="field"><label>How often does it need doing?</label><select name="recurrence"><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>' +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Add</button></div></form>'
  );
}

function addAssetFromForm(form) {
  const data = collectFormData(form);
  const idx = Number(data.templateIndex);
  let name, assetIcon, key, items;
  if (idx >= 0) {
    const t = DEFAULT_HOUSEHOLD_ASSETS[idx];
    name = t.name; assetIcon = t.icon; key = t.key; items = t.items.map((text) => ({ text, checked: false }));
  } else {
    name = data.customName || "New area"; assetIcon = "🏷️"; key = "custom"; items = [];
  }
  const recurrence = { type: data.recurrence || "weekly", interval: 1 };
  const asset = { id: uid("asset"), name, icon: assetIcon, key, recurrence, items, currentPeriodKey: null, dueDate: null, signalUp: false, completedAt: null, needsAttention: { flag: false, note: "" }, calendarEventId: null };
  refreshRecurringTask(asset);
  STATE.assets.push(asset);
  closeModal();
  persist();
  toast("Added " + name);
}

function toggleAssetOpen(id) { expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id); render(); }

function toggleAssetItem(id, index) {
  const a = findById(STATE.assets, id);
  a.items[index].checked = !a.items[index].checked;
  if (computeStatus(a.items) === "done") a.completedAt = new Date().toISOString();
  persist();
}

function addAssetItem(form) {
  const id = form.dataset.id;
  const text = collectFormData(form).text;
  if (!text) return;
  const a = findById(STATE.assets, id);
  a.items.push({ text, checked: false });
  persist();
}

function removeAssetItem(id, index) {
  const a = findById(STATE.assets, id);
  a.items.splice(index, 1);
  persist();
}

function setAssetSignalUp(id, val) { findById(STATE.assets, id).signalUp = val; persist(); }
function deleteAsset(id) { STATE.assets = STATE.assets.filter((a) => a.id !== id); persist(); }

async function syncAssetCalendar(id) {
  const a = findById(STATE.assets, id);
  const rrule = a.recurrence.type === "weekly" ? "RRULE:FREQ=WEEKLY;BYDAY=SU" : "RRULE:FREQ=MONTHLY;BYMONTHDAY=" + new Date(a.dueDate + "T00:00:00").getDate();
  const eventId = await syncToCalendar({ title: a.name + " checklist due", description: a.items.map((i) => "- " + i.text).join("\n"), dateISO: a.dueDate, rrule, kind: "household", refId: a.id, existingEventId: a.calendarEventId });
  if (eventId) { a.calendarEventId = eventId; persist(); }
}

// ---- Generic "needs attention" modal (asset / vehicle task / trip) --------
function openAttentionModal(domain, id, taskId) {
  openModal(
    '<h3>Flag needs attention</h3><form data-form="attention" data-domain="' + domain + '" data-id="' + id + '" data-task="' + (taskId || "") + '">' +
    '<div class="field"><label>What’s wrong?</label><textarea name="note" rows="3" placeholder="e.g. Leaky faucet under the sink" required></textarea></div>' +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-danger">Flag it</button></div></form>'
  );
}

function saveAttentionForm(form) {
  const { domain, id, task } = form.dataset;
  const note = collectFormData(form).note;
  const payload = { flag: true, note, requestedAt: new Date().toISOString() };
  if (domain === "asset") findById(STATE.assets, id).needsAttention = payload;
  if (domain === "vehicle") { const v = findById(STATE.vehicles, id); findById(v.tasks, task).needsAttention = payload; }
  if (domain === "trip") findById(STATE.trips, id).needsAttention = payload;
  closeModal(); persist(); toast("Flagged");
}

function clearAttention(domain, id, task) {
  const cleared = { flag: false, note: "" };
  if (domain === "asset") findById(STATE.assets, id).needsAttention = cleared;
  if (domain === "vehicle") { const v = findById(STATE.vehicles, id); findById(v.tasks, task).needsAttention = cleared; }
  if (domain === "trip") findById(STATE.trips, id).needsAttention = cleared;
  persist();
}

// ===========================================================================
// GROCERIES
// ===========================================================================
function renderGroceries() {
  const active = STATE.groceries.filter((g) => !g.used && !g.thrown);
  const resolved = STATE.groceries.filter((g) => g.used || g.thrown);
  const order = { expired: 0, soon: 1, fresh: 2 };
  active.sort((a, b) => order[groceryStatus(a)] - order[groceryStatus(b)] || a.expirationDate.localeCompare(b.expirationDate));

  function row(g) {
    const s = groceryStatus(g);
    const label = { expired: "Expired", soon: "Use soon", fresh: "Fresh" }[s];
    return "<tr>" +
      "<td>" + escapeHtml(g.name) + (g.qty > 1 ? ' <span class="muted small">×' + g.qty + "</span>" : "") + "</td>" +
      "<td class=\"muted small\">" + fmtDate(g.purchaseDate) + "</td>" +
      "<td>" + fmtDate(g.expirationDate) + "</td>" +
      "<td><span class=\"status-pill " + (s === "expired" ? "attention" : s === "soon" ? "partial" : "done") + '">' + label + "</span></td>" +
      "<td><div class=\"row\">" +
        '<button class="btn-sm" data-action="mark-grocery-used" data-id="' + g.id + '">Used it</button>' +
        '<button class="btn-sm btn-danger" data-action="mark-grocery-thrown" data-id="' + g.id + '">Toss</button>' +
      "</div></td></tr>";
  }

  return '<h1>Groceries</h1><p class="page-sub">Log what you buy, and Adulting tracks when to use it before it goes bad.</p>' +
    '<div class="row" style="margin-bottom:16px"><button class="btn-primary" data-action="open-add-grocery-modal">+ Add groceries</button></div>' +
    (active.length ? '<div class="card"><table><thead><tr><th>Item</th><th>Bought</th><th>Use by</th><th>Status</th><th></th></tr></thead><tbody>' + active.map(row).join("") + "</tbody></table></div>"
      : emptyState("🛒", "Nothing tracked yet", "Add groceries as you buy them and set an expiration date.")) +
    (resolved.length ? '<div class="section-title">Used / thrown out (' + resolved.length + ')</div><div class="card"><table><tbody>' +
      resolved.slice(-10).reverse().map((g) => "<tr><td>" + escapeHtml(g.name) + "</td><td class=\"muted small\">" + (g.used ? "Used" : "Thrown out") + "</td><td><button class=\"btn-sm\" data-action=\"delete-grocery\" data-id=\"" + g.id + "\">Remove</button></td></tr>").join("") +
      "</tbody></table></div>" : "");
}

function suggestExpiration(name) {
  const key = Object.keys(SHELF_LIFE_DB).find((k) => name.toLowerCase().includes(k) || k.includes(name.toLowerCase()));
  return key ? SHELF_LIFE_DB[key] : 7;
}

function openAddGroceryModal() {
  const datalist = Object.keys(SHELF_LIFE_DB).map((k) => "<option value=\"" + k + "\">").join("");
  openModal(
    '<h3>Add groceries</h3><form data-form="grocery">' +
    '<div class="field"><label>Item</label><input list="foodList" type="text" name="name" required autocomplete="off" /><datalist id="foodList">' + datalist + "</datalist></div>" +
    '<div class="field-row"><div class="field"><label>Quantity</label><input type="number" name="qty" min="1" value="1" /></div>' +
    '<div class="field"><label>Purchase date</label><input type="date" name="purchaseDate" value="' + todayISO() + '" /></div></div>' +
    '<div class="field"><label>Use-by / expiration date</label><input type="date" name="expirationDate" /></div>' +
    '<p class="muted small">Leave expiration blank and Adulting will suggest one based on common shelf life.</p>' +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Add</button></div></form>'
  );
}

function addGroceryForm(form) {
  const data = collectFormData(form);
  const purchaseDate = data.purchaseDate || todayISO();
  const expirationDate = data.expirationDate || addDaysISO(purchaseDate, suggestExpiration(data.name));
  STATE.groceries.push({ id: uid("grocery"), name: data.name, qty: Number(data.qty) || 1, purchaseDate, expirationDate, used: false, thrown: false });
  closeModal(); persist(); toast("Added " + data.name);
}

function markGroceryUsed(id) { findById(STATE.groceries, id).used = true; persist(); }
function markGroceryThrown(id) { findById(STATE.groceries, id).thrown = true; persist(); }
function deleteGrocery(id) { STATE.groceries = STATE.groceries.filter((g) => g.id !== id); persist(); }

// ===========================================================================
// VEHICLES
// ===========================================================================
function renderVehicles() {
  const cards = STATE.vehicles.map((v) => {
    const open = expandedIds.has(v.id);
    const tasks = v.tasks || [];
    const overdueCount = tasks.filter((t) => vehicleTaskStatus(t, v).overdue).length;
    const status = overdueCount > 0 ? "attention" : tasks.some((t) => vehicleTaskStatus(t, v).dueSoon) ? "partial" : "done";
    return '<div class="card">' +
      '<div class="card-header" data-action="toggle-vehicle-open" data-id="' + v.id + '" style="cursor:pointer">' +
        '<span class="card-icon">' + icon("vehicles", 20) + '</span><span class="card-title">' + escapeHtml(v.name) + '</span><span class="status-dot ' + status + '"></span></div>' +
      '<div class="muted small">' + escapeHtml([v.year, v.make, v.model].filter(Boolean).join(" ")) + " · " + (v.mileage || 0).toLocaleString() + " mi</div>" +
      (overdueCount ? '<div class="status-pill attention" style="margin-top:8px">' + overdueCount + " task(s) overdue</div>" : "") +
      (open ? renderVehicleDetail(v) : "") +
      "</div>";
  }).join("");
  return '<h1>Vehicles</h1><p class="page-sub">Oil changes, rotations, inspections — tracked by date and mileage so nothing sneaks up.</p>' +
    '<div class="row" style="margin-bottom:16px"><button class="btn-primary" data-action="open-add-vehicle-modal">+ Add vehicle</button></div>' +
    (STATE.vehicles.length ? '<div class="grid">' + cards + "</div>" : emptyState("🚗", "No vehicles yet", "Add a car to start tracking maintenance."));
}

function renderVehicleDetail(v) {
  const rows = (v.tasks || []).map((t) => {
    const s = vehicleTaskStatus(t, v);
    const pill = s.overdue ? '<span class="status-pill attention">Overdue</span>' : s.dueSoon ? '<span class="status-pill partial">Due soon</span>' : '<span class="status-pill done">OK</span>';
    let due = [];
    if (t.dueDate) due.push(fmtDate(t.dueDate));
    if (t.dueMileage != null) due.push(t.dueMileage.toLocaleString() + " mi");
    return "<tr><td>" + escapeHtml(t.title) + (t.needsAttention && t.needsAttention.flag ? " 🚩" : "") + "</td><td class=\"muted small\">" + due.join(" / ") + "</td><td>" + pill + "</td>" +
      "<td><div class=\"row\">" +
      '<button class="btn-sm" data-action="complete-vehicle-task" data-id="' + v.id + '" data-task="' + t.id + '">Mark done</button>' +
      '<button class="btn-sm" data-action="sync-vehicle-task-calendar" data-id="' + v.id + '" data-task="' + t.id + '">📅</button>' +
      '<button class="btn-sm btn-danger" data-action="open-attention-modal" data-domain="vehicle" data-id="' + v.id + '" data-task="' + t.id + '">🚩</button>' +
      "</div></td></tr>";
  }).join("");
  return '<div class="hr"></div>' +
    '<form class="field-row" data-form="update-mileage" data-id="' + v.id + '"><div class="field"><label>Current mileage</label><input type="number" name="mileage" value="' + (v.mileage || 0) + '" /></div><div class="field" style="align-self:flex-end"><button class="btn-sm" type="submit">Update</button></div></form>' +
    '<table><thead><tr><th>Task</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>' + rows + "</tbody></table>" +
    '<div class="row" style="margin-top:12px"><button class="btn-sm btn-ghost" data-action="delete-vehicle" data-id="' + v.id + '">Delete vehicle</button></div>';
}

function openAddVehicleModal() {
  openModal(
    '<h3>Add vehicle</h3><form data-form="vehicle">' +
    '<div class="field"><label>Name (e.g. Honda Civic)</label><input type="text" name="name" required /></div>' +
    '<div class="field-row"><div class="field"><label>Year</label><input type="number" name="year" /></div><div class="field"><label>Make</label><input type="text" name="make" /></div><div class="field"><label>Model</label><input type="text" name="model" /></div></div>' +
    '<div class="field"><label>Current mileage</label><input type="number" name="mileage" value="0" /></div>' +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Add</button></div></form>'
  );
}

function addVehicleForm(form) {
  const data = collectFormData(form);
  const mileage = Number(data.mileage) || 0;
  const tasks = DEFAULT_VEHICLE_TASKS.map((t) => ({
    id: uid("vtask"), title: t.title,
    intervalDays: t.intervalDays || null, intervalMiles: t.intervalMiles || null,
    lastDoneDate: null, lastDoneMileage: null,
    dueDate: t.intervalDays ? addDaysISO(todayISO(), t.intervalDays) : null,
    dueMileage: t.intervalMiles ? mileage + t.intervalMiles : null,
    needsAttention: { flag: false, note: "" }, calendarEventId: null,
  }));
  STATE.vehicles.push({ id: uid("vehicle"), name: data.name, year: data.year, make: data.make, model: data.model, mileage, tasks });
  closeModal(); persist(); toast("Added " + data.name);
}

function toggleVehicleOpen(id) { expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id); render(); }

function completeVehicleTask(vehicleId, taskId) {
  const v = findById(STATE.vehicles, vehicleId);
  const t = findById(v.tasks, taskId);
  t.lastDoneDate = todayISO();
  t.lastDoneMileage = v.mileage;
  if (t.intervalDays) t.dueDate = addDaysISO(todayISO(), t.intervalDays);
  if (t.intervalMiles) t.dueMileage = v.mileage + t.intervalMiles;
  persist();
  toast(t.title + " marked done");
}

function updateVehicleMileage(form) {
  const v = findById(STATE.vehicles, form.dataset.id);
  v.mileage = Number(collectFormData(form).mileage) || v.mileage;
  persist();
}

function deleteVehicle(id) { STATE.vehicles = STATE.vehicles.filter((v) => v.id !== id); persist(); }

async function syncVehicleTaskCalendar(vehicleId, taskId) {
  const v = findById(STATE.vehicles, vehicleId);
  const t = findById(v.tasks, taskId);
  if (!t.dueDate) { toast("This task is tracked by mileage only — no calendar date to sync."); return; }
  const eventId = await syncToCalendar({ title: v.name + ": " + t.title + " due", description: "Adulting vehicle maintenance reminder", dateISO: t.dueDate, kind: "vehicle", refId: t.id, existingEventId: t.calendarEventId });
  if (eventId) { t.calendarEventId = eventId; persist(); }
}

// ===========================================================================
// TRAVEL
// ===========================================================================
function renderTravel() {
  const cards = STATE.trips.map((t) => {
    const open = expandedIds.has(t.id);
    const prog = tripProgress(t);
    const daysOut = daysBetween(todayISO(), t.startDate);
    return '<div class="card">' +
      '<div class="card-header" data-action="toggle-trip-open" data-id="' + t.id + '" style="cursor:pointer">' +
        '<span class="card-icon">' + icon("travel", 20) + '</span><span class="card-title">' + escapeHtml(t.name) + '</span>' +
        (t.needsAttention && t.needsAttention.flag ? '<span class="status-dot attention"></span>' : '<span class="status-dot ' + prog.status + '"></span>') +
      "</div>" +
      '<div class="muted small">' + escapeHtml(t.destination || "") + " · " + fmtDate(t.startDate) + (daysOut >= 0 ? " · " + (daysOut === 0 ? "today" : daysOut + " days out") : "") + "</div>" +
      '<div class="progress-bar"><div style="width:' + (prog.total ? prog.checked / prog.total * 100 : 0) + '%"></div></div>' +
      (prog.status === "done" ? '<div class="reassure" style="margin:10px 0 0"><span class="icon">🎒</span> You’re all set for this trip. Nothing forgotten.</div>' : "") +
      (t.needsAttention && t.needsAttention.flag ? '<div class="attention-banner" style="margin:10px 0 0"><strong>Needs attention:</strong> ' + escapeHtml(t.needsAttention.note || "") + '<div style="margin-top:8px"><button class="btn-sm" data-action="clear-attention" data-domain="trip" data-id="' + t.id + '">Mark resolved</button></div></div>' : "") +
      (open ? renderTripDetail(t) : "") +
      "</div>";
  }).join("");
  return '<h1>Travel</h1><p class="page-sub">A separate checklist for trips — packing, prep, and grooming so nothing gets left behind. Follow the list and you’re covered.</p>' +
    '<div class="row" style="margin-bottom:16px"><button class="btn-primary" data-action="open-add-trip-modal">+ Add trip</button></div>' +
    (STATE.trips.length ? '<div class="grid">' + cards + "</div>" : emptyState("✈️", "No trips yet", "Add a trip and get a ready-made packing + prep checklist."));
}

function phaseBlock(trip, phase, title) {
  const items = trip[phase];
  const items_html = items.map((it, idx) =>
    '<li class="' + (it.checked ? "checked" : "") + '"><input type="checkbox" id="ti_' + trip.id + "_" + phase + "_" + idx + '" data-action="toggle-trip-item" data-id="' + trip.id + '" data-phase="' + phase + '" data-index="' + idx + '" ' + (it.checked ? "checked" : "") + ' /><label for="ti_' + trip.id + "_" + phase + "_" + idx + '">' + escapeHtml(it.text) + (it.dueDate ? ' <span class="muted small">(' + fmtRelativeDays(it.dueDate) + ")</span>" : "") + "</label></li>").join("");
  return '<div class="section-title">' + title + " (" + items.filter((i) => i.checked).length + "/" + items.length + ')</div><ul class="checklist">' + items_html + "</ul>" +
    '<button class="btn-sm btn-ghost" data-action="focus-mode" data-id="' + trip.id + '" data-phase="' + phase + '">🎯 Focus mode (one item at a time)</button>';
}

function renderTripDetail(t) {
  return '<div class="hr"></div>' +
    phaseBlock(t, "prep", "Before the trip") +
    '<div class="hr"></div>' + phaseBlock(t, "packing", "Packing list") +
    '<div class="hr"></div>' + phaseBlock(t, "departureDay", "Departure day") +
    '<div class="hr"></div>' +
    '<div class="row" style="flex-wrap:wrap">' +
      '<button class="btn-sm btn-danger" data-action="open-attention-modal" data-domain="trip" data-id="' + t.id + '">🚩 Flag needs attention</button>' +
      '<button class="btn-sm" data-action="sync-trip-calendar" data-id="' + t.id + '">📅 Sync prep dates to calendar</button>' +
      '<button class="btn-sm btn-ghost" data-action="delete-trip" data-id="' + t.id + '">Delete trip</button>' +
    "</div>";
}

function openAddTripModal() {
  openModal(
    '<h3>Add trip</h3><form data-form="trip">' +
    '<div class="field"><label>Trip name</label><input type="text" name="name" placeholder="e.g. Grandma’s for Thanksgiving" required /></div>' +
    '<div class="field"><label>Destination</label><input type="text" name="destination" /></div>' +
    '<div class="field-row"><div class="field"><label>Start date</label><input type="date" name="startDate" required /></div><div class="field"><label>End date</label><input type="date" name="endDate" /></div></div>' +
    '<p class="muted small">You’ll get a ready-made checklist for prep (haircut, weather check, meds refill...), packing, and departure day — fully editable.</p>' +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Create checklist</button></div></form>'
  );
}

function addTripForm(form) {
  const data = collectFormData(form);
  const startDate = data.startDate;
  const prep = DEFAULT_TRAVEL_TEMPLATE.prep.map((p) => ({ text: p.text, checked: false, dueDate: startDate ? addDaysISO(startDate, -p.leadDays) : null }));
  const packing = DEFAULT_TRAVEL_TEMPLATE.packing.map((text) => ({ text, checked: false }));
  const departureDay = DEFAULT_TRAVEL_TEMPLATE.departureDay.map((text) => ({ text, checked: false }));
  STATE.trips.push({ id: uid("trip"), name: data.name, destination: data.destination, startDate, endDate: data.endDate, prep, packing, departureDay, needsAttention: { flag: false, note: "" } });
  closeModal(); persist(); toast("Trip created");
}

function toggleTripOpen(id) { expandedIds.has(id) ? expandedIds.delete(id) : expandedIds.add(id); render(); }

function toggleTripItem(id, phase, index) {
  const t = findById(STATE.trips, id);
  t[phase][index].checked = !t[phase][index].checked;
  persist();
}

function deleteTrip(id) { STATE.trips = STATE.trips.filter((t) => t.id !== id); persist(); }

async function syncTripCalendar(id) {
  const t = findById(STATE.trips, id);
  for (const p of t.prep) {
    if (!p.dueDate) continue;
    await syncToCalendar({ title: t.name + ": " + p.text, description: "Adulting travel prep reminder", dateISO: p.dueDate, kind: "travel", refId: id + "_" + p.text });
  }
  toast("Prep dates synced to calendar");
}

// ---- Focus mode -------------------------------------------------------------
function startFocusMode(tripId, phase) {
  const t = findById(STATE.trips, tripId);
  const firstUnchecked = t[phase].findIndex((i) => !i.checked);
  focusState = { tripId, phase, index: firstUnchecked === -1 ? 0 : firstUnchecked };
  renderFocusModal();
}

function renderFocusModal() {
  if (!focusState) return;
  const t = findById(STATE.trips, focusState.tripId);
  const list = t[focusState.phase];
  if (focusState.index >= list.length) {
    openModal('<div class="reassure"><span class="icon">🎉</span> That’s everything on this list.</div><div class="modal-actions"><button class="btn-primary" data-action="close-modal">Done</button></div>');
    focusState = null;
    return;
  }
  const item = list[focusState.index];
  openModal(
    '<h3>Focus mode</h3><div class="focus-count">' + (focusState.index + 1) + " of " + list.length + "</div>" +
    '<div class="focus-item"><div class="item-text">' + escapeHtml(item.text) + "</div>" +
    '<label class="row" style="justify-content:center"><input type="checkbox" data-action="focus-toggle-current" style="width:22px;height:22px" ' + (item.checked ? "checked" : "") + " /> Done</label></div>" +
    '<div class="modal-actions"><button data-action="close-modal">Exit</button><button class="btn-primary" data-action="focus-next">Next</button></div>'
  );
}

function focusToggleCurrent() {
  const t = findById(STATE.trips, focusState.tripId);
  const item = t[focusState.phase][focusState.index];
  item.checked = !item.checked;
  saveState(STATE);
  renderFocusModal();
}

function focusNext() {
  focusState.index++;
  saveState(STATE);
  renderFocusModal();
}

// ===========================================================================
// SETTINGS
// ===========================================================================
function renderSettings() {
  const connected = Calendar.isConnected();
  const theme = STATE.settings.theme || "sunset";
  const iconStyle = STATE.settings.iconStyle || "colorful";
  const themes = [["sunset", "Sunset"], ["mono-light", "Light mono"], ["mono-dark", "Dark mono"], ["custom", "Custom color"]];

  return '<h1>Settings</h1><p class="page-sub">Household name, look & feel, Google Calendar, and your data.</p>' +

    '<div class="card" style="max-width:560px;margin-bottom:20px"><h2>Household</h2><form data-form="settings-general">' +
    '<div class="field"><label>Household name</label><input type="text" name="householdName" value="' + escapeHtml(STATE.settings.householdName) + '" /></div>' +
    '<button type="submit" class="btn-primary">Save</button></form></div>' +

    '<div class="card" style="max-width:560px;margin-bottom:20px"><h2>Theme</h2>' +
    '<p class="small muted">Sunset is the default. Status lights (green/amber/red) always stay colored, even on mono themes — that\'s what makes the board glanceable.</p>' +
    '<div class="theme-grid">' + themes.map(([key, label]) =>
      '<div class="theme-swatch' + (theme === key ? " active" : "") + '" data-action="set-theme" data-theme="' + key + '"><div class="preview ' + key + '"></div>' + label + "</div>"
    ).join("") + "</div>" +
    (theme === "custom" ? '<div class="field" style="margin-top:12px"><label>Pick a hue</label><input type="range" id="hueSlider" min="0" max="359" value="' + (STATE.settings.customHue != null ? STATE.settings.customHue : 18) + '" data-action="preview-hue" style="width:100%" /></div>' : "") +
    "</div>" +

    '<div class="card" style="max-width:560px;margin-bottom:20px"><h2>Icon style</h2>' +
    '<div class="icon-style-grid">' +
      '<div class="icon-style-option' + (iconStyle === "colorful" ? " active" : "") + '" data-action="set-icon-style" data-style="colorful"><div class="sample">🧹 🚗 ✈️</div>Colorful</div>' +
      '<div class="icon-style-option' + (iconStyle === "minimal" ? " active" : "") + '" data-action="set-icon-style" data-style="minimal"><div class="sample">' + icon("household", 22) + " " + icon("vehicles", 22) + " " + icon("travel", 22) + "</div>Minimal</div>" +
    "</div></div>" +

    '<div class="card" style="max-width:560px;margin-bottom:20px"><h2>Google Calendar</h2>' +
    '<p class="small muted">Adulting creates and reads events tagged as its own — it won’t touch anything else on your calendar. Requires a one-time Google Cloud setup; see README.md.</p>' +
    '<form data-form="settings-calendar">' +
    '<div class="field"><label>OAuth Client ID</label><input type="text" name="googleClientId" value="' + escapeHtml(STATE.settings.googleClientId) + '" placeholder="xxxxx.apps.googleusercontent.com" /></div>' +
    '<div class="field"><label>Calendar ID</label><input type="text" name="defaultCalendarId" value="' + escapeHtml(STATE.settings.defaultCalendarId || "primary") + '" placeholder="primary" /></div>' +
    '<div class="row"><button type="submit" class="btn-sm">Save</button>' +
    '<button type="button" class="btn-sm btn-primary" data-action="connect-calendar">' + (connected ? "Reconnect" : "Connect") + "</button>" +
    (connected ? '<button type="button" class="btn-sm btn-ghost" data-action="disconnect-calendar">Disconnect</button><span class="status-pill done">Connected</span>' : '<span class="status-pill none">Not connected</span>') +
    "</div></form>" +
    (connected ? '<div class="hr"></div><div class="row between"><div><strong class="small">Import from Calendar</strong><div class="muted small">Scans your calendar for bills, vehicle maintenance, and trips it can suggest.</div></div><button class="btn-sm" data-action="run-calendar-import">Scan now</button></div>' +
      '<label class="row small" style="margin-top:10px"><input type="checkbox" name="autoImportCalendar" data-action="toggle-auto-import" ' + (STATE.settings.autoImportCalendar ? "checked" : "") + ' style="width:18px;height:18px" /> Import matches automatically, without asking each time</label>'
      : "") +
    "</div>" +

    '<div class="card" style="max-width:560px;margin-bottom:20px"><h2>Blue Bonnet Assistant</h2>' +
    '<p class="small muted">The chat bubble in the corner is Blue Bonnet — an organizing assistant scoped to this app, with real advice for ADHD/autism-friendly systems. It runs through your own Cloudflare Worker proxy (so your Anthropic API key never sits in this file). It automatically hides while Board view is open.</p>' +
    '<form data-form="settings-bluebonnet"><div class="field"><label>Worker Proxy URL</label><input type="text" name="blueBonnetProxyUrl" value="' + escapeHtml(STATE.settings.blueBonnetProxyUrl || "") + '" placeholder="https://your-worker.your-subdomain.workers.dev" /></div>' +
    '<button type="submit" class="btn-sm">Save</button></form></div>' +

    '<div class="card" style="max-width:560px;margin-bottom:20px"><h2>Your data</h2>' +
    '<p class="small muted">Everything is stored locally in this browser. Back it up or move it to another device with export/import.</p>' +
    '<div class="row"><button class="btn-sm" data-action="export-data">Export backup (.json)</button>' +
    '<label class="btn-sm" style="display:inline-block"><input type="file" id="importFile" accept="application/json" style="display:none" /> Import backup</label>' +
    '<button class="btn-sm btn-danger" data-action="reset-data">Reset all data</button></div></div>' +

    '<div class="card" style="max-width:560px"><h2>About this app</h2>' +
    '<p class="small muted">Adulting is designed to be calm and predictable: consistent status colors everywhere, short checklists broken into small steps, and a clear "you’re caught up" state instead of nagging. Built with ADHD, autistic, and other neurodivergent users in mind.</p></div>';
}

function saveBlueBonnetSettings(form) {
  STATE.settings.blueBonnetProxyUrl = collectFormData(form).blueBonnetProxyUrl || "";
  persist();
  toast("Saved");
}

function setTheme(name) { STATE.settings.theme = name; persist(); }
function setCustomHue(val) { STATE.settings.customHue = Number(val); persist(); }
function setIconStyle(style) { STATE.settings.iconStyle = style; persist(); }
function toggleAutoImport(checked) { STATE.settings.autoImportCalendar = checked; persist(); }

function saveGeneralSettings(form) {
  STATE.settings.householdName = collectFormData(form).householdName;
  persist(); toast("Saved");
}

function saveCalendarSettings(form) {
  const data = collectFormData(form);
  STATE.settings.googleClientId = data.googleClientId;
  STATE.settings.defaultCalendarId = data.defaultCalendarId || "primary";
  saveState(STATE);
  Calendar.init(STATE.settings.googleClientId).catch((e) => console.warn(e.message));
  render();
  toast("Saved");
}

async function connectCalendar() {
  if (!STATE.settings.googleClientId) { toast("Enter your Google OAuth Client ID first."); return; }
  try {
    await Calendar.init(STATE.settings.googleClientId);
    await Calendar.connect();
    toast("Connected to Google Calendar");
    render();
  } catch (e) {
    console.error(e);
    toast("Couldn’t connect: " + e.message);
  }
}

function disconnectCalendar() { Calendar.disconnect(); render(); toast("Disconnected"); }

// ===========================================================================
// Onboarding — first-run Google sign-in, or skip and set up later
// ===========================================================================
function renderOnboarding() {
  if (STATE.settings.onboarded) { $("#onboardingRoot").innerHTML = ""; return; }
  const hasClientId = !!STATE.settings.googleClientId;
  $("#onboardingRoot").innerHTML =
    '<div class="onboarding-backdrop"><div class="onboarding-card">' +
    '<div class="onboarding-logo">' + logoMarkMarkup(64) + "</div>" +
    "<h1>Welcome to Adulting</h1>" +
    "<p>One calm place for budget, household chores, groceries, vehicle upkeep, and trip prep. Sign in with Google and Adulting can scan your Calendar to suggest bills, maintenance, and trips already on it — or skip and add things yourself.</p>" +
    '<form data-form="onboarding-calendar" class="stack">' +
    (hasClientId ? "" : '<div class="field"><label>Google OAuth Client ID</label><input type="text" name="googleClientId" placeholder="xxxxx.apps.googleusercontent.com" /><p class="muted small">One-time setup in your own free Google Cloud project — see README.md for exact steps.</p></div>') +
    '<div class="onboarding-actions">' +
    '<button type="submit" class="btn-primary">Sign in with Google</button>' +
    '<button type="button" class="btn-ghost" data-action="onboarding-skip">Skip for now</button>' +
    "</div></form>" +
    '<p class="muted small" style="margin-top:14px">You can connect anytime from Settings. Nothing is shared with anyone else — this app has no server.</p>' +
    "</div></div>";
}

function skipOnboarding() { STATE.settings.onboarded = true; saveState(STATE); $("#onboardingRoot").innerHTML = ""; render(); }

async function onboardingConnect() {
  const form = $('form[data-form="onboarding-calendar"]');
  const data = form ? collectFormData(form) : {};
  if (data.googleClientId) STATE.settings.googleClientId = data.googleClientId;
  if (!STATE.settings.googleClientId) { toast("Enter your Google OAuth Client ID first."); return; }
  saveState(STATE);
  try {
    await Calendar.init(STATE.settings.googleClientId);
    await Calendar.connect();
    STATE.settings.onboarded = true;
    persist();
    $("#onboardingRoot").innerHTML = "";
    toast("Connected! Scanning your calendar…");
    await runCalendarImport();
  } catch (e) {
    console.error(e);
    toast("Couldn’t connect: " + e.message);
  }
}

// ===========================================================================
// Calendar import — read-only scan of existing Google Calendar events,
// matched against keyword rules to suggest bills / vehicle tasks / trips.
// ===========================================================================
function detectMatches(title) {
  const t = (title || "").toLowerCase();
  const found = [];
  (CALENDAR_IMPORT_RULES.bill || []).forEach((rule) => { if (rule.match.some((k) => t.includes(k))) found.push({ kind: "bill", rule }); });
  (CALENDAR_IMPORT_RULES.vehicle || []).forEach((rule) => { if (rule.match.some((k) => t.includes(k))) found.push({ kind: "vehicle", rule }); });
  (CALENDAR_IMPORT_RULES.travel || []).forEach((rule) => { if (rule.match.some((k) => t.includes(k))) found.push({ kind: "travel", rule }); });
  return found[0] || null; // first match wins — good enough for keyword heuristics
}

async function runCalendarImport() {
  if (!Calendar.isConnected()) {
    const ok = await Calendar.ensureToken();
    if (!ok) return;
  }
  const calId = STATE.settings.defaultCalendarId || "primary";
  const timeMin = STATE.settings.lastCalendarImportAt ? addDaysISO(STATE.settings.lastCalendarImportAt.slice(0, 10), -7) : addDaysISO(todayISO(), -60);
  const timeMax = addDaysISO(todayISO(), 365);
  let events;
  try {
    events = await Calendar.listAllEvents(calId, timeMin, timeMax);
  } catch (e) {
    console.error(e);
    toast("Calendar scan failed: " + e.message);
    return;
  }

  const imported = new Set(STATE.settings.importedEventIds || []);
  const seenTitles = new Set();
  const candidates = [];
  events.forEach((ev) => {
    if (ev.isAdultingEvent || imported.has(ev.id) || !ev.date) return;
    const m = detectMatches(ev.title);
    if (!m) return;
    const dedupeKey = m.kind + "::" + ev.title.toLowerCase().trim();
    if (seenTitles.has(dedupeKey)) return;
    // skip if something with basically this name already exists
    if (m.kind === "bill" && STATE.bills.some((b) => b.name.toLowerCase() === ev.title.toLowerCase())) return;
    if (m.kind === "travel" && STATE.trips.some((tr) => tr.name.toLowerCase() === ev.title.toLowerCase())) return;
    seenTitles.add(dedupeKey);
    candidates.push({ eventId: ev.id, title: ev.title, date: ev.date, kind: m.kind, rule: m.rule });
  });

  STATE.settings.lastCalendarImportAt = new Date().toISOString();
  saveState(STATE);

  if (!candidates.length) { toast("Calendar scan complete — nothing new to import."); return; }

  if (STATE.settings.autoImportCalendar) {
    candidates.forEach((c) => createFromImportCandidate(c));
    STATE.settings.importedEventIds = Array.from(new Set([...(STATE.settings.importedEventIds || []), ...candidates.map((c) => c.eventId)]));
    persist();
    toast("Auto-imported " + candidates.length + " item(s) from your calendar.");
  } else {
    pendingImportCandidates = candidates;
    toast(candidates.length + " item(s) found on your calendar — Settings → Import from Calendar to review.");
  }
}

function createFromImportCandidate(c) {
  if (c.kind === "bill") {
    const day = Number(c.date.slice(8, 10));
    STATE.bills.push({ id: uid("bill"), name: c.title, amount: 0, dueDay: day, type: c.rule.type || "regular", category: c.rule.category || "Other Regular", recurring: true, paidPeriods: {}, calendarEventId: null });
  } else if (c.kind === "vehicle") {
    const v = STATE.vehicles[0];
    if (!v) return;
    v.tasks = v.tasks || [];
    v.tasks.push({ id: uid("vtask"), title: c.rule.title, intervalDays: 182, intervalMiles: null, lastDoneDate: null, lastDoneMileage: null, dueDate: c.date, dueMileage: null, needsAttention: { flag: false, note: "" }, calendarEventId: null });
  } else if (c.kind === "travel") {
    const prep = DEFAULT_TRAVEL_TEMPLATE.prep.map((p) => ({ text: p.text, checked: false, dueDate: addDaysISO(c.date, -p.leadDays) }));
    const packing = DEFAULT_TRAVEL_TEMPLATE.packing.map((text) => ({ text, checked: false }));
    const departureDay = DEFAULT_TRAVEL_TEMPLATE.departureDay.map((text) => ({ text, checked: false }));
    STATE.trips.push({ id: uid("trip"), name: c.title, destination: "", startDate: c.date, endDate: "", prep, packing, departureDay, needsAttention: { flag: false, note: "" } });
  }
}

function openImportReviewModal() {
  if (!pendingImportCandidates.length) { toast("No pending calendar matches. Try \"Scan now\" first."); return; }
  const groups = { bill: "Bills", vehicle: "Vehicle maintenance", travel: "Trips" };
  const rows = pendingImportCandidates.map((c, i) =>
    '<label class="row" style="padding:6px 0;border-bottom:1px solid var(--border)"><input type="checkbox" name="import_' + i + '" checked style="width:18px;height:18px" />' +
    "<span style=\"flex:1\">" + escapeHtml(c.title) + '<div class="muted small">' + groups[c.kind] + " · " + fmtDate(c.date) + "</div></span></label>"
  ).join("");
  openModal(
    '<h3>Review calendar import</h3><p class="muted small">Uncheck anything that\'s not actually a bill, maintenance item, or trip. You can edit details after importing.</p>' +
    '<form data-form="import-review">' + rows + '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Import selected</button></div></form>'
  );
}

function saveImportReviewForm(form) {
  const data = collectFormData(form);
  let count = 0;
  const importedIds = [];
  pendingImportCandidates.forEach((c, i) => {
    if (data["import_" + i]) { createFromImportCandidate(c); importedIds.push(c.eventId); count++; }
  });
  STATE.settings.importedEventIds = Array.from(new Set([...(STATE.settings.importedEventIds || []), ...pendingImportCandidates.map((c) => c.eventId)]));
  pendingImportCandidates = [];
  closeModal();
  persist();
  toast("Imported " + count + " item(s).");
}

function exportData() {
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "adulting-backup-" + todayISO() + ".json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function importDataFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      STATE = Object.assign(defaultState(), parsed);
      saveState(STATE);
      render();
      toast("Backup imported");
    } catch (e) { toast("That file doesn’t look like a valid backup."); }
  };
  reader.readAsText(file);
}

function resetAllData() {
  if (!confirm("This clears everything in Adulting on this device. This can’t be undone. Continue?")) return;
  STATE = defaultState();
  saveState(STATE);
  render();
  toast("All data cleared");
}

// ===========================================================================
// Shared bits
// ===========================================================================
function emptyState(iconChar, title, sub) {
  return '<div class="empty-state"><div class="icon">' + iconChar + "</div><div style=\"font-weight:700;color:var(--text)\">" + escapeHtml(title) + "</div><div class=\"small\">" + escapeHtml(sub) + "</div></div>";
}

// ===========================================================================
// Event delegation
// ===========================================================================
function handleAction(el, e) {
  const action = el.dataset.action;
  const id = el.dataset.id;
  switch (action) {
    case "goto-tab": switchTab(el.dataset.tab); break;
    case "open-bill-modal": openBillModal(id || null); break;
    case "delete-bill": if (confirm("Delete this bill?")) deleteBill(id); break;
    case "sync-bill-calendar": syncBillCalendar(id); break;
    case "sync-all-bills-calendar": syncAllBillsCalendar(); break;
    case "open-add-asset-modal": openAddAssetModal(); break;
    case "toggle-asset-open": toggleAssetOpen(id); break;
    case "remove-asset-item": removeAssetItem(id, Number(el.dataset.index)); break;
    case "asset-signal-up": setAssetSignalUp(id, el.checked); break;
    case "delete-asset": if (confirm("Delete this area?")) deleteAsset(id); break;
    case "sync-asset-calendar": syncAssetCalendar(id); break;
    case "open-attention-modal": openAttentionModal(el.dataset.domain, id, el.dataset.task); break;
    case "clear-attention": clearAttention(el.dataset.domain, id, el.dataset.task); break;
    case "open-add-grocery-modal": openAddGroceryModal(); break;
    case "mark-grocery-used": markGroceryUsed(id); break;
    case "mark-grocery-thrown": markGroceryThrown(id); break;
    case "delete-grocery": deleteGrocery(id); break;
    case "open-add-vehicle-modal": openAddVehicleModal(); break;
    case "toggle-vehicle-open": toggleVehicleOpen(id); break;
    case "complete-vehicle-task": completeVehicleTask(id, el.dataset.task); break;
    case "delete-vehicle": if (confirm("Delete this vehicle?")) deleteVehicle(id); break;
    case "sync-vehicle-task-calendar": syncVehicleTaskCalendar(id, el.dataset.task); break;
    case "open-add-trip-modal": openAddTripModal(); break;
    case "toggle-trip-open": toggleTripOpen(id); break;
    case "delete-trip": if (confirm("Delete this trip?")) deleteTrip(id); break;
    case "sync-trip-calendar": syncTripCalendar(id); break;
    case "focus-mode": startFocusMode(id, el.dataset.phase); break;
    case "focus-next": focusNext(); break;
    case "focus-toggle-current": break; // handled on change event
    case "connect-calendar": connectCalendar(); break;
    case "disconnect-calendar": disconnectCalendar(); break;
    case "export-data": exportData(); break;
    case "reset-data": resetAllData(); break;
    case "close-modal": closeModal(); break;
    case "close-modal-backdrop": if (e.target === el) closeModal(); break;
    case "open-board-mode": openBoardMode(true); break;
    case "exit-board-mode": exitBoardMode(); break;
    case "set-theme": setTheme(el.dataset.theme); break;
    case "set-icon-style": setIconStyle(el.dataset.style); break;
    case "run-calendar-import": runCalendarImport(); break;
    case "open-import-review": openImportReviewModal(); break;
    case "onboarding-skip": skipOnboarding(); break;
    case "onboarding-connect": onboardingConnect(); break;
  }
}

function handleChange(el) {
  const action = el.dataset.action;
  const id = el.dataset.id;
  switch (action) {
    case "toggle-paid": togglePaid(id); break;
    case "toggle-asset-item": toggleAssetItem(id, Number(el.dataset.index)); break;
    case "asset-signal-up": setAssetSignalUp(id, el.checked); break;
    case "toggle-trip-item": toggleTripItem(id, el.dataset.phase, Number(el.dataset.index)); break;
    case "focus-toggle-current": focusToggleCurrent(); break;
    case "toggle-auto-import": toggleAutoImport(el.checked); break;
    case "preview-hue": setCustomHue(el.value); break;
  }
}

function handleSubmit(form, e) {
  e.preventDefault();
  const type = form.dataset.form;
  switch (type) {
    case "bill": saveBillForm(form); break;
    case "asset-template": addAssetFromForm(form); break;
    case "add-asset-item": addAssetItem(form); form.reset(); break;
    case "attention": saveAttentionForm(form); break;
    case "grocery": addGroceryForm(form); break;
    case "vehicle": addVehicleForm(form); break;
    case "update-mileage": updateVehicleMileage(form); break;
    case "trip": addTripForm(form); break;
    case "settings-general": saveGeneralSettings(form); break;
    case "settings-calendar": saveCalendarSettings(form); break;
    case "onboarding-calendar": onboardingConnect(); break;
    case "import-review": saveImportReviewForm(form); break;
    case "settings-bluebonnet": saveBlueBonnetSettings(form); break;
  }
}

function switchTab(tab) { currentTab = tab; expandedIds.clear(); render(); }

function wireEvents() {
  document.body.addEventListener("click", (e) => {
    const navBtn = e.target.closest(".nav-item");
    if (navBtn) { switchTab(navBtn.dataset.tab); return; }
    const actionEl = e.target.closest("[data-action]");
    if (actionEl) handleAction(actionEl, e);
  });
  document.body.addEventListener("change", (e) => {
    const actionEl = e.target.closest("[data-action]");
    if (actionEl) handleChange(actionEl);
    if (e.target.id === "importFile" && e.target.files[0]) importDataFile(e.target.files[0]);
  });
  // Live hue preview while dragging, ahead of the "change" event that persists it
  document.body.addEventListener("input", (e) => {
    if (e.target.id === "hueSlider") {
      document.documentElement.style.setProperty("--accent-h", e.target.value);
      const banner = document.getElementById("heroBanner");
      if (banner) banner.innerHTML = heroBannerMarkup();
    }
  });
  document.body.addEventListener("submit", (e) => {
    const form = e.target.closest("form[data-form]");
    if (form) handleSubmit(form, e);
  });
}

// ===========================================================================
// Init
// ===========================================================================
function init() {
  refreshAll();
  applyTheme();
  wireEvents();
  render();
  renderOnboarding();

  if (STATE.settings.googleClientId) {
    Calendar.init(STATE.settings.googleClientId)
      .then(() => Calendar.ensureToken())
      .then((ok) => { if (ok) runCalendarImport(); })
      .catch(() => {});
  }
  // Keep ingesting new calendar changes automatically while the tab is open
  setInterval(() => { if (Calendar.isConnected()) runCalendarImport(); }, 15 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", init);
