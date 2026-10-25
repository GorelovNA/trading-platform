import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, form, required, validate } from '@angular/forms/signals';
import { Producer } from '../market/client/producer';

@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  imports: [FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  private readonly producer = inject(Producer);
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
  protected readonly status = computed(
    () => this.producer.failureMessage() ?? `Market producer: ${this.producer.state().status}.`,
  );
}
