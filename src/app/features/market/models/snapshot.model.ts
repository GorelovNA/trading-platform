import type { SnapshotValues } from './market.model';

export interface SnapshotMetadata {
  readonly runId: number;
  readonly sequence: number;
  readonly latestBatchEpochMs: number;
}

export interface DecodedSnapshot extends SnapshotMetadata, SnapshotValues {}
