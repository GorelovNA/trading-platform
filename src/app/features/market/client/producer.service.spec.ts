import { TestBed } from '@angular/core/testing';
import { ProducerService } from './producer.service';
import { CommandType } from '../models/protocol.model';
import { PRODUCER_ENVIRONMENT } from './producer-environment';
import { DEFAULT_SETTINGS } from '../domain/producer-settings.helper';
import { encodeSnapshot } from '../protocol/snapshot-codec.helper';
import type { SnapshotMessage } from '../models/protocol.model';
import { ClientHarness } from '../../../../../tests/support/market-fakes.helper';

function snapshot(
  options: {
    runId?: number;
    sequence?: number;
    rows?: number;
    updates?: bigint;
    volume?: bigint;
    notional?: bigint;
  } = {},
): SnapshotMessage {
  const volume = options.volume ?? 10n;
  return encodeSnapshot(
    {
      generatedUpdates: options.updates ?? 1n,
      metrics: Array.from({ length: options.rows ?? 5 }, (_, instrumentId) => ({
        instrumentId,
        lastPriceCents: instrumentId === 0 ? 100 : null,
        spreadCents: instrumentId === 0 ? 2 : null,
        imbalance: null,
        volume: instrumentId === 0 ? volume : 0n,
        vwap:
          instrumentId === 0
            ? { numeratorCents: options.notional ?? volume * 100n, denominator: volume }
            : null,
      })),
    },
    { runId: options.runId ?? 1, sequence: options.sequence ?? 1, latestBatchEpochMs: 1_000_050 },
  );
}

