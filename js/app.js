/* ==========================================================================
   Adulting — application logic & rendering
   Plain JS, event delegation, no build step. STATE is the single source of
   truth; every mutation calls persist() which saves to localStorage and
   re-renders the current tab.
   ========================================================================== */

// A ?demo (or ?demo=1) URL flag loads a fully populated sample household
// entirely in memory — nothing here ever touches real localStorage, so it's
// safe to share/reopen without risking anyone's actual saved data. See
// buildDemoState() near the bottom of this file for the seed data itself.
const DEMO_MODE = /(^|[?&])demo(=|&|$)/.test(location.search);
let STATE = DEMO_MODE ? buildDemoState() : loadState();
let currentTab = "dashboard";
let expandedIds = new Set(); // UI-only: which cards are expanded
let focusState = null; // { tripId, phase, index } — UI-only
let boardMode = location.hash === "#board"; // UI-only: standalone status-light board
let pendingImportCandidates = []; // UI-only: last calendar-scan results awaiting review
let pendingVehicleDraft = null; // UI-only: vehicle basics collected before the maintenance-date review step

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

// Small text helpers so "daily" reads naturally next to "weekly"/"monthly"
// in the couple of places recurrence type gets turned into a sentence.
function recurrenceAdverb(type) {
  return type === "daily" ? "daily" : type === "monthly" ? "monthly" : "weekly";
}
function recurrenceCadencePhrase(type) {
  return type === "daily" ? "for today" : type === "monthly" ? "for this month" : "for this week";
}

let driveSyncTimer = null;

function persist() {
  STATE.updatedAt = Date.now();
  if (!DEMO_MODE) saveState(STATE);
  render();
  scheduleDrivePush();
}

// Cross-device sync: after any change, push the updated state to the
// user's Google Drive (their own hidden per-app storage — see
// drivesync.js), debounced so a burst of quick edits doesn't fire a
// network request per click. No-ops entirely if Drive isn't
// available/connected, or in demo mode.
function scheduleDrivePush() {
  if (DEMO_MODE) return;
  if (typeof DriveSync === "undefined" || !DriveSync.available()) return;
  clearTimeout(driveSyncTimer);
  driveSyncTimer = setTimeout(() => {
    DriveSync.push(STATE).catch((e) => console.warn("Drive sync push failed:", e));
  }, 1500);
}

// Called right after a successful Google connect (and once on load if a
// silent token refresh works). Compares Drive's copy against the local
// one by updatedAt and takes whichever is newer — see drivesync.js header
// comment for the exact (last-write-wins) sync model.
// opts.surfaceErrors = true makes this throw (instead of just logging) so a
// caller that has a visible toast/button can tell the user what actually
// happened, instead of the old behavior where every failure was swallowed
// and callers assumed success no matter what.
async function syncFromDriveIfNewer(opts) {
  opts = opts || {};
  if (DEMO_MODE) return { pulled: false };
  if (typeof DriveSync === "undefined" || !DriveSync.available()) {
    const e = new Error("Not connected to Google — connect first.");
    if (opts.surfaceErrors) throw e;
    return { pulled: false };
  }
  try {
    const remote = await DriveSync.pull();
    if (remote && typeof remote === "object" && (remote.updatedAt || 0) > (STATE.updatedAt || 0)) {
      STATE = remote;
      window.STATE = STATE;
      saveState(STATE);
      render();
      toast("Loaded your latest data from Google Drive");
      return { pulled: true };
    } else {
      await DriveSync.push(STATE);
      return { pulled: false };
    }
  } catch (e) {
    console.warn("Drive sync failed:", e);
    if (opts.surfaceErrors) throw friendlyDriveError(e);
    return { pulled: false, error: e };
  }
}

// Drive's raw "403"/"404" text isn't useful to a non-technical user — turn
// the couple of failure modes we actually expect into plain language.
function friendlyDriveError(e) {
  const msg = String((e && e.message) || e);
  if (msg.includes("403")) {
    return new Error("Google didn't grant Drive access on this connection. Click Disconnect, then Connect again and approve the full permissions screen (it now asks for Drive access too).");
  }
  if (msg.includes("401")) {
    return new Error("Your Google sign-in expired. Click Reconnect.");
  }
  return new Error("Drive sync failed (" + msg + "). Try Disconnect then Connect again.");
}

function toast(msg) {
  const root = $("#toastRoot");
  root.innerHTML = '<div class="toast">' + escapeHtml(msg) + "</div>";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { root.innerHTML = ""; }, 2600);
}

// ---------------------------------------------------------------------------
// Encouragement bubbles — instant, local, no API call. Only ever fired on a
// real positive (never for anything overdue/unfinished), rate-limited so
// they feel noticed rather than spammy, and hidden entirely in Board Mode.
// ---------------------------------------------------------------------------
let lastPraiseAt = 0;
function showPraise(category) {
  if (STATE.settings.blueBonnetPraise === false) return;
  if (boardMode) return;
  const now = Date.now();
  if (now - lastPraiseAt < 45000) return; // don't stack praise within 45s
  lastPraiseAt = now;
  const pool = (typeof PRAISE_PHRASES !== "undefined" && PRAISE_PHRASES[category]) || [];
  if (!pool.length) return;
  const msg = pool[Math.floor(Math.random() * pool.length)];
  const root = $("#praiseRoot");
  const el = document.createElement("div");
  el.className = "praise-toast";
  el.innerHTML = '<span class="sparkle">✨</span><span>' + escapeHtml(msg) + "</span>";
  root.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 4200);
  showNotification("Nice work", msg);
}

// ---------------------------------------------------------------------------
// Browser notifications — lightweight, tab-must-be-open version (no service
// worker / push backend). Only ever fires for a real positive (praise) or a
// Blue Bonnet check-in, and only when this tab isn't the visible/focused one,
// so it doesn't double up with the on-screen praise bubble or chat message.
// ---------------------------------------------------------------------------
function showNotification(title, body) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (STATE.settings.notificationsEnabled === false) return;
  if (typeof document !== "undefined" && !document.hidden) return;
  try {
    const n = new Notification(title, { body: body, tag: "adulting-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-") });
    n.onclick = () => { window.focus(); n.close(); };
  } catch (e) {
    console.warn("Notification failed:", e);
  }
}
window.showNotification = showNotification;

function enableNotifications() {
  if (typeof Notification === "undefined") {
    toast("Notifications aren't supported in this browser.");
    return;
  }
  if (Notification.permission === "granted") {
    STATE.settings.notificationsEnabled = true;
    persist();
    toast("Notifications are already on.");
    return;
  }
  if (Notification.permission === "denied") {
    toast("Notifications are blocked — allow them in your browser's site settings.");
    return;
  }
  Notification.requestPermission().then((perm) => {
    STATE.settings.notificationsEnabled = perm === "granted";
    persist();
    toast(perm === "granted" ? "Notifications enabled" : "No worries — you can turn this on later.");
  });
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
  if (!DEMO_MODE) saveState(STATE);
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

/* Visible build stamp.

   "Did the upload actually take?" came up over and over, and every answer
   required digging through GitHub's API or a CDN that serves stale copies.
   Showing the version in the app itself makes it a one-second glance instead.
   Bump this whenever you ship a change. */
const APP_VERSION = "2026.08.16b — gateway + brain building mode";

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
    // Same-tab, no window.open() here on purpose — this sits in the nav
    // alongside real tabs, so it should switch instantly like they do
    // instead of depending on the browser's pop-up permission (which the
    // Dashboard's "Open full-screen board view" button below still uses,
    // for people who deliberately want it on a second screen/tablet).
    '<div style="margin-top:auto;padding-top:10px"><button class="nav-item" data-action="enter-board-mode">' + icon("board", 17) + " Board view</button>" +
      '<div class="muted" style="font-size:10px;opacity:0.55;padding:8px 10px 2px;line-height:1.3" title="App version — if this doesn\'t match what you just uploaded, the browser is still running an old copy">v' + APP_VERSION + "</div></div>";
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

  const gentle = needsGentleWelcome(STATE);
  const one = pickOneThing(STATE);
  const done = lifetimeDone(STATE);

  /* Coming back after a few days away used to open on a wall of red. That
     feeling is why people stop opening the app at all. When someone's been
     gone, lead with a welcome and at most three things — the full list is
     still right there underneath if they want it. */
  const welcome = gentle
    ? '<div class="card" style="border-left:4px solid var(--primary,#5B9BB8);margin-bottom:16px">' +
        "<strong>" + escapeHtml(rotatingLine(RETURN_LINES)) + "</strong>" +
        '<p class="muted small" style="margin:6px 0 10px">Nothing expired that can\'t be sorted, and nothing reset your progress. Here\'s what moved while you were away:</p>' +
        (whileYouWereAway(STATE).length
          ? "<ul style=\"margin:0 0 4px;padding-left:18px\">" +
            whileYouWereAway(STATE).map((i) => "<li>" + i.icon + " " + escapeHtml(i.text) + "</li>").join("") + "</ul>"
          : '<div class="muted small">Nothing at all, actually.</div>') +
      "</div>"
    : "";

  const startHere = '<div class="card" style="margin-bottom:16px;background:linear-gradient(135deg,var(--surface,#fff),var(--accent-soft,#f4f8fb))">' +
      '<div class="muted small">Start here</div>' +
      '<div style="font-size:19px;font-weight:700;margin:2px 0 4px">' + escapeHtml(one.label) + "</div>" +
      '<div class="muted small">' + escapeHtml(one.why) + "</div>" +
      (one.kind !== "none"
        ? '<button class="btn-sm" style="margin-top:10px" data-tab="' + one.tab + '">Take me there</button>'
        : "") +
    "</div>";

  const wins = quickWins(STATE, 3);
  const quick = wins.length
    ? '<div class="card" style="margin-bottom:16px"><div class="muted small" style="margin-bottom:6px">Under two minutes each</div>' +
      wins.map((w) => '<div class="row between" style="padding:3px 0"><span>' + escapeHtml(w.label) +
        ' <span class="muted small">' + escapeHtml(w.sub) + "</span></span></div>").join("") + "</div>"
    : "";

  return '<h1>Dashboard</h1>' +
    '<p class="page-sub">' + escapeHtml(rotatingLine(WELCOME_LINES)) + "</p>" +
    welcome + startHere + quick +
    (done > 0 ? '<div class="muted small" style="margin:-6px 0 14px">' + done + " thing(s) done in here so far. That number never goes down.</div>" : "") +
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
    (attentionItems.length
      ? '<div class="section-title" style="margin-top:22px">When you have a minute (' + attentionItems.length + ')</div><div class="attention-banner"><ul>' +
        attentionItems.map((i) => "<li><strong>" + escapeHtml(i.label) + "</strong>" + (i.note ? " — " + escapeHtml(i.note) : "") + "</li>").join("") +
        "</ul></div>"
      : '<div class="reassure" style="margin-top:22px"><span class="icon">✅</span> Nothing is flagged right now. You’re caught up.</div>') +
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
      sub: a.recurrence.type === "daily" ? "Resets daily" : a.recurrence.type === "weekly" ? "Resets weekly" : "Resets monthly",
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
  // BNPL installments land in the same "what's coming" list as bills — they're
  // money leaving the account on a date, which is what this list is for.
  allUpcomingBnplCharges(STATE, 7).forEach((c) => {
    items.push({ icon: "🧾", label: c.merchant + " (" + fmtMoney(c.amount) + ", " + bnplServiceName(c.service) + ")", when: fmtRelativeDays(c.dueDate) });
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

  return '<h1>Budget</h1>' + renderBudgetPlan() +
    '<p class="page-sub">Regular = fixed necessities. Discretionary = spending by choice. Keeping them separate makes trade-offs visible.</p>' +
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
      : emptyState("💰", "No bills yet", "Add rent, utilities, subscriptions — anything that repeats each month.")) +
    renderBnplSection() +
    renderStatementSection();
}

// ---------------------------------------------------------------------------
// Buy now, pay later (Affirm / Klarna / Afterpay / PayPal Pay in 4)
//
// These services have no public personal API, so the app cannot log in and
// read balances — and putting banking credentials in a static site hosted on
// GitHub is not a trade worth making. What it CAN do is better than it sounds:
// a payment plan is a fixed schedule, so once the terms are recorded once, the
// app computes every future charge with no login at all.
//
// Blue Bonnet does the data entry: paste a confirmation email or plan page and
// it fills in merchant, amount, and schedule for you.
// ---------------------------------------------------------------------------
const BNPL_SERVICES = [
  { id: "affirm",   name: "Affirm",   url: "https://www.affirm.com/dashboard",     emoji: "🟣" },
  { id: "klarna",   name: "Klarna",   url: "https://app.klarna.com/",              emoji: "🩷" },
  { id: "afterpay", name: "Afterpay", url: "https://portal.afterpay.com/",         emoji: "🌿" },
  { id: "paypal4",  name: "PayPal",   url: "https://www.paypal.com/myaccount/pay-later/", emoji: "🔵" },
];

function bnplServiceName(id) {
  const s = BNPL_SERVICES.find((x) => x.id === id);
  return s ? s.name : (id || "Other");
}

function renderBnplSection() {
  const plans = STATE.bnplPlans || [];
  const upcoming = allUpcomingBnplCharges(STATE, 60);
  const totalOwed = plans.reduce((s, p) => s + (Number(p.paymentAmount) || 0) * (Number(p.paymentsRemaining) || 0), 0);
  const next30 = allUpcomingBnplCharges(STATE, 30).reduce((s, c) => s + c.amount, 0);

  function planRow(p) {
    const next = bnplUpcomingCharges(p)[0];
    const remaining = (Number(p.paymentAmount) || 0) * (Number(p.paymentsRemaining) || 0);
    return "<tr>" +
      "<td><strong>" + escapeHtml(p.merchant || "(no merchant)") + "</strong><div class=\"muted small\">" + escapeHtml(bnplServiceName(p.service)) + "</div></td>" +
      "<td>" + fmtMoney(p.paymentAmount) + "<div class=\"muted small\">every " + (Number(p.everyDays) || 14) + " days</div></td>" +
      "<td>" + (Number(p.paymentsRemaining) || 0) + " left<div class=\"muted small\">" + fmtMoney(remaining) + " total</div></td>" +
      "<td>" + (next ? fmtDate(next.dueDate) + '<div class="muted small">' + fmtRelativeDays(next.dueDate) + "</div>" : '<span class="muted small">Paid off</span>') + "</td>" +
      "<td><div class=\"row\">" +
        '<button class="btn-sm" data-action="bnpl-mark-paid" data-id="' + p.id + '" title="Record that this payment went through">✓ Paid</button>' +
        '<button class="btn-sm" data-action="open-bnpl-modal" data-id="' + p.id + '">Edit</button>' +
        '<button class="btn-sm btn-danger" data-action="delete-bnpl" data-id="' + p.id + '">Delete</button>' +
      "</div></td></tr>";
  }

  return '<h2 style="margin:28px 0 6px">Payment plans</h2>' +
    '<p class="page-sub">Affirm, Klarna and the rest don\'t offer a way for apps to sign in and read your account, so this tracks the schedule instead — which works out the same, since the payments are fixed. Paste a confirmation email into Blue Bonnet and it\'ll fill this in for you.</p>' +
    '<div class="row" style="flex-wrap:wrap;margin-bottom:14px">' +
      BNPL_SERVICES.map((s) =>
        '<a class="btn-sm" href="' + s.url + '" target="_blank" rel="noopener noreferrer">' + s.emoji + " " + s.name + " ↗</a>"
      ).join("") +
    "</div>" +
    (plans.length
      ? '<div class="grid" style="margin-bottom:14px">' +
          '<div class="card"><div class="muted small">Due in next 30 days</div><div style="font-size:22px;font-weight:800">' + fmtMoney(next30) + "</div></div>" +
          '<div class="card"><div class="muted small">Total still owed</div><div style="font-size:22px;font-weight:800">' + fmtMoney(totalOwed) + "</div></div>" +
          '<div class="card"><div class="muted small">Active plans</div><div style="font-size:22px;font-weight:800">' + plans.filter((p) => Number(p.paymentsRemaining) > 0).length + "</div></div>" +
        "</div>"
      : "") +
    '<div class="row between" style="margin-bottom:10px">' +
      '<div class="muted small">' + (plans.length ? plans.length + " plan(s)" : "") + "</div>" +
      '<button class="btn-primary" data-action="open-bnpl-modal" data-id="">+ Add payment plan</button>' +
    "</div>" +
    (plans.length
      ? '<div class="card"><table><thead><tr><th>Merchant</th><th>Payment</th><th>Remaining</th><th>Next due</th><th></th></tr></thead><tbody>' +
        plans.map(planRow).join("") + "</tbody></table></div>" +
        (upcoming.length
          ? '<div class="card" style="margin-top:10px"><div class="muted small" style="margin-bottom:6px">Upcoming charges (next 60 days)</div>' +
            upcoming.map((c) => '<div class="row between" style="padding:4px 0"><div>' + escapeHtml(c.merchant) + ' <span class="muted small">· ' + escapeHtml(bnplServiceName(c.service)) + "</span></div>" +
              "<div>" + fmtMoney(c.amount) + ' <span class="muted small">' + fmtDate(c.dueDate) + "</span></div></div>").join("") +
            "</div>"
          : "")
      : emptyState("🧾", "No payment plans yet", "Add an Affirm or Klarna plan and the app will work out every upcoming charge for you."));
}

// ---------------------------------------------------------------------------
// Bank statement upload
//
// Everything is parsed in the browser — the statement never leaves this device
// except as part of your own Drive sync. The FILE itself is never stored: only
// the parsed rows, with anything that looks like a full account or card number
// reduced to its last 4 digits first.
// ---------------------------------------------------------------------------
function renderStatementSection() {
  const txns = STATE.statementTxns || [];
  const imports = STATE.statementImports || [];
  const recent = txns.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 25);
  const spent = txns.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const inflow = txns.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);

  return '<h2 style="margin:28px 0 6px">Statements</h2>' +
    '<p class="page-sub">Upload a statement PDF or CSV straight from your bank. It\'s read here in your browser — the file itself is never saved, only the transactions, and account numbers are masked to the last 4 digits.</p>' +
    '<div class="card" style="margin-bottom:12px">' +
      '<div class="row" style="flex-wrap:wrap;gap:10px;margin-bottom:10px">' +
        '<label class="btn-primary" style="cursor:pointer">📄 Upload statement<input type="file" accept=".pdf,.csv,.txt,.tsv" id="statementFile" style="display:none" /></label>' +
        /* Always shown, even with nothing imported. Hiding it made "is the new
           version live?" impossible to answer at a glance — the button being
           absent looked identical to the update not landing. It explains
           itself instead when there's no data yet. */
        '<button class="btn-primary" data-action="charge-tracker" style="background:#7c3fd6">🔍 Charge Tracker</button>' +
        '<button class="btn-sm" data-action="open-statement-paste">📋 Paste text instead</button>' +
        (txns.length ? '<button class="btn-sm btn-danger" data-action="clear-statement-txns">Clear all transactions</button>' : "") +
      "</div>" +
      '<div class="hint muted small">PDF and CSV both work. Scanned/photographed statements have no text to read — use your bank\'s CSV export for those. If the layout is unusual, Blue Bonnet can read a pasted statement and log it for you.</div>' +
    "</div>" +
    (txns.length ? renderStatementTabs(txns, imports, recent, spent, inflow)
      : emptyState("🏦", "No statement data yet", "Upload a statement PDF or CSV and the app will pick out what's recurring."));
}

