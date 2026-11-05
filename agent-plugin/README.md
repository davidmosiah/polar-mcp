# Polar — Agent Plugins package

Portable [Agent Plugins](https://agent-plugins.org/) v1 package for
[Hermes Agent](https://github.com/NousResearch/hermes-agent) and other Agent Plugins clients:
the `polar` MCP server (`polar-mcp-unofficial@0.5.4` over stdio) plus the `polar-mcp` workflow skill.

## Install (Hermes Agent)

```bash
hermes plugins install davidmosiah/polar-mcp/agent-plugin --no-enable
hermes plugins enable polar-mcp
```

Requires Node.js 20+ (`npx` on PATH). The skill loads as `polar-mcp:polar-mcp`.

## Connector setup

```bash
npx -y polar-mcp-unofficial@0.5.4 setup --client generic
npx -y polar-mcp-unofficial@0.5.4 auth
npx -y polar-mcp-unofficial@0.5.4 doctor
```

`setup` asks for the Polar developer app client ID and secret and saves them locally (`--client generic` because this plugin already registers the server with Hermes); `auth` opens the Polar consent page in the browser and stores the OAuth tokens under `~/.polar-mcp/` with 0600 permissions; `doctor` confirms readiness.

## Disclosure

Runs the `polar-mcp-unofficial@0.5.4` npm package locally over stdio through `npx` (Node.js 20+ required); the package is downloaded from npm on first start. Data source: the official Polar AccessLink Dynamic API v4. Credentials and OAuth tokens are created by the connector's own `setup`/`auth` commands in the user's terminal and stay on the machine (`~/.polar-mcp/`); the plugin declares no environment variables and reads no Hermes credentials. Tools that change state: polar_profile_update (local profile only); polar_exchange_code (stores OAuth tokens locally); polar_revoke_access (revokes the Polar grant and deletes local tokens). The tool set comes from the pinned npm version, not from this repository's source tree.
