import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/overlay/body-scroll-lock";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { buildStaticSearchIndex } from "@/lib/search/static-index";
import { useSpringAnimation } from "@/lib/animation/use-animation";

interface CommandPaletteProps {
  locale: AppLocale;
}

const focusableSelector = "input, a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

export default function CommandPalette({ locale }: CommandPaletteProps) {
  const { isOpen, close } = useOverlay("command");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const reactId = useId();
  const lockKey = `command-${reactId}`;
  const titleId = `${lockKey}-title`;
  const inputRef = useRef<HTMLInputElement>(null);
  const activeOptionRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const items = useMemo(() => buildStaticSearchIndex(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => [t(locale, item.labelKey), item.path, ...item.keywords].some((value) => value.toLowerCase().includes(q)));
  }, [items, locale, query]);

  const { modalTransition, isDisabled } = useSpringAnimation();

  useEffect(() => {
    setActiveIndex(filtered.length > 0 ? 0 : -1);
  }, [filtered]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const raf = requestAnimationFrame(() => {
      activeOptionRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeIndex, filtered, isOpen]);

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
  const activeItem = activeIndex >= 0 ? filtered[activeIndex] : undefined;

  const navigateActive = () => {
    if (!activeItem) return;
    close();
    window.location.href = localizePath(activeItem.path, locale);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => filtered.length === 0 ? -1 : (current + 1 + filtered.length) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => filtered.length === 0 ? -1 : (current - 1 + filtered.length) % filtered.length);
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
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-bold text-[var(--mn-text-muted)]">
                  {t(locale, "shell.noCommandResults")}
                </p>
              ) : (
                filtered.map((item, index) => {
                  const active = index === activeIndex;
                  return (
                    <a
                      ref={active ? activeOptionRef : undefined}
                      id={`${lockKey}-option-${item.id}`}
                      key={item.id}
                      href={localizePath(item.path, locale)}
                      role="option"
                      aria-selected={active}
                      className={`mn-command-option block rounded-full border-2 px-5 py-3 text-sm text-[var(--mn-text)] hover:border-[var(--mn-border)] hover:bg-[var(--mn-cream-deep)] hover:shadow-[var(--mn-shadow-stamp-sm)] ${active ? "border-[var(--mn-border)] bg-[var(--mn-cream-deep)] shadow-[var(--mn-shadow-stamp-sm)]" : "border-transparent"}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={close}
                    >
                      <span className="font-black">{t(locale, item.labelKey)}</span>
                      <span className="ml-3 text-xs font-bold text-[var(--mn-text-muted)]">{item.path}</span>
                    </a>
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
