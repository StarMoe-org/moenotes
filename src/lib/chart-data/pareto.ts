/** The chosen two-axis frontier; separate from dominance for every skill mean and overhead. */
export const axisGoal = (axis: string): "min" | "max" => axis === "displayLevel" || axis === "bgmMs" ? "min" : "max";

export function paretoPoints<T extends readonly [number, number, ...unknown[]]>(points: readonly T[], xGoal: "min" | "max" = "min", yGoal: "min" | "max" = "max"): T[] {
  const finite = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const dx = xGoal === "min" ? 1 : -1, dy = yGoal === "min" ? 1 : -1;
  return finite.filter(([x, y]) => !finite.some(([a, b]) =>
    dx * a <= dx * x && dy * b <= dy * y && (dx * a < dx * x || dy * b < dy * y)))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
