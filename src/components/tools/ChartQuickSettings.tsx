import { useEffect, useRef, useState } from "react";
import type { ChartPlayer, LiveOptionItem, LiveSettingValue } from "ournotes-player";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

/**
 * The Live options most readers look for, as page controls next to the stage: mirror, note speed and the lane / slide /
 * guide opacities. They are the game's options of ournotes-player, applied with `setSettings` (the player's own panel
 * shows the same values) and remembered by ChartStage's `settingschange` handler (chart-live-settings.ts). Only the
 * options this chart offers are shown.
 */
const QUICK_OPTIONS = ["MirrorChart", "NoteSpeed", "LaneOpacity", "SlideOpacity", "GuideOpacity"] as const;
type QuickOption = typeof QUICK_OPTIONS[number];
const APPLY_DELAY_MS = 350;

export default function ChartQuickSettings({ locale, player }: { locale: AppLocale; player: ChartPlayer }) {
  const [items, setItems] = useState<LiveOptionItem[]>(() => offeredItems(player));
  const [draft, setDraft] = useState<Partial<Record<QuickOption, LiveSettingValue>>>({});
  const [busy, setBusy] = useState(false);
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const refresh = () => {
      setItems(offeredItems(player));
      setDraft({});
    };
    refresh();
    player.addEventListener("settingschange", refresh);
    player.addEventListener("ready", refresh);
    const pending = timers.current;
    return () => {
      player.removeEventListener("settingschange", refresh);
      player.removeEventListener("ready", refresh);
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, [player]);

  const apply = (name: QuickOption, value: LiveSettingValue, delay = 0) => {
    setDraft((current) => ({ ...current, [name]: value }));
    window.clearTimeout(timers.current.get(name));
    timers.current.set(name, window.setTimeout(() => {
      timers.current.delete(name);
      if (player.disposed) return;
      setBusy(true);
      player.setSettings({ [name]: value })
        .catch(() => setItems(offeredItems(player)))
        .finally(() => {
          setBusy(false);
          setDraft((current) => {
            const next = { ...current };
            delete next[name];
            return next;
          });
        });
    }, delay));
  };

  if (!items.length) return null;
  return (
    <div className="mn-paper flex flex-wrap items-end gap-x-6 gap-y-4 p-4" aria-busy={busy}>
      <p className="w-full text-xs font-bold uppercase tracking-wider text-[var(--mn-text-muted)]">{t(locale, "chartPreview3d.quick.title")}</p>
      {items.map((item) => {
        const name = item.name as QuickOption;
        const value = draft[name] ?? item.value;
        const label = t(locale, `chartPreview3d.quick.options.${name}`);
        if (item.type === "bool") {
          return (
            <label key={name} className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-[var(--mn-text)]">
              <input type="checkbox" className="h-4 w-4 accent-[var(--mn-accent)]" checked={value === true} onChange={(event) => apply(name, event.target.checked)} />
              {label}
            </label>
          );
        }
        const [min, max] = item.range ?? [0, 100];
        const step = item.type === "float" ? 0.1 : 1;
        const number = typeof value === "number" ? value : Number(value) || min;
        const shown = item.type === "float" ? number.toFixed(2) : `${Math.round(number)}%`;
        return (
          <label key={name} className="flex min-w-[12rem] flex-1 flex-col gap-1.5 text-xs font-bold text-[var(--mn-text-muted)]">
            <span className="flex justify-between gap-3"><span>{label}</span><span className="font-mono text-[var(--mn-text)]">{shown}</span></span>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={number}
              onChange={(event) => {
                const next = Number(event.target.value);
                apply(name, item.type === "float" ? Math.round(next * 100) / 100 : Math.round(next), APPLY_DELAY_MS);
              }}
              className="w-full accent-[var(--mn-accent)]"
            />
          </label>
        );
      })}
      <button
        type="button"
        onClick={() => {
          const defaults = Object.fromEntries(items.map((item) => [item.name, item.default]));
          setBusy(true);
          void player.setSettings(defaults).catch(() => undefined).finally(() => setBusy(false));
        }}
        className="mn-focus mn-stamp-press rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-1.5 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)]"
      >
        {t(locale, "chartPreview3d.quick.reset")}
      </button>
    </div>
  );
}

function offeredItems(player: ChartPlayer): LiveOptionItem[] {
  if (player.disposed || !player.session) return [];
  const items = player.optionItems();
  return QUICK_OPTIONS.flatMap((name) => {
    const item = items.find((entry) => entry.name === name);
    return item && item.offered && !item.hidden ? [item] : [];
  });
}
