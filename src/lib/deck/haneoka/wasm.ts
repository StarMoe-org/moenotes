/** The raw ABI of the pinned Haneoka Rust engine, shared by browser Workers and verification tools. */
interface EngineExports {
  memory: WebAssembly.Memory;
  haneoka_buffer_alloc(length: number): number;
  haneoka_buffer_free(pointer: number, length: number): void;
  haneoka_string_free(pointer: number): void;
  haneoka_context_json(pointer: number): number;
  haneoka_context_stream_wasm(pointer: number): number;
  haneoka_cooperative_clock?: (enabled: number) => void;
}
export class HaneokaWasm {
  private constructor(private readonly engine: EngineExports) {}
  onProgress: ((value: Record<string, unknown>) => void) | null = null;
  onYield: (() => void) | null = null;
  static async create(bytes: BufferSource): Promise<HaneokaWasm> {
    let bridge: HaneokaWasm;
    const { instance } = await WebAssembly.instantiate(bytes, { env: {
      haneoka_now_ms: () => performance.timeOrigin + performance.now(),
      haneoka_progress: (pointer: number) => {
        if (!pointer) {
          bridge.onYield?.();
          return;
        }
        bridge.onProgress?.(JSON.parse(bridge.read(pointer)));
      },
    } });
    bridge = new HaneokaWasm(instance.exports as unknown as EngineExports);
    return bridge;
  }
  private read(pointer: number): string {
    const bytes = new Uint8Array(this.engine.memory.buffer);
    let end = pointer;
    while (bytes[end]) end++;
    return new TextDecoder().decode(bytes.subarray(pointer, end));
  }
  get supportsCooperativeClock(): boolean {
    return typeof this.engine.haneoka_cooperative_clock === "function";
  }
  invoke<T>(input: Record<string, unknown>, stream = false, cooperative = false): T {
    const bytes = new TextEncoder().encode(JSON.stringify(input));
    const e = this.engine, pointer = e.haneoka_buffer_alloc(bytes.length + 1);
    const view = new Uint8Array(e.memory.buffer, pointer, bytes.length + 1);
    view.set(bytes); view[bytes.length] = 0;
    let result = 0;
    try {
      e.haneoka_cooperative_clock?.(cooperative ? 1 : 0);
      result = stream ? e.haneoka_context_stream_wasm(pointer) : e.haneoka_context_json(pointer);
      const value = JSON.parse(this.read(result));
      if (typeof value.error === "string") throw new Error(value.error);
      return value as T;
    } finally {
      if (cooperative) e.haneoka_cooperative_clock?.(0);
      if (result) e.haneoka_string_free(result);
      e.haneoka_buffer_free(pointer, bytes.length + 1);
    }
  }
}
