import { test } from 'node:test';
import assert from 'node:assert/strict';
import { delimiter, join } from 'node:path';
import { toolEnvironment } from '../../scripts/tool-environment.mjs';

const base = {
  version: '1.99.1',
  cwd: '.',
  home: '/user',
  platform: 'win32',
  exists: () => true,
  probe: () => ({ status: 0, stdout: '1.99.1-x86_64-pc-windows-gnu (default)' }),
};

test('discovers Rust outside PATH and selects pinned GNU with its bundled linker', () => {
  const env = { Path: '/node' };
  const result = toolEnvironment({ ...base, env });
  assert.equal(result.Path, ['/node', join('/user', '.cargo', 'bin')].join(delimiter));
  assert.equal(result.RUSTUP_TOOLCHAIN, '1.99.1-x86_64-pc-windows-gnu');
  assert.equal(
    result.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS,
    '-Clinker=rust-lld -Clink-self-contained=yes',
  );
  assert.deepEqual(env, { Path: '/node' });
});

test('preserves explicit toolchain and linker settings', () => {
  const env = {
    RUSTUP_TOOLCHAIN: 'custom-x86_64-pc-windows-gnu',
    CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER: 'custom-linker',
  };
  const result = toolEnvironment({
    ...base,
    env,
    probe: () => {
      throw new Error('must not probe');
    },
  });
  assert.equal(result.RUSTUP_TOOLCHAIN, env.RUSTUP_TOOLCHAIN);
  assert.equal(result.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER, 'custom-linker');
  assert.equal(result.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS, undefined);
});

test('respects CARGO_HOME and keeps MSVC users on their configured host', () => {
  const result = toolEnvironment({
    ...base,
    env: { PATH: '/node', CARGO_HOME: '/custom-cargo' },
    probe: () => ({ status: 0, stdout: '1.99.1-x86_64-pc-windows-msvc (default)' }),
  });
  assert.equal(result.PATH, ['/node', join('/custom-cargo', 'bin')].join(delimiter));
  assert.equal(result.RUSTUP_TOOLCHAIN, undefined);
});

test('leaves missing installations available for the actionable command error', () => {
  const result = toolEnvironment({
    ...base,
    env: { PATH: '/node' },
    exists: () => false,
    probe: () => ({ status: null, error: new Error('ENOENT') }),
  });
  assert.deepEqual(result, { PATH: '/node' });
});

test('does not select Windows tools on other platforms', () => {
  const result = toolEnvironment({
    ...base,
    platform: 'linux',
    env: { PATH: '/node' },
    probe: () => {
      throw new Error('must not probe');
    },
  });
  assert.equal(result.RUSTUP_TOOLCHAIN, undefined);
});
