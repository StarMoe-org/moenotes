import { useMemo, type ReactNode } from "react";
import { matches, sortBy, type ChartRow } from "@/lib/chart-data/catalog";
import { EFF_RANKS, RANKS, SPEEDS, roomSize, type RankBy } from "@/lib/chart-data/query";
import { X_MAX, eventDominance, formatLength, lengthMs, orderRates, rank, rankThreshold, reachChance, requiredPower } from "@/lib/chart-data/ranking";
import SettingsPanel, { ScenarioPanel } from "./SettingsPanel";
import { Icon, LevelBadge, Seg, SongCell, fmt, fmtInt, type ChartDataContext } from "./shared";

type Col = "rank" | "song" | "level" | "time" | "bpm" | "notes" | "density" | "rate" | "perMinute" | "relative" | "dom"
  | "need" | "chance" | "perHour" | "goal" | "skip";

interface Listed extends ChartRow {
  rate?: number;
  perMinute?: number | null;
  need?: number | null;
  chance?: number | null;
  perHour?: number | null;
  goal?: number | null;
  dominatedBy?: number[];
  frontier?: boolean;
}

/** The ranking of the pool by the chosen measure, as ournotes-player's chart data page ranks it. */
function useRanking(ctx: ChartDataContext) {
  const { state, pool, skills } = ctx;
  return useMemo(() => {
    let list: Listed[] = pool;
    let hi: Col | "" = "";
    let unsorted: Listed[] | null = null;                                    // the list the dominance indexes refer to
    const cols: Col[] = ["rank", "song", "level", "time", "bpm", "notes", "density"];
    if (state.rankBy === "efficiency") {
      unsorted = list.filter((r) => r.weights);
      list = rank(unsorted as Array<ChartRow & { base: number; weights: number[] }>, { skills, source: state.len, overheadMs: state.overhead * 1000 });
      cols.push("rate", "perMinute", "relative", "dom");
      hi = "perMinute";
    } else if (state.rankBy === "event") {
      const n = roomSize(state);
      unsorted = list.filter((r) => r.weights && rankThreshold(r, state.target, n) !== null);
      const dom = eventDominance(unsorted, state.len, X_MAX, n);
      list = unsorted.map((r, i) => {
        const L = lengthMs(r, state.len);
        const perHour = L ? 3600000 / (L + state.overhead * 1000) : null;
        const chance = state.power ? reachChance(r, skills, state.power, state.target, 1, n) : null;
        return {
          ...r, need: requiredPower(r, skills, state.target, 1, n), chance, perHour,
          goal: chance === null || perHour === null ? null : chance * perHour, dominatedBy: dom[i] ?? [], frontier: (dom[i] ?? []).length === 0,
        };
      });
      list = state.power ? sortBy(list, (r) => (r.goal === null || r.goal === undefined ? null : r.goal - (r.need ?? 0) * 1e-12)) : sortBy(list, (r) => r.need, true);
      cols.splice(4, 3);                                                     // BPM, notes, density: not what this ranking is about
      cols.push("need", ...(state.power ? ["chance" as const] : []), "perHour", ...(state.power ? ["goal" as const] : []), "dom");
      hi = state.power ? "goal" : "need";
    } else if (state.rankBy === "skip") {
      list = sortBy(list.filter((r) => r.skip !== null), (r) => r.skip);
      cols.push("skip");
      hi = "skip";
    } else if (state.rankBy === "speed") {
      list = sortBy(list, (r) => r[state.speedBy]);
      hi = state.speedBy === "density" ? "density" : "bpm";
    } else if (state.rankBy === "level") {
      list = sortBy(list, (r) => r.displayLevel * 1e5 + (r.notes || 0));
      hi = "level";
    } else if (state.rankBy === "notes") {
      list = sortBy(list, (r) => r.notes);
      hi = "notes";
    } else {
      list = sortBy(list, (r) => ctx.lengthOf(r), state.rankBy === "short");
      hi = "time";
    }
    const all = list.length;
    const byPool = state.rankBy === "efficiency" ? list : null;
    list = list.filter((r) => matches(r, state.search) && (!state.frontier || !unsorted || r.frontier));
    const top = hi === "perMinute" && byPool && byPool.length ? byPool[0]!.perMinute ?? null : null;
    return { list, all, hi, cols, unsorted, top };
  }, [ctx, state, pool, skills]);
}

