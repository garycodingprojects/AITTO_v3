# AITTO — VTC AI Timetabling Utility

**AITTO** (滅絕天地堂) is an AI-assisted school timetabling utility designed for the [VTC AI Hackathon](https://clt.vtc.edu.hk/aihackathon/). It assigns lessons to 30-minute timeslots and rooms under hard and soft scheduling rules, powered by the [Timefold Solver](https://timefold.ai/) library, with a web UI for solving and editing timetables and a natural-language **Timetable Agent** for guided operations.

> For architecture, API reference, constraints, and configuration details, see **[spec.md](spec.md)**.

---

## Quick start (Windows)

From the **repository root** (`AITTO_v3`):

| Step | Action |
|------|--------|
| **1. Install** (once) | Double-click **`install.cmd`** and wait for **Install complete** |
| **2. Backend** | Double-click **`start-backend.cmd`** — leave this window open |
| **3. Agent** | Double-click **`start-agent.cmd`** — leave this window open |
| **4. Open app** | Browser → **http://localhost:8080** |

`install.cmd` checks for **Java**, **Maven**, and **Node.js**. If something is missing, it tries to install it (Java/Node via `winget`, Maven via download). The first install can take several minutes.

Optional: double-click **`verify-install.cmd`** anytime to confirm tools and project files are ready.

**Stop:** close each start window, or press `Ctrl+C` / type `q` then Enter in the backend window.

**AI Scheduler** works without an LLM. **Timetable Agent** needs an OpenAI-compatible model configured in the web UI (Model badge).

---

## Features

### AI Scheduler

Interactive timetable editor and solver:

- Load demo datasets (`dataset1`, `dataset2`) or prepared/uploaded JSON timetables
- Solve with configurable soft constraints (enable/disable and weight per rule)
- Drag-and-drop lesson assignment, pinning, and live score updates
- Views by room, teacher, student group, weekday, and custom filter
- Violation labels on lesson cards; pop-out schedule window
- Download and upload timetable JSON

### Preparation

Author timetable input before solving:

- Subjects, teachers, student groups, rooms, and subject cards (duration, types, allowed rooms)
- Weekdays, school-day bounds (default 08:30–17:30), optional ECA half-day block
- Export/import setup or full workspace JSON; browser cache; bundled demo workspace
- **Load into AI Scheduler** when ready to solve (Preparation does not auto-solve)

### Timetable Agent

Natural-language assistant powered by the Vercel AI SDK `ToolLoopAgent`:

- Load demo data, build timetables from subject cards, solve, and analyze schedules
- Check constraints, find common free timeslots, suggest replacement teachers
- Configure soft constraints via agent tools before solving
- Inline timetable visualizations with **Open in AI Scheduler** for full editing
- LLM settings configured in the browser (stored in localStorage, not on the server)

### Tutorial

Built-in English and Chinese walkthrough for Preparation, AI Scheduler, and Timetable Agent workflows.

---

## System Requirements

| Tool | Version | Required for |
|------|---------|--------------|
| **Java (JDK)** | 17+ (21 recommended) | Timetable backend (Quarkus / Maven) |
| **Maven** | 3.9+ | Build and run `school-timetabling` |
| **Node.js** | 20+ | Timetable Agent service |
| **Docker** | 24+ with Compose v2 | Optional — containerized install and run |
| **LLM server** | OpenAI-compatible (e.g. LM Studio) | Timetable Agent only (optional for AI Scheduler) |

On **Windows**, prefer **`install.cmd`** — it installs missing tools when possible. You usually do not need the manual steps below.

Verify manually if needed:

```bash
java -version
mvn -version
node -v
```

### Windows — install prerequisites manually (optional)

Only if `install.cmd` cannot install a tool for you:

```powershell
winget install Microsoft.OpenJDK.21 --accept-package-agreements --accept-source-agreements
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
```

Maven is not on winget. `install.cmd` can download it automatically. Manual install:

```powershell
Invoke-WebRequest https://archive.apache.org/dist/maven/maven-3/3.9.9/binaries/apache-maven-3.9.9-bin.zip -OutFile "$env:TEMP\maven.zip"
Expand-Archive "$env:TEMP\maven.zip" -DestinationPath C:\maven
[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';C:\maven\apache-maven-3.9.9\bin', 'User')
```

Close and reopen the terminal after changing PATH.

### Linux / macOS — install prerequisites

**Debian / Ubuntu:**

```bash
sudo apt update
sudo apt install -y openjdk-21-jdk maven nodejs npm
```

**Fedora / RHEL:**

```bash
sudo dnf install -y java-21-openjdk-devel maven nodejs npm
```

Ensure `node -v` reports **20+**. If your distro ships an older Node.js, install [Node.js 20 LTS](https://nodejs.org/) or use [nvm](https://github.com/nvm-sh/nvm).

### Docker

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows / macOS) or [Docker Engine](https://docs.docker.com/engine/install/) with [Compose](https://docs.docker.com/compose/) (Linux). Verify:

```bash
docker --version
docker compose version
```

---

## Installation

Choose **native** (scripts) or **Docker** (no local Java, Maven, or Node required).

### Native — Windows (recommended path)

1. Open the repo folder in File Explorer.
2. Double-click **`install.cmd`**.
3. Wait until the window shows **Install complete** (first run may take several minutes).
4. Optional: double-click **`verify-install.cmd`** — look for **VERIFY PASSED**.

From PowerShell / Command Prompt in the repo root:

```powershell
.\install.cmd
.\verify-install.cmd
```

### Native — Linux / macOS

```bash
chmod +x install.sh school-timetabling/start-dev.sh chat-agent/install.sh chat-agent/start-dev.sh
./install.sh
```

### Docker — build images

From the **repository root** (first build may take several minutes):

```bash
docker compose build
```

You do not need `install.cmd` / `install.sh` when using Docker.

### Configure the LLM (for Timetable Agent)

LLM credentials are set in the **web UI**, not on the server:

1. Start both services and open http://localhost:8080
2. Open the **Timetable Agent** tab
3. Click the **Model** badge and enter your OpenAI-compatible **Base URL** (e.g. `http://localhost:1234/v1`), **Model id**, and optional **API key**
4. Click **Save** — settings are stored in your browser only

---

## How to Run

### Windows — double-click (easiest)

After a successful install, from the repo root:

1. Double-click **`start-backend.cmd`** — wait for `Listening on: http://localhost:8080`
2. Double-click **`start-agent.cmd`** — wait for `[chat-agent] Listening on http://localhost:3001`
3. Open **http://localhost:8080**

Keep both windows open while you use the app.

### Windows — terminals

```powershell
.\start-backend.cmd
```

```powershell
.\start-agent.cmd
```

Same as:

```powershell
cd school-timetabling
.\start-dev.cmd
```

```powershell
cd chat-agent
.\start-dev.cmd
```

> **Note:** Backend start scripts use `-Ddebug=false` so port **5005** is not opened (avoids harmless JDWP “Debugger failed to attach” noise). For JVM debugging, run `mvn quarkus:dev -Ddebug=5005` and attach a debugger.

### Linux / macOS — two terminals

```bash
cd school-timetabling
./start-dev.sh
```

```bash
cd chat-agent
./start-dev.sh
```

The Linux agent start script creates an empty `chat-agent/.env` if it is missing.

### Docker (recommended for quick start without local Java/Node)

From the repository root:

```bash
docker compose up --build
```

Or detached:

```bash
docker compose up --build -d
```

Wait until both containers are healthy, then open **http://localhost:8080**.

- Logs: `docker compose logs -f`
- Stop: `docker compose down`

Stop any native servers on ports **8080** and **3001** before starting Docker, or change mappings in `docker-compose.yml`.

### What to do in the app

- **AI Scheduler** — load demo data and click **Solve**
- **Timetable Agent** — configure your LLM in the Model dialog, then ask questions

Example agent prompts:

- `Load dataset1 and solve it`
- `Analyze the timetable — which teacher is busiest?`
- `Check constraints`

### Stop

- **Docker:** `docker compose down`
- **Native:** `Ctrl+C`, or in the backend window type **`q`** then Enter

---

## Common Issues

| Issue | What to do |
|-------|------------|
| `java` / `mvn` / `node` not found | Run **`install.cmd`** again (Windows), or install prerequisites above, then open a **new** terminal |
| Install window closes immediately | Use the updated `install.cmd` (it keeps the window open). Read the error, then re-run |
| `VERIFY FAILED` after install | Re-run **`install.cmd`**, then **`verify-install.cmd`** |
| PowerShell blocks `npm` (`running scripts is disabled`) | Use `.\install.cmd`, `.\start-agent.cmd`, or `npm.cmd` — not bare `npm` |
| `node: .env: not found` | Re-run `install.cmd` / `install.sh`, or create an empty `chat-agent/.env` |
| npm “vulnerabilities” / “funding” messages | Informational only — they do not mean install failed |
| `Debugger failed to attach ... JDWP-Handshake` | Harmless if you started with our scripts (`-Ddebug=false`). App is still on **http://localhost:8080** |
| `Permission denied` on `*.sh` | `chmod +x install.sh school-timetabling/start-dev.sh chat-agent/*.sh` |
| First backend start is very slow | Normal — Maven may still download dependencies |
| Port 8080 / 3001 already in use | Close the other backend/agent window, or stop Docker / the other process |
| Agent badge shows **offline** | Start **`start-agent.cmd`** (Terminal 2) |
| Agent shows **Model: not configured** | Open the Model dialog on the Timetable Agent tab and save LLM settings |
| Chat fails / **Cannot connect to API** | Check the LLM server is running and Base URL / Model id are correct |
| UI shows an old timetable | Restart the backend and hard-refresh the browser (`Ctrl+Shift+R`) |
| Docker build fails / out of memory | Give Docker at least **4 GB** RAM |
| Docker port already allocated | Stop native servers or change `8080`/`3001` in `docker-compose.yml` |

See [spec.md — Troubleshooting](spec.md#troubleshooting) for the full list.

---

## Feedback & Suggestions

We welcome your feedback! If you find a bug, have a feature idea, or want to share how you use AITTO:

- Open an issue on [GitHub](https://github.com/garycodingprojects/AI_Timetable)
- Include steps to reproduce for bugs, and your environment (Java / Node / OS versions)
- For timetabling rule ideas or constraint changes, note which dataset you tested with

---

## Special Thanks

This project was built by our AI Hackathon team **滅絕天地堂** for the [VTC AI Hackathon](https://clt.vtc.edu.hk/aihackathon/). Thank you to every teammate who contributed ideas, code, testing, and late-night debugging sessions — this utility would not exist without your collaboration.

We are grateful to **VTC CLT** for hosting the hackathon and creating the opportunity to explore AI-assisted timetabling with real-world constraints.

---

## License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.
