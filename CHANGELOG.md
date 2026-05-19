# Changelog

## 0.3.2 - 2026-05-19

### Added

- **HTTP retry middleware with exponential backoff + jitter** (`src/services/http-retry.ts`). Every Polar AccessLink API call (incl. OAuth token requests) now retries on `408`, `429`, `500`, `502`, `503`, `504`, and network errors. Max 3 attempts (initial + 2 retries); backoff schedule `500ms / 1000ms / 2000ms` with ±20% jitter. Honors `Retry-After` (seconds or HTTP-date). Each retry logs to stderr as `[polar-mcp] retry N/3 after Xms (status=Y or error=Z)`. Set `POLAR_NO_RETRY=true` to disable (used in tests). No new dependencies.

## 0.3.1 - 2026-05-11

### Fixed

- **Profile-store regex no longer false-positives on common wellness words.** Split `SECRET_PATTERNS` into `SECRET_KEY_PATTERNS` (broad, for field names like `oauth_token`) and `SECRET_VALUE_PATTERNS` (high-specificity, only credential shapes: JWTs, `Bearer <token>`, `sk_live_`, `sk-proj-`, `xoxb-`, `github_pat_`, raw `Authorization:` headers). Previously legitimate text like "5 training sessions per week", "limit cookies", "I need to refresh my approach", or "secret sauce: more sleep" was rejected.
- **Partial-profile reads no longer crash downstream.** `readProfileFile` now structurally merges with `DEFAULT_PROFILE` when legacy Hermes/OpenClaw files lacked sub-objects. Previously `buildProfileSummary` and `missingCriticalFields` would throw.
- **Onboarding `privacy_note` no longer hard-codes a single connector path.** Lists multiple example paths so the message reads correctly from every connector.

## 0.3.0 - 2026-05-11

- Add shared wellness-profile support backed by the canonical Delx Wellness profile store at `~/.delx-wellness/profile.json` (vendored from `delx-wellness/lib/profile-store.ts` commit ab83d1a so the connector stays self-contained — no new npm deps).
- Add `polar_profile_get` tool — read-only summary of the shared profile plus the missing-critical-fields hint and absolute storage path.
- Add `polar_profile_update` tool — patch the shared profile but only when `explicit_user_intent=true`; otherwise it returns `USER_ACTION_REQUIRED` so agents do not silently persist things the user did not confirm.
- Add `polar_onboarding` tool — returns the 11-question onboarding flow in `en` or `pt-BR`, current profile, missing critical fields, and a cross-connector hint for pairing with `wellness-nourish`, `wellness-cycle-coach`, and `wellness-cgm-mcp`.
- Add `polar-mcp-server onboarding` CLI command — emits the same flow as JSON to stdout and a friendly Markdown summary to stderr when the terminal is interactive. Supports `--locale pt-BR`.
- Privacy contract: the shared profile NEVER stores OAuth tokens, refresh tokens, API keys, cookies, session ids or biomarkers — only what the user types into onboarding. Polar OAuth tokens remain in `~/.polar-mcp/tokens.json` with 0600 permissions.
- `recommended_first_calls` on the agent manifest now leads with `polar_profile_get` before `polar_quickstart`.
- Tool count: 34 → 37.

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
