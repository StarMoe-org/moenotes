import { NOTE_KINDS, type ChartRow } from "@/lib/chart-data/catalog";
import { MEASURES, rangeMeasures, type MeasureStat } from "@/lib/chart-data/gekisou";
import { roomSize } from "@/lib/chart-data/query";
import { SCORE_RANKS, chartFigures, formatLength, modelPower, orderRates, plainKind, quantile, rankThreshold, reachChance, requiredPower, scoreRate, weightSum } from "@/lib/chart-data/ranking";
import { FREE } from "@/lib/chart-data/scenario";
import AptitudeDetail from "./AptitudeDetail";
import { MISSIONS, ScenarioPanel } from "./SettingsPanel";
import { Heading, Icon, Jacket, fmt, fmtInt, diffShort, SongLink, type ChartDataContext } from "./shared";

const KIND_COLOR: Record<string, string> = { tap: "var(--mn-accent)", flick: "var(--mn-pink)", slide: "var(--mn-mint)", trace: "var(--mn-amber)", combo: "var(--mn-border)" };
type Figured = ChartRow & { base: number; weights: number[] };

function Tile({ label, value, sub, wide = false }: { label: string; value: string; sub?: string | null; wide?: boolean }) {
  return <div className={wide ? "mn-cd-tile wide" : "mn-cd-tile"}><span>{label}</span><b>{value}</b>{sub ? <small>{sub}</small> : null}</div>;
}

function Timeline({ ctx, row }: { ctx: ChartDataContext; row: ChartRow }) {
  const { tr } = ctx;
  const c = row.chart;
  const end = Math.max(row.bgmMs || 0, row.chartMs || 0, c.lastNoteMs || 0) || 1;
  const W = 860, H = 132, m = { l: 70, r: 12 };
  const sx = (ms: number) => m.l + (ms / end) * (W - m.l - m.r);
  const lanes: Array<[string, number]> = [[tr("detail.fever"), 20], [tr("detail.skill"), 50], [tr("detail.span"), 80], [tr("detail.bpm"), 104]];
  // skill event i fires performance position events[i][0] (music-data.json deck statistics)
  const posWeights = row.weights;
  const maxW = posWeights ? Math.max(...posWeights) : 0;
  const eventW = (i: number) => {
    const k = row.stats?.events?.[i] ? row.stats.events[i]![0] : i;
    return posWeights && posWeights[k] !== undefined ? posWeights[k]! : null;
  };
  const changes = c.bpm?.changes ?? [];
  const lo = changes.length ? Math.min(...changes.map((x) => x.bpm)) : 0, hi = changes.length ? Math.max(...changes.map((x) => x.bpm)) : 0;
  const yy = (b: number) => (hi === lo ? 104 : 114 - ((b - lo) / (hi - lo)) * 20);
  const bpmPath = changes.map((x, i) => {
    const x0 = sx(Math.max(0, x.timeMs)), x1 = sx(i + 1 < changes.length ? changes[i + 1]!.timeMs : end);
    return `${i ? "L" : "M"}${x0.toFixed(1)},${yy(x.bpm).toFixed(1)}H${x1.toFixed(1)}`;
  }).join("");
  const minutes: number[] = [];
  for (let ms = 0; ms <= end; ms += 30000) minutes.push(ms);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mn-cd-plot mn-cd-timeline">
      {lanes.map(([name, y]) => (
        <g key={name}><text className="lane" x={0} y={y + 4}>{name}</text><line className="lane-line" x1={m.l} x2={W - m.r} y1={y} y2={y} /></g>
      ))}
      {(c.fevers ?? []).map(([a, b], i) => {
        const code = MISSIONS[(row.song.gekisouMissions ?? [])[i] ?? 0];
        const mission = code ? tr(`missions.${code}`) : "";
        return (
          <g key={`f${i}`}>
            <rect className="fever" x={sx(a)} y={12} width={Math.max(2, sx(b) - sx(a))} height={16} rx={4} />
            {mission ? <text className="fever-tag" x={sx(a) + 4} y={24}>{mission}</text> : null}
            <title>{`${tr("detail.fever")} ${i + 1}: ${formatLength(a)}–${formatLength(b)}${mission ? ` · ${tr("detail.mission")} ${mission}` : ""}`}</title>
          </g>
        );
      })}
      {(c.skillEventsMs ?? []).map((ms, i) => {
        const wEnd = Math.min(ms + 5000, row.chartMs || ms + 5000);
        const w = eventW(i);
        const op = w !== null && maxW ? 0.35 + (0.65 * w) / maxW : 0.8;
        return (
          <g key={`s${i}`}>
            <rect className="skill" x={sx(ms)} y={41} width={Math.max(2, sx(wEnd) - sx(ms))} height={18} rx={4} fillOpacity={op.toFixed(2)} />
            <text className="skill-no" x={sx(ms) + 4} y={54}>{String(i + 1)}</text>
            <title>{`${tr("detail.skill")} ${i + 1}: ${formatLength(ms)}${w !== null ? ` · w ${w.toFixed(3)}` : ""}`}</title>
          </g>
        );
      })}
      <rect className="span" x={sx(c.firstNoteMs || 0)} y={76} width={Math.max(2, sx(c.lastJudgedNoteMs || 0) - sx(c.firstNoteMs || 0))} height={8} rx={4} />
      {changes.length ? <path className="bpm-line" d={bpmPath} /> : null}
      {changes.length && hi !== lo ? <text className="tick" x={W - m.r} y={92} textAnchor="end">{`${lo}–${hi}`}</text> : null}
      {minutes.map((ms) => <text key={ms} className="tick" x={sx(ms)} y={H - 2} textAnchor="middle">{formatLength(ms).replace(/\.\d$/, "")}</text>)}
    </svg>
  );
}

