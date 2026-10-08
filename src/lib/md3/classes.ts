/**
 * Class-name builders for the MD3 components (src/styles/md3/components.css).
 * Shared by Astro markup (plain strings) and the React wrappers
 * (src/components/md3/), so both render identical class lists.
 */

function join(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" ");
}

/** Joins class fragments, dropping falsy values. */
export function md3Cx(...parts: Array<string | false | null | undefined>): string {
  return join(...parts);
}

export type Md3ButtonVariant = "elevated" | "filled" | "tonal" | "outlined" | "text";
export type Md3ButtonSize = "small" | "medium" | "large";

export function md3ButtonClass(
  variant: Md3ButtonVariant = "filled",
  size: Md3ButtonSize = "medium",
  extra?: string,
): string {
  return join(
    "md3-button",
    `md3-button--${variant}`,
    size === "small" && "md3-button--small",
    size === "large" && "md3-button--large",
    extra,
  );
}

export type Md3IconButtonVariant = "standard" | "filled" | "tonal" | "outlined";

export function md3IconButtonClass(
  variant: Md3IconButtonVariant = "standard",
  selected = false,
  extra?: string,
): string {
  return join(
    "md3-icon-button",
    variant !== "standard" && `md3-icon-button--${variant}`,
    selected && "md3-icon-button--selected",
    extra,
  );
}

export function md3ChipClass(selected = false, elevated = false, extra?: string): string {
  return join("md3-chip", selected && "md3-chip--selected", elevated && "md3-chip--elevated", extra);
}

export type Md3CardVariant = "elevated" | "filled" | "outlined";

export function md3CardClass(variant: Md3CardVariant = "elevated", extra?: string): string {
  return join("md3-card", `md3-card--${variant}`, extra);
}

export type Md3FabSize = "small" | "medium" | "large";
export type Md3FabColor = "surface" | "primary" | "secondary" | "tertiary";

export function md3FabClass(size: Md3FabSize = "medium", color: Md3FabColor = "surface", extra?: string): string {
  return join(
    "md3-fab",
    size === "small" && "md3-fab--small",
    size === "large" && "md3-fab--large",
    color !== "surface" && `md3-fab--${color}`,
    extra,
  );
}

export function md3TabClass(active = false, extra?: string): string {
  return join("md3-tab", active && "md3-tab--active", extra);
}

export function md3SegmentClass(selected = false, extra?: string): string {
  return join("md3-segment", selected && "md3-segment--selected", extra);
}

export function md3NavItemClass(active = false, extra?: string): string {
  return join("md3-nav-item", active && "md3-nav-item--active", extra);
}

export function md3DrawerItemClass(active = false, extra?: string): string {
  return join("md3-drawer-item", active && "md3-drawer-item--active", extra);
}

export function md3RailItemClass(active = false, extra?: string): string {
  return join("md3-rail-item", active && "md3-rail-item--active", extra);
}
