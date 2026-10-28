"use client";

import { useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Badge from "@mui/material/Badge";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Fab from "@mui/material/Fab";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import LinearProgress from "@mui/material/LinearProgress";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Pagination from "@mui/material/Pagination";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Slider from "@mui/material/Slider";
import Snackbar from "@mui/material/Snackbar";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import BrandLogo from "@/components/shared/BrandLogo";
import { withMd3 } from "@/components/md3/Md3Provider";
import type { AppLocale } from "@/config/locales";
import { DEFAULT_ACCENT } from "@/config/settings";
import { t } from "@/i18n";
import { MD3_DEFAULT_SEED } from "@/lib/md3/scheme";
import type { ThemeBandColor } from "@/lib/masterdata/build-settings";
import { useSettings } from "@/lib/settings/use-settings";
import FoundationSection from "./FoundationSection";

interface Props {
  locale: AppLocale;
  bands: ThemeBandColor[];
}

const SECTIONS = ["color", "type", "shape", "buttons", "selection", "inputs", "chips", "feedback", "containers", "navigation", "foundation"] as const;
type SectionId = (typeof SECTIONS)[number];

const k = (key: string) => `designSystem.md3.${key}`;

const icons = {
  plus: <path d="M12 5v14M5 12h14" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  more: <><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></>,
  check: <path d="m5 12 5 5 9-10" />,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
};
function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function Section({ id, locale, children }: { id: SectionId; locale: AppLocale; children: ReactNode }) {
  return (
    <section id={`md3-${id}`} aria-labelledby={`md3-${id}-title`} className="md3-surface scroll-mt-28 p-4 sm:p-6">
      <h2 id={`md3-${id}-title`} className="mb-5 font-[var(--md-ref-typeface-brand)] text-title-large text-on-surface">{t(locale, k(`sections.${id}`))}</h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-title-small text-on-surface-variant">{title}</h3>
      {children}
    </div>
  );
}

function Swatch({ role, label }: { role: string; label?: string }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-shape-md border border-outline-variant">
      <div className="h-14" style={{ background: `var(--md-sys-color-${role})` }} />
      <div className="min-w-0 bg-surface px-3 py-2">
        <div className="truncate text-label-medium text-on-surface">{label ?? role}</div>
        <div className="truncate font-[var(--md-ref-typeface-mono)] text-body-small text-on-surface-variant">--md-sys-color-{role}</div>
      </div>
    </div>
  );
}

function ColorGroup({ locale, group }: { locale: AppLocale; group: string }) {
  return (
    <Sub title={t(locale, k(`roles.${group}`))}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[group, `on-${group}`, `${group}-container`, `on-${group}-container`].map((role) => <Swatch key={role} role={role} />)}
      </div>
    </Sub>
  );
}

function ThemeControls({ locale, bands }: Props) {
  const { settings, updateSettings } = useSettings();
  const seeds = [{ key: DEFAULT_ACCENT, label: t(locale, k("seedDefault")), color: MD3_DEFAULT_SEED }, ...bands.map((band) => ({ key: band.color, label: band.name, color: band.color }))];
  const resolvedTheme = settings.colorScheme === "dark" ? "dark" : settings.colorScheme === "light" ? "light" : null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-2">
        <div className="text-label-large text-on-surface">{t(locale, k("seed"))}</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t(locale, k("seed"))}>
          {seeds.map((seed) => {
            const selected = settings.accentColor === seed.key;
            return (
              <Chip
                key={seed.key}
                variant="filter"
                role="radio"
                aria-checked={selected}
                onClick={() => updateSettings({ accentColor: seed.key })}
                icon={<span className="block h-[18px] w-[18px] rounded-full border border-outline-variant" style={{ background: seed.color }} />}
                label={seed.label}
              />
            );
          })}
        </div>
        <p className="text-body-small text-on-surface-variant">{t(locale, k("seedHint"))}</p>
      </div>
      <div className="min-w-0 space-y-2">
        <div className="text-label-large text-on-surface">{t(locale, k("theme"))}</div>
        <ToggleButtonGroup exclusive value={resolvedTheme} onChange={(_, value: "light" | "dark" | null) => value && updateSettings({ colorScheme: value })} aria-label={t(locale, k("theme"))}>
          <ToggleButton value="light">{t(locale, k("light"))}</ToggleButton>
          <ToggleButton value="dark">{t(locale, k("dark"))}</ToggleButton>
        </ToggleButtonGroup>
      </div>
      <div className="min-w-0 space-y-2">
        <div className="text-label-large text-on-surface">{t(locale, k("density"))}</div>
        <ToggleButtonGroup exclusive value={settings.density} onChange={(_, value: "comfortable" | "compact" | null) => value && updateSettings({ density: value })} aria-label={t(locale, k("density"))}>
          <ToggleButton value="comfortable">{t(locale, k("comfortable"))}</ToggleButton>
          <ToggleButton value="compact">{t(locale, k("compact"))}</ToggleButton>
        </ToggleButtonGroup>
      </div>
    </div>
  );
}

