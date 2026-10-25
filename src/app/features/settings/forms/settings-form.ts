import { max, min, required, schema, validate } from '@angular/forms/signals';
import { SETTINGS_LIMITS, type SettingsDraft } from '../../market/domain/producer-settings';

export const SETTINGS_FIELDS = [
  { key: 'instrumentCount', label: 'Instrument count', hint: '1–50 fictional instruments.' },
  {
    key: 'updatesPerBatch',
    label: 'Updates per batch',
    hint: '1–1,000 updates across all instruments.',
  },
  {
    key: 'batchIntervalMs',
    label: 'Batch interval (ms)',
    hint: '50–2,000 milliseconds between batches.',
  },
] as const;

export const settingsSchema = schema<SettingsDraft>((path) => {
  for (const { key } of SETTINGS_FIELDS) {
    required(path[key], { message: 'Enter a number.' });
    min(path[key], SETTINGS_LIMITS[key].min, {
      message: `Enter ${String(SETTINGS_LIMITS[key].min)} or more.`,
    });
    max(path[key], SETTINGS_LIMITS[key].max, {
      message: `Enter ${String(SETTINGS_LIMITS[key].max)} or less.`,
    });
    validate(path[key], ({ value }) => {
      const current = value();
      return current === null || (Number.isFinite(current) && Number.isInteger(current))
        ? undefined
        : { kind: 'integer', message: 'Enter a finite whole number.' };
    });
  }
});
