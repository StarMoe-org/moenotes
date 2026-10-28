"use client";

import { useId, type ReactNode } from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import GameServerSwitch from "@/components/shared/GameServerSwitch";
import { createSeed } from "@/lib/guess-music/random";
import { ANSWER_MODES, CLIP_LENGTHS, MAX_STRIKES, difficultyMultiplier, type AnswerMode, type ClipSeconds } from "@/lib/guess-music/scoring";
import {
  OPTION_COUNTS,
  PRESET_IDS,
  ROUND_COUNTS,
  TIME_LIMIT_MAX,
  TIME_LIMIT_MIN,
  TIME_LIMIT_STEP,
  applyPreset,
  clampTimeLimit,
  sanitizeSeed,
  type FreePlaySettings,
  type PresetId,
} from "@/lib/guess-music/settings";
import GuessIcon from "./GuessIcon";

export interface FreePlaySetupProps {
  locale: AppLocale;
  settings: FreePlaySettings;
  preset: PresetId;
  onChange: (settings: FreePlaySettings, preset: PresetId) => void;
  server: GameServer;
  servers: readonly GameServer[];
  onServerChange: (server: GameServer) => void;
  songCount: number;
  /** Why the game cannot start, if it cannot. */
  startError: string | null;
  onStart: () => void;
  onShare: () => void;
}

