"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope, { HeadingServerSwitch } from "@/components/shared/ServerScope";
import { forServer, type ServerFaceted } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import type { ParsedStoryScript } from "@/lib/story/parser";
import type { RawStoryCharacter, StoryNeighbor, StoryViewModel } from "@/lib/story/data";
import { formatPlayTime, storyEpisodeLabel, storyUnlockLabels } from "@/lib/story/labels";
import CharacterAvatarStack from "@/components/shared/CharacterAvatarStack";
import RewardChip from "@/components/shared/RewardChip";
import { storyPath } from "@/lib/story/paths";
import { getStoryArtworkUrl } from "@/lib/story/assets";
import type { RawText } from "@/lib/cards/data";
import StoryScriptReader from "@/components/story/StoryScriptReader";
import StoryPlayerLink from "@/components/story/StoryPlayerLink";
import SpoilerNotice from "@/components/shared/SpoilerNotice";
import { useNow } from "@/lib/schedule/use-now";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";

interface StoryDetailProps {
  locale: AppLocale;
  advId: number;
  initialTitle: string;
  /** The script of the first server with the ADV; it plays the page server's files (docs/servers.md). */
  initialScript: ParsedStoryScript | null;
  initialCharacters: RawStoryCharacter[];
  initialTexts: RawText[];
  story: ServerFaceted<StoryViewModel> | null;
  previous: StoryNeighbor | null;
  next: StoryNeighbor | null;
}

export default function StoryDetail({ servers, advServers, story, ...props }: StoryDetailProps & {
  /** The build's servers. */
  servers: GameServer[];
  /** Servers whose MasterData has the ADV. */
  advServers: GameServer[];
}) {
  const [server, pickServer] = useContentServer(props.locale, servers);
  const shown = useMemo(() => story && forServer(story, server), [story, server]);
  return (
    <ServerScope locale={props.locale} servers={servers} server={server} onChange={pickServer} entityServers={advServers} hideSwitch>
      <StoryDetailView
        {...props}
        story={shown}
        serverSwitch={<HeadingServerSwitch locale={props.locale} servers={servers} server={server} onChange={pickServer} entityServers={advServers} />}
      />
    </ServerScope>
  );
}

