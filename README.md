# Adulting

A calm, all-in-one household app: budget (regular vs. discretionary spending), a home checklist dashboard, grocery expiration tracking, vehicle maintenance, and trip prep — with optional two-way Google Calendar sync. Everything runs locally in your browser; your data stays on your device (`localStorage`), and you can export/import a backup anytime from Settings.

It's built around one repeating pattern, borrowed from live production/broadcast checklists: **each area has its own short checklist → a status is computed automatically (not started / partial / done) → a shared dashboard shows every area at a glance → anything wrong can be flagged with a note.** The same pattern powers the Household, Vehicles, and Travel tabs.

Design note: this app is built with ADHD, autism, and other neurodivergent users in mind — small concrete checklist items instead of vague tasks, consistent status colors everywhere, a "Focus mode" that shows one item at a time, and a clear "you're caught up / nothing forgotten" state instead of nagging.

**First run:** you'll see a welcome screen offering to sign in with Google (to scan your Calendar for things to import) or skip and set everything up yourself. Either way you can change your mind anytime in Settings.

**Look & feel:** Settings → Theme lets you pick Sunset (pastel pink/orange/blue/yellow, the default), a light or dark monochrome theme, or Custom — one hue you pick, applied as a full color spectrum across the whole UI. The green/amber/gray/red status lights always stay colored regardless of theme, since that's what makes the Dashboard readable at a glance. Settings → Icon style switches every icon in the app between colorful (emoji) and minimal (line-icon) versions.

**Board view:** the sidebar and the Dashboard both have a "Board view" / "Open full-screen board view" button. It opens a distraction-free, no-editing screen — just big green/amber/red status lights for every area, vehicle, budget, grocery set, and trip — meant to be left open on a tablet or a shared screen so anyone in the household can see progress without asking. It reads the same local data as the main app, refreshes itself every minute, and can be bookmarked directly at `http://localhost:8000/#board`. Note: because there's no server, it only shows data entered on that same browser/device — it's not a live multi-device sync, just a calmer view of the same local data.

## Running it

