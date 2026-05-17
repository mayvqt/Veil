#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/bin}"
BIN_NAME="${BIN_NAME:-veilclient}"
TARGETS="${TARGETS:-linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64}"
BUILD_FLAGS="${BUILD_FLAGS:--trimpath -ldflags=-s -ldflags=-w -buildvcs=false}"

cd "$ROOT_DIR"

if ! command -v go >/dev/null 2>&1; then
  echo "error: go is not installed or not in PATH" >&2
  exit 1
fi

if [[ "$TARGETS" == "local" ]]; then
  TARGETS="$(go env GOOS)/$(go env GOARCH)"
fi

mkdir -p "$OUT_DIR"

echo "Building Veil TUI client into $OUT_DIR"

for target in $TARGETS; do
  if [[ "$target" != */* ]]; then
    echo "error: invalid target '$target' (expected GOOS/GOARCH)" >&2
    exit 1
  fi

  GOOS="${target%/*}"
  GOARCH="${target#*/}"
  if [[ -z "$GOOS" || -z "$GOARCH" ]]; then
    echo "error: invalid target '$target' (missing GOOS or GOARCH)" >&2
    exit 1
  fi

  suffix=""
  if [[ "$GOOS" == "windows" ]]; then
    suffix=".exe"
  fi

  output="$OUT_DIR/${BIN_NAME}-${GOOS}-${GOARCH}${suffix}"
  echo " - $GOOS/$GOARCH -> $output"
  GOOS="$GOOS" GOARCH="$GOARCH" CGO_ENABLED=0 go build $BUILD_FLAGS -o "$output" ./cmd/veilclient
done

echo "Done."
