import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, run } from './check-toolchain.mjs';

function cli(packageName, bin, args) {
  const directory = resolve(root, 'node_modules', packageName);
  const metadata = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  const file = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin[bin];
  run(process.execPath, [resolve(directory, file), ...args], { cwd: root });
}

function types() {
  cli('@angular/compiler-cli', 'ngc', ['-p', 'tsconfig.app.json', '--noEmit']);
  for (const config of ['tsconfig.spec.json', 'tsconfig.worker.json']) {
    cli('typescript', 'tsc', ['-p', config, '--noEmit']);
  }
}

function build() {
  cli('@angular/cli', 'ng', ['build']);
  run(process.execPath, ['scripts/verify-dist.mjs'], { cwd: root });
}

const task = process.argv[2];
const extra = process.argv.slice(3);
if (task === 'check') {
  cli('prettier', 'prettier', ['.', '--check']);
}
await import('./build-wasm.mjs');
switch (task) {
  case 'check':
    cli('eslint', 'eslint', ['.', '--max-warnings=0']);
    types();
    await import('./check-wasm.mjs');
    run(process.execPath, ['--test', 'tests/tooling/tool-environment.test.mjs'], { cwd: root });
    run(process.execPath, ['--test', 'tests/wasm/market-producer.test.mjs'], { cwd: root });
    cli('@angular/cli', 'ng', ['test', '--watch=false', '--coverage']);
    build();
    break;
  case 'typecheck':
    types();
    break;
  case 'lint':
    cli('eslint', 'eslint', ['.', '--max-warnings=0', ...extra]);
    break;
  case 'preview':
    build();
    await import('./serve-dist.mjs');
    break;
  case 'build':
    build();
    break;
  case 'test:wasm':
    run(process.execPath, ['--test', 'tests/wasm/market-producer.test.mjs'], { cwd: root });
    break;
  case 'start':
    cli('@angular/cli', 'ng', ['serve', ...extra]);
    break;
  case 'watch':
    cli('@angular/cli', 'ng', ['build', '--watch', '--configuration', 'development', ...extra]);
    break;
  case 'test':
    cli('@angular/cli', 'ng', ['test', '--watch=false', ...extra]);
    break;
  case 'test:watch':
    cli('@angular/cli', 'ng', ['test', '--watch', ...extra]);
    break;
  case 'test:coverage':
    cli('@angular/cli', 'ng', ['test', '--watch=false', '--coverage', ...extra]);
    break;
  default:
    throw new Error(`Unknown task: ${task}`);
}
