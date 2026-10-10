import SiriusLoader from "@/components/shared/SiriusLoader";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { assetConfig } from "@/config/assets";
import { t } from "@/i18n";
import type { ChartDataGuide } from "@/i18n/guides/chart-data";
import { localizePath } from "@/i18n/routing";
import Modal from "@/components/shared/Modal";
import { replaceUrl } from "@/lib/browser/history";
import { chartRows } from "@/lib/chart-data/catalog";
import { fetchMusicData } from "@/lib/chart-data/client";
import { DIFFICULTIES, perMinute, scoreRate } from "@/lib/chart-data/ranking";
import { parseChartDataQuery, playScenario, serializeChartDataQuery, VIEWS, type ChartDataState, type QueryContext, type View } from "@/lib/chart-data/query";
import { scenarioSupport } from "@/lib/chart-data/scenario";
import { localizeDataText } from "@/lib/chart-data/text";
import type { MusicData } from "@/lib/chart-data/types";
import { chartSnapProfile, snapDisplayedMeasurement, snapMeasurementPlan } from "@/lib/chart-data/snap-profile";
import { createSnapLegalityContext } from "@/lib/chart-data/snap-legality";
import { emptySnapRanking, isCurrentSnapCatalogue, type SnapRankingCatalogue, type SnapRankingSource, type SnapRankingState } from "@/lib/chart-data/snap-client";
import { getChartPreviewHref } from "@/lib/music/chart-preview";
import { getMusicJacketUrl } from "@/lib/music/data";
import { isMusicDifficulty } from "@/lib/music/difficulty";
import { getRoutePathById } from "@/lib/route/registry";
import ChartDetail from "./ChartDetail";
import ChartsView from "./ChartsView";
import GuideView from "./GuideView";
import RankView from "./RankView";
import SnapRankingController from "./SnapRankingController";
import SnapRankingPanel from "./SnapRankingPanel";
import { Icon, diffShort, type ChartDataContext } from "./shared";

interface Props {
  locale: AppLocale;
  guide: ChartDataGuide;
}

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: MusicData };
// The covered view refreshes when the modal closes; detail edits need only repaint the detail.
const detailOpen = (ctx: ChartDataContext) => ctx.state.chart !== null && ctx.byScore.has(ctx.state.chart);
const BackgroundRankView = memo(RankView, (_, next) => detailOpen(next.ctx));
const BackgroundChartsView = memo(ChartsView, (_, next) => detailOpen(next.ctx));

/**
 * Chart data: rankings, charts and a guide over nnnotes' music-data.json, ported from ournotes-player's chart data
 * page. Song pages (credits, vocals, audio, chart previews) are this site's own: every song links to them.
 */
