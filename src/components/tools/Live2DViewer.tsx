import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ModelPlayer } from "ournotes-player/live2d";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, { CharacterFilter, FilterButton, FilterSection, FilterToggle, toggleArrayItem } from "@/components/shared/BaseFilters";
import { closeFilterDrawer, openFilterDrawer, useQuickFilter } from "@/lib/filter/use-quick-filter";
import { fetchLive2DModels } from "@/lib/live2d/client";
import { getLive2DViewerHref, parseLive2DModel, parseLive2DViewerSearch, type Live2DModel } from "@/lib/live2d/models";
import Live2DStage, { StageSignature } from "@/components/tools/Live2DStage";

export interface Live2DCharacter {
  id: number;
  name: string;
  bandId: number;
}

interface Props {
  locale: AppLocale;
  /** Characters in display order, with localized names. */
  characters: Live2DCharacter[];
  bands: Array<{ id: number; name: string }>;
}

type ListState = { kind: "loading" } | { kind: "error"; detail: string } | { kind: "ready"; models: Live2DModel[] };
type Kind = Live2DModel["kind"];
const KINDS: readonly Kind[] = ["story", "live", "side"];

/** Whose costumes the panel lists: a character (MasterCharacter id) or a side character (as the model ids name it). */
type Subject = { character: number } | { side: string };

/** A model with what the panel and the search show: its owner's name and the costume in words. */
interface ModelEntry {
  model: Live2DModel;
  name: string;
  costume: string;
  searchText: string;
}

/**
 * The Live2D viewer: the quick filter finds a character (grouped by band, side characters after them) and narrows the
 * costumes by type and text; the panel beside the stage switches the character's costumes, motions and expressions.
 */
