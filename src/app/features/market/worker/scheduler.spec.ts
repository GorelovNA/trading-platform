import { workerClock, workerTimers } from './scheduler';

describe('Worker scheduling adapters', () => {
  afterEach(() => vi.useRealTimers());
  it('uses epoch-relative monotonic timestamps and cancellable recursive timeouts', () => {
    vi.useFakeTimers();
    expect(workerClock.now()).toBe(performance.now());
    expect(workerClock.epochNow()).toBe(performance.timeOrigin + performance.now());
    const callback = vi.fn();
    const handle = workerTimers.schedule(50, callback);
    workerTimers.cancel(handle);
    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();
    workerTimers.schedule(50, callback);
    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledOnce();
  });
});
