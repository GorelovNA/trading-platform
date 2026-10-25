import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initSync, protocol_version } from '../../src/generated/market-producer/market_producer.js';

test('the delivered web module initializes from the real Wasm bytes', async () => {
  const bytes = await readFile(
    new URL('../../src/generated/market-producer/market_producer_bg.wasm', import.meta.url),
  );
  initSync({ module: bytes });
  assert.equal(protocol_version(), 1);
});
