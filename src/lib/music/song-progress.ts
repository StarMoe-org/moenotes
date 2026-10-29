import type { GameServer } from "@/config/servers";
import { openLinkedGameSave } from "@/lib/box/game-save-source";
import { readLocalBox } from "@/lib/box/store";
import { isMusicDifficulty, MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";
import { safeGetLocalStorage, safeRemoveLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

export type SongProgressStatus = 0 | 1 | 2 | 3;

export type SongProgressFilter = "all" | "notCleared" | "unfc" | "unap" | "fcPlus" | "ap";

export type SongProgressMap = Record<string, SongProgressStatus>;

export interface SongProgressChart {
  key: string;
  songId: number;
  difficulty: MusicDifficulty;
  playLevel: number;
  noteCount: number;
}

export interface SongProgressSummary {
  total: number;
  notCleared: number;
  clearedOnly: number;
  fullComboOnly: number;
  allPerfect: number;
  clearedOrBetter: number;
  fullComboOrBetter: number;
}

export interface SongProgressLevelBucket extends SongProgressSummary {
  level: number;
}

const STORAGE_PREFIX = "moenotes.songProgress.v1.";

const NUMERIC_DIFFICULTY: Record<number, MusicDifficulty> = {
  0: "easy",
  1: "normal",
  2: "hard",
  3: "expert",
};

const NAMED_DIFFICULTY: Record<string, MusicDifficulty> = {
  easy: "easy",
  normal: "normal",
  hard: "hard",
  expert: "expert",
  "1": "easy",
  "2": "normal",
  "3": "hard",
  "4": "expert",
};

export function isSongProgressStatus(value: unknown): value is SongProgressStatus {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

export function songProgressKey(songId: number, difficulty: MusicDifficulty): string {
  return `${songId}:${difficulty}`;
}

export function cycleSongProgressStatus(current: SongProgressStatus): SongProgressStatus {
  return ((current + 1) % 4) as SongProgressStatus;
}

export function matchesProgressFilter(status: SongProgressStatus, filter: SongProgressFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "notCleared":
      return status === 0;
    case "unfc":
      return status < 2;
    case "unap":
      return status < 3;
    case "fcPlus":
      return status >= 2;
    case "ap":
      return status === 3;
  }
}

export function computeProgressSummary(
  charts: readonly SongProgressChart[],
  statusOf: (key: string) => SongProgressStatus,
): SongProgressSummary {
  let notCleared = 0;
  let clearedOnly = 0;
  let fullComboOnly = 0;
  let allPerfect = 0;
  for (const chart of charts) {
    const status = statusOf(chart.key);
    if (status === 3) allPerfect++;
    else if (status === 2) fullComboOnly++;
    else if (status === 1) clearedOnly++;
    else notCleared++;
  }
  const fullComboOrBetter = fullComboOnly + allPerfect;
  const clearedOrBetter = clearedOnly + fullComboOrBetter;
  return {
    total: charts.length,
    notCleared,
    clearedOnly,
    fullComboOnly,
    allPerfect,
    clearedOrBetter,
    fullComboOrBetter,
  };
}

export function computeLevelBreakdown(
  charts: readonly SongProgressChart[],
  statusOf: (key: string) => SongProgressStatus,
): SongProgressLevelBucket[] {
  const byLevel = new Map<number, SongProgressChart[]>();
  for (const chart of charts) {
    const bucket = byLevel.get(chart.playLevel);
    if (bucket) bucket.push(chart);
    else byLevel.set(chart.playLevel, [chart]);
  }
  return [...byLevel.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([level, rows]) => ({
      level,
      ...computeProgressSummary(rows, statusOf),
    }));
}

function normalizeParsedKey(rawKey: string): string | null {
  const direct = /^([1-9][0-9]*):(easy|normal|hard|expert)$/.exec(rawKey);
  if (direct) return `${direct[1]}:${direct[2]}`;
  // Compatible with Haneoka Box keys: `l.<songId>.<0..3>`
  const haneoka = /^l\.([1-9][0-9]*)\.([0-3])$/.exec(rawKey);
  if (haneoka) {
    const diff = NUMERIC_DIFFICULTY[Number(haneoka[2])];
    return diff ? `${haneoka[1]}:${diff}` : null;
  }
  return null;
}

function coerceStatus(raw: unknown): SongProgressStatus | null {
  if (isSongProgressStatus(raw)) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const inner = (raw as Record<string, unknown>).v ?? (raw as Record<string, unknown>).status;
    if (isSongProgressStatus(inner)) return inner;
  }
  return null;
}

/** Parses either a moenotes song-progress JSON export or a Haneoka Box replica/export JSON. */
export function parseImportedProgressJson(text: string): SongProgressMap {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid song progress JSON");
  }
  const root = parsed as Record<string, unknown>;
  const source =
    root.entries && typeof root.entries === "object" && !Array.isArray(root.entries)
      ? (root.entries as Record<string, unknown>)
      : root;
  const out: SongProgressMap = {};
  for (const [rawKey, rawVal] of Object.entries(source)) {
    const key = normalizeParsedKey(rawKey);
    const status = coerceStatus(rawVal);
    if (key && status !== null && status > 0) {
      out[key] = status;
    }
  }
  return out;
}

