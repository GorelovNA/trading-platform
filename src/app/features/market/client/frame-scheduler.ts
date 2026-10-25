import type { FrameScheduler } from '../models/worker-contracts.model';

export const browserFrames: FrameScheduler = {
  request: (callback): number => requestAnimationFrame(callback),
  cancel: (handle): void => {
    cancelAnimationFrame(handle);
  },
};
