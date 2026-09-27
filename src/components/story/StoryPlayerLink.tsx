import { useEffect, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { hasSiteStory } from "@/lib/story/player-client";
import { getStoryPlayerHref } from "@/lib/story/player-data";

/**
 * The story player's link for an episode, shown once the story site is known to have it (a HEAD of its manifest).
 * `button` on a story page's header; `compact` among a dialog's header actions.
 */
export default function StoryPlayerLink({ locale, advId, variant = "button" }: { locale: AppLocale; advId: number; variant?: "button" | "compact" }) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setAvailable(false);
    void hasSiteStory(advId, controller.signal).then((found) => {
      if (!controller.signal.aborted) setAvailable(found);
    });
    return () => controller.abort();
  }, [advId]);
  if (!available) return null;
  const className = variant === "compact"
    ? "mn-focus inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[var(--mn-accent)] px-3 text-xs font-bold text-white shadow-[var(--mn-shadow-stamp-sm)] hover:bg-[var(--mn-accent-deep)]"
    : "mn-focus mn-stamp-press mt-4 inline-flex w-fit items-center gap-2 rounded-full bg-[var(--mn-accent)] px-5 py-2 text-sm font-bold text-white shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-accent-deep)]";
  return (
    <a href={getStoryPlayerHref(locale, advId)} className={className}>
      <svg className={variant === "compact" ? "h-3.5 w-3.5" : "h-4 w-4"} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" /></svg>
      {t(locale, "storyPlayer.openInPlayer")}
    </a>
  );
}
