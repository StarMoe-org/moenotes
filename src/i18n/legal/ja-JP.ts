import { enUS } from "./en-US";
import { LEGAL_UPDATED, type LegalTexts } from "./types";

/** Headings in this language; the document text is the English one until a reviewed translation is added. */
export const jaJP: LegalTexts = {
  updated: LEGAL_UPDATED,
  updatedLabel: "最終更新：{date}",
  draftNotice: "下書き（サイト管理者の確認待ち）。",
  documents: {
    license: { ...enUS.documents.license, title: "ライセンス" },
    terms: { ...enUS.documents.terms, title: "利用規約" },
    privacy: { ...enUS.documents.privacy, title: "プライバシー" },
  },
};
