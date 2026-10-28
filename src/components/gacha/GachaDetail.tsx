"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope, { HeadingServerSwitch } from "@/components/shared/ServerScope";
import DetailHero from "@/components/shared/DetailHero";
import { DetailRow } from "@/components/shared/DetailRows";
import ServerSchedules from "@/components/shared/ServerSchedules";
import TimesNote from "@/components/shared/TimesNote";
import { moveReleaseUrls } from "@/lib/assets/release";
import { entityServer, valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import MemberCardItem from "@/components/cards/MemberCardItem";
import GachaDrawOptions from "@/components/gacha/GachaDrawOptions";
import GachaSimulator from "@/components/gacha/GachaSimulator";
import LimitedChip from "@/components/gacha/LimitedChip";
import BannerImage from "@/components/shared/BannerImage";
import { RarityFilter } from "@/components/shared/BaseFilters";
import Modal from "@/components/shared/Modal";
import RewardChip from "@/components/shared/RewardChip";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import SupportCardItem from "@/components/support-cards/SupportCardItem";
import { getImageAssetUrl } from "@/lib/assets/url";
import { getRarityIconUrl, type CardRarity } from "@/lib/cards/assets";
import type { GachaDetailViewModel, GachaGimmickEntry, GachaPool, GachaProductBonus, GachaStepUpChain } from "@/lib/gacha/data";
import { formatCompactCount } from "@/lib/format/compact-count";
import { getItemIconUrl } from "@/lib/items/assets";
import { getRoutePathById } from "@/lib/route/registry";
import { formatScheduleRange, scheduleStatus } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { useSpoiler } from "@/lib/settings/spoiler";
import { SpoilerNotice, DeveloperTestingBanner } from "@/components/shared/SpoilerNotice";
import { getSupportRarityIconUrl, type SupportCardRarity } from "@/lib/support-cards/assets";

interface Props {
  locale: AppLocale;
  gacha: ServerFacetedValue<GachaDetailViewModel> | null;
  servers: GameServer[];
}

type PoolKind = "member" | "support";

const panelHeader = "border-b border-outline-variant px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--md-ref-typeface-brand)] text-xl text-on-surface sm:text-2xl";

function rarityIcon(kind: GachaPool["kind"], rarity: number): string {
  if (kind === "member") return [2, 3, 4, 20].includes(rarity) ? getRarityIconUrl(rarity as CardRarity) : "";
  if (kind === "support") return getSupportRarityIconUrl(rarity as SupportCardRarity);
  return "";
}

/** The gacha as the page's server has it (docs/servers.md). */
export default function GachaDetail({ locale, gacha: faceted, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const gacha = useMemo(() => faceted && moveReleaseUrls(valueForServer(faceted, server), entityServer(faceted, server)), [faceted, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = <HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []} />;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={faceted?.servers ?? []} hideSwitch>
      <GachaDetailView locale={locale} gacha={gacha} serverSwitch={serverSwitch} schedules={faceted && <ServerSchedules locale={locale} faceted={faceted} servers={servers} alwaysLabel={t(locale, "gacha.alwaysOpen")} />} />
    </ServerScope>
  );
}

function GachaDetailView({ locale, gacha, serverSwitch, schedules }: { locale: AppLocale; gacha: GachaDetailViewModel | null; serverSwitch: ReactNode; schedules: ReactNode }) {
  const assetUrl = useAssetUrl();
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  const { showSpoiler } = useSpoiler();
  const [openPool, setOpenPool] = useState<PoolKind | null>(null);
  const pickupMembers = useMemo(() => new Set(gacha?.pickupMemberIds), [gacha]);
  const pickupSupports = useMemo(() => new Set(gacha?.pickupSupportIds), [gacha]);

  if (!gacha) return <NotFound locale={locale} />;

  const isUnreleased = Boolean(now !== null && scheduleStatus(gacha.startAt, gacha.endAt, now) === "upcoming");
  if (isUnreleased && !showSpoiler) {
    return <SpoilerNotice locale={locale} />;
  }

  const schedule = formatScheduleRange(gacha.startAt, gacha.endAt, locale, timeZone) || t(locale, "gacha.alwaysOpen");
  const pickupBadge = t(locale, "gacha.pickup");
  const pickupCards = [
    ...gacha.memberCards.filter((card) => pickupMembers.has(card.id)).map((card) => <MemberCardItem key={`m${card.id}`} card={card} locale={locale} badge={pickupBadge} />),
    ...gacha.supportCards.filter((card) => pickupSupports.has(card.id)).map((card) => <SupportCardItem key={`s${card.id}`} card={card} locale={locale} badge={pickupBadge} />),
  ];

  return (
    <div className="w-full space-y-8">
      {isUnreleased && <DeveloperTestingBanner locale={locale} />}
      <DetailHero
        title={gacha.name}
        long
        aside={serverSwitch}
        eyebrow={<>
          <ScheduleBadge locale={locale} startAt={gacha.startAt} endAt={gacha.endAt} now={now} />
          {gacha.isLimited && <LimitedChip locale={locale} />}
        </>}
      >
        {gacha.description && <p className="mt-1 max-w-[60ch] text-body-large text-on-surface-variant">{gacha.description}</p>}
      </DetailHero>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(22rem,2fr)_3fr] lg:items-start">
        {/* Left column: banner and rates stay in view while the pool is browsed. */}
        <aside className="flex w-full flex-col gap-6 lg:sticky lg:top-24">
          <div className="md3-surface p-4">
            <BannerImage
              eager
              className="rounded-shape-md border border-outline-variant"
              src={assetUrl(getImageAssetUrl(gacha.bannerPath, locale))}
              alt={t(locale, "gacha.bannerAlt", { name: gacha.name })}
              fallback={gacha.name}
            />
            {gacha.viewLabel && (
              <span className="absolute left-6 top-6 rounded-full bg-primary px-3 py-1 text-label-medium text-on-primary shadow-elevation-1">{gacha.viewLabel}</span>
            )}
          </div>
          {gacha.pools.length > 0 && <RatePanel locale={locale} pools={gacha.pools} />}
        </aside>

        {/* Right column */}
        <section className="min-w-0 flex-1 space-y-6">
          <div className="md3-surface overflow-hidden px-6 pb-5 sm:px-8">
            <dl className="divide-y divide-outline-variant">
              <DetailRow label={t(locale, "gacha.period")} value={<span className="tabular-nums">{schedule}</span>} />
              <DetailRow label={t(locale, "gacha.category")} value={t(locale, `gacha.categories.${gacha.category}`)} />
              <DetailRow label={t(locale, "gacha.gachaId")} value={`#${gacha.id}`} />
            </dl>
            <TimesNote locale={locale} value={gacha.startAt || gacha.endAt} timeZone={timeZone} className="mt-1 text-body-small text-on-surface-variant" />
            {schedules}
          </div>

          {gacha.drawOptions.length > 0 && <GachaDrawOptions locale={locale} options={gacha.drawOptions} title={t(locale, "gacha.options.title")} />}

          <GachaSimulator locale={locale} gacha={gacha} />

          {gacha.stepUp && gacha.stepUp.steps.length > 0 && <StepUpPanel locale={locale} chain={gacha.stepUp} />}

          {gacha.bonusRewards.length > 0 && <BonusPanel locale={locale} bonusRewards={gacha.bonusRewards} />}

          {gacha.gimmicks.length > 0 && <GimmickPanel locale={locale} gimmicks={gacha.gimmicks} />}

          {pickupCards.length > 0 && (
            <Panel title={t(locale, "gacha.pickupTitle")}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 2xl:grid-cols-5">{pickupCards}</div>
            </Panel>
          )}

          <Panel title={t(locale, "gacha.contents")}>
            <div className="divide-y divide-dashed divide-outline-variant/60">
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
                  <p className="text-label-large text-on-surface-variant">{t(locale, "gacha.items")}</p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {gacha.items.map((item) => (
                      <li key={item.id} className="flex min-w-0 items-center gap-3 rounded-shape-lg border border-outline-variant bg-surface-container p-2.5">
                        <img className="h-10 w-10 shrink-0 object-contain" src={assetUrl(getItemIconUrl(item.imagePath, locale))} alt="" loading="lazy" />
                        <span className="min-w-0 flex-1 truncate text-label-large text-on-surface">{item.name}</span>
                        <span className="shrink-0 font-mono text-label-large tabular-nums text-primary" title={item.amount.toLocaleString(locale)}>{t(locale, "gacha.itemAmount", { count: formatCompactCount(item.amount) })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Panel>

          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("gacha"), locale)} className="md3-button md3-button--tonal">
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
    <div className="md3-surface overflow-hidden">
      <div className={panelHeader}><h3 className={panelTitle}>{title}</h3></div>
      <div className="p-6 sm:p-8">{children}</div>
    </div>
  );
}


function RatePanel({ locale, pools }: { locale: AppLocale; pools: GachaPool[] }) {
  const format = new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const maxRate = Math.max(...pools.map((pool) => pool.rate), 1);

  return (
    <div className="md3-surface overflow-hidden">
      <div className={panelHeader}><h3 className={panelTitle}>{t(locale, "gacha.rates")}</h3></div>
      <div className="p-6">
        <ul className="space-y-4">
          {pools.map((pool) => {
            const rarityLabel = pool.rarity ? t(locale, `cards.rarities.${pool.rarity}`) : "";
            const icon = rarityIcon(pool.kind, pool.rarity);
            return (
              <li key={`${pool.kind}-${pool.rarity}`} className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-label-large text-on-surface">
                    {icon
                      ? <img className="h-5 w-auto max-w-12 shrink-0 object-contain" src={icon} alt={rarityLabel} />
                      : rarityLabel && <span className="text-label-medium text-primary">{rarityLabel}</span>}
                    <span className="truncate">{t(locale, `gacha.poolKinds.${pool.kind}`)}</span>
                  </span>
                  <span className="shrink-0 font-mono text-title-medium tabular-nums text-primary">{format.format(pool.rate / 100)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container-highest" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(pool.rate / maxRate) * 100}%` }} />
                </div>
                <p className="mt-1.5 text-body-small text-on-surface-variant">
                  {t(locale, "gacha.poolSize", { count: pool.count })}
                  {pool.pickupCount > 0 && ` · ${pool.pickupShare > 0
                    ? t(locale, "gacha.poolPickupShare", { count: pool.pickupCount, share: `${pool.pickupShare}%` })
                    : t(locale, "gacha.poolPickup", { count: pool.pickupCount })}`}
                </p>
              </li>
            );
          })}
        </ul>
        {t(locale, "gacha.ratesNote") ? (
          <p className="mt-5 border-t border-outline-variant pt-3 text-body-small leading-6 text-on-surface-variant">{t(locale, "gacha.ratesNote")}</p>
        ) : null}
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
        <p className="text-label-large text-on-surface-variant">{label}</p>
        <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {breakdown.map(([rarity, count]) => {
            const rarityLabel = t(locale, `cards.rarities.${rarity}`);
            const icon = rarityIcon(kind, rarity);
            return (
              <li key={rarity} className="flex items-center gap-1.5 text-label-large text-on-surface">
                {icon ? <img className="h-4 w-auto max-w-10 object-contain" src={icon} alt={rarityLabel} /> : <span className="text-label-medium text-primary">{rarityLabel}</span>}
                <span className="font-mono tabular-nums">×{count}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="md3-button md3-button--tonal shrink-0"
      >
        {t(locale, "gacha.viewAllCards", { count: rarities.length })}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 4v16M4 12h5" /></svg>
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

function StepUpPanel({ locale, chain }: { locale: AppLocale; chain: GachaStepUpChain }) {
  return (
    <Panel title={chain.name || t(locale, "gacha.stepUp.title")}>
      <ol className="divide-y divide-dashed divide-outline-variant/60">
        {chain.steps.map((step) => {
          const guaranteed = step.ensuredCount > 0 && step.ensuredRarity > 0
            ? t(locale, "gacha.stepUp.guaranteed", { count: step.ensuredCount, rarity: t(locale, `cards.rarities.${step.ensuredRarity}`) })
            : "";
          return (
            <li key={step.step} className="flex flex-wrap items-center justify-between gap-3 py-3.5 text-body-medium">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary font-mono text-label-large text-on-primary">{step.step}</span>
                <span className="min-w-0 font-semibold text-on-surface">{t(locale, "gacha.stepUp.draws", { count: step.drawCount })}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                <span className="font-mono font-black tabular-nums text-primary">{step.cost > 0 ? t(locale, "gacha.stepUp.cost", { cost: step.cost }) : t(locale, "gacha.stepUp.free")}</span>
                {guaranteed && <span className="text-label-medium text-on-surface-variant">{guaranteed}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/** What each draw option grants on top, named as the game names the option ("Pull 1 Time (Paid)"). */
function BonusPanel({ locale, bonusRewards }: { locale: AppLocale; bonusRewards: GachaProductBonus[] }) {
  return (
    <Panel title={t(locale, "gacha.bonuses.title")}>
      <div className="divide-y divide-dashed divide-outline-variant/60">
        {bonusRewards.map((bonus) => (
          <div key={bonus.slot} className="py-3.5">
            <p className="text-label-large text-on-surface">{bonus.label || t(locale, "gacha.bonuses.option", { slot: bonus.slot })}</p>
            <ul className="mt-2 space-y-3">
              {bonus.rules.map((rule) => (
                <li key={rule.id}>
                  <p className="text-label-medium text-on-surface-variant">
                    {rule.requiredDrawCount <= 1
                      ? t(locale, "gacha.bonuses.perPurchase", { bonus: rule.bonusDrawCount })
                      : t(locale, "gacha.bonuses.everyDraws", { count: rule.requiredDrawCount, bonus: rule.bonusDrawCount })}
                  </p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {rule.rewards.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-3 rounded-shape-lg border border-outline-variant bg-surface-container p-2.5">
                        <RewardChip reward={entry.reward} locale={locale} />
                        {/* A pool of one reward always gives it: no rate to show. */}
                        {rule.rewards.length > 1 && <span className="shrink-0 font-mono text-label-medium tabular-nums text-primary">{entry.rate.toFixed(1)}%</span>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/**
 * MasterGachaGimmick: which variant of the draw animation plays (only `Weather` so far), weighted separately for
 * draws that bring an SSR. It changes the presentation only; the prize rates are in the rate panel.
 */
function GimmickPanel({ locale, gimmicks }: { locale: AppLocale; gimmicks: GachaGimmickEntry[] }) {
  const totalNormal = gimmicks.reduce((sum, gimmick) => sum + Math.max(0, gimmick.normalWeight), 0);
  const totalSsr = gimmicks.reduce((sum, gimmick) => sum + Math.max(0, gimmick.ssrWeight), 0);
  const share = (weight: number, total: number) => (total ? ((Math.max(0, weight) / total) * 100).toFixed(1) : "0.0");
  return (
    <Panel title={t(locale, "gacha.gimmicks.title")}>
      <p className="mb-4 text-body-small leading-6 text-on-surface-variant">{t(locale, "gacha.gimmicks.note")}</p>
      <table className="w-full text-body-medium">
        <thead>
          <tr className="border-b border-outline-variant text-left text-label-medium text-on-surface-variant">
            <th scope="col" className="py-2 pr-3">{t(locale, "gacha.gimmicks.branch")}</th>
            <th scope="col" className="py-2 pr-3 text-right">{t(locale, "gacha.gimmicks.normalRate")}</th>
            <th scope="col" className="py-2 text-right">{t(locale, "gacha.gimmicks.ssrRate")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-dashed divide-outline-variant/60">
          {gimmicks.map((gimmick) => (
            <tr key={gimmick.id}>
              <td className="py-2.5 pr-3 font-semibold text-on-surface">
                {gimmick.branchName === "Weather" ? t(locale, "gacha.gimmicks.weather", { entry: gimmick.branchEntry + 1 }) : `${gimmick.branchName} ${gimmick.branchEntry + 1}`}
              </td>
              <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-on-surface">{share(gimmick.normalWeight, totalNormal)}%</td>
              <td className="py-2.5 text-right font-mono tabular-nums text-on-surface">{share(gimmick.ssrWeight, totalSsr)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function NotFound({ locale }: { locale: AppLocale }) {
  return (
    <div className="md3-surface p-8 text-center sm:p-12">
      <h1 className="text-headline-small text-on-surface">{t(locale, "gacha.notFoundTitle")}</h1>
      <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "gacha.notFoundDescription")}</p>
      <a href={localizePath(getRoutePathById("gacha"), locale)} className="md3-button md3-button--tonal mt-6">
        {t(locale, "gacha.backToList")}
      </a>
    </div>
  );
}
