"use client";

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
    ? "md3-button md3-button--filled md3-button--small"
    : "md3-button md3-button--filled mt-4 w-fit";
  return (
    <a href={getStoryPlayerHref(locale, advId)} className={className}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" /></svg>
      {t(locale, "storyPlayer.openInPlayer")}
    </a>
  );
}
