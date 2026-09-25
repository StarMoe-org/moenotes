import type { RenderRequest, RenderResult } from "@/vendor/moenotes-chart-renderer/renderer.mjs";

export interface ChartRenderRequest {
  id: number;
  request: RenderRequest;
}

export type ChartRenderReply =
  | { id: number; stage: "rendering" }
  | { id: number; result: RenderResult }
  | { id: number; error: string };

interface PendingRender {
  resolve: (result: RenderResult) => void;
  reject: (error: Error) => void;
  onRendering?: (() => void) | undefined;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingRender>();

export function isChartRendererSupported(): boolean {
  return typeof Worker !== "undefined" && typeof WebAssembly === "object";
}

/**
 * One module worker per page, created on first use: the renderer is synchronous CPU work and its module
 * is ~22 MB, so it stays off the main thread and is instantiated once.
 */
function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./chart-render.worker.ts", import.meta.url), { type: "module", name: "chart-renderer" });
  created.onmessage = ({ data }: MessageEvent<ChartRenderReply>) => {
    const entry = pending.get(data.id);
    if (!entry) return;
    if ("stage" in data) {
      entry.onRendering?.();
      return;
    }
    pending.delete(data.id);
    if ("result" in data) entry.resolve(data.result);
    else entry.reject(new Error(data.error));
  };
  // The worker script itself failed (network, unsupported syntax); drop it so a retry starts over.
  created.onerror = (event) => {
    event.preventDefault();
    created.terminate();
    worker = null;
    const error = new Error(event.message || "Chart renderer worker failed to start");
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  worker = created;
  return created;
}

/** Renders requests in order; `onRendering` fires once the module is ready and drawing starts. */
export function renderChartSheet(request: RenderRequest, onRendering?: () => void): Promise<RenderResult> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onRendering });
    getWorker().postMessage({ id, request } satisfies ChartRenderRequest);
  });
}