/* Rocket-Money-style breakdown: every transaction sorted into a category,
   categories ordered by how much they cost, each one expandable to the
   individual charges with real merchant names. */
function renderCategoryBreakdown(txns) {
  const out = txns.filter((t) => Number(t.amount) < 0);
  const inflow = txns.filter((t) => Number(t.amount) > 0);
  if (!out.length) return emptyState("📊", "Nothing to break down yet", "Import a statement first.");

  const groups = new Map();
  out.forEach((t) => {
    const c = t.category || "Other";
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c).push(t);
  });

  const totalOut = out.reduce((s, t) => s + Math.abs(t.amount), 0);
  const sorted = Array.from(groups.entries())
    .map(([name, list]) => ({
      name, list,
      total: list.reduce((s, t) => s + Math.abs(t.amount), 0),
    }))
    .sort((a, b) => b.total - a.total);

  const uncategorised = out.filter((t) => !t.category).length;

  return '<div class="grid" style="margin-bottom:14px">' +
      '<div class="card"><div class="muted small">Money out</div><div style="font-size:22px;font-weight:800">' + fmtMoney(totalOut) + "</div></div>" +
      '<div class="card"><div class="muted small">Money in</div><div style="font-size:22px;font-weight:800">' + fmtMoney(inflow.reduce((s, t) => s + t.amount, 0)) + "</div></div>" +
      '<div class="card"><div class="muted small">Transactions</div><div style="font-size:22px;font-weight:800">' + txns.length + "</div></div>" +
    "</div>" +
    (uncategorised ? '<div class="muted small" style="margin-bottom:8px">' + uncategorised + " transaction(s) have no category — they were read by the offline parser rather than Blue Bonnet.</div>" : "") +
    sorted.map((g) => {
      const pct = totalOut ? Math.round((g.total / totalOut) * 100) : 0;
      const open = expandedIds.has("cat_" + g.name);
      return '<div class="card" style="margin-bottom:8px">' +
        '<div class="row between" style="cursor:pointer" data-action="toggle-category" data-id="' + escapeHtml(g.name) + '">' +
          "<div><strong>" + escapeHtml(g.name) + '</strong> <span class="muted small">· ' + g.list.length + " charge(s)</span>" +
            '<div style="height:6px;background:var(--border,#e1e6ee);border-radius:3px;margin-top:6px;width:220px;max-width:50vw">' +
              '<div style="height:6px;width:' + pct + '%;background:var(--primary-dark,#3a5ba0);border-radius:3px"></div></div>' +
          "</div>" +
          '<div style="text-align:right"><strong>' + fmtMoney(g.total) + '</strong><div class="muted small">' + pct + "% · " + (open ? "hide" : "show") + "</div></div>" +
        "</div>" +
        (open
          ? '<table style="margin-top:10px"><tbody>' +
            g.list.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((t) =>
              '<tr><td class="muted small" style="white-space:nowrap">' + escapeHtml(t.date) + "</td>" +
              "<td><strong>" + escapeHtml(t.description || "") + "</strong>" +
              (t.raw && t.raw !== t.description ? '<div class="muted small">' + escapeHtml(t.raw) + "</div>" : "") + "</td>" +
              '<td style="text-align:right;white-space:nowrap">' + fmtMoney(Math.abs(t.amount)) + "</td></tr>").join("") +
            "</tbody></table>"
          : "") +
      "</div>";
    }).join("");
}

/* The point of importing a statement isn't to re-read the statement — it's to
   see what keeps coming out and when the next one lands. So Recurring is the
   default view and the raw rows sit behind a tab for when you need them. */
let statementView = "categories"; // categories | recurring | all

function renderStatementTabs(txns, imports, recent, spent, inflow) {
  const recurring = detectRecurring(txns);
  const monthlyish = recurring.filter((r) => r.regular)
    .reduce((s, r) => s + (r.typical * (30 / Math.max(1, r.interval))), 0);

  const tabs =
    '<div class="row" style="gap:6px;margin-bottom:12px">' +
      '<button class="btn-sm' + (statementView === "categories" ? " btn-primary" : "") + '" data-action="statement-view" data-id="categories">📊 Categories</button>' +
      '<button class="btn-sm' + (statementView === "recurring" ? " btn-primary" : "") + '" data-action="statement-view" data-id="recurring">🔁 Recurring (' + recurring.length + ")</button>" +
      '<button class="btn-sm' + (statementView === "all" ? " btn-primary" : "") + '" data-action="statement-view" data-id="all">All transactions (' + txns.length + ")</button>" +
    "</div>";

  if (statementView === "categories") return tabs + renderCategoryBreakdown(txns);

  if (statementView === "all") {
    return tabs +
      '<div class="grid" style="margin-bottom:12px">' +
        '<div class="card"><div class="muted small">Money out</div><div style="font-size:22px;font-weight:800">' + fmtMoney(spent) + "</div></div>" +
        '<div class="card"><div class="muted small">Money in</div><div style="font-size:22px;font-weight:800">' + fmtMoney(inflow) + "</div></div>" +
        '<div class="card"><div class="muted small">Transactions</div><div style="font-size:22px;font-weight:800">' + txns.length + "</div></div>" +
      "</div>" +
      (imports.length ? '<div class="muted small" style="margin-bottom:8px">Imported: ' + imports.map((i) => escapeHtml(i.label) + " (" + i.count + ")").join(" · ") + "</div>" : "") +
      '<div class="card"><table><thead><tr><th>Date</th><th>What it was</th><th>Amount</th></tr></thead><tbody>' +
      recent.map((t) =>
        '<tr><td class="muted small">' + escapeHtml(t.date || "") + "</td>" +
        "<td><strong>" + escapeHtml(cleanMerchant(t.description)) + "</strong>" +
        '<div class="muted small">' + escapeHtml(t.description || "") + "</div></td>" +
        '<td style="color:' + (Number(t.amount) < 0 ? "var(--danger,#c23b3b)" : "#1f8a5f") + '">' + fmtMoney(t.amount) + "</td></tr>"
      ).join("") + "</tbody></table>" +
      (txns.length > 25 ? '<div class="muted small" style="margin-top:8px">Showing 25 most recent of ' + txns.length + ".</div>" : "") +
      "</div>";
  }

  if (!recurring.length) {
    return tabs + emptyState("🔁", "Nothing repeating yet",
      "Recurring charges show up once the same merchant appears twice. Import another month and they'll appear.");
  }

  const soon = recurring.filter((r) => r.regular && r.nextDate <= addDaysISO(todayISO(), 14));

  return tabs +
    '<div class="grid" style="margin-bottom:14px">' +
      '<div class="card"><div class="muted small">Repeating charges</div><div style="font-size:22px;font-weight:800">' + recurring.filter((r) => r.regular).length + "</div></div>" +
      '<div class="card"><div class="muted small">Roughly per month</div><div style="font-size:22px;font-weight:800">' + fmtMoney(monthlyish) + "</div></div>" +
      '<div class="card"><div class="muted small">Due in next 2 weeks</div><div style="font-size:22px;font-weight:800">' + fmtMoney(soon.reduce((s, r) => s + r.typical, 0)) + "</div></div>" +
    "</div>" +
    '<div class="card"><table><thead><tr><th>What</th><th>How often</th><th>Amount</th><th>Next expected</th><th></th></tr></thead><tbody>' +
    recurring.map((r) =>
      "<tr>" +
        "<td><strong>" + escapeHtml(r.name) + "</strong>" +
          '<div class="muted small">seen ' + r.count + " time(s) · last " + fmtDate(r.lastDate) + "</div></td>" +
        "<td>" + escapeHtml(r.cadence) +
          (r.regular ? "" : '<div class="muted small">irregular — timing is a guess</div>') + "</td>" +
        "<td>" + fmtMoney(r.typical) + "</td>" +
        "<td>" + (r.regular ? fmtDate(r.nextDate) + '<div class="muted small">' + fmtRelativeDays(r.nextDate) + "</div>"
                            : '<span class="muted small">~' + fmtDate(r.nextDate) + "</span>") + "</td>" +
        '<td><button class="btn-sm" data-action="recurring-to-bill" data-id="' + encodeURIComponent(r.name) + '" title="Track this as a bill">+ Bill</button></td>' +
      "</tr>").join("") +
    "</tbody></table>" +
    '<div class="muted small" style="margin-top:10px">Next dates are worked out from the gaps between past charges, not from the merchant — treat them as a good estimate, not a promise.</div>' +
    "</div>";
}

/* ---------------------------------------------------------------------------
   Recurring payment detection

   The useful question isn't "what did I spend" — it's "what keeps coming out,
   and when's the next one." Statement descriptions are hostile to that:
     "STARBUCKS STORE 00123 DALLAS TX"
     "SHELL OIL 57442100 PLANO TX"
   Same merchant, different store number every time. So strip the noise down to
   a stable name, group by it, and look at the gaps between charges.
   --------------------------------------------------------------------------- */

