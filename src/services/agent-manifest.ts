import { DEFAULT_SCOPES, NPM_PACKAGE_NAME, PINNED_NPM_PACKAGE, POLAR_DOCS_URL, POLAR_DEVELOPER_PORTAL_URL, SERVER_VERSION } from "../constants.js";

export const AGENT_CLIENTS = ["generic", "claude", "cursor", "windsurf", "hermes", "openclaw"] as const;
export type AgentClientName = typeof AGENT_CLIENTS[number];

export const HERMES_DIRECT_TOOLS = [
  "mcp_polar_polar_agent_manifest", "mcp_polar_polar_connection_status", "mcp_polar_polar_daily_summary",
  "mcp_polar_polar_data_inventory", "mcp_polar_polar_list_activity", "mcp_polar_polar_list_sleeps",
  "mcp_polar_polar_list_training_sessions", "mcp_polar_polar_weekly_summary", "mcp_polar_polar_wellness_context"
];

const STANDARD_TOOLS = [
  "polar_agent_manifest", "polar_cache_status", "polar_capabilities",
  "polar_connection_status", "polar_daily_summary", "polar_data_inventory",
  "polar_demo", "polar_exchange_code", "polar_get_account_data", "polar_get_auth_url",
  "polar_get_route", "polar_list_activity", "polar_list_calendar",
  "polar_list_continuous_samples", "polar_list_nightly_recharge", "polar_list_ppi_samples",
  "polar_list_skin_contacts", "polar_list_sleep_wake_vectors", "polar_list_sleeps",
  "polar_list_sport_profile_catalog", "polar_list_sport_profiles", "polar_list_sports",
  "polar_list_subscriptions", "polar_list_temperature_measurements", "polar_list_tests",
  "polar_list_training_sessions", "polar_list_training_target_favorites", "polar_list_training_targets",
  "polar_list_user_devices", "polar_privacy_audit", "polar_quickstart",
  "polar_revoke_access", "polar_weekly_summary", "polar_wellness_context"
];

const RESOURCES = [
  "polar://account-data", "polar://agent-manifest", "polar://capabilities",
  "polar://inventory", "polar://latest/sleep", "polar://summary/daily",
  "polar://summary/weekly"
];

export function parseAgentClientName(value: string): AgentClientName {
  return AGENT_CLIENTS.includes(value as AgentClientName) ? value as AgentClientName : "generic";
}

