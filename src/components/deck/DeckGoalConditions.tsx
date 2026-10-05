import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { SCORE_METRICS, TIME_LIMIT_CHOICES, isChallengeInput, isEventPayoffGoal, readsAccuracy, solverGoalKind, type DeckEvent, type DeckGoalInput, type DeckScoreMetric, type DeckSolverCapabilities } from "@/lib/deck/goals";

/** Inputs that belong to the selected objective; the native engine resolves the declared play. */
export default function DeckGoalConditions({ locale, input, event, capabilities, onChange }: {
  locale: AppLocale; input: DeckGoalInput; event: DeckEvent | null; capabilities: DeckSolverCapabilities | null;
  onChange: (patch: Partial<DeckGoalInput>) => void;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.conditions.${key}`, values);
  const played = readsAccuracy(input);
  const number = (text: string) => text === "" ? NaN : Number(text);
  return <>
    {input.goal !== "power" && !isEventPayoffGoal(input.goal) && <>
      <label>{tr("objective")}<select value={input.scoreMetric} onChange={e => onChange({ scoreMetric: e.target.value as DeckScoreMetric })}>
        {SCORE_METRICS.filter(metric => played || metric !== "scoreAndLife").map(metric => <option key={metric} value={metric}
          disabled={!!capabilities && !(capabilities.metrics[solverGoalKind(input)] ?? []).includes(metric)}>{tr(`metrics.${metric}`)}</option>)}
      </select></label>
      {input.scoreMetric !== "score" && <label>{tr("threshold")}<input type="number" inputMode="numeric" min={0} max={2147483647} step={1}
        value={Number.isFinite(input.threshold) ? input.threshold : ""} onChange={e => onChange({ threshold: number(e.target.value) })} /></label>}
      {input.scoreMetric === "scoreAndLife" && <label>{tr("finalLife")}<input type="number" inputMode="numeric" min={0} max={2147483647} step={1}
        value={Number.isFinite(input.minFinalLife) ? input.minFinalLife : ""} onChange={e => onChange({ minFinalLife: number(e.target.value) })} /></label>}
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
      {input.scoreMetric === "scoreAndLife" && !isEventPayoffGoal(input.goal) && <p className="dw-muted">{tr("lifeNote")}</p>}
    </>}
    {input.goal === "eventItems" && <fieldset className="dc-reward-context"><legend>{tr("rewardContext")}</legend>
      <p className="dw-muted">{tr("rewardNote")}</p>
      {(event?.rewards ?? []).filter(row => row.challenge === isChallengeInput(input)).map(row => <label key={row.id}>
        <input type="checkbox" checked={input.selectedRewards.includes(row.id)} onChange={e => onChange({ rewardContextConfirmed: false,
          selectedRewards: e.target.checked ? [...input.selectedRewards, row.id] : input.selectedRewards.filter(id => id !== row.id) })} />{tr("reward", { id: row.id, n: row.amount })}
      </label>)}
      <div className="dc-field-pair"><label>{tr("currentPoints")}<input type="number" inputMode="numeric" min={0} max={2147483647} step={1}
        value={input.localEventPoints ?? ""} onChange={e => onChange({ rewardContextConfirmed: false, localEventPoints: e.target.value === "" ? null : Number(e.target.value) })} /></label>
        <label>{tr("currentCP")}<input type="number" inputMode="numeric" min={0} max={2147483647} step={1}
          value={input.localChallengePoints ?? ""} onChange={e => onChange({ rewardContextConfirmed: false, localChallengePoints: e.target.value === "" ? null : Number(e.target.value) })} /></label></div>
      <label><input type="checkbox" checked={input.rewardContextConfirmed} onChange={e => onChange({ rewardContextConfirmed: e.target.checked })} />{tr(input.selectedRewards.length ? "rewardConfirm" : "emptyRewardConfirm")}</label>
    </fieldset>}
    <label>{tr("timeLimit")}<select value={input.timeLimit === null ? "none" : String(input.timeLimit)}
      onChange={e => onChange({ timeLimit: e.target.value === "none" ? null : Number(e.target.value) as DeckGoalInput["timeLimit"] })}>
      {TIME_LIMIT_CHOICES.map(seconds => <option key={String(seconds)} value={seconds === null ? "none" : String(seconds)}>{tr(`timeLimits.${seconds === null ? "none" : seconds}`)}</option>)}
    </select></label>
    <p className="dw-muted">{tr("timeLimitNote")}</p>
  </>;
}
