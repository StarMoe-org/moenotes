import { useEffect, useRef, useState } from "react";
import { assetConfig } from "@/config/assets";
import { useContentServerScope } from "@/lib/servers/use-content-server";
import { loadNativeUiLibrary, type NativeUiEntry, type NativeFormationLayout } from "@/lib/game-ui/source";
import { createNativeCardFixture, type NativeCardFixtureData } from "@/lib/game-ui/card-fixture";
import { createNativeFormationFixture, type NativeFormationFixtureData } from "@/lib/game-ui/formation-fixture";
import type { UIPlayer, UIRenderResult } from "ournotes-player/ui";

/** nnnotes' serialized prefab assembled by its companion renderer, inside an ordinary semantic button. */
export default function NativeGameCard({ entry, data, label, className = "", onGeometry }: {
  entry: NativeUiEntry; data: NativeCardFixtureData | NativeFormationFixtureData; label: string; className?: string;
  onGeometry?: ((result: UIRenderResult & { layout: NativeFormationLayout }) => void) | undefined;
}) {
  const { server } = useContentServerScope();
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [ratio, setRatio] = useState(entry === "formationGroup" ? "1920 / 1080" : entry === "formationSlot" ? "332 / 600" : "1");
  const dataKey = JSON.stringify(data);
  useEffect(() => {
    let disposed = false;
    let player: UIPlayer | undefined;
    setStatus("loading");
    void (async () => {
      const library = await loadNativeUiLibrary(assetConfig.gameUiLibraries[server], server);
      const { UIPlayer, UISession, cameraProjection } = await import("ournotes-player/ui");
      await document.fonts.ready;
      if (disposed || !host.current) return;
      const pack = library.pack(entry);
      pack.resources.browserFontFamily = getComputedStyle(host.current).fontFamily || "sans-serif";
      const fixture = entry === "formationGroup"
        ? createNativeFormationFixture(pack, { ...data as NativeFormationFixtureData, catalogs: library.catalogs, spriteGeometries: library.spriteGeometries })
        : createNativeCardFixture(pack, { ...data as NativeCardFixtureData, catalogs: library.catalogs, spriteGeometries: library.spriteGeometries });
      const session = new UISession(pack, { bindings: true });
      for (const patch of fixture.patches) session.edit(patch.node, patch.component ?? null, patch.field, patch.value);
      player = new UIPlayer(host.current, { bindings: true, assetBase: library.assetBase,
        ...(entry === "formationGroup" ? { projection: cameraProjection(library.camera.camera, library.camera.canvas, library.camera.referenceViewport), framing: "content" as const } : {}) });
      await player.load(session.prepare());
      const result = await player.render();
      if (disposed) player.destroy();
      else {
        if (!result || !("bounds" in result) || !("regions" in result)) throw new Error("Native prefab produced no layout result");
        setRatio(`${player.canvas.width} / ${player.canvas.height}`); onGeometry?.({ ...result, canvas: player.canvas, layout: library.manifest.layout }); setStatus("ready");
      }
    })().catch(error => { if (!disposed) { setStatus("error"); console.warn("Native card resource", error); } });
    return () => { disposed = true; player?.destroy(); host.current?.replaceChildren(); };
  }, [entry, dataKey, server]);
  return <div className={`mn-native-card mn-native-card--${entry} ${className}`.trim()} style={{ aspectRatio: ratio }} data-renderer="nnnotes-ui" data-status={status}
    role="img" aria-label={label} aria-busy={status === "loading"}>
    <div ref={host} className="mn-native-card-canvas" aria-hidden="true" />
    {status === "error" ? <span className="mn-native-card-fallback">{label}</span> : null}
  </div>;
}
