"use client";

import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { assetConfig } from "@/config/assets";
import { t } from "@/i18n";
import { CARD_FIELDS, type CardBox, type CardFieldName } from "@/lib/box/model";
import type { BoxMode } from "@/lib/box/session";
import { bindRecognitionSource, decodeScreenshot, loadRecognitionBundle } from "@/lib/recognition/client";
import { RecognitionError } from "@/lib/recognition/errors";
import { RecognitionBatch, type RecognitionFileSnapshot } from "@/lib/recognition/batch";
import { correctRecognizedBoxIdentity, correctRecognizedValue, mergeRecognizedBox, unidentifiedCardKey, type RecognitionBinding, type RecognitionBox, type RecognitionConfiguration, type RecognitionSource } from "@/lib/recognition/protocol";
import { consolidateVideoRecognitionResults, extractVideoFrames, isVideoImportFile, sha256BlobHex, type VideoFrameRecognitionEntry } from "@/lib/recognition/video";
import { RecognitionWorkerClient } from "@/lib/recognition/worker-client";
import { DeckSelect } from "@/components/deck/DeckControls";
import Modal from "@/components/shared/Modal";
import CardIdentitySelection from "./CardIdentitySelection";
import { ObservedLevelControl, StepControl } from "@/components/shared/CardGrowthControls";
import { BoxArtwork, cardTitle, cardSubtitle, cardRarityLabel, type BoxCatalog } from "./BoxManager";

interface ImageInput { key: string; name: string; file: File; url: string; isVideo: boolean }
interface TileCrop { url: string; bbox: RecognitionBox; width: number; height: number }
const pending = (row: RecognitionFileSnapshot) => ["queued", "preparing", "running"].includes(row.status);

/** The tile as it appears in the screenshot: the picture scaled so the tile fills the frame. */
function ScreenshotTile({ crop }: { crop: TileCrop }) {
  const [x, y, w, h] = crop.bbox;
  return <div className="dw-card-art dw-screenshot-tile" style={{ aspectRatio: `${w} / ${h}` }}>
    <img src={crop.url} alt="" style={{ width: `${crop.width / w * 100}%`, left: `${-x / w * 100}%`, top: `${-y / h * 100}%` }} />
  </div>;
}

