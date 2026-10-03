import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import AudioPlayButton from "@/components/shared/AudioPlayButton";
import LevelSwitch from "@/components/shared/LevelSwitch";
import RewardChip from "@/components/shared/RewardChip";
import { getCostumeIconUrl } from "@/lib/assets/costume";
import { getLive2DViewerHref } from "@/lib/live2d/models";
import { readQueryParam, replaceQueryParam } from "@/lib/route/url-state";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import { getVoiceTypeName, type CharacterProgressionData, type CostumeViewModel, type RankRewardGroup } from "@/lib/characters/data";
import type { RewardViewModel } from "@/lib/rewards/resources";

/** Sections of the character page below its profile (`?section=`). */
export const CHARACTER_SECTIONS = ["profile", "costumes", "voices", "bonds"] as const;
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
    <div className="mn-segmented flex w-fit max-w-full flex-wrap gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="tablist" aria-label={t(locale, "characters.sections.label")}>
      {CHARACTER_SECTIONS.map((section) => (
        <button
          key={section}
          type="button"
          role="tab"
          aria-selected={section === value}
          onClick={() => onChange(section)}
          className={`mn-focus rounded-full px-3 py-1.5 text-xs font-bold transition ${section === value ? "bg-[var(--mn-accent-soft)] text-[var(--mn-text)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"}`}
        >
          {t(locale, `characters.sections.${section}`)}
        </button>
      ))}
    </div>
  );
}

const panelHeader = "border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8";
const panelTitle = "font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mn-paper overflow-hidden">
      <div className={panelHeader}><h3 className={panelTitle}>{title}</h3></div>
      <div className="p-6 sm:p-8">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-center text-sm font-medium text-[var(--mn-text-muted)]">{text}</p>;
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
                <span className="mt-2 block text-center text-xs font-bold text-[var(--mn-text)]">{costume.name}</span>
              </>
            );
            return (
              <li key={costume.groupId}>
                {modelId
                  ? <a href={getLive2DViewerHref(locale, modelId)} title={t(locale, "characters.costumes.openViewer")} className="mn-focus block rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)]/40 p-3 transition hover:-translate-y-0.5 hover:border-[var(--mn-accent)]">{body}</a>
                  : <div className="rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)]/40 p-3">{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function VoicesPanel({ locale, characterId, data }: { locale: AppLocale; characterId: number; data: CharacterProgressionData }) {
  const assetUrl = useAssetUrl();
  return (
    <Panel title={t(locale, "characters.voices.characterVoice")}>
      {data.voices.length === 0 ? <Empty text={t(locale, "characters.voices.empty")} /> : (
        <ul className="divide-y divide-dashed divide-[var(--mn-border)]/60">
          {data.voices.map((voice) => {
            const typeName = t(locale, `characters.voices.types.${getVoiceTypeName(voice.type)}`);
            return (
              <li key={voice.id} className="flex items-start gap-3 py-3">
                {voice.soundUrl
                  ? <AudioPlayButton locale={locale} size="sm" track={{ id: `character-voice:${characterId}:${voice.id}`, src: assetUrl(voice.soundUrl), title: voice.text, subtitle: typeName }} />
                  : <span className="h-8 w-8 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--mn-accent-deep)]">{typeName}</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm font-medium text-[var(--mn-text)]">{voice.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
