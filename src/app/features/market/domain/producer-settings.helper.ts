import type { ProducerSettings, Validation } from '../models/producer-settings.model';
import { FieldIssueCode } from '../models/producer-settings-enums.model';
import { SETTINGS_LIMITS } from '../models/producer-settings.model';

export const DEFAULT_SETTINGS: ProducerSettings = Object.freeze({
  instrumentCount: 5,
  updatesPerBatch: 100,
  batchIntervalMs: 500,
});

export { SETTINGS_LIMITS };

function readField(input: unknown, field: keyof ProducerSettings): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  if (!Object.hasOwn(input, field)) return undefined;
  return Reflect.get(input, field);
}

function validateField(input: unknown, field: keyof ProducerSettings): Validation<number> {
  const value = readField(input, field);
  const { min, max } = SETTINGS_LIMITS[field];
  if (value === undefined || value === null || value === '') {
    return { ok: false, issues: [{ field, code: FieldIssueCode.Required }] };
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false, issues: [{ field, code: FieldIssueCode.Integer }] };
  }
  if (value < min || value > max) {
    return { ok: false, issues: [{ field, code: FieldIssueCode.Range }] };
  }
  return { ok: true, value };
}

export function validateSettings(input: unknown): Validation<ProducerSettings> {
  const instrumentCount = validateField(input, 'instrumentCount');
  const updatesPerBatch = validateField(input, 'updatesPerBatch');
  const batchIntervalMs = validateField(input, 'batchIntervalMs');
  if (!instrumentCount.ok || !updatesPerBatch.ok || !batchIntervalMs.ok) {
    return {
      ok: false,
      issues: [instrumentCount, updatesPerBatch, batchIntervalMs].flatMap((result) =>
        result.ok ? [] : result.issues,
      ),
    };
  }
  return {
    ok: true,
    value: {
      instrumentCount: instrumentCount.value,
      updatesPerBatch: updatesPerBatch.value,
      batchIntervalMs: batchIntervalMs.value,
    },
  };
}
