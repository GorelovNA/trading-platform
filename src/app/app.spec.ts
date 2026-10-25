import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { App } from './app';
import { appConfig } from './app.config';
import { routes } from './app.routes';
import { Producer } from './features/market/client/producer';
import { PRODUCER_ENVIRONMENT } from './features/market/client/producer-environment';
import { ClientHarness } from '../../tests/support/market-fakes';

@Component({
  selector: 'app-navigation-target',
  template: '<p>Other lazy route</p>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class NavigationTarget {}

describe('Application routing and producer lifetime', () => {
  let h: ClientHarness;
  beforeEach(() => {
    h = new ClientHarness();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        ...appConfig.providers,
        { provide: PRODUCER_ENVIRONMENT, useValue: h.environment },
      ],
    });
  });

  it('starts the default producer from the shell and renders the lazy home page', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    h.worker.ready();
    h.worker.ack();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toBe('Hello, world!');
    expect(element.textContent).toContain('Market producer: running.');
    expect(h.workers).toHaveLength(1);
  });

  it('redirects unknown URLs to home', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/unknown');
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/');
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toBe(
      'Hello, world!',
    );
  });

  it.each(['running', 'paused'])(
    'preserves the singleton in %s state across lazy route destruction/recreation',
    async (status) => {
      const fixture = TestBed.createComponent(App);
      const router = TestBed.inject(Router);
      router.resetConfig([
        {
          path: 'away',
          loadComponent: (): Promise<typeof NavigationTarget> => Promise.resolve(NavigationTarget),
        },
        ...routes,
      ]);
      const producer = TestBed.inject(Producer);
      await router.navigateByUrl('/');
      h.worker.ready();
      h.worker.ack();
      if (status === 'paused') {
        producer.pause();
        h.worker.ack();
      }
      const state = producer.state();
      const commands = h.worker.commands.length;
      await router.navigateByUrl('/away');
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Other lazy route');
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
