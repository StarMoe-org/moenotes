import type { AppLocale } from "@/config/locales";
import { getBuildCharacters } from "@/lib/masterdata/build-data";

export interface AvatarChoice {
  id: number;
  name: string;
}

export interface AvatarBand {
  id: number;
  name: string;
  color: string;
  characters: AvatarChoice[];
}

/**
 * Build time only. The avatars the account page offers are every character the site lists, grouped by band in
 * display order. They are passed to the page, so the picker makes no request of its own.
 */
export async function getAvatarBands(locale: AppLocale): Promise<AvatarBand[]> {
  const { characters, bands } = await getBuildCharacters(locale);
  return bands
    .map((band) => ({
      id: band.id,
      name: band.name,
      color: band.color,
      characters: characters.filter((character) => character.bandId === band.id).map(({ id, name }) => ({ id, name })),
    }))
    .filter((band) => band.characters.length > 0);
}
