#!/usr/bin/env bash
# Cloudflare Pages Git build entry point. Publish only after the complete gate.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  echo 'The Pages provisioner requires Linux x86_64. Locally use npm run check.' >&2
  exit 1
fi

expected_node="$(tr -d '\r\n' < .nvmrc)"
if [[ "$(node --version)" != "v${expected_node}" ]]; then
  echo "Configure Pages NODE_VERSION=${expected_node} before building." >&2
  exit 1
fi
expected_npm="$(node -p "require('./package.json').packageManager.split('@')[1]")"
if [[ "$(npm --version)" != "$expected_npm" ]]; then
  npm install --global "npm@${expected_npm}"
fi
[[ "$(npm --version)" == "$expected_npm" ]]

rust_version="$(node -p "require('./scripts/toolchain-versions.json').rust")"
rustup_version="$(node -p "require('./scripts/toolchain-versions.json').rustup")"
wasm_pack_version="$(node -p "require('./scripts/toolchain-versions.json').wasmPack")"
rustup_sha="$(node -p "require('./scripts/toolchain-versions.json').linuxX64.rustupSha256")"
wasm_pack_sha="$(node -p "require('./scripts/toolchain-versions.json').linuxX64.wasmPackSha256")"

export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export PATH="$CARGO_HOME/bin:$PATH"
# Override any image default; every Cargo invocation must use the repository pin.
export RUSTUP_TOOLCHAIN="${rust_version}-x86_64-unknown-linux-gnu"
temporary_directory="$(mktemp -d)"
trap 'rm -f "$temporary_directory/rustup-init" "$temporary_directory/wasm-pack.tar.gz" "$temporary_directory/wasm-pack"; rmdir "$temporary_directory"' EXIT

# Bootstrap from an exact official release, verifying its recorded SHA-256 first.
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "https://static.rust-lang.org/rustup/archive/${rustup_version}/x86_64-unknown-linux-gnu/rustup-init" \
  --output "$temporary_directory/rustup-init"
printf '%s  %s\n' "$rustup_sha" "$temporary_directory/rustup-init" | sha256sum --check --status
chmod +x "$temporary_directory/rustup-init"
"$temporary_directory/rustup-init" -y --no-modify-path --profile minimal --default-toolchain none
rustup set auto-self-update disable
rustup toolchain install "$RUSTUP_TOOLCHAIN" --profile minimal --component rustfmt,clippy \
  --target wasm32-unknown-unknown --no-self-update

curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
  "https://github.com/wasm-bindgen/wasm-pack/releases/download/v${wasm_pack_version}/wasm-pack-v${wasm_pack_version}-x86_64-unknown-linux-musl.tar.gz" \
  --output "$temporary_directory/wasm-pack.tar.gz"
printf '%s  %s\n' "$wasm_pack_sha" "$temporary_directory/wasm-pack.tar.gz" | sha256sum --check --status
tar -xOf "$temporary_directory/wasm-pack.tar.gz" \
  "wasm-pack-v${wasm_pack_version}-x86_64-unknown-linux-musl/wasm-pack" > "$temporary_directory/wasm-pack"
install -m 755 "$temporary_directory/wasm-pack" "$CARGO_HOME/bin/wasm-pack"

npm ci
npm run check
