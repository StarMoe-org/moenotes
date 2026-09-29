import { useEffect, useRef, useState } from "react";
import type { GameServer } from "@/config/game-api";
import type { AppLocale } from "@/config/locales";
import { resolveGameServer } from "@/lib/game-api/server";
import { useSettings } from "@/lib/settings/use-settings";

/**
 * The server a page shows: `requested` (e.g. from its address) on the first render in the browser, otherwise the
 * default server setting, which it follows when that setting changes. Picking another server on the page changes
 * only this page. Null until the browser has read the settings, so static builds bake in no server.
 */
export function useGameServer(locale: AppLocale, requested?: () => GameServer | null): [GameServer | null, (server: GameServer) => void] {
  const { settings } = useSettings();
  const fallback = resolveGameServer(settings.gameServer, locale);
  const [server, setServer] = useState<GameServer | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const initial = first.current ? requested?.() ?? null : null;
    first.current = false;
    setServer(initial ?? fallback);
    // `requested` is read once, on mount.
  }, [fallback]);

  return [server, setServer];
}
