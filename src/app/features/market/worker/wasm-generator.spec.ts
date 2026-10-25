import { loadProtocol } from './wasm-generator';

describe('Wasm loader', () => {
  const environment = {
    assetUrl: 'http://localhost/market_producer_bg-HASH.wasm',
    initialize: vi.fn<(response: Response) => Promise<unknown>>().mockResolvedValue(undefined),
    protocol: (): number => 1,
  };
  beforeEach(() => {
    vi.stubGlobal('location', { origin: 'http://localhost' });
    vi.clearAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetches explicit same-origin bytes with cancellation and initializes the web glue', async () => {
    const response = new Response(new Uint8Array(), {
      headers: { 'content-type': 'application/wasm; charset=binary' },
    });
    const fetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    await expect(loadProtocol(signal, environment)).resolves.toBe(1);
    expect(fetch).toHaveBeenCalledWith(new URL('http://localhost/market_producer_bg-HASH.wasm'), {
      signal,
      credentials: 'same-origin',
    });
    expect(environment.initialize).toHaveBeenCalledWith(response);
  });

  it.each([
    new Response('', { status: 404 }),
    new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    new Response(''),
  ])('rejects missing binaries and invalid MIME', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(loadProtocol(new AbortController().signal, environment)).rejects.toThrow();
    expect(environment.initialize).not.toHaveBeenCalled();
  });

  it('rejects cross-origin assets before fetching', async () => {
    vi.stubGlobal('location', { origin: 'https://other.example' });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(loadProtocol(new AbortController().signal, environment)).rejects.toThrow(
      'same-origin',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('propagates aborted fetches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')));
    await expect(loadProtocol(new AbortController().signal, environment)).rejects.toThrow(
      'Aborted',
    );
  });
});
