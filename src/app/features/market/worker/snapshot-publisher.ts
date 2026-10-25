import type { Clock, TimerScheduler } from '../models/worker-contracts.model';
import type { SnapshotValues } from '../models/market.model';
import type { SnapshotMessage } from '../models/protocol.model';
import { WorkerEventType } from '../models/protocol.model';

export const PUBLISH_INTERVAL_MS = 50;

// Keep only a dirty bit while a receiver holds the single outstanding snapshot.
export class SnapshotPublisher {
  private outstanding: { readonly runId: number; readonly sequence: number } | null = null;
  private timer: number | null = null;
  private token = 0;
  private runId = 0;
  private sequence = 0;
  private dirty = false;
  private flush = false;
  private lastSend = -Infinity;
  private latestBatchEpochMs = 0;

  constructor(
    private readonly clock: Clock,
    private readonly timers: TimerScheduler,
    private readonly capture: () => SnapshotValues,
    private readonly send: (snapshot: SnapshotMessage) => void,
    private readonly fail: () => void,
  ) {}

  reset(runId: number): void {
    this.stop();
    this.runId = runId;
    this.sequence = 0;
    this.lastSend = -Infinity;
    this.latestBatchEpochMs = 0;
  }

  markDirty(latestBatchEpochMs: number): void {
    this.dirty = true;
    this.latestBatchEpochMs = latestBatchEpochMs;
    this.publish();
  }

  flushFinal(): void {
    if (!this.dirty) return;
    this.flush = true;
    this.publish();
  }

  acknowledge(runId: number, sequence: number): void {
    if (this.outstanding?.runId !== runId || this.outstanding.sequence !== sequence) return;
    this.outstanding = null;
    this.publish();
  }

  stop(): void {
    this.token++;
    if (this.timer !== null) this.timers.cancel(this.timer);
    this.timer = null;
    this.outstanding = null;
    this.dirty = false;
    this.flush = false;
  }

  private publish(): void {
    if (!this.dirty || this.outstanding !== null) return;
    const remaining = PUBLISH_INTERVAL_MS - (this.clock.now() - this.lastSend);
    if (!this.flush && remaining > 0) {
      if (this.timer === null) {
        const token = this.token;
        this.timer = this.timers.schedule(remaining, () => {
          if (token !== this.token) return;
          this.timer = null;
          this.publish();
        });
      }
      return;
    }
    if (this.timer !== null) this.timers.cancel(this.timer);
    this.timer = null;
    // Invalidate even a cancelled publication callback already queued by the host.
    this.token++;
    if (this.sequence === Number.MAX_SAFE_INTEGER) {
      this.stop();
      this.fail();
      return;
    }
    try {
      const sequence = ++this.sequence;
      const snapshot: SnapshotMessage = {
        v: 1,
        type: WorkerEventType.Snapshot,
        ...this.capture(),
        runId: this.runId,
        sequence,
        latestBatchEpochMs: this.latestBatchEpochMs,
      };
      this.outstanding = { runId: this.runId, sequence };
      this.dirty = false;
      this.flush = false;
      this.lastSend = this.clock.now();
      this.send(snapshot);
    } catch {
      this.stop();
      this.fail();
    }
  }
}
