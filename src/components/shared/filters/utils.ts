import { useState, useMemo, useCallback } from "react";

/**
 * Immutable toggle helper for array items:
 * If item exists in array, remove it; otherwise, append it.
 */
export function toggleArrayItem<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export interface BandCascadeCharacter {
  id: number;
  bandId: number;
  name: string;
}

export interface UseBandCharacterFilterOptions {
  initialBands?: number[];
  initialCharacters?: number[];
}

/**
 * Hook to manage band and character filter selection state with cascade cleanup:
 * - When bands change, filters out any selected characters whose band is no longer selected.
 * - When bands are cleared, clears characters as well.
 */
export function useBandCharacterFilter<T extends BandCascadeCharacter>(
  characters: readonly T[],
  options?: UseBandCharacterFilterOptions,
) {
  const [selectedBands, setSelectedBands] = useState<number[]>(options?.initialBands ?? []);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>(options?.initialCharacters ?? []);

  const bandCharacters = useMemo(() => {
    if (selectedBands.length === 0) return [];
    return characters.filter((c) => selectedBands.includes(c.bandId));
  }, [characters, selectedBands]);

  const handleBandToggle = useCallback(
    (bandId: number) => {
      setSelectedBands((prev) => {
        const nextBands = prev.includes(bandId)
          ? prev.filter((id) => id !== bandId)
          : [...prev, bandId];

        if (nextBands.length === 0) {
          setSelectedCharacters([]);
        } else {
          const validCharIds = new Set(
            characters.filter((c) => nextBands.includes(c.bandId)).map((c) => c.id),
          );
          setSelectedCharacters((curr) => curr.filter((id) => validCharIds.has(id)));
        }

        return nextBands;
      });
    },
    [characters],
  );

  const handleBandReset = useCallback(() => {
    setSelectedBands([]);
    setSelectedCharacters([]);
  }, []);

  const handleCharacterToggle = useCallback((charId: number) => {
    setSelectedCharacters((prev) => toggleArrayItem(prev, charId));
  }, []);

  const handleCharacterReset = useCallback(() => {
    setSelectedCharacters([]);
  }, []);

  return {
    selectedBands,
    setSelectedBands,
    selectedCharacters,
    setSelectedCharacters,
    bandCharacters,
    handleBandToggle,
    handleBandReset,
    handleCharacterToggle,
    handleCharacterReset,
  };
}
