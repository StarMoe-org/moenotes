import { useId } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import LevelSwitch, { RoundButton } from "@/components/shared/LevelSwitch";

export function LevelControl({
  locale,
  level,
  limit,
  onChange,
}: {
  locale: AppLocale;
  level: number;
  limit: number;
  onChange: (level: number) => void;
}) {
  const labelId = useId();
  const update = (next: number) => onChange(Math.min(Math.max(next, 1), limit));

  return (
    <MdMuiProvider>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
          <Typography id={labelId} variant="body2" sx={{ fontWeight: 600, color: "var(--md-sys-color-on-surface-variant)" }}>{t(locale, "cards.growth.level")}</Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--md-sys-color-on-surface)" }}>{t(locale, "cards.growth.levelValue", { level, limit })}</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <RoundButton label={t(locale, "cards.growth.decrease")} disabled={level <= 1} onClick={() => update(level - 1)}>
            <path strokeLinecap="round" d="M5 12h14" />
          </RoundButton>
          <Slider
            min={1}
            max={limit}
            value={level}
            onChange={(_event, next) => update(Array.isArray(next) ? next[0] ?? 1 : next)}
            aria-labelledby={labelId}
            sx={{ flex: 1, minWidth: 0 }}
          />
          <RoundButton label={t(locale, "cards.growth.increase")} disabled={level >= limit} onClick={() => update(level + 1)}>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </RoundButton>
          <Button variant="outlined" size="small" disabled={level >= limit} onClick={() => update(limit)} sx={{ flexShrink: 0 }}>
            {t(locale, "cards.growth.max")}
          </Button>
        </Box>
      </Box>
    </MdMuiProvider>
  );
}

/** Segmented step picker (training, awaken, skill level): the shared LevelSwitch. */
export function StepControl({
  label,
  value,
  options,
  formatOption = String,
  onChange,
}: {
  label: string;
  value: number;
  options: number[];
  formatOption?: (option: number, index: number) => string;
  onChange: (value: number) => void;
}) {
  return <LevelSwitch label={label} value={value} options={options} formatOption={formatOption} onChange={onChange} />;
}

/** Unknown observations remain nullable; an unverified level ceiling never creates a Max action. */
export function ObservedLevelControl({ locale, value, onChange, label, limit }: {
  locale: AppLocale; value: number | null; onChange: (value: number | null) => void; label?: string | undefined; limit?: number | undefined;
}) {
  const inputId = useId();
  const update = (next: number) => { if (Number.isSafeInteger(next) && next >= 1 && (limit === undefined || next <= limit)) onChange(next); };
  return <div className="mn-observed-level">
    {value !== null && limit !== undefined ? <LevelControl locale={locale} level={value} limit={limit} onChange={update} /> : <>
      <label htmlFor={inputId}>{label ?? t(locale, "cards.growth.level")}</label>
      <div className="mn-observed-level-input"><RoundButton label={t(locale, "cards.growth.decrease")} disabled={value === null || value <= 1} onClick={() => value !== null && update(value - 1)}><path strokeLinecap="round" d="M5 12h14" /></RoundButton>
        <input id={inputId} type="number" inputMode="numeric" min={1} max={limit} value={value ?? ""} placeholder={t(locale, "deckWorkspace.unknown")}
          onChange={event => event.target.value === "" ? onChange(null) : update(Number(event.target.value))} />
        <RoundButton label={t(locale, "cards.growth.increase")} disabled={value === null || limit !== undefined && value >= limit} onClick={() => value !== null && update(value + 1)}><path strokeLinecap="round" d="M12 5v14M5 12h14" /></RoundButton>
      </div>
    </>}
    <button type="button" aria-pressed={value === null} onClick={() => onChange(null)}>{t(locale, "deckWorkspace.unknown")}</button>
  </div>;
}
