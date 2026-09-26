import { createRenderer, type Renderer } from "@/vendor/moenotes-chart-renderer/renderer.mjs";
import type { ChartRenderReply, ChartRenderRequest } from "./chart-renderer";

// One renderer per worker: instantiating decodes the ~22 MB module and its embedded fonts. A failed start is
// not kept, so the next request retries it.
let renderer: Promise<Renderer> | null = null;

function reply(message: ChartRenderReply, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

// Registered before the module finishes loading, so an early request waits instead of being dropped.
self.onmessage = async ({ data }: MessageEvent<ChartRenderRequest>) => {
  try {
    if (!renderer) {
      renderer = createRenderer();
      renderer.catch(() => { renderer = null; });
    }
    const instance = await renderer;
    reply({ id: data.id, stage: "rendering" });
    // render() is synchronous CPU work that returns owned PNG bytes.
    const result = instance.render(data.request);
    reply({ id: data.id, result }, [result.png.buffer as ArrayBuffer]);
  } catch (error) {
    // An Emscripten abort (e.g. out of memory) leaves the instance unusable; start a fresh one next time.
    if (error instanceof WebAssembly.RuntimeError) renderer = null;
    reply({ id: data.id, error: error instanceof Error ? error.message : String(error) });
  }
};
