"use client";

import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BandLogo from "@/components/shared/BandLogo";
import ListCardBadge from "@/components/shared/ListCardBadge";
import SupportCardArtwork from "@/components/support-cards/SupportCardArtwork";
import { SupportSquareArtwork } from "@/components/shared/CardSquareArtwork";
import CardItemSurface, { type CardItemSelection } from "@/components/shared/CardItemSurface";
import { getRoutePathById } from "@/lib/route/registry";
import { getSupportRarityIconUrl } from "@/lib/support-cards/assets";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

interface Props {
  card: SupportCardViewModel;
  locale: AppLocale;
  onClick?: () => void;
  /** Short overlay label such as "PICK UP". */
  badge?: string | undefined;
  selection?: CardItemSelection | undefined;
}

export default function SupportCardItem({ card, locale, onClick, badge, selection }: Props) {
  const alt = t(locale, "supportCards.cardImageAlt", { title: card.title, character: card.name });
  const rarityLabel = t(locale, `cards.rarities.${card.rarity}`);
  const rarityIcon = getSupportRarityIconUrl(card.rarity);

  return (
    <CardItemSurface
      href={localizePath(`${getRoutePathById("support-cards")}/${card.id}`, locale)}
      onClick={onClick}
      selection={selection}
      className="mn-list-card group flex w-full flex-col min-w-0 overflow-hidden border border-outline-variant bg-surface-container-low text-left shadow-elevation-1 transition hover:shadow-elevation-1"
      cardId={card.id}
      label={t(locale, "supportCards.openDetail", { title: card.title, character: card.name })}
    >
      <div className="relative">
        <SupportCardArtwork
          assetId={card.assetId}
          characterIds={card.characterIds}
          rarity={card.rarity}
          cardType={card.cardType}
          alt={alt}
          attributeLabel={t(locale, `cards.attributes.${card.cardType}`)}
          fallbackLabel={card.name}
        />
        {badge && <ListCardBadge label={badge} />}
      </div>
      <div className="flex flex-col flex-1 min-w-0 p-3 sm:p-4">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="mt-1 h-3 w-3 shrink-0 rounded-full border border-outline-variant"
            style={{ backgroundColor: card.characters[0]?.color || "var(--md-sys-color-primary)" }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-label-large leading-5 text-on-surface">{card.title}</h3>
            <p className="mt-1 truncate text-body-small text-on-surface-variant">{card.name}</p>
          </div>
        </div>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-dashed border-on-surface-variant/40">
          {rarityIcon
            ? <img className="h-5 w-auto max-w-14 object-contain" src={rarityIcon} alt={rarityLabel} />
            : <span className="text-label-medium text-primary">{rarityLabel}</span>}
          <BandLogo bandId={card.bandId} bandName={card.bandName} locale={locale} />
        </div>
      </div>
    </CardItemSurface>
  );
}

/** The square view's tile: the game's 1:1 Snap icon with the name below. */
export function SupportCardTile({ card, locale, onClick, badge, selection }: Props) {
  return (
    <CardItemSurface
      href={localizePath(`${getRoutePathById("support-cards")}/${card.id}`, locale)}
      onClick={onClick}
      selection={selection}
      className="group flex min-w-0 flex-col items-center gap-1.5 rounded-shape-lg p-1.5 text-center transition hover:bg-surface-container-low hover:shadow-elevation-1"
      cardId={card.id}
      label={t(locale, "supportCards.openDetail", { title: card.title, character: card.name })}
    >
      <span className="relative block w-full">
        <SupportSquareArtwork locale={locale} card={card} />
        {badge && <ListCardBadge label={badge} position="right-0 top-0" />}
      </span>
      <span className="w-full min-w-0">
        <span className="block truncate text-label-medium text-on-surface">{card.name}</span>
        <span className="block truncate text-label-small text-on-surface-variant">{card.title}</span>
      </span>
    </CardItemSurface>
  );
}