function ColorSection({ locale }: { locale: AppLocale }) {
  return (
    <Section id="color" locale={locale}>
      {["primary", "secondary", "tertiary", "error", "success", "warning"].map((group) => <ColorGroup key={group} locale={locale} group={group} />)}
      <Sub title={t(locale, k("roles.surfaces"))}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["surface", "surface-dim", "surface-bright", "surface-container-lowest", "surface-container-low", "surface-container", "surface-container-high", "surface-container-highest", "on-surface", "on-surface-variant", "inverse-surface", "inverse-on-surface"].map((role) => <Swatch key={role} role={role} />)}
        </div>
      </Sub>
      <Sub title={t(locale, k("roles.outline"))}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["outline", "outline-variant", "inverse-primary", "scrim"].map((role) => <Swatch key={role} role={role} />)}
        </div>
      </Sub>
      <Sub title={t(locale, k("roles.categories"))}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="flex min-w-0 flex-col overflow-hidden rounded-shape-md border border-outline-variant">
              <div className="h-10" style={{ background: `var(--md-sys-color-category${n})` }} />
              <div className="px-3 py-2 text-label-medium" style={{ background: `var(--md-sys-color-category${n}-container)`, color: `var(--md-sys-color-on-category${n}-container)` }}>category{n}</div>
            </div>
          ))}
        </div>
      </Sub>
    </Section>
  );
}

