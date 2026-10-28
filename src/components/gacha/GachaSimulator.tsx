"use client";

import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import ListCardBadge from "@/components/shared/ListCardBadge";
import MemberCardArtwork from "@/components/shared/MemberCardArtwork";
import { DrawCurrencyIcon, drawOptionName } from "@/components/gacha/GachaDrawOptions";
import { drawOptionCost, drawOptionPlan, type GachaDetailViewModel, type GachaDrawEntry, type GachaDrawOption, type GachaDrawPlan } from "@/lib/gacha/data";
import { drawGacha } from "@/lib/gacha/simulate";
import { formatCompactCount } from "@/lib/format/compact-count";
import { getItemIconUrl } from "@/lib/items/assets";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import { getSupportCardThumbnailUrl, getSupportRarityIconUrl, type SupportCardRarity } from "@/lib/support-cards/assets";

interface Props {
  locale: AppLocale;
  gacha: GachaDetailViewModel;
}

interface Tally {
  total: number;
  byRarity: Record<number, number>;
  pickups: number;
  /** Purchases made of each option (by slot), for first-purchase prices. */
  purchases: Record<number, number>;
  /** What the draws cost, by currency item id (options with an unknown currency under 0). */
  spent: Record<number, number>;
}

const emptyTally: Tally = { total: 0, byRarity: {}, pickups: 0, purchases: {}, spent: {} };
const TOP_RARITY = 4;

