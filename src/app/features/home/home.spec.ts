import { TestBed } from '@angular/core/testing';

import { Home } from './home';
import { INTEGRATION_PROOF, type IntegrationProof } from '../market/client/browser-worker';

describe('Home', () => {
  const dispose = vi.fn();
  let result: Promise<number>;

  beforeEach(() => {
    result = Promise.resolve(1);
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        { provide: INTEGRATION_PROOF, useValue: (): IntegrationProof => ({ result, dispose }) },
      ],
    });
  });

  it('renders an accessible welcome page', async () => {
    TestBed.configureTestingModule({ imports: [Home] });
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('main')).not.toBeNull();
    expect(element.querySelector('h1')?.textContent).toBe('Hello, world!');
    expect(element.textContent).toContain('Trading Platform');
  });

  it('shows the compiled worker result and disposes on navigation', async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const element: unknown = fixture.nativeElement;
    if (!(element instanceof HTMLElement)) throw new Error('Missing host');
    expect(element.textContent).toContain('Worker and Wasm ready (protocol 1).');
    fixture.destroy();
    expect(dispose).toHaveBeenCalled();
  });

  it('shows a local error when initialization fails', async () => {
    result = Promise.reject(new Error('private implementation details'));
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const element: unknown = fixture.nativeElement;
    if (!(element instanceof HTMLElement)) throw new Error('Missing host');
    expect(element.textContent).toContain('Reload to retry.');
    expect(element.textContent).not.toContain('private implementation details');
  });

  it.each([true, false])(
    'ignores late completion after destruction (success=%s)',
    async (success) => {
      let finish: (() => void) | undefined;
      result = new Promise((resolve, reject) => {
        finish = (): void => {
          if (success) resolve(1);
          else reject(new Error('stale'));
        };
      });
      const fixture = TestBed.createComponent(Home);
      fixture.destroy();
      finish?.();
      await result.catch(() => undefined);
    },
  );

  it('validates actual numeric input including blank and fractional values', async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const element: unknown = fixture.nativeElement;
    if (!(element instanceof HTMLElement)) throw new Error('Missing host');
    const input = element.querySelector('input');
    if (!input) throw new Error('Missing numeric field');
    for (const [value, message] of [
      ['', 'Enter a number.'],
      ['1.5', 'Enter a whole number.'],
      ['10', ''],
    ]) {
      input.value = value ?? '';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      expect(element.querySelector('#proof-errors')?.textContent.trim()).toBe(message);
    }
  });
});
