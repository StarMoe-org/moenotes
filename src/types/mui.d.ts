/**
 * MUI theme augmentation: the M3 tertiary role (canonical, seed-derived) as a
 * first-class palette color, so `color="tertiary"` typechecks on the common
 * components. Container and surface roles are NOT duplicated into the MUI
 * palette; style overrides and `sx` read them from the app's own variables
 * (`var(--md-sys-color-*)`, see src/styles/md3/tokens.css), which follow the
 * same scheme source and color-scheme attribute.
 */
import type { PaletteColor, PaletteColorOptions } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    tertiary: PaletteColor;
  }
  interface PaletteOptions {
    tertiary?: PaletteColorOptions | undefined;
  }
}

declare module "@mui/material/Button" {
  interface ButtonPropsColorOverrides {
    tertiary: true;
  }
}

declare module "@mui/material/IconButton" {
  interface IconButtonPropsColorOverrides {
    tertiary: true;
  }
}

declare module "@mui/material/Chip" {
  interface ChipPropsColorOverrides {
    tertiary: true;
  }
}

declare module "@mui/material/Fab" {
  interface FabPropsColorOverrides {
    tertiary: true;
  }
}

declare module "@mui/material/Badge" {
  interface BadgePropsColorOverrides {
    tertiary: true;
  }
}

declare module "@mui/material/CircularProgress" {
  interface CircularProgressPropsColorOverrides {
    tertiary: true;
  }
}

declare module "@mui/material/LinearProgress" {
  interface LinearProgressPropsColorOverrides {
    tertiary: true;
  }
}

declare module "@mui/material/Switch" {
  interface SwitchPropsColorOverrides {
    tertiary: true;
  }
}
