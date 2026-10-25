import { createWasmFactory, loadProtocol, WasmGenerator } from './wasm-generator.helper';

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

describe('Wasm generator ownership and factory', () => {
  it('initializes the module once, passes settings/seed and frees each binding exactly once', async () => {
    const load = vi.fn().mockResolvedValue(1);
    const output = new Uint32Array([1, 2, 3]);
    const binding = { generate_batch: vi.fn().mockReturnValue(output), free: vi.fn() };
    const construct = vi.fn().mockReturnValue(binding);
    const factory = createWasmFactory(load, construct);
    expect(() => factory.create(5, 42)).toThrow('WASM_LOAD_FAILED');
    const signal = new AbortController().signal;
    await Promise.all([factory.initialize(signal), factory.initialize(signal)]);
    expect(load).toHaveBeenCalledOnce();
    const generator = factory.create(5, 42);
    expect(construct).toHaveBeenCalledWith(5, 42);
    expect(generator.generateBatch(3)).toBe(output);
    expect(binding.generate_batch).toHaveBeenCalledWith(3);
    generator.dispose();
    generator.dispose();
    expect(binding.free).toHaveBeenCalledOnce();
    expect(() => generator.generateBatch(1)).toThrow('GENERATOR_FAILED');
  });

  it.each([0, 2])('rejects protocol %s', async (version) => {
    const factory = createWasmFactory(() => Promise.resolve(version));
    await expect(factory.initialize(new AbortController().signal)).rejects.toThrow(
      'WASM_LOAD_FAILED',
    );
    expect(() => factory.create(5, 42)).toThrow('WASM_LOAD_FAILED');
  });

  it('rejects aborted initialization even after a successful module load', async () => {
    const abort = new AbortController();
    abort.abort();
    const factory = createWasmFactory(() => Promise.resolve(1));
    await expect(factory.initialize(abort.signal)).rejects.toThrow('WASM_LOAD_FAILED');
  });

  it('does not free twice even if the generated free throws', () => {
    const binding = {
      generate_batch: vi.fn(),
      free: vi.fn(() => {
        throw new Error('broken');
      }),
    };
    const generator = new WasmGenerator(binding);
    expect(() => {
      generator.dispose();
    }).toThrow('broken');
    generator.dispose();
    expect(binding.free).toHaveBeenCalledOnce();
  });
});
