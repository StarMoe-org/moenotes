import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { t } from "@/i18n";
import { isTopOverlayLayer } from "@/lib/overlay/layer-stack";
import { useOverlay } from "@/lib/overlay/use-overlay";
import { useOverlayLayer } from "@/lib/overlay/use-overlay-layer";
import { buildStaticSearchIndex } from "@/lib/search/static-index";
import { searchContent } from "@/lib/search/client";
import { CONTENT_KIND_ORDER, KIND_LABEL_KEY } from "@/lib/search/kinds";
import { getRoutePathById } from "@/lib/route/registry";
import { MdMuiProvider } from "@/components/md3/MuiProvider";

interface CommandPaletteProps {
  locale: AppLocale;
}

/** One flat list row: a static page or a content entity, both ready to navigate to. */
interface PaletteRow {
  id: string;
  /** "page" or a content kind (card/music/story/…); drives the group label. */
  kind: string;
  label: string;
  href: `/${string}`;
}

const rowSx: SxProps<Theme> = {
  borderRadius: 3,
  "&.Mui-selected": {
    bgcolor: "var(--md-sys-color-secondary-container)",
    color: "var(--md-sys-color-on-secondary-container)",
  },
  "&.Mui-selected:hover": {
    bgcolor: "var(--md-sys-color-secondary-container)",
  },
  "&.Mui-selected .MuiListItemText-secondary": {
    color: "inherit",
    opacity: 0.75,
  },
};

