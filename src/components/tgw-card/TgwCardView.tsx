import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import RewardChip from "@/components/shared/RewardChip";
import ServerScope from "@/components/shared/ServerScope";
import { t } from "@/i18n";
import { moveReleaseUrls } from "@/lib/assets/release";
import { replaceQueryParam } from "@/lib/route/url-state";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";
import { formatTgwBonusValue, parseTgwRankParam, type TgwBonusViewModel, type TgwCardViewModel, type TgwRankViewModel } from "@/lib/vip/data";

interface Props {
  locale: AppLocale;
  card: ServerFacetedValue<TgwCardViewModel> | null;
  servers: GameServer[];
}

const panelHeader = "flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl";

/** The T.G.W CARD ladder as the page's server has it; `?rank=N` scrolls to and highlights that rank. */
export default function TgwCardView({ locale, card: faceted, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const card = useMemo(() => faceted && moveReleaseUrls(valueForServer(faceted, server), entityServer(faceted, server)), [faceted, server]);
  const [highlight, setHighlight] = useState<number | null>(null);

  useEffect(() => {
    const rank = parseTgwRankParam(window.location.search);
    if (rank === null) return;
    setHighlight(rank);
    const handle = window.requestAnimationFrame(() => document.getElementById(`tgw-rank-${rank}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return () => window.cancelAnimationFrame(handle);
  }, []);

  const select = (rank: number) => {
    setHighlight(rank);
    replaceQueryParam("rank", String(rank));
  };

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []}>
      {!card ? (
        <p className="mn-paper p-8 text-center text-sm font-medium text-[var(--mn-text-muted)]">{t(locale, "tgwCard.empty")}</p>
      ) : (
        <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
          <section className="mn-paper min-w-0 overflow-hidden">
            <div className={panelHeader}>
              <h2 className={panelTitle}>{t(locale, "tgwCard.ranks")}</h2>
              <span className="text-xs font-bold text-[var(--mn-text-muted)]">{t(locale, "tgwCard.rankCount", { count: card.ranks.length })}</span>
            </div>
            <ol className="divide-y divide-dashed divide-[var(--mn-border)]/60">
              {card.ranks.map((rank) => (
                <RankRow key={rank.rank} locale={locale} card={card} rank={rank} highlighted={highlight === rank.rank} onSelect={select} />
              ))}
            </ol>
          </section>

          <aside className="flex flex-col gap-6 xl:sticky xl:top-24">
            {card.dailyPoints.length > 0 && (
              <div className="mn-paper overflow-hidden">
                <div className={panelHeader}><h2 className={panelTitle}>{t(locale, "tgwCard.dailyPoints")}</h2></div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--mn-border)] text-xs text-[var(--mn-text-muted)]">
                      <th scope="col" className="px-6 py-2 text-left font-bold">{t(locale, "tgwCard.consecutiveDays")}</th>
                      <th scope="col" className="px-6 py-2 text-right font-bold">{card.pointName || t(locale, "tgwCard.points")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-[var(--mn-border)]/60">
                    {card.dailyPoints.map((row, index) => (
                      <tr key={row.consecutiveDays}>
                        <td className="px-6 py-2.5 font-semibold text-[var(--mn-text)]">
                          {index === card.dailyPoints.length - 1 ? t(locale, "tgwCard.daysOrMore", { count: row.consecutiveDays }) : t(locale, "tgwCard.days", { count: row.consecutiveDays })}
                        </td>
                        <td className="px-6 py-2.5 text-right font-mono font-bold tabular-nums text-[var(--mn-accent-deep)]">+{row.point.toLocaleString(locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-6 py-4 text-xs leading-6 text-[var(--mn-text-muted)]">{t(locale, "tgwCard.dailyPointsNote")}</p>
              </div>
            )}
          </aside>
        </div>
      )}
    </ServerScope>
  );
}

function CardFace({ rank, alt }: { rank: TgwRankViewModel; alt: string }) {
  const src = useAssetUrl()(rank.imageUrl);
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative grid aspect-[63/91] w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--mn-glass-border)] bg-[var(--mn-cream-deep)] sm:w-16">
      {src && !failed
        ? <img src={src} alt={alt} loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(true)} />
        : <span className="font-mono text-lg font-black text-[var(--mn-text-muted)]">{rank.rank}</span>}
    </span>
  );
}

function bonusValue(locale: AppLocale, bonus: TgwBonusViewModel): string {
  return formatTgwBonusValue(bonus, locale, {
    hours: t(locale, "tgwCard.units.hours"),
    minutes: t(locale, "tgwCard.units.minutes"),
    percentUp: (value) => t(locale, "tgwCard.percentUp", { value }),
    percentDown: (value) => t(locale, "tgwCard.percentDown", { value }),
  });
}

function RankRow({ locale, card, rank, highlighted, onSelect }: { locale: AppLocale; card: TgwCardViewModel; rank: TgwRankViewModel; highlighted: boolean; onSelect: (rank: number) => void }) {
  const title = t(locale, "tgwCard.rankTitle", { rank: rank.rank });
  return (
    <li
      id={`tgw-rank-${rank.rank}`}
      className={`grid scroll-mt-28 gap-4 px-4 py-4 transition-colors sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-6 ${highlighted ? "bg-[var(--mn-accent-soft)] ring-2 ring-inset ring-[var(--mn-accent)]" : ""}`}
      aria-current={highlighted ? "true" : undefined}
    >
      <button type="button" onClick={() => onSelect(rank.rank)} className="mn-focus flex items-center gap-3 rounded-xl text-left" aria-label={title}>
        <CardFace rank={rank} alt={title} />
        <span className="min-w-0">
          <span className="block font-mono text-lg font-black text-[var(--mn-text)]">{card.rankLabel || t(locale, "tgwCard.rank")} {rank.rank}</span>
          <span className="block text-xs font-bold text-[var(--mn-text-muted)]">{t(locale, `tgwCard.colors.${rank.color}`)}</span>
          <span className="mt-1 block font-mono text-xs font-bold tabular-nums text-[var(--mn-accent-deep)]">{t(locale, "tgwCard.pointValue", { count: rank.point.toLocaleString(locale) })}</span>
        </span>
      </button>
      <Column label={t(locale, "tgwCard.dailyRewards")}>
        {rank.dailyRewards.length ? rank.dailyRewards.map((reward, index) => <RewardChip key={`${reward.kind}:${reward.id}:${index}`} reward={reward} locale={locale} />) : <Dash />}
      </Column>
      <Column label={t(locale, "tgwCard.rankUpRewards")}>
        {rank.rankUpRewards.length ? rank.rankUpRewards.map((reward, index) => <RewardChip key={`${reward.kind}:${reward.id}:${index}`} reward={reward} locale={locale} />) : <Dash />}
      </Column>
      <Column label={t(locale, "tgwCard.benefits")}>
        {rank.bonuses.length ? (
          <ul className="space-y-1.5">
            {rank.bonuses.map((bonus) => {
              const value = bonusValue(locale, bonus);
              return (
                <li key={bonus.type} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="min-w-0 font-semibold text-[var(--mn-text)]">{bonus.name || t(locale, "tgwCard.bonusFallback", { type: bonus.type })}</span>
                  <span className="shrink-0 font-mono font-bold tabular-nums text-[var(--mn-accent-deep)]">{value || t(locale, "tgwCard.unlocked")}</span>
                </li>
              );
            })}
          </ul>
        ) : <Dash />}
      </Column>
    </li>
  );
}

function Column({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-[11px] font-bold text-[var(--mn-text-muted)]">{label}</span>
      {children}
    </div>
  );
}

function Dash() {
  return <span className="text-xs text-[var(--mn-text-muted)]">—</span>;
}
