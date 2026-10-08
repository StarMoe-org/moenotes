/**
 * The app's MUI theme, derived from the M3 sys-color schemes (scheme.ts).
 *
 * Both color schemes are injected as CSS variables upfront; the existing
 * `data-theme` attribute on <html> (owned by the settings pipeline, NOT by
 * MUI's useColorScheme) switches between them with zero React re-renders.
 * Only a seed change (band accent) rebuilds the theme object.
 *
 * Container / surface roles come from the app's own variables
 * (`var(--md-sys-color-*)`), which share the same scheme source, instead of
 * being duplicated into the MUI palette.
 */
import { createTheme } from "@mui/material/styles";
import { DEFAULT_ACCENT } from "@/config/settings";
import { md3ColorSchemes, DEFAULT_MD3_SEED, type Md3ColorScheme } from "./scheme";
import { md3SchemeToMuiPalette } from "./mui-palette";

export interface Md3MuiSchemes {
  light: Md3ColorScheme;
  dark: Md3ColorScheme;
}

/** Both themes' schemes for an accent setting (band color or "default"). */
export function resolveMd3MuiSchemes(accentColor: string): Md3MuiSchemes {
  const seed = accentColor === DEFAULT_ACCENT ? DEFAULT_MD3_SEED : accentColor;
  const schemes = md3ColorSchemes(seed) ?? md3ColorSchemes(DEFAULT_MD3_SEED);
  if (!schemes) throw new Error("Default MD3 seed failed to generate a scheme.");
  return { light: schemes.light, dark: schemes.dark };
}

function md(color: string): string {
  return `var(--md-sys-color-${color})`;
}

/**
 * Full MUI theme for the given schemes. M3 deltas on top of MUI's defaults:
 * dialog / drawer / snackbar / tooltip surfaces, M3 chip radius, M3 FAB
 * geometry, transparent resting app bar, and the nav-bar active pill.
 */
export function buildMd3MuiTheme(schemes: Md3MuiSchemes) {
  return createTheme({
    cssVariables: { colorSchemeSelector: "data-theme" },
    defaultColorScheme: "light",
    colorSchemes: {
      light: { palette: md3SchemeToMuiPalette(schemes.light, false) },
      dark: { palette: md3SchemeToMuiPalette(schemes.dark, true) },
    },
    typography: {
      fontFamily: "var(--md-sys-typescale-font)",
    },
    components: {
      MuiDialog: {
        styleOverrides: {
          paper: { backgroundColor: md("surface-container-high") },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: { backgroundColor: md("surface-container-low") },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: "var(--md-sys-shape-corner-small)" },
        },
      },
      MuiFab: {
        styleOverrides: {
          root: {
            borderRadius: "16px",
            backgroundColor: md("surface-container-high"),
            color: md("primary"),
          },
        },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: {
            backgroundColor: md("inverse-surface"),
            color: md("inverse-on-surface"),
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: md("inverse-surface"),
            color: md("inverse-on-surface"),
          },
        },
      },
      MuiAppBar: {
        defaultProps: { color: "transparent", elevation: 0 },
      },
      MuiBottomNavigation: {
        styleOverrides: {
          root: {
            height: 80,
            backgroundColor: md("surface-container"),
          },
        },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            color: md("on-surface-variant"),
            "&.Mui-selected": {
              color: md("on-surface"),
              "& svg": {
                backgroundColor: md("secondary-container"),
                color: md("on-secondary-container"),
                padding: "4px 20px",
                borderRadius: "9999px",
              },
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { height: 3 },
        },
      },
    },
  });
}

export type Md3MuiTheme = ReturnType<typeof buildMd3MuiTheme>;
