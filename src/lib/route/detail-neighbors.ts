/** One side of a detail page's previous/next links. `href` is locale-free (entityLinkPath / buildDynamicPath). */
export interface DetailNeighbor {
  href: string;
  title: string;
}

export interface DetailNeighbors {
  previous?: DetailNeighbor;
  next?: DetailNeighbor;
}

/**
 * Previous/next entries for every id of a list, in the list's own (default) order. Run at build time; hand each detail
 * page its entry as props. Ids repeated in the list keep their first position.
 */
export function detailNeighbors<T, K extends string | number>(
  list: readonly T[],
  idOf: (item: T) => K,
  titleOf: (item: T) => string,
  hrefOf: (item: T) => string,
): Map<K, DetailNeighbors> {
  const seen = new Set<K>();
  const unique = list.filter((item) => {
    const id = idOf(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const link = (item: T | undefined): DetailNeighbor | undefined => (item === undefined ? undefined : { href: hrefOf(item), title: titleOf(item) });
  const result = new Map<K, DetailNeighbors>();
  unique.forEach((item, index) => {
    const previous = link(unique[index - 1]);
    const next = link(unique[index + 1]);
    result.set(idOf(item), { ...(previous ? { previous } : {}), ...(next ? { next } : {}) });
  });
  return result;
}
