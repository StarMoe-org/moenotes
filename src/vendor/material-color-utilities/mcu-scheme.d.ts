/**
 * Minimal type declarations for the vendored material-color-utilities subset
 * (mcu-scheme.mjs). Only the API used by src/lib/md3/scheme.ts is declared.
 * Color roles are ARGB integers; convert with hexFromArgb / argbFromHex.
 */

export declare class Hct {
  private constructor();
  static fromInt(argb: number): Hct;
}

export declare function argbFromHex(hex: string): number;
export declare function hexFromArgb(argb: number): string;

declare class Md3Scheme {
  readonly primary: number;
  readonly onPrimary: number;
  readonly primaryContainer: number;
  readonly onPrimaryContainer: number;
  readonly primaryFixed: number;
  readonly primaryFixedDim: number;
  readonly onPrimaryFixed: number;
  readonly onPrimaryFixedVariant: number;
  readonly secondary: number;
  readonly onSecondary: number;
  readonly secondaryContainer: number;
  readonly onSecondaryContainer: number;
  readonly secondaryFixed: number;
  readonly secondaryFixedDim: number;
  readonly onSecondaryFixed: number;
  readonly onSecondaryFixedVariant: number;
  readonly tertiary: number;
  readonly onTertiary: number;
  readonly tertiaryContainer: number;
  readonly onTertiaryContainer: number;
  readonly tertiaryFixed: number;
  readonly tertiaryFixedDim: number;
  readonly onTertiaryFixed: number;
  readonly onTertiaryFixedVariant: number;
  readonly error: number;
  readonly onError: number;
  readonly errorContainer: number;
  readonly onErrorContainer: number;
  readonly background: number;
  readonly onBackground: number;
  readonly surface: number;
  readonly onSurface: number;
  readonly surfaceVariant: number;
  readonly onSurfaceVariant: number;
  readonly surfaceDim: number;
  readonly surfaceBright: number;
  readonly surfaceContainerLowest: number;
  readonly surfaceContainerLow: number;
  readonly surfaceContainer: number;
  readonly surfaceContainerHigh: number;
  readonly surfaceContainerHighest: number;
  readonly surfaceTint: number;
  readonly inverseSurface: number;
  readonly inverseOnSurface: number;
  readonly inversePrimary: number;
  readonly outline: number;
  readonly outlineVariant: number;
  readonly scrim: number;
  readonly shadow: number;
}

/** M3 default: low-to-medium colorfulness. Used for the default theme and band seeds. */
export declare class SchemeTonalSpot extends Md3Scheme {
  constructor(sourceColorHct: Hct, isDark: boolean, contrastLevel: number);
}

/** Higher-chroma alternative, reserved for vivid band seeds. */
export declare class SchemeVibrant extends Md3Scheme {
  constructor(sourceColorHct: Hct, isDark: boolean, contrastLevel: number);
}
