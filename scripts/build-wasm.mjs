import { checkToolchain, run, root } from './check-toolchain.mjs';
import { resolve } from 'node:path';
import { unlinkSync } from 'node:fs';

checkToolchain();
run('wasm-pack', [
  'build',
  '.',
  '--target',
  'web',
  '--release',
  '--out-name',
  'market_producer',
  '--out-dir',
  resolve(root, 'src/generated/market-producer'),
  '--locked',
]);
// wasm-bindgen's raw-instance declaration would shadow the file loader's URL declaration.
// The public web-glue declaration remains intact; only this generated asset typing is removed.
unlinkSync(resolve(root, 'src/generated/market-producer/market_producer_bg.wasm.d.ts'));
