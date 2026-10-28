"use client";

import { useEffect, useRef } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { installPageUpdateCheck } from "@/lib/site/page-update";
import { showToast } from "@/lib/toast/toast";

export default function PageUpdateNotice({ locale }: { locale: AppLocale }) {
  const copyRef = useRef({
    title: t(locale, "pageUpdate.title"),
    description: t(locale, "pageUpdate.description"),
    reload: t(locale, "pageUpdate.reload"),
    later: t(locale, "pageUpdate.later"),
  });
  copyRef.current = {
    title: t(locale, "pageUpdate.title"),
    description: t(locale, "pageUpdate.description"),
    reload: t(locale, "pageUpdate.reload"),
    later: t(locale, "pageUpdate.later"),
  };

  useEffect(() => {
    const dialogOpen = () => document.querySelector("[aria-modal='true'], dialog[open]") !== null;
    let waiting: MutationObserver | null = null;
    const show = () => {
      const copy = copyRef.current;
      showToast({
        id: "page-update",
        icon: "update",
        title: copy.title,
        description: copy.description,
        actions: [
          { label: copy.later },
          { label: copy.reload, primary: true, onSelect: () => window.location.reload() },
        ],
      });
    };
    const notify = () => {
      if (!dialogOpen()) {
        show();
        return;
      }
      if (waiting) return;
      waiting = new MutationObserver(() => {
        if (dialogOpen()) return;
        waiting?.disconnect();
        waiting = null;
        show();
      });
      waiting.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-modal", "open"],
      });
    };
    installPageUpdateCheck(notify);
    if (process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).has("page-update")) {
      notify();
    }
    return () => {
      waiting?.disconnect();
    };
  }, []);

  return null;
}
