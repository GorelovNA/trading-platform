import { WorkerController } from './worker-controller';
import type { GeneratorFactory, GeneratorPort } from '../models/worker-contracts.model';
import {
  CommandType,
  CommandOutcome,
  WorkerEventType,
  type Command,
  type SnapshotMessage,
  type WorkerEvent,
} from '../models/protocol.model';
import { decodeSnapshot } from '../protocol/snapshot-codec.helper';
import { DEFAULT_SETTINGS } from '../domain/producer-settings.helper';
import { FakeTime, batch } from '../../../../../tests/support/market-fakes.helper';
import type { Mock } from 'vitest';

interface WorkerHarness {
  time: FakeTime;
  events: WorkerEvent[];
  generators: GeneratorPort[];
  factory: GeneratorFactory;
  output: Mock<(event: WorkerEvent, transfer: Transferable[]) => void>;
  close: Mock<() => void>;
  controller: WorkerController;
  reset(runId?: number, commandId?: number, interval?: number): void;
  control(type: CommandType.Pause | CommandType.Resume, commandId: number, runId?: number): void;
  snapshots(): SnapshotMessage[];
  ack(snapshot?: SnapshotMessage): void;
}

function setup(): WorkerHarness {
  const time = new FakeTime();
  const events: WorkerEvent[] = [];
  const generators: GeneratorPort[] = [];
  const factory: GeneratorFactory = {
    initialize: vi.fn().mockResolvedValue(undefined),
    create: vi.fn((): GeneratorPort => {
      const generator = { generateBatch: vi.fn(batch), dispose: vi.fn() };
      generators.push(generator);
      return generator;
    }),
  };
  const output = vi.fn((event: WorkerEvent, transfer: Transferable[]): void => {
    events.push(structuredClone(event, { transfer }));
    if (event.type === WorkerEventType.Snapshot) expect(event.numeric.byteLength).toBe(0);
  });
  const close = vi.fn();
  const controller = new WorkerController(time, time, factory, output, close);
  const reset = (runId = 1, commandId = runId, interval = 50): void => {
    controller.receive({
      v: 1,
      type: 'reset',
      runId,
      commandId,
      seed: 42,
      settings: {
        ...DEFAULT_SETTINGS,
        instrumentCount: 2,
        updatesPerBatch: 2,
        batchIntervalMs: interval,
      },
    });
  };
  const control = (
    type: CommandType.Pause | CommandType.Resume,
    commandId: number,
    runId = 1,
  ): void => {
    controller.receive({ v: 1, type, runId, commandId });
  };
  const snapshots = (): SnapshotMessage[] =>
    events.filter((event) => event.type === WorkerEventType.Snapshot);
  const ack = (snapshot = snapshots().at(-1)): void => {
    if (snapshot === undefined) throw new Error('No snapshot');
    controller.receive({
      v: 1,
      type: 'snapshot-ack',
      runId: snapshot.runId,
      sequence: snapshot.sequence,
    });
  };
  return {
    time,
    events,
    factory,
    generators,
    output,
    close,
    controller,
    reset,
    control,
    snapshots,
    ack,
  };
}