// Turn a raw statement description into a readable merchant name.
function cleanMerchant(desc) {
  let s = String(desc || "").toUpperCase();
  s = s.replace(/••••\d+/g, " ");                    // already-masked numbers
  s = s.replace(/\b(CARD|ACCT|ACCOUNT|REF|ID|TRACE|PPD|CCD|WEB|POS|DEBIT|CREDIT)\b\s*#?\s*\d*/g, " ");
  s = s.replace(/\bSTORE\s*#?\s*\d+/g, " ");
  s = s.replace(/#\s*\d+/g, " ");                    // store numbers
  s = s.replace(/\b\d{4,}\b/g, " ");                 // long digit runs
  s = s.replace(/\b[A-Z]{2}\b(?=\s*$)/g, " ");       // trailing state code
  s = s.replace(/\b(DALLAS|PLANO|FRISCO|AUSTIN|HOUSTON|IRVING|ARLINGTON|DENTON|GARLAND|MCKINNEY)\b/g, " ");
  s = s.replace(/\b(PURCHASE|PAYMENT|PMTS?|BILL PAY|AUTOPAY|RECURRING|ONLINE|WWW\.?|COM)\b/g, " ");
  s = s.replace(/[^A-Z0-9&' ]+/g, " ").replace(/\s+/g, " ").trim();
  // Keep it to the first few meaningful words — that's the merchant
  const words = s.split(" ").filter(Boolean).slice(0, 3);
  return words.join(" ") || String(desc || "").trim();
}

function medianOf(nums) {
  if (!nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function cadenceLabel(days) {
  if (days <= 2) return "Daily-ish";
  if (days <= 9) return "Weekly";
  if (days <= 17) return "Every 2 weeks";
  if (days <= 24) return "Twice a month";
  if (days <= 45) return "Monthly";
  if (days <= 100) return "Quarterly";
  if (days <= 200) return "Twice a year";
  return "Yearly";
}

/* Find merchants charged more than once and work out their rhythm.
   Only outgoing money — incoming deposits aren't "payments". */
function detectRecurring(txns) {
  const groups = new Map();
  (txns || []).forEach((t) => {
    if (Number(t.amount) >= 0) return;
    const key = cleanMerchant(t.description);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });

  const out = [];
  groups.forEach((list, name) => {
    if (list.length < 2) return;
    list.sort((a, b) => (a.date < b.date ? -1 : 1));

    // Gaps between charges, ignoring same-day repeats (two coffees ≠ a cycle)
    const gaps = [];
    for (let i = 1; i < list.length; i++) {
      const g = daysBetween(list[i - 1].date, list[i].date);
      if (g > 0) gaps.push(g);
    }
    if (!gaps.length) return;

    const interval = medianOf(gaps);
    if (interval < 1) return;

    const amounts = list.map((t) => Math.abs(Number(t.amount)));
    const typical = medianOf(amounts.map((a) => Math.round(a * 100))) / 100;

    // How regular is it? Gaps close to the median = a real subscription.
    const spread = gaps.length > 1
      ? gaps.reduce((s, g) => s + Math.abs(g - interval), 0) / gaps.length
      : 0;
    const regular = spread <= Math.max(3, interval * 0.25);

    const last = list[list.length - 1];
    out.push({
      name,
      count: list.length,
      typical,
      total: amounts.reduce((s, a) => s + a, 0),
      interval,
      cadence: cadenceLabel(interval),
      regular,
      lastDate: last.date,
      lastDescription: last.description,
      nextDate: addDaysISO(last.date, interval),
    });
  });

  // Regular ones first, then soonest, then biggest
  return out.sort((a, b) => {
    if (a.regular !== b.regular) return a.regular ? -1 : 1;
    if (a.nextDate !== b.nextDate) return a.nextDate < b.nextDate ? -1 : 1;
    return b.typical - a.typical;
  });
}

/* Reduce anything that looks like a full account/card number to its last 4.
   Statements are full of them, and a backup .json is a plain text file. */
function maskSensitive(text) {
  return String(text == null ? "" : text)
    // 13-19 digit card/account numbers, with or without spaces/dashes
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, (m) => {
      const digits = m.replace(/\D/g, "");
      return "••••" + digits.slice(-4);
    })
    // "Account #123456789" style
    .replace(/\b(acct|account|acc|card)\s*#?\s*:?\s*(\d{5,})/gi, (m, w, d) => w + " ••••" + d.slice(-4));
}

/* Parse a statement into { date, description, amount } rows.
   Handles the common CSV shapes banks export, plus loosely-formatted pasted
   text. Anything it can't confidently read is skipped rather than guessed at —
   a wrong number is worse than a missing one. */
function parseStatementText(text) {
  const rows = [];
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return rows;

  const splitCsv = (line) => {
    const out = []; let cur = ""; let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if ((ch === "," || ch === "\t") && !q) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/^"|"$/g, ""));
  };

  /* Deciding CSV vs. loose text on "does line 1 contain a comma" was wrong in a
     way that broke real statements: a running balance of 4,994.25 has a comma
     in it, so a plain PDF statement got sent down the CSV path and came back
     with almost nothing.

     Decide on structure instead:
       - a header row naming columns, or
       - most lines sharing the same field count (that's what a table is)
     A thousands separator in a number does neither. */
  const firstLine = lines[0] || "";
  const headerish = /(^|[,\t])\s*("?)(date|posted|description|payee|merchant|memo|amount|debit|credit|balance)\2\s*([,\t]|$)/i.test(firstLine);
  const fieldCount = (l) => l.split(/[,\t]/).length;
  const counts = lines.slice(0, 12).map(fieldCount);
  const commonCount = counts.sort((a, b) =>
    counts.filter((v) => v === a).length - counts.filter((v) => v === b).length).pop();
  const consistentTable = commonCount >= 3 &&
    counts.filter((c) => c === commonCount).length >= Math.max(3, Math.ceil(counts.length * 0.7));
  const looksCsv = (firstLine.includes(",") || firstLine.includes("\t")) && (headerish || consistentTable);
  if (looksCsv) {
    const header = splitCsv(lines[0]).map((h) => h.toLowerCase());
    const findCol = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
    let iDate = findCol("date", "posted", "transaction date");
    let iDesc = findCol("description", "payee", "merchant", "memo", "name");
    let iAmt = findCol("amount", "value");
    const iDebit = findCol("debit", "withdrawal");
    const iCredit = findCol("credit", "deposit");
    const hasHeader = iDate >= 0 || iDesc >= 0 || iAmt >= 0;
    const start = hasHeader ? 1 : 0;
    if (!hasHeader) { iDate = 0; iDesc = 1; iAmt = 2; }

    for (let i = start; i < lines.length; i++) {
      const c = splitCsv(lines[i]);
      if (c.length < 2) continue;
      const date = normalizeDate(c[iDate]);
      const description = maskSensitive(c[iDesc] || "");
      let amount = null;
      if (iAmt >= 0 && c[iAmt] !== undefined && c[iAmt] !== "") amount = parseMoney(c[iAmt]);
      else if (iDebit >= 0 && c[iDebit]) amount = -Math.abs(parseMoney(c[iDebit]));
      else if (iCredit >= 0 && c[iCredit]) amount = Math.abs(parseMoney(c[iCredit]));
      if (!date || amount === null || isNaN(amount)) continue;
      rows.push({ id: uid(), date, description, amount });
    }
    return rows;
  }

  /* Loose statement text.

     Earlier versions matched with one rigid regex anchored to "date at the
     very start, amount at the very end". That happens to fit a tidy demo and
     almost nothing a real bank prints — it matched 7 rows out of 200 on a real
     statement. Banks put a check number first, or two date columns, or a
     running balance last, or a reference code after the amount.

     So instead of one shape, work from the pieces that are always true:
       - somewhere near the start there is a DATE
       - somewhere after it there are one or more MONEY tokens
       - the text in between is the description
     If a line has both a date and money, it's a transaction. Everything else
     is furniture.  */

  /* A /g regex keeps `lastIndex` between calls, so reusing one across .test(),
     .match() and .search() makes results alternate between right and wrong.
     That is exactly what dropped most rows. Build a fresh one each time. */
  const MONEY_SRC = "\\(?-?\\$?\\d{1,3}(?:,\\d{3})*\\.\\d{2}\\)?|\\(?-?\\$?\\d+\\.\\d{2}\\)?";
  const money_g = () => new RegExp(MONEY_SRC, "g");
  const money_1 = () => new RegExp(MONEY_SRC);
  const MONTHS = "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|SEPT|OCT|NOV|DEC";
  const DATE_RE = new RegExp(
    "(\\d{4}-\\d{2}-\\d{2})" +                       // 2026-08-12
    "|(\\d{1,2}[\\/-]\\d{1,2}(?:[\\/-]\\d{2,4})?)" + // 8/12, 08/12/2026
    "|((?:" + MONTHS + ")\\.?\\s+\\d{1,2})" +          // AUG 12
    "|(\\d{1,2}\\s+(?:" + MONTHS + ")\\.?)",           // 12 AUG
    "i");

  let sectionSign = 0;   // +1 deposits, -1 withdrawals, 0 unknown
  const skipped = [];

  for (const line of lines) {
    // Section headings set the sign for rows that print amounts unsigned
    if (!money_1().test(line) && /[A-Za-z]/.test(line)) {
      if (/deposit|credit|addition|payment received|income|refund/i.test(line)) sectionSign = 1;
      else if (/withdraw|debit|charge|purchase|payment|fee|transaction/i.test(line)) sectionSign = -1;
    }

    // Column headers / page furniture
    if (/^(date|posted|trans)\b.*(description|amount|balance)/i.test(line)) continue;
    if (/^page \d+|^statement period|^account (number|summary)|^beginning balance|^ending balance|^total (deposits|withdrawals)/i.test(line)) continue;

    const money = line.match(money_g()) || [];
    const dm = line.match(DATE_RE);

    if (!dm || !money.length) {
      // A line with no date and no money, sitting under a real row, is a
      // wrapped description — attach it rather than dropping it.
      if (rows.length && !dm && !money.length && line.length < 60) {
        const prev = rows[rows.length - 1];
        prev.description = maskSensitive((prev.description + " " + line).trim());
      } else if (line.length > 8) {
        skipped.push(line);
      }
      continue;
    }

    const date = normalizeDate(dm[0]);
    if (!date) { skipped.push(line); continue; }

    /* Which money token is the amount?
       One token  -> that's it.
       Two or more -> the LAST is almost always the running balance, so take
       the one before it. Statements that print amount-then-balance are the
       common case; a lone trailing balance never appears without an amount. */
    const rawAmt = money.length >= 2 ? money[money.length - 2] : money[0];

    let amount = parseMoney(rawAmt);
    if (isNaN(amount)) { skipped.push(line); continue; }
    if (/\(.*\)/.test(rawAmt)) amount = -Math.abs(amount);
    else if (!/-/.test(rawAmt) && sectionSign) amount = sectionSign * Math.abs(amount);

    // Description = between the date and the first money token
    const afterDate = line.slice((dm.index || 0) + dm[0].length);
    const firstMoneyAt = afterDate.search(money_1());
    let desc = (firstMoneyAt > 0 ? afterDate.slice(0, firstMoneyAt) : afterDate)
      .replace(/^[\s\-–|]+/, "")
      // a second date column (posted + transaction date) isn't part of the name
      .replace(new RegExp("^(" + DATE_RE.source + ")\\s*", "i"), "")
      .replace(/\s+/g, " ")
      .trim();
    if (!desc) desc = "(no description)";

    rows.push({ id: uid(), date, description: maskSensitive(desc), amount });
  }

  // Handed to the caller so the import can report what it couldn't read,
  // instead of silently dropping most of a statement like it used to.
  rows.skippedLines = skipped;
  return rows;
}

function parseMoney(s) {
  const n = parseFloat(String(s).replace(/[$,\s]/g, "").replace(/[()]/g, ""));
  return /^\s*\(/.test(String(s)) ? -Math.abs(n) : n;
}

function normalizeDate(s) {
  if (!s) return "";
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/);
  if (!m) return "";
  const mm = String(m[1]).padStart(2, "0");
  const dd = String(m[2]).padStart(2, "0");
  let yy = m[3] || String(new Date().getFullYear());
  if (yy.length === 2) yy = "20" + yy;
  return yy + "-" + mm + "-" + dd;
}

/* ---------------------------------------------------------------------------
   PDF statements

   Banks hand out PDFs far more than CSVs, so reading them directly matters.
   pdf.js does the work entirely in the browser — the file is still never
   uploaded anywhere, it just gets parsed here like a CSV would be.

   Loaded from a CDN only when a PDF is actually picked, so people who never
   touch a PDF don't pay for the download.
   --------------------------------------------------------------------------- */
const PDFJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
let pdfJsLoading = null;

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfJsLoading) return pdfJsLoading;
  pdfJsLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PDFJS_SRC;
    s.onload = () => {
      if (!window.pdfjsLib) return reject(new Error("PDF reader failed to load."));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("Couldn't load the PDF reader (check your internet connection)."));
    document.head.appendChild(s);
  });
  return pdfJsLoading;
}

/* Pull text out of a PDF, rebuilding visual lines.

   pdf.js returns loose text fragments with coordinates, not lines — printing
   them in order gives one long run-on string that no transaction pattern can
   match. So group fragments by their Y position (with a small tolerance, since
   characters on one line rarely share an exact Y), sort each group left to
   right, and join. That restores rows like:
     08/12/2026   STARBUCKS #123   -5.75 */
async function extractPdfText(arrayBuffer) {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map();
    content.items.forEach((item) => {
      if (!item.str || !item.str.trim()) return;
      const y = Math.round(item.transform[5]);        // vertical position
      const key = Math.round(y / 3);                  // 3pt tolerance per line
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x: item.transform[4], str: item.str });
    });
    // Descending Y = top of page down
    Array.from(rows.keys()).sort((a, b) => b - a).forEach((k) => {
      const line = rows.get(k).sort((a, b) => a.x - b.x).map((i) => i.str).join(" ")
        .replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    });
  }
  return lines.join("\n");
}

async function importStatementPdf(file) {
  toast("Reading " + file.name + "…");
  try {
    const buf = await file.arrayBuffer();
    const text = await extractPdfText(buf);
    if (!text.trim()) {
      toast("That PDF has no readable text — it's probably a scan. Try your bank's CSV export instead.");
      return;
    }
    // Prefer the AI reader when it's available — it handles layouts the regex
    // can't, which on a real statement is most of them.
    if ((STATE.settings && STATE.settings.blueBonnetProxyUrl)) {
      await extractStatementWithAI(text, file.name);
      return;
    }
    const added = importStatementText(text, file.name);
    if (!added) {
      // Text came out but nothing matched the transaction patterns. Rather than
      // dead-end, hand the extracted text to the user so Blue Bonnet can read it.
      openStatementPasteModal(text);
      toast("Couldn't auto-detect the rows — here's the text, ask Blue Bonnet to log it.");
    }
  } catch (e) {
    console.error(e);
    toast("Couldn't read that PDF (" + e.message + "). Try the CSV export, or copy the text and paste it.");
  }
}


/* ===========================================================================
   Budget planner UI
   =========================================================================== */
function renderBudgetPlan() {
  const b = STATE.budget || {};
  const txns = STATE.statementTxns || [];

  if (!b.active) {
    const a = analyzeSpending(txns);
    if (!a.enoughData) {
      return '<div class="card" style="margin-bottom:18px"><strong>Set up a budget</strong>' +
        '<p class="muted small" style="margin:6px 0 10px">Import a statement first — a budget built from what you actually spend is one you might keep. Guessing at numbers is how budgets get abandoned.</p>' +
        '<button class="btn-sm" data-action="set-tab-statements">Go to Statements</button></div>';
    }
    return '<div class="card" style="margin-bottom:18px">' +
      "<strong>Ready to build a budget</strong>" +
      '<p class="muted small" style="margin:6px 0 10px">Based on ' + a.monthCount + " month(s) of your actual spending" +
      (a.confident ? "" : " — one month is a starting point, not a pattern; it'll get better with more") + ". " +
      "Typical month: " + fmtMoney(a.typicalSpend) + " out" + (a.typicalIncome ? ", " + fmtMoney(a.typicalIncome) + " in" : "") + ".</p>" +
      '<button class="btn-primary" data-action="open-budget-options">See my budget options</button></div>';
  }

  const p = budgetProgress(STATE);
  const tone = p.overBy > 0 ? "over" : p.onPace ? "ok" : "close";
  const headline = p.safeToSpendToday != null
    ? (p.overBy > 0
        ? '<div style="font-size:15px">The flexible budget for this month is used up.</div>' +
          '<div class="muted small" style="margin-top:4px">Over by ' + fmtMoney(p.overBy) + " with " + p.daysLeft + " day(s) to go. Not a disaster — next month resets, and you can shift a category below if the number was simply wrong.</div>"
        : '<div class="muted small">Safe to spend today</div>' +
          '<div style="font-size:32px;font-weight:800;line-height:1.1">' + fmtMoney(p.safeToSpendToday) + "</div>" +
          '<div class="muted small" style="margin-top:4px">' + fmtMoney(Math.max(0, p.flexLeft)) + " left across " + p.daysLeft + " day(s)</div>")
    : "";

  return '<div class="card" style="margin-bottom:18px;border-left:4px solid ' +
      (tone === "over" ? "var(--attention,#c23b3b)" : tone === "close" ? "#b8790a" : "#1f8a5f") + '">' +
    '<div class="row between" style="align-items:flex-start">' +
      "<div>" + headline + "</div>" +
      '<div class="row"><button class="btn-sm" data-action="open-budget-options">Change plan</button>' +
      '<button class="btn-sm" data-action="ask-bluebonnet-budget">Ask Blue Bonnet</button></div>' +
    "</div>" +
    '<div style="height:8px;background:var(--border,#e1e6ee);border-radius:4px;margin:12px 0 6px;overflow:hidden">' +
      '<div style="height:8px;width:' + Math.min(100, p.pct) + '%;background:' +
      (p.pct > 100 ? "var(--attention,#c23b3b)" : p.pct > 85 ? "#b8790a" : "#1f8a5f") + '"></div></div>' +
    '<div class="muted small">' + fmtMoney(p.totalSpent) + " of " + fmtMoney(p.totalCap) + " · day " + p.dayOfMonth + " of " + p.daysInMonth +
      (p.onPace ? " · on pace" : " · ahead of pace") + "</div>" +
    '<table style="margin-top:12px"><tbody>' +
    p.rows.filter((r) => r.cap > 0).map((r) =>
      "<tr><td><strong>" + escapeHtml(r.name) + "</strong>" + (r.fixed ? ' <span class="muted small">fixed</span>' : "") + "</td>" +
      '<td style="width:40%"><div style="height:6px;background:var(--border,#e1e6ee);border-radius:3px;overflow:hidden">' +
        '<div style="height:6px;width:' + Math.min(100, r.pct) + '%;background:' +
        (r.status === "over" ? "var(--attention,#c23b3b)" : r.status === "close" ? "#b8790a" : "#1f8a5f") + '"></div></div></td>' +
      '<td style="text-align:right;white-space:nowrap">' + fmtMoney(r.spent) + ' <span class="muted small">/ ' + fmtMoney(r.cap) + "</span></td>" +
      '<td style="text-align:right;white-space:nowrap"><button class="btn-sm" data-action="edit-cap" data-id="' + encodeURIComponent(r.name) + '">edit</button></td></tr>'
    ).join("") + "</tbody></table></div>";
}

