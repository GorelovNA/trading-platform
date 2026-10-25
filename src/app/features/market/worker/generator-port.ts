export interface GeneratorPort {
  readonly generateBatch: (count: number) => Uint32Array;
  readonly dispose: () => void;
}

export interface GeneratorFactory {
  readonly initialize: (signal: AbortSignal) => Promise<void>;
  readonly create: (instrumentCount: number, seed: number) => GeneratorPort;
}
