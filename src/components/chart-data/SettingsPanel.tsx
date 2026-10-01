import { startTransition, useEffect, useState } from "react";
import { X_MAX, meanSkill } from "@/lib/chart-data/ranking";
import { RANGES, RANK_MAX, type ScenarioId } from "@/lib/chart-data/scenario";
import { SKILL_SLOTS } from "@/lib/chart-data/query";
import { Seg, type ChartDataContext } from "./shared";

const PRESETS = [["all150", 150], ["all100", 100], ["none", 0]] as const;
const TARGETS = ["SS", "S", "A", "B"] as const;
const RANK_OPTIONS = [...Array(RANK_MAX).keys()].map((k) => String(k + 1));
/** Gekisou mission ids (music-data.json `gekisouMissions`). */
export const MISSIONS: Readonly<Record<number, string>> = { 1: "combo", 2: "luck", 3: "just" };

/** A number input that keeps what is typed while it is being edited and reports the clamped value. */
function NumberInput({ value, onValue, className, min = 0, max, step, placeholder, label }: {
  value: number;
  onValue: (value: number) => void;
  className: string;
  min?: number;
  max?: number;
  step: number;
  placeholder?: string;
  label: string;
}) {
  const shown = placeholder && !value ? "" : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText((current) => ((Number(current) || 0) === value ? current : shown)), [shown, value]);
  return (
    <input
      type="number"
      inputMode="numeric"
      className={`mn-cd-num ${className}`}
      min={min}
      max={max}
      step={step}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      onChange={(event) => {
        setText(event.target.value);
        const v = Number(event.target.value) || 0;
        onValue(Math.max(min, max === undefined ? v : Math.min(max, v)));
      }}
      onBlur={() => setText(shown)}
    />
  );
}

