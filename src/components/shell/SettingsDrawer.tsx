"use client";

import { useCallback, useEffect, useId, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import MenuItem from "@mui/material/MenuItem";
import SwipeableDrawer from "@mui/material/SwipeableDrawer";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Icon, type IconName } from "@/components/shared/icons";
import PrimaryTabs, { rovingStep } from "@/components/shared/PrimaryTabs";
import { withMd3 } from "@/components/md3/Md3Provider";
import type { AppLocale } from "@/config/locales";
import { LOCALE_LABELS, SUPPORTED_LOCALES, flagIconSrc } from "@/config/locales";
import { flagIconSrc as serverFlagIconSrc } from "@/config/servers";
import { DEFAULT_ACCENT } from "@/config/settings";
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
import { getBandSmallIconWhiteUrl } from "@/lib/cards/assets";
import { formatBytes } from "@/lib/format/bytes";
import { defaultGameServer } from "@/lib/game-api/server";
import type { ThemeBandColor } from "@/lib/masterdata/build-settings";
import { MD3_DEFAULT_SEED } from "@/lib/md3/scheme";
import { getForceJapaneseTitles, setForceJapaneseTitles, SONG_TITLE_PREFERENCE_EVENT } from "@/lib/music/title-preference";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useOverlayLayer } from "@/lib/overlay/use-overlay-layer";
import { useAssetUrl } from "@/lib/servers/use-content-server";
import { DENSITIES, GAME_SERVER_SETTINGS } from "@/lib/settings/schema";
import { useSettings } from "@/lib/settings/use-settings";
import { useSpoiler } from "@/lib/settings/spoiler";
import type { AppSettings } from "@/types/settings";

interface SettingsDrawerProps {
  locale: AppLocale;
  pathname: string;
  /** Band colors the theme color choice offers (build time, src/lib/masterdata/build-settings.ts). */
  bands?: ThemeBandColor[];
}

/** MoeSekai's grouping: how the site looks, what it shows, what the browser keeps. */
type SettingsTab = "appearance" | "content" | "data";
const SETTINGS_TABS: readonly { key: SettingsTab; icon: IconName }[] = [
  { key: "appearance", icon: "palette" },
  { key: "content", icon: "tune" },
  { key: "data", icon: "database" },
];

const COLOR_SCHEME_ICONS: Record<AppSettings["colorScheme"], IconName> = { system: "monitor", light: "sun", dark: "moon" };

/** The floating side sheet, as MoeSekai floats it: 12px off the viewport edges, extra-large corners, elevation 3. */
const SIDE_SHEET_SX = {
  "& > .MuiDrawer-paper": {
    top: 12,
    right: 12,
    bottom: 12,
    height: "auto",
    width: 480,
    maxWidth: "calc(100vw - 24px)",
    borderRadius: "var(--md-sys-shape-corner-extra-large)",
    boxShadow: "var(--md-sys-elevation-level3)",
  },
};
const BOTTOM_SHEET_SX = { "& > .MuiDrawer-paper": { maxHeight: "92dvh" } };

