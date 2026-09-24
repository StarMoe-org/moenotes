import { useEffect, useState } from "react";
import { fetchArchiveIndex, fetchAssetBrowser } from "@/lib/assets/browser-client";
import type { AssetArchive, ArchiveFile } from "@/types/asset-browser";

type QueryState<T> =
  | { status: "loading"; data?: never; error?: never }
  | { status: "success"; data: T; error?: never }
  | { status: "error"; data?: never; error: unknown };

export function useAssetBrowserQuery<T>(url: string | null, pollMs = 0) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ url: string; revision: number; state: QueryState<T> } | null>(null);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetchAssetBrowser<T>(url, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ url, revision, state: { status: "success", data } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ url, revision, state: { status: "error", error } });
      },
    );
    return () => controller.abort();
  }, [url, revision]);

  useEffect(() => {
    if (!url || pollMs <= 0) return;
    const timer = window.setInterval(() => setRevision((value) => value + 1), pollMs);
    return () => window.clearInterval(timer);
  }, [url, pollMs]);

  const state: QueryState<T> = result?.url === url ? result.state : { status: "loading" };
  return { ...state, reload: () => setRevision((value) => value + 1) };
}

export function useArchiveIndex<T extends AssetArchive | ArchiveFile>(url: string | null) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ url: string; revision: number; state: QueryState<T[]>; loaded: number; total: number } | null>(null);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    fetchArchiveIndex(url, controller.signal, (loaded, total) => {
      if (!controller.signal.aborted) setResult({ url, revision, state: { status: "loading" }, loaded, total });
    }).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ url, revision, state: { status: "success", data: data as T[] }, loaded: data.length, total: data.length });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ url, revision, state: { status: "error", error }, loaded: 0, total: 0 });
      },
    );
    return () => controller.abort();
  }, [url, revision]);

  const current = result?.url === url && result.revision === revision ? result : null;
  const state: QueryState<T[]> = current?.state ?? { status: "loading" };
  return { ...state, loaded: current?.loaded ?? 0, total: current?.total ?? 0, reload: () => setRevision((value) => value + 1) };
}
