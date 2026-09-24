import { useMemo, useState, type ReactNode } from "react";
import { t } from "@/i18n";
import type { AppLocale } from "@/config/locales";
import { assetConfig } from "@/config/assets";
import BaseFilters, { FilterSection } from "@/components/shared/BaseFilters";
import Modal from "@/components/shared/Modal";
import Popover from "@/components/shared/Popover";
import { openFilterDrawer, useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useAssetBrowserQuery } from "@/components/tools/use-asset-browser-query";
import { AssetBrowserError, assetBrowserUrl, defaultCatalog } from "@/lib/assets/browser-client";
import type { AssetCatalog, AssetRegion, BundleBrowsePage, BundleContent, BundleContentPage, BundleScanStatus } from "@/types/asset-browser";

interface Props { locale: AppLocale }
interface Location { directory: string; page: number }
type IconName = "folder" | "file" | "image" | "audio" | "video" | "back" | "forward" | "up" | "refresh" | "list" | "grid" | "filter" | "home";
const PAGE_SIZE = 50;
const ROOT: Location = { directory: "", page: 0 };
const buttonClass = "mn-focus rounded-lg p-2 text-[var(--mn-text-muted)] transition hover:bg-[var(--mn-accent-soft)] hover:text-[var(--mn-text)] disabled:cursor-not-allowed disabled:opacity-30";

function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    folder: <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2-2V7Zm0 3h18" />,
    file: <path d="M14 2H5v20h14V7Zm0 0v5h5" />,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1" /><path d="m3 17 6-6 4 4 3-3 5 5" /></>,
    audio: <><path d="M9 18V5l11-2v13M9 9l11-2" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></>,
    video: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m10 8 6 4-6 4Z" /></>,
    back: <path d="m12 5-7 7 7 7M5 12h15" />,
    forward: <path d="m12 5 7 7-7 7M19 12H4" />,
    up: <path d="m5 12 7-7 7 7M12 5v15" />,
    refresh: <path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5" />,
    list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    filter: <path d="M3 4h18v3l-7 7v5l-4 2v-7L3 7Z" />,
    home: <path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8" />,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function ToolButton({ icon, label, onClick, disabled = false, active = false }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" className={`${buttonClass} ${active ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : ""}`} title={label} aria-label={label} aria-pressed={icon === "list" || icon === "grid" ? active : undefined} disabled={disabled} onClick={onClick}><Icon name={icon} /></button>;
}

function ScopeSelect({ title, value, options, onChange }: { title: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <FilterSection title={title}>
    <Popover matchTriggerWidth trigger={({ ref, onClick, ...aria }) => <button ref={ref} type="button" onClick={onClick} {...aria} disabled={!options.length} aria-label={`${title}: ${options.find((option) => option.value === value)?.label ?? ""}`} className="mn-focus mn-stamp-press flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-2.5 text-left text-sm font-bold disabled:opacity-50"><span className="min-w-0 truncate">{options.find((option) => option.value === value)?.label ?? "—"}</span><svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>}>
      {({ close }) => <div className="space-y-1" role="group" aria-label={title}>{options.map((option) => <button key={option.value} type="button" aria-pressed={option.value === value} className={`mn-focus block w-full rounded-lg px-3 py-2 text-left text-sm ${option.value === value ? "bg-[var(--mn-accent-soft)] font-bold text-[var(--mn-accent-deep)]" : "hover:bg-[var(--mn-surface)]"}`} onClick={() => { onChange(option.value); close(); }}>{option.label}</button>)}</div>}
    </Popover>
  </FilterSection>;
}

function parentDirectory(path: string): string { return path.slice(0, Math.max(0, path.lastIndexOf("/"))); }
function fileIcon(file: BundleContent): IconName {
  const extension = file.path.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "spriteatlasv2"].includes(extension ?? "")) return "image";
  if (["acb", "awb", "hca", "aac", "ogg"].includes(extension ?? "")) return "audio";
  if (["usm", "mp4", "webm"].includes(extension ?? "")) return "video";
  return "file";
}

