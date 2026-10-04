/** Runtime selection for the proposed collection tool. This does not load a model or upload a screenshot. */
export interface DeckDataIdentity {
  region: string;
  masterVersion: string;
  deckDataSha256: string;
}

export interface DeckRuntimeCapabilities {
  /** Complete image decoding/localization/preprocessing/merge pipeline, beyond ONNX inference alone. */
  browserRecognition: boolean;
  onnxWasm: boolean;
  /** Recommendation export, clock and cancellation support have passed browser parity tests. */
  browserSolver: boolean;
  remoteRecognition: boolean;
  remoteSolver: boolean;
}

export interface DeckRuntimeConsent {
  uploadScreenshots: boolean;
  uploadRoster: boolean;
}

export interface DeckRuntimePlan {
  recognition: "onnx-wasm" | null;
  recommendation: "wasm-worker";
  uploads: { screenshots: false; roster: false };
}

/** Screenshots and solver inputs stay in the browser. A stored or manually entered box needs no
 * image-recognition runtime. Saving a box to an account is a separate, explicit action.
 */
export function planDeckRuntime(
  capabilities: DeckRuntimeCapabilities,
  _consent: DeckRuntimeConsent,
  options: { recognizeScreenshots: boolean } = { recognizeScreenshots: true },
): DeckRuntimePlan {
  const localRecognition = capabilities.browserRecognition && capabilities.onnxWasm;
  if (options.recognizeScreenshots && !localRecognition) {
    throw new Error("Screenshot recognition requires the supported browser runtime; use manual entry or box import");
  }
  if (!capabilities.browserSolver) {
    throw new Error("Recommendation requires the browser solver");
  }
  return { recognition: options.recognizeScreenshots ? "onnx-wasm" : null, recommendation: "wasm-worker", uploads: { screenshots: false, roster: false } };
}

export function assertDeckDataIdentity(roster: DeckDataIdentity, runtime: DeckDataIdentity): void {
  for (const identity of [roster, runtime]) {
    if (!identity.region || !identity.masterVersion || !/^[a-f0-9]{64}$/.test(identity.deckDataSha256)) {
      throw new Error("Incomplete collection/model dataset identity");
    }
  }
  if (roster.region !== runtime.region || roster.masterVersion !== runtime.masterVersion || roster.deckDataSha256 !== runtime.deckDataSha256) {
    throw new Error("Collection and runtime must bind the same region, master version and DeckData bytes");
  }
}

/** Carry exact solver JSON as UTF-8 text; JSON.parse/stringify would round integers above 2^53. */
export interface DeckWorkerRequest {
  protocol: "moenotes.deck-worker/1";
  jobId: string;
  inputRevision: number;
  identity: DeckDataIdentity;
  /** `ournotes.account/1` text (src/lib/deck/account-envelope.ts). */
  accountJson: string;
  requestJson: string;
}

export interface DeckWorkerReply {
  protocol: "moenotes.deck-worker/1";
  jobId: string;
  inputRevision: number;
  identity: DeckDataIdentity;
  /** `ournotes-deck.account-recommendation/1` text. */
  resultJson: string;
}

/** A changed screenshot, review or target invalidates an in-flight result, even if cancellation races. */
export function isCurrentDeckReply(request: DeckWorkerRequest, reply: DeckWorkerReply, currentRevision: number): boolean {
  if (request.protocol !== reply.protocol || request.jobId !== reply.jobId || request.inputRevision !== reply.inputRevision || currentRevision !== reply.inputRevision) return false;
  try { assertDeckDataIdentity(request.identity, reply.identity); } catch { return false; }
  return true;
}
