import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { ErrorCode, InstrumentMetrics, ProducerViewState } from '../domain/market-models';
import {
  DEFAULT_SETTINGS,
  validateSettings,
  type ProducerSettings,
  type Validation,
} from '../domain/producer-settings';
import type { Command, SnapshotMessage, WorkerEvent } from '../protocol/messages';
import {
  decodeSnapshot,
  validateSnapshotProgress,
  type DecodedSnapshot,
} from '../protocol/snapshot-codec';
import { parseWorkerEvent } from '../protocol/validate-event';
import { PRODUCER_ENVIRONMENT } from './producer-environment';
import type { WorkerPort } from './worker-port';

type Control = Extract<Command, { readonly commandId: number }>;
type Reset = Extract<Command, { readonly type: 'reset' }>;

function emptyMetrics(count: number): readonly InstrumentMetrics[] {
  return Object.freeze(
    Array.from({ length: count }, (_, instrumentId) =>
      Object.freeze({
        instrumentId,
        lastPriceCents: null,
        spreadCents: null,
        volume: 0n,
        vwap: null,
        imbalance: null,
      }),
    ),
  );
}

const FAILURE_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  UNSUPPORTED_BROWSER: 'This browser does not support the market producer.',
  WASM_LOAD_FAILED: 'The market generator could not load. Retry to start a new run.',
  INITIALIZATION_TIMEOUT:
    'The market generator took too long to initialize. Retry to start a new run.',
  COMMAND_TIMEOUT: 'The market producer did not respond. Retry to start a new run.',
  INVALID_PROTOCOL: 'The market producer returned an invalid message. Retry to start a new run.',
  INVALID_BATCH: 'The market generator returned invalid updates. Retry to start a new run.',
  GENERATOR_FAILED: 'The market generator stopped. Retry to start a new run.',
  WORKER_FAILED: 'The market worker stopped. Retry to start a new run.',
};

