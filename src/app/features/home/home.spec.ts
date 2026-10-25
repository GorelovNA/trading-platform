import { TestBed } from '@angular/core/testing';

import { Home } from './home';

describe('Home', () => {
  it('renders an accessible welcome page', async () => {
    TestBed.configureTestingModule({ imports: [Home] });
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('main')).not.toBeNull();
    expect(element.querySelector('h1')?.textContent).toBe('Hello, world!');
    expect(element.textContent).toContain('Trading Platform');
  });
});