export function buildAgentManifest(client: AgentClientName = "generic") {
  return {
    project: "polar-mcp-unofficial",
    mcp_name: "io.github.davidmosiah/polarmcp",
    client,
    unofficial: true,
    package: {
      name: NPM_PACKAGE_NAME,
      version: SERVER_VERSION,
      install_command: `npx -y ${NPM_PACKAGE_NAME}`,
      pinned_install_command: `npx -y ${PINNED_NPM_PACKAGE}`,
      binary: "polar-mcp-server"
    },
    oauth: {
      provider: "Polar AccessLink Dynamic API v4",
      redirect_uri: "http://127.0.0.1:3000/callback",
      scopes: DEFAULT_SCOPES,
      token_storage: "~/.polar-mcp/tokens.json with 0600 permissions",
      secret_storage: "~/.polar-mcp/config.json or POLAR_* environment variables; never print secrets"
    },
    recommended_first_calls: ["polar_quickstart", "polar_demo", "polar_connection_status", "polar_wellness_context", "polar_daily_summary"],
    standard_tools: STANDARD_TOOLS,
    resources: RESOURCES,
    hermes: {
      config_path: "~/.hermes/config.yaml",
      skill_path: "~/.hermes/skills/polar-mcp/SKILL.md",
      tool_name_prefix: "mcp_polar_",
      common_tool_names: HERMES_DIRECT_TOOLS,
      recommended_config: hermesConfigSnippet(),
      use_direct_tools: true,
      avoid_terminal_workarounds: true,
      no_gateway_restart_for_data_access: true,
      reload_after_config_change: "/reload-mcp or hermes mcp test polar",
      doctor_command: "npx -y polar-mcp-unofficial doctor --client hermes --json"
    },
    agent_rules: [
      "Call polar_connection_status and polar_data_inventory before Polar data tools.",
      "If setup is incomplete, guide the user through setup, auth and doctor instead of guessing token state.",
      "Treat Polar health and route data as sensitive. Do not expose raw payloads unless the user asks for raw mode.",
      "Endpoint availability depends on device support, granted scopes and the user's Polar account data; explain permission or missing-data errors clearly.",
      "For Hermes, do not restart the gateway for normal Polar data access; reload MCP instead.",
      "Do not provide medical diagnosis or treatment instructions. Frame outputs as health/training context."
    ],
    troubleshooting: [
      { symptom: "missing POLAR_CLIENT_ID / POLAR_CLIENT_SECRET / POLAR_REDIRECT_URI", action: "Run `polar-mcp-server setup` or set POLAR_* env vars." },
      { symptom: "401 or expired token", action: "Run `polar-mcp-server auth` again; tokens refresh automatically when refresh_token is present." },
      { symptom: "403 from an endpoint", action: "Confirm the app requested the matching Polar scope, then re-authorize if needed." },
      { symptom: "route data looks empty", action: "Use structured or raw mode only when the user explicitly needs route detail; summary mode redacts GPS." },
      { symptom: "Hermes configured but tools unavailable", action: "Run `/reload-mcp` or `hermes mcp test polar`; do not restart gateway for normal reload." }
    ],
    links: {
      github: "https://github.com/davidmosiah/polarmcp",
      docs: "https://polarmcp.vercel.app/",
      npm: "https://www.npmjs.com/package/polar-mcp-unofficial",
      polar_apps: POLAR_DEVELOPER_PORTAL_URL,
      polar_api_docs: POLAR_DOCS_URL
    }
  };
}

export function formatAgentManifestMarkdown(manifest: ReturnType<typeof buildAgentManifest>): string {
  return `# Polar MCP Agent Manifest

Unofficial: ${manifest.unofficial}
Package: \`${manifest.package.name}\` v${manifest.package.version}
Install: \`${manifest.package.install_command}\`
Pinned install: \`${manifest.package.pinned_install_command}\`

## OAuth
Provider: ${manifest.oauth.provider}
Redirect URI: \`${manifest.oauth.redirect_uri}\`
Scopes: \`${manifest.oauth.scopes.join(" ")}\`
Tokens: ${manifest.oauth.token_storage}

## First Calls
${manifest.recommended_first_calls.map((tool) => `- \`${tool}\``).join("\n")}

## Hermes
Config: \`${manifest.hermes.config_path}\`
Skill: \`${manifest.hermes.skill_path}\`
Reload: \`${manifest.hermes.reload_after_config_change}\`
Direct tools:
${manifest.hermes.common_tool_names.map((tool) => `- \`${tool}\``).join("\n")}

## Agent Rules
${manifest.agent_rules.map((rule) => `- ${rule}`).join("\n")}
`;
}

export function hermesConfigSnippet(): string {
  return `mcp_servers:\n  polar:\n    command: npx\n    args:\n      - -y\n      - ${PINNED_NPM_PACKAGE}\n    timeout: 120\n    connect_timeout: 60\n    sampling:\n      enabled: false`;
}

export function hermesSkillMarkdown(): string {
  return `# Polar MCP Skill

Use this skill whenever a user asks Hermes to inspect Polar activity, sleep, Nightly Recharge, training sessions, samples, routes, daily summaries or weekly summaries through the Polar MCP.

## Rules
- Start with \`mcp_polar_polar_connection_status\`.
- Prefer \`mcp_polar_polar_daily_summary\` and \`mcp_polar_polar_weekly_summary\` before low-level endpoint calls.
- Treat Polar data as sensitive. Do not request raw payloads unless the user explicitly asks.
- Do not diagnose or treat medical conditions.
- Reload MCP with \`/reload-mcp\` or \`hermes mcp test polar\`; do not restart the gateway for normal data access.
`;
}
