/* ==========================================================================
   Adulting — default data & reference tables
   ========================================================================== */

// ---- Household checklist templates ----------------------------------------
// Modeled on the broadcast-checklist data shape: each "area" (asset) has its
// own list of checklist items and a recurrence schedule. Items are short and
// concrete on purpose — small, unambiguous steps are easier to start and to
// trust as "actually done."
const DEFAULT_HOUSEHOLD_ASSETS = [
  {
    name: "Kitchen",
    icon: "🍳",
    key: "kitchen",
    recurrence: { type: "weekly", interval: 1 },
    items: [
      "Wipe counters",
      "Clean stovetop",
      "Wash/put away dishes",
      "Take out trash & recycling",
      "Sweep & mop floor",
      "Wipe down sink",
    ],
  },
  {
    name: "Bathroom(s)",
    icon: "🛁",
    key: "bathroom",
    recurrence: { type: "weekly", interval: 1 },
    items: [
      "Clean toilet",
      "Clean shower/tub",
      "Wipe sink & mirror",
      "Mop floor",
      "Restock toilet paper & soap",
      "Empty trash",
    ],
  },
  {
    name: "Living Room",
    icon: "🛋️",
    key: "livingroom",
    recurrence: { type: "weekly", interval: 1 },
    items: ["Vacuum floor", "Dust surfaces", "Tidy clutter", "Wipe windows/glass"],
  },
  {
    name: "Bedroom(s)",
    icon: "🛏️",
    key: "bedroom",
    recurrence: { type: "weekly", interval: 1 },
    items: ["Change/wash sheets", "Vacuum or sweep", "Declutter surfaces", "Dust"],
  },
  {
    name: "Laundry",
    icon: "🧺",
    key: "laundry",
    recurrence: { type: "weekly", interval: 1 },
    items: ["Wash a load", "Dry it", "Fold it", "Put it away"],
  },
  {
    name: "HVAC / Filters",
    icon: "🌬️",
    key: "hvac",
    recurrence: { type: "monthly", interval: 1 },
    items: ["Check air filter", "Replace air filter if dirty", "Check thermostat schedule"],
  },
  {
    name: "Safety Checks",
    icon: "🚨",
    key: "safety",
    recurrence: { type: "monthly", interval: 1 },
    items: ["Test smoke detectors", "Test CO detectors", "Check fire extinguisher"],
  },
  {
    name: "Yard / Exterior",
    icon: "🌳",
    key: "yard",
    recurrence: { type: "monthly", interval: 1 },
    items: ["Mow / tidy lawn", "Check gutters", "Inspect exterior for issues"],
  },
];

// ---- Vehicle maintenance defaults ------------------------------------------
// type: "date" (interval in days) or "mileage" (interval in miles) — the app
// tracks whichever comes first when both are set.
const DEFAULT_VEHICLE_TASKS = [
  { title: "Oil change", type: "both", intervalDays: 182, intervalMiles: 5000 },
  { title: "Tire rotation", type: "both", intervalDays: 182, intervalMiles: 6000 },
  { title: "Tire pressure check", type: "date", intervalDays: 30 },
  { title: "Engine air filter", type: "both", intervalDays: 365, intervalMiles: 12000 },
  { title: "Brake inspection", type: "mileage", intervalMiles: 12000 },
  { title: "Battery check", type: "date", intervalDays: 365 },
  { title: "Wiper blades", type: "date", intervalDays: 365 },
  { title: "State inspection", type: "date", intervalDays: 365 },
  { title: "Registration renewal", type: "date", intervalDays: 365 },
];

// ---- Grocery shelf-life reference (approximate, days from purchase) -------
// Used to auto-suggest an expiration date. Always editable — this is a
// starting guess, not a rule.
const SHELF_LIFE_DB = {
  milk: 7, eggs: 28, butter: 60, yogurt: 14, "cheese (hard)": 30, "cheese (soft)": 10,
  "cream cheese": 14, "sour cream": 14, "heavy cream": 10,
  "chicken (raw)": 2, "ground beef (raw)": 2, "beef (raw steak/roast)": 4, "pork (raw)": 3,
  "fish (raw)": 2, bacon: 7, "deli meat": 5, sausage: 2,
  bread: 6, tortillas: 14, bagels: 5,
  lettuce: 7, spinach: 5, broccoli: 7, carrots: 21, celery: 14, cucumber: 7,
  tomatoes: 7, "bell peppers": 10, potatoes: 30, onions: 30, garlic: 60,
  bananas: 5, apples: 21, oranges: 21, grapes: 7, berries: 5, avocado: 4,
  "leftovers (cooked)": 4, "cooked rice": 5, "cooked pasta": 5, soup: 4,
  "frozen meat": 120, "frozen vegetables": 240, "frozen meals": 90, "ice cream": 60,
  "canned goods": 365, rice: 365, pasta: 365, cereal: 180, "peanut butter": 90,
  "orange juice": 10, "salad dressing (opened)": 60, mayo: 60, ketchup: 180, mustard: 365,
};

