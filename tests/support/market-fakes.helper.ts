import type {
  Clock,
  TimerScheduler,
} from '../../src/app/features/market/models/worker-contracts.model';
import type { ProducerEnvironment } from '../../src/app/features/market/models/worker-contracts.model';
import type {
  WorkerCallbacks,
  WorkerPort,
} from '../../src/app/features/market/models/worker-contracts.model';
import type { Command } from '../../src/app/features/market/models/protocol.model';
import { CommandType } from '../../src/app/features/market/models/protocol.model';

export class FakeTime implements Clock, TimerScheduler {
  time = 0;
  private nextId = 0;
  readonly jobs = new Map<number, { at: number; callback: () => void }>();
  readonly callbacks: (() => void)[] = [];
  now(): number {
    return this.time;
  }
  epochNow(): number {
    return 1_000_000 + this.time;
  }
  schedule(delay: number, callback: () => void): number {
    const id = ++this.nextId;
    this.jobs.set(id, { at: this.time + delay, callback });
    this.callbacks.push(callback);
    return id;
  }
  cancel(id: number): void {
    this.jobs.delete(id);
  }
  advance(duration: number): void {
    const target = this.time + duration;
    for (;;) {
      const next = [...this.jobs].sort((a, b) => a[1].at - b[1].at)[0];
      if (next === undefined || next[1].at > target) break;
      this.time = Math.max(this.time, next[1].at);
      this.jobs.delete(next[0]);
      next[1].callback();
    }
    this.time = Math.max(target, this.time);
  }
}

export class FakeWorker implements WorkerPort {
  readonly commands: Command[] = [];
  readonly terminate = vi.fn();
  readonly post = vi.fn((command: Command): void => {
    this.commands.push(command);
  });
  constructor(readonly callbacks: WorkerCallbacks) {}
  message(input: unknown): void {
    this.callbacks.message(input);
  }
  ready(): void {
    this.message({ v: 1, type: 'ready' });
  }
  ack(command: Command | undefined = this.commands.at(-1), outcome = 'applied'): void {
    if (command === undefined || !('commandId' in command)) throw new Error('Expected control');
    this.message({
      v: 1,
      type: 'command-ack',
      commandId: command.commandId,
      runId: command.runId,
      action: command.type,
      outcome,
      status: command.type === CommandType.Pause ? 'paused' : 'running',
    });
  }
}

export class ClientHarness {
  readonly time = new FakeTime();
  readonly workers: FakeWorker[] = [];
  readonly frames = new Map<number, () => void>();
  readonly frameCallbacks: (() => void)[] = [];
  private nextFrame = 0;
  hidden = false;
  visibility: () => void = (): void => undefined;
  readonly removeVisibility = vi.fn();
  readonly environment: ProducerEnvironment = {
    timers: this.time,
    frames: {
      request: (callback): number => {
        const id = ++this.nextFrame;
        this.frames.set(id, callback);
        this.frameCallbacks.push(callback);
        return id;
      },
      cancel: (id): void => {
        this.frames.delete(id);
      },
    },
    supported: (): boolean => true,
    seed: vi.fn((): number => 42),
    createWorker: (callbacks): WorkerPort => {
      const worker = new FakeWorker(callbacks);
      this.workers.push(worker);
      return worker;
    },
    hidden: (): boolean => this.hidden,
    onVisibilityChange: (callback): (() => void) => {
      this.visibility = callback;
      return this.removeVisibility;
    },
  };
  get worker(): FakeWorker {
    const worker = this.workers.at(-1);
    if (worker === undefined) throw new Error('Worker not started');
    return worker;
  }
  paint(): void {
    const callbacks = [...this.frames.values()];
    this.frames.clear();
    callbacks.forEach((callback) => {
      callback();
    });
  }
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.visibility();
  }
}

export function batch(count: number): Uint32Array {
  return Uint32Array.from(Array.from({ length: count }, () => [0, 101, 10, 99, 101, 3, 2]).flat());
}
