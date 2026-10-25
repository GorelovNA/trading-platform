import init, {
  MarketProducer,
  protocol_version,
} from '../../../../generated/market-producer/market_producer';
import binaryUrl from '../../../../generated/market-producer/market_producer_bg.wasm';
import type { GeneratorFactory, GeneratorPort } from './generator-port';

export interface WasmEnvironment {
  readonly assetUrl: string;
  initialize(response: Response): Promise<unknown>;
  protocol(): number;
}

export async function loadProtocol(
  signal: AbortSignal,
  environment: WasmEnvironment = {
    assetUrl: binaryUrl,
    initialize: (response): Promise<unknown> => init({ module_or_path: response }),
    protocol: protocol_version,
  },
): Promise<number> {
  const url = new URL(environment.assetUrl, import.meta.url);
  if (url.origin !== globalThis.location.origin) throw new Error('Wasm must be same-origin.');
  const response = await fetch(url, { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('Wasm request failed.');
  if (response.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/wasm') {
    throw new Error('Expected application/wasm.');
  }
  await environment.initialize(response);
  return environment.protocol();
}

interface WasmBinding {
  generate_batch(count: number): Uint32Array;
  free(): void;
}

export class WasmGenerator implements GeneratorPort {
  private disposed = false;

  constructor(private readonly binding: WasmBinding) {}

  generateBatch(count: number): Uint32Array {
    if (this.disposed) throw new Error('GENERATOR_FAILED');
    return this.binding.generate_batch(count);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.binding.free();
  }
}

export function createWasmFactory(
  load: (signal: AbortSignal) => Promise<number> = loadProtocol,
  construct: (count: number, seed: number) => WasmBinding = (count, seed) =>
    new MarketProducer(count, seed),
): GeneratorFactory {
  let initialization: Promise<void> | null = null;
  let ready = false;
  return {
    initialize(signal): Promise<void> {
      initialization ??= load(signal).then((version) => {
        if (signal.aborted || version !== 1) throw new Error('WASM_LOAD_FAILED');
        ready = true;
      });
      return initialization;
    },
    create(count, seed): GeneratorPort {
      if (!ready) throw new Error('WASM_LOAD_FAILED');
      return new WasmGenerator(construct(count, seed));
    },
  };
}
