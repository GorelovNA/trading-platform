import type { Clock, TimerScheduler } from '../domain/scheduling';

export const workerClock: Clock = {
  now: (): number => performance.now(),
  epochNow: (): number => performance.timeOrigin + performance.now(),
};

export const workerTimers: TimerScheduler = {
  schedule: (delay, callback): number => setTimeout(callback, delay),
  cancel: (handle): void => {
    clearTimeout(handle);
  },
};
