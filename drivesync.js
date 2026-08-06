/* ==========================================================================
   Adulting — Google Drive cross-device sync
   Client-side only, no backend of its own. Reuses the same Google sign-in
   token Calendar already obtained (it now also carries the drive.appdata
   scope — see calendar.js). Stores exactly one JSON file, named
   "adulting-state.json", inside the user's hidden Drive "appDataFolder" —
   a private storage area that only this app can see or touch; it does not
   show up in the user's regular Drive and no other app can read it.

   Sync model is deliberately simple: last-write-wins by comparing each
   side's STATE.updatedAt timestamp. There's no field-level merge — if two
   devices are edited at the same time before either syncs, the most
   recently saved one wins and the other device's in-between edits are
   overwritten on its next pull. Good enough for "one household, a couple
   of people, different devices," not meant for true concurrent editing.
   ========================================================================== */

const DriveSync = (function () {
  const API_BASE = "https://www.googleapis.com/drive/v3";
  const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
  const FILE_NAME = "adulting-state.json";
  let cachedFileId = null;

  function available() {
    // Calendar is declared with `const` in calendar.js (a classic script),
    // so it's a shared global lexical binding, NOT a window.Calendar
    // property — check the bare identifier, not window.Calendar.
    return typeof Calendar !== "undefined" && !!(Calendar.getAccessToken && Calendar.getAccessToken());
  }

  function authHeaders() {
    const token = Calendar.getAccessToken();
    if (!token) throw new Error("Not signed in to Google.");
    return { Authorization: "Bearer " + token };
  }

  // Finds (and caches) the file's Drive id, or null if it doesn't exist yet
  // (e.g. first time this account has ever connected).
  async function findFileId() {
    if (cachedFileId) return cachedFileId;
    const params = new URLSearchParams({
      spaces: "appDataFolder",
      q: "name='" + FILE_NAME + "'",
      fields: "files(id, modifiedTime)",
      pageSize: "1",
    });
    const res = await fetch(API_BASE + "/files?" + params.toString(), { headers: authHeaders() });
    if (!res.ok) throw new Error("Drive lookup failed: " + res.status);
    const data = await res.json();
    const file = (data.files || [])[0];
    cachedFileId = file ? file.id : null;
    return cachedFileId;
  }

  // Reads the stored state JSON from Drive, or null if nothing's been
  // synced from any device yet.
  async function pull() {
    if (!available()) return null;
    const id = await findFileId();
    if (!id) return null;
    const res = await fetch(API_BASE + "/files/" + id + "?alt=media", { headers: authHeaders() });
    if (!res.ok) throw new Error("Drive read failed: " + res.status);
    try {
      return await res.json();
    } catch (e) {
      return null; // corrupted/empty file — treat as "nothing to pull"
    }
  }

  // Writes the given state object to Drive, creating the file the first
  // time and updating it (by id) every time after.
  async function push(state) {
    if (!available()) return false;
    const body = JSON.stringify(state);
    const id = await findFileId();
    if (id) {
      const res = await fetch(UPLOAD_BASE + "/files/" + id + "?uploadType=media", {
        method: "PATCH",
        headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
        body,
      });
      if (!res.ok) throw new Error("Drive save failed: " + res.status);
      return true;
    }
    // Multipart create: metadata (name + appDataFolder parent) + content in one request.
    const boundary = "adulting-boundary-" + Date.now();
    const metadata = JSON.stringify({ name: FILE_NAME, parents: ["appDataFolder"] });
    const multipartBody =
      "--" + boundary + "\r\n" +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" + metadata + "\r\n" +
      "--" + boundary + "\r\n" +
      "Content-Type: application/json\r\n\r\n" + body + "\r\n" +
      "--" + boundary + "--";
    const res = await fetch(UPLOAD_BASE + "/files?uploadType=multipart", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "multipart/related; boundary=" + boundary }, authHeaders()),
      body: multipartBody,
    });
    if (!res.ok) throw new Error("Drive create failed: " + res.status);
    const created = await res.json();
    cachedFileId = created.id;
    return true;
  }

  return { available, pull, push };
})();
