#!/usr/bin/env bash
# Start the chat agent (Linux / macOS).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# Node --env-file requires the file to exist; create an empty one if missing.
if [[ ! -f .env ]]; then
  touch .env
fi

node --env-file=.env ./node_modules/tsx/dist/cli.mjs watch src/server.ts
