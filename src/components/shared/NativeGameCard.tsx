import { SiriusIcon } from "@/components/shared/SiriusLoader";
import { useEffect, useRef, useState } from "react";
import type { GameServer } from "@/config/servers";
import { assetConfig } from "@/config/assets";
import { useContentServerScope } from "@/lib/servers/use-content-server";
import { loadNativeUiLibrary, type NativeUiEntry, type NativeFormationLayout } from "@/lib/game-ui/source";
import { createNativeCardFixture, type NativeCardFixtureData } from "@/lib/game-ui/card-fixture";
import { createNativeFormationFixture, type NativeFormationFixtureData } from "@/lib/game-ui/formation-fixture";
import { bindNativeSprites } from "@/lib/game-ui/sprite-binding";
import { browserImageSize, completeSpriteGeometries } from "@/lib/game-ui/sprite-geometry";
import type { UIPlayer, UIRenderResult } from "ournotes-player/ui";

type NativeData = NativeCardFixtureData | NativeFormationFixtureData;

/** Assemble the prefab into `target` (a host element, or a detached canvas) and render it once. */
async function renderNative(target: HTMLElement, entry: NativeUiEntry, data: NativeData, server: GameServer, fontFamily: string) {
  const library = await loadNativeUiLibrary(assetConfig.gameUiLibraries[server], assetConfig.gameUiLibraryRegions[server]);
  const bound = await bindNativeSprites(library, data);
  const { UIPlayer, UISession, cameraProjection } = await import("ournotes-player/ui");
  await document.fonts.ready;
  const pack = library.pack(entry);
  pack.resources.browserFontFamily = fontFamily;
  const { geometries: spriteGeometries, data: checked } = await completeSpriteGeometries(library.spriteGeometries, bound, browserImageSize);
  const fixture = entry === "formationGroup"
    ? createNativeFormationFixture(pack, { ...checked as NativeFormationFixtureData, catalogs: library.catalogs, spriteGeometries })
    : createNativeCardFixture(pack, { ...checked as NativeCardFixtureData, catalogs: library.catalogs, spriteGeometries });
  const session = new UISession(pack, { bindings: true });
  for (const patch of fixture.patches) session.edit(patch.node, patch.component ?? null, patch.field, patch.value);
  const player = new UIPlayer(target, { bindings: true, assetBase: library.assetBase,
    ...(entry === "formationGroup" ? { projection: cameraProjection(library.camera.camera, library.camera.canvas, library.camera.referenceViewport), framing: "content" as const } : {}) });
  try {
    await player.load(session.prepare());
    const result = await player.render();
    if (!result || !("bounds" in result) || !("regions" in result)) throw new Error("Native prefab produced no layout result");
    return { player, result, layout: library.manifest.layout };
  } catch (error) {
    player.destroy();
    throw error;
  }
}

// Square cards fill long lists: each renders once into an image, a few at a time, and is reused by every later mount.
const SNAPSHOT_ENTRIES: ReadonlySet<NativeUiEntry> = new Set(["memberSquare", "supportSquare"]);
const SNAPSHOT_CONCURRENCY = 4;
interface Snapshot { url: string; width: number; height: number }
const snapshots = new Map<string, Promise<Snapshot>>();
let running = 0;
const queue: Array<() => void> = [];

async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (running >= SNAPSHOT_CONCURRENCY) await new Promise<void>((resolve) => queue.push(resolve));
  running++;
  try {
    return await task();
  } finally {
    running--;
    queue.shift()?.();
  }
}

function nativeSnapshot(key: string, entry: NativeUiEntry, data: NativeData, server: GameServer, fontFamily: string): Promise<Snapshot> {
  const cached = snapshots.get(key);
  if (cached) return cached;
  const pending = limited(async () => {
    const canvas = document.createElement("canvas");
    const { player } = await renderNative(canvas, entry, data, server, fontFamily);
    player.destroy();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Native prefab snapshot failed");
    return { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
  });
  snapshots.set(key, pending);
  pending.catch(() => snapshots.delete(key));
  return pending;
}

/** nnnotes' serialized prefab assembled by its companion renderer, inside an ordinary semantic button. */
export default function NativeGameCard({ entry, data, label, className = "", onGeometry }: {
  entry: NativeUiEntry; data: NativeData; label: string; className?: string;
  onGeometry?: ((result: UIRenderResult & { layout: NativeFormationLayout }) => void) | undefined;
}) {
  const { server } = useContentServerScope();
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const displayed = useRef<UIPlayer | null>(null);
  const snapshot = SNAPSHOT_ENTRIES.has(entry);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [image, setImage] = useState<string | null>(null);
  const [near, setNear] = useState(!snapshot);
  const [ratio, setRatio] = useState(entry === "formationGroup" ? "1920 / 1080" : entry === "formationSlot" ? "332 / 600" : "1");
  const dataKey = JSON.stringify(data);

  useEffect(() => {
    if (near || !root.current) return;
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const observer = new IntersectionObserver((records) => {
      if (records.some((record) => record.isIntersecting)) { setNear(true); observer.disconnect(); }
    }, { rootMargin: "400px" });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near) return;
    let disposed = false;
    let player: UIPlayer | undefined;
    setStatus("loading");
    const fontFamily = (root.current && getComputedStyle(root.current).fontFamily) || "sans-serif";
    if (snapshot) {
      displayed.current?.destroy(); displayed.current = null;
      nativeSnapshot(`${server}|${entry}|${fontFamily}|${dataKey}`, entry, data, server, fontFamily).then((result) => {
        if (disposed) return;
        setImage(result.url); setRatio(`${result.width} / ${result.height}`); setStatus("ready");
      }).catch(error => { if (!disposed) { setStatus("error"); console.warn("Native card resource", error); } });
      return () => { disposed = true; };
    }
    void (async () => {
      if (!host.current) return;
      // Keep the completed canvas visible while its replacement is painted.
      const rendered = await renderNative(document.createElement("div"), entry, data, server, fontFamily);
      player = rendered.player;
      if (disposed || !host.current) player.destroy();
      else {
        const previous = displayed.current;
        host.current.replaceChildren(player.canvas);
        displayed.current = player;
        previous?.destroy();
        setRatio(`${player.canvas.width} / ${player.canvas.height}`); onGeometry?.({ ...rendered.result, canvas: player.canvas, layout: rendered.layout }); setStatus("ready");
      }
    })().catch(error => { if (!disposed) { setStatus("error"); console.warn("Native card resource", error); } });
    return () => { disposed = true; if (player && displayed.current !== player) player.destroy(); };
  }, [entry, dataKey, server, near]);
  useEffect(() => () => { displayed.current?.destroy(); displayed.current = null; }, []);

  return <div ref={root} className={`mn-native-card mn-native-card--${entry} ${className}`.trim()} style={{ aspectRatio: ratio }} data-renderer="nnnotes-ui" data-status={status}
    role="img" aria-label={label} aria-busy={status === "loading"}>
    {status === "loading" && <span className="pointer-events-none absolute inset-0 grid place-items-center"><SiriusIcon className="h-8 w-8" /></span>}
    {snapshot
      ? <div className="mn-native-card-canvas" aria-hidden="true">{image ? <img src={image} alt="" draggable={false} /> : null}</div>
      : <div ref={host} className="mn-native-card-canvas" aria-hidden="true" />}
    {status === "error" ? <span className="mn-native-card-fallback">{label}</span> : null}
  </div>;
}
