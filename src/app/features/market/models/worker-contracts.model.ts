import type { Command } from './protocol.model';

export enum WorkerPhase {
  Loading = 'loading',
  Idle = 'idle',
  Running = 'running',
  Paused = 'paused',
  Failed = 'failed',
  Disposed = 'disposed',
}

export interface Clock {
  now(): number;
  epochNow(): number;
}

export interface TimerScheduler {
  schedule(delayMs: number, callback: () => void): number;
  cancel(handle: number): void;
}

export interface WorkerCallbacks {
  message(input: unknown): void;
  error(): void;
}

export interface WorkerPort {
  post(command: Command): void;
  terminate(): void;
}

export interface GeneratorPort {
  readonly generateBatch: (count: number) => Uint32Array;
  readonly dispose: () => void;
}

export interface GeneratorFactory {
  readonly initialize: (signal: AbortSignal) => Promise<void>;
  readonly create: (instrumentCount: number, seed: number) => GeneratorPort;
}

export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface ProducerEnvironment {
  readonly timers: TimerScheduler;
  readonly frames: FrameScheduler;
  supported(): boolean;
  createWorker(callbacks: WorkerCallbacks): WorkerPort;
  readonly seed: () => number;
  hidden(): boolean;
  onVisibilityChange(callback: () => void): () => void;
}
