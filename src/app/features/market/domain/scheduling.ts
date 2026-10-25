export interface Clock {
  now(): number;
  epochNow(): number;
}

export interface TimerScheduler {
  schedule(delayMs: number, callback: () => void): number;
  cancel(handle: number): void;
}
