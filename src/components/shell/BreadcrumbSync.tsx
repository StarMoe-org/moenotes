"use client";

import { useEffect } from "react";
import type { AppLocale } from "@/config/locales";
import { setActiveBreadcrumb } from "@/lib/route/breadcrumb-store";
import type { BreadcrumbDetail } from "@/types/route";

interface BreadcrumbSyncProps {
  locale: AppLocale;
  pathname: string;
  detail?: BreadcrumbDetail | undefined;
}

export default function BreadcrumbSync({ locale, pathname, detail }: BreadcrumbSyncProps) {
  const key = `${locale}:${pathname}`;
  useEffect(() => {
    setActiveBreadcrumb(key, detail);
  }, [key, detail]);
  return null;
}