export default function AssetViewer({ locale }: Props) {
  const regions = useAssetBrowserQuery<AssetRegion[]>(assetBrowserUrl("regions"));
  const [scope, setScope] = useState({ language: "", snapshot: "" });
  const region = regions.data?.find((item) => item.id === assetConfig.region);
  const languages = region ? [...new Set([region.default_locale, ...region.locales])] : [];
  const language = region && languages.includes(scope.language) ? scope.language : region?.default_locale ?? "";
  const languageNames = useMemo(() => new Intl.DisplayNames([locale], { type: "language" }), [locale]);
  const catalogs = useAssetBrowserQuery<AssetCatalog[]>(region ? assetBrowserUrl("catalogs", { region: assetConfig.region, locale: language }) : null);
  const catalog = catalogs.data?.find((item) => item.snapshot === scope.snapshot) ?? defaultCatalog(catalogs.data ?? []);
  const snapshot = catalog?.snapshot ?? "";
  const [navigation, setNavigation] = useState({ snapshot: "", entries: [ROOT], position: 0 });
  const history = navigation.snapshot === snapshot ? navigation.entries : [ROOT];
  const position = navigation.snapshot === snapshot ? navigation.position : 0;
  const location = history[position] ?? ROOT;
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("default");
  const [view, setView] = useState<"list" | "grid">("list");
  const [selection, setSelection] = useState<{ snapshot: string; file: BundleContent } | null>(null);
  const status = useAssetBrowserQuery<BundleScanStatus>(snapshot ? assetBrowserUrl("scan/status", { snapshot }) : null, 10000);
  const browseUrl = snapshot ? assetBrowserUrl("browse", { snapshot, directory: location.directory, query, offset: location.page * PAGE_SIZE, limit: PAGE_SIZE, descending: sort === "nameDescending" ? "true" : "false", scan: status.data?.scanned ?? 0 }) : null;
  const browse = useAssetBrowserQuery<BundleBrowsePage>(browseUrl);
  const folders = location.page === 0 ? browse.data?.folders ?? [] : [];
  const files = browse.data?.files ?? [];
  const fileCount = browse.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(fileCount / PAGE_SIZE));
  const page = Math.min(location.page, pageCount - 1);

  const clearSearch = () => { setQuery(""); setSelection(null); };
  const navigate = (next: Location) => { setNavigation({ snapshot, entries: [...history.slice(0, position + 1), next], position: position + 1 }); clearSearch(); };
  const changePage = (next: number) => setNavigation({ snapshot, entries: history.map((entry, i) => i === position ? { ...entry, page: next } : entry), position });
  const travel = (next: number) => { setNavigation({ snapshot, entries: history, position: next }); clearSearch(); };
  const changeScope = (next: typeof scope) => { setScope(next); clearSearch(); };
  const resetFilters = () => { setQuery(""); setSort("default"); changePage(0); };
  const setSearch = (value: string) => { setQuery(value); changePage(0); };
  const crumbs = location.directory.split("/").filter(Boolean).map((name, index, parts) => ({ name, directory: parts.slice(0, index + 1).join("/") }));
  const hasFilters = Boolean(query || sort !== "default");
  const scanIncomplete = Boolean(status.data && status.data.scanned < status.data.total);

  const filterContent = <BaseFilters sort={{
    label: t(locale, "assetBrowser.sort"), value: sort,
    defaultOption: { value: "default", label: t(locale, "sorting.default") },
    options: [{ value: "name", reverseValue: "nameDescending", label: t(locale, "assetBrowser.name"), initialDirection: "asc" }],
    ascendingLabel: t(locale, "sorting.ascending"), descendingLabel: t(locale, "sorting.descending"),
    onChange: (value) => { setSort(value); changePage(0); },
  }} variant="plain" title={t(locale, "assetBrowser.filterTitle")} searchValue={query} onSearchChange={setSearch} searchLabel={t(locale, "filter.search")} searchPlaceholder={t(locale, "assetBrowser.searchPlaceholder")} hasActiveFilters={hasFilters} onReset={resetFilters} resetLabel={t(locale, "filter.reset")} expandLabel={t(locale, "filter.expand")}>
    <ScopeSelect title={t(locale, "assetBrowser.language")} value={language} options={languages.map((value) => ({ value, label: languageNames.of(value) ?? value }))} onChange={(value) => changeScope({ language: value, snapshot: "" })} />
    <ScopeSelect title={t(locale, "assetBrowser.snapshot")} value={snapshot} options={(catalogs.data ?? []).map((item) => ({ value: item.snapshot, label: `${item.version} · ${new Date(item.created * 1000).toLocaleString(locale)}${item.current ? ` · ${t(locale, "assetBrowser.current")}` : ""}` }))} onChange={(value) => changeScope({ language, snapshot: value })} />
  </BaseFilters>;
  useQuickFilter(t(locale, "assetBrowser.filterTitle"), filterContent, [locale, query, sort, region, language, catalog, regions.data, catalogs.data, navigation]);

  const loading = regions.status === "loading" || (Boolean(region) && catalogs.status === "loading") || (Boolean(catalog) && browse.status === "loading");
  const failed = regions.status === "error" ? regions : catalogs.status === "error" ? catalogs : catalog && browse.status === "error" ? browse : null;
  const emptyMessage = !region ? "assetBrowser.noLanguages" : !catalog ? "assetBrowser.noCatalogs" : hasFilters ? "assetBrowser.noMatches" : scanIncomplete ? status.data?.failed ? "assetBrowser.scanIncomplete" : "assetBrowser.scanPending" : "assetBrowser.emptyFolder";
  const refresh = () => { if (failed) failed.reload(); else { regions.reload(); catalogs.reload(); status.reload(); browse.reload(); } };

  return <section className="min-w-0 text-[var(--mn-text)]" aria-label={t(locale, "assetBrowser.title")}>
    <div className="overflow-hidden rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-sm)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--mn-border)] bg-[var(--mn-surface)] px-3 py-2">
        <div className="flex items-center gap-0.5">
          <ToolButton icon="back" label={t(locale, "assetBrowser.back")} onClick={() => travel(position - 1)} disabled={position === 0} />
          <ToolButton icon="forward" label={t(locale, "assetBrowser.forward")} onClick={() => travel(position + 1)} disabled={position >= history.length - 1} />
          <ToolButton icon="up" label={t(locale, "assetBrowser.up")} onClick={() => navigate({ directory: parentDirectory(location.directory), page: 0 })} disabled={!location.directory} />
          <ToolButton icon="refresh" label={t(locale, "actions.refresh")} onClick={refresh} />
        </div>
        <nav className="order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1" aria-label={t(locale, "assetBrowser.pathNavigation")}>
          <ol className="flex flex-wrap items-center gap-1 text-xs">
            <li><button type="button" className={`${buttonClass} flex items-center gap-1.5`} aria-current={!crumbs.length ? "location" : undefined} onClick={() => navigate(ROOT)}><Icon name="home" />{t(locale, "assetBrowser.root")}</button></li>
            {crumbs.map((crumb, index) => <li key={crumb.directory} className="flex min-w-0 items-center gap-1"><span aria-hidden="true" className="text-[var(--mn-text-muted)]">/</span><button type="button" className={`${buttonClass} max-w-56 truncate`} title={crumb.name} aria-current={index === crumbs.length - 1 ? "location" : undefined} onClick={() => navigate({ directory: crumb.directory, page: 0 })}>{crumb.name}</button></li>)}
          </ol>
        </nav>
        <div className="ml-auto flex items-center gap-0.5">
          <ToolButton icon="list" label={t(locale, "assetBrowser.list")} active={view === "list"} onClick={() => setView("list")} />
          <ToolButton icon="grid" label={t(locale, "assetBrowser.grid")} active={view === "grid"} onClick={() => setView("grid")} />
          <ToolButton icon="filter" label={t(locale, "filter.openQuickFilter")} active={hasFilters} onClick={openFilterDrawer} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--mn-border)] px-4 py-2 text-xs text-[var(--mn-text-muted)]">
        <span>{language ? languageNames.of(language) ?? language : ""}{catalog ? ` / ${catalog.version} · ${new Date(catalog.created * 1000).toLocaleDateString(locale)}` : ""}</span>
        {status.data && <span role="status">{t(locale, "assetBrowser.scanProgress", { scanned: status.data.scanned, total: status.data.total })}{status.data.failed > 0 && ` · ${t(locale, "assetBrowser.scanFailed", { count: status.data.failed })}`}{status.data.local_bundles > 0 && ` · ${t(locale, "assetBrowser.scanLocal", { count: status.data.local_bundles })}`}</span>}
      </div>
      {failed ? <div role="alert" className="space-y-3 p-12 text-center"><p className="font-bold">{t(locale, "assetBrowser.loadError")}</p><p className="text-sm text-[var(--mn-text-muted)]">{t(locale, failed.error instanceof AssetBrowserError && failed.error.status === 404 ? "assetBrowser.notAvailable" : "assetBrowser.loadErrorHint")}</p><button type="button" className={buttonClass} onClick={failed.reload}>{t(locale, "assetBrowser.retry")}</button></div>
        : loading ? <div role="status" className="flex min-h-72 flex-col items-center justify-center gap-4 text-sm text-[var(--mn-text-muted)]"><span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--mn-border)] border-t-[var(--mn-accent)]" /><p>{t(locale, "assetBrowser.loading")}</p></div>
        : !folders.length && !files.length ? <div className="flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[var(--mn-text-muted)]"><Icon name="folder" className="h-10 w-10 opacity-50" /><p>{t(locale, emptyMessage)}</p>{hasFilters && <button type="button" className={buttonClass} onClick={resetFilters}>{t(locale, "filter.reset")}</button>}</div>
        : <>
          {view === "list" && <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,12rem)] gap-3 border-b border-[var(--mn-border)] bg-[var(--mn-surface)] px-4 py-2 text-xs font-bold text-[var(--mn-text-muted)]"><span>{t(locale, "assetBrowser.name")}</span><span>{t(locale, "assetBrowser.bundle")}</span></div>}
          <ul aria-label={t(locale, "assetBrowser.directoryContents")} className={view === "grid" ? "grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" : "divide-y divide-[var(--mn-border)]"}>
            {folders.map((folder) => <li key={`folder:${folder.path}`} className="min-w-0"><button type="button" aria-label={folder.name} title={folder.path} onClick={() => navigate({ directory: folder.path, page: 0 })} className={`mn-focus group w-full text-left transition hover:bg-[var(--mn-accent-soft)] ${view === "grid" ? "flex h-full flex-col items-center gap-3 rounded-xl px-3 py-5 text-center" : "grid grid-cols-[minmax(0,1fr)_minmax(0,12rem)] items-center gap-3 px-4 py-3"}`}><span className="flex min-w-0 items-center gap-3"><Icon name="folder" className={`${view === "grid" ? "h-10 w-10" : "h-6 w-6"} shrink-0 text-amber-500`} /><span className="min-w-0 truncate text-sm font-medium">{folder.name}</span></span><span className="truncate text-xs text-[var(--mn-text-muted)]">—</span></button></li>)}
            {files.map((file, index) => <li key={`file:${file.bundle_id}:${file.path}:${file.path_id}:${index}`} className="min-w-0"><button type="button" aria-label={file.path} title={file.path} onClick={() => setSelection({ snapshot, file })} className={`mn-focus group w-full text-left transition hover:bg-[var(--mn-accent-soft)] ${view === "grid" ? "flex h-full flex-col items-center gap-3 rounded-xl px-3 py-5 text-center" : "grid grid-cols-[minmax(0,1fr)_minmax(0,12rem)] items-center gap-3 px-4 py-3"}`}><span className="flex min-w-0 items-center gap-3"><Icon name={fileIcon(file)} className={`${view === "grid" ? "h-10 w-10" : "h-6 w-6"} shrink-0 text-[var(--mn-accent)]`} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{query ? file.path : file.path.split("/").pop()}</span>{query && <span className="block truncate text-[10px] text-[var(--mn-text-muted)]">{file.path}</span>}</span></span><span className="truncate text-xs text-[var(--mn-text-muted)]" title={file.bundle_key}>{file.bundle_key}</span></button></li>)}
          </ul>
        </>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--mn-border)] bg-[var(--mn-surface)] px-4 py-2 text-xs text-[var(--mn-text-muted)]">
        <span aria-live="polite">{t(locale, "assetBrowser.itemCount", { count: (browse.data?.folders.length ?? 0) + fileCount })}</span>
        {fileCount > PAGE_SIZE && <nav aria-label={t(locale, "assetBrowser.pagination")} className="flex items-center gap-2"><span>{t(locale, "assetBrowser.range", { from: page * PAGE_SIZE + 1, to: Math.min((page + 1) * PAGE_SIZE, fileCount), total: fileCount })}</span><button type="button" className={buttonClass} disabled={page === 0} onClick={() => changePage(page - 1)}>{t(locale, "assetBrowser.previous")}</button><button type="button" className={buttonClass} disabled={page >= pageCount - 1} onClick={() => changePage(page + 1)}>{t(locale, "assetBrowser.next")}</button></nav>}
      </div>
    </div>
    <ContentDetails key={selection ? `${selection.file.bundle_id}:${selection.file.path}` : "none"} locale={locale} snapshot={snapshot} file={selection?.snapshot === snapshot ? selection.file : null} onClose={() => setSelection(null)} />
  </section>;
}

