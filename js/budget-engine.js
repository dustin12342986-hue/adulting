/* ==========================================================================
   Adulting — budget engine

   Turns imported statement transactions into a budget you can actually keep.

   Design notes, because they drove most of the decisions here:

   ADHD-FRIENDLY, NOT JUST "SIMPLE"
   - Budgets built from someone else's idea of normal get abandoned in a week.
     Every plan here starts from what this person ACTUALLY spends, then adjusts.
   - MEDIAN, not mean. One holiday or one car repair drags an average up and
     makes every later month look like a failure. The median is what a typical
     month really looks like.
   - The headline number is "safe to spend today", not "budget remaining".
     Dividing what's left by days remaining removes the mental arithmetic that
     makes budgets feel heavy — and it self-corrects after an overspend instead
     of just turning red and staying red.
   - Rollover is on by default. One bad Tuesday shouldn't write off the month;
     that's the moment people quit.
   - Fixed commitments (rent, insurance) are separated from flexible spending.
     Only the flexible part is worth "budgeting" — the rest is arithmetic, and
     pretending otherwise makes the whole thing feel impossible.

   NO SHAME LANGUAGE ANYWHERE
   - Over budget is reported as a number and a suggestion, never a judgement.
     The tone rule is: describe, don't scold.

   Pure functions only — no DOM. Testable on its own.
   ========================================================================== */

/* Categories that are essentially fixed. Trimming these means changing your
   life (moving house, switching insurer), not "spending less this week", so
   the generated plans leave them alone. */
const FIXED_CATEGORIES = ["Housing", "Utilities", "Insurance", "Debt & BNPL", "Fees & interest"];

/* Where cuts actually come from, in the order they're least painful. */
const FLEXIBLE_PRIORITY = ["Eating out", "Shopping", "Subscriptions", "Groceries", "Transport", "Fuel", "Health", "Other"];

function monthKeyOf(iso) {
  return String(iso || "").slice(0, 7); // YYYY-MM
}

