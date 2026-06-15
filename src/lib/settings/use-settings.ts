import { useCallback, useSyncExternalStore } from "react";
import { getSettings, setSettings, subscribeSettings } from "@/lib/settings/store";
import type { AppSettings } from "@/types/settings";

export function useSettings() {
  const settings = useSyncExternalStore(subscribeSettings, getSettings, getSettings);

  const updateSettings = useCallback((patch: Partial<AppSettings> | ((settings: AppSettings) => Partial<AppSettings>)) => {
    return setSettings(patch);
  }, []);

  return {
    settings,
    updateSettings,
  };
}
