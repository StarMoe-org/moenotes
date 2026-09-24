import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSpringAnimation } from "@/lib/animation/use-animation";
import Modal from "@/components/shared/Modal";

// -- Context --
interface QuickFilterContextValue {
  filterContent: ReactNode | null;
  filterTitle: string;
  setFilter: (title: string, content: ReactNode | null) => void;
  clearFilter: () => void;
}

const QuickFilterContext = createContext<QuickFilterContextValue>({
  filterContent: null,
  filterTitle: "",
  setFilter: () => {},
  clearFilter: () => {},
});

export function useQuickFilter() {
  return useContext(QuickFilterContext);
}

export function QuickFilterProvider({ children }: { children: ReactNode }) {
  const [filterContent, setFilterContent] = useState<ReactNode | null>(null);
  const [filterTitle, setFilterTitle] = useState("");

  const setFilter = (title: string, content: ReactNode | null) => {
    setFilterTitle(title);
    setFilterContent(content);
  };

  const clearFilter = () => {
    setFilterTitle("");
    setFilterContent(null);
  };

  return (
    <QuickFilterContext.Provider value={{ filterContent, filterTitle, setFilter, clearFilter }}>
      {children}
    </QuickFilterContext.Provider>
  );
}

// -- Floating Button (supports both context and props) --
interface QuickFilterButtonProps {
  content?: ReactNode;
  title?: string;
  buttonLabel?: string;
}

export default function QuickFilterButton({ content, title, buttonLabel = "Quick filter" }: QuickFilterButtonProps = {}) {
  const ctx = useQuickFilter();
  const finalContent = content ?? ctx.filterContent;
  const finalTitle = title ?? ctx.filterTitle;
  const [visible, setVisible] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  // Circular button → stamp animation (shadow press effect)
  const { springTransition, stampHoverProps, stampTapProps } = useSpringAnimation();

  useEffect(() => {
    const MAX_THRESHOLD = 300;
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      // Show when scrolled past 300px, or 25% of scrollable range (whichever is smaller)
      setVisible(scrollable > 0 && window.scrollY > Math.min(MAX_THRESHOLD, scrollable * 0.25));
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!finalContent) return null;

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={springTransition}
            {...stampHoverProps}
            {...stampTapProps}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-8 right-[5.5rem] z-30 grid h-11 w-11 place-items-center rounded-xl border border-[var(--mn-border)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)] shadow-[var(--mn-shadow-stamp)] transition-colors hover:bg-[var(--mn-cream-deep)] hover:shadow-[var(--mn-shadow-stamp-sm)]"
            aria-label={buttonLabel}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={finalTitle || "Quick Filter"} size="md">
        {finalContent}
      </Modal>
    </>
  );
}
