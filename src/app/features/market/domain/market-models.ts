import type { ProducerSettings } from './producer-settings';

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

export type ProducerStatus = 'initializing' | 'running' | 'paused' | 'error' | 'disposed';
export type ControlAction = 'reset' | 'pause' | 'resume';

export type ErrorCode =
  | 'UNSUPPORTED_BROWSER'
  | 'WASM_LOAD_FAILED'
  | 'INITIALIZATION_TIMEOUT'
  | 'COMMAND_TIMEOUT'
  | 'INVALID_PROTOCOL'
  | 'INVALID_BATCH'
  | 'GENERATOR_FAILED'
  | 'WORKER_FAILED';

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
}
