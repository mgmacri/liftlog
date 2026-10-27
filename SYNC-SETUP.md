# LiftLog sync setup (GitHub sign-in + per-user Gist)

Each user signs in with GitHub and their workouts are stored in a **private Gist
in their own account** — they own it, can see it, and can revoke access anytime.

A static page can't finish a GitHub sign-in by itself (the final token exchange
needs a client secret and hits a no-CORS endpoint), so there's **one tiny
server-side piece**: a Cloudflare Worker that does only that exchange. It's free
and about 40 lines (`worker/index.js`).

Until you complete the three steps below, the app runs **fully local** — no
sign-in button appears and nothing touches the network.

---

## 1. Register a GitHub OAuth App — 2 min

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
   (https://github.com/settings/developers).
2. Fill in:
   - **Application name:** `LiftLog` (anything)
   - **Homepage URL:** `https://mgmacri.github.io/liftlog/`
   - **Authorization callback URL:** `https://mgmacri.github.io/liftlog/`
     (must match exactly, including the trailing slash)
3. Create it, then **copy the Client ID**. Click **Generate a new client secret**
   and copy the secret (you'll paste it into the Worker, not the app).

> Enabling **Device Flow** is not needed. The `gist` scope the app requests only
> lets it create and update gists — not touch your repos.

---

## 2. Deploy the Worker — 5 min

You need Node and the Cloudflare CLI (`npm i -g wrangler`) and a free Cloudflare
account (`wrangler login`).

```bash
cd worker

# edit wrangler.toml: set GH_CLIENT_ID to your Client ID,
# and ALLOWED_ORIGIN to your app's ORIGIN (no path), e.g. https://mgmacri.github.io

wrangler secret put GH_CLIENT_SECRET   # paste the client secret when prompted
wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g.
`https://liftlog-oauth.<your-subdomain>.workers.dev`. Copy it.

---

## 3. Point the app at it — 1 min

Edit the `GH` block at the top of `app.js`:

```js
const GH = {
  clientId: 'Iv1.abc123...',                                  // from step 1
  workerUrl: 'https://liftlog-oauth.<you>.workers.dev',       // from step 2
  scope: 'gist',
};
```

Commit and push. The service worker is network-first, so the update lands on
next load. A **Sign in with GitHub** button now appears.

---

## How it behaves

- **Sign in** → the app finds an existing `liftlog-data.json` gist or creates a
  private one, then syncs.
- **Many users:** each person signs in with their own GitHub account and gets
  their own gist. Nothing is shared.
- **Many devices:** edits merge per workout (newest edit wins) with deletions
  tombstoned, so two devices won't clobber each other. Pushes are debounced ~1.5s
  and re-merge the remote first.
- **Export CSV** (on the Workouts screen) downloads a spreadsheet that opens in
  Excel — one row per set.
- **Sign out** clears the token from the device; the gist and local data remain.

## Notes / troubleshooting

- `ALLOWED_ORIGIN` is the **origin only** (scheme + host), e.g.
  `https://mgmacri.github.io`. The callback URL in step 1 is the **full path**.
- "Sign-in failed (state mismatch)" → stale/blocked `sessionStorage`; just retry.
- To rotate access, delete the OAuth app's client secret and set a new one with
  `wrangler secret put GH_CLIENT_SECRET`.
- Token is stored in the browser's `localStorage` (standard for this kind of
  app); it's the user's own `gist`-scoped token.