describe('Producer root facade', () => {
  let h: ClientHarness;
  let producer: ProducerService;
  beforeEach(() => {
    h = new ClientHarness();
    TestBed.configureTestingModule({
      providers: [{ provide: PRODUCER_ENVIRONMENT, useValue: h.environment }],
    });
    producer = TestBed.inject(ProducerService);
  });
  const run = (): void => {
    producer.start();
    h.worker.ready();
    h.worker.ack();
  };

  it('starts once with defaults, queues until ready, and exposes immutable readonly state', () => {
    producer.start();
    producer.start();
    expect(h.workers).toHaveLength(1);
    expect(h.worker.commands).toHaveLength(0);
    expect(producer.state()).toMatchObject({
      status: 'initializing',
      pendingAction: 'reset',
      runId: 1,
    });
    h.worker.ready();
    expect(h.worker.commands).toEqual([
      { v: 1, type: 'reset', runId: 1, commandId: 1, settings: DEFAULT_SETTINGS, seed: 42 },
    ]);
    h.worker.ack();
    expect(producer.state()).toMatchObject({
      status: 'running',
      activeSettings: DEFAULT_SETTINGS,
      pendingAction: null,
      generatedUpdates: 0n,
    });
    expect(producer.state().metrics).toHaveLength(5);
    expect(
      producer.state().metrics.every((row) => row.lastPriceCents === null && row.volume === 0n),
    ).toBe(true);
    expect(Object.isFrozen(producer.state())).toBe(true);
    expect(Object.isFrozen(producer.state().metrics[0])).toBe(true);
    expect(Reflect.has(producer.state, 'set')).toBe(false);
    expect(producer.failureMessage()).toBeNull();
    expect(h.time.jobs.size).toBe(0);
  });

  it('rejects invalid Apply atomically before allocating a worker or changing a run', () => {
    expect(producer.apply({ ...DEFAULT_SETTINGS, updatesPerBatch: '10' })).toMatchObject({
      ok: false,
    });
    expect(h.workers).toHaveLength(0);
    run();
    const previous = producer.state();
    producer.apply(null);
    expect(producer.state()).toBe(previous);
    expect(h.worker.commands).toHaveLength(1);
  });

  it('keeps only the latest reset while loading and one in-flight command plus latest reset during rapid Apply', () => {
    producer.start();
    producer.apply({ ...DEFAULT_SETTINGS, instrumentCount: 10 });
    producer.apply({ ...DEFAULT_SETTINGS, instrumentCount: 20 });
    h.worker.ready();
    expect(h.worker.commands).toHaveLength(1);
    expect(h.worker.commands[0]).toMatchObject({ runId: 3, settings: { instrumentCount: 20 } });
    const inFlight = h.worker.commands[0];
    for (let count = 1; count <= 50; count++)
      producer.apply({ ...DEFAULT_SETTINGS, instrumentCount: count });
    producer.pause();
    producer.resume();
    expect(h.worker.commands).toHaveLength(1);
    h.worker.ack(inFlight, 'ignored');
    expect(h.worker.commands).toHaveLength(2);
    expect(h.worker.commands[1]).toMatchObject({ runId: 53, settings: { instrumentCount: 50 } });
    expect(producer.state().status).toBe('initializing');
    expect(producer.state().activeSettings).toBeNull();
    h.worker.ack();
    expect(producer.state()).toMatchObject({
      status: 'running',
      runId: 53,
      activeSettings: { instrumentCount: 50 },
    });
    expect(h.workers).toHaveLength(1);
  });

  it('publishes at most one frame and ACKs only after commit, dropping duplicate pending deliveries', () => {
    run();
    const message = snapshot();
    h.worker.message(message);
    h.worker.message(message);
    expect(h.frames.size).toBe(1);
    expect(h.worker.commands).toHaveLength(1);
    expect(producer.state().generatedUpdates).toBe(0n);
    h.paint();
    expect(producer.state()).toMatchObject({
      generatedUpdates: 1n,
      latestBatchEpochMs: 1_000_050,
      metrics: [{ volume: 10n }, {}, {}, {}, {}],
    });
    expect(h.worker.commands.at(-1)).toEqual({ v: 1, type: 'snapshot-ack', runId: 1, sequence: 1 });
    h.worker.message(message); // already committed sequence
    expect(h.frames.size).toBe(0);
    expect(producer.state().generatedUpdates).toBe(1n);
  });

  it('clears optimistically on identical Apply and rejects old pending frames and old row counts', () => {
    run();
    h.worker.message(snapshot());
    const oldFrame = h.frameCallbacks[0];
    producer.apply({ ...DEFAULT_SETTINGS, instrumentCount: 10 });
    expect(h.worker.commands.at(-2)).toEqual({ v: 1, type: 'snapshot-ack', runId: 1, sequence: 1 });
    oldFrame?.();
    h.worker.message(snapshot({ sequence: 2 })); // old 5-row snapshot for new 10-row run
    expect(producer.state().metrics).toHaveLength(10);
    expect(producer.state().generatedUpdates).toBe(0n);
    expect(producer.state().failure).toBeNull();
    // Snapshot ACK is after reset in command history; acknowledge the reset explicitly.
    h.worker.ack(
      h.worker.commands.find(
        (command) => command.type === CommandType.Reset && command.runId === 2,
      ),
    );
    h.worker.message(snapshot({ runId: 2, rows: 10 }));
    h.paint();
    expect(producer.state().generatedUpdates).toBe(1n);
    producer.apply({ ...DEFAULT_SETTINGS, instrumentCount: 10 });
    expect(producer.state()).toMatchObject({
      runId: 3,
      status: 'initializing',
      generatedUpdates: 0n,
    });
  });

  it('serializes pause/resume, preserves totals, and Apply from paused always starts running', () => {
    producer.pause();
    producer.resume();
    producer.retry();
    expect(h.workers).toHaveLength(0);
    run();
    h.worker.message(snapshot());
    h.paint();
    producer.pause();
    producer.pause();
    producer.resume();
    expect(producer.state()).toMatchObject({ status: 'running', pendingAction: 'pause' });
    const pause = h.worker.commands.at(-1);
    h.worker.ack(pause);
    expect(producer.state()).toMatchObject({
      status: 'paused',
      pendingAction: null,
      generatedUpdates: 1n,
    });
    producer.resume();
    producer.resume();
    h.worker.ack();
    expect(producer.state()).toMatchObject({ status: 'running', generatedUpdates: 1n });
    producer.pause();
    h.worker.ack();
    producer.apply(DEFAULT_SETTINGS);
    h.worker.ack();
    expect(producer.state()).toMatchObject({ status: 'running', generatedUpdates: 0n, runId: 2 });
  });

  it('drains a pending frame on hide, ACKs immediately when hidden, and gives watchdogs fresh grace on return', () => {
    producer.start();
    h.time.advance(14_999);
    const oldTimeout = h.time.callbacks.at(-1);
    h.setHidden(true);
    h.time.advance(60_000);
    oldTimeout?.();
    expect(producer.state().status).toBe('initializing');
    h.setHidden(false);
    h.time.advance(14_999);
    expect(producer.state().status).toBe('initializing');
    h.worker.ready();
    h.time.advance(4_999);
    h.setHidden(true);
    h.time.advance(60_000);
    h.setHidden(false);
    h.time.advance(4_999);
    h.worker.ack();
    h.worker.message(snapshot());
    const oldFrame = h.frameCallbacks.at(-1);
    h.setHidden(true);
    expect(producer.state().generatedUpdates).toBe(1n);
    expect(h.frames.size).toBe(0);
    h.worker.message(snapshot({ sequence: 2, updates: 2n, volume: 20n }));
    expect(producer.state().generatedUpdates).toBe(2n);
    oldFrame?.();
    h.setHidden(false);
    expect(h.time.jobs.size).toBe(0);
  });

  it.each(['initialization', 'command'])(
    'times out stalled %s and terminates without a restart loop',
    (stage) => {
      producer.start();
      if (stage === 'command') h.worker.ready();
      h.time.advance(stage === 'command' ? 5_000 : 15_000);
      expect(producer.state()).toMatchObject({
        status: 'error',
        stale: true,
        failure: {
          code: stage === 'command' ? 'COMMAND_TIMEOUT' : 'INITIALIZATION_TIMEOUT',
          retryable: true,
        },
      });
      expect(h.worker.terminate).toHaveBeenCalledOnce();
      h.time.advance(60_000);
      expect(h.workers).toHaveLength(1);
    },
  );

  it('retry creates a new worker/run/seed, keeps requested settings, and ignores all retired callbacks', () => {
    run();
    h.worker.message(snapshot());
    const oldFrame = h.frameCallbacks.at(-1);
    const oldWorker = h.worker;
    oldWorker.callbacks.error();
    producer.retry();
    expect(h.workers).toHaveLength(2);
    expect(producer.state()).toMatchObject({
      status: 'initializing',
      runId: 2,
      generatedUpdates: 0n,
    });
    oldWorker.message(null);
    oldWorker.ready();
    oldWorker.callbacks.error();
    oldFrame?.();
    expect(producer.state().failure).toBeNull();
    expect(h.worker.commands).toHaveLength(0);
    h.worker.ready();
    h.worker.ack();
    expect(producer.state().status).toBe('running');
    expect(h.environment.seed).toHaveBeenCalledTimes(2);
    expect(h.worker.commands[0]).toMatchObject({ commandId: 2, runId: 2 });
  });

  it('keeps only last committed current-run data stale on error and never restores a run cleared by Apply', () => {
    run();
    h.worker.message(snapshot());
    h.paint();
    h.worker.message(snapshot({ sequence: 2, updates: 2n, volume: 20n }));
    h.worker.message({
      v: 1,
      type: 'error',
      runId: 1,
      commandId: null,
      code: 'GENERATOR_FAILED',
      detail: 'secret',
    });
    expect(producer.state()).toMatchObject({ status: 'error', stale: true, generatedUpdates: 1n });
    expect(producer.failureMessage()).not.toContain('secret');
    producer.retry();
    h.worker.ready();
    h.worker.ack();
    producer.apply({ ...DEFAULT_SETTINGS, instrumentCount: 10 });
    h.worker.callbacks.error();
    expect(producer.state().metrics).toHaveLength(10);
    expect(producer.state().generatedUpdates).toBe(0n);
  });

  it.each([
    'malformed',
    'duplicate-ready',
    'early-snapshot',
    'wrong-count',
    'decreasing-updates',
    'decreasing-volume',
    'decreasing-notional',
    'second-pending',
    'wrong-ack-run',
    'wrong-ack-action',
    'ignored-current',
    'wrong-status',
  ])('faults %s without displaying corrupt state', (scenario) => {
    producer.start();
    if (scenario === 'early-snapshot') {
      h.worker.message(snapshot());
    } else {
      h.worker.ready();
      if (
        scenario === 'wrong-ack-run' ||
        scenario === 'wrong-ack-action' ||
        scenario === 'ignored-current' ||
        scenario === 'wrong-status'
      ) {
        h.worker.message({
          v: 1,
          type: 'command-ack',
          commandId: 1,
          runId: scenario === 'wrong-ack-run' ? 2 : 1,
          action: scenario === 'wrong-ack-action' ? 'pause' : 'reset',
          outcome: scenario === 'ignored-current' ? 'ignored' : 'applied',
          status: scenario === 'wrong-status' ? 'paused' : 'running',
        });
      } else {
        h.worker.ack();
        if (scenario === 'malformed') h.worker.message({ v: 1, type: 'snapshot' });
        else if (scenario === 'duplicate-ready') h.worker.ready();
        else if (scenario === 'wrong-count') h.worker.message(snapshot({ rows: 2 }));
        else {
          h.worker.message(snapshot({ updates: 2n, volume: 20n }));
          if (scenario !== 'second-pending') h.paint();
          h.worker.message(
            snapshot({
              sequence: 2,
              updates: scenario === 'decreasing-updates' ? 1n : 2n,
              volume: scenario === 'decreasing-volume' ? 10n : 20n,
              notional: scenario === 'decreasing-notional' ? 1000n : 2000n,
            }),
          );
        }
      }
    }
    expect(producer.state()).toMatchObject({
      status: 'error',
      failure: { code: 'INVALID_PROTOCOL' },
    });
    expect(h.frames.size).toBe(0);
    expect(h.time.jobs.size).toBe(0);
  });

  it('ignores unmatched/duplicate acknowledgements without releasing another command', () => {
    run();
    const reset = h.worker.commands[0];
    h.worker.ack(reset);
    producer.pause();
    h.worker.ack(reset);
    expect(producer.state().pendingAction).toBe('pause');
    h.worker.ack();
    expect(producer.state().status).toBe('paused');
  });

  it.each(['unsupported', 'construct', 'seed', 'invalid-seed', 'post'])(
    'handles %s failure locally',
    (failure) => {
      if (failure === 'unsupported') vi.spyOn(h.environment, 'supported').mockReturnValue(false);
      if (failure === 'construct')
        vi.spyOn(h.environment, 'createWorker').mockImplementation(() => {
          throw new Error('private');
        });
      if (failure === 'seed')
        vi.spyOn(h.environment, 'seed').mockImplementation(() => {
          throw new Error('secret');
        });
      if (failure === 'invalid-seed') vi.spyOn(h.environment, 'seed').mockReturnValue(NaN);
      producer.start();
      if (failure === 'post') {
        h.worker.post.mockImplementation(() => {
          throw new Error('secret');
        });
        h.worker.ready();
      }
      expect(producer.state().status).toBe('error');
      expect(producer.failureMessage()).not.toMatch(/secret|private/u);
      if (failure === 'unsupported') {
        expect(producer.state().failure).toEqual({ code: 'UNSUPPORTED_BROWSER', retryable: false });
        producer.retry();
        expect(h.workers).toHaveLength(0);
      }
    },
  );

  it('application destruction removes listeners, timers/frames and terminates immediately, ignoring late work', () => {
    run();
    h.worker.message(snapshot());
    producer.pause();
    const worker = h.worker;
    const oldFrame = h.frameCallbacks.at(-1);
    const oldWatchdog = h.time.callbacks.at(-1);
    TestBed.resetTestingModule();
    expect(producer.state().status).toBe('disposed');
    expect(worker.commands.at(-1)).toEqual({ v: 1, type: 'dispose' });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(h.removeVisibility).toHaveBeenCalledOnce();
    expect(h.time.jobs.size).toBe(0);
    expect(h.frames.size).toBe(0);
    oldFrame?.();
    oldWatchdog?.();
    worker.message(null);
    producer.start();
    producer.apply(DEFAULT_SETTINGS);
    expect(producer.state().status).toBe('disposed');
    expect(h.workers).toHaveLength(1);
  });

  it('still destroys a transport whose disposal post throws', () => {
    run();
    h.worker.post.mockImplementation(() => {
      throw new Error('broken');
    });
    TestBed.resetTestingModule();
    expect(h.worker.terminate).toHaveBeenCalledOnce();
    expect(producer.state().status).toBe('disposed');
  });
});
