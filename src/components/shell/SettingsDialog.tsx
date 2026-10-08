import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
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
import { isTopOverlayLayer } from "@/lib/overlay/layer-stack";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useOverlayLayer } from "@/lib/overlay/use-overlay-layer";
import { defaultGameServer } from "@/lib/game-api/server";
import { DENSITIES, GAME_SERVER_SETTINGS } from "@/lib/settings/schema";
import { getForceJapaneseTitles, setForceJapaneseTitles, SONG_TITLE_PREFERENCE_EVENT } from "@/lib/music/title-preference";
import type { ThemeBandColor } from "@/lib/masterdata/build-settings";
import { DEFAULT_ACCENT } from "@/config/settings";
import { useSettings } from "@/lib/settings/use-settings";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppSettings } from "@/types/settings";

interface SettingsDialogProps {
  locale: AppLocale;
  pathname: string;
  /** Band colors the theme color choice offers (build time, src/lib/masterdata/build-settings.ts). */
  bands?: ThemeBandColor[];
}

type SettingsTab = "general" | "data";
const SETTINGS_TABS: readonly SettingsTab[] = ["general", "data"];

export default function SettingsDialog({ locale, pathname, bands = [] }: SettingsDialogProps) {
  const { isOpen, close } = useOverlay("settings");
  const [tab, setTab] = useState<SettingsTab>("general");
  const id = useId();
  useOverlayLayer("settings", isOpen);

  const handleClose = (_event: object, reason: string) => {
    if (reason === "escapeKeyDown" && !isTopOverlayLayer("settings")) return;
    close();
  };

  const handleTabChange = (_event: object, next: unknown) => {
    setTab(next as SettingsTab);
  };

  return (
    <MdMuiProvider>
      <Dialog open={isOpen} onClose={handleClose} fullWidth maxWidth="sm" scroll="paper" aria-labelledby={`${id}-title`}>
        <DialogTitle id={`${id}-title`} sx={{ pr: 6 }}>
          {t(locale, "settings.title")}
          <IconButton aria-label={t(locale, "actions.close")} onClick={close} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Tabs value={tab} onChange={handleTabChange} aria-label={t(locale, "settings.tabs.label")} variant="fullWidth" sx={{ mb: 3 }}>
            {SETTINGS_TABS.map((key) => (
              <Tab key={key} value={key} label={t(locale, `settings.tabs.${key}`)} id={`${id}-${key}-tab`} aria-controls={`${id}-panel`} />
            ))}
          </Tabs>
          <Box role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}-tab`}>
            {tab === "general" ? <GeneralSettings locale={locale} pathname={pathname} bands={bands} /> : <DataSettings locale={locale} />}
          </Box>
        </DialogContent>
      </Dialog>
    </MdMuiProvider>
  );
}

function GeneralSettings({ locale, pathname, bands = [] }: SettingsDialogProps) {
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Section title={t(locale, "settings.language")}>
        <Select
          fullWidth
          value={locale}
          inputProps={{ "aria-label": t(locale, "settings.language") }}
          onChange={(event) => {
            window.location.href = switchLocalePath(pathname, event.target.value as AppLocale);
          }}
          renderValue={(value) => (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <img src={flagIconSrc(value as AppLocale)} alt="" aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full" />
              <span>{LOCALE_LABELS[value as AppLocale]}</span>
            </Box>
          )}
        >
          {SUPPORTED_LOCALES.map((item) => (
            <MenuItem key={item} value={item}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <img src={flagIconSrc(item)} alt="" aria-hidden="true" loading="lazy" className="h-5 w-5 shrink-0 rounded-full" />
                <span>{LOCALE_LABELS[item]}</span>
              </Box>
            </MenuItem>
          ))}
        </Select>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {t(locale, "settings.machineTranslationNotice")}
        </Typography>
      </Section>

      <Section title={t(locale, "settings.colorScheme")}>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={settings.colorScheme}
          aria-label={t(locale, "settings.colorScheme")}
          onChange={(_event, next: string | null) => {
            if (next) update({ colorScheme: next as AppSettings["colorScheme"] });
          }}
        >
          {(["system", "light", "dark"] as const).map((option) => (
            <ToggleButton key={option} value={option}>
              {t(locale, `settings.options.${option}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Section>

      <Section title={t(locale, "settings.accent.title")}>
        <AccentPicker locale={locale} bands={bands} value={settings.accentColor} onChange={(accentColor) => update({ accentColor })} />
      </Section>

      <Section title={t(locale, "settings.density.title")}>
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={settings.density}
          aria-label={t(locale, "settings.density.title")}
          onChange={(_event, next: string | null) => {
            if (next) update({ density: next as AppSettings["density"] });
          }}
        >
          {DENSITIES.map((option) => (
            <ToggleButton key={option} value={option}>
              {t(locale, `settings.density.${option}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Section>

      <Section title={t(locale, "settings.songTitles.title")}>
        <JapaneseTitlesToggle locale={locale} />
      </Section>

      <Section title={t(locale, "settings.gameServer")}>
        <Select
          fullWidth
          value={settings.gameServer}
          inputProps={{ "aria-label": t(locale, "settings.gameServer") }}
          onChange={(event) => {
            update({ gameServer: event.target.value as AppSettings["gameServer"] });
          }}
          renderValue={(value) => (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {serverFlag(value as AppSettings["gameServer"])}
              <span>{serverLabel(value as AppSettings["gameServer"])}</span>
            </Box>
          )}
        >
          {GAME_SERVER_SETTINGS.map((item) => (
            <MenuItem key={item} value={item}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {serverFlag(item)}
                <span>{serverLabel(item)}</span>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </Section>
    </Box>
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Section title={t(locale, "settings.data.cacheTitle")}>
        {!available ? (
          <Typography variant="body2" color="text.secondary">{t(locale, "settings.data.unavailable")}</Typography>
        ) : !overview ? (
          <Typography variant="body2" color="text.secondary">{t(locale, "settings.data.calculating")}</Typography>
        ) : (
          <>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
              <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t(locale, "settings.data.total")}</Typography>
                <Typography variant="caption" color="text.secondary" className="font-mono">{files(overview.total.entries)}</Typography>
              </Box>
              <Typography sx={{ mt: 0.5, fontSize: 24 }} className="font-[var(--mn-font-display)]">{formatBytes(overview.total.bytes)}</Typography>
              <CacheBreakdown locale={locale} overview={overview} active={active} onActive={setActive} />
            </Paper>

            <Paper variant="outlined" sx={{ mt: 1.5, borderRadius: 3, overflow: "hidden" }}>
              <List disablePadding>
                {CACHE_CATEGORIES.map((category) => {
                  const usage = overview.categories[category];
                  return (
                    <ListItem
                      key={category}
                      divider
                      onMouseEnter={() => setActive(category)}
                      onMouseLeave={() => setActive(null)}
                      sx={active === category ? { bgcolor: "color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent)" } : undefined}
                      secondaryAction={
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={busy !== null || usage.entries === 0}
                          onClick={() => void clear(category)}
                        >
                          {t(locale, busy === category ? "settings.data.clearing" : "settings.data.clear")}
                        </Button>
                      }
                    >
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: categoryColor(category) }} />
                      <ListItemText
                        primary={t(locale, `settings.data.categories.${category}`)}
                        secondary={t(locale, `settings.data.categoryHints.${category}`)}
                        sx={{ ml: 1.5, mr: 1 }}
                        slotProps={{
                          primary: { noWrap: true, sx: { fontSize: 14, fontWeight: 700 } },
                          secondary: { noWrap: true, sx: { fontSize: 11 } },
                        }}
                      />
                      <Box sx={{ textAlign: "right", mr: 1 }}>
                        <Typography className="font-mono" sx={{ fontSize: 12, fontWeight: 700 }}>{formatBytes(usage.bytes)}</Typography>
                        <Typography color="text.secondary" className="font-mono" sx={{ fontSize: 10 }}>{files(usage.entries)}</Typography>
                      </Box>
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          </>
        )}
      </Section>

      {available && overview && (
        <Button
          variant="contained"
          fullWidth
          disabled={busy !== null || overview.total.entries === 0}
          onClick={() => void clear("all")}
          sx={{
            bgcolor: "var(--md-sys-color-secondary-container)",
            color: "var(--md-sys-color-on-secondary-container)",
            "&:hover": {
              bgcolor: "color-mix(in srgb, var(--md-sys-color-on-secondary-container) 8%, var(--md-sys-color-secondary-container))",
            },
          }}
        >
          {t(locale, busy === "all" ? "settings.data.clearing" : "settings.data.clearAll")}
        </Button>
      )}
    </Box>
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
  if (total === 0 || parts.length === 0) return <div aria-hidden="true" className="mt-3 h-2.5 rounded-[4px] bg-[var(--md-sys-color-surface-container-highest)]" />;
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
    <Box role="group" aria-label={t(locale, "settings.accent.title")} sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      {options.map((option) => {
        const selected = value.toUpperCase() === option.key.toUpperCase();
        return (
          <ToggleButton
            key={option.key}
            value={option.key}
            selected={selected}
            title={option.label}
            aria-label={option.label}
            onChange={() => onChange(option.key)}
            sx={{
              borderRadius: 999,
              textTransform: "none",
              fontSize: 12,
              fontWeight: 700,
              gap: 1,
              py: 0.5,
              pl: 0.5,
              pr: 1.5,
              "&.Mui-selected": {
                bgcolor: "var(--md-sys-color-secondary-container)",
                color: "var(--md-sys-color-on-secondary-container)",
              },
              "&.Mui-selected:hover": {
                bgcolor: "var(--md-sys-color-secondary-container)",
              },
            }}
          >
            <Box
              component="span"
              aria-hidden="true"
              sx={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                border: "1px solid var(--md-sys-color-outline-variant)",
                ...(option.color ? { bgcolor: option.color } : { background: "linear-gradient(135deg, #5475BC 50%, #9ACBFA 50%)" }),
              }}
            >
              {selected && <CheckIcon sx={{ fontSize: 14, color: "#fff", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.6))" }} />}
            </Box>
            <Box component="span" sx={{ maxWidth: 144, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {option.label}
            </Box>
          </ToggleButton>
        );
      })}
    </Box>
  );
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
    <Box>
      <FormControlLabel
        labelPlacement="start"
        sx={{ width: "100%", justifyContent: "space-between", ml: 0 }}
        label={t(locale, "settings.songTitles.forceJapanese")}
        slotProps={{ typography: { sx: { fontSize: 14, fontWeight: 700 } } }}
        control={
          <Switch
            checked={on}
            onChange={(event) => {
              setOn(event.target.checked);
              setForceJapaneseTitles(event.target.checked);
            }}
          />
        }
      />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {t(locale, "settings.songTitles.hint")}
      </Typography>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box component="section">
      <Typography variant="overline" component="h3" sx={{ mb: 1, fontWeight: 700, letterSpacing: "0.18em", color: "var(--md-sys-color-primary)" }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}
