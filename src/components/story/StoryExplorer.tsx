import { useEffect, useMemo, useState, useRef } from "react";
import type { AppLocale } from "@/config/locales";
import BaseFilters, { FilterButton, FilterSection } from "@/components/shared/BaseFilters";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import Modal from "@/components/shared/Modal";
import { getAssetUrl } from "@/lib/assets/url";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { fetchAndParseStory, type ParsedStoryScript } from "@/lib/story/parser";
import type { RawStoryCharacter, StoryCategory, StoryViewModel } from "@/lib/story/data";
import type { RawText } from "@/lib/cards/data";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

export type StorySection = "main" | "friendship" | "other";

function storyCategoryKey(category: StoryCategory | "other"): string {
  if (category === "live-result") return "story.categories.liveResult";
  return `story.categories.${category}`;
}

export default function StoryExplorer({ locale, initialCategory, initialStories, initialCharacters, initialTexts }: { locale: AppLocale; initialCategory: StorySection; initialStories: StoryViewModel[]; initialCharacters: RawStoryCharacter[]; initialTexts: RawText[] }) {
  const [stories] = useState<StoryViewModel[]>(initialStories);
  const [query, setQuery] = useState("");
  const [otherCategories, setOtherCategories] = useState<StoryCategory[]>([]);
  const loading = false;
  const error = false;
  const [, setReload] = useState(0);
  const [active, setActive] = useState<StoryViewModel | null>(null);
  const characters = initialCharacters;
  const texts = initialTexts;

  const inSection = (story: StoryViewModel) => initialCategory === "other" ? ["live-result", "home", "tutorial"].includes(story.category) : story.category === initialCategory;
  const filtered = useMemo(() => stories.filter((story) => inSection(story) && (initialCategory !== "other" || otherCategories.length === 0 || otherCategories.includes(story.category)) && (!query.trim() || story.searchText.includes(query.trim().toLocaleLowerCase()))), [stories, initialCategory, otherCategories, query]);
  const reset = () => { setQuery(""); setOtherCategories([]); };
  const categoryTotal = stories.filter(inSection).length;
  const quickFilterContent = (
    <BaseFilters
      variant="plain"
      title={t(locale, storyCategoryKey(initialCategory))}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel="Search"
      searchPlaceholder={t(locale, "story.ui.searchPlaceholder")}
      resultCount={filtered.length}
      totalCount={categoryTotal}
      hasActiveFilters={Boolean(query || otherCategories.length)}
      onReset={reset}
      resetLabel={t(locale, "story.ui.reset")}
      expandLabel={t(locale, "story.ui.expand")}
    >
      {initialCategory === "other" ? (
        <FilterSection title={t(locale, "story.ui.storyType")}>
          <div className="flex flex-wrap gap-2">
            <FilterButton active={otherCategories.length === 0} onClick={() => setOtherCategories([])}>
              ALL
            </FilterButton>
            {(["live-result", "home", "tutorial"] as StoryCategory[]).map((category) => (
              <FilterButton
                key={category}
                active={otherCategories.includes(category)}
                onClick={() =>
                  setOtherCategories(
                    otherCategories.includes(category)
                      ? otherCategories.filter((item) => item !== category)
                      : [...otherCategories, category]
                  )
                }
              >
                {t(locale, storyCategoryKey(category))}
              </FilterButton>
            ))}
          </div>
        </FilterSection>
      ) : (
        <div />
      )}
    </BaseFilters>
  );

  useQuickFilter(
    initialCategory !== "main" ? t(locale, storyCategoryKey(initialCategory)) : "",
    initialCategory !== "main" ? quickFilterContent : null,
    [initialCategory, query, otherCategories, filtered.length, categoryTotal, locale]
  );

  if (initialCategory === "main") {
    if (loading) return <State text={t(locale, "story.ui.loadingMain")} />;
    if (error) return <State text={t(locale, "story.ui.loadMainError")} action={() => setReload((v) => v + 1)} />;
    return <MainStoryGroups stories={filtered} locale={locale} />;
  }

  return (
    <>
      <section className="min-w-0" aria-live="polite">
        {loading ? (
          <State text={t(locale, "story.ui.loading")} />
        ) : error ? (
          <State text={t(locale, "story.ui.loadError")} action={() => setReload((v) => v + 1)} />
        ) : filtered.length === 0 ? (
          <State text={t(locale, "story.ui.empty")} action={reset} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((story) => (
              <StoryCard key={story.id} story={story} locale={locale} onOpen={() => setActive(story)} />
            ))}
          </div>
        )}
      </section>
      <StoryReader story={active} locale={locale} characters={characters} texts={texts} onClose={() => setActive(null)} />
    </>
  );
}

