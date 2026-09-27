import { useEffect, useRef, useState } from "react";
import { accountApi, accountLoginUrl } from "@/config/account";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import AccountAvatar from "@/components/account/AccountAvatar";
import { accountAvatarUrl } from "@/lib/account/avatar-url";
import { getRoutePathById } from "@/lib/route/registry";
import { useAccount } from "@/lib/account/use-account";

interface Props {
  locale: AppLocale;
  /** Current page, so signing in comes back to it (the component is server-rendered first). */
  pathname: string;
}

/** Pinned at the foot of the sidebar, below the scrolling nav. */
const pane = "shrink-0 border-t border-dashed border-[var(--mn-border)]/25 px-3.5 py-3";

/** The pinned account pane at the foot of the sidebar: sign-in, or the signed-in user with a small menu. */
export default function SidebarAccount({ locale, pathname }: Props) {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Signed out, still loading, or no account API on this deployment: no account row at all.
  if (account?.status !== "signed-in") {
    return account?.status === "signed-out" ? (
      <div className={pane}>
      <a
        href={accountLoginUrl(locale, pathname)}
        className="mn-focus mn-stamp-press flex items-center gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--mn-border)_18%,transparent)] bg-[var(--mn-paper)] px-3 py-2.5 text-[14px] font-black text-[var(--mn-text)] transition-colors hover:bg-[var(--mn-cream-deep)]"
      >
        <UserIcon />
        <span className="truncate">{t(locale, "account.signIn")}</span>
      </a>
      </div>
    ) : null;
  }

  const { user } = account;
  const displayName = user.name ?? user.username ?? t(locale, "account.passport");

  return (
    <div ref={rootRef} className={`${pane} relative`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t(locale, "account.menu")}
        className="mn-focus flex w-full items-center gap-3 rounded-2xl border border-[color-mix(in_oklab,var(--mn-border)_18%,transparent)] bg-[var(--mn-paper)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--mn-cream-deep)]"
      >
        <AccountAvatar url={accountAvatarUrl(user)} name={displayName} className="h-9 w-9 rounded-xl text-sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-black text-[var(--mn-text)]">{displayName}</span>
          <span className="block truncate text-[11px] font-bold text-[var(--mn-text-muted)]">{t(locale, "account.passport")}</span>
        </span>
        <svg className={`h-4 w-4 shrink-0 text-[var(--mn-text-muted)] transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-3.5 right-3.5 z-50 mb-2 rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] p-1.5 shadow-[var(--mn-shadow-stamp-lg)]"
        >
          <a
            href={localizePath(getRoutePathById("account"), locale)}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="mn-focus block rounded-xl px-3 py-2 text-sm font-bold text-[var(--mn-text)] hover:bg-[var(--mn-cream-deep)]"
          >
            {t(locale, "account.manage")}
          </a>
          <form method="post" action={accountApi.logout}>
            <button type="submit" role="menuitem" className="mn-focus w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[var(--mn-text)] hover:bg-[var(--mn-cream-deep)]">
              {t(locale, "account.signOut")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function UserIcon() {
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-cream-deep)] text-[var(--mn-text-muted)]">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    </span>
  );
}
