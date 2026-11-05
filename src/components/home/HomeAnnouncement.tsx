"use client";

import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { siteConfig } from "@/config/site";
import { Icon } from "@/components/shared/icons";
import { t } from "@/i18n";

interface HomeAnnouncementProps {
  locale: AppLocale;
}

const PERK_KEYS = ["server", "workflow", "domain", "guidance"] as const;

export default function HomeAnnouncement({ locale }: HomeAnnouncementProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const email = siteConfig.contact.email;
  const domain = new URL(siteConfig.baseUrl).host;
  const subject = t(locale, "home.announcement.emailSubject");
  const mailtoHref = `mailto:${email}?subject=${encodeURIComponent(subject)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2400);
    } catch {
      // Fallback: open mail client if clipboard access is blocked
      window.location.href = mailtoHref;
    }
  };

  return (
    <section
      aria-labelledby="home-announcement-title"
      className="md3-surface mb-6 overflow-hidden rounded-shape-xl border border-primary/25 bg-surface-container p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-container px-3 py-1 text-label-medium font-semibold text-on-primary-container">
          <svg
            className="h-4 w-4 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m3 11 18-5v12L3 14v-3Z" />
            <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
          </svg>
          {t(locale, "home.announcement.badge")}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container px-3 py-1 text-label-medium font-medium text-on-secondary-container">
          <Icon name="search" className="h-3.5 w-3.5 shrink-0" />
          {t(locale, "home.announcement.seoHighlight")}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-high px-3 py-1 text-label-medium font-medium text-on-surface">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          {t(locale, "home.announcement.validityBadge")}
        </span>
      </div>

      <h2
        id="home-announcement-title"
        className="mt-3 font-[var(--md-ref-typeface-brand)] text-title-large text-on-surface sm:text-headline-small"
      >
        {t(locale, "home.announcement.title", { author: siteConfig.author, site: siteConfig.name })}
      </h2>

      <div className="mt-2.5 space-y-2 text-body-medium leading-relaxed text-on-surface-variant">
        <p>{t(locale, "home.announcement.reason", { author: siteConfig.author, site: siteConfig.name })}</p>
        <p>{t(locale, "home.announcement.supportIntro", { author: siteConfig.author, site: siteConfig.name })}</p>
      </div>

      <ul className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {PERK_KEYS.map((key) => (
          <li
            key={key}
            className="flex items-center gap-2 rounded-shape-md border border-outline-variant/60 bg-surface-container-low px-3 py-2 text-label-large text-on-surface"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary-container text-on-primary-container">
              <Icon name="check" className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">{t(locale, `home.announcement.perks.${key}`, { domain })}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3.5 rounded-shape-md border border-primary/20 bg-primary-container/35 px-3.5 py-2.5 text-body-medium leading-relaxed text-on-surface">
        <p className="font-medium">{t(locale, "home.announcement.openToAll")}</p>
        <p className="mt-0.5 text-body-small text-on-surface-variant">{t(locale, "home.announcement.validityNote")}</p>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-outline-variant/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-medium text-on-surface">
          <span>{t(locale, "home.announcement.contactPrompt")}</span>
          <a
            href={mailtoHref}
            className="font-mono font-semibold text-primary underline-offset-4 hover:underline"
          >
            {email}
          </a>
        </p>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a href={mailtoHref} className="md3-button md3-button--filled">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            {t(locale, "home.announcement.emailCta")}
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="md3-button md3-button--outlined"
          >
            {copied ? (
              <Icon name="check" className="h-[18px] w-[18px]" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            {t(locale, copied ? "home.announcement.copiedEmail" : "home.announcement.copyEmail")}
          </button>
        </div>
      </div>
    </section>
  );
}
