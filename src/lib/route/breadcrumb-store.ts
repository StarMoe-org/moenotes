import type { BreadcrumbDetail } from "@/types/route";

export interface BreadcrumbSnapshot {
  key: string;
  detail: BreadcrumbDetail | undefined;
}

let current: BreadcrumbSnapshot = { key: "", detail: undefined };
const listeners = new Set<() => void>();

export function setActiveBreadcrumb(key: string, detail: BreadcrumbDetail | undefined): void {
  if (current.key === key && current.detail?.label === detail?.label) return;
  current = { key, detail };
  for (const listener of listeners) listener();
}

export function getActiveBreadcrumb(): BreadcrumbSnapshot {
  return current;
}

export function subscribeActiveBreadcrumb(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