function TypeSection({ locale }: { locale: AppLocale }) {
  const scale = ["displayLarge", "displayMedium", "displaySmall", "headlineLarge", "headlineMedium", "headlineSmall", "titleLarge", "titleMedium", "titleSmall", "labelLarge", "labelMedium", "labelSmall", "bodyLarge", "bodyMedium", "bodySmall"] as const;
  const sample = t(locale, "designSystem.title");
  return (
    <Section id="type" locale={locale}>
      <div className="divide-y divide-outline-variant">
        {scale.map((variant) => (
          <div key={variant} className="flex min-w-0 flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:gap-6">
            <span className="w-36 shrink-0 font-[var(--md-ref-typeface-mono)] text-body-small text-on-surface-variant">{variant}</span>
            <Typography variant={variant} component="span" className="min-w-0 truncate text-on-surface">{sample}</Typography>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ShapeSection({ locale }: { locale: AppLocale }) {
  const shapes = [["none", "none"], ["extraSmall", "extra-small"], ["small", "small"], ["medium", "medium"], ["large", "large"], ["extraLarge", "extra-large"], ["full", "full"]] as const;
  return (
    <Section id="shape" locale={locale}>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-7">
        {shapes.map(([key, token]) => (
          <div key={key} className="flex flex-col items-center gap-2">
            <div className="h-16 w-16 bg-primary-container" style={{ borderRadius: `var(--md-sys-shape-corner-${token})` }} />
            <span className="text-center text-label-medium text-on-surface-variant">{t(locale, k(`shapes.${key}`))}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <div key={level} className="grid h-20 place-items-center rounded-shape-md bg-surface-container-low text-label-medium text-on-surface" style={{ boxShadow: `var(--md-sys-elevation-level${level})` }}>
            {t(locale, k("elevation"), { n: level })}
          </div>
        ))}
      </div>
    </Section>
  );
}

function ButtonsSection({ locale }: { locale: AppLocale }) {
  const variants = ["filled", "tonal", "elevated", "outlined", "text"] as const;
  const [favorite, setFavorite] = useState(true);
  return (
    <Section id="buttons" locale={locale}>
      <div className="flex flex-wrap items-center gap-3">
        {variants.map((variant) => <Button key={variant} variant={variant}>{t(locale, k(`buttonsList.${variant}`))}</Button>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {variants.map((variant) => <Button key={variant} variant={variant} startIcon={<Icon name="plus" />}>{t(locale, k("buttonsList.withIcon"))}</Button>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {variants.map((variant) => <Button key={variant} variant={variant} disabled>{t(locale, k("buttonsList.disabled"))}</Button>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="small">{t(locale, k("buttonsList.small"))}</Button>
        <Button>{t(locale, k("buttonsList.filled"))}</Button>
        <Button size="large">{t(locale, k("buttonsList.large"))}</Button>
        <Button variant="tonal" color="error">{t(locale, k("roles.error"))}</Button>
        <Button variant="outlined" color="tertiary">{t(locale, k("roles.tertiary"))}</Button>
      </div>
      <Sub title={t(locale, k("iconButtons"))}>
        <div className="flex flex-wrap items-center gap-3">
          <IconButton aria-label={t(locale, k("settings"))}><Icon name="settings" /></IconButton>
          <IconButton data-variant="filled" aria-label={t(locale, k("settings"))}><Icon name="settings" /></IconButton>
          <IconButton data-variant="tonal" aria-label={t(locale, k("settings"))}><Icon name="settings" /></IconButton>
          <IconButton data-variant="outlined" aria-label={t(locale, k("settings"))}><Icon name="settings" /></IconButton>
          <IconButton data-variant="filled" aria-pressed={favorite} aria-label={t(locale, k("favorite"))} onClick={() => setFavorite((value) => !value)}><Icon name="heart" /></IconButton>
          <IconButton aria-label={t(locale, k("settings"))} disabled><Icon name="settings" /></IconButton>
        </div>
      </Sub>
      <Sub title={t(locale, k("buttonsList.fab"))}>
        <div className="flex flex-wrap items-center gap-4">
          <Fab size="small" aria-label={t(locale, k("buttonsList.extendedFab"))}><Icon name="plus" /></Fab>
          <Fab aria-label={t(locale, k("buttonsList.extendedFab"))}><Icon name="plus" /></Fab>
          <Fab color="secondary" aria-label={t(locale, k("buttonsList.extendedFab"))}><Icon name="plus" /></Fab>
          <Fab color="tertiary" aria-label={t(locale, k("buttonsList.extendedFab"))}><Icon name="plus" /></Fab>
          <Fab color="surface" aria-label={t(locale, k("buttonsList.extendedFab"))}><Icon name="plus" /></Fab>
          <Fab variant="extended"><Icon name="plus" />{t(locale, k("buttonsList.extendedFab"))}</Fab>
        </div>
      </Sub>
    </Section>
  );
}

function SelectionSection({ locale }: { locale: AppLocale }) {
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("day");
  const [on, setOn] = useState(true);
  const [slider, setSlider] = useState(40);
  const [range, setRange] = useState<number[]>([20, 70]);
  const [segment, setSegment] = useState("week");
  const [multi, setMulti] = useState<string[]>(["day"]);
  const periods = ["day", "week", "month"] as const;
  return (
    <Section id="selection" locale={locale}>
      <div className="grid gap-6 md:grid-cols-2">
        <Sub title={t(locale, k("selectionList.checkbox"))}>
          <div className="flex flex-wrap items-center">
            <FormControlLabel control={<Checkbox checked={checked} onChange={(event) => setChecked(event.target.checked)} />} label={t(locale, k("selectionList.switchLabel"))} />
            <FormControlLabel control={<Checkbox indeterminate />} label={t(locale, k("selectionList.week"))} />
            <FormControlLabel control={<Checkbox disabled />} label={t(locale, k("buttonsList.disabled"))} />
          </div>
        </Sub>
        <Sub title={t(locale, k("selectionList.radio"))}>
          <RadioGroup row value={radio} onChange={(event) => setRadio(event.target.value)}>
            {periods.map((period) => <FormControlLabel key={period} value={period} control={<Radio />} label={t(locale, k(`selectionList.${period}`))} />)}
          </RadioGroup>
        </Sub>
        <Sub title={t(locale, k("selectionList.switchLabel"))}>
          <div className="flex items-center gap-2">
            <Switch checked={on} onChange={(event) => setOn(event.target.checked)} slotProps={{ input: { "aria-label": t(locale, k("selectionList.switchLabel")) } }} />
            <Switch disabled slotProps={{ input: { "aria-label": t(locale, k("buttonsList.disabled")) } }} />
            <Switch checked disabled slotProps={{ input: { "aria-label": t(locale, k("buttonsList.disabled")) } }} />
          </div>
        </Sub>
        <Sub title={t(locale, k("selectionList.slider"))}>
          <Slider value={slider} onChange={(_, value) => setSlider(value as number)} valueLabelDisplay="auto" aria-label={t(locale, k("selectionList.slider"))} />
          <Slider value={range} onChange={(_, value) => setRange(value as number[])} valueLabelDisplay="auto" step={10} marks getAriaLabel={() => t(locale, k("selectionList.slider"))} />
        </Sub>
      </div>
      <Sub title={t(locale, k("selectionList.segmented"))}>
        <div className="flex flex-wrap gap-4">
          <ToggleButtonGroup exclusive value={segment} onChange={(_, value: string | null) => value && setSegment(value)} aria-label={t(locale, k("selectionList.segmented"))}>
            {periods.map((period) => <ToggleButton key={period} value={period}>{segment === period ? <Icon name="check" /> : null}{t(locale, k(`selectionList.${period}`))}</ToggleButton>)}
          </ToggleButtonGroup>
          <ToggleButtonGroup value={multi} onChange={(_, value: string[]) => setMulti(value)} aria-label={t(locale, k("selectionList.segmented"))}>
            {periods.map((period) => <ToggleButton key={period} value={period}>{t(locale, k(`selectionList.${period}`))}</ToggleButton>)}
          </ToggleButtonGroup>
        </div>
      </Sub>
    </Section>
  );
}

function InputsSection({ locale, bands }: Props) {
  const [name, setName] = useState("");
  const [server, setServer] = useState("jp");
  const bandNames = bands.map((band) => band.name);
  return (
    <Section id="inputs" locale={locale}>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label={t(locale, k("inputsList.label"))} helperText={t(locale, k("inputsList.helper"))} value={name} onChange={(event) => setName(event.target.value)} />
        <TextField variant="filled" label={t(locale, k("inputsList.label"))} helperText={t(locale, k("inputsList.helper"))} />
        <TextField error label={t(locale, k("inputsList.label"))} helperText={t(locale, k("inputsList.error"))} />
        <TextField label={t(locale, k("inputsList.label"))} disabled />
        <TextField select label={t(locale, k("inputsList.select"))} value={server} onChange={(event) => setServer(event.target.value)}>
          {["jp", "tw", "kr", "en"].map((value) => <MenuItem key={value} value={value}>{value.toUpperCase()}</MenuItem>)}
        </TextField>
        <Autocomplete options={bandNames} renderInput={(params) => <TextField {...params} label={t(locale, k("inputsList.autocomplete"))} />} />
        <TextField
          className="md:col-span-2"
          placeholder={t(locale, k("inputsList.search"))}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><Icon name="search" /></InputAdornment>, sx: { borderRadius: "var(--md-sys-shape-corner-full)", backgroundColor: "var(--md-sys-color-surface-container-high)", "& .MuiOutlinedInput-notchedOutline": { borderColor: "transparent" } } }, htmlInput: { "aria-label": t(locale, k("inputsList.search")) } }}
        />
      </div>
    </Section>
  );
}

function ChipsSection({ locale }: { locale: AppLocale }) {
  const [filters, setFilters] = useState<string[]>(["day"]);
  const toggle = (value: string) => setFilters((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  return (
    <Section id="chips" locale={locale}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip variant="assist" label={t(locale, k("chipsList.assist"))} icon={<Icon name="bell" />} onClick={() => {}} />
        {(["day", "week", "month"] as const).map((value) => (
          <Chip key={value} variant="filter" aria-pressed={filters.includes(value)} icon={filters.includes(value) ? <Icon name="check" /> : undefined} label={t(locale, k(`selectionList.${value}`))} onClick={() => toggle(value)} />
        ))}
        <Chip variant="input" label={t(locale, k("chipsList.input"))} onDelete={() => {}} />
        <Chip variant="assist" label={t(locale, k("chipsList.suggestion"))} onClick={() => {}} />
        <Chip variant="filter" label={t(locale, k("buttonsList.disabled"))} disabled />
      </div>
      <Sub title={t(locale, k("chipsList.tonal"))}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip variant="tonal" color="success" label={t(locale, k("chipsList.ongoing"))} />
          <Chip variant="tonal" color="tertiary" label={t(locale, k("chipsList.upcoming"))} />
          <Chip variant="tonal" label={t(locale, k("chipsList.ended"))} />
          <Chip variant="tonal" color="error" label={t(locale, k("roles.error"))} />
          <Chip variant="tonal" color="warning" label={t(locale, k("roles.warning"))} />
        </div>
      </Sub>
    </Section>
  );
}

function FeedbackSection({ locale }: { locale: AppLocale }) {
  const [snackbar, setSnackbar] = useState(false);
  return (
    <Section id="feedback" locale={locale}>
      <Sub title={t(locale, k("feedbackList.progress"))}>
        <div className="flex flex-wrap items-center gap-6">
          <CircularProgress aria-label={t(locale, k("feedbackList.progress"))} />
          <CircularProgress variant="determinate" value={64} aria-label={t(locale, k("feedbackList.progress"))} />
          <div className="min-w-48 flex-1 space-y-3">
            <LinearProgress aria-label={t(locale, k("feedbackList.progress"))} />
            <LinearProgress variant="determinate" value={64} aria-label={t(locale, k("feedbackList.progress"))} />
          </div>
        </div>
      </Sub>
      <Sub title={t(locale, k("feedbackList.alert"))}>
        <div className="grid gap-2 md:grid-cols-2">
          <Alert severity="info">{t(locale, k("feedbackList.alertInfo"))}</Alert>
          <Alert severity="success">{t(locale, k("feedbackList.alertSuccess"))}</Alert>
          <Alert severity="warning">{t(locale, k("feedbackList.alertWarning"))}</Alert>
          <Alert severity="error">{t(locale, k("feedbackList.alertError"))}</Alert>
        </div>
      </Sub>
      <div className="flex flex-wrap items-center gap-6">
        <Button variant="tonal" onClick={() => setSnackbar(true)}>{t(locale, k("feedbackList.showSnackbar"))}</Button>
        <Tooltip title={t(locale, k("feedbackList.tooltipText"))}>
          <Button variant="outlined">{t(locale, k("feedbackList.tooltip"))}</Button>
        </Tooltip>
        <Badge badgeContent={8} color="error">
          <IconButton aria-label={t(locale, k("feedbackList.badge"))}><Icon name="bell" /></IconButton>
        </Badge>
        <Badge variant="dot" color="error">
          <IconButton aria-label={t(locale, k("feedbackList.badge"))}><Icon name="bell" /></IconButton>
        </Badge>
      </div>
      <Snackbar
        open={snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(false)}
        message={t(locale, k("feedbackList.snackbarText"))}
        action={<Button variant="text" size="small" sx={{ color: "var(--md-sys-color-inverse-primary)" }} onClick={() => setSnackbar(false)}>{t(locale, k("feedbackList.undo"))}</Button>}
      />
    </Section>
  );
}

function ContainersSection({ locale }: { locale: AppLocale }) {
  const [dialog, setDialog] = useState(false);
  const cards = [["elevated", "elevated"], ["filled", "filled"], ["outlined", "outlined"]] as const;
  return (
    <Section id="containers" locale={locale}>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(([key, variant]) => (
          <Card key={key} variant={variant}>
            <CardActionArea>
              <CardContent>
                <div className="text-title-medium text-on-surface">{t(locale, k(`containersList.${key}`))}</div>
                <p className="mt-1 text-body-medium text-on-surface-variant">{t(locale, k("containersList.cardBody"))}</p>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </div>
      <Sub title={t(locale, k("containersList.listCard"))}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((n) => (
            <a key={n} href={`#md3-containers`} className="md3-list-card block p-3">
              <div className="mb-2 aspect-[4/3] rounded-shape-sm md3-placeholder" />
              <div className="truncate text-title-small text-on-surface">{t(locale, "designSystem.foundation.sampleItem", { n })}</div>
              <div className="text-body-small text-on-surface-variant">{t(locale, k("chipsList.ongoing"))}</div>
            </a>
          ))}
        </div>
      </Sub>
      <Button variant="tonal" onClick={() => setDialog(true)}>{t(locale, k("containersList.openDialog"))}</Button>
      <Dialog open={dialog} onClose={() => setDialog(false)} aria-labelledby="md3-dialog-title" maxWidth="xs" fullWidth>
        <DialogTitle id="md3-dialog-title">{t(locale, k("containersList.dialogTitle"))}</DialogTitle>
        <DialogContent>{t(locale, k("containersList.dialogBody"))}</DialogContent>
        <DialogActions>
          <Button variant="text" onClick={() => setDialog(false)}>{t(locale, k("containersList.cancel"))}</Button>
          <Button variant="text" onClick={() => setDialog(false)}>{t(locale, k("containersList.confirm"))}</Button>
        </DialogActions>
      </Dialog>
    </Section>
  );
}

function NavigationSection({ locale }: { locale: AppLocale }) {
  const [tab, setTab] = useState(0);
  const [page, setPage] = useState(3);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <Section id="navigation" locale={locale}>
      <Sub title={t(locale, k("navigationList.tabs"))}>
        <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" allowScrollButtonsMobile aria-label={t(locale, k("navigationList.tabs"))}>
          {(["day", "week", "month"] as const).map((period) => <Tab key={period} label={t(locale, k(`selectionList.${period}`))} />)}
        </Tabs>
      </Sub>
      <Sub title={t(locale, k("navigationList.pagination"))}>
        <Pagination count={12} page={page} onChange={(_, value) => setPage(value)} siblingCount={1} />
      </Sub>
      <Sub title={t(locale, k("navigationList.menu"))}>
        <Button variant="outlined" endIcon={<Icon name="more" />} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={(event) => setAnchor(event.currentTarget)}>
          {t(locale, k("navigationList.openMenu"))}
        </Button>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          {(["edit", "duplicate", "remove"] as const).map((item) => <MenuItem key={item} onClick={() => setAnchor(null)}>{t(locale, k(`navigationList.${item}`))}</MenuItem>)}
        </Menu>
      </Sub>
    </Section>
  );
}

function DesignSystemPage({ locale, bands }: Props) {
  const [section, setSection] = useState<SectionId>("color");
  const jump = (id: SectionId) => {
    setSection(id);
    document.getElementById(`md3-${id}`)?.scrollIntoView({ block: "start" });
  };
  return (
    <div className="space-y-6">
      <header className="md3-surface overflow-hidden p-6 sm:p-8">
        <BrandLogo className="mn-brand-system" />
        <Chip variant="tonal" color="primary" label={t(locale, k("badge"))} />
        <h1 className="mt-3 font-[var(--md-ref-typeface-brand)] text-headline-large text-on-surface">{t(locale, "designSystem.title")}</h1>
        <p className="mt-2 max-w-3xl text-body-large text-on-surface-variant">{t(locale, k("intro"))}</p>
        <div className="mt-6">
          <ThemeControls locale={locale} bands={bands} />
        </div>
      </header>
      <nav className="sticky top-[var(--md-app-bar-height,64px)] z-20 -mx-1 bg-surface" aria-label={t(locale, "designSystem.title")}>
        <Tabs value={section} onChange={(_, value: SectionId) => jump(value)} variant="scrollable" allowScrollButtonsMobile>
          {SECTIONS.map((id) => <Tab key={id} value={id} label={t(locale, k(`sections.${id}`))} />)}
        </Tabs>
      </nav>
      <ColorSection locale={locale} />
      <TypeSection locale={locale} />
      <ShapeSection locale={locale} />
      <ButtonsSection locale={locale} />
      <SelectionSection locale={locale} />
      <InputsSection locale={locale} bands={bands} />
      <ChipsSection locale={locale} />
      <FeedbackSection locale={locale} />
      <ContainersSection locale={locale} />
      <NavigationSection locale={locale} />
      <Section id="foundation" locale={locale}>
        <FoundationSection locale={locale} />
      </Section>
    </div>
  );
}

export default withMd3(DesignSystemPage);