describe('WorkerController', () => {
  it('initializes once and waits one interval, transferring an independent cumulative snapshot', async () => {
    const h = setup();
    await h.controller.start();
    await h.controller.start();
    expect(h.factory.initialize).toHaveBeenCalledOnce();
    expect(h.events).toEqual([{ v: 1, type: 'ready' }]);
    h.reset();
    expect(h.events.at(-1)).toMatchObject({
      type: 'command-ack',
      status: 'running',
      outcome: 'applied',
    });
    h.time.advance(49);
    expect(h.snapshots()).toHaveLength(0);
    h.time.advance(1);
    const snapshot = h.snapshots()[0];
    expect(snapshot).toMatchObject({
      sequence: 1,
      generatedUpdates: 2n,
      latestBatchEpochMs: 1_000_050,
    });
    const decoded = decodeSnapshot(snapshot);
    expect(decoded.ok && decoded.value.metrics[0]).toMatchObject({
      volume: 20n,
      vwap: { numeratorCents: 2020n },
    });
    h.ack();
    h.time.advance(50);
    expect(h.snapshots().at(-1)).toMatchObject({ sequence: 2, generatedUpdates: 4n });
  });

  it('counts every trade with a slow receiver without allocating queued snapshots', async () => {
    const h = setup();
    await h.controller.start();
    h.reset();
    h.time.advance(5_000);
    expect(h.snapshots()).toHaveLength(1);
    expect(h.generators[0]?.generateBatch).toHaveBeenCalledTimes(100);
    expect(h.time.jobs.size).toBe(1);
    h.ack();
    expect(h.snapshots()).toHaveLength(2);
    expect(h.snapshots().at(-1)).toMatchObject({
      generatedUpdates: 200n,
      totals: [{ volume: 2000n }, { volume: 0n }],
    });
    h.controller.receive({ v: 1, type: 'snapshot-ack', runId: 1, sequence: 1 });
    h.time.advance(50);
    expect(h.snapshots()).toHaveLength(2);
    h.ack();
    expect(h.snapshots().at(-1)?.generatedUpdates).toBe(202n);
  });

  it('throttles leading sends to 50ms, installs one timer, and flushes dirty state on pause', async () => {
    const h = setup();
    await h.controller.start();
    h.reset();
    h.time.advance(120);
    h.ack(); // sends the second batch at 120
    h.ack(); // no dirty state
    h.time.advance(30); // third batch at 150 is dirty, publication due 170
    expect(h.snapshots()).toHaveLength(2);
    expect(h.time.jobs.size).toBe(2);
    const oldPublisher = h.time.callbacks.at(-1);
    h.control(CommandType.Pause, 2);
    expect(h.snapshots()).toHaveLength(3);
    expect(h.snapshots().at(-1)?.generatedUpdates).toBe(6n);
    oldPublisher?.();
    h.ack();
    h.time.advance(1_000);
    expect(h.snapshots()).toHaveLength(3);
    expect(h.time.jobs.size).toBe(0);
  });

  it('publishes on the throttle timer after ACK and ignores its cancelled old callback after reset', async () => {
    const h = setup();
    await h.controller.start();
    h.reset();
    h.time.advance(120);
    h.ack();
    h.ack();
    h.time.advance(30);
    const cancelled = h.time.callbacks.at(-1);
    h.time.advance(20);
    expect(h.snapshots().at(-1)).toMatchObject({
      generatedUpdates: 6n,
      latestBatchEpochMs: 1_000_150,
    });
    h.reset(2, 2);
    cancelled?.();
    expect(h.snapshots()).toHaveLength(3);
    h.time.advance(50);
    expect(h.snapshots().at(-1)).toMatchObject({ runId: 2, sequence: 1, generatedUpdates: 2n });
  });

  it('flushes after the receiver releases its slot while paused and does not generate or catch up', async () => {
    const h = setup();
    await h.controller.start();
    h.reset();
    h.time.advance(100);
    h.control(CommandType.Pause, 2);
    expect(h.events.at(-1)).toMatchObject({ type: 'command-ack', status: 'paused' });
    h.time.advance(10_000);
    h.ack();
    expect(h.snapshots().at(-1)?.generatedUpdates).toBe(4n);
    h.ack();
    expect(h.time.jobs.size).toBe(0);
    h.control(CommandType.Resume, 3);
    h.time.advance(49);
    expect(h.generators[0]?.generateBatch).toHaveBeenCalledTimes(2);
    h.time.advance(1);
    expect(h.snapshots().at(-1)?.generatedUpdates).toBe(6n);
    expect(h.factory.create).toHaveBeenCalledTimes(1);
  });

  it('invalidates queued generation timers on pause/reset/disposal and frees each producer once', async () => {
    const h = setup();
    await h.controller.start();
    h.reset();
    const oldTimer = h.time.callbacks.at(-1);
    h.control(CommandType.Pause, 2);
    oldTimer?.();
    h.control(CommandType.Resume, 3);
    const resumedTimer = h.time.callbacks.at(-1);
    h.reset(2, 4);
    resumedTimer?.();
    expect(h.generators[0]?.generateBatch).not.toHaveBeenCalled();
    expect(h.generators[0]?.dispose).toHaveBeenCalledOnce();
    const disposedTimer = h.time.callbacks.at(-1);
    h.controller.receive({ v: 1, type: 'dispose' });
    h.controller.dispose();
    disposedTimer?.();
    h.reset(3, 5);
    expect(h.generators[1]?.dispose).toHaveBeenCalledOnce();
    expect(h.close).toHaveBeenCalledOnce();
    expect(h.time.jobs.size).toBe(0);
  });

  it('rejects obsolete resets/ACKs and duplicate controls without changing timing or generator state', async () => {
    const h = setup();
    await h.controller.start();
    h.reset();
    h.time.advance(50);
    h.reset(2, 2);
    h.time.advance(100);
    expect(h.snapshots()).toHaveLength(2);
    h.controller.receive({ v: 1, type: 'snapshot-ack', runId: 1, sequence: 1 });
    h.controller.receive({ v: 1, type: 'snapshot-ack', runId: 2, sequence: 9 });
    expect(h.snapshots()).toHaveLength(2);
    h.reset(1, 3);
    h.reset(3, 2);
    h.control(CommandType.Pause, 4, 1);
    expect(
      h.events
        .slice(-3)
        .every(
          (event) =>
            event.type === WorkerEventType.CommandAck && event.outcome === CommandOutcome.Ignored,
        ),
    ).toBe(true);
    h.control(CommandType.Pause, 5, 2);
    h.control(CommandType.Pause, 5, 2);
    h.control(CommandType.Pause, 6, 2);
    expect(h.events.at(-2)).toMatchObject({ outcome: 'ignored' });
    expect(h.events.at(-1)).toMatchObject({ outcome: 'applied', status: 'paused' });
    h.ack();
    h.control(CommandType.Resume, 7, 2);
    h.control(CommandType.Resume, 8, 2);
    expect(h.factory.create).toHaveBeenCalledTimes(2);
    expect(h.time.jobs.size).toBe(1);
  });

  it('skips missed deadlines after slow synchronous generation', async () => {
    const h = setup();
    await h.controller.start();
    h.reset();
    vi.spyOn(h.generators[0] ?? { generateBatch: batch }, 'generateBatch').mockImplementation(
      (count) => {
        h.time.time += 200;
        return batch(count);
      },
    );
    h.time.advance(50);
    expect(h.time.now()).toBe(250);
    expect([...h.time.jobs.values()].map((job) => job.at)).toEqual([300]);
    h.time.advance(49);
    expect(h.generators[0]?.generateBatch).toHaveBeenCalledOnce();
  });

  it.each(['generate', 'invalid-batch', 'create', 'free', 'output'])(
    'cleans up after %s failure with safe codes',
    async (failure) => {
      const h = setup();
      await h.controller.start();
      if (failure === 'create')
        vi.spyOn(h.factory, 'create').mockImplementation(() => {
          throw new Error('private path');
        });
      h.reset();
      const generator = h.generators[0];
      if (generator !== undefined) {
        if (failure === 'generate')
          vi.spyOn(generator, 'generateBatch').mockImplementation(() => {
            throw new Error('secret');
          });
        if (failure === 'invalid-batch')
          vi.spyOn(generator, 'generateBatch').mockReturnValue(new Uint32Array(0));
        if (failure === 'free') {
          vi.spyOn(generator, 'dispose').mockImplementation(() => {
            throw new Error('secret');
          });
          h.reset(2, 2);
        }
        if (failure === 'output')
          h.output.mockImplementationOnce(() => {
            throw new Error('private');
          });
      }
      h.time.advance(50);
      const code =
        failure === 'invalid-batch'
          ? 'INVALID_BATCH'
          : failure === 'output'
            ? 'WORKER_FAILED'
            : 'GENERATOR_FAILED';
      expect(h.events.at(-1)).toMatchObject({ type: 'error', code });
      expect(
        JSON.stringify(h.events.filter((event) => event.type === WorkerEventType.Error)),
      ).not.toMatch(/secret|private/u);
      expect(h.time.jobs.size).toBe(0);
      h.reset(10, 10);
      h.time.advance(1000);
      expect(h.events.at(-1)).toMatchObject({ type: 'error', code });
      if (generator !== undefined) expect(generator.dispose).toHaveBeenCalledOnce();
    },
  );

  it.each([null, { v: 2, type: 'dispose' }])('faults malformed input', async (command) => {
    const h = setup();
    await h.controller.start();
    h.controller.receive(command);
    expect(h.events.at(-1)).toMatchObject({ type: 'error', code: 'INVALID_PROTOCOL' });
  });

  it.each(['loading', 'idle'])('faults premature commands in %s', async (phase) => {
    const h = setup();
    if (phase === 'idle') await h.controller.start();
    const command: Command =
      phase === 'loading'
        ? {
            v: 1,
            type: CommandType.Reset,
            commandId: 1,
            runId: 1,
            seed: 0,
            settings: DEFAULT_SETTINGS,
          }
        : { v: 1, type: CommandType.Pause, commandId: 1, runId: 1 };
    h.controller.receive(command);
    expect(h.events.at(-1)).toMatchObject({
      type: 'error',
      code: 'INVALID_PROTOCOL',
      commandId: 1,
    });
  });

  it.each([true, false])(
    'ignores late Wasm settlement after disposal (success=%s)',
    async (success) => {
      const h = setup();
      let settle = (): void => undefined;
      vi.spyOn(h.factory, 'initialize').mockImplementation(
        () =>
          new Promise((resolve, reject) => {
            settle = (): void => {
              if (success) resolve();
              else reject(new Error('private'));
            };
          }),
      );
      const started = h.controller.start();
      h.controller.dispose();
      settle();
      await started;
      expect(h.events).toEqual([]);
      expect(h.time.jobs.size).toBe(0);
    },
  );

  it('reports Wasm initialization failure without leaking its details', async () => {
    const h = setup();
    vi.spyOn(h.factory, 'initialize').mockRejectedValue(new Error('private url'));
    await h.controller.start();
    expect(h.events).toEqual([
      { v: 1, type: 'error', runId: null, commandId: null, code: 'WASM_LOAD_FAILED' },
    ]);
  });
});
