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

const providers: DynamicSearchProvider[] = [];

export function registerDynamicSearchProvider(provider: DynamicSearchProvider) {
  providers.push(provider);
}

export async function loadDynamicSearchItems(): Promise<DynamicSearchItem[]> {
  const batches = await Promise.allSettled(providers.map((provider) => provider.load()));
  return batches.flatMap((batch) => batch.status === "fulfilled" ? batch.value : []);
}
