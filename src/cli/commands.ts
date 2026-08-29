import { buildConnectionStatus } from "../services/connection-status.js";
import { SERVER_VERSION } from "../constants.js";
import { parseAgentClientName } from "../services/agent-manifest.js";
import {
  buildProfileSummary,
  getOnboardingFlow,
  getProfile,
  getProfilePath,
  missingCriticalFields,
  type WellnessLanguage
} from "../services/profile-store.js";
import { runAuthCommand } from "./auth.js";
import { runSetupCommand } from "./setup.js";
import { runToolCall } from "./tool-calls.js";

export async function runCliCommand(args: string[]): Promise<number | undefined> {
  const [command, ...rest] = args;
  if (!command || command === "--http") return undefined;
  if (command === "setup") return runSetupCommand(rest);
  if (command === "doctor" || command === "status") return runDoctor(rest);
  if (command === "call") return runToolCall(rest);
  if (command === "auth") return runAuthCommand(rest);
  if (command === "onboarding") return runOnboarding(rest);
  if (command === "version" || command === "--version" || command === "-v") {
    console.log(SERVER_VERSION);
    return 0;
  }
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }
  if (!command.startsWith("--")) {
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  }
  return undefined;
}

async function runOnboarding(args: string[]): Promise<number> {
  let locale: WellnessLanguage = "en";
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--locale") {
      const value = args[index + 1];
      if (value === "pt-BR" || value === "en") locale = value;
      index += 1;
    }
  }
  const flow = getOnboardingFlow(locale);
  const profile = await getProfile();
  const payload = {
    ok: true,
    flow,
    profile,
    summary: buildProfileSummary(profile),
    missing_critical: missingCriticalFields(profile),
    storage_path: getProfilePath(),
    cross_connector_hint:
      "This profile is shared across the Delx Wellness MCPs (e.g. wellness-nourish, wellness-cycle-coach, wellness-cgm-mcp). One onboarding pass populates context for all of them."
  };
  console.log(JSON.stringify(payload, null, 2));
  if (process.stderr.isTTY) {
    const lines = [
      "",
      `# Polar MCP — Wellness Onboarding (${flow.locale})`,
      "",
      `Storage: ${payload.storage_path}`,
      `Summary: ${payload.summary}`,
      `Missing critical fields: ${payload.missing_critical.length ? payload.missing_critical.join(", ") : "none"}`,
      "",
      `Cross-connector: ${payload.cross_connector_hint}`,
      "",
      "Privacy:",
      `- ${flow.privacy_note}`,
      "",
      "Questions:",
      ...flow.questions.map((q, index) => `  ${index + 1}. [${q.category}${q.required ? "*" : ""}] ${q.prompt}`),
      "",
      "* = required for downstream coaching tools."
    ];
    process.stderr.write(lines.join("\n") + "\n");
  }
  return 0;
}

async function runDoctor(args: string[]): Promise<number> {
  const options = parseDoctorOptions(args);
  const status = await buildConnectionStatus({ client: options.client });
  if (options.json) {
    console.log(JSON.stringify(safeDoctorStatus(status), null, 2));
  } else {
    printDoctor(status);
  }
  return options.strict && !status.ok ? 1 : 0;
}

function parseDoctorOptions(args: string[]) {
  let client: ReturnType<typeof parseAgentClientName> | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--client") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("Missing value for --client.");
      client = parseAgentClientName(value);
      index += 1;
    }
  }
  return {
    json: args.includes("--json"),
    strict: args.includes("--strict"),
    client
  };
}


function safeDoctorStatus(status: Awaited<ReturnType<typeof buildConnectionStatus>>): unknown {
  const raw = status as Record<string, any>;
  const hermes = raw.client_checks?.hermes;
  const safeHermes = hermes ? Object.fromEntries(
    Object.entries(hermes).filter(([key]) => key !== "config_path" && key !== "skill_path")
  ) : undefined;
  return {
    ok: Boolean(raw.ok),
    client: raw.client,
    node: raw.node,
    required_env: raw.required_env,
    missing_env: raw.missing_env,
    automatic_auth_supported: Boolean(raw.automatic_auth_supported),
    privacy_mode: raw.privacy_mode,
    config: raw.config ? {
      exists: Boolean(raw.config.exists),
      source: raw.config.source
    } : undefined,
    token: raw.token ? {
      exists: Boolean(raw.token.exists),
      readable: Boolean(raw.token.readable),
      secure_permissions: raw.token.secure_permissions,
      expired: raw.token.expired,
      has_refresh_token: raw.token.has_refresh_token,
      has_di_token: raw.token.has_di_token
    } : undefined,
    cache: raw.cache ? {
      enabled: Boolean(raw.cache.enabled)
    } : undefined,
    client_checks: safeHermes ? { hermes: safeHermes } : undefined,
    next_steps: raw.next_steps
  };
}

