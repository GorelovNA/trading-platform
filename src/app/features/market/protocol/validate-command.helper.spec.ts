import { DEFAULT_SETTINGS } from '../domain/producer-settings.helper';
import { parseCommand } from './validate-command.helper';

const reset = { v: 1, type: 'reset', runId: 1, commandId: 1, settings: DEFAULT_SETTINGS, seed: 0 };
const invalid = { ok: false, code: 'INVALID_PROTOCOL' };

describe('command parsing', () => {
  it.each([
    reset,
    {
      ...reset,
      seed: 0xffff_ffff,
      runId: Number.MAX_SAFE_INTEGER,
      commandId: Number.MAX_SAFE_INTEGER,
    },
    { v: 1, type: 'pause', runId: 1, commandId: 2 },
    { v: 1, type: 'resume', runId: 1, commandId: 3 },
    { v: 1, type: 'snapshot-ack', runId: 1, sequence: Number.MAX_SAFE_INTEGER },
    { v: 1, type: 'dispose' },
  ])('parses supported commands: %s', (command) => {
    expect(parseCommand(command)).toEqual({ ok: true, value: command });
  });

  it.each([
    null,
    [],
    JSON.stringify(reset),
    1,
    {},
    { ...reset, v: 2 },
    { ...reset, type: 'unknown' },
    { ...reset, settings: { ...DEFAULT_SETTINGS, updatesPerBatch: '100' } },
  ])('rejects malformed commands: %s', (input) => {
    expect(parseCommand(input)).toEqual(invalid);
  });

  for (const field of ['runId', 'commandId', 'seed'] as const) {
    const values =
      field === 'seed'
        ? [-1, 0x1_0000_0000, NaN, Infinity, 1.5, '1', null, undefined]
        : [0, -1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, 1.5, '1', null, undefined];
    it.each(values)(`rejects invalid ${field}: %s`, (value) => {
      expect(parseCommand({ ...reset, [field]: value })).toEqual(invalid);
    });
  }

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, undefined])(
    'rejects invalid snapshot-ack sequence %s',
    (sequence) => {
      expect(parseCommand({ v: 1, type: 'snapshot-ack', runId: 1, sequence })).toEqual(invalid);
    },
  );

  it('copies validated settings and strips unrelated fields', () => {
    const settings = { ...DEFAULT_SETTINGS };
    const parsed = parseCommand({ ...reset, settings, secret: 'discard' });
    settings.instrumentCount = 50;
    expect(parsed).toEqual({ ok: true, value: reset });
  });
});
