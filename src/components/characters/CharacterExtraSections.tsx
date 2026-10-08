import { useMemo, useState } from "react";
import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import RewardChip from "@/components/shared/RewardChip";
import MemberCardItem from "@/components/cards/MemberCardItem";
import SupportCardItem from "@/components/support-cards/SupportCardItem";
import { Empty, Panel } from "@/components/characters/CharacterSections";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import type { CardViewModel } from "@/lib/cards/data";
import { characterMissionText, unpackMissionRows, type CharacterExtrasData, type CharacterMissionGroup } from "@/lib/characters/relations";
import { entityLinkPath } from "@/lib/route/entity-link";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import { storyPath } from "@/lib/story/paths";

const linkCard = "block rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] transition-colors hover:border-[var(--md-sys-color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]";

function characterHref(locale: AppLocale, id: number): string {
  return localizePath(entityLinkPath({ routeId: "characters", detailId: id }), locale);
}

// ---- Bonds ----

/** The character's pairs (as either side of MasterCharacterFriendship) and their bond stories. */
export function BondPartnersPanel({ locale, extras }: { locale: AppLocale; extras: CharacterExtrasData }) {
  const assetUrl = useAssetUrl();
  const names = useMemo(() => new Map(extras.characters.map((entry) => [entry.id, entry.name])), [extras.characters]);
  const storiesByPair = useMemo(() => {
    const map = new Map<number, CharacterExtrasData["friendshipStories"]>();
    for (const story of extras.friendshipStories) map.set(story.friendshipId, [...(map.get(story.friendshipId) ?? []), story]);
    return map;
  }, [extras.friendshipStories]);
  return (
    <Panel title={t(locale, "characters.bonds.partnersTitle")}>
      {extras.partners.length === 0 ? <Empty text={t(locale, "characters.bonds.empty")} /> : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {extras.partners.map((pair) => {
            const name = names.get(pair.partnerId) ?? `#${pair.partnerId}`;
            const stories = storiesByPair.get(pair.friendshipId) ?? [];
            return (
              <li key={pair.friendshipId} className="overflow-hidden rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                {pair.bannerUrl && <img className="aspect-[3/1] w-full bg-[var(--md-sys-color-surface-container-high)] object-cover" src={assetUrl(pair.bannerUrl)} alt="" loading="lazy" onError={(event) => { (event.target as HTMLElement).style.display = "none"; }} />}
                <div className="space-y-3 p-3">
                  <a href={characterHref(locale, pair.partnerId)} className="flex items-center gap-3 rounded-xl hover:text-[var(--md-sys-color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]">
                    <img className="h-10 w-10 shrink-0 rounded-full border-2 border-[var(--md-sys-color-surface)] bg-[var(--md-sys-color-surface-container-high)] object-cover" src={assetUrl(getCharacterFaceIconUrl(pair.partnerId))} alt="" loading="lazy" />
                    <span className="min-w-0 truncate text-sm font-black text-[var(--md-sys-color-on-surface)]">{name}</span>
                  </a>
                  {stories.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {stories.map((story) => (
                        <li key={story.advId}>
                          <a
                            href={localizePath(storyPath(story.advId), locale)}
                            title={story.title}
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] px-2.5 py-1 text-[11px] font-bold text-[var(--md-sys-color-on-surface)] hover:border-[var(--md-sys-color-primary)] hover:text-[var(--md-sys-color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]"
                          >
                            {t(locale, "characters.bonds.episode", { number: story.episodeNumber ?? "?" })}
                            {story.unlockLevel > 0 && <span className="font-medium text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "characters.bonds.unlockLevel", { level: story.unlockLevel })}</span>}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---- Missions ----

const MISSION_TYPE_NAMES: Readonly<Record<number, string>> = {
  12: "memberCollect", 14: "supportCollect", 16: "stampCollect", 25: "bondTotal", 42: "memberSkillLevel",
  48: "memberTraining", 54: "memberAwaken", 66: "supportLimitBreak", 80: "liveClear", 111: "uniqueSongClear",
};

/** Rows shown before a mission group folds the rest behind "show all". */
const MISSION_PREVIEW_ROWS = 6;

/**
 * MasterCharacterMission: templates every character shares, by mission type; `{CharacterId}` reads as this character
 * and the other placeholders as each row's values.
 */
export function CharacterMissionsPanel({ locale, characterName, extras }: { locale: AppLocale; characterName: string; extras: CharacterExtrasData }) {
  return (
    <Panel title={t(locale, "characters.missions.title")}>
      {extras.missions.length === 0 ? <Empty text={t(locale, "characters.missions.empty")} /> : (
        <div className="space-y-6">
          <p className="text-xs font-medium leading-6 text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "characters.missions.note")}</p>
          {extras.missions.map((group) => <MissionGroup key={group.type} locale={locale} characterName={characterName} group={group} rewards={extras.missionRewards} />)}
        </div>
      )}
    </Panel>
  );
}

function MissionGroup({ locale, characterName, group, rewards }: { locale: AppLocale; characterName: string; group: CharacterMissionGroup; rewards: CharacterExtrasData["missionRewards"] }) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => unpackMissionRows(group.rows), [group.rows]);
  const shown = expanded ? rows : rows.slice(0, MISSION_PREVIEW_ROWS);
  const typeKey = MISSION_TYPE_NAMES[group.type];
  const title = typeKey ? t(locale, `characters.missions.types.${typeKey}`) : group.title || t(locale, "characters.missions.typeFallback", { type: group.type });
  return (
    <section>
      <h4 className="mb-2 flex flex-wrap items-baseline gap-2 text-sm font-black text-[var(--md-sys-color-on-surface)]">
        {title}
        <span className="text-xs font-bold tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "characters.missions.count", { count: rows.length })}</span>
      </h4>
      <ul className="divide-y divide-dashed divide-[var(--md-sys-color-outline-variant)]/60 rounded-2xl border border-[var(--md-sys-color-outline-variant)]/70 bg-[var(--md-sys-color-surface-container-low)] px-3">
        {shown.map((row, index) => (
          <li key={index} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <p className="min-w-0 flex-1 whitespace-pre-line text-sm font-medium text-[var(--md-sys-color-on-surface)]">{characterMissionText(group.template, locale, characterName, row)}</p>
            <span className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--md-sys-color-secondary-container)] px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--md-sys-color-on-secondary-container)]" title={t(locale, "characters.missions.goal")}>{row.achievementCount.toLocaleString(locale)}</span>
              {row.rewardIds.map((id, rewardIndex) => {
                const reward = rewards[String(id)];
                return reward ? <RewardChip key={`${id}:${rewardIndex}`} locale={locale} reward={reward} variant="icon" /> : null;
              })}
            </span>
          </li>
        ))}
      </ul>
      {rows.length > MISSION_PREVIEW_ROWS && (
        <Button variant="text" size="small" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} sx={{ mt: 1 }}>
          {expanded ? t(locale, "characters.missions.collapse") : t(locale, "characters.missions.expand", { count: rows.length })}
        </Button>
      )}
    </section>
  );
}

// ---- Related ----

/** The character's member cards, support cards, stamps, stories and band songs, as link grids. */
export function RelatedPanels({ locale, cards, extras }: { locale: AppLocale; cards: readonly CardViewModel[]; extras: CharacterExtrasData }) {
  const assetUrl = useAssetUrl();
  return (
    <div className="space-y-6">
      <Panel title={t(locale, "characters.related.memberCards", { count: cards.length })}>
        {cards.length === 0 ? <Empty text={t(locale, "characters.noCards")} /> : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {cards.map((card) => <MemberCardItem key={card.id} card={card} locale={locale} />)}
          </div>
        )}
      </Panel>

      <Panel title={t(locale, "characters.related.supportCards", { count: extras.supportCards.length })}>
        {extras.supportCards.length === 0 ? <Empty text={t(locale, "characters.related.none")} /> : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {extras.supportCards.map((card) => <SupportCardItem key={card.id} card={card} locale={locale} />)}
          </div>
        )}
      </Panel>

      <Panel title={t(locale, "characters.related.stamps", { count: extras.stamps.length })}>
        {extras.stamps.length === 0 ? <Empty text={t(locale, "characters.related.none")} /> : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            {extras.stamps.map((stamp) => (
              <li key={stamp.id}>
                <a href={localizePath(entityLinkPath({ routeId: "stamps", query: { id: String(stamp.id) } }), locale)} className={`${linkCard} p-2 text-center`} title={stamp.name}>
                  <img className="mx-auto aspect-square w-full object-contain" src={assetUrl(stamp.imageUrl)} alt="" loading="lazy" />
                  <span className="mt-1 block truncate text-[11px] font-bold text-[var(--md-sys-color-on-surface)]">{stamp.name}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <RelatedStories locale={locale} stories={extras.stories} />

      <Panel title={t(locale, "characters.related.songs", { count: extras.songs.length })}>
        {extras.songs.length === 0 ? <Empty text={t(locale, "characters.related.none")} /> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {extras.songs.map((song) => (
              <li key={song.id}>
                <a href={localizePath(entityLinkPath({ routeId: "music", detailId: song.id }), locale)} className={`${linkCard} flex items-center gap-2 p-2`}>
                  <img className="h-12 w-12 shrink-0 rounded-lg bg-[var(--md-sys-color-surface-container-high)] object-cover" src={assetUrl(song.jacketUrl)} alt="" loading="lazy" />
                  <span className="min-w-0 line-clamp-2 text-xs font-bold text-[var(--md-sys-color-on-surface)]">{song.title}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

const STORY_CATEGORY_KEYS: Readonly<Record<string, string>> = { "live-result": "liveResult" };

function RelatedStories({ locale, stories }: { locale: AppLocale; stories: CharacterExtrasData["stories"] }) {
  const groups = useMemo(() => {
    const map = new Map<string, CharacterExtrasData["stories"]>();
    for (const story of stories) map.set(story.category, [...(map.get(story.category) ?? []), story]);
    return [...map.entries()];
  }, [stories]);
  return (
    <Panel title={t(locale, "characters.related.stories", { count: stories.length })}>
      {stories.length === 0 ? <Empty text={t(locale, "characters.related.none")} /> : (
        <div className="space-y-5">
          {groups.map(([category, list]) => (
            <details key={category} open={list.length <= 30} className="group">
              <summary className="cursor-pointer select-none text-sm font-black text-[var(--md-sys-color-on-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]">
                {t(locale, `story.categories.${STORY_CATEGORY_KEYS[category] ?? category}`)} <span className="text-xs font-bold tabular-nums text-[var(--md-sys-color-on-surface-variant)]">({list.length})</span>
              </summary>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((story) => (
                  <li key={story.advId}>
                    <a href={localizePath(storyPath(story.advId), locale)} className={`${linkCard} px-3 py-2`}>
                      <span className="block truncate text-sm font-bold text-[var(--md-sys-color-on-surface)]">{story.title || `ADV ${story.advId}`}</span>
                      {story.groupTitle && story.groupTitle !== story.title && <span className="block truncate text-[11px] font-medium text-[var(--md-sys-color-on-surface-variant)]">{story.groupTitle}</span>}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </Panel>
  );
}
