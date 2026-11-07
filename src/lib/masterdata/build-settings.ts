import type { AppLocale } from "@/config/locales";
import { getBuildCharacters } from "@/lib/masterdata/build-data";
import { memo } from "@/lib/masterdata/build-core";

/** A playable character's theme color (MasterCharacter.mainColorCode) grouped under their band. */
export interface ThemeCharacterColor {
  characterId: number;
  bandId: number;
  name: string;
  color: string;
}

/** A band's theme color (MasterBand.mainColorCode) and its playable members' theme colors. */
export interface ThemeBandColor {
  bandId: number;
  name: string;
  color: string;
  characters?: ThemeCharacterColor[] | undefined;
}

interface RawBandColorInput {
  id: number;
  name: string;
  color: string;
}

interface RawCharacterColorInput {
  id: number;
  bandId: number;
  displayOrder: number;
  isNonPlayable?: boolean | undefined;
  name: string;
  mainColor: string;
}

/** Normalizes `#RRGGBB` or `RRGGBB` into upper-case `#RRGGBB`, or returns `null` when invalid. */
export function normalizeThemeHexColor(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toUpperCase() : null;
}

/**
 * Builds the ordered band and playable-character theme color catalogue from normalized MasterBand / MasterCharacter rows.
 * Non-playable characters (e.g. story-only NPCs with placeholder `#FFFFFF` colors) are excluded.
 */
export function buildThemeBandColors(
  bands: readonly RawBandColorInput[],
  characters: readonly RawCharacterColorInput[],
): ThemeBandColor[] {
  const charactersByBand = new Map<number, Array<ThemeCharacterColor & { displayOrder: number }>>();

  for (const character of characters) {
    if (character.isNonPlayable === true) continue;
    const color = normalizeThemeHexColor(character.mainColor);
    if (!color) continue;
    const list = charactersByBand.get(character.bandId) ?? [];
    list.push({
      characterId: character.id,
      bandId: character.bandId,
      name: character.name,
      color,
      displayOrder: character.displayOrder,
    });
    charactersByBand.set(character.bandId, list);
  }

  return [...bands]
    .sort((a, b) => a.id - b.id)
    .flatMap((band) => {
      const color = normalizeThemeHexColor(band.color);
      if (!color) return [];
      const bandCharacters = (charactersByBand.get(band.id) ?? [])
        .sort((a, b) => a.displayOrder - b.displayOrder || a.characterId - b.characterId)
        .map(({ characterId, bandId, name, color: charColor }) => ({
          characterId,
          bandId,
          name,
          color: charColor,
        }));
      return [{
        bandId: band.id,
        name: band.name,
        color,
        characters: bandCharacters,
      }];
    });
}

/**
 * Every band and playable character of any server with a usable main color, in MasterBand / stage display order,
 * for the settings' theme color choice. Empty when the tables cannot be read (the choice then offers the default only).
 */
export function getBuildThemeBands(locale: AppLocale): Promise<ThemeBandColor[]> {
  return memo(`theme-bands:${locale}`, async () => {
    try {
      const { bands, characters } = await getBuildCharacters(locale);
      return buildThemeBandColors(bands, characters);
    } catch {
      return [];
    }
  });
}