export default function Live2DViewer({ locale, characters, bands }: Props) {
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const [listAttempt, setListAttempt] = useState(0);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedKinds, setSelectedKinds] = useState<Kind[]>([]);
  const [showLowQuality, setShowLowQuality] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setList({ kind: "loading" });
    fetchLive2DModels(controller.signal).then(
      (entries) => setList({ kind: "ready", models: entries.map(parseLive2DModel) }),
      (error: unknown) => {
        if (!controller.signal.aborted) setList({ kind: "error", detail: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => controller.abort();
  }, [listAttempt]);

  const characterById = useMemo(() => new Map(characters.map((character) => [character.id, character])), [characters]);
  const entries = useMemo<ModelEntry[]>(() => {
    if (list.kind !== "ready") return [];
    return list.models.map((model) => {
      const name = (model.characterId !== null ? characterById.get(model.characterId)?.name : undefined) ?? (model.sideName ?? model.id).replaceAll("_", " ");
      const costume = costumeLabel(locale, model);
      return { model, name, costume, searchText: [name, costume, model.id].join(" ").toLocaleLowerCase() };
    });
  }, [list, characterById, locale]);

  // Models the filters let through; the character pickers and the costume list both read these.
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return entries.filter(({ model, searchText }) =>
      (showLowQuality || !model.lowQuality || model.id === modelId)
      && (selectedKinds.length === 0 || selectedKinds.includes(model.kind))
      && (!needle || searchText.includes(needle)));
  }, [entries, query, selectedKinds, showLowQuality, modelId]);
  const listed = useMemo(() => entries.filter(({ model }) => showLowQuality || !model.lowQuality).length, [entries, showLowQuality]);

  const bandGroups = useMemo(() => {
    const available = new Set(filtered.map(({ model }) => model.characterId).filter((id): id is number => id !== null));
    return bands
      .map((band) => ({ band, members: characters.filter((character) => character.bandId === band.id && available.has(character.id)) }))
      .filter((group) => group.members.length > 0);
  }, [filtered, bands, characters]);
  const sideNames = useMemo(
    () => [...new Set(filtered.map(({ model }) => model.sideName).filter((name): name is string => name !== null))].sort(),
    [filtered],
  );

  const costumesOf = useCallback(
    (owner: Subject) => filtered
      .filter(({ model }) => ("character" in owner ? model.characterId === owner.character : model.sideName === owner.side))
      .sort((a, b) => costumeOrder(a.model) - costumeOrder(b.model) || a.model.id.localeCompare(b.model.id)),
    [filtered],
  );
  const costumes = useMemo(() => (subject ? costumesOf(subject) : []), [subject, costumesOf]);
  const current = useMemo(() => entries.find((entry) => entry.model.id === modelId) ?? null, [entries, modelId]);

  // The address names the model: open it (and its owner) once the list has arrived.
  useEffect(() => {
    if (list.kind !== "ready" || restored) return;
    const requested = parseLive2DViewerSearch(window.location.search);
    const found = requested ? list.models.find((model) => model.id === requested) : undefined;
    if (found) {
      setModelId(found.id);
      setSubject(subjectOf(found));
    }
    setRestored(true);
  }, [list, restored]);

  useEffect(() => {
    if (!restored) return;
    const href = getLive2DViewerHref(locale, modelId ?? undefined);
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(window.history.state, "", href);
  }, [restored, modelId, locale]);

  const choose = (owner: Subject) => {
    setSubject(owner);
    const first = costumesOf(owner)[0];
    if (first) setModelId(first.model.id);
    // On a narrow screen the drawer covers the stage: close it once a character is chosen.
    if (window.matchMedia("(max-width: 1023px)").matches) closeFilterDrawer();
  };
  const isSubject = (owner: Subject) => subject !== null
    && ("character" in owner ? "character" in subject && subject.character === owner.character : "side" in subject && subject.side === owner.side);
  const hasActiveFilters = Boolean(query) || selectedKinds.length > 0 || showLowQuality;
  const resetFilters = useCallback(() => {
    setQuery("");
    setSelectedKinds([]);
    setShowLowQuality(false);
  }, []);

  const quickFilterContent = (
    <BaseFilters
      variant="plain"
      title={t(locale, "live2d.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "live2d.searchPlaceholder")}
      resultCount={filtered.length}
      totalCount={listed}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "live2d.kindTitle")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedKinds.length === 0} onClick={() => setSelectedKinds([])}>ALL</FilterButton>
          {KINDS.map((kind) => (
            <FilterButton key={kind} active={selectedKinds.includes(kind)} onClick={() => setSelectedKinds((previous) => toggleArrayItem(previous, kind))}>
              {t(locale, `live2d.kind.${kind}`)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>
      {bandGroups.map(({ band, members }) => (
        <CharacterFilter
          key={band.id}
          title={band.name}
          characters={members.map((character) => ({ id: character.id, name: character.name }))}
          selectedCharacters={subject && "character" in subject ? [subject.character] : []}
          onToggle={(id) => choose({ character: id })}
          showAll={false}
        />
      ))}
      {sideNames.length > 0 && (
        <FilterSection title={t(locale, "live2d.sideCharacters")}>
          <div className="flex flex-wrap gap-2">
            {sideNames.map((name) => (
              <FilterButton key={name} active={isSubject({ side: name })} onClick={() => choose({ side: name })}>
                <span className="capitalize">{name.replaceAll("_", " ")}</span>
              </FilterButton>
            ))}
          </div>
        </FilterSection>
      )}
      <FilterToggle checked={showLowQuality} onChange={setShowLowQuality} label={t(locale, "live2d.showLowQuality")} />
    </BaseFilters>
  );

  useQuickFilter(t(locale, "live2d.filterTitle"), quickFilterContent, [
    query, selectedKinds, showLowQuality, bandGroups, sideNames, subject, filtered.length, listed, hasActiveFilters, locale,
  ]);

  return (
    <div className="space-y-2 @container">
      <DataNotice locale={locale} />
      {current ? (
        <div className="grid gap-4 @4xl:grid-cols-[minmax(0,1fr)_19rem] @4xl:items-start">
          <ModelView
            key={current.model.id}
            locale={locale}
            entry={current}
            costumes={costumes.length > 0 ? costumes : [current]}
            onCostume={setModelId}
            onChooseCharacter={openFilterDrawer}
          />
        </div>
      ) : (
        <StageEmpty locale={locale} list={list} onChoose={openFilterDrawer} onRetry={() => setListAttempt((value) => value + 1)} />
      )}
      <p className="px-1 text-right text-[11px] font-semibold tracking-wide text-[var(--mn-text-muted)]">{t(locale, "live2d.credit")}</p>
    </div>
  );
}

interface PlayerState {
  motions: string[];
  expressions: string[];
  motion: string;
  expression: string;
  hasPhysics: boolean;
  physics: boolean;
  breath: boolean;
  paused: boolean;
}

/** The stage and the panel of one model; remounted per model, so the panel never shows another model's player. */
function ModelView({ locale, entry, costumes, onCostume, onChooseCharacter }: {
  locale: AppLocale;
  entry: ModelEntry;
  /** The owner's costumes the filters let through (the shown one at least). */
  costumes: ModelEntry[];
  onCostume: (id: string) => void;
  onChooseCharacter: () => void;
}) {
  const { model } = entry;
  const [player, setPlayer] = useState<ModelPlayer | null>(null);
  const [state, setState] = useState<PlayerState | null>(null);
  const [loop, setLoop] = useState(false);

  const read = useCallback((source: ModelPlayer) => setState({
    motions: source.motions, expressions: source.expressions, motion: source.motion, expression: source.expression,
    hasPhysics: source.hasPhysics, physics: source.physics, breath: source.breath, paused: source.paused,
  }), []);

  // A motion that ends hands over to the default motion without an event: follow the player's state.
  useEffect(() => {
    if (!player) return;
    read(player);
    const timer = window.setInterval(() => {
      if (player.disposed) return;
      setState((previous) => (!previous || (previous.motion === player.motion && previous.expression === player.expression && previous.paused === player.paused)
        ? previous
        : { ...previous, motion: player.motion, expression: player.expression, paused: player.paused }));
    }, 400);
    return () => window.clearInterval(timer);
  }, [player, read]);

  const act = (change: (source: ModelPlayer) => void) => {
    if (!player || player.disposed) return;
    change(player);
    read(player);
  };

  return (
    <>
      <Live2DStage locale={locale} modelId={model.id} onReady={setPlayer} />
      <aside className="mn-paper space-y-4 p-4 @4xl:max-h-[80vh] @4xl:overflow-y-auto" aria-label={t(locale, "live2d.controls")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate font-[var(--mn-font-display)] text-lg font-bold capitalize text-[var(--mn-text)]">{entry.name}</h2>
            <p className="mt-1 break-all font-mono text-[10px] text-[var(--mn-text-muted)]">
              {model.id}{model.bytes > 0 ? ` · ${(model.bytes / (1024 * 1024)).toFixed(1)} MB` : ""}
            </p>
          </div>
          <button type="button" onClick={onChooseCharacter} className={`${pillClass(false)} shrink-0`}>{t(locale, "live2d.chooseCharacter")}</button>
        </div>

        <ControlGroup title={t(locale, "live2d.costumes")}>
          <div className="flex flex-wrap gap-1.5">
            {costumes.map((costume) => (
              <button
                key={costume.model.id}
                type="button"
                title={costume.model.id}
                aria-pressed={costume.model.id === model.id}
                onClick={() => onCostume(costume.model.id)}
                className={pillClass(costume.model.id === model.id)}
              >
                <span className="mr-1.5 text-[10px] font-black opacity-70">{t(locale, `live2d.kind.${costume.model.kind}`)}</span>
                {costume.costume}
              </button>
            ))}
          </div>
        </ControlGroup>

        {state ? (
          <>
            <ControlGroup title={t(locale, "live2d.motions")}>
              <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                {state.motions.map((motion) => (
                  <button
                    key={motion}
                    type="button"
                    title={motion}
                    onClick={() => act((source) => source.playMotion(motion, { loop }))}
                    className={`${pillClass(motion === state.motion)} truncate text-left font-mono text-[11px]`}
                  >
                    {motion.replace(/^mtn_/, "")}
                  </button>
                ))}
              </div>
              <Toggle label={t(locale, "live2d.loop")} checked={loop} onChange={setLoop} />
            </ControlGroup>

            <ControlGroup title={t(locale, "live2d.expressions")}>
              {state.expressions.length === 0 ? (
                <p className="text-xs text-[var(--mn-text-muted)]">{t(locale, "live2d.noExpressions")}</p>
              ) : (
                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto pr-1">
                  {state.expressions.map((expression) => (
                    <button
                      key={expression}
                      type="button"
                      title={expression}
                      onClick={() => act((source) => source.setExpression(expression))}
                      className={`${pillClass(expression === state.expression)} font-mono text-[11px]`}
                    >
                      {expression.replace(/^exp_/, "")}
                    </button>
                  ))}
                </div>
              )}
            </ControlGroup>

            <ControlGroup title={t(locale, "live2d.options")}>
              <Toggle label={t(locale, "live2d.physics")} checked={state.physics} disabled={!state.hasPhysics} onChange={(on) => act((source) => { source.physics = on; })} />
              <Toggle label={t(locale, "live2d.breath")} checked={state.breath} onChange={(on) => act((source) => { source.breath = on; })} />
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => act((source) => (source.paused ? source.play() : source.pause()))} className={pillClass(false)}>
                  {t(locale, state.paused ? "live2d.resume" : "live2d.pause")}
                </button>
                <button
                  type="button"
                  onClick={() => act((source) => {
                    source.playMotion(source.defaultMotion);
                    if (source.defaultExpression) source.setExpression(source.defaultExpression);
                  })}
                  className={pillClass(false)}
                >
                  {t(locale, "live2d.reset")}
                </button>
              </div>
            </ControlGroup>
          </>
        ) : (
          <p className="text-xs font-semibold text-[var(--mn-text-muted)]">{t(locale, "live2d.controlsWaiting")}</p>
        )}
      </aside>
    </>
  );
}

/** What the viewer shows: the game's own data, nothing edited. */
function DataNotice({ locale }: { locale: AppLocale }) {
  return (
    <aside className="mb-2 flex gap-3 rounded-2xl border border-solid border-[var(--mn-border)] bg-[var(--mn-accent-soft)] p-4 text-xs font-semibold leading-relaxed text-[var(--mn-ink-soft)]" aria-label={t(locale, "live2d.noticeTitle")}>
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mn-accent-deep)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" />
      </svg>
      <p>
        <strong className="text-[var(--mn-text)]">{t(locale, "live2d.noticeTitle")}</strong>
        <span className="mx-1.5 text-[var(--mn-text-muted)]">·</span>
        {t(locale, "live2d.notice")}
      </p>
    </aside>
  );
}

function ControlGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-black uppercase tracking-wider text-[var(--mn-text-muted)]">{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-sm font-semibold text-[var(--mn-text)] ${disabled ? "opacity-45" : "cursor-pointer"}`}>
      <input type="checkbox" className="h-4 w-4 accent-[var(--mn-accent-deep)]" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function StageEmpty({ locale, list, onChoose, onRetry }: { locale: AppLocale; list: ListState; onChoose: () => void; onRetry: () => void }) {
  const empty = list.kind === "ready" && list.models.length === 0;
  return (
    <div className="relative grid aspect-[3/4] max-h-[80vh] w-full place-items-center overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[linear-gradient(180deg,var(--mn-cream-deep),var(--mn-paper))] px-6 text-center shadow-[var(--mn-shadow-stamp)] @lg:aspect-[16/9]">
      <StageSignature />
      <div className="relative">
        {list.kind === "loading" && <p className="text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "live2d.listLoading")}</p>}
        {list.kind === "error" && (
          <>
            <p className="text-sm font-bold text-[var(--mn-rose)]">{t(locale, "live2d.listError")}</p>
            <button type="button" onClick={onRetry} className={`${pillClass(false)} mt-4`}>{t(locale, "live2d.retry")}</button>
          </>
        )}
        {empty && <p className="text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "live2d.listEmpty")}</p>}
        {list.kind === "ready" && !empty && (
          <>
            <h2 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">{t(locale, "live2d.emptyTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-xs font-medium leading-6 text-[var(--mn-text-muted)] sm:text-sm">{t(locale, "live2d.emptyDescription")}</p>
            <button
              type="button"
              onClick={onChoose}
              className="mn-focus mn-stamp-press mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--mn-accent)] px-6 py-3 text-sm font-bold text-white shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-accent-deep)]"
            >
              {t(locale, "live2d.chooseCharacter")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function subjectOf(model: Live2DModel): Subject | null {
  if (model.characterId !== null) return { character: model.characterId };
  return model.sideName !== null ? { side: model.sideName } : null;
}

/** Costume order in the panel: the casual story costume first, then story, live and low quality models. */
function costumeOrder(model: Live2DModel): number {
  const first = model.costume[0];
  const casual = first !== undefined && "token" in first && first.token === "casual" ? 0 : 1;
  return (model.lowQuality ? 20 : 0) + KINDS.indexOf(model.kind) * 2 + casual;
}

/** The costume in words: known words from the message packs, other words as the id spells them. */
function costumeLabel(locale: AppLocale, model: Live2DModel): string {
  const words = model.costume.map((part) => ("token" in part ? t(locale, `live2d.costume.${part.token}`) : part.text)).filter(Boolean);
  if (model.lowQuality) words.push(t(locale, "live2d.lowQuality"));
  return words.length > 0 ? words.join(" · ") : t(locale, "live2d.costumeDefault");
}

function pillClass(active: boolean): string {
  return `mn-focus inline-flex items-center rounded-full border-[1.5px] px-3 py-1.5 text-xs font-bold transition ${
    active
      ? "border-[var(--mn-accent)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
      : "border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)] hover:border-[var(--mn-accent)] hover:text-[var(--mn-accent-deep)]"
  }`;
}
