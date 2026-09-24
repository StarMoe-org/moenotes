import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BannerImage from "@/components/shared/BannerImage";
import ScheduleBadge from "@/components/shared/ScheduleBadge";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { HomeLink, HomeSlide } from "@/lib/home/data";
import { getRoutePathById } from "@/lib/route/registry";
import { formatScheduleRange, scheduleStatus } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";

interface Props {
  locale: AppLocale;
  slides: HomeSlide[];
}

const INTERVAL_MS = 6_000;

export function homeLinkHref(link: HomeLink, locale: AppLocale): string {
  const base = getRoutePathById(link.routeId);
  return localizePath(link.detail === undefined ? base : `${base}/${link.detail}`, locale);
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

export default function HomeCarousel({ locale, slides }: Props) {
  const now = useNow();
  const reduceMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);

  // Built pages only drop banners that had ended at build time; the browser clock decides the rest.
  const visible = useMemo(() => (now === null ? slides : slides.filter((slide) => {
    const status = scheduleStatus(slide.startAt, slide.endAt, now);
    return status === "ongoing" || status === "permanent";
  })), [slides, now]);

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
  const schedule = formatScheduleRange(active.startAt, active.endAt, locale);
  const href = active.link ? homeLinkHref(active.link, locale) : null;
  const banner = <BannerImage eager className="mn-list-caption border border-[var(--mn-glass-border)]" src={getImageAssetUrl(active.imagePath, locale)} alt={title} fallback={title} />;

  return (
    <section
      className="mn-paper p-3 sm:p-4"
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
          {href ? <a href={href} className="mn-focus block" tabIndex={-1} aria-hidden="true">{banner}</a> : banner}
        </div>

        <div className="flex min-w-0 flex-col gap-3 lg:py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface)] px-2.5 py-1 text-[11px] font-bold leading-none text-[var(--mn-ink-soft)]">{kindLabel}</span>
            <ScheduleBadge locale={locale} startAt={active.startAt} endAt={active.endAt} now={now} />
          </div>
          <h3 className="line-clamp-3 font-[var(--mn-font-display)] text-xl leading-snug text-[var(--mn-text)] sm:text-2xl">{title}</h3>
          {schedule && <p className="text-xs font-medium tabular-nums text-[var(--mn-text-muted)]">{schedule}</p>}
          {href && (
            <a
              href={href}
              className="mn-focus mn-stamp-press inline-flex w-fit items-center gap-2 rounded-full border border-[var(--mn-border)] bg-[var(--mn-accent-deep)] px-5 py-2.5 text-sm font-bold text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]"
            >
              {t(locale, active.link?.routeId === "gacha" ? "home.viewGacha" : active.link?.routeId === "music" ? "home.viewMusic" : "home.viewDetail")}
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
            </a>
          )}
          {count > 1 && (
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--mn-glass-border)] pt-3">
              <span className="font-mono text-xs font-bold tabular-nums text-[var(--mn-text-muted)]">{String(activeIndex + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</span>
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
                  className={`mn-focus mn-list-caption relative block w-28 overflow-hidden border transition sm:w-36 ${current ? "border-[var(--mn-accent)] opacity-100" : "border-[var(--mn-glass-border)] opacity-60 hover:opacity-100"}`}
                >
                  <BannerImage src={getImageAssetUrl(slide.imagePath, locale)} alt="" fallback={slideTitle} />
                  {current && (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-[color-mix(in_srgb,var(--mn-paper)_60%,transparent)]" aria-hidden="true">
                      <span key={`${slide.id}-${autoplay}`} className={`block h-full origin-left bg-[var(--mn-accent)] ${autoplay ? "mn-carousel-progress" : ""}`} />
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
      className="mn-focus mn-icon-button grid h-10 w-10 place-items-center border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] text-[var(--mn-ink-soft)] hover:border-[var(--mn-accent)] hover:bg-[var(--mn-accent-soft)] hover:text-[var(--mn-accent-deep)]"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
    </button>
  );
}

function EmptyState({ locale }: { locale: AppLocale }) {
  return (
    <section className="mn-paper p-8 text-center sm:p-12" aria-label={t(locale, "home.carousel")}>
      <h3 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)]">{t(locale, "home.noCurrentTitle")}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "home.noCurrentDescription")}</p>
      <a href={localizePath(getRoutePathById("gacha"), locale)} className="mn-focus mn-stamp-press mt-6 inline-flex rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
        {t(locale, "home.viewAllGacha")}
      </a>
    </section>
  );
}
