import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, form, submit } from '@angular/forms/signals';
import { ProducerService } from '../market/client/producer.service';
import { validateSettings } from '../market/domain/producer-settings.helper';
import type { SettingsDraft } from '../market/models/producer-settings.model';
import { ProducerStatusComponent } from '../../shared/producer-status.component';
import { SETTINGS_FIELDS, settingsSchema } from './forms/settings-form';

@Component({
  selector: 'app-settings',
  imports: [FormField, ProducerStatusComponent],
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly producer = inject(ProducerService);
  private readonly draft = signal<SettingsDraft>({ ...this.producer.state().requestedSettings });
  protected readonly settingsForm = form(this.draft, settingsSchema);
  protected readonly submissionMessage = signal('');
  protected readonly fields = computed(() =>
    SETTINGS_FIELDS.map((definition) => {
      const field = this.settingsForm[definition.key];
      const state = field();
      return {
        ...definition,
        field,
        invalid: state.touched() && state.invalid(),
        errors: state.touched()
          ? state.errors().map((error) => error.message ?? 'Enter a valid number.')
          : [],
      };
    }),
  );

  protected async applySettings(event: Event): Promise<void> {
    event.preventDefault();
    this.submissionMessage.set('');
    await submit(this.settingsForm, {
      action: (): Promise<undefined> => {
        const settings = validateSettings({ ...this.draft() });
        if (settings.ok) {
          this.producer.apply(settings.value);
          this.submissionMessage.set('Apply accepted. A new run was requested.');
        }
        return Promise.resolve(undefined);
      },
    });
  }
}
