export interface ListPageMemoryState {
  scrollY?: number;
  displayCount?: number;
  filtersHash?: string;
  focusedItemId?: string;
  virtualOffset?: number;
  updatedAt: number;
}

export interface SaveListPageMemoryState {
  scrollY?: number;
  displayCount?: number;
  filtersHash?: string;
  focusedItemId?: string;
  virtualOffset?: number;
}
