import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BandLogo from "@/components/shared/BandLogo";
import ListCardBadge from "@/components/shared/ListCardBadge";
import MemberCardArtwork from "@/components/shared/MemberCardArtwork";
import { MemberSquareArtwork } from "@/components/shared/CardSquareArtwork";
import CardItemSurface, { type CardItemSelection } from "@/components/shared/CardItemSurface";
import { getRarityIconUrl } from "@/lib/cards/assets";
import type { CardViewModel } from "@/lib/cards/data";
import { getRoutePathById } from "@/lib/route/registry";

interface Props {
  card: CardViewModel;
  locale: AppLocale;
  onClick?: () => void;
  /** Short overlay label such as "PICK UP". */
  badge?: string | undefined;
  selection?: CardItemSelection | undefined;
}

export default function MemberCardItem({ card, locale, onClick, badge, selection }: Props) {
  const alt = t(locale, "cards.cardImageAlt", { title: card.title, character: card.characterName });

  return (
    <CardItemSurface
      href={localizePath(`${getRoutePathById("cards")}/${card.id}`, locale)}
      onClick={onClick}
      selection={selection}
      className="mn-list-card group flex w-full flex-col min-w-0 overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] text-left shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      cardId={card.id}
      label={t(locale, "cards.openDetail", { title: card.title, character: card.characterName })}
    >
      <div className="relative">
        <MemberCardArtwork
          assetId={card.assetId}
          characterId={card.characterId}
          rarity={card.rarity}
          cardType={card.cardType}
          alt={alt}
          attributeLabel={t(locale, `cards.attributes.${card.cardType}`)}
          fallbackLabel={card.characterName}
        />
        {badge && <ListCardBadge label={badge} />}
      </div>
      <div className="flex flex-col flex-1 min-w-0 p-3 sm:p-4">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full border border-[var(--mn-border)]" style={{ backgroundColor: card.characterColor }} aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)]">{card.title}</h3>
            <p className="mt-1 truncate text-xs font-medium text-[var(--mn-text-muted)]">{card.characterName}</p>
          </div>
        </div>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-dashed border-[var(--mn-text-muted)]/40">
          <img className="h-5 w-auto max-w-14 object-contain" src={getRarityIconUrl(card.rarity)} alt={t(locale, `cards.rarities.${card.rarity}`)} />
          <BandLogo bandId={card.bandId} bandName={card.bandName} locale={locale} />
        </div>
      </div>
    </CardItemSurface>
  );
}

/** The square view's tile: the game's 1:1 card icon with the title below. */
export function MemberCardTile({ card, locale, onClick, badge, selection }: Props) {
  return (
    <CardItemSurface
      href={localizePath(`${getRoutePathById("cards")}/${card.id}`, locale)}
      onClick={onClick}
      selection={selection}
      className="mn-focus group flex min-w-0 flex-col items-center gap-1.5 rounded-2xl p-1.5 text-center transition hover:-translate-y-0.5 hover:bg-[var(--mn-paper)] hover:shadow-[var(--mn-shadow-stamp)]"
      cardId={card.id}
      label={t(locale, "cards.openDetail", { title: card.title, character: card.characterName })}
    >
      <span className="relative block w-full">
        <MemberSquareArtwork locale={locale} card={card} />
        {badge && <ListCardBadge label={badge} position="right-0 top-0" />}
      </span>
      <span className="w-full min-w-0">
        <span className="block truncate text-xs font-black text-[var(--mn-text)]">{card.characterName}</span>
        <span className="block truncate text-[10px] font-medium text-[var(--mn-text-muted)]">{card.title}</span>
      </span>
    </CardItemSurface>
  );
}
