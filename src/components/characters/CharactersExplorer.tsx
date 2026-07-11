import { useEffect, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { fetchMasterData } from "@/lib/masterdata/client";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import { validateMasterTable, type RawBand, type RawText } from "@/lib/cards/data";
import {
  getBandSmallIconUrl,
  getCharacterThumbnailUrl,
} from "@/lib/cards/assets";
import {
  normalizeCharacters,
  type RawCharacter,
  type CharacterViewModel,
} from "@/lib/characters/data";

interface Props {
  locale: AppLocale;
}

interface BandModel {
  id: number;
  name: string;
  description: string;
  color: string;
}

export default function CharactersExplorer({ locale }: Props) {
  const memory = useListPageMemory("characters");
  const [data, setData] = useState<{ characters: CharacterViewModel[]; bands: BandModel[] }>({ characters: [], bands: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    void Promise.all([
      fetchMasterData("MasterCharacter.json", { validate: validateMasterTable<RawCharacter> }),
      fetchMasterData("MasterBand.json", { validate: validateMasterTable<RawBand> }),
      fetchMasterData("MasterText.json", { validate: validateMasterTable<RawText> }),
    ])
      .then(([characterTable, bandTable, textTable]) => {
        if (!active) return;

        const textMap = new Map(textTable._allData.map((t) => [t.id, t]));
        const resolveText = (id: string) => {
          const entry = textMap.get(id);
          if (!entry) return id;
          if (locale === "zh-CN") return entry.simplifiedChinese || entry.traditionalChinese || entry.japanese || entry.english;
          if (locale === "en-US") return entry.english || entry.japanese;
          return entry.japanese || entry.english;
        };

        const resolvedBands: BandModel[] = bandTable._allData.map((b: any) => ({
          id: b.id,
          name: resolveText(b.nameTextID),
          description: resolveText(b.descriptionTextID || b.descriptionTextId || ""),
          color: b.mainColorCode ? b.mainColorCode.trim() : "var(--mn-accent)",
        }));

        const resolvedCharacters = normalizeCharacters(characterTable._allData, bandTable._allData, textTable._allData, locale);
        resolvedCharacters.sort((a, b) => a.displayOrder - b.displayOrder);

        setData({ characters: resolvedCharacters, bands: resolvedBands });
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [locale, reloadKey]);

  useEffect(() => {
    if (loading || !memory.state?.scrollY) return;
    const targetY = memory.state.scrollY;

    const handle = window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY });
    });

    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [loading, memory.state?.scrollY]);

  const saveCurrentState = useCallback(() => {
    memory.saveState({ scrollY: window.scrollY });
  }, [memory]);

  if (loading) {
    return <LoadingLayout label={t(locale, "characters.loading")} />;
  }

  if (error) {
    return <ErrorState locale={locale} onRetry={() => setReloadKey((value) => value + 1)} />;
  }

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

function LoadingLayout({ label }: { label: string }) {
  return (
    <div className="space-y-12">
      <p className="sr-only">{label}</p>
      {Array.from({ length: 2 }, (_, bIdx) => (
        <div key={bIdx} className="mn-paper p-6 sm:p-8">
          <div className="flex items-start gap-4 border-b-[1.5px] border-dashed border-[var(--mn-border)]/30 pb-5 mb-6">
            <div className="h-14 w-14 shrink-0 rounded-full animate-pulse bg-[var(--mn-cream-deep)]" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-5 w-32 animate-pulse rounded bg-[var(--mn-cream-deep)]" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--mn-cream-deep)]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, cIdx) => (
              <div key={cIdx} className="aspect-[1/2.8] rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] flex items-end p-4">
                <div className="h-10 w-full animate-pulse rounded-2xl bg-[var(--mn-cream-deep)]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ locale, onRetry }: { locale: AppLocale; onRetry: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12" role="alert">
      <h3 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "characters.loadErrorTitle")}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "characters.loadErrorDescription")}</p>
      <button type="button" onClick={onRetry} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-accent-deep)] px-6 py-3 text-sm font-bold text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
        {t(locale, "cards.retry")}
      </button>
    </div>
  );
}