/** M3 single-select segmented buttons, as MoeSekai sets them: the filled segment marks the choice, with no check. */
function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <ToggleButtonGroup exclusive value={value} onChange={(_, next: T | null) => next !== null && onChange(next)} aria-label={label} className="gm-segmented">
      {options.map((option) => (
        <ToggleButton key={option.value} value={option.value}>
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="gm-field">
      {htmlFor ? <label htmlFor={htmlFor} className="gm-label">{label}</label> : <span className="gm-label">{label}</span>}
      {children}
      {hint && <p className="gm-hint">{hint}</p>}
    </div>
  );
}

/** Free-play settings: difficulty preset and its dimensions, questions per game, server, time limit, seed and the rules. */
export default function FreePlaySetup({ locale, settings, preset, onChange, server, servers, onServerChange, songCount, startError, onStart, onShare }: FreePlaySetupProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.setup.${key}`, params);
  const seedId = useId();
  const timeId = useId();
  /** Any change to a difficulty dimension makes the preset custom. */
  const setDimension = (patch: Partial<FreePlaySettings>) => onChange({ ...settings, ...patch }, "custom");
  const setOther = (patch: Partial<FreePlaySettings>) => onChange({ ...settings, ...patch }, preset);
  const multiplier = difficultyMultiplier(settings);
  const seconds = (value: number) => tr("seconds", { seconds: value });

  return (
    <div className="gm-stack" style={{ gap: 16 }}>
      <section className="gm-panel gm-stack">
        <div className="gm-between">
          <h2 className="gm-panel-title">{tr("difficulty")}</h2>
          <span className="gm-chip">
            {tr("multiplier")}
            <span className="gm-num">{tr("multiplierValue", { value: multiplier.toFixed(2) })}</span>
          </span>
        </div>
        <Segmented label={tr("difficulty")} value={preset} options={PRESET_IDS.map((id) => ({ value: id, label: tr(`presets.${id}`) }))} onChange={(next) => onChange(applyPreset(settings, next), next)} />
        <Field label={tr("clipLength")}>
          <Segmented label={tr("clipLength")} value={settings.clipSeconds} options={CLIP_LENGTHS.map((value) => ({ value, label: seconds(value) }))} onChange={(clipSeconds: ClipSeconds) => setDimension({ clipSeconds })} />
        </Field>
        <Field label={tr("answerMode")} hint={tr(`modeHints.${settings.answerMode}`)}>
          <Segmented label={tr("answerMode")} value={settings.answerMode} options={ANSWER_MODES.map((mode) => ({ value: mode, label: tr(`modes.${mode}`) }))} onChange={(answerMode: AnswerMode) => setDimension({ answerMode })} />
        </Field>
        {settings.answerMode === "choice" && (
          <Field label={tr("options")}>
            <Segmented label={tr("options")} value={settings.optionsCount} options={OPTION_COUNTS.map((count) => ({ value: count, label: tr("optionCount", { count }) }))} onChange={(optionsCount) => setDimension({ optionsCount })} />
          </Field>
        )}
        <Field label={tr("vocalRemoval")} hint={tr("vocalHint")}>
          <Segmented
            label={tr("vocalRemoval")}
            value={settings.vocalRemoval ? "on" : "off"}
            options={(["off", "on"] as const).map((value) => ({ value, label: tr(`vocalOptions.${value}`) }))}
            onChange={(value) => setDimension({ vocalRemoval: value === "on" })}
          />
        </Field>
      </section>

      <section className="gm-panel gm-stack">
        <h2 className="gm-panel-title">{tr("match")}</h2>
        <div className="gm-grid-2">
          <Field label={tr("rounds")}>
            <Segmented label={tr("rounds")} value={settings.rounds} options={ROUND_COUNTS.map((count) => ({ value: count, label: tr("roundCount", { count }) }))} onChange={(rounds) => setOther({ rounds })} />
          </Field>
          {servers.length > 1 && (
            <Field label={tr("server")} hint={t(locale, `gameServer.names.${server}`)}>
              <GameServerSwitch locale={locale} value={server} onChange={onServerChange} servers={servers} />
            </Field>
          )}
        </div>
        <Field label={tr("timeLimit")} htmlFor={timeId}>
          <div className="gm-row" style={{ flexWrap: "nowrap", gap: 16 }}>
            <Slider
              min={TIME_LIMIT_MIN}
              max={TIME_LIMIT_MAX}
              step={TIME_LIMIT_STEP}
              value={settings.timeLimit}
              getAriaValueText={seconds}
              onChange={(_, value) => setOther({ timeLimit: clampTimeLimit(value) })}
              slotProps={{ input: { id: timeId } }}
            />
            <span className="gm-label gm-num" style={{ flex: "0 0 auto", minWidth: 48, textAlign: "right" }}>{seconds(settings.timeLimit)}</span>
          </div>
        </Field>
        <Field label={tr("seed")} htmlFor={seedId} hint={tr("seedHint")}>
          <div className="gm-row" style={{ flexWrap: "nowrap" }}>
            <TextField
              id={seedId}
              fullWidth
              size="small"
              value={settings.seed}
              onChange={(event) => setOther({ seed: event.target.value.slice(0, 32) })}
              onBlur={(event) => setOther({ seed: sanitizeSeed(event.target.value) || createSeed() })}
              autoComplete="off"
              slotProps={{ htmlInput: { spellCheck: false, className: "gm-mono" } }}
            />
            <Tooltip title={tr("regenerateSeed")}>
              <IconButton data-variant="outlined" onClick={() => setOther({ seed: createSeed() })} aria-label={tr("regenerateSeed")}>
                <GuessIcon name="refresh" size={20} />
              </IconButton>
            </Tooltip>
            <Button variant="outlined" onClick={onShare} startIcon={<GuessIcon name="share" />} sx={{ flexShrink: 0 }}>
              {tr("share")}
            </Button>
          </div>
        </Field>
      </section>

      <section className="gm-panel gm-panel-soft gm-stack" style={{ gap: 8 }}>
        <h2 className="gm-panel-title gm-panel-title-small">{tr("rulesTitle")}</h2>
        <ul className="gm-rules">
          <li>{tr("rules.rounds", { rounds: settings.rounds })}</li>
          <li>{tr("rules.timer")}</li>
          <li>{tr("rules.strikes", { strikes: MAX_STRIKES })}</li>
          <li>{tr("rules.combo")}</li>
          <li>{tr("rules.seed")}</li>
        </ul>
      </section>

      <div className="gm-stack" style={{ gap: 8 }}>
        <Button size="large" fullWidth onClick={onStart} disabled={Boolean(startError)} startIcon={<GuessIcon name="play" />}>
          {tr("start")}
        </Button>
        <p className="gm-hint" style={{ textAlign: "center" }}>{startError ?? tr("songCount", { count: songCount })}</p>
      </div>
    </div>
  );
}
