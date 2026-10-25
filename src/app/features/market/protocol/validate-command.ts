import { validateSettings } from '../domain/producer-settings';
import type { Command, ParseResult } from './messages';
import { INVALID_PROTOCOL, isIntegerInRange, isProtocolId, isRecord } from './protocol-validation';

export function parseCommand(input: unknown): ParseResult<Command> {
  if (!isRecord(input) || input['v'] !== 1) return INVALID_PROTOCOL;
  const type = input['type'];
  if (type === 'dispose') return { ok: true, value: { v: 1, type } };
  const runId = input['runId'];
  if (!isProtocolId(runId)) return INVALID_PROTOCOL;
  if (type === 'snapshot-ack') {
    const sequence = input['sequence'];
    return isProtocolId(sequence)
      ? { ok: true, value: { v: 1, type, runId, sequence } }
      : INVALID_PROTOCOL;
  }
  const commandId = input['commandId'];
  if (!isProtocolId(commandId)) return INVALID_PROTOCOL;
  if (type === 'pause' || type === 'resume') {
    return { ok: true, value: { v: 1, type, runId, commandId } };
  }
  if (type !== 'reset') return INVALID_PROTOCOL;
  const seed = input['seed'];
  const settings = validateSettings(input['settings']);
  if (!settings.ok || !isIntegerInRange(seed, 0, 0xffff_ffff)) return INVALID_PROTOCOL;
  return { ok: true, value: { v: 1, type, runId, commandId, seed, settings: settings.value } };
}
