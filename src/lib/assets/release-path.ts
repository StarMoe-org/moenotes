import type { AppLocale } from "@/config/locales";
import imageFiles from "./generated/images.json";
import { releaseFileUrl, selectReleaseId, type ReleaseEntry } from "./release";

const images: Readonly<Record<string, ReleaseEntry>> = imageFiles;
let imageKeysById: ReadonlyMap<string, string> | undefined;

/** Resolve only PNG paths whose WebP output the release index lists, in the locale's asset language. */
export function resolveReleaseAssetId(path: string, locale: AppLocale): string | undefined {
  if (!path.endsWith(".png")) return undefined;
  const key = path.slice(0, -4).replace(/^(MemberCard\/\d+\/[^/]+)_atlas$/, "$1");
  return Object.hasOwn(images, key) ? selectReleaseId(images[key], locale) : undefined;
}

/** Readable download name (`<asset name>.webp`) for a release image URL; published file IDs carry no name. */
export function getAssetFileName(url: string): string | undefined {
  const prefix = releaseFileUrl("");
  if (!url.startsWith(prefix)) return undefined;
  imageKeysById ??= new Map(Object.entries(images).flatMap(([key, entry]) =>
    (typeof entry === "string" ? [entry] : Object.values(entry)).map((id) => [id, key] as const)));
  const key = imageKeysById.get(url.slice(prefix.length));
  return key ? `${key.split("/").at(-1)}.webp` : undefined;
}
