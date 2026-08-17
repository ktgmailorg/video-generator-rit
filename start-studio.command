#!/bin/zsh
set -eu

project_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$project_dir"

if ! command -v node >/dev/null 2>&1; then
  echo "One-Click AI Video Studio requires Node.js 22 or newer."
  echo "Install the local companion package, then double-click this launcher again."
  read -r "?Press Return to close."
  exit 1
fi

node_major="$(node -p 'Number(process.versions.node.split(\".\")[0])')"
if [ "$node_major" -lt 22 ]; then
  echo "Node.js 22 or newer is required. Found $(node --version)."
  read -r "?Press Return to close."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Preparing the local studio for first use…"
  npm ci
fi

echo "Opening One-Click AI Video Studio…"
exec node studio/launcher.mjs
