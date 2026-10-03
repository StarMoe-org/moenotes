import { useCallback, useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { LOCALE_LABELS, SUPPORTED_LOCALES, flagIconSrc } from "@/config/locales";
import { flagIconSrc as serverFlagIconSrc } from "@/config/servers";
import { switchLocalePath } from "@/i18n/routing";
import { t } from "@/i18n";
import {
  CACHE_CATEGORIES,
  clearAllCaches,
  clearCacheCategory,
  getCacheOverview,
  isBrowserCacheAvailable,
  type CacheCategory,
  type CacheOverview,
} from "@/lib/cache/usage";
import { formatBytes } from "@/lib/format/bytes";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { defaultGameServer } from "@/lib/game-api/server";
import { DENSITIES, GAME_SERVER_SETTINGS } from "@/lib/settings/schema";
import { getForceJapaneseTitlesSetting, setForceJapaneseTitlesSetting, SONG_TITLE_PREFERENCE_EVENT } from "@/lib/settings/song-titles";
import type { ThemeBandColor } from "@/lib/masterdata/build-settings";
import { DEFAULT_ACCENT } from "@/config/settings";
import { useSettings } from "@/lib/settings/use-settings";
import Modal from "@/components/shared/Modal";
import Popover from "@/components/shared/Popover";
import type { AppSettings } from "@/types/settings";

interface SettingsDrawerProps {
  locale: AppLocale;
  pathname: string;
  /** Band colors the theme color choice offers (build time, src/lib/masterdata/build-settings.ts). */
  bands?: ThemeBandColor[];
}

type SettingsTab = "general" | "data";
const SETTINGS_TABS: readonly SettingsTab[] = ["general", "data"];

const chevronDown = (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
);

export default function SettingsDrawer({ locale, pathname, bands = [] }: SettingsDrawerProps) {
  const { isOpen, close } = useOverlay("settings");
  const [tab, setTab] = useState<SettingsTab>("general");
  const id = useId();

  return (
    <Modal isOpen={isOpen} onClose={close} title={t(locale, "settings.title")} closeLabel={t(locale, "actions.close")} size="md">
      <div
        role="tablist"
        aria-label={t(locale, "settings.tabs.label")}
        className="mn-segmented mb-6 grid grid-cols-2 gap-2 rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-surface-strong)] p-1"
      >
        {SETTINGS_TABS.map((key) => (
          <button
            key={key}
            id={`${id}-${key}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={tab === key ? `${id}-panel` : undefined}
            onClick={() => setTab(key)}
            className={`mn-focus rounded-full px-3 py-2 text-sm font-black transition ${
              tab === key ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"
            }`}
          >
            {t(locale, `settings.tabs.${key}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}-tab`}>
        {tab === "general" ? <GeneralSettings locale={locale} pathname={pathname} bands={bands} /> : <DataSettings locale={locale} />}
      </div>
    </Modal>
  );
}

function GeneralSettings({ locale, pathname, bands = [] }: SettingsDrawerProps) {
  const { settings, updateSettings } = useSettings();

  const update = (patch: Partial<AppSettings>) => {
    updateSettings(patch);
  };
  // The flag of the server the choice stands for: `auto` follows the site language, so it shows that one's.
  const serverFlag = (value: AppSettings["gameServer"]) => (
    <img src={serverFlagIconSrc(value === "auto" ? defaultGameServer(locale) : value)} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-5 w-5 shrink-0 rounded-full" />
  );
  const serverLabel = (value: AppSettings["gameServer"]) =>
    value === "auto"
      ? t(locale, "settings.gameServerAuto", { server: t(locale, `gameServer.names.${defaultGameServer(locale)}`) })
      : t(locale, `gameServer.names.${value}`);

  return (
    <div className="space-y-6">
      <Section title={t(locale, "settings.language")}>
        <Popover
          matchTriggerWidth
          trigger={({ ref, onClick, ...aria }) => (
            <button
              ref={ref as React.Ref<HTMLButtonElement>}
              type="button"
              className="mn-control flex w-full items-center justify-between rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-5 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
              onClick={onClick}
              {...aria}
            >
              <span className="flex min-w-0 items-center gap-2">
                <img src={flagIconSrc(locale)} alt="" aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full" />
                <span className="truncate">{LOCALE_LABELS[locale]}</span>
              </span>
              {chevronDown}
            </button>
          )}
        >
          {({ close: closePopover }) => (
            <>
              {SUPPORTED_LOCALES.map((item) => (
                <a
                  key={item}
                  href={switchLocalePath(pathname, item)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition hover:bg-[var(--mn-cream-deep)] ${item === locale ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"}`}
                  onClick={closePopover}
                >
                  <img src={flagIconSrc(item)} alt="" aria-hidden="true" loading="lazy" className="h-5 w-5 shrink-0 rounded-full" />
                  <span>{LOCALE_LABELS[item]}</span>
                </a>
              ))}
            </>
          )}
        </Popover>
        <p className="mt-3 text-xs leading-5 text-[var(--mn-text-muted)]">
          {t(locale, "settings.machineTranslationNotice")}
        </p>
      </Section>

      <Section title={t(locale, "settings.colorScheme")}>
        <Segmented
          value={settings.colorScheme}
          options={["system", "light", "dark"]}
          label={(value) => t(locale, `settings.options.${value}`)}
          onChange={(value) => update({ colorScheme: value as AppSettings["colorScheme"] })}
        />
      </Section>

      <Section title={t(locale, "settings.accent.title")}>
        <AccentPicker locale={locale} bands={bands} value={settings.accentColor} onChange={(accentColor) => update({ accentColor })} />
      </Section>

      <Section title={t(locale, "settings.density.title")}>
        <Segmented
          value={settings.density}
          options={[...DENSITIES]}
          label={(value) => t(locale, `settings.density.${value}`)}
          onChange={(value) => update({ density: value as AppSettings["density"] })}
        />
      </Section>

      <Section title={t(locale, "settings.songTitles.title")}>
        <JapaneseTitlesToggle locale={locale} />
      </Section>

      <Section title={t(locale, "settings.gameServer")}>
        <Popover
          matchTriggerWidth
          trigger={({ ref, onClick, ...aria }) => (
            <button
              ref={ref as React.Ref<HTMLButtonElement>}
              type="button"
              className="mn-control flex w-full items-center justify-between rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-5 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
              onClick={onClick}
              {...aria}
            >
              <span className="flex min-w-0 items-center gap-2">
                {serverFlag(settings.gameServer)}
                <span className="truncate">{serverLabel(settings.gameServer)}</span>
              </span>
              {chevronDown}
            </button>
          )}
        >
          {({ close: closePopover }) => (
            <>
              {GAME_SERVER_SETTINGS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={item === settings.gameServer}
                  className={`flex w-full items-center rounded-full px-4 py-2 text-left text-sm font-bold transition hover:bg-[var(--mn-cream-deep)] ${item === settings.gameServer ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"}`}
                  onClick={() => {
                    update({ gameServer: item });
                    closePopover();
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {serverFlag(item)}
                    <span>{serverLabel(item)}</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </Popover>
      </Section>
    </div>
  );
}

/** What the browser keeps for the site, by what the files are, each kind clearable. */
function DataSettings({ locale }: { locale: AppLocale }) {
  const [available] = useState(isBrowserCacheAvailable);
  const [overview, setOverview] = useState<CacheOverview | null>(null);
  const [busy, setBusy] = useState<CacheCategory | "all" | null>(null);
  // The category under the pointer, on the bar or in the list: its segment and its row stand out together.
  const [active, setActive] = useState<CacheCategory | null>(null);

  const refresh = useCallback(() => getCacheOverview().then(setOverview), []);

  useEffect(() => {
    if (available) void refresh();
  }, [available, refresh]);

  const clear = async (target: CacheCategory | "all") => {
    setBusy(target);
    try {
      await (target === "all" ? clearAllCaches() : clearCacheCategory(target));
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const files = (count: number) => t(locale, "settings.data.fileCount", { count: count.toLocaleString(locale) });

  return (
    <div className="space-y-6">
      <Section title={t(locale, "settings.data.cacheTitle")}>
        {!available ? (
          <p className="text-xs leading-5 text-[var(--mn-text-muted)]">{t(locale, "settings.data.unavailable")}</p>
        ) : !overview ? (
          <p className="text-xs leading-5 text-[var(--mn-text-muted)]">{t(locale, "settings.data.calculating")}</p>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--mn-border)] bg-[var(--mn-surface-strong)] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-bold text-[var(--mn-text-muted)]">{t(locale, "settings.data.total")}</span>
                <span className="font-mono text-[11px] text-[var(--mn-text-muted)]">{files(overview.total.entries)}</span>
              </div>
              <p className="mt-1 font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{formatBytes(overview.total.bytes)}</p>
              <CacheBreakdown locale={locale} overview={overview} active={active} onActive={setActive} />
            </div>

            <ul className="mt-3 divide-y divide-[var(--mn-border)] overflow-hidden rounded-xl border border-[var(--mn-border)] bg-[var(--mn-surface)]">
              {CACHE_CATEGORIES.map((category) => {
                const usage = overview.categories[category];
                return (
                  <li
                    key={category}
                    onMouseEnter={() => setActive(category)}
                    onMouseLeave={() => setActive(null)}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${active === category ? "bg-[color-mix(in_srgb,var(--mn-accent)_12%,transparent)]" : ""}`}
                  >
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(category) }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--mn-text)]">{t(locale, `settings.data.categories.${category}`)}</p>
                      <p className="truncate text-[11px] leading-4 text-[var(--mn-text-muted)]">{t(locale, `settings.data.categoryHints.${category}`)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-xs font-bold text-[var(--mn-text)]">{formatBytes(usage.bytes)}</p>
                      <p className="font-mono text-[10px] text-[var(--mn-text-muted)]">{files(usage.entries)}</p>
                    </div>
                    <button
                      type="button"
                      disabled={busy !== null || usage.entries === 0}
                      onClick={() => void clear(category)}
                      className="mn-control mn-focus shrink-0 border border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-4 py-1.5 text-xs font-black text-[var(--mn-text)] transition hover:bg-[var(--mn-cream-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t(locale, busy === category ? "settings.data.clearing" : "settings.data.clear")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Section>

      {available && overview && (
        <div>
          <button
            type="button"
            disabled={busy !== null || overview.total.entries === 0}
            onClick={() => void clear("all")}
            className="mn-control mn-focus w-full border border-[color-mix(in_srgb,var(--mn-accent)_35%,transparent)] bg-[var(--mn-accent-soft)] px-5 py-3 text-sm font-black text-[var(--mn-accent-deep)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t(locale, busy === "all" ? "settings.data.clearing" : "settings.data.clearAll")}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The total split by category: one segment per category that keeps anything, in the list's order and colors, 2px apart.
 * The list below names every category with its size, so the bar itself is left out of the accessibility tree.
 */
function CacheBreakdown({ locale, overview, active, onActive }: {
  locale: AppLocale;
  overview: CacheOverview;
  active: CacheCategory | null;
  onActive: (category: CacheCategory | null) => void;
}) {
  const total = overview.total.bytes;
  const parts = CACHE_CATEGORIES.filter((category) => overview.categories[category].bytes > 0);
  if (total === 0 || parts.length === 0) return <div aria-hidden="true" className="mt-3 h-2.5 rounded-[4px] bg-[var(--mn-cream-deep)]" />;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  return (
    <div aria-hidden="true" className="mt-3 flex h-2.5 gap-[2px]" onMouseLeave={() => onActive(null)}>
      {parts.map((category, index) => {
        const bytes = overview.categories[category].bytes;
        return (
          <span
            key={category}
            title={`${t(locale, `settings.data.categories.${category}`)} · ${formatBytes(bytes)} · ${percent.format(bytes / total)}`}
            onMouseEnter={() => onActive(category)}
            className={`h-full min-w-[3px] transition-opacity ${index === 0 ? "rounded-l-[4px]" : ""} ${index === parts.length - 1 ? "rounded-r-[4px]" : ""}`}
            style={{ flex: `${bytes} 1 0px`, background: categoryColor(category), opacity: active && active !== category ? 0.35 : 1 }}
          />
        );
      })}
    </div>
  );
}

function categoryColor(category: CacheCategory): string {
  return `var(--mn-cache-${category})`;
}

/** Theme color: the site's default blue or a band's color, shown as swatches. */
function AccentPicker({ locale, bands, value, onChange }: { locale: AppLocale; bands: ThemeBandColor[]; value: string; onChange: (value: string) => void }) {
  const options = [{ key: DEFAULT_ACCENT, label: t(locale, "settings.accent.default"), color: "" }, ...bands.map((band) => ({ key: band.color, label: band.name, color: band.color }))];
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t(locale, "settings.accent.title")}>
      {options.map((option) => {
        const selected = value.toUpperCase() === option.key.toUpperCase();
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.label}
            onClick={() => onChange(option.key)}
            className={`mn-focus flex min-w-0 items-center gap-2 rounded-full border-[1.5px] py-1 pl-1 pr-3 text-xs font-bold transition ${selected ? "border-[var(--mn-accent-deep)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "border-[var(--mn-border)] bg-[var(--mn-surface-strong)] text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`}
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--mn-glass-border)]"
              style={{ background: option.color || "linear-gradient(135deg, #5475BC 50%, #9ACBFA 50%)" }}
              aria-hidden="true"
            >
              {selected && <svg className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>}
            </span>
            <span className="max-w-[9rem] truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Always show songs under their Japanese titles (shared with the music pages' preference). */
function JapaneseTitlesToggle({ locale }: { locale: AppLocale }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(getForceJapaneseTitlesSetting());
    const sync = () => setOn(getForceJapaneseTitlesSetting());
    window.addEventListener(SONG_TITLE_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SONG_TITLE_PREFERENCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[var(--mn-text)]">{t(locale, "settings.songTitles.forceJapanese")}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--mn-text-muted)]">{t(locale, "settings.songTitles.hint")}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(event) => {
          setOn(event.target.checked);
          setForceJapaneseTitlesSetting(event.target.checked);
        }}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--mn-accent-deep)]"
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-[var(--mn-font-display)] text-xs uppercase tracking-[0.18em] text-[var(--mn-accent-deep)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Segmented({
  value,
  options,
  label,
  onChange,
}: {
  value: string;
  options: string[];
  label: (value: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mn-segmented grid grid-cols-[repeat(var(--mn-segment-count),minmax(0,1fr))] gap-2 rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-surface-strong)] p-1 shadow-[var(--mn-shadow-stamp-sm)]" style={{ "--mn-segment-count": options.length } as CSSProperties}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`rounded-full px-3 py-2 text-sm font-black transition ${
            value === option
              ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
              : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"
          }`}
          onClick={() => onChange(option)}
          aria-pressed={value === option}
        >
          {label(option)}
        </button>
      ))}
    </div>
  );
}

