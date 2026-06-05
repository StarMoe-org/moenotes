import type { AppLocale } from "@/config/locales";

export type RouteGroupId = "database" | "activity" | "story" | "tools" | "community";
export type RouteIcon = "home" | "database" | "music" | "users" | "calendar" | "newspaper" | "book" | "wrench" | "sparkles" | "info";

export interface RouteSeoConfig {
  titleKey: string;
  descriptionKey: string;
  keywords?: string[];
  indexable?: boolean;
  sitemap?: {
    priority?: number;
    changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  };
}

export interface RouteNavConfig {
  order: number;
  icon?: RouteIcon;
  shortcut?: string;
}

export interface AppRoute {
  id: string;
  path: `/${string}`;
  labelKey: string;
  seo: RouteSeoConfig;
  nav?: false | RouteNavConfig;
  searchable?: boolean;
  keywords?: string[];
  children?: AppRoute[];
}

export interface RouteMatch {
  group?: AppRoute;
  item: AppRoute;
  isGroupLanding: boolean;
}

export interface BreadcrumbItem {
  id: string;
  label: string;
  href: string;
  current?: boolean;
}

export interface BuildBreadcrumbOptions {
  locale: AppLocale;
  detail?: {
    id?: string;
    label: string;
    href?: string;
  };
}