function ContentDetails({ locale, snapshot, file, onClose }: Props & { snapshot: string; file: BundleContent | null; onClose: () => void }) {
  const [copyState, setCopyState] = useState("copy");
  const [showContents, setShowContents] = useState(false);
  const [contentsPage, setContentsPage] = useState(0);
  const contents = useAssetBrowserQuery<BundleContentPage>(file && showContents ? assetBrowserUrl(`bundles/${encodeURIComponent(file.bundle_id)}/contents`, { snapshot, offset: contentsPage * PAGE_SIZE, limit: PAGE_SIZE }) : null);
  const rows: [string, string][] = file ? [
    [t(locale, "assetBrowser.fileKey"), file.path],
    [t(locale, "assetBrowser.bundle"), file.bundle_key],
    [t(locale, "assetBrowser.archiveId"), file.bundle_id],
    ...(file.source ? [[t(locale, "assetBrowser.containerFile"), file.source] as [string, string]] : []),
    ...(file.path_id !== null ? [[t(locale, "assetBrowser.pathId"), String(file.path_id)] as [string, string]] : []),
  ] : [];
  return <Modal isOpen={Boolean(file)} onClose={onClose} title={t(locale, "assetBrowser.fileDetails")} closeLabel={t(locale, "actions.close")} size="lg">
    <dl className="divide-y divide-[var(--mn-border)] text-xs">{rows.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"><dt className="text-[var(--mn-text-muted)]">{label}</dt><dd className="min-w-0 break-all font-mono select-text">{value}</dd></div>)}</dl>
    <button type="button" className={`${buttonClass} my-3 border border-[var(--mn-border)] text-sm`} aria-live="polite" onClick={async () => { try { await navigator.clipboard.writeText(file?.path ?? ""); setCopyState("copied"); } catch { setCopyState("copyError"); } }}>{t(locale, `assetBrowser.${copyState}`)}</button>
    <div className="border-t border-[var(--mn-border)] py-3">
      <button type="button" className={`${buttonClass} border border-[var(--mn-border)] text-sm`} aria-expanded={showContents} onClick={() => setShowContents((value) => !value)}>{t(locale, "assetBrowser.viewBundleContents")}</button>
      {showContents && <div className="mt-3 text-xs">
        {contents.status === "loading" ? <p>{t(locale, "assetBrowser.loading")}</p> : contents.status === "error" ? <p role="alert">{t(locale, "assetBrowser.loadError")}</p> : <>
          <p className="mb-2 text-[var(--mn-text-muted)]">{t(locale, "assetBrowser.range", { from: contents.data.total ? contentsPage * PAGE_SIZE + 1 : 0, to: Math.min((contentsPage + 1) * PAGE_SIZE, contents.data.total), total: contents.data.total })}</p>
          <ul className="max-h-52 divide-y divide-[var(--mn-border)] overflow-auto rounded-lg border border-[var(--mn-border)]">{contents.data.contents.map((item, index) => <li key={`${item.kind}:${item.path}:${item.path_id}:${index}`} className="flex gap-2 px-3 py-2"><span className="shrink-0 text-[var(--mn-text-muted)]">{t(locale, `assetBrowser.contentKinds.${item.kind}`)}</span><span className="min-w-0 break-all font-mono select-text">{item.path}</span></li>)}</ul>
          {contents.data.total > PAGE_SIZE && <div className="mt-2 flex gap-2"><button type="button" className={buttonClass} disabled={contentsPage === 0} onClick={() => setContentsPage((page) => page - 1)}>{t(locale, "assetBrowser.previous")}</button><button type="button" className={buttonClass} disabled={(contentsPage + 1) * PAGE_SIZE >= contents.data.total} onClick={() => setContentsPage((page) => page + 1)}>{t(locale, "assetBrowser.next")}</button></div>}
        </>}
      </div>}
    </div>
    <p className="text-xs text-[var(--mn-text-muted)]">{t(locale, "assetBrowser.previewUnavailable")}</p>
  </Modal>;
}
