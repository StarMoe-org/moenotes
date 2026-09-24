import { useEffect, useMemo, useState, type ReactNode } from "react";
import { t } from "@/i18n";
import type { AppLocale } from "@/config/locales";
import { assetConfig } from "@/config/assets";
import BaseFilters, { FilterSection } from "@/components/shared/BaseFilters";
import Modal from "@/components/shared/Modal";
import Popover from "@/components/shared/Popover";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useAssetBrowserQuery } from "@/components/tools/use-asset-browser-query";
import { AssetBrowserError, assetBrowserUrl, defaultCatalog, fetchAssetBrowser } from "@/lib/assets/browser-client";
import { getAssetBrowserPreview } from "@/lib/assets/preview";
import type { AssetCatalog, AssetRegion, BundleBrowsePage, BundleContent, BundleScanStatus } from "@/types/asset-browser";

interface Props { locale: AppLocale }
interface Location { directory: string; page: number }
type IconName =
  | "folder"
  | "folderOpen"
  | "file"
  | "image"
  | "audio"
  | "video"
  | "code"
  | "back"
  | "forward"
  | "up"
  | "refresh"
  | "list"
  | "grid"
  | "filter"
  | "home"
  | "chevronRight"
  | "chevronDown"
  | "sidebar"
  | "copy"
  | "check"
  | "search"
  | "close";

type FileCategory = "all" | "folder" | "image" | "audio" | "video" | "data";