function openBudgetOptions() {
  const a = analyzeSpending(STATE.statementTxns || []);
  const plans = generateBudgetOptions(a, { income: (STATE.budget && STATE.budget.income) || 0 });
  if (!plans.length) { toast("Import a statement first so there's something to base it on."); return; }
  window.__budgetPlans = plans;

  openModal(
    "<h3>Pick a budget</h3>" +
    '<p class="muted small">Built from ' + a.monthCount + " month(s) of your own spending. Nothing here is locked in — you can change any number later, and switching plans doesn't lose anything.</p>" +
    plans.map((pl, i) =>
      '<div class="card" style="margin-bottom:10px">' +
        '<div class="row between"><strong>' + escapeHtml(pl.label) + "</strong>" +
        "<span>" + fmtMoney(pl.total) + "/mo</span></div>" +
        '<p class="muted small" style="margin:6px 0 8px">' + escapeHtml(pl.blurb) + "</p>" +
        '<div class="muted small">' + (pl.saves > 0 ? "Frees up about " + fmtMoney(pl.saves) + " a month" : "Same as now") +
          (pl.leftover != null ? " · " + (pl.leftover >= 0 ? fmtMoney(pl.leftover) + " left over" : fmtMoney(Math.abs(pl.leftover)) + " short of income") : "") + "</div>" +
        '<button class="btn-primary btn-sm" style="margin-top:8px" data-action="choose-budget" data-id="' + i + '">Use this one</button>' +
      "</div>").join("") +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Not now</button></div>'
  );
}

function chooseBudget(idx) {
  const plans = window.__budgetPlans || [];
  const pl = plans[Number(idx)];
  if (!pl) return;
  STATE.budget = Object.assign({}, STATE.budget, {
    active: true, method: pl.id, categories: Object.assign({}, pl.categories),
    createdAt: new Date().toISOString(),
  });
  persist();
  closeModal();
  toast("Budget set: " + pl.label + ". Change any number any time.");
}

function openEditCap(name) {
  const cur = (STATE.budget.categories || {})[name] || 0;
  openModal(
    "<h3>" + escapeHtml(name) + "</h3>" +
    '<p class="muted small">If this number keeps getting broken, the number is probably wrong — not you. Change it.</p>' +
    '<form data-form="edit-cap" data-id="' + escapeHtml(name) + '">' +
      '<div class="field"><label>Monthly amount</label><input type="number" step="1" name="cap" value="' + cur + '" autofocus /></div>' +
      '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button>' +
      '<button type="submit" class="btn-primary">Save</button></div></form>'
  );
}

/* ===========================================================================
   AI statement extraction  (the Rocket-Money-style path)

   Regex parsing of bank statements is a losing battle — every bank prints a
   different layout, and a pattern tuned for one drops most rows of another.
   On a real statement the regex found 7 transactions out of 200.

   So the regex is now only a fast local preview. The real engine is Claude:
   the statement text goes to Blue Bonnet's Worker in chunks and comes back as
   structured JSON — every transaction, with a human-readable merchant name and
   a category. That is the same job an LLM is genuinely good at and a regex
   never will be.

   Costs a fraction of a cent per statement and the file still never leaves the
   browser except through the user's own Worker.
   =========================================================================== */

const STATEMENT_CATEGORIES = [
  "Housing", "Utilities", "Groceries", "Eating out", "Transport", "Fuel",
  "Insurance", "Health", "Subscriptions", "Shopping", "Debt & BNPL",
  "Fees & interest", "Transfers", "Income", "Business", "Other",
];

const AI_EXTRACT_SYSTEM =
  "You extract transactions from bank statements. You return ONLY valid JSON — no prose, " +
  "no markdown fences, nothing else.\n\n" +
  "Return: {\"transactions\":[{\"date\":\"YYYY-MM-DD\",\"name\":\"...\",\"raw\":\"...\"," +
  "\"amount\":-12.34,\"category\":\"...\"}]}\n\n" +
  "Rules:\n" +
  "- EVERY transaction line. Do not summarise, sample, or skip repeats. If the same merchant " +
  "appears 12 times, return 12 entries.\n" +
  "- amount is NEGATIVE for money out, POSITIVE for money in.\n" +
  "- Statements often show a running BALANCE after the amount. The balance is NOT the amount. " +
  "If two numbers trail a row, the first is the amount.\n" +
  "- Sections like 'DEPOSITS' or 'WITHDRAWALS' set the sign when a row's amount is unsigned.\n" +
  "- name = the readable merchant: 'STARBUCKS STORE 00123 DALLAS TX' becomes 'Starbucks'. " +
  "'SQ *JOES TACOS' becomes 'Joe's Tacos'. Keep it short and recognisable.\n" +
  "- raw = the original description text, unchanged.\n" +
  "- category = exactly one of: " + STATEMENT_CATEGORIES.join(", ") + "\n" +
  "- Skip page headers, column headers, balance summaries and totals — they are not transactions.\n" +
  "- If a year isn't printed on a row, infer it from the statement period.";

/* Statements are long. Send them in chunks so no single request gets truncated
   mid-JSON, and so progress is visible on a 200-row month. */
function chunkLines(text, perChunk) {
  /* Token discipline. Every line sent costs money, and most of a statement is
     furniture: marketing text, addresses, legal boilerplate, page headers,
     balance summaries. Dropping those before the request typically cuts the
     upload by a third to a half with no loss of transactions — a line with no
     digits in it cannot be one. */
  const MONEY = /\d+\.\d{2}/;
  const JUNK = /^(page \d|statement period|account (number|summary)|member fdic|equal housing|customer service|questions\?|www\.|p\.?o\.? box|continued on|thank you|important information|to report|visit us|call \d|see reverse|this statement|deposits are insured)/i;

  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => {
      if (!l || l.length < 6) return false;
      if (JUNK.test(l)) return false;
      // Keep section headings (they set the sign) and anything with an amount.
      if (MONEY.test(l)) return true;
      if (/^[A-Z][A-Z \/&-]{5,}$/.test(l)) return true; // ALL-CAPS heading
      return false;
    });

  const out = [];
  for (let i = 0; i < lines.length; i += perChunk) out.push(lines.slice(i, i + perChunk).join("\n"));
  return out;
}

/* A toast clears itself after ~3 seconds. Each chunk takes longer than that,
   so progress messages vanished mid-request and the import looked like it had
   silently died. This stays on screen until the work actually finishes. */
function showProgress(opts) {
  /* A spinner with no numbers is indistinguishable from a hang. This shows the
     part being worked on, a real progress bar, transactions found so far, and
     a time estimate based on how long the finished parts actually took —
     measured, not guessed. */
  const o = typeof opts === "string" ? { label: opts } : (opts || {});
  let el = document.getElementById("aiProgress");
  if (!el) {
    el = document.createElement("div");
    el.id = "aiProgress";
    el.style.cssText =
      "position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:95;" +
      "background:#1e2733;color:#fff;padding:14px 18px;border-radius:12px;font-size:14px;" +
      "box-shadow:0 6px 22px rgba(20,30,50,0.4);min-width:300px;max-width:calc(100vw - 32px)";
    document.body.appendChild(el);
  }
  const pct = o.total ? Math.round((o.done / o.total) * 100) : 0;
  el.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px">' +
      "<strong>" + escapeHtml(o.label || "Working…") + "</strong>" +
      '<span style="font-size:12px;opacity:0.75">' + (o.total ? pct + "%" : "") + "</span>" +
    "</div>" +
    '<div style="height:6px;background:rgba(255,255,255,0.2);border-radius:3px;overflow:hidden">' +
      '<div style="height:6px;width:' + pct + '%;background:#7fd6a8;border-radius:3px;transition:width 0.3s"></div>' +
    "</div>" +
    '<div style="display:flex;justify-content:space-between;gap:12px;margin-top:8px;font-size:12px;opacity:0.8">' +
      "<span>" + (o.total ? "Part " + o.done + " of " + o.total : "") +
        (o.found != null ? " · " + o.found + " found" : "") + "</span>" +
      "<span>" + escapeHtml(o.eta || "") + "</span>" +
    "</div>";
}

function hideProgress() {
  const el = document.getElementById("aiProgress");
  if (el) el.remove();
}

/* Human-readable time left, from the average of the parts already done. */
function etaText(msPerPart, partsLeft) {
  if (!msPerPart || partsLeft <= 0) return "";
  const secs = Math.round((msPerPart * partsLeft) / 1000);
  if (secs < 10) return "almost done";
  if (secs < 60) return "about " + (Math.ceil(secs / 5) * 5) + "s left";
  const mins = Math.floor(secs / 60), rem = secs % 60;
  return "about " + mins + "m" + (rem > 20 ? " " + Math.round(rem / 10) * 10 + "s" : "") + " left";
}

async function extractStatementWithAI(text, label) {
  const proxyUrl = (STATE.settings && STATE.settings.blueBonnetProxyUrl) || "";
  if (!proxyUrl) {
    toast("Set your Worker Proxy URL in Settings → Blue Bonnet to use AI reading.");
    return 0;
  }

  const chunks = chunkLines(text, 120);
  if (!chunks.length) { toast("Nothing to read in that file."); return 0; }
  showProgress({ label: "Reading your statement", done: 0, total: chunks.length, found: 0, eta: "starting…" });

  const all = [];
  const failures = [];
  let usedBackupExtract = false;
  const startedAt = Date.now();
  for (let i = 0; i < chunks.length; i++) {
    const elapsed = Date.now() - startedAt;
    const msPerPart = i > 0 ? elapsed / i : 0;
    showProgress({
      label: "Reading your statement",
      done: i,
      total: chunks.length,
      found: all.length,
      eta: i > 0 ? etaText(msPerPart, chunks.length - i) : "estimating…",
    });
    try {
      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          /* Extraction is mechanical, not clever — Haiku does it as well as a
             bigger model at a fraction of the price. max_tokens is sized to the
             chunk (roughly 45 tokens of JSON per transaction) rather than left
             at a big round number, so a runaway response can't quietly cost a
             fortune. */
          model: "claude-haiku-4-5-20251001",
          max_tokens: Math.min(8000, 400 + chunks[i].split("\n").length * 60),
          system: AI_EXTRACT_SYSTEM,
          messages: [{
            role: "user",
            content: "Statement text (part " + (i + 1) + " of " + chunks.length + "):\n\n" + chunks[i],
          }],
        }),
      });
      if (!res.ok) throw new Error("proxy " + res.status);
      const data = await res.json();
      let textOut = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
      if (!textOut && data.choices) {
        // gateway (OpenAI-shaped) reply
        textOut = (data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
      }
      const parsed = safeParseJson(textOut);
      (parsed && parsed.transactions ? parsed.transactions : []).forEach((t) => {
        const date = normalizeDate(t.date) || t.date;
        const amount = Number(t.amount);
        if (!date || isNaN(amount)) return;
        all.push({
          id: uid("txn"),
          date,
          description: maskSensitive(t.name || t.raw || ""),
          raw: maskSensitive(t.raw || ""),
          amount,
          category: STATEMENT_CATEGORIES.includes(t.category) ? t.category : "Other",
        });
      });
    } catch (e) {
      /* Anthropic didn't take it — try the gateway for this chunk before
         giving up. Extraction is strict JSON work, so a free provider may do
         it less reliably, but a partial import beats no import. */
      let recovered = false;
      try {
        if (typeof BB !== "undefined" && BB.configured()) {
          const g = await BB.ask(
            [{ role: "system", content: AI_EXTRACT_SYSTEM },
             { role: "user", content: "Statement text (part " + (i + 1) + " of " + chunks.length + "):\n\n" + chunks[i] }],
            { session: "adulting-statements", tier: "balanced", maxTokens: 4000, temperature: 0 }
          );
          const parsed = safeParseJson(g.text);
          (parsed && parsed.transactions ? parsed.transactions : []).forEach((t) => {
            const date = normalizeDate(t.date) || t.date;
            const amount = Number(t.amount);
            if (!date || isNaN(amount)) return;
            all.push({
              id: uid("txn"), date,
              description: maskSensitive(t.name || t.raw || ""),
              raw: maskSensitive(t.raw || ""),
              amount,
              category: STATEMENT_CATEGORIES.includes(t.category) ? t.category : "Other",
            });
          });
          recovered = true;
          usedBackupExtract = true;
        }
      } catch (e2) {
        console.warn("gateway fallback also failed for part " + (i + 1) + ":", e2);
      }
      if (!recovered) {
        console.warn("AI extract chunk " + (i + 1) + " failed:", e);
        failures.push("Part " + (i + 1) + ": " + (e.message || e));
      }
    }
  }

  showProgress({ label: "Finishing up", done: chunks.length, total: chunks.length, found: all.length, eta: "done" });
  await new Promise((r) => setTimeout(r, 400));
  hideProgress();

  if (!all.length) {
    /* Don't just say "couldn't read it" — say WHY. A 401/429/500 from the
       Worker is a completely different problem from a layout it can't parse,
       and the user can't tell them apart without being told. */
    openModal(
      "<h3>Couldn't read that statement</h3>" +
      '<p class="muted small">Nothing came back from Blue Bonnet. ' +
      (failures.length
        ? "The requests failed:</p><div class=\"field\"><textarea rows=\"5\" readonly style=\"width:100%;font-family:monospace;font-size:11px\">" +
          escapeHtml(failures.join("\n")) + "</textarea></div>" +
          '<p class="muted small">A 401 or 403 usually means the Worker\'s API key; 429 means rate-limited (wait a minute); ' +
          "404 means the Worker Proxy URL in Settings is wrong.</p>"
        : "The requests succeeded but no transactions were found — the PDF may be a scan with no text layer.</p>") +
      '<div class="modal-actions"><button type="button" data-action="close-modal">Close</button></div>'
    );
    return 0;
  }

  // Same count-based de-dupe as the manual path — identical repeat charges are real.
  const counts = new Map();
  (STATE.statementTxns || []).forEach((t) => {
    const k = t.date + "|" + t.description + "|" + t.amount;
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  const fresh = all.filter((r) => {
    const k = r.date + "|" + r.description + "|" + r.amount;
    const n = counts.get(k) || 0;
    if (n > 0) { counts.set(k, n - 1); return false; }
    return true;
  });

  STATE.statementTxns = (STATE.statementTxns || []).concat(fresh);
  STATE.statementImports = (STATE.statementImports || []).concat([{
    id: uid("imp"), label: (label || "Statement") + " (AI)", count: fresh.length, importedAt: Date.now(),
  }]);
  persist();
  toast("Read " + fresh.length + " transaction(s) from " + (label || "the statement") +
        (usedBackupExtract ? " · brain building mode" : "") +
        (failures.length ? " · " + failures.length + " part(s) failed" : ""));
  if (failures.length) {
    console.warn("Some parts failed:", failures);
    setTimeout(() => toast("Note: " + failures.length + " part(s) of the statement failed — some transactions may be missing."), 3500);
  }
  return fresh.length;
}

/* Models sometimes wrap JSON in prose or fences despite instructions. */
function safeParseJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { /* keep trying */ }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch (e) { /* keep trying */ } }
  const first = s.indexOf("{"), last = s.lastIndexOf("}");
  if (first >= 0 && last > first) { try { return JSON.parse(s.slice(first, last + 1)); } catch (e) { /* give up */ } }
  return null;
}

