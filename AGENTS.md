# Agent Development Notes

## Scope

This repo is the unofficial Polar AccessLink MCP connector for local agent workflows.

## Commands

- Install: `npm ci`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Fast smoke: `npm run smoke`
- HTTP smoke: `npm run smoke:http`
- Full gate: `npm test`

## Rules

- Never commit OAuth client secrets, access tokens, refresh tokens, personal Polar data, or local config.
- Keep the connector explicitly unofficial and local-first.
- Preserve agent-ready surfaces: manifest, connection status, privacy audit, CLI UX, Hermes agent manifest, and metadata checks.
- Prefer fixture/readiness tests over live API calls in CI.
