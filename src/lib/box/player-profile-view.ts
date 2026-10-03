import type { ReactNode } from "react";
import type { GameServer } from "@/config/servers";
import type { PlayerCatalogIdentity } from "./model";

export interface PlayerProfileImage { src: string; alt: string }
export interface PlayerProfileHistory { id: string; valueLabel: string; sourceLabel: string; atLabel: string; versionLabel?: string | undefined }
export interface PlayerProfileFieldView {
  key: string;
  label: string;
  ariaLabel?: string;
  value: number | string | null;
  displayValue: string;
  options?: readonly { value: number | string | null; label: string }[] | undefined;
  range?: { min: number; max: number; step: number } | undefined;
  statusLabel?: string;
  needsReview?: boolean;
  presence?: { value: "owned" | "not-owned" | null; label: string };
  history?: readonly PlayerProfileHistory[];
  description?: string | undefined;
  editor?: ReactNode;
}
export interface PlayerProfileEntityView {
  id: string;
  title: string;
  image?: PlayerProfileImage;
  fields: readonly PlayerProfileFieldView[];
  rankBadge?: { label: string; valueLabel: string };
}
export interface PlayerProfileGroupView {
  id: string;
  section: "characters" | "bands" | "global";
  title: string;
  image?: PlayerProfileImage;
  color?: string;
  entities: readonly PlayerProfileEntityView[];
  summaryFields?: readonly PlayerProfileFieldView[];
  summaryLabel?: string;
  description?: string;
}
export interface PlayerProfileLabels {
  title: string; description: string; characters: string; bands: string; global: string;
  unknown: string; owned: string; notOwned: string; history: string; review: string;
  unavailable: string; catalogVersion: string;
}
/** A display-only projection: account snapshots and local Box facts can share this panel. */
export interface PlayerProfilePanelProps {
  server: GameServer;
  currentCatalog: PlayerCatalogIdentity | null;
  mode: "read-only" | "edit";
  busy: boolean;
  groups: readonly PlayerProfileGroupView[];
  labels: PlayerProfileLabels;
  showTitle?: boolean;
  onChange?: (key: string, value: number | string | null) => void;
  onPresenceChange?: (key: string, value: "owned" | "not-owned" | null) => void;
  footer?: ReactNode | ((section: PlayerProfileGroupView["section"] | undefined) => ReactNode);
}
