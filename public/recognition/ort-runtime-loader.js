/* Hash-locked onnxruntime-web WASM loader for a classic Worker. */
(function (scope) {
  'use strict';
  let runtimePromise, runtimeKey;
  const check = (control, phase) => control?.check(phase);
  const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  async function verified(record, control) {
    if (!record || !/^[a-f0-9]{64}$/.test(record.sha256) || !Number.isSafeInteger(record.bytes)) throw new Error('invalidRuntimeIdentity');
    check(control, 'runtimeFetch');
    const response = await fetch(record.url, { signal: control?.signal, credentials: 'omit' });
    if (!response.ok) throw new Error('runtimeHttp:' + response.status);
    const data = await response.arrayBuffer();
    if (data.byteLength !== record.bytes || await sha(data) !== record.sha256) throw new Error('runtimeHashMismatch');
    check(control, 'runtimeVerified');
    return data;
  }
  /** `runtime` maps glue, module and wasm to {url, sha256, bytes}. Returns ONNX Runtime configured for one thread. */
  scope.boxLensLoadOrt = async (runtime, control) => {
    const key = [runtime.glue, runtime.module, runtime.wasm].map(record => record.sha256).join(':');
    if (runtimePromise && key !== runtimeKey) throw new Error('runtimeChanged');
    if (!runtimePromise) {
      runtimeKey = key;
      runtimePromise = (async () => {
        const glue = await verified(runtime.glue, control), module = await verified(runtime.module, control), wasm = await verified(runtime.wasm, control);
        const glueUrl = URL.createObjectURL(new Blob([glue], { type: 'application/javascript' }));
        try { importScripts(glueUrl); } finally { URL.revokeObjectURL(glueUrl); }
        const ort = scope.ort;
        if (!ort?.InferenceSession) throw new Error('runtimeMissing');
        // The verified module Blob stays alive for ORT's dynamic import and later sessions.
        const moduleUrl = URL.createObjectURL(new Blob([module], { type: 'application/javascript' }));
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        ort.env.wasm.wasmPaths = { mjs: moduleUrl };
        ort.env.wasm.wasmBinary = new Uint8Array(wasm);
        ort.env.logLevel = 'error';
        return { ort, runtimeId: key };
      })();
      runtimePromise.catch(() => { runtimePromise = undefined; runtimeKey = undefined; });
    }
    const result = await runtimePromise;
    check(control, 'runtimeReady');
    return result;
  };
})(globalThis);
