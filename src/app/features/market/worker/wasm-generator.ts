import init, { protocol_version } from '../../../../generated/market-producer/market_producer';
import binaryUrl from '../../../../generated/market-producer/market_producer_bg.wasm';

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
