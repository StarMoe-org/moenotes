import { useMemo } from "react";
import { FilterSection } from "@/components/shared/BaseFilters";
import FilterButton from "@/components/shared/FilterButton";
import { getBandSmallIconUrl } from "@/lib/cards/assets";
import type { BandInputOption, CommonFilterProps } from "./types";
import { toggleArrayItem } from "./utils";

export interface BandFilterProps extends CommonFilterProps {
  bands: readonly BandInputOption[];
  selectedBands: readonly number[];
  onChange?: (bands: number[]) => void;
  onToggle?: (bandId: number) => void;
  onReset?: () => void;
  getBandName?: (bandId: number) => string;
  getIconUrl?: (bandId: number) => string;
}

export function BandFilter({
  title,
  bands,
  selectedBands,
  onChange,
  onToggle,
  onReset,
  getBandName,
  getIconUrl,
  allLabel = "ALL",
  className,
}: BandFilterProps) {
  const normalizedBands = useMemo(() => {
    return bands.map((b) => {
      if (typeof b === "number") {
        return {
          id: b,
          name: getBandName ? getBandName(b) : `Band ${b}`,
          iconUrl: getIconUrl ? getIconUrl(b) : getBandSmallIconUrl(b),
        };
      }
      if (Array.isArray(b)) {
        return {
          id: b[0],
          name: b[1],
          iconUrl: getIconUrl ? getIconUrl(b[0]) : getBandSmallIconUrl(b[0]),
        };
      }
      return {
        id: b.id,
        name: b.name,
        iconUrl: b.iconUrl ?? (getIconUrl ? getIconUrl(b.id) : getBandSmallIconUrl(b.id)),
      };
    });
  }, [bands, getBandName, getIconUrl]);

  const handleToggle = (id: number) => {
    if (onToggle) {
      onToggle(id);
    } else if (onChange) {
      onChange(toggleArrayItem(selectedBands, id));
    }
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
    } else if (onChange) {
      onChange([]);
    }
  };

  const content = (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      <FilterButton active={selectedBands.length === 0} onClick={handleReset}>
        {allLabel}
      </FilterButton>
      {normalizedBands.map((band) => (
        <FilterButton
          key={band.id}
          active={selectedBands.includes(band.id)}
          onClick={() => handleToggle(band.id)}
        >
          <span className="flex items-center" title={band.name} aria-label={band.name}>
            <img
              className="h-5 w-auto object-contain"
              src={band.iconUrl}
              alt={band.name}
              loading="lazy"
            />
          </span>
        </FilterButton>
      ))}
    </div>
  );

  if (title) {
    return <FilterSection title={title}>{content}</FilterSection>;
  }

  return content;
}
