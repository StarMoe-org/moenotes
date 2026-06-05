import { useEffect } from "react";
import { restoreScrollState, saveScrollState } from "@/lib/scroll/scroll-memory";

export default function ScrollRestorer() {
  useEffect(() => {
    const save = () => saveScrollState(window.location.pathname, window.location.search);
    restoreScrollState(window.location.pathname, window.location.search);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", save);
    document.addEventListener("click", save, { capture: true });
    return () => {
      save();
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", save);
      document.removeEventListener("click", save, { capture: true });
    };
  }, []);
  return null;
}
