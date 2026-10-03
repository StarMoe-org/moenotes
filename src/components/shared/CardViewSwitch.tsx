import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import CollectionViewSwitch from "@/components/shared/CollectionViewSwitch";
import { CARD_VIEWS, type CardView } from "@/lib/cards/use-card-view";

/** Card list display switch, in the server switch's segmented style (CollectionViewSwitch with the card pages' copy). */
export default function CardViewSwitch({ locale, value, onChange }: { locale: AppLocale; value: CardView; onChange: (view: CardView) => void }) {
  return (
    <CollectionViewSwitch
      locale={locale}
      views={CARD_VIEWS}
      value={value}
      onChange={onChange}
      label={t(locale, "cards.view.label")}
      labels={{ card: t(locale, "cards.view.card"), square: t(locale, "cards.view.square") }}
    />
  );
}
