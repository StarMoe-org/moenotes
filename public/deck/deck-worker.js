// Classic Worker for the deck solver, protocol moenotes.deck-worker/1 (docs/deck-worker.md). The core module next to
// this file downloads the files the init message names and runs the engine only after their sizes and SHA-256 match.
// A classic Worker loads ES modules, including the engine's wasm-bindgen glue, with dynamic import().
const deckWorker = import('./deck-worker-core.mjs').then(core => core.createDeckWorkerCore({ post: message => self.postMessage(message) }));

self.onmessage = event => {
  deckWorker.then(worker => worker.handle(event.data), error => {
    self.postMessage({ type: 'failed', code: 'init', message: 'Deck Worker core: ' + (error instanceof Error ? error.message : String(error)) });
  });
};
