import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const directory = new URL('../dist/trading-platform/browser/', import.meta.url);
const files = await readdir(directory, { recursive: true });
const wasm = files.filter((file) => file.endsWith('.wasm'));
assert.equal(wasm.length, 1, 'Expected exactly one emitted Wasm asset.');
assert.match(wasm[0], /market_producer_bg-[\w-]+\.wasm$/u, 'Wasm must be hashed.');
for (const file of files.filter((file) => file.endsWith('.html'))) {
  const html = await readFile(new URL(file, directory), 'utf8');
  assert.doesNotMatch(
    html,
    /<style\b|\sstyle\s*=|\son\w+\s*=/iu,
    `${file}: inline styles/event handlers`,
  );
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc\s*=)[^>]*>/iu, `${file}: inline script`);
  assert.doesNotMatch(
    html,
    /(?:src|href)\s*=\s*["'](?:https?:|\/\/|data:)/iu,
    `${file}: external asset`,
  );
}
const stats = JSON.parse(
  await readFile(new URL('../dist/trading-platform/browser-stats.json', import.meta.url), 'utf8'),
);
const outputs = Object.entries(stats.outputs);
const wasmUsers = outputs.filter(([, output]) =>
  Object.keys(output.inputs).some((input) => input.endsWith('market_producer.js')),
);
assert.equal(wasmUsers.length, 1, 'Generated glue must occur in exactly one output.');
assert.match(
  wasmUsers[0][1].entryPoint,
  /market\.worker\.ts$/u,
  'Wasm glue must belong to the worker entry.',
);
const workerOutput = wasmUsers[0][0];
assert.match(workerOutput, /worker-[\w-]+\.js$/u, 'Worker must be hashed.');
for (const [name, output] of outputs) {
  if (name !== workerOutput) {
    assert.ok(
      !Object.keys(output.inputs).some((input) =>
        /(?:metric-accumulator|worker-controller|wasm-generator)\.ts$/u.test(input),
      ),
      `${name}: worker implementation in main-thread graph`,
    );
    assert.ok(
      !output.imports.some((item) => item.path.endsWith('.wasm')),
      `${name}: main-thread Wasm import`,
    );
  }
}
const redirects = (await readFile(new URL('_redirects', directory), 'utf8'))
  .trim()
  .split('\n')
  .map((line) => line.trim());
assert.deepEqual(
  redirects,
  [
    '/dashboard /index.html 200',
    '/dashboard/ /index.html 200',
    '/settings /index.html 200',
    '/settings/ /index.html 200',
  ],
  'Only product routes may rewrite to the application.',
);
assert.ok(files.includes('404.html'), 'A static 404 must prevent missing-asset SPA fallback.');
console.log(`Verified external HTML assets, worker-only glue, hashed worker and ${wasm[0]}.`);
