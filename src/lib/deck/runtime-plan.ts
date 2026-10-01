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
  onnxWebGpu: boolean;
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
  recognition: "onnx-wasm" | "onnx-webgpu" | "remote";
  recommendation: "wasm-worker" | "remote";
  uploads: { screenshots: boolean; roster: boolean };
}

/** Unavailable local capabilities never implicitly authorize sending private inputs to a service. */
export function planDeckRuntime(
  capabilities: DeckRuntimeCapabilities,
  consent: DeckRuntimeConsent,
  preferWebGpu = false,
): DeckRuntimePlan {
  const localRecognition = capabilities.browserRecognition && (capabilities.onnxWasm || capabilities.onnxWebGpu);
  if (!localRecognition && !(capabilities.remoteRecognition && consent.uploadScreenshots)) {
    throw new Error("Recognition requires a supported local runtime or explicit screenshot upload consent");
  }
  if (!capabilities.browserSolver && !(capabilities.remoteSolver && consent.uploadRoster)) {
    throw new Error("Recommendation requires a supported local runtime or explicit roster upload consent");
  }
  const recognition = !localRecognition ? "remote"
    : capabilities.onnxWebGpu && (preferWebGpu || !capabilities.onnxWasm) ? "onnx-webgpu" : "onnx-wasm";
  const recommendation = capabilities.browserSolver ? "wasm-worker" : "remote";
  return { recognition, recommendation, uploads: { screenshots: recognition === "remote", roster: recommendation === "remote" } };
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
  rosterJson: string;
  requestJson: string;
}

export interface DeckWorkerReply {
  protocol: "moenotes.deck-worker/1";
  jobId: string;
  inputRevision: number;
  identity: DeckDataIdentity;
  resultJson: string;
}

/** A changed screenshot, review or target invalidates an in-flight result, even if cancellation races. */
export function isCurrentDeckReply(request: DeckWorkerRequest, reply: DeckWorkerReply, currentRevision: number): boolean {
  if (request.protocol !== reply.protocol || request.jobId !== reply.jobId || request.inputRevision !== reply.inputRevision || currentRevision !== reply.inputRevision) return false;
  try { assertDeckDataIdentity(request.identity, reply.identity); } catch { return false; }
  return true;
}
