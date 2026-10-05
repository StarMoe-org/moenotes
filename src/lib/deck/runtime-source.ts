import { assetConfig } from "@/config/assets";
import type { GameServer } from "@/config/servers";
import { getNativeFetch } from "@/lib/cache/cached-fetch";
import { createMusicDataLoader, MusicDataError } from "@/lib/chart-data/client";
import type { MusicData } from "@/lib/chart-data/types";

/**
 * Where the deck solver runtime of a game server comes from (docs/deck-worker.md). The music data site's `build.json`
 * (or, without a `replay` field there, `music-data.json`) names the replay manifest by SHA-256; the manifest names the
 * deck data and the recommendation engine by URL, SHA-256 and size. Every URL comes back absolute.
 */

/** Deck data lines: JP, and the international line shared by the tw, kr and en servers. */
export type DeckServer = "jp" | "intl";
export const DECK_SERVER_OF: Readonly<Record<GameServer, DeckServer>> = { tw: "intl", jp: "jp", kr: "intl", en: "intl" };

export const REPLAY_MANIFEST_FORMAT = "nnnotes.replay-manifest/1";
export const DECK_DATA_FORMAT = "nnnotes.deck-data/1";

export interface DeckRuntimeFile { url: string; sha256: string; bytes: number }
export interface DeckEngineModel { name?: string; version?: string; source?: string; commit: string; format?: string }
export interface DeckRecommendEngine {
  /** Absent only in a development override that names no model. */
  model: DeckEngineModel | null;
  /** The wasm-bindgen ES module glue. */
  js: DeckRuntimeFile;
  wasm: DeckRuntimeFile;
  build: DeckRuntimeFile | null;
}
export interface DeckSolverRuntime {
  server: DeckServer;
  /** The file whose `replay` field named the manifest. */
  pointer: { kind: "build" | "music-data"; url: string };
  manifest: { url: string; sha256: string };
  deckData: DeckRuntimeFile;
  engine: DeckRecommendEngine;
  /**
   * The model commit the recommendation engine, the replay engine and the deck data all name. The Worker checks the
   * deck data's `provenance.deck.commit` against it. `null` with a development engine override, which skips that check.
   */
  modelCommit: string | null;
  /** True when an engine descriptor (this site's engine build) replaced the published `recommendEngine`. */
  override: boolean;
}

/** The published data offers no recommendation runtime; retrying does not help until the data is published again. */
export type DeckRuntimeUnavailableReason = "no-replay" | "no-deck-data" | "no-recommend-engine" | "model-mismatch";
/** Reading the published data failed: transport, a SHA-256 or size mismatch, or a file this version cannot read. */
export type DeckRuntimeFailureCode = "network" | "integrity" | "format";
export type DeckRuntimeResolution =
  | { status: "available"; runtime: DeckSolverRuntime }
  | { status: "unavailable"; server: DeckServer; reason: DeckRuntimeUnavailableReason; message: string }
  | { status: "failed"; server: DeckServer; code: DeckRuntimeFailureCode; message: string };

/** A development engine descriptor: the `recommendEngine` shape, where a file may omit its SHA-256 and size. */
export interface DeckEngineOverride {
  model?: DeckEngineModel;
  js: { url: string; sha256?: string; bytes?: number };
  wasm: { url: string; sha256?: string; bytes?: number };
  build?: { url: string; sha256?: string; bytes?: number };
}

export interface DeckRuntimeSourceOptions {
  signal?: AbortSignal;
  /** Music data site of each deck data line; defaults to `assetConfig.musicDataSite` and `musicDataSiteJp`. */
  sites?: Readonly<Record<DeckServer, string>>;
  /**
   * Replaces the manifest's `recommendEngine`: a descriptor URL (relative to the page) or a descriptor. Defaults to
   * `assetConfig.deck.recommendEngine`, the engine build this site serves; `null` turns it off.
   */
  engineOverride?: string | DeckEngineOverride | null;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** Reads `music-data.json`; defaults to the chart data tool's loader and its short-lived browser cache. */
  loadMusicData?: (url: string, signal?: AbortSignal) => Promise<MusicData>;
}

class DeckRuntimeSourceError extends Error {
  constructor(readonly code: DeckRuntimeFailureCode, message: string, readonly status?: number) {
    super(message);
    this.name = "DeckRuntimeSourceError";
  }
}
class DeckRuntimeUnavailable extends Error {
  constructor(readonly reason: DeckRuntimeUnavailableReason, message: string) {
    super(message);
    this.name = "DeckRuntimeUnavailable";
  }
}

const HEX64 = /^[0-9a-f]{64}$/;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const pageBase = () => (typeof location === "undefined" ? undefined : location.href);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const sharedMusicData = createMusicDataLoader();

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
}

interface Transport { fetch: NonNullable<DeckRuntimeSourceOptions["fetch"]>; signal: AbortSignal | undefined }

