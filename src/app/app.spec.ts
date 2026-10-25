import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { App } from './app';
import { appConfig } from './app.config';

describe('Application routing', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [App], providers: appConfig.providers });
  });

  it('renders the lazy home page through the application shell', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('h1')?.textContent).toBe('Hello, world!');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('redirects unknown URLs to the home page', async () => {
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/unknown');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(TestBed.inject(Router).url).toBe('/');
    expect(element.querySelector('h1')?.textContent).toBe('Hello, world!');
  });
});
