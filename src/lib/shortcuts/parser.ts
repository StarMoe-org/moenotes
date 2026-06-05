export interface ParsedShortcut {
  keys: string[];
}

export function parseShortcut(combo: string): ParsedShortcut {
  return { keys: combo.toLowerCase().split(/\s+/).filter(Boolean) };
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function eventToken(event: KeyboardEvent): string {
  const key = event.key.toLowerCase();
  const normalized = key === " " ? "space" : key;
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey && normalized.length > 1) parts.push("shift");
  parts.push(normalized);
  return parts.join("+");
}

export function comboMatchesStep(event: KeyboardEvent, expected: string): boolean {
  return eventToken(event) === expected.toLowerCase();
}
