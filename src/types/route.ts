import type { AppLocale } from "@/config/locales";
import type { PageMetadata } from "@/lib/seo/metadata";

export type RouteGroupId = "database" | "story" | "tools" | "community";
export type RouteIcon = "home" | "database" | "music" | "users" | "calendar" | "newspaper" | "book" | "wrench" | "sparkles" | "info" | "palette" | "archive";
export type RouteKind = "static" | "dynamic";
export type RouteComponent = "home" | "page" | "cards" | "card-detail" | "design-system" | "characters" | "character-detail" | "support-cards" | "support-card-detail" | "about" | "music" | "song-detail" | "stamps" | "comics" | "items" | "story-main" | "story-friendship" | "story-other" | "story-detail";
export type RouteParams = Record<string, string>;

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

export interface RouteStaticParamConfig {
  params: RouteParams;
  breadcrumbDetail?: BreadcrumbDetail;
  meta?: Partial<PageMetadata>;
}

export interface AppRoute {
  id: string;
  /** Canonical route path. Dynamic routes may include `:param` segments. */
  path: `/${string}`;
  /** Explicit route kind. Omitted routes are treated as static for backward compatibility. */
  kind?: RouteKind;
  /** Pattern used to match dynamic detail routes, e.g. `/cards/:id`. Defaults to `path`. */
  pattern?: `/${string}`;
  /** Parent route id for dynamic detail routes when the nesting tree is not enough. */
  parentId?: string;
  /** Rendering slot used by the catch-all page. */
  component?: RouteComponent;
  /** Static params to generate for dynamic routes once real data exists. */
  staticParams?: readonly RouteStaticParamConfig[] | (() => readonly RouteStaticParamConfig[] | Promise<readonly RouteStaticParamConfig[]>);
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
  ancestors: AppRoute[];
  isGroupLanding: boolean;
  params: RouteParams;
  pathname: `/${string}`;
}

export interface BreadcrumbDetail {
  id?: string;
  label: string;
  href?: string;
  ancestors?: AppRoute[];
}

export interface BreadcrumbItem {
  id: string;
  label: string;
  href: string;
  current?: boolean;
}

export interface BuildBreadcrumbOptions {
  locale: AppLocale;
  detail?: BreadcrumbDetail;
}
