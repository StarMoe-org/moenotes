/**
 * Paths of the account API: starmoe-api, a separate service and repository. They are a contract with it. Pages
 * reach it same-origin: the deploy server forwards `/api/*` to it (docs/account.md), so its cookies are
 * first-party and no CORS is involved.
 */
export const accountApi = {
  login: "/api/auth/login",
  callback: "/api/auth/callback",
  logout: "/api/auth/logout",
  me: "/api/me",
  avatar: "/api/me/avatar",
} as const;

/** Starts a StarMoe Passport sign-in that comes back to `returnTo`; the sign-in page follows `locale`. */
export function accountLoginUrl(locale: string, returnTo: string): string {
  return `${accountApi.login}?${new URLSearchParams({ return: returnTo, locale })}`;
}
