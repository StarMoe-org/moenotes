import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { TIME_LIMIT_CHOICES, readsAccuracy, type DeckGoalInput, type DeckSolverCapabilities } from "@/lib/deck/goals";

/** Inputs that belong to the selected objective; the native engine resolves the declared play. */
export default function DeckGoalConditions({ locale, input, capabilities, onChange }: {
  locale: AppLocale; input: DeckGoalInput; capabilities: DeckSolverCapabilities | null;
  onChange: (patch: Partial<DeckGoalInput>) => void;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.conditions.${key}`, values);
  const played = readsAccuracy(input);
  const number = (text: string) => text === "" ? NaN : Number(text);
  return <>
    {played && <>
      <label>{tr("play")}<select value={input.playMode} onChange={e => onChange({ playMode: e.target.value as DeckGoalInput["playMode"] })}>
        <option value="accuracy">{tr("accuracy")}</option><option value="pattern" disabled={!capabilities?.patternPlay}>{tr("pattern")}</option>
      </select></label>
      {input.playMode === "pattern" && <>
        <label>{tr("missEvery")}<input type="number" inputMode="numeric" min={0} max={2147483647} step={1}
          value={Number.isFinite(input.missEvery) ? input.missEvery : ""} onChange={e => onChange({ missEvery: number(e.target.value) })} /></label>
        <p className="dw-muted">{tr(input.missEvery === 0 ? "noMiss" : "missPattern", { n: input.missEvery })}</p>
        <p className="dw-muted">{tr("patternNote")}</p>
      </>}
    </>}
    {input.goal === "eventItems" && <p className="dw-muted">{tr("eventItemsNote")}</p>}
    <label>{tr("timeLimit")}<select value={input.timeLimit === null ? "none" : String(input.timeLimit)}
      onChange={e => onChange({ timeLimit: e.target.value === "none" ? null : Number(e.target.value) as DeckGoalInput["timeLimit"] })}>
      {TIME_LIMIT_CHOICES.map(seconds => <option key={String(seconds)} value={seconds === null ? "none" : String(seconds)}>{tr(`timeLimits.${seconds === null ? "none" : seconds}`)}</option>)}
    </select></label>
    <p className="dw-muted">{tr("timeLimitNote")}</p>
  </>;
}
