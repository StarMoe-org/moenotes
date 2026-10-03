import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import type { RawBand } from "@/lib/cards/data";
import { memo, mergedList, table, texts } from "@/lib/masterdata/build-core";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import { normalizeRealLives, type RawRealLiveSchedule, type RealLiveViewModel } from "@/lib/real-lives/data";
import type { ServerFaceted } from "@/lib/servers/facets";

/* MasterRealLiveSchedule per server, merged by id (JP keeps its own JST times as a server variant). */

export function realLivesOn(server: GameServer, locale: AppLocale): Promise<RealLiveViewModel[]> {
  return memo(`real-lives:${server}:${locale}`, async () => {
    const [schedules, bands, textTable] = await Promise.all([
      table<RawRealLiveSchedule>("MasterRealLiveSchedule.json", server).catch(() => ({ _allData: [] as RawRealLiveSchedule[] })),
      table<RawBand>("MasterBand.json", server),
      texts(server),
    ]);
    const textMap = new Map(textTable._allData.map((row) => [row.id, row]));
    const names = new Map(bands._allData.map((band) => [band.id, localizeMasterText(textMap.get(band.nameTextID), locale)]));
    return normalizeRealLives(schedules._allData, (id) => names.get(id));
  });
}

export function getBuildRealLives(locale: AppLocale): Promise<ServerFaceted<RealLiveViewModel>[]> {
  return mergedList(`real-lives:${locale}`, (server) => realLivesOn(server, locale), (live) => live.id);
}
