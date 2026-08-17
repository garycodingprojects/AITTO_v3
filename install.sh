#!/usr/bin/env bash
# One-time project install for AITTO (Linux / macOS).
# Run from repo root: ./install.sh
# Installs chat-agent npm packages and pre-downloads Maven dependencies.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

require_tool() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[error] $2 not found."
    echo "        Install prerequisites, then run this script again."
    echo "        See README.md — Quick start / System Requirements."
    exit 1
  fi
}

echo
echo "============================================================"
echo "  AITTO install — one-time setup"
echo "============================================================"
echo "  Folder: $ROOT"
echo "  First run may take several minutes."
echo "============================================================"
echo

echo "[1/3] Checking tools — Java, Maven, Node.js ..."
require_tool java "Java JDK 17 or newer"
require_tool mvn "Maven 3.9 or newer"
require_tool node "Node.js 20 or newer"

echo "[ok] Tools ready"
java -version 2>&1 | head -n 1
mvn -version 2>&1 | head -n 1
node -v
echo

echo "[2/3] Installing Timetable Agent packages — chat-agent ..."
bash "$ROOT/chat-agent/install.sh"
# Dev script expects .env to exist (may be empty).
if [[ ! -f "$ROOT/chat-agent/.env" ]]; then
  echo "[info] Creating empty chat-agent/.env"
  : > "$ROOT/chat-agent/.env"
fi
echo "[ok] chat-agent ready"
echo

echo "[3/3] Building timetable backend — Maven package ..."
echo "      First run downloads dependencies; this can take a while."
cd "$ROOT/school-timetabling"
mvn -B -DskipTests package

cd "$ROOT"
echo
echo "============================================================"
echo "  Install complete"
echo "============================================================"
echo
echo "  Start the app — open TWO terminals and leave both running:"
echo
echo "    Terminal 1:  cd school-timetabling && ./start-dev.sh"
echo "    Terminal 2:  cd chat-agent && ./start-dev.sh"
echo "    Browser:     http://localhost:8080"
echo
echo "  AI Scheduler works without an LLM."
echo "  Timetable Agent needs an OpenAI-compatible model in the UI."
echo "============================================================"
echo