// ---- Budget categories ------------------------------------------------------
const BUDGET_CATEGORIES = {
  regular: [
    "Rent/Mortgage", "Utilities", "Internet", "Phone", "Insurance",
    "Car Payment", "Groceries", "Debt Payment", "Childcare", "Other Regular",
  ],
  discretionary: [
    "Dining Out", "Entertainment", "Subscriptions", "Shopping",
    "Hobbies", "Travel Fund", "Other Discretionary",
  ],
};

// ---- Travel checklist template ---------------------------------------------
// Split into "Before the trip" (prep, appointments, packing) and "Departure
// day" (last checks) so nothing has to be remembered all at once. Grooming
// and wardrobe items are included on purpose — those are easy to forget
// until the last minute and hard to fix once you're already traveling.
const DEFAULT_TRAVEL_TEMPLATE = {
  prep: [
    { text: "Book/confirm time off or coverage", leadDays: 14 },
    { text: "Get a haircut", leadDays: 7 },
    { text: "Check the weather at your destination", leadDays: 5 },
    { text: "Pick out and lay out outfits", leadDays: 3 },
    { text: "Make sure you have the right shoes for the trip", leadDays: 3 },
    { text: "Refill/pack medications", leadDays: 3 },
    { text: "Check passport/ID expiration (if needed)", leadDays: 14 },
    { text: "Arrange pet/plant/mail care", leadDays: 5 },
  ],
  packing: [
    "Clothes for each day + 1 extra",
    "Sleepwear",
    "Underwear & socks (extra pair)",
    "The right shoes (double-check for the activities planned)",
    "Jacket/layer for weather",
    "Toiletries",
    "Medications",
    "Phone charger",
    "Headphones",
    "Wallet / ID / passport",
    "Tickets / confirmations (saved offline too)",
    "Comfort item (if it helps you settle in new places)",
  ],
  departureDay: [
    "Charger and devices packed",
    "Phone charged",
    "Chargers unplugged and packed (not left in the wall)",
    "Bag matches the packing list — nothing missing",
    "House secure (locks, lights, thermostat)",
    "Directions/tickets pulled up and ready",
  ],
};

// ---- Minimal (line-icon) alternatives to the emoji icons -------------------
// Inner SVG markup only — wrapped in a common <svg viewBox="0 0 24 24"
// stroke="currentColor" fill="none" stroke-width="1.8" ...> by icon() in
// app.js, so these just contain shapes and inherit stroke styling.
const MINIMAL_ICON_SVGS = {
  kitchen: '<circle cx="11" cy="13" r="6"/><path d="M17 13h4"/><path d="M8 7l2-3"/>',
  bathroom: '<path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z"/>',
  livingroom: '<path d="M4 12v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/><path d="M4 12a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2"/><path d="M6 17v2"/><path d="M18 17v2"/><path d="M8 10V8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  bedroom: '<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6"/><path d="M3 18v2"/><path d="M21 18v2"/><path d="M3 13V9a2 2 0 0 1 2-2h4v5"/>',
  laundry: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="5"/><circle cx="8" cy="6" r="0.8"/><circle cx="11" cy="6" r="0.8"/>',
  hvac: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9c1.5 1 1.5 3 0 4"/><path d="M12 9c1.5 1 1.5 3 0 4"/><path d="M16 9c1.5 1 1.5 3 0 4"/>',
  safety: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/>',
  yard: '<circle cx="12" cy="9" r="5"/><path d="M12 14v7"/>',
  custom: '<path d="M12 3l8 8-8 8-8-8 8-8z"/><circle cx="12" cy="11" r="1.4"/>',
  dashboard: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  budget: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10"/><path d="M9.5 9.5c0-1.4 1.2-2.2 2.5-2.2s2.5.7 2.5 2c0 3-5 1.7-5 4.7 0 1.3 1.2 2 2.5 2s2.5-.8 2.5-2.2"/>',
  household: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/>',
  groceries: '<circle cx="9" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/><path d="M3 4h2l2.4 11.5a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 8H6"/>',
  vehicles: '<path d="M4 16V11l2-5h12l2 5v5"/><path d="M4 16h16"/><circle cx="7.5" cy="16.5" r="1.6"/><circle cx="16.5" cy="16.5" r="1.6"/>',
  travel: '<path d="M3 12l18-8-8 18-2-8-8-2z"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.4M12 18.6V21M4.2 7.5l2 1.2M17.8 15.3l2 1.2M3 12h2.4M18.6 12H21M4.2 16.5l2-1.2M17.8 8.7l2-1.2"/>',
  calendar: '<rect x="3.5" y="4.5" width="17" height="16" rx="2"/><path d="M3.5 9.5h17"/><path d="M8 3v3"/><path d="M16 3v3"/>',
  flag: '<path d="M6 3v18"/><path d="M6 4h11l-2.5 4L17 12H6"/>',
  focus: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
  board: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6"/><path d="M12 16v4"/>',
  attention: '<path d="M12 3l9 16H3l9-16z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.9"/>',
  tag: '<path d="M12 3l8 8-8 8-8-8 8-8z"/><circle cx="12" cy="11" r="1.4"/>',
};

