export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export const browserFrames: FrameScheduler = {
  request: (callback): number => requestAnimationFrame(callback),
  cancel: (handle): void => {
    cancelAnimationFrame(handle);
  },
};
