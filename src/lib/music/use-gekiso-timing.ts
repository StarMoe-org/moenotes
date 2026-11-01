"use client";

import { useEffect, useState } from "react";
import { fetchReleaseBytes } from "@/lib/assets/release";
import { getChartFileUrl } from "@/lib/music/chart";
import {
  gekisoTimingFromBytes,
  type GekisoTimingSegment,
  type PerfectTimingEntry,
} from "@/lib/music/gekiso-timing";
import { useAssetUrl } from "@/lib/servers/use-content-server";

const segmentCache = new Map<string, Promise<GekisoTimingSegment[]>>();

/**
 * Resolve Gekiso COMBO boundary timing hints (`opening` / `ending`) for the currently selected song chart.
 * Only fetches the chart file when the song has at least one COMBO Gekiso segment (`enabled === true`).
 */
export function useGekisoTiming(
  chartKey: string | null | undefined,
  perfectTimings: readonly PerfectTimingEntry[],
  enabled: boolean,
): readonly GekisoTimingSegment[] | null {
  const assetUrl = useAssetUrl();
  const [segments, setSegments] = useState<readonly GekisoTimingSegment[] | null>(null);

  useEffect(() => {
    if (!enabled || !chartKey || perfectTimings.length === 0) {
      setSegments(null);
      return;
    }
    const url = assetUrl(getChartFileUrl(chartKey));
    const cacheKey = `${url}|${perfectTimings.map((row) => `${row.noteJudgementType}:${row.beforeMs}:${row.afterMs}`).join(",")}`;
    let active = true;
    let pending = segmentCache.get(cacheKey);
    if (!pending) {
      pending = fetchReleaseBytes(url, fetch)
        .then((bytes) => gekisoTimingFromBytes(bytes, perfectTimings))
        .catch((error) => {
          segmentCache.delete(cacheKey);
          throw error;
        });
      segmentCache.set(cacheKey, pending);
    }
    void pending
      .then((result) => {
        if (active) setSegments(result);
      })
      .catch(() => {
        if (active) setSegments(null);
      });
    return () => {
      active = false;
    };
  }, [assetUrl, chartKey, enabled, perfectTimings]);

  return segments;
}