function printDoctor(status: Awaited<ReturnType<typeof buildConnectionStatus>>): void {
  const ok = "ok";
  const fail = "fail";
  const info = "-";
  const check = (passed: boolean) => (passed ? ok : fail);
  const line = (mark: string, label: string, _detail?: string) => {
    const labelCol = label.padEnd(28);
    console.log(`  ${mark}  ${labelCol}`);
  };

  console.log("Polar MCP - Doctor");
  console.log(`Status: ${status.ok ? "READY" : "NEEDS SETUP"}`);
  if (status.client) console.log(`Client: ${status.client}`);
  console.log("");
  console.log("Checks");
  line(check(status.node.supported), "Node.js >=20", status.node.supported ? undefined : `version ${status.node.version}`);
  line(check(status.missing_env.length === 0), "Env vars", status.missing_env.length ? `missing: ${status.missing_env.join(", ")}` : undefined);
  line(check(status.config.exists), "Local config", status.config.exists ? status.config.source : "missing");
  line(check(status.automatic_auth_supported), "Automatic auth redirect", status.automatic_auth_supported ? undefined : "not configured for local callback");
  line(check(status.token.exists), "Token file", status.token.exists ? "present" : "missing");
  if (status.token.exists) {
    line(status.token.secure_permissions === false ? fail : ok, "Token permissions", status.token.secure_permissions === false ? "insecure (chmod 600)" : undefined);
    line(check(Boolean(status.token.has_refresh_token)), "Refresh token", status.token.has_refresh_token ? undefined : "missing");
  }
  const scopesOk = status.oauth.scope_status === "ok" || status.oauth.missing_recommended_scopes.length === 0;
  line(scopesOk ? ok : fail, "OAuth scopes");
  line(info, "Privacy mode", status.privacy_mode);
  line(status.cache.enabled ? ok : info, "Cache", status.cache.enabled ? "enabled" : "disabled");
  if (status.client_checks?.hermes) {
    const hermes = status.client_checks.hermes;
    console.log("");
    console.log("Hermes");
    line(info, "config path", hermes.config_path ? "configured" : "missing");
    line(check(hermes.polar_server_configured), "configured");
    line(check(hermes.package_pinned), "pinned package");
    line(check(hermes.skill_installed), "skill", hermes.skill_installed ? "installed" : "missing");
    line(info, "direct tool prefix", hermes.direct_tool_prefix);
  }
  console.log("");
  console.log("Next steps");
  status.next_steps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
  if (status.client_checks?.hermes?.recommendations.length) {
    console.log("");
    console.log("Hermes recommendations");
    status.client_checks.hermes.recommendations.forEach((step, index) => console.log(`  ${index + 1}. ${step}`));
  }
}

function printHelp(): void {
  console.log(`Polar MCP Server

Usage:
  polar-mcp-server                 Start MCP stdio server
  polar-mcp-server --http          Start local HTTP MCP server
  polar-mcp-server setup           Guided setup, local config, and MCP client config
  polar-mcp-server doctor          Check setup and next steps
  polar-mcp-server doctor --json   Print setup status as JSON
  polar-mcp-server doctor --client hermes
  polar-mcp-server auth            Authorize Polar with local browser callback
  polar-mcp-server auth --no-open  Print auth URL without opening browser
  polar-mcp-server onboarding      Print the shared wellness onboarding flow (JSON to stdout)
  polar-mcp-server onboarding --locale pt-BR

Required env:
  POLAR_CLIENT_ID
  POLAR_CLIENT_SECRET
  POLAR_REDIRECT_URI=http://127.0.0.1:3000/callback
`);
}