function importStatementText(text, label) {
  const rows = parseStatementText(text);
  if (!rows.length) {
    toast("Couldn't find any transactions in that. Try a CSV export, or paste the statement text.");
    return 0;
  }
  /* De-duplicate by COUNT, not by presence.

     Buying coffee twice at the same shop on the same day produces two
     genuinely identical rows, and a plain Set silently threw the second one
     away — real money vanishing from the totals. So count how many times each
     identical row already exists and only skip that many.  */
  const counts = new Map();
  (STATE.statementTxns || []).forEach((t) => {
    const k = t.date + "|" + t.description + "|" + t.amount;
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  const fresh = rows.filter((r) => {
    const k = r.date + "|" + r.description + "|" + r.amount;
    const remaining = counts.get(k) || 0;
    if (remaining > 0) { counts.set(k, remaining - 1); return false; }
    return true;
  });
  STATE.statementTxns = (STATE.statementTxns || []).concat(fresh);
  STATE.statementImports = (STATE.statementImports || []).concat([{
    id: uid(), label: label || "Statement", count: fresh.length, importedAt: Date.now(),
  }]);
  persist();
  const dupes = rows.length - fresh.length;
  const unread = (rows.skippedLines || []).length;
  toast("Imported " + fresh.length + " transaction(s)" +
        (dupes ? " · " + dupes + " already there" : "") +
        (unread ? " · " + unread + " line(s) not recognised" : ""));

  /* If a lot of the statement couldn't be read, say so and show the lines.
     Silently importing 7 rows out of 200 looks like the statement only had 7
     rows — the failure is invisible, which is the worst kind. */
  if (unread > fresh.length) {
    setTimeout(() => openImportReport(fresh.length, rows.skippedLines), 400);
  }
  return fresh.length;
}

/* Shows what the parser couldn't read, so a bad match rate is visible and
   fixable instead of silent. The lines can be handed straight to Blue Bonnet,
   which can usually read a layout the regex can't. */
function openImportReport(imported, skippedLines) {
  const sample = (skippedLines || []).slice(0, 60).join("\n");
  openModal(
    "<h3>Some of that statement didn't read cleanly</h3>" +
    '<p class="muted small">Imported <strong>' + imported + "</strong> transaction(s), but <strong>" +
      (skippedLines || []).length + "</strong> line(s) didn't match a pattern the app recognises. " +
      "Bank layouts vary a lot. Blue Bonnet can usually read them anyway.</p>" +
    '<div class="field"><label>Lines that were skipped</label>' +
      '<textarea rows="10" readonly style="width:100%;font-family:monospace;font-size:11px">' +
      escapeHtml(sample) + "</textarea></div>" +
    '<div class="modal-actions">' +
      '<button type="button" data-action="close-modal">Close</button>' +
      '<button type="button" class="btn-primary" data-action="skipped-to-bluebonnet">Ask Blue Bonnet to read these</button>' +
    "</div>"
  );
  window.__lastSkippedLines = skippedLines || [];
}

/* Charge Tracker

   Hands the whole transaction list to Blue Bonnet and asks for a proper
   walk-through: categorised, biggest first, with the small-but-frequent stuff
   called out — that's the spending people genuinely can't see, because no
   single charge looks like anything.

   The list is sent already masked (masking happens at import), and it's the
   user's own Worker, so nothing goes anywhere new. */
function runChargeTracker() {
  const txns = STATE.statementTxns || [];
  if (!txns.length) {
    toast("Nothing imported yet — upload a statement PDF or CSV first, then Charge Tracker will break it down.");
    return;
  }
  if (!window.BlueBonnet) { toast("Blue Bonnet isn't loaded on this page."); return; }
  if (!window.BlueBonnet.isConfigured || !window.BlueBonnet.isConfigured()) {
    toast("Set your Worker Proxy URL in Settings → Blue Bonnet first.");
    return;
  }

  /* Token discipline: the earlier version pasted up to 300 raw lines into the
     prompt. Once transactions are categorised, a per-merchant roll-up carries
     the same information in a fraction of the tokens — 200 transactions become
     ~40 merchant lines. The model gets better structure AND costs less. */
  const out = txns.filter((t) => Number(t.amount) < 0);
  const inflow = txns.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + t.amount, 0);
  const spent = out.reduce((s, t) => s + Math.abs(t.amount), 0);
  const dates = txns.map((t) => t.date).sort();
  const span = dates.length ? dates[0] + " to " + dates[dates.length - 1] : "";

  // merchant -> { count, total, category }
  const roll = new Map();
  out.forEach((t) => {
    const key = (t.description || "?") + "|" + (t.category || "Other");
    const cur = roll.get(key) || { count: 0, total: 0 };
    cur.count++; cur.total += Math.abs(t.amount);
    roll.set(key, cur);
  });
  const lines = Array.from(roll.entries())
    .map(([key, v]) => {
      const [name, cat] = key.split("|");
      return { name, cat, count: v.count, total: v.total };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 120)
    .map((r) => r.name + " [" + r.cat + "] x" + r.count + " = " + r.total.toFixed(2));

  const prompt =
    "Here's my spending, " + span + ". " + out.length + " charges, " +
    fmtMoney(spent) + " out, " + fmtMoney(inflow) + " in.\n" +
    "Grouped by merchant as: NAME [category] xCOUNT = TOTAL\n\n" +
    lines.join("\n") +
    "\n\nWalk me through it:\n" +
    "1. Totals and % by category, biggest first.\n" +
    "2. What the cryptic merchant names actually are.\n" +
    "3. Anything repeating — subscriptions and small frequent charges especially, since those are the ones I can't see.\n" +
    "4. Possible duplicate charges, fees, or things I've likely forgotten I'm paying for.\n" +
    "5. The two or three changes that would actually matter, with amounts.\n\n" +
    "Readable, not a lecture — I'm learning to handle a lot of transactions.";

  window.BlueBonnet.ask(prompt);
}

/* Turn a detected recurring charge into a real tracked bill. */
function recurringToBill(name) {
  const r = detectRecurring(STATE.statementTxns || []).find((x) => x.name === name);
  if (!r) { toast("Couldn't find that one — try importing again."); return; }
  if (STATE.bills.some((b) => b.name.toLowerCase() === r.name.toLowerCase())) {
    toast("You're already tracking " + r.name + " as a bill.");
    return;
  }
  STATE.bills.push({
    id: uid("bill"),
    name: r.name,
    amount: Number(r.typical) || 0,
    dueDay: Number((r.nextDate || todayISO()).slice(8, 10)) || 1,
    type: r.interval >= 25 ? "regular" : "discretionary",
    category: r.interval >= 25 ? "Other Regular" : "Other Discretionary",
    recurring: true,
    paidPeriods: {},
    calendarEventId: null,
  });
  persist();
  toast("Now tracking " + r.name + " as a bill (" + fmtMoney(r.typical) + ")");
}

function openStatementPasteModal(prefill) {
  openModal(
    "<h3>Paste statement text</h3>" +
    '<p class="muted small">' + (prefill
      ? "This is the text pulled out of your PDF. The rows didn't match a pattern the app recognizes, so either edit it down to the transaction lines and import, or copy it into Blue Bonnet and ask it to log them."
      : "Copy the transactions out of your statement and paste them here. Account numbers are masked automatically before anything is saved.") + "</p>" +
    '<form data-form="statement-paste">' +
      '<div class="field"><label>Statement text</label><textarea name="text" rows="12" placeholder="08/12/2026   STARBUCKS #123   -5.75" style="width:100%;font-family:monospace;font-size:12px">' + escapeHtml(prefill || "") + "</textarea></div>" +
      '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Import</button></div>' +
    "</form>"
  );
}

function openBnplModal(id) {
  const p = id ? findById(STATE.bnplPlans, id) : { service: "affirm", merchant: "", paymentAmount: "", paymentsRemaining: 4, everyDays: 14, nextDueDate: todayISO(), notes: "" };
  openModal(
    "<h3>" + (id ? "Edit payment plan" : "Add payment plan") + "</h3>" +
    (id ? "" : '<p class="muted small">Quicker option: paste your confirmation email into Blue Bonnet and ask it to add the plan.</p>') +
    '<form data-form="bnpl" data-id="' + (id || "") + '">' +
      '<div class="field-row">' +
        '<div class="field"><label>Service</label><select name="service">' +
          BNPL_SERVICES.map((s) => '<option value="' + s.id + '"' + (p.service === s.id ? " selected" : "") + ">" + s.name + "</option>").join("") +
          '<option value="other"' + (p.service === "other" ? " selected" : "") + ">Other</option>" +
        "</select></div>" +
        '<div class="field"><label>Merchant / what it was</label><input type="text" name="merchant" required value="' + escapeHtml(p.merchant) + '" placeholder="e.g. Peloton" /></div>' +
      "</div>" +
      '<div class="field-row">' +
        '<div class="field"><label>Payment amount</label><input type="number" step="0.01" name="paymentAmount" required value="' + escapeHtml(p.paymentAmount) + '" /></div>' +
        '<div class="field"><label>Payments left</label><input type="number" min="0" name="paymentsRemaining" required value="' + (p.paymentsRemaining != null ? p.paymentsRemaining : 4) + '" /></div>' +
      "</div>" +
      '<div class="field-row">' +
        '<div class="field"><label>Next payment due</label><input type="date" name="nextDueDate" required value="' + escapeHtml(p.nextDueDate || todayISO()) + '" /></div>' +
        '<div class="field"><label>Every (days)</label><select name="everyDays">' +
          [["14","Every 2 weeks"],["30","Monthly"],["7","Weekly"]].map(([v,l]) => '<option value="' + v + '"' + (String(p.everyDays || 14) === v ? " selected" : "") + ">" + l + "</option>").join("") +
        "</select></div>" +
      "</div>" +
      '<div class="field"><label>Notes (optional)</label><input type="text" name="notes" value="' + escapeHtml(p.notes || "") + '" /></div>' +
      '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Save</button></div>' +
    "</form>"
  );
}

/* Record that the next payment went through: one fewer remaining, and the due
   date rolls forward. Never auto-runs — the user confirms it actually cleared. */
function bnplMarkPaid(id) {
  const p = findById(STATE.bnplPlans, id);
  if (!p) return;
  const remaining = Number(p.paymentsRemaining) || 0;
  if (remaining <= 0) { toast("That plan's already paid off."); return; }
  p.paymentsRemaining = remaining - 1;
  p.nextDueDate = addDaysISO(p.nextDueDate, Number(p.everyDays) || 14);
  persist();
  toast(p.paymentsRemaining === 0 ? "That's the last one — " + p.merchant + " is paid off 🎉" : p.paymentsRemaining + " payment(s) left on " + p.merchant);
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
  const key = currentBillingPeriodKey();
  const wasAllPaid = STATE.bills.length > 0 && STATE.bills.every((b) => (b.paidPeriods || {})[key]);
  const b = findById(STATE.bills, id);
  b.paidPeriods = b.paidPeriods || {};
  b.paidPeriods[key] = !b.paidPeriods[key];
  const isAllPaidNow = STATE.bills.every((b2) => (b2.paidPeriods || {})[key]);
  persist();
  if (isAllPaidNow && !wasAllPaid) showPraise("budget");
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
      '<div class="muted small">' + a.recurrence.type + ' · resets ' + recurrenceAdverb(a.recurrence.type) + " · due " + fmtDate(a.dueDate) + (overdue ? " · <span style=\"color:var(--attention)\">overdue</span>" : "") + "</div>" +
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
    (status === "done" ? '<div class="reassure" style="margin-bottom:12px"><span class="icon">✅</span> All done here. Nothing left ' + recurrenceCadencePhrase(a.recurrence.type) + '.</div>' : "") +
    '<ul class="checklist">' + items + "</ul>" +
    '<form class="row" data-form="add-asset-item" data-id="' + a.id + '" style="margin-top:8px"><input type="text" name="text" placeholder="Add a checklist item" style="flex:1" /><button class="btn-sm" type="submit">Add</button></form>' +
    '<div class="hr"></div>' +
    '<label class="row" style="margin-bottom:10px">How often <select data-action="change-asset-recurrence" data-id="' + a.id + '" style="margin-left:6px">' +
      '<option value="daily"' + (a.recurrence.type === "daily" ? " selected" : "") + '>Daily</option>' +
      '<option value="weekly"' + (a.recurrence.type === "weekly" ? " selected" : "") + '>Weekly</option>' +
      '<option value="monthly"' + (a.recurrence.type === "monthly" ? " selected" : "") + '>Monthly</option>' +
    "</select></label>" +
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
    '<div class="field"><label>How often does it need doing?</label><select name="recurrence"><option value="daily">Daily</option><option value="weekly" selected>Weekly</option><option value="monthly">Monthly</option></select></div>' +
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
  const wasDone = computeStatus(a.items) === "done";
  a.items[index].checked = !a.items[index].checked;
  const isDoneNow = computeStatus(a.items) === "done";
  if (isDoneNow) a.completedAt = new Date().toISOString();
  persist();
  if (isDoneNow && !wasDone) showPraise("household");
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

function setAssetSignalUp(id, val) { findById(STATE.assets, id).signalUp = val; persist(); if (val) showPraise("signalUp"); }
function deleteAsset(id) { STATE.assets = STATE.assets.filter((a) => a.id !== id); persist(); }

// Switching an existing area's cadence (e.g. weekly -> daily) needs its
// period recomputed right away, not just on the next natural rollover —
// otherwise it'd keep showing this week's/month's stale due date and
// checked state under the new cadence. refreshRecurringTask already resets
// cleanly whenever currentPeriodKey doesn't match the freshly computed
// period for the (now different) recurrence type, so forcing it stale
// here is enough to make that happen immediately.
function changeAssetRecurrence(id, type) {
  const a = findById(STATE.assets, id);
  if (!a || a.recurrence.type === type) return;
  a.recurrence.type = type;
  a.currentPeriodKey = null;
  refreshRecurringTask(a);
  persist();
  toast("Now resets " + recurrenceAdverb(type) + ".");
}

async function syncAssetCalendar(id) {
  const a = findById(STATE.assets, id);
  const rrule = a.recurrence.type === "daily" ? "RRULE:FREQ=DAILY" : a.recurrence.type === "weekly" ? "RRULE:FREQ=WEEKLY;BYDAY=SU" : "RRULE:FREQ=MONTHLY;BYMONTHDAY=" + new Date(a.dueDate + "T00:00:00").getDate();
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
    const emoji = typeof groceryEmoji === "function" ? groceryEmoji(g.name) : "🍽️";
    const qty = g.qty || 1;
    const useControls = qty > 1
      ? '<form class="row" data-form="grocery-use" data-id="' + g.id + '" style="gap:4px;align-items:center;display:inline-flex">' +
          '<select name="amount" style="width:56px">' + Array.from({ length: qty }, (_, i) => i + 1).map((n) => '<option value="' + n + '">' + n + "</option>").join("") + "</select>" +
          '<button class="btn-sm" type="submit">Use</button></form>'
      : '<button class="btn-sm" data-action="mark-grocery-used" data-id="' + g.id + '">Used it</button>';
    return "<tr>" +
      "<td>" + emoji + " " + escapeHtml(g.name) + (qty > 1 ? ' <span class="muted small">×' + qty + "</span>" : "") + "</td>" +
      "<td class=\"muted small\">" + fmtDate(g.purchaseDate) + "</td>" +
      "<td>" + fmtDate(g.expirationDate) + "</td>" +
      "<td><span class=\"status-pill " + (s === "expired" ? "attention" : s === "soon" ? "partial" : "done") + '">' + label + "</span></td>" +
      "<td><div class=\"row\">" +
        useControls +
        '<button class="btn-sm btn-danger" data-action="mark-grocery-thrown" data-id="' + g.id + '">Toss</button>' +
      "</div></td></tr>";
  }

  return '<h1>Groceries</h1><p class="page-sub">Log what you buy, and Adulting tracks when to use it before it goes bad.</p>' +
    '<div class="row" style="margin-bottom:16px"><button class="btn-primary" data-action="open-add-grocery-modal">+ Add groceries</button></div>' +
    (active.length ? '<div class="card"><table><thead><tr><th>Item</th><th>Bought</th><th>Use by</th><th>Status</th><th></th></tr></thead><tbody>' + active.map(row).join("") + "</tbody></table></div>"
      : emptyState("🛒", "Nothing tracked yet", "Add groceries as you buy them and set an expiration date.")) +
    (resolved.length ? '<div class="section-title">Used / thrown out (' + resolved.length + ')</div><div class="card"><table><tbody>' +
      resolved.slice(-10).reverse().map((g) => "<tr><td>" + (typeof groceryEmoji === "function" ? groceryEmoji(g.name) : "🍽️") + " " + escapeHtml(g.name) + "</td><td class=\"muted small\">" + (g.used ? "Used" : "Thrown out") + "</td><td><button class=\"btn-sm\" data-action=\"delete-grocery\" data-id=\"" + g.id + "\">Remove</button></td></tr>").join("") +
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

function markGroceryUsed(id) {
  const g = findById(STATE.groceries, id);
  const usedBeforeExpiry = groceryStatus(g) !== "expired";
  g.used = true;
  persist();
  if (usedBeforeExpiry) showPraise("grocery");
}

// Decrement a specific quantity (e.g. "use 2 of the 6 salmon pieces") rather
// than resolving the whole entry at once. Only marks it fully used/resolved
// once the quantity actually reaches zero.
function useGroceryQty(id, amount) {
  const g = findById(STATE.groceries, id);
  const qty = g.qty || 1;
  amount = Math.max(1, Math.min(Number(amount) || 1, qty));
  const usedBeforeExpiry = groceryStatus(g) !== "expired";
  g.qty = qty - amount;
  if (g.qty <= 0) { g.qty = 0; g.used = true; }
  persist();
  if (usedBeforeExpiry) showPraise("grocery");
}
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
      '<button class="btn-sm" data-action="edit-vehicle-task" data-id="' + v.id + '" data-task="' + t.id + '" title="Edit due date/mileage">✏️</button>' +
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
    '<h3>Add vehicle</h3><form data-form="vehicle-step1">' +
    '<div class="field"><label>Name (e.g. Honda Civic)</label><input type="text" name="name" required /></div>' +
    '<div class="field-row"><div class="field"><label>Year</label><input type="number" name="year" /></div><div class="field"><label>Make</label><input type="text" name="make" /></div><div class="field"><label>Model</label><input type="text" name="model" /></div></div>' +
    '<div class="field"><label>Current mileage</label><input type="number" name="mileage" value="0" /></div>' +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Next: review dates</button></div></form>'
  );
}

// Step 1: collect the vehicle basics, then move to a review step where every
// default maintenance task's due date can be adjusted before anything is
// actually added to the main task list.
function addVehicleStep1(form) {
  const data = collectFormData(form);
  if (!data.name) return;
  pendingVehicleDraft = { name: data.name, year: data.year || "", make: data.make || "", model: data.model || "", mileage: Number(data.mileage) || 0 };
  openVehicleTaskReviewModal();
}

function openVehicleTaskReviewModal() {
  const v = pendingVehicleDraft;
  if (!v) return;
  const rows = DEFAULT_VEHICLE_TASKS.map((t, i) => {
    const defaultDate = t.intervalDays ? addDaysISO(todayISO(), t.intervalDays) : "";
    return '<div class="field-row" style="align-items:flex-end">' +
      '<div class="field" style="flex:2"><label>' + escapeHtml(t.title) + "</label></div>" +
      (t.intervalDays
        ? '<div class="field"><input type="date" name="date_' + i + '" value="' + defaultDate + '" /></div>'
        : '<div class="field muted small" style="padding-bottom:8px">Mileage-based (' + (t.intervalMiles || 0).toLocaleString() + " mi)</div>") +
      "</div>";
  }).join("");
  openModal(
    '<h3>Review maintenance dates</h3>' +
    '<p class="muted small">Adjust any due dates before adding <strong>' + escapeHtml(v.name) + "</strong> — nothing is on the task list yet. Mileage-based tasks are calculated from the mileage you just entered.</p>" +
    '<form data-form="vehicle-step2">' + rows +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Add vehicle</button></div></form>'
  );
}

function addVehicleStep2(form) {
  const draft = pendingVehicleDraft;
  if (!draft) return;
  const data = collectFormData(form);
  const tasks = DEFAULT_VEHICLE_TASKS.map((t, i) => ({
    id: uid("vtask"), title: t.title,
    intervalDays: t.intervalDays || null, intervalMiles: t.intervalMiles || null,
    lastDoneDate: null, lastDoneMileage: null,
    dueDate: t.intervalDays ? (data["date_" + i] || addDaysISO(todayISO(), t.intervalDays)) : null,
    dueMileage: t.intervalMiles ? draft.mileage + t.intervalMiles : null,
    needsAttention: { flag: false, note: "" }, calendarEventId: null,
  }));
  STATE.vehicles.push({ id: uid("vehicle"), name: draft.name, year: draft.year, make: draft.make, model: draft.model, mileage: draft.mileage, tasks });
  pendingVehicleDraft = null;
  closeModal(); persist(); toast("Added " + draft.name);
}

// Direct edit of a single task's due date/mileage after the vehicle already
// exists — the ongoing "dates can be changed freely" control.
function openEditVehicleTaskModal(vehicleId, taskId) {
  const v = findById(STATE.vehicles, vehicleId);
  const t = findById(v.tasks, taskId);
  openModal(
    '<h3>Edit "' + escapeHtml(t.title) + '"</h3><form data-form="edit-vehicle-task" data-id="' + vehicleId + '" data-task="' + taskId + '">' +
    (t.intervalDays != null || t.dueDate ? '<div class="field"><label>Due date</label><input type="date" name="dueDate" value="' + (t.dueDate || "") + '" /></div>' : "") +
    (t.intervalMiles != null || t.dueMileage != null ? '<div class="field"><label>Due mileage</label><input type="number" name="dueMileage" value="' + (t.dueMileage != null ? t.dueMileage : "") + '" /></div>' : "") +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Save</button></div></form>'
  );
}

function saveVehicleTaskEdit(form) {
  const { id, task } = form.dataset;
  const v = findById(STATE.vehicles, id);
  const t = findById(v.tasks, task);
  const data = collectFormData(form);
  if ("dueDate" in data) t.dueDate = data.dueDate || null;
  if ("dueMileage" in data) t.dueMileage = data.dueMileage !== "" ? Number(data.dueMileage) : null;
  closeModal(); persist(); toast("Updated " + t.title);
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
  showPraise("vehicle");
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
    '<form class="row" data-form="add-trip-item" data-id="' + trip.id + '" data-phase="' + phase + '" style="margin:6px 0"><input type="text" name="text" placeholder="Add an item" style="flex:1" /><button class="btn-sm" type="submit">Add</button></form>' +
    '<button class="btn-sm btn-ghost" data-action="focus-mode" data-id="' + trip.id + '" data-phase="' + phase + '">🎯 Focus mode (one item at a time)</button>';
}

function renderTripDetail(t) {
  return '<div class="hr"></div>' +
    phaseBlock(t, "prep", "Before the trip") +
    '<div class="hr"></div>' + phaseBlock(t, "packing", "Packing list") +
    '<div class="hr"></div>' + phaseBlock(t, "departureDay", "Departure day") +
    '<div class="hr"></div>' +
    '<div class="row" style="flex-wrap:wrap">' +
      '<button class="btn-sm" data-action="edit-trip-dates" data-id="' + t.id + '">✏️ Edit dates</button>' +
      '<button class="btn-sm btn-danger" data-action="open-attention-modal" data-domain="trip" data-id="' + t.id + '">🚩 Flag needs attention</button>' +
      '<button class="btn-sm" data-action="sync-trip-calendar" data-id="' + t.id + '">📅 Sync prep dates to calendar</button>' +
      '<button class="btn-sm btn-ghost" data-action="delete-trip" data-id="' + t.id + '">Delete trip</button>' +
    "</div>";
}

function addTripItem(form) {
  const { id, phase } = form.dataset;
  const text = collectFormData(form).text;
  if (!text) return;
  const t = findById(STATE.trips, id);
  t[phase].push(phase === "prep" ? { text, checked: false, dueDate: null } : { text, checked: false });
  persist();
}

function openEditTripModal(id) {
  const t = findById(STATE.trips, id);
  openModal(
    '<h3>Edit trip dates</h3><form data-form="edit-trip" data-id="' + id + '">' +
    '<div class="field-row"><div class="field"><label>Start date</label><input type="date" name="startDate" value="' + (t.startDate || "") + '" required /></div><div class="field"><label>End date</label><input type="date" name="endDate" value="' + (t.endDate || "") + '" /></div></div>' +
    '<p class="muted small">Any existing prep due-dates will shift along with the new start date, so the lead-time (e.g. "7 days before") stays the same.</p>' +
    '<div class="modal-actions"><button type="button" data-action="close-modal">Cancel</button><button type="submit" class="btn-primary">Save</button></div></form>'
  );
}

function saveTripDatesEdit(form) {
  const id = form.dataset.id;
  const t = findById(STATE.trips, id);
  const data = collectFormData(form);
  const oldStart = t.startDate;
  const newStart = data.startDate;
  if (oldStart && newStart && oldStart !== newStart) {
    const delta = daysBetween(oldStart, newStart);
    t.prep.forEach((p) => { if (p.dueDate) p.dueDate = addDaysISO(p.dueDate, delta); });
  }
  t.startDate = newStart;
  t.endDate = data.endDate || "";
  closeModal(); persist(); toast("Trip dates updated");
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
  const wasDone = tripProgress(t).status === "done";
  t[phase][index].checked = !t[phase][index].checked;
  const isDoneNow = tripProgress(t).status === "done";
  persist();
  if (isDoneNow && !wasDone) showPraise("travel");
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
      '<label class="row small" style="margin-top:10px"><input type="checkbox" name="autoImportCalendar" data-action="toggle-auto-import" ' + (STATE.settings.autoImportCalendar ? "checked" : "") + ' style="width:18px;height:18px" /> Import matches automatically, without asking each time</label>' +
      '<div class="hr"></div><div class="row between"><div><strong class="small">Cross-device sync</strong><div class="muted small">Your data is saved to your own Google Drive (a private folder only this app can see) and loaded automatically on any device you sign in on with this same Google account.</div></div><button class="btn-sm" data-action="sync-drive-now">Sync now</button></div>'
      : "") +
    "</div>" +

    '<div class="card" style="max-width:560px;margin-bottom:20px"><h2>Blue Bonnet Assistant</h2>' +
    '<p class="small muted">The chat bubble in the corner is Blue Bonnet — an organizing assistant scoped to this app, with real advice for ADHD/autism-friendly systems. It runs through your own Cloudflare Worker proxy (so your Anthropic API key never sits in this file). It automatically hides while Board view is open.</p>' +
    '<form data-form="settings-bluebonnet"><div class="field"><label>Worker Proxy URL</label><input type="text" name="blueBonnetProxyUrl" value="' + escapeHtml(STATE.settings.blueBonnetProxyUrl || "") + '" placeholder="https://your-worker.your-subdomain.workers.dev" /></div>' +
    '<label class="row small" style="margin-bottom:10px"><input type="checkbox" name="blueBonnetPraise" ' + (STATE.settings.blueBonnetPraise !== false ? "checked" : "") + ' style="width:18px;height:18px" /> Show little encouragement bubbles when you finish something</label>' +
    '<label class="row small" style="margin-bottom:10px"><input type="checkbox" name="blueBonnetCheckins" ' + (STATE.settings.blueBonnetCheckins !== false ? "checked" : "") + ' style="width:18px;height:18px" /> Let Blue Bonnet check in on its own every few hours (only while connected; never forces the chat open, just leaves a quiet badge)</label>' +
    '<div class="field" style="max-width:180px"><label>Check in every (hours)</label><input type="number" min="1" max="24" name="blueBonnetCheckinHours" value="' + (STATE.settings.blueBonnetCheckinHours || 3) + '" /></div>' +
    '<button type="submit" class="btn-sm">Save</button></form></div>' +

    '<div class="card" style="max-width:560px;margin-bottom:20px"><h2>Notifications</h2>' +
    '<p class="small muted">Real popup notifications for encouragement bubbles and Blue Bonnet check-ins — but only while this tab is open somewhere (even minimized or behind another window). Closing the tab or browser stops them; this app has no background server to send them otherwise.</p>' +
    '<div class="row" style="align-items:center;gap:10px">' +
    (typeof Notification === "undefined" ? '<span class="status-pill none">Not supported in this browser</span>' :
      Notification.permission === "granted" ? '<span class="status-pill done">Enabled</span>' :
      Notification.permission === "denied" ? '<span class="status-pill none">Blocked — allow in your browser\'s site settings</span>' :
      '<button class="btn-sm btn-primary" data-action="enable-notifications">Enable notifications</button>') +
    "</div></div>" +

    '<div class="card" style="max-width:560px;margin-bottom:20px"><h2>Your data</h2>' +
    '<p class="small muted">Everything is stored locally in this browser. Back it up or move it to another device with export/import.</p>' +
    '<div class="row"><button class="btn-sm" data-action="export-data">Export backup (.json)</button>' +
    '<label class="btn-sm" style="display:inline-block"><input type="file" id="importFile" accept="application/json" style="display:none" /> Import backup</label>' +
    '<button class="btn-sm btn-danger" data-action="reset-data">Reset all data</button></div></div>' +

    '<div class="card" style="max-width:560px"><h2>About this app</h2>' +
    '<p class="small muted">Adulting is designed to be calm and predictable: consistent status colors everywhere, short checklists broken into small steps, and a clear "you’re caught up" state instead of nagging. Built with ADHD, autistic, and other neurodivergent users in mind.</p>' +
    '<p class="small muted" style="margin-top:8px"><a href="?demo=1" target="_blank" rel="noopener">Open a live demo with sample data →</a> (safe to share — never touches real saved data)</p></div>';
}

function saveBlueBonnetSettings(form) {
  const data = collectFormData(form);
  STATE.settings.blueBonnetProxyUrl = data.blueBonnetProxyUrl || "";
  STATE.settings.blueBonnetPraise = !!data.blueBonnetPraise;
  STATE.settings.blueBonnetCheckins = !!data.blueBonnetCheckins;
  STATE.settings.blueBonnetCheckinHours = Math.max(1, Number(data.blueBonnetCheckinHours) || 3);
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
  // Pull whatever's currently typed in the Client ID / Calendar ID fields
  // into STATE first — clicking Connect right after editing the field
  // (without a separate Save click) used to silently connect with the
  // OLD stored value, which looked identical to the field but produced a
  // confusing "invalid_client" error. Connect now always saves first.
  const form = $('form[data-form="settings-calendar"]');
  if (form) {
    const data = collectFormData(form);
    if (data.googleClientId) STATE.settings.googleClientId = data.googleClientId;
    if (data.defaultCalendarId) STATE.settings.defaultCalendarId = data.defaultCalendarId;
    saveState(STATE);
  }
  if (!STATE.settings.googleClientId) { toast("Enter your Google OAuth Client ID first."); return; }
  try {
    await Calendar.init(STATE.settings.googleClientId);
    await Calendar.connect();
    toast("Connected to Google Calendar");
    render();
    try {
      await syncFromDriveIfNewer({ surfaceErrors: true });
    } catch (syncErr) {
      toast(syncErr.message);
    }
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
    '<p class="muted small" style="margin-top:6px"><a href="?demo=1">See a live demo with sample data first →</a></p>' +
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
    await syncFromDriveIfNewer();
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
    case "open-bnpl-modal": openBnplModal(id || null); break;
    case "bnpl-mark-paid": bnplMarkPaid(id); break;
    case "delete-bnpl":
      if (confirm("Delete this payment plan? This only removes it from the app — it doesn't cancel anything with the lender.")) {
        STATE.bnplPlans = STATE.bnplPlans.filter((p) => p.id !== id);
        persist();
        toast("Payment plan removed");
      }
      break;
    case "open-statement-paste": openStatementPasteModal(); break;
    case "statement-view": statementView = id; render(); break;
    case "toggle-category": {
      const key = "cat_" + id;
      if (expandedIds.has(key)) expandedIds.delete(key); else expandedIds.add(key);
      render();
      break;
    }
    case "charge-tracker": runChargeTracker(); break;
    case "open-budget-options": openBudgetOptions(); break;
    case "choose-budget": chooseBudget(id); break;
    case "edit-cap": openEditCap(decodeURIComponent(id)); break;
    case "set-tab-statements": statementView = "categories"; render(); break;
    case "ask-bluebonnet-budget":
      if (window.BlueBonnet && window.BlueBonnet.isConfigured && window.BlueBonnet.isConfigured()) {
        window.BlueBonnet.ask("Look at my budget and this month's spending and tell me honestly how it's going. If a category is set unrealistically, say so and suggest a better number.");
      } else toast("Set your Worker Proxy URL in Settings → Blue Bonnet first.");
      break;
    case "skipped-to-bluebonnet": {
      const lines = window.__lastSkippedLines || [];
      closeModal();
      if (!window.BlueBonnet || !window.BlueBonnet.isConfigured || !window.BlueBonnet.isConfigured()) {
        toast("Set your Worker Proxy URL in Settings → Blue Bonnet first.");
        break;
      }
      window.BlueBonnet.ask(
        "These lines are from my bank statement but the app couldn't parse them. " +
        "Read them and log every transaction you can identify with log_transactions " +
        "(negative for money out). Skip anything that isn't a transaction.\n\n" +
        lines.slice(0, 200).join("\n"));
      break;
    }
    case "recurring-to-bill": recurringToBill(decodeURIComponent(id)); break;
    case "clear-statement-txns":
      if (confirm("Clear all imported transactions? Your bills and payment plans aren't affected.")) {
        STATE.statementTxns = [];
        STATE.statementImports = [];
        persist();
        toast("Transactions cleared");
      }
      break;
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
    case "edit-vehicle-task": openEditVehicleTaskModal(id, el.dataset.task); break;
    case "delete-vehicle": if (confirm("Delete this vehicle?")) deleteVehicle(id); break;
    case "sync-vehicle-task-calendar": syncVehicleTaskCalendar(id, el.dataset.task); break;
    case "open-add-trip-modal": openAddTripModal(); break;
    case "toggle-trip-open": toggleTripOpen(id); break;
    case "edit-trip-dates": openEditTripModal(id); break;
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
    case "enter-board-mode": enterBoardMode(); break;
    case "exit-board-mode": exitBoardMode(); break;
    case "set-theme": setTheme(el.dataset.theme); break;
    case "set-icon-style": setIconStyle(el.dataset.style); break;
    case "run-calendar-import": runCalendarImport(); break;
    case "open-import-review": openImportReviewModal(); break;
    case "onboarding-skip": skipOnboarding(); break;
    case "onboarding-connect": onboardingConnect(); break;
    case "enable-notifications": enableNotifications(); break;
    case "sync-drive-now":
      syncFromDriveIfNewer({ surfaceErrors: true })
        .then((r) => toast(r.pulled ? "Loaded your latest data from Google Drive" : "This device's data is saved to Google Drive"))
        .catch((e) => toast(e.message));
      break;
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
    case "change-asset-recurrence": changeAssetRecurrence(id, el.value); break;
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
    case "grocery-use": useGroceryQty(form.dataset.id, collectFormData(form).amount); break;
    case "vehicle-step1": addVehicleStep1(form); break;
    case "vehicle-step2": addVehicleStep2(form); break;
    case "edit-vehicle-task": saveVehicleTaskEdit(form); break;
    case "update-mileage": updateVehicleMileage(form); break;
    case "trip": addTripForm(form); break;
    case "add-trip-item": addTripItem(form); form.reset(); break;
    case "edit-trip": saveTripDatesEdit(form); break;
    case "settings-general": saveGeneralSettings(form); break;
    case "settings-calendar": saveCalendarSettings(form); break;
    case "onboarding-calendar": onboardingConnect(); break;
    case "import-review": saveImportReviewForm(form); break;
    case "settings-bluebonnet": saveBlueBonnetSettings(form); break;
    case "bnpl": saveBnplForm(form); break;
    case "edit-cap": {
      const name = form.dataset.id;
      const v = Math.max(0, Number(collectFormData(form).cap) || 0);
      STATE.budget.categories = STATE.budget.categories || {};
      STATE.budget.categories[name] = v;
      persist();
      closeModal();
      toast(name + " set to " + fmtMoney(v));
      break;
    }
    case "statement-paste": {
      const text = collectFormData(form).text || "";
      closeModal();
      if (STATE.settings && STATE.settings.blueBonnetProxyUrl) extractStatementWithAI(text, "Pasted " + fmtDate(todayISO()));
      else importStatementText(text, "Pasted " + fmtDate(todayISO()));
      break;
    }
  }
}

function saveBnplForm(form) {
  const d = collectFormData(form);
  const id = form.dataset.id;
  const plan = {
    id: id || uid(),
    service: d.service || "other",
    merchant: (d.merchant || "").trim(),
    paymentAmount: Number(d.paymentAmount) || 0,
    paymentsRemaining: Math.max(0, Number(d.paymentsRemaining) || 0),
    everyDays: Number(d.everyDays) || 14,
    nextDueDate: d.nextDueDate || todayISO(),
    notes: (d.notes || "").trim(),
  };
  if (id) {
    const i = STATE.bnplPlans.findIndex((p) => p.id === id);
    if (i >= 0) STATE.bnplPlans[i] = plan;
  } else {
    STATE.bnplPlans.push(plan);
  }
  persist();
  closeModal();
  toast(id ? "Payment plan updated" : "Payment plan added");
}

function switchTab(tab) { currentTab = tab; expandedIds.clear(); render(); }

function wireEvents() {
  document.body.addEventListener("click", (e) => {
    // Match on the real [data-tab] marker, not the shared ".nav-item" CSS
    // class — the Board view nav button also has class="nav-item" (for the
    // same look) but no data-tab, since it's not a real tab. Matching on
    // the class swallowed its click here before data-action ever got a
    // chance to run it, silently no-oping instead of opening board mode.
    const navBtn = e.target.closest("[data-tab]");
    if (navBtn && navBtn.classList.contains("nav-item")) { switchTab(navBtn.dataset.tab); return; }
    const actionEl = e.target.closest("[data-action]");
    if (actionEl) handleAction(actionEl, e);
  });
  document.body.addEventListener("change", (e) => {
    const actionEl = e.target.closest("[data-action]");
    if (actionEl) handleChange(actionEl);
    if (e.target.id === "importFile" && e.target.files[0]) importDataFile(e.target.files[0]);
    // Bank statement upload. Delegated (not bound directly) because the input
    // is re-created on every render, which would drop a direct listener.
    // The file is read here in the browser and then discarded — only the
    // parsed, masked transactions are ever saved.
    if (e.target.id === "statementFile" && e.target.files[0]) {
      const file = e.target.files[0];
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        importStatementPdf(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          if (STATE.settings && STATE.settings.blueBonnetProxyUrl) extractStatementWithAI(reader.result, file.name);
          else importStatementText(reader.result, file.name);
        };
        reader.onerror = () => toast("Couldn't read that file.");
        reader.readAsText(file);
      }
      e.target.value = ""; // let the same file be picked again later
    }
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
// AdultingActions — the public "do things" surface for Blue Bonnet
// ===========================================================================
// Deliberately additive/completion-only: nothing here deletes or resets
// data. Delete/reset stay manual, deliberate actions in the UI only — an
// assistant acting on a misread request should never be able to destroy
// something. Every method takes a plain data object (no DOM forms) and
// returns { ok, message } so a caller (Blue Bonnet) can report back plainly.
function fuzzyFind(list, name, key) {
  if (!name) return null;
  const n = String(name).toLowerCase().trim();
  return (
    list.find((x) => String(x[key] || "").toLowerCase().trim() === n) ||
    list.find((x) => String(x[key] || "").toLowerCase().includes(n)) ||
    list.find((x) => n.includes(String(x[key] || "").toLowerCase()) && x[key]) ||
    null
  );
}

const AdultingActions = {
  addBill(data) {
    if (!data || !data.name || data.amount == null) return { ok: false, message: "Need at least a name and an amount." };
    const type = data.type === "discretionary" ? "discretionary" : "regular";
    const category = data.category || (type === "regular" ? "Other Regular" : "Other Discretionary");
    STATE.bills.push({
      id: uid("bill"), name: String(data.name), amount: Number(data.amount) || 0,
      dueDay: Math.min(31, Math.max(1, Number(data.dueDay) || 1)), type, category,
      recurring: data.recurring !== false, paidPeriods: {}, calendarEventId: null,
    });
    persist();
    return { ok: true, message: `Added bill "${data.name}" (${fmtMoney(data.amount)}, ${type}).` };
  },

  markBillPaid(data) {
    const b = fuzzyFind(STATE.bills, data && data.billName, "name");
    if (!b) return { ok: false, message: `No bill found matching "${data && data.billName}".` };
    const key = currentBillingPeriodKey();
    b.paidPeriods = b.paidPeriods || {};
    const wasAllPaid = STATE.bills.length > 0 && STATE.bills.every((x) => (x.paidPeriods || {})[key]);
    b.paidPeriods[key] = true;
    const isAllPaidNow = STATE.bills.every((x) => (x.paidPeriods || {})[key]);
    persist();
    if (isAllPaidNow && !wasAllPaid) showPraise("budget");
    return { ok: true, message: `Marked "${b.name}" paid for this period.` };
  },

  /* Add a buy-now-pay-later plan. Built for the paste-a-confirmation-email
     flow: Blue Bonnet reads the email, pulls out the terms, and calls this. */
  addPaymentPlan(data) {
    if (!data || !data.merchant || data.paymentAmount == null) {
      return { ok: false, message: "Need at least the merchant and the payment amount." };
    }
    const plan = {
      id: uid("bnpl"),
      service: (data.service || "other").toLowerCase(),
      merchant: String(data.merchant),
      paymentAmount: Number(data.paymentAmount) || 0,
      paymentsRemaining: Math.max(0, Number(data.paymentsRemaining) || 0),
      everyDays: Number(data.everyDays) || 14,
      nextDueDate: data.nextDueDate || todayISO(),
      notes: data.notes ? String(data.notes) : "",
    };
    STATE.bnplPlans.push(plan);
    persist();
    const total = plan.paymentAmount * plan.paymentsRemaining;
    return {
      ok: true,
      message: `Added ${bnplServiceName(plan.service)} plan for ${plan.merchant}: ` +
        `${fmtMoney(plan.paymentAmount)} × ${plan.paymentsRemaining} (${fmtMoney(total)} left), next on ${plan.nextDueDate}.`,
    };
  },

  /* Record that a plan's payment cleared: one fewer left, date rolls forward. */
  markPaymentPlanPaid(data) {
    const p = fuzzyFind(STATE.bnplPlans, data && data.merchant, "merchant");
    if (!p) return { ok: false, message: `No payment plan found matching "${data && data.merchant}".` };
    if ((Number(p.paymentsRemaining) || 0) <= 0) return { ok: false, message: `${p.merchant} is already paid off.` };
    p.paymentsRemaining = Number(p.paymentsRemaining) - 1;
    p.nextDueDate = addDaysISO(p.nextDueDate, Number(p.everyDays) || 14);
    persist();
    return {
      ok: true,
      message: p.paymentsRemaining === 0
        ? `${p.merchant} is paid off.`
        : `${p.merchant}: ${p.paymentsRemaining} payment(s) left, next on ${p.nextDueDate}.`,
    };
  },

  /* Log transactions read out of a statement the user pasted into the chat.
     Descriptions get masked here too, so this path can't sneak a full account
     number into storage either. */
  logTransactions(data) {
    const rows = (data && Array.isArray(data.transactions)) ? data.transactions : [];
    if (!rows.length) return { ok: false, message: "No transactions to log." };
    const seen = new Set((STATE.statementTxns || []).map((t) => t.date + "|" + t.description + "|" + t.amount));
    let added = 0;
    rows.forEach((r) => {
      const date = normalizeDate(r.date) || r.date;
      const description = maskSensitive(r.description || "");
      const amount = Number(r.amount);
      if (!date || isNaN(amount)) return;
      const key = date + "|" + description + "|" + amount;
      if (seen.has(key)) return;
      seen.add(key);
      STATE.statementTxns.push({ id: uid("txn"), date, description, amount });
      added++;
    });
    if (!added) return { ok: false, message: "Those were all already logged." };
    STATE.statementImports.push({ id: uid("imp"), label: data.label || "Via Blue Bonnet", count: added, importedAt: Date.now() });
    persist();
    return { ok: true, message: `Logged ${added} transaction(s) to the Budget tab.` };
  },

  /* Budget building, for Blue Bonnet. It can create and adjust a budget, but
     never wipes one — same rule as everywhere else in here. */
  buildBudget(data) {
    const cats = (data && data.categories) || {};
    const names = Object.keys(cats);
    if (!names.length) return { ok: false, message: "Need at least one category and amount." };
    STATE.budget = Object.assign({}, STATE.budget, {
      active: true,
      method: data.method || "blue-bonnet",
      income: Number(data.income) || STATE.budget.income || 0,
      categories: Object.assign({}, STATE.budget.categories || {}, cats),
      createdAt: STATE.budget.createdAt || new Date().toISOString(),
      notes: data.notes || STATE.budget.notes || "",
    });
    persist();
    const total = names.reduce((s2, k) => s2 + (Number(cats[k]) || 0), 0);
    return { ok: true, message: "Budget set across " + names.length + " categories, " + fmtMoney(total) + "/month." };
  },

  setCategoryBudget(data) {
    if (!data || !data.category || data.amount == null) return { ok: false, message: "Need a category and an amount." };
    STATE.budget.categories = STATE.budget.categories || {};
    STATE.budget.categories[data.category] = Math.max(0, Number(data.amount) || 0);
    STATE.budget.active = true;
    persist();
    return { ok: true, message: data.category + " set to " + fmtMoney(data.amount) + "/month." };
  },

  /* Read-only: lets Blue Bonnet answer "how am I doing" with real numbers
     instead of guessing from the chat context. */
  getBudgetStatus() {
    if (!STATE.budget || !STATE.budget.active) return { ok: true, message: "No budget set yet." };
    const p = budgetProgress(STATE);
    const lines = p.rows.filter((r) => r.cap > 0)
      .map((r) => r.name + ": " + r.spent.toFixed(2) + " of " + r.cap.toFixed(2) + " (" + r.status + ")");
    return {
      ok: true,
      message: "Day " + p.dayOfMonth + " of " + p.daysInMonth + ". " +
        p.totalSpent.toFixed(2) + " of " + p.totalCap.toFixed(2) + " used. " +
        (p.overBy > 0 ? "Flexible budget is used up, over by " + p.overBy.toFixed(2) + ". "
                      : "Safe to spend today: " + (p.safeToSpendToday || 0).toFixed(2) + ". ") +
        lines.join("; "),
    };
  },

  addHouseholdArea(data) {
    if (!data || !data.name) return { ok: false, message: "Need a name for the area." };
    const template = data.templateKey ? DEFAULT_HOUSEHOLD_ASSETS.find((t) => t.key === data.templateKey) : null;
    const items = template ? template.items.map((text) => ({ text, checked: false })) : (Array.isArray(data.items) ? data.items.map((text) => ({ text, checked: false })) : []);
    const asset = {
      id: uid("asset"), name: data.name, icon: template ? template.icon : "🏷️", key: template ? template.key : "custom",
      recurrence: { type: data.recurrence === "monthly" ? "monthly" : data.recurrence === "daily" ? "daily" : "weekly", interval: 1 },
      items, currentPeriodKey: null, dueDate: null, signalUp: false, completedAt: null,
      needsAttention: { flag: false, note: "" }, calendarEventId: null,
    };
    refreshRecurringTask(asset);
    STATE.assets.push(asset);
    persist();
    return { ok: true, message: `Added household area "${data.name}"${items.length ? " with " + items.length + " checklist item(s)" : ""}.` };
  },

  checkHouseholdItem(data) {
    const a = fuzzyFind(STATE.assets, data && data.areaName, "name");
    if (!a) return { ok: false, message: `No household area found matching "${data && data.areaName}".` };
    const item = a.items.find((i) => i.text.toLowerCase().includes(String(data.itemText || "").toLowerCase()));
    if (!item) return { ok: false, message: `No checklist item on "${a.name}" matching "${data.itemText}".` };
    const wasDone = computeStatus(a.items) === "done";
    item.checked = true;
    const isDoneNow = computeStatus(a.items) === "done";
    if (isDoneNow) a.completedAt = new Date().toISOString();
    persist();
    if (isDoneNow && !wasDone) showPraise("household");
    return { ok: true, message: `Checked off "${item.text}" on ${a.name}.` };
  },

  signalAreaCaughtUp(data) {
    const a = fuzzyFind(STATE.assets, data && data.areaName, "name");
    if (!a) return { ok: false, message: `No household area found matching "${data && data.areaName}".` };
    a.signalUp = true;
    persist();
    showPraise("signalUp");
    return { ok: true, message: `Marked ${a.name} as fully caught up.` };
  },

  flagNeedsAttention(data) {
    if (!data || !data.domain || !data.name) return { ok: false, message: "Need to know what area/vehicle/trip this is about." };
    const payload = { flag: true, note: data.note || "", requestedAt: new Date().toISOString() };
    let label = null;
    if (data.domain === "household") {
      const a = fuzzyFind(STATE.assets, data.name, "name");
      if (!a) return { ok: false, message: `No household area found matching "${data.name}".` };
      a.needsAttention = payload; label = a.name;
    } else if (data.domain === "vehicle") {
      const v = fuzzyFind(STATE.vehicles, data.name, "name");
      if (!v) return { ok: false, message: `No vehicle found matching "${data.name}".` };
      const t = fuzzyFind(v.tasks || [], data.taskName, "title");
      if (!t) return { ok: false, message: `No maintenance task on ${v.name} matching "${data.taskName}".` };
      t.needsAttention = payload; label = v.name + " — " + t.title;
    } else if (data.domain === "trip") {
      const tr = fuzzyFind(STATE.trips, data.name, "name");
      if (!tr) return { ok: false, message: `No trip found matching "${data.name}".` };
      tr.needsAttention = payload; label = tr.name;
    } else {
      return { ok: false, message: 'domain must be "household", "vehicle", or "trip".' };
    }
    persist();
    return { ok: true, message: `Flagged "${label}" as needing attention.` };
  },

  addGrocery(data) {
    if (!data || !data.name) return { ok: false, message: "Need an item name." };
    const purchaseDate = data.purchaseDate || todayISO();
    const expirationDate = data.expirationDate || addDaysISO(purchaseDate, suggestExpiration(data.name));
    STATE.groceries.push({ id: uid("grocery"), name: data.name, qty: Number(data.qty) || 1, purchaseDate, expirationDate, used: false, thrown: false });
    persist();
    return { ok: true, message: `Added ${data.name} to groceries, use by ${fmtDate(expirationDate)}.` };
  },

  markGroceryUsed(data) {
    const g = fuzzyFind(STATE.groceries.filter((x) => !x.used && !x.thrown), data && data.name, "name");
    if (!g) return { ok: false, message: `No active grocery item found matching "${data && data.name}".` };
    const usedBeforeExpiry = groceryStatus(g) !== "expired";
    g.used = true;
    persist();
    if (usedBeforeExpiry) showPraise("grocery");
    return { ok: true, message: `Marked ${g.name} used.` };
  },

  markGroceryThrown(data) {
    const g = fuzzyFind(STATE.groceries.filter((x) => !x.used && !x.thrown), data && data.name, "name");
    if (!g) return { ok: false, message: `No active grocery item found matching "${data && data.name}".` };
    g.thrown = true;
    persist();
    return { ok: true, message: `Marked ${g.name} thrown out.` };
  },

  addVehicle(data) {
    if (!data || !data.name) return { ok: false, message: "Need a name for the vehicle." };
    const mileage = Number(data.mileage) || 0;
    const tasks = DEFAULT_VEHICLE_TASKS.map((t) => ({
      id: uid("vtask"), title: t.title, intervalDays: t.intervalDays || null, intervalMiles: t.intervalMiles || null,
      lastDoneDate: null, lastDoneMileage: null,
      dueDate: t.intervalDays ? addDaysISO(todayISO(), t.intervalDays) : null,
      dueMileage: t.intervalMiles ? mileage + t.intervalMiles : null,
      needsAttention: { flag: false, note: "" }, calendarEventId: null,
    }));
    STATE.vehicles.push({ id: uid("vehicle"), name: data.name, year: data.year || "", make: data.make || "", model: data.model || "", mileage, tasks });
    persist();
    return { ok: true, message: `Added vehicle "${data.name}" with default maintenance tasks.` };
  },

  completeVehicleTaskByName(data) {
    const v = fuzzyFind(STATE.vehicles, data && data.vehicleName, "name");
    if (!v) return { ok: false, message: `No vehicle found matching "${data && data.vehicleName}".` };
    const t = fuzzyFind(v.tasks || [], data && data.taskTitle, "title");
    if (!t) return { ok: false, message: `No maintenance task on ${v.name} matching "${data && data.taskTitle}".` };
    t.lastDoneDate = todayISO(); t.lastDoneMileage = v.mileage;
    if (t.intervalDays) t.dueDate = addDaysISO(todayISO(), t.intervalDays);
    if (t.intervalMiles) t.dueMileage = v.mileage + t.intervalMiles;
    persist();
    showPraise("vehicle");
    return { ok: true, message: `Marked "${t.title}" done for ${v.name}.` };
  },

  updateVehicleMileage(data) {
    const v = fuzzyFind(STATE.vehicles, data && data.vehicleName, "name");
    if (!v) return { ok: false, message: `No vehicle found matching "${data && data.vehicleName}".` };
    if (data.mileage == null) return { ok: false, message: "Need a mileage value." };
    v.mileage = Number(data.mileage) || v.mileage;
    persist();
    return { ok: true, message: `Updated ${v.name}'s mileage to ${v.mileage.toLocaleString()}.` };
  },

  addTrip(data) {
    if (!data || !data.name || !data.startDate) return { ok: false, message: "Need a trip name and a start date." };
    const startDate = data.startDate;
    const prep = DEFAULT_TRAVEL_TEMPLATE.prep.map((p) => ({ text: p.text, checked: false, dueDate: addDaysISO(startDate, -p.leadDays) }));
    const packing = DEFAULT_TRAVEL_TEMPLATE.packing.map((text) => ({ text, checked: false }));
    const departureDay = DEFAULT_TRAVEL_TEMPLATE.departureDay.map((text) => ({ text, checked: false }));
    STATE.trips.push({ id: uid("trip"), name: data.name, destination: data.destination || "", startDate, endDate: data.endDate || "", prep, packing, departureDay, needsAttention: { flag: false, note: "" } });
    persist();
    return { ok: true, message: `Created trip "${data.name}" with a full prep/packing/departure checklist.` };
  },

  checkTripItem(data) {
    const t = fuzzyFind(STATE.trips, data && data.tripName, "name");
    if (!t) return { ok: false, message: `No trip found matching "${data && data.tripName}".` };
    const phase = ["prep", "packing", "departureDay"].includes(data.phase) ? data.phase : "packing";
    const item = t[phase].find((i) => i.text.toLowerCase().includes(String(data.itemText || "").toLowerCase()));
    if (!item) return { ok: false, message: `No ${phase} item on "${t.name}" matching "${data.itemText}".` };
    const wasDone = tripProgress(t).status === "done";
    item.checked = true;
    const isDoneNow = tripProgress(t).status === "done";
    persist();
    if (isDoneNow && !wasDone) showPraise("travel");
    return { ok: true, message: `Checked off "${item.text}" for ${t.name}.` };
  },

  // Push a specific bill / household area / vehicle task / trip to Google
  // Calendar on request — reuses the exact same manual per-item sync path
  // the buttons in each tab already use. Calendar sync stays deliberately
  // manual/per-item everywhere in this app (no silent auto-push-everything);
  // this just lets Blue Bonnet trigger that same manual action when asked.
  async syncToCalendar(data) {
    if (!data || !data.domain || !data.name) return { ok: false, message: "Need to know what to sync (a bill, household area, vehicle task, or trip) and its name." };
    if (!Calendar.isConnected()) {
      const ok = await Calendar.ensureToken();
      if (!ok) return { ok: false, message: "Google Calendar isn't connected yet — connect it in Settings first." };
    }
    try {
      if (data.domain === "bill") {
        const b = fuzzyFind(STATE.bills, data.name, "name");
        if (!b) return { ok: false, message: `No bill found matching "${data.name}".` };
        await syncBillCalendar(b.id);
        return { ok: true, message: `Synced "${b.name}" to your Google Calendar.` };
      }
      if (data.domain === "household") {
        const a = fuzzyFind(STATE.assets, data.name, "name");
        if (!a) return { ok: false, message: `No household area found matching "${data.name}".` };
        await syncAssetCalendar(a.id);
        return { ok: true, message: `Synced "${a.name}" to your Google Calendar.` };
      }
      if (data.domain === "vehicle") {
        const v = fuzzyFind(STATE.vehicles, data.name, "name");
        if (!v) return { ok: false, message: `No vehicle found matching "${data.name}".` };
        const t = fuzzyFind(v.tasks || [], data.taskName, "title");
        if (!t) return { ok: false, message: `No maintenance task on ${v.name} matching "${data.taskName}".` };
        await syncVehicleTaskCalendar(v.id, t.id);
        return { ok: true, message: `Synced "${t.title}" for ${v.name} to your Google Calendar.` };
      }
      if (data.domain === "trip") {
        const tr = fuzzyFind(STATE.trips, data.name, "name");
        if (!tr) return { ok: false, message: `No trip found matching "${data.name}".` };
        await syncTripCalendar(tr.id);
        return { ok: true, message: `Synced prep dates for "${tr.name}" to your Google Calendar.` };
      }
      return { ok: false, message: 'domain must be "bill", "household", "vehicle", or "trip".' };
    } catch (e) {
      return { ok: false, message: "Calendar sync failed: " + e.message };
    }
  },
};
window.AdultingActions = AdultingActions;

// ===========================================================================
// Demo mode — a fully populated, in-memory-only sample household (see the
// DEMO_MODE flag near the top of this file). Every status color/state is
// represented on purpose so a first look shows the whole app working, not
// an empty shell. Never written to localStorage.
// ===========================================================================
function buildDemoState() {
  const s = defaultState();
  s.settings.householdName = "The Demo Household";
  s.settings.onboarded = true; // skip the welcome screen — go straight to a populated Dashboard

  // ---- Bills ----
  const billPeriod = currentBillingPeriodKey();
  s.bills = [
    { id: uid("bill"), name: "Rent", amount: 1450, dueDay: 1, type: "regular", category: "Rent/Mortgage", recurring: true, paidPeriods: { [billPeriod]: true }, calendarEventId: null },
    { id: uid("bill"), name: "Electric", amount: 95, dueDay: 15, type: "regular", category: "Utilities", recurring: true, paidPeriods: {}, calendarEventId: null },
    { id: uid("bill"), name: "Streaming subscriptions", amount: 32, dueDay: 5, type: "discretionary", category: "Subscriptions", recurring: true, paidPeriods: { [billPeriod]: true }, calendarEventId: null },
    { id: uid("bill"), name: "Dining out budget", amount: 150, dueDay: 28, type: "discretionary", category: "Dining Out", recurring: true, paidPeriods: {}, calendarEventId: null },
  ];

  // ---- Household areas — one of each status (done/partial/none/attention) ----
  function demoAsset(tmplKey, checkedCount, opts) {
    opts = opts || {};
    const t = DEFAULT_HOUSEHOLD_ASSETS.find((x) => x.key === tmplKey);
    const items = t.items.map((text, i) => ({ text, checked: i < checkedCount }));
    const period = currentPeriodInfo(t.recurrence);
    return {
      id: uid("asset"), name: t.name, icon: t.icon, key: t.key, recurrence: t.recurrence, items,
      currentPeriodKey: period.key, dueDate: period.dueDate,
      signalUp: !!opts.signalUp, completedAt: checkedCount === items.length ? new Date().toISOString() : null,
      needsAttention: opts.attention ? { flag: true, note: opts.attention } : { flag: false, note: "" },
      calendarEventId: null,
    };
  }
  s.assets = [
    demoAsset("kitchen", 6), // fully done
    demoAsset("bathroom", 2), // partial
    demoAsset("livingroom", 0), // none started
    demoAsset("hvac", 0, { attention: "Filter looks pretty dirty — need to grab a 16x20 replacement." }),
  ];

  // ---- Groceries — fresh, soon, and expired represented ----
  s.groceries = [
    { id: uid("grocery"), name: "Milk", qty: 1, purchaseDate: addDaysISO(todayISO(), -5), expirationDate: addDaysISO(todayISO(), 2), used: false, thrown: false },
    { id: uid("grocery"), name: "Spinach", qty: 1, purchaseDate: addDaysISO(todayISO(), -4), expirationDate: addDaysISO(todayISO(), 1), used: false, thrown: false },
    { id: uid("grocery"), name: "Leftover pasta", qty: 1, purchaseDate: addDaysISO(todayISO(), -6), expirationDate: addDaysISO(todayISO(), -1), used: false, thrown: false },
    { id: uid("grocery"), name: "Salmon", qty: 6, purchaseDate: addDaysISO(todayISO(), -1), expirationDate: addDaysISO(todayISO(), 2), used: false, thrown: false },
    { id: uid("grocery"), name: "Rice", qty: 1, purchaseDate: addDaysISO(todayISO(), -10), expirationDate: addDaysISO(todayISO(), 350), used: false, thrown: false },
  ];

  // ---- Vehicle — mixed overdue / due-soon / ok tasks ----
  const mileage = 62000;
  const vTasks = DEFAULT_VEHICLE_TASKS.map((t, i) => ({
    id: uid("vtask"), title: t.title, intervalDays: t.intervalDays || null, intervalMiles: t.intervalMiles || null,
    lastDoneDate: null, lastDoneMileage: null,
    dueDate: t.intervalDays ? addDaysISO(todayISO(), i === 0 ? -10 : i === 1 ? 7 : t.intervalDays) : null,
    dueMileage: t.intervalMiles ? mileage + (i === 1 ? 200 : t.intervalMiles) : null,
    needsAttention: { flag: false, note: "" }, calendarEventId: null,
  }));
  s.vehicles = [{ id: uid("vehicle"), name: "Honda Civic", year: "2019", make: "Honda", model: "Civic", mileage, tasks: vTasks }];

  // ---- Trip — partially packed, a few days out ----
  const startDate = addDaysISO(todayISO(), 6);
  const prep = DEFAULT_TRAVEL_TEMPLATE.prep.map((p, i) => ({ text: p.text, checked: i < 3, dueDate: addDaysISO(startDate, -p.leadDays) }));
  const packing = DEFAULT_TRAVEL_TEMPLATE.packing.map((text, i) => ({ text, checked: i < 5 }));
  s.trips = [{
    id: uid("trip"), name: "Weekend in Austin", destination: "Austin, TX", startDate, endDate: addDaysISO(startDate, 2),
    prep, packing,
    departureDay: DEFAULT_TRAVEL_TEMPLATE.departureDay.map((text) => ({ text, checked: false })),
    needsAttention: { flag: false, note: "" },
  }];

  return s;
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

  if (DEMO_MODE) {
    const banner = document.getElementById("demoBanner");
    if (banner) {
      banner.style.display = "flex";
      banner.innerHTML =
        '<span>👋 You\'re viewing a demo with sample data — nothing here is saved, and none of your real data is touched.</span>' +
        '<a href="' + location.pathname + '">Exit demo</a>';
    }
    return; // no real Google/Calendar/Drive activity while demoing
  }

  if (STATE.settings.googleClientId) {
    Calendar.init(STATE.settings.googleClientId)
      .then(() => Calendar.ensureToken())
      .then((ok) => { if (ok) { runCalendarImport(); syncFromDriveIfNewer(); } })
      .catch(() => {});
  }
  // Keep ingesting new calendar changes automatically while the tab is open
  setInterval(() => { if (Calendar.isConnected()) runCalendarImport(); }, 15 * 60 * 1000);
}

/* Record the visit AFTER the first render, so this session still sees the
   gentle welcome it earned rather than immediately clearing it. */
window.addEventListener("load", () => {
  setTimeout(() => {
    try {
      STATE.settings.lastOpenedAt = new Date().toISOString();
      saveState(STATE);
    } catch (e) { /* not worth surfacing */ }
  }, 1500);
});

document.addEventListener("DOMContentLoaded", init);

// PWA install support — lets the browser offer "Install" / "Add to Home
// Screen" and gives it a minimal offline fallback. Doesn't change any app
// behavior otherwise; falls back to a normal network fetch first every time.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
