import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import MemberCardItem from "@/components/cards/MemberCardItem";
import LimitedChip from "@/components/gacha/LimitedChip";
import BannerImage from "@/components/shared/BannerImage";
import { RarityFilter } from "@/components/shared/BaseFilters";
import Modal from "@/components/shared/Modal";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import SupportCardItem from "@/components/support-cards/SupportCardItem";
import { getImageAssetUrl } from "@/lib/assets/url";
import { getRarityIconUrl, type CardRarity } from "@/lib/cards/assets";
import type { GachaDetailViewModel, GachaPool } from "@/lib/gacha/data";
import { getItemIconUrl } from "@/lib/items/assets";
import { getRoutePathById } from "@/lib/route/registry";
import { formatScheduleRange } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { getSupportRarityIconUrl, type SupportCardRarity } from "@/lib/support-cards/assets";

interface Props {
  locale: AppLocale;
  gacha: GachaDetailViewModel | null;
}

type PoolKind = "member" | "support";

const panelHeader = "border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl";

function rarityIcon(kind: GachaPool["kind"], rarity: number): string {
  if (kind === "member") return [2, 3, 4].includes(rarity) ? getRarityIconUrl(rarity as CardRarity) : "";
  if (kind === "support") return getSupportRarityIconUrl(rarity as SupportCardRarity);
  return "";
}

export default function GachaDetail({ locale, gacha }: Props) {
  const now = useNow();
  const [openPool, setOpenPool] = useState<PoolKind | null>(null);
  const pickupMembers = useMemo(() => new Set(gacha?.pickupMemberIds), [gacha]);
  const pickupSupports = useMemo(() => new Set(gacha?.pickupSupportIds), [gacha]);

  if (!gacha) return <NotFound locale={locale} />;

  const schedule = formatScheduleRange(gacha.startAt, gacha.endAt, locale) || t(locale, "gacha.alwaysOpen");
  const pickupBadge = t(locale, "gacha.pickup");
  const pickupCards = [
    ...gacha.memberCards.filter((card) => pickupMembers.has(card.id)).map((card) => <MemberCardItem key={`m${card.id}`} card={card} locale={locale} badge={pickupBadge} />),
    ...gacha.supportCards.filter((card) => pickupSupports.has(card.id)).map((card) => <SupportCardItem key={`s${card.id}`} card={card} locale={locale} badge={pickupBadge} />),
  ];

  return (
    <div className="w-full space-y-8">
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        {/* Left column: banner and rates stay in view while the pool is browsed. */}
        <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
          <div className="rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-4 shadow-[var(--mn-shadow-stamp-lg)]">
            <BannerImage
              eager
              className="rounded-xl border border-[var(--mn-glass-border)]"
              src={getImageAssetUrl(gacha.bannerPath)}
              alt={t(locale, "gacha.bannerAlt", { name: gacha.name })}
              fallback={gacha.name}
            />
          </div>
          {gacha.pools.length > 0 && <div className="hidden lg:block"><RatePanel locale={locale} pools={gacha.pools} /></div>}
        </aside>

        {/* Right column */}
        <section className="min-w-0 flex-1 space-y-6">
          <div className="mn-paper overflow-hidden">
            <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <ScheduleBadge locale={locale} startAt={gacha.startAt} endAt={gacha.endAt} now={now} />
                {gacha.isLimited && <LimitedChip locale={locale} />}
              </div>
              <h2 className="mt-3 font-[var(--mn-font-display)] text-3xl leading-tight text-[var(--mn-text)] sm:text-4xl">{gacha.name}</h2>
              {gacha.description && <p className="mt-3 text-base font-medium text-[var(--mn-text-muted)]">{gacha.description}</p>}
            </div>
            <div className="bg-[var(--mn-paper)] p-6 sm:p-8">
              <div className="divide-y divide-dashed divide-[var(--mn-border)]/60">
                <DetailRow label={t(locale, "gacha.period")} value={<span className="tabular-nums">{schedule}</span>} />
                <DetailRow label={t(locale, "gacha.gachaId")} value={`#${gacha.id}`} />
              </div>
              <p className="mt-3 text-xs text-[var(--mn-text-muted)]">{t(locale, "gacha.timezone")}</p>
            </div>
          </div>

          {/* Narrow screens read the name before the rates; wide screens keep the rates in the sticky column. */}
          {gacha.pools.length > 0 && <div className="lg:hidden"><RatePanel locale={locale} pools={gacha.pools} /></div>}

          {pickupCards.length > 0 && (
            <Panel title={t(locale, "gacha.pickupTitle")}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-5">{pickupCards}</div>
            </Panel>
          )}

          <Panel title={t(locale, "gacha.contents")}>
            <div className="divide-y divide-dashed divide-[var(--mn-border)]/60">
              {gacha.memberCards.length > 0 && (
                <PoolRow
                  locale={locale}
                  label={t(locale, "gacha.memberCards")}
                  kind="member"
                  rarities={gacha.memberCards.map((card) => card.rarity)}
                  onOpen={() => setOpenPool("member")}
                />
              )}
              {gacha.supportCards.length > 0 && (
                <PoolRow
                  locale={locale}
                  label={t(locale, "gacha.supportCards")}
                  kind="support"
                  rarities={gacha.supportCards.map((card) => card.rarity)}
                  onOpen={() => setOpenPool("support")}
                />
              )}
              {gacha.items.length > 0 && (
                <div className="py-3.5">
                  <p className="text-sm font-semibold text-[var(--mn-text-muted)]">{t(locale, "gacha.items")}</p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {gacha.items.map((item) => (
                      <li key={item.id} className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--mn-glass-border)] bg-[var(--mn-surface)] p-2.5">
                        <img className="h-10 w-10 shrink-0 object-contain" src={getItemIconUrl(item.imagePath)} alt="" loading="lazy" />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--mn-text)]">{item.name}</span>
                        <span className="shrink-0 font-mono text-sm font-black tabular-nums text-[var(--mn-accent-deep)]">{t(locale, "gacha.itemAmount", { count: item.amount.toLocaleString(locale) })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Panel>

          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("gacha"), locale)} className="mn-focus mn-stamp-press inline-flex rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
              {t(locale, "gacha.backToList")}
            </a>
          </div>
        </section>
      </div>

      <PoolModal
        locale={locale}
        kind={openPool}
        gacha={gacha}
        pickupMembers={pickupMembers}
        pickupSupports={pickupSupports}
        onClose={() => setOpenPool(null)}
      />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mn-paper overflow-hidden">
      <div className={panelHeader}><h3 className={panelTitle}>{title}</h3></div>
      <div className="p-6 sm:p-8">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 text-sm">
      <span className="shrink-0 font-semibold text-[var(--mn-text-muted)]">{label}</span>
      <span className="min-w-0 text-right font-semibold text-[var(--mn-text)]">{value}</span>
    </div>
  );
}

