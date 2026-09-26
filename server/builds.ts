import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ServerConfig } from "./config";
import type { SiteRoots } from "./static";
import type { DataVersion } from "./upstream";

/**
 * Builds on the data volume:
 *
 *   state.json               the live build
 *   builds/<id>/site/        Astro output plus precompressed variants (web root)
 *   builds/<id>/files.json   size + SHA-256 per file, for the next build's finalize step
 *   builds/.staging-<id>/    a build in progress; removed on failure and at startup
 *   logs/<id>.log            full Astro / finalize output of each attempt
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
}

interface State {
  current: BuildRecord | null;
}

const STAGING_PREFIX = ".staging-";
/** Astro prints one line per generated page (`12:00:00   ├─ /story/1/index.html (+2ms)`); the log keeps them. */
const PAGE_LINE = /[├└]─ \//;

export function log(message: string): void {
  console.log(`${new Date().toISOString()} [moenotes] ${message}`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

export class BuildStore {
  current: BuildRecord | null = null;
  roots: SiteRoots = { current: null, previous: [] };
  private activeProcess: Bun.Subprocess | null = null;

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

  /** Leftovers of interrupted builds and old builds; run in the background after startup. */
  async cleanUp(): Promise<void> {
    for (const name of await readdir(this.config.buildsDir)) {
      if (name.startsWith(STAGING_PREFIX)) await rm(join(this.config.buildsDir, name), { recursive: true, force: true });
    }
    await this.prune();
  }

  async build(key: string, revision: string, data: DataVersion): Promise<BuildRecord> {
    const startedAt = Date.now();
    const id = `${new Date(startedAt).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${key.slice(0, 8)}`;
    const staging = join(this.config.buildsDir, `${STAGING_PREFIX}${id}`);
    const site = join(staging, "site");
    const logPath = join(this.config.logsDir, `${id}.log`);
    const logFile = Bun.file(logPath).writer();
    log(`build ${id} started (${data.label}, revision ${revision}); log: ${logPath}`);

    try {
      await mkdir(staging, { recursive: true });
      // Astro keeps its intermediate output in <cwd>/.astro when outDir lies outside the working directory
      // and then renames it into outDir, which fails across filesystems (image vs. volume). Running it from
      // the staging directory, with the project as --root, keeps both on the volume.
      await this.run("astro build", [process.execPath, "--bun", await astroCli(this.config.appDir), "build", "--root", this.config.appDir, "--outDir", site], logFile, {
        cwd: staging,
        env: { MOENOTES_FETCH_CACHE_DIR: this.config.fetchCacheDir, ASTRO_TELEMETRY_DISABLED: "1" },
      });
      const finalize = [process.execPath, join(this.config.appDir, "server", "finalize.ts"), site, join(staging, "files.json")];
      if (this.current) finalize.push(this.siteDir(this.current.id), join(this.buildDir(this.current.id), "files.json"));
      await this.run("finalize", finalize, logFile);
      await rename(staging, this.buildDir(id));
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw new Error(`${errorMessage(error)} (log: ${logPath})`);
    } finally {
      await logFile.end();
    }

    return { id, key, revision, data: data.label, builtAt: new Date().toISOString(), durationMs: Date.now() - startedAt };
  }

  /** Makes a finished build live: state.json first, then the roots new requests read. */
  async activate(record: BuildRecord): Promise<void> {
    const temporary = `${this.config.statePath}.tmp`;
    await Bun.write(temporary, `${JSON.stringify({ current: record } satisfies State, null, 2)}\n`);
    await rename(temporary, this.config.statePath);
    this.current = record;
    await this.refreshRoots();
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
    const logs = (await readdir(this.config.logsDir)).filter((name) => name.endsWith(".log")).sort().reverse();
    for (const name of logs.slice(this.config.keepLogs)) await rm(join(this.config.logsDir, name), { force: true });
    await this.refreshRoots();
  }

  stopActiveProcess(): void {
    this.activeProcess?.kill("SIGTERM");
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
    logFile: Bun.FileSink,
    options: { cwd?: string; env?: Record<string, string> } = {},
  ): Promise<void> {
    logFile.write(`\n$ ${command.join(" ")}\n`);
    const child = Bun.spawn(command, {
      cwd: options.cwd ?? this.config.appDir,
      env: { ...process.env, NO_COLOR: "1", ...options.env },
      stdout: "pipe",
      stderr: "pipe",
    });
    this.activeProcess = child;
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
        if (!PAGE_LINE.test(line)) console.log(`  ${line}`);
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
      this.activeProcess = null;
    }
  }
}
