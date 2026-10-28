"use client";

import { useState } from "react";
import ButtonBase from "@mui/material/ButtonBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { accountApi, accountLoginUrl } from "@/config/account";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import AccountAvatar from "@/components/account/AccountAvatar";
import { Icon } from "@/components/shared/icons";
import { accountAvatarUrl } from "@/lib/account/avatar-url";
import { getRoutePathById } from "@/lib/route/registry";
import { useAccount } from "@/lib/account/use-account";

interface Props {
  locale: AppLocale;
  /** Current page, so signing in comes back to it (the component is server-rendered first). */
  pathname: string;
}

/**
 * The account pane pinned at the foot of the navigation drawer: sign-in, or the signed-in user with a menu.
 *
 * Both rows are part of the server markup, and which one shows is decided by `data-account` on <html>: the head
 * script (src/lib/account/bootstrap.ts) sets it from the previous page's `/api/me` answer before the first paint,
 * and the client keeps it current. That gives the drawer's foot its final height immediately (waiting for the fetch
 * left the navigation list 73px taller, then it jumped up as the row appeared) and shows a signed-in reader their
 * own row instead of a "sign in" row that swaps to it a moment later.
 *
 * Before the answer arrives the user row is a skeleton: an avatar circle and empty name span, which the pre-paint
 * script fills with the cached name through `--mn-account-name` / `--mn-account-initial`. Once the account resolves,
 * `data-account-resolved` switches the row to the real name and avatar.
 */
export default function SidebarAccount({ locale, pathname }: Props) {
  const account = useAccount();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const signedIn = account?.status === "signed-in";
  const displayName = signedIn ? account.user.name ?? account.user.username ?? t(locale, "account.passport") : "";
  const open = Boolean(anchor);

  // A deployment without the account API has no account row at all (the pre-paint script already hid it).
  if (account?.status === "unavailable") return null;

  return (
    <div className="mn-sidebar-account shrink-0 border-t border-outline-variant p-2">
      {/* The default row: a visitor without a session. */}
      <a href={accountLoginUrl(locale, pathname)} className="mn-account-signin md3-state flex h-14 items-center gap-3 rounded-full px-4 text-label-large text-on-surface-variant hover:text-on-surface">
        <Icon name="user" />
        <span className="truncate">{t(locale, "account.signIn")}</span>
      </a>
      <div className="mn-account-user" {...(signedIn ? { "data-account-resolved": "" } : {})}>
        <ButtonBase
          onClick={signedIn ? (event) => setAnchor(event.currentTarget) : undefined}
          aria-haspopup={signedIn ? "menu" : undefined}
          aria-expanded={signedIn ? open : undefined}
          aria-label={signedIn ? t(locale, "account.menu") : undefined}
          className="md3-state flex w-full items-center !justify-start gap-3 !rounded-full py-2 !pl-2 !pr-4 text-left"
        >
          {signedIn ? (
            <AccountAvatar url={accountAvatarUrl(account.user)} name={displayName} className="h-10 w-10 rounded-full text-sm" />
          ) : (
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest text-sm font-black text-on-surface">
              <span className="mn-account-initial" aria-hidden="true" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="mn-account-name block truncate text-label-large text-on-surface">{signedIn ? displayName : null}</span>
            <span className="block truncate text-body-small text-on-surface-variant">{t(locale, "account.passport")}</span>
          </span>
          <Icon name="chevronUp" className={`h-5 w-5 shrink-0 text-on-surface-variant transition-transform ${open ? "" : "rotate-180"}`} />
        </ButtonBase>
        {signedIn && (
          <Menu
            anchorEl={anchor}
            open={open}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: "top", horizontal: "left" }}
            transformOrigin={{ vertical: "bottom", horizontal: "left" }}
          >
            <MenuItem component="a" href={localizePath(getRoutePathById("account"), locale)} onClick={() => setAnchor(null)}>
              <Icon name="user" />
              {t(locale, "account.manage")}
            </MenuItem>
            <form method="post" action={accountApi.logout}>
              <MenuItem component="button" type="submit" className="!w-full">
                <Icon name="logout" />
                {t(locale, "account.signOut")}
              </MenuItem>
            </form>
          </Menu>
        )}
      </div>
    </div>
  );
}
