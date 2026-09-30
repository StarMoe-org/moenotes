import { useEffect, useRef, useState } from "react";
import { assetConfig } from "@/config/assets";
import type { ChartRow } from "@/lib/chart-data/catalog";
import type { ChartDataContext } from "./shared";

const KEYS = ["title","loading","hint","power","seed","clock","mode","free","fixedRanks","reset","run","export","advanced","advancedHint","import","error","ready","calculating","score","frameScore","life","combo","note","time","type","judgement","range","just","luck","complete","wrongChart","importedMode","incomplete","importedClock","exactPlan","greatShare","justShare","presetHint","rawPreset","wholeSong","planSeed","generate","editNotes","segment","customSegment","start","end","remove","probabilityTotal"] as const;
interface PanelModule { mountReplayPanel: (element: HTMLElement, options: Record<string, unknown>) => () => void }

export default function ReplayDetail({ ctx, row }: { ctx: ChartDataContext; row: ChartRow }) {
  const host = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState("");
  const reference = ctx.data.replay;
  useEffect(() => {
    if (!opened || !reference || !host.current) return;
    let disposed = false, cleanup: (() => void) | undefined;
    const element = host.current;
    const site = `${assetConfig.musicDataSite}/`;
    const moduleUrl = new URL("songs/replay-panel.js", `${assetConfig.musicPlayerSite}/`).href;
    const options = { site, reference, scoreId: row.scoreId, power: ctx.state.power || 300000, mode: ctx.state.mode === "free" ? { kind: "normal" } : { kind: "fixedSoloGekisou", ranks: ctx.state.ranks }, text: Object.fromEntries(KEYS.map(key => [key, ctx.tr(`replay.${key}`)])), noteKindLabels: Object.fromEntries(["tap","flick","slide","trace","combo"].map(key => [key, ctx.tr(`kinds.${key}`)])) };
    void import(/* @vite-ignore */ moduleUrl).then((module: PanelModule) => {
      if (!disposed) cleanup = module.mountReplayPanel(element, options);
    }).catch((reason: unknown) => { if (!disposed) setError(String(reason instanceof Error ? reason.message : reason)); });
    return () => { disposed = true; cleanup?.(); };
  // Input changes within the shared editor stay local until its next explicit calculation.
  }, [opened, reference, row.scoreId, ctx.locale]);
  if (!reference) return null;
  return <details className="mn-cd-replay" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}>
    <summary>{ctx.tr("replay.title")}</summary>
    {error ? <p role="alert">{ctx.tr("replay.error")}: {error}</p> : null}
    <div ref={host} />
  </details>;
}
