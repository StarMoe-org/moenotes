import { useEffect, useRef } from "react";
import type { AppLocale } from "@/config/locales";
import { emptySnapRanking, SnapRankingClient, snapProfileKey, snapSourceKey, type SnapRankingCatalogue, type SnapRankingSource, type SnapRankingState } from "@/lib/chart-data/snap-client";
import type { SnapEvaluationProfile } from "@/lib/chart-data/snap-types";

export interface SnapRankingControllerProps {
  source: SnapRankingSource | null;
  profile: SnapEvaluationProfile;
  scoreIds: readonly number[];
  enabled: boolean;
  locale: AppLocale;
  onState: (state: SnapRankingState) => void;
  onCatalogue: (catalogue: SnapRankingCatalogue) => void;
  onCatalogueError?: (error: { code: string; message: string }) => void;
}

/** The catalogue can load on picker-open while all five slots remain None. */
export default function SnapRankingController(props: SnapRankingControllerProps) {
  const callbacks = useRef(props);
  callbacks.current = props;
  const client = useRef<SnapRankingClient | null>(null);
  const sourceKey = props.source ? snapSourceKey(props.source) : "";
  const profileKey = snapProfileKey(props.profile);
  const chartKey = JSON.stringify([...new Set(props.scoreIds)].sort((a, b) => a - b));
  const active = props.enabled && props.profile.selections.some(Boolean);

  useEffect(() => {
    if (!props.source) {
      callbacks.current.onState(emptySnapRanking());
      return;
    }
    const instance = new SnapRankingClient((state) => callbacks.current.onState(state),
      (catalogue) => callbacks.current.onCatalogue(catalogue), undefined,
      (error) => callbacks.current.onCatalogueError?.(error));
    client.current = instance;
    return () => { instance.dispose(); if (client.current === instance) client.current = null; };
  }, [sourceKey]);

  useEffect(() => {
    if (props.source) client.current?.loadCatalogue(props.source, props.locale);
  }, [sourceKey, props.locale]);

  useEffect(() => {
    const instance = client.current;
    if (!instance) return;
    if (active && props.source) instance.measure(props.source, props.profile, JSON.parse(chartKey) as number[]);
    else instance.reset();
    return () => instance.cancel();
  }, [sourceKey, profileKey, chartKey, active]);
  return null;
}
