#!/usr/bin/env bash
# Install chat-agent npm packages (Linux / macOS).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
npm install --no-fund --no-audit

