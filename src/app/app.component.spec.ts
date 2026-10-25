import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AppComponent } from './app.component';
import { appConfig } from './app.config';
import { ProducerService } from './features/market/client/producer.service';
import { PRODUCER_ENVIRONMENT } from './features/market/client/producer-environment';
import { ClientHarness } from '../../tests/support/market-fakes.helper';

describe('Application routing and producer lifetime', () => {
  let h: ClientHarness;
  beforeEach(() => {
    h = new ClientHarness();
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        ...appConfig.providers,
        { provide: PRODUCER_ENVIRONMENT, useValue: h.environment },
      ],
    });
  });

  it('starts the default producer from the shell and renders the lazy dashboard', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await TestBed.inject(Router).navigateByUrl('/');
    h.worker.ready();
    h.worker.ack();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toBe('Market dashboard');
    expect(TestBed.inject(Router).url).toBe('/dashboard');
    expect(element.textContent).toContain('Running');
    expect(element.querySelector('[aria-current="page"]')?.textContent).toBe('Dashboard');
    expect(h.workers).toHaveLength(1);
  });

  it('redirects unknown URLs to dashboard', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await TestBed.inject(Router).navigateByUrl('/unknown');
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/dashboard');
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toBe(
      'Market dashboard',
    );
  });

  it.each(['running', 'paused'])(
    'preserves the singleton in %s state across lazy route destruction/recreation',
    async (status) => {
      const fixture = TestBed.createComponent(AppComponent);
      const router = TestBed.inject(Router);
      const producer = TestBed.inject(ProducerService);
      await router.navigateByUrl('/');
      h.worker.ready();
      h.worker.ack();
      if (status === 'paused') {
        producer.pause();
        h.worker.ack();
      }
      const state = producer.state();
      const commands = h.worker.commands.length;
      await router.navigateByUrl('/settings');
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toBe(
        'Producer settings',
      );
      await router.navigateByUrl('/');
      await fixture.whenStable();
      expect(producer.state()).toBe(state);
      expect(h.workers).toHaveLength(1);
      expect(h.worker.commands).toHaveLength(commands);
      expect(h.worker.terminate).not.toHaveBeenCalled();
      fixture.destroy();
      expect(h.worker.terminate).not.toHaveBeenCalled();
      TestBed.resetTestingModule();
      expect(h.worker.terminate).toHaveBeenCalledOnce();
    },
  );
});
