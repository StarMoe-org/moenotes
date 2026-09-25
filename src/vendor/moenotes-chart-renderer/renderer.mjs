/** Framework-independent SDK. No DOM, file writes, resource fetches or UI. */
import createModule from './moenotes-wasm.mjs';

export async function createRenderer(moduleOptions = {}) {
  const module = await createModule(moduleOptions);
  let disposed = false;
  const text = (ptr, len) => new TextDecoder().decode(module.HEAPU8.subarray(ptr, ptr + len));
  return {
    /** Synchronous CPU work: instantiate in your own worker to keep UI responsive. */
    render({ chart, cover = null, metadata, options = {}, mirror = false }) {
      if (disposed) throw new Error('Renderer has been disposed');
      if (!(chart instanceof Uint8Array)) throw new TypeError('chart must be Uint8Array');
      if (cover !== null && !(cover instanceof Uint8Array)) throw new TypeError('cover must be Uint8Array or null');
      const config = new TextEncoder().encode(JSON.stringify({ metadata, options, mirror }));
      if (chart.length === 0 || chart.length > 64 * 1024 * 1024 || config.length > 1024 * 1024 || (cover?.length ?? 0) > 16 * 1024 * 1024) {
        throw new RangeError('Chart, configuration or cover exceeds the input limit');
      }
      const allocated = [];
      const put = bytes => {
        if (!bytes?.length) return 0;
        const ptr = module._mn_alloc(bytes.length);
        if (!ptr) throw new Error('WASM input allocation failed');
        allocated.push([ptr, bytes.length]);
        module.HEAPU8.set(bytes, ptr);
        return ptr;
      };
      try {
        const input = put(chart), configPtr = put(config), coverPtr = put(cover);
        const code = module._mn_render(input, chart.length, configPtr, config.length, coverPtr, cover?.length ?? 0);
        if (code) throw new Error(text(module._mn_error_ptr(), module._mn_error_len()));
        const report = JSON.parse(text(module._mn_report_ptr(), module._mn_report_len()));
        const ptr = module._mn_png_ptr(), len = module._mn_png_len();
        // Copy before clearing Rust buffers or transferring to another thread.
        const png = module.HEAPU8.slice(ptr, ptr + len);
        return { png, report, width: report.images[0].width, height: report.images[0].height,
          logicalWidth: report.images[0].logical_width, logicalHeight: report.images[0].logical_height };
      } finally {
        for (const [ptr, len] of allocated) module._mn_free(ptr, len);
        module._mn_clear();
      }
    },
    dispose() { if (!disposed) module._mn_dispose(); disposed = true; },
  };
}

/** Pure viewport math: consumers own pointer/wheel/touch handling and drawing. */
export function fitViewport(imageWidth, imageHeight, viewportWidth, viewportHeight, padding = 0) {
  if (![imageWidth, imageHeight, viewportWidth, viewportHeight].every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(padding) || padding < 0 || 2 * padding >= Math.min(viewportWidth, viewportHeight)) throw new RangeError('Invalid viewport dimensions');
  const scale = Math.min((viewportWidth - padding * 2) / imageWidth, (viewportHeight - padding * 2) / imageHeight);
  return { scale, x: (viewportWidth - imageWidth * scale) / 2, y: (viewportHeight - imageHeight * scale) / 2 };
}

export function zoomAt(view, factor, x, y, min = 0.01, max = 32) {
  if (![view.scale, factor, min, max].every(v => Number.isFinite(v) && v > 0) || min > max || ![view.x, view.y, x, y].every(Number.isFinite)) throw new RangeError('Invalid zoom');
  const scale = Math.max(min, Math.min(max, view.scale * factor));
  return { scale, x: x - (x - view.x) * scale / view.scale, y: y - (y - view.y) * scale / view.scale };
}
