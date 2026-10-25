import type { SnapshotValues } from './market.model';
import type { ControlAction } from './market.model';
import type { ErrorCode } from './market.model';
import type { ProducerSettings } from './producer-settings.model';

export enum CommandType {
  Reset = 'reset',
  Pause = 'pause',
  Resume = 'resume',
  SnapshotAck = 'snapshot-ack',
  Dispose = 'dispose',
}

export enum WorkerEventType {
  Ready = 'ready',
  CommandAck = 'command-ack',
  Snapshot = 'snapshot',
  Error = 'error',
}

export enum CommandOutcome {
  Applied = 'applied',
  Ignored = 'ignored',
}

export enum WorkerStatus {
  Running = 'running',
  Paused = 'paused',
}

export type Command =
  | {
      readonly v: 1;
      readonly type: CommandType.Reset;
      readonly commandId: number;
      readonly runId: number;
      readonly settings: ProducerSettings;
      readonly seed: number;
    }
  | {
      readonly v: 1;
      readonly type: CommandType.Pause | CommandType.Resume;
      readonly commandId: number;
      readonly runId: number;
    }
  | {
      readonly v: 1;
      readonly type: CommandType.SnapshotAck;
      readonly runId: number;
      readonly sequence: number;
    }
  | { readonly v: 1; readonly type: CommandType.Dispose };

export interface SnapshotMessage extends SnapshotValues {
  readonly v: 1;
  readonly type: WorkerEventType.Snapshot;
  readonly runId: number;
  readonly sequence: number;
  readonly latestBatchEpochMs: number;
}

export type WorkerEvent =
  | { readonly v: 1; readonly type: WorkerEventType.Ready }
  | {
      readonly v: 1;
      readonly type: WorkerEventType.CommandAck;
      readonly commandId: number;
      readonly runId: number;
      readonly action: ControlAction;
      readonly outcome: CommandOutcome;
      readonly status: WorkerStatus;
    }
  | SnapshotMessage
  | {
      readonly v: 1;
      readonly type: WorkerEventType.Error;
      readonly runId: number | null;
      readonly commandId: number | null;
      readonly code: ErrorCode;
    };

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ErrorCode.InvalidProtocol };
