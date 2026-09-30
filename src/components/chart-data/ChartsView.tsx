import { useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { DIFFICULTIES, extent, histogram, matches, ticks, type ChartRow } from "@/lib/chart-data/catalog";
import { AXES, EFF_AXES, type Axis } from "@/lib/chart-data/query";
import { axisGoal, paretoPoints } from "@/lib/chart-data/pareto";
import { localizeDataText } from "@/lib/chart-data/text";
import SettingsPanel, { ScenarioPanel } from "./SettingsPanel";
import { Heading, Icon, Jacket, LevelBadge, fmt, type ChartDataContext } from "./shared";

// difficulty accents are CSS variables (chart-data.css), so both themes restyle the charts too
const DIFF_COLOR: Record<string, string> = { easy: "var(--mn-cd-easy)", normal: "var(--mn-cd-normal)", hard: "var(--mn-cd-hard)", expert: "var(--mn-cd-expert)" };

interface Tip {
  x: number;
  y: number;
  row: ChartRow;
  lines: Array<[string, string]>;
}

/** A value of a scatter figure; the efficiency figures follow the current settings. */
export function figure(ctx: ChartDataContext, row: ChartRow, axis: Axis): number | null {
  if (axis === "perMinute" || axis === "rate") return ctx.eff(row)[axis];
  if (axis === "bgmMs") { const ms = row.bgmMs ?? row.chartMs; return ms === null ? null : ms / 1000; }
  return row[axis];
}

function TipBox({ ctx, tip }: { ctx: ChartDataContext; tip: Tip }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const x = Math.max(8, Math.min(tip.x + 14, window.innerWidth - el.offsetWidth - 8));
    const y = Math.max(8, Math.min(tip.y + 14, window.innerHeight - el.offsetHeight - 8));
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, [tip]);
  return (
    <div ref={ref} className="mn-cd-tip" role="tooltip">
      <div className="mn-cd-tip-head">
        <Jacket ctx={ctx} row={tip.row} size="sm" />
        <div>
          <div className="mn-cd-tip-title">{ctx.title(tip.row)}</div>
          <div className="mn-cd-tip-sub"><LevelBadge ctx={ctx} row={tip.row} /> {ctx.bandName(tip.row)}</div>
        </div>
      </div>
      {tip.lines.map(([k, v]) => <div key={k} className="mn-cd-tip-row"><span>{k}</span><b>{v}</b></div>)}
    </div>
  );
}

