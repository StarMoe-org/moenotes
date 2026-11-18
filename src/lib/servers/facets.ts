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

function isPlainObject(value: unknown): value is Row {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (
      (typeof a === "string" || typeof a === "boolean" || (typeof a === "number" && Number.isFinite(a)) || a === null) &&
      (typeof b === "string" || typeof b === "boolean" || (typeof b === "number" && Number.isFinite(b)) || b === null)
    ) {
      return false;
    }
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (typeof (a as { toJSON?: unknown }).toJSON === "function" || typeof (b as { toJSON?: unknown }).toJSON === "function") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      const av = a[i];
      const bv = b[i];
      if (av === undefined || bv === undefined || typeof av === "symbol" || typeof bv === "symbol" || typeof av === "function" || typeof bv === "function") {
        return JSON.stringify(a) === JSON.stringify(b);
      }
      if (!jsonEqual(av, bv)) return false;
    }
    return true;
  }
  if (!isPlainObject(a) || !isPlainObject(b)) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  for (let i = 0; i < keysA.length; i += 1) {
    const key = keysA[i]!;
    if (key !== keysB[i]) {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    const av = a[key];
    const bv = b[key];
    if (av === undefined || bv === undefined || typeof av === "symbol" || typeof bv === "symbol" || typeof av === "function" || typeof bv === "function") {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    if (!jsonEqual(av, bv)) return false;
  }
  return true;
}

/** Top-level fields of `other` that differ from `base` (JSON equality: view models are plain data). */
function changedFields<T>(base: T, other: T): Partial<T> | null {
  const a = base as Row;
  const b = other as Row;
  let changed: Row | null = null;
  for (const key of Object.keys(b)) {
    // A field another server leaves out cannot be told apart from an unchanged one once serialized.
    const bv = b[key];
    if (bv === undefined) continue;
    if (!jsonEqual(a[key], bv)) (changed ??= {})[key] = bv;
  }
  return changed as Partial<T> | null;
}

interface OrderNode<T> {
  value: ServerFaceted<T>;
  next: OrderNode<T> | null;
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
  const merged = new Map<string, OrderNode<T>>();
  const sentinel: { next: OrderNode<T> | null } = { next: null };
  for (const [server, items] of lists) {
    const seen = new Map<string, number>();
    let previous: { next: OrderNode<T> | null } = sentinel;
    for (const item of items) {
      const id = String(idOf(item));
      const occurrence = seen.get(id) ?? 0;
      seen.set(id, occurrence + 1);
      const key = occurrence ? `${id}#${occurrence}` : id;
      const existing = merged.get(key);
      if (existing) {
        existing.value.servers.push(server);
        const changed = changedFields(existing.value, item);
        if (changed) (existing.value.serverVariants ??= {})[server] = changed;
        previous = existing;
        continue;
      }
      const node: OrderNode<T> = { value: { ...item, servers: [server] }, next: previous.next };
      previous.next = node;
      merged.set(key, node);
      previous = node;
    }
  }
  const result: ServerFaceted<T>[] = [];
  for (let node = sentinel.next; node !== null; node = node.next) {
    result.push(node.value);
  }
  return result;
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

/** Restrict a merged entity to approved regions, promoting the first approved region to the serialized base value. */
export function restrictFacetServers<T>(entity: ServerFaceted<T>, allowed: readonly GameServer[]): ServerFaceted<T> | null {
  const servers = entity.servers.filter((server) => allowed.includes(server));
  const firstServer = servers[0];
  if (!firstServer) return null;
  const first = forServer(entity, firstServer) as T & { servers?: GameServer[]; serverVariants?: ServerVariants<T> };
  const { servers: _servers, serverVariants: _variants, ...base } = first;
  const serverVariants: ServerVariants<T> = {};
  for (const server of servers.slice(1)) {
    const resolved = forServer(entity, server) as T & { servers?: GameServer[]; serverVariants?: ServerVariants<T> };
    const { servers: _serverList, serverVariants: _serverVariants, ...other } = resolved;
    const changed = changedFields(base as T, other as T);
    if (changed) serverVariants[server] = changed;
  }
  return {
    ...(base as T),
    servers,
    ...(Object.keys(serverVariants).length > 0 ? { serverVariants } : {}),
  };
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
