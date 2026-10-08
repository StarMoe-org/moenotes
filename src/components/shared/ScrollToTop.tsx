import { useEffect, useState } from "react";
import Fab from "@mui/material/Fab";
import Zoom from "@mui/material/Zoom";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { MdMuiProvider } from "@/components/md3/MuiProvider";

interface ScrollToTopProps {
  locale: AppLocale;
}

/** M3 small FAB that appears after scrolling down, returning to the top on press. */
export default function ScrollToTop({ locale }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVisible(window.scrollY > 640));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <MdMuiProvider>
      <Zoom in={visible} timeout={200}>
        <Fab
          size="small"
          color="primary"
          aria-label={t(locale, "shell.scrollToTop")}
          aria-hidden={!visible}
          tabIndex={visible ? 0 : -1}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          sx={{ position: "fixed", right: { xs: 16, sm: 24 }, bottom: { xs: 16, sm: 24 } }}
        >
          <KeyboardArrowUpIcon />
        </Fab>
      </Zoom>
    </MdMuiProvider>
  );
}