function MainStoryGroups({ stories, locale }: { stories: StoryViewModel[]; locale: AppLocale }) {
  const chapters = [...new Map(stories.map((story) => [story.chapterId, story])).values()]
    .sort((a, b) => (a.chapterId ?? 0) - (b.chapterId ?? 0));

  return <div className="space-y-8">{chapters.map((chapter) => {
    const episodes = stories.filter((story) => story.chapterId === chapter.chapterId).sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
    const chapterAsset = chapter.chapterBanner || chapter.chapterImage;
    const chapterImageUrl = chapterAsset ? getAssetUrl({ path: `Story/${chapter.chapterBanner ? "Banner" : "Image"}/Chapter/${chapterAsset}.png`, type: "raw" }) : "";
    return <section key={chapter.chapterId} className="overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
      <div className="flex flex-col">
        {chapterImageUrl && (
          <div className="w-full aspect-[21/9] sm:aspect-[24/9] md:aspect-[3/1] bg-[var(--mn-cream-deep)] border-b-[1.5px] border-[var(--mn-border)] overflow-hidden">
            <img src={chapterImageUrl} alt="" className="h-full w-full object-cover transition duration-300 hover:scale-[1.01]" />
          </div>
        )}
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-wider text-[var(--mn-accent)]">{chapter.bandName}</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--mn-text)]">{chapter.chapterName}</h2>
          <p className="mt-4 whitespace-pre-line leading-7 text-[var(--mn-text-muted)]">{chapter.chapterDescription}</p>
          <p className="mt-4 text-xs font-medium text-[var(--mn-text-muted)]">{chapter.characterNames.join(" · ")}</p>
        </div>
      </div>
      <div className="grid gap-3 border-t-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-6">
        {episodes.map((episode) => <a key={episode.id} href={localizePath(`/story/${episode.advId}`, locale)} className="group flex items-center gap-4 rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-3 shadow-[var(--mn-shadow-stamp-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--mn-shadow-stamp)]">
          <img src={getAssetUrl({ path: `Story/Banner/Episode/${episode.assets.banner}.png`, type: "raw" })} alt="" className="h-16 w-28 shrink-0 rounded-xl object-cover" loading="lazy" />
          <div className="min-w-0"><p className="text-[11px] font-black text-[var(--mn-accent)]">EPISODE {episode.episodeNumber}</p><h3 className="mt-1 line-clamp-2 text-sm font-black text-[var(--mn-text)]">{episode.title}</h3></div>
        </a>)}
      </div>
    </section>;
  })}</div>;
}

