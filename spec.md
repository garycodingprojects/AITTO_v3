# AITTO — Technical Specification

Technical reference for the VTC AI Timetabling Utility. For a user-facing overview, see [README.md](README.md).

---

## Overview

**AITTO** (滅絕天地堂) is an AI-assisted school timetabling application built for the [VTC AI Hackathon](https://clt.vtc.edu.hk/aihackathon/). It assigns lessons to 30-minute timeslots and rooms under hard and soft scheduling rules, powered by the [Timefold Solver](https://timefold.ai/) library.

Two services run together:

| Service | Folder | Port | Role |
|---------|--------|------|------|
| **Timetable backend + UI** | [`school-timetabling/`](school-timetabling/) | **8080** | Quarkus app, Timefold solver, REST API, static web UI |
| **Timetable Agent** | [`chat-agent/`](chat-agent/) | **3001** | LLM-driven assistant that calls the backend API |

```
Browser (8080)  →  Timetable Agent (3001)  →  LLM server (OpenAI-compatible)
                 ↘  Quarkus / Timefold solver (8080)
```

Open **http://localhost:8080** in the browser. The **Timetable Agent** tab sends messages to the service on port 3001, which calls the Timefold API and your LLM server using credentials supplied by the browser on each request.

### Web UI tabs

| Tab | Purpose |
|-----|---------|
| **Preparation** | Author subjects, teachers, rooms, and subject cards before solving |
| **AI Scheduler** | Load data, solve, edit timetables, inspect scores and violations |
| **Timetable Agent** | Natural-language assistant with inline visualizations |
| **Tutorial** | English / Chinese usage guide |

---

## Tech Stack

| Layer | Technologies |
|-------|----------------|
| Backend | Java 21, Maven, Quarkus 3.36.x, Timefold Solver 2.2 (Community) |
| Frontend | Bootstrap 5, jQuery, js-joda (static assets served by Quarkus) |
| Timetable Agent | Node.js 20+, TypeScript, Hono, Vercel AI SDK |
| LLM | External OpenAI-compatible server (e.g. LM Studio); credentials held in browser localStorage |

---

## Project Structure

```
<repo-root>/
├── school-timetabling/     # Quarkus + Timefold backend and web UI
│   ├── src/main/java/      # Domain model, constraints, REST resources
│   ├── src/main/resources/ # application.properties, static UI (index.html, app.js, …)
│   └── start-dev.cmd / start-dev.sh
├── chat-agent/             # Node.js Timetable Agent service
│   ├── src/                # HTTP server, agent tools, Timefold client
│   ├── Dockerfile
│   └── start-dev.cmd / start-dev.sh
├── install.cmd             # One-time install script (Windows)
├── install.sh              # One-time install script (Linux / macOS)
├── docker-compose.yml      # Run both services in Docker
├── spec.md                 # This file
└── LICENSE                 # MIT License
```

### Backend key paths

```
school-timetabling/src/main/java/org/acme/schooltimetabling/
├── domain/           Lesson, Timetable, Timeslot, TimeslotGenerator, ViolationInfo, …
├── solver/           TimetableConstraintProvider
└── rest/             TimetableResource, TimetableDemoResource,
                      CompletedSolutionOverlapCleaner, TimetableViolationLabeler
```

---

## System Requirements

| Tool | Version | Used for |
|------|---------|----------|
| **Java (JDK)** | 17+ (21 recommended) | Quarkus / Maven build |
| **Maven** | 3.9+ | Build and run `school-timetabling` |
| **Node.js** | 20+ | Run `chat-agent` |
| **LLM server** | OpenAI-compatible | Timetable Agent (optional for AI Scheduler only) |

Verify:

```powershell
java -version
mvn -version
node -v
```

### Install prerequisites (Windows)

**Option A — winget:**

```powershell
winget install Microsoft.OpenJDK.21 --accept-package-agreements --accept-source-agreements
winget install Apache.Maven --accept-package-agreements --accept-source-agreements
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
```

Close and reopen PowerShell after installing prerequisites.

---

## Installation

### Docker (recommended for quick start)

Requires Docker with Compose v2. From the repository root:

```bash
docker compose up --build
```

This builds and starts both containers. No local Java, Maven, or Node.js is required. First build may take several minutes.

Build only:

```bash
docker compose build
```

Stop:

```bash
docker compose down
```

| Container | Host port | Internal URL (agent → backend) |
|-----------|-----------|--------------------------------|
| `school-timetabling` | 8080 | `http://school-timetabling:8080` |
| `chat-agent` | 3001 | — |

The browser on your machine uses **http://localhost:8080** and **http://localhost:3001**. LLM settings remain in the browser; point at a host LLM with `http://localhost:1234/v1` when using LM Studio locally.

### Native — one-command install

**Windows:**

```powershell
.\install.cmd
```

**Linux / macOS:**

```bash
./install.sh
```

This script:

1. Verifies Java, Maven, and Node.js are on PATH
2. Installs chat-agent npm packages
3. Downloads and builds the timetable backend with Maven (first run can take several minutes)

### Manual install

**Chat agent:**

```powershell
cd chat-agent
npm.cmd install
```

If `start-dev.cmd` fails because `.env` is missing, create an empty file:

```powershell
New-Item -Path .env -ItemType File -Force
```

**Timetable backend:** No separate install step. The first `mvn quarkus:dev` downloads Quarkus, Timefold, and other JARs into the local Maven cache.

---

## Configuration

| File / location | Purpose |
|-----------------|---------|
| Browser localStorage (`aitto-chat-llm-config`) | LLM Base URL, model id, and API key for Timetable Agent |
| [`school-timetabling/src/main/resources/application.properties`](school-timetabling/src/main/resources/application.properties) | Solver termination (30s or first feasible solution), logging |
| `chat-agent/.env` | Optional server-side env vars (`CHAT_AGENT_PORT`, `TIMEFOLD_BASE_URL`); can be empty |
| `chat-agent/models.md` | Optional legacy/dev reference for provider YAML; **not used at runtime** by the current agent |

### LLM configuration (browser)

Configure via the **Timetable Agent** tab → **Model** badge → **LLM model setup** dialog:

| Field | Example | Notes |
|-------|---------|-------|
| Base URL | `http://localhost:1234/v1` | OpenAI-compatible API URL; must end with `/v1` |
| Model id | `local-model-name` | Id from your server's `/v1/models` list |
| API key | (optional) | Required by some hosted APIs; often blank for local LM Studio |

Settings are stored in the browser only and sent to the chat-agent with each `/api/chat` request. They are **not** persisted on the server.

List models on your LLM server:

```powershell
Invoke-RestMethod -Uri "http://localhost:1234/v1/models"
```

### Chat-agent environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CHAT_AGENT_PORT` | `3001` | Chat agent HTTP port |
| `TIMEFOLD_BASE_URL` | `http://localhost:8080` | Quarkus API URL |
| `CHAT_AGENT_ROOT` | (auto-detected) | Override chat-agent project root |
| `MODELS_CONFIG_PATH` | `chat-agent/models.md` | Override path to legacy models file |

### Solver termination (`application.properties`)

```properties
quarkus.timefold.solver.termination.spent-limit=30s
quarkus.timefold.solver.termination.unimproved-spent-limit=10s
```

The solver stops after 10 seconds without score improvement, or after 30 seconds.

---

## Running the System

### Docker

```bash
docker compose up --build
```

Open **http://localhost:8080**. Ensure ports 8080 and 3001 are free on the host, or edit `docker-compose.yml` port mappings.

### Native

Use **two terminals** from the repository root. Leave both open while using the app.

**Windows — Terminal 1 (backend):**

```powershell
cd school-timetabling
.\start-dev.cmd
```

**Linux / macOS — Terminal 1 (backend):**

```bash
cd school-timetabling
./start-dev.sh
```

Wait for `Listening on: http://localhost:8080`.

**Windows — Terminal 2 (agent):**

```powershell
cd chat-agent
.\start-dev.cmd
```

**Linux / macOS — Terminal 2 (agent):**

```bash
cd chat-agent
./start-dev.sh
```

Wait for `[chat-agent] Listening on http://localhost:3001`.

**Browser:** http://localhost:8080

### Port conflicts

If port 8080 is busy:

```powershell
mvn.cmd quarkus:dev "-Dquarkus.http.port=8081"
```

Set in Terminal 2 before starting the chat agent:

```powershell
$env:TIMEFOLD_BASE_URL = "http://localhost:8081"
```

### Stop and restart

- In the terminal where a service is running: press **`q`** (Quarkus dev mode) or **`Ctrl+C`**
- After code changes: restart the affected service and hard-refresh the browser (`Ctrl+Shift+R`)
- After changing LLM settings in the browser: no server restart needed

**Stop from any PowerShell window:**

```powershell
# Stop Quarkus (port 8080)
$pid = (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force }

# Stop chat agent (port 3001)
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Verify services

```powershell
Invoke-WebRequest -Uri "http://localhost:8080" -UseBasicParsing | Select-Object StatusCode
Invoke-RestMethod -Uri "http://localhost:8080/demo-data"
Invoke-RestMethod -Uri "http://localhost:3001/api/health"
Invoke-RestMethod -Uri "http://localhost:3001/api/config"
```

### Production-style run

**Quarkus:**

```powershell
cd school-timetabling
mvn package
java -jar .\target\quarkus-app\quarkus-run.jar
```

**Chat agent:**

```powershell
cd chat-agent
npm.cmd run build
npm.cmd start
```

---

## Domain Model

| Concept | Description |
|---------|-------------|
| **Timetable** | Planning solution: timeslots, rooms, lessons, score, soft-constraint toggles |
| **Lesson** | Subject, teacher, student group, duration; assigned timeslot + room |
| **Timeslot** | 30-minute start slot; lessons span consecutive slots |
| **Room** | Available room |
| **TimeslotGenerator** | Builds the school-day grid and lunch-aware contiguous availability |
| **ViolationInfo** | UI-only violation label attached to a lesson after solve |

**School day:** 08:30–17:30, Monday–Friday. Hard lunch block: 13:00–13:30 — no lesson may overlap.

**Demo datasets:**

| ID | Description |
|----|-------------|
| `dataset1` | Mon–Tue, 6 core lessons, 2 rooms |
| `dataset2` | Mon–Fri, extended curriculum, multiple groups, variable durations (60–180 min) |

---

## Constraints

Hard constraints use **1,000 points per overlapping 30-minute slot** (`HARD_VIOLATION_WEIGHT`). The solver must reach **0 hard** for a feasible timetable.

| Name | Level | Description |
|------|-------|-------------|
| Room conflict | Hard | Two lessons cannot use the same room at overlapping times |
| Teacher conflict | Hard | A teacher cannot teach overlapping lessons |
| Student group conflict | Hard | A student group cannot attend overlapping lessons |
| Lesson overlaps hard lunch | Hard | No lesson may overlap 13:00–13:30 |
| lunchTimebreak | Hard | Mandatory 1-hour lunch gap for each teacher and student group |
| Lesson duration exceeds contiguous time | Hard | A lesson must fit in contiguous slots from its start |
| Teacher room stability | Soft | A teacher prefers teaching in one room |
| Student room stability | Soft | A student group prefers staying in one room |
| Teacher time efficiency | Soft | Back-to-back lessons for the same teacher on the same day |
| Student time efficiency | Soft | Back-to-back lessons for the same student group on the same day |
| Student group subject variety | Soft | Avoid back-to-back lessons with the same subject for a group |
| Good lunchtime for teacher | Soft | 2-hour lunch gap around 13:00–13:30 |
| Good lunchtime for student group | Soft | Same lunch-gap rule per student group |

Soft constraints can be enabled or disabled via checkboxes in the AI Scheduler before solving, or via agent tools in Timetable Agent.

Implementation: [`TimetableConstraintProvider.java`](school-timetabling/src/main/java/org/acme/schooltimetabling/solver/TimetableConstraintProvider.java)

### Score

The UI shows a Timefold `HardSoftScore` string, e.g. `0hard/3soft`:

- **Higher is better**
- **Hard = 0** means no hard violations (feasible)
- **Soft** reflects schedule quality (rewards minus penalties)

---

## REST API

**Base URL:** `http://localhost:8080`  
**Swagger UI:** `http://localhost:8080/q/swagger-ui`

### Timetable backend

| Method | Path | Description |
|--------|------|-------------|
| GET | `/demo-data` | List demo dataset ids (`dataset1`, `dataset2`) |
| GET | `/demo-data/{id}` | Unsolved demo timetable |
| GET | `/timetables` | List solver job ids |
| POST | `/timetables` | Submit timetable and start async solve (returns job ID) |
| GET | `/timetables/{jobId}` | Best solution so far |
| GET | `/timetables/{jobId}/status` | Solver status and score |
| PUT | `/timetables/analyze` | Score analysis |
| PUT | `/timetables/score` | Recalculate score and violation labels |
| DELETE | `/timetables/{jobId}` | Terminate solve early |

### Timetable Agent (`http://localhost:3001`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Soft-constraint definitions and defaults (`requiresClientLlm: true`) |
| POST | `/api/chat` | Send a chat message with `messages`, `llmConfig`, and optional `softConstraintSettings` |

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

### Agent tools

- `listDemoData`, `loadDemoData`
- `createSubjectCardsTimetable`
- `listSoftConstraints`, `configureSoftConstraints`
- `solveTimetable`, `checkConstraints`, `viewTimetableSummary`
- `findCommonFreeTimeslots`, `findReplacementTeachers`

Tools call the Quarkus Timefold REST API and local helper code only. They do not access the filesystem or run shell commands.

### PowerShell REST examples

> **Note:** In PowerShell, `curl` is an alias for `Invoke-WebRequest`. Use `curl.exe` or `Invoke-RestMethod` instead.

```powershell
# Download demo data
$demo = Invoke-RestMethod -Uri "http://localhost:8080/demo-data/dataset1" -Headers @{ Accept = "application/json" }

# Start solving — returns a job ID (plain text UUID)
$jobId = Invoke-RestMethod -Uri "http://localhost:8080/timetables" -Method POST `
  -ContentType "application/json" -Body ($demo | ConvertTo-Json -Depth 20)

# Poll status (repeat until solverStatus is NOT_SOLVING)
Invoke-RestMethod -Uri "http://localhost:8080/timetables/$jobId/status"

# Get full solution
Invoke-RestMethod -Uri "http://localhost:8080/timetables/$jobId"

# Stop solving early
Invoke-RestMethod -Uri "http://localhost:8080/timetables/$jobId" -Method DELETE
```

---

## Testing

```powershell
# Backend (from school-timetabling/)
mvn.cmd test

# Chat agent (from chat-agent/)
npm.cmd test
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `npm.ps1` / scripts disabled | Use `.\start-dev.cmd`, `npm.cmd`, or `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| `java` / `mvn` / `node` not found | Install prerequisites; open a **new** PowerShell window |
| `npm install` fails with `ENOENT package.json` | Run from `chat-agent/`, not the repo root |
| First `mvn quarkus:dev` is slow | Normal — Maven is downloading dependencies |
| `Port 8080 seems to be in use` | Stop the process on 8080 or use port 8081 |
| `Unknown lifecycle phase ".http.port=..."` | Quote the flag: `"-Dquarkus.http.port=8081"` |
| `EADDRINUSE :::3001` | Another chat-agent is running; stop port 3001 |
| Agent badge **offline** | Start `.\start-dev.cmd` in `chat-agent/` |
| Agent shows **Model: not configured** | Open LLM model setup in the Timetable Agent tab |
| Chat request fails / **Cannot connect to API** | LLM server not running; check Base URL and model id in the browser dialog |
| `node: .env: not found` | Create empty `chat-agent/.env` with `New-Item -Path .env -ItemType File -Force` |
| REST `curl` fails in PowerShell | Use `curl.exe` or `Invoke-RestMethod` |
| GET `/timetables/{jobId}` returns 404 | Use the real UUID from POST; do not paste `{jobId}` literally |
| UI shows old timetable after changes | Restart Quarkus and hard-refresh (`Ctrl+Shift+R`) |

---

## Related Documentation

| Document | Contents |
|----------|----------|
| [README.md](README.md) | User-facing overview, install, run, and common issues |
| [LICENSE](LICENSE) | MIT License |
| [docker-compose.yml](docker-compose.yml) | Docker services and port mappings |
| [chat-agent/README.md](chat-agent/README.md) | Timetable Agent service setup and API |
| [chat-agent/models.md](chat-agent/models.md) | Optional legacy LLM provider YAML reference |

---

## References

- [Timefold Solver](https://timefold.ai)
- [Timefold school-timetabling quickstart](https://github.com/TimefoldAI/timefold-quickstarts/tree/stable/java/school-timetabling)
- [VTC AI Hackathon](https://clt.vtc.edu.hk/aihackathon/)
- [GitHub repository](https://github.com/garycodingprojects/AI_Timetable)
