"use client";

import { useMemo } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ChapterDetail from "@/components/story/ChapterDetail";
import ServerScope from "@/components/shared/ServerScope";
import { forServer, type ServerFaceted } from "@/lib/servers/facets";
import { useContentServer } from "@/lib/servers/use-content-server";
import { groupStoryChapters } from "@/lib/story/chapters";
import type { StoryViewModel } from "@/lib/story/data";

/** A chapter page: the chapter's episodes as the reader's server has them, and the server switch above them. */
export default function StoryChapterPage({
  locale,
  servers,
  initialStories,
  chapterId,
}: {
  locale: AppLocale;
  servers: GameServer[];
  initialStories: ServerFaceted<StoryViewModel>[];
  chapterId: number;
}) {
  const [server, pickServer] = useContentServer(locale, servers);
  const stories = useMemo(() => initialStories.map((story) => forServer(story, server)), [initialStories, server]);
  const chapter = useMemo(() => groupStoryChapters(stories).find((entry) => entry.chapterId === chapterId) ?? null, [stories, chapterId]);
  const entityServers = useMemo(() => [...new Set(initialStories.flatMap((story) => story.servers))], [initialStories]);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={entityServers}>
      <div className="mx-auto max-w-4xl">{chapter && <ChapterDetail chapter={chapter} locale={locale} />}</div>
    </ServerScope>
  );
}
