#!/usr/bin/env bash
# One-command installer for macOS / Linux:  ./install.sh
set -e
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found on your PATH."
  echo "Install it from https://nodejs.org/ then run this again."
  exit 1
fi
exec node "$(dirname "$0")/install.mjs" "$@"
