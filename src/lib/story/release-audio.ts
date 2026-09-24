import type { AppLocale } from "@/config/locales";
import audioExports from "@/lib/assets/generated/audio.json";
import { fetchReleaseJson, releaseExportUrl, releaseFileUrl, selectReleaseId, type ReleaseEntry } from "@/lib/assets/release";

/** Export IDs by `Cri/Sound/<cue sheet>`; cue files are listed in each export's published manifest. */
const sheets: Readonly<Record<string, ReleaseEntry>> = audioExports;

interface ExportManifest {
  files: Array<{ id: string; label: string; media_type: string; sha256: string }>;
}

/** Cue label → file ID for one cue sheet. */
type CueFiles = ReadonlyMap<string, string>;

export interface ReleaseAudio {
  /** A cue by exact name; without one, the cue named after its sheet or the sheet's only file. */
  url(cueSheet: string, cueName?: string): string | undefined;
}

const manifestCacheKey = Symbol.for("moenotes.release-audio.manifests");
const manifestGlobal = globalThis as typeof globalThis & { [manifestCacheKey]?: Map<string, Promise<CueFiles>> };
const manifests = manifestGlobal[manifestCacheKey] ??= new Map();

/** Loads the manifests of the listed cue sheets; sheets missing from the release index resolve to no URL. */
export async function loadReleaseAudio(cueSheets: Iterable<string>, locale: AppLocale, fetcher: typeof fetch = fetch): Promise<ReleaseAudio> {
  const loaded = new Map<string, CueFiles>();
  await Promise.all([...new Set(cueSheets)].map(async (cueSheet) => {
    const key = `Cri/Sound/${cueSheet}`;
    const exportId = Object.hasOwn(sheets, key) ? selectReleaseId(sheets[key], locale) : undefined;
    if (exportId) loaded.set(cueSheet, await loadCueFiles(exportId, fetcher));
  }));

  return {
    url(cueSheet, cueName) {
      const cues = loaded.get(cueSheet);
      if (!cues) return undefined;
      const files = [...new Set(cues.values())];
      const file = cueName ? cues.get(cueName) : cues.get(cueSheet) ?? (files.length === 1 ? files[0] : undefined);
      return file ? releaseFileUrl(file) : undefined;
    },
  };
}

function loadCueFiles(exportId: string, fetcher: typeof fetch): Promise<CueFiles> {
  let request = manifests.get(exportId);
  if (!request) {
    request = fetchReleaseJson<ExportManifest>(releaseExportUrl(exportId), fetcher).then(cueFilesOf);
    // A failed manifest is retried the next time a story or song asks for it.
    request.catch(() => manifests.delete(exportId));
    manifests.set(exportId, request);
  }
  return request;
}

/** A label whose files have different content is ambiguous and is left out rather than guessed. */
function cueFilesOf(manifest: ExportManifest): CueFiles {
  if (!Array.isArray(manifest?.files)) throw new Error("Invalid export manifest");
  const byLabel = new Map<string, { id: string; sha256: string } | null>();
  for (const file of manifest.files) {
    if (file.media_type !== "audio/mp4") continue;
    const seen = byLabel.get(file.label);
    if (seen === undefined) byLabel.set(file.label, file);
    else if (seen && seen.sha256 !== file.sha256) byLabel.set(file.label, null);
  }
  return new Map([...byLabel].flatMap(([label, file]) => (file ? [[label, file.id] as const] : [])));
}
