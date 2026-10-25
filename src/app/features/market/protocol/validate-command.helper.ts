import { validateSettings } from '../domain/producer-settings.helper';
import { CommandType, type Command, type ParseResult } from '../models/protocol.model';
import {
  INVALID_PROTOCOL,
  isIntegerInRange,
  isProtocolId,
  isRecord,
} from './protocol-validation.helper';

export function parseCommand(input: unknown): ParseResult<Command> {
  if (!isRecord(input) || input['v'] !== 1) return INVALID_PROTOCOL;
  const type = input['type'];
  if (type === CommandType.Dispose) {
    return { ok: true, value: { v: 1, type: CommandType.Dispose } };
  }
  const runId = input['runId'];
  if (!isProtocolId(runId)) return INVALID_PROTOCOL;
  if (type === CommandType.SnapshotAck) {
    const sequence = input['sequence'];
    return isProtocolId(sequence)
      ? { ok: true, value: { v: 1, type: CommandType.SnapshotAck, runId, sequence } }
      : INVALID_PROTOCOL;
  }
  const commandId = input['commandId'];
  if (!isProtocolId(commandId)) return INVALID_PROTOCOL;
  if (type === CommandType.Pause || type === CommandType.Resume) {
    return {
      ok: true,
      value: {
        v: 1,
        type: type === CommandType.Pause ? CommandType.Pause : CommandType.Resume,
        runId,
        commandId,
      },
    };
  }
  if (type !== CommandType.Reset) return INVALID_PROTOCOL;
  const seed = input['seed'];
  const settings = validateSettings(input['settings']);
  if (!settings.ok || !isIntegerInRange(seed, 0, 0xffff_ffff)) return INVALID_PROTOCOL;
  return {
    ok: true,
    value: { v: 1, type: CommandType.Reset, runId, commandId, seed, settings: settings.value },
  };
}
