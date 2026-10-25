import { TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { ProducerService } from '../market/client/producer.service';
import { PRODUCER_ENVIRONMENT } from '../market/client/producer-environment';
import { MetricAccumulator } from '../market/domain/metric-accumulator';
import { encodeSnapshot } from '../market/protocol/snapshot-codec.helper';
import { ClientHarness } from '../../../../tests/support/market-fakes.helper';

describe('Dashboard', () => {
  let h: ClientHarness;
  beforeEach(() => {
    h = new ClientHarness();
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [{ provide: PRODUCER_ENVIRONMENT, useValue: h.environment }],
    });
    TestBed.inject(ProducerService).start();
  });

  it('shows every initial instrument with unavailable metrics and zero volume', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(element.querySelector('tbody tr')?.textContent).toContain('SIM001');
    expect(
      [...element.querySelectorAll('tbody tr:first-child td')].map((cell) => cell.textContent),
    ).toEqual(['—', '—', '0', '—', '—']);
    expect(element.querySelector('caption')?.textContent).toContain('current run');
    expect(element.querySelectorAll('thead th[scope="col"]')).toHaveLength(6);
    expect(element.textContent).toContain('200 updates/s nominal across all instruments');
    expect(element.querySelector('button')?.disabled).toBe(true);
  });

  it('renders the worked example after a frame, retains row nodes, and confirms pause/resume', async () => {
    h.worker.ready();
    h.worker.ack();
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const firstRow = element.querySelector('tbody tr');
    const accumulator = new MetricAccumulator(5);
    accumulator.applyValidatedBatch(
      Uint32Array.from([0, 10000, 10, 9996, 10000, 600, 400, 0, 10200, 30, 10196, 10200, 600, 400]),
      2,
    );
    h.worker.message(
      encodeSnapshot(accumulator.snapshotValues(), {
        runId: 1,
        sequence: 1,
        latestBatchEpochMs: 1000050,
      }),
    );
    h.paint();
    await fixture.whenStable();
    expect(element.querySelector('tbody tr')).toBe(firstRow);
    expect(
      [...element.querySelectorAll('tbody tr:first-child td')].map((cell) => cell.textContent),
    ).toEqual(['$102.00', '$0.04', '40', '$101.50', '+0.20']);
    element.querySelector('button')?.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('Pausing generation');
    expect(element.querySelector('button')?.disabled).toBe(true);
    h.worker.ack();
    await fixture.whenStable();
    expect(element.textContent).toContain('Paused. Values and totals are preserved.');
    element.querySelector('button')?.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('Resuming generation');
    h.worker.ack();
    await fixture.whenStable();
    expect(element.textContent).toContain('Running');
    expect(TestBed.inject(ProducerService).state().generatedUpdates).toBe(2n);
  });

  it('shows safe failure and stale feedback and retries with one fresh worker', async () => {
    h.worker.ready();
    h.worker.ack();
    const fixture = TestBed.createComponent(DashboardComponent);
    h.worker.message({
      v: 1,
      type: 'error',
      runId: 1,
      commandId: null,
      code: 'WASM_LOAD_FAILED',
      detail: 'private',
    });
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('could not load');
    expect(element.textContent).toContain('stale');
    expect(element.textContent).not.toContain('private');
    expect(element.querySelector('button')?.textContent.trim()).toBe('Retry');
    element.querySelector('button')?.click();
    await fixture.whenStable();
    expect(h.workers).toHaveLength(2);
    expect(element.textContent).toContain('Starting a new run');
  });

  it('offers no retry for unsupported browsers', async () => {
    h.environment.supported = (): boolean => false;
    TestBed.inject(ProducerService).apply({
      instrumentCount: 1,
      updatesPerBatch: 1,
      batchIntervalMs: 50,
    });
    const fixture = TestBed.createComponent(DashboardComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('does not support');
    expect(element.textContent).not.toContain('Retry');
    expect(element.querySelector('button')?.disabled).toBe(true);
  });
});