@Injectable({ providedIn: 'root' })
export class Producer {
  private readonly environment = inject(PRODUCER_ENVIRONMENT);
  private readonly view = signal<ProducerViewState>(
    Object.freeze({
      runId: 0,
      status: 'initializing',
      requestedSettings: DEFAULT_SETTINGS,
      activeSettings: null,
      metrics: emptyMetrics(DEFAULT_SETTINGS.instrumentCount),
      pendingAction: null,
      failure: null,
      stale: false,
      generatedUpdates: 0n,
      latestBatchEpochMs: null,
    }),
  );
  readonly state = this.view.asReadonly();
  readonly failureMessage = computed(() => {
    const failure = this.state().failure;
    return failure === null ? null : FAILURE_MESSAGES[failure.code];
  });
  private started = false;
  private destroyed = false;
  private runId = 0;
  private commandId = 0;
  private epoch = 0;
  private worker: WorkerPort | null = null;
  private ready = false;
  private inFlight: Control | null = null;
  private queuedReset: Reset | null = null;
  private previous: DecodedSnapshot | null = null;
  private pending: DecodedSnapshot | null = null;
  private frame: number | null = null;
  private frameToken = 0;
  private watchdog: number | null = null;
  private watchdogToken = 0;
  private removeVisibility: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroy();
    });
  }

  start(): void {
    if (this.started || this.destroyed) return;
    this.apply(DEFAULT_SETTINGS);
  }

  apply(input: unknown): Validation<ProducerSettings> {
    const validation = validateSettings(input);
    if (!validation.ok || this.destroyed) return validation;
    if (!this.started) {
      this.started = true;
      this.removeVisibility = this.environment.onVisibilityChange(() => {
        this.visibilityChanged();
      });
    }
    if (this.runId === Number.MAX_SAFE_INTEGER || this.commandId === Number.MAX_SAFE_INTEGER) {
      this.fail('INVALID_PROTOCOL', false);
      return validation;
    }
    const settings = Object.freeze(validation.value);
    const runId = ++this.runId;
    const commandId = ++this.commandId;
    this.discardFrame(true);
    this.previous = null;
    this.view.set(
      Object.freeze({
        runId,
        status: 'initializing',
        requestedSettings: settings,
        activeSettings: null,
        metrics: emptyMetrics(settings.instrumentCount),
        pendingAction: 'reset',
        failure: null,
        stale: false,
        generatedUpdates: 0n,
        latestBatchEpochMs: null,
      }),
    );
    if (!this.environment.supported()) {
      this.fail('UNSUPPORTED_BROWSER', false);
      return validation;
    }
    let seed: number;
    try {
      seed = this.environment.seed();
      if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)
        throw new Error('Invalid seed');
    } catch {
      this.fail('WORKER_FAILED');
      return validation;
    }
    this.queuedReset = { v: 1, type: 'reset', runId, commandId, settings, seed };
    if (this.worker === null) this.createWorker();
    this.dispatchReset();
    return validation;
  }

  pause(): void {
    this.control('pause');
  }
  resume(): void {
    this.control('resume');
  }

  retry(): void {
    if (this.state().status !== 'error' || this.state().failure?.retryable !== true) return;
    this.apply(this.state().requestedSettings);
  }

  private createWorker(): void {
    const epoch = ++this.epoch;
    try {
      this.worker = this.environment.createWorker({
        message: (input) => {
          if (epoch === this.epoch) this.receive(input);
        },
        error: () => {
          if (epoch === this.epoch) this.fail('WORKER_FAILED');
        },
      });
      this.armWatchdog();
    } catch {
      this.fail('WORKER_FAILED');
    }
  }

  private dispatchReset(): void {
    if (!this.ready || this.worker === null || this.inFlight !== null || this.queuedReset === null)
      return;
    const command = this.queuedReset;
    this.queuedReset = null;
    this.sendControl(command);
  }

  private control(action: 'pause' | 'resume'): void {
    const state = this.state();
    if (
      this.destroyed ||
      state.pendingAction !== null ||
      state.status !== (action === 'pause' ? 'running' : 'paused')
    )
      return;
    if (this.commandId === Number.MAX_SAFE_INTEGER) {
      this.fail('INVALID_PROTOCOL', false);
      return;
    }
    this.update({ pendingAction: action });
    this.sendControl({ v: 1, type: action, runId: state.runId, commandId: ++this.commandId });
  }

  private sendControl(command: Control): void {
    this.inFlight = command;
    this.post(command);
    this.armWatchdog();
  }

  private post(command: Command): void {
    try {
      this.worker?.post(command);
    } catch {
      this.fail('WORKER_FAILED');
    }
  }

  private receive(input: unknown): void {
    const parsed = parseWorkerEvent(input);
    if (!parsed.ok) {
      this.fail('INVALID_PROTOCOL');
      return;
    }
    const event = parsed.value;
    switch (event.type) {
      case 'ready':
        if (this.ready) {
          this.fail('INVALID_PROTOCOL');
          return;
        }
        this.ready = true;
        this.cancelWatchdog();
        this.dispatchReset();
        return;
      case 'error':
        this.fail(event.code);
        return;
      case 'command-ack':
        this.acknowledgeControl(event);
        return;
      case 'snapshot':
        if (!this.ready) {
          this.fail('INVALID_PROTOCOL');
          return;
        }
        this.acceptSnapshot(event);
        return;
    }
  }

  private acknowledgeControl(event: Extract<WorkerEvent, { readonly type: 'command-ack' }>): void {
    const command = this.inFlight;
    if (event.commandId !== command?.commandId) return;
    if (event.runId !== command.runId || event.action !== command.type) {
      this.fail('INVALID_PROTOCOL');
      return;
    }
    this.inFlight = null;
    this.cancelWatchdog();
    if (event.runId === this.state().runId) {
      const expected = command.type === 'pause' ? 'paused' : 'running';
      if (event.outcome !== 'applied' || event.status !== expected) {
        this.fail('INVALID_PROTOCOL');
        return;
      }
      this.update({
        status: event.status,
        pendingAction: null,
        activeSettings: this.state().requestedSettings,
      });
    }
    this.dispatchReset();
  }

  private acceptSnapshot(message: SnapshotMessage): void {
    const state = this.state();
    if (message.runId === this.pending?.runId && message.sequence === this.pending.sequence) return;
    if (message.runId !== state.runId || message.sequence <= (this.previous?.sequence ?? 0)) {
      this.ackSnapshot(message);
      return;
    }
    const decoded = decodeSnapshot(message);
    if (
      !decoded.ok ||
      !validateSnapshotProgress(
        decoded.value,
        { runId: state.runId, instrumentCount: state.requestedSettings.instrumentCount },
        this.previous,
      ) ||
      this.pending !== null
    ) {
      this.fail('INVALID_PROTOCOL');
      return;
    }
    this.previous = decoded.value;
    this.pending = decoded.value;
    if (this.environment.hidden()) {
      this.commitPending();
      return;
    }
    const epoch = this.epoch;
    const token = ++this.frameToken;
    this.frame = this.environment.frames.request(() => {
      if (epoch !== this.epoch || token !== this.frameToken) return;
      this.frame = null;
      this.commitPending();
    });
  }

  private commitPending(): void {
    const snapshot = this.pending;
    this.pending = null;
    if (snapshot === null) return;
    if (snapshot.runId === this.state().runId && snapshot.sequence === this.previous?.sequence) {
      this.update({
        metrics: snapshot.metrics,
        generatedUpdates: snapshot.generatedUpdates,
        latestBatchEpochMs: snapshot.latestBatchEpochMs,
        stale: false,
      });
    }
    this.ackSnapshot(snapshot);
  }

  private ackSnapshot(snapshot: { readonly runId: number; readonly sequence: number }): void {
    this.post({ v: 1, type: 'snapshot-ack', runId: snapshot.runId, sequence: snapshot.sequence });
  }

  private discardFrame(acknowledge: boolean): void {
    this.frameToken++;
    if (this.frame !== null) this.environment.frames.cancel(this.frame);
    this.frame = null;
    const pending = this.pending;
    this.pending = null;
    if (acknowledge && pending !== null) this.ackSnapshot(pending);
  }

  private visibilityChanged(): void {
    if (this.environment.hidden()) {
      if (this.frame !== null) this.environment.frames.cancel(this.frame);
      this.frame = null;
      this.frameToken++;
      this.commitPending();
      this.cancelWatchdog();
    } else {
      this.armWatchdog();
    }
  }

  private armWatchdog(): void {
    this.cancelWatchdog();
    if (this.worker === null || this.environment.hidden() || (this.ready && this.inFlight === null))
      return;
    const code = this.ready ? 'COMMAND_TIMEOUT' : 'INITIALIZATION_TIMEOUT';
    const epoch = this.epoch;
    const token = this.watchdogToken;
    this.watchdog = this.environment.timers.schedule(this.ready ? 5_000 : 15_000, () => {
      if (epoch !== this.epoch || token !== this.watchdogToken || this.environment.hidden()) return;
      this.watchdog = null;
      this.fail(code);
    });
  }

  private cancelWatchdog(): void {
    this.watchdogToken++;
    if (this.watchdog !== null) this.environment.timers.cancel(this.watchdog);
    this.watchdog = null;
  }

  private fail(code: ErrorCode, retryable = true): void {
    this.retire();
    this.update({
      status: 'error',
      pendingAction: null,
      failure: Object.freeze({ code, retryable }),
      stale: true,
    });
  }

  private retire(): void {
    this.epoch++;
    this.cancelWatchdog();
    this.discardFrame(false);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.inFlight = null;
    this.queuedReset = null;
    this.previous = null;
  }

  private destroy(): void {
    this.destroyed = true;
    // Disposal is advisory; termination does not wait for a worker acknowledgement.
    try {
      this.worker?.post({ v: 1, type: 'dispose' });
    } catch {
      /* Already broken transport. */
    }
    this.retire();
    this.removeVisibility?.();
    this.removeVisibility = null;
    this.update({ status: 'disposed', pendingAction: null });
  }

  private update(changes: Partial<ProducerViewState>): void {
    this.view.update((state) => Object.freeze({ ...state, ...changes }));
  }
}
