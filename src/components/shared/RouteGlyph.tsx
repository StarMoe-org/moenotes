import type { ReactNode } from "react";
import type { RouteIcon } from "@/types/route";

const iconPaths: Record<RouteIcon, ReactNode> = {
  home: <><path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  music: <><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.3-4 2.1-6 5.5-6s5.2 2 5.5 6M15 5.5a3 3 0 0 1 0 5.8M16 14c2.8.4 4.2 2.3 4.5 5"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  newspaper: <><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23z"/></>,
  wrench: <path d="M14.5 6.5a5 5 0 0 0-6.2 6.2L3 18l3 3 5.3-5.3a5 5 0 0 0 6.2-6.2l-3 3-3-3z"/>,
  sparkles: <><path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8z"/><path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7z"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h3a6 6 0 0 0 0-12z"/><path d="M7 10h.01M9 6h.01"/></>,
  archive: <><path d="M4 7h16v14H4zM3 3h18v4H3z"/><path d="M9 11h6"/></>,
  "folder-open": <path d="M3 6h7l2 2h9l-2 11H5z"/>,
};

// Route-specific glyphs take precedence over the generic nav icon.
const routePaths: Record<string, ReactNode> = {
  cards: <><rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="9" r="2.5"/><path d="M8.5 17c.7-2.3 1.9-3.5 3.5-3.5s2.8 1.2 3.5 3.5"/></>,
  "support-cards": <><rect x="7" y="3" width="12" height="16" rx="2"/><path d="M7 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2"/><path d="m13 7 .9 2.1L16 10l-2.1.9L13 13l-.9-2.1L10 10l2.1-.9z"/></>,
  gacha: <><path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z"/><path d="m12 8.5 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/></>,
  stamps: <><path d="M8 4h8l1 7 3 3v3H4v-3l3-3z"/><path d="M7 21h10M8 17h8"/></>,
  rewards: <><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8C10.5 5 7 4.5 7 6.8 7 8.5 9.5 8 12 8Zm0 0c1.5-3 5-3.5 5-1.2C17 8.5 14.5 8 12 8Z"/></>,
  titles: <><circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7"/><path d="m12 6.5.8 1.7 1.8.3-1.3 1.2.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.2 1.8-.3z"/></>,
  backgrounds: <><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m3.5 17 5-5 4 4 3-3 5 5"/></>,
  comics: <><rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 11h18M12 3v8M8 11v10"/><path d="m15 15 1.4 1.1 1.8-.4-.6 1.7.9 1.6-1.9-.1-1.2 1.4-.5-1.8-1.7-.7 1.5-1.1z"/></>,
  "main-story": <><path d="M5 4.5A3.5 3.5 0 0 1 8.5 2H12v18H8a3 3 0 0 0-3 3z"/><path d="M12 2h3.5A3.5 3.5 0 0 1 19 5.5V20h-3a4 4 0 0 0-4 3"/><path d="M8 7h2M8 11h2"/></>,
  "friendship-story": <><path d="M12 20S4 15.6 4 9.2C4 5 9.2 3.3 12 7c2.8-3.7 8-2 8 2.2C20 15.6 12 20 12 20Z"/><path d="M8.5 11.5c2 1.5 5 1.5 7 0"/></>,
  "chart-preview": <><path d="M9.5 4h5L20 20H4z"/><path d="M12 4v16M7.2 12h9.6"/></>,
  "other-story": <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z"/><path d="M9 9h6M9 13h4"/><path d="m17.5 2 .6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z"/></>,
};

interface Props {
  icon: RouteIcon;
  routeId?: string | undefined;
  className?: string;
}

/** Line icon for a route, shared by the sidebar and the home shortcuts. */
export default function RouteGlyph({ icon, routeId, className = "h-4 w-4" }: Props) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {routeId && routePaths[routeId] ? routePaths[routeId] : iconPaths[icon]}
    </svg>
  );
}
