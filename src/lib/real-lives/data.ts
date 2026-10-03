import type { ScheduleStatus } from "@/lib/schedule";
import { parseMasterDate, scheduleStatus } from "@/lib/schedule";

/** MasterRealLiveSchedule: the bands' real-world concerts the game shows (and opens a lobby for from `readyAt`). */
export interface RawRealLiveSchedule {
  id: number;
  bandIds: number[];
  readyAt: string;
  startAt: string;
  endAt: string;
}

export interface RealLiveViewModel {
  id: number;
  bands: Array<{ id: number; name: string }>;
  /** When the in-game lobby opens, before the live starts. */
  readyAt: string;
  startAt: string;
  endAt: string;
  searchText: string;
}

/**
 * Every scheduled real live, earliest start first (a missing start sorts last). Bands the server does not know keep
 * their id with an empty name; schedules without any band are left out.
 */
export function normalizeRealLives(rows: readonly RawRealLiveSchedule[], bandName: (id: number) => string | undefined): RealLiveViewModel[] {
  return rows
    .filter((row) => Number.isSafeInteger(row.id) && row.id > 0 && (row.bandIds ?? []).length > 0)
    .map((row) => {
      const bands = (row.bandIds ?? []).map((id) => ({ id, name: bandName(id) ?? "" }));
      const clean = (value: string | undefined) => (value && value !== "null" ? value : "");
      return {
        id: row.id,
        bands,
        readyAt: clean(row.readyAt),
        startAt: clean(row.startAt),
        endAt: clean(row.endAt),
        searchText: [...bands.map((band) => band.name), row.id].join(" ").toLocaleLowerCase(),
      };
    })
    .sort((a, b) => (parseMasterDate(a.startAt) ?? Infinity) - (parseMasterDate(b.startAt) ?? Infinity) || a.id - b.id);
}

/** A real live's status, with "ready" while the lobby is open before the start. */
export type RealLiveStatus = ScheduleStatus | "ready";

export function realLiveStatus(live: Pick<RealLiveViewModel, "readyAt" | "startAt" | "endAt">, now: number): RealLiveStatus {
  const status = scheduleStatus(live.startAt, live.endAt, now);
  const ready = parseMasterDate(live.readyAt);
  return status === "upcoming" && ready !== null && now >= ready ? "ready" : status;
}
