import { ErrorCode } from '../models/market.model';

export const INVALID_PROTOCOL = Object.freeze({
  ok: false,
  code: ErrorCode.InvalidProtocol,
} as const);

export function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

export function isIntegerInRange(input: unknown, min: number, max: number): input is number {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= min && input <= max;
}

export function isProtocolId(input: unknown): input is number {
  return isIntegerInRange(input, 1, Number.MAX_SAFE_INTEGER);
}

// Native getter checks the internal brand, including cross-realm structured-clone results.
// instanceof alone rejects genuine buffers from another realm; toString tags can be forged.
export function isArrayBuffer(input: unknown): input is ArrayBuffer {
  try {
    const byteLength: unknown = Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      'byteLength',
    )?.get?.call(input);
    return typeof byteLength === 'number';
  } catch {
    return false;
  }
}
