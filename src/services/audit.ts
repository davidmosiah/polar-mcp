import { homedir } from "node:os";
import { join } from "node:path";
import { SERVER_NAME } from "../constants.js";
import type { PrivacyMode } from "../types.js";
import { loadConfigSources } from "./local-config.js";
import { REDACTED_KEY_PATTERNS } from "./redaction.js";

function parsePrivacyMode(value: string | undefined): PrivacyMode {
  if (value === "summary" || value === "structured" || value === "raw") return value;
  return "structured";
}

export function buildPrivacyAudit(): Record<string, unknown> {
  const requiredEnv = ["POLAR_CLIENT_ID", "POLAR_CLIENT_SECRET", "POLAR_REDIRECT_URI"];
  const sources = loadConfigSources();
  const value = (name: keyof typeof sources.values) => sources.values[name];
  return {
    project: SERVER_NAME,
    unofficial: true,
    config_source: sources.source,
    local_config_path: sources.local.path,
    local_config_exists: sources.local.exists,
    local_config_secure_permissions: sources.local.secure_permissions,
    privacy_mode_default: parsePrivacyMode(value("POLAR_PRIVACY_MODE")),
    raw_payloads_opt_in: true,
    gps_redaction_default: true,
    cache_enabled: false,
    cache_path: value("POLAR_CACHE_PATH") ?? join(homedir(), ".polar-mcp", "cache.sqlite"),
    token_path: value("POLAR_TOKEN_PATH") ?? join(homedir(), ".polar-mcp", "tokens.json"),
    stdout_safe: true,
    secret_env_vars: ["POLAR_CLIENT_SECRET"],
    required_env_present: Object.fromEntries(requiredEnv.map((name) => [name, Boolean(value(name as keyof typeof sources.values))])),
    redacted_key_patterns: REDACTED_KEY_PATTERNS,
    notes: [
      "Authenticated Polar responses are never cached; POLAR_CACHE is accepted but has no effect.",
      "This is an unofficial Polar integration.",
      "OAuth tokens are stored locally and are not returned by tools.",
      "Raw Polar payloads require POLAR_PRIVACY_MODE=raw or privacy_mode=raw.",
      "Sensitive profile and token fields are removed or minimized unless raw mode is explicitly requested.",
      "stdio transport logs to stderr to avoid corrupting JSON-RPC."
    ]
  };
}
