/** Shapes of the legal documents (see index.ts). */
export type LegalDocumentId = "license" | "terms" | "privacy";

export interface LegalSection {
  title: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
}

export interface LegalDocumentText {
  title: string;
  sections: readonly LegalSection[];
}

export interface LegalTexts {
  /** ISO date of the last change of these documents. */
  updated: string;
  updatedLabel: string;
  draftNotice: string;
  documents: Record<LegalDocumentId, LegalDocumentText>;
}

/** Last change of the legal documents (all languages). */
export const LEGAL_UPDATED = "2026-10-05";
