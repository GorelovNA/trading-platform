import { ControlAction, ErrorCode } from '../models/market.model';
import { MetricAccumulator } from '../domain/metric-accumulator';
import type { ProducerSettings } from '../models/producer-settings.model';
import type { Clock, TimerScheduler } from '../models/worker-contracts.model';
import {
  CommandOutcome,
  CommandType,
  WorkerEventType,
  WorkerStatus,
  type Command,
  type WorkerEvent,
} from '../models/protocol.model';
import { parseCommand } from '../protocol/validate-command.helper';
import type { GeneratorFactory, GeneratorPort } from '../models/worker-contracts.model';
import { SnapshotPublisher } from './snapshot-publisher';

import { WorkerPhase } from '../models/worker-contracts.model';
type Control = Extract<Command, { readonly commandId: number }>;

export class WorkerController {
  private phase: WorkerPhase = WorkerPhase.Loading;
  private started = false;
  private readonly abort = new AbortController();
  private readonly publisher: SnapshotPublisher;
  private generator: GeneratorPort | null = null;
  private accumulator: MetricAccumulator | null = null;
  private settings: ProducerSettings | null = null;
  private runId = 0;
  private commandId = 0;
  private generationToken = 0;
  private timer: number | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly timers: TimerScheduler,
    private readonly factory: GeneratorFactory,
    private readonly output: (event: WorkerEvent, transfer: Transferable[]) => void,
    private readonly close: () => void,
  ) {
    this.publisher = new SnapshotPublisher(
      clock,
      timers,
      () => {
        if (this.accumulator === null) throw new Error(ErrorCode.InvalidProtocol);
        return this.accumulator.snapshotValues();
      },
      (snapshot) => {
        this.emit(snapshot, [snapshot.numeric]);
      },
      () => {
        this.fail(ErrorCode.InvalidProtocol);
      },
    );
  }

  async start(): Promise<void> {
    if (this.started || this.phase !== WorkerPhase.Loading) return;
    this.started = true;
    try {
      await this.factory.initialize(this.abort.signal);
      if (this.abort.signal.aborted) return;
      this.phase = WorkerPhase.Idle;
      this.emit({ v: 1, type: WorkerEventType.Ready });
    } catch {
      this.fail(ErrorCode.WasmLoadFailed);
    }
  }

  receive(input: unknown): void {
    if (this.phase === WorkerPhase.Disposed) return;
    const parsed = parseCommand(input);
    if (!parsed.ok) {
      this.fail(ErrorCode.InvalidProtocol);
      return;
    }
    const command = parsed.value;
    if (command.type === CommandType.Dispose) {
      this.dispose();
      return;
    }
    if (this.phase === WorkerPhase.Failed) return;
    if (command.type === CommandType.SnapshotAck) {
      this.publisher.acknowledge(command.runId, command.sequence);
      return;
    }
    if (
      this.phase === WorkerPhase.Loading ||
      (this.phase === WorkerPhase.Idle && command.type !== CommandType.Reset)
    ) {
      this.fail(ErrorCode.InvalidProtocol, command.commandId);
      return;
    }
    const obsolete =
      command.commandId <= this.commandId ||
      (command.type === CommandType.Reset
        ? command.runId <= this.runId
        : command.runId !== this.runId);
    this.commandId = Math.max(this.commandId, command.commandId);
    if (obsolete) {
      this.acknowledge(command, CommandOutcome.Ignored);
      return;
    }
    if (command.type === CommandType.Reset) {
      this.cancelGeneration();
      this.publisher.reset(command.runId);
      this.runId = command.runId;
      try {
        this.releaseGenerator();
        this.generator = this.factory.create(command.settings.instrumentCount, command.seed);
        this.accumulator = new MetricAccumulator(command.settings.instrumentCount);
        this.settings = command.settings;
        this.phase = WorkerPhase.Running;
        this.schedule(this.clock.now() + command.settings.batchIntervalMs);
      } catch {
        this.fail(ErrorCode.GeneratorFailed, command.commandId);
        return;
      }
    } else if (command.type === CommandType.Pause && this.phase === WorkerPhase.Running) {
      this.cancelGeneration();
      this.phase = WorkerPhase.Paused;
      this.publisher.flushFinal();
    } else if (command.type === CommandType.Resume && this.phase === WorkerPhase.Paused) {
      this.phase = WorkerPhase.Running;
      this.schedule(this.clock.now() + (this.settings?.batchIntervalMs ?? 0));
    }
    this.acknowledge(command, CommandOutcome.Applied);
  }

  dispose(): void {
    if (this.phase === WorkerPhase.Disposed) return;
    this.phase = WorkerPhase.Disposed;
    this.abort.abort();
    this.cancelGeneration();
    this.publisher.stop();
    try {
      this.releaseGenerator();
    } catch {
      // A throwing Wasm free must not prevent worker termination.
    }
    this.accumulator = null;
    this.close();
  }

  private acknowledge(command: Control, outcome: CommandOutcome): void {
    if (this.phase !== WorkerPhase.Running && this.phase !== WorkerPhase.Paused) return;
    this.emit({
      v: 1,
      type: WorkerEventType.CommandAck,
      commandId: command.commandId,
      runId: command.runId,
      action:
        command.type === CommandType.Reset
          ? ControlAction.Reset
          : command.type === CommandType.Pause
            ? ControlAction.Pause
            : ControlAction.Resume,
      outcome,
      status: this.phase === WorkerPhase.Running ? WorkerStatus.Running : WorkerStatus.Paused,
    });
  }

  private cancelGeneration(): void {
    this.generationToken++;
    if (this.timer !== null) this.timers.cancel(this.timer);
    this.timer = null;
  }

  private schedule(deadline: number): void {
    if (this.phase !== WorkerPhase.Running) return;
    const token = this.generationToken;
    this.timer = this.timers.schedule(Math.max(0, deadline - this.clock.now()), () => {
      if (token !== this.generationToken || this.phase !== WorkerPhase.Running) return;
      this.timer = null;
      this.generate(deadline);
    });
  }

  private generate(deadline: number): void {
    if (this.generator === null || this.settings === null || this.accumulator === null) {
      this.fail(ErrorCode.InvalidProtocol);
      return;
    }
    let batch: Uint32Array;
    try {
      batch = this.generator.generateBatch(this.settings.updatesPerBatch);
    } catch {
      this.fail(ErrorCode.GeneratorFailed);
      return;
    }
    try {
      this.accumulator.applyValidatedBatch(batch, this.settings.updatesPerBatch);
    } catch {
      this.fail(ErrorCode.InvalidBatch);
      return;
    }
    this.publisher.markDirty(this.clock.epochNow());
    const now = this.clock.now();
    const candidate = deadline + this.settings.batchIntervalMs;
    this.schedule(candidate > now ? candidate : now + this.settings.batchIntervalMs);
  }

  private releaseGenerator(): void {
    const generator = this.generator;
    this.generator = null;
    generator?.dispose();
  }

  private emit(event: WorkerEvent, transfer: Transferable[] = []): void {
    try {
      this.output(event, transfer);
    } catch {
      this.fail(ErrorCode.WorkerFailed);
    }
  }

  private fail(code: ErrorCode, commandId: number | null = null): void {
    if (this.phase === WorkerPhase.Failed || this.phase === WorkerPhase.Disposed) return;
    this.phase = WorkerPhase.Failed;
    this.abort.abort();
    this.cancelGeneration();
    this.publisher.stop();
    try {
      this.releaseGenerator();
    } catch {
      // Preserve the original allow-listed failure and retire the broken generator.
    }
    this.accumulator = null;
    this.emit({ v: 1, type: WorkerEventType.Error, runId: this.runId || null, commandId, code });
  }
}
