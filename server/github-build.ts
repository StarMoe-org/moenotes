import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { DataVersion } from "./upstream";
import { validateSiteManifest, type SiteManifest } from "./site-artifact";

const WORKFLOW = "build-site.yml";
const API = "https://api.github.com";
const DISCOVERY_GRACE_MS = 5 * 60_000;
interface Run { id: number; display_title: string; status: string; conclusion: string | null; created_at?: string }
interface Release { draft: boolean; tag_name: string; assets: Array<{ name: string; browser_download_url: string }> }
interface Pending { key: string; dispatchedAt: number; runId?: number }
export interface GithubBuildOptions {
  repo: string; ref: string; commit: string; token?: string;
  pendingPath: string; pollMs: number; timeoutMs: number;
}
export interface BuildExpectation { key: string; revision: string; commit: string; data: DataVersion }
export interface SiteRelease { manifest: SiteManifest; archiveUrl: string }

/** Only already-public build settings may enter Actions inputs. Never forward the server environment. */
export function publicBuildEnvironment(env: Record<string, string | undefined>): string {
  const entries = Object.entries(env).filter(([key, value]) => key.startsWith("PUBLIC_") && value !== undefined);
  if (entries.length > 100 || entries.some(([key, value]) => !/^PUBLIC_[A-Z0-9_]+$/.test(key) || value!.length > 8192)) {
    throw new Error("Invalid PUBLIC_* build settings");
  }
  const json = JSON.stringify(Object.fromEntries(entries));
  if (new TextEncoder().encode(json).length > 48_000) throw new Error("PUBLIC_* settings exceed the Actions input budget");
  return json;
}

/** This URL never receives the dispatch token; GitHub's asset redirects must not inherit credentials. */
export function releaseAssetUrl(repo: string, tag: string, asset: string, url: string): string {
  const expected = `https://github.com/${repo}/releases/download/${tag}/${asset}`;
  if (url !== expected) throw new Error(`Unexpected Release asset URL for ${asset}`);
  return url;
}

export class GithubBuild {
  constructor(private readonly options: GithubBuildOptions, private readonly transport: typeof fetch = fetch) {}

