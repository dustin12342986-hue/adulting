/* ==========================================================================
   Adulting — Google Calendar integration
   Client-side only (Google Identity Services token client). No backend.
   Requires the user to supply their own OAuth Client ID (Settings tab).

   Every event Adulting creates is tagged with a private extended
   property { adulting: "1", kind, refId } so we can find our own events
   later and tell them apart from anything else on the calendar.
   ========================================================================== */

const Calendar = (function () {
  const API_BASE = "https://www.googleapis.com/calendar/v3";
  // drive.appdata is a narrow, per-app-only scope: it can only read/write
  // files this app itself created in a hidden folder, never anything else
  // in the user's Drive. Used by drivesync.js for cross-device sync, riding
  // on the same sign-in/token as Calendar so there's only ever one consent.
  const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/drive.appdata";
  const TOKEN_SESSION_KEY = "adulting-gcal-token";

  let tokenClient = null;
  let gisLoaded = false;
  let accessToken = null;
  let tokenExpiresAt = 0;

  function loadGisScript() {
    if (gisLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        gisLoaded = true;
        return resolve();
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => {
        gisLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error("Could not load Google Identity Services script (check your internet connection)."));
      document.head.appendChild(script);
    });
  }

  function restoreTokenFromSession() {
    try {
      const raw = sessionStorage.getItem(TOKEN_SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.expiresAt > Date.now()) {
        accessToken = parsed.accessToken;
        tokenExpiresAt = parsed.expiresAt;
      }
    } catch (e) { /* ignore */ }
  }

  function persistToken() {
    try {
      sessionStorage.setItem(TOKEN_SESSION_KEY, JSON.stringify({ accessToken, expiresAt: tokenExpiresAt }));
    } catch (e) { /* ignore */ }
  }

  function init(clientId) {
    restoreTokenFromSession();
    return loadGisScript().then(() => {
      if (!clientId) throw new Error("No Google OAuth Client ID configured yet.");
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: () => {}, // overridden per-request in connect()
      });
    });
  }

  function isConnected() {
    return !!accessToken && Date.now() < tokenExpiresAt;
  }

  // Exposed so drivesync.js can reuse the same token (it was granted both
  // the calendar.events and drive.appdata scopes together) instead of
  // needing its own separate sign-in.
  function getAccessToken() {
    return isConnected() ? accessToken : null;
  }

  // Interactive connect (shows Google's consent popup). Call from a user
  // click handler — popups triggered outside a user gesture get blocked.
  //
  // Always forces prompt:"consent" (never silent), even if we already look
  // "connected." This used to skip the consent screen entirely when a valid
  // token already existed — which meant that after adding the drive.appdata
  // scope, clicking "Reconnect" on an already-connected browser silently
  // reused the OLD, narrower grant and never actually showed the user the
  // new permission to approve. Explicit user clicks should always get a real
  // consent screen; only the background ensureToken() path below stays silent.
  function connect() {
    return new Promise((resolve, reject) => {
      if (!tokenClient) return reject(new Error("Calendar not initialized yet — save your Client ID first."));
      tokenClient.callback = (resp) => {
        if (resp.error) return reject(new Error(resp.error));
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        persistToken();
        resolve();
      };
      tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  // Try to silently refresh (no popup) if we've connected before this
  // browser session; falls back to false if a fresh consent is needed.
  function ensureToken() {
    if (isConnected()) return Promise.resolve(true);
    return new Promise((resolve) => {
      if (!tokenClient) return resolve(false);
      tokenClient.callback = (resp) => {
        if (resp.error) return resolve(false);
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
        persistToken();
        resolve(true);
      };
      try {
        tokenClient.requestAccessToken({ prompt: "" });
      } catch (e) {
        resolve(false);
      }
    });
  }

  function disconnect() {
    if (accessToken && window.google) {
      try { window.google.accounts.oauth2.revoke(accessToken, () => {}); } catch (e) { /* ignore */ }
    }
    accessToken = null;
    tokenExpiresAt = 0;
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
  }

  function request(path, options) {
    options = options || {};
    if (!isConnected()) return Promise.reject(new Error("Not connected to Google Calendar."));
    return fetch(API_BASE + path, {
      method: options.method || "GET",
      headers: Object.assign({ Authorization: "Bearer " + accessToken, "Content-Type": "application/json" }, options.headers || {}),
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error("Google Calendar API error " + res.status + ": " + text);
      }
      if (res.status === 204) return null;
      return res.json();
    });
  }

  function testConnection(calendarId) {
    return request("/calendars/" + encodeURIComponent(calendarId || "primary"));
  }

  // Build an event body. For recurring items pass rrule (e.g.
  // "RRULE:FREQ=WEEKLY;BYDAY=SU" or "RRULE:FREQ=MONTHLY;BYMONTHDAY=1").
  function buildEventBody({ title, description, dateISO, rrule, kind, refId }) {
    const body = {
      summary: title,
      description: description || "",
      start: { date: dateISO },
      end: { date: dateISO },
      extendedProperties: { private: { adulting: "1", kind: kind || "", refId: refId || "" } },
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 540 }] }, // 9am same day
    };
    if (rrule) body.recurrence = [rrule];
    return body;
  }

  // Create or update (idempotent by refId) an Adulting event. Looks up
  // any existing event tagged with this refId+kind first so re-syncing
  // doesn't create duplicates.
  async function upsertEvent(calendarId, { title, description, dateISO, rrule, kind, refId, existingEventId }) {
    calendarId = calendarId || "primary";
    const body = buildEventBody({ title, description, dateISO, rrule, kind, refId });
    if (existingEventId) {
      try {
        return await request("/calendars/" + encodeURIComponent(calendarId) + "/events/" + existingEventId, { method: "PATCH", body });
      } catch (e) {
        // fall through to create if the old event was deleted on the calendar side
      }
    }
    return request("/calendars/" + encodeURIComponent(calendarId) + "/events", { method: "POST", body });
  }

  function deleteEvent(calendarId, eventId) {
    if (!eventId) return Promise.resolve(null);
    return request("/calendars/" + encodeURIComponent(calendarId || "primary") + "/events/" + eventId, { method: "DELETE" }).catch(() => null);
  }

  // List Adulting events (any kind) in a date window, used for the
  // "check what's coming up" reconciliation view and for reading events a
  // user added directly on Google Calendar.
  async function listAdultingEvents(calendarId, timeMinISO, timeMaxISO) {
    const params = new URLSearchParams({
      timeMin: timeMinISO + "T00:00:00Z",
      timeMax: timeMaxISO + "T23:59:59Z",
      singleEvents: "true",
      orderBy: "startTime",
      privateExtendedProperty: "adulting=1",
      maxResults: "250",
    });
    const data = await request("/calendars/" + encodeURIComponent(calendarId || "primary") + "/events?" + params.toString());
    return (data.items || []).map((ev) => ({
      id: ev.id,
      title: ev.summary,
      date: (ev.start && (ev.start.date || (ev.start.dateTime || "").slice(0, 10))) || null,
      kind: ev.extendedProperties && ev.extendedProperties.private ? ev.extendedProperties.private.kind : "",
      refId: ev.extendedProperties && ev.extendedProperties.private ? ev.extendedProperties.private.refId : "",
    }));
  }

  // List ALL events in a date window (not just Adulting's own) — used once,
  // read-only, to scan the user's existing calendar for the import wizard.
  // Never writes anything; purely for suggesting things to create locally.
  async function listAllEvents(calendarId, timeMinISO, timeMaxISO) {
    const params = new URLSearchParams({
      timeMin: timeMinISO + "T00:00:00Z",
      timeMax: timeMaxISO + "T23:59:59Z",
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const data = await request("/calendars/" + encodeURIComponent(calendarId || "primary") + "/events?" + params.toString());
    return (data.items || []).map((ev) => ({
      id: ev.id,
      title: ev.summary || "",
      date: (ev.start && (ev.start.date || (ev.start.dateTime || "").slice(0, 10))) || null,
      isAdultingEvent: !!(ev.extendedProperties && ev.extendedProperties.private && ev.extendedProperties.private.adulting),
    }));
  }

  return {
    init, isConnected, connect, ensureToken, disconnect, getAccessToken,
    testConnection, upsertEvent, deleteEvent, listAdultingEvents, listAllEvents,
  };
})();