export default function RankView({ ctx }: { ctx: ChartDataContext }) {
  const { tr, state, update, hasStats } = ctx;
  const tabs = RANKS.filter((k) => hasStats || !EFF_RANKS.has(k)).map((k) => ({ value: k, label: tr(`rankBy.${k}`) }));
  return (
    <>
      <div className="mn-cd-rank-head">
        <Seg<RankBy> variant="tabs" label={tr("views.rank")} value={state.rankBy} onPick={(rankBy) => update({ rankBy })} options={tabs} />
      </div>
      <p className="mn-cd-hint">
        {tr(`rankHint.${state.rankBy}`)}
        {state.rankBy === "speed" ? (
          <Seg label={tr("rankBy.speed")} value={state.speedBy} onPick={(speedBy) => update({ speedBy })} options={SPEEDS.map((k) => ({ value: k, label: tr(`speedBy.${k}`) }))} />
        ) : null}
      </p>
      {state.rankBy === "efficiency" || state.rankBy === "event" ? (
        <>
          <ScenarioPanel ctx={ctx} rooms={state.rankBy === "event"} />
          <SettingsPanel ctx={ctx} event={state.rankBy === "event"} frontier />
        </>
      ) : null}
      {!hasStats ? <p className="mn-cd-hint warn">{tr("noStats")}</p> : null}
      <RankTable ctx={ctx} />
    </>
  );
}

