import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormField, form, required, validate } from '@angular/forms/signals';
import { INTEGRATION_PROOF } from '../market/client/browser-worker';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  imports: [FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly draft = signal<{ count: number | null }>({ count: 5 });
  protected readonly proofForm = form(this.draft, (path) => {
    required(path.count, { message: 'Enter a number.' });
    validate(path.count, ({ value }) => {
      const count = value();
      return count === null || Number.isSafeInteger(count)
        ? undefined
        : { kind: 'integer', message: 'Enter a whole number.' };
    });
  });
  protected readonly proofErrors = computed(() => this.proofForm.count().errors());
  protected readonly status = signal('Loading worker and Wasm…');

  constructor() {
    const proof = inject(INTEGRATION_PROOF)();
    let active = true;
    inject(DestroyRef).onDestroy(() => {
      active = false;
      proof.dispose();
    });
    void proof.result.then(
      (version) => {
        if (active) this.status.set(`Worker and Wasm ready (protocol ${String(version)}).`);
      },
      () => {
        if (active) this.status.set('Worker or Wasm failed to load. Reload to retry.');
      },
    );
  }
}