async function download(url: string, transport: Transport, init: RequestInit = {}): Promise<ArrayBuffer> {
  const { signal } = transport;
  let response: Response;
  try { response = await transport.fetch(url, { ...init, credentials: "omit", ...(signal ? { signal } : {}) }); }
  catch (error) { if (signal?.aborted) throw error; throw new DeckRuntimeSourceError("network", `${url}: ${message(error)}`); }
  if (!response.ok) throw new DeckRuntimeSourceError("network", `${url}: HTTP ${response.status}`, response.status);
  try { return await response.arrayBuffer(); }
  catch (error) { if (signal?.aborted) throw error; throw new DeckRuntimeSourceError("network", `${url}: ${message(error)}`); }
}

async function verified(url: string, expected: { sha256: string; bytes?: number }, transport: Transport): Promise<ArrayBuffer> {
  const bytes = await download(url, transport);
  if (expected.bytes !== undefined && bytes.byteLength !== expected.bytes) throw new DeckRuntimeSourceError("integrity", `${url}: ${bytes.byteLength} bytes, expected ${expected.bytes}`);
  const actual = await sha256Hex(bytes);
  if (actual !== expected.sha256) throw new DeckRuntimeSourceError("integrity", `${url}: SHA-256 ${actual}, expected ${expected.sha256}`);
  return bytes;
}

function parseJson(bytes: ArrayBuffer, label: string): unknown {
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new DeckRuntimeSourceError("format", `${label}: not JSON`); }
}

/** `{format, manifestUrl, sha256, charts}`, the same in `build.json` and `music-data.json`. */
function replayReference(value: unknown, label: string): { manifestUrl: string; sha256: string } {
  if (!record(value) || value.format !== REPLAY_MANIFEST_FORMAT) throw new DeckRuntimeSourceError("format", `${label}: replay reference of an unsupported format`);
  if (typeof value.manifestUrl !== "string" || !value.manifestUrl || typeof value.sha256 !== "string" || !HEX64.test(value.sha256)) {
    throw new DeckRuntimeSourceError("format", `${label}: invalid replay reference`);
  }
  return { manifestUrl: value.manifestUrl, sha256: value.sha256 };
}

function fileEntry(value: unknown, base: string | undefined, label: string): DeckRuntimeFile {
  if (!record(value) || typeof value.url !== "string" || !value.url || typeof value.sha256 !== "string" || !HEX64.test(value.sha256)
    || !Number.isSafeInteger(value.bytes) || (value.bytes as number) < 1) throw new DeckRuntimeSourceError("format", `${label}: invalid file entry`);
  return { url: new URL(value.url, base).href, sha256: value.sha256, bytes: value.bytes as number };
}

function engineModel(value: unknown, label: string): DeckEngineModel {
  if (!record(value) || typeof value.commit !== "string" || !value.commit) throw new DeckRuntimeSourceError("format", `${label}: model names no commit`);
  const model: DeckEngineModel = { commit: value.commit };
  for (const key of ["name", "version", "source", "format"] as const) if (typeof value[key] === "string") model[key] = value[key];
  return model;
}

function recommendEngine(value: unknown, manifestUrl: string): DeckRecommendEngine & { model: DeckEngineModel } {
  if (!record(value)) throw new DeckRuntimeSourceError("format", "recommendEngine: not an object");
  return { model: engineModel(value.model, "recommendEngine"), js: fileEntry(value.js, manifestUrl, "recommendEngine.js"),
    wasm: fileEntry(value.wasm, manifestUrl, "recommendEngine.wasm"),
    build: value.build === undefined ? null : fileEntry(value.build, manifestUrl, "recommendEngine.build") };
}

/** A descriptor file may omit a SHA-256 or size; the file is then downloaded once here to fill them in. */
async function overrideFile(value: unknown, base: string | undefined, label: string, transport: Transport): Promise<DeckRuntimeFile> {
  if (!record(value) || typeof value.url !== "string" || !value.url) throw new DeckRuntimeSourceError("format", `${label}: invalid file entry`);
  if (value.sha256 !== undefined && value.bytes !== undefined) return fileEntry(value, base, label);
  const url = new URL(value.url, base).href, bytes = await download(url, transport), sha256 = await sha256Hex(bytes);
  if (value.sha256 !== undefined && value.sha256 !== sha256 || value.bytes !== undefined && value.bytes !== bytes.byteLength) {
    throw new DeckRuntimeSourceError("integrity", `${url}: differs from the engine override`);
  }
  return { url, sha256, bytes: bytes.byteLength };
}

async function overrideEngine(override: string | DeckEngineOverride, transport: Transport): Promise<DeckRecommendEngine> {
  let base = pageBase(), descriptor: unknown = override;
  if (typeof override === "string") {
    base = new URL(override, pageBase()).href;
    descriptor = parseJson(await download(base, transport, { cache: "no-cache" }), "engine override");
  }
  if (!record(descriptor)) throw new DeckRuntimeSourceError("format", "engine override: not an object");
  const [js, wasm, build] = await Promise.all([overrideFile(descriptor.js, base, "override.js", transport), overrideFile(descriptor.wasm, base, "override.wasm", transport),
    descriptor.build === undefined ? null : overrideFile(descriptor.build, base, "override.build", transport)]);
  return { model: descriptor.model === undefined ? null : engineModel(descriptor.model, "engine override"), js, wasm, build };
}

