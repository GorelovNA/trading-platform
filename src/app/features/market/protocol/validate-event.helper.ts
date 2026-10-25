import { ControlAction, ErrorCode } from '../models/market.model';
import {
  CommandOutcome,
  WorkerEventType,
  WorkerStatus,
  type ParseResult,
  type WorkerEvent,
} from '../models/protocol.model';
import { INVALID_PROTOCOL, isProtocolId, isRecord } from './protocol-validation.helper';
import { parseSnapshot } from './snapshot-codec.helper';

function isErrorCode(input: unknown): input is ErrorCode {
  return Object.values(ErrorCode).some((code) => code === input);
}

export function parseWorkerEvent(input: unknown): ParseResult<WorkerEvent> {
  if (!isRecord(input) || input['v'] !== 1) return INVALID_PROTOCOL;
  const type = input['type'];
  if (type === WorkerEventType.Ready) {
    return { ok: true, value: { v: 1, type: WorkerEventType.Ready } };
  }
  if (type === WorkerEventType.Snapshot) return parseSnapshot(input);
  const runId = input['runId'];
  const commandId = input['commandId'];
  if (type === WorkerEventType.Error) {
    const code = input['code'];
    if (
      (runId !== null && !isProtocolId(runId)) ||
      (commandId !== null && !isProtocolId(commandId)) ||
      !isErrorCode(code)
    )
      return INVALID_PROTOCOL;
    return { ok: true, value: { v: 1, type: WorkerEventType.Error, runId, commandId, code } };
  }
  if (type !== WorkerEventType.CommandAck || !isProtocolId(runId) || !isProtocolId(commandId))
    return INVALID_PROTOCOL;
  const action = input['action'];
  const outcome = input['outcome'];
  const status = input['status'];
  if (
    (action !== ControlAction.Reset &&
      action !== ControlAction.Pause &&
      action !== ControlAction.Resume) ||
    (outcome !== CommandOutcome.Applied && outcome !== CommandOutcome.Ignored) ||
    (status !== WorkerStatus.Running && status !== WorkerStatus.Paused)
  ) {
    return INVALID_PROTOCOL;
  }
  const controlAction =
    action === ControlAction.Reset
      ? ControlAction.Reset
      : action === ControlAction.Pause
        ? ControlAction.Pause
        : ControlAction.Resume;
  return {
    ok: true,
    value: {
      v: 1,
      type: WorkerEventType.CommandAck,
      runId,
      commandId,
      action: controlAction,
      outcome,
      status,
    },
  };
}
