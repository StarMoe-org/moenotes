import { describe, expect, mock, test } from "bun:test";
import { createMusicDataLoader, MUSIC_DATA_FORMAT } from "../src/lib/chart-data/client";
import { DECK_DATA_FORMAT, REPLAY_MANIFEST_FORMAT, resolveDeckRuntime, sha256Hex, type DeckRuntimeSourceOptions } from "../src/lib/deck/runtime-source";
import { DECK_WORKER_PROTOCOL, deckWorkerInit } from "../src/lib/deck/worker-protocol";

const SITES = { intl: "https://data.example.invalid/music-data", jp: "https://data.example.invalid/jp/music-data" } as const;
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const digest = (bytes: Uint8Array) => sha256Hex(bytes.slice().buffer);

interface PublicationOptions {
  site?: string;
  pointer?: "build" | "music-data" | "music-data-without-build" | "none";
  deckData?: boolean;
  recommendEngine?: boolean;
  recommendCommit?: string;
  replayCommit?: string;
  manifestPatch?: Record<string, unknown>;
}

/** A synthetic music data site: build.json / music-data.json -> replay manifest -> deck data and engines. */
async function publication(options: PublicationOptions = {}) {
  const site = options.site ?? SITES.intl, commit = "0123abcd";
  const deck = encode({ format: DECK_DATA_FORMAT, provenance: { region: "tw", deck: { commit } }, master: {}, charts: [] });
  const glue = encode("synthetic glue"), wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), build = encode({ format: "synthetic-build" });
  const file = async (url: string, bytes: Uint8Array) => ({ url, sha256: await digest(bytes), bytes: bytes.length });
  const manifest = {
    format: REPLAY_MANIFEST_FORMAT,
    ...(options.deckData === false ? {} : { deckData: { format: DECK_DATA_FORMAT, ...await file("deck-data.json", deck) } }),
    charts: [],
    engine: { model: { name: "synthetic-model", commit: options.replayCommit ?? commit }, requestFormat: "synthetic.replay/1", class: "ReplaySession",
      js: await file("engine/replay.js", glue), wasm: await file("engine/replay_bg.wasm", wasm) },
    ...(options.recommendEngine === false ? {} : { recommendEngine: { model: { name: "synthetic-model", version: "0.0.1", source: "https://example.invalid/model", commit: options.recommendCommit ?? commit, format: "synthetic.stats/1" },
      js: await file("recommend/solver.js", glue), wasm: await file("recommend/solver_bg.wasm", wasm), build: await file("recommend/build.json", build) } }),
    ...options.manifestPatch,
  };
  const manifestBytes = encode(manifest), manifestSha = await digest(manifestBytes);
  const reference = { format: REPLAY_MANIFEST_FORMAT, manifestUrl: `replay/${manifestSha}/manifest.json`, sha256: manifestSha, charts: 0 };
  const pointer = options.pointer ?? "build";
  const dir = `${site}/replay/${manifestSha}`;
  const objects = new Map<string, Uint8Array>([
    [`${site}/music-data.json`, encode({ format: MUSIC_DATA_FORMAT, songs: [], ...(pointer === "none" ? {} : { replay: reference }) })],
    [`${dir}/manifest.json`, manifestBytes],
    [`${dir}/deck-data.json`, deck],
    [`${dir}/recommend/solver.js`, glue],
    [`${dir}/recommend/solver_bg.wasm`, wasm],
  ]);
  if (pointer !== "music-data-without-build") objects.set(`${site}/build.json`, encode({ format: "moenotes.music-data-build/1", file: "music-data.json", ...(pointer === "build" ? { replay: reference } : {}) }));
  return { site, objects, dir, manifestSha, commit, deckSha: await digest(deck), glueSha: await digest(glue), wasmSha: await digest(wasm), deckBytes: deck.length };
}

function transport(objects: Map<string, Uint8Array>) {
  const fetch = mock(async (url: string, _init: RequestInit) => {
    const body = objects.get(url);
    return body ? new Response(body.slice()) : new Response("missing", { status: 404 });
  });
  const loadMusicData = mock(createMusicDataLoader({ fetch, get: async () => null, set: async () => undefined, delete: async () => undefined, bypass: () => false }));
  const options: DeckRuntimeSourceOptions = { sites: SITES, engineOverride: null, fetch, loadMusicData };
  return { fetch, loadMusicData, options, requested: () => fetch.mock.calls.map(([url]) => url) };
}