/** `build.json` is uploaded last, so its `replay` names a complete manifest; older files carry it in `music-data.json` only. */
async function replayPointer(site: URL, transport: Transport, loadMusicData: NonNullable<DeckRuntimeSourceOptions["loadMusicData"]>) {
  const buildUrl = new URL("build.json", site).href;
  let build: ArrayBuffer | null = null;
  try { build = await download(buildUrl, transport, { cache: "no-cache", headers: { Accept: "application/json" } }); }
  catch (error) { if (!(error instanceof DeckRuntimeSourceError && error.status === 404)) throw error; }
  if (build) {
    const value = parseJson(build, "build.json");
    if (!record(value)) throw new DeckRuntimeSourceError("format", "build.json: not an object");
    if (value.replay !== undefined && value.replay !== null) return { kind: "build" as const, url: buildUrl, reference: replayReference(value.replay, "build.json") };
  }
  const musicDataUrl = new URL("music-data.json", site).href;
  let data: MusicData;
  try { data = await loadMusicData(musicDataUrl, transport.signal); }
  catch (error) {
    if (transport.signal?.aborted) throw error;
    const network = error instanceof TypeError || error instanceof MusicDataError && /HTTP \d+/.test(error.message);
    throw new DeckRuntimeSourceError(network ? "network" : "format", `${musicDataUrl}: ${message(error)}`);
  }
  if (data.replay === undefined || data.replay === null) return null;
  return { kind: "music-data" as const, url: musicDataUrl, reference: replayReference(data.replay, "music-data.json") };
}

/**
 * Resolve the deck solver runtime of a game server: available with every file's absolute URL, SHA-256 and size, or
 * unavailable with the reason, or failed. Read it again for each session: a new publication changes the hashes.
 * Aborting `signal` rejects with the abort reason.
 */
export async function resolveDeckRuntime(server: GameServer, options: DeckRuntimeSourceOptions = {}): Promise<DeckRuntimeResolution> {
  const deckServer = DECK_SERVER_OF[server];
  const sites = options.sites ?? { intl: assetConfig.musicDataSite, jp: assetConfig.musicDataSiteJp };
  const override = options.engineOverride === undefined ? assetConfig.deck.recommendEngine || null : options.engineOverride;
  const transport: Transport = { fetch: options.fetch ?? ((url, init) => getNativeFetch()(url, init)), signal: options.signal };
  try {
    const site = new URL(`${sites[deckServer].replace(/\/+$/, "")}/`, pageBase());
    const pointer = await replayPointer(site, transport, options.loadMusicData ?? sharedMusicData);
    if (!pointer) throw new DeckRuntimeUnavailable("no-replay", `${site.href}: neither build.json nor music-data.json names a replay manifest`);
    const manifestUrl = new URL(pointer.reference.manifestUrl, pointer.url).href;
    const manifest = parseJson(await verified(manifestUrl, pointer.reference, transport), "replay manifest");
    if (!record(manifest) || manifest.format !== REPLAY_MANIFEST_FORMAT) throw new DeckRuntimeSourceError("format", `${manifestUrl}: unsupported manifest format`);
    if (manifest.deckData === undefined) throw new DeckRuntimeUnavailable("no-deck-data", `${manifestUrl}: no deckData`);
    if (!record(manifest.deckData) || manifest.deckData.format !== DECK_DATA_FORMAT) throw new DeckRuntimeSourceError("format", `${manifestUrl}: deckData of an unsupported format`);
    const deckData = fileEntry(manifest.deckData, manifestUrl, "deckData");
    let engine: DeckRecommendEngine, modelCommit: string | null = null;
    if (override) engine = await overrideEngine(override, transport);
    else {
      if (manifest.recommendEngine === undefined) throw new DeckRuntimeUnavailable("no-recommend-engine", `${manifestUrl}: this data version has no recommendation engine`);
      const published = recommendEngine(manifest.recommendEngine, manifestUrl);
      const replayCommit = record(manifest.engine) && record(manifest.engine.model) ? manifest.engine.model.commit : undefined;
      if (published.model.commit !== replayCommit) {
        throw new DeckRuntimeUnavailable("model-mismatch", `${manifestUrl}: recommendation engine model ${published.model.commit} differs from replay engine model ${String(replayCommit)}`);
      }
      engine = published;
      modelCommit = published.model.commit;
    }
    return { status: "available", runtime: { server: deckServer, pointer: { kind: pointer.kind, url: pointer.url }, manifest: { url: manifestUrl, sha256: pointer.reference.sha256 },
      deckData, engine, modelCommit, override: !!override } };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof DeckRuntimeUnavailable) return { status: "unavailable", server: deckServer, reason: error.reason, message: error.message };
    if (error instanceof DeckRuntimeSourceError) return { status: "failed", server: deckServer, code: error.code, message: error.message };
    throw error;
  }
}
