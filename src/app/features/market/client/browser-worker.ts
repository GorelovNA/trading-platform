import type { WorkerCallbacks, WorkerPort } from './worker-port';

export function createBrowserWorker(callbacks: WorkerCallbacks): WorkerPort {
  const worker = new Worker(new URL('../worker/market.worker', import.meta.url), {
    type: 'module',
  });
  const message = (event: MessageEvent<unknown>): void => {
    callbacks.message(event.data);
  };
  const error = (): void => {
    callbacks.error();
  };
  worker.addEventListener('message', message);
  worker.addEventListener('error', error);
  worker.addEventListener('messageerror', error);
  let terminated = false;
  return {
    post(command): void {
      if (terminated) throw new Error('WORKER_FAILED');
      worker.postMessage(command);
    },
    terminate(): void {
      if (terminated) return;
      terminated = true;
      worker.removeEventListener('message', message);
      worker.removeEventListener('error', error);
      worker.removeEventListener('messageerror', error);
      worker.terminate();
    },
  };
}