export default function ChartDataTool({ locale, guide }: Props) {
  const tr = useCallback((key: string, values?: Record<string, string | number>) => t(locale, `chartData.${key}`, values), [locale]);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View>("rank");
  const [restored, setRestored] = useState(false);
  const [state, setState] = useState<ChartDataState | null>(null);
  const [snapRequested, setSnapRequested] = useState(false);
  const [snapCatalogue, setSnapCatalogue] = useState<SnapRankingCatalogue | null>(null);
  const [snapCatalogueError, setSnapCatalogueError] = useState(false);
  const [snapAttempt, setSnapAttempt] = useState(0);
  const [snapMeasurement, setSnapMeasurement] = useState<SnapRankingState>(emptySnapRanking);

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("v");
    if ((VIEWS as readonly string[]).includes(v ?? "")) setView(v as View);
    setRestored(true);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: "loading" });
    fetchMusicData(controller.signal)
      .then((data) => setLoad({ status: "ready", data }))
      .catch((error: unknown) => { if (!controller.signal.aborted) setLoad({ status: "error", message: error instanceof Error ? error.message : String(error) }); });
    return () => controller.abort();
  }, [attempt]);

  const data = load.status === "ready" ? load.data : null;
  const currentSnapCatalogue = useMemo(() => isCurrentSnapCatalogue(snapCatalogue, data) ? snapCatalogue : null, [snapCatalogue, data]);
  // A new data object for the same verified snapshot keeps its already loaded card choices.
  useEffect(() => { setSnapCatalogue(previous => isCurrentSnapCatalogue(previous, data) ? previous : null); setSnapCatalogueError(false); }, [data]);
  const support = useMemo(() => scenarioSupport(data), [data]);
  const hasStats = support.battle || support.free;
  const queryContext = useMemo<QueryContext>(() => ({ hasStats, support }), [hasStats, support]);

  // the choices come from the query once the file says which defaults apply; the view is kept apart so the guide
  // shows before the data
  useEffect(() => {
    if (!data) return;
    setState(parseChartDataQuery(window.location.search, queryContext));
  }, [data, queryContext]);

  const current = useMemo<ChartDataState | null>(() => (state ? { ...state, view } : null), [state, view]);

  useEffect(() => {
    if (!restored) return;
    if (!current) {
      // before the data only the view is known: keep the rest of the query for the parse above
      const params = new URLSearchParams(window.location.search);
      if ((params.get("v") || "rank") === view) return;
      if (view === "rank") params.delete("v");
      else params.set("v", view);
      const query = params.toString();
      replaceUrl(`${window.location.pathname}${query ? `?${query}` : ""}`);
      return;
    }
    const query = serializeChartDataQuery(current, queryContext);
    const href = `${window.location.pathname}${query ? `?${query}` : ""}`;
    // the open chart detail is a modal with its own history entry: its address carries `c`
    if (current.chart !== null && window.history.state?.modal) window.history.replaceState(window.history.state, "", href);
    else replaceUrl(href);
  }, [current, queryContext, view, restored]);

  const update = useCallback((patch: Partial<ChartDataState>) => {
    if (patch.view) setView(patch.view);
    setState((s) => (s ? { ...s, ...patch } : s));
  }, []);

  // the rows carry the figures of the scenario chosen, the accuracy folded in (the score ranks take factor 1)
  const mode = state?.mode, ranks = state?.ranks, great = state?.great, just = state?.just;
  const scenario = useMemo(() => (mode && ranks && great !== undefined && just !== undefined ? playScenario({ mode, ranks, great, just }) : null), [mode, ranks, great, just]);
  const rows = useMemo(() => (data && scenario ? chartRows(data, scenario) : []), [data, scenario]);
  const snapActive = current?.snapSkills.some(Boolean) ?? false;
  const snapLegality = useMemo(() => currentSnapCatalogue ? createSnapLegalityContext(currentSnapCatalogue.data, currentSnapCatalogue.choices) : undefined, [currentSnapCatalogue]);
  const snapEvaluation = useMemo(() => current ? chartSnapProfile(current, currentSnapCatalogue?.data, snapLegality) : null, [current, currentSnapCatalogue, snapLegality]);
  const snapSource = useMemo<SnapRankingSource | null>(() => {
    const region = data?.provenance?.region, masterVersion = data?.provenance?.master?.version, modelCommit = data?.provenance?.deck?.commit;
    return data?.replay && region && masterVersion && modelCommit && (snapRequested || snapActive)
      ? { site: assetConfig.musicDataSite, reference: data.replay, expected: { region, masterVersion, modelCommit } } : null;
  }, [data, snapRequested, snapActive]);
  const { scoreIds: snapScoreIds, analysis: snapAnalysis } = useMemo(() => snapMeasurementPlan(rows, current), [rows, current]);
  const ctx = useMemo<ChartDataContext | null>(() => {
    if (!data || !current) return null;
    const bands = new Map((data.bands ?? []).map((b) => [String(b.id), b]));
    const byScore = new Map(rows.map((r) => [r.scoreId, r]));
    const skills = current.skills.map((x) => x / 100);
    const bandOf = (r: { bandIds: readonly number[] }) => bands.get(String(r.bandIds[0]));
    const lengthOf = (r: { bgmMs: number | null; chartMs: number | null }) => (current.len === "chart" ? r.chartMs ?? r.bgmMs : r.bgmMs ?? r.chartMs);
    return {
      locale,
      tr,
      data,
      rows,
      byScore,
      bands,
      hasStats,
      support,
      state: current,
      update,
      skills,
      title: (r) => localizeDataText(r.title, locale) || String(r.musicId),
      bandName: (r) => localizeDataText(r.bandName, locale) || localizeDataText(bandOf(r)?.name, locale),
      bandColor: (r) => bandOf(r)?.mainColor ?? "var(--mn-text-muted)",
      jacketUrl: (r) => (r.song.jacket ? getMusicJacketUrl(r.song.jacket) : null),
      songHref: (r) => localizePath(`${getRoutePathById("music")}/${r.musicId}`, locale),
      previewHref: (r) => (isMusicDifficulty(r.difficulty) ? getChartPreviewHref(locale, { musicId: r.musicId, difficulty: r.difficulty }) : getChartPreviewHref(locale)),
      lengthOf,
      eff: (r) => (r.weights
        ? { rate: scoreRate(r, skills), perMinute: perMinute(r, skills, current.len, current.overhead * 1000) }
        : { rate: null, perMinute: null }),
      openChart: (scoreId) => update({ chart: scoreId }),
      pool: rows.filter((r) => current.diffs.includes(r.difficulty as typeof DIFFICULTIES[number]) && (!current.band || r.bandIds.map(String).includes(current.band))),
      snap: snapEvaluation ? { active: snapActive, profile: snapEvaluation.profile, measurement: snapDisplayedMeasurement(snapEvaluation, snapSource, snapMeasurement, snapAnalysis), source: snapSource, analysis: snapAnalysis } : undefined,
    };
  }, [data, current, rows, locale, tr, hasStats, support, update, snapEvaluation, snapActive, snapMeasurement, snapSource, snapAnalysis]);

  const detail = ctx && current?.chart ? ctx.byScore.get(current.chart) ?? null : null;

  return (
    <div className="mn-cd">
      <nav className="mn-cd-views mn-cd-glass" aria-label={t(locale, "seo.chartData.title")}>
        {VIEWS.map((v) => (
          <button key={v} type="button" aria-current={view === v ? "page" : undefined} onClick={() => { update({ view: v }); window.scrollTo({ top: 0 }); }}>
            {tr(`views.${v}`)}
          </button>
        ))}
      </nav>

      {view === "guide" ? (
        <main className="mn-cd-main"><GuideView guide={guide} /></main>
      ) : (
        <>
          {ctx ? <Filters ctx={ctx} /> : null}
          <main className="mn-cd-main">
            {load.status === "loading" || (load.status === "ready" && !ctx) ? (
              <div className="mn-cd-boot"><SiriusLoader locale={locale} label={tr("loading")} /></div>
            ) : load.status === "error" ? (
              <div className="mn-cd-boot error">
                <span>{tr("loadError")}</span>
                <small>{load.message}</small>
                <button type="button" className="mn-cd-ghost" onClick={() => setAttempt((n) => n + 1)}>{tr("retry")}</button>
              </div>
            ) : ctx && view === "rank" ? <>
              <SnapRankingPanel ctx={ctx} catalogue={currentSnapCatalogue} measurement={snapMeasurement}
                loading={!!snapSource && !currentSnapCatalogue} invalidMembers={snapEvaluation?.invalidMembers ?? []}
                legality={snapLegality} issues={snapEvaluation?.issues ?? []}
                available={!!data?.replay} catalogueError={snapCatalogueError} onOpen={() => { setSnapRequested(true); if (snapCatalogueError) { setSnapCatalogueError(false); setSnapAttempt((value) => value + 1); } }} />
              <BackgroundRankView ctx={ctx} />
            </> : ctx ? <BackgroundChartsView ctx={ctx} /> : null}
          </main>
        </>
      )}

      {data ? <Footer locale={locale} data={data} /> : null}
      {snapEvaluation ? <SnapRankingController key={snapAttempt} source={snapSource} profile={snapEvaluation.profile} scoreIds={snapScoreIds} analysis={snapAnalysis}
        enabled={snapActive && snapScoreIds.length > 0 && !!currentSnapCatalogue && snapEvaluation.invalidMembers.length === 0 && snapEvaluation.issues.length === 0} locale={locale}
        onState={setSnapMeasurement} onCatalogue={setSnapCatalogue} onCatalogueError={() => setSnapCatalogueError(true)} /> : null}

      {ctx ? (
        <Modal
          isOpen={!!detail}
          onClose={() => update({ chart: null })}
          title={detail ? `${ctx.title(detail)} · ${diffShort(detail.difficulty)} ${detail.displayLevel}` : ""}
          closeLabel={tr("detail.close")}
          size="xl"
        >
          {detail ? <ChartDetail ctx={ctx} row={detail} /> : null}
        </Modal>
      ) : null}
    </div>
  );
}