function StoryCard({ story, locale, onOpen }: { story: StoryViewModel; locale: AppLocale; onOpen: () => void }) {
  const hasCover = story.category === "main" || story.category === "friendship";
  const image = hasCover ? (story.assets.banner || story.assets.image) : "";
  const imageUrl = image ? getAssetUrl({ path: `Story/Banner/${story.assets.banner ? "Episode" : "Chapter"}/${image}.png`, type: "raw" }) : "";

  const className = "group block w-full overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] text-left shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]";
  const content = <>
    {hasCover && (
      <div className="aspect-[2/1] bg-[var(--mn-cream-deep)] border-b-[1.5px] border-[var(--mn-border)] overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center text-3xl text-[var(--mn-text-muted)]">◇</div>
        )}
      </div>
    )}
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="rounded-full bg-[color-mix(in_oklab,var(--mn-accent)_12%,transparent)] px-2.5 py-1 text-[11px] font-black text-[var(--mn-accent)]">
          {t(locale, storyCategoryKey(story.category))}
        </span>
        <span className="text-[11px] font-bold text-[var(--mn-text-muted)]">ADV {story.advId}</span>
      </div>
      <h3 className="line-clamp-2 font-black text-[var(--mn-text)] text-base leading-snug">
        {story.title}
      </h3>
      <p className="mt-2 truncate text-xs font-medium text-[var(--mn-text-muted)]">
        {story.characterNames.join(" · ") || story.groupTitle}
      </p>
    </div>
  </>;
  return story.category === "main" || story.category === "friendship"
    ? <a href={localizePath(`/story/${story.advId}`, locale)} className={className} data-list-item-id={story.id}>{content}</a>
    : <button type="button" onClick={onOpen} className={className} data-list-item-id={story.id}>{content}</button>;
}

function findCharacterId(
  speakerName: string,
  speakerId: string,
  characters: RawStoryCharacter[],
  texts: RawText[],
  locale: AppLocale
): number | null {
  if (!speakerName) return null;

  // 1. Try direct matching with speakerId
  if (speakerId) {
    const directMatch = characters.find(
      (c) => c.nameTextID === speakerId || c.shortNameTextID === speakerId
    );
    if (directMatch) return directMatch.id;
  }

  // 2. Localized name comparison (short name and full name)
  const nameToCompare = speakerName.trim().toLowerCase();
  const textMap = new Map(texts.map((t) => [t.id, t]));
  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale);

  for (const c of characters) {
    const shortName = resolveText(c.shortNameTextID).trim().toLowerCase();
    if (shortName && (shortName === nameToCompare || nameToCompare.includes(shortName) || shortName.includes(nameToCompare))) {
      return c.id;
    }

    const fullName = resolveText(c.nameTextID).trim().toLowerCase();
    if (fullName && (fullName === nameToCompare || fullName.replace(/\s+/g, "") === nameToCompare.replace(/\s+/g, "") || fullName.includes(nameToCompare) || nameToCompare.includes(fullName))) {
      return c.id;
    }
  }

  // 3. Substring match on ID key
  if (speakerId) {
    const idToCompare = speakerId.toLowerCase();
    for (const c of characters) {
      const charPart = c.shortNameTextID.split("_").pop()?.toLowerCase();
      if (charPart && (idToCompare.includes(charPart) || charPart.includes(idToCompare))) {
        return c.id;
      }
    }
  }

  return null;
}

