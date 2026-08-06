/* ==========================================================================
   Adulting — state engine
   Persistence (localStorage) + pure computation helpers. No DOM code here.
   ========================================================================== */

const STORAGE_KEY = "adulting-state-v1";

function uid(prefix) {
  return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + "-W" + String(weekNo).padStart(2, "0");
}

function endOfWeekISO(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = 7 - day === 7 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function endOfMonthISO(date) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

function currentPeriodInfo(recurrence, now) {
  now = now || new Date();
  if (recurrence.type === "monthly") {
    return {
      key: now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0"),
      dueDate: endOfMonthISO(now),
    };
  }
  // default: weekly
  return {
    key: isoWeekKey(now),
    dueDate: endOfWeekISO(now),
  };
}

// status from a checklist array of {text, checked}
function computeStatus(items) {
  if (!items || items.length === 0) return "none";
  const checked = items.filter((i) => i.checked).length;
  if (checked === 0) return "none";
  if (checked === items.length) return "done";
  return "partial";
}

// Ensures a recurring household task's checklist matches the current period.
// If the period has rolled over, resets checked state (but leaves
// needsAttention alone — that's a separate, manually-cleared signal).
function refreshRecurringTask(task) {
  const period = currentPeriodInfo(task.recurrence);
  if (task.currentPeriodKey !== period.key) {
    task.currentPeriodKey = period.key;
    task.dueDate = period.dueDate;
    task.items = task.items.map((i) => ({ text: i.text, checked: false }));
    task.signalUp = false;
    task.completedAt = null;
  }
  return task;
}

function isTaskOverdue(task) {
  if (!task.dueDate) return false;
  const status = computeStatus(task.items);
  return status !== "done" && todayISO() > task.dueDate;
}

// ---- Vehicle maintenance status --------------------------------------------
function vehicleTaskStatus(task, vehicle) {
  const flags = { overdue: false, dueSoon: false, dueDateISO: null, dueMiles: null };
  if (task.dueDate) {
    flags.dueDateISO = task.dueDate;
    const d = daysBetween(todayISO(), task.dueDate);
    if (d < 0) flags.overdue = true;
    else if (d <= 14) flags.dueSoon = true;
  }
  if (task.dueMileage != null && vehicle && vehicle.mileage != null) {
    flags.dueMiles = task.dueMileage - vehicle.mileage;
    if (flags.dueMiles <= 0) flags.overdue = true;
    else if (flags.dueMiles <= 500) flags.dueSoon = true;
  }
  return flags;
}

// ---- Grocery status ---------------------------------------------------------
function groceryStatus(item) {
  if (item.thrown || item.used) return "resolved";
  const d = daysBetween(todayISO(), item.expirationDate);
  if (d < 0) return "expired";
  if (d <= 3) return "soon";
  return "fresh";
}

// ---- Travel trip progress ---------------------------------------------------
function tripProgress(trip) {
  const all = [...trip.prep, ...trip.packing, ...trip.departureDay];
  return { status: computeStatus(all), total: all.length, checked: all.filter((i) => i.checked).length };
}

// ---- Budget helpers -----------------------------------------------------
function billDueDateThisPeriod(bill) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(bill.dueDay || 1, lastDay);
  return new Date(y, m, day).toISOString().slice(0, 10);
}

function currentBillingPeriodKey() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
}

// ---- Persistence ------------------------------------------------------------
function defaultState() {
  return {
    version: 1,
    updatedAt: 0, // ms timestamp of the last local change — used by drivesync.js to decide which device's copy is newer
    settings: {
      householdName: "Our Household", googleClientId: "", calendarConnected: false, defaultCalendarId: "primary",
      theme: "sunset", customHue: 18, iconStyle: "colorful",
      onboarded: false, autoImportCalendar: false, importedEventIds: [], lastCalendarImportAt: null,
      blueBonnetProxyUrl: "",
      blueBonnetCheckins: true, blueBonnetCheckinHours: 3, lastBlueBonnetCheckinAt: null,
      blueBonnetPraise: true,
      notificationsEnabled: false,
    },
    bills: [],
    assets: [],
    groceries: [],
    vehicles: [],
    trips: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const merged = Object.assign(defaultState(), parsed);
    // settings is merged one level deep so new default fields (added in later
    // versions of the app) show up for people with an existing saved state.
    merged.settings = Object.assign(defaultState().settings, parsed.settings || {});
    return merged;
  } catch (e) {
    console.error("Failed to load state, starting fresh.", e);
    return defaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

if (typeof module !== "undefined") {
  module.exports = {
    uid, todayISO, daysBetween, addDaysISO, currentPeriodInfo, computeStatus,
    refreshRecurringTask, isTaskOverdue, vehicleTaskStatus, groceryStatus,
    tripProgress, billDueDateThisPeriod, currentBillingPeriodKey,
    defaultState, loadState, saveState, STORAGE_KEY,
  };
}
