import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { PRIMARY_SERVER, type GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { serverAssetUrl } from "@/lib/assets/release";
import { defaultGameServer, resolveGameServer } from "@/lib/game-api/server";
import { listForServer, missingServers, type ServerFaceted } from "@/lib/servers/facets";
import { useSettings } from "@/lib/settings/use-settings";
import type { GameServerSetting } from "@/types/settings";

/**
 * The server a content page's static HTML shows: the locale's usual server when the build has it, else the primary
 * server. Most readers keep the `auto` setting, so their page does not change once it has loaded.
 */
export function bakedContentServer(locale: AppLocale, servers: readonly GameServer[]): GameServer {
  const usual = defaultGameServer(locale);
  if (servers.includes(usual)) return usual;
  return servers.includes(PRIMARY_SERVER) ? PRIMARY_SERVER : servers[0] ?? PRIMARY_SERVER;
}

/** The server the setting stands for, among the build's servers (a server not built yet shows the baked one). */
export function resolveContentServer(setting: GameServerSetting, locale: AppLocale, servers: readonly GameServer[]): GameServer {
  const wanted = resolveGameServer(setting, locale);
  return servers.includes(wanted) ? wanted : bakedContentServer(locale, servers);
}

/**
 * The server a content page shows among `servers` (the build's, see getBuildServers): the baked one while the page
 * hydrates, then the reader's server setting. Picking a server changes the setting, so every content page follows.
 */
export function useContentServer(locale: AppLocale, servers: readonly GameServer[]): [GameServer, (server: GameServer) => void] {
  const { settings, updateSettings } = useSettings();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const server = hydrated ? resolveContentServer(settings.gameServer, locale, servers) : bakedContentServer(locale, servers);
  const pick = useCallback((next: GameServer) => {
    updateSettings({ gameServer: next });
  }, [updateSettings]);
  return [server, pick];
}

/** A merged list as the page's server has it. */
export function useServerList<T>(locale: AppLocale, servers: readonly GameServer[], entities: readonly ServerFaceted<T>[]) {
  const [server, pickServer] = useContentServer(locale, servers);
  const items = useMemo(() => listForServer(entities, server), [entities, server]);
  return { server, pickServer, items };
}

interface ContentServerScope {
  /** The server whose files the content below shows. */
  server: GameServer;
  /** Every server of the build. */
  servers: readonly GameServer[];
}

const ContentServerContext = createContext<ContentServerScope>({ server: PRIMARY_SERVER, servers: [PRIMARY_SERVER] });

/** The content below comes from `server` (its asset catalog); `servers` are the build's. */
export function ContentServerProvider({ server, servers, children }: ContentServerScope & { children?: ReactNode }) {
  const value = useMemo(() => ({ server, servers }), [server, servers]);
  return createElement(ContentServerContext.Provider, { value }, children);
}

export function useContentServerScope(): ContentServerScope {
  return useContext(ContentServerContext);
}

/** Moves server-neutral release URLs to `server`'s catalog (for a component that provides the scope itself). */
export function useServerAssetUrl(server: GameServer): (url: string | undefined | null) => string {
  return useCallback((url) => (url ? serverAssetUrl(url, server) : ""), [server]);
}

/** Entities whose file URL fields (view models carry the server-neutral form) point into `server`'s catalog. */
export function useServerFiles<T, K extends keyof T>(items: readonly T[], server: GameServer, fields: readonly K[]): T[] {
  return useMemo(() => items.map((item) => {
    const moved = { ...item };
    for (const field of fields) {
      const value = item[field];
      if (typeof value === "string") moved[field] = serverAssetUrl(value, server) as T[K];
    }
    return moved;
  }), [items, server, fields]);
}

/** Moves a server-neutral release URL (the helpers' and view models' form) to the surrounding server's catalog. */
export function useAssetUrl(): (url: string | undefined | null) => string {
  const { server } = useContentServerScope();
  return useCallback((url) => (url ? serverAssetUrl(url, server) : ""), [server]);
}

/** Names servers in the locale's list style: "JP", "JP and KR". */
export function serverList(locale: AppLocale, servers: readonly GameServer[], form: "short" | "names" = "short"): string {
  const names = servers.map((server) => t(locale, `gameServer.${form}.${server}`));
  try {
    return new Intl.ListFormat(locale, { style: "narrow", type: "conjunction" }).format(names);
  } catch {
    return names.join(" / ");
  }
}

/**
 * "JP only"-style label of a merged entity (ServerFaceted) some of the build's servers lack, else undefined. Takes any
 * view model, since list helpers pass merged entities on under their plain type.
 */
export function serverOnlyLabel(locale: AppLocale, entity: object | null | undefined, servers: readonly GameServer[]): string | undefined {
  const entityServers = (entity as { servers?: unknown } | null | undefined)?.servers;
  if (!Array.isArray(entityServers) || !entityServers.length) return undefined;
  const available = servers.filter((server) => entityServers.includes(server));
  if (!available.length || !missingServers({ servers: available }, servers).length) return undefined;
  return t(locale, "gameServer.onlyOn", { servers: serverList(locale, available) });
}

/** serverOnlyLabel for the surrounding scope's servers. */
export function useServerOnlyLabel(locale: AppLocale): (entity: object | null | undefined) => string | undefined {
  const { servers } = useContentServerScope();
  return useCallback((entity) => serverOnlyLabel(locale, entity, servers), [locale, servers]);
}
