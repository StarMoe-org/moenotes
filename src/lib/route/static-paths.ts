import { DEFAULT_LOCALE, LOCALE_PATH_PREFIX, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { buildDynamicPath, findRouteMatch, getAllRoutes, getAllStaticRoutes, isDynamicRoute } from "@/lib/route/registry";
import type { AppRoute, BreadcrumbDetail, RouteMatch, RouteParams, RouteStaticParamConfig } from "@/types/route";
import type { PageMetadata } from "@/lib/seo/metadata";
import { fetchMasterData } from "@/lib/masterdata/client";
import { normalizeCards, validateMasterTable } from "@/lib/cards/data";
import { normalizeSupportCards } from "@/lib/support-cards/data";

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

  for (const route of getAllRoutes().filter(isDynamicRoute)) {
    const configs = await resolveStaticParams(route.staticParams);
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
                fetchMasterData("MasterMemberCard.json", { validate: validateMasterTable }),
                fetchMasterData("MasterCharacter.json", { validate: validateMasterTable }),
                fetchMasterData("MasterBand.json", { validate: validateMasterTable }),
                fetchMasterData("MasterText.json", { validate: validateMasterTable }),
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
                fetchMasterData("MasterSupportCard.json", { validate: validateMasterTable }),
                fetchMasterData("MasterCharacter.json", { validate: validateMasterTable }),
                fetchMasterData("MasterBand.json", { validate: validateMasterTable }),
                fetchMasterData("MasterText.json", { validate: validateMasterTable }),
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
                fetchMasterData("MasterCharacter.json", { validate: validateMasterTable }),
                fetchMasterData("MasterText.json", { validate: validateMasterTable }),
              ]);

              const charList = (characterTable as any)._allData;
              const texts = (textTable as any)._allData;
              const textMap = new Map(texts.map((entry: any) => [entry.id, entry]));
              const resolveText = (id: string, loc: AppLocale) => {
                const entry = textMap.get(id) as any;
                if (!entry) return id;
                if (loc === "zh-CN") return entry.simplifiedChinese || entry.traditionalChinese || entry.japanese || entry.english;
                if (loc === "en-US") return entry.english || entry.japanese;
                return entry.japanese || entry.english;
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
                fetchMasterData("MasterLiveMusic.json", { validate: validateMasterTable }),
                fetchMasterData("MasterText.json", { validate: validateMasterTable }),
              ]);

              const musicList = (musicTable as any)._allData;
              const texts = (textTable as any)._allData;
              const textMap = new Map(texts.map((entry: any) => [entry.id, entry]));
              const resolveText = (id: string, loc: AppLocale) => {
                const entry = textMap.get(id) as any;
                if (!entry) return id;
                if (loc === "zh-CN") return entry.simplifiedChinese || entry.traditionalChinese || entry.japanese || entry.english;
                if (loc === "en-US") return entry.english || entry.japanese;
                return entry.japanese || entry.english;
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

async function resolveStaticParams(staticParams: AppRoute["staticParams"]): Promise<readonly RouteStaticParamConfig[]> {
  if (!staticParams) return [];
  if (typeof staticParams === "function") return await staticParams();
  return staticParams;
}
