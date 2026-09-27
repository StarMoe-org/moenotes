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
