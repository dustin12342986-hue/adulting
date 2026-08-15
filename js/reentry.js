/* ==========================================================================
   Adulting — re-entry & anti-burnout

   The week-2 dropoff is not a motivation problem. It's a design problem, and
   most productivity apps cause it. What actually kills these apps:

   1. THE WALL OF RED. You skip four days, come back, and the app opens with
      eleven overdue items in alarm colours. The feeling is guilt, and the
      cheapest way to stop feeling it is to close the tab. So: if someone's
      been away, the app does NOT lead with everything they missed. It leads
      with a calm welcome and at most three things.

   2. STREAKS. A streak is a punishment mechanic — its whole power comes from
      the pain of breaking it, and once broken there's no reason to return.
      This app counts CUMULATIVE things done, which only ever goes up. Miss a
      month and it's still there waiting at the same number.

   3. UNDIFFERENTIATED LISTS. Twelve things of equal visual weight is a
      decision problem, and decision problems are where ADHD stalls. So there
      is always exactly one "start here" suggestion, chosen for you.

   4. NOTHING CHANGING. Sameness makes a tool invisible. Small rotating copy
      and a hero scene that shifts with the time of day give the brain a
      reason to look, at nearly zero cost.

   5. ALL-OR-NOTHING FRAMING. "3/12 done" reads as failure. "3 done" reads as
      three done. Same data, opposite feeling.

   Pure functions — no DOM.
   ========================================================================== */

/* How many days away before the app switches to a gentler welcome. Four days
   is roughly where "I'm behind" turns into "I've failed at this". */
const REENTRY_DAYS = 4;

function daysSince(iso, todayIso) {
  if (!iso) return 999;
  return Math.max(0, daysBetween(String(iso).slice(0, 10), todayIso || todayISO()));
}

/* Away long enough that a full overdue list would do more harm than good? */
function needsGentleWelcome(state, todayIso) {
  const last = state && state.settings && state.settings.lastOpenedAt;
  if (!last) return false;
  return daysSince(last, todayIso) >= REENTRY_DAYS;
}

/* Pick ONE thing to suggest. Not the most overdue — the one most likely to
   actually get done right now, because a completed small thing restarts
   momentum and an untouched big one confirms the story that you can't. */
function pickOneThing(state) {
  const today = todayISO();

  // 1. Something genuinely quick and satisfying: a part-finished checklist
  const nearlyDone = (state.assets || [])
    .map((a) => {
      const items = a.items || [];
      const left = items.filter((i) => !i.checked).length;
      return { a, left, total: items.length };
    })
    .filter((x) => x.total > 0 && x.left > 0 && x.left <= 2)
    .sort((x, y) => x.left - y.left)[0];
  if (nearlyDone) {
    return {
      kind: "household",
      label: nearlyDone.a.icon + " " + nearlyDone.a.name,
      why: nearlyDone.left === 1 ? "One item left. Ninety seconds." : "Two items left — nearly closed out.",
      tab: "household",
    };
  }

  // 2. Food about to be wasted — small, concrete, mildly urgent
  const expiring = (state.groceries || []).filter((g) => groceryStatus(g) === "soon")[0];
  if (expiring) {
    return {
      kind: "grocery",
      label: "🛒 Use the " + expiring.name,
      why: "Goes off " + (expiring.expirationDate || "soon") + ". Easy win.",
      tab: "groceries",
    };
  }

  // 3. An unpaid bill due within the week
  const bill = (state.bills || []).find((b) => {
    const paid = (b.paidPeriods || {})[currentBillingPeriodKey()];
    return !paid && billDueDateThisPeriod(b) <= addDaysISO(today, 7);
  });
  if (bill) {
    return {
      kind: "bill",
      label: "💰 " + bill.name,
      why: "Due " + billDueDateThisPeriod(bill) + ". Pay it or tick it off if it's already done.",
      tab: "budget",
    };
  }

  // 4. Nothing pressing — say so plainly rather than inventing work
  return {
    kind: "none",
    label: "Nothing needs you right now",
    why: "Genuinely. Close the tab guilt-free.",
    tab: "dashboard",
  };
}

