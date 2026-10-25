import type { ProducerSettings } from './producer-settings.model';

export interface ExactPrice {
  readonly numeratorCents: bigint;
  readonly denominator: bigint;
}

export interface InstrumentMetrics {
  readonly instrumentId: number;
  readonly lastPriceCents: number | null;
  readonly spreadCents: number | null;
  readonly volume: bigint;
  readonly vwap: ExactPrice | null;
  readonly imbalance: number | null;
}

export interface SnapshotValues {
  readonly generatedUpdates: bigint;
  readonly metrics: readonly InstrumentMetrics[];
}

export enum ProducerStatus {
  Initializing = 'initializing',
  Running = 'running',
  Paused = 'paused',
  Error = 'error',
  Disposed = 'disposed',
}

export enum ControlAction {
  Reset = 'reset',
  Pause = 'pause',
  Resume = 'resume',
}

export enum ErrorCode {
  UnsupportedBrowser = 'UNSUPPORTED_BROWSER',
  WasmLoadFailed = 'WASM_LOAD_FAILED',
  InitializationTimeout = 'INITIALIZATION_TIMEOUT',
  CommandTimeout = 'COMMAND_TIMEOUT',
  InvalidProtocol = 'INVALID_PROTOCOL',
  InvalidBatch = 'INVALID_BATCH',
  GeneratorFailed = 'GENERATOR_FAILED',
  WorkerFailed = 'WORKER_FAILED',
}

export interface ProducerFailure {
  readonly code: ErrorCode;
  readonly retryable: boolean;
}

export interface ProducerViewState {
  readonly runId: number;
  readonly status: ProducerStatus;
  readonly requestedSettings: ProducerSettings;
  readonly activeSettings: ProducerSettings | null;
  readonly metrics: readonly InstrumentMetrics[];
  readonly pendingAction: ControlAction | null;
  readonly failure: ProducerFailure | null;
  readonly stale: boolean;
  readonly generatedUpdates: bigint;
  readonly latestBatchEpochMs: number | null;
}
