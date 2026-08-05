# Going live on GitHub Pages

This walks through publishing Adulting at a real HTTPS URL using GitHub Pages, then reconnecting Google Calendar and Blue Bonnet to that new address. No command line required — everything below uses the GitHub website.

## 1. Create the GitHub repository

1. Go to **github.com** and sign in (or create a free account).
2. Click the **+** in the top-right → **New repository**.
3. Name it anything (e.g. `adulting`). Keep it **Public** (GitHub Pages' free tier requires a public repo, unless you're on a paid plan). Don't add a README — leave it empty. Click **Create repository**.

## 2. Upload the app files

1. On the new (empty) repo page, click **uploading an existing file**.
2. From your computer, open the `organize-it` folder and drag in **everything inside it** — `index.html`, the `css` folder, the `js` folder, `README.md`, etc. (Drag the folder's *contents*, not the `organize-it` folder itself — `index.html` needs to end up at the repo's root, not inside a subfolder.)
3. Scroll down, add a commit message like "Initial upload," and click **Commit changes**.

## 3. Turn on GitHub Pages

1. In the repo, go to **Settings → Pages** (left sidebar, under "Code and automation").
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Under **Branch**, choose **main** and folder **/ (root)**. Click **Save**.
4. Wait about a minute, then refresh the page — GitHub shows your live URL at the top, something like:
   `https://your-username.github.io/adulting/`

That URL is now your live app. Bookmark it.

## 4. Point Google Calendar at the new URL

Your existing Google Cloud OAuth credentials need to know this new address is allowed to sign in.

1. Go to **console.cloud.google.com**, open the project you made for Adulting.
2. **APIs & Services → Credentials**, click your existing OAuth 2.0 Client ID.
3. Under **Authorized JavaScript origins**, click **+ Add URI** and add:
   `https://your-username.github.io`
   (just the origin — scheme + host, no path, no trailing slash). Keep your `http://localhost:8000` entry too if you still want to run it locally sometimes.
4. Click **Save**.
5. The OAuth Client ID itself doesn't change — you don't need to update anything in Adulting's Settings for this part.
6. Your OAuth consent screen can stay in **Testing** status as long as only you (and anyone else you added as a test user) will sign in. If you want other people to connect their *own* Google accounts later, you'd need to publish the consent screen, which triggers Google's verification process for sensitive scopes — not necessary for personal/household use.

## 5. Point Blue Bonnet's Worker at the new URL (if you're using it)

If you deployed the Cloudflare Worker proxy for Blue Bonnet:

1. Open your Worker's code (or the Cloudflare dashboard → Workers & Pages → your worker → Settings).
2. Update `ALLOWED_ORIGIN` to `https://your-username.github.io` (matching the live site).
3. Redeploy the Worker.
4. The Worker's URL itself doesn't change, so **Settings → Blue Bonnet Assistant → Worker Proxy URL** in Adulting stays the same — nothing to update there unless you redeployed to a new Worker URL too.

## 6. Bring your data with you

Data lives in the browser's local storage per *origin* — `localhost:8000` and `your-username.github.io` are different origins, so the live site starts empty even though you've been using the local version.

1. On your local `localhost:8000` copy: **Settings → Export backup (.json)**.
2. Open the live GitHub Pages URL, skip or complete onboarding, then go to **Settings → Import backup** and pick that file.

## 7. Quick smoke test on the live URL

- Open the live link in a normal (non-incognito) browser tab.
- Confirm the onboarding screen appears (or your imported data shows up, if you imported a backup).
- Settings → Connect Google Calendar — it should complete without an origin error now.
- Try the Board view button.
- Try Blue Bonnet (bottom-right bubble), if configured.

## 8. Let Blue Bonnet actually take actions (one-time Worker update)

Blue Bonnet can now do things in the app when you ask it to in chat (add a bill, check off a chore, log groceries, etc.), not just talk. This needs one small update to your Cloudflare Worker so it forwards that capability through to Anthropic — your current Worker silently drops it otherwise.

1. Open **`cloudflare-worker.js`** in this folder.
2. Set `ALLOWED_ORIGIN` near the top to your live site's origin (same value you already used for this — e.g. `https://your-username.github.io`).
3. Go to your Cloudflare dashboard → **Workers & Pages** → your worker → **Edit code**.
4. Select all the existing code and replace it with the full contents of `cloudflare-worker.js`.
5. Click **Deploy**.
6. Your `ANTHROPIC_API_KEY` secret is unaffected by this — it's already set from before and doesn't need to be re-entered.

Nothing changes in Adulting's Settings for this step — the Worker's URL stays the same.

## Updating the app later

Any time you edit a file locally, go back to the repo on GitHub, open that file, click the pencil (edit) icon, paste in the new content, and commit — GitHub Pages rebuilds automatically within about a minute. For frequent changes, using `git` from the command line is faster, but the web UI works fine for occasional edits.
