import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { buildStaticSearchIndex } from "@/lib/search/static-index";
import { useSpringAnimation } from "@/lib/animation/use-animation";

interface CommandPaletteProps {
  locale: AppLocale;
}

export default function CommandPalette({ locale }: CommandPaletteProps) {
  const { isOpen, close } = useOverlay("command");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useMemo(() => buildStaticSearchIndex(), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => [t(locale, item.labelKey), item.path, ...item.keywords].some((value) => value.toLowerCase().includes(q)));
  }, [items, locale, query]);

  const { modalTransition, isDisabled } = useSpringAnimation();

  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isOpen]);

  const panelInitial = isDisabled ? {} : { opacity: 0, scale: 0.95, y: 10 };
  const panelAnimate = { opacity: 1, scale: 1, y: 0 };
  const panelExit = isDisabled ? {} : { opacity: 0, scale: 0.95, y: 10 };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-center items-start px-4 pt-[12vh]">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={close}
          />

          {/* Panel */}
          <motion.div
            className="relative z-10 w-full max-w-2xl overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)]"
            initial={panelInitial}
            animate={panelAnimate}
            exit={panelExit}
            transition={modalTransition}
            onClick={(event) => event.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t(locale, "shell.commandPlaceholder")}
              className="w-full border-b-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-6 py-4 text-lg font-bold text-[var(--mn-text)] outline-none placeholder:text-[var(--mn-text-muted)]"
            />
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-bold text-[var(--mn-text-muted)]">
                  {t(locale, "shell.noCommandResults")}
                </p>
              ) : (
                filtered.map((item) => (
                  <a
                    key={item.id}
                    href={localizePath(item.path, locale)}
                    className="block rounded-full border-2 border-transparent px-5 py-3 text-sm text-[var(--mn-text)] hover:border-[var(--mn-border)] hover:bg-[var(--mn-cream-deep)] hover:shadow-[var(--mn-shadow-stamp-sm)]"
                    onClick={close}
                  >
                    <span className="font-black">{t(locale, item.labelKey)}</span>
                    <span className="ml-3 text-xs font-bold text-[var(--mn-text-muted)]">{item.path}</span>
                  </a>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