/** Settings as a Material 3 modal sheet: floating at the side on wide screens, a bottom sheet on phones. */
function SettingsDrawer({ locale, pathname, bands = [] }: SettingsDrawerProps) {
  const { isOpen, close } = useOverlay("settings");
  const [tab, setTab] = useState<SettingsTab>("appearance");
  const id = useId();
  const titleId = `${id}-title`;
  const isTop = useOverlayLayer(`settings-${id}`, isOpen, close);
  // Phones get the bottom sheet below the breakpoint where src/components/shared/Modal.tsx goes full screen.
  const bottom = useMediaQuery("(max-width: 599.95px)");

  const header = (
    <>
      <h2 id={titleId} className="min-w-0 flex-1 truncate font-[var(--md-ref-typeface-brand)] text-title-large text-on-surface">{t(locale, "settings.title")}</h2>
      <IconButton aria-label={t(locale, "actions.close")} onClick={close}>
        <Icon name="close" />
      </IconButton>
    </>
  );

  return (
    <SwipeableDrawer
      anchor={bottom ? "bottom" : "right"}
      open={isOpen}
      // Swiping only closes the sheet: it opens from the settings button.
      disableSwipeToOpen
      onOpen={() => undefined}
      // Escape only closes the top layer; a swipe closes without an event.
      onClose={(event?: SyntheticEvent<unknown>) => {
        if (event?.type === "keydown" && !isTop()) return;
        close();
      }}
      // Closed, the sheet unmounts: the data tab measures the caches again each time it opens.
      ModalProps={{ keepMounted: false }}
      sx={bottom ? BOTTOM_SHEET_SX : SIDE_SHEET_SX}
      slotProps={{ paper: { role: "dialog", "aria-modal": true, "aria-labelledby": titleId } }}
    >
      {bottom ? (
        <>
          <div aria-hidden="true" className="flex shrink-0 justify-center py-4">
            <span className="h-1 w-8 rounded-full bg-on-surface-variant/40" />
          </div>
          <div className="flex shrink-0 items-center gap-2 pb-2 pl-6 pr-3">{header}</div>
        </>
      ) : (
        <div className="flex h-[72px] shrink-0 items-center gap-2 pl-6 pr-3">{header}</div>
      )}
      <PrimaryTabs
        tabs={SETTINGS_TABS.map(({ key, icon }) => ({ value: key, label: t(locale, `settings.tabs.${key}`), icon: <Icon name={icon} /> }))}
        value={tab}
        onChange={setTab}
        label={t(locale, "settings.tabs.label")}
        tabId={(key) => `${id}-${key}-tab`}
        panelId={`${id}-panel`}
        className="shrink-0"
      />
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${tab}-tab`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
      >
        <div key={tab} className="mn-tab-enter">
          {tab === "appearance" ? <AppearanceSettings locale={locale} pathname={pathname} bands={bands} />
            : tab === "content" ? <ContentSettings locale={locale} />
            : <DataSettings locale={locale} />}
        </div>
      </div>
    </SwipeableDrawer>
  );
}

const flag = (src: string) => <img src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" className="h-5 w-5 shrink-0 rounded-full" />;

/** How the site looks: color scheme, theme color, density, and the interface language. */
function AppearanceSettings({ locale, pathname, bands = [] }: SettingsDrawerProps) {
  const { settings, updateSettings } = useSettings();
  const update = (patch: Partial<AppSettings>) => updateSettings(patch);
  const assetUrl = useAssetUrl();
  const accents: AccentOption[] = [
    { key: DEFAULT_ACCENT, label: t(locale, "settings.accent.default"), color: MD3_DEFAULT_SEED },
    ...bands.map((band) => ({ key: band.color, label: band.name, color: band.color, icon: assetUrl(getBandSmallIconWhiteUrl(band.bandId)) })),
  ];
  const accent = accents.find((option) => option.key.toUpperCase() === settings.accentColor.toUpperCase());

  return (
    <div className="space-y-6">
      <Section title={t(locale, "settings.colorScheme")}>
        <Segmented
          label={t(locale, "settings.colorScheme")}
          value={settings.colorScheme}
          options={["system", "light", "dark"] as const}
          optionLabel={(value) => t(locale, `settings.options.${value}`)}
          optionIcon={(value) => COLOR_SCHEME_ICONS[value]}
          onChange={(colorScheme) => update({ colorScheme })}
        />
      </Section>

      <Section
        title={t(locale, "settings.accent.title")}
        aside={accent && (
          <span aria-hidden="true" className="flex min-w-0 items-center gap-2 text-body-medium text-on-surface-variant">
            <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: accent.color }} />
            <span className="truncate">{accent.label}</span>
          </span>
        )}
      >
        <AccentPicker label={t(locale, "settings.accent.title")} options={accents} value={accent?.key} onChange={(accentColor) => update({ accentColor })} />
      </Section>

      <Section title={t(locale, "settings.density.title")}>
        <Segmented
          label={t(locale, "settings.density.title")}
          value={settings.density}
          options={DENSITIES}
          optionLabel={(value) => t(locale, `settings.density.${value}`)}
          onChange={(density) => update({ density })}
        />
      </Section>

      <Section title={t(locale, "settings.language")}>
        <TextField
          select
          fullWidth
          size="small"
          value={locale}
          onChange={(event) => {
            const next = event.target.value as AppLocale;
            if (next !== locale) window.location.href = switchLocalePath(pathname, next);
          }}
          sx={SELECT_SX}
          slotProps={{
            select: { IconComponent: SelectChevron, renderValue: (value) => <span className="flex items-center gap-3">{flag(flagIconSrc(value as AppLocale))}{LOCALE_LABELS[value as AppLocale]}</span> },
            htmlInput: { "aria-label": t(locale, "settings.language") },
          }}
        >
          {SUPPORTED_LOCALES.map((item) => (
            <MenuItem key={item} value={item} lang={item}>
              <ListItemIcon>{flag(flagIconSrc(item))}</ListItemIcon>
              {LOCALE_LABELS[item]}
            </MenuItem>
          ))}
        </TextField>
        <p className="mt-2 text-body-small text-on-surface-variant">{t(locale, "settings.machineTranslationNotice")}</p>
      </Section>
    </div>
  );
}

/** What the site shows: the default game server, song titles, and spoilers. */
function ContentSettings({ locale }: { locale: AppLocale }) {
  const { settings, updateSettings } = useSettings();
  const serverFlag = (value: AppSettings["gameServer"]) => flag(serverFlagIconSrc(value === "auto" ? defaultGameServer(locale) : value));
  const serverLabel = (value: AppSettings["gameServer"]) =>
    value === "auto"
      ? t(locale, "settings.gameServerAuto", { server: t(locale, `gameServer.names.${defaultGameServer(locale)}`) })
      : t(locale, `gameServer.names.${value}`);

  return (
    <div className="space-y-6">
      <Section title={t(locale, "settings.gameServer")}>
        <TextField
          select
          fullWidth
          size="small"
          value={settings.gameServer}
          onChange={(event) => updateSettings({ gameServer: event.target.value as AppSettings["gameServer"] })}
          sx={SELECT_SX}
          slotProps={{
            select: { IconComponent: SelectChevron, renderValue: (value) => <span className="flex items-center gap-3">{serverFlag(value as AppSettings["gameServer"])}{serverLabel(value as AppSettings["gameServer"])}</span> },
            htmlInput: { "aria-label": t(locale, "settings.gameServer") },
          }}
        >
          {GAME_SERVER_SETTINGS.map((item) => (
            <MenuItem key={item} value={item}>
              <ListItemIcon>{serverFlag(item)}</ListItemIcon>
              {serverLabel(item)}
            </MenuItem>
          ))}
        </TextField>
      </Section>

      <Section title={t(locale, "settings.songTitles.title")}>
        <JapaneseTitlesToggle locale={locale} />
      </Section>

      <Section title={t(locale, "settings.spoiler.title")}>
        <SpoilerToggle locale={locale} />
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
    <Section title={t(locale, "settings.data.cacheTitle")}>
      {!available ? (
        <p className="text-body-medium text-on-surface-variant [text-wrap:pretty]">{t(locale, "settings.data.unavailable")}</p>
      ) : !overview ? (
        <p className="text-body-medium text-on-surface-variant">{t(locale, "settings.data.calculating")}</p>
      ) : (
        <>
          <div className="rounded-shape-lg bg-surface-container p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-label-large text-on-surface-variant">{t(locale, "settings.data.total")}</span>
              <span className="text-label-medium text-on-surface-variant">{files(overview.total.entries)}</span>
            </div>
            <p className="mt-1 font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">{formatBytes(overview.total.bytes)}</p>
            <CacheBreakdown locale={locale} overview={overview} active={active} onActive={setActive} />
          </div>

          {/* An M3 expressive list: rows 2px apart on the container color, the outer corners large, the inner ones small. */}
          <ul className="mt-3 flex flex-col gap-0.5">
            {CACHE_CATEGORIES.map((category) => {
              const usage = overview.categories[category];
              return (
                <li
                  key={category}
                  onMouseEnter={() => setActive(category)}
                  onMouseLeave={() => setActive(null)}
                  className={`flex items-center gap-3 rounded-shape-xs py-3 pl-4 pr-2 transition-colors first:rounded-t-shape-lg last:rounded-b-shape-lg ${active === category ? "bg-surface-container-high" : "bg-surface-container"}`}
                >
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: `var(--mn-cache-${category})` }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-title-small text-on-surface">{t(locale, `settings.data.categories.${category}`)}</p>
                    <p className="line-clamp-2 text-body-small text-on-surface-variant [text-wrap:pretty]">{t(locale, `settings.data.categoryHints.${category}`)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-label-large text-on-surface">{formatBytes(usage.bytes)}</p>
                    <p className="text-label-small text-on-surface-variant">{files(usage.entries)}</p>
                  </div>
                  <Button variant="text" size="small" disabled={busy !== null || usage.entries === 0} onClick={() => void clear(category)}>
                    {t(locale, busy === category ? "settings.data.clearing" : "settings.data.clear")}
                  </Button>
                </li>
              );
            })}
          </ul>

          <Button variant="tonal" color="error" fullWidth className="mt-6" disabled={busy !== null || overview.total.entries === 0} onClick={() => void clear("all")}>
            {t(locale, busy === "all" ? "settings.data.clearing" : "settings.data.clearAll")}
          </Button>
        </>
      )}
    </Section>
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
  if (total === 0 || parts.length === 0) return <div aria-hidden="true" className="mt-3 h-2.5 rounded-full bg-surface-container-highest" />;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  return (
    <div aria-hidden="true" className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full" onMouseLeave={() => onActive(null)}>
      {parts.map((category) => {
        const bytes = overview.categories[category].bytes;
        return (
          <span
            key={category}
            title={`${t(locale, `settings.data.categories.${category}`)} · ${formatBytes(bytes)} · ${percent.format(bytes / total)}`}
            onMouseEnter={() => onActive(category)}
            className="h-full min-w-[3px] transition-opacity"
            style={{ flex: `${bytes} 1 0px`, background: `var(--mn-cache-${category})`, opacity: active && active !== category ? 0.35 : 1 }}
          />
        );
      })}
    </div>
  );
}

interface AccentOption {
  key: string;
  label: string;
  color: string;
  /** The band's emblem in white, drawn on its color as MoeSekai draws a character's face on theirs. */
  icon?: string;
}

/**
 * Theme color: the site's default blue or a band's color, as MoeSekai's swatches: round, the chosen one a rounded
 * square ringed in the primary color. The section heading names the chosen one.
 */
function AccentPicker({ label, options, value, onChange }: {
  label: string;
  options: AccentOption[];
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const selectedIndex = options.findIndex((option) => option.key === value);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = rovingStep(event.key, selectedIndex, options.length);
    if (next === null) return;
    event.preventDefault();
    onChange(options[next]!.key);
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };
  return (
    // 10px apart: seven swatches still fit one row of a phone's sheet, the ring and its offset clear of the neighbors.
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-2.5 py-1 sm:gap-3">
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            tabIndex={selected || (selectedIndex < 0 && index === 0) ? 0 : -1}
            onClick={() => onChange(option.key)}
            // 50%, not a full radius: a radius far past what shows cannot be interpolated into the selected corners.
            className={`grid h-10 w-10 shrink-0 cursor-pointer place-items-center transition-[border-radius] duration-300 ease-standard sm:h-11 sm:w-11 ${
              selected ? "rounded-shape-lg ring-[3px] ring-primary ring-offset-2 ring-offset-surface-container-low" : "rounded-[50%] hover:rounded-shape-lg"
            }`}
            style={{ backgroundColor: option.color }}
          >
            {option.icon && <SwatchIcon src={option.icon} />}
          </button>
        );
      })}
    </div>
  );
}

/** A band emblem on its swatch; a band without one keeps the plain color. */
function SwatchIcon({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-[70%] w-[70%] object-contain" />;
}

/** Always show songs under their Japanese titles (shared with the music pages' preference). */
function JapaneseTitlesToggle({ locale }: { locale: AppLocale }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(getForceJapaneseTitles());
    const sync = () => setOn(getForceJapaneseTitles());
    window.addEventListener(SONG_TITLE_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(SONG_TITLE_PREFERENCE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return (
    <SettingRow
      label={t(locale, "settings.songTitles.forceJapanese")}
      description={t(locale, "settings.songTitles.hint")}
      control={
        <Switch
          checked={on}
          className="-my-3 -mr-3 shrink-0"
          onChange={(event) => {
            setOn(event.target.checked);
            setForceJapaneseTitles(event.target.checked);
          }}
        />
      }
    />
  );
}

/**
 * Filter unreleased / datamined content under Bilibili EULA, unlockable via backdoor ?Spoiler=allow. Locked, a lock
 * stands where the switch would be.
 */
function SpoilerToggle({ locale }: { locale: AppLocale }) {
  const { isUnlocked, showSpoiler, setShowSpoiler } = useSpoiler();

  return (
    <div className="space-y-3">
      <SettingRow
        label={t(locale, "settings.spoiler.showLabel")}
        description={t(locale, "settings.spoiler.eulaNotice")}
        control={
          isUnlocked ? (
            <Switch checked={showSpoiler} className="-my-3 -mr-3 shrink-0" onChange={(event) => setShowSpoiler(event.target.checked)} />
          ) : (
            <span role="img" aria-label={t(locale, "settings.spoiler.restrictedTitle")} title={t(locale, "settings.spoiler.restrictedTitle")} className="grid h-8 w-[52px] shrink-0 place-items-center text-on-surface-variant">
              <Icon name="lock" className="h-5 w-5" />
            </span>
          )
        }
        interactive={isUnlocked}
      />
      {isUnlocked && (
        <div className="inline-flex items-center gap-1.5 rounded-shape-sm bg-surface-container-high px-2 py-1 text-label-small text-on-surface-variant">
          <Icon name="info" className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{t(locale, "settings.spoiler.devOnly")}</span>
        </div>
      )}
    </div>
  );
}

/** A setting with a control at its end, as MoeSekai lays its switches out: the whole row is the control's label. */
function SettingRow({ label, description, control, interactive = true }: { label: string; description: string; control: ReactNode; interactive?: boolean }) {
  const Row = interactive ? "label" : "div";
  return (
    <Row className={`flex items-center gap-4 ${interactive ? "cursor-pointer" : ""}`}>
      <span className="min-w-0 flex-1">
        <span className="block text-body-large text-on-surface">{label}</span>
        <span className="mt-0.5 block text-body-medium text-on-surface-variant [text-wrap:pretty]">{description}</span>
      </span>
      {control}
    </Row>
  );
}

/** A group of settings under a heading in the primary color (MoeSekai's), with room for a note at the heading's end. */
function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex min-h-6 items-center gap-3">
        <h3 className="min-w-0 flex-1 text-title-small text-primary">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A select as MoeSekai sizes one: 40px tall, medium corners, body-medium text, on the sheet's own surface. */
const SELECT_SX = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "var(--md-sys-shape-corner-medium)",
    backgroundColor: "var(--md-sys-color-surface-container-low)",
    fontSize: "var(--md-sys-typescale-body-medium-size)",
    lineHeight: "var(--md-sys-typescale-body-medium-line-height)",
    letterSpacing: "var(--md-sys-typescale-body-medium-tracking)",
  },
  "&& .MuiSelect-select": { display: "flex", alignItems: "center", minHeight: 0, height: 38, boxSizing: "border-box", paddingBlock: 0, paddingLeft: "12px" },
};

function SelectChevron({ className }: { className?: string }) {
  return <Icon name="chevronDown" className={`${className ?? ""} right-2 top-[calc(50%-10px)] h-5 w-5 text-on-surface-variant transition-transform`} />;
}

/** M3 single-select segmented buttons spanning the sheet's width; the filled segment marks the choice, no checkmark. */
function Segmented<T extends string>({ label, value, options, optionLabel, optionIcon, onChange }: {
  label: string;
  value: T;
  options: readonly T[];
  optionLabel: (value: T) => string;
  optionIcon?: (value: T) => IconName;
  onChange: (value: T) => void;
}) {
  return (
    <ToggleButtonGroup exclusive fullWidth value={value} onChange={(_, next: T | null) => next && onChange(next)} aria-label={label}>
      {options.map((option) => (
        <ToggleButton key={option} value={option}>
          {optionIcon && <Icon name={optionIcon(option)} className="h-[18px] w-[18px]" />}
          {optionLabel(option)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

export default withMd3(SettingsDrawer);
