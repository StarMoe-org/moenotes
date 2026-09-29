import { assetConfig } from "@/config/assets";
import type { MusicData } from "./types";

/** The major version of music-data.json this tool reads; a file of another major version is rejected. */
export const MUSIC_DATA_FORMAT = "nnnotes.music-data/1";

export class MusicDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MusicDataError";
  }
}

/** The chart data file (`assetConfig.chartData`), checked for its format. */
export async function fetchMusicData(signal?: AbortSignal): Promise<MusicData> {
  const response = await fetch(assetConfig.chartData, { signal: signal ?? null, credentials: "omit", headers: { Accept: "application/json" } });
  if (!response.ok) throw new MusicDataError(`music-data.json: HTTP ${response.status}`);
  const data = (await response.json()) as MusicData;
  if (!data || typeof data !== "object" || !Array.isArray(data.songs)) throw new MusicDataError("music-data.json: no songs");
  if (typeof data.format === "string" && data.format !== MUSIC_DATA_FORMAT) throw new MusicDataError(`music-data.json: format ${data.format}`);
  return data;
}
