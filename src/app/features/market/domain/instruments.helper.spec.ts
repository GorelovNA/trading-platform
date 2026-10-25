import { instrumentSymbol } from './instruments.helper';

describe('instrument symbols', () => {
  it('maps every supported zero-based ID to a stable, unique symbol', () => {
    const symbols = Array.from({ length: 50 }, (_, id) => instrumentSymbol(id));
    expect(symbols[0]).toBe('SIM001');
    expect(symbols[8]).toBe('SIM009');
    expect(symbols[9]).toBe('SIM010');
    expect(symbols[49]).toBe('SIM050');
    expect(new Set(symbols).size).toBe(50);
    expect(symbols).toEqual(Array.from({ length: 50 }, (_, id) => instrumentSymbol(id)));
  });

  it.each([-1, 50, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER])(
    'rejects an invalid instrument ID: %s',
    (id) => {
      expect(() => instrumentSymbol(id)).toThrow(RangeError);
    },
  );
});