// Colorful (emoji) counterpart to MINIMAL_ICON_SVGS — same keys, so icon()
// in app.js can swap styles without touching call sites.
const EMOJI_ICONS = {
  kitchen: "🍳", bathroom: "🛁", livingroom: "🛋️", bedroom: "🛏️", laundry: "🧺",
  hvac: "🌬️", safety: "🚨", yard: "🌳", custom: "🏷️", tag: "🏷️",
  dashboard: "📋", budget: "💰", household: "🧹", groceries: "🛒", vehicles: "🚗",
  travel: "✈️", settings: "⚙️", calendar: "📅", flag: "🚩", focus: "🎯",
  board: "🖥️", attention: "⚠️",
};

// ---- Encouragement bubbles --------------------------------------------------
// Short, specific-feeling, non-generic lines shown right after a real
// completion (never for anything overdue/unfinished — only positives).
// Kept separate from Blue Bonnet's chat replies so they're instant, free,
// and don't depend on the proxy being configured.
const PRAISE_PHRASES = {
  household: [
    "That area's fully caught up. Nice.",
    "Done is done — that one's off your plate.",
    "Whole checklist cleared. That counts.",
  ],
  signalUp: [
    "Good enough and called it — that's the whole point.",
    "You said it's caught up. That's yours to decide.",
  ],
  budget: [
    "Every bill marked paid this month. That's a real thing to have handled.",
    "Budget's all caught up for this period.",
  ],
  vehicle: [
    "One less thing your car needs from you right now.",
    "Maintenance logged — that's taken care of.",
  ],
  grocery: [
    "Used it before it went bad — nice timing.",
    "That one didn't go to waste.",
  ],
  travel: [
    "Fully packed. Nothing left on the list for this trip.",
    "That trip's ready to go.",
  ],
};

// ---- Calendar import: keyword heuristics -----------------------------------
// Used to guess what an existing Google Calendar event probably represents,
// so a first-time Google connect can suggest bills / vehicle tasks / trips to
// create instead of starting from a blank app.
const CALENDAR_IMPORT_RULES = {
  bill: [
    { match: ["rent", "mortgage"], category: "Rent/Mortgage", type: "regular" },
    { match: ["electric", "power bill"], category: "Utilities", type: "regular" },
    { match: ["water bill", "gas bill", "utility", "utilities"], category: "Utilities", type: "regular" },
    { match: ["internet", "wifi bill", "broadband"], category: "Internet", type: "regular" },
    { match: ["phone bill", "cell bill"], category: "Phone", type: "regular" },
    { match: ["insurance"], category: "Insurance", type: "regular" },
    { match: ["car payment", "auto loan"], category: "Car Payment", type: "regular" },
    { match: ["subscription", "netflix", "spotify", "hulu", "disney+"], category: "Subscriptions", type: "discretionary" },
  ],
  vehicle: [
    { match: ["oil change"], title: "Oil change" },
    { match: ["tire rotation", "rotate tires"], title: "Tire rotation" },
    { match: ["inspection"], title: "State inspection" },
    { match: ["registration"], title: "Registration renewal" },
    { match: ["car service", "vehicle maintenance", "mechanic"], title: "Vehicle service" },
  ],
  travel: [
    { match: ["flight to", "trip to", "vacation", "flying to"] },
    { match: ["hotel", "airbnb"] },
  ],
};

if (typeof module !== "undefined") {
  module.exports = {
    DEFAULT_HOUSEHOLD_ASSETS,
    DEFAULT_VEHICLE_TASKS,
    SHELF_LIFE_DB,
    BUDGET_CATEGORIES,
    DEFAULT_TRAVEL_TEMPLATE,
    MINIMAL_ICON_SVGS,
    EMOJI_ICONS,
    PRAISE_PHRASES,
    CALENDAR_IMPORT_RULES,
  };
}
