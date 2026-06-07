import { useEffect, useMemo, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { buildStaticSearchIndex } from "@/lib/search/static-index";

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

  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-start bg-black/35 px-4 pt-[12vh] backdrop-blur-[2px]" onClick={close}>
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-lg)]" onClick={(event) => event.stopPropagation()}>
        <input ref={inputRef} value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={t(locale, "shell.commandPlaceholder")} className="w-full border-b-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface-strong)] px-6 py-4 text-lg font-bold text-[var(--mn-text)] outline-none placeholder:text-[var(--mn-text-muted)]" />
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? <p className="px-4 py-8 text-center text-sm font-bold text-[var(--mn-text-muted)]">{t(locale, "shell.noCommandResults")}</p> : filtered.map((item) => (
            <a key={item.id} href={localizePath(item.path, locale)} className="block rounded-full border-2 border-transparent px-5 py-3 text-sm text-[var(--mn-text)] hover:border-[var(--mn-border)] hover:bg-[var(--mn-cream-deep)] hover:shadow-[var(--mn-shadow-stamp-sm)]" onClick={close}>
              <span className="font-black">{t(locale, item.labelKey)}</span>
              <span className="ml-3 text-xs font-bold text-[var(--mn-text-muted)]">{item.path}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
