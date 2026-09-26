import { createWriteStream } from "node:fs";
import { link, mkdir, readdir, rename, rm, symlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { ServerConfig } from "./config";
import type { SiteRoots } from "./static";
import type { DataVersion } from "./upstream";

/**
 * Builds on the data volume:
 *
 *   state.json               the live build
 *   builds/<id>/site/        Astro output (web root); precompressed variants are added once it is live
 *   builds/<id>/files.json   size + SHA-256 per file, for the next build's finalize step
 *   builds/.staging-<id>/    a build in progress; removed on failure and at startup
 *   logs/<id>.log            full Astro / finalize output of each attempt
 *   logs/latest.log          link to the newest attempt's log
 *   cache/fetch/             revalidated upstream responses (src/lib/build/fetch.ts)
 *
 * Ids start with a UTC timestamp, so they sort by age.
 */

export interface BuildRecord {
  id: string;
  key: string;
  revision: string;
  data: string;
  builtAt: string;
  durationMs: number;
  /** Pages Astro rendered; absent from records written before builds counted them. */
  pages?: number;
}

interface State {
  current: BuildRecord | null;
}

const STAGING_PREFIX = ".staging-";
const LATEST_LOG = "latest.log";
const ASTRO_STEP = "astro build";
const FINALIZE_STEP = "finalize";
const COMPRESSION_WAIT_STEP = "waiting for the live build's compression";
/**
 * Astro prints a marker as it starts each page (`12:00:00   ├─ /story/1/index.html (+2ms)`); with build
 * concurrency several share a line. The log keeps them; the console gets a progress line instead.
 */
const PAGE_MARKER = /[├└]─ \//g;
/** The render time Astro appends to a page marker (`(+2ms)`, `(+1.20s)`); under concurrency it can land on a line of its own. */
const RENDER_TIME = /^ \(\+[\d.ms ]+\)/;
const PROGRESS_INTERVAL_MS = 30_000;

export function log(message: string): void {
  console.log(`${new Date().toISOString()} [moenotes] ${message}`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** `45s`, `4m10s`, `1h02m`. */
function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}m`;
}

/** A running build as the periodic console line and the status endpoint report it. */
class BuildProgress {
  step = "";
  pages = 0;
  private readonly startedAt = Date.now();
  private firstPageAt = 0;

  /** `expectedPages` is the live build's count: an estimate, since a release can add or drop pages. */
  constructor(readonly id: string, readonly expectedPages: number | null) {}

  addPages(count: number): void {
    if (count && !this.pages) this.firstPageAt = Date.now();
    this.pages += count;
  }

  describe(now = Date.now()): string {
    const elapsed = `${duration(now - this.startedAt)} elapsed`;
    if (this.step !== ASTRO_STEP) return `${this.step}, ${elapsed}`;
    if (!this.pages) return `${ASTRO_STEP}, no page rendered yet, ${elapsed}`;
    if (!this.expectedPages) return `${ASTRO_STEP}, ${this.pages} pages, ${elapsed}`;
    const share = this.pages / this.expectedPages;
    // Capped: a release that adds pages runs past the estimate.
    const parts = [`${ASTRO_STEP}, ${this.pages}/~${this.expectedPages} pages (${Math.min(99, Math.floor(share * 100))}%)`, elapsed];
    if (share < 1) parts.push(`rendering done in ~${duration((now - this.firstPageAt) * (1 / share - 1))}`);
    return parts.join(", ");
  }

  toJSON() {
    return { id: this.id, step: this.step, pages: this.pages, expectedPages: this.expectedPages };
  }
}

/** The Astro CLI entry of the installed package (run directly: the build does not run from the project root). */
export async function astroCli(appDir: string): Promise<string> {
  const cli = join(dirname(Bun.resolveSync("astro/package.json", appDir)), "bin", "astro.mjs");
  if (!await Bun.file(cli).exists()) throw new Error(`Astro CLI not found at ${cli}`);
  return cli;
}

/** An unreadable state file means no live build (the next check rebuilds), not a crash loop. */
async function readState(path: string): Promise<State> {
  const file = Bun.file(path);
  if (!await file.exists()) return { current: null };
  try {
    return await file.json() as State;
  } catch (error) {
    log(`ignoring unreadable ${path}: ${errorMessage(error)}`);
    return { current: null };
  }
}

/** Where a step's output goes: the build's log, reopened for appending by the background compression. */
interface LogSink {
  write(text: string): unknown;
}

export class BuildStore {
  current: BuildRecord | null = null;
  roots: SiteRoots = { current: null, previous: [] };
  progress: BuildProgress | null = null;
  compressing: { id: string; startedAt: string } | null = null;
  /** Settles once the live build's variants are written; never rejects. */
  private compression: Promise<void> = Promise.resolve();
  private readonly processes = new Set<Bun.Subprocess>();
  private stopping = false;

  constructor(private readonly config: ServerConfig) {}

  private buildDir(id: string): string {
    return join(this.config.buildsDir, id);
  }

  private siteDir(id: string): string {
    return join(this.buildDir(id), "site");
  }

  /** Quick enough to run before the HTTP server starts: reads the state and lists builds. */
  async load(): Promise<void> {
    await mkdir(this.config.buildsDir, { recursive: true });
    await mkdir(this.config.logsDir, { recursive: true });
    const state = await readState(this.config.statePath);
    if (state.current && await Bun.file(join(this.siteDir(state.current.id), "index.html")).exists()) {
      this.current = state.current;
    } else if (state.current) {
      log(`build ${state.current.id} from state.json is missing on disk; starting without one`);
    }
    await this.refreshRoots();
  }

  /** Leftovers of interrupted builds, old builds and an interrupted compression; run in the background after startup. */
  async cleanUp(): Promise<void> {
    for (const name of await readdir(this.config.buildsDir)) {
      if (name.startsWith(STAGING_PREFIX)) await rm(join(this.config.buildsDir, name), { recursive: true, force: true });
    }
    await this.prune();
    this.startCompression();
  }

  async build(key: string, revision: string, data: DataVersion): Promise<BuildRecord> {
    const startedAt = Date.now();
    const id = `${new Date(startedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${key.slice(0, 8)}`;
    const staging = join(this.config.buildsDir, `${STAGING_PREFIX}${id}`);
    const site = join(staging, "site");
    const logPath = join(this.config.logsDir, `${id}.log`);
    const logFile = Bun.file(logPath).writer();
    const progress = new BuildProgress(id, await this.expectedPages().catch(() => null));
    const expected = progress.expectedPages ? `, ~${progress.expectedPages} pages expected` : "";
    log(`build ${id} started (${data.label}, revision ${revision}${expected}); log: ${logPath}`);
    logFile.write(`build ${id} (${data.label}, revision ${revision}) started ${new Date(startedAt).toISOString()}\n`);
    await logFile.flush();
    await this.linkLatestLog(logPath).catch((error: unknown) => log(`could not update ${LATEST_LOG}: ${errorMessage(error)}`));
    this.progress = progress;
    const ticker = setInterval(() => log(`build ${id}: ${progress.describe()}`), PROGRESS_INTERVAL_MS);

    try {
      await mkdir(staging, { recursive: true });
      progress.step = ASTRO_STEP;
      // Astro keeps its intermediate output in <cwd>/.astro when outDir lies outside the working directory
      // and then renames it into outDir, which fails across filesystems (image vs. volume). Running it from
      // the staging directory, with the project as --root, keeps both on the volume.
      await this.run(ASTRO_STEP, [process.execPath, "--bun", await astroCli(this.config.appDir), "build", "--root", this.config.appDir, "--outDir", site], logFile, {
        cwd: staging,
        env: { MOENOTES_FETCH_CACHE_DIR: this.config.fetchCacheDir, ASTRO_TELEMETRY_DISABLED: "1" },
      });
      // Unchanged files are linked together with the live build's variants, so those must be complete.
      if (this.compressing) progress.step = COMPRESSION_WAIT_STEP;
      await this.compression;
      const finalize = [process.execPath, this.finalizeScript(), "link", site, join(staging, "files.json")];
      if (this.current) finalize.push(this.siteDir(this.current.id), join(this.buildDir(this.current.id), "files.json"));
      progress.step = FINALIZE_STEP;
      await this.run(FINALIZE_STEP, finalize, logFile);
      await rename(staging, this.buildDir(id));
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw new Error(`${errorMessage(error)} (log: ${logPath})`);
    } finally {
      clearInterval(ticker);
      this.progress = null;
      await logFile.end();
    }

    return { id, key, revision, data: data.label, builtAt: new Date().toISOString(), durationMs: Date.now() - startedAt, pages: progress.pages };
  }

  /**
   * Makes a finished build live: state.json first, then the roots new requests read. Its files go out as they
   * are until the background compression has added their variants.
   */
  async activate(record: BuildRecord): Promise<void> {
    const temporary = `${this.config.statePath}.tmp`;
    await Bun.write(temporary, `${JSON.stringify({ current: record } satisfies State, null, 2)}\n`);
    await rename(temporary, this.config.statePath);
    this.current = record;
    await this.refreshRoots();
    this.startCompression();
  }

  /**
   * Keeps `keepBuilds` builds: the live one, the one before it in full (responses may still be streaming from
   * it, and it is a ready rollback), and older ones reduced to `_astro/`. Hard links keep shared files alive.
   */
  async prune(): Promise<void> {
    const others = (await this.buildIds()).filter((id) => id !== this.current?.id);
    for (const [index, id] of others.entries()) {
      if (index === 0) continue;
      if (index < this.config.keepBuilds - 1) {
        await this.reduceToAstro(id);
      } else {
        await rm(this.buildDir(id), { recursive: true, force: true });
      }
    }
    const logs = (await readdir(this.config.logsDir)).filter((name) => name.endsWith(".log") && name !== LATEST_LOG).sort().reverse();
    for (const name of logs.slice(this.config.keepLogs)) await rm(join(this.config.logsDir, name), { force: true });
    await this.refreshRoots();
  }

  /** Stops the build and the compression; an interrupted compression resumes at the next start. */
  stopProcesses(): void {
    this.stopping = true;
    for (const child of this.processes) child.kill("SIGTERM");
  }

  /** Adds the live build's missing variants in a separate, lower-priority process. */
  private startCompression(): void {
    const id = this.current?.id;
    if (id) this.compression = this.compression.then(() => this.compress(id));
  }

  private async compress(id: string): Promise<void> {
    const logPath = join(this.config.logsDir, `${id}.log`);
    const logFile = createWriteStream(logPath, { flags: "a" });
    this.compressing = { id, startedAt: new Date().toISOString() };
    try {
      await this.run("compress", [process.execPath, this.finalizeScript(), "compress", this.siteDir(id)], logFile);
    } catch (error) {
      if (!this.stopping) log(`compressing build ${id} failed; it resumes at the next start or build: ${errorMessage(error)} (log: ${logPath})`);
    } finally {
      this.compressing = null;
      await new Promise<void>((resolve) => logFile.end(resolve));
    }
  }

  private finalizeScript(): string {
    return join(this.config.appDir, "server", "finalize.ts");
  }

  /** Pages a build should render: the live build's count, or its sitemap entries when its record has none. */
  private async expectedPages(): Promise<number | null> {
    if (!this.current) return null;
    if (this.current.pages) return this.current.pages;
    const sitemap = Bun.file(join(this.siteDir(this.current.id), "sitemap.xml"));
    if (!await sitemap.exists()) return null;
    return (await sitemap.text()).split("<loc>").length - 1 || null;
  }

  /** Points logs/latest.log at a new attempt's log (a hard link where symlinks are not allowed, as on Windows). */
  private async linkLatestLog(logPath: string): Promise<void> {
    const latest = join(this.config.logsDir, LATEST_LOG);
    const temporary = `${latest}.tmp`;
    await rm(temporary, { force: true });
    await symlink(basename(logPath), temporary).catch(() => link(logPath, temporary));
    await rename(temporary, latest);
  }

  private async reduceToAstro(id: string): Promise<void> {
    await rm(join(this.buildDir(id), "files.json"), { force: true });
    const site = this.siteDir(id);
    const entries = await readdir(site).catch(() => [] as string[]);
    for (const name of entries) {
      if (name !== "_astro") await rm(join(site, name), { recursive: true, force: true });
    }
  }

  /** Finished builds, newest first. */
  private async buildIds(): Promise<string[]> {
    const names = await readdir(this.config.buildsDir);
    return names.filter((name) => !name.startsWith(".")).sort().reverse();
  }

  private async refreshRoots(): Promise<void> {
    const previous = (await this.buildIds()).filter((id) => id !== this.current?.id).map((id) => this.siteDir(id));
    this.roots = { current: this.current ? this.siteDir(this.current.id) : null, previous };
  }

  private async run(
    step: string,
    command: string[],
    logFile: LogSink,
    options: { cwd?: string; env?: Record<string, string> } = {},
  ): Promise<void> {
    logFile.write(`\n$ ${command.join(" ")}\n`);
    const child = Bun.spawn(command, {
      cwd: options.cwd ?? this.config.appDir,
      env: { ...process.env, NO_COLOR: "1", ...options.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    this.processes.add(child);
    const timeout = setTimeout(() => {
      log(`${step} exceeded ${this.config.buildTimeoutMs / 1000}s; stopping it`);
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 10_000).unref();
    }, this.config.buildTimeoutMs);

    const forward = async (stream: ReadableStream<Uint8Array>) => {
      const decoder = new TextDecoder();
      let buffered = "";
      const emit = (line: string) => {
        logFile.write(`${line}\n`);
        const pages = line.match(PAGE_MARKER)?.length ?? 0;
        if (pages) this.progress?.addPages(pages);
        else if (!RENDER_TIME.test(line)) console.log(`  ${line}`);
      };
      for await (const chunk of stream) {
        buffered += decoder.decode(chunk, { stream: true });
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() ?? "";
        lines.forEach(emit);
      }
      if (buffered) emit(buffered);
    };

    try {
      const [exitCode] = await Promise.all([child.exited, forward(child.stdout), forward(child.stderr)]);
      if (exitCode !== 0) throw new Error(`${step} exited with ${child.signalCode ?? exitCode}`);
    } finally {
      clearTimeout(timeout);
      this.processes.delete(child);
    }
  }
}