  private async api<T>(path: string, signal: AbortSignal, body?: unknown, allowMissing = false): Promise<T | null> {
    const response = await this.transport(`${API}/repos/${this.options.repo}${path}`, {
      method: body === undefined ? "GET" : "POST", redirect: "error",
      headers: { Authorization: `Bearer ${this.options.token}`, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "moenotes-site-builder", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (allowMissing && response.status === 404) return null;
    // Do not echo API response bodies or request inputs: they may contain deployment settings.
    if (!response.ok) throw new Error(`GitHub ${body === undefined ? "GET" : "POST"} ${path.split("?")[0]} failed (HTTP ${response.status})`);
    if (response.status === 204) return null;
    return await response.json() as T;
  }

  private async save(pending: Pending): Promise<void> {
    await mkdir(dirname(this.options.pendingPath), { recursive: true });
    const temporary = `${this.options.pendingPath}.tmp`;
    await Bun.write(temporary, JSON.stringify(pending));
    await rename(temporary, this.options.pendingPath);
  }

  private async pending(key: string): Promise<Pending | null> {
    const file = Bun.file(this.options.pendingPath);
    if (!await file.exists()) return null;
    const value = await file.json() as Pending;
    if (typeof value.key !== "string" || !Number.isFinite(value.dispatchedAt) || (value.runId !== undefined && !Number.isSafeInteger(value.runId))) {
      throw new Error("Invalid persisted GitHub build state; inspect github-build.json");
    }
    return value.key === key ? value : null;
  }

  private async runs(key: string, signal: AbortSignal): Promise<Run[]> {
    const matches: Run[] = [];
    for (let page = 1; page <= 3; page++) {
      const response = await this.api<{ workflow_runs: Run[] }>(`/actions/workflows/${WORKFLOW}/runs?event=workflow_dispatch&per_page=100&page=${page}`, signal);
      const runs = response?.workflow_runs ?? [];
      matches.push(...runs.filter(run => run.display_title === `site-${key}`));
      if (runs.length < 100) break;
    }
    return matches.sort((a, b) => b.id - a.id);
  }

  private async release(expected: BuildExpectation, signal: AbortSignal): Promise<SiteRelease | null> {
    const tag = `site-${expected.key}`;
    const release = await this.api<Release>(`/releases/tags/${tag}`, signal, undefined, true);
    if (!release || release.draft) return null;
    if (release.tag_name !== tag) throw new Error("Unexpected Release tag");
    const asset = (name: string) => {
      const matches = release.assets.filter(item => item.name === name);
      if (matches.length !== 1) throw new Error(`Published Release must contain exactly one ${name}`);
      return releaseAssetUrl(this.options.repo, tag, name, matches[0]!.browser_download_url);
    };
    const url = asset("site-manifest.json");
    const response = await this.transport(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
    if (!response.ok) throw new Error(`Release manifest download failed (HTTP ${response.status})`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Release manifest is empty");
    let text = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 64 * 1024) throw new Error("Release manifest is too large");
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { await reader.cancel().catch(() => {}); }
    return { manifest: validateSiteManifest(JSON.parse(text), expected), archiveUrl: asset("site.tar.gz") };
  }

  async wait(expected: BuildExpectation, report: (step: string) => void, stopSignal: AbortSignal): Promise<SiteRelease> {
    const { token, repo, ref, commit } = this.options;
    if (!token) throw new Error("MOENOTES_GITHUB_TOKEN is required in github build mode; local builds are never an automatic fallback");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^[a-f0-9]{40}$/.test(commit)) {
      throw new Error("Set a valid MOENOTES_GITHUB_REPO and the image's full MOENOTES_REVISION commit SHA");
    }
    if (expected.commit !== commit || !/^[a-f0-9]{16}$/.test(expected.key) || !/^[a-f0-9]{16}$/.test(expected.revision)) throw new Error("Invalid GitHub build identity");
    for (const name of ["MOENOTES_SERVERS", "MOENOTES_VERSION_URL", "MOENOTES_MASTERDATA_DIR"]) {
      if (process.env[name]?.trim()) throw new Error(`${name} is only supported in local build mode; CI uses public release data`);
    }
    const publicEnv = publicBuildEnvironment(process.env);
    const signal = AbortSignal.any([stopSignal, AbortSignal.timeout(this.options.timeoutMs)]);
    report("checking GitHub Release");
    const ready = await this.release(expected, signal);
    if (ready) return ready;
    let pending = await this.pending(expected.key);
    let run: Run | undefined;
    if (pending?.runId) {
      run = await this.api<Run>(`/actions/runs/${pending.runId}`, signal, undefined, true) ?? undefined;
      if (run && run.display_title !== `site-${expected.key}`) throw new Error("Persisted Actions run identity does not match the requested build");
    }
    if (!run) run = (await this.runs(expected.key, signal)).find(item => item.status !== "completed");
    if (run) {
      pending = { key: expected.key, dispatchedAt: pending?.dispatchedAt ?? Date.now(), runId: run.id };
      await this.save(pending);
    } else if (!pending || Date.now() - pending.dispatchedAt > DISCOVERY_GRACE_MS) {
      // Persist before dispatch: a restart or an ambiguous network error must not immediately dispatch twice.
      pending = { key: expected.key, dispatchedAt: Date.now() };
      await this.save(pending);
      report("dispatching GitHub Actions");
      const payload = { ref, inputs: { key: expected.key, revision: expected.revision, commit,
        fingerprint: expected.data.fingerprint, public_env: publicEnv } };
      if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 65_535) throw new Error("GitHub dispatch inputs exceed 65535 bytes");
      const dispatched = await this.api<{ workflow_run_id?: number }>(`/actions/workflows/${WORKFLOW}/dispatches`, signal, payload);
      if (Number.isSafeInteger(dispatched?.workflow_run_id) && dispatched!.workflow_run_id! > 0) {
        pending.runId = dispatched!.workflow_run_id!;
        await this.save(pending);
      }
    }
    while (true) {
      signal.throwIfAborted();
      const artifact = await this.release(expected, signal);
      if (artifact) {
        await rm(this.options.pendingPath, { force: true });
        return artifact;
      }
      if (pending?.runId) {
        run = await this.api<Run>(`/actions/runs/${pending.runId}`, signal, undefined, true) ?? undefined;
      } else {
        run = (await this.runs(expected.key, signal)).find(item => item.status !== "completed"
          || (item.created_at !== undefined && Date.parse(item.created_at) >= pending!.dispatchedAt - 5000));
        if (run) {
          pending = { ...pending!, runId: run.id };
          await this.save(pending);
        }
      }
      if (run?.status === "completed") {
        // Release publication is the final workflow action, so success without an artifact is an error too.
        const artifact = await this.release(expected, signal);
        if (artifact) { await rm(this.options.pendingPath, { force: true }); return artifact; }
        await rm(this.options.pendingPath, { force: true });
        throw new Error(`GitHub Actions run ${run.id} finished (${run.conclusion ?? "unknown"}) without a usable Release`);
      }
      if (!run && Date.now() - pending!.dispatchedAt > DISCOVERY_GRACE_MS) throw new Error("Dispatched Actions run not found after 5 minutes; retry will reconcile before dispatching");
      report(run ? `GitHub Actions ${run.id}: ${run.status}` : "waiting for GitHub Actions to start");
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, this.options.pollMs);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      });
    }
  }
}
