export interface BandOption {
  id: number;
  name: string;
  iconUrl?: string;
}

export type BandInputOption = BandOption | [number, string] | number;

export interface CharacterOption {
  id: number;
  name: string;
  faceIconUrl?: string;
}

export interface CommonFilterProps {
  /** Optional section header title */
  title?: string;
  /** Label for the ALL button, defaults to "ALL" */
  allLabel?: string;
  /** Optional extra class name for container */
  className?: string;
}