function Composition({ ctx, row }: { ctx: ChartDataContext; row: ChartRow }) {
  const { tr } = ctx;
  const total = Object.values(row.kinds).reduce((a, b) => a + b, 0) || 1;
  const kinds = NOTE_KINDS.filter(([k]) => row.kinds[k]);
  return (
    <div className="mn-cd-comp">
      <div className="mn-cd-comp-bar">
        {kinds.map(([k]) => <span key={k} style={{ width: `${(100 * row.kinds[k]) / total}%`, background: KIND_COLOR[k] }} title={`${tr(`kinds.${k}`)} ${row.kinds[k]}`} />)}
      </div>
      <div className="mn-cd-comp-legend">
        {kinds.map(([k]) => (
          <span key={k}><i className="mn-cd-dot" style={{ background: KIND_COLOR[k] }} />{tr(`kinds.${k}`)}<b>{` ${row.kinds[k]}`}</b><small>{` ${((100 * row.kinds[k]) / total).toFixed(0)}%`}</small></span>
        ))}
      </div>
    </div>
  );
}

function Weights({ row }: { row: Figured }) {
  const w = row.weights;
  const max = Math.max(...w, 1e-9);
  const W = weightSum(row);
  return (
    <div className="mn-cd-weights" style={{ gridTemplateColumns: `repeat(${Math.max(1, w.length)}, 1fr)` }}>
      {w.map((v, i) => (
        <div key={i} className="mn-cd-wcol">
          <b>{v.toFixed(3)}</b>
          <span className="mn-cd-wbar"><span style={{ height: `${(100 * v) / max}%` }} /></span>
          <span className="mn-cd-wpos">{`#${i + 1}`}</span>
          <small>{`${W > 0 ? ((100 * v) / W).toFixed(0) : 0}%`}</small>
        </div>
      ))}
    </div>
  );
}

// a measure as its seed mean, with the seeds' min–max when they differ; null when a seed lacks it
const measureText = (m: MeasureStat | null) => (m
  ? `${Number.isInteger(m.mean) ? fmtInt(m.mean) : fmt(m.mean, 1)}${m.min === m.max ? "" : ` (${fmtInt(m.min)}–${fmtInt(m.max)})`}`
  : null);

