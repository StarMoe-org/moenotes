/**
 * Short counts for reward badges and tight tiles: 1,500 → 1.5K, 40,000 → 40K, 2,500,000 → 2.5M.
 * Values below 1,000 are unchanged; callers keep the exact number in a title or aria-label.
 */
export function formatCompactCount(value: number): string {
  const abs = Math.abs(value);
  if (abs < 1_000) return String(value);
  const round = (scaled: number) => Math.round(scaled * 10) / 10;
  const thousands = round(value / 1_000);
  return Math.abs(thousands) < 1_000 ? `${thousands}K` : `${round(value / 1_000_000)}M`;
}
