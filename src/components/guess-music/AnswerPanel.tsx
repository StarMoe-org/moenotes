"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { normalizeAnswer, resolveTypedAnswer, searchSongs, type SongSuggestion } from "@/lib/guess-music/answer";
import type { Guess } from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/pool";
import type { AnswerMode } from "@/lib/guess-music/scoring";
import GuessIcon from "./GuessIcon";

export interface AnswerPanelProps {
  locale: AppLocale;
  mode: AnswerMode;
  library: SongLibrary;
  /**
   * What the pure-typing box submits: the text itself (judged against the answer's titles), or the song the text
   * names (judged by song, as the daily challenge's server does; text naming no song or several costs nothing).
   */
  typed?: "text" | "song";
  /** Choice mode options, in display order. */
  optionIds: readonly number[];
  wrongGuesses: readonly Guess[];
  /** The clip has started and the round is still open. */
  enabled: boolean;
  /** Giving up also works before the clip plays (say, when the audio will not start). */
  canGiveUp: boolean;
  /** A pick or a typed answer; the caller judges it. */
  onGuess: (guess: Guess) => void;
  onGiveUp: () => void;
}

const SUGGESTION_LIMIT = 8;

export function songGuess(library: SongLibrary, musicId: number): Guess {
  return { key: `id:${musicId}`, label: library.songById.get(musicId)?.title ?? `#${musicId}`, musicId };
}

function SongTitles({ library, musicId }: { library: SongLibrary; musicId: number }) {
  const entry = library.entryById.get(musicId);
  return (
    <span className="gm-titles">
      <span>{entry?.title ?? `#${musicId}`}</span>
      {entry?.subtitle && <span>{entry.subtitle}</span>}
    </span>
  );
}

function WrongGuessList({ locale, guesses }: { locale: AppLocale; guesses: readonly Guess[] }) {
  if (!guesses.length) return null;
  return (
    <div className="gm-field">
      <span className="gm-hint">{t(locale, "guessMusic.answer.wrongGuesses")}</span>
      <ul className="gm-row gm-plain-list">
        {guesses.map((guess) => (
          <li key={guess.key} className="gm-chip gm-chip-wrong">
            <GuessIcon name="close" size={14} />
            <span className="gm-ellipsis">{guess.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChoiceGrid({ library, optionIds, wrongGuesses, enabled, onGuess }: AnswerPanelProps) {
  const wrongIds = useMemo(() => new Set(wrongGuesses.map((guess) => guess.musicId)), [wrongGuesses]);
  const choose = (musicId: number) => {
    if (!enabled || wrongIds.has(musicId)) return;
    onGuess(songGuess(library, musicId));
  };
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });

  // The reveal's "next" button is gone once a round opens, and a wrong option turns disabled under the focus: put
  // focus back on the options (like the inputs of the other modes).
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!enabled || !grid) return;
    const focused = document.activeElement;
    const lost = !focused || focused === document.body || (grid.contains(focused) && (focused as HTMLButtonElement).disabled);
    if (lost) grid.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [enabled, wrongIds]);

  // Number keys pick an option (1-9, 0 for the tenth).
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!/^[0-9]$/.test(event.key)) return;
      const id = optionIds[event.key === "0" ? 9 : Number(event.key) - 1];
      if (id === undefined) return;
      event.preventDefault();
      chooseRef.current(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, optionIds]);

  return (
    <div ref={gridRef} className="gm-options">
      {optionIds.map((id, index) => {
        const wrong = wrongIds.has(id);
        return (
          <button key={id} type="button" onClick={() => choose(id)} disabled={!enabled || wrong} className={`gm-option md3-state${wrong ? " is-wrong" : ""}`}>
            <span aria-hidden="true" className="gm-option-key">{wrong ? <GuessIcon name="close" size={16} /> : (index + 1) % 10}</span>
            <SongTitles library={library} musicId={id} />
          </button>
        );
      })}
    </div>
  );
}

