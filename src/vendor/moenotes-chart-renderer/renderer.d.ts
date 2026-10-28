export interface RenderOptions {
  theme?: 'white' | 'black' | 'print' | 'dark';
  flick_layout?: 'callout' | 'inline';
  bars_per_column?: number; pixels_per_beat?: number; pixels_per_lane?: number;
  target_beats?: number; note_height?: number; arrow_height?: number;
  supersample?: 1 | 2 | 3; output_scale?: number; long?: boolean;
  curve_mode?: 'musical' | 'native_parameters'; auto_spacing?: boolean;
  strict_assets?: boolean; native_critical?: boolean;
}
export interface Metadata {title: string; difficulty?: string; level?: string; artist?: string; author?: string; master_full_combo?: number; provenance?: unknown;}
export interface RenderRequest {chart: Uint8Array; cover?: Uint8Array | null; metadata: Metadata; options?: RenderOptions; mirror?: boolean;}
export interface RenderReport {
  schema_version: number; glyphs: number; branches: number; columns: number;
  images: Array<{file: string; width: number; height: number; logical_width: number; logical_height: number; sha256: string; columns: [number, number]}>;
  statistics: {source_judgements: number; derived_combos: number; skipped_combos: number; reconstructed_full_combo: number};
  metadata: Metadata; warnings: string[]; layout: RenderOptions;
  dense_body_overlaps: number; structural_connection_overlaps: number;
  arrow_body_box_overlaps: number; inline_arrow_body_box_overlaps: number;
  flick_callouts: Array<{note_id: number; column: number; offset_x: number; y: number}>;
  unresolved_flick_note_ids: number[]; flick_rail_width: number;
  chart_offset_y: number; chart_text_scale: number; columns_top_aligned: boolean;
  [key: string]: unknown;
}
export interface RenderResult {png: Uint8Array; report: RenderReport; width: number; height: number; logicalWidth: number; logicalHeight: number;}
export interface Renderer {render(request: RenderRequest): RenderResult; dispose(): void;}
export function createRenderer(moduleOptions?: {wasmBinary?: Uint8Array; locateFile?: (path: string, prefix: string) => string; printErr?: (message: string) => void}): Promise<Renderer>;
export interface Viewport {scale: number; x: number; y: number;}
export function fitViewport(imageWidth: number, imageHeight: number, viewportWidth: number, viewportHeight: number, padding?: number): Viewport;
export function zoomAt(view: Viewport, factor: number, x: number, y: number, min?: number, max?: number): Viewport;
