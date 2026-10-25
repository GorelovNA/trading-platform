export interface ProducerSettings {
  readonly instrumentCount: number;
  readonly updatesPerBatch: number;
  readonly batchIntervalMs: number;
}

export interface SettingsDraft {
  instrumentCount: number | null;
  updatesPerBatch: number | null;
  batchIntervalMs: number | null;
}

export interface FieldIssue {
  readonly field: keyof ProducerSettings;
  readonly code: 'required' | 'integer' | 'range';
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly FieldIssue[] };

export const DEFAULT_SETTINGS: ProducerSettings = Object.freeze({
  instrumentCount: 5,
  updatesPerBatch: 100,
  batchIntervalMs: 500,
});

export const SETTINGS_LIMITS = Object.freeze({
  instrumentCount: Object.freeze({ min: 1, max: 50 }),
  updatesPerBatch: Object.freeze({ min: 1, max: 1_000 }),
  batchIntervalMs: Object.freeze({ min: 50, max: 2_000 }),
});

function readField(input: unknown, field: keyof ProducerSettings): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  if (!Object.hasOwn(input, field)) return undefined;
  return Reflect.get(input, field);
}

function validateField(input: unknown, field: keyof ProducerSettings): Validation<number> {
  const value = readField(input, field);
  const { min, max } = SETTINGS_LIMITS[field];
  if (value === undefined || value === null || value === '') {
    return { ok: false, issues: [{ field, code: 'required' }] };
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false, issues: [{ field, code: 'integer' }] };
  }
  if (value < min || value > max) return { ok: false, issues: [{ field, code: 'range' }] };
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
