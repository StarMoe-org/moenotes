import { DEFAULT_LOCALE, LOCALE_PATH_PREFIX, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { buildDynamicPath, findRouteMatch, findRouteById, getAllRoutes, getAllStaticRoutes, isDynamicRoute, resolveRouteStaticParams } from "@/lib/route/registry";
import type { AppRoute, BreadcrumbDetail, RouteMatch, RouteParams } from "@/types/route";
import type { PageMetadata } from "@/lib/seo/metadata";
import { getBuildMasterData } from "@/lib/masterdata/build-snapshot";
import { localizeMasterText, type MasterTextRow } from "@/lib/masterdata/localize-text";
import { normalizeCards, validateMasterTable } from "@/lib/cards/data";
import { normalizeSupportCards } from "@/lib/support-cards/data";

function getStaticMasterData<T>(path: string, options: { validate: (raw: unknown) => T }): Promise<T> {
  return getBuildMasterData(path, options.validate);
}

export interface StaticLocalizedPathProps {
  locale: AppLocale;
  pathname: `/${string}`;
  match: RouteMatch | null;
  routeParams: RouteParams;
  breadcrumbDetail?: BreadcrumbDetail;
  meta?: Partial<PageMetadata>;
}

export interface StaticLocalizedPath {
  params: {
    locale: string;
  };
  props: StaticLocalizedPathProps;
}

function routePathToParam(path: string): string {
  return path.replace(/^\//, "");
}

export async function getStaticLocalizedPaths(): Promise<StaticLocalizedPath[]> {
  const paths: StaticLocalizedPath[] = [];

  for (const route of getAllStaticRoutes().filter((item) => item.path !== "/")) {
    for (const locale of SUPPORTED_LOCALES) {
      const pathname = route.path;
      paths.push(createLocalizedPath(locale, pathname, routePathToParam(pathname)));
    }
  }

  let cardMap: Map<number, Record<AppLocale, string>> | null = null;
  let supportCardMap: Map<number, Record<AppLocale, string>> | null = null;
  let characterMap: Map<number, Record<AppLocale, string>> | null = null;
  let musicMap: Map<number, Record<AppLocale, string>> | null = null;
  let gachaMap: Map<number, Record<AppLocale, string>> | null = null;
  let rewardMap: Map<string, Record<AppLocale, string>> | null = null;
  let storyMap: Map<number, { title: Record<AppLocale, string>; category: "main" | "friendship" | "other" }> | null = null;

  for (const route of getAllRoutes().filter(isDynamicRoute)) {
    const configs = await resolveRouteStaticParams(route);
    for (const config of configs) {
      const pathname = buildDynamicPath(route.pattern ?? route.path, config.params);
      for (const locale of SUPPORTED_LOCALES) {
        let breadcrumbDetail = config.breadcrumbDetail;

        if (route.component === "card-detail") {
          const cardId = Number(config.params.id);
          if (!cardMap) {
            cardMap = new Map();
            try {
              const [cardTable, characterTable, bandTable, textTable] = await Promise.all([
                getStaticMasterData("MasterMemberCard.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterCharacter.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterBand.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterText.json", { validate: validateMasterTable }),
              ]);

              for (const loc of SUPPORTED_LOCALES) {
                const normalized = normalizeCards(
                  (cardTable as any)._allData,
                  (characterTable as any)._allData,
                  (bandTable as any)._allData,
                  (textTable as any)._allData,
                  loc
                );
                normalized.forEach((card) => {
                  if (!cardMap!.has(card.id)) {
                    cardMap!.set(card.id, {} as Record<AppLocale, string>);
                  }
                  cardMap!.get(card.id)![loc] = `${card.characterName} - ${card.title}`;
                });
              }
            } catch (err) {
              console.error("Failed to preload dynamic card breadcrumbs:", err);
            }
          }

          const localizedLabel = cardMap.get(cardId)?.[locale];
          if (localizedLabel) {
            breadcrumbDetail = { label: localizedLabel };
          }
        }

        if (route.component === "support-card-detail") {
          const supportCardId = Number(config.params.id);
          if (!supportCardMap) {
            supportCardMap = new Map();
            try {
              const [cardTable, characterTable, bandTable, textTable] = await Promise.all([
                getStaticMasterData("MasterSupportCard.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterCharacter.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterBand.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterText.json", { validate: validateMasterTable }),
              ]);

              for (const loc of SUPPORTED_LOCALES) {
                const normalized = normalizeSupportCards(
                  (cardTable as any)._allData,
                  (characterTable as any)._allData,
                  (bandTable as any)._allData,
                  (textTable as any)._allData,
                  loc
                );
                normalized.forEach((card) => {
                  if (!supportCardMap!.has(card.id)) {
                    supportCardMap!.set(card.id, {} as Record<AppLocale, string>);
                  }
                  supportCardMap!.get(card.id)![loc] = `${card.name} - ${card.title}`;
                });
              }
            } catch (err) {
              console.error("Failed to preload dynamic support card breadcrumbs:", err);
            }
          }

          const localizedLabel = supportCardMap.get(supportCardId)?.[locale];
          if (localizedLabel) {
            breadcrumbDetail = { label: localizedLabel };
          }
        }

        if (route.component === "character-detail") {
          const characterId = Number(config.params.id);
          if (!characterMap) {
            characterMap = new Map();
            try {
              const [characterTable, textTable] = await Promise.all([
                getStaticMasterData("MasterCharacter.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterText.json", { validate: validateMasterTable }),
              ]);

              const charList = (characterTable as any)._allData;
              const texts = (textTable as any)._allData;
              const textMap = new Map(texts.map((entry: any) => [entry.id, entry]));
              const resolveText = (id: string, loc: AppLocale) => {
                const entry = textMap.get(id) as any;
                if (!entry) return id;
                return localizeMasterText(entry, loc) || id;
              };

              for (const loc of SUPPORTED_LOCALES) {
                charList.forEach((char: any) => {
                  const name = resolveText(char.nameTextID, loc);
                  if (!characterMap!.has(char.id)) {
                    characterMap!.set(char.id, {} as Record<AppLocale, string>);
                  }
                  characterMap!.get(char.id)![loc] = name;
                });
              }
            } catch (err) {
              console.error("Failed to preload dynamic character breadcrumbs:", err);
            }
          }

          const localizedLabel = characterMap.get(characterId)?.[locale];
          if (localizedLabel) {
            breadcrumbDetail = { label: localizedLabel };
          }
        }

        if (route.component === "song-detail") {
          const songId = Number(config.params.id);
          if (!musicMap) {
            musicMap = new Map();
            try {
              const [musicTable, textTable] = await Promise.all([
                getStaticMasterData("MasterLiveMusic.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterText.json", { validate: validateMasterTable }),
              ]);

              const musicList = (musicTable as any)._allData;
              const texts = (textTable as any)._allData;
              const textMap = new Map(texts.map((entry: any) => [entry.id, entry]));
              const resolveText = (id: string, loc: AppLocale) => {
                const entry = textMap.get(id) as any;
                if (!entry) return id;
                return localizeMasterText(entry, loc) || id;
              };

              for (const loc of SUPPORTED_LOCALES) {
                musicList.forEach((song: any) => {
                  const title = resolveText(song.titleTextID, loc);
                  if (!musicMap!.has(song.id)) {
                    musicMap!.set(song.id, {} as Record<AppLocale, string>);
                  }
                  musicMap!.get(song.id)![loc] = title;
                });
              }
            } catch (err) {
              console.error("Failed to preload dynamic song breadcrumbs:", err);
            }
          }

          const localizedLabel = musicMap.get(songId)?.[locale];
          if (localizedLabel) {
            breadcrumbDetail = { label: localizedLabel };
          }
        }

        if (route.component === "gacha-detail") {
          const gachaId = Number(config.params.id);
          if (!gachaMap) {
            gachaMap = new Map();
            try {
              const [gachaTable, textTable] = await Promise.all([
                getStaticMasterData("MasterGacha.json", { validate: validateMasterTable<{ id: number; nameTextId: string }> }),
                getStaticMasterData("MasterText.json", { validate: validateMasterTable<MasterTextRow> }),
              ]);
              const textMap = new Map(textTable._allData.map((entry) => [entry.id, entry]));
              for (const gacha of gachaTable._allData) {
                const labels = {} as Record<AppLocale, string>;
                for (const loc of SUPPORTED_LOCALES) {
                  labels[loc] = localizeMasterText(textMap.get(gacha.nameTextId), loc) || `#${gacha.id}`;
                }
                gachaMap.set(gacha.id, labels);
              }
            } catch (err) {
              console.error("Failed to preload dynamic gacha breadcrumbs:", err);
            }
          }

          const localizedLabel = gachaMap.get(gachaId)?.[locale];
          if (localizedLabel) {
            breadcrumbDetail = { label: localizedLabel };
          }
        }

        if (route.component === "reward-detail") {
          if (!rewardMap) {
            rewardMap = new Map();
            try {
              const { rewardEntrySlug } = await import("@/lib/rewards/data");
              const nameTable = (file: string) => getStaticMasterData(file, { validate: validateMasterTable<{ id: number; nameTextId?: string; nameTextID?: string }> });
              const [passTable, missionTable, loginTable, textTable] = await Promise.all([
                nameTable("MasterSeasonPass.json"),
                nameTable("MasterLimitedMissionGroup.json"),
                nameTable("MasterLoginBonus.json"),
                getStaticMasterData("MasterText.json", { validate: validateMasterTable<MasterTextRow> }),
              ]);
              const textMap = new Map(textTable._allData.map((entry) => [entry.id, entry]));
              const sources = [["seasonPass", passTable], ["mission", missionTable], ["loginBonus", loginTable]] as const;
              for (const [kind, table] of sources) {
                for (const row of table._allData) {
                  const labels = {} as Record<AppLocale, string>;
                  for (const loc of SUPPORTED_LOCALES) {
                    labels[loc] = localizeMasterText(textMap.get(row.nameTextId ?? row.nameTextID ?? ""), loc) || `#${row.id}`;
                  }
                  rewardMap.set(rewardEntrySlug(kind, row.id), labels);
                }
              }
            } catch (err) {
              console.error("Failed to preload dynamic reward breadcrumbs:", err);
            }
          }

          const localizedLabel = rewardMap.get(config.params.id ?? "")?.[locale];
          if (localizedLabel) {
            breadcrumbDetail = { label: localizedLabel };
          }
        }

        if (route.component === "story-detail") {
          const advId = Number(config.params.id);
          if (!storyMap) {
            storyMap = new Map();
            try {
              const [advTable, textTable, episodeTable, friendshipEpisodeTable] = await Promise.all([
                getStaticMasterData("MasterAdv.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterText.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterStoryEpisode.json", { validate: validateMasterTable }),
                getStaticMasterData("MasterStoryFriendshipEpisode.json", { validate: validateMasterTable }),
              ]);

              const advList = (advTable as any)._allData;
              const texts = (textTable as any)._allData;
              const episodes = (episodeTable as any)._allData;
              const friendshipEpisodes = (friendshipEpisodeTable as any)._allData;

              const textMap = new Map(texts.map((entry: any) => [entry.id, entry]));
              const resolveText = (id: string, loc: AppLocale) => {
                const entry = textMap.get(id) as any;
                if (!entry) return id;
                return localizeMasterText(entry, loc) || id;
              };

              advList.forEach((adv: any) => {
                const titleLoc: Record<AppLocale, string> = {} as any;
                for (const loc of SUPPORTED_LOCALES) {
                  titleLoc[loc] = resolveText(adv.titleTextId, loc);
                }
                const isMain = episodes.some((ep: any) => ep.advId === adv.id);
                const isFriendship = friendshipEpisodes.some((ep: any) => ep.advId === adv.id);
                const category = isMain ? "main" : (isFriendship ? "friendship" : "other");
                
                storyMap!.set(adv.id, { title: titleLoc, category });
              });
            } catch (err) {
              console.error("Failed to preload dynamic story breadcrumbs:", err);
            }
          }

          const storyInfo = storyMap.get(advId);
          if (storyInfo) {
            const localizedLabel = storyInfo.title[locale];
            const storyRoute = findRouteById("story");
            const categoryRouteId = storyInfo.category === "main" ? "main-story" : (storyInfo.category === "friendship" ? "friendship-story" : "other-story");
            const categoryRoute = findRouteById(categoryRouteId);
            breadcrumbDetail = {
              label: localizedLabel,
              ancestors: [storyRoute, categoryRoute].filter(Boolean) as AppRoute[],
            };
          }
        }

        paths.push(createLocalizedPath(locale, pathname, routePathToParam(pathname), config.params, breadcrumbDetail, config.meta));
      }
    }
  }

  for (const locale of SUPPORTED_LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    paths.push(createLocalizedPath(locale, "/", ""));
  }

  return paths;
}

export function getLocalePrefix(locale: AppLocale): string {
  return LOCALE_PATH_PREFIX[locale];
}

function createLocalizedPath(
  locale: AppLocale,
  pathname: `/${string}`,
  routeParam: string,
  routeParams: RouteParams = {},
  breadcrumbDetail?: BreadcrumbDetail,
  meta?: Partial<PageMetadata>,
): StaticLocalizedPath {
  const prefix = LOCALE_PATH_PREFIX[locale];
  const localizedParam = locale === DEFAULT_LOCALE
    ? routeParam
    : [prefix, routeParam].filter(Boolean).join("/");

  return {
    params: { locale: localizedParam },
    props: {
      locale,
      pathname,
      match: findRouteMatch(pathname),
      routeParams,
      ...(breadcrumbDetail ? { breadcrumbDetail } : {}),
      ...(meta ? { meta } : {}),
    },
  };
}