function Scatter({ ctx, list, onTip }: { ctx: ChartDataContext; list: ChartRow[]; onTip: (tip: Tip | null) => void }) {
  const { tr, state } = ctx;
  const box = useRef<HTMLDivElement>(null);
  const gradient = useId();
  const [width, setWidth] = useState(860);
  useLayoutEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setWidth(Math.max(280, Math.min(1000, entry.contentRect.width))); });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const W = width, H = Math.max(320, Math.min(480, width * .55)), m = { l: 58, r: 22, t: 24, b: 50 };
  const pts = list.map((r) => [figure(ctx, r, state.ax), figure(ctx, r, state.ay), r] as const)
    .filter((p): p is readonly [number, number, ChartRow] => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const ex = extent(pts.map((p) => p[0])), ey = extent(pts.map((p) => p[1]));
  const label = `${tr(`axes.${state.ax}`)} × ${tr(`axes.${state.ay}`)}`;
  if (!ex || !ey) return <div ref={box} className="mn-cd-scatter-canvas"><p>{tr("empty")}</p></div>;
  const frontier = paretoPoints(pts, state.xGoal, state.yGoal);
  const frontierIds = new Set(frontier.map((p) => p[2].scoreId));
  const sx = (v: number) => m.l + ((v - ex[0]) / (ex[1] - ex[0])) * (W - m.l - m.r);
  const sy = (v: number) => H - m.b - ((v - ey[0]) / (ey[1] - ey[0])) * (H - m.t - m.b);
  const path = frontier.map(([x, y], i) => `${i ? "L" : "M"}${sx(x)},${sy(y)}`).join(" ");
  const midY = (m.t + H - m.b) / 2;
  const show = (e: ReactMouseEvent, r: ChartRow, x: number, y: number) => onTip({
    x: e.clientX, y: e.clientY, row: r,
    lines: [[tr(`axes.${state.ax}`), fmt(x, state.ax === "displayLevel" ? 1 : 3)], [tr(`axes.${state.ay}`), fmt(y, 3)]],
  });
  return (
    <div ref={box} className="mn-cd-scatter-canvas">
    <div className="mn-cd-plot-summary"><span>{tr("plotted", { n: pts.length })}</span><span className="mn-cd-frontier-key">{tr("paretoCount", { n: frontier.length })}</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} className="mn-cd-plot mn-cd-scatter" role="img" aria-label={label}>
      <defs><linearGradient id={gradient} x1="0" x2="1" y1="0" y2="1"><stop stopColor="var(--mn-accent-deep)" /><stop offset="1" stopColor="var(--mn-pink)" /></linearGradient></defs>
      <rect className="plot-surface" x={m.l} y={m.t} width={W-m.l-m.r} height={H-m.t-m.b} rx={12} />
      <g className="grid">
        {ticks(ex[0], ex[1], W < 500 ? 4 : 8).map((v) => (
          <g key={`x${v}`}><line x1={sx(v)} x2={sx(v)} y1={m.t} y2={H - m.b} /><text x={sx(v)} y={H - m.b + 18} textAnchor="middle">{String(+v.toFixed(2))}</text></g>
        ))}
        {ticks(ey[0], ey[1], 6).map((v) => (
          <g key={`y${v}`}><line x1={m.l} x2={W - m.r} y1={sy(v)} y2={sy(v)} /><text x={m.l - 8} y={sy(v) + 4} textAnchor="end">{String(+v.toFixed(3))}</text></g>
        ))}
      </g>
      <path className="frontier-glow" d={path} />
      <path className="frontier-line" d={path} style={{ stroke: `url(#${gradient})` }} />
      <text className="axis-label" x={(m.l + W - m.r) / 2} y={H - 8} textAnchor="middle">{tr(`axes.${state.ax}`)}</text>
      <text className="axis-label" x={14} y={midY} transform={`rotate(-90 14 ${midY})`} textAnchor="middle">{tr(`axes.${state.ay}`)}</text>
      <g className="dots">
        {/* Use the detailed popup only; SVG title elements would add a second native tooltip. */}
        {pts.map(([x, y, r]) => (
          <circle
            key={r.scoreId}
            cx={sx(x)}
            cy={sy(y)}
            r={frontierIds.has(r.scoreId) ? 6.5 : 4.5}
            className={frontierIds.has(r.scoreId) ? "pareto-point" : "regular-point"}
            style={{ fill: ctx.bandColor(r), stroke: DIFF_COLOR[r.difficulty] }}
            tabIndex={0}
            aria-label={`${ctx.title(r)} · ${tr(`axes.${state.ax}`)} ${fmt(x, 3)} · ${tr(`axes.${state.ay}`)} ${fmt(y, 3)}`}
            onMouseMove={(e) => show(e, r, x, y)}
            onMouseLeave={() => onTip(null)}
            onFocus={(e) => { const box = e.currentTarget.getBoundingClientRect(); onTip({x:box.left+box.width/2,y:box.top+box.height/2,row:r,lines:[[tr(`axes.${state.ax}`),fmt(x,3)],[tr(`axes.${state.ay}`),fmt(y,3)]]}); }}
            onBlur={() => onTip(null)}
            onClick={() => { onTip(null); ctx.openChart(r.scoreId); }}
            onKeyDown={(e) => { if (e.key === "Enter") ctx.openChart(r.scoreId); }}
          />
        ))}
      </g>
    </svg>
    <details className="mn-cd-pareto-note"><summary>{tr("paretoHelp")}</summary><p>{tr("paretoHint")}</p></details>
    </div>
  );
}

