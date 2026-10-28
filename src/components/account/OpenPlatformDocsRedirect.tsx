"use client";

import { useEffect } from "react";
import { resolveDocsUrl } from "@/lib/account/docs-url";

export default function OpenPlatformDocsRedirect({ base, locale }: { base?: string | undefined; locale: string }) {
  useEffect(() => {
    if (!base) return;
    const target = resolveDocsUrl(base, locale, window.location.hash);
    if (!target || target === window.location.href) return;
    const link = document.querySelector<HTMLAnchorElement>("[data-docs-target]");
    if (link) link.href = target;
    window.location.replace(target);
  }, [base, locale]);
  return null;
}
