export type AssetKind = "image" | "audio" | "json" | "raw";

export interface AssetRequest {
  type?: AssetKind;
  path: string;
  source?: "main" | "backup";
}
