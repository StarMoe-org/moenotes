"use client";

import { useEffect, useState } from "react";
import Fab from "@mui/material/Fab";
import Zoom from "@mui/material/Zoom";
import { Icon } from "@/components/shared/icons";
import { withMd3 } from "@/components/md3/Md3Provider";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

/** Material 3 FAB that returns to the top once the page has scrolled (kept clear of the audio dock in global.css). */
function ScrollToTop({ locale }: { locale: AppLocale }) {
  const [visible, setVisible] = useState(false);
  const [scrolling, setScrolling] = useState(false);

  useEffect(() => {
    const MAX_THRESHOLD = 400;
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      // Past 400px or 30% of the scrollable range, whichever is smaller; kept while a smooth scroll runs.
      setVisible(scrollable > 0 && (scrolling || window.scrollY > Math.min(MAX_THRESHOLD, scrollable * 0.3)));
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [scrolling]);

  const scrollToTop = () => {
    if (scrolling) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.scrollTo(0, 0);
      return;
    }
    setScrolling(true);
    const start = window.scrollY;
    const duration = Math.min(1200, Math.max(400, start * 0.8));
    let startTime: number | null = null;
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    const step = (timestamp: number) => {
      startTime ??= timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      window.scrollTo(0, start * (1 - ease(progress)));
      if (progress < 1) requestAnimationFrame(step);
      else setScrolling(false);
    };
    requestAnimationFrame(step);
  };

  return (
    <Zoom in={visible} unmountOnExit>
      <Fab color="secondary" className="mn-scroll-top !fixed bottom-6 right-6 z-30" aria-label={t(locale, "shell.scrollToTop")} data-scroll-to-top="" onClick={scrollToTop}>
        <Icon name="arrowUp" />
      </Fab>
    </Zoom>
  );
}

export default withMd3(ScrollToTop);