function StoryDetailView({ locale, advId, initialTitle, initialScript, initialCharacters, initialTexts, story, previous, next, serverSwitch }: Omit<StoryDetailProps, "story"> & { story: StoryViewModel | null; serverSwitch: ReactNode }) {
  const now = useNow();
  const { showSpoiler } = useSpoiler();
  const isUnreleased = Boolean(story?.startAt && isSpoiler(story.startAt, now));
  const [artworkFailed, setArtworkFailed] = useState(false);
  const artworkUrl = useAssetUrl()(story ? getStoryArtworkUrl(story, locale) : "");

  // Every hook runs before this return, so the notice can replace a page already rendered without it.
  if (!showSpoiler && isUnreleased) {
    return <SpoilerNotice locale={locale} />;
  }
  const isChapter = story?.category === "main" || story?.category === "event" || story?.category === "birthday";
  const playTime = formatPlayTime(story?.playTime);
  const unlocks = story ? storyUnlockLabels(locale, story) : [];
  const rewards = story?.rewards ?? [];
  const episodeLabel = story ? storyEpisodeLabel(locale, story) : "";
  const eyebrow = [story?.groupTitle || story?.bandName, episodeLabel].filter(Boolean).join(" · ");

  const header = (controls: ReactNode) => <header className="mb-6 overflow-hidden rounded-shape-lg border border-outline-variant bg-surface-container-low shadow-elevation-1">
    <div className="flex flex-col sm:flex-row">
      {artworkUrl && !artworkFailed && (
        <img
          src={artworkUrl}
          alt=""
          onError={() => setArtworkFailed(true)}
          className={`w-full shrink-0 border-b-[1.5px] border-outline-variant bg-surface-container-highest object-cover sm:w-72 sm:border-b-0 sm:border-r-[1.5px] ${isChapter ? "aspect-[4/3]" : "aspect-[49/16] sm:aspect-auto"}`}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center p-6">
        <p className="text-label-medium text-primary">{eyebrow || `ADV ${advId}`}</p>
        <h1 className="mt-2 text-balance text-headline-medium text-on-surface sm:text-headline-large">{initialTitle}</h1>
        {story?.description && <p className="mt-3 whitespace-pre-line text-body-medium leading-6 text-on-surface-variant">{story.description}</p>}
        {story?.birthday && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CharacterAvatarStack locale={locale} characters={[{ id: story.birthday.characterId, name: story.birthday.characterName }]} size="md" showNames />
            {story.birthday.month > 0 && <span className="text-label-medium text-primary">{t(locale, "story.ui.birthdayDate", { month: story.birthday.month, day: story.birthday.day })}</span>}
          </div>
        )}
        {(eyebrow || playTime) && <p className="mt-3 text-label-small tabular-nums text-on-surface-variant">{[eyebrow ? `ADV ${advId}` : "", playTime ? t(locale, "story.ui.playTimeValue", { time: playTime }) : ""].filter(Boolean).join(" · ")}</p>}
        {unlocks.length > 0 && (
          <div className="mt-3">
            <p className="text-label-small text-on-surface-variant">{t(locale, "story.ui.unlockTitle")}</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {unlocks.map((unlock) => (
                <li key={unlock.key} className="rounded-full border border-outline-variant bg-surface-container px-2.5 py-0.5 text-label-small text-on-surface">
                  {unlock.advId ? <a className="hover:text-primary hover:underline" href={localizePath(storyPath(unlock.advId), locale)}>{unlock.text}</a> : unlock.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        {rewards.length > 0 && (
          <div className="mt-3">
            <p className="text-label-small text-on-surface-variant">{t(locale, "story.ui.rewardsTitle")}</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {rewards.map((reward, index) => <RewardChip key={`${reward.kind}-${reward.id}-${index}`} reward={reward} locale={locale} variant="icon" />)}
            </div>
          </div>
        )}
        <StoryPlayerLink locale={locale} advId={advId} />
      </div>
    </div>
    {controls && <div className="border-t border-outline-variant px-6 py-4">{controls}</div>}
  </header>;

  // The page heading is this header's title (PageLayout `hideHeader`); the server switch sits above it, in the column.
  return <div className="mx-auto max-w-4xl">
    <div className="mb-4 empty:hidden">{serverSwitch}</div>
    {initialScript
      ? <StoryScriptReader locale={locale} script={initialScript} characters={initialCharacters} texts={initialTexts} layer="page" renderHeader={header} />
      : <>
        {header(null)}
        <div className="rounded-shape-lg border border-dashed border-outline-variant bg-surface-container-low p-10 text-center font-bold text-on-surface-variant">{t(locale, "story.ui.scriptUnavailable")}</div>
      </>}

    {(previous || next) && <nav className="mt-2 grid gap-3 sm:grid-cols-2">
      {previous ? <NeighborLink neighbor={previous} locale={locale} direction="previous" /> : <span className="hidden sm:block" aria-hidden="true" />}
      {next && <NeighborLink neighbor={next} locale={locale} direction="next" />}
    </nav>}
  </div>;
}

function NeighborLink({ neighbor, locale, direction }: { neighbor: StoryNeighbor; locale: AppLocale; direction: "previous" | "next" }) {
  const isNext = direction === "next";
  const detail = [neighbor.groupTitle, storyEpisodeLabel(locale, neighbor)].filter(Boolean).join(" · ");
  return <a
    href={localizePath(storyPath(neighbor.advId), locale)}
    rel={isNext ? "next" : "prev"}
    className={`group flex min-w-0 items-center gap-3 rounded-shape-lg border border-outline-variant bg-surface-container-low p-4 transition hover:shadow-elevation-1 ${isNext ? "flex-row-reverse text-right sm:col-start-2" : ""}`}
  >
    <svg className="h-5 w-5 shrink-0 fill-current text-primary" viewBox="0 0 24 24" aria-hidden="true">
      <path d={isNext ? "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" : "M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"} />
    </svg>
    <span className="min-w-0">
      <span className="block text-label-small text-primary">{t(locale, isNext ? "story.ui.nextEpisode" : "story.ui.previousEpisode")}</span>
      {detail && <span className="mt-0.5 block truncate text-label-small text-on-surface-variant">{detail}</span>}
      <span className="mt-0.5 block truncate text-label-large text-on-surface group-hover:text-primary">{neighbor.title}</span>
    </span>
  </a>;
}
