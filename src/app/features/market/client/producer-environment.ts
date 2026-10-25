import { DOCUMENT } from '@angular/common';
import { InjectionToken, inject } from '@angular/core';
import type { TimerScheduler } from '../domain/scheduling';
import { createBrowserWorker } from './browser-worker';
import { browserFrames, type FrameScheduler } from './frame-scheduler';
import type { WorkerCallbacks, WorkerPort } from './worker-port';

export interface ProducerEnvironment {
  readonly timers: TimerScheduler;
  readonly frames: FrameScheduler;
  supported(): boolean;
  createWorker(callbacks: WorkerCallbacks): WorkerPort;
  readonly seed: () => number;
  hidden(): boolean;
  onVisibilityChange(callback: () => void): () => void;
}

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
