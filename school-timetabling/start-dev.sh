#!/usr/bin/env bash
# Start Quarkus dev mode (Linux / macOS).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# -Ddebug=false avoids JDWP "Debugger failed to attach" noise on port 5005.
mvn quarkus:dev -Ddebug=false
