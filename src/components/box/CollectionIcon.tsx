const paths = {
  image: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM4 16l5-5 4 4 3-3 4 4M14 8h.01",
  guide: "M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14M6 9h3M6 12h3M15 9h3M15 12h3",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  add: "M12 5v14M5 12h14",
  export: "M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5",
  import: "M12 15V3m-4 4 4-4 4 4M4 15v5h16v-5",
  storage: "M4 4h13l3 3v13H4V4Zm4 0v6h8V4M8 20v-7h8v7",
  delete: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7",
  check: "m5 12 4 4L19 6",
  game: "M7 8h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.3 1.9L14.5 14h-5l-1.2 1.9A3 3 0 0 1 3 14v-2a4 4 0 0 1 4-4ZM8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01",
  refresh: "M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4",
  unlink: "M9 15l-2 2a3 3 0 0 1-4-4l2-2M15 9l2-2a3 3 0 0 1 4 4l-2 2M8 5V3M5 8H3M16 19v2M19 16h2",
} as const;

export default function CollectionIcon({ name }: { name: keyof typeof paths }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
