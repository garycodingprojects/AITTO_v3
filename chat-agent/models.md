---
active: local
providers:
  local:
    type: openai-compatible
    baseURL: 'http://localhost:1234/v1'
    model: local-model-name
    apiKeyEnv: LOCAL_AI_API_KEY
  schoolLan:
    type: openai-compatible
    baseURL: 'http://localhost:1234/v1'
    model: remote-model-name
    apiKeyEnv: LAN_AI_API_KEY
---

# Chat Agent Model Configuration

Optional legacy reference for OpenAI-compatible LLM provider YAML. **The running Timetable Agent reads LLM settings from the browser on each request** — configure Base URL, model id, and API key in the web UI (**Timetable Agent** tab → **Model** badge).

Edit the YAML frontmatter above only if you use this file for local development reference.

## PowerShell examples

```powershell
# Optional: server-side env vars in chat-agent\.env (can be empty)
cd chat-agent
npm.cmd install
.\start-dev.cmd
```

Replace `baseURL` and `model` with values from your LLM server. List models:

```powershell
Invoke-RestMethod -Uri "http://localhost:1234/v1/models"
```

Use one of the returned `id` values as `model`.
