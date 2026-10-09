import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { CHALLENGE_POINT_PRIORITIES, RECOMMENDATION_COUNT, TIME_LIMIT_CHOICES, computes, effectiveAggregation, readsAccuracy, type DeckGoalInput, type DeckSolverCapabilities } from "@/lib/deck/goals";

/** Inputs that belong to the selected objective; the native engine resolves the declared play. */
export default function DeckGoalConditions({ locale, input, capabilities, onChange }: {
  locale: AppLocale; input: DeckGoalInput; capabilities: DeckSolverCapabilities | null;
  onChange: (patch: Partial<DeckGoalInput>) => void;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.conditions.${key}`, values);
  const played = readsAccuracy(input);
  const number = (text: string) => text === "" ? NaN : Number(text);
  return <>
    {input.goal === "challengePoints" && <>
      <label>{tr("secondaryPriority")}<select value={input.secondaryPriority ?? "none"}
        onChange={e => onChange({ secondaryPriority: e.target.value === "none" ? null : e.target.value as DeckGoalInput["secondaryPriority"] })}>
        <option value="none">{tr("priorities.none")}</option>
        {CHALLENGE_POINT_PRIORITIES.map(priority => <option key={priority} value={priority}>{tr(`priorities.${priority}`)}</option>)}
      </select></label>
      {input.secondaryPriority !== null && <>
        <p className="dw-muted">{tr("priorityNote")}</p>
        <p className="dw-muted">{tr("priorityTeams", { n: RECOMMENDATION_COUNT })}</p>
        {(effectiveAggregation(input) !== "expected" || !capabilities || !computes(capabilities, input))
          && <p className="dw-muted" role="status">{tr(effectiveAggregation(input) !== "expected" ? "priorityExpectedOnly" : "priorityUnsupported")}</p>}
      </>}
    </>}
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