function Filters({ ctx }: { ctx: ChartDataContext }) {
  const { tr, state, update, locale } = ctx;
  const toggleDiff = (d: typeof DIFFICULTIES[number]) => {
    const on = state.diffs.includes(d) ? state.diffs.filter((x) => x !== d) : [...state.diffs, d];
    update({ diffs: DIFFICULTIES.filter((x) => on.includes(x)) });
  };
  return (
    <div className="mn-cd-filters mn-cd-glass">
      <div className="mn-cd-filter-row">
        <div className="mn-cd-group scroll" role="group" aria-label={tr("band")}>
          <span className="mn-cd-group-label">{tr("band")}</span>
          <button type="button" className="mn-cd-chip" aria-pressed={state.band === ""} onClick={() => update({ band: "" })}>{tr("all")}</button>
          {[...ctx.bands].map(([id, b]) => (
            <button key={id} type="button" className="mn-cd-chip" aria-pressed={state.band === id} onClick={() => update({ band: state.band === id ? "" : id })}>
              <i style={{ background: b.mainColor }} />{localizeDataText(b.name, locale)}
            </button>
          ))}
        </div>
      </div>
      <div className="mn-cd-filter-row">
        <div className="mn-cd-group" role="group" aria-label={tr("difficulty")}>
          <span className="mn-cd-group-label">{tr("difficulty")}</span>
          {DIFFICULTIES.map((d) => (
            <button key={d} type="button" className={`mn-cd-chip d d-${d}`} aria-pressed={state.diffs.includes(d)} title={tr(`difficulties.${d}`)} onClick={() => toggleDiff(d)}>
              {diffShort(d)}
            </button>
          ))}
        </div>
        <label className="mn-cd-search">
          <Icon name="search" />
          <input type="search" placeholder={tr("search")} value={state.search} aria-label={tr("search")} onChange={(e) => update({ search: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

/** Where the figures come from: the data version (region, full versions in the hint), the score model's commit and the caveat. */
function Footer({ locale, data }: { locale: AppLocale; data: MusicData }) {
  const p = data.provenance ?? {};
  const m = p.master ?? {};
  const c = p.client ?? {};
  const d = p.deck ?? null;
  const development = p.developmentSample;
  // Region snapshots can differ in score ranks and skills; always name the actual data source.
  const client = c.versionName ? `${c.versionName}${c.versionCode ? ` (${c.versionCode})` : ""}` : "?";
  const master = m.version ?? "?";
  const region = p.region && ["tw", "jp", "en", "kr"].includes(p.region) ? t(locale, `gameServer.names.${p.region}`) : p.region ?? "?";
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `chartData.${key}`, values);
  return (
    <footer className="mn-cd-foot">
      <span>
        <span title={tr("sourceHint", { region: p.region ?? "?", master, client })}>{tr("source", { region, version: /^[0-9a-f]{32}$/i.test(master) ? master.slice(0, 8) : master })}</span>
        {d?.source && d.commit ? (
          <>
            {` · ${tr("deckModel")} `}
            <a href={`${d.source}/tree/${d.commit}`} target="_blank" rel="noopener noreferrer">{`${d.name || "deck"} ${d.commit.slice(0, 7)}`}<Icon name="out" /></a>
          </>
        ) : null}
      </span>
      {development ? <span title={`${development}${p.localModel?.sourceTreeSha256 ? ` · SHA-256 ${p.localModel.sourceTreeSha256}` : ""}`}>{tr("developmentData")}{p.localModel?.workingTreeDirty ? ` · ${tr("uncommittedModel")}` : ""}</span> : null}
    </footer>
  );
}
