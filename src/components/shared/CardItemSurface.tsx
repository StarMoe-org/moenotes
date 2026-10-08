import type { ReactNode } from "react";
import CardActionArea from "@mui/material/CardActionArea";
import { MdMuiProvider } from "@/components/md3/MuiProvider";

export interface CardItemSelection {
  selected: boolean;
  disabled?: boolean | undefined;
  label: string;
  onSelect: () => void;
}

/** List cards keep their detail link; a picker uses the same card as a native button. */
export default function CardItemSurface({ href, onClick, selection, className, cardId, label, children }: {
  href: string; onClick?: (() => void) | undefined; selection?: CardItemSelection | undefined;
  className: string; cardId: number; label: string; children: ReactNode;
}) {
  return (
    <MdMuiProvider>
      {selection ? (
        <CardActionArea
          component="button"
          type="button"
          className={className}
          data-list-item-id={cardId}
          aria-label={selection.label}
          aria-pressed={selection.selected}
          disabled={selection.disabled}
          onClick={selection.onSelect}
        >
          {children}
        </CardActionArea>
      ) : (
        <CardActionArea
          component="a"
          href={href}
          onClick={onClick}
          className={className}
          data-list-item-id={cardId}
          aria-label={label}
        >
          {children}
        </CardActionArea>
      )}
    </MdMuiProvider>
  );
}