const PAGE_SIZE = 50;
const ROOT: Location = { directory: "", page: 0 };
const buttonClass = "mn-focus rounded-lg p-2 text-[var(--mn-text-muted)] transition hover:bg-[var(--mn-accent-soft)] hover:text-[var(--mn-text)] disabled:cursor-not-allowed disabled:opacity-30";

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    folder: (
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    ),
    folderOpen: (
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    ),
    file: (
      <>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      </>
    ),
    image: (
      <>
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </>
    ),
    audio: (
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    ),
    video: (
      <>
        <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
        <rect x="2" y="6" width="14" height="12" rx="2" />
      </>
    ),
    code: (
      <>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </>
    ),
    back: <path d="m15 18-6-6 6-6" />,
    forward: <path d="m9 18 6-6-6-6" />,
    up: <path d="m18 15-6-6-6 6" />,
    refresh: (
      <>
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M21 21v-5h-5" />
      </>
    ),
    list: (
      <>
        <line x1="8" x2="21" y1="6" y2="6" />
        <line x1="8" x2="21" y1="12" y2="12" />
        <line x1="8" x2="21" y1="18" y2="18" />
        <line x1="3" x2="3.01" y1="6" y2="6" />
        <line x1="3" x2="3.01" y1="12" y2="12" />
        <line x1="3" x2="3.01" y1="18" y2="18" />
      </>
    ),
    grid: (
      <>
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </>
    ),
    filter: (
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    ),
    home: (
      <>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    ),
    chevronRight: <path d="m9 18 6-6-6-6" />,
    chevronDown: <path d="m6 9 6 6 6-6" />,
    sidebar: (
      <>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
      </>
    ),
    copy: (
      <>
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
    close: <path d="M18 6 6 18M6 6l12 12" />,
  };

  const hasWidth = /\bw-/.test(className);
  const hasHeight = /\bh-/.test(className);
  const sizeClasses = `${hasWidth ? "" : "w-4"} ${hasHeight ? "" : "h-4"}`;
  const finalClass = `${sizeClasses} shrink-0 ${className}`.trim();

  return (
    <svg
      className={finalClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function ToolButton({ icon, label, onClick, disabled = false, active = false }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      className={`${buttonClass} ${active ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={icon === "list" || icon === "grid" || icon === "sidebar" ? active : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}

function ScopeSelect({ title, value, options, onChange }: { title: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <FilterSection title={title}>
      <Popover matchTriggerWidth trigger={({ ref, onClick, ...aria }) => (
        <button ref={ref} type="button" onClick={onClick} {...aria} disabled={!options.length} aria-label={`${title}: ${options.find((option) => option.value === value)?.label ?? ""}`} className="mn-focus mn-stamp-press flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-2.5 text-left text-sm font-bold disabled:opacity-50">
          <span className="min-w-0 truncate">{options.find((option) => option.value === value)?.label ?? "—"}</span>
          <Icon name="chevronDown" className="h-4 w-4 shrink-0 text-[var(--mn-text-muted)]" />
        </button>
      )}>
        {({ close }) => (
          <div className="space-y-1" role="group" aria-label={title}>
            {options.map((option) => (
              <button key={option.value} type="button" aria-pressed={option.value === value} className={`mn-focus block w-full rounded-lg px-3 py-2 text-left text-sm ${option.value === value ? "bg-[var(--mn-accent-soft)] font-bold text-[var(--mn-accent-deep)]" : "hover:bg-[var(--mn-surface)]"}`} onClick={() => { onChange(option.value); close(); }}>
                {option.label}
              </button>
            ))}
          </div>
        )}
      </Popover>
    </FilterSection>
  );
}

function parentDirectory(path: string): string {
  return path.slice(0, Math.max(0, path.lastIndexOf("/")));
}

function getFileExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

function getFileCategory(path: string): FileCategory {
  const ext = getFileExtension(path);
  if (["png", "jpg", "jpeg", "webp", "spriteatlasv2"].includes(ext)) return "image";
  if (["acb", "awb", "hca", "aac", "ogg", "wav", "mp3"].includes(ext)) return "audio";
  if (["usm", "mp4", "webm"].includes(ext)) return "video";
  if (["json", "bytes", "txt", "xml", "csv", "yaml", "yml"].includes(ext)) return "data";
  return "data";
}

function getFileBadgeColor(category: FileCategory): string {
  switch (category) {
    case "image": return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    case "audio": return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "video": return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
    case "data": return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    default: return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
  }
}

function fileIcon(file: BundleContent): IconName {
  const cat = getFileCategory(file.path);
  if (cat === "image") return "image";
  if (cat === "audio") return "audio";
  if (cat === "video") return "video";
  return "code";
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
  const [categoryFilter, setCategoryFilter] = useState<FileCategory>("all");
  const [showTree, setShowTree] = useState(true);
  const [selectedFile, setSelectedFile] = useState<BundleContent | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Directory tree cache and expanded states
  const [treeCache, setTreeCache] = useState<Record<string, { path: string; name: string }[]>>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set(["", "Assets", "Assets/AddressableResources"]));
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(() => new Set());

  const status = useAssetBrowserQuery<BundleScanStatus>(snapshot ? assetBrowserUrl("scan/status", { snapshot }) : null, 10000);
  const browseUrl = snapshot ? assetBrowserUrl("browse", {
    snapshot,
    directory: location.directory,
    query,
    offset: location.page * PAGE_SIZE,
    limit: PAGE_SIZE,
    descending: sort === "nameDescending" ? "true" : "false",
    scan: status.data?.scanned ?? 0,
  }) : null;
  const browse = useAssetBrowserQuery<BundleBrowsePage>(browseUrl);

  // Cache folders when browse data loads for the current directory
  useEffect(() => {
    if (browse.data?.folders) {
      const dir = location.directory;
      setTreeCache((prev) => ({ ...prev, [dir]: browse.data.folders }));
    }
  }, [browse.data?.folders, location.directory]);

  // Keep subfolders from browse query or tree cache
  const subfolders = browse.data?.folders ?? treeCache[location.directory] ?? [];
  const rawFiles = browse.data?.files ?? [];

  // Filtered files by category
  const filteredFiles = useMemo(() => {
    if (categoryFilter === "all") return rawFiles;
    if (categoryFilter === "folder") return [];
    return rawFiles.filter((f) => getFileCategory(f.path) === categoryFilter);
  }, [rawFiles, categoryFilter]);

  // Filtered folders by category
  const displayedFolders = useMemo(() => {
    if (categoryFilter === "all" || categoryFilter === "folder") return subfolders;
    return [];
  }, [subfolders, categoryFilter]);

  const fileCount = browse.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(fileCount / PAGE_SIZE));
  const page = Math.min(location.page, pageCount - 1);

  // Expand parent paths in tree when directory changes
  useEffect(() => {
    if (!location.directory) return;
    const parts = location.directory.split("/").filter(Boolean);
    const pathsToExpand: string[] = [""];
    let curr = "";
    for (const part of parts) {
      curr = curr ? `${curr}/${part}` : part;
      pathsToExpand.push(curr);
    }
    setExpandedPaths((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const p of pathsToExpand) {
        if (!next.has(p)) {
          next.add(p);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [location.directory]);

  const toggleExpand = async (folderPath: string) => {
    if (expandedPaths.has(folderPath)) {
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        next.delete(folderPath);
        return next;
      });
      return;
    }

    setExpandedPaths((prev) => new Set(prev).add(folderPath));

    if (!treeCache[folderPath] && snapshot) {
      setLoadingPaths((prev) => new Set(prev).add(folderPath));
      try {
        const res = await fetchAssetBrowser<BundleBrowsePage>(
          assetBrowserUrl("browse", { snapshot, directory: folderPath, offset: 0, limit: 0 }),
          new AbortController().signal,
        );
        setTreeCache((prev) => ({ ...prev, [folderPath]: res.folders }));
      } catch {
        // non-blocking
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(folderPath);
          return next;
        });
      }
    }
  };

  const clearSearch = () => { setQuery(""); };
  const navigate = (next: Location) => {
    setNavigation({ snapshot, entries: [...history.slice(0, position + 1), next], position: position + 1 });
    clearSearch();
  };
  const changePage = (next: number) => setNavigation({ snapshot, entries: history.map((entry, i) => i === position ? { ...entry, page: next } : entry), position });
  const travel = (next: number) => { setNavigation({ snapshot, entries: history, position: next }); clearSearch(); };
  const changeScope = (next: typeof scope) => { setScope(next); setTreeCache({}); clearSearch(); };
  const resetFilters = () => { setQuery(""); setSort("default"); setCategoryFilter("all"); changePage(0); };
  const setSearch = (value: string) => { setQuery(value); changePage(0); };

  const crumbs = location.directory.split("/").filter(Boolean).map((name, index, parts) => ({
    name,
    directory: parts.slice(0, index + 1).join("/"),
  }));

  const copyCurrentPath = async () => {
    try {
      await navigator.clipboard.writeText(location.directory || "/");
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      // ignore
    }
  };

  const hasFilters = Boolean(query || sort !== "default" || categoryFilter !== "all");
  const scanIncomplete = Boolean(status.data && status.data.scanned < status.data.total);

  const filterContent = (
    <BaseFilters
      sort={{
        label: t(locale, "assetBrowser.sort"), value: sort,
        defaultOption: { value: "default", label: t(locale, "sorting.default") },
        options: [{ value: "name", reverseValue: "nameDescending", label: t(locale, "assetBrowser.name"), initialDirection: "asc" }],
        ascendingLabel: t(locale, "sorting.ascending"), descendingLabel: t(locale, "sorting.descending"),
        onChange: (value) => { setSort(value); changePage(0); },
      }}
      variant="plain"
      title={t(locale, "assetBrowser.filterTitle")}
      searchValue={query}
      onSearchChange={setSearch}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "assetBrowser.searchPlaceholder")}
      hasActiveFilters={hasFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <ScopeSelect title={t(locale, "assetBrowser.language")} value={language} options={languages.map((value) => ({ value, label: languageNames.of(value) ?? value }))} onChange={(value) => changeScope({ language: value, snapshot: "" })} />
      <ScopeSelect title={t(locale, "assetBrowser.snapshot")} value={snapshot} options={(catalogs.data ?? []).map((item) => ({ value: item.snapshot, label: `${item.version} · ${new Date(item.created * 1000).toLocaleString(locale)}${item.current ? ` · ${t(locale, "assetBrowser.current")}` : ""}` }))} onChange={(value) => changeScope({ language, snapshot: value })} />
    </BaseFilters>
  );
  useQuickFilter(t(locale, "assetBrowser.filterTitle"), filterContent, [locale, query, sort, region, language, catalog, regions.data, catalogs.data, navigation]);

  const loading = regions.status === "loading" || (Boolean(region) && catalogs.status === "loading") || (Boolean(catalog) && browse.status === "loading");
  const failed = regions.status === "error" ? regions : catalogs.status === "error" ? catalogs : catalog && browse.status === "error" ? browse : null;
  const emptyMessage = !region ? "assetBrowser.noLanguages" : !catalog ? "assetBrowser.noCatalogs" : hasFilters ? "assetBrowser.noMatches" : scanIncomplete ? status.data?.failed ? "assetBrowser.scanIncomplete" : "assetBrowser.scanPending" : "assetBrowser.emptyFolder";
  const refresh = () => { if (failed) failed.reload(); else { regions.reload(); catalogs.reload(); status.reload(); browse.reload(); } };

  return (
    <section className="min-w-0 text-[var(--mn-text)]" aria-label={t(locale, "assetBrowser.title")}>
      <div className="overflow-hidden rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-sm)]">
        {/* Top Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--mn-border)] bg-[var(--mn-surface)] px-3 py-2">
          {/* History Navigation Buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            <ToolButton icon="sidebar" label={t(locale, "assetBrowser.toggleTree")} active={showTree} onClick={() => setShowTree((v) => !v)} />
            <ToolButton icon="back" label={t(locale, "assetBrowser.back")} onClick={() => travel(position - 1)} disabled={position === 0} />
            <ToolButton icon="forward" label={t(locale, "assetBrowser.forward")} onClick={() => travel(position + 1)} disabled={position >= history.length - 1} />
            <ToolButton icon="up" label={t(locale, "assetBrowser.up")} onClick={() => navigate({ directory: parentDirectory(location.directory), page: 0 })} disabled={!location.directory} />
            <ToolButton icon="refresh" label={t(locale, "actions.refresh")} onClick={refresh} />
          </div>

          {/* Breadcrumb Single-Row Path Bar */}
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap px-2 py-0.5 text-xs no-scrollbar">
            <button
              type="button"
              className={`${buttonClass} flex shrink-0 items-center gap-1.5 px-2 py-1`}
              onClick={() => navigate(ROOT)}
            >
              <Icon name="home" />
              <span>{t(locale, "assetBrowser.root")}</span>
            </button>
            {crumbs.map((crumb, index) => (
              <span key={crumb.directory} className="flex shrink-0 items-center gap-1">
                <span aria-hidden="true" className="text-[var(--mn-text-muted)]">/</span>
                <button
                  type="button"
                  className={`${buttonClass} max-w-48 truncate px-2 py-1 ${index === crumbs.length - 1 ? "font-bold text-[var(--mn-text)] bg-[var(--mn-accent-soft)]" : ""}`}
                  title={crumb.name}
                  onClick={() => navigate({ directory: crumb.directory, page: 0 })}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
            <button
              type="button"
              className={`${buttonClass} ml-1 shrink-0 p-1.5`}
              title={t(locale, copiedPath ? "assetBrowser.copied" : "assetBrowser.copy")}
              aria-label={t(locale, copiedPath ? "assetBrowser.copied" : "assetBrowser.copy")}
              onClick={copyCurrentPath}
            >
              <Icon name={copiedPath ? "check" : "copy"} className={copiedPath ? "text-emerald-500" : ""} />
            </button>
          </div>

          {/* Search & Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="relative">
              <input
                type="search"
                value={query}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(locale, "assetBrowser.searchPlaceholder")}
                className="mn-focus w-36 rounded-lg border border-[var(--mn-border)] bg-[var(--mn-paper)] py-1.5 pl-8 pr-3 text-xs placeholder:text-[var(--mn-text-muted)] sm:w-48"
              />
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--mn-text-muted)]">
                <Icon name="search" className="h-3.5 w-3.5" />
              </span>
              {query && (
                <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]" aria-label={t(locale, "assetBrowser.clear")}>
                  <Icon name="close" className="h-3 w-3" />
                </button>
              )}
            </div>
            <ToolButton
              icon={view === "list" ? "grid" : "list"}
              label={t(locale, view === "list" ? "assetBrowser.grid" : "assetBrowser.list")}
              onClick={() => setView((v) => (v === "list" ? "grid" : "list"))}
            />
          </div>
        </div>

        {/* Sub-bar: Language & Scan Status */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--mn-border)] px-4 py-2 text-xs text-[var(--mn-text-muted)]">
          <span className="flex items-center gap-2">
            <span>{language ? languageNames.of(language) ?? language : ""}</span>
            {catalog && <span>· {catalog.version} ({new Date(catalog.created * 1000).toLocaleDateString(locale)})</span>}
          </span>
          {status.data && (
            <span role="status">
              {t(locale, "assetBrowser.scanProgress", { scanned: status.data.scanned, total: status.data.total })}
              {status.data.failed > 0 && ` · ${t(locale, "assetBrowser.scanFailed", { count: status.data.failed })}`}
            </span>
          )}
        </div>

        {/* Main Workspace: Directory Tree + Unified Content Explorer + Right Preview Pane */}
        <div className="flex min-h-[38rem] flex-col md:flex-row">
          {/* Left: Directory Tree Sidebar */}
          {showTree && (
            <aside className="w-full shrink-0 border-b border-[var(--mn-border)] bg-[var(--mn-surface)] md:w-64 md:border-b-0 md:border-r lg:w-72" aria-label={t(locale, "assetBrowser.directoryTree")}>
              <div className="flex items-center justify-between border-b border-[var(--mn-border)] px-3 py-2 text-xs font-bold text-[var(--mn-text-muted)]">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Icon name="folder" className="text-amber-500" />
                  <span>{t(locale, "assetBrowser.directoryTree")}</span>
                </span>
                <button type="button" onClick={() => navigate(ROOT)} className="shrink-0 text-[11px] font-normal hover:text-[var(--mn-accent)]">
                  {t(locale, "assetBrowser.root")}
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto p-2 text-xs md:max-h-[36rem]">
                <TreeNode
                  name={t(locale, "assetBrowser.root")}
                  path=""
                  currentDirectory={location.directory}
                  treeCache={treeCache}
                  expandedPaths={expandedPaths}
                  loadingPaths={loadingPaths}
                  onToggleExpand={toggleExpand}
                  onSelect={(dir) => navigate({ directory: dir, page: 0 })}
                  depth={0}
                />
              </div>
            </aside>
          )}

          {/* Center: Unified Vertical Explorer (Folders + Files) */}
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Category Filter Chips */}
            <div className="flex items-center justify-between gap-3 border-b border-[var(--mn-border)] bg-[var(--mn-surface)] px-4 py-2 text-xs overflow-x-auto">
              <div className="flex items-center gap-1.5 shrink-0 text-[11px]" role="group" aria-label={t(locale, "assetBrowser.files")}>
                {(["all", "folder", "image", "audio", "video", "data"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`mn-focus whitespace-nowrap rounded-full px-2.5 py-1 font-medium transition ${categoryFilter === cat ? "bg-[var(--mn-accent)] text-white shadow-xs" : "border border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"}`}
                  >
                    {t(locale, `assetBrowser.kinds.${cat === "data" ? "text" : cat}`)}
                    {cat === "all" ? ` (${subfolders.length + fileCount})` : cat === "folder" ? ` (${subfolders.length})` : ""}
                  </button>
                ))}
              </div>
              <span className="shrink-0 text-[11px] text-[var(--mn-text-muted)]">
                {subfolders.length > 0 && `${subfolders.length} ${t(locale, "assetBrowser.folders")} · `}
                {fileCount} {t(locale, "assetBrowser.files")}
              </span>
            </div>

            {failed ? (
              <div role="alert" className="my-auto space-y-3 p-12 text-center">
                <p className="font-bold">{t(locale, "assetBrowser.loadError")}</p>
                <p className="text-sm text-[var(--mn-text-muted)]">{t(locale, failed.error instanceof AssetBrowserError && failed.error.status === 404 ? "assetBrowser.notAvailable" : "assetBrowser.loadErrorHint")}</p>
                <button type="button" className={`${buttonClass} border border-[var(--mn-border)]`} onClick={failed.reload}>{t(locale, "assetBrowser.retry")}</button>
              </div>
            ) : loading ? (
              <div role="status" className="my-auto flex min-h-72 flex-col items-center justify-center gap-4 text-sm text-[var(--mn-text-muted)]">
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-[var(--mn-border)] border-t-[var(--mn-accent)]" />
                <p>{t(locale, "assetBrowser.loading")}</p>
              </div>
            ) : !displayedFolders.length && !filteredFiles.length ? (
              <div className="my-auto flex min-h-72 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[var(--mn-text-muted)]">
                <Icon name="folder" className="h-10 w-10 text-amber-500 opacity-40" />
                <p>{t(locale, emptyMessage)}</p>
                {hasFilters && <button type="button" className={`${buttonClass} border border-[var(--mn-border)]`} onClick={resetFilters}>{t(locale, "filter.reset")}</button>}
              </div>
            ) : view === "list" ? (
              /* Single Unified Table: Subfolders + Files together vertically */
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-[var(--mn-border)] bg-[var(--mn-surface)] text-[var(--mn-text-muted)]">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-bold">{t(locale, "assetBrowser.name")}</th>
                      <th scope="col" className="w-28 px-4 py-2.5 font-bold text-right">{t(locale, "assetBrowser.resourceType")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--mn-border)]">
                    {/* Subfolders rows */}
                    {displayedFolders.map((folder) => (
                      <tr
                        key={`folder:${folder.path}`}
                        className="group cursor-pointer transition hover:bg-[var(--mn-accent-soft)]"
                        onClick={() => navigate({ directory: folder.path, page: 0 })}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 transition group-hover:scale-110">
                              <Icon name="folder" className="h-5 w-5" />
                            </span>
                            <span className="font-semibold text-sm text-[var(--mn-text)] group-hover:text-[var(--mn-accent)]">
                              {folder.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            {t(locale, "assetBrowser.kinds.folder")}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {/* File rows with Image Thumbnails */}
                    {filteredFiles.map((file, index) => {
                      const ext = getFileExtension(file.path).toUpperCase();
                      const category = getFileCategory(file.path);
                      const preview = getAssetBrowserPreview(file.path, locale);
                      const fileName = query ? file.path : (file.path.split("/").pop() || file.path);

                      return (
                        <tr
                          key={`file:${file.bundle_id}:${file.path}:${file.path_id}:${index}`}
                          className="group cursor-pointer transition hover:bg-[var(--mn-surface)]"
                          onClick={() => {
                            setSelectedFile(file);
                            setShowModal(true);
                          }}
                        >
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              {/* Live Image Thumbnail Preview or Category Icon */}
                              {preview?.type === "image" ? (
                                <img
                                  src={preview.url}
                                  alt={fileName}
                                  loading="lazy"
                                  className="h-10 w-10 shrink-0 rounded-lg border border-[var(--mn-border)] bg-[var(--mn-paper)] object-contain shadow-xs transition group-hover:scale-105"
                                />
                              ) : (
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-accent)]">
                                  <Icon name={fileIcon(file)} className="h-5 w-5" />
                                </span>
                              )}
                              <div className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-xs text-[var(--mn-text)] group-hover:text-[var(--mn-accent)]">
                                  {fileName}
                                </span>
                                {query && <span className="block truncate text-[10px] text-[var(--mn-text-muted)]">{file.path}</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${getFileBadgeColor(category)}`}>
                              {ext || file.kind}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Grid View: Folders + Files as Cards */
              <div className="flex-1 p-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {/* Folders cards */}
                  {displayedFolders.map((folder) => (
                    <button
                      key={`folder:${folder.path}`}
                      type="button"
                      onClick={() => navigate({ directory: folder.path, page: 0 })}
                      className="mn-focus group flex flex-col items-center justify-center rounded-xl border border-[var(--mn-border)] bg-[var(--mn-surface)] p-4 text-center transition hover:border-[var(--mn-accent)] hover:bg-[var(--mn-accent-soft)]"
                    >
                      <Icon name="folder" className="mb-2 h-10 w-10 text-amber-500 transition group-hover:scale-110" />
                      <span className="w-full truncate text-xs font-semibold">{folder.name}</span>
                      <span className="text-[10px] text-[var(--mn-text-muted)]">{t(locale, "assetBrowser.kinds.folder")}</span>
                    </button>
                  ))}

                  {/* Files cards with thumbnails */}
                  {filteredFiles.map((file, index) => {
                    const ext = getFileExtension(file.path).toUpperCase();
                    const category = getFileCategory(file.path);
                    const preview = getAssetBrowserPreview(file.path, locale);
                    const fileName = file.path.split("/").pop() || file.path;

                    return (
                      <button
                        key={`file:${file.bundle_id}:${file.path}:${file.path_id}:${index}`}
                        type="button"
                        onClick={() => {
                          setSelectedFile(file);
                          setShowModal(true);
                        }}
                        className="mn-focus group flex flex-col justify-between rounded-xl border border-[var(--mn-border)] bg-[var(--mn-surface)] p-3 text-left transition hover:border-[var(--mn-accent)] hover:shadow-xs"
                      >
                        <div className="mb-2 flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--mn-paper)]">
                          {preview?.type === "image" ? (
                            <img src={preview.url} alt={fileName} loading="lazy" className="h-full w-full object-contain transition group-hover:scale-105" />
                          ) : (
                            <Icon name={fileIcon(file)} className="h-9 w-9 text-[var(--mn-accent)] opacity-80" />
                          )}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <span className="block truncate text-xs font-medium group-hover:text-[var(--mn-accent)]">
                            {fileName}
                          </span>
                          <span className={`inline-block rounded px-1.5 py-0.5 border font-mono text-[9px] font-bold ${getFileBadgeColor(category)}`}>
                            {ext || file.kind}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom Pagination Bar */}
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--mn-border)] bg-[var(--mn-surface)] px-4 py-2 text-xs text-[var(--mn-text-muted)]">
              <span aria-live="polite">
                {t(locale, "assetBrowser.itemCount", { count: subfolders.length + fileCount })}
              </span>
              {fileCount > PAGE_SIZE && (
                <nav aria-label={t(locale, "assetBrowser.pagination")} className="flex items-center gap-2">
                  <span>{t(locale, "assetBrowser.range", { from: page * PAGE_SIZE + 1, to: Math.min((page + 1) * PAGE_SIZE, fileCount), total: fileCount })}</span>
                  <button type="button" className={buttonClass} disabled={page === 0} onClick={() => changePage(page - 1)}>{t(locale, "assetBrowser.previous")}</button>
                  <button type="button" className={buttonClass} disabled={page >= pageCount - 1} onClick={() => changePage(page + 1)}>{t(locale, "assetBrowser.next")}</button>
                </nav>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* File Inspector Modal (for mobile or detailed view) */}
      <ContentDetails
        isOpen={showModal}
        locale={locale}
        file={selectedFile}
        onClose={() => setShowModal(false)}
      />
    </section>
  );
}

/** Directory tree recursive node component */
function TreeNode({
  name,
  path,
  currentDirectory,
  treeCache,
  expandedPaths,
  loadingPaths,
  onToggleExpand,
  onSelect,
  depth,
}: {
  name: string;
  path: string;
  currentDirectory: string;
  treeCache: Record<string, { path: string; name: string }[]>;
  expandedPaths: Set<string>;
  loadingPaths: Set<string>;
  onToggleExpand: (path: string) => void;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const isExpanded = expandedPaths.has(path);
  const isLoading = loadingPaths.has(path);
  const isActive = currentDirectory === path;
  const children = treeCache[path];

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-lg px-2 py-1 transition ${isActive ? "bg-[var(--mn-accent-soft)] font-bold text-[var(--mn-accent-deep)]" : "hover:bg-[var(--mn-paper)]"}`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        <button
          type="button"
          onClick={() => onToggleExpand(path)}
          className="mn-focus flex h-4 w-4 shrink-0 items-center justify-center text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isLoading ? (
            <span className="h-2.5 w-2.5 animate-spin rounded-full border border-[var(--mn-border)] border-t-[var(--mn-accent)]" />
          ) : (
            <Icon name={isExpanded ? "chevronDown" : "chevronRight"} className="h-3 w-3" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelect(path)}
          className="mn-focus flex min-w-0 flex-1 items-center gap-1.5 truncate text-left"
          title={name}
        >
          <Icon name={isExpanded ? "folderOpen" : "folder"} className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="truncate">{name}</span>
        </button>
      </div>

      {isExpanded && children && (
        <div className="space-y-0.5">
          {children.map((child) => (
            <TreeNode
              key={child.path}
              name={child.name}
              path={child.path}
              currentDirectory={currentDirectory}
              treeCache={treeCache}
              expandedPaths={expandedPaths}
              loadingPaths={loadingPaths}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** File details & inspector modal */
function ContentDetails({
  isOpen,
  locale,
  file,
  onClose,
}: Props & { isOpen: boolean; file: BundleContent | null; onClose: () => void }) {
  const [copyPathState, setCopyPathState] = useState(false);
  const preview = file ? getAssetBrowserPreview(file.path, locale) : null;

  const copyPath = async () => {
    if (!file) return;
    try {
      await navigator.clipboard.writeText(file.path);
      setCopyPathState(true);
      setTimeout(() => setCopyPathState(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <Modal isOpen={isOpen && Boolean(file)} onClose={onClose} title={t(locale, "assetBrowser.fileDetails")} closeLabel={t(locale, "actions.close")} size="lg">
      {file && (
        <div className="space-y-4">
          {/* Large Preview */}
          <div className="rounded-xl border border-[var(--mn-border)] bg-[var(--mn-surface)] p-4 text-center">
            {preview?.type === "image" ? (
              <div className="space-y-2">
                <img src={preview.url} alt={file.path} className="max-h-80 max-w-full rounded-lg object-contain mx-auto shadow-sm" />
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-xs font-semibold text-[var(--mn-accent)] hover:underline"
                >
                  {t(locale, "assetBrowser.openImage")} ↗
                </a>
              </div>
            ) : preview?.type === "audio" ? (
              <audio controls src={preview.url} className="w-full" />
            ) : (
              <div className="flex items-center gap-3 py-4">
                <Icon name={fileIcon(file)} className="h-8 w-8 text-[var(--mn-accent)] shrink-0" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate font-bold text-sm">{file.path.split("/").pop()}</p>
                  <p className="truncate text-xs text-[var(--mn-text-muted)]">{file.path}</p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Copy Path */}
          <div>
            <button
              type="button"
              className={`${buttonClass} w-full border border-[var(--mn-border)] text-xs flex items-center justify-center gap-1.5 py-2`}
              onClick={copyPath}
            >
              <Icon name={copyPathState ? "check" : "copy"} className={copyPathState ? "text-emerald-500" : ""} />
              <span>{t(locale, copyPathState ? "assetBrowser.copied" : "assetBrowser.copy")}</span>
            </button>
          </div>

          {/* Clean Property List (No technical IDs) */}
          <dl className="divide-y divide-[var(--mn-border)] rounded-xl border border-[var(--mn-border)] bg-[var(--mn-surface)] px-3 text-xs">
            <div className="grid gap-1 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-[var(--mn-text-muted)]">{t(locale, "assetBrowser.fileKey")}</dt>
              <dd className="min-w-0 break-all font-mono select-text">{file.path}</dd>
            </div>
            <div className="grid gap-1 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
              <dt className="text-[var(--mn-text-muted)]">{t(locale, "assetBrowser.resourceType")}</dt>
              <dd className="min-w-0 font-medium">{getFileExtension(file.path).toUpperCase() || file.kind}</dd>
            </div>
          </dl>
        </div>
      )}
    </Modal>
  );
}
