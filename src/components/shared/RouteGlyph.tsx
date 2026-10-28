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

// Route-specific glyphs take precedence over the generic nav icon. Every navigation destination draws its own glyph
// (tests/md3-shell.test.tsx keeps them distinct), so a page is recognisable by its icon alone.
const routePaths: Record<string, ReactNode> = {
  // Database
  cards: <><rect x="5" y="3" width="14" height="18" rx="2.5"/><circle cx="12" cy="9" r="2.5"/><path d="M8.5 17c.7-2.3 1.9-3.5 3.5-3.5s2.8 1.2 3.5 3.5"/></>,
  "support-cards": <><rect x="7" y="3" width="12" height="16" rx="2"/><path d="M7 6H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2"/><path d="m13 7 .9 2.1L16 10l-2.1.9L13 13l-.9-2.1L10 10l2.1-.9z"/></>,
  stamps: <><path d="M8 4h8l1 7 3 3v3H4v-3l3-3z"/><path d="M7 21h10M8 17h8"/></>,
  titles: <><circle cx="12" cy="9" r="5.5"/><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7"/><path d="m12 6.5.8 1.7 1.8.3-1.3 1.2.3 1.8-1.6-.9-1.6.9.3-1.8-1.3-1.2 1.8-.3z"/></>,
  backgrounds: <><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m3.5 17 5-5 4 4 3-3 5 5"/></>,
  comics: <><rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 11h18M12 3v8M8 11v10"/><path d="m15 15 1.4 1.1 1.8-.4-.6 1.7.9 1.6-1.9-.1-1.2 1.4-.5-1.8-1.7-.7 1.5-1.1z"/></>,
  // A package: the items players hold.
  items: <><path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10M7.8 4.8l8.5 4.5"/></>,
  // An amplifier: band gear.
  "band-items": <><path d="M9 5V3h6v2"/><rect x="2.5" y="5" width="19" height="15" rx="2.5"/><circle cx="9" cy="12.5" r="4"/><circle cx="9" cy="12.5" r="1"/><path d="M16.5 9h.01M16.5 12.5h.01M16.5 16h.01"/></>,
  // A lifebuoy: help.
  help: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.8"/><path d="m5.6 5.6 3.7 3.7M14.7 14.7l3.7 3.7M18.4 5.6l-3.7 3.7M9.3 14.7l-3.7 3.7"/></>,
  // Music
  // A song list: lines beside a note.
  music: <><path d="M3.5 6h10M3.5 11h10M3.5 16h6"/><path d="M18.5 17.5V5l2.5-.8"/><circle cx="16.5" cy="17.5" r="2"/></>,
  // A gauge: song meta (efficiency and density figures).
  "chart-data": <><path d="M3.5 17a8.5 8.5 0 1 1 17 0"/><path d="m12 17 4.2-5.2"/><path d="M3.5 17h2.5M18 17h2.5M12 8.5V11M6.2 11.2l1.6 1.4M17.8 11.2l-1.6 1.4"/><path d="M7 20.5h10"/></>,
  "chart-preview": <><path d="M9.5 4h5L20 20H4z"/><path d="M12 4v16M7.2 12h9.6"/></>,
  // A trophy: high-score rankings.
  "music-ranking": <><path d="M8 3.5h8V9a4 4 0 0 1-8 0z"/><path d="M8 5.5H5.5a2.5 2.5 0 0 0 2.7 3.8M16 5.5h2.5a2.5 2.5 0 0 1-2.7 3.8"/><path d="M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z"/></>,
  "guess-music": <><circle cx="10" cy="12" r="7"/><path d="M8 10a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2v.5M10 16h.01"/><path d="M19 6v8"/><circle cx="17.5" cy="15" r="2"/></>,
  // Events
  // A pennant: the events group.
  events: <><path d="M5 21V3"/><path d="M5 4h13l-2.8 4.5L18 13H5"/></>,
  // A month grid with day dots.
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M7.5 14h.01M12 14h.01M16.5 14h.01M7.5 17.5h.01M12 17.5h.01"/></>,
  // Stacked banners: the event list.
  "event-list": <><rect x="3" y="3.5" width="18" height="7" rx="2"/><rect x="3" y="13.5" width="18" height="7" rx="2"/><path d="M6.5 7h6M6.5 17h6M16.5 7h1M16.5 17h1"/></>,
  rewards: <><rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8C10.5 5 7 4.5 7 6.8 7 8.5 9.5 8 12 8Zm0 0c1.5-3 5-3.5 5-1.2C17 8.5 14.5 8 12 8Z"/></>,
  // A checklist: missions.
  missions: <><path d="m3.5 6 1.6 1.6L8 4.7M3.5 12l1.6 1.6L8 10.7M3.5 18l1.6 1.6L8 16.7"/><path d="M11 6.5h9.5M11 12.5h9.5M11 18.5h9.5"/></>,
  // Opposing arrows: the exchange shop.
  exchange: <><path d="M4 8h15.5M16 4.5 19.5 8 16 11.5"/><path d="M20 16H4.5M8 12.5 4.5 16 8 19.5"/></>,
  // A shopping bag: the cash shop.
  shop: <><path d="M5 8h14l-1.2 12.5a1.7 1.7 0 0 1-1.7 1.5H7.9a1.7 1.7 0 0 1-1.7-1.5z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/></>,
  // A membership card.
  "tgw-card": <><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4.5M15.5 15h2.5"/></>,
  gacha: <><path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7a2 2 0 0 1 2-2z"/><path d="m12 8.5 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/></>,
  "event-tracker": <><path d="M3 20h18"/><path d="M5 20v-6h4v6M10 20V9h4v11M15 20v-8h4v8"/><path d="m5 8 5-4 4 3 5-4"/></>,
  // A microphone: real-world lives.
  "real-lives": <><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7"/></>,
  // Story
  "main-story": <><path d="M5 4.5A3.5 3.5 0 0 1 8.5 2H12v18H8a3 3 0 0 0-3 3z"/><path d="M12 2h3.5A3.5 3.5 0 0 1 19 5.5V20h-3a4 4 0 0 0-4 3"/><path d="M8 7h2M8 11h2"/></>,
  // A clapperboard: event episodes.
  "event-story": <><rect x="3" y="9.5" width="18" height="11.5" rx="2"/><path d="m3.3 9.5-.6-3.2 16.6-3.3.7 3.3z"/><path d="m7.5 5.5 2.3 3.2M12.7 4.4 15 7.6M3 13.5h18"/></>,
  "friendship-story": <><path d="M12 20S4 15.6 4 9.2C4 5 9.2 3.3 12 7c2.8-3.7 8-2 8 2.2C20 15.6 12 20 12 20Z"/><path d="M8.5 11.5c2 1.5 5 1.5 7 0"/></>,
  // A cake with a candle: birthday episodes.
  "birthday-story": <><path d="M3.5 21h17M5 21v-7.5h14V21"/><path d="M5 17c1.2.9 2.3.9 3.5 0s2.3-.9 3.5 0 2.3.9 3.5 0 2.3-.9 3.5 0"/><path d="M12 13.5V9.5"/><path d="M12 4c.9 1.1.9 2.3 0 3-.9-.7-.9-1.9 0-3z"/></>,
  "other-story": <><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3z"/><path d="M9 9h6M9 13h4"/><path d="m17.5 2 .6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6z"/></>,
  // Tools
  "sliding-puzzle": <><rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M9 3v18M15 3v12M3 9h18M3 15h12"/><path d="m17 18 1.5-1.5L20 18M18.5 16.5v4"/></>,
  "live2d-viewer": <><circle cx="12" cy="7" r="3.5"/><path d="M6 21c.5-4.6 2.5-7 6-7s5.5 2.4 6 7"/><path d="M4 9.5 2.5 8M20 9.5 21.5 8M4.5 14 3 15M19.5 14l1.5 1"/></>,
  "story-player": <><rect x="2.5" y="5" width="19" height="12" rx="2.5"/><path d="m10 8.5 4.5 2.5-4.5 2.5z"/><path d="M6 20.5h12"/></>,
  // A formation of five card slots: the deck builder.
  deck: <><rect x="2.5" y="3.5" width="5.5" height="7.5" rx="1.2"/><rect x="9.25" y="3.5" width="5.5" height="7.5" rx="1.2"/><rect x="16" y="3.5" width="5.5" height="7.5" rx="1.2"/><rect x="5.75" y="13" width="5.5" height="7.5" rx="1.2"/><rect x="12.75" y="13" width="5.5" height="7.5" rx="1.2"/></>,
  // A doorway with a magnifier: looking into a room by its code.
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
