import { useEffect, useMemo, useState } from "react";
import PlayerProfileCard from "@/components/account/PlayerProfileCard";
import ShareImageButton from "@/components/account/ShareImageButton";
import type { AppLocale } from "@/config/locales";
import { parsePlayerPagePath } from "@/config/players";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { GameAccountRequestError, loadPublicProfile } from "@/lib/account/game-accounts";
import type { PlayerSnapshot } from "@/lib/account/player-profile";
import type { ProfileCardInfo } from "@/lib/account/profile-cards";
import { getRoutePathById } from "@/lib/route/registry";

interface Props {
  locale: AppLocale;
  /** Build time data from profile-cards.ts. */
  cards: ProfileCardInfo[];
}

type PageState =
  | { status: "loading" }
  | { status: "ready"; snapshot: PlayerSnapshot }
  /** The URL names no player: the bare shell, or a malformed ID. */
  | { status: "invalid" }
  /** Unknown, unverified or private; the API does not say which. */
  | { status: "not-found" }
  | { status: "unavailable" };

const panel = "rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-stamp)] sm:p-6";
const stampButton =
  "mn-focus mn-stamp-press inline-flex h-10 items-center rounded-xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 text-sm font-black text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-cream-deep)]";

/** A public player page, /u/{server}/{profileId}. Every player shares this page; it reads the player from the URL. */
export default function PlayerPageView({ locale, cards }: Props) {
  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    const player = parsePlayerPagePath(window.location.pathname);
    if (!player) {
      setState({ status: "invalid" });
      return;
    }
    let active = true;
    loadPublicProfile(player.server, player.profileId)
      .then((snapshot) => {
        if (!active) return;
        setState({ status: "ready", snapshot });
        if (snapshot.name) document.title = `${t(locale, "player.documentTitle", { name: snapshot.name })} | ${document.title}`;
      })
      .catch((error: unknown) => {
        if (!active) return;
        const missing = error instanceof GameAccountRequestError && (error.code === "not_found" || error.code === "player_not_found");
        setState({ status: missing ? "not-found" : "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [locale]);

  const accountHref = localizePath(getRoutePathById("account"), locale);

  return (
    <div className="space-y-5">
      <div className={panel}>
        {state.status === "ready" ? (
          <>
            <PlayerProfileCard locale={locale} snapshot={state.snapshot} cards={cardMap} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--mn-accent)_40%,transparent)] bg-[var(--mn-accent-soft)] px-2.5 py-1 text-[11px] font-black text-[var(--mn-accent-deep)]">
                {t(locale, "player.verified")}
              </p>
              <ShareImageButton locale={locale} snapshot={state.snapshot} cards={cardMap} isPublic stampButton={stampButton} />
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--mn-text-muted)]">
            {t(
              locale,
              state.status === "loading"
                ? "player.loading"
                : state.status === "invalid"
                  ? "player.invalid"
                  : state.status === "not-found"
                    ? "player.notFound"
                    : "player.unavailable",
            )}
          </p>
        )}
      </div>

      <div className={`${panel} flex flex-wrap items-center gap-4`}>
        <p className="min-w-0 flex-1 text-sm text-[var(--mn-text-muted)]">{t(locale, "player.cta")}</p>
        <a href={accountHref} className={stampButton}>
          {t(locale, "player.ctaButton")}
        </a>
      </div>
    </div>
  );
}
