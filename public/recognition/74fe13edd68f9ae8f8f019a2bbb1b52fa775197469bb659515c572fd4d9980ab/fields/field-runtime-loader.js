/* Hash-locked onnxruntime-web WASM loader for a classic Worker. */
(function (scope) {
  'use strict';
  let runtimePromise, runtimeKey;
  const check = (control, phase) => control?.check(phase);
  const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  async function verified(record, control) {
    if (!record || !/^[a-f0-9]{64}$/.test(record.sha256) || !Number.isSafeInteger(record.size)) throw new Error('Invalid field runtime identity');
    check(control, 'field-runtime-before-fetch');
    const response = await fetch(record.url, { signal: control?.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error('Field runtime download failed');
    const data = await response.arrayBuffer();
    if (data.byteLength !== record.size || await sha(data) !== record.sha256) throw new Error('Field runtime source mismatch');
    check(control, 'field-runtime-verified');
    return data;
  }
  scope.boxLensLoadFieldRuntime = async (configuration, control) => {
    const records = configuration.runtime;
    const key = [records.glue, records.module, records.wasm].map(record => record.sha256).join(':');
    if (runtimePromise && key !== runtimeKey) throw new Error('Field runtime changed inside one Worker');
    if (!runtimePromise) {
      runtimeKey = key;
      runtimePromise = (async () => {
        const glue = await verified(records.glue, control), module = await verified(records.module, control), wasm = await verified(records.wasm, control);
        const glueUrl = URL.createObjectURL(new Blob([glue], { type: 'application/javascript' }));
        try { importScripts(glueUrl); } finally { URL.revokeObjectURL(glueUrl); }
        if (!scope.ort?.InferenceSession) throw new Error('Actual ORT runtime was not loaded');
        const moduleUrl = URL.createObjectURL(new Blob([module], { type: 'application/javascript' }));
        // Keep the verified module Blob alive for ORT's dynamic import and future sessions.
        return { ort: scope.ort, runtimeId: key, wasmBase: 'verified-blob-runtime', wasmPaths: { mjs: moduleUrl }, wasmBinary: new Uint8Array(wasm) };
      })();
      runtimePromise.catch(() => { runtimePromise = undefined; runtimeKey = undefined; });
    }
    const result = await runtimePromise;
    check(control, 'field-runtime-ready');
    return result;
  };
})(globalThis);
