# Changelog

## 0.3.10 - 2026-07-17

### Fixed

- **Markdown collection previews now understand Polar v4 records instead of only legacy snake-case activity aliases.** Training sessions show their nested identifier, local `startTime`, sport, duration, distance, calories, heart-rate range, training benefit, and recovery time; sleep previews show `sleepDate`, score, and hypnogram start/end when available.
- **Missing optional preview fields are omitted instead of rendered as misleading `n/a` values.** JSON and structured payloads remain unchanged.

Thanks to Oleksii for confirming all five data domains on 0.3.9 and reporting the final presentation-only mismatch.

## 0.3.9 - 2026-07-16

### Fixed

- **Training-session ranges now use Polar's local ISO date-time wire format** (`YYYY-MM-DDTHH:mm:ss`) without a UTC suffix or offset. The v4 training parser rejects both plain dates and RFC 3339 UTC values such as `2026-07-08T00:00:00Z`; date-only inputs and the default 28-day range now serialize to local midnight.
- **The endpoint boundary test now covers all training-session range paths:** explicit dates, omitted dates, and date-times containing fractions or timezone suffixes. This prevents the connector from reintroducing a globally normalized date format where the upstream API requires endpoint-specific serialization.

Thanks to Oleksii for testing 0.3.8 and isolating the final failing domain with fresh stderr evidence.

## 0.3.8 - 2026-07-16

### Fixed

- **Collection request contracts are now explicit per Polar v4 endpoint.** Training-session ranges use ISO date-times, while sleep and the other date-based domains keep plain `YYYY-MM-DD` values. Supported feature flags and one-day feature limits are validated from the same contract matrix instead of being inferred globally.
- **Sleep list calls now return the physiological payload promised by structured mode.** The connector first indexes the requested range, then hydrates only the available sleep dates with `sleep-result`, `sleep-evaluation`, and `sleep-score`, respecting Polar's one-day feature-query rule.
- **Structured normalization no longer overwrites nested v4 objects with flattened aliases.** Upstream fields such as `sleepScore`, `sleepResult`, and `sleepEvaluation` are preserved in full after secret/GPS redaction; normalized aliases are additive, while only summary mode returns a flattened-only representation.
- **Daily, weekly, and wellness summaries now use the same endpoint-aware collection path** and understand Polar v4 nested sleep durations, scores, continuity, and start/end times.

Thanks again to Oleksii for testing 0.3.7 against a real Polar account and isolating both failures precisely.

## 0.3.7 - 2026-07-15

### Fixed

- **Dynamic API v4 collection ranges are now sent as plain `YYYY-MM-DD` values.** The 0.3.6 input fix accepted plain dates but normalized them to timestamps such as `2026-07-08T00:00:00Z`, which v4 rejects. Legacy date-time input remains accepted but is reduced to its calendar date before the request.
- **Collection tools now supply a safe 28-day default range when dates are omitted**, including daily activity, so v4 never receives a range request without its required `from` and `to` parameters. Polar's `to` date remains exclusive.
- **Daily, weekly, and wellness summaries use plain-date ranges and log per-domain failures to stderr.** Summaries still return useful partial data when one scope or endpoint fails, but the underlying error is now visible in MCP client logs.

## 0.3.6 - 2026-07-08

### Fixed

- **Tool errors are now written to stderr** so stdio clients (Claude Desktop, Hermes, etc.) persist them to their MCP server log (e.g. `~/Library/Logs/Claude/mcp-server-polar.log`). Previously every handler folded errors into the tool result only, leaving the server log with no trace of what failed — so an upstream HTTP or input-validation error surfaced to the user as a generic "Tool execution failed" with nothing to diagnose. `makeError` now emits `[polar-mcp] tool error: <message/stack>` (secret-redacted) on every failure. Thanks to Oleksii for the precise, reproducible report.
- **`after` / `before` accept plain dates (`YYYY-MM-DD`)**, not just timezone-qualified ISO 8601 date-times. Ranges like `after=2026-07-01&before=2026-07-07` previously failed input validation before ever reaching the network. Date-only bounds expand to start/end of day in UTC, so a `before` bound keeps the whole final day.

## 0.3.4 - 2026-05-20

### Added

- **`POLAR_NO_CACHE` env var now advertised in `server.json`** — the bypass already worked in 0.3.3; this release just surfaces it in the agent-facing manifest so callers discover the opt-out.

## 0.3.3 - 2026-05-20

### Added

- **HTTP response cache middleware** (`src/services/http-cache.ts`). In-memory cache for GET responses wraps the existing `fetchWithRetry` layer, so cache hits skip both the network and the retry middleware. Default TTL `60s`; cache key normalizes query-param order so permutations of `?after=...&before=...&per_page=30` share one entry. Bypass conditions: `POLAR_NO_CACHE=true` env var, per-call `cache_ttl: 0`, non-GET methods, and any response with status >= 400. Per-connector singleton — each MCP package gets its own module instance and therefore its own cache map. `polar_cache_status` now also reports `http_cache` stats (`size`, `hit_count`, `miss_count`, `hit_rate`, `default_ttl_seconds`, `bypass_env_var`). No new dependencies.

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