export default function CommandPalette({ locale }: CommandPaletteProps) {
  const { isOpen, close } = useOverlay("command");
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [content, setContent] = useState<PaletteRow[]>([]);
  const reactId = useId();
  const baseId = `command-${reactId}`;
  const titleId = `${baseId}-title`;
  const activeOptionRef = useRef<HTMLElement | null>(null);
  useOverlayLayer("command", isOpen);
  const staticRows = useMemo<PaletteRow[]>(() =>
    buildStaticSearchIndex().map((item) => ({
      id: item.id,
      kind: "page",
      label: t(locale, item.labelKey),
      href: localizePath(item.path, locale),
    })), [locale]);

  const q = query.trim().toLocaleLowerCase();

  // Static pages filter instantly; content rows resolve from /search-index.json as the query changes.
  const filteredStatic = useMemo(() => {
    if (!q) return staticRows;
    return staticRows.filter((row) => [row.label, row.href].some((value) => value.toLocaleLowerCase().includes(q)));
  }, [staticRows, q]);

  useEffect(() => {
    let cancelled = false;
    void searchContent(query, locale).then((results) => {
      if (cancelled) return;
      setContent(results.map((result) => ({ id: result.key, kind: result.kind, label: result.title, href: result.href })));
    });
    return () => { cancelled = true; };
  }, [query, locale]);

  // Group content rows by kind, ordered; pages form their own leading group.
  const groups = useMemo(() => {
    const out: Array<{ kind: string; labelKey: string | null; rows: PaletteRow[] }> = [];
    if (filteredStatic.length > 0) out.push({ kind: "page", labelKey: q ? "search.kinds.page" : null, rows: filteredStatic });
    if (!q) return out;
    for (const kind of CONTENT_KIND_ORDER) {
      const rows = content.filter((row) => row.kind === kind);
      if (rows.length > 0) out.push({ kind, labelKey: KIND_LABEL_KEY[kind] ?? null, rows });
    }
    return out;
  }, [filteredStatic, content, q]);

  const flat = useMemo(() => groups.flatMap((group) => group.rows), [groups]);

  useEffect(() => {
    setActiveIndex(flat.length > 0 ? 0 : -1);
  }, [flat]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const raf = requestAnimationFrame(() => {
      activeOptionRef.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeIndex, flat, isOpen]);

  const setActiveOptionRef = (el: HTMLElement | null) => {
    activeOptionRef.current = el;
  };

  const activeItem = activeIndex >= 0 ? flat[activeIndex] : undefined;
  const searchPagePath = localizePath(getRoutePathById("search"), locale);

  const navigateActive = () => {
    // With a query but no highlighted row, go to the full search page instead of dead-ending.
    if (!activeItem) {
      if (q) {
        close();
        window.location.href = `${searchPagePath}?q=${encodeURIComponent(query.trim())}`;
      }
      return;
    }
    close();
    window.location.href = activeItem.href;
  };

  const handleClose = (_event: object, reason: string) => {
    if (reason === "escapeKeyDown" && !isTopOverlayLayer("command")) return;
    close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => flat.length === 0 ? -1 : (current + 1 + flat.length) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => flat.length === 0 ? -1 : (current - 1 + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      navigateActive();
    }
  };

  let rowOffset = 0;

  return (
    <MdMuiProvider>
      <Dialog
        open={isOpen}
        onClose={handleClose}
        fullWidth
        maxWidth="sm"
        aria-labelledby={titleId}
        sx={{ "& .MuiDialog-container": { alignItems: "flex-start" } }}
        slotProps={{ paper: { sx: { mt: "12vh", mb: 2, borderRadius: 7 } } }}
      >
        <DialogTitle
          id={titleId}
          sx={{ position: "absolute", width: 1, height: 1, p: 0, m: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}
        >
          {t(locale, "shell.openCommandPalette")}
        </DialogTitle>
        <Box onKeyDown={handleKeyDown}>
          <TextField
            autoFocus
            fullWidth
            variant="standard"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t(locale, "shell.commandPlaceholder")}
            slotProps={{ input: { disableUnderline: true, sx: { px: 3, py: 2, fontSize: 18, fontWeight: 700 } },
              htmlInput: {
              role: "combobox",
              "aria-autocomplete": "list",
              "aria-expanded": true,
              "aria-controls": `${baseId}-listbox`,
              "aria-activedescendant": activeItem ? `${baseId}-option-${activeItem.id}` : undefined,
              "aria-label": t(locale, "shell.commandPlaceholder"),
              } }}
            sx={{ borderBottom: "1px solid var(--md-sys-color-outline-variant)" }}
          />
          <Box id={`${baseId}-listbox`} role="listbox" sx={{ maxHeight: "50vh", overflowY: "auto", p: 1 }}>
            {flat.length === 0 ? (
              q ? (
                <ListItemButton component="a" href={`${searchPagePath}?q=${encodeURIComponent(query.trim())}`} onClick={close} sx={rowSx}>
                  <ListItemText
                    primary={t(locale, "search.viewAllResults")}
                    slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 700 } } }}
                  />
                </ListItemButton>
              ) : (
                <Typography sx={{ px: 2, py: 4, textAlign: "center", fontSize: 14, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)" }}>
                  {t(locale, "shell.noCommandResults")}
                </Typography>
              )
            ) : (
              groups.map((group) => {
                const start = rowOffset;
                rowOffset += group.rows.length;
                return (
                  <div key={group.kind}>
                    {group.labelKey ? (
                      <Typography
                        variant="caption"
                        sx={{ display: "block", px: 2.5, pb: 0.5, pt: 1.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--md-sys-color-on-surface-variant)" }}
                      >
                        {t(locale, group.labelKey)}
                      </Typography>
                    ) : null}
                    {group.rows.map((item, index) => {
                      const flatIndex = start + index;
                      const active = flatIndex === activeIndex;
                      return (
                        <ListItemButton
                          key={item.id}
                          ref={active ? setActiveOptionRef : undefined}
                          id={`${baseId}-option-${item.id}`}
                          component="a"
                          href={item.href}
                          role="option"
                          aria-selected={active}
                          selected={active}
                          onMouseEnter={() => setActiveIndex(flatIndex)}
                          onClick={close}
                          sx={rowSx}
                        >
                          <ListItemText
                            primary={item.label}
                            secondary={item.href}
                            slotProps={{
                              primary: { sx: { fontSize: 14, fontWeight: 800 } },
                              secondary: { className: "font-mono", sx: { fontSize: 12 } },
                            }}
                          />
                        </ListItemButton>
                      );
                    })}
                  </div>
                );
              })
            )}
          </Box>
        </Box>
      </Dialog>
    </MdMuiProvider>
  );
}