export default function GachaSimulator({ locale, gacha }: Props) {
  const [results, setResults] = useState<GachaDrawEntry[]>([]);
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [round, setRound] = useState(0);
  const members = useMemo(() => new Map(gacha.memberCards.map((card) => [card.id, card])), [gacha]);
  const supports = useMemo(() => new Map(gacha.supportCards.map((card) => [card.id, card])), [gacha]);
  const items = useMemo(() => new Map(gacha.items.map((item) => [item.id, item])), [gacha]);
  const pickupBadge = t(locale, "gacha.pickup");
  const assetUrl = useAssetUrl();

  if (gacha.draws.length === 0) return null;

  const run = (plan: GachaDrawPlan, option?: GachaDrawOption) => {
    const drawn = drawGacha(gacha.draws, plan);
    setResults(drawn);
    setRound((value) => value + 1);
    setTally((current) => {
      const byRarity = { ...current.byRarity };
      for (const entry of drawn) if (entry.kind !== "item") byRarity[entry.rarity] = (byRarity[entry.rarity] ?? 0) + 1;
      const purchases = { ...current.purchases };
      const spent = { ...current.spent };
      if (option) {
        const purchase = (purchases[option.slot] ?? 0) + 1;
        purchases[option.slot] = purchase;
        const cost = drawOptionCost(option, purchase);
        if (cost > 0) spent[option.currency?.id ?? 0] = (spent[option.currency?.id ?? 0] ?? 0) + cost;
      }
      return { total: current.total + drawn.length, byRarity, pickups: current.pickups + drawn.filter((entry) => entry.pickup).length, purchases, spent };
    });
  };
  // Priced options in their slot order; free and ad draws are left to the game.
  const options = gacha.drawOptions.filter((option) => option.drawCount > 0);
  const currencies = new Map(options.flatMap((option) => (option.currency ? [[option.currency.id, option] as const] : [])));
  const reset = () => {
    setResults([]);
    setTally(emptyTally);
  };

  const rarities = Object.keys(tally.byRarity).map(Number).sort((a, b) => b - a);
  const ten = gacha.drawPlans.ten;

  return (
    <div className="md3-surface overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant px-6 py-4 sm:px-8">
        <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">{t(locale, "gacha.simulator.title")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {options.length > 0 ? options.map((option) => (
            <button
              key={option.slot}
              type="button"
              onClick={() => run(drawOptionPlan(option), option)}
              className={`md3-button ${option.drawCount >= 10 ? "md3-button--filled" : "md3-button--tonal"}`}
            >
              <DrawCurrencyIcon locale={locale} option={option} />
              {drawOptionName(locale, option)}
            </button>
          )) : (
            <>
              <button type="button" onClick={() => run(gacha.drawPlans.single)} className="md3-button md3-button--tonal">
                {t(locale, "gacha.simulator.single")}
              </button>
              <button type="button" onClick={() => run(ten)} className="md3-button md3-button--filled">
                {t(locale, "gacha.simulator.ten")}
              </button>
            </>
          )}
          {tally.total > 0 && (
            <button type="button" onClick={reset} className="md3-button md3-button--text md3-button--small">
              {t(locale, "gacha.simulator.reset")}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {tally.total > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-label-medium" aria-live="polite">
            <span className="rounded-full bg-surface-container-highest px-2.5 py-1 text-on-surface">{t(locale, "gacha.simulator.draws", { count: tally.total })}</span>
            {rarities.map((rarity) => (
              <span key={rarity} className={`rounded-full px-2.5 py-1 ${rarity >= TOP_RARITY ? "bg-secondary-container text-primary" : "bg-surface-container text-on-surface-variant"}`}>
                {t(locale, `cards.rarities.${rarity}`)} {tally.byRarity[rarity]}
                <span className="ml-1 font-mono font-medium opacity-70">{((tally.byRarity[rarity]! / tally.total) * 100).toFixed(1)}%</span>
              </span>
            ))}
            {tally.pickups > 0 && <span className="rounded-full bg-primary px-2.5 py-1 text-on-primary">{t(locale, "gacha.simulator.pickups", { count: tally.pickups })}</span>}
            {Object.entries(tally.spent).map(([currencyId, amount]) => {
              const option = currencies.get(Number(currencyId));
              return (
                <span key={currencyId} className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-1 text-on-surface" title={option?.currency?.name || undefined}>
                  {t(locale, "gacha.simulator.spent")}
                  {option && <DrawCurrencyIcon locale={locale} option={option} className="h-3.5 w-3.5" />}
                  <span className="font-mono tabular-nums">{amount.toLocaleString(locale)}</span>
                </span>
              );
            })}
          </div>
        )}

        {results.length === 0 ? (
          <p className="rounded-shape-lg border border-dashed border-outline-variant px-4 py-8 text-center text-body-medium text-on-surface-variant">{t(locale, "gacha.simulator.idle")}</p>
        ) : (
          <ol className="grid grid-cols-5 gap-2 sm:gap-3">
            {results.map((entry, index) => {
              const card = entry.kind === "member" ? members.get(entry.id) : undefined;
              const support = entry.kind === "support" ? supports.get(entry.id) : undefined;
              const item = entry.kind === "item" ? items.get(entry.id) : undefined;
              const label = card ? `${card.characterName} · ${card.title}` : support ? `${support.name} · ${support.title}` : item ? `${item.name} ${t(locale, "gacha.itemAmount", { count: entry.amount.toLocaleString(locale) })}` : "";
              const top = entry.kind !== "item" && entry.rarity >= TOP_RARITY;
              const supportIcon = support ? getSupportRarityIconUrl(support.rarity as SupportCardRarity) : "";
              return (
                <li
                  key={`${round}-${index}`}
                  title={label}
                  className={`mn-draw-reveal relative overflow-hidden rounded-shape-md border bg-surface-container-highest ${top ? "border-primary shadow-[0_0_0_2px_color-mix(in_srgb,var(--md-sys-color-primary)_28%,transparent)]" : "border-outline-variant"}`}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span className="sr-only">{label}</span>
                  {card ? (
                    <MemberCardArtwork assetId={card.assetId} characterId={card.characterId} rarity={card.rarity} cardType={card.cardType} alt="" attributeLabel={t(locale, `cards.attributes.${card.cardType}`)} fallbackLabel={card.characterName} />
                  ) : support ? (
                    <div className="relative aspect-[3/4]">
                      <img className="h-full w-full object-cover" src={assetUrl(getSupportCardThumbnailUrl(support.assetId))} alt="" loading="lazy" />
                      <span className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/45 to-transparent pb-1 pt-4">
                        {supportIcon ? <img className="h-4 w-auto" src={supportIcon} alt="" /> : <span className="text-label-small text-white">{t(locale, `cards.rarities.${support.rarity}`)}</span>}
                      </span>
                    </div>
                  ) : (
                    <div className="grid aspect-[3/4] place-items-center p-2">
                      <img className="max-h-[60%] w-auto object-contain" src={item ? assetUrl(getItemIconUrl(item.imagePath, locale)) : ""} alt="" loading="lazy" />
                      <span className="font-mono text-label-small text-primary">{t(locale, "gacha.itemAmount", { count: formatCompactCount(entry.amount) })}</span>
                    </div>
                  )}
                  {entry.pickup && entry.kind !== "item" && <ListCardBadge label={pickupBadge} position="right-1 top-1 scale-90 origin-top-right" />}
                </li>
              );
            })}
          </ol>
        )}

        <div className="space-y-1 border-t border-outline-variant pt-3 text-body-small leading-6 text-on-surface-variant">
          {ten.guaranteeCount > 0 && <p>{t(locale, "gacha.simulator.guarantee", { count: ten.guaranteeCount, rarity: t(locale, `cards.rarities.${ten.guaranteeRarity}`) })}</p>}
          <p>{t(locale, "gacha.simulator.note")}</p>
        </div>
      </div>
    </div>
  );
}
