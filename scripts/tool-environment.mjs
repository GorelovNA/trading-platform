import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Configure child processes only; never change the user's persistent environment.
export function toolEnvironment({
  version,
  cwd,
  env = process.env,
  platform = process.platform,
  home = homedir(),
  exists = existsSync,
  probe = spawnSync,
}) {
  const result = { ...env };
  const pathKey = Object.keys(result).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const cargoBin = join(result.CARGO_HOME || join(home, '.cargo'), 'bin');
  const executable = platform === 'win32' ? 'rustup.exe' : 'rustup';
  if (exists(join(cargoBin, executable))) {
    result[pathKey] = [result[pathKey], cargoBin].filter(Boolean).join(delimiter);
  }

  if (platform === 'win32') {
    if (!result.RUSTUP_TOOLCHAIN) {
      const selected = probe('rustup', ['default'], { cwd, env: result, encoding: 'utf8' });
      const defaultToolchain = selected.status === 0 ? selected.stdout.trim().split(/\s/u)[0] : '';
      // A bare channel pin otherwise resolves to MSVC even when rustup's default is GNU.
      if (defaultToolchain.endsWith('-x86_64-pc-windows-gnu')) {
        result.RUSTUP_TOOLCHAIN = `${version}-x86_64-pc-windows-gnu`;
      }
    }
    if (
      result.RUSTUP_TOOLCHAIN?.endsWith('-x86_64-pc-windows-gnu') &&
      !result.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER &&
      !result.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS &&
      !result.RUSTFLAGS &&
      !result.CARGO_ENCODED_RUSTFLAGS
    ) {
      result.CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS =
        '-Clinker=rust-lld -Clink-self-contained=yes';
    }
  }
  return result;
}
