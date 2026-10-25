import {
  DEFAULT_SETTINGS,
  SETTINGS_LIMITS,
  validateSettings,
  type ProducerSettings,
} from './producer-settings';

describe('producer settings', () => {
  it('returns fresh validated defaults without changing the input', () => {
    const input = Object.freeze({ ...DEFAULT_SETTINGS, ignored: 'extra' });
    const result = validateSettings(input);
    expect(DEFAULT_SETTINGS).toEqual({
      instrumentCount: 5,
      updatesPerBatch: 100,
      batchIntervalMs: 500,
    });
    expect(result).toEqual({ ok: true, value: DEFAULT_SETTINGS });
    if (!result.ok) throw new Error('Expected valid defaults.');
    expect(result.value).not.toBe(input);
    expect(result.value).not.toHaveProperty('ignored');
    expect(input.ignored).toBe('extra');
  });

  const fields: readonly (keyof ProducerSettings)[] = [
    'instrumentCount',
    'updatesPerBatch',
    'batchIntervalMs',
  ];
  for (const field of fields) {
    const { min, max } = SETTINGS_LIMITS[field];
    it.each([min, max])(`accepts the inclusive ${field} boundary %s`, (value) => {
      const input = { ...DEFAULT_SETTINGS, [field]: value };
      expect(validateSettings(input)).toEqual({ ok: true, value: input });
    });

    it.each([min - 1, max + 1, Number.MAX_SAFE_INTEGER + 1])(
      `rejects out-of-range ${field}: %s`,
      (value) => {
        expect(validateSettings({ ...DEFAULT_SETTINGS, [field]: value })).toEqual({
          ok: false,
          issues: [{ field, code: 'range' }],
        });
      },
    );

    it.each([1.5, NaN, Infinity, -Infinity, '100', ' ', false, {}, []])(
      `rejects noninteger ${field}: %s without coercion`,
      (value) => {
        const input = Object.freeze({ ...DEFAULT_SETTINGS, [field]: value });
        expect(validateSettings(input)).toEqual({
          ok: false,
          issues: [{ field, code: 'integer' }],
        });
        expect(input[field]).toBe(value);
      },
    );

    it.each([undefined, null, ''])(`requires ${field}: %s`, (value) => {
      expect(validateSettings({ ...DEFAULT_SETTINGS, [field]: value })).toEqual({
        ok: false,
        issues: [{ field, code: 'required' }],
      });
    });
  }

  it.each([undefined, null, '', 'settings', 5, true, [], {}, Object.create(DEFAULT_SETTINGS)])(
    'reports every missing own field for %s',
    (input: unknown) => {
      expect(validateSettings(input)).toEqual({
        ok: false,
        issues: fields.map((field) => ({ field, code: 'required' })),
      });
    },
  );

  it('collects mixed field issues in stable field order without changing input', () => {
    const input = Object.freeze({ instrumentCount: 0, updatesPerBatch: 1.5 });
    expect(validateSettings(input)).toEqual({
      ok: false,
      issues: [
        { field: 'instrumentCount', code: 'range' },
        { field: 'updatesPerBatch', code: 'integer' },
        { field: 'batchIntervalMs', code: 'required' },
      ],
    });
    expect(input).toEqual({ instrumentCount: 0, updatesPerBatch: 1.5 });
  });
});
