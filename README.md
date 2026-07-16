<!-- delx-wellness header v2 -->
<h1 align="center">Polar MCP</h1>

<div align="center">
  <img src="assets/banner.png" alt="Polar MCP — Polar MCP for AI agents" width="85%" />
</div>

<h3 align="center">
  Give your AI agent your Polar Nightly Recharge, training load, PPI and HRV data &mdash; locally.<br>
  Local-first MCP server &mdash; <strong>tokens never leave your machine</strong>.
</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/polar-mcp-unofficial"><img src="https://img.shields.io/npm/v/polar-mcp-unofficial?style=for-the-badge&labelColor=0F172A&color=10B981&logo=npm&logoColor=white" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/polar-mcp-unofficial"><img src="https://img.shields.io/npm/dm/polar-mcp-unofficial?style=for-the-badge&labelColor=0F172A&color=0EA5A3&logo=npm&logoColor=white" alt="npm downloads" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/LICENSE-MIT-22C55E?style=for-the-badge&labelColor=0F172A" alt="License MIT" /></a>
  <a href="https://wellness.delx.ai/connectors/polar"><img src="https://img.shields.io/badge/SITE-wellness.delx.ai-0EA5A3?style=for-the-badge&labelColor=0F172A" alt="Site" /></a>
</p>

<p align="center">
  <a href="https://github.com/davidmosiah/polar-mcp/stargazers"><img src="https://img.shields.io/github/stars/davidmosiah/polar-mcp?style=for-the-badge&labelColor=0F172A&color=FBBF24&logo=github" alt="GitHub stars" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/BUILT_FOR-MCP-7C3AED?style=for-the-badge&labelColor=0F172A" alt="Built for MCP" /></a>
  <a href="https://github.com/davidmosiah/delx-wellness-hermes"><img src="https://img.shields.io/badge/HERMES-one--command_setup-10B981?style=for-the-badge&labelColor=0F172A" alt="Hermes one-command setup" /></a>
  <a href="https://github.com/davidmosiah/delx-wellness"><img src="https://img.shields.io/badge/Polar-D7263D?style=for-the-badge&labelColor=0F172A&logoColor=white" alt="Polar" /></a>
</p>