No install, no build step. From this folder, start a tiny local web server (needed for Google sign-in to work — opening `index.html` directly won't allow the Google login popup):

```
python3 -m http.server 8000
```

Then open **http://localhost:8000** in your browser. Bookmark that URL.

(If you don't have Python, any static server works — e.g. `npx serve .`)

## Connecting Google Calendar (optional, ~10 minutes, one time)

This is what lets Adulting create due-date reminders (rent, cleaning, oil changes, trip prep) directly on your Google Calendar, and read them back. It requires your own free Google Cloud OAuth credentials — there's no shared login, so nobody but you can create events on your calendar.

1. Go to **console.cloud.google.com** and create a new project (call it "Adulting" or anything you like).
2. In the left menu, go to **APIs & Services → Library**, search for **Google Calendar API**, and click **Enable**.
3. Go to **APIs & Services → OAuth consent screen**. Choose **External**, fill in the required fields (app name "Adulting", your email). Under **Test users**, add your own Google account email. You can leave it in "Testing" status — you don't need to publish it.
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**. Choose **Web application**.
   - Under **Authorized JavaScript origins**, add `http://localhost:8000` (or whatever port you're using).
   - Save, then copy the **Client ID** it gives you (ends in `.apps.googleusercontent.com`).
5. In Adulting, go to **Settings**, paste the Client ID into **OAuth Client ID**, and click **Save**, then **Connect**. Sign in and approve the calendar permission.

You'll need to click **Reconnect** if the browser tab is closed and reopened after about an hour — Google's client-side sign-in tokens expire and this app has no backend server to silently refresh them in the background.

**What calendar sync does and doesn't do:** Adulting can tell you *when* something is due (rent, a cleaning task, an oil change, a packing step) because it controls that schedule itself. It cannot know whether a bill actually got paid — Google Calendar has no visibility into your bank account. Payment status is tracked inside the app (the checkbox next to each bill); calendar sync just puts the due date on your calendar as a reminder.

## What's in each tab

**Dashboard** — anything flagged "needs attention," what's due today or this week across every category, and a quick status overview. If nothing is flagged and nothing is due, it says so plainly.

**Budget** — bills and spending, each tagged **Regular** (fixed necessities — rent, utilities, insurance) or **Discretionary** (spending by choice — dining out, subscriptions). Totals are broken out by type so trade-offs are visible. Check a bill off as paid each month; sync due dates to your calendar as a recurring monthly reminder.

**Household** — areas of your home (Kitchen, Bathroom, HVAC filters, Safety checks, etc.), each with a short recurring checklist (weekly or monthly). Checking items auto-saves. "I'm calling this fully caught up" is a separate signal from the checklist itself, for days when close enough is genuinely fine. "Flag needs attention" marks something broken with a note, shown on the Dashboard until resolved.

**Groceries** — log what you buy; Adulting suggests an expiration date from a built-in shelf-life reference (editable). Items are sorted Expired → Use soon → Fresh so you know what to eat first.

**Vehicles** — track one or more vehicles with default maintenance tasks (oil change, tire rotation, inspection, registration, etc.) tracked by date, mileage, or both — whichever comes first. Update your mileage occasionally and due dates recalculate.

**Travel** — a separate checklist per trip, split into **Before the trip** (haircut, weather check, meds refill, picking outfits and the right shoes — the things that are easy to forget until it's too late), **Packing list**, and **Departure day**. "Focus mode" shows one item at a time to cut down overwhelm. When everything's checked, you get a plain "you're all set, nothing forgotten" confirmation.

**Settings** — household name, theme, icon style, Google Calendar connection + calendar import, and data export/import for backup or moving to another device.

## Importing from Google Calendar

Once connected, Adulting can scan your existing Calendar (not just its own events) for things it recognizes by keyword — "rent," "electric," "oil change," "inspection," "trip to," etc. — and suggest creating matching bills, vehicle maintenance tasks, or trips from them. By default it surfaces matches for your review (Settings → "Scan now", or the prompt after first connecting) rather than creating anything unasked; check "Import matches automatically" in Settings if you'd rather it just create them. It re-scans automatically every 15 minutes while the app is open, and once on every page load, so newly added calendar events keep getting picked up. This only reads your Calendar — it never touches Gmail, Drive, or Contacts.

## Blue Bonnet, the built-in assistant

The chat bubble in the bottom-right corner is Blue Bonnet — an organizing assistant scoped only to this app, with a knowledge base focused on household systems and ADHD/autism-affirming organizing. It automatically hides while Board view is open.

It runs through your own Cloudflare Worker proxy so your Anthropic API key never lives in this app's files:

1. Deploy a small Cloudflare Worker that proxies requests to Anthropic's Messages API using your own API key (see `js/blue-bonnet-widget-organize.js`'s header comment for the exact pattern; it expects `ALLOWED_ORIGIN` set to wherever you host this app).
2. Copy the Worker's URL.
3. Paste it into Adulting's **Settings → Blue Bonnet Assistant → Worker Proxy URL**, and save. No editing of the JS file required.

Once connected, Blue Bonnet also reads your live household data (`window.STATE`, kept in sync automatically) — so it can answer things like "what's overdue" or "what's expiring soon" specifically, not just in general.

Its knowledge base goes beyond generic organizing tips — named frameworks (GTD, KonMari, FlyLady, Struggle Care, the ADHD-specific "ADD-Friendly Ways to Organize Your Life"), ADHD/autism executive-function science, and emotional-regulation grounding (rejection sensitive dysphoria, spoon theory, self-compassion, meltdown vs. shutdown) — with an explicit boundary that it's an organizing assistant, not a therapist, and will say so if a conversation goes somewhere clinical.

A few things it can do beyond plain chat, all in Settings → Blue Bonnet Assistant:
- **Guide you to the right tab.** When relevant, its replies include a real button that jumps you straight to the part of the app it's talking about (e.g. "Check groceries →").
- **Encouragement bubbles.** A small, specific, non-generic note appears near the chat bubble when you finish something for real (a checklist fully done, all bills paid this month, a vehicle task logged, food used before it expired, a trip fully packed) — never for anything overdue or unfinished. Toggle it off if it's not for you.
- **Periodic check-ins.** Every few hours (default 3, adjustable) while the app is open and connected, it quietly checks in with something short and specific to what's going on — never forcing the chat open, just a small badge on the bubble. Toggle it off anytime.

## Backing up your data

Settings → **Export backup (.json)** downloads everything. **Import backup** restores it (on this device or a new one). There's no cloud account and no server — the exported file *is* your backup, so keep a copy somewhere safe if the data matters.
