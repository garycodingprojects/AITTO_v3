# Timetable Agent Service

Node.js service for the **VTC AI Timetabling Utility (AITTO)**. It runs a Vercel AI SDK `ToolLoopAgent` that answers natural-language timetable questions and calls the Quarkus Timefold REST API. Results appear in the **Timetable Agent** tab at http://localhost:8080.

> For full-system install (Java, Maven, backend + agent), see the [root README](../README.md) and [spec.md](../spec.md).

---

## Architecture

Two services run at the same time:

| Terminal | Service | URL |
|----------|---------|-----|
| **1** | Quarkus timetable API + web UI | http://localhost:8080 |
| **2** | Timetable Agent (this folder) | http://localhost:3001 |

The browser talks to Quarkus on port **8080**. The Timetable Agent tab sends messages to this service on port **3001**, which calls the Timefold API and your LLM server using credentials supplied by the browser on each request.

```
Browser (8080)  →  Timetable Agent (3001)  →  LLM server (OpenAI-compatible)
                 ↘  Quarkus / Timefold solver (8080)
```

LLM settings are stored in the browser (localStorage) only — they are **not** saved on this server.

---

## Prerequisites

| Requirement | Purpose |
|-------------|---------|
| **Node.js 20+** | Runs this service |
| **JDK 21+ and Maven 3.9+** | Runs the Quarkus timetable backend (`../school-timetabling/`) |
| **OpenAI-compatible LLM server** | Local (e.g. LM Studio) or remote endpoint |

Verify Node.js:

```powershell
node -v
npm -v
```

---

## Installation

From the **`chat-agent`** folder (not the repo root):

```powershell
cd chat-agent
.\install.cmd
```

Or manually:

```powershell
npm.cmd install
```

If `start-dev.cmd` fails with `node: .env: not found`, create an empty env file:

```powershell
New-Item -Path .env -ItemType File -Force
```

You only need to install again when `package.json` dependencies change.

---

## Configure the LLM

LLM credentials are configured in the **web UI**, not in this service:

1. Start both services (see [Run](#run))
2. Open http://localhost:8080 → **Timetable Agent** tab
3. Click the **Model** badge → **LLM model setup**
4. Enter **Base URL** (e.g. `http://localhost:1234/v1`), **Model id**, and optional **API key**
5. Click **Save**

| Field | Example | Notes |
|-------|---------|-------|
| Base URL | `http://localhost:1234/v1` | OpenAI-compatible API URL; must end with `/v1` |
| Model id | `local-model-name` | Id from your server's `/v1/models` list |
| API key | (optional) | Often blank for local LM Studio |

List models on your LLM server:

```powershell
Invoke-RestMethod -Uri "http://localhost:1234/v1/models"
```

> **Note:** [`models.md`](models.md) is an optional legacy/dev reference. The running agent reads LLM settings from each browser request, not from `models.md`.

---

## Run

Open **two PowerShell terminals** from the repository root.

**Terminal 1 — Timetable backend:**

```powershell
cd school-timetabling
.\start-dev.cmd
```

Wait for `Listening on: http://localhost:8080`.

If port 8080 is busy:

```powershell
mvn.cmd quarkus:dev "-Dquarkus.http.port=8081"
```

Then set `TIMEFOLD_BASE_URL` before starting the agent (see [Environment variables](#environment-variables)).

**Terminal 2 — Timetable Agent:**

```powershell
cd chat-agent
.\start-dev.cmd
```

Expected output:

```text
[chat-agent] LLM credentials are supplied by the browser per request (not stored server-side).
[chat-agent] Listening on http://localhost:3001
```

Leave both terminals open while using the app.

### Production-style start

```powershell
npm.cmd run build
npm.cmd start
```

---

## Use the Timetable Agent

1. Open **http://localhost:8080**
2. Click **Timetable Agent**
3. Confirm the badge shows **Agent: online** and configure **Model** if needed
4. Ask a question, for example:
   - `Load dataset1 and solve it`
   - `Analyze the timetable — which teacher is busiest?`
   - `Check constraints`
   - `Find common free timeslots for a teacher and student group on Monday`

Timetable views, analysis, and filter results appear in the **visualization panel** on the same tab. Use **Open in AI Scheduler** for full editing.

### Stop

Press **`Ctrl+C`** in each terminal.

---

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Soft-constraint definitions and defaults (`requiresClientLlm: true`) |
| POST | `/api/chat` | Chat turn with `messages`, `llmConfig`, and optional `softConstraintSettings` |

**POST `/api/chat` body (minimal):**

```json
{
  "messages": [{ "role": "user", "content": "Load dataset1 and solve it" }],
  "llmConfig": {
    "baseURL": "http://localhost:1234/v1",
    "model": "local-model-name",
    "apiKey": ""
  }
}
```

---

## Agent tools

The agent can call these tools against the Timefold API:

- `listDemoData`, `loadDemoData`
- `createSubjectCardsTimetable`
- `listSoftConstraints`, `configureSoftConstraints`
- `solveTimetable`, `checkConstraints`, `viewTimetableSummary`
- `findCommonFreeTimeslots`, `findReplacementTeachers`

Tools call the Quarkus REST API and local helper code only. They do not access the filesystem or run shell commands.

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHAT_AGENT_PORT` | `3001` | HTTP port for this service |
| `TIMEFOLD_BASE_URL` | `http://localhost:8080` | Quarkus Timefold API URL |
| `CHAT_AGENT_ROOT` | (auto-detected) | Override chat-agent project root |
| `MODELS_CONFIG_PATH` | `chat-agent/models.md` | Override path to legacy models file |

The optional `chat-agent/.env` file can hold server-side variables such as `CHAT_AGENT_PORT` and `TIMEFOLD_BASE_URL`. LLM API keys are **not** read from `.env` at runtime — they come from the browser.

Example when Quarkus runs on port 8081:

```powershell
$env:TIMEFOLD_BASE_URL = "http://localhost:8081"
.\start-dev.cmd
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm install` fails with `ENOENT package.json` | Run from `chat-agent/`, not the repo root |
| PowerShell blocks `npm` (`running scripts is disabled`) | Use `.\start-dev.cmd` or `npm.cmd` instead of `npm` |
| `node: .env: not found` | Create empty `.env`: `New-Item -Path .env -ItemType File -Force` |
| `EADDRINUSE :::3001` | Another instance is running; stop port 3001 and retry |
| Agent badge shows **offline** | Start `.\start-dev.cmd` in `chat-agent/` |
| Agent shows **Model: not configured** | Open LLM model setup in the Timetable Agent tab |
| Chat fails / **Cannot connect to API** | LLM server not running; check Base URL and model id in the browser dialog |
| Pasting log lines into PowerShell causes errors | Lines like `[chat-agent] Listening on...` are server output, not commands |

**Stop a process on port 3001:**

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**Test LLM connectivity:**

```powershell
Invoke-RestMethod -Uri "http://localhost:1234/v1/models"
```

---

## Quick reference

```powershell
# Terminal 1 — Timetable backend (from repo root)
cd school-timetabling
.\start-dev.cmd

# Terminal 2 — Timetable Agent (from repo root)
cd chat-agent
.\start-dev.cmd
```

Browser: **http://localhost:8080** → **Timetable Agent** → configure **Model** → ask a question