describe("deck runtime source", () => {
  test("build.json's replay pointer resolves the deck data and recommendation engine to absolute URLs with SHA-256 and size", async () => {
    const site = await publication(), io = transport(site.objects);
    const resolved = await resolveDeckRuntime("tw", io.options);
    expect(resolved).toEqual({ status: "available", runtime: {
      server: "intl",
      pointer: { kind: "build", url: `${SITES.intl}/build.json` },
      manifest: { url: `${site.dir}/manifest.json`, sha256: site.manifestSha },
      deckData: { url: `${site.dir}/deck-data.json`, sha256: site.deckSha, bytes: site.deckBytes },
      engine: {
        model: { name: "synthetic-model", version: "0.0.1", source: "https://example.invalid/model", commit: site.commit, format: "synthetic.stats/1" },
        js: { url: `${site.dir}/recommend/solver.js`, sha256: site.glueSha, bytes: 16 },
        wasm: { url: `${site.dir}/recommend/solver_bg.wasm`, sha256: site.wasmSha, bytes: 8 },
        build: { url: `${site.dir}/recommend/build.json`, sha256: expect.stringMatching(/^[0-9a-f]{64}$/), bytes: expect.any(Number) },
      },
      modelCommit: site.commit,
      override: false,
    } });
    expect(io.loadMusicData).not.toHaveBeenCalled();
    expect(io.requested()).toEqual([`${SITES.intl}/build.json`, `${site.dir}/manifest.json`]);
    expect(io.fetch.mock.calls[0]![1]).toMatchObject({ cache: "no-cache", credentials: "omit" });
  });

  test("without a replay field in build.json, music-data.json's replay reference names the manifest", async () => {
    const site = await publication({ pointer: "music-data" }), io = transport(site.objects);
    const resolved = await resolveDeckRuntime("tw", io.options);
    expect(resolved.status).toBe("available");
    if (resolved.status !== "available") return;
    expect(resolved.runtime.pointer).toEqual({ kind: "music-data", url: `${SITES.intl}/music-data.json` });
    expect(resolved.runtime.manifest.url).toBe(`${site.dir}/manifest.json`);
    expect(io.loadMusicData).toHaveBeenCalledTimes(1);
  });

  test("a site without build.json falls back to music-data.json", async () => {
    const site = await publication({ pointer: "music-data-without-build" }), io = transport(site.objects);
    const resolved = await resolveDeckRuntime("tw", io.options);
    expect(resolved.status === "available" && resolved.runtime.pointer.kind).toBe("music-data");
  });

  test("tw, kr and en read the international data line; jp reads its own site", async () => {
    const intl = await publication(), jp = await publication({ site: SITES.jp });
    const io = transport(new Map([...intl.objects, ...jp.objects]));
    for (const server of ["tw", "kr", "en"] as const) {
      const resolved = await resolveDeckRuntime(server, io.options);
      expect(resolved.status === "available" && [resolved.runtime.server, resolved.runtime.manifest.url]).toEqual(["intl", `${intl.dir}/manifest.json`]);
    }
    const resolved = await resolveDeckRuntime("jp", io.options);
    expect(resolved.status === "available" && [resolved.runtime.server, resolved.runtime.manifest.url]).toEqual(["jp", `${jp.dir}/manifest.json`]);
  });

  test("published data without a replay reference, deck data or recommendation engine is unavailable", async () => {
    const none = await publication({ pointer: "none" });
    expect(await resolveDeckRuntime("tw", transport(none.objects).options)).toMatchObject({ status: "unavailable", server: "intl", reason: "no-replay" });
    const noEngine = await publication({ recommendEngine: false });
    expect(await resolveDeckRuntime("tw", transport(noEngine.objects).options)).toMatchObject({ status: "unavailable", reason: "no-recommend-engine" });
    const noData = await publication({ deckData: false });
    expect(await resolveDeckRuntime("tw", transport(noData.objects).options)).toMatchObject({ status: "unavailable", reason: "no-deck-data" });
  });

  test("a recommendation engine of another model commit than the replay engine is unavailable", async () => {
    const site = await publication({ recommendCommit: "ffff0000" });
    expect(await resolveDeckRuntime("tw", transport(site.objects).options)).toMatchObject({ status: "unavailable", reason: "model-mismatch" });
    const noReplayModel = await publication({ manifestPatch: { engine: undefined } });
    expect(await resolveDeckRuntime("tw", transport(noReplayModel.objects).options)).toMatchObject({ status: "unavailable", reason: "model-mismatch" });
  });

  test("a manifest whose bytes differ from the pointer's SHA-256 fails the integrity check", async () => {
    const site = await publication();
    site.objects.set(`${site.dir}/manifest.json`, encode({ format: REPLAY_MANIFEST_FORMAT, altered: true }));
    expect(await resolveDeckRuntime("tw", transport(site.objects).options)).toMatchObject({ status: "failed", code: "integrity" });
  });

  test("malformed entries and unsupported formats fail as format errors", async () => {
    const badEntry = await publication({ manifestPatch: { recommendEngine: { model: { commit: "0123abcd" }, js: { url: "solver.js", sha256: "not-a-hash", bytes: 1 }, wasm: { url: "solver_bg.wasm", sha256: "a".repeat(64), bytes: 1 } } } });
    expect(await resolveDeckRuntime("tw", transport(badEntry.objects).options)).toMatchObject({ status: "failed", code: "format" });
    const badData = await publication({ manifestPatch: { deckData: { format: "synthetic.deck-data/9", url: "deck-data.json", sha256: "a".repeat(64), bytes: 1 } } });
    expect(await resolveDeckRuntime("tw", transport(badData.objects).options)).toMatchObject({ status: "failed", code: "format" });
    const site = await publication();
    site.objects.set(`${SITES.intl}/build.json`, encode({ replay: { format: "synthetic.replay-manifest/9", manifestUrl: "m.json", sha256: "a".repeat(64) } }));
    expect(await resolveDeckRuntime("tw", transport(site.objects).options)).toMatchObject({ status: "failed", code: "format" });
  });

  test("transport errors fail as network errors; an abort rejects", async () => {
    const site = await publication(), io = transport(site.objects);
    io.fetch.mockImplementationOnce(async () => new Response("unavailable", { status: 503 }));
    expect(await resolveDeckRuntime("tw", io.options)).toMatchObject({ status: "failed", code: "network", message: expect.stringContaining("HTTP 503") });
    io.fetch.mockImplementationOnce(async () => { throw new TypeError("connection refused"); });
    expect(await resolveDeckRuntime("tw", io.options)).toMatchObject({ status: "failed", code: "network" });
    const controller = new AbortController();
    io.fetch.mockImplementationOnce(async () => { controller.abort(new DOMException("stop", "AbortError")); throw new DOMException("stop", "AbortError"); });
    await expect(resolveDeckRuntime("tw", { ...io.options, signal: controller.signal })).rejects.toThrow("stop");
  });

  test("a development engine descriptor replaces recommendEngine, fills in missing hashes and sizes, and skips the model check", async () => {
    const site = await publication({ recommendEngine: false });
    const glue = encode("local glue"), wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1]);
    site.objects.set("https://dev.example.invalid/engine/descriptor.json", encode({ js: { url: "solver.js" }, wasm: { url: "solver_bg.wasm", sha256: await digest(wasm), bytes: wasm.length } }));
    site.objects.set("https://dev.example.invalid/engine/solver.js", glue);
    site.objects.set("https://dev.example.invalid/engine/solver_bg.wasm", wasm);
    const resolved = await resolveDeckRuntime("tw", { ...transport(site.objects).options, engineOverride: "https://dev.example.invalid/engine/descriptor.json" });
    expect(resolved.status === "available" && resolved.runtime).toMatchObject({ override: true, modelCommit: null, engine: { model: null, build: null,
      js: { url: "https://dev.example.invalid/engine/solver.js", sha256: await digest(glue), bytes: glue.length },
      wasm: { url: "https://dev.example.invalid/engine/solver_bg.wasm", sha256: await digest(wasm), bytes: wasm.length } } });
  });

  test("the Worker init message carries the deck data, the engine WASM and glue, and the model commit", async () => {
    const site = await publication();
    const resolved = await resolveDeckRuntime("jp", { ...transport((await publication({ site: SITES.jp })).objects).options });
    expect(resolved.status).toBe("available");
    if (resolved.status !== "available") return;
    const { runtime } = resolved;
    expect(deckWorkerInit(runtime)).toEqual({ type: "init", protocol: DECK_WORKER_PROTOCOL,
      deckDataUrl: runtime.deckData.url, deckDataSha256: site.deckSha, deckDataBytes: site.deckBytes,
      wasmUrl: runtime.engine.wasm.url, wasmSha256: site.wasmSha, wasmBytes: 8,
      glueUrl: runtime.engine.js.url, glueSha256: site.glueSha, glueBytes: 16, modelCommit: site.commit });
  });
});
