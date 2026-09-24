import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BandLogo from "@/components/shared/BandLogo";
import ListCardBadge from "@/components/shared/ListCardBadge";
import SupportCardArtwork from "@/components/support-cards/SupportCardArtwork";
import { getRoutePathById } from "@/lib/route/registry";
import { getSupportRarityIconUrl } from "@/lib/support-cards/assets";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

interface Props {
  card: SupportCardViewModel;
  locale: AppLocale;
  onClick?: () => void;
  /** Short overlay label such as "PICK UP". */
  badge?: string;
}

export default function SupportCardItem({ card, locale, onClick, badge }: Props) {
  const alt = t(locale, "supportCards.cardImageAlt", { title: card.title, character: card.name });
  const rarityLabel = t(locale, `cards.rarities.${card.rarity}`);
  const rarityIcon = getSupportRarityIconUrl(card.rarity);

  return (
    <a
      href={localizePath(`${getRoutePathById("support-cards")}/${card.id}`, locale)}
      onClick={onClick}
      className="mn-list-card group flex flex-col min-w-0 overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      data-list-item-id={card.id}
      aria-label={t(locale, "supportCards.openDetail", { title: card.title, character: card.name })}
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
            className="mt-1 h-3 w-3 shrink-0 rounded-full border border-[var(--mn-border)]"
            style={{ backgroundColor: card.characters[0]?.color || "var(--mn-accent)" }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)]">{card.title}</h3>
            <p className="mt-1 truncate text-xs font-medium text-[var(--mn-text-muted)]">{card.name}</p>
          </div>
        </div>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-dashed border-[var(--mn-text-muted)]/40">
          {rarityIcon
            ? <img className="h-5 w-auto max-w-14 object-contain" src={rarityIcon} alt={rarityLabel} />
            : <span className="text-xs font-black text-[var(--mn-accent-deep)]">{rarityLabel}</span>}
          <BandLogo bandId={card.bandId} bandName={card.bandName} />
        </div>
      </div>
    </a>
  );
}
