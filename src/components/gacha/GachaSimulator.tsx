import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import ListCardBadge from "@/components/shared/ListCardBadge";
import MemberCardArtwork from "@/components/shared/MemberCardArtwork";
import type { GachaDetailViewModel, GachaDrawEntry, GachaDrawPlan } from "@/lib/gacha/data";
import { drawGacha } from "@/lib/gacha/simulate";
import { formatCompactCount } from "@/lib/format/compact-count";
import { getItemIconUrl } from "@/lib/items/assets";
import { getSupportCardThumbnailUrl, getSupportRarityIconUrl, type SupportCardRarity } from "@/lib/support-cards/assets";

interface Props {
  locale: AppLocale;
  gacha: GachaDetailViewModel;
}

interface Tally {
  total: number;
  byRarity: Record<number, number>;
  pickups: number;
}

const emptyTally: Tally = { total: 0, byRarity: {}, pickups: 0 };
const TOP_RARITY = 4;

export default function GachaSimulator({ locale, gacha }: Props) {
  const [results, setResults] = useState<GachaDrawEntry[]>([]);
  const [tally, setTally] = useState<Tally>(emptyTally);
  const [round, setRound] = useState(0);
  const members = useMemo(() => new Map(gacha.memberCards.map((card) => [card.id, card])), [gacha]);
  const supports = useMemo(() => new Map(gacha.supportCards.map((card) => [card.id, card])), [gacha]);
  const items = useMemo(() => new Map(gacha.items.map((item) => [item.id, item])), [gacha]);
  const pickupBadge = t(locale, "gacha.pickup");

  if (gacha.draws.length === 0) return null;

  const run = (plan: GachaDrawPlan) => {
    const drawn = drawGacha(gacha.draws, plan);
    setResults(drawn);
    setRound((value) => value + 1);
    setTally((current) => {
      const byRarity = { ...current.byRarity };
      for (const entry of drawn) if (entry.kind !== "item") byRarity[entry.rarity] = (byRarity[entry.rarity] ?? 0) + 1;
      return { total: current.total + drawn.length, byRarity, pickups: current.pickups + drawn.filter((entry) => entry.pickup).length };
    });
  };
  const reset = () => {
    setResults([]);
    setTally(emptyTally);
  };

  const rarities = Object.keys(tally.byRarity).map(Number).sort((a, b) => b - a);
  const ten = gacha.drawPlans.ten;
  const buttonBase = "mn-focus mn-stamp-press inline-flex items-center justify-center rounded-full border px-5 py-2 text-sm font-bold shadow-[var(--mn-shadow-stamp)]";

  return (
    <div className="mn-paper overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8">
        <h3 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">{t(locale, "gacha.simulator.title")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => run(gacha.drawPlans.single)} className={`${buttonBase} border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)]`}>
            {t(locale, "gacha.simulator.single")}
          </button>
          <button type="button" onClick={() => run(ten)} className={`${buttonBase} border-[var(--mn-border)] bg-[var(--mn-accent-deep)] text-[var(--mn-paper)]`}>
            {t(locale, "gacha.simulator.ten")}
          </button>
          {tally.total > 0 && (
            <button type="button" onClick={reset} className="mn-focus rounded-full px-3 py-2 text-xs font-bold text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]">
              {t(locale, "gacha.simulator.reset")}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        {tally.total > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold" aria-live="polite">
            <span className="rounded-full bg-[var(--mn-cream-deep)] px-2.5 py-1 text-[var(--mn-text)]">{t(locale, "gacha.simulator.draws", { count: tally.total })}</span>
            {rarities.map((rarity) => (
              <span key={rarity} className={`rounded-full px-2.5 py-1 ${rarity >= TOP_RARITY ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "bg-[var(--mn-surface)] text-[var(--mn-ink-soft)]"}`}>
                {t(locale, `cards.rarities.${rarity}`)} {tally.byRarity[rarity]}
                <span className="ml-1 font-mono font-medium opacity-70">{((tally.byRarity[rarity]! / tally.total) * 100).toFixed(1)}%</span>
              </span>
            ))}
            {tally.pickups > 0 && <span className="rounded-full bg-[var(--mn-accent-deep)] px-2.5 py-1 text-[var(--mn-paper)]">{t(locale, "gacha.simulator.pickups", { count: tally.pickups })}</span>}
          </div>
        )}

        {results.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--mn-glass-border)] px-4 py-8 text-center text-sm text-[var(--mn-text-muted)]">{t(locale, "gacha.simulator.idle")}</p>
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
                  className={`mn-draw-reveal relative overflow-hidden rounded-xl border bg-[var(--mn-cream-deep)] ${top ? "border-[var(--mn-accent)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--mn-accent)_28%,transparent)]" : "border-[var(--mn-glass-border)]"}`}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span className="sr-only">{label}</span>
                  {card ? (
                    <MemberCardArtwork assetId={card.assetId} characterId={card.characterId} rarity={card.rarity} cardType={card.cardType} alt="" attributeLabel={t(locale, `cards.attributes.${card.cardType}`)} fallbackLabel={card.characterName} />
                  ) : support ? (
                    <div className="relative aspect-[3/4]">
                      <img className="h-full w-full object-cover" src={getSupportCardThumbnailUrl(support.assetId)} alt="" loading="lazy" />
                      <span className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/45 to-transparent pb-1 pt-4">
                        {supportIcon ? <img className="h-4 w-auto" src={supportIcon} alt="" /> : <span className="text-[10px] font-black text-white">{t(locale, `cards.rarities.${support.rarity}`)}</span>}
                      </span>
                    </div>
                  ) : (
                    <div className="grid aspect-[3/4] place-items-center p-2">
                      <img className="max-h-[60%] w-auto object-contain" src={item ? getItemIconUrl(item.imagePath) : ""} alt="" loading="lazy" />
                      <span className="font-mono text-[11px] font-bold text-[var(--mn-accent-deep)]">{t(locale, "gacha.itemAmount", { count: formatCompactCount(entry.amount) })}</span>
                    </div>
                  )}
                  {entry.pickup && entry.kind !== "item" && <ListCardBadge label={pickupBadge} position="right-1 top-1 scale-90 origin-top-right" />}
                </li>
              );
            })}
          </ol>
        )}

        <div className="space-y-1 border-t border-[var(--mn-glass-border)] pt-3 text-xs leading-6 text-[var(--mn-text-muted)]">
          {ten.guaranteeCount > 0 && <p>{t(locale, "gacha.simulator.guarantee", { count: ten.guaranteeCount, rarity: t(locale, `cards.rarities.${ten.guaranteeRarity}`) })}</p>}
          <p>{t(locale, "gacha.simulator.note")}</p>
        </div>
      </div>
    </div>
  );
}
