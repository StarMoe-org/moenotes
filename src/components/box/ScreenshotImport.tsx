import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { assetConfig } from "@/config/assets";
import { t } from "@/i18n";
import { CARD_FIELDS, type CardBox, type CardFieldName } from "@/lib/box/model";
import type { BoxMode } from "@/lib/box/session";
import { bindRecognitionSource, decodeScreenshot, loadRecognitionManifest } from "@/lib/recognition/client";
import { RecognitionError } from "@/lib/recognition/errors";
import { RecognitionBatch, type RecognitionFileSnapshot } from "@/lib/recognition/batch";
import { correctRecognizedBoxIdentity, correctRecognizedValue, mergeRecognizedBox, type RecognitionBinding, type RecognitionSource } from "@/lib/recognition/protocol";
import { RecognitionWorkerClient } from "@/lib/recognition/worker-client";
import Modal from "@/components/shared/Modal";
import CardIdentitySelection from "./CardIdentitySelection";
import { ObservedLevelControl, StepControl } from "@/components/shared/CardGrowthControls";
import { BoxArtwork, cardTitle, cardSubtitle, cardRarityLabel, type BoxCatalog } from "./BoxManager";

interface ImageInput { key: string; name: string; file: File; url: string }
const pending = (row: RecognitionFileSnapshot) => ["queued", "preparing", "running"].includes(row.status);

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
  const batch = useRef<RecognitionBatch | null>(null), boundSource = useRef<RecognitionSource | null>(null);
  const failures = useRef(new Map<string, RecognitionError>());
  const generation = useRef(0), pumping = useRef(false), origin = useRef<string | null>(null), savingRef = useRef(false);
  const active = useRef<{ key: string; jobId: string; controller: AbortController } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), elapsedTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pumpRef = useRef<() => Promise<void>>(async () => {});
  const enqueueRef = useRef<(files: readonly File[]) => boolean>(() => false);
  const consumedPendingFiles = useRef<readonly File[] | null>(null);
  const current = JSON.stringify([isOpen, server, source?.sourceId, source?.catalogueSignature, box?.id, box?.revision, mode]);
  const currentRef = useRef(current); currentRef.current = current;
  const configured = assetConfig.boxRecognition[server];
  const ready = (value: typeof configured) => !!value.workerUrl && !!value.manifestUrl && !!value.manifestSha256;
  const config = ready(configured) ? configured : Object.values(assetConfig.boxRecognition).find(ready) ?? configured;
  const supported = !!source && ready(config);
  const readRows = () => batch.current?.snapshot().files ?? bootstrap.current.map(row => ({ ...row,
    elapsedMs: pending(row) && row.startedAt !== undefined ? performance.now() - row.startedAt : row.elapsedMs }));
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
    for (const image of images.current.values()) URL.revokeObjectURL(image.url);
    images.current.clear(); bootstrap.current = []; batch.current = null; boundSource.current = null; failures.current.clear(); origin.current = null;
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
    const added = files.map(file => ({ key: crypto.randomUUID(), name: file.name, file, url: URL.createObjectURL(file) }));
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
      const files = Array.from(data.files).filter(file => file.type.startsWith("image/"));
      if (!files.length) for (const item of Array.from(data.items)) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
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
        const jobId = crypto.randomUUID(), startedAt = performance.now(), deadline = startedAt + 90000;
        const controller = new AbortController(); active.current = { key: row.key, jobId, controller };
        let binding: RecognitionBinding | undefined;
        const attemptCurrent = () => scopeAlive() && active.current?.jobId === jobId
          && (!batch.current || readRows().find(item => item.key === row.key)?.binding?.jobId === jobId);
        const alive = () => attemptCurrent()
          && (batch.current && binding ? batch.current.isCurrent(row.key, binding) : readRows().some(item => item.key === row.key && pending(item)));
        try {
          if (batch.current) binding = batch.current.prepare(row.key, { jobId, startedAt, deadline });
          else patchBootstrap(row.key, { status: "preparing", startedAt, deadline });
          publish();
          elapsedTimer.current = setInterval(() => { if (alive()) publish(); }, 250);
          timer.current = setTimeout(() => {
            if (!alive()) return;
            failures.current.set(row.key, new RecognitionError("timeLimit"));
            if (batch.current) batch.current.fail(row.key, "timeLimit", binding); else patchBootstrap(row.key, { status: "timeLimit", elapsedMs: performance.now() - startedAt });
            stopActive(); publish();
          }, 90000);
          const [pixels, verifiedSource] = await Promise.all([decodeScreenshot(image.file), boundSource.current
            ? Promise.resolve(boundSource.current)
            : loadRecognitionManifest(config, controller.signal).then(manifest => bindRecognitionSource(manifest, source, config.manifestSha256))]);
          if (!alive()) continue;
          boundSource.current = verifiedSource;
          if (!batch.current) {
            batch.current = new RecognitionBatch({ batchId: crypto.randomUUID(), inputRevision: String(box?.revision ?? 0), source: verifiedSource,
              manifestSha256: config.manifestSha256, at: Date.now(), files: [...images.current.values()] });
            for (const previous of bootstrap.current) {
              if (previous.status === "cancelled") batch.current.cancelFile(previous.key);
              else if (["failed", "timeLimit"].includes(previous.status)) batch.current.fail(previous.key, previous.error ?? (previous.status === "timeLimit" ? "timeLimit" : "failed"));
            }
            binding = batch.current.prepare(row.key, { jobId, startedAt, deadline });
          }
          binding = batch.current.begin(row.key, { jobId, sourceId: pixels.sourceId, width: pixels.width, height: pixels.height, startedAt, deadline });
          publish();
          const output = await client.current.run({ source: verifiedSource, configuration: config, image: pixels, timeLimitMs: deadline - performance.now(), binding,
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
            const failure = error instanceof RecognitionError ? error : new RecognitionError("worker", error instanceof Error ? error.message : "");
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
  const close = () => { clearBatch(); onClose(); };

  return <>
    <Modal historyNavigation={false} isOpen={isOpen} onClose={close} title={tr("screenshotImport")} closeLabel={tr("close")} size="xl">
      <section className={`dw-screenshot-import dw-dialog${draft?.cards.length ? " has-results" : ""}`}>
        <div className="dw-import-intro"><strong>{tr("screenshotServerShort", { server: serverName })}</strong><p className="dw-small dw-muted">{tr("screenshotPrivacy")}</p></div>
        {!supported && <p className="dw-alert" role="alert">{tr(source ? "recognitionUnavailable" : "recognitionError.catalogBinding")}{sourceIssue && <span className="dw-recognition-error-detail">{sourceIssue}</span>}</p>}
        <div className={`dw-screenshot-upload${dragging ? " is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); enqueue(Array.from(event.dataTransfer.files)); }}>
          <input className="dw-hidden" ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp" aria-label={tr("chooseScreenshots")}
            disabled={!supported || stale || saving} onChange={event => { enqueue(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          <button type="button" className="dw-primary" disabled={!supported || stale || saving} onClick={() => input.current?.click()}>{tr(rows.length ? "appendScreenshots" : "chooseScreenshots")}</button>
          <div><strong>{tr("dropScreenshots")}</strong><span>{tr("pasteScreenshots")}<br />{tr("screenshotTypes")}</span></div>
        </div>
        {stale && <div className="dw-alert" role="alert"><p>{tr("recognitionStale")}</p><button type="button" onClick={() => clearBatch()}>{tr("startNewImport")}</button></div>}
        {rows.length > 0 && <section className="dw-screenshot-queue" aria-label={tr("screenshotQueue")}>
          <div className="dw-toolbar"><strong>{tr("batchProgress", { done: completed, total: rows.length })}</strong>{running && <button type="button" onClick={cancelRemaining}>{tr("cancelRemaining")}</button>}</div>
          <div className="dw-screenshot-queue-list">{rows.map((row, index) => {
            const image = images.current.get(row.key)!, failure = failures.current.get(row.key);
            return <article className={`dw-screenshot-queue-item${row.key === selectedImage ? " is-selected" : ""}`} key={row.key} data-image-key={row.key} data-status={row.status}>
              <button type="button" className="dw-screenshot-queue-select" aria-pressed={row.key === selectedImage} onClick={() => setSelectedImage(row.key)}>
                <img src={image.url} alt="" /><span>{index + 1} · {row.name}</span>
              </button>
              <strong className="dw-small" role="status">{tr(`batchStatus.${row.status}`)}</strong>
              {(row.status === "preparing" || row.status === "running") && <small>{tr("recognitionElapsed", { seconds: Math.floor(row.elapsedMs / 1000) })}</small>}
              {row.status === "complete" && <small>{tr("imageCardCount", { count: row.result?.cards.length ?? 0 })}</small>}
              {row.duplicateOf && <small>{tr("duplicateScreenshot")}</small>}
              {failure && <details className="dw-queue-error"><summary>{tr("failureDetails")}</summary><p>{tr(failure.code === "timeLimit" ? "recognitionTimeLimit" : `recognitionError.${failure.code}`)}</p>{failure.detail && <p className="dw-recognition-error-detail">{failure.detail.slice(0, 240)}</p>}</details>}
              {pending(row) && <button type="button" onClick={() => cancelFile(row.key)}>{tr("cancelRecognition")}</button>}
              {["failed", "timeLimit", "cancelled"].includes(row.status) && <button type="button" disabled={stale || saving} onClick={() => retryFile(row.key)}>{tr("retryScreenshot")}</button>}
            </article>;
          })}</div>
        </section>}
        {selectedInput && <details className="dw-original-screenshot" key={selectedInput.key}>
          <summary>{tr("viewOriginal", { name: selectedInput.name })}</summary>
          <div className="dw-screenshot-preview" style={selectedRow?.width && selectedRow.height ? { aspectRatio: `${selectedRow.width} / ${selectedRow.height}` } : undefined}>
            <img src={selectedInput.url} alt={tr("screenshotPreview")} />
            {selectedRow?.result?.cards.map((card, index) => { const frame = card.frameBBox ?? card.uiBBox; return <span className="dw-screenshot-bbox" key={index}
              style={{ left: `${frame[0] / selectedRow.width! * 100}%`, top: `${frame[1] / selectedRow.height! * 100}%`, width: `${frame[2] / selectedRow.width! * 100}%`, height: `${frame[3] / selectedRow.height! * 100}%` }}>{index + 1}</span>; })}
          </div>
        </details>}
        {draft && <section ref={reviewArea} className="dw-recognition-review">
          <div className="dw-toolbar"><h3>{tr("recognitionReview", { count: draft.cards.length })}</h3><button type="button" disabled={stale || saving} onClick={() => setExcluded(selectedCount ? draft.cards.map(card => card.key) : [])}>{tr(selectedCount ? "deselectAllCards" : "selectAllCards")}</button></div>
          <p className="dw-small dw-muted">{tr("recognizedCultivation")}</p>
          {!draft.cards.length && <p className="dw-alert">{tr("recognitionEmpty")}</p>}
          <div className="dw-recognition-cards">{draft.cards.map((card, index) => {
            const conflict = card.identity.status === "conflict" || CARD_FIELDS.some(field => card.fields[field].status === "conflict");
            return <article className={`dw-recognition-card${excluded.includes(card.key) ? " is-excluded" : ""}`} key={card.key} data-card-key={card.key} data-card-id={card.identity.value ?? ""} data-card-kind={card.kind}>
              <label className="dw-recognition-choice"><input type="checkbox" checked={!excluded.includes(card.key)} disabled={stale || saving} aria-label={tr("selectRecognizedCard", { n: index + 1 })}
                onChange={event => setExcluded(previous => event.target.checked ? previous.filter(key => key !== card.key) : [...previous, card.key])} /><span>{index + 1}</span>{conflict && <span className="dw-tag dw-warning">{tr("conflict")}</span>}</label>
              <BoxArtwork card={card} catalog={catalog} locale={locale} />
              <strong className="dw-recognized-name">{cardTitle(card, catalog)}</strong><span className="dw-card-subtitle">{cardSubtitle(card, catalog)}</span>
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
          {!box && <label>{tr("storageChoice")}<select aria-label={tr("storageChoice")} value={destination} disabled={saving || stale} onChange={event => setDestination(event.target.value as BoxMode)}><option value="local">{tr("local")}</option><option value="temporary">{tr("temporary")}</option></select></label>}
          <button type="button" disabled={saving || stale} onClick={() => input.current?.click()}>{tr("appendScreenshots")}</button>
          <button type="button" className="dw-primary" disabled={running || saving || stale || !selectedCount} onClick={() => void save()}>{tr(saving ? "recognitionSaving" : "saveBatch", { count: selectedCount })}</button>
        </div>}
        <p className="dw-small dw-muted">{tr("recognitionSharedCoverage")}</p>
      </section>
    </Modal>
    <Modal historyNavigation={false} isOpen={isOpen && !!editing && !choosingIdentity} onClose={() => setEditingKey(null)} title={tr("reviewCard")} closeLabel={tr("close")} size="lg">
      {editing && <div className="dw-edit dw-recognized-edit"><div><BoxArtwork card={editing} catalog={catalog} locale={locale} /><h3>{cardTitle(editing, catalog)}</h3><p className="dw-card-subtitle">{cardSubtitle(editing, catalog)}</p><button type="button" onClick={() => setChoosingIdentity(true)}>{tr("changeCard")}</button></div>
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