export function serializeProgressExport(server: GameServer, entries: SongProgressMap): string {
  const compact: SongProgressMap = {};
  for (const [key, value] of Object.entries(entries)) {
    if (isSongProgressStatus(value) && value > 0) compact[key] = value;
  }
  return JSON.stringify(
    {
      schema: "moenotes-song-progress-v1",
      server,
      exportedAt: new Date().toISOString(),
      entries: compact,
    },
    null,
    2,
  );
}

/** Extracts per-chart clear / FC / AP records from a raw `_player` game save JSON if present. */
export function extractSaveSongProgress(saveText: string): SongProgressMap {
  let root: unknown;
  try {
    root = JSON.parse(saveText);
  } catch {
    return {};
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) return {};
  const player = (
    "_player" in (root as Record<string, unknown>) && typeof (root as Record<string, unknown>)._player === "object"
      ? (root as Record<string, unknown>)._player
      : root
  ) as Record<string, unknown> | null;
  if (!player || typeof player !== "object") return {};

  const out: SongProgressMap = {};
  const put = (songId: number, diff: MusicDifficulty, status: SongProgressStatus) => {
    if (!Number.isInteger(songId) || songId <= 0 || status <= 0) return;
    const key = songProgressKey(songId, diff);
    const prev = out[key] ?? 0;
    if (status > prev) out[key] = status;
  };

  const resolveDiff = (raw: unknown): MusicDifficulty | null => {
    if (typeof raw === "number") {
      if (raw >= 0 && raw <= 3) return NUMERIC_DIFFICULTY[raw] ?? null;
      if (raw >= 1 && raw <= 4) return MUSIC_DIFFICULTIES[raw - 1] ?? null;
    }
    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      return NAMED_DIFFICULTY[normalized] ?? (isMusicDifficulty(normalized) ? normalized : null);
    }
    return null;
  };

  const inferRowStatus = (row: Record<string, unknown>): SongProgressStatus => {
    const ap =
      row._isAllPerfect === true
      || row.isAllPerfect === true
      || Number(row._allPerfectCount ?? row.allPerfectCount ?? 0) > 0
      || Number(row._comboRank ?? row.comboRank ?? 0) >= 2;
    if (ap) return 3;
    const fc =
      row._isFullCombo === true
      || row.isFullCombo === true
      || Number(row._fullComboCount ?? row.fullComboCount ?? 0) > 0
      || Number(row._comboRank ?? row.comboRank ?? 0) === 1;
    if (fc) return 2;
    const cleared =
      row._isCleared === true
      || row.isCleared === true
      || Number(row._clearCount ?? row.clearCount ?? 0) > 0
      || Number(row._highScore ?? row.highScore ?? 0) > 0;
    return cleared ? 1 : 0;
  };

  const listCandidates = [
    player._liveMusics,
    player._liveMusicResults,
    player._liveResults,
    player._musicClearInfos,
    player._musicResults,
  ];
  for (const list of listCandidates) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      const songId = Number(row._liveMusicId ?? row._musicId ?? row._masterId ?? row._id ?? 0);
      if (!songId) continue;
      const subList = row._difficulties ?? row._results ?? row._scores;
      if (Array.isArray(subList)) {
        subList.forEach((sub, idx) => {
          if (!sub || typeof sub !== "object" || Array.isArray(sub)) return;
          const subRow = sub as Record<string, unknown>;
          const diff = resolveDiff(subRow._difficulty ?? subRow._liveDifficulty ?? idx);
          if (diff) put(songId, diff, inferRowStatus(subRow));
        });
      } else {
        const diff = resolveDiff(row._difficulty ?? row._liveDifficulty);
        if (diff) put(songId, diff, inferRowStatus(row));
      }
    }
  }
  return out;
}

export function readLocalSongProgress(server: GameServer): SongProgressMap {
  const raw = safeGetLocalStorage(`${STORAGE_PREFIX}${server}`);
  if (!raw) return {};
  try {
    return parseImportedProgressJson(raw);
  } catch {
    return {};
  }
}

export function writeLocalSongProgress(server: GameServer, entries: SongProgressMap): void {
  const compact: SongProgressMap = {};
  for (const [key, status] of Object.entries(entries)) {
    if (isSongProgressStatus(status) && status > 0) compact[key] = status;
  }
  if (Object.keys(compact).length === 0) {
    safeRemoveLocalStorage(`${STORAGE_PREFIX}${server}`);
    return;
  }
  safeSetLocalStorage(`${STORAGE_PREFIX}${server}`, JSON.stringify(compact));
}

export function clearLocalSongProgress(server: GameServer): void {
  safeRemoveLocalStorage(`${STORAGE_PREFIX}${server}`);
}

export async function loadLinkedSaveSongProgress(server: GameServer): Promise<{
  linked: boolean;
  entries: SongProgressMap;
}> {
  try {
    const box = await readLocalBox(server);
    if (!box?.save) return { linked: false, entries: {} };
    const loaded = await openLinkedGameSave(box.save);
    if (loaded.status !== "ready") return { linked: true, entries: {} };
    return {
      linked: true,
      entries: extractSaveSongProgress(loaded.save.text),
    };
  } catch {
    return { linked: false, entries: {} };
  }
}
