export type OverlayId = "command" | "settings" | "shortcuts" | "mobile-sidebar";

export interface OverlayState {
  activeOverlay: OverlayId | null;
}
