import { FilterSection } from "@/components/shared/BaseFilters";
import FilterButton from "@/components/shared/FilterButton";
import { getRarityIconUrl, type CardRarity } from "@/lib/cards/assets";
import type { CommonFilterProps } from "./types";
import { toggleArrayItem } from "./utils";

export interface RarityFilterProps<T extends string | number = CardRarity> extends CommonFilterProps {
  rarities: readonly T[];
  selectedRarities: readonly T[];
  onChange?: (rarities: T[]) => void;
  onToggle?: (rarity: T) => void;
  onReset?: () => void;
  getIconUrl?: (rarity: T) => string;
  getRarityLabel?: (rarity: T) => string;
}

export function RarityFilter<T extends string | number = CardRarity>({
  title,
  rarities,
  selectedRarities,
  onChange,
  onToggle,
  onReset,
  getIconUrl,
  getRarityLabel,
  allLabel = "ALL",
  className,
}: RarityFilterProps<T>) {
  const handleToggle = (r: T) => {
    if (onToggle) {
      onToggle(r);
    } else if (onChange) {
      onChange(toggleArrayItem(selectedRarities, r));
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
      <FilterButton active={selectedRarities.length === 0} onClick={handleReset}>
        {allLabel}
      </FilterButton>
      {rarities.map((r) => {
        const label = getRarityLabel ? getRarityLabel(r) : String(r);
        const iconUrl = getIconUrl
          ? getIconUrl(r)
          : getRarityIconUrl(r as unknown as CardRarity);
        return (
          <FilterButton
            key={String(r)}
            active={selectedRarities.includes(r)}
            onClick={() => handleToggle(r)}
          >
            <span className="flex items-center" title={label} aria-label={label}>
              {iconUrl ? <img className="h-5 w-auto" src={iconUrl} alt={label} loading="lazy" /> : label}
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
