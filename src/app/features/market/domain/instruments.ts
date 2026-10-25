import { SETTINGS_LIMITS } from './producer-settings';

export function instrumentSymbol(instrumentId: number): string {
  if (
    !Number.isInteger(instrumentId) ||
    instrumentId < 0 ||
    instrumentId >= SETTINGS_LIMITS.instrumentCount.max
  ) {
    throw new RangeError('Invalid instrument ID.');
  }
  return `SIM${String(instrumentId + 1).padStart(3, '0')}`;
}
