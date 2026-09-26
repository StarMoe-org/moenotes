import { assetConfig } from "@/config/assets";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";

/**
 * Live2D models of the ournotes-player site that moenotes-assets publishes next to the charts (its docs/MODEL_SITE.md):
 * `models.json` lists them, `models/<id>.json` is what the player loads.
 */
export interface Live2DModelEntry {
  id: string;
  manifest: string;
  group?: string;
  /** MasterCharacter id, when MasterCharacterCostume maps the model to one character. */
  character?: number;
  bytes?: number;
}

/** A costume word: a message key (`live2d.costume.<token>`) or the id's own text for a word without one. */
export type CostumePart = { token: string } | { text: string };

export interface Live2DModel {
  id: string;
  bytes: number;
  /** MasterCharacter id: the manifest's `character`, else the number of its `<NNN>_adv` / `<NNN>_live` group. */
  characterId: number | null;
  /** `story` (ADV models), `live` (live models) or `side` (side characters, `sub_<name>` groups). */
  kind: "story" | "live" | "side";
  /** A side character's name as the model id spells it. */
  sideName: string | null;
  /** The costume and its variants, in id order (`school_winter_hs_1st_glasses` → school, winter, hs, grade1, glasses). */
  costume: CostumePart[];
  /** A live model's low quality copy (`_low`), a duplicate the picker leaves out. */
  lowQuality: boolean;
}

/** Costume words the message packs name (`live2d.costume.<token>`). */
export const COSTUME_TOKENS = [
  "casual", "spring", "summer", "winter", "school", "hs", "jhs", "grade1", "grade2", "grade3", "live", "roomwear",
  "arbeit", "livehouse", "ring", "caretaker", "child", "detective", "idol", "virtual", "soundonly", "suits", "sweat",
  "maid", "still", "mask", "silhouette", "glasses", "noseGlasses", "sunglasses", "hat", "hairdown", "twintails",
] as const;
const KNOWN = new Set<string>(COSTUME_TOKENS);
const GRADES: Record<string, string> = { "1st": "grade1", "2nd": "grade2", "3rd": "grade3" };

export function getLive2DModelsIndexUrl(): string {
  return `${assetConfig.chartSite}/models.json`;
}

/** Manifest of one model (`models/<id>.json`), the player's `src`. */
export function getLive2DModelManifestUrl(id: string): string {
  return `${assetConfig.chartSite}/models/${encodeURIComponent(id)}.json`;
}

/** The Live2D viewer page, optionally opened on one model (`?model=<id>`). */
export function getLive2DViewerHref(locale: AppLocale, modelId?: string): string {
  const path = localizePath(getRoutePathById("live2d-viewer"), locale);
  return modelId ? `${path}?${new URLSearchParams({ model: modelId })}` : path;
}

export function parseLive2DViewerSearch(search: string): string | null {
  const id = new URLSearchParams(search).get("model")?.trim() ?? "";
  return /^[a-z0-9_]+$/.test(id) ? id : null;
}

/**
 * A models.json entry as the picker shows it. Ids are `[adv_]live2d_<name>_<NNN>_<costume>` for the 25 characters (NNN
 * is the MasterCharacter id, as is the group `<NNN>_adv` / `<NNN>_live`) and `adv_live2d_sub_<name>_<costume>` for side
 * characters (group `sub_<name>`).
 */
export function parseLive2DModel(entry: Live2DModelEntry): Live2DModel {
  const group = entry.group ?? "";
  const numbered = /^(\d{3})_(adv|live)$/.exec(group);
  const side = group.startsWith("sub_") ? group.slice(4) : null;
  const characterId = typeof entry.character === "number" ? entry.character : numbered ? Number(numbered[1]) : null;
  let rest = entry.id.replace(/^(?:adv_)?live2d_/, "");
  if (side !== null && rest.startsWith(`sub_${side}_`)) rest = rest.slice(side.length + 5);
  else if (side === null) rest = rest.replace(/^.*?_\d{3}_/, "");
  const words = rest.split("_").filter(Boolean);
  const lowQuality = words.at(-1) === "low";
  if (lowQuality) words.pop();
  const costume: CostumePart[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? "";
    const grade = GRADES[word];
    if (word === "nose" && words[i + 1] === "glasses") {
      costume.push({ token: "noseGlasses" });
      i++;
    } else if (word === "01") {
      // the first (and so far only) version of a costume carries no number worth showing
    } else if (grade) costume.push({ token: grade });
    else costume.push(KNOWN.has(word) ? { token: word } : { text: word });
  }
  return {
    id: entry.id,
    bytes: typeof entry.bytes === "number" ? entry.bytes : 0,
    characterId,
    kind: side !== null ? "side" : numbered?.[2] === "live" ? "live" : "story",
    sideName: side,
    costume,
    lowQuality,
  };
}
