"use client";

import SiriusLoader from "@/components/shared/SiriusLoader";
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

const panel = "md3-surface p-5 sm:p-6";
const stampButton = "md3-button md3-button--tonal";

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
              <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-secondary-container px-2.5 py-1 text-label-small text-primary">
                {t(locale, "player.verified")}
              </p>
              <ShareImageButton locale={locale} snapshot={state.snapshot} cards={cardMap} isPublic stampButton={stampButton} />
            </div>
          </>
        ) : state.status === "loading" ? (
          <SiriusLoader locale={locale} label={t(locale, "player.loading")} />
        ) : (
          <p className="text-body-medium text-on-surface-variant">
            {t(
              locale,
              state.status === "invalid"
                ? "player.invalid"
                : state.status === "not-found"
                  ? "player.notFound"
                  : "player.unavailable",
            )}
          </p>
        )}
      </div>

      <div className={`${panel} flex flex-wrap items-center gap-4`}>
        <p className="min-w-0 flex-1 text-body-medium text-on-surface-variant">{t(locale, "player.cta")}</p>
        <a href={accountHref} className={stampButton}>
          {t(locale, "player.ctaButton")}
        </a>
      </div>
    </div>
  );
}
