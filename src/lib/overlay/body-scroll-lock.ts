const lockKeys = new Set<string>();
let previousBodyOverflow: string | null = null;

export function lockBodyScroll(key: string): void {
  if (typeof document === "undefined") return;
  lockKeys.add(key);
  if (previousBodyOverflow === null) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

export function unlockBodyScroll(key: string): void {
  if (typeof document === "undefined") return;
  lockKeys.delete(key);
  if (lockKeys.size === 0 && previousBodyOverflow !== null) {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = null;
  }
}

export function unlockAllBodyScroll(): void {
  if (typeof document === "undefined") return;
  lockKeys.clear();
  if (previousBodyOverflow !== null) {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = null;
  }
}
