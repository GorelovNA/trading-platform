import { createBrowserWorker } from './browser-worker.helper';
import { CommandType } from '../models/protocol.model';

class MockWorker extends EventTarget {
  static current: MockWorker;
  readonly terminate = vi.fn();
  readonly postMessage = vi.fn();
  override readonly removeEventListener = vi.fn(super.removeEventListener.bind(this));
  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    super();
    MockWorker.current = this;
  }
}

describe('Browser worker port', () => {
  beforeEach(() => vi.stubGlobal('Worker', MockWorker));
  afterEach(() => vi.unstubAllGlobals());

  it('constructs a module worker and relays structured messages and both error events', () => {
    const callbacks = { message: vi.fn(), error: vi.fn() };
    const port = createBrowserWorker(callbacks);
    const worker = MockWorker.current;
    expect(worker.options).toEqual({ type: 'module' });
    const payload = { v: 1, type: 'ready' };
    worker.dispatchEvent(new MessageEvent('message', { data: payload }));
    worker.dispatchEvent(new Event('error'));
    worker.dispatchEvent(new Event('messageerror'));
    expect(callbacks.message).toHaveBeenCalledWith(payload);
    expect(callbacks.error).toHaveBeenCalledTimes(2);
    port.post({ v: 1, type: CommandType.Dispose });
    expect(worker.postMessage).toHaveBeenCalledWith({ v: 1, type: CommandType.Dispose });
    port.terminate();
    port.terminate();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.removeEventListener).toHaveBeenCalledTimes(3);
    worker.dispatchEvent(new MessageEvent('message', { data: null }));
    worker.dispatchEvent(new Event('error'));
    expect(callbacks.message).toHaveBeenCalledTimes(1);
    expect(callbacks.error).toHaveBeenCalledTimes(2);
    expect(() => {
      port.post({ v: 1, type: CommandType.Dispose });
    }).toThrow('WORKER_FAILED');
  });

  it('propagates construction failure to the facade', () => {
    vi.stubGlobal(
      'Worker',
      class extends MockWorker {
        constructor(url: URL, options: WorkerOptions) {
          super(url, options);
          throw new Error('Unavailable');
        }
      },
    );
    expect(() => createBrowserWorker({ message: vi.fn(), error: vi.fn() })).toThrow('Unavailable');
  });
});
