import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { buildAgentManifest, formatAgentManifestMarkdown } from "../services/agent-manifest.js";
import { buildCapabilities } from "../services/capabilities.js";
import { buildDataInventory } from "../services/inventory.js";
import { getConfig } from "../services/config.js";
import { applyPrivacy, resolvePrivacyMode } from "../services/privacy.js";
import { buildDailySummary, buildWeeklySummary, formatSummaryMarkdown } from "../services/summary.js";
import { PolarClient } from "../services/polar-client.js";

function textResource(uri: URL, text: string, mimeType = "text/markdown"): ReadResourceResult {
  return { contents: [{ uri: uri.toString(), mimeType, text }] };
}

async function profileResource(uri: URL) {
  const config = getConfig();
  const endpoint = "/user/account-data";
  const data = applyPrivacy(endpoint, await new PolarClient(config).get(endpoint), resolvePrivacyMode(config));
  return textResource(uri, JSON.stringify({ endpoint, data }, null, 2), "application/json");
}

async function latestActivityResource(uri: URL) {
  const config = getConfig();
  const endpoint = "/sleeps";
  const today = new Date().toISOString().slice(0, 10);
  const result = await new PolarClient(config).list(endpoint, { limit: 1, after: `${today}T00:00:00Z`, before: `${today}T23:59:59Z` });
  const data = applyPrivacy(endpoint, { records: result.records }, resolvePrivacyMode(config));
  return textResource(uri, JSON.stringify(data, null, 2), "application/json");
}

async function dailySummaryResource(uri: URL) {
  const summary = await buildDailySummary(new PolarClient(getConfig()), { days: 7, timezone: "UTC" });
  return textResource(uri, formatSummaryMarkdown(summary));
}

async function weeklySummaryResource(uri: URL) {
  const summary = await buildWeeklySummary(new PolarClient(getConfig()), { days: 7, compare_days: 7, timezone: "UTC" });
  return textResource(uri, formatSummaryMarkdown(summary));
}

export function registerPolarResources(server: McpServer): void {
  server.registerResource("polar_data_inventory", "polar://inventory", { title: "Polar Data Inventory", description: "Static inventory of supported Polar data domains, privacy modes and recommended first calls.", mimeType: "application/json" }, async (uri) => textResource(uri, JSON.stringify(buildDataInventory(), null, 2), "application/json"));
  server.registerResource("polar_capabilities", "polar://capabilities", { title: "Polar MCP Capabilities", description: "Static capabilities, API boundary, privacy modes and recommended agent workflow.", mimeType: "application/json" }, async (uri) => textResource(uri, JSON.stringify(buildCapabilities(), null, 2), "application/json"));
  server.registerResource("polar_agent_manifest", "polar://agent-manifest", { title: "Polar Agent Manifest", description: "Machine-readable install and operating instructions for AI agents.", mimeType: "text/markdown" }, async (uri) => textResource(uri, formatAgentManifestMarkdown(buildAgentManifest("generic"))));
  server.registerResource("polar_account_data", "polar://account-data", { title: "Polar Account Data", description: "Authenticated Polar account data using the configured privacy mode.", mimeType: "application/json" }, profileResource);
  server.registerResource("polar_latest_sleep", "polar://latest/sleep", { title: "Latest Polar Sleep", description: "Most recent Polar sleep record in the configured privacy mode.", mimeType: "application/json" }, latestActivityResource);
  server.registerResource("polar_daily_summary", "polar://summary/daily", { title: "Polar Daily Summary", description: "Daily Polar health summary built from API data.", mimeType: "text/markdown" }, dailySummaryResource);
  server.registerResource("polar_weekly_summary", "polar://summary/weekly", { title: "Polar Weekly Summary", description: "Weekly Polar health review built from API data.", mimeType: "text/markdown" }, weeklySummaryResource);
}
