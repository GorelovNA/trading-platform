import { TestBed } from '@angular/core/testing';
import { Settings } from './settings';
import { Producer } from '../market/client/producer';
import { PRODUCER_ENVIRONMENT } from '../market/client/producer-environment';
import { ClientHarness } from '../../../../tests/support/market-fakes';

describe('Settings Signal Form', () => {
  let h: ClientHarness;
  beforeEach(() => {
    h = new ClientHarness();
    TestBed.configureTestingModule({
      imports: [Settings],
      providers: [{ provide: PRODUCER_ENVIRONMENT, useValue: h.environment }],
    });
    TestBed.inject(Producer).start();
    h.worker.ready();
    h.worker.ack();
  });

  function field(element: HTMLElement, id: string): HTMLInputElement {
    const input = element.querySelector<HTMLInputElement>(`#${id}`);
    if (input === null) throw new Error(`Missing ${id}`);
    return input;
  }
  function edit(element: HTMLElement, id: string, value: string, blur = true): void {
    const input = field(element, id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    if (blur) input.dispatchEvent(new Event('blur'));
  }
  function apply(element: HTMLElement): void {
    element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  it('uses defaults, labels, numeric affordances, and an isolated draft', async () => {
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect([...element.querySelectorAll('input')].map((input) => input.value)).toEqual([
      '5',
      '100',
      '500',
    ]);
    const input = field(element, 'instrumentCount');
    expect(input.min).toBe('1');
    expect(input.max).toBe('50');
    expect(input.step).toBe('1');
    expect(element.querySelector('label')?.htmlFor).toBe(input.id);
    expect(input.getAttribute('aria-describedby')).toContain('instrumentCount-errors');
    edit(element, 'instrumentCount', '50');
    await fixture.whenStable();
    expect(TestBed.inject(Producer).state().requestedSettings.instrumentCount).toBe(5);
    expect(h.worker.commands).toHaveLength(1);
    fixture.destroy();
    const recreated = TestBed.createComponent(Settings);
    await recreated.whenStable();
    expect(field(recreated.nativeElement as HTMLElement, 'instrumentCount').value).toBe('5');
  });

  it.each([
    ['instrumentCount', '', 'Enter a number.'],
    ['instrumentCount', '1.5', 'Enter a finite whole number.'],
    ['instrumentCount', '0', 'Enter 1 or more.'],
    ['instrumentCount', '51', 'Enter 50 or less.'],
    ['updatesPerBatch', '0', 'Enter 1 or more.'],
    ['updatesPerBatch', '1001', 'Enter 1000 or less.'],
    ['batchIntervalMs', '49', 'Enter 50 or more.'],
    ['batchIntervalMs', '2001', 'Enter 2000 or less.'],
    ['batchIntervalMs', 'invalid', 'Enter a number.'],
  ])('rejects %s = %s with associated errors and no reset', async (id, value, message) => {
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    edit(element, id, value, false);
    await fixture.whenStable();
    expect(element.querySelector(`#${id}-errors`)?.textContent.trim()).toBe('');
    apply(element);
    await fixture.whenStable();
    expect(element.querySelector(`#${id}-errors`)?.textContent).toContain(message);
    if (value === '' || value === 'invalid') {
      expect(element.querySelector(`#${id}-errors`)?.textContent.trim()).toBe(message);
    }
    expect(field(element, id).getAttribute('aria-invalid')).toBe('true');
    expect(h.worker.commands).toHaveLength(1);
    edit(element, id, id === 'batchIntervalMs' ? '50' : '1');
    await fixture.whenStable();
    expect(element.querySelector(`#${id}-errors`)?.textContent.trim()).toBe('');
  });

  it.each(['running', 'paused'])(
    'Apply with identical values starts a new run from %s',
    async (status) => {
      const producer = TestBed.inject(Producer);
      if (status === 'paused') {
        producer.pause();
        h.worker.ack();
      }
      const fixture = TestBed.createComponent(Settings);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      apply(element);
      await fixture.whenStable();
      expect(producer.state()).toMatchObject({
        runId: 2,
        status: 'initializing',
        pendingAction: 'reset',
        activeSettings: null,
        generatedUpdates: 0n,
      });
      expect(element.textContent).toContain('Apply accepted');
      expect(element.textContent).toContain('Waiting for confirmation');
      h.worker.ack();
      await fixture.whenStable();
      expect(producer.state().status).toBe('running');
    },
  );

  it('accepts pasted boundary values and lets rapid valid Apply replace a pending reset', async () => {
    const producer = TestBed.inject(Producer);
    const fixture = TestBed.createComponent(Settings);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    edit(element, 'instrumentCount', '50');
    edit(element, 'updatesPerBatch', '1000');
    edit(element, 'batchIntervalMs', '50');
    apply(element);
    await fixture.whenStable();
    expect(producer.nominalUpdatesPerSecond()).toBe(20000);
    expect(producer.state().metrics).toHaveLength(50);
    edit(element, 'instrumentCount', '1');
    edit(element, 'updatesPerBatch', '1');
    edit(element, 'batchIntervalMs', '2000');
    apply(element);
    await fixture.whenStable();
    expect(producer.state().runId).toBe(3);
    h.worker.ack();
    h.worker.ack();
    expect(producer.state().activeSettings).toEqual({
      instrumentCount: 1,
      updatesPerBatch: 1,
      batchIntervalMs: 2000,
    });
    expect(producer.canPause()).toBe(true);
    expect(producer.canResume()).toBe(false);
  });
});
