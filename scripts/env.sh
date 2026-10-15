#!/usr/bin/env bash
# Source this to get the project-local Rust toolchain + Tauri build environment.
#   source scripts/env.sh
#
# The Rust toolchain lives inside .tools/ (gitignored) so that no global machine
# state is touched: no PATH edits, no ~/.cargo, no ~/.rustup.

OM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export RUSTUP_HOME="$OM_ROOT/.tools/rustup"
export CARGO_HOME="$OM_ROOT/.tools/cargo"
export CARGO_TARGET_DIR="$OM_ROOT/.tools/target"
export PATH="$CARGO_HOME/bin:$PATH"

# Regional mirrors: direct upstream measured ~5 KB/s here.
export RUSTUP_DIST_SERVER="https://rsproxy.cn"
export RUSTUP_UPDATE_ROOT="https://rsproxy.cn/rustup"

# Make MSVC link.exe + rc.exe discoverable without a Developer Command Prompt.
if [ -z "$OM_MSVC_READY" ]; then
  _vs="C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools"
  _msvc_ver="$(ls "$_vs/VC/Tools/MSVC" 2>/dev/null | tail -1)"
  _sdk_ver="$(ls "/c/Program Files (x86)/Windows Kits/10/bin" 2>/dev/null | grep '^10\.' | tail -1)"
  if [ -n "$_msvc_ver" ]; then
    export PATH="$PATH:$_vs/VC/Tools/MSVC/$_msvc_ver/bin/Hostx64/x64"
  fi
  if [ -n "$_sdk_ver" ]; then
    export PATH="$PATH:/c/Program Files (x86)/Windows Kits/10/bin/$_sdk_ver/x64"
    export LIB="C:/Program Files (x86)/Windows Kits/10/Lib/$_sdk_ver/ucrt/x64;C:/Program Files (x86)/Windows Kits/10/Lib/$_sdk_ver/um/x64"
    if [ -n "$_msvc_ver" ]; then
      export LIB="$LIB;$_vs/VC/Tools/MSVC/$_msvc_ver/lib/x64"
    fi
    export INCLUDE="C:/Program Files (x86)/Windows Kits/10/Include/$_sdk_ver/ucrt;C:/Program Files (x86)/Windows Kits/10/Include/$_sdk_ver/um;C:/Program Files (x86)/Windows Kits/10/Include/$_sdk_ver/shared"
    if [ -n "$_msvc_ver" ]; then
      export INCLUDE="$INCLUDE;$_vs/VC/Tools/MSVC/$_msvc_ver/include"
    fi
  fi
  export OM_MSVC_READY=1
fi

echo "[openmark] rust: $(command -v rustc >/dev/null && rustc -V || echo MISSING)"
echo "[openmark] cargo: $(command -v cargo >/dev/null && cargo -V || echo MISSING)"
