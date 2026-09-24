import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSpringAnimation } from "@/lib/animation/use-animation";

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  // Circular button → stamp animation (shadow press effect)
  const { springTransition, stampHoverProps, stampTapProps } = useSpringAnimation();

  useEffect(() => {
    const MAX_THRESHOLD = 400;
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      // Show when scrolled past 400px, or 30% of scrollable range (whichever is smaller)
      // Keep visible while a smooth scroll is in progress
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
    setScrolling(true);
    const start = window.scrollY;
    const duration = Math.min(1200, Math.max(400, start * 0.8)); // adaptive duration
    let startTime: number | null = null;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      window.scrollTo(0, start * (1 - easeOutCubic(progress)));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setScrolling(false);
      }
    };
    requestAnimationFrame(step);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={springTransition}
          {...stampHoverProps}
          {...stampTapProps}
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-30 grid h-11 w-11 place-items-center rounded-xl border border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)] transition-colors hover:bg-[var(--mn-cream-deep)] hover:shadow-[var(--mn-shadow-stamp-sm)]"
          aria-label="Scroll to top"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
