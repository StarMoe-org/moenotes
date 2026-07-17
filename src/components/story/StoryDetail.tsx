import { useEffect, useState, useRef } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { ParsedStoryScript } from "@/lib/story/parser";
import type { RawStoryCharacter } from "@/lib/story/data";
import type { RawText } from "@/lib/cards/data";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

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


export default function StoryDetail({ locale, advId, initialTitle, initialScript, initialCharacters, initialTexts }: { locale: AppLocale; advId: number; initialTitle: string; initialScript: ParsedStoryScript | null; initialCharacters: RawStoryCharacter[]; initialTexts: RawText[] }) {
  const [title] = useState(initialTitle);
  const [script] = useState<ParsedStoryScript | null>(initialScript);
  const [characters] = useState<RawStoryCharacter[]>(initialCharacters);
  const [texts] = useState<RawText[]>(initialTexts);
  const error = initialScript === null;
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

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      isAutoplayModeRef.current = false;
      isPlayingRef.current = false;
      activeLineIndexRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

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

  if (error) return <div className="rounded-3xl border border-dashed border-[var(--mn-border)] bg-[var(--mn-paper)] p-10 text-center font-bold text-[var(--mn-text-muted)]">{t(locale, "story.ui.scriptUnavailable")}</div>;
  if (!script) return <div className="rounded-3xl border border-dashed border-[var(--mn-border)] bg-[var(--mn-paper)] p-10 text-center font-bold text-[var(--mn-text-muted)]">{t(locale, "story.ui.parsing")}</div>;

  return <div className="mx-auto max-w-4xl relative pb-28">
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

    <header className="mb-6 rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] p-6 shadow-[var(--mn-shadow-stamp)]">
      <p className="text-xs font-black text-[var(--mn-accent)]">ADV {advId}</p>
      <h1 className="mt-2 text-2xl font-black text-[var(--mn-text)]">{title}</h1>

      {/* Top Header Controls (only visible if autoplay mode is NOT active) */}
      {!isAutoplayMode && (
        <div className="mt-4 border-t border-[var(--mn-border)] pt-4">
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
    </header>

    <div className="space-y-3">{script.lines.map((line, idx) => {
      const charId = findCharacterId(line.speaker, line.speakerId, characters, texts, locale);
      const isActive = activeLineIndex === idx;
      return <article
        id={`story-line-${idx}`}
        key={`${idx}-${line.textId}`}
        onClick={() => handleTogglePlay(idx)}
        className={`rounded-2xl border p-4 cursor-pointer transition-all duration-300 shadow-[var(--mn-shadow-stamp-sm)] ${
          isActive
            ? "border-[var(--mn-accent)] bg-[color-mix(in_oklab,var(--mn-accent)_4%,transparent)] shadow-[var(--mn-shadow-stamp)] ring-1 ring-[var(--mn-accent)]/20 scale-[1.01]"
            : "border-[var(--mn-border)] bg-[var(--mn-paper)] hover:bg-[color-mix(in_oklab,var(--mn-accent)_1.5%,transparent)]"
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
    })}</div>

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
  </div>;
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
