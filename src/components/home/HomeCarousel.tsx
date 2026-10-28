"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import { valueForServer, type ServerFacetedValue } from "@/lib/servers/facets";
import { useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BannerImage from "@/components/shared/BannerImage";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { HomeLink, HomeSlide } from "@/lib/home/data";
import { entityLinkPath } from "@/lib/route/entity-link";
import { getRoutePathById } from "@/lib/route/registry";
import { formatScheduleRange, scheduleStatus } from "@/lib/schedule";
import { SPOILER_REFERENCE_NOW } from "@/lib/settings/spoiler-reference";
import { useNow } from "@/lib/schedule/use-now";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";

interface Props {
  locale: AppLocale;
  home: ServerFacetedValue<{ slides: HomeSlide[] }>;
  servers: GameServer[];
}

const INTERVAL_MS = 6_000;

export function homeLinkHref(link: HomeLink, locale: AppLocale): string {
  return localizePath(entityLinkPath(link), locale);
}

/** Read after mount: the server cannot know the preference, and the first client render must match it. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** The banners of the page's server, below the server switch of the home page. */
export default function HomeCarousel({ locale, home, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const { slides } = valueForServer(home, server);
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <Carousel key={server} locale={locale} slides={slides} />
    </ServerScope>
  );
}

function Carousel({ locale, slides }: { locale: AppLocale; slides: HomeSlide[] }) {
  const now = useNow();
  const timeZone = useDisplayTimeZone();
  const reduceMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);

  // Built pages drop banners that had ended at build time; the same serialized reference keeps upcoming ones out of
  // the first paint instead of rendering them until the browser clock arrives.
  const reference = now ?? SPOILER_REFERENCE_NOW;
  const visible = useMemo(() => slides.filter((slide) => {
    const status = scheduleStatus(slide.startAt, slide.endAt, reference);
    return status === "ongoing" || status === "permanent";
  }), [slides, reference]);

  const count = visible.length;
  const activeIndex = count ? index % count : 0;
  const active = visible[activeIndex];
  const autoplay = count > 1 && !paused && !interacting && !reduceMotion;

  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % count), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoplay, count, activeIndex]);

  if (!active) return <EmptyState locale={locale} />;

  const move = (step: number) => setIndex((activeIndex + step + count) % count);
  const kindLabel = t(locale, `home.kinds.${active.kind}`);
  const title = active.title || kindLabel;
  const schedule = formatScheduleRange(active.startAt, active.endAt, locale, timeZone);
  const href = active.link ? homeLinkHref(active.link, locale) : null;
  const banner = <BannerImage eager className="mn-list-caption border border-outline-variant" src={getImageAssetUrl(active.imagePath, locale)} alt={title} fallback={title} />;

  return (
    <section
      className="md3-surface p-3 sm:p-4"
      aria-roledescription="carousel"
      aria-label={t(locale, "home.carousel")}
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-6">
        <div
          role="group"
          aria-roledescription="slide"
          aria-label={t(locale, "home.slidePosition", { index: activeIndex + 1, total: count })}
          aria-live={autoplay ? "off" : "polite"}
        >
          {href ? <a href={href} className="block" tabIndex={-1} aria-hidden="true">{banner}</a> : banner}
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-outline-variant bg-surface-container px-2.5 py-1 text-label-small text-on-surface-variant">{kindLabel}</span>
            <ScheduleBadge locale={locale} startAt={active.startAt} endAt={active.endAt} now={now} />
          </div>
          <h3 className="line-clamp-3 font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">{title}</h3>
          {schedule && <p className="text-body-small tabular-nums text-on-surface-variant">{schedule}</p>}
          {href && (
            <a
              href={href}
              className="md3-button md3-button--filled w-fit"
            >
              {t(locale, active.link?.routeId === "gacha" ? "home.viewGacha" : active.link?.routeId === "main-story" ? "home.viewStory" : active.link?.routeId === "exchange" ? "home.viewExchange" : "home.viewDetail")}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
            </a>
          )}
          {count > 1 && (
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-outline-variant pt-3">
              <span className="font-mono text-label-medium tabular-nums text-on-surface-variant">{String(activeIndex + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</span>
              <div className="flex items-center gap-2">
                <IconButton label={t(locale, "home.previous")} onClick={() => move(-1)}><path d="m15 6-6 6 6 6" /></IconButton>
                {!reduceMotion && (
                  <IconButton label={t(locale, paused ? "home.play" : "home.pause")} onClick={() => setPaused((value) => !value)} pressed={paused}>
                    {paused ? <path d="M8 5.5v13l10-6.5z" /> : <path d="M9 5.5v13M15 5.5v13" />}
                  </IconButton>
                )}
                <IconButton label={t(locale, "home.next")} onClick={() => move(1)}><path d="m9 6 6 6-6 6" /></IconButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {count > 1 && (
        <ul className="no-scrollbar -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {visible.map((slide, slideIndex) => {
            const current = slideIndex === activeIndex;
            const slideTitle = slide.title || t(locale, `home.kinds.${slide.kind}`);
            return (
              <li key={slide.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setIndex(slideIndex)}
                  aria-label={t(locale, "home.showSlide", { title: slideTitle })}
                  aria-current={current ? "true" : undefined}
                  className={`mn-list-caption relative block w-28 overflow-hidden border transition sm:w-36 ${current ? "border-primary opacity-100" : "border-outline-variant opacity-60 hover:opacity-100"}`}
                >
                  <BannerImage src={getImageAssetUrl(slide.imagePath, locale)} alt="" fallback={slideTitle} />
                  {current && (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-surface-container-low/60" aria-hidden="true">
                      <span key={`${slide.id}-${autoplay}`} className={`block h-full origin-left bg-primary ${autoplay ? "mn-carousel-progress" : ""}`} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function IconButton({ label, onClick, pressed, children }: { label: string; onClick: () => void; pressed?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      className="md3-icon-button"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
    </button>
  );
}

function EmptyState({ locale }: { locale: AppLocale }) {
  return (
    <section className="md3-surface p-8 text-center sm:p-12" aria-label={t(locale, "home.carousel")}>
      <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">{t(locale, "home.noCurrentTitle")}</h3>
      <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "home.noCurrentDescription")}</p>
      <a href={localizePath(getRoutePathById("gacha"), locale)} className="md3-button md3-button--tonal mt-6">
        {t(locale, "home.viewAllGacha")}
      </a>
    </section>
  );
}
