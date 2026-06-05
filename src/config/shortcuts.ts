export interface ShortcutDefinition {
  id: string;
  labelKey: string;
  combos: string[];
  scope: "global" | "overlay" | "page";
}

export const shortcuts: ShortcutDefinition[] = [
  { id: "toggle-command", labelKey: "shell.openCommandPalette", combos: ["mod+k"], scope: "global" },
  { id: "toggle-settings", labelKey: "shell.openSettings", combos: ["mod+,"], scope: "global" },
  { id: "toggle-sidebar", labelKey: "shell.openSidebar", combos: ["["], scope: "global" },
  { id: "show-shortcuts", labelKey: "shell.shortcuts", combos: ["?"], scope: "global" },
  { id: "close-overlay", labelKey: "actions.close", combos: ["escape"], scope: "overlay" },
  { id: "go-home", labelKey: "nav.home", combos: ["g h"], scope: "global" },
  { id: "go-database", labelKey: "nav.groups.database", combos: ["g d"], scope: "global" },
  { id: "go-music", labelKey: "nav.items.music", combos: ["g m"], scope: "global" },
  { id: "go-characters", labelKey: "nav.items.characters", combos: ["g c"], scope: "global" },
  { id: "go-events", labelKey: "nav.items.events", combos: ["g e"], scope: "global" },
];
