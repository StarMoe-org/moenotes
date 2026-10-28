"use client";

/**
 * Material 3 context for client components: Emotion cache (layered, src/lib/md3/emotion-cache.ts) + the MUI theme.
 *
 * Inside Next.js App Router, `NextMd3Registry` supplies a request-scoped `compat` Emotion cache that flushes styles
 * via `useServerInsertedHTML`. In standalone `renderToString` unit tests, `Md3Provider` falls back to its own cache.
 */
import type { EmotionCache } from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { ThemeProvider } from "@mui/material/styles";
import { createContext, useContext, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { defaultSettings } from "@/config/settings";
import { getMd3EmotionCache } from "@/lib/md3/emotion-cache";
import { type Md3Density } from "@/lib/md3/mui-theme";
import { getMd3Theme, md3ThemeVariablesCss } from "@/lib/md3/theme-vars";
import { getSettings, subscribeSettings } from "@/lib/settings/store";

export const Md3RegistryCacheContext = createContext<EmotionCache | null>(null);

const subscribeDensity = (onChange: () => void) => subscribeSettings(onChange);
const getDensity = (): Md3Density => getSettings().density;
const getServerDensity = (): Md3Density => defaultSettings.density;

export function Md3Provider({ children }: { children: ReactNode }) {
  const registryCache = useContext(Md3RegistryCacheContext);
  const density = useSyncExternalStore(subscribeDensity, getDensity, getServerDensity);
  const content = (
    <ThemeProvider
      theme={getMd3Theme(density)}
      disableStyleSheetGeneration
      storageManager={null}
      colorSchemeNode={null}
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );

  if (registryCache) {
    return content;
  }

  return (
    <CacheProvider value={getMd3EmotionCache()}>
      {content}
    </CacheProvider>
  );
}

/** A client island rendered inside Md3Provider. */
export function withMd3<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  function Md3Island(props: P) {
    return (
      <Md3Provider>
        <Component {...props} />
      </Md3Provider>
    );
  }
  Md3Island.displayName = `withMd3(${Component.displayName ?? Component.name ?? "Island"})`;
  return Md3Island;
}

export { md3ThemeVariablesCss };
