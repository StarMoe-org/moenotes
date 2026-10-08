/**
 * One M3 sys-color scheme -> one MUI palette (per color scheme; the light and
 * dark palettes are injected together and switched by the `data-theme`
 * attribute, see mui-theme.ts).
 *
 * Only `main` + `contrastText` are set explicitly (canonical M3 values); the
 * `light` / `dark` shades are derived by MUI's tonal offset. M3 defines no
 * warning / info / success roles, so those ramps come from fixed seeds run
 * through the same tonal-spot mathematics in the same mode.
 */
import type { PaletteOptions } from "@mui/material/styles";
import { md3ColorScheme, type Md3ColorScheme } from "./scheme";

/** Fixed seeds for the semantic ramps M3 does not define (tuned in the MUI preview). */
export const MD3_SUCCESS_SEED = "#3A6B35";
export const MD3_WARNING_SEED = "#8A6100";
export const MD3_INFO_SEED = "#00639B";

interface SemanticRamp {
  main: string;
  contrastText: string;
}

function semanticRamp(seed: string, dark: boolean, fallback: Md3ColorScheme): SemanticRamp {
  const scheme = md3ColorScheme(seed, dark);
  return {
    main: scheme?.primary ?? fallback.error,
    contrastText: scheme?.onPrimary ?? fallback.onError,
  };
}

function withOpacity(hex: string, opacity: number): string {
  return `color-mix(in srgb, ${hex} ${Math.round(opacity * 100)}%, transparent)`;
}

export function md3SchemeToMuiPalette(scheme: Md3ColorScheme, dark: boolean): PaletteOptions {
  const success = semanticRamp(MD3_SUCCESS_SEED, dark, scheme);
  const warning = semanticRamp(MD3_WARNING_SEED, dark, scheme);
  const info = semanticRamp(MD3_INFO_SEED, dark, scheme);
  return {
    primary: { main: scheme.primary, contrastText: scheme.onPrimary },
    secondary: { main: scheme.secondary, contrastText: scheme.onSecondary },
    tertiary: { main: scheme.tertiary, contrastText: scheme.onTertiary },
    error: { main: scheme.error, contrastText: scheme.onError },
    warning: { main: warning.main, contrastText: warning.contrastText },
    info: { main: info.main, contrastText: info.contrastText },
    success: { main: success.main, contrastText: success.contrastText },
    text: {
      primary: scheme.onSurface,
      secondary: scheme.onSurfaceVariant,
      disabled: withOpacity(scheme.onSurface, 0.38),
    },
    divider: scheme.outlineVariant,
    background: {
      default: scheme.background,
      paper: scheme.surfaceContainer,
    },
    action: {
      active: scheme.onSurfaceVariant,
      hover: withOpacity(scheme.onSurface, 0.08),
      hoverOpacity: 0.08,
      selected: withOpacity(scheme.onSurface, 0.12),
      selectedOpacity: 0.12,
      focus: withOpacity(scheme.onSurface, 0.12),
      focusOpacity: 0.12,
      disabled: withOpacity(scheme.onSurface, 0.38),
      disabledOpacity: 0.38,
      disabledBackground: withOpacity(scheme.onSurface, 0.12),
      activatedOpacity: 0.12,
    },
  };
}