function AccuracySlider({ label, value, disabled = false, onValue, max = 100, step = 1, format = (v: number) => `${v}%` }: { label: string; value: number; disabled?: boolean; onValue: (value: number) => void; max?: number; step?: number; format?: (value: number) => string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (input: HTMLInputElement) => { const next = Number(input.value); if (next !== value) startTransition(() => onValue(next)); };
  return <label className="mn-cd-field"><span>{label}</span><input type="range" min={0} max={max} step={step} value={draft} disabled={disabled} aria-label={label} onChange={event => setDraft(Number(event.target.value))} onPointerUp={event => commit(event.currentTarget)} onPointerCancel={event => commit(event.currentTarget)} onKeyUp={event => commit(event.currentTarget)} onBlur={event => commit(event.currentTarget)} /><output>{format(draft)}</output></label>;
}

/**
 * The reference play scenario: Gekisou Live at a rank per range, or Free Live.
 * `rooms` adds the Gekisou Live room size (score ranks), `missions` names the ranges after a song's
 * Gekisou missions. Every change refigures the rows at once.
 */
export function ScenarioPanel({ ctx, rooms = false, missions = null }: { ctx: ChartDataContext; rooms?: boolean; missions?: readonly number[] | null }) {
  const { tr, state, update, support } = ctx;
  const battle = state.mode === "battle";
  const rangeLabel = (i: number) => {
    const code = missions ? MISSIONS[missions[i] ?? 0] : undefined;
    return code ? tr("scenario.rangeMission", { n: i + 1, mission: tr(`missions.${code}`) }) : tr("scenario.range", { n: i + 1 });
  };
  return (
    <div className="mn-cd-panel mn-cd-scen">
      <div className="mn-cd-field">
        <span>{tr("scenario.title")}</span>
        <Seg<ScenarioId>
          label={tr("scenario.title")}
          value={state.mode}
          onPick={(mode) => update({ mode })}
          options={[
            { value: "battle", label: tr("scenario.battle") },
            { value: "free", label: support.free ? tr("scenario.free") : `${tr("scenario.free")} · ${tr("scenario.pending")}`, disabled: !support.free },
          ]}
        />
      </div>
      {battle ? (
        <div className="mn-cd-field">
          <span title={tr("scenario.best")}>{tr("scenario.ranks")}</span>
          {[...Array(RANGES).keys()].map((i) => (
            <span key={i} className="mn-cd-rk-pick">
              <small>{rangeLabel(i)}</small>
              <Seg
                variant="mini"
                label={rangeLabel(i)}
                value={String(state.ranks[i] ?? 1)}
                onPick={(v) => update({ ranks: state.ranks.map((x, j) => (j === i ? Number(v) : x)) })}
                options={RANK_OPTIONS.map((r) => ({ value: r, label: r, disabled: r !== "1" && !support.ranks }))}
              />
            </span>
          ))}
          {!support.ranks ? <small className="mn-cd-note">{tr("scenario.ranksPending")}</small> : null}
        </div>
      ) : null}
      <div className="mn-cd-field">
        <span title={tr(battle ? "scenario.accNote" : "scenario.accNoteFree")}>{tr("scenario.accuracy")}</span>
        <AccuracySlider label={tr("scenario.great")} value={state.great} onValue={great => update({ great })} />
        {battle ? <AccuracySlider label={tr("scenario.just")} value={state.just} disabled={!support.just} onValue={just => update({ just })} /> : null}
        <abbr className="mn-cd-note" title={tr(battle ? "scenario.accNote" : "scenario.accNoteFree")}>{tr("referenceEstimate")}</abbr>
      </div>
      {rooms && battle ? (
        <div className="mn-cd-field">
          <span title={tr("scenario.roomHint")}>{tr("scenario.room")}</span>
          <Seg variant="mini" label={tr("scenario.room")} value={String(state.room)} onPick={(v) => update({ room: Number(v) })} options={RANK_OPTIONS.map((r) => ({ value: r, label: r }))} />
        </div>
      ) : null}
    </div>
  );
}

/** The efficiency settings: length, overhead, skills; for the event ranking the target and power; the frontier filter. */
export default function SettingsPanel({ ctx, event = false, frontier = false, aptitude = false }: { ctx: ChartDataContext; event?: boolean; frontier?: boolean; aptitude?: boolean }) {
  const { tr, state, update } = ctx;
  const setSkill = (i: number, v: number) => update({ skills: state.skills.map((x, j) => (j === i ? v : x)) });
  return (
    <div className="mn-cd-panel">
      {!aptitude ? <>
      <div className="mn-cd-field">
        <span>{tr("length")}</span>
        <Seg label={tr("length")} value={state.len} onPick={(len) => update({ len })} options={[{ value: "bgm", label: tr("bgm") }, { value: "chart", label: tr("chart") }]} />
      </div>
      <AccuracySlider label={tr("overhead")} value={state.overhead} max={180} step={5} onValue={overhead => update({ overhead })} format={v => tr("seconds", { n: v })} />
      </> : null}
      <div className="mn-cd-field">
        <span>{tr("skills")}</span>
        <div className="mn-cd-skills">
          {state.skills.slice(0, SKILL_SLOTS).map((x, i) => (
            <NumberInput key={i} className="skill" value={x} max={100 * X_MAX} step={5} label={tr("skillSlot", { n: i + 1 })} onValue={(v) => setSkill(i, v)} />
          ))}
          <output className="mn-cd-mean">{tr("meanSkill", { v: Math.round(100 * meanSkill(ctx.skills, SKILL_SLOTS)) })}</output>
          {PRESETS.map(([key, v]) => (
            <button key={key} type="button" className="mn-cd-ghost" onClick={() => update({ skills: Array(SKILL_SLOTS).fill(v) })}>{tr(`presets.${key}`)}</button>
          ))}
        </div>
      </div>
      {event || aptitude ? (
        <>
          {event ? <div className="mn-cd-field">
            <span>{tr("target")}</span>
            <Seg label={tr("target")} value={state.target} onPick={(target) => update({ target })} options={TARGETS.map((r) => ({ value: r, label: r }))} />
          </div> : null}
          <label className="mn-cd-field">
            <span>{tr("power")}</span>
            <NumberInput className="power" value={state.power} step={1000} placeholder={aptitude ? "" : tr("powerHint")} label={tr("power")} onValue={(v) => update({ power: Math.round(v) })} />
          </label>
        </>
      ) : null}
      {frontier ? (
        <label className="mn-cd-check">
          <input type="checkbox" checked={state.frontier} onChange={(e) => update({ frontier: e.target.checked })} />
          {tr("frontier")}
        </label>
      ) : null}
    </div>
  );
}
