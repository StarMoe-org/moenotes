import { useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { getItemIconUrl } from "@/lib/items/assets";
import type { GachaDrawOption } from "@/lib/gacha/data";
import { useAssetUrl } from "@/lib/servers/use-content-server";

/** A draw option's currency icon (stars, paid stars, the gacha's ticket, …). */
export function DrawCurrencyIcon({ locale, option, className = "h-4 w-4" }: { locale: AppLocale; option: GachaDrawOption; className?: string }) {
  const src = useAssetUrl()(option.currency ? getItemIconUrl(option.currency.imagePath, locale) : "");
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img src={src} alt="" className={`${className} shrink-0 object-contain`} loading="lazy" onError={() => setFailed(true)} />;
}

/** "Pull 10 Times" or, without a game name, "10 draws". */
export function drawOptionName(locale: AppLocale, option: GachaDrawOption): string {
  return option.label || t(locale, "gacha.options.draws", { count: option.drawCount });
}

/** "200" with the currency icon, or "Free" / "Watch an ad" / "With a pass". */
export function DrawPrice({ locale, option, amount }: { locale: AppLocale; option: GachaDrawOption; amount: number }) {
  if (amount === 0) {
    const key = option.itemType === 15 ? "gacha.options.ad" : option.itemType === 23 ? "gacha.options.pass" : option.itemType === 24 ? "gacha.options.bonus" : "gacha.options.free";
    return <span className="font-bold text-[var(--mn-mint-deep)]">{t(locale, key)}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono font-black tabular-nums text-[var(--mn-accent-deep)]" title={option.currency?.name || undefined}>
      <DrawCurrencyIcon locale={locale} option={option} />
      {amount.toLocaleString(locale)}
    </span>
  );
}

/** Every draw option of a gacha: its price (and first-purchase price), guarantee, limit and points. */
export default function GachaDrawOptions({ locale, options, title }: { locale: AppLocale; options: GachaDrawOption[]; title: string }) {
  return (
    <div className="mn-paper overflow-hidden">
      <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8">
        <h3 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">{title}</h3>
      </div>
      <ol className="divide-y divide-dashed divide-[var(--mn-border)]/60 px-4 sm:px-6">
        {options.map((option) => {
          const notes = [
            option.ensuredCount > 0 ? t(locale, "gacha.options.guarantee", { count: option.ensuredCount, rarity: t(locale, `cards.rarities.${option.ensuredRarity}`) }) : "",
            option.ensuredNew ? t(locale, "gacha.options.ensuredNew") : "",
            option.limitCount > 0 ? t(locale, `gacha.options.limit${option.limitReset ? `.${option.limitReset}` : ".once"}`, { count: option.limitCount }) : "",
            option.gachaPoint > 0 ? t(locale, "gacha.options.points", { count: option.gachaPoint }) : "",
          ].filter(Boolean);
          return (
            <li key={option.slot} className="grid gap-2 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--mn-text)]">{drawOptionName(locale, option)}</p>
                {notes.length > 0 && <p className="mt-0.5 text-xs font-medium text-[var(--mn-text-muted)]">{notes.join(" · ")}</p>}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm sm:justify-end">
                {option.firstTimePrice !== null && (
                  <span className="inline-flex items-baseline gap-1.5 text-xs">
                    <span className="font-bold text-[var(--mn-text-muted)]">{t(locale, "gacha.options.firstTime")}</span>
                    <DrawPrice locale={locale} option={option} amount={option.firstTimePrice} />
                  </span>
                )}
                <DrawPrice locale={locale} option={option} amount={option.price} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
