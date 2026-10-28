import { buildMd3Theme, type Md3Density } from "@/lib/md3/mui-theme";

const themes: Partial<Record<Md3Density, ReturnType<typeof buildMd3Theme>>> = {};

export function getMd3Theme(density: Md3Density) {
  return (themes[density] ??= buildMd3Theme(density));
}

/** The MUI CSS variables of the theme (both color schemes), as CSS text for one `<style>` in the page head. */
export function md3ThemeVariablesCss(): string {
  const theme = getMd3Theme("comfortable") as unknown as {
    generateStyleSheets: () => Array<Record<string, Record<string, string>>>;
  };
  const blocks: string[] = [];
  for (const sheet of theme.generateStyleSheets()) {
    for (const [selector, declarations] of Object.entries(sheet)) {
      const body = Object.entries(declarations).map(([name, value]) => `${name}:${value}`).join(";");
      blocks.push(`${selector}{${body}}`);
    }
  }
  return blocks.join("\n");
}
