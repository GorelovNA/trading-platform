import { TestBed } from '@angular/core/testing';
import { Home } from './home';
import { Producer } from '../market/client/producer';
import { PRODUCER_ENVIRONMENT } from '../market/client/producer-environment';
import { ClientHarness } from '../../../../tests/support/market-fakes';

describe('Home integration placeholder', () => {
  let h: ClientHarness;
  beforeEach(() => {
    h = new ClientHarness();
    TestBed.configureTestingModule({
      imports: [Home],
      providers: [{ provide: PRODUCER_ENVIRONMENT, useValue: h.environment }],
    });
  });

  it('renders the welcome page and reads producer status without starting another producer', async () => {
    const producer = TestBed.inject(Producer);
    producer.start();
    h.worker.ready();
    h.worker.ack();
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('main')).not.toBeNull();
    expect(element.querySelector('h1')?.textContent).toBe('Hello, world!');
    expect(element.textContent).toContain('Market producer: running.');
    fixture.destroy();
    expect(h.worker.terminate).not.toHaveBeenCalled();
  });

  it('shows a safe local initialization failure', async () => {
    TestBed.inject(Producer).start();
    h.worker.message({
      v: 1,
      type: 'error',
      runId: null,
      commandId: null,
      code: 'WASM_LOAD_FAILED',
      detail: 'private',
    });
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Retry to start a new run.');
    expect(element.textContent).not.toContain('private');
  });

  it('validates numeric input including blank and fractional values', async () => {
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('input');
    if (input === null) throw new Error('Missing numeric field');
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