function StoryReader({ story, locale, characters, texts, onClose }: { story: StoryViewModel | null; locale: AppLocale; characters: RawStoryCharacter[]; texts: RawText[]; onClose: () => void }) {
  const [script, setScript] = useState<ParsedStoryScript | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoplayMode, setIsAutoplayMode] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Refs to prevent stale closure issues in async callbacks
  const activeLineIndexRef = useRef<number | null>(null);
  const isAutoplayModeRef = useRef(false);
  const isPlayingRef = useRef(false);
  const scriptRef = useRef<ParsedStoryScript | null>(null);

  // Sync state values to refs synchronously on change
  useEffect(() => {
    activeLineIndexRef.current = activeLineIndex;
  }, [activeLineIndex]);

  useEffect(() => {
    isAutoplayModeRef.current = isAutoplayMode;
  }, [isAutoplayMode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    scriptRef.current = script;
  }, [script]);

  useEffect(() => {
    if (!story) return;
    let alive = true;
    setScript(null);
    setFailed(false);
    setActiveLineIndex(null);
    activeLineIndexRef.current = null;
    setIsPlaying(false);
    isPlayingRef.current = false;
    setIsAutoplayMode(false);
    isAutoplayModeRef.current = false;

    void fetchAndParseStory(story.assets.advEpisodeAsset, { locale })
      .then((value) => alive && setScript(value))
      .catch(() => alive && setFailed(true));

    return () => { alive = false; };
  }, [story, locale]);

  // Clean up audio when modal closes
  useEffect(() => {
    if (!story) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setActiveLineIndex(null);
      activeLineIndexRef.current = null;
      setIsAutoplayMode(false);
      isAutoplayModeRef.current = false;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    }
  }, [story]);

  // Sync playback rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, activeLineIndex, isPlaying]);

  // Autoplay advance logic
  const advanceLine = () => {
    const currentIndex = activeLineIndexRef.current;
    const currentScript = scriptRef.current;
    if (currentIndex === null || !currentScript) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex < currentScript.lines.length) {
      playLine(nextIndex);
    } else {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setIsAutoplayMode(false);
      isAutoplayModeRef.current = false;
      setActiveLineIndex(null);
      activeLineIndexRef.current = null;
    }
  };

  // Text-only narration line delays
  useEffect(() => {
    if (activeLineIndex === null || !script || !isPlaying || !isAutoplayMode) return;
    const line = script.lines[activeLineIndex];
    if (!line) return;

    if (line.voiceUrls.length === 0) {
      const charCount = line.text.length;
      const delay = Math.max(2000, charCount * 80);
      const timer = setTimeout(() => {
        // Only advance if we are still on this line and still in autoplay
        if (activeLineIndexRef.current === activeLineIndex && isAutoplayModeRef.current) {
          advanceLine();
        }
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [activeLineIndex, isPlaying, isAutoplayMode, script]);

  // Scroll active line into view
  useEffect(() => {
    if (activeLineIndex === null) return;
    const timer = setTimeout(() => {
      const element = document.getElementById(`story-line-${activeLineIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeLineIndex]);

  const playLine = (index: number) => {
    activeLineIndexRef.current = index;
    setActiveLineIndex(index);
    const line = scriptRef.current?.lines[index];
    if (!line) return;

    if (line.voiceUrls[0]) {
      const audio = audioRef.current;
      if (audio) {
        audio.src = line.voiceUrls[0];
        audio.load();
        audio.play()
          .then(() => {
            isPlayingRef.current = true;
            setIsPlaying(true);
          })
          .catch((err) => {
            console.error("Playback failed", err);
            isPlayingRef.current = false;
            setIsPlaying(false);
          });
      }
    } else {
      isPlayingRef.current = true;
      setIsPlaying(true);
    }
  };

  const handleTogglePlay = (index: number) => {
    if (activeLineIndexRef.current === index) {
      if (isPlayingRef.current) {
        const audio = audioRef.current;
        const line = scriptRef.current?.lines[index];
        if (audio && line?.voiceUrls[0]) {
          audio.pause();
          audio.currentTime = 0;
        }
        isPlayingRef.current = false;
        setIsPlaying(false);
        if (!isAutoplayModeRef.current) {
          activeLineIndexRef.current = null;
          setActiveLineIndex(null);
        }
      } else {
        playLine(index);
      }
    } else {
      playLine(index);
    }
  };

  const handleTogglePlayState = () => {
    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    } else {
      const startIndex = activeLineIndexRef.current !== null ? activeLineIndexRef.current : 0;
      playLine(startIndex);
    }
  };

  const handleAudioEnded = () => {
    if (isAutoplayModeRef.current) {
      const nextIndex = (activeLineIndexRef.current ?? 0) + 1;
      const currentScript = scriptRef.current;
      if (currentScript && nextIndex < currentScript.lines.length) {
        // Natural small pause between voice clips
        setTimeout(() => {
          if (isAutoplayModeRef.current) {
            playLine(nextIndex);
          }
        }, 800);
      } else {
        isPlayingRef.current = false;
        setIsPlaying(false);
        isAutoplayModeRef.current = false;
        setIsAutoplayMode(false);
        activeLineIndexRef.current = null;
        setActiveLineIndex(null);
      }
    } else {
      isPlayingRef.current = false;
      setIsPlaying(false);
      activeLineIndexRef.current = null;
      setActiveLineIndex(null);
    }
  };

  const getNextPreloadUrls = (currentIndex: number | null): string[] => {
    if (currentIndex === null || !script) return [];
    const urls: string[] = [];
    for (let i = currentIndex + 1; i < script.lines.length; i++) {
      const line = script.lines[i];
      if (line && line.voiceUrls[0]) {
        urls.push(line.voiceUrls[0]);
        if (urls.length >= 3) break;
      }
    }
    return urls;
  };

  return <Modal isOpen={Boolean(story)} onClose={onClose} title={story?.title} closeLabel={t(locale, "story.ui.close")} size="xl">
    <audio
      ref={audioRef}
      preload="none"
      onEnded={handleAudioEnded}
    />
    
    {/* Preload container */}
    <div className="hidden" aria-hidden="true">
      {getNextPreloadUrls(activeLineIndex).map((url) => (
        <audio key={url} src={url} preload="auto" />
      ))}
    </div>

    {failed ? <State text={t(locale, "story.ui.scriptUnavailable")} /> : !script ? <State text={t(locale, "story.ui.parsing")} /> : (
      <div className="flex flex-col relative pb-28">
        {/* Top Header Controls (only visible if autoplay mode is NOT active) */}
        {!isAutoplayMode && (
          <div className="mb-4 flex items-center justify-between border-b border-[var(--mn-border)] pb-4">
            <button
              type="button"
              onClick={() => {
                setIsAutoplayMode(true);
                playLine(activeLineIndex ?? 0);
              }}
              className="flex items-center gap-2 rounded-full bg-[var(--mn-accent)] px-4 py-1.5 text-xs font-black text-white shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-0.5 active:translate-y-0"
            >
              <svg className="h-3.5 w-3.5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
              </svg>
              {t(locale, "story.ui.autoplay")}
            </button>
          </div>
        )}

        {/* Lines */}
        <div className="space-y-3">
          {script.lines.map((line, idx) => {
            const charId = findCharacterId(line.speaker, line.speakerId, characters, texts, locale);
            const isActive = activeLineIndex === idx;
            return <article
              id={`story-line-${idx}`}
              key={`${idx}-${line.textId}`}
              onClick={() => handleTogglePlay(idx)}
              className={`rounded-2xl border p-4 cursor-pointer transition-all duration-300 ${
                isActive
                  ? "border-[var(--mn-accent)] bg-[color-mix(in_oklab,var(--mn-accent)_4%,transparent)] shadow-[var(--mn-shadow-stamp)] ring-1 ring-[var(--mn-accent)]/20 scale-[1.01]"
                  : "border-[var(--mn-border)] bg-[var(--mn-surface)] hover:bg-[color-mix(in_oklab,var(--mn-accent)_1.5%,transparent)]"
              }`}
            >
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {charId && (
                    <img src={getCharacterFaceIconUrl(charId)} alt={line.speaker} className={`h-6 w-6 rounded-full border bg-[var(--mn-cream-deep)] object-cover transition-all ${isActive ? "border-[var(--mn-accent)] scale-110" : "border-[var(--mn-border)]"}`} />
                  )}
                  <strong className={`text-sm transition-colors duration-300 ${isActive ? "text-[var(--mn-accent)] font-black" : "text-[var(--mn-text-muted)] font-bold"}`}>
                    {line.speaker || t(locale, "story.ui.narration")}
                  </strong>
                </div>
                {line.voiceUrls[0] && (
                  <VoicePlayButton
                    isPlaying={isActive && isPlaying}
                    onClick={() => handleTogglePlay(idx)}
                  />
                )}
              </div>
              <p className={`whitespace-pre-wrap leading-7 transition-all duration-300 ${isActive ? "text-[var(--mn-text)] font-semibold" : "text-[var(--mn-text)]"}`}>{line.text}</p>
            </article>;
          })}
        </div>

        {/* Floating Player Dock */}
        {isAutoplayMode && activeLineIndex !== null && (
          <div className="fixed bottom-6 left-1/2 z-[60] w-[92%] max-w-[480px] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)]/95 shadow-[var(--mn-shadow-stamp)] backdrop-blur-md transition-all duration-300">
            {/* Progress Bar at top edge of the pill */}
            <div className="h-1 w-full bg-[var(--mn-border)]">
              <div
                className="h-full bg-[var(--mn-accent)] transition-all duration-300"
                style={{
                  width: `${((activeLineIndex + 1) / script.lines.length) * 100}%`
                }}
              />
            </div>

            {/* Controller */}
            <div className="flex items-center justify-between px-4 py-2.5">
              {/* Left Navigation and Play */}
              <div className="flex items-center gap-2 md:gap-3">
                {/* Prev Button */}
                <button
                  type="button"
                  disabled={activeLineIndex === 0}
                  onClick={() => activeLineIndex > 0 && playLine(activeLineIndex - 1)}
                  className="text-[var(--mn-text-muted)] hover:text-[var(--mn-text)] disabled:opacity-30 transition p-1"
                  aria-label="Previous line"
                >
                  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
                  </svg>
                </button>

                {/* Big circular Play/Pause button */}
                <button
                  type="button"
                  onClick={handleTogglePlayState}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--mn-accent)] text-white shadow-[var(--mn-shadow-stamp-sm)] transition hover:scale-105 active:scale-95"
                  aria-label={isPlaying ? "Pause autoplay" : "Start autoplay"}
                >
                  {isPlaying ? (
                    <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                {/* Next Button */}
                <button
                  type="button"
                  disabled={activeLineIndex === script.lines.length - 1}
                  onClick={() => activeLineIndex < script.lines.length - 1 && playLine(activeLineIndex + 1)}
                  className="text-[var(--mn-text-muted)] hover:text-[var(--mn-text)] disabled:opacity-30 transition p-1"
                  aria-label="Next line"
                >
                  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                  </svg>
                </button>
              </div>

              {/* Middle dialogue status info */}
              <div className="flex flex-col items-center justify-center text-center">
                <span className="text-[9px] font-black tracking-widest text-[var(--mn-accent)] uppercase">
                  {isPlaying ? t(locale, "story.ui.playing") : t(locale, "story.ui.paused")}
                </span>
                <span className="mt-0.5 text-xs font-black text-[var(--mn-text)]">
                  {t(locale, "story.ui.line", { current: activeLineIndex + 1, total: script.lines.length })}
                </span>
              </div>

              {/* Right speed select and exit cross */}
              <div className="flex items-center gap-2 md:gap-3">
                {/* Speed toggle */}
                <button
                  type="button"
                  onClick={() => {
                    setPlaybackRate((prev) => {
                      if (prev === 1) return 1.25;
                      if (prev === 1.25) return 1.5;
                      if (prev === 1.5) return 2;
                      return 1;
                    });
                  }}
                  className="rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-2.5 py-0.5 text-[11px] font-black text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:-translate-y-0.5 active:translate-y-0 hover:bg-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] hover:border-[var(--mn-accent)]/30"
                >
                  {playbackRate}x
                </button>

                {/* Close Cross */}
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setActiveLineIndex(null);
                    setIsAutoplayMode(false);
                    if (audioRef.current) {
                      audioRef.current.pause();
                      audioRef.current.src = "";
                    }
                  }}
                  className="text-[var(--mn-text-muted)] hover:text-[var(--mn-text)] transition p-1"
                  aria-label="Close player"
                >
                  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
  </Modal>;
}

function VoicePlayButton({ isPlaying, onClick }: { isPlaying: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-accent)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:-translate-y-0.5 hover:bg-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] active:translate-y-0"
      aria-label={isPlaying ? "Pause voice" : "Play voice"}
    >
      {isPlaying ? (
        <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
          <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
      ) : (
        <svg className="h-4 w-4 fill-current translate-x-0.5" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}

function State({ text, action }: { text: string; action?: () => void }) { return <div className="grid min-h-64 place-items-center rounded-3xl border border-dashed border-[var(--mn-border)] bg-[var(--mn-paper)] p-8 text-center"><div><p className="font-bold text-[var(--mn-text-muted)]">{text}</p>{action && <button type="button" onClick={action} className="mt-4 rounded-full bg-[var(--mn-accent)] px-5 py-2 text-sm font-black text-white">Retry</button>}</div></div>; }
