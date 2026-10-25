import { startIntegrationProof } from './browser-worker';

class MockWorker {
  static current: MockWorker;
  onmessage?: (event: MessageEvent<unknown>) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  readonly terminate = vi.fn();
  constructor() {
    MockWorker.current = this;
  }
}

describe('browser worker integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', MockWorker);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('accepts the expected protocol and terminates exactly once', async () => {
    const proof = startIntegrationProof();
    const worker = MockWorker.current;
    worker.onmessage?.(new MessageEvent('message', { data: { kind: 'ready', version: 1 } }));
    await expect(proof.result).resolves.toBe(1);
    proof.dispose();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, 1, {}, { kind: 'error' }, { kind: 'ready' }, { kind: 'ready', version: 2 }])(
    'rejects invalid responses: %j',
    async (data) => {
      const proof = startIntegrationProof();
      MockWorker.current.onmessage?.(new MessageEvent('message', { data }));
      await expect(proof.result).rejects.toThrow('integration failed');
      expect(MockWorker.current.terminate).toHaveBeenCalledOnce();
    },
  );

  it.each(['onerror', 'onmessageerror'])('handles %s', async (event) => {
    const proof = startIntegrationProof();
    if (event === 'onerror') MockWorker.current.onerror?.();
    else MockWorker.current.onmessageerror?.();
    await expect(proof.result).rejects.toThrow();
    expect(MockWorker.current.terminate).toHaveBeenCalledOnce();
  });

  it('bounds initialization and cleans up a stuck worker', async () => {
    const proof = startIntegrationProof();
    const assertion = expect(proof.result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    expect(MockWorker.current.terminate).toHaveBeenCalledOnce();
  });

  it('settles the request when disposed before completion', async () => {
    const proof = startIntegrationProof();
    proof.dispose();
    await expect(proof.result).rejects.toThrow('disposed');
  });

  it('reports browser worker construction failures', async () => {
    vi.stubGlobal(
      'Worker',
      class extends MockWorker {
        constructor() {
          super();
          throw new Error('Unavailable');
        }
      },
    );
    await expect(startIntegrationProof().result).rejects.toThrow('Unavailable');
  });
});
