# Changelog

## 0.2.0 - 2026-05-11

- Add `polar_quickstart` tool — personalized 3-step setup walkthrough adapted to current state (env vars set? OAuth token present? what's next?). Returns cross-connector hints to pair with wellness-nourish, wellness-cycle-coach, and wellness-cgm-mcp.
- Add `polar_demo` tool — realistic example payloads of `polar_daily_summary`, `polar_wellness_context`, and `polar_list_nightly_recharge` with Nightly Recharge ANS score, sleep duration, and training load so agents see the contract before any real Polar API call.
- `recommended_first_calls` on the agent manifest now leads with `polar_quickstart` and `polar_demo`.
- Tool count: 32 → 34.

## 0.1.2

- Aligned the Polar API User-Agent with the package/runtime version.

## 0.1.1

- Improved README and local OAuth success/terminal UX.
- Kept Polar AccessLink v4 tool surface and package metadata aligned after the first public npm release.

## 0.1.0

- Initial Polar MCP implementation.
- Added OAuth setup/auth/doctor CLI with local config and token storage under `~/.polar-mcp/`.
- Added 30 MCP tools, 6 resources and 3 prompts.
- Added Polar AccessLink Dynamic API v4 tools for account data, devices, activity, calendar, sleep, Nightly Recharge, training sessions, training targets, routes, sports, samples, temperature, tests, subscriptions and skin contacts.
- Added daily and weekly summaries, privacy modes, SQLite cache support, privacy audit, connection status and Hermes agent manifest checks.
