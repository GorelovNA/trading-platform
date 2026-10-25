import { DOCUMENT } from '@angular/common';
import { InjectionToken, inject } from '@angular/core';
import { createBrowserWorker } from './browser-worker.helper';
import { browserFrames } from './frame-scheduler';
import type { ProducerEnvironment } from '../models/worker-contracts.model';

export const PRODUCER_ENVIRONMENT = new InjectionToken<ProducerEnvironment>(
  'Producer environment',
  {
    providedIn: 'root',
    factory: (): ProducerEnvironment => {
      const document = inject(DOCUMENT);
      return {
        timers: {
          schedule: (delay, callback): number => window.setTimeout(callback, delay),
          cancel: (handle): void => {
            window.clearTimeout(handle);
          },
        },
        frames: browserFrames,
        supported: (): boolean =>
          typeof Worker !== 'undefined' &&
          typeof WebAssembly !== 'undefined' &&
          typeof crypto !== 'undefined' &&
          typeof crypto.getRandomValues === 'function' &&
          typeof requestAnimationFrame === 'function',
        createWorker: createBrowserWorker,
        seed: (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0,
        hidden: (): boolean => document.hidden,
        onVisibilityChange(callback): () => void {
          document.addEventListener('visibilitychange', callback);
          return (): void => {
            document.removeEventListener('visibilitychange', callback);
          };
        },
      };
    },
  },
);
