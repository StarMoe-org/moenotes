import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Fab from "@mui/material/Fab";
import Zoom from "@mui/material/Zoom";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
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
    <MdMuiProvider>
      <Zoom in={visible} timeout={200}>
        <Fab
          size="small"
          aria-label={buttonLabel}
          aria-hidden={!visible}
          tabIndex={visible ? 0 : -1}
          onClick={() => setIsOpen(true)}
          sx={{
            position: "fixed",
            bottom: 32,
            right: 88,
            zIndex: 30,
            bgcolor: "var(--md-sys-color-secondary-container)",
            color: "var(--md-sys-color-on-secondary-container)",
            "&:hover": { bgcolor: "var(--md-sys-color-secondary-container)" },
          }}
        >
          <FilterAltIcon />
        </Fab>
      </Zoom>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={finalTitle || "Quick Filter"} size="md">
        {finalContent}
      </Modal>
    </MdMuiProvider>
  );
}
