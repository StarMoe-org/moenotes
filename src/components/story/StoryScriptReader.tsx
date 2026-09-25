import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { ParsedStoryScript, StoryLine, StoryVideo } from "@/lib/story/parser";
import type { RawStoryCharacter } from "@/lib/story/data";
import type { RawText } from "@/lib/cards/data";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

const SHOW_BACKGROUNDS_KEY = "moenotes.story.showBackgrounds";

function findCharacterId(
  speakerName: string,
  speakerId: string,
  characters: RawStoryCharacter[],
  textMap: Map<string, RawText>,
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

/** Timeline entries with a clip's subtitles and a chat window's messages gathered under them. */
type StoryBlock =
  | { kind: "line"; line: number }
  /** `telop` is the time/place card line that names the scene, shown as the scene's label instead of its own line. */
  | { kind: "background"; url: string; scene: number; name?: string; telop?: number }
  | { kind: "blank" }
  | { kind: "still"; url: string; caption?: string }
  | { kind: "video"; video: StoryVideo; lines: number[] }
  | { kind: "chat"; thread: number; title: string; lines: number[] };

function buildBlocks(script: ParsedStoryScript): StoryBlock[] {
  const blocks: StoryBlock[] = [];
  let scenes = 0;
  for (const entry of script.timeline) {
    if (entry.kind === "video") {
      blocks.push({ kind: "video", video: entry.video, lines: [] });
      continue;
    }
    if (entry.kind === "background") {
      blocks.push({ ...entry, scene: ++scenes });
      continue;
    }
    if (entry.kind !== "line") {
      blocks.push(entry);
      continue;
    }
    const line = script.lines[entry.line];
    const last = blocks.at(-1);
    if (line?.kind === "telop" && last?.kind === "background" && last.telop === undefined && last.name === line.text.trim()) {
      last.telop = entry.line;
    } else if (line?.videoId !== undefined && last?.kind === "video" && last.video.id === line.videoId) {
      last.lines.push(entry.line);
    } else if (line?.chat && last?.kind === "chat" && last.thread === line.chat.thread) {
      last.lines.push(entry.line);
    } else if (line?.chat) {
      blocks.push({ kind: "chat", thread: line.chat.thread, title: line.chat.title, lines: [entry.line] });
    } else {
      blocks.push(entry);
    }
  }
  return blocks;
}

/** The background each line is spoken over (undefined on a blank screen or before the first background). */
function backgroundsOfLines(script: ParsedStoryScript): Array<string | undefined> {
  const result: Array<string | undefined> = [];
  let current: string | undefined;
  for (const entry of script.timeline) {
    if (entry.kind === "background") current = entry.url;
    else if (entry.kind === "blank") current = undefined;
    else if (entry.kind === "line") result[entry.line] = current;
  }
  return result;
}

/** The clip's subtitle playing at `time`, as a line index. */
function cueLineAt(lines: StoryLine[], clipLines: number[], time: number): number | undefined {
  return clipLines.find((index) => {
    const cue = lines[index]?.cue;
    return cue !== undefined && cue.start <= time && time < cue.end;
  });
}

export default function StoryScriptReader({ locale, script, characters, texts, layer, renderHeader }: {
  locale: AppLocale;
  script: ParsedStoryScript;
  characters: RawStoryCharacter[];
  texts: RawText[];
  /** The player dock sits above page chrome, or above a modal. Only a page reader turns the page into the scene while autoplaying. */
  layer: "page" | "modal";
  /** Renders above the script; receives the reader's controls (autoplay only while it is not running), or null when there are none. */
  renderHeader?: (controls: ReactNode) => ReactNode;
}) {
  const [activeLineIndex, setActiveLineIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoplayMode, setIsAutoplayMode] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showBackgrounds, setShowBackgrounds] = useState(false);
  // The clip whose playback drives the active line (its subtitles have no voice files).
  const [drivingClip, setDrivingClip] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRefs = useRef(new Map<number, HTMLVideoElement>());

  // Refs to prevent stale closure issues in async callbacks
  const activeLineIndexRef = useRef<number | null>(null);
  const isAutoplayModeRef = useRef(false);
  const isPlayingRef = useRef(false);
  const scriptRef = useRef<ParsedStoryScript>(script);
  const drivingClipRef = useRef<number | null>(null);

  const blocks = useMemo(() => buildBlocks(script), [script]);
  const lineBackgrounds = useMemo(() => backgroundsOfLines(script), [script]);
  const clipLines = useMemo(() => {
    const byClip = new Map<number, number[]>();
    script.lines.forEach((line, index) => {
      if (line.videoId !== undefined && line.cue) byClip.set(line.videoId, [...(byClip.get(line.videoId) ?? []), index]);
    });
    return byClip;
  }, [script]);
  const textMap = useMemo(() => new Map(texts.map((entry) => [entry.id, entry])), [texts]);
  const characterIds = useMemo(
    () => script.lines.map((line) => findCharacterId(line.speaker, line.speakerId, characters, textMap, locale)),
    [script, characters, textMap, locale],
  );
  const hasBackgrounds = blocks.some((block) => block.kind === "background");

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
    setShowBackgrounds(safeGetLocalStorage(SHOW_BACKGROUNDS_KEY) === "1");
  }, []);

  // Clean up audio and clips on unmount
  useEffect(() => {
    const videos = videoRefs.current;
    return () => {
      isAutoplayModeRef.current = false;
      isPlayingRef.current = false;
      activeLineIndexRef.current = null;
      drivingClipRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
      }
      for (const video of videos.values()) video.pause();
    };
  }, []);

  // Sync playback rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
    for (const video of videoRefs.current.values()) video.playbackRate = playbackRate;
  }, [playbackRate, activeLineIndex, isPlaying]);

  const setDriving = (videoId: number | null) => {
    drivingClipRef.current = videoId;
    setDrivingClip(videoId);
  };

  // Stops the clip driving playback; cleared first so its pause event is not taken for the user's.
  const stopClip = () => {
    const videoId = drivingClipRef.current;
    if (videoId === null) return;
    setDriving(null);
    videoRefs.current.get(videoId)?.pause();
  };

  const finishPlayback = () => {
    setIsPlaying(false);
    isPlayingRef.current = false;
    setIsAutoplayMode(false);
    isAutoplayModeRef.current = false;
    setActiveLineIndex(null);
    activeLineIndexRef.current = null;
  };

  // Autoplay advance logic
  const advanceLine = () => {
    const currentIndex = activeLineIndexRef.current;
    const currentScript = scriptRef.current;
    if (currentIndex === null) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex < currentScript.lines.length) {
      playLine(nextIndex);
    } else {
      finishPlayback();
    }
  };

  // Text-only line delays (narration, chat messages, and clip subtitles whose clip cannot play)
  useEffect(() => {
    if (activeLineIndex === null || !isPlaying || !isAutoplayMode) return;
    const line = script.lines[activeLineIndex];
    if (!line || line.voiceUrls.length > 0) return;
    if (line.videoId !== undefined && line.videoId === drivingClip) return;

    const charCount = line.text.length;
    const delay = Math.max(2000, charCount * 80);
    const timer = setTimeout(() => {
      // Only advance if we are still on this line and still in autoplay
      if (activeLineIndexRef.current === activeLineIndex && isAutoplayModeRef.current) {
        advanceLine();
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [activeLineIndex, isPlaying, isAutoplayMode, script, drivingClip]);

  // Scroll active line into view; while a clip plays its subtitles, the clip stays in view instead
  useEffect(() => {
    if (activeLineIndex === null) return;
    const line = script.lines[activeLineIndex];
    if (line?.videoId !== undefined && line.videoId === drivingClip) return;
    const timer = setTimeout(() => {
      const element = document.getElementById(`story-line-${activeLineIndex}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeLineIndex, drivingClip, script]);

  // Plays a clip from a subtitle: resumes when the clip is already inside it, else seeks (the first subtitle starts the clip).
  const playClipLine = (video: HTMLVideoElement, line: StoryLine, index: number) => {
    const cue = line.cue!;
    const first = clipLines.get(line.videoId!)?.[0] === index;
    const start = first ? 0 : cue.start;
    if (video.ended || video.currentTime < start || video.currentTime >= cue.end) video.currentTime = start;
    audioRef.current?.pause();
    if (drivingClipRef.current !== line.videoId) {
      stopClip();
      video.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setDriving(line.videoId!);
    video.playbackRate = playbackRate;
    isPlayingRef.current = true;
    setIsPlaying(true);
    video.play().catch((err) => {
      // An unpublished clip: its subtitles fall back to text timing.
      console.error("Clip playback failed", err);
      setDriving(null);
    });
  };

  const playLine = (index: number) => {
    activeLineIndexRef.current = index;
    setActiveLineIndex(index);
    const line = scriptRef.current.lines[index];
    if (!line) return;

    const video = line.videoId !== undefined && line.cue ? videoRefs.current.get(line.videoId) : undefined;
    if (video) {
      playClipLine(video, line, index);
      return;
    }
    stopClip();

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
        const line = scriptRef.current.lines[index];
        if (audio && line?.voiceUrls[0]) {
          audio.pause();
          audio.currentTime = 0;
        }
        stopClip();
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

  const pausePlayback = () => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (audioRef.current) audioRef.current.pause();
    stopClip();
  };

  const handleTogglePlayState = () => {
    if (isPlayingRef.current) {
      pausePlayback();
    } else {
      const startIndex = activeLineIndexRef.current !== null ? activeLineIndexRef.current : 0;
      playLine(startIndex);
    }
  };

  const handleAudioEnded = () => {
    if (isAutoplayModeRef.current) {
      const nextIndex = (activeLineIndexRef.current ?? 0) + 1;
      const currentScript = scriptRef.current;
      if (nextIndex < currentScript.lines.length) {
        // Natural small pause between voice clips
        setTimeout(() => {
          if (isAutoplayModeRef.current) {
            playLine(nextIndex);
          }
        }, 800);
      } else {
        finishPlayback();
      }
    } else {
      isPlayingRef.current = false;
      setIsPlaying(false);
      activeLineIndexRef.current = null;
      setActiveLineIndex(null);
    }
  };

  const clipEvents = {
    // The subtitle on screen becomes the active line while the clip drives playback.
    onTimeUpdate: (videoId: number, time: number) => {
      if (drivingClipRef.current !== videoId) return;
      const index = cueLineAt(scriptRef.current.lines, clipLines.get(videoId) ?? [], time);
      if (index !== undefined && index !== activeLineIndexRef.current) {
        activeLineIndexRef.current = index;
        setActiveLineIndex(index);
      }
    },
    // Starting a clip from its own controls stops the voice; during autoplay the clip takes over.
    onPlay: (videoId: number) => {
      if (drivingClipRef.current === videoId) return;
      audioRef.current?.pause();
      if (!isAutoplayModeRef.current) return;
      stopClip();
      setDriving(videoId);
      isPlayingRef.current = true;
      setIsPlaying(true);
    },
    onPause: (videoId: number, ended: boolean) => {
      if (drivingClipRef.current !== videoId || ended) return;
      isPlayingRef.current = false;
      setIsPlaying(false);
    },
    // Autoplay continues after the clip's last subtitle once the clip (often a whole live song) ends.
    onEnded: (videoId: number) => {
      if (drivingClipRef.current !== videoId) return;
      setDriving(null);
      if (!isAutoplayModeRef.current) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        activeLineIndexRef.current = null;
        setActiveLineIndex(null);
        return;
      }
      const next = (clipLines.get(videoId)?.at(-1) ?? activeLineIndexRef.current ?? -1) + 1;
      if (next < scriptRef.current.lines.length) playLine(next);
      else finishPlayback();
    },
    register: (videoId: number, video: HTMLVideoElement | null) => {
      if (video) videoRefs.current.set(videoId, video);
      else videoRefs.current.delete(videoId);
    },
  };

  const getNextPreloadUrls = (currentIndex: number | null): string[] => {
    if (currentIndex === null) return [];
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

  // While autoplaying, the page becomes the scene: the active line's background fills the viewport, faded.
  const immersive = layer === "page" && isAutoplayMode && activeLineIndex !== null;
  const immersiveBackground = immersive ? lineBackgrounds[activeLineIndex] : undefined;
  const nextBackground = immersive ? lineBackgrounds.slice(activeLineIndex + 1).find((url) => url && url !== immersiveBackground) : undefined;

  const toggleBackgrounds = () => {
    setShowBackgrounds((shown) => {
      safeSetLocalStorage(SHOW_BACKGROUNDS_KEY, shown ? "0" : "1");
      return !shown;
    });
  };

  const controls = (!isAutoplayMode || hasBackgrounds) && <div className="flex flex-wrap items-center gap-2">
    {!isAutoplayMode && (
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
    )}
    {hasBackgrounds && (
      <button
        type="button"
        aria-pressed={showBackgrounds}
        onClick={toggleBackgrounds}
        className={`flex items-center gap-2 rounded-full border border-[var(--mn-border)] px-4 py-1.5 text-xs font-black shadow-[var(--mn-shadow-stamp-sm)] transition hover:-translate-y-0.5 active:translate-y-0 ${showBackgrounds ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "bg-[var(--mn-paper)] text-[var(--mn-text)]"}`}
      >
        <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 4H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm-1 12.6-4.3-4.3a1 1 0 0 0-1.4 0L10 15.6l-1.3-1.3a1 1 0 0 0-1.4 0L5 16.6V6h14v10.6zM8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
        </svg>
        {t(locale, "story.ui.showBackgrounds")}
      </button>
    )}
  </div>;

  const lineProps = (index: number) => ({
    index,
    line: script.lines[index]!,
    characterId: characterIds[index] ?? null,
    isActive: activeLineIndex === index,
    isPlaying: activeLineIndex === index && isPlaying,
    locale,
    onToggle: () => handleTogglePlay(index),
  });

  return <div className="group/story relative flex flex-col pb-28" data-immersive={immersive || undefined}>
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
      {nextBackground && <img src={nextBackground} alt="" />}
    </div>

    {layer === "page" && <ImmersiveBackdrop active={immersive} url={immersiveBackground} />}

    {renderHeader
      ? renderHeader(controls || null)
      : controls && <div className="mb-4 flex items-center justify-between border-b border-[var(--mn-border)] pb-4">{controls}</div>}

    <div className="space-y-3">{blocks.map((block, blockIndex) => {
      switch (block.kind) {
        case "background":
          return <SceneBackground
            key={`bg-${blockIndex}`}
            url={block.url}
            label={block.name ?? t(locale, "story.ui.scene", { n: block.scene })}
            expanded={showBackgrounds}
            line={block.telop}
            isActive={block.telop !== undefined && activeLineIndex === block.telop}
          />;
        case "blank":
          return null;
        case "still":
          return <SceneStill key={`still-${blockIndex}`} url={block.url} caption={block.caption} />;
        case "video":
          return <ClipBlock
            key={`video-${blockIndex}`}
            video={block.video}
            lineIndices={block.lines}
            lineProps={lineProps}
            locale={locale}
            events={clipEvents}
          />;
        case "chat":
          return <ChatBlock key={`chat-${blockIndex}`} title={block.title} locale={locale}>
            {block.lines.map((index) => <ChatBubble key={index} {...lineProps(index)} />)}
          </ChatBlock>;
        default:
          return script.lines[block.line]?.kind === "telop"
            ? <TelopLine key={`line-${block.line}`} {...lineProps(block.line)} />
            : <LineCard key={`line-${block.line}`} {...lineProps(block.line)} />;
      }
    })}</div>

    {/* Floating Player Dock */}
    {isAutoplayMode && activeLineIndex !== null && (
      <div className={`fixed bottom-6 left-1/2 ${layer === "modal" ? "z-[60]" : "z-[33]"} w-[92%] max-w-[480px] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)]/95 shadow-[var(--mn-shadow-stamp)] backdrop-blur-md transition-all duration-300`}>
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
                stopClip();
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
  </div>;
}

interface LineViewProps {
  index: number;
  line: StoryLine;
  characterId: number | null;
  isActive: boolean;
  isPlaying: boolean;
  locale: AppLocale;
  onToggle: () => void;
}

function RichText({ line }: { line: StoryLine }) {
  if (!line.rich) return <>{line.text}</>;
  return <>{line.rich.map((run, index) => {
    const className = [run.bold && "font-black", run.italic && "italic", run.underline && "underline", run.strike && "line-through"].filter(Boolean).join(" ");
    return <span key={index} className={className || undefined} style={run.scale ? { fontSize: `${run.scale}em`, lineHeight: 1.3 } : undefined}>
      {run.ruby ? <ruby>{run.text}<rp>(</rp><rt className="text-[0.55em]">{run.ruby}</rt><rp>)</rp></ruby> : run.text}
    </span>;
  })}</>;
}

function LineCard({ index, line, characterId, isActive, isPlaying, locale, onToggle }: LineViewProps) {
  return <article
    id={`story-line-${index}`}
    onClick={onToggle}
    className={`rounded-2xl border p-4 cursor-pointer transition-all duration-300 shadow-[var(--mn-shadow-stamp-sm)] ${
      isActive
        ? "border-[var(--mn-accent)] bg-[color-mix(in_oklab,var(--mn-accent)_4%,transparent)] shadow-[var(--mn-shadow-stamp)] ring-1 ring-[var(--mn-accent)]/20 scale-[1.01] group-data-[immersive]/story:bg-[color-mix(in_oklab,var(--mn-paper)_88%,transparent)]"
        : "border-[var(--mn-border)] bg-[var(--mn-paper)] hover:bg-[color-mix(in_oklab,var(--mn-accent)_1.5%,transparent)] group-data-[immersive]/story:bg-[color-mix(in_oklab,var(--mn-paper)_72%,transparent)]"
    } group-data-[immersive]/story:backdrop-blur-sm`}
  >
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {characterId && (
          <img src={getCharacterFaceIconUrl(characterId)} alt={line.speaker} className={`h-6 w-6 rounded-full border bg-[var(--mn-cream-deep)] object-cover transition-all ${isActive ? "border-[var(--mn-accent)] scale-110" : "border-[var(--mn-border)]"}`} />
        )}
        <strong className={`text-sm transition-colors duration-300 ${isActive ? "text-[var(--mn-accent)] font-black" : "text-[var(--mn-text-muted)] font-bold"}`}>
          {line.speaker || t(locale, "story.ui.narration")}
        </strong>
      </div>
      {line.voiceUrls[0] && (
        <VoicePlayButton
          isPlaying={isPlaying}
          onClick={onToggle}
        />
      )}
    </div>
    <p className={`whitespace-pre-wrap leading-7 transition-all duration-300 ${isActive ? "text-[var(--mn-text)] font-semibold" : "text-[var(--mn-text)]"}`}><RichText line={line} /></p>
  </article>;
}

/**
 * Lets an image hide itself when it fails, e.g. a still the game references but does not ship. A failure before
 * hydration fires no onError, so the ref also checks the element once it is attached.
 */
function useImageFailed(url: string) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const onError = () => setFailedUrl(url);
  const ref = (image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth === 0) onError();
  };
  return [failedUrl === url, onError, ref] as const;
}

/** The page behind the reader while autoplaying: the scene's background, faded under the page color. */
function ImmersiveBackdrop({ active, url }: { active: boolean; url: string | undefined }) {
  const reducedMotion = useReducedMotion();
  const fade = { duration: reducedMotion ? 0 : 0.8 };
  return <AnimatePresence>
    {active && (
      <motion.div key="backdrop" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
        <AnimatePresence initial={false}>
          {url && <motion.img key={url} src={url} alt="" className="absolute inset-0 h-full w-full scale-105 object-cover blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} />}
        </AnimatePresence>
        <div className="absolute inset-0 bg-[color-mix(in_oklab,var(--mn-bg)_58%,transparent)]" />
      </motion.div>
    )}
  </AnimatePresence>;
}

/**
 * A scene change: a slim marker named by the scene's time/place card (or numbered), which opens into the background;
 * the background itself while backgrounds are shown. A marker that carries the card is also that line in autoplay.
 */
function SceneBackground({ url, label, expanded, line, isActive }: { url: string; label: string; expanded: boolean; line: number | undefined; isActive: boolean }) {
  const [opened, setOpened] = useState(false);
  const [failed, onError, ref] = useImageFailed(url);
  const id = line === undefined ? undefined : `story-line-${line}`;
  if (!failed && (expanded || opened)) {
    return <figure id={id} className={`relative overflow-hidden rounded-2xl border-[1.5px] bg-[var(--mn-cream-deep)] shadow-[var(--mn-shadow-stamp-sm)] ${isActive ? "border-[var(--mn-accent)] ring-1 ring-[var(--mn-accent)]/30" : "border-[var(--mn-border)]"}`}>
      <img
        ref={ref}
        src={url}
        alt={label}
        loading="lazy"
        decoding="async"
        onError={onError}
        onClick={expanded ? undefined : () => setOpened(false)}
        className={`aspect-[3/1] w-full object-cover ${expanded ? "" : "cursor-zoom-out"}`}
      />
      <figcaption className="absolute bottom-3 left-3 rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)]/90 px-3 py-1 text-xs font-black text-[var(--mn-text)] backdrop-blur-sm">{label}</figcaption>
    </figure>;
  }
  return <button
    id={id}
    type="button"
    disabled={failed}
    onClick={() => setOpened(true)}
    className="group flex w-full items-center gap-3 py-1 text-xs font-bold text-[var(--mn-text-muted)] disabled:cursor-default"
  >
    <span className="h-px flex-1 bg-[color-mix(in_oklab,var(--mn-border)_22%,transparent)]" aria-hidden="true" />
    <span className={`flex items-center gap-1.5 rounded-full border bg-[var(--mn-paper)] px-3 py-1 transition group-enabled:group-hover:border-[var(--mn-accent)] group-enabled:group-hover:text-[var(--mn-accent-deep)] ${isActive ? "border-[var(--mn-accent)] text-[var(--mn-accent-deep)]" : "border-[color-mix(in_oklab,var(--mn-border)_30%,transparent)]"}`}>
      <svg className="h-3 w-3 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 4H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm-1 12.6-4.3-4.3a1 1 0 0 0-1.4 0L10 15.6l-1.3-1.3a1 1 0 0 0-1.4 0L5 16.6V6h14v10.6zM8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
      </svg>
      {label}
    </span>
    <span className="h-px flex-1 bg-[color-mix(in_oklab,var(--mn-border)_22%,transparent)]" aria-hidden="true" />
  </button>;
}

/** A time/place card that does not open a scene: centered, like the game shows it. */
function TelopLine({ index, line, isActive, onToggle }: LineViewProps) {
  return <p
    id={`story-line-${index}`}
    onClick={onToggle}
    className={`mx-auto w-fit max-w-full cursor-pointer whitespace-pre-wrap rounded-full border px-4 py-1.5 text-center text-sm font-bold transition-colors duration-300 ${isActive ? "border-[var(--mn-accent)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "border-[color-mix(in_oklab,var(--mn-border)_30%,transparent)] bg-[var(--mn-paper)] text-[var(--mn-ink-soft)]"}`}
  >
    <RichText line={line} />
  </p>;
}

function SceneStill({ url, caption }: { url: string; caption: string | undefined }) {
  const [failed, onError, ref] = useImageFailed(url);
  if (failed) return null;
  return <figure className="overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
    <img ref={ref} src={url} alt={caption ?? ""} width={1920} height={1080} loading="lazy" decoding="async" onError={onError} className="h-auto w-full bg-[var(--mn-cream-deep)]" />
    {caption && <figcaption className="whitespace-pre-line border-t border-[var(--mn-border)] px-4 py-3 text-sm leading-6 text-[var(--mn-ink-soft)]">{caption}</figcaption>}
  </figure>;
}

interface ClipEvents {
  onTimeUpdate: (videoId: number, time: number) => void;
  onPlay: (videoId: number) => void;
  onPause: (videoId: number, ended: boolean) => void;
  onEnded: (videoId: number) => void;
  register: (videoId: number, video: HTMLVideoElement | null) => void;
}

/** WebVTT for a clip's subtitles, timed from the script. */
function clipSubtitles(lines: StoryLine[]): string {
  const time = (seconds: number) => {
    const ms = Math.round(seconds * 1000);
    const pad = (value: number, width = 2) => String(value).padStart(width, "0");
    return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
  };
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n{2,}/g, "\n");
  const cues = lines.flatMap((line) => line.cue && line.cue.end > line.cue.start
    ? [`${time(line.cue.start)} --> ${time(line.cue.end)}\n${line.speaker ? `<v ${escape(line.speaker)}>` : ""}${escape(line.text)}`]
    : []);
  return ["WEBVTT", ...cues].join("\n\n") + "\n";
}

function ClipBlock({ video, lineIndices, lineProps, locale, events }: {
  video: StoryVideo;
  lineIndices: number[];
  lineProps: (index: number) => LineViewProps;
  locale: AppLocale;
  events: ClipEvents;
}) {
  const [failed, setFailed] = useState(false);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  // The subtitle on screen, highlighted however the clip was started.
  const [onScreen, setOnScreen] = useState<number | undefined>(undefined);
  // The player shows the subtitles; the list opens on request, or by itself when the clip cannot play.
  const [listOpen, setListOpen] = useState(false);
  const trackRef = useRef<HTMLTrackElement | null>(null);
  const items = lineIndices.map(lineProps);
  const lines = items.map((item) => item.line);
  const subtitles = clipSubtitles(lines);

  // The subtitle track is a blob URL, so it only exists in the browser.
  useEffect(() => {
    if (!lines.some((line) => line.cue)) return;
    const url = URL.createObjectURL(new Blob([subtitles], { type: "text/vtt" }));
    setTrackUrl(url);
    return () => URL.revokeObjectURL(url);
    // The WebVTT text captures everything the track depends on.
  }, [subtitles]);

  // A track added after load is not shown by default.
  useEffect(() => {
    if (trackUrl && trackRef.current) trackRef.current.track.mode = "showing";
  }, [trackUrl]);

  return <section className="overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
    <header className="flex min-w-0 items-center gap-2 border-b border-[var(--mn-border)] px-4 py-2.5">
      <svg className="h-4 w-4 shrink-0 fill-current text-[var(--mn-accent)]" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
      </svg>
      <span className="shrink-0 text-xs font-black text-[var(--mn-accent-deep)]">{t(locale, "story.ui.clip")}</span>
      {video.note && <span lang="ja" className="truncate text-xs font-medium text-[var(--mn-text-muted)]">{video.note}</span>}
    </header>
    {failed ? (
      <p className="grid place-items-center bg-[var(--mn-cream-deep)] p-8 text-center text-sm font-bold text-[var(--mn-text-muted)]" style={{ aspectRatio: `${video.width} / ${video.height}` }}>
        {t(locale, "story.ui.clipUnavailable")}
      </p>
    ) : (
      <video
        src={video.url}
        controls
        playsInline
        preload="metadata"
        onPlay={() => events.onPlay(video.id)}
        onPause={(event) => events.onPause(video.id, event.currentTarget.ended)}
        onEnded={() => events.onEnded(video.id)}
        onTimeUpdate={(event) => {
          const time = event.currentTarget.currentTime;
          setOnScreen(cueLineAt(lines, lines.map((_, position) => position), time));
          events.onTimeUpdate(video.id, time);
        }}
        onError={() => setFailed(true)}
        ref={(element) => {
          events.register(video.id, element);
          // A load that failed before hydration fired no onError.
          if (element?.error) setFailed(true);
        }}
        className="block w-full bg-black"
        style={{ aspectRatio: `${video.width} / ${video.height}` }}
      >
        {trackUrl && <track ref={trackRef} kind="subtitles" srcLang={locale} label={t(locale, "story.ui.subtitles")} src={trackUrl} default />}
      </video>
    )}
    {items.length > 0 && !failed && (
      <button
        type="button"
        aria-expanded={listOpen}
        onClick={() => setListOpen((open) => !open)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-[var(--mn-border)] px-4 py-2 text-xs font-bold text-[var(--mn-text-muted)] transition hover:text-[var(--mn-accent-deep)]"
      >
        {listOpen ? t(locale, "story.ui.hideSubtitleList") : t(locale, "story.ui.showSubtitleList", { count: items.length })}
        <svg className={`h-3.5 w-3.5 fill-current transition-transform ${listOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
        </svg>
      </button>
    )}
    {items.length > 0 && (listOpen || failed) && <ol className="divide-y divide-[color-mix(in_oklab,var(--mn-border)_15%,transparent)] border-t border-[var(--mn-border)]">
      {items.map((item, position) => <ClipLine key={item.index} {...item} onScreen={onScreen === position} />)}
    </ol>}
  </section>;
}

function ClipLine({ index, line, characterId, isActive, onScreen, onToggle }: LineViewProps & { onScreen: boolean }) {
  return <li
    id={`story-line-${index}`}
    onClick={onToggle}
    className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors duration-300 ${isActive || onScreen ? "bg-[color-mix(in_oklab,var(--mn-accent)_8%,transparent)]" : "hover:bg-[color-mix(in_oklab,var(--mn-accent)_3%,transparent)]"}`}
  >
    {characterId
      ? <img src={getCharacterFaceIconUrl(characterId)} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] object-cover" />
      : <span className="h-6 w-6 shrink-0" aria-hidden="true" />}
    <p className="min-w-0 text-sm leading-6">
      {line.speaker && <strong className={`mr-2 font-black ${isActive ? "text-[var(--mn-accent)]" : "text-[var(--mn-text-muted)]"}`}>{line.speaker}</strong>}
      <span className={`whitespace-pre-wrap ${isActive ? "font-semibold text-[var(--mn-text)]" : "text-[var(--mn-text)]"}`}><RichText line={line} /></span>
    </p>
  </li>;
}

function ChatBlock({ title, locale, children }: { title: string; locale: AppLocale; children: ReactNode }) {
  return <section className="mx-auto w-full max-w-lg overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface-strong)] shadow-[var(--mn-shadow-stamp)]">
    <header className="flex items-center gap-2 border-b border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-2.5">
      <svg className="h-4 w-4 shrink-0 fill-current text-[var(--mn-accent)]" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z" />
      </svg>
      <span className="truncate text-sm font-black text-[var(--mn-text)]">{title || t(locale, "story.ui.chat")}</span>
    </header>
    <ol className="space-y-3 p-4">{children}</ol>
  </section>;
}

function ChatBubble({ index, line, characterId, isActive, onToggle }: LineViewProps) {
  const outgoing = line.chat?.outgoing ?? false;
  const avatar = line.chat?.iconUrl ?? (characterId ? getCharacterFaceIconUrl(characterId) : undefined);
  return <li id={`story-line-${index}`} onClick={onToggle} className={`flex cursor-pointer items-end gap-2 ${outgoing ? "flex-row-reverse" : ""}`}>
    <ChatAvatar url={avatar} name={line.speaker} />
    <div className={`flex min-w-0 max-w-[80%] flex-col ${outgoing ? "items-end" : "items-start"}`}>
      {!outgoing && line.speaker && <span className="mb-1 px-1 text-[11px] font-bold text-[var(--mn-text-muted)]">{line.speaker}</span>}
      <p className={`whitespace-pre-wrap rounded-2xl border px-3.5 py-2 text-sm leading-6 text-[var(--mn-text)] transition-all duration-300 ${outgoing ? "rounded-br-md bg-[var(--mn-accent-soft)]" : "rounded-bl-md bg-[var(--mn-paper)]"} ${isActive ? "border-[var(--mn-accent)] ring-1 ring-[var(--mn-accent)]/30" : "border-[var(--mn-border)]"}`}>
        <RichText line={line} />
      </p>
    </div>
  </li>;
}

function ChatAvatar({ url, name }: { url: string | undefined; name: string }) {
  const [failed, onError, ref] = useImageFailed(url ?? "");
  const className = "h-8 w-8 shrink-0 rounded-full border border-[var(--mn-border)] bg-[var(--mn-cream-deep)]";
  if (url && !failed) return <img ref={ref} src={url} alt="" loading="lazy" onError={onError} className={`${className} object-cover`} />;
  return <span className={`${className} grid place-items-center text-xs font-black text-[var(--mn-text-muted)]`} aria-hidden="true">{Array.from(name)[0] ?? ""}</span>;
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
