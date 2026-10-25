import { loadProtocol } from './wasm-generator';

// One-shot bootstrap proof, replaced by the controller in step 4.
const controller = new AbortController();
void loadProtocol(controller.signal).then(
  (version) => {
    postMessage({ kind: 'ready', version });
  },
  () => {
    postMessage({ kind: 'error' });
  },
);
