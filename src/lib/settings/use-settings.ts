import { useCallback, useEffect, useState } from "react";
import { applySettingsToDocument } from "@/lib/settings/apply-theme";
import { getSettings, setSettings, subscribeSettings } from "@/lib/settings/store";
import type { AppSettings } from "@/types/settings";

export function useSettings() {
  const [settings, setLocalSettings] = useState<AppSettings>(() => getSettings());

  useEffect(() => {
    const unsubscribe = subscribeSettings((nextSettings) => {
      setLocalSettings(nextSettings);
      applySettingsToDocument(nextSettings);
    });
    return unsubscribe;
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings> | ((settings: AppSettings) => Partial<AppSettings>)) => {
    const nextSettings = setSettings(patch);
    setLocalSettings(nextSettings);
    applySettingsToDocument(nextSettings);
    return nextSettings;
  }, []);

  return {
    settings,
    updateSettings,
  };
}
