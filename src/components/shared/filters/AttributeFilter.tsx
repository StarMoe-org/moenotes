import { FilterSection } from "@/components/shared/BaseFilters";
import FilterButton from "@/components/shared/FilterButton";
import { getCardTypeIconUrl, type CardType } from "@/lib/cards/assets";
import type { CommonFilterProps } from "./types";
import { toggleArrayItem } from "./utils";

export interface AttributeFilterProps<T extends string | number = CardType> extends CommonFilterProps {
  attributes: readonly T[];
  selectedAttributes: readonly T[];
  onChange?: (attributes: T[]) => void;
  onToggle?: (attribute: T) => void;
  onReset?: () => void;
  getIconUrl?: (attribute: T) => string;
  getAttributeLabel?: (attribute: T) => string;
}

export function AttributeFilter<T extends string | number = CardType>({
  title,
  attributes,
  selectedAttributes,
  onChange,
  onToggle,
  onReset,
  getIconUrl,
  getAttributeLabel,
  allLabel = "ALL",
  className,
}: AttributeFilterProps<T>) {
  const handleToggle = (attr: T) => {
    if (onToggle) {
      onToggle(attr);
    } else if (onChange) {
      onChange(toggleArrayItem(selectedAttributes, attr));
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
      <FilterButton active={selectedAttributes.length === 0} onClick={handleReset}>
        {allLabel}
      </FilterButton>
      {attributes.map((attr) => {
        const label = getAttributeLabel ? getAttributeLabel(attr) : String(attr);
        const iconUrl = getIconUrl
          ? getIconUrl(attr)
          : getCardTypeIconUrl(attr as unknown as CardType);
        return (
          <FilterButton
            key={String(attr)}
            active={selectedAttributes.includes(attr)}
            onClick={() => handleToggle(attr)}
          >
            <span className="flex items-center" title={label} aria-label={label}>
              <img className="h-5 w-5" src={iconUrl} alt={label} loading="lazy" />
            </span>
          </FilterButton>
        );
      })}
    </div>
  );

  if (title) {
    return <FilterSection title={title}>{content}</FilterSection>;
  }

  return content;
}
