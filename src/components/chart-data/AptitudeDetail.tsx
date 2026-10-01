import { useMemo } from "react";
import type { ChartRow } from "@/lib/chart-data/catalog";
import { aptitudeRate, aptitudeSe, chartAptitude, chartFactors, MEASURES, shapeSkills, shapeBands, zeroGain } from "@/lib/chart-data/gekisou";
import { playScenario } from "@/lib/chart-data/query";
import { modelPower } from "@/lib/chart-data/ranking";
import type { MeanSe } from "@/lib/chart-data/types";
import SettingsPanel, { MISSIONS } from "./SettingsPanel";
import { Heading, fmt, fmtInt, type ChartDataContext } from "./shared";

const signed = (v: number | null, digits = 3) => v === null || !Number.isFinite(v) ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;
const sample = (v: MeanSe | null | undefined, digits = 1) => !v || !Number.isFinite(v[0]) ? "–"
  : `${fmt(v[0], digits)}${Number.isFinite(v[1]) && v[1] > 0 ? ` ± ${fmt(v[1], digits)}` : ""}`;

/** Single-skill aptitude is separate from the ranking's no-Gekisou-skill deck. Never sum rows into a formation. */
export default function AptitudeDetail({ ctx, row }: { ctx: ChartDataContext; row: ChartRow }) {
  const { tr, state, data, locale } = ctx;
  const rows = useMemo(() => chartAptitude(data, row.stats, playScenario(state)), [data, row.stats, state.mode, state.ranks, state.just, state.great]);
  const factors = useMemo(() => chartFactors(row.stats), [row.stats]);
  if (state.mode !== "battle" || row.unplayable) return null;
  const P0 = modelPower(data), P = state.power || P0;
  const rangeLabel = (i: number, mission: number | null) => {
    const code = mission === null ? undefined : MISSIONS[mission];
    return code ? tr("scenario.rangeMission", { n: i + 1, mission: tr(`missions.${code}`) }) : tr("scenario.range", { n: i + 1 });
  };
  return (
    <section>
      <Heading level={3} title={<>{tr("aptitude.title")} <small className="mn-cd-note">{tr("beta")}</small></>} />
      {!rows ? <p className="mn-cd-hint">{tr("scenario.pending")}</p> : (
        <>
          <p className="mn-cd-hint">{tr("aptitude.hint")}</p>
          <SettingsPanel ctx={ctx} aptitude />
          <p className="mn-cd-hint">{tr("aptitude.power", { n: fmtInt(P) })}</p>
          {rows.length ? <div className="mn-cd-table-scroll">
            <table className="mn-cd-ranks mn-cd-aptitude">
              <thead><tr>{["skill", "band", "gain", "score", "ratio", "seeds", "details"].map((k) => <th key={k}>{tr(`aptitude.${k}`)}</th>)}</tr></thead>
              <tbody>{rows.map((r) => {
                const names = shapeSkills(data, r.shape, locale);
                const rate = aptitudeRate(r.delta, ctx.skills);
                const se = aptitudeSe(r.delta, ctx.skills);
                return (
                  <tr key={r.key}>
                    <td>
                      <small>{r.source === "support" ? tr("aptitude.support") : r.source === "member" ? tr("aptitude.member") : "–"}</small>
                      {names.length ? names.map((s) => <div key={`${s.id}:${s.level}`}>{s.name} {tr("aptitude.level", { n: s.level })} {`(#${s.id})`}</div>) : <div>{`#${r.shapeId}`}</div>}
                    </td>
                    <td>{tr(r.bandMatch === null ? "aptitude.noCondition" : r.bandMatch ? "aptitude.match" : "aptitude.mismatch")}<small>{shapeBands(data, r.shape, locale).join(tr("listSeparator"))}</small></td>
                    <td className="num">{signed(rate)}{zeroGain(r.variant) ? <small>{tr(`aptitude.zero.${zeroGain(r.variant)}`)}</small> : null}{rate === null ? <small>{tr(r.delta?.missingPerfectCross ? "aptitude.missingPerfectCross" : "aptitude.missingCross")}</small> : null}{r.delta?.crossAtRank1 ? <small>{tr("aptitude.crossAtRank1")}</small> : null}</td>
                    <td className="num">{signed(rate === null ? null : rate * P, 1)}{se === null ? null : ` ± ${fmt(P * se, 1)}`}</td>
                    <td className="num">{rate !== null && row.base !== null && row.base > 0 ? `${fmt(100 * rate / row.base, 2)}%` : "–"}</td>
                    <td>
                      <div>{r.seeds === null ? "–" : tr("detail.seeds", { n: r.seeds })}{r.deterministic ? <small>{tr("aptitude.deterministic")}</small> : null}</div>
                      <small>{tr("aptitude.crossSeeds", { n: r.variant.crossSeeds ?? 0 })}</small>
                      {!r.seTargetMet ? <small>{tr("aptitude.targetUnmet")}</small> : null}
                    </td>
                    <td>
                      <details>
                        <summary>{tr("aptitude.details")}</summary>
                        <p>{tr("aptitude.baseSe")}: {r.delta ? sample(r.variant.score ? [r.variant.score[0] / P0, r.variant.score[1] / P0] : null, 4) : "–"}</p>
                        <p>{tr("aptitude.rawPerfect")}: {sample(r.variant.scorePerfect)}</p>
                        <p>{tr("aptitude.noPlain")}: {signed(r.delta?.base ?? null)}</p>
                        <p>{tr("aptitude.converted")}: {sample(r.converted)}</p>
                        <div className="mn-cd-table-scroll"><table className="mn-cd-ranks"><thead><tr><th>{tr("detail.measureRange")}</th>{MEASURES.map((m) => <th key={m}>{tr(`detail.measure.${m}`)}</th>)}</tr></thead>
                          <tbody>{r.measures.map((m, i) => <tr key={i}><td>{rangeLabel(i, row.stats?.ranges?.[i]?.mission ?? null)}</td>{MEASURES.map((k) => <td key={k}>{sample(m[k])}</td>)}</tr>)}</tbody>
                        </table></div>
                        <p className="mn-cd-hint">{tr("aptitude.metricsHint")}</p>
                      </details>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div> : <p className="mn-cd-hint">{tr("aptitude.empty")}</p>}
          <p className="mn-cd-hint">{tr("aptitude.approximation")}</p>
          {factors?.length ? <>
            <Heading level={3} title={tr("aptitude.factors")} />
            <div className="mn-cd-table-scroll"><table className="mn-cd-ranks">
              <thead><tr><th>{tr("detail.measureRange")}</th>{["judgedNotes", "justNotes", "perfectNotes", "tailNotes", "comboAtStart", "lotteries"].map((k) => <th key={k}>{tr(`aptitude.factor.${k}`)}</th>)}</tr></thead>
              <tbody>{factors.map((f) => <tr key={f.index}>
                <td>{rangeLabel(f.index, f.mission)}</td>
                <td>{fmtInt(f.judgedNotes)}</td><td>{fmtInt(f.justNotes)}</td><td>{fmtInt(f.perfectNotes)}</td><td>{fmtInt(f.tailNotes)}</td><td>{fmtInt(f.comboAtStart)}</td><td>{sample(f.lotteries)}</td>
              </tr>)}</tbody>
            </table></div>
            <p className="mn-cd-hint">{tr("aptitude.factorsHint")}</p>
          </> : null}
        </>
      )}
    </section>
  );
}
