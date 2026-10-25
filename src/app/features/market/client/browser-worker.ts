import { InjectionToken } from '@angular/core';

export interface IntegrationProof {
  readonly result: Promise<number>;
  dispose(): void;
}

export function startIntegrationProof(): IntegrationProof {
  let worker: Worker | undefined;
  let cancel: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = new Promise<number>((resolve, reject) => {
    cancel = (): void => {
      reject(new Error('Worker integration disposed.'));
    };
    worker = new Worker(new URL('../worker/market.worker', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<unknown>): void => {
      const message = event.data;
      if (
        typeof message === 'object' &&
        message !== null &&
        'kind' in message &&
        message.kind === 'ready' &&
        'version' in message &&
        message.version === 1
      ) {
        resolve(message.version);
      } else {
        reject(new Error('Worker integration failed.'));
      }
    };
    worker.onerror = (): void => {
      reject(new Error('Worker could not start.'));
    };
    worker.onmessageerror = (): void => {
      reject(new Error('Worker message could not be read.'));
    };
    timer = setTimeout(() => {
      reject(new Error('Worker initialization timed out.'));
    }, 15_000);
  });
  const dispose = (): void => {
    clearTimeout(timer);
    worker?.terminate();
    worker = undefined;
    cancel?.();
  };
  return { result: result.finally(dispose), dispose };
}

export const INTEGRATION_PROOF = new InjectionToken<() => IntegrationProof>('Integration proof', {
  providedIn: 'root',
  factory: (): typeof startIntegrationProof => startIntegrationProof,
});
