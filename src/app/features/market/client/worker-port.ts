import type { Command } from '../protocol/messages';

export interface WorkerCallbacks {
  message(input: unknown): void;
  error(): void;
}

export interface WorkerPort {
  post(command: Command): void;
  terminate(): void;
}
