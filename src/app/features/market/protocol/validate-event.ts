import type { ErrorCode } from '../domain/market-models';
import type { ParseResult, WorkerEvent } from './messages';
import { INVALID_PROTOCOL, isProtocolId, isRecord } from './protocol-validation';
import { parseSnapshot } from './snapshot-codec';

function isErrorCode(input: unknown): input is ErrorCode {
  return (
    input === 'UNSUPPORTED_BROWSER' ||
    input === 'WASM_LOAD_FAILED' ||
    input === 'INITIALIZATION_TIMEOUT' ||
    input === 'COMMAND_TIMEOUT' ||
    input === 'INVALID_PROTOCOL' ||
    input === 'INVALID_BATCH' ||
    input === 'GENERATOR_FAILED' ||
    input === 'WORKER_FAILED'
  );
}

export function parseWorkerEvent(input: unknown): ParseResult<WorkerEvent> {
  if (!isRecord(input) || input['v'] !== 1) return INVALID_PROTOCOL;
  const type = input['type'];
  if (type === 'ready') return { ok: true, value: { v: 1, type } };
  if (type === 'snapshot') return parseSnapshot(input);
  const runId = input['runId'];
  const commandId = input['commandId'];
  if (type === 'error') {
    const code = input['code'];
    if (
      (runId !== null && !isProtocolId(runId)) ||
      (commandId !== null && !isProtocolId(commandId)) ||
      !isErrorCode(code)
    )
      return INVALID_PROTOCOL;
    return { ok: true, value: { v: 1, type, runId, commandId, code } };
  }
  if (type !== 'command-ack' || !isProtocolId(runId) || !isProtocolId(commandId))
    return INVALID_PROTOCOL;
  const action = input['action'];
  const outcome = input['outcome'];
  const status = input['status'];
  if (
    (action !== 'reset' && action !== 'pause' && action !== 'resume') ||
    (outcome !== 'applied' && outcome !== 'ignored') ||
    (status !== 'running' && status !== 'paused')
  ) {
    return INVALID_PROTOCOL;
  }
  return { ok: true, value: { v: 1, type, runId, commandId, action, outcome, status } };
}
