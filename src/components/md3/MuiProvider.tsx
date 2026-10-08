import { useEffect, useMemo, useState, type ReactNode } from "react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { ThemeProvider } from "@mui/material/styles";
import { getSettings, subscribeSettings } from "@/lib/settings/store";
import { buildMd3MuiTheme, resolveMd3MuiSchemes } from "@/lib/md3/mui-theme";

/**
 * Shared emotion cache: `prepend` keeps MUI's runtime styles before the
 * app's stylesheets so Tailwind utilities and `.md3-*` classes win ties on
 * mixed elements during the migration.
 */
const muiCache = createCache({ key: "mui", prepend: true });

export interface MdMuiProviderProps {
  children?: ReactNode;
}

/**
 * MUI theme root for React islands. The theme rebuilds only when the band
 * seed changes; light/dark switches flow through the `data-theme` attribute
 * as pure CSS (no re-render, no MUI useColorScheme).
 *
 * Deliberately no CssBaseline: its global body background would restyle
 * legacy pages. Revisit when the legacy tokens retire.
 */
export function MdMuiProvider({ children }: MdMuiProviderProps) {
  const [accentColor, setAccentColor] = useState(() => getSettings().accentColor);

  useEffect(() => subscribeSettings((settings) => setAccentColor(settings.accentColor)), []);

  const theme = useMemo(() => buildMd3MuiTheme(resolveMd3MuiSchemes(accentColor)), [accentColor]);

  return (
    <CacheProvider value={muiCache}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </CacheProvider>
  );
}