function RankTable({ ctx }: { ctx: ChartDataContext }) {
  const { tr, state } = ctx;
  const { list, all, hi, cols, unsorted, top } = useRanking(ctx);
  const barValue = (r: Listed): number | null | undefined => (hi === "time" ? ctx.lengthOf(r) : hi === "level" ? r.displayLevel : hi === "bpm" ? r[state.speedBy]
    : hi ? (r[hi as keyof Listed] as number | null | undefined) : null);
  const barMax = Math.max(...list.map(barValue).filter((v): v is number => Number.isFinite(v)), 0);
  const bar = (v: number | null | undefined, text: ReactNode) => (
    <span className="mn-cd-bar" style={{ ["--w" as string]: `${barMax && typeof v === "number" ? Math.max(0, Math.min(100, (100 * v) / barMax)) : 0}%` }}>{text}</span>
  );
  const clear = () => ctx.update({ band: "", search: "", frontier: false, diffs: ["easy", "normal", "hard", "expert"] });
  const head = (k: Col) => (k === "bpm" && state.rankBy === "speed" && state.speedBy === "bpmMax" ? tr("speedBy.bpmMax") : tr(`col.${k}`));
  const names = (r: Listed) => (r.dominatedBy ?? []).map((j) => unsorted?.[j]).filter((x): x is Listed => !!x)
    .map((x) => `${ctx.title(x)} ${tr(`difficulties.${x.difficulty}`)}`).join(tr("listSeparator"));

  const cell = (k: Col, r: Listed, i: number): ReactNode => {
    switch (k) {
      case "rank": return <span className={`mn-cd-no${i < 3 ? " top" : ""}`}>{String(i + 1)}</span>;
      case "song": return <SongCell ctx={ctx} row={r} />;
      case "level": return hi === "level" ? bar(r.displayLevel, <LevelBadge ctx={ctx} row={r} />) : <LevelBadge ctx={ctx} row={r} />;
      case "time": { const L = ctx.lengthOf(r); return hi === "time" ? bar(L, formatLength(L)) : formatLength(L); }
      case "bpm": {
        const main = state.rankBy === "speed" && state.speedBy === "bpmMax" ? r.bpmMax : r.bpm;
        const text = <>{String(main ?? "–")}{r.bpmMin !== r.bpmMax ? <small title={tr("detail.bpmChanges", { n: r.bpmChanges - 1 })}>{` ${r.bpmMin}–${r.bpmMax}`}</small> : null}</>;
        return hi === "bpm" ? bar(main, text) : text;
      }
      case "notes": return hi === "notes" ? bar(r.notes, fmtInt(r.notes)) : fmtInt(r.notes);
      case "density": return hi === "density" ? bar(r.density, fmt(r.density)) : fmt(r.density);
      case "rate": {
        if (!r.weights) return fmt(r.rate, 3);
        const v = orderRates(r as ChartRow & { base: number }, ctx.skills);
        return <>{fmt(r.rate, 3)}{v[0] === v[v.length - 1] ? null : <small className="mn-cd-spread" title={tr("tipSpread")}>{` ${fmt(v[0], 3)}–${fmt(v[v.length - 1], 3)}`}</small>}</>;
      }
      case "need": return hi === "need" ? bar(r.need, fmtInt(r.need)) : fmtInt(r.need);
      case "chance": return r.chance === null || r.chance === undefined ? "–"
        : <span className={`mn-cd-chance c${Math.round((r.chance || 0) * 4)}`}>{`${(100 * r.chance).toFixed(r.chance > 0 && r.chance < 0.01 ? 1 : 0)}%`}</span>;
      case "perHour": return fmt(r.perHour, 1);
      case "goal": return bar(r.goal, fmt(r.goal, 2));
      case "perMinute": return bar(r.perMinute, fmt(r.perMinute, 3));
      case "relative": return top && typeof r.perMinute === "number" ? `${((100 * r.perMinute) / top).toFixed(1)}%` : "";
      case "dom": return r.frontier
        ? <span className="mn-cd-front"><Icon name="star" />{tr("onFrontier")}</span>
        : <span className="mn-cd-beaten" title={tr(state.rankBy === "event" ? "tipDomEvent" : "tipDom", { charts: names(r) })}>{tr("dominatedBy", { n: (r.dominatedBy ?? []).length })}</span>;
      case "skip": return bar(r.skip, fmt(r.skip, 3));
    }
  };
  const tdClass = (k: Col) => ["num", "level", "time", "bpm", "notes", "density", "rate", "need", "chance", "perHour", "goal", "perMinute", "relative", "skip"].includes(k)
    ? `num${k === "relative" ? " dim" : ""}` : k === "song" ? "song-td" : k === "rank" ? "rank" : "";

  return (
    <div className="mn-cd-table-box">
      <div className="mn-cd-count">{`${tr("chartsCount", { n: list.length })}${list.length !== all ? ` / ${all}` : ""}`}</div>
      <div className="mn-cd-table-card mn-cd-glass">
        {list.length ? (
          <div className="mn-cd-table-scroll">
            <table className="mn-cd-rank-table">
              <thead>
                <tr>{cols.map((k) => <th key={k} className={`c-${k}${k === hi ? " hi" : ""}`}>{head(k)}</th>)}</tr>
              </thead>
              <tbody>
                {list.map((r, i) => (
                  <tr
                    key={r.scoreId}
                    className={r.frontier && unsorted ? "on-front" : undefined}
                    tabIndex={0}
                    onClick={() => ctx.openChart(r.scoreId)}
                    onKeyDown={(e) => { if (e.key === "Enter") ctx.openChart(r.scoreId); }}
                  >
                    {cols.map((k) => <td key={k} className={`${tdClass(k)} c-${k}${k === hi ? " hi" : ""}`}>{cell(k, r, i)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mn-cd-empty">
            <b>{tr("empty")}</b>{tr("emptyHint")}{" "}
            <button type="button" className="mn-cd-ghost" onClick={clear}>{tr("clear")}</button>
          </div>
        )}
      </div>
    </div>
  );
}
