import type { ErrorCode } from '../domain/market-models';
import { MetricAccumulator } from '../domain/metric-accumulator';
import type { ProducerSettings } from '../domain/producer-settings';
import type { Clock, TimerScheduler } from '../domain/scheduling';
import type { Command, WorkerEvent } from '../protocol/messages';
import { parseCommand } from '../protocol/validate-command';
import type { GeneratorFactory, GeneratorPort } from './generator-port';
import { SnapshotPublisher } from './snapshot-publisher';

type Phase = 'loading' | 'idle' | 'running' | 'paused' | 'failed' | 'disposed';
type Control = Extract<Command, { readonly commandId: number }>;

export class WorkerController {
  private phase: Phase = 'loading';
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
        if (this.accumulator === null) throw new Error('INVALID_PROTOCOL');
        return this.accumulator.snapshotValues();
      },
      (snapshot) => {
        this.emit(snapshot, [snapshot.numeric]);
      },
      () => {
        this.fail('INVALID_PROTOCOL');
      },
    );
  }

  async start(): Promise<void> {
    if (this.started || this.phase !== 'loading') return;
    this.started = true;
    try {
      await this.factory.initialize(this.abort.signal);
      if (this.abort.signal.aborted) return;
      this.phase = 'idle';
      this.emit({ v: 1, type: 'ready' });
    } catch {
      this.fail('WASM_LOAD_FAILED');
    }
  }

  receive(input: unknown): void {
    if (this.phase === 'disposed') return;
    const parsed = parseCommand(input);
    if (!parsed.ok) {
      this.fail('INVALID_PROTOCOL');
      return;
    }
    const command = parsed.value;
    if (command.type === 'dispose') {
      this.dispose();
      return;
    }
    if (this.phase === 'failed') return;
    if (command.type === 'snapshot-ack') {
      this.publisher.acknowledge(command.runId, command.sequence);
      return;
    }
    if (this.phase === 'loading' || (this.phase === 'idle' && command.type !== 'reset')) {
      this.fail('INVALID_PROTOCOL', command.commandId);
      return;
    }
    const obsolete =
      command.commandId <= this.commandId ||
      (command.type === 'reset' ? command.runId <= this.runId : command.runId !== this.runId);
    this.commandId = Math.max(this.commandId, command.commandId);
    if (obsolete) {
      this.acknowledge(command, 'ignored');
      return;
    }
    if (command.type === 'reset') {
      this.cancelGeneration();
      this.publisher.reset(command.runId);
      this.runId = command.runId;
      try {
        this.releaseGenerator();
        this.generator = this.factory.create(command.settings.instrumentCount, command.seed);
        this.accumulator = new MetricAccumulator(command.settings.instrumentCount);
        this.settings = command.settings;
        this.phase = 'running';
        this.schedule(this.clock.now() + command.settings.batchIntervalMs);
      } catch {
        this.fail('GENERATOR_FAILED', command.commandId);
        return;
      }
    } else if (command.type === 'pause' && this.phase === 'running') {
      this.cancelGeneration();
      this.phase = 'paused';
      this.publisher.flushFinal();
    } else if (command.type === 'resume' && this.phase === 'paused') {
      this.phase = 'running';
      this.schedule(this.clock.now() + (this.settings?.batchIntervalMs ?? 0));
    }
    this.acknowledge(command, 'applied');
  }

  dispose(): void {
    if (this.phase === 'disposed') return;
    this.phase = 'disposed';
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

  private acknowledge(command: Control, outcome: 'applied' | 'ignored'): void {
    if (this.phase !== 'running' && this.phase !== 'paused') return;
    this.emit({
      v: 1,
      type: 'command-ack',
      commandId: command.commandId,
      runId: command.runId,
      action: command.type,
      outcome,
      status: this.phase,
    });
  }

  private cancelGeneration(): void {
    this.generationToken++;
    if (this.timer !== null) this.timers.cancel(this.timer);
    this.timer = null;
  }

  private schedule(deadline: number): void {
    if (this.phase !== 'running') return;
    const token = this.generationToken;
    this.timer = this.timers.schedule(Math.max(0, deadline - this.clock.now()), () => {
      if (token !== this.generationToken || this.phase !== 'running') return;
      this.timer = null;
      this.generate(deadline);
    });
  }

  private generate(deadline: number): void {
    if (this.generator === null || this.settings === null || this.accumulator === null) {
      this.fail('INVALID_PROTOCOL');
      return;
    }
    let batch: Uint32Array;
    try {
      batch = this.generator.generateBatch(this.settings.updatesPerBatch);
    } catch {
      this.fail('GENERATOR_FAILED');
      return;
    }
    try {
      this.accumulator.applyValidatedBatch(batch, this.settings.updatesPerBatch);
    } catch {
      this.fail('INVALID_BATCH');
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
      this.fail('WORKER_FAILED');
    }
  }

  private fail(code: ErrorCode, commandId: number | null = null): void {
    if (this.phase === 'failed' || this.phase === 'disposed') return;
    this.phase = 'failed';
    this.abort.abort();
    this.cancelGeneration();
    this.publisher.stop();
    try {
      this.releaseGenerator();
    } catch {
      // Preserve the original allow-listed failure and retire the broken generator.
    }
    this.accumulator = null;
    this.emit({ v: 1, type: 'error', runId: this.runId || null, commandId, code });
  }
}
