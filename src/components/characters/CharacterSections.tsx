"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import LevelSwitch from "@/components/shared/LevelSwitch";
import RewardChip from "@/components/shared/RewardChip";
import { getCostumeIconUrl } from "@/lib/assets/costume";
import { getLive2DViewerHref } from "@/lib/live2d/models";
import { readQueryParam, replaceQueryParam } from "@/lib/route/url-state";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import type { CostumeViewModel, RankRewardGroup } from "@/lib/characters/data";
import type { RewardViewModel } from "@/lib/rewards/resources";

/** Sections of the character page below its profile (`?section=`). */
export const CHARACTER_SECTIONS = ["profile", "costumes", "voices", "bonds", "missions", "related"] as const;
export type CharacterSection = typeof CHARACTER_SECTIONS[number];

/** The page's section, mirrored in `?section=` (profile, the default, leaves it out). */
export function useCharacterSection(): [CharacterSection, (section: CharacterSection) => void] {
  const [section, setSection] = useState<CharacterSection>("profile");
  useEffect(() => {
    const requested = readQueryParam("section");
    if (requested && (CHARACTER_SECTIONS as readonly string[]).includes(requested)) setSection(requested as CharacterSection);
  }, []);
  const pick = (next: CharacterSection) => {
    setSection(next);
    replaceQueryParam("section", next === "profile" ? null : next);
  };
  return [section, pick];
}

export function CharacterSectionTabs({ locale, value, onChange }: { locale: AppLocale; value: CharacterSection; onChange: (section: CharacterSection) => void }) {
  return (
    <div className="md3-tabs" role="tablist" aria-label={t(locale, "characters.sections.label")}>
      {CHARACTER_SECTIONS.map((section) => (
        <button
          key={section}
          type="button"
          role="tab"
          aria-selected={section === value}
          onClick={() => onChange(section)}
          className="md3-tab md3-state"
        >
          {t(locale, `characters.sections.${section}`)}
        </button>
      ))}
    </div>
  );
}

const panelHeader = "border-b border-outline-variant px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--md-ref-typeface-brand)] text-xl text-on-surface sm:text-2xl";

export function Panel({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="md3-surface overflow-hidden">
      <div className={`${panelHeader} flex flex-wrap items-center justify-between gap-3`}><h3 className={panelTitle}>{title}</h3>{actions}</div>
      <div className="p-6 sm:p-8">{children}</div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-2 text-center text-body-medium text-on-surface-variant">{text}</p>;
}

/** Rank rewards with a rank switch: the rewards handed out on reaching the chosen rank. */
export function RankRewardsPanel({ locale, title, groups }: { locale: AppLocale; title: string; groups: RankRewardGroup[] }) {
  const ranks = useMemo(() => groups.map((group) => group.rank), [groups]);
  const [rank, setRank] = useState<number>(ranks[0] ?? 0);
  const current = groups.find((group) => group.rank === rank) ?? groups[0];
  return (
    <Panel title={title}>
      {!current ? <Empty text={t(locale, "characters.rewards.empty")} /> : (
        <div className="space-y-4">
          <LevelSwitch label={t(locale, "characters.rewards.rank")} value={current.rank} options={ranks} onChange={setRank} variant="slider" />
          <ul className="flex flex-wrap gap-2">
            {current.rewards.map((reward, index) => (
              <li key={`${reward.kind}:${reward.id}:${index}`}><RewardChip locale={locale} reward={reward as RewardViewModel} /></li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function costumeModelId(costume: CostumeViewModel): string {
  return costume.live2dPath.split("/").filter(Boolean).at(-1) ?? "";
}

export function CostumesPanel({ locale, costumes }: { locale: AppLocale; costumes: CostumeViewModel[] }) {
  const assetUrl = useAssetUrl();
  // One card per costume group: the group carries the name and icon; its first model opens in the viewer.
  const groups = useMemo(() => {
    const seen = new Map<number, CostumeViewModel>();
    for (const costume of costumes) if (costume.iconPath && !seen.has(costume.groupId)) seen.set(costume.groupId, costume);
    return [...seen.values()];
  }, [costumes]);
  return (
    <Panel title={t(locale, "characters.sections.costumes")}>
      {groups.length === 0 ? <Empty text={t(locale, "characters.costumes.empty")} /> : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {groups.map((costume) => {
            const modelId = costumeModelId(costume);
            const body = (
              <>
                <img className="mx-auto h-24 w-24 object-contain" src={assetUrl(getCostumeIconUrl(costume.iconPath, locale))} alt="" loading="lazy" />
                <span className="mt-2 block text-center text-label-medium text-on-surface">{costume.name}</span>
              </>
            );
            return (
              <li key={costume.groupId}>
                {modelId
                  ? <a href={getLive2DViewerHref(locale, modelId)} title={t(locale, "characters.costumes.openViewer")} className="block rounded-shape-lg border border-outline-variant bg-surface-container-highest/40 p-3 transition hover:border-primary">{body}</a>
                  : <div className="rounded-shape-lg border border-outline-variant bg-surface-container-highest/40 p-3">{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