function SuggestBox({ locale, library, wrongGuesses, enabled, onGuess }: AnswerPanelProps) {
  const tr = (key: string) => t(locale, `guessMusic.answer.${key}`);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = useMemo(() => searchSongs(library.index, query, SUGGESTION_LIMIT), [library.index, query]);
  const wrongIds = useMemo(() => new Set(wrongGuesses.map((guess) => guess.musicId)), [wrongGuesses]);
  const expanded = open && suggestions.length > 0 && enabled;

  useEffect(() => {
    if (enabled) inputRef.current?.focus({ preventScroll: true });
  }, [enabled]);

  const pick = (suggestion: SongSuggestion) => {
    if (!enabled || wrongIds.has(suggestion.id)) return;
    onGuess(songGuess(library, suggestion.id));
    setQuery("");
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!suggestions.length) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current < 0 ? (step > 0 ? 0 : suggestions.length - 1) : (current + step + suggestions.length) % suggestions.length));
    } else if (event.key === "Enter") {
      if (event.nativeEvent.isComposing) return;
      event.preventDefault();
      const chosen = active >= 0 ? suggestions[active] : undefined;
      if (chosen) pick(chosen);
      else if (suggestions.length) {
        setOpen(true);
        setActive(0);
      }
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div className="gm-stack" style={{ gap: 12 }}>
      <input
        ref={inputRef}
        className="gm-input md3-text-field"
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        disabled={!enabled}
        placeholder={tr("searchPlaceholder")}
        aria-label={tr("searchLabel")}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="send"
      />
      <ul id={listId} role="listbox" aria-label={tr("suggestions")} className="gm-suggestions" hidden={!expanded}>
        {suggestions.map((suggestion, index) => {
          const entry = library.entryById.get(suggestion.id);
          const guessed = wrongIds.has(suggestion.id);
          // The second line shows what matched when it was another language's title, the reading or a title's pinyin.
          const secondary = suggestion.kind !== "title" && suggestion.text !== entry?.title ? suggestion.text : entry?.subtitle;
          return (
            <li
              key={suggestion.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              aria-disabled={guessed || undefined}
              className="gm-suggestion"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(suggestion)}
            >
              <img className="gm-jacket" src={library.songById.get(suggestion.id)?.jacketUrl} alt="" loading="lazy" />
              <span className="gm-titles">
                <span>{entry?.title ?? suggestion.text}</span>
                {secondary && <span>{secondary}</span>}
              </span>
              {guessed && <GuessIcon name="close" size={16} className="gm-bad" />}
            </li>
          );
        })}
      </ul>
      {enabled && query.trim() && !suggestions.length && <p className="gm-hint">{tr("noSuggestions")}</p>}
      <WrongGuessList locale={locale} guesses={wrongGuesses} />
    </div>
  );
}

function TypeBox({ locale, library, typed = "text", wrongGuesses, enabled, onGuess }: AnswerPanelProps) {
  const tr = (key: string, params?: Record<string, string>) => t(locale, `guessMusic.answer.${key}`, params);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  // Why the last text was not sent (song mode); cleared as the player types on.
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (enabled) inputRef.current?.focus({ preventScroll: true });
  }, [enabled]);

  const submit = () => {
    const key = normalizeAnswer(text);
    if (!enabled || !key) return;
    if (typed === "text") {
      onGuess({ key: `text:${key}`, label: text.trim(), musicId: null });
      setText("");
      return;
    }
    const named = resolveTypedAnswer(library.index, text);
    if (named.kind !== "song") {
      setRefusal(tr(named.kind === "none" ? "typeNoSong" : "typeAmbiguous", { text: text.trim() }));
      return;
    }
    const titleKey = library.index.byId.get(named.id)?.titleKey;
    if (wrongGuesses.some((guess) => guess.musicId !== null && (guess.musicId === named.id || library.index.byId.get(guess.musicId)?.titleKey === titleKey))) {
      setRefusal(tr("alreadyGuessed"));
      return;
    }
    setRefusal(null);
    onGuess(songGuess(library, named.id));
    setText("");
  };

  return (
    <div className="gm-stack" style={{ gap: 12 }}>
      <form
        className="gm-row"
        style={{ flexWrap: "nowrap" }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          className="gm-input md3-text-field"
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setRefusal(null);
          }}
          disabled={!enabled}
          placeholder={tr("typePlaceholder")}
          aria-label={tr("typeLabel")}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="send"
        />
        <Button type="submit" disabled={!enabled || !normalizeAnswer(text)} startIcon={<GuessIcon name="check" />} sx={{ flexShrink: 0 }}>
          {tr("submit")}
        </Button>
      </form>
      {refusal ? (
        <p className="gm-hint gm-hint-strong" role="status">{refusal}</p>
      ) : (
        <p className="gm-hint">{tr(typed === "song" ? "typeSongHint" : "typeHint")}</p>
      )}
      <WrongGuessList locale={locale} guesses={wrongGuesses} />
    </div>
  );
}

/** The answer area of a round: options, a search box with suggestions, or a bare text box. */
export default function AnswerPanel(props: AnswerPanelProps) {
  return (
    <section className="gm-panel gm-stack" style={{ gap: 12 }} aria-label={t(props.locale, "guessMusic.answer.label")}>
      {props.mode === "choice" ? <ChoiceGrid {...props} /> : props.mode === "suggest" ? <SuggestBox {...props} /> : <TypeBox {...props} />}
      <div className="gm-row" style={{ justifyContent: "flex-end" }}>
        <Button variant="text" onClick={props.onGiveUp} disabled={!props.canGiveUp} startIcon={<GuessIcon name="flag" />}>
          {t(props.locale, "guessMusic.answer.giveUp")}
        </Button>
      </div>
    </section>
  );
}
