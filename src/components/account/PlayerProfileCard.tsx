"use client";

import { useState } from "react";
import MemberCardArtwork from "@/components/shared/MemberCardArtwork";
import { playerCardPath } from "@/config/account";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import type { PlayerSnapshot } from "@/lib/account/player-profile";
import type { ProfileCardInfo } from "@/lib/account/profile-cards";
import { buildDynamicPath, findRouteById } from "@/lib/route/registry";
import { ContentServerProvider } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  snapshot: PlayerSnapshot;
  cards: ReadonlyMap<number, ProfileCardInfo>;
  /** Read the profile card images as the signed-in holder, so they show while the page is private too. */
  own?: boolean;
}

/**
 * A player's profile: favorite card, name, server, level, favorites and the profile card they designed in game.
 * Shared by the account page and the public page.
 */
export default function PlayerProfileCard({ locale, snapshot, cards, own = false }: Props) {
  const card = snapshot.favoriteCard ? cards.get(snapshot.favoriteCard.cardId) : undefined;
  const cardPattern = findRouteById("card-detail")?.pattern;
  const name = snapshot.name ?? t(locale, "account.games.unnamed");
  // Images the API could not serve (e.g. JP cards before the gateway can fetch them) are left out.
  // Keyed by the fetch, so a refreshed profile tries its images again.
  const [failedImages, setFailedImages] = useState<ReadonlySet<string>>(() => new Set());
  const imageKey = (index: number) => `${snapshot.fetchedAt}/${index}`;
  const cardImages = Array.from({ length: snapshot.profileCard?.images ?? 0 }, (_, index) => index).filter((index) => !failedImages.has(imageKey(index)));
  const stats = [
    { label: t(locale, "account.profile.level"), value: snapshot.level === null ? "—" : `Lv.${snapshot.level}` },
    { label: t(locale, "account.profile.favorites"), value: snapshot.favorites === null ? "—" : String(snapshot.favorites) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        {card && (
          <a
            href={cardPattern ? localizePath(buildDynamicPath(cardPattern, { id: String(card.id) }), locale) : undefined}
            className="block w-24 shrink-0 overflow-hidden rounded-shape-md border border-outline-variant shadow-elevation-1"
            title={t(locale, "account.profile.favoriteCard", { title: card.title, character: card.characterName })}
          >
            {/* The favorite card is one of the player's server's cards, so it shows from that server's catalog. */}
            <ContentServerProvider server={snapshot.server} servers={[snapshot.server]}>
              <MemberCardArtwork
                assetId={card.assetId}
                characterId={card.characterId}
                rarity={card.rarity}
                cardType={card.cardType}
                alt={t(locale, "cards.cardImageAlt", { title: card.title, character: card.characterName })}
                attributeLabel={t(locale, `cards.attributes.${card.cardType}`)}
                fallbackLabel={card.characterName}
              />
            </ContentServerProvider>
          </a>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-headline-small text-on-surface">{name}</p>
          <p className="mt-0.5 text-body-small text-on-surface-variant">
            {t(locale, `account.games.servers.${snapshot.server}`)} · ID {snapshot.profileId}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-shape-md border border-outline-variant bg-surface-container-highest px-3 py-2">
                <dt className="text-label-small text-on-surface-variant">{stat.label}</dt>
                <dd className="text-title-medium text-on-surface">{stat.value}</dd>
              </div>
            ))}
          </dl>
          {card && (
            <p className="mt-2 truncate text-body-small text-on-surface-variant">
              {t(locale, "account.profile.favoriteCard", { title: card.title, character: card.characterName })}
            </p>
          )}
          <p className="mt-1 text-label-small text-on-surface-variant">
            {t(locale, "account.profile.fetchedAt", {
              time: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.fetchedAt)),
            })}
          </p>
        </div>
      </div>

      {snapshot.profileCard && cardImages.length > 0 && (
        <div>
          <p className="mb-2 text-label-medium text-on-surface-variant">
            {snapshot.profileCard.name
              ? t(locale, "account.profile.profileCardNamed", { name: snapshot.profileCard.name })
              : t(locale, "account.profile.profileCard")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {cardImages.map((index) => (
              <img
                key={index}
                onError={() => setFailedImages((current) => new Set(current).add(imageKey(index)))}
                src={playerCardPath(snapshot.server, snapshot.profileId, index, own)}
                alt={t(locale, "account.profile.profileCardAlt", { name, index: index + 1 })}
                loading="lazy"
                className="aspect-[1224/688] w-full rounded-shape-md border border-outline-variant bg-surface-container-highest object-cover"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
