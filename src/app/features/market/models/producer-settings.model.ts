import type { FieldIssueCode } from './producer-settings-enums.model';

export const SETTINGS_LIMITS = Object.freeze({
  instrumentCount: Object.freeze({ min: 1, max: 50 }),
  updatesPerBatch: Object.freeze({ min: 1, max: 1_000 }),
  batchIntervalMs: Object.freeze({ min: 50, max: 2_000 }),
});

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
  readonly code: FieldIssueCode;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly FieldIssue[] };