// Gekisou Live's rank measures per range (seed means without Gekisou skills), the one each range ranks by in bold
function Measures({ ctx, row }: { ctx: ChartDataContext; row: ChartRow }) {
  const { tr } = ctx;
  const list = rangeMeasures(row.stats);
  if (!list.some((m) => MEASURES.some((k) => m.values[k]))) return null;
  const missions = row.song.gekisouMissions ?? [];
  return (
    <section>
      <Heading level={3} title={tr("detail.measures")} />
      <div className="mn-cd-table-scroll">
        <table className="mn-cd-ranks mn-cd-measures">
          <thead>
            <tr>
              <th>{tr("detail.measureRange")}</th>
              <th>{tr("detail.measureCompared")}</th>
              {MEASURES.map((k) => <th key={k}>{tr(`detail.measure.${k}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {list.map((m) => {
              const code = MISSIONS[m.mission ?? missions[m.index] ?? 0];
              return (
                <tr key={m.index}>
                  <td>{code ? tr("scenario.rangeMission", { n: m.index + 1, mission: tr(`missions.${code}`) }) : tr("scenario.range", { n: m.index + 1 })}</td>
                  <td>{m.measure ? tr(`detail.measure.${m.measure}`) : "–"}</td>
                  {MEASURES.map((k) => {
                    const text = measureText(m.values[k]);
                    return <td key={k} className={k === m.measure ? "num hi" : "num dim"} title={text === null ? tr("scenario.pending") : undefined}>{text ?? "–"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mn-cd-hint">{tr("detail.measuresHint")}</p>
    </section>
  );
}

// the song's score ranks: threshold, the power the expected score needs, and the chance at the power entered
function RanksTable({ ctx, row }: { ctx: ChartDataContext; row: Figured }) {
  const { tr, state, skills } = ctx;
  const f = 1;                                                     // the accuracy is in the figures already
  const n = roomSize(state);
  const ranks = SCORE_RANKS.filter((k) => rankThreshold(row, k, n) !== null).reverse();
  if (!ranks.length) return null;
  const rates = orderRates(row, skills);
  const spread = rates[rates.length - 1]! > rates[0]! + 1e-12;       // equal skills: every order scores the same
  return (
    <div className="mn-cd-table-scroll">
      <table className="mn-cd-ranks">
        <thead>
          <tr>
            <th>{tr("detail.rank")}</th>
            <th>{n ? tr("detail.requiredRoom", { n }) : tr("detail.required")}</th>
            <th>{tr("detail.needPower")}</th>
            {spread ? <th>{tr("detail.needRange")}</th> : null}
            {state.power ? <th>{tr("detail.chanceAt", { power: fmtInt(state.power) })}</th> : null}
          </tr>
        </thead>
        <tbody>
          {ranks.map((k) => {
            const R = rankThreshold(row, k, n) as number;
            const chance = state.power ? reachChance(row, skills, state.power, k, f, n) : null;
            return (
              <tr key={k}>
                <td><span className={`mn-cd-rk rk-${k}`}>{k}</span></td>
                <td className="num">{fmtInt(R)}</td>
                <td className="num">{fmtInt(requiredPower(row, skills, k, f, n))}</td>
                {spread ? <td className="num dim">{R > 0 ? `${fmtInt(R / (rates[rates.length - 1]! * f))}–${fmtInt(R / (rates[0]! * f))}` : "–"}</td> : null}
                {chance === null ? null : <td className="num">{`${(100 * chance).toFixed(0)}%`}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The chart detail: hero with the song's difficulties and links, the figures, the range rank measures, the timeline and the weights. */
export default function ChartDetail({ ctx, row }: { ctx: ChartDataContext; row: ChartRow }) {
  const { tr, state } = ctx;
  const siblings = ctx.rows.filter((x) => x.musicId === row.musicId);
  const e = ctx.eff(row);
  const c = row.chart;
  const figured = row.weights ? (row as Figured) : null;
  const orders = figured ? orderRates(figured, ctx.skills) : null;
  const battle = state.mode === "battle";
  // Free Live's score per power at the Great share chosen (the one Gekisou Live keeps as the song's best score)
  const free = battle && figured ? chartFigures(row.stats, plainKind(ctx.data), modelPower(ctx.data), { ...FREE, great: state.great / 100 }) : null;
  const solo = free ? scoreRate(free, ctx.skills) : null;
  return (
    <div className="mn-cd mn-cd-detail">
      <div className="mn-cd-hero" style={{ ["--band" as string]: ctx.bandColor(row) }}>
        {state.jackets && ctx.jacketUrl(row) ? <div className="mn-cd-hero-bg" style={{ backgroundImage: `url("${ctx.jacketUrl(row)}")` }} /> : null}
        <Jacket ctx={ctx} row={row} size="xl" />
        <div className="mn-cd-hero-text">
          <div className="mn-cd-hero-band"><i className="mn-cd-dot" style={{ background: ctx.bandColor(row) }} />{ctx.bandName(row)}</div>
          <div className="mn-cd-hero-diffs">
            {siblings.map((x) => (
              <button
                key={x.scoreId}
                type="button"
                className={`mn-cd-lv-tab d-${x.difficulty}`}
                aria-current={x.scoreId === row.scoreId ? "true" : undefined}
                title={tr(`difficulties.${x.difficulty}`)}
                onClick={() => ctx.openChart(x.scoreId)}
              >
                <span>{diffShort(x.difficulty)}</span><b>{String(x.displayLevel)}</b>
              </button>
            ))}
          </div>
          <div className="mn-cd-hero-links">
            <SongLink ctx={ctx} row={row} label={tr("songPage")} />
            <a className="mn-cd-ghost-link" href={ctx.previewHref(row)}><Icon name="play" />{tr("preview3d")}</a>
          </div>
        </div>
      </div>
      <div className="mn-cd-detail-body">
        <div className="mn-cd-tiles">
          <Tile label={tr("detail.notes")} value={fmtInt(row.notes)} sub={`${tr("detail.fullCombo")} ${fmtInt(c.fullComboCount)}`} />
          <Tile label={tr("detail.density")} value={`${fmt(row.density)} N/s`} sub={`${tr("detail.span")} ${formatLength((c.lastJudgedNoteMs || 0) - (c.firstNoteMs || 0))}`} />
          <Tile label={tr("detail.bpm")} value={String(row.bpm ?? "–")} sub={row.bpmMin !== row.bpmMax ? `${row.bpmMin}–${row.bpmMax} · ${tr("detail.bpmChanges", { n: row.bpmChanges - 1 })}` : ""} />
          <Tile label={tr("detail.bgm")} value={formatLength(row.bgmMs)} sub={`${tr("detail.musicLength")} ${formatLength(row.chartMs)}`} />
        </div>
        {ctx.hasStats ? (
          <>
            <Heading level={3} title={tr("detail.score")} />
            <ScenarioPanel ctx={ctx} rooms missions={row.song.gekisouMissions ?? null} />
          </>
        ) : null}
        <div className="mn-cd-tiles">
          {figured && orders ? (
            <Tile
              label={tr("col.rate")}
              value={fmt(e.rate, 3)}
              sub={orders[orders.length - 1]! > orders[0]! + 1e-12
                ? `${tr("detail.orders")} ${fmt(orders[0], 3)}–${fmt(orders[orders.length - 1], 3)} · P10 ${fmt(quantile(orders, 0.1), 3)}`
                : tr("detail.sameOrder")}
            />
          ) : null}
          {figured ? (
            <Tile
              label={tr("col.base")}
              value={fmt(row.base, 3)}
              sub={`W ${fmt(weightSum(figured), 3)} · ${tr("col.skip")} ${fmt(row.skip, 3)}`
                + (row.seeds && row.seeds > 1 && row.baseRange ? ` · ${tr("detail.seeds", { n: row.seeds })} ${fmt(row.baseRange[0], 3)}–${fmt(row.baseRange[1], 3)}` : "")}
            />
          ) : null}
          {figured ? <Tile label={tr("col.perMinute")} value={fmt(e.perMinute, 3)} sub={`${tr("length")} ${tr(state.len)} + ${tr("seconds", { n: state.overhead })}`} /> : null}
          {battle && figured ? (
            <Tile label={tr("detail.twoScores")} value={`${fmt(e.rate, 3)} / ${solo === null ? tr("scenario.pending") : fmt(solo, 3)}`} sub={tr("detail.twoScoresHint")} wide />
          ) : null}
          {battle && row.unplayable ? (
            <Tile label={tr("detail.unplayable")} value="–" sub={`${tr("detail.unplayableHint")}${ctx.support.free ? tr("detail.unplayableFree") : ""}`} />
          ) : null}
          {!figured && !(battle && row.unplayable) && row.stats ? <Tile label={tr("detail.noFigures")} value="–" sub={tr("scenario.pending")} /> : null}
        </div>
        {battle ? <Measures ctx={ctx} row={row} /> : null}
        <AptitudeDetail ctx={ctx} row={row} />
        <Heading level={3} title={tr("detail.timeline")} />
        <div className="mn-cd-tl-scroll"><Timeline ctx={ctx} row={row} /></div>
        <div className="mn-cd-grid2">
          <section><Heading level={3} title={tr("detail.composition")} /><Composition ctx={ctx} row={row} /></section>
          {figured ? (
            <section>
              <Heading level={3} title={tr("detail.weights")} />
              <Weights row={figured} />
              <p className="mn-cd-hint">{tr("detail.weightsHint")}</p>
            </section>
          ) : null}
        </div>
        {figured && row.scoreRanks.length ? (
          <section>
            <Heading level={3} title={tr("detail.ranks")} />
            <RanksTable ctx={ctx} row={figured} />
            <p className="mn-cd-hint">{roomSize(state) ? tr("detail.ranksHintRoom", { n: state.room }) : tr("detail.ranksHint")}</p>
          </section>
        ) : null}
        <p className="mn-cd-ids">{`${tr("detail.musicId")} ${row.musicId} · ${tr("detail.scoreId")} ${row.scoreId} · ${tr("detail.musicType")} ${row.song.musicType ?? "–"}`}</p>
      </div>
    </div>
  );
}
