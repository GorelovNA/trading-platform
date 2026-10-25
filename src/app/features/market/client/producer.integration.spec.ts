import { TestBed } from '@angular/core/testing';
import { Producer } from './producer';
import { PRODUCER_ENVIRONMENT } from './producer-environment';
import type { WorkerPort } from './worker-port';
import type { GeneratorFactory } from '../worker/generator-port';
import { WorkerController } from '../worker/worker-controller';
import { DEFAULT_SETTINGS } from '../domain/producer-settings';
import { ClientHarness, batch } from '../../../../../tests/support/market-fakes';

// Exercise the real controller and facade together with asynchronous transport turns
// and real transferable detachment; only scheduling and the generator are fake.
describe('Producer/controller transport integration', () => {
  it('coalesces display messages while preserving exact accounting and serializes resets across a held frame', async () => {
    const h = new ClientHarness();
    const deliveries: (() => void)[] = [];
    const generators: { dispose: ReturnType<typeof vi.fn> }[] = [];
    let initialization = Promise.resolve();
    const outputs = vi.fn();
    const factory: GeneratorFactory = {
      initialize: () => Promise.resolve(),
      create: () => {
        const generator = { generateBatch: batch, dispose: vi.fn() };
        generators.push(generator);
        return generator;
      },
    };
    const terminate = vi.fn();
    h.environment.createWorker = (callbacks): WorkerPort => {
      const controller = new WorkerController(
        h.time,
        h.time,
        factory,
        (event, transfer) => {
          const cloned: unknown = structuredClone(event, { transfer });
          if (event.type === 'snapshot') {
            expect(event.numeric.byteLength).toBe(0);
            outputs();
          }
          deliveries.push(() => {
            callbacks.message(cloned);
          });
        },
        vi.fn(),
      );
      initialization = controller.start();
      return {
        post: (command): void => {
          deliveries.push(() => {
            controller.receive(structuredClone(command));
          });
        },
        terminate: (): void => {
          terminate();
          controller.dispose();
        },
      };
    };
    const deliver = (): void => {
      let turns = 0;
      while (deliveries.length > 0) {
        if (++turns > 100) throw new Error('Unbounded transport loop');
        deliveries.shift()?.();
      }
    };
    TestBed.configureTestingModule({
      providers: [{ provide: PRODUCER_ENVIRONMENT, useValue: h.environment }],
    });
    const producer = TestBed.inject(Producer);
    producer.start();
    await initialization;
    deliver();
    expect(producer.state().status).toBe('running');
    h.time.advance(5_000);
    deliver();
    expect(outputs).toHaveBeenCalledOnce();
    expect(h.frames.size).toBe(1);
    expect(producer.state().generatedUpdates).toBe(0n);
    h.paint();
    deliver();
    expect(outputs).toHaveBeenCalledTimes(2);
    expect(producer.state().generatedUpdates).toBe(100n);
    h.paint();
    deliver();
    expect(producer.state()).toMatchObject({
      generatedUpdates: 1000n,
      metrics: [
        { volume: 10_000n, vwap: { numeratorCents: 1_010_000n, denominator: 10_000n } },
        {},
        {},
        {},
        {},
      ],
    });
    producer.pause();
    deliver();
    h.time.advance(50_000);
    expect(producer.state()).toMatchObject({ status: 'paused', generatedUpdates: 1000n });
    producer.resume();
    deliver();
    h.time.advance(499);
    expect(outputs).toHaveBeenCalledTimes(2);
    h.time.advance(1);
    deliver();
    const oldFrame = h.frameCallbacks.at(-1);
    producer.apply({ ...DEFAULT_SETTINGS, instrumentCount: 10 });
    producer.apply({ ...DEFAULT_SETTINGS, instrumentCount: 15 });
    producer.apply({ ...DEFAULT_SETTINGS, instrumentCount: 20 });
    oldFrame?.();
    deliver();
    expect(producer.state()).toMatchObject({ runId: 4, status: 'running', generatedUpdates: 0n });
    expect(producer.state().metrics).toHaveLength(20);
    expect(generators).toHaveLength(3); // initial, first reset already dispatched, latest reset
    expect(generators[0]?.dispose).toHaveBeenCalledOnce();
    expect(generators[1]?.dispose).toHaveBeenCalledOnce();
    h.time.advance(500);
    deliver();
    h.paint();
    deliver();
    expect(producer.state()).toMatchObject({
      generatedUpdates: 100n,
      metrics: [{ volume: 1000n }, ...Array.from({ length: 19 }, () => ({}))],
    });
    TestBed.resetTestingModule();
    deliver();
    expect(terminate).toHaveBeenCalledOnce();
    expect(generators[2]?.dispose).toHaveBeenCalledOnce();
    expect(h.time.jobs.size).toBe(0);
    expect(h.frames.size).toBe(0);
  });
});
