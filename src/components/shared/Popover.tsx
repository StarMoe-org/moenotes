"use client";

import { useCallback, useState, type ReactNode } from "react";
import MuiPopover from "@mui/material/Popover";
import { Md3Provider } from "@/components/md3/Md3Provider";

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

/**
 * Material 3 menu surface anchored to a trigger (MUI Popover: portal, kept inside the viewport, Escape and outside
 * click close it, focus returns to the trigger). The panel is surface-container with the large shape; its rows are
 * `md3-menu-item md3-state` buttons.
 */
export default function Popover({
  trigger,
  children,
  align = "start",
  offset = 4,
  panelClassName = "",
  minWidth,
  matchTriggerWidth = false,
}: PopoverProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [triggerNode, setTriggerNode] = useState<HTMLElement | null>(null);
  const open = Boolean(anchor);
  const close = useCallback(() => setAnchor(null), []);
  const toggle = useCallback(() => setAnchor((current) => (current ? null : triggerNode)), [triggerNode]);
  const width = triggerNode?.getBoundingClientRect().width ?? 0;
  const horizontal = align === "end" ? "right" : "left";

  return (
    <>
      {trigger({ ref: setTriggerNode, onClick: toggle, "aria-expanded": open, "aria-haspopup": true })}
      <Md3Provider>
        <MuiPopover
          open={open}
          anchorEl={anchor}
          onClose={close}
          anchorOrigin={{ vertical: "bottom", horizontal }}
          transformOrigin={{ vertical: "top", horizontal }}
          marginThreshold={8}
          slotProps={{
            paper: {
              role: "menu",
              className: `mn-popover-panel py-2 ${panelClassName}`,
              style: {
                marginTop: offset,
                ...(matchTriggerWidth ? { width } : { minWidth: minWidth ?? width }),
                maxWidth: "calc(100vw - 16px)",
              },
            },
          }}
        >
          {typeof children === "function" ? children({ close }) : children}
        </MuiPopover>
      </Md3Provider>
    </>
  );
}
