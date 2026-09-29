# Accounts (StarMoe Passport)

Sign-in goes through **StarMoe Passport**: a self-hosted Logto instance that all StarMoe sites share. Its sign-in
page is at `https://passport.star.moe` and its admin console at `https://passport-admin.star.moe`. Its theme and
email templates live in the `starmoe-passport` repository. The backend that signs users in and keeps their
sessions is **starmoe-api** (Go, SQLite), a separate service in its own repository. Its README has the endpoint
contract, its configuration and the passport app settings.

This repository only holds the site's side:

```text
browser ── bdon.moe ── server/main.ts ── static build
                   └── /api/*  ──server/api-proxy.ts──  starmoe-api ── passport.star.moe
```

- **Proxy.** The deploy server forwards `/api/*` to `MOENOTES_API_INTERNAL`, so pages call the API same-origin:
  its session cookie is first-party and no CORS is involved. The request body, status, redirects and every
  `Set-Cookie` pass through. The proxy works before the first build too. Without the variable `/api/*` answers
  404, and 502 when the API does not answer.
- **Contract.** `src/config/account.ts` holds the paths (`/api/auth/login`, `/api/auth/callback`,
  `/api/auth/logout`, `/api/me`). `src/lib/account/client.ts` reads `/api/me`
  (`{"user": {"name", "username", "picture"} | null}`) once per page load. Signing in and out are full-page
  navigations: a link to the login URL with the current path and locale, and a form POST to the logout path.
- **Header.** `src/components/shell/AccountButton.tsx` shows a sign-in button, or the user's avatar (the name's
  initial when there is none or it fails to load) with a sign-out menu. Without the API (a static preview, `astro
  dev` without starmoe-api, or the API is down) `/api/me` fails and the button stays hidden, so the site deploys
  independently of the API.
- **Security settings.** Password, email, two-step verification, linked accounts and signed-in devices belong to
  the passport, not to one site, so the account page only links to Logto's prebuilt Account Center
  (`passportAccountUrl` in `src/config/account.ts`). Password and email open in the same tab and come back to the
  account page after the passport's own success page; the security hub opens in a new tab. The Account Center's
  field permissions and theme are set up in the `starmoe-passport` repository's README.

- **Game accounts.** `src/components/account/GameAccounts.tsx` on the account page binds Our Notes accounts
  through starmoe-api (`/api/me/game-accounts`, client in `src/lib/account/game-accounts.ts`; its README,
  "Game accounts"). The user picks a server (`GAME_SERVERS` in `src/config/account.ts`: `tw` = HMT, `jp`, `en`,
  `kr`) and a player ID, gets a one-time code, puts it in their in-game name and presses Verify; starmoe-api reads
  the public profile through the game gateway to see it. Once bound they can rename back. `isGameProfileId`
  mirrors the API's ID check so obvious typos never leave the page. Accounts are unverified (with a code the user
  can swap for a new one) or verified; a verified account opens its profile.
- **Player profiles.** starmoe-api stores each verified account's gateway answers as a JSON file and serves it as
  is (its README, "Player profiles"); `src/lib/account/player-profile.ts` reads it (int64 values arrive as strings).
  `PlayerProfileCard.tsx` shows it; the favorite card comes from a build-time card index (`profile-cards.ts`)
  passed to the page. The holder can refresh it and make it public.
- **Public player pages.** `/u/{server}/{profileId}` (under a locale prefix too) shows a public profile. A static
  build has no page per player, so the route `/u` builds one shell per locale and `PlayerPageView.tsx` reads the
  player from the URL. `src/config/players.ts` holds the path rules; it uses relative imports only, because
  `server/static.ts` (deploy) and `astro.config.mjs` (dev) import it to serve that shell for every player path.
  Unknown, unverified and private accounts all show the same "not found".
- **Link previews.** Crawlers don't run scripts, so `server/player-meta.ts` writes the player's name and level into
  the shell's `<title>`, description and `og:*`/`twitter:*` tags, read from `/api/players/…` (1.5 s timeout, 5 minute
  cache, 30 seconds for misses). Any failure serves the plain shell. `og:image` stays the site default.
- **Share image.** `src/lib/account/share-image.ts` draws a 1080 × 1440 PNG on a canvas in the browser: the favorite
  card's full art (3:4, from the asset host, which allows CORS), the logo, name, level, favorites and, for a public
  profile, its address. `ShareImageButton.tsx` offers download, copy and the system share sheet.

## Deployment

Set `MOENOTES_API_INTERNAL` on the site service to starmoe-api's origin, including the scheme:

- **Same cluster:** its in-cluster address, e.g. `http://starmoe-api.moenotes.svc.cluster.local:8080`.
- **Another server** (starmoe-api runs next to the passport): its public `https://` origin, e.g.
  `https://api.star.moe`. It must be HTTPS, because the proxy forwards the user's session cookie. A CDN or WAF in
  front of it must let the site server's requests through without a challenge. `PUBLIC_ORIGIN` on starmoe-api
  stays `https://bdon.moe` either way.

A value without a scheme (`api.star.moe`) is refused and logged at startup, and `/api/*` stays off. The site and
the API deploy independently.

## Local development

Run starmoe-api on port 8787 with `PUBLIC_ORIGIN=http://localhost:4321` (its README, "Development"), then
`bun run dev`. `astro dev` forwards `/api` to `http://localhost:8787`; override the target with `MOENOTES_API_DEV`.
The passport app needs `http://localhost:4321/api/auth/callback` as a redirect URI and `http://localhost:4321/` as a
post sign-out redirect URI.