function median(nums) {
  if (!nums || !nums.length) return 0;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round2(n) { return Math.round(n * 100) / 100; }
function roundTo5(n) { return Math.max(0, Math.round(n / 5) * 5); }

/* ---------------------------------------------------------------------------
   Spending analysis
   --------------------------------------------------------------------------- */
function analyzeSpending(txns) {
  const list = (txns || []).filter((t) => t && t.date && !isNaN(Number(t.amount)));
  const months = new Set(list.map((t) => monthKeyOf(t.date)).filter(Boolean));
  const monthCount = Math.max(1, months.size);

  // category -> monthKey -> total spent that month
  const byCat = new Map();
  let incomeByMonth = new Map();

  list.forEach((t) => {
    const mk = monthKeyOf(t.date);
    const amt = Number(t.amount);
    if (amt > 0) {
      incomeByMonth.set(mk, (incomeByMonth.get(mk) || 0) + amt);
      return;
    }
    const cat = t.category || "Other";
    if (!byCat.has(cat)) byCat.set(cat, new Map());
    const m = byCat.get(cat);
    m.set(mk, (m.get(mk) || 0) + Math.abs(amt));
  });

  const categories = [];
  byCat.forEach((monthMap, name) => {
    // A month with no charge in a category is a real zero, not missing data —
    // otherwise a quarterly bill looks like a monthly one.
    const perMonth = Array.from(months).map((mk) => monthMap.get(mk) || 0);
    const typical = median(perMonth);
    const total = perMonth.reduce((a, b) => a + b, 0);
    const highest = Math.max.apply(null, perMonth);
    categories.push({
      name,
      typical: round2(typical),
      average: round2(total / monthCount),
      highest: round2(highest),
      total: round2(total),
      monthsSeen: perMonth.filter((v) => v > 0).length,
      fixed: FIXED_CATEGORIES.indexOf(name) >= 0,
    });
  });

  categories.sort((a, b) => b.typical - a.typical);

  const incomes = Array.from(months).map((mk) => incomeByMonth.get(mk) || 0);
  const typicalIncome = round2(median(incomes.filter((v) => v > 0)));

  const fixedTotal = round2(categories.filter((c) => c.fixed).reduce((s, c) => s + c.typical, 0));
  const flexTotal = round2(categories.filter((c) => !c.fixed).reduce((s, c) => s + c.typical, 0));

  return {
    monthCount,
    months: Array.from(months).sort(),
    categories,
    typicalIncome,
    typicalSpend: round2(fixedTotal + flexTotal),
    fixedTotal,
    flexTotal,
    enoughData: monthCount >= 1 && categories.length > 0,
    confident: monthCount >= 2, // one month is a guess; two is a pattern
  };
}

/* ---------------------------------------------------------------------------
   Plan generation

   Three plans, deliberately different in difficulty rather than three flavours
   of the same thing. People pick the one that matches the week they're having.
   --------------------------------------------------------------------------- */
function generateBudgetOptions(analysis, opts) {
  opts = opts || {};
  if (!analysis || !analysis.enoughData) return [];

  const income = Number(opts.income) || analysis.typicalIncome || 0;
  const plans = [];

  /* Trim the flexible categories by a percentage, hardest-to-easiest, never
     touching fixed costs and never cutting a category to nothing (a zero
     budget is a budget you break on day one). */
  function trimmed(pctByPriority, label, id, blurb) {
    const cats = {};
    analysis.categories.forEach((c) => {
      if (c.fixed) { cats[c.name] = roundTo5(c.typical); return; }
      const rank = FLEXIBLE_PRIORITY.indexOf(c.name);
      const pct = pctByPriority[Math.min(rank < 0 ? 99 : rank, pctByPriority.length - 1)] || 0;
      const target = c.typical * (1 - pct);
      // Floor at 60% of typical — deeper than that isn't a budget, it's a wish
      cats[c.name] = roundTo5(Math.max(target, c.typical * 0.6));
    });
    const total = Object.keys(cats).reduce((s, k) => s + cats[k], 0);
    return {
      id, label, blurb,
      categories: cats,
      total: round2(total),
      saves: round2(Math.max(0, analysis.typicalSpend - total)),
      leftover: income ? round2(income - total) : null,
    };
  }

  // 1. Match what you already do — the honest baseline
  const asIs = {};
  analysis.categories.forEach((c) => { asIs[c.name] = roundTo5(c.typical); });
  const asIsTotal = Object.keys(asIs).reduce((s, k) => s + asIs[k], 0);
  plans.push({
    id: "current",
    label: "Just match what I actually spend",
    blurb: "No cuts. Same spending, but now you can see it happening while there's still time to react. Good first month — a budget you can't fail is one you'll still be using in March.",
    categories: asIs,
    total: round2(asIsTotal),
    saves: 0,
    leftover: income ? round2(income - asIsTotal) : null,
  });

  // 2. Trim the easy stuff
  plans.push(trimmed(
    [0.20, 0.15, 0.15, 0.05, 0.05, 0.05, 0, 0.10],
    "Trim the easy stuff",
    "gentle",
    "Cuts mostly from eating out, shopping and subscriptions — the places money leaks without anyone deciding to spend it. Groceries and transport barely move."
  ));

  // 3. Meaningful savings
  plans.push(trimmed(
    [0.35, 0.30, 0.25, 0.15, 0.10, 0.10, 0.05, 0.20],
    "Save meaningfully",
    "focused",
    "A real change you'd notice day to day. Worth it if you're saving for something specific — pick this one when you have a reason, not just a resolution."
  ));

  // 4. 50/30/20, only when income is actually known
  if (income > 0) {
    const needs = income * 0.5, wants = income * 0.3;
    const fixedShare = analysis.fixedTotal;
    const cats = {};
    analysis.categories.forEach((c) => {
      if (c.fixed) { cats[c.name] = roundTo5(c.typical); return; }
      const isNeed = ["Groceries", "Transport", "Fuel", "Health"].indexOf(c.name) >= 0;
      const pool = isNeed ? Math.max(0, needs - fixedShare) : wants;
      const peers = analysis.categories.filter((x) => !x.fixed &&
        (["Groceries", "Transport", "Fuel", "Health"].indexOf(x.name) >= 0) === isNeed);
      const peerTotal = peers.reduce((s, x) => s + x.typical, 0) || 1;
      cats[c.name] = roundTo5(pool * (c.typical / peerTotal));
    });
    const total = Object.keys(cats).reduce((s, k) => s + cats[k], 0);
    plans.push({
      id: "503020",
      label: "The 50/30/20 rule",
      blurb: "Half your income to needs, 30% to wants, 20% to savings. A well-known starting point — but it ignores what you actually spend, so it can be a jolt.",
      categories: cats,
      total: round2(total),
      saves: round2(Math.max(0, analysis.typicalSpend - total)),
      leftover: round2(income - total),
    });
  }

  return plans;
}

/* ---------------------------------------------------------------------------
   Live tracking for the current month
   --------------------------------------------------------------------------- */
function budgetProgress(state, todayIso) {
  const today = todayIso || todayISO();
  const mk = monthKeyOf(today);
  const budget = (state && state.budget) || {};
  const caps = budget.categories || {};

  const spentByCat = {};
  (state.statementTxns || []).forEach((t) => {
    if (monthKeyOf(t.date) !== mk) return;
    /* Only count what has happened SO FAR. Counting the whole month's imported
       transactions on the 3rd made "safe to spend today" read $0 from day one,
       which is both wrong and the fastest way to make someone stop looking. */
    if (t.date > today) return;
    const amt = Number(t.amount);
    if (amt >= 0) return;
    const c = t.category || "Other";
    spentByCat[c] = (spentByCat[c] || 0) + Math.abs(amt);
  });

  const names = Object.keys(caps).length ? Object.keys(caps) : Object.keys(spentByCat);
  const rows = names.map((name) => {
    const cap = Number(caps[name]) || 0;
    const spent = round2(spentByCat[name] || 0);
    const left = round2(cap - spent);
    const pct = cap ? Math.round((spent / cap) * 100) : 0;
    return {
      name, cap, spent, left, pct,
      fixed: FIXED_CATEGORIES.indexOf(name) >= 0,
      /* Traffic light. "over" is stated plainly and without drama — the point
         is information, not a telling-off. */
      status: !cap ? "untracked" : pct <= 70 ? "ok" : pct <= 100 ? "close" : "over",
    };
  }).sort((a, b) => b.spent - a.spent);

  const totalCap = round2(Object.keys(caps).reduce((s, k) => s + (Number(caps[k]) || 0), 0));
  const totalSpent = round2(rows.reduce((s, r) => s + r.spent, 0));

  const d = new Date(today + "T00:00:00");
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const dayOfMonth = d.getDate();
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);

  /* Only flexible money is genuinely "spendable" day to day — rent isn't a
     daily decision, so including it would make the number meaningless. */
  const flexCap = round2(rows.filter((r) => !r.fixed).reduce((s, r) => s + r.cap, 0));
  const flexSpent = round2(rows.filter((r) => !r.fixed).reduce((s, r) => s + r.spent, 0));
  const flexLeft = round2(flexCap - flexSpent);

  return {
    monthKey: mk,
    rows,
    totalCap,
    totalSpent,
    totalLeft: round2(totalCap - totalSpent),
    pct: totalCap ? Math.round((totalSpent / totalCap) * 100) : 0,
    daysInMonth, dayOfMonth, daysLeft,
    flexCap, flexSpent, flexLeft,
    /* When the flexible budget is already gone, a bare $0 with no explanation
       is the moment people give up. So also return how far over it is and what
       the rest of the month looks like if you simply carry on — information,
       not a verdict. The UI uses these to say something useful instead of
       flashing a zero. */
    safeToSpendToday: flexCap ? round2(Math.max(0, flexLeft) / daysLeft) : null,
    overBy: flexLeft < 0 ? round2(Math.abs(flexLeft)) : 0,
    /* If you keep spending at this month's pace, where do you land? */
    projectedFlexSpend: dayOfMonth > 0 ? round2((flexSpent / dayOfMonth) * daysInMonth) : 0,
    /* Pace: are you ahead or behind where a steady month would put you?
       Reported as a fact, not a verdict. */
    expectedByNow: totalCap ? round2(totalCap * (dayOfMonth / daysInMonth)) : 0,
    onPace: totalCap ? totalSpent <= totalCap * (dayOfMonth / daysInMonth) : true,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    analyzeSpending, generateBudgetOptions, budgetProgress,
    FIXED_CATEGORIES, FLEXIBLE_PRIORITY, median, monthKeyOf,
  };
}
