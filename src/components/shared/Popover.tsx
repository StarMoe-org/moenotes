import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export interface PopoverRenderProps {
  /** Close the popover. */
  close: () => void;
}

export interface PopoverProps {
  /** The trigger element. Receives the ref + onClick + aria props to spread. */
  trigger: (props: {
    ref: (node: HTMLElement | null) => void;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": true;
  }) => ReactNode;
  /** Panel content. Receives a `close` helper. */
  children: ReactNode | ((props: PopoverRenderProps) => ReactNode);
  /** Horizontal alignment of the panel relative to the trigger. */
  align?: "start" | "end";
  /** Gap between trigger and panel in px. */
  offset?: number;
  /** Extra className for the floating panel. */
  panelClassName?: string;
  /** Minimum width of the panel in px. Defaults to the trigger width. */
  minWidth?: number;
  /** Match the panel width to the trigger width. */
  matchTriggerWidth?: boolean;
}

interface Coords {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "bottom" | "top";
}

const VIEWPORT_MARGIN = 8;

/**
 * Portal-based popover. Renders its panel into document.body so it never gets
 * clipped by any ancestor's overflow (modals, header cards, scroll containers).
 * Auto-flips above the trigger when there isn't enough room below, and caps its
 * height to the viewport so long lists scroll internally instead of overflowing.
 */
export default function Popover({
  trigger,
  children,
  align = "start",
  offset = 6,
  panelClassName = "",
  minWidth,
  matchTriggerWidth = false,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);

  const close = useCallback(() => setOpen(false), []);

  const setTriggerRef = useCallback((node: HTMLElement | null) => {
    triggerRef.current = node;
  }, []);

  const updateCoords = useCallback(() => {
    const trigEl = triggerRef.current;
    if (!trigEl) return;
    const rect = trigEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - VIEWPORT_MARGIN;
    const placeTop = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, (placeTop ? spaceAbove : spaceBelow) - offset);

    const width = rect.width;
    let left = rect.left + window.scrollX;
    if (align === "end") {
      const panelWidth = matchTriggerWidth ? width : Math.max(minWidth ?? width, width);
      left = rect.right + window.scrollX - panelWidth;
    }

    setCoords({
      top: placeTop
        ? rect.top + window.scrollY - offset
        : rect.bottom + window.scrollY + offset,
      left,
      width,
      maxHeight,
      placement: placeTop ? "top" : "bottom",
    });
  }, [align, offset, minWidth, matchTriggerWidth]);

  useLayoutEffect(() => {
    if (open) updateCoords();
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => updateCoords();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("resize", onScrollResize);
    window.addEventListener("scroll", onScrollResize, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("resize", onScrollResize);
      window.removeEventListener("scroll", onScrollResize, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, updateCoords]);

  const panelStyle: React.CSSProperties = coords
    ? {
        position: "absolute",
        top: coords.placement === "top" ? undefined : `${coords.top}px`,
        bottom:
          coords.placement === "top"
            ? `${document.documentElement.scrollHeight - coords.top}px`
            : undefined,
        left: `${coords.left}px`,
        ...(matchTriggerWidth ? { width: `${coords.width}px` } : { minWidth: `${minWidth ?? coords.width}px` }),
        maxHeight: `${coords.maxHeight}px`,
        overflowY: "auto",
      }
    : { position: "absolute", visibility: "hidden" };

  return (
    <>
      {trigger({
        ref: setTriggerRef,
        onClick: () => setOpen((v) => !v),
        "aria-expanded": open,
        "aria-haspopup": true,
      })}
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[210]" onClick={close} aria-hidden="true" />
            <div
              ref={panelRef}
              style={panelStyle}
              className={`mn-popover-panel z-[220] rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] p-2 shadow-[var(--mn-shadow-stamp)] ${panelClassName}`}
              role="menu"
            >
              {typeof children === "function" ? children({ close }) : children}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
