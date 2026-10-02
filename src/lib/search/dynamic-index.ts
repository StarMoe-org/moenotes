import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { ContentSearchEntry } from "@/lib/search/content-index";

export interface DynamicSearchItem {
  id: string | number;
  kind: string;
  title: string;
  subtitle?: string;
  href: string;
  keywords?: string[];
}

export interface DynamicSearchProvider {
  id: string;
  load: () => Promise<DynamicSearchItem[]>;
}

interface SearchIndexPayload {
  entries?: ContentSearchEntry[];
}

let indexPromise: Promise<ContentSearchEntry[]> | null = null;

/**
 * The content search index, fetched once per page load and cached; the deploy server revalidates it by ETag, so a
 * returning visit usually answers 304. Always resolves — a failed fetch just yields no content results. Fetch lives
 * here (the architecture lint's search client module) so the matching/localization in client.ts stays fetch-free.
 */
export function loadContentSearchIndex(): Promise<ContentSearchEntry[]> {
  indexPromise ??= fetch("/search-index.json", { headers: { accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload: SearchIndexPayload | null) => (Array.isArray(payload?.entries) ? payload.entries : []))
    .catch(() => []);
  return indexPromise;
}

const providers: DynamicSearchProvider[] = [];

export function registerDynamicSearchProvider(provider: DynamicSearchProvider) {
  providers.push(provider);
}

export async function loadDynamicSearchItems(): Promise<DynamicSearchItem[]> {
  const batches = await Promise.allSettled(providers.map((provider) => provider.load()));
  return batches.flatMap((batch) => batch.status === "fulfilled" ? batch.value : []);
}

/**
 * The built-in provider over `/search-index.json`. Interactive search localizes per locale via `searchContent`; this
 * provider feeds locale-agnostic consumers, resolving MasterText titles along the default (zh-CN) language chain.
 */
registerDynamicSearchProvider({
  id: "content-index",
  load: async () => {
    const entries = await loadContentSearchIndex();
    return entries.map((entry) => ({
      id: entry.key,
      kind: entry.kind,
      title: localizeMasterText(entry.title, "zh-CN") || entry.title.id || entry.key,
      href: entry.href,
    }));
  },
});