function LevelChart({ ctx, list }: { ctx: ChartDataContext; list: ChartRow[] }) {
  const { tr } = ctx;
  const hist = histogram(list, (r) => r.level, 1);
  const W = 860, H = 260, m = { l: 40, r: 10, t: 12, b: 34 };
  if (!hist.length) return <svg viewBox={`0 0 ${W} ${H}`} className="mn-cd-plot" />;
  const max = Math.max(...hist.map(([, c]) => Object.values(c).reduce((a, b) => a + b, 0)));
  const bw = (W - m.l - m.r) / hist.length;
  const sy = (v: number) => ((H - m.t - m.b) * v) / max;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mn-cd-plot" role="img" aria-label={tr("levelDist")}>
      <g className="grid">
        {ticks(0, max, 4).map((v) => (
          <g key={v}><line x1={m.l} x2={W - m.r} y1={H - m.b - sy(v)} y2={H - m.b - sy(v)} /><text x={m.l - 6} y={H - m.b - sy(v) + 4} textAnchor="end">{String(v)}</text></g>
        ))}
      </g>
      {hist.map(([b, c], i) => {
        let y = H - m.b;
        const x = m.l + i * bw + 3;
        return (
          <g key={b}>
            {DIFFICULTIES.map((d) => {
              if (!c[d]) return null;
              const hgt = sy(c[d] as number);
              y -= hgt;
              return (
                <rect key={d} x={x} y={y} width={Math.max(1, bw - 6)} height={hgt} rx={3} style={{ fill: DIFF_COLOR[d] }}>
                  <title>{tr("levelBar", { level: b, difficulty: tr(`difficulties.${d}`), n: c[d] as number })}</title>
                </rect>
              );
            })}
            <text className="tick" x={x + (bw - 6) / 2} y={H - m.b + 18} textAnchor="middle">{String(b)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function BandChart({ ctx }: { ctx: ChartDataContext }) {
  const { state, locale } = ctx;
  const list = useMemo(() => {
    const counts = new Map<string, number>();
    for (const song of ctx.data.songs ?? []) {
      if (state.search && !matches({ song, musicId: song.id }, state.search)) continue;
      const key = song.bandName ? `n:${localizeDataText(song.bandName, locale)}` : String((song.bandIds ?? [])[0] ?? "");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [ctx.data, state.search, locale]);
  const max = Math.max(...list.map((x) => x[1]), 1);
  return (
    <div className="mn-cd-hbars">
      {list.map(([k, n]) => {
        const b = ctx.bands.get(k);
        const name = k.startsWith("n:") ? k.slice(2) : b ? localizeDataText(b.name, locale) : "—";
        return (
          <div key={k} className="mn-cd-hbar">
            <span className="mn-cd-hbar-name">{name}</span>
            <span className="mn-cd-hbar-track"><span className="mn-cd-hbar-fill" style={{ width: `${(100 * n) / max}%`, background: b?.mainColor ?? "var(--mn-text-muted)" }} /></span>
            <b>{String(n)}</b>
          </div>
        );
      })}
    </div>
  );
}

export default function ChartsView({ ctx }: { ctx: ChartDataContext }) {
  const { tr, state, update, hasStats, locale } = ctx;
  const [tip, setTip] = useState<Tip | null>(null);
  const list = useMemo(() => ctx.pool.filter((r) => matches(r, state.search)), [ctx.pool, state.search]);
  const axes = AXES.filter((k) => hasStats || !EFF_AXES.has(k));
  const pick = (label: string, value: Axis, set: (axis: Axis) => void) => (
    <label className="mn-cd-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value as Axis)}>
        {axes.map((k) => <option key={k} value={k}>{tr(`axes.${k}`)}</option>)}
      </select>
    </label>
  );
  const goal = (label: string, value: "min" | "max", set: (value: "min" | "max") => void) => (
    <label className="mn-cd-field"><span>{label}</span><select value={value} onChange={(e) => set(e.target.value as "min" | "max")}><option value="min">{tr("lowerBetter")}</option><option value="max">{tr("higherBetter")}</option></select></label>
  );
  return (
    <>
      <section className="mn-cd-card mn-cd-glass">
        <Heading title={tr("scatter")}>
          <div className="mn-cd-axes">
            {pick(tr("x"), state.ax, (ax) => update({ ax, xGoal: axisGoal(ax) }))}
            <button type="button" className="mn-cd-ghost" aria-label={tr("swap")} title={tr("swap")} onClick={() => update({ ax: state.ay, ay: state.ax, xGoal: state.yGoal, yGoal: state.xGoal })}><Icon name="swap" /></button>
            {pick(tr("y"), state.ay, (ay) => update({ ay, yGoal: axisGoal(ay) }))}
          </div>
        </Heading>
        <div className="mn-cd-pareto-controls"><span className="mn-cd-frontier-key">{tr("pareto")}</span>{goal(tr("xGoal"), state.xGoal, (xGoal) => update({ xGoal }))}{goal(tr("yGoal"), state.yGoal, (yGoal) => update({ yGoal }))}</div>
        {EFF_AXES.has(state.ax) || EFF_AXES.has(state.ay) ? <><ScenarioPanel ctx={ctx} /><SettingsPanel ctx={ctx} /></> : null}
        <div className="mn-cd-plot-box"><Scatter ctx={ctx} list={list} onTip={setTip} /></div>
        <div className="mn-cd-legend">
          {[...ctx.bands].map(([id, b]) => <span key={id}><i className="mn-cd-dot" style={{ background: b.mainColor }} />{localizeDataText(b.name, locale)}</span>)}
          <span className="mn-cd-legend-sep" />
          {DIFFICULTIES.filter((d) => state.diffs.includes(d)).map((d) => <span key={d}><i className={`mn-cd-ring d-${d}`} />{tr(`difficulties.${d}`)}</span>)}
        </div>
      </section>
      <div className="mn-cd-grid2">
        <section className="mn-cd-card mn-cd-glass"><Heading title={tr("levelDist")} /><LevelChart ctx={ctx} list={list} /></section>
        <section className="mn-cd-card mn-cd-glass"><Heading title={tr("bandShare")} /><BandChart ctx={ctx} /></section>
      </div>
      {tip ? <TipBox ctx={ctx} tip={tip} /> : null}
    </>
  );
}
