import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { buildStaticSearchIndex } from "@/lib/search/static-index";
import { searchContent } from "@/lib/search/client";
import { CONTENT_KIND_ORDER, KIND_LABEL_KEY } from "@/lib/search/kinds";
import { getRoutePathById } from "@/lib/route/registry";
import { useSpringAnimation } from "@/lib/animation/use-animation";

interface CommandPaletteProps {
  locale: AppLocale;
}

const focusableSelector = "input, a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** One flat list row: a static page or a content entity, both ready to navigate to. */
interface PaletteRow {
  id: string;
  /** "page" or a content kind (card/music/story/…); drives the group label. */
  kind: string;
  label: string;
  href: `/${string}`;
}

export default function CommandPalette({ locale }: CommandPaletteProps) {
  const { isOpen, close } = useOverlay("command");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [content, setContent] = useState<PaletteRow[]>([]);
  const reactId = useId();
  const lockKey = `command-${reactId}`;
  const titleId = `${lockKey}-title`;
  const inputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const staticRows = useMemo<PaletteRow[]>(() =>
    buildStaticSearchIndex().map((item) => ({
      id: item.id,
      kind: "page",
      label: t(locale, item.labelKey),
      href: localizePath(item.path, locale),
    })), [locale]);

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
      setContent(results.map((result) => ({ id: result.key, kind: result.kind, label: result.title, href: result.href })));
    });
    return () => { cancelled = true; };
  }, [query, locale]);

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

  const { modalTransition, isDisabled } = useSpringAnimation();

  useEffect(() => {
    setActiveIndex(flat.length > 0 ? 0 : -1);
  }, [flat]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const raf = requestAnimationFrame(() => {
      activeOptionRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeIndex, flat, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    lockBodyScroll(lockKey);
    const raf = requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(raf);
      unlockBodyScroll(lockKey);
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget && document.contains(restoreTarget)) {
        requestAnimationFrame(() => restoreTarget.focus({ preventScroll: true }));
      }
    };
  }, [isOpen, lockKey]);

  const panelInitial = isDisabled ? {} : { opacity: 0, scale: 0.95, y: 10 };
  const panelAnimate = { opacity: 1, scale: 1, y: 0 };
  const panelExit = isDisabled ? {} : { opacity: 0, scale: 0.95, y: 10 };
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

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      trapFocus(event.nativeEvent, panelRef.current);
    }
  };

  let rowOffset = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-center items-start px-4 pt-[12vh]">
          <motion.div
            className="absolute inset-0 mn-overlay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
          />

          <motion.div
            ref={panelRef}
            className="mn-overlay-panel relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)]"
            initial={panelInitial}
            animate={panelAnimate}
            exit={panelExit}
            transition={modalTransition}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <h2 id={titleId} className="sr-only">{t(locale, "shell.openCommandPalette")}</h2>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t(locale, "shell.commandPlaceholder")}
              aria-label={t(locale, "shell.commandPlaceholder")}
              className="w-full border-b-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-6 py-4 text-lg font-bold text-[var(--mn-text)] outline-none placeholder:text-[var(--mn-text-muted)]"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={`${lockKey}-listbox`}
              aria-activedescendant={activeItem ? `${lockKey}-option-${activeItem.id}` : undefined}
            />
            <div id={`${lockKey}-listbox`} className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
              {flat.length === 0 ? (
                q ? (
                  <a
                    href={`${searchPagePath}?q=${encodeURIComponent(query.trim())}`}
                    className="mn-command-option block rounded-full border-2 border-transparent px-5 py-3 text-sm text-[var(--mn-text)]"
                    onClick={close}
                  >
                    {t(locale, "search.viewAllResults")}
                  </a>
                ) : (
                  <p className="px-4 py-8 text-center text-sm font-bold text-[var(--mn-text-muted)]">
                    {t(locale, "shell.noCommandResults")}
                  </p>
                )
              ) : (
                groups.map((group) => {
                  const start = rowOffset;
                  rowOffset += group.rows.length;
                  return (
                    <div key={group.kind}>
                      {group.labelKey ? (
                        <p className="px-5 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-[var(--mn-text-muted)] first:pt-1">
                          {t(locale, group.labelKey)}
                        </p>
                      ) : null}
                      {group.rows.map((item, index) => {
                        const flatIndex = start + index;
                        const active = flatIndex === activeIndex;
                        return (
                          <a
                            ref={active ? activeOptionRef : undefined}
                            id={`${lockKey}-option-${item.id}`}
                            key={item.id}
                            href={item.href}
                            role="option"
                            aria-selected={active}
                            className={`mn-command-option block rounded-full border-2 px-5 py-3 text-sm text-[var(--mn-text)] hover:border-[var(--mn-border)] hover:bg-[var(--mn-cream-deep)] hover:shadow-[var(--mn-shadow-stamp-sm)] ${active ? "border-[var(--mn-border)] bg-[var(--mn-cream-deep)] shadow-[var(--mn-shadow-stamp-sm)]" : "border-transparent"}`}
                            onMouseEnter={() => setActiveIndex(flatIndex)}
                            onClick={close}
                          >
                            <span className="font-black">{item.label}</span>
                            <span className="ml-3 text-xs font-bold text-[var(--mn-text-muted)]">{item.href}</span>
                          </a>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
}

function trapFocus(event: globalThis.KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) return;
  const focusable = getFocusableElements(panel);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}
