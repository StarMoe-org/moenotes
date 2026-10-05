export type RecognitionErrorCode = "configuration" | "manifestFetch" | "manifestHash" | "manifestFormat" | "catalogBinding" | "imageType" | "imageDecode" | "worker" | "timeLimit";

export class RecognitionError extends Error {
  constructor(readonly code: RecognitionErrorCode, readonly detail = "") {
    super(`${code}${detail ? `: ${detail}` : ""}`);
    this.name = "RecognitionError";
  }
}
