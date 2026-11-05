---
name: polar-mcp
description: >-
  Read the user's Polar training sessions, nightly recharge, sleep and activity through the local polar MCP server. Use when the user asks about Polar workouts, recovery or nightly recharge, sleep, training load, or a weekly Polar review. Starts with connection status, uses synthetic demo data before OAuth, and never asks for secrets in chat.
---

# Polar

MCP server `polar` from the `polar-mcp-unofficial@0.6.0` npm package, run locally through `npx`. It reads training sessions, nightly recharge, sleep and daily activity. Data source: the official Polar AccessLink Dynamic API v4.

## Workflow

1. Start with `polar_connection_status`. Then pick what fits the question: `polar_daily_summary`, `polar_weekly_summary`.
2. If `polar_connection_status` reports the connector is not ready, call `polar_demo` for clearly labelled synthetic data so the user sees the shape of the answer, then give them the setup commands below to run in their own terminal.
3. Lead with the answer to the user's question, then the two or three numbers that support it, with dates. Say when data is missing or stale instead of filling gaps.

## Setup (the user runs this in a terminal, not in chat)

```bash
npx -y polar-mcp-unofficial@0.6.0 setup --client generic
npx -y polar-mcp-unofficial@0.6.0 auth
npx -y polar-mcp-unofficial@0.6.0 doctor
```

`setup` asks for the Polar developer app client ID and secret and saves them locally (`--client generic` because this plugin already registers the server with Hermes); `auth` opens the Polar consent page in the browser and stores the OAuth tokens under `~/.polar-mcp/` with 0600 permissions; `doctor` confirms readiness.

## Safety

- Never ask the user to paste client secrets, passwords, tokens or MFA codes into the chat; setup happens in their terminal.
- Tools that change local state: polar_profile_update (local profile only), polar_exchange_code (stores OAuth tokens locally). Use them only when the user asks.
- Destructive: polar_revoke_access (deletes local tokens only; the user must revoke the remote grant in Polar AccessLink/Flow if needed). Confirm with the user first.
- Not medical advice: the data supports personal reflection and planning, not diagnosis or treatment. Point the user to a clinician for symptoms, medication or anything urgent.
