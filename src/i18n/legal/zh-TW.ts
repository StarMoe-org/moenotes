import { enUS } from "./en-US";
import { LEGAL_UPDATED, type LegalTexts } from "./types";

/** Headings in this language; the document text is the English one until a reviewed translation is added. */
export const zhTW: LegalTexts = {
  updated: LEGAL_UPDATED,
  updatedLabel: "最後更新：{date}",
  draftNotice: "草稿，待站長審閱。",
  documents: {
    license: { ...enUS.documents.license, title: "授權" },
    terms: { ...enUS.documents.terms, title: "使用條款" },
    privacy: { ...enUS.documents.privacy, title: "隱私" },
  },
};