export default function ScreenshotImport({ locale, server, source, sourceIssue, box, mode, catalog, isOpen, onClose, onSave, pendingFiles, onPendingFilesConsumed }: {
  locale: AppLocale; server: GameServer; source: RecognitionSource | undefined; box: CardBox | null; mode: BoxMode;
  catalog: BoxCatalog; isOpen: boolean; onClose: () => void; onSave: (observation: CardBox, destination: BoxMode) => Promise<boolean>;
  sourceIssue?: string | undefined;
  pendingFiles?: readonly File[] | undefined;
  onPendingFilesConsumed?: (() => void) | undefined;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.${key}`, values);
  const serverName = t(locale, `gameServer.short.${server}`);
  const [rows, setRows] = useState<RecognitionFileSnapshot[]>([]), [draft, setDraft] = useState<CardBox | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null), [editingKey, setEditingKey] = useState<string | null>(null);
  const [choosingIdentity, setChoosingIdentity] = useState(false), [excluded, setExcluded] = useState<string[]>([]);
  const [destination, setDestination] = useState<BoxMode>(mode), [stale, setStale] = useState(false), [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false), [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null), client = useRef(new RecognitionWorkerClient());
  const reviewArea = useRef<HTMLElement>(null), revealReview = useRef(true);
  const images = useRef(new Map<string, ImageInput>()), bootstrap = useRef<RecognitionFileSnapshot[]>([]);
  const batch = useRef<RecognitionBatch | null>(null), bound = useRef<{ source: RecognitionSource; configuration: RecognitionConfiguration } | null>(null);
  const failures = useRef(new Map<string, RecognitionError>());
  const videoProgress = useRef(new Map<string, { done: number; total: number }>());
  const generation = useRef(0), pumping = useRef(false), origin = useRef<string | null>(null), savingRef = useRef(false);
  const active = useRef<{ key: string; jobId: string; startedAt: number; controller: AbortController } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pumpRef = useRef<() => Promise<void>>(async () => {});
  const enqueueRef = useRef<(files: readonly File[]) => boolean>(() => false);
  const consumedPendingFiles = useRef<readonly File[] | null>(null);
  const current = JSON.stringify([isOpen, server, source?.sourceId, source?.catalogueSignature, box?.id, box?.revision, mode]);
  const currentRef = useRef(current); currentRef.current = current;
  // One gallery serves every server; each batch pins the bundle it first loaded.
  const config = assetConfig.recognition;
  const supported = !!source && !!config.workerUrl && !!config.pointerUrl;
  const readRows = () => (batch.current?.snapshot().files ?? bootstrap.current).map(row => {
    const runningVideo = active.current?.key === row.key && images.current.get(row.key)?.isVideo && row.status === "queued";
    const status = runningVideo ? ("running" as const) : row.status;
    const started = row.startedAt ?? (runningVideo ? active.current?.startedAt : undefined);
    return {
      ...row,
      status,
      elapsedMs: (pending({ ...row, status }) && started !== undefined) ? performance.now() - started : row.elapsedMs,
    };
  });
  const publish = () => setRows(readRows());
  const patchBootstrap = (key: string, change: Partial<RecognitionFileSnapshot>) => {
    bootstrap.current = bootstrap.current.map(row => row.key === key ? { ...row, ...change } : row);
  };
  function stopTimers() {
    if (timer.current) clearTimeout(timer.current);
    if (elapsedTimer.current) clearInterval(elapsedTimer.current);
    timer.current = null; elapsedTimer.current = null;
  }
  function stopActive() {
    active.current?.controller.abort(); client.current.cancel(); active.current = null; stopTimers();
  }
  function clearBatch(update = true) {
    generation.current++; stopActive();
    for (const image of images.current.values()) if (image.url) URL.revokeObjectURL(image.url);
    images.current.clear(); bootstrap.current = []; batch.current = null; bound.current = null; failures.current.clear(); videoProgress.current.clear(); origin.current = null;
    revealReview.current = true;
    if (update) { setRows([]); setDraft(null); setExcluded([]); setSelectedImage(null); setEditingKey(null); setChoosingIdentity(false); setStale(false); setSaveError(false); }
  }
  useEffect(() => {
    if (!isOpen) clearBatch();
    else if (origin.current && origin.current !== current && !savingRef.current) {
      generation.current++; batch.current?.invalidate();
      bootstrap.current = readRows().map(row => pending(row) ? { ...row, status: "stale" } : row);
      stopActive(); setStale(true); publish();
    }
  }, [current]);
  useEffect(() => () => clearBatch(false), []);
  useEffect(() => {
    if (!draft?.cards.length || !revealReview.current || editingKey || choosingIdentity) return;
    const frame = requestAnimationFrame(() => { reviewArea.current?.scrollIntoView({ block: "start" }); revealReview.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [draft?.cards.length, editingKey, choosingIdentity]);

  function cancelFile(key: string) {
    const row = readRows().find(item => item.key === key);
    if (!row || !pending(row)) return;
    if (batch.current) batch.current.cancelFile(key); else patchBootstrap(key, { status: "cancelled", elapsedMs: row.elapsedMs });
    if (active.current?.key === key) stopActive();
    publish();
  }
  function cancelRemaining() { for (const row of readRows()) if (pending(row)) cancelFile(row.key); }
  function retryFile(key: string) {
    if (stale || savingRef.current) return;
    if (batch.current) batch.current.retryFile(key);
    else bootstrap.current = bootstrap.current.map(row => row.key === key ? { key, name: row.name, status: "queued", elapsedMs: 0 } : row);
    failures.current.delete(key); publish(); void pumpRef.current();
  }
  function enqueue(files: readonly File[]) {
    if (!files.length || !supported || stale || savingRef.current) return false;
    if (origin.current && origin.current !== currentRef.current) return false;
    if (!origin.current) origin.current = currentRef.current;
    const added = files.map(file => {
      const isVideo = isVideoImportFile(file);
      return { key: crypto.randomUUID(), name: file.name, file, url: isVideo ? "" : URL.createObjectURL(file), isVideo };
    });
    for (const image of added) images.current.set(image.key, image);
    if (batch.current) batch.current.addFiles(added); else bootstrap.current.push(...added.map(({ key, name }) => ({ key, name, status: "queued" as const, elapsedMs: 0 })));
    setSelectedImage(previous => previous ?? added[0]!.key); setSaveError(false); publish(); void pumpRef.current();
    return true;
  }
  enqueueRef.current = enqueue;
  useEffect(() => {
    if (!isOpen || !pendingFiles?.length || !supported || stale || saving || consumedPendingFiles.current === pendingFiles) return;
    if (enqueueRef.current(pendingFiles)) {
      consumedPendingFiles.current = pendingFiles;
      onPendingFilesConsumed?.();
    }
  }, [isOpen, pendingFiles, supported, stale, saving, onPendingFilesConsumed]);
  useEffect(() => {
    if (!isOpen) return;
    const paste = (event: ClipboardEvent) => {
      const dialog = input.current?.closest('[role="dialog"]');
      if (event.defaultPrevented || !dialog || !(event.target instanceof Node) || !dialog.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
      const data = event.clipboardData;
      if (!data) return;
      const files = Array.from(data.files).filter(file => file.type.startsWith("image/") || isVideoImportFile(file));
      if (!files.length) for (const item of Array.from(data.items)) {
        if (item.kind !== "file" || (!item.type.startsWith("image/") && !item.type.startsWith("video/"))) continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (files.length && enqueueRef.current(files)) event.preventDefault();
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [isOpen]);

  async function pump() {
    if (pumping.current || !source || origin.current !== currentRef.current) return;
    pumping.current = true;
    const epoch = generation.current;
    const scopeAlive = () => epoch === generation.current && origin.current === currentRef.current;
    try {
      while (scopeAlive()) {
        const row = readRows().find(item => item.status === "queued");
        if (!row) break;
        const image = images.current.get(row.key)!;
        const timeoutMs = image.isVideo ? 600_000 : 90_000;
        const jobId = crypto.randomUUID(), startedAt = performance.now(), deadline = startedAt + timeoutMs;
        const controller = new AbortController(); active.current = { key: row.key, jobId, startedAt, controller };
        let binding: RecognitionBinding | undefined;
        const attemptCurrent = () => scopeAlive() && active.current?.jobId === jobId
          && (!batch.current || !binding || readRows().find(item => item.key === row.key)?.binding?.jobId === jobId);
        const alive = () => attemptCurrent()
          && (batch.current && binding ? batch.current.isCurrent(row.key, binding) : readRows().some(item => item.key === row.key && pending(item)));
        try {
          if (!image.isVideo) {
            if (batch.current) binding = batch.current.prepare(row.key, { jobId, startedAt, deadline });
            else patchBootstrap(row.key, { status: "preparing", startedAt, deadline });
          } else if (!batch.current) {
            patchBootstrap(row.key, { status: "preparing", startedAt, deadline });
          }
          publish();
          elapsedTimer.current = setInterval(() => { if (alive()) publish(); }, 250);
          timer.current = setTimeout(() => {
            if (!alive()) return;
            failures.current.set(row.key, new RecognitionError("timeLimit"));
            if (batch.current) batch.current.fail(row.key, "timeLimit", binding); else patchBootstrap(row.key, { status: "timeLimit", elapsedMs: performance.now() - startedAt });
            stopActive(); publish();
          }, timeoutMs);

          if (image.isVideo) {
            const runtime = bound.current
              ? bound.current
              : await loadRecognitionBundle(config, controller.signal).then(loaded => ({
                  source: bindRecognitionSource(loaded.manifest, source),
                  configuration: loaded.configuration,
                }));
            if (!alive()) continue;
            bound.current = runtime;
            const verifiedSource = runtime.source;
            if (!batch.current) {
              batch.current = new RecognitionBatch({
                batchId: crypto.randomUUID(),
                inputRevision: String(box?.revision ?? 0),
                source: verifiedSource,
                manifestSha256: runtime.configuration.gallerySha256,
                at: Date.now(),
                files: [...images.current.values()],
              });
              for (const previous of bootstrap.current) {
                if (previous.status === "cancelled") batch.current.cancelFile(previous.key);
                else if (["failed", "timeLimit"].includes(previous.status)) batch.current.fail(previous.key, previous.error ?? (previous.status === "timeLimit" ? "timeLimit" : "failed"));
              }
            }

            const videoSourceId = await sha256BlobHex(image.file);
            if (!alive()) continue;
            const frameEntries: VideoFrameRecognitionEntry[] = [];
            let totalExtractedFrames = 0;
            const inputRev = String(box?.revision ?? 0);
            const galleryId = verifiedSource.gallery?.galleryId ?? "";

            for await (const vf of extractVideoFrames(image.file, controller.signal)) {
              if (!alive()) break;
              totalExtractedFrames = vf.total;
              videoProgress.current.set(row.key, { done: vf.index, total: vf.total });
              if (!image.url) {
                image.url = URL.createObjectURL(vf.frame);
              }
              publish();

              const frameFile = new File([vf.frame], `frame-${vf.index}.jpg`, { type: "image/jpeg" });
              const pixels = await decodeScreenshot(frameFile);
              if (!alive()) break;
              const frameBinding: RecognitionBinding = {
                jobId: `${jobId}:f${vf.index}`,
                inputRevision: inputRev,
                datasetId: verifiedSource.sourceId,
                galleryId,
              };
              const frameResult = await client.current.run({
                source: verifiedSource,
                configuration: runtime.configuration,
                image: pixels,
                timeLimitMs: Math.min(60_000, Math.max(5_000, deadline - performance.now())),
                binding: frameBinding,
                isCurrent: alive,
                onProgress: () => {},
              });
              if (!alive()) break;
              frameEntries.push({
                result: frameResult,
                frame: vf.frame,
                width: pixels.width,
                height: pixels.height,
              });
            }

            if (!alive()) continue;
            const commitAt = performance.now();
            const commitDeadline = commitAt + 60_000;
            binding = batch.current.prepare(row.key, { jobId, startedAt: commitAt, deadline: commitDeadline });
            const width = frameEntries[0]?.width ?? 1;
            const height = frameEntries[0]?.height ?? 1;
            binding = batch.current.begin(row.key, {
              jobId,
              sourceId: videoSourceId,
              width,
              height,
              startedAt: commitAt,
              deadline: commitDeadline,
            });
            const consolidated = consolidateVideoRecognitionResults(
              frameEntries,
              binding,
              videoSourceId,
              totalExtractedFrames,
            );
            if (consolidated.previewFrame) {
              if (image.url) URL.revokeObjectURL(image.url);
              image.url = URL.createObjectURL(consolidated.previewFrame);
            }
            const complete = batch.current.finish(row.key, consolidated.result);
            if (complete) {
              const observation = batch.current.draft();
              setDraft(previous => previous ? mergeRecognizedBox(previous, observation) : observation);
            } else {
              const stopped = readRows().find(item => item.key === row.key)!;
              failures.current.set(row.key, new RecognitionError(stopped.status === "timeLimit" ? "timeLimit" : "worker", stopped.error ?? consolidated.result.error ?? ""));
            }
            publish();
            continue;
          }

          const [pixels, runtime] = await Promise.all([decodeScreenshot(image.file), bound.current
            ? Promise.resolve(bound.current)
            : loadRecognitionBundle(config, controller.signal).then(loaded => ({ source: bindRecognitionSource(loaded.manifest, source), configuration: loaded.configuration }))]);
          if (!alive()) continue;
          bound.current = runtime;
          const verifiedSource = runtime.source;
          if (!batch.current) {
            batch.current = new RecognitionBatch({ batchId: crypto.randomUUID(), inputRevision: String(box?.revision ?? 0), source: verifiedSource,
              manifestSha256: runtime.configuration.gallerySha256, at: Date.now(), files: [...images.current.values()] });
            for (const previous of bootstrap.current) {
              if (previous.status === "cancelled") batch.current.cancelFile(previous.key);
              else if (["failed", "timeLimit"].includes(previous.status)) batch.current.fail(previous.key, previous.error ?? (previous.status === "timeLimit" ? "timeLimit" : "failed"));
            }
            binding = batch.current.prepare(row.key, { jobId, startedAt, deadline });
          }
          binding = batch.current.begin(row.key, { jobId, sourceId: pixels.sourceId, width: pixels.width, height: pixels.height, startedAt, deadline });
          publish();
          const output = await client.current.run({ source: verifiedSource, configuration: runtime.configuration, image: pixels, timeLimitMs: deadline - performance.now(), binding,
            isCurrent: alive, onProgress: phase => { if (alive() && binding) { batch.current?.progress(row.key, binding, phase); publish(); } } });
          if (!alive()) continue;
          const complete = batch.current.finish(row.key, output);
          if (complete) {
            const observation = batch.current.draft();
            setDraft(previous => previous ? mergeRecognizedBox(previous, observation) : observation);
          } else {
            const stopped = readRows().find(item => item.key === row.key)!;
            failures.current.set(row.key, new RecognitionError(stopped.status === "timeLimit" ? "timeLimit" : "worker", stopped.error ?? output.error ?? ""));
          }
          publish();
        } catch (error) {
          // prepare/begin may mark this exact job timeLimit before throwing.
          // Publish its terminal state, while still excluding an older retry's catch.
          if (attemptCurrent()) {
            const rawDetail = error instanceof Error ? error.message : "";
            const localizedDetail =
              rawDetail === "video-too-long"
                ? tr("videoImport.videoTooLong")
                : rawDetail === "video-decode"
                  ? tr("videoImport.videoDecodeFailed")
                  : rawDetail;
            const failure = error instanceof RecognitionError ? error : new RecognitionError("worker", localizedDetail);
            failures.current.set(row.key, failure);
            if (batch.current) batch.current.fail(row.key, failure.code === "timeLimit" ? "timeLimit" : failure.code, binding);
            else patchBootstrap(row.key, { status: failure.code === "timeLimit" ? "timeLimit" : "failed", error: failure.code, elapsedMs: performance.now() - startedAt });
            console.warn("Screenshot recognition stopped", { code: failure.code, detail: failure.detail, server, sourceId: source.sourceId });
            publish();
          }
        } finally {
          controller.abort();
          if (active.current?.jobId === jobId) { active.current = null; stopTimers(); }
        }
      }
    } finally {
      pumping.current = false;
      // A new batch can be selected while a cancelled decode finishes.
      if (origin.current === currentRef.current && readRows().some(row => row.status === "queued")) void pumpRef.current();
    }
  }
  pumpRef.current = pump;

  function correctField(key: string, field: CardFieldName, value: number | null) {
    setDraft(previous => previous ? { ...previous, cards: previous.cards.map(card => card.key === key ? correctRecognizedValue(card, field, value) : card) } : null);
  }
  async function save() {
    if (!draft || stale || savingRef.current || origin.current !== currentRef.current || readRows().some(pending)) return;
    const cards = draft.cards.filter(card => !excluded.includes(card.key) && card.identity.value !== null);
    if (!cards.length) return;
    savingRef.current = true; setSaving(true); setSaveError(false);
    try { if (await onSave({ ...draft, cards }, box ? mode : destination)) onClose(); else setSaveError(true); }
    catch { setSaveError(true); }
    finally { savingRef.current = false; setSaving(false); }
  }

  const running = rows.some(pending), completed = rows.filter(row => row.status === "complete").length;
  const selectedRow = rows.find(row => row.key === selectedImage), selectedInput = selectedImage ? images.current.get(selectedImage) : null;
  const editing = draft?.cards.find(card => card.key === editingKey);
  const selectedCount = draft?.cards.filter(card => !excluded.includes(card.key) && card.identity.value !== null).length ?? 0;
  const growthFields = editing ? CARD_FIELDS.filter(field => editing.kind === "member" || field === "level" || field === "rank") : [];
  // Review cards made from unidentified tiles show the tile itself until a card is chosen.
  const tileCrops = new Map<string, TileCrop>();
  for (const row of rows) {
    const image = images.current.get(row.key);
    if (row.status !== "complete" || !row.result || !row.binding || !image || !row.width || !row.height) continue;
    row.result.unidentified.forEach((tile, index) => tileCrops.set(unidentifiedCardKey(row.binding!.jobId, index), { url: image.url, bbox: tile.bbox, width: row.width!, height: row.height! }));
  }
  const unidentifiedCount = draft?.cards.filter(card => card.identity.value === null && tileCrops.has(card.key)).length ?? 0;
  const candidateName = (card: CardBox["cards"][number]) => card.candidates[0] ? cardTitle({ ...card, identity: { ...card.identity, value: card.candidates[0] } }, catalog) : null;
  const close = () => { clearBatch(); onClose(); };

  return <>
    <Modal historyNavigation={false} isOpen={isOpen} onClose={close} title={tr("screenshotImport")} closeLabel={tr("close")} size="xl">
      <section className={`dw-screenshot-import dw-dialog ${draft?.cards.length ? " has-results" : ""}`}>
        <div className="dw-import-intro"><strong>{tr("screenshotServerShort", { server: serverName })}</strong><p className="dw-small dw-muted">{tr("screenshotPrivacy")}</p></div>
        {!supported && <p className="dw-alert" role="alert">{tr(source ? "recognitionUnavailable" : "recognitionError.catalogBinding")}{sourceIssue && <span className="dw-recognition-error-detail">{sourceIssue}</span>}</p>}
        <div className={`dw-screenshot-upload ${dragging ? " is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); enqueue(Array.from(event.dataTransfer.files)); }}>
          <input className="dw-hidden" ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" aria-label={tr("videoImport.chooseMedia")}
            disabled={!supported || stale || saving} onChange={event => { enqueue(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          <button type="button" className="dw-primary" disabled={!supported || stale || saving} onClick={() => input.current?.click()}>{tr(rows.length ? "videoImport.appendMedia" : "videoImport.chooseMedia")}</button>
          <div><strong>{tr("videoImport.dropMedia")}</strong><span>{tr("pasteScreenshots")}<br />{tr("videoImport.mediaTypes")}</span></div>
        </div>
        {stale && <div className="dw-alert" role="alert"><p>{tr("recognitionStale")}</p><button type="button" onClick={() => clearBatch()}>{tr("startNewImport")}</button></div>}
        {rows.length > 0 && <section className="dw-screenshot-queue" aria-label={tr("screenshotQueue")}>
          <div className="dw-toolbar"><strong>{tr("batchProgress", { done: completed, total: rows.length })}</strong>{running && <button type="button" onClick={cancelRemaining}>{tr("cancelRemaining")}</button>}</div>
          <div className="dw-screenshot-queue-list">{rows.map((row, index) => {
            const image = images.current.get(row.key)!, failure = failures.current.get(row.key), vProg = videoProgress.current.get(row.key);
            return <article className={`dw-screenshot-queue-item ${row.key === selectedImage ? " is-selected" : ""}`} key={row.key} data-image-key={row.key} data-status={row.status}>
              <button type="button" className="dw-screenshot-queue-select" aria-pressed={row.key === selectedImage} onClick={() => setSelectedImage(row.key)}>
                {image.url ? <img src={image.url} alt="" /> : <span className="dw-card-art dw-card-unknown" aria-hidden="true">MP4</span>}<span>{index + 1} · {row.name}</span>
              </button>
              <strong className="dw-small" role="status">
                {image.isVideo && pending(row) && vProg
                  ? tr("videoImport.frameProgress", vProg)
                  : tr(`batchStatus.${row.status}`)}
              </strong>
              {(row.status === "preparing" || row.status === "running") && <small>{tr("recognitionElapsed", { seconds: Math.floor(row.elapsedMs / 1000) })}</small>}
              {row.status === "complete" && (
                <small>
                  {image.isVideo && vProg
                    ? tr("videoImport.videoSummary", { frames: vProg.total, count: row.result?.cards.length ?? 0 })
                    : tr("imageCardCount", { count: row.result?.cards.length ?? 0 })}
                </small>
              )}
              {row.status === "complete" && !!row.result?.unidentified.length && <small>{tr("imageUnidentifiedCount", { count: row.result.unidentified.length })}</small>}
              {row.duplicateOf && <small>{tr("duplicateScreenshot")}</small>}
              {failure && <details className="dw-queue-error"><summary>{tr("failureDetails")}</summary><p>{tr(failure.code === "timeLimit" ? "recognitionTimeLimit" : `recognitionError.${failure.code}`)}</p>{failure.detail && <p className="dw-recognition-error-detail">{failure.detail.slice(0, 240)}</p>}</details>}
              {pending(row) && <button type="button" onClick={() => cancelFile(row.key)}>{tr("cancelRecognition")}</button>}
              {["failed", "timeLimit", "cancelled"].includes(row.status) && <button type="button" disabled={stale || saving} onClick={() => retryFile(row.key)}>{tr("retryScreenshot")}</button>}
            </article>;
          })}</div>
        </section>}
        {selectedInput && selectedInput.url && <details className="dw-original-screenshot" key={selectedInput.key}>
          <summary>{tr("viewOriginal", { name: selectedInput.name })}</summary>
          <div className="dw-screenshot-preview" style={selectedRow?.width && selectedRow.height ? { aspectRatio: `${selectedRow.width} / ${selectedRow.height}` } : undefined}>
            <img src={selectedInput.url} alt={tr("screenshotPreview")} />
            {selectedRow?.result && [...selectedRow.result.cards, ...selectedRow.result.unidentified].map((card, index) => { const frame = card.bbox; return <span className={`dw-screenshot-bbox ${"id" in card ? "" : " is-unidentified"}`} key={index}
              style={{ left: `${frame[0] / selectedRow.width! * 100}%`, top: `${frame[1] / selectedRow.height! * 100}%`, width: `${frame[2] / selectedRow.width! * 100}%`, height: `${frame[3] / selectedRow.height! * 100}%` }}>{index + 1}</span>; })}
          </div>
        </details>}
        {draft && <section ref={reviewArea} className="dw-recognition-review">
          <div className="dw-toolbar"><h3>{tr("recognitionReview", { count: draft.cards.length })}</h3><button type="button" disabled={stale || saving} onClick={() => setExcluded(selectedCount ? draft.cards.map(card => card.key) : [])}>{tr(selectedCount ? "deselectAllCards" : "selectAllCards")}</button></div>
          <p className="dw-small dw-muted">{tr("recognizedCultivation")}</p>
          {unidentifiedCount > 0 && <p className="dw-small dw-warning">{tr("unidentifiedHint")}</p>}
          {!draft.cards.length && <p className="dw-alert">{tr("recognitionEmpty")}</p>}
          <div className="dw-recognition-cards">{draft.cards.map((card, index) => {
            const conflict = card.identity.status === "conflict" || CARD_FIELDS.some(field => card.fields[field].status === "conflict");
            const crop = card.identity.value === null ? tileCrops.get(card.key) : undefined, candidate = crop ? candidateName(card) : null;
            return <article className={`dw-recognition-card ${excluded.includes(card.key) ? " is-excluded" : ""}`} key={card.key} data-card-key={card.key} data-card-id={card.identity.value ?? ""} data-card-kind={card.kind}>
              <label className="dw-recognition-choice"><input type="checkbox" className="md3-checkbox" checked={!excluded.includes(card.key)} disabled={stale || saving} aria-label={tr("selectRecognizedCard", { n: index + 1 })}
                onChange={event => setExcluded(previous => event.target.checked ? previous.filter(key => key !== card.key) : [...previous, card.key])} /><span>{index + 1}</span>{conflict && <span className="dw-tag dw-warning">{tr("conflict")}</span>}{crop && <span className="dw-tag dw-warning">{tr("unidentifiedCard")}</span>}</label>
              {crop ? <ScreenshotTile crop={crop} /> : <BoxArtwork card={card} catalog={catalog} locale={locale} />}
              <strong className="dw-recognized-name">{crop ? tr("unidentifiedCard") : cardTitle(card, catalog)}</strong><span className="dw-card-subtitle">{crop ? candidate ? tr("unidentifiedCandidate", { name: candidate }) : "" : cardSubtitle(card, catalog)}</span>
              <span className="cb-card-rarity" aria-label={`${tr(card.kind)} · ${t(locale, "cards.rarity")} ${cardRarityLabel(card, catalog) ?? tr("review")}`}>{tr(card.kind)} · {cardRarityLabel(card, catalog) ?? tr("review")}</span>
              <dl className="dw-recognition-facts">{(["level", "rank", ...(card.kind === "member" ? ["awake" as const] : [])] as const).map(field => <div key={field}>
                <dt>{card.kind === "snap" && field === "rank" ? t(locale, "supportCards.growth.limitBreak") : t(locale, `cards.growth.${field === "level" ? "level" : field === "rank" ? "awaken" : "training"}`)}</dt>
                <dd aria-label={`${tr(field)}: ${card.fields[field].status === "conflict" ? tr("conflict") : card.fields[field].value ?? tr("unknown")}`}>{card.fields[field].status === "conflict" ? tr("conflict") : card.fields[field].value ?? "—"}</dd>
              </div>)}</dl>
              <button type="button" className="dw-correct-card" disabled={stale || saving} onClick={() => { setEditingKey(card.key); setChoosingIdentity(false); }}>{tr("reviewCard")}</button>
            </article>;
          })}</div>
        </section>}
        {saveError && <p className="dw-alert" role="alert">{tr("recognitionSaveFailed")}</p>}
        {draft && <div className="dw-recognition-save">
          <div><strong>{tr("batchSelected", { count: selectedCount })}</strong><p className="dw-small dw-muted">{tr(running ? "batchSaveWait" : "recognitionCoverage")}</p></div>
          {!box && (
            <DeckSelect
              compact
              ariaLabel={tr("storageChoice")}
              value={destination}
              disabled={saving || stale}
              options={[
                { value: "local", label: tr("local") },
                { value: "temporary", label: tr("temporary") },
              ]}
              onChange={setDestination}
            />
          )}
          <button type="button" disabled={saving || stale} onClick={() => input.current?.click()}>{tr("videoImport.appendMedia")}</button>
          <button type="button" className="dw-primary" disabled={running || saving || stale || !selectedCount} onClick={() => void save()}>{tr(saving ? "recognitionSaving" : "saveBatch", { count: selectedCount })}</button>
        </div>}
        <p className="dw-small dw-muted">{tr("recognitionSharedCoverage")}</p>
      </section>
    </Modal>
    <Modal historyNavigation={false} isOpen={isOpen && !!editing && !choosingIdentity} onClose={() => setEditingKey(null)} title={tr("reviewCard")} closeLabel={tr("close")} size="lg">
      {editing && <div className="dw-edit dw-recognized-edit"><div>{editing.identity.value === null && tileCrops.has(editing.key) ? <ScreenshotTile crop={tileCrops.get(editing.key)!} /> : <BoxArtwork card={editing} catalog={catalog} locale={locale} />}<h3>{cardTitle(editing, catalog)}</h3><p className="dw-card-subtitle">{editing.identity.value === null && candidateName(editing) ? tr("unidentifiedCandidate", { name: candidateName(editing)! }) : cardSubtitle(editing, catalog)}</p><button type="button" onClick={() => setChoosingIdentity(true)}>{tr("changeCard")}</button></div>
        <div className="dw-dialog"><p className="dw-small dw-muted">{tr("recognitionUnknownCultivation")}</p>
          {growthFields.map(field => <div className="dw-field" key={field}>
            {field === "level" ? <ObservedLevelControl locale={locale} label={tr(field)} value={editing.fields[field].value} onChange={value => correctField(editing.key, field, value)} />
              : <StepControl label={tr(field)} value={editing.fields[field].value ?? 0} options={[0, 1, 2, 3, 4, 5]} formatOption={value => value === 0 ? tr("unknown") : String(value)} onChange={value => correctField(editing.key, field, value === 0 ? null : value)} />}
            {editing.fields[field].status === "conflict" && <p className="dw-warning dw-small">{tr("chooseObservation")}</p>}
          </div>)}
          <details className="dw-evidence"><summary>{tr("fieldHistory")}</summary><ul>{[{ field: "identity", history: editing.identity.history }, ...growthFields.map(field => ({ field, history: editing.fields[field].history }))].flatMap(({ field, history }) => history.map(entry => <li key={entry.id}>{tr(field)}: {entry.value ?? tr("unknown")} · {tr(entry.source)} · {new Date(entry.at).toLocaleString(locale)}</li>))}</ul></details>
          <button type="button" className="dw-primary" onClick={() => setEditingKey(null)}>{tr("doneReview")}</button>
        </div></div>}
    </Modal>
    <Modal historyNavigation={false} isOpen={isOpen && !!editing && choosingIdentity} onClose={() => setChoosingIdentity(false)} title={tr("changeCard")} closeLabel={tr("close")} size="xl">
      {editing && <CardIdentitySelection key={editing.key} locale={locale} kind={editing.kind} catalog={catalog} value={editing.identity.value}
        onCancel={() => setChoosingIdentity(false)} onChange={value => { setDraft(previous => previous ? correctRecognizedBoxIdentity(previous, editing.key, value) : null); setChoosingIdentity(false); }} />}
    </Modal>
  </>;
}
