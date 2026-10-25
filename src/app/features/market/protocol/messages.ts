import type { ControlAction, ErrorCode } from '../domain/market-models';
import type { ProducerSettings } from '../domain/producer-settings';

export type Command =
  | {
      readonly v: 1;
      readonly type: 'reset';
      readonly commandId: number;
      readonly runId: number;
      readonly settings: ProducerSettings;
      readonly seed: number;
    }
  | {
      readonly v: 1;
      readonly type: 'pause' | 'resume';
      readonly commandId: number;
      readonly runId: number;
    }
  | {
      readonly v: 1;
      readonly type: 'snapshot-ack';
      readonly runId: number;
      readonly sequence: number;
    }
  | { readonly v: 1; readonly type: 'dispose' };

export interface SnapshotTotals {
  readonly volume: bigint;
  readonly notionalCents: bigint;
}

export interface SnapshotMessage {
  readonly v: 1;
  readonly type: 'snapshot';
  readonly runId: number;
  readonly sequence: number;
  readonly rowCount: number;
  readonly generatedUpdates: bigint;
  readonly latestBatchEpochMs: number;
  readonly numeric: ArrayBuffer;
  readonly totals: readonly SnapshotTotals[];
}

export type WorkerEvent =
  | { readonly v: 1; readonly type: 'ready' }
  | {
      readonly v: 1;
      readonly type: 'command-ack';
      readonly commandId: number;
      readonly runId: number;
      readonly action: ControlAction;
      readonly outcome: 'applied' | 'ignored';
      readonly status: 'running' | 'paused';
    }
  | SnapshotMessage
  | {
      readonly v: 1;
      readonly type: 'error';
      readonly runId: number | null;
      readonly commandId: number | null;
      readonly code: ErrorCode;
    };

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: 'INVALID_PROTOCOL' };
