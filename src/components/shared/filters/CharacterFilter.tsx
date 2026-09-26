import { FilterSection } from "@/components/shared/BaseFilters";
import FilterButton from "@/components/shared/FilterButton";
import { getCharacterFaceIconUrl } from "@/lib/cards/assets";
import type { CharacterOption, CommonFilterProps } from "./types";
import { toggleArrayItem } from "./utils";

export interface CharacterFilterProps extends CommonFilterProps {
  characters: readonly CharacterOption[];
  selectedCharacters: readonly number[];
  onChange?: (characters: number[]) => void;
  onToggle?: (characterId: number) => void;
  onReset?: () => void;
  hideWhenEmpty?: boolean;
  /** The leading ALL button (default true); a single-choice picker made of several groups leaves it out. */
  showAll?: boolean;
}

export function CharacterFilter({
  title,
  characters,
  selectedCharacters,
  onChange,
  onToggle,
  onReset,
  allLabel = "ALL",
  hideWhenEmpty = true,
  showAll = true,
  className,
}: CharacterFilterProps) {
  if (hideWhenEmpty && characters.length === 0) {
    return null;
  }

  const handleToggle = (id: number) => {
    if (onToggle) {
      onToggle(id);
    } else if (onChange) {
      onChange(toggleArrayItem(selectedCharacters, id));
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
      {showAll && (
        <FilterButton active={selectedCharacters.length === 0} onClick={handleReset}>
          {allLabel}
        </FilterButton>
      )}
      {characters.map((char) => (
        <FilterButton
          key={char.id}
          active={selectedCharacters.includes(char.id)}
          onClick={() => handleToggle(char.id)}
        >
          <span className="flex items-center" title={char.name} aria-label={char.name}>
            <img
              className="h-5 w-5 rounded-full object-cover bg-[var(--mn-cream-deep)]"
              src={char.faceIconUrl ?? getCharacterFaceIconUrl(char.id)}
              alt={char.name}
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
