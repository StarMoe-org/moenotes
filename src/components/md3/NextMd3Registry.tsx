"use client";

import { CacheProvider } from "@emotion/react";
import { useServerInsertedHTML } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Md3RegistryCacheContext } from "@/components/md3/Md3Provider";
import { createLayeredMd3Cache, getMd3EmotionCache } from "@/lib/md3/emotion-cache";

export default function NextMd3Registry({ children }: { children: ReactNode }) {
  const [registry] = useState(() => {
    if (typeof document !== "undefined") {
      return { cache: getMd3EmotionCache(), flush: () => [] as string[] };
    }
    const cache = createLayeredMd3Cache();
    cache.compat = true;
    const prevInsert = cache.insert;
    let inserted: string[] = [];
    cache.insert = (...args) => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return prevInsert(...args);
    };
    const flush = () => {
      const names = inserted;
      inserted = [];
      return names;
    };
    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = registry.flush();
    if (names.length === 0) return null;
    let styles = "";
    for (const name of names) {
      const raw = registry.cache.inserted[name];
      if (typeof raw === "string") styles += raw;
    }
    return (
      <style
        key={registry.cache.key}
        data-emotion={`${registry.cache.key} ${names.join(" ")}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return (
    <Md3RegistryCacheContext.Provider value={registry.cache}>
      <CacheProvider value={registry.cache}>{children}</CacheProvider>
    </Md3RegistryCacheContext.Provider>
  );
}
