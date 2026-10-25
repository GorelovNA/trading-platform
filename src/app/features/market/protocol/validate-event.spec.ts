import { MetricAccumulator } from '../domain/metric-accumulator';
import { encodeSnapshot } from './snapshot-codec';
import { parseWorkerEvent } from './validate-event';

const ack = {
  v: 1,
  type: 'command-ack',
  runId: 1,
  commandId: 2,
  action: 'reset',
  outcome: 'applied',
  status: 'running',
};
const invalid = { ok: false, code: 'INVALID_PROTOCOL' };

describe('worker event parsing', () => {
  it('accepts readiness and structurally valid snapshots', () => {
    expect(parseWorkerEvent({ v: 1, type: 'ready' })).toEqual({
      ok: true,
      value: { v: 1, type: 'ready' },
    });
    const snapshot = encodeSnapshot(new MetricAccumulator(5).snapshotValues(), {
      runId: 1,
      sequence: 1,
      latestBatchEpochMs: 0,
    });
    expect(parseWorkerEvent(snapshot)).toEqual({ ok: true, value: snapshot });
    expect(parseWorkerEvent({ ...snapshot, rowCount: 6 })).toEqual(invalid);
  });

  it.each([
    ack,
    { ...ack, action: 'pause', outcome: 'ignored', status: 'paused' },
    {
      ...ack,
      action: 'resume',
      runId: Number.MAX_SAFE_INTEGER,
      commandId: Number.MAX_SAFE_INTEGER,
    },
  ])('accepts control acknowledgements: %s', (event) => {
    expect(parseWorkerEvent(event)).toEqual({ ok: true, value: event });
  });

  it.each([
    'UNSUPPORTED_BROWSER',
    'WASM_LOAD_FAILED',
    'INITIALIZATION_TIMEOUT',
    'COMMAND_TIMEOUT',
    'INVALID_PROTOCOL',
    'INVALID_BATCH',
    'GENERATOR_FAILED',
    'WORKER_FAILED',
  ])('accepts only fixed safe error codes: %s', (code) => {
    for (const ids of [
      { runId: null, commandId: null },
      { runId: 1, commandId: 2 },
    ]) {
      const event = { v: 1, type: 'error', ...ids, code };
      expect(parseWorkerEvent(event)).toEqual({ ok: true, value: event });
    }
  });

  it.each([
    null,
    [],
    '{}',
    {},
    { ...ack, v: 0 },
    { ...ack, type: 'other' },
    { ...ack, action: 'dispose' },
    { ...ack, outcome: 'pending' },
    { ...ack, status: 'error' },
    { ...ack, runId: null },
    { ...ack, commandId: 0 },
    { v: 1, type: 'error', runId: null, commandId: null, code: '<script>bad</script>' },
    { v: 1, type: 'error', runId: null, commandId: null },
  ])('rejects malformed events: %s', (event) => {
    expect(parseWorkerEvent(event)).toEqual(invalid);
  });

  for (const type of ['command-ack', 'error']) {
    for (const field of ['runId', 'commandId']) {
      it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', undefined])(
        `rejects invalid ${type} ${field}: %s`,
        (value) => {
          expect(parseWorkerEvent({ ...ack, type, code: 'WORKER_FAILED', [field]: value })).toEqual(
            invalid,
          );
        },
      );
    }
  }

  it('strips error details instead of forwarding stack traces or arbitrary fields', () => {
    const event = { v: 1, type: 'error', runId: null, commandId: null, code: 'WORKER_FAILED' };
    expect(parseWorkerEvent({ ...event, stack: 'private path', html: '<b>bad</b>' })).toEqual({
      ok: true,
      value: event,
    });
  });
});
