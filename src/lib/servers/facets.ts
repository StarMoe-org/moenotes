import { PRIMARY_SERVER, type GameServer } from "@/config/servers";

/**
 * The merged catalog: one entity for every server that has it (docs/servers.md). The build computes each server's
 * view model from its own MasterData and merges them by id; the first server that has the entity supplies the base,
 * and a server whose view differs keeps only the top-level fields it sets differently (its release dates, say).
 */
export type ServerVariants<T> = Partial<Record<GameServer, Partial<T>>>;

export type ServerFaceted<T> = T & {
  /** Servers whose MasterData has the entity, in switcher order; the first supplied the base fields. */
  servers: GameServer[];
  /** Fields another server sets differently; absent when every server agrees. */
  serverVariants?: ServerVariants<T>;
};

/** One value per server, for a detail page or the home page. */
export interface ServerFacetedValue<T> {
  value: T;
  servers: GameServer[];
  serverVariants?: ServerVariants<T>;
}

type Row = Record<string, unknown>;

/** Top-level fields of `other` that differ from `base` (JSON equality: view models are plain data). */
function changedFields<T>(base: T, other: T): Partial<T> | null {
  const a = base as Row;
  const b = other as Row;
  let changed: Row | null = null;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    // A field another server leaves out cannot be told apart from an unchanged one once serialized.
    if (b[key] === undefined) continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) (changed ??= {})[key] = b[key];
  }
  return changed as Partial<T> | null;
}

/**
 * Merge per-server lists (in the order given, primary server first) by id. The result follows the first list; an
 * entity only later servers have comes right after the entity preceding it there. Ids repeated within one list are
 * paired by occurrence.
 */
export function mergeServerLists<T>(
  lists: ReadonlyArray<readonly [GameServer, readonly T[]]>,
  idOf: (item: T) => string | number,
): ServerFaceted<T>[] {
  const merged = new Map<string, ServerFaceted<T>>();
  const order: string[] = [];
  for (const [server, items] of lists) {
    const seen = new Map<string, number>();
    let previous = -1;
    for (const item of items) {
      const id = String(idOf(item));
      const occurrence = seen.get(id) ?? 0;
      seen.set(id, occurrence + 1);
      const key = occurrence ? `${id}#${occurrence}` : id;
      const entry = merged.get(key);
      if (entry) {
        entry.servers.push(server);
        const changed = changedFields(entry, item);
        if (changed) (entry.serverVariants ??= {})[server] = changed;
        previous = order.indexOf(key);
        continue;
      }
      merged.set(key, { ...item, servers: [server] });
      order.splice(previous + 1, 0, key);
      previous += 1;
    }
  }
  return order.map((key) => merged.get(key)!);
}

/** Merge one value per server; servers without one (null) do not have it. Null when no server has it. */
export function mergeServerValues<T>(values: ReadonlyArray<readonly [GameServer, T | null | undefined]>): ServerFacetedValue<T> | null {
  let merged: ServerFacetedValue<T> | null = null;
  for (const [server, value] of values) {
    if (value === null || value === undefined) continue;
    if (!merged) {
      merged = { value, servers: [server] };
      continue;
    }
    merged.servers.push(server);
    const changed = changedFields(merged.value, value);
    if (changed) (merged.serverVariants ??= {})[server] = changed;
  }
  return merged;
}

/** The server whose data and files an entity shows when the reader picked `server`: that one, or its first. */
export function entityServer(entity: { servers: readonly GameServer[] } | null | undefined, server: GameServer): GameServer {
  if (!entity?.servers.length || entity.servers.includes(server)) return server;
  return entity.servers[0] ?? PRIMARY_SERVER;
}

/** The entity as `server` has it (its base where that server does not have it). */
export function forServer<T>(entity: ServerFaceted<T>, server: GameServer): ServerFaceted<T> {
  const variant = entity.serverVariants?.[entityServer(entity, server)];
  return variant ? { ...entity, ...variant } : entity;
}

/** The value as `server` has it. */
export function valueForServer<T>(faceted: ServerFacetedValue<T>, server: GameServer): T {
  const variant = faceted.serverVariants?.[entityServer(faceted, server)];
  return variant ? { ...faceted.value, ...variant } : faceted.value;
}

/** Some fields of a value as their own faceted value, so that one page can hand parts of it to several islands. */
export function pickFacet<T extends object, K extends keyof T>(faceted: ServerFacetedValue<T>, keys: readonly K[]): ServerFacetedValue<Pick<T, K>> {
  const pick = (value: Partial<T>): Partial<Pick<T, K>> => Object.fromEntries(keys.filter((key) => key in value).map((key) => [key, value[key]])) as Partial<Pick<T, K>>;
  const variants = Object.entries(faceted.serverVariants ?? {}).flatMap(([server, variant]) => {
    const picked = pick(variant as Partial<T>);
    return Object.keys(picked).length ? [[server, picked] as const] : [];
  });
  return {
    value: pick(faceted.value) as Pick<T, K>,
    servers: faceted.servers,
    ...(variants.length ? { serverVariants: Object.fromEntries(variants) as ServerVariants<Pick<T, K>> } : {}),
  };
}

/** Entities `server` has, as it has them. */
export function listForServer<T>(entities: readonly ServerFaceted<T>[], server: GameServer): ServerFaceted<T>[] {
  return entities.filter((entity) => entity.servers.includes(server)).map((entity) => forServer(entity, server));
}

/** Servers in this build that lack the entity (for an "only on …" note), or none when every server has it. */
export function missingServers(entity: { servers: readonly GameServer[] }, buildServers: readonly GameServer[]): GameServer[] {
  return buildServers.filter((server) => !entity.servers.includes(server));
}
