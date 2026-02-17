#!/usr/bin/env bash
# Test that the packed package installs cleanly with Next 15 and Next 16.
# Run from repo root: npm run test:install (or ./scripts/test-install.sh)
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Installing dependencies..."
npm ci

echo "==> Building package..."
npm run build
echo "==> Packing package..."
PACKED=$(npm pack)
mv "$PACKED" "$ROOT/install-test-pkg.tgz"
cd "$ROOT"

TEST_DIR="$ROOT/install-test-tmp"
TGZ="$ROOT/install-test-pkg.tgz"
rm -rf "$TEST_DIR"
trap "rm -rf '$TEST_DIR'; rm -f '$TGZ'" EXIT

for NEXT_VER in 15 16; do
  echo "==> Testing install with next@$NEXT_VER..."
  mkdir -p "$TEST_DIR"
  cd "$TEST_DIR"
  npm init -y
  npm install "next@$NEXT_VER" react@^18 react-dom@^18
  npm install "$ROOT/install-test-pkg.tgz"
  echo "    next@$NEXT_VER: OK"
  cd "$ROOT"
  rm -rf "$TEST_DIR"
done
rm -f "$TGZ"

echo "==> All install tests passed."
