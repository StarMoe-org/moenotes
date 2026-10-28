import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { TIME_LIMIT_CHOICES, readsAccuracy, type DeckGoalInput, type DeckSolverCapabilities } from "@/lib/deck/goals";
import { DeckNumberField, DeckSelect } from "./DeckControls";

/** Inputs that belong to the selected objective; the native engine resolves the declared play. */
export default function DeckGoalConditions({ locale, input, capabilities, onChange }: {
  locale: AppLocale; input: DeckGoalInput; capabilities: DeckSolverCapabilities | null;
  onChange: (patch: Partial<DeckGoalInput>) => void;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.conditions.${key}`, values);
  const played = readsAccuracy(input);
  return (
    <>
      {played && (
        <>
          <DeckSelect
            label={tr("play")}
            value={input.playMode}
            onChange={(playMode) => onChange({ playMode })}
            options={[
              { value: "accuracy" as const, label: tr("accuracy") },
              { value: "pattern" as const, label: tr("pattern"), disabled: !capabilities?.patternPlay },
            ]}
          />
          {input.playMode === "pattern" && (
            <div className="dc-sub-stack">
              <DeckNumberField
                label={tr("missEvery")}
                min={0}
                max={2147483647}
                step={1}
                inputMode="numeric"
                value={Number.isFinite(input.missEvery) ? input.missEvery : null}
                onChange={(next) => onChange({ missEvery: next === null ? NaN : next })}
              />
              <p className="dc-field-hint">{tr(input.missEvery === 0 ? "noMiss" : "missPattern", { n: input.missEvery })}</p>
              <p className="dc-field-hint">{tr("patternNote")}</p>
            </div>
          )}
        </>
      )}
      {input.goal === "eventItems" && <p className="dc-field-hint">{tr("eventItemsNote")}</p>}
      <div className="dc-sub-stack">
        <DeckSelect
          label={tr("timeLimit")}
          value={input.timeLimit === null ? "none" : String(input.timeLimit)}
          onChange={(raw) => onChange({ timeLimit: raw === "none" ? null : (Number(raw) as DeckGoalInput["timeLimit"]) })}
          options={TIME_LIMIT_CHOICES.map((seconds) => ({
            value: seconds === null ? "none" : String(seconds),
            label: tr(`timeLimits.${seconds === null ? "none" : seconds}`),
          }))}
        />
        <p className="dc-field-hint">{tr("timeLimitNote")}</p>
      </div>
    </>
  );
}
