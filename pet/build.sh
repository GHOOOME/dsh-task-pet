#!/bin/bash
# Build the native macOS pet binary into <package>/bin/dsh-task-pet.
# Requires the macOS Swift toolchain (Xcode or Command Line Tools).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
OUT="$ROOT/bin/dsh-task-pet"

mkdir -p "$ROOT/bin"
echo "==> swiftc pet/main.swift"
swiftc \
  -O \
  -swift-version 5 \
  -framework AppKit \
  -framework Foundation \
  "$HERE/main.swift" \
  -o "$OUT"

# Ad-hoc signature: stable launch identity, no developer certificate needed.
codesign --force --sign - "$OUT" >/dev/null 2>&1 || true

echo "==> built $OUT"
ls -lh "$OUT"