function RatePanel({ locale, pools }: { locale: AppLocale; pools: GachaPool[] }) {
  const format = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const maxRate = Math.max(...pools.map((pool) => pool.rate), 1);

  return (
    <div className="mn-paper overflow-hidden">
      <div className={panelHeader}><h3 className={panelTitle}>{t(locale, "gacha.rates")}</h3></div>
      <div className="p-6">
        <ul className="space-y-4">
          {pools.map((pool) => {
            const rarityLabel = pool.rarity ? t(locale, `cards.rarities.${pool.rarity}`) : "";
            const icon = rarityIcon(pool.kind, pool.rarity);
            return (
              <li key={`${pool.kind}-${pool.rarity}`} className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--mn-text)]">
                    {icon
                      ? <img className="h-5 w-auto max-w-12 shrink-0 object-contain" src={icon} alt={rarityLabel} />
                      : rarityLabel && <span className="text-xs font-black text-[var(--mn-accent-deep)]">{rarityLabel}</span>}
                    <span className="truncate">{t(locale, `gacha.poolKinds.${pool.kind}`)}</span>
                  </span>
                  <span className="shrink-0 font-mono text-base font-bold tabular-nums text-[var(--mn-accent-deep)]">{format.format(pool.rate / 100)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--mn-cream-deep)]" aria-hidden="true">
                  <div className="h-full rounded-full bg-[var(--mn-accent)]" style={{ width: `${(pool.rate / maxRate) * 100}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-[var(--mn-text-muted)]">
                  {t(locale, "gacha.poolSize", { count: pool.count })}
                  {pool.pickupCount > 0 && ` · ${t(locale, "gacha.poolPickup", { count: pool.pickupCount })}`}
                </p>
              </li>
            );
          })}
        </ul>
        <p className="mt-5 border-t border-[var(--mn-glass-border)] pt-3 text-xs leading-6 text-[var(--mn-text-muted)]">{t(locale, "gacha.ratesNote")}</p>
      </div>
    </div>
  );
}

function PoolRow({ locale, label, kind, rarities, onOpen }: { locale: AppLocale; label: string; kind: PoolKind; rarities: number[]; onOpen: () => void }) {
  const counts = new Map<number, number>();
  for (const rarity of rarities) counts.set(rarity, (counts.get(rarity) ?? 0) + 1);
  const breakdown = [...counts].sort(([a], [b]) => b - a);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--mn-text-muted)]">{label}</p>
        <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {breakdown.map(([rarity, count]) => {
            const rarityLabel = t(locale, `cards.rarities.${rarity}`);
            const icon = rarityIcon(kind, rarity);
            return (
              <li key={rarity} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--mn-text)]">
                {icon ? <img className="h-4 w-auto max-w-10 object-contain" src={icon} alt={rarityLabel} /> : <span className="text-xs font-black text-[var(--mn-accent-deep)]">{rarityLabel}</span>}
                <span className="font-mono tabular-nums">×{count}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="mn-focus mn-stamp-press inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-2 text-sm font-bold text-[var(--mn-accent-deep)] shadow-[var(--mn-shadow-stamp)]"
      >
        {t(locale, "gacha.viewAllCards", { count: rarities.length })}
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 4v16M4 12h5" /></svg>
      </button>
    </div>
  );
}

function PoolModal({ locale, kind, gacha, pickupMembers, pickupSupports, onClose }: {
  locale: AppLocale;
  kind: PoolKind | null;
  gacha: GachaDetailViewModel;
  pickupMembers: Set<number>;
  pickupSupports: Set<number>;
  onClose: () => void;
}) {
  const [memberRarities, setMemberRarities] = useState<CardRarity[]>([]);
  const [supportRarities, setSupportRarities] = useState<SupportCardRarity[]>([]);
  const pickupBadge = t(locale, "gacha.pickup");
  const title = kind ? t(locale, kind === "member" ? "gacha.memberCards" : "gacha.supportCards") : "";

  let body: ReactNode = null;
  if (kind === "member") {
    const options = [...new Set(gacha.memberCards.map((card) => card.rarity))].sort((a, b) => b - a);
    const visible = gacha.memberCards.filter((card) => memberRarities.length === 0 || memberRarities.includes(card.rarity));
    body = (
      <>
        {options.length > 1 && (
          <RarityFilter
            className="mb-4"
            rarities={options}
            selectedRarities={memberRarities}
            onChange={setMemberRarities}
            getRarityLabel={(rarity) => t(locale, `cards.rarities.${rarity}`)}
          />
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((card) => <MemberCardItem key={card.id} card={card} locale={locale} {...(pickupMembers.has(card.id) ? { badge: pickupBadge } : {})} />)}
        </div>
      </>
    );
  } else if (kind === "support") {
    const options = [...new Set(gacha.supportCards.map((card) => card.rarity))].sort((a, b) => b - a);
    const visible = gacha.supportCards.filter((card) => supportRarities.length === 0 || supportRarities.includes(card.rarity));
    body = (
      <>
        {options.length > 1 && (
          <RarityFilter
            className="mb-4"
            rarities={options}
            selectedRarities={supportRarities}
            onChange={setSupportRarities}
            getIconUrl={getSupportRarityIconUrl}
            getRarityLabel={(rarity) => t(locale, `cards.rarities.${rarity}`)}
          />
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((card) => <SupportCardItem key={card.id} card={card} locale={locale} {...(pickupSupports.has(card.id) ? { badge: pickupBadge } : {})} />)}
        </div>
      </>
    );
  }

  return (
    <Modal isOpen={kind !== null} onClose={onClose} title={title} closeLabel={t(locale, "actions.close")} size="xl">
      {body}
    </Modal>
  );
}

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "gacha.notFoundTitle")}</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "gacha.notFoundDescription")}</p>
      <a href={localizePath(getRoutePathById("gacha"), locale)} className="mn-focus mn-stamp-press mt-6 inline-flex rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
        {t(locale, "gacha.backToList")}
      </a>
    </div>
  );
}