> ⚡ **One-command install** with [Delx Wellness for Hermes](https://github.com/davidmosiah/delx-wellness-hermes):
> `npx -y delx-wellness-hermes setup` &mdash; preconfigures this connector and the other 8 in a dedicated Hermes profile.
>
> Or wire it standalone into Claude Desktop / Cursor / ChatGPT Desktop &mdash; see the install section below.

---

<!-- /delx-wellness header v2 -->

**Local-first MCP server that connects AI agents to your Polar training, sleep, Nightly Recharge and continuous-sample data.**

> **Unofficial project.** Not affiliated with, endorsed by or supported by Polar Electro Oy. Polar is a trademark of its respective owner. Use this only with your own Polar account and in line with the Polar AccessLink API terms.

Built by [David Mosiah](https://github.com/davidmosiah) for people who use Claude, Cursor, Hermes, OpenClaw or other MCP-compatible agents to think about training load, recovery and endurance - without copy-pasting numbers from Polar Flow.

Part of [Delx Wellness](https://github.com/davidmosiah/delx-wellness), a registry of local-first wellness MCP connectors.

> If this connector helps your agent workflow, please star the repo. Stars make the project easier for other AI builders to discover and help Delx keep shipping local-first wellness infrastructure.

## Why this exists

Polar has one of the deepest training-physiology stacks among consumer wearables - Nightly Recharge, continuous samples, PPI (pulse-to-pulse intervals), training targets, sport profiles, orthostatic and fitness tests. The Polar AccessLink Dynamic API v4 exposes this data, but with **16 fine-grained OAuth scopes** and a structure that's harder to navigate than typical consumer APIs.

This package handles the OAuth dance locally, normalizes responses across the v4 endpoints, redacts GPS by default, and exposes Polar through the Model Context Protocol. Tokens never leave your machine.

## Setup in 60 seconds

You'll need a Polar AccessLink client ([create one here](https://admin.polaraccesslink.com)) with redirect URI `http://127.0.0.1:3000/callback`.

```bash
npx -y polar-mcp-unofficial setup    # interactive: paste client id + secret
npx -y polar-mcp-unofficial auth     # opens browser, captures the OAuth code
npx -y polar-mcp-unofficial doctor   # verifies you're ready
```

Recommended scopes (request the ones matching the data you want):

```text
activity:read calendar:read continuous_samples:read devices:read
nightly_recharge:read ppi_data:read profile:read routes:read
skin_contact:read sleep:read sports:read temperature_measurement:read
tests:read training_sessions:read training_targets:read user_subscription:read
```

Then add this to your MCP client config:

```json
{
  "mcpServers": {
    "polar": {
      "command": "npx",
      "args": ["-y", "polar-mcp-unofficial"]
    }
  }
}
```

For Claude Desktop, run `setup --client claude` and the snippet is written for you.

## Try it with your agent

Three things to ask first:

```text
Use polar_connection_status to check setup, then run polar_daily_summary.
Give me a 5-line training brief for today.
```

```text
Call polar_weekly_summary with response_format=json. Identify my biggest
training-load/recovery bottleneck and give me a next-week plan.
```

```text
Use the polar_training_load_investigation prompt, after=2026-04-01.
Walk me through my recent training sessions + Nightly Recharge.
```

## Data availability

This package uses the official Polar AccessLink Dynamic API v4. When this README says `raw`, it means the upstream Polar JSON for a supported endpoint - not raw device sensor streams.

| Data | Available | Notes |
|---|:---:|---|
| Daily activity + calendar | yes | Requires `activity:read` / `calendar:read` |
| Sleep + sleep/wake vectors | yes | Requires `sleep:read` |
| Nightly Recharge (recovery score) | yes | Requires `nightly_recharge:read`; supported devices |
| Training sessions + training targets | yes | Requires `training_sessions:read` / `training_targets:read` |
| Continuous samples (HR over time) | yes | Requires `continuous_samples:read` |
| PPI samples (pulse-to-pulse intervals, HRV-relevant) | yes | Requires `ppi_data:read`; supported devices |
| Temperature measurements | yes | Requires `temperature_measurement:read`; supported devices |
| Skin contact periods | yes | Requires `skin_contact:read` |
| Tests (fitness / orthostatic / running) | yes | Requires `tests:read` |
| Routes + GPS geometry | opt-in | GPS coordinates redacted unless raw mode |
| Sports + sport profiles + devices | yes | Catalog and user metadata |
| Live device telemetry | - | Not exposed by Polar AccessLink |

## Tools

**Start with these:**

- `polar_connection_status` - verify local setup, scopes and readiness before calling Polar
- `polar_data_inventory` — inventory supported data domains, scopes, privacy modes and recommended first calls without calling Polar APIs.
- `polar_daily_summary` - sleep, activity, Nightly Recharge and training brief for today
- `polar_weekly_summary` - scorecard, comparison vs prior week, next-week plan

**Auth & diagnostics**

- `polar_capabilities`, `polar_agent_manifest`, `polar_privacy_audit`, `polar_cache_status`
- `polar_get_auth_url`, `polar_exchange_code`, `polar_revoke_access`

**Account**

- `polar_get_account_data`, `polar_list_user_devices`, `polar_list_subscriptions`

**Activity & sleep**

- `polar_list_activity`, `polar_list_calendar`
- `polar_list_sleeps`, `polar_list_sleep_wake_vectors` — sleep lists hydrate available dates with the v4 `sleep-result`, `sleep-evaluation`, and `sleep-score` features by default
- `polar_list_nightly_recharge`

**Heart & physiology** (date range)

- `polar_list_continuous_samples`, `polar_list_ppi_samples`
- `polar_list_temperature_measurements`, `polar_list_skin_contacts`

**Training**

- `polar_list_training_sessions`, `polar_list_training_targets`, `polar_list_training_target_favorites`
- `polar_list_tests`

**Sports & routes**

- `polar_list_sports`, `polar_list_sport_profile_catalog`, `polar_list_sport_profiles`
- `polar_get_route` - GPS coordinates redacted unless raw mode

## Prompts

- `polar_daily_checkin` - practical daily training and recovery check-in
- `polar_weekly_review` - review trends across activity, sleep and recovery
- `polar_training_load_investigation` - investigate training sessions + recovery context

## Resources

- `polar://capabilities`, `polar://agent-manifest`
- `polar://summary/daily`, `polar://summary/weekly`

## Privacy & security

- OAuth tokens are stored in `~/.polar-mcp/tokens.json` with `0600` permissions and are never returned by tools.
- The server never prints access or refresh tokens.
- `POLAR_PRIVACY_MODE` defaults to `structured`. Structured mode preserves the complete upstream physiological payload while removing secret/GPS fields; normalized aliases are additive and never replace nested v4 objects. Raw Polar JSON is opt-in via `raw` mode or per-call override.
- GPS route geometry is redacted in `summary` and `structured` modes - only `raw` mode exposes raw coordinates.
- Date formats and supported `features` are validated per endpoint. Feature queries that Polar limits to one day are hydrated one available date at a time.
- The MCP client never sees access or refresh tokens.
- This is **not medical advice**. The server exposes user-authorized data for personal AI workflows, not diagnosis or training prescription.

## Configuration

`setup` writes most of these into `~/.polar-mcp/config.json` (`0600`). Manual env override is supported:

```bash
POLAR_CLIENT_ID=<client-id>
POLAR_CLIENT_SECRET=<client-secret>
POLAR_REDIRECT_URI=http://127.0.0.1:3000/callback

# Optional
POLAR_SCOPES="activity:read calendar:read continuous_samples:read ..."
POLAR_PRIVACY_MODE=structured        # summary | structured | raw
POLAR_CACHE=sqlite                   # optional read-through cache
POLAR_TOKEN_PATH=~/.polar-mcp/tokens.json
POLAR_CACHE_PATH=~/.polar-mcp/cache.sqlite
```

## Hermes / remote setup

```bash
npx -y polar-mcp-unofficial setup --client hermes --no-auth
npx -y polar-mcp-unofficial auth                      # run locally if browser auth is needed
npx -y polar-mcp-unofficial doctor --client hermes
hermes mcp test polar
```

After Hermes config changes, use `/reload-mcp` or `hermes mcp test polar`. Don't restart the gateway for normal data access.

If browser OAuth has to happen on a different machine than Hermes, run `auth` locally and copy `~/.polar-mcp/tokens.json` to the server with `chmod 600`.

## Requirements

- Node.js 20+
- A Polar AccessLink client at <https://admin.polaraccesslink.com> with redirect URI `http://127.0.0.1:3000/callback`

## Development

```bash
git clone https://github.com/davidmosiah/polar-mcp.git
cd polar-mcp
npm install
npm test
npm run build
```

Test with MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Links

- npm: <https://www.npmjs.com/package/polar-mcp-unofficial>
- Docs site: <https://wellness.delx.ai/connectors/polar>
- Legacy docs: <https://polarmcp.vercel.app/>
- GitHub: <https://github.com/davidmosiah/polar-mcp>
- Delx Wellness registry: <https://github.com/davidmosiah/delx-wellness>
- Connector quality standard: <https://github.com/davidmosiah/delx-wellness/blob/main/docs/connector-quality-standard.md>
- Polar AccessLink Dynamic API v4 docs: <https://www.polar.com/polar-api-v4/>

<!-- delx-wellness see-also -->

## See also

The full [Delx Wellness](https://wellness.delx.ai) connector library:

| Provider | Package | Repo |
|---|---|---|
| WHOOP | [`whoop-mcp-unofficial`](https://www.npmjs.com/package/whoop-mcp-unofficial) | [whoop-mcp](https://github.com/davidmosiah/whoop-mcp) |
| Oura | [`oura-mcp-unofficial`](https://www.npmjs.com/package/oura-mcp-unofficial) | [ouramcp](https://github.com/davidmosiah/ouramcp) |
| Garmin | [`garmin-mcp-unofficial`](https://www.npmjs.com/package/garmin-mcp-unofficial) | [garminmcp](https://github.com/davidmosiah/garminmcp) |
| Strava | [`strava-mcp-unofficial`](https://www.npmjs.com/package/strava-mcp-unofficial) | [strava-mcp](https://github.com/davidmosiah/strava-mcp) |
| Fitbit | [`fitbit-mcp-unofficial`](https://www.npmjs.com/package/fitbit-mcp-unofficial) | [fitbitmcp](https://github.com/davidmosiah/fitbitmcp) |
| Withings | [`withings-mcp-unofficial`](https://www.npmjs.com/package/withings-mcp-unofficial) | [withingsmcp](https://github.com/davidmosiah/withingsmcp) |
| Apple Health | [`apple-health-mcp-unofficial`](https://www.npmjs.com/package/apple-health-mcp-unofficial) | [apple-health-mcp](https://github.com/davidmosiah/apple-health-mcp) |
| Polar | [`polar-mcp-unofficial`](https://www.npmjs.com/package/polar-mcp-unofficial) | [polar-mcp](https://github.com/davidmosiah/polar-mcp) |
| Nourish (nutrition) | [`wellness-nourish`](https://www.npmjs.com/package/wellness-nourish) | [wellness-nourish](https://github.com/davidmosiah/wellness-nourish) |

**One-command setup for Hermes** — preconfigures every connector above plus wellness skills + onboarding: [`delx-wellness-hermes`](https://github.com/davidmosiah/delx-wellness-hermes).

<!-- /delx-wellness see-also -->

## 📧 Contact & Support

- 📨 **support@delx.ai** — general questions, integration help, partnerships
- 🐛 **Bug reports / feature requests** — [GitHub Issues](https://github.com/davidmosiah/polar-mcp/issues)
- 🐦 **Updates** — [@delx369](https://x.com/delx369) on X
- 🌐 **Site** — [wellness.delx.ai](https://wellness.delx.ai)


## License

MIT - see [LICENSE](LICENSE).

## Disclaimer

This software is provided as-is. It is not a medical device, does not provide medical advice, and should not be used for diagnosis, treatment or training prescription. Always consult qualified professionals for medical or training concerns.
