import { enUS } from "./en-US";
import { LEGAL_UPDATED, type LegalTexts } from "./types";

/** Headings in this language; the document text is the English one until a reviewed translation is added. */
export const koKR: LegalTexts = {
  updated: LEGAL_UPDATED,
  updatedLabel: "최종 업데이트: {date}",
  draftNotice: "초안, 사이트 관리자 검토 대기 중.",
  documents: {
    license: { ...enUS.documents.license, title: "라이선스" },
    terms: { ...enUS.documents.terms, title: "이용 약관" },
    privacy: { ...enUS.documents.privacy, title: "개인정보" },
  },
};