/* Things that take under two minutes. The point isn't the tasks — it's giving
   a stalled brain an on-ramp that doesn't require deciding anything. */
function quickWins(state, limit) {
  const wins = [];
  (state.assets || []).forEach((a) => {
    (a.items || []).forEach((i) => {
      if (!i.checked) wins.push({ label: a.icon + " " + i.text, sub: a.name, tab: "household" });
    });
  });
  (state.groceries || []).forEach((g) => {
    if (groceryStatus(g) === "expired") wins.push({ label: "🗑 Toss the " + g.name, sub: "Expired", tab: "groceries" });
  });
  return wins.slice(0, limit || 3);
}

/* Cumulative count of things completed. Never resets, never breaks, only goes
   up. Deliberately not a streak. */
function lifetimeDone(state) {
  let n = Number((state.settings && state.settings.lifetimeCompleted) || 0);
  // Checked items currently visible count too, so a new user isn't shown a 0
  (state.assets || []).forEach((a) => { n += (a.items || []).filter((i) => i.checked).length; });
  (state.bills || []).forEach((b) => { n += Object.keys(b.paidPeriods || {}).length; });
  return n;
}

/* What happened while you were away, framed as information rather than a
   backlog. Capped at three — the whole point is not to overwhelm. */
function whileYouWereAway(state, todayIso) {
  const today = todayIso || todayISO();
  const items = [];

  const overdueBills = (state.bills || []).filter((b) => {
    const paid = (b.paidPeriods || {})[currentBillingPeriodKey()];
    return !paid && billDueDateThisPeriod(b) < today;
  });
  if (overdueBills.length) {
    items.push({
      icon: "💰",
      text: overdueBills.length === 1
        ? overdueBills[0].name + " went past its date"
        : overdueBills.length + " bills went past their date",
      tab: "budget",
    });
  }

  const expired = (state.groceries || []).filter((g) => groceryStatus(g) === "expired");
  if (expired.length) {
    items.push({ icon: "🛒", text: expired.length + " item(s) in the kitchen expired", tab: "groceries" });
  }

  const resetAreas = (state.assets || []).filter((a) => computeStatus(a.items) === "none").length;
  if (resetAreas) {
    items.push({ icon: "🧹", text: resetAreas + " area(s) reset for a new round", tab: "household" });
  }

  return items.slice(0, 3);
}

/* Rotating copy. Sameness makes a tool invisible; a line that changes gives
   the brain a small reason to look. Keyed to the day so it's stable within a
   session but different tomorrow. */
const WELCOME_LINES = [
  "Nothing here is on fire.",
  "You don't have to do all of it.",
  "Pick one thing. That counts.",
  "Being here is the hard part.",
  "Small and finished beats big and perfect.",
  "No streak to break. It's all still here.",
  "You can close this after one thing.",
];
const RETURN_LINES = [
  "Good to see you again.",
  "Welcome back — nothing's ruined.",
  "It kept everything for you.",
  "Right where you left off.",
  "No catching up required.",
];

function rotatingLine(list, todayIso) {
  const d = (todayIso || todayISO()).replace(/-/g, "");
  return list[Number(d) % list.length];
}

/* Time-of-day flavour for the hero scene, so the app doesn't look identical
   at 7am and 11pm. */
function timeOfDayScene(now) {
  const h = (now || new Date()).getHours();
  if (h < 6) return "night";
  if (h < 11) return "morning";
  if (h < 17) return "day";
  if (h < 21) return "sunset";
  return "night";
}

if (typeof module !== "undefined") {
  module.exports = {
    REENTRY_DAYS, needsGentleWelcome, pickOneThing, quickWins,
    lifetimeDone, whileYouWereAway, rotatingLine, timeOfDayScene,
    WELCOME_LINES, RETURN_LINES, daysSince,
  };
}
