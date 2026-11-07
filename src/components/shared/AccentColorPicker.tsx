"use client";

import { useState, type KeyboardEvent } from "react";
import { rovingStep } from "@/components/shared/PrimaryTabs";
import { DEFAULT_ACCENT } from "@/config/settings";
import { getBandSmallIconWhiteUrl, getCharacterFaceIconUrl } from "@/lib/cards/assets";
import type { ThemeBandColor } from "@/lib/masterdata/build-settings";
import { MD3_DEFAULT_SEED } from "@/lib/md3/scheme";

export interface AccentChoice {
  id: string;
  value: string;
  /** Full accessible label (e.g. "MyGO!!!!! · Chihaya Anon"). */
  label: string;
  /** Concise label shown in section headers (e.g. "Chihaya Anon"). */
  displayLabel: string;
  color: string;
  icon?: string | undefined;
  iconKind?: "emblem" | "face" | undefined;
}

export interface AccentBandRow {
  band: AccentChoice;
  characters: AccentChoice[];
}

export interface AccentCatalogue {
  defaultChoice: AccentChoice;
  rows: AccentBandRow[];
  allChoices: AccentChoice[];
}

function normalizeChoiceValue(value: string | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function buildAccentCatalogue({
  defaultLabel,
  bands,
  resolveAssetUrl = (url) => url,
}: {
  defaultLabel: string;
  bands: readonly ThemeBandColor[];
  resolveAssetUrl?: ((url: string) => string) | undefined;
}): AccentCatalogue {
  const defaultChoice: AccentChoice = {
    id: "default",
    value: DEFAULT_ACCENT,
    label: defaultLabel,
    displayLabel: defaultLabel,
    color: MD3_DEFAULT_SEED,
  };

  const rows: AccentBandRow[] = bands.map((band) => {
    const bandColor = band.color.toUpperCase();
    const bandChoice: AccentChoice = {
      id: `band:${band.bandId}`,
      value: bandColor,
      label: band.name,
      displayLabel: band.name,
      color: bandColor,
      icon: resolveAssetUrl(getBandSmallIconWhiteUrl(band.bandId)),
      iconKind: "emblem",
    };
    const characterChoices: AccentChoice[] = (band.characters ?? []).map((character) => {
      const charColor = character.color.toUpperCase();
      return {
        id: `character:${character.characterId}`,
        value: charColor,
        label: `${band.name} · ${character.name}`,
        displayLabel: character.name,
        color: charColor,
        icon: resolveAssetUrl(getCharacterFaceIconUrl(character.characterId)),
        iconKind: "face",
      };
    });
    return { band: bandChoice, characters: characterChoices };
  });

  const allChoices: AccentChoice[] = [
    defaultChoice,
    ...rows.flatMap((row) => [row.band, ...row.characters]),
  ];

  return { defaultChoice, rows, allChoices };
}

export function findSelectedAccentChoice(
  catalogue: AccentCatalogue,
  value: string | undefined,
): AccentChoice | undefined {
  const target = normalizeChoiceValue(value);
  if (!target) return undefined;
  return catalogue.allChoices.find((choice) => normalizeChoiceValue(choice.value) === target);
}

export interface AccentColorPickerProps {
  label: string;
  catalogue: AccentCatalogue;
  value: string | undefined;
  onChange: (value: string) => void;
  ringOffsetClass?: string | undefined;
}

/**
 * Material 3 theme seed picker offering the default MoeNotes blue, every band's main color (with its white emblem),
 * and every playable character's main color (with their face portrait on their color), arranged as one compact row
 * per band (`[Band | 5 Members]`) with full roving-tabindex radio navigation.
 */
export default function AccentColorPicker({
  label,
  catalogue,
  value,
  onChange,
  ringOffsetClass = "ring-offset-surface-container-low",
}: AccentColorPickerProps) {
  const { defaultChoice, rows, allChoices } = catalogue;
  const normalizedValue = normalizeChoiceValue(value);
  const selectedIndex = allChoices.findIndex((choice) => normalizeChoiceValue(choice.value) === normalizedValue);
  const hasCharacterRows = rows.some((row) => row.characters.length > 0);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = rovingStep(event.key, selectedIndex, allChoices.length);
    if (next === null) return;
    event.preventDefault();
    onChange(allChoices[next]!.value);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  if (!hasCharacterRows) {
    return (
      <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-2.5 px-0.5 py-1 sm:gap-3">
        {allChoices.map((choice, index) => (
          <SwatchRadio
            key={choice.id}
            choice={choice}
            selected={index === selectedIndex}
            tabIndex={index === selectedIndex || (selectedIndex < 0 && index === 0) ? 0 : -1}
            ringOffsetClass={ringOffsetClass}
            onSelect={onChange}
          />
        ))}
      </div>
    );
  }

  let optionCursor = 0;
  const defaultIndex = optionCursor++;
  const defaultSelected = defaultIndex === selectedIndex;

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="space-y-2.5 py-1">
      <div className="px-0.5">
        <button
          type="button"
          role="radio"
          aria-checked={defaultSelected}
          aria-label={defaultChoice.label}
          title={defaultChoice.label}
          tabIndex={defaultSelected || selectedIndex < 0 ? 0 : -1}
          onClick={() => onChange(defaultChoice.value)}
          className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border pl-2 pr-3.5 text-label-large transition-colors duration-200 ease-standard ${
            defaultSelected
              ? "border-primary bg-secondary-container text-on-secondary-container ring-[2px] ring-primary/35"
              : "border-outline-variant bg-surface-container-low text-on-surface hover:bg-surface-container"
          }`}
        >
          <span
            aria-hidden="true"
            className="h-5 w-5 shrink-0 rounded-full border border-outline-variant/60"
            style={{ backgroundColor: defaultChoice.color }}
          />
          <span>{defaultChoice.displayLabel}</span>
        </button>
      </div>

      <div className="space-y-2.5 px-0.5">
        {rows.map((row) => {
          const bandIndex = optionCursor++;
          const charIndices = row.characters.map(() => optionCursor++);
          return (
            <div key={row.band.id} className="flex items-center gap-1.5 min-[380px]:gap-2 sm:gap-3">
              <SwatchRadio
                choice={row.band}
                selected={bandIndex === selectedIndex}
                tabIndex={bandIndex === selectedIndex ? 0 : -1}
                ringOffsetClass={ringOffsetClass}
                onSelect={onChange}
              />
              {row.characters.length > 0 && (
                <>
                  <span aria-hidden="true" className="h-6 w-px shrink-0 bg-outline-variant/80" />
                  <div className="flex flex-wrap items-center gap-1.5 min-[380px]:gap-2 sm:gap-2.5">
                    {row.characters.map((character, idx) => {
                      const choiceIndex = charIndices[idx]!;
                      return (
                        <SwatchRadio
                          key={character.id}
                          choice={character}
                          selected={choiceIndex === selectedIndex}
                          tabIndex={choiceIndex === selectedIndex ? 0 : -1}
                          ringOffsetClass={ringOffsetClass}
                          onSelect={onChange}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SwatchRadio({
  choice,
  selected,
  tabIndex,
  ringOffsetClass,
  onSelect,
}: {
  choice: AccentChoice;
  selected: boolean;
  tabIndex: number;
  ringOffsetClass: string;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={choice.label}
      title={choice.label}
      tabIndex={tabIndex}
      onClick={() => onSelect(choice.value)}
      // 50%, not a full radius: a radius far past what shows cannot be interpolated into the selected corners.
      className={` relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center overflow-hidden border-2 transition-[border-radius] duration-300 ease-standard min-[380px]:h-10 min-[380px]:w-10 sm:h-11 sm:w-11 ${
        selected
          ? `rounded-shape-lg ring-[3px] ring-primary ring-offset-2 ${ringOffsetClass}`
          : "rounded-[50%] hover:rounded-shape-lg"
      }`}
      style={{ backgroundColor: choice.color, borderColor: choice.color }}
    >
      {choice.icon && <SwatchIcon src={choice.icon} kind={choice.iconKind ?? "emblem"} />}
    </button>
  );
}

function SwatchIcon({ src, kind }: { src: string; kind: "emblem" | "face" }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={kind === "face" ? "h-full w-full object-cover" : "h-[72%] w-[72%] object-contain"}
    />
  );
}
