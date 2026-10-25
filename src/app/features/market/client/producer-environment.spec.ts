import { TestBed } from '@angular/core/testing';
import { PRODUCER_ENVIRONMENT } from './producer-environment';
import { browserFrames } from './frame-scheduler';

class MockWorker extends EventTarget {
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();
}

describe('Browser producer environment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', MockWorker);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('provides native timers, frames, secure u32 seeds, visibility events and worker transport', () => {
    const environment = TestBed.inject(PRODUCER_ENVIRONMENT);
    expect(environment.supported()).toBe(true);
    const callback = vi.fn();
    const timer = environment.timers.schedule(50, callback);
    environment.timers.cancel(timer);
    vi.advanceTimersByTime(50);
    expect(callback).not.toHaveBeenCalled();
    environment.timers.schedule(50, callback);
    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledOnce();
    const frame = browserFrames.request(callback);
    browserFrames.cancel(frame);
    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(1);
    browserFrames.request(callback);
    vi.advanceTimersByTime(50);
    expect(callback).toHaveBeenCalledTimes(2);
    const seed = environment.seed();
    expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff).toBe(true);
    expect(environment.hidden()).toBe(document.hidden);
    const changed = vi.fn();
    const remove = environment.onVisibilityChange(changed);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(changed).toHaveBeenCalledOnce();
    remove();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(changed).toHaveBeenCalledOnce();
    environment.createWorker({ message: vi.fn(), error: vi.fn() }).terminate();
  });

  it.each(['Worker', 'WebAssembly', 'crypto', 'requestAnimationFrame'])(
    'detects missing %s',
    (name) => {
      vi.stubGlobal(name, undefined);
      expect(TestBed.inject(PRODUCER_ENVIRONMENT).supported()).toBe(false);
    },
  );

  it('detects a missing secure RNG', () => {
    vi.stubGlobal('crypto', {});
    expect(TestBed.inject(PRODUCER_ENVIRONMENT).supported()).toBe(false);
  });
});
