import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toolEnvironment } from './tool-environment.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const crate = fileURLToPath(new URL('../wasm/market-producer/', import.meta.url));
export const versions = JSON.parse(
  readFileSync(new URL('./toolchain-versions.json', import.meta.url)),
);
const environment = toolEnvironment({ version: versions.rust, cwd: root });

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: crate,
    stdio: 'inherit',
    env: environment,
    ...options,
  });
  if (result.error?.code === 'ENOENT') {
    throw new Error(
      `Cannot find ${command}. Install the pinned Rust/wasm-pack tools described in README.md, or add their bin directory to PATH.`,
      { cause: result.error },
    );
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status}).`);
  return result.stdout?.trim();
}

export function checkToolchain() {
  const node = process.versions.node.split('.').map(Number);
  if (node[0] !== 24 || node[1] < 15) throw new Error('Use Node 24.15+ within v24.');
  // npm exposes its own version without requiring a shell or Windows .cmd spawning.
  const npm = /npm\/(\d+)\.(\d+)\.(\d+)/u.exec(process.env.npm_config_user_agent ?? '');
  if (!npm || npm[1] !== '11' || Number(npm[2]) < 12 || (npm[2] === '12' && Number(npm[3]) < 1)) {
    throw new Error('Run through npm 11.12.1+ within v11.');
  }
  for (const [command, expected] of [
    ['rustc', versions.rust],
    ['wasm-pack', versions.wasmPack],
  ]) {
    const version = run(command, ['--version'], { encoding: 'utf8', stdio: 'pipe' });
    if (version.split(' ')[1] !== expected)
      throw new Error(`Expected ${command} ${expected}; got ${version}`);
  }
  const manifest = readFileSync(
    new URL('../wasm/market-producer/Cargo.toml', import.meta.url),
    'utf8',
  );
  const toolchain = readFileSync(
    new URL('../wasm/market-producer/rust-toolchain.toml', import.meta.url),
    'utf8',
  );
  if (
    !manifest.includes(`wasm-bindgen = "=${versions.wasmBindgen}"`) ||
    !manifest.includes('wasm-opt = false') ||
    versions.wasmOpt !== false ||
    !toolchain.includes(`channel = "${versions.rust}"`)
  ) {
    throw new Error('Toolchain pins disagree with the Rust configuration.');
  }
}
