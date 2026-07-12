import { useEffect, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import {
  getBandSmallIconUrl,
  getCharacterThumbnailUrl,
} from "@/lib/cards/assets";
import { type CharacterViewModel } from "@/lib/characters/data";

interface Props {
  locale: AppLocale;
  initialCharacters: {
    characters: CharacterViewModel[];
    bands: BandModel[];
  };
}

interface BandModel {
  id: number;
  name: string;
  description: string;
  color: string;
}

export default function CharactersExplorer({ locale, initialCharacters }: Props) {
  const memory = useListPageMemory("characters");
  const [data] = useState<{ characters: CharacterViewModel[]; bands: BandModel[] }>(initialCharacters);

  useEffect(() => {
    if (!memory.state?.scrollY) return;
    const targetY = memory.state.scrollY;

    const handle = window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY });
    });

    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [memory.state?.scrollY]);

  const saveCurrentState = useCallback(() => {
    memory.saveState({ scrollY: window.scrollY });
  }, [memory]);

  return (
    <div className="space-y-12">
      {data.bands.map((band) => {
        const bandChars = data.characters.filter((char) => char.bandId === band.id);
        if (bandChars.length === 0) return null;

        return (
          <section key={band.id} className="mn-paper p-6 sm:p-8" aria-labelledby={`band-title-${band.id}`}>
            {/* Band Header (PJSK Style info box) */}
            <div className="flex items-start gap-4 border-b-[1.5px] border-dashed border-[var(--mn-border)]/30 pb-5 mb-6">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-sm)]">
                <img className="h-9 w-auto object-contain" src={getBandSmallIconUrl(band.id)} alt="" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id={`band-title-${band.id}`} className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] flex items-center gap-2">
                  {band.name}
                  <span className="h-2.5 w-2.5 rounded-full border border-[var(--mn-border)]/50" style={{ backgroundColor: band.color }} />
                </h2>
                <p className="mt-1.5 text-xs font-semibold leading-relaxed text-[var(--mn-text-muted)] max-w-5xl">
                  {band.description}
                </p>
              </div>
            </div>

            {/* Character Cards Horizontal/Grid Row */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-5">
              {bandChars.map((char) => (
                <CharacterCard key={char.id} char={char} locale={locale} onClick={saveCurrentState} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CharacterCard({ char, locale, onClick }: { char: CharacterViewModel; locale: AppLocale; onClick: () => void }) {
  return (
    <a
      href={localizePath(`/characters/${char.id}`, locale)}
      onClick={onClick}
      className="group relative block aspect-[1/2.8] w-full overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] shadow-[var(--mn-shadow-stamp)] transition-all hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      style={{ backgroundColor: char.mainColor }}
      aria-label={char.name}
    >
      {/* Card Background Shine and Stripe Pattern */}
      <div className="absolute inset-0 opacity-15 bg-gradient-to-tr from-transparent via-white to-transparent pointer-events-none" />
      <div className="absolute top-0 bottom-0 left-[20%] w-[30%] -skew-x-12 bg-white/10 pointer-events-none" />

      {/* Position/Role Badge */}
      <span className="absolute top-3 left-3 z-10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md border border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)]">
        {char.bandPart}
      </span>

      {/* Character Thumbnail Artwork */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
        <img
          className="h-full w-full object-cover object-top select-none transition-transform duration-300 group-hover:scale-105"
          src={getCharacterThumbnailUrl(char.id)}
          alt=""
          aria-hidden="true"
          loading="lazy"
        />
      </div>

      {/* Slanted Name tag sticker at the bottom */}
      <div className="absolute bottom-4 left-3 right-3 z-10 bg-[var(--mn-paper)] border-[1.5px] border-[var(--mn-border)] rounded-2xl py-2.5 px-2 text-center shadow-[var(--mn-shadow-stamp-sm)] transition-transform duration-300 group-hover:scale-102 group-hover:rotate-[-1.5deg]">
        <span className="block text-xs font-black text-[var(--mn-text)] truncate">{char.name}</span>
        <span className="block text-[8px] font-bold text-[var(--mn-text-muted)] tracking-wider uppercase truncate mt-0.5">{char.enName}</span>
      </div>
    </a>
  );
}
