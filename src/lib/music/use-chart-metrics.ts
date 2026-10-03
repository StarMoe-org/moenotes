import { useEffect, useState } from "react";
import { fetchMusicData } from "@/lib/chart-data/client";
import { buildMetricsIndex, EMPTY_METRICS_INDEX, type ChartMetricsIndex } from "./metrics";

export type ChartMetricsStatus = "loading" | "ready" | "error";

/**
 * Every chart's figures from music-data.json, loaded in the browser through the chart data tool's client (its
 * IndexedDB copy is shared, so the second page reads it from the cache). A failure leaves the index empty: the page
 * shows "—" for the figures and keeps working.
 */
export function useChartMetrics(enabled = true): { index: ChartMetricsIndex; status: ChartMetricsStatus } {
  const [state, setState] = useState<{ index: ChartMetricsIndex; status: ChartMetricsStatus }>({ index: EMPTY_METRICS_INDEX, status: "loading" });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchMusicData(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ index: buildMetricsIndex(data), status: "ready" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ index: EMPTY_METRICS_INDEX, status: "error" });
      });
    return () => controller.abort();
  }, [enabled]);
  return state;
}
