"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Icon } from "@/components/shared/icons";
import { withMd3 } from "@/components/md3/Md3Provider";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useOverlayLayer } from "@/lib/overlay/use-overlay-layer";
import { buildStaticSearchIndex } from "@/lib/search/static-index";
import { searchContent } from "@/lib/search/client";
import { CONTENT_KIND_ORDER, KIND_LABEL_KEY } from "@/lib/search/kinds";
import { getRoutePathById } from "@/lib/route/registry";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";

interface CommandPaletteProps {
  locale: AppLocale;
}

/** One flat list row: a static page or a content entity, both ready to navigate to. */
interface PaletteRow {
  id: string;
  /** "page" or a content kind (card/music/story/…); drives the group label. */
  kind: string;
  label: string;
  href: `/${string}`;
}

/**
 * Search everything (Ctrl/⌘ K): a Material 3 search view in a dialog, full screen on phones. The input is a combobox
 * driving a grouped listbox; arrows move, Enter opens, Escape closes.
 */
function CommandPalette({ locale }: CommandPaletteProps) {
  const { isOpen, close } = useOverlay("command");
  const { showSpoiler, now } = useSpoilerSetting();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [content, setContent] = useState<PaletteRow[]>([]);
  const reactId = useId();
  const baseId = `command-${reactId}`;
  const titleId = `${baseId}-title`;
  const inputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLAnchorElement>(null);
  const fullScreen = useMediaQuery("(max-width: 599.95px)");
  const isTop = useOverlayLayer(baseId, isOpen, close, false);

  const staticRows = useMemo<PaletteRow[]>(() =>
    buildStaticSearchIndex().map((item) => ({ id: item.id, kind: "page", label: t(locale, item.labelKey), href: localizePath(item.path, locale) })), [locale]);

  const q = query.trim().toLocaleLowerCase();

  // Static pages filter instantly; content rows resolve from /search-index.json as the query changes.
  const filteredStatic = useMemo(() => {
    if (!q) return staticRows;
    return staticRows.filter((row) => [row.label, row.href].some((value) => value.toLocaleLowerCase().includes(q)));
  }, [staticRows, q]);

  useEffect(() => {
    let cancelled = false;
    void searchContent(query, locale).then((results) => {
      if (cancelled) return;
      const filtered = !showSpoiler && now !== null
        ? results.filter((result) => !isSpoiler(result.startAt, now))
        : results;
      setContent(filtered.map((result) => ({ id: result.key, kind: result.kind, label: result.title, href: result.href })));
    });
    return () => { cancelled = true; };
  }, [query, locale, showSpoiler, now]);

  // Group content rows by kind, ordered; pages form their own leading group.
  const groups = useMemo(() => {
    const out: Array<{ kind: string; labelKey: string | null; rows: PaletteRow[] }> = [];
    if (filteredStatic.length > 0) out.push({ kind: "page", labelKey: q ? "search.kinds.page" : null, rows: filteredStatic });
    if (!q) return out;
    for (const kind of CONTENT_KIND_ORDER) {
      const rows = content.filter((row) => row.kind === kind);
      if (rows.length > 0) out.push({ kind, labelKey: KIND_LABEL_KEY[kind] ?? null, rows });
    }
    return out;
  }, [filteredStatic, content, q]);

  const flat = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

  useEffect(() => {
    setActiveIndex(flat.length > 0 ? 0 : -1);
  }, [flat]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const raf = requestAnimationFrame(() => activeOptionRef.current?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(raf);
  }, [activeIndex, flat, isOpen]);

  const activeItem = activeIndex >= 0 ? flat[activeIndex] : undefined;
  const searchPagePath = localizePath(getRoutePathById("search"), locale);

  const navigateActive = () => {
    // With a query but no highlighted row, go to the full search page instead of dead-ending.
    if (!activeItem) {
      if (q) {
        close();
        window.location.href = `${searchPagePath}?q=${encodeURIComponent(query.trim())}`;
      }
      return;
    }
    close();
    window.location.href = activeItem.href;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => flat.length === 0 ? -1 : (current + 1 + flat.length) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => flat.length === 0 ? -1 : (current - 1 + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      navigateActive();
    }
  };

  let rowOffset = 0;

  return (
    <Dialog
      open={isOpen}
      onClose={(_, reason) => {
        if (reason === "escapeKeyDown" && !isTop()) return;
        close();
      }}
      fullWidth
      maxWidth="sm"
      fullScreen={fullScreen}
      aria-labelledby={titleId}
      slotProps={{
        paper: { sx: { alignSelf: { sm: "flex-start" }, mt: { sm: "12vh" }, maxHeight: { sm: "70vh" } } },
        transition: { onEntered: () => inputRef.current?.focus({ preventScroll: true }) },
      }}
    >
      <h2 id={titleId} className="sr-only">{t(locale, "shell.openCommandPalette")}</h2>
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-outline-variant pl-4 pr-2 sm:h-16">
        <Icon name="search" className="h-6 w-6 shrink-0 text-on-surface-variant" />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder={t(locale, "shell.commandPlaceholder")}
          aria-label={t(locale, "shell.commandPlaceholder")}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-body-large text-on-surface outline-none placeholder:text-on-surface-variant"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={`${baseId}-listbox`}
          aria-activedescendant={activeItem ? `${baseId}-option-${activeItem.id}` : undefined}
        />
        <IconButton aria-label={t(locale, "actions.close")} onClick={close}>
          <Icon name="close" />
        </IconButton>
      </div>
      <div id={`${baseId}-listbox`} className="min-h-0 flex-1 overflow-y-auto py-2" role="listbox" aria-label={t(locale, "shell.commandPlaceholder")}>
        {flat.length === 0 ? (
          q ? (
            <a href={`${searchPagePath}?q=${encodeURIComponent(query.trim())}`} className="md3-state mx-2 flex h-14 items-center gap-4 rounded-full px-4 text-label-large text-primary" onClick={close}>
              <Icon name="arrowForward" />
              {t(locale, "search.viewAllResults")}
            </a>
          ) : (
            <p className="px-6 py-10 text-center text-body-medium text-on-surface-variant">{t(locale, "shell.noCommandResults")}</p>
          )
        ) : (
          groups.map((group) => {
            const start = rowOffset;
            rowOffset += group.rows.length;
            return (
              <div key={group.kind} role="group" aria-label={group.labelKey ? t(locale, group.labelKey) : undefined}>
                {group.labelKey ? <p className="px-6 pb-1 pt-3 text-title-small text-on-surface-variant">{t(locale, group.labelKey)}</p> : null}
                {group.rows.map((item, index) => {
                  const flatIndex = start + index;
                  const active = flatIndex === activeIndex;
                  return (
                    <a
                      ref={active ? activeOptionRef : undefined}
                      id={`${baseId}-option-${item.id}`}
                      key={item.id}
                      href={item.href}
                      role="option"
                      aria-selected={active}
                      className={`mn-command-option md3-state mx-2 flex min-h-14 items-center gap-4 rounded-full px-4 py-2 ${active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface"}`}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      onClick={close}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-large">{item.label}</span>
                        <span className={`block truncate text-body-small ${active ? "text-on-secondary-container" : "text-on-surface-variant"}`}>{item.href}</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </Dialog>
  );
}

export default withMd3(CommandPalette);
