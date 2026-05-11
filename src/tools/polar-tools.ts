import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AgentManifestInputSchema,
  AgentManifestOutputSchema,
  AuthUrlInputSchema,
  AuthUrlOutputSchema,
  CacheStatusOutputSchema,
  CapabilitiesOutputSchema,
  CollectionInputSchema,
  CollectionOutputSchema,
  ConnectionStatusInputSchema,
  ConnectionStatusOutputSchema,
  DailySummaryInputSchema,
  DataInventoryOutputSchema,
  EndpointDataOutputSchema,
  ExchangeCodeInputSchema,
  ExchangeCodeOutputSchema,
  PrivacyAuditOutputSchema,
  ResponseOnlyInputSchema,
  RevokeAccessOutputSchema,
  RouteInputSchema,
  SimpleReadInputSchema,
  SummaryOutputSchema,
  WeeklySummaryInputSchema,
  WellnessContextInputSchema,
  WellnessContextOutputSchema
} from "../schemas/common.js";
import { buildAgentManifest, formatAgentManifestMarkdown } from "../services/agent-manifest.js";
import { buildPrivacyAudit } from "../services/audit.js";
import { buildCapabilities } from "../services/capabilities.js";
import { buildDataInventory, formatInventoryMarkdown } from "../services/inventory.js";
import { buildConnectionStatus } from "../services/connection-status.js";
import { getConfig } from "../services/config.js";
import { bulletList, formatCollection, makeError, makeResponse } from "../services/format.js";
import { applyPrivacy, resolvePrivacyMode } from "../services/privacy.js";
import { buildDailySummary, buildWeeklySummary, formatSummaryMarkdown } from "../services/summary.js";
import { buildWellnessContext, formatWellnessContextMarkdown } from "../services/context.js";
import { PolarClient } from "../services/polar-client.js";

function client(): PolarClient {
  return new PolarClient(getConfig());
}

type DateParamStyle = "from_to" | "fromDate_toDate" | "none";

function registerCollectionTool(server: McpServer, name: string, title: string, endpoint: string, description: string, dateParamStyle: DateParamStyle = "from_to"): void {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: CollectionInputSchema.shape,
      outputSchema: CollectionOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async (params) => {
      try {
        const config = getConfig();
        const privacyMode = resolvePrivacyMode(config, params.privacy_mode);
        const result = await new PolarClient(config).list(endpoint, { ...params, date_param_style: dateParamStyle });
        const records = applyPrivacy(endpoint, { records: result.records }, privacyMode) as { records: unknown[] };
        const output = {
          endpoint,
          privacy_mode: privacyMode,
          count: records.records.length,
          records: records.records,
          next_page: result.next_page,
          has_more: Boolean(result.next_page),
          pages_fetched: result.pages_fetched
        };
        return makeResponse(output, params.response_format, formatCollection(title, records.records, output));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );
}

function registerReadTool(server: McpServer, name: string, title: string, endpoint: string, description: string): void {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: SimpleReadInputSchema.shape,
      outputSchema: EndpointDataOutputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
    },
    async ({ response_format, privacy_mode }) => {
      try {
        const config = getConfig();
        const privacyMode = resolvePrivacyMode(config, privacy_mode);
        const data = applyPrivacy(endpoint, await new PolarClient(config).get(endpoint), privacyMode);
        return makeResponse({ endpoint, privacy_mode: privacyMode, data }, response_format, bulletList(title, data as Record<string, unknown>));
      } catch (error) {
        return makeError((error as Error).message);
      }
    }
  );
}

export function registerPolarTools(server: McpServer): void {
  server.registerTool("polar_data_inventory", {
    title: "Polar Data Inventory",
    description: "Inventory supported Polar data domains, auth scope requirements, privacy boundary and recommended first calls. Does not call Polar APIs or expose user data.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: DataInventoryOutputSchema.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  }, async ({ response_format }) => {
    const inventory = buildDataInventory();
    return makeResponse(inventory, response_format, formatInventoryMarkdown(inventory));
  });
  server.registerTool("polar_agent_manifest", {
    title: "Polar Agent Manifest",
    description: "Machine-readable install, runtime and client guidance for AI agents. Does not call Polar or expose secrets.",
    inputSchema: AgentManifestInputSchema.shape,
    outputSchema: AgentManifestOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ client: targetClient, response_format }) => {
    const manifest = buildAgentManifest(targetClient);
    return makeResponse(manifest, response_format, formatAgentManifestMarkdown(manifest));
  });

  server.registerTool("polar_capabilities", {
    title: "Polar MCP Capabilities",
    description: "Explain supported Polar data, privacy boundaries, recommended agent workflow and project links.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: CapabilitiesOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    const capabilities = buildCapabilities();
    return makeResponse(capabilities, response_format, bulletList("Polar MCP Capabilities", {
      project: capabilities.project,
      unofficial: capabilities.unofficial,
      api_boundary: capabilities.api_boundary.source,
      recommended_first_tools: "polar_connection_status, polar_daily_summary, polar_weekly_summary",
      docs: capabilities.links.docs
    }));
  });

  server.registerTool(
    "polar_quickstart",
    {
      title: "Polar Quickstart",
      description:
        "Personalized 3-step setup walkthrough for the human user. Adapts to current state (env vars set? token present? what's next?). Call this first when the user asks 'how do I connect Polar?'",
      inputSchema: ResponseOnlyInputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ response_format }) => {
      const status = await buildConnectionStatus();
      const hasEnv = status.missing_env.length === 0;
      const hasToken = status.ready_for_polar_api;
      const steps = [
        {
          step: 1,
          title: hasEnv ? "(done) Polar AccessLink credentials configured" : "Sign up at https://admin.polaraccesslink.com",
          action: hasEnv
            ? "POLAR_CLIENT_ID, POLAR_CLIENT_SECRET, POLAR_REDIRECT_URI are all set."
            : `Create a Polar AccessLink app, register a redirect URI (use ${status.redirect_uri ?? "http://127.0.0.1:3000/callback"}), then set: ${status.missing_env.join(", ")}.`,
          done: hasEnv,
        },
        {
          step: 2,
          title: hasToken ? "(done) Local token present — ready to read Polar data" : "Run the OAuth dance",
          action: hasToken
            ? "Tokens stored under ~/.polar-mcp/tokens.json. The connector will refresh automatically when needed."
            : "Run `polar-mcp-server auth` (or call polar_get_auth_url + polar_exchange_code from the agent). Open the URL, grant access, paste the code.",
          done: hasToken,
        },
        {
          step: 3,
          title: "Verify with the agent",
          action: "Call polar_connection_status, then polar_daily_summary or polar_wellness_context. Pair with wellness-nourish for recovery-aware meal coaching.",
          example: hasToken
            ? "polar_wellness_context() → Nightly Recharge ANS + sleep + training load handoff for nourish/cycle-coach."
            : "Until step 2 is done, the data tools will surface a clear 'auth required' message.",
          done: false,
        },
      ];
      const payload = {
        ok: true,
        ready: hasEnv && hasToken,
        steps,
        next: steps.find((s) => !s.done) ?? steps[steps.length - 1],
        cross_connector_hints: [
          "Pair Polar Nightly Recharge with wellness-nourish for recovery-aware meal coaching.",
          "Pair Polar sleep + training load with wellness-cycle-coach for late-luteal load adjustments.",
          "Pair Polar Nightly Recharge ANS + wellness-cgm-mcp glucose for metabolic-stress signals.",
        ],
      };
      const markdown = bulletList("Polar Quickstart", {
        ready: payload.ready,
        next: payload.next.title,
      });
      return makeResponse(payload, response_format, markdown);
    }
  );

  server.registerTool(
    "polar_demo",
    {
      title: "Polar Demo",
      description:
        "Returns realistic example payloads of polar_daily_summary, polar_wellness_context, and polar_list_nightly_recharge so agents see the contract before calling real Polar APIs.",
      inputSchema: ResponseOnlyInputSchema.shape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ response_format }) => {
      const today = new Date().toISOString().slice(0, 10);
      const payload = {
        ok: true,
        is_demo: true,
        sample: {
          polar_daily_summary: {
            date: today,
            nightly_recharge: { ans_charge_status: 1.2, beat_to_beat_avg_score: 78, hrv_avg: 64, breathing_rate_avg: 14.1 },
            sleep: { sleep_score: 82, total_sleep_min: 451, sleep_efficiency: 0.92, deep_min: 88, rem_min: 102, light_min: 261 },
            training: { sessions: 1, training_load_pro: 142, cardio_load: 96, perceived_load: "moderate" },
            activity: { active_calories: 612, steps: 9_854, active_minutes: 78 },
          },
          polar_wellness_context: {
            window: "last_24h",
            ans_charge_status: 1.2,
            ans_band: "good",
            sleep_score: 82,
            training_load_pro: 142,
            recommendation: "Good ANS recovery + adequate sleep — green light for moderate intensity. Consider easy zone-2 work tomorrow if training_load_pro keeps climbing.",
          },
          polar_list_nightly_recharge: {
            count: 3,
            records: [
              { date: today, ans_charge_status: 1.2, beat_to_beat_avg_score: 78, hrv_avg: 64 },
              { date: yesterdayISO(), ans_charge_status: 0.4, beat_to_beat_avg_score: 71, hrv_avg: 58 },
              { date: dayBeforeISO(), ans_charge_status: -0.6, beat_to_beat_avg_score: 62, hrv_avg: 49 },
            ],
          },
        },
        notes: [
          "All sample data is synthetic; tagged with is_demo=true.",
          "Real calls return live data from the Polar AccessLink v4 API after OAuth setup.",
        ],
      };
      const markdown = bulletList("Polar Demo", {
        is_demo: true,
        ans_charge_status: 1.2,
        sleep_score: 82,
        recommendation: payload.sample.polar_wellness_context.recommendation,
      });
      return makeResponse(payload, response_format, markdown);
    }
  );

  server.registerTool("polar_get_auth_url", {
    title: "Get Polar OAuth URL",
    description: "Generate a Polar OAuth authorization URL. Use this first when no local token exists.",
    inputSchema: AuthUrlInputSchema.shape,
    outputSchema: AuthUrlOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async (params) => {
    try {
      const config = getConfig();
      const url = new PolarClient(config).authUrl(params.state, params.scopes);
      const output = { auth_url: url, redirect_uri: config.redirectUri, scopes: params.scopes?.length ? params.scopes : config.scopes, next_step: "Open auth_url, approve access, then pass the returned code or full redirect URL to polar_exchange_code." };
      return makeResponse(output, params.response_format, bulletList("Polar OAuth URL", output));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("polar_exchange_code", {
    title: "Exchange Polar OAuth Code",
    description: "Exchange a Polar OAuth authorization code for local tokens. Tokens are stored locally with 0600 permissions and are never returned.",
    inputSchema: ExchangeCodeInputSchema.shape,
    outputSchema: ExchangeCodeOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
  }, async (params) => {
    try {
      const result = await client().exchangeCode(params.code);
      const output = { ...result, note: "Token values were stored locally and intentionally omitted from this response." };
      return makeResponse(output, params.response_format, bulletList("Polar OAuth Exchange", output));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  registerReadTool(server, "polar_get_account_data", "Polar Account Data", "/user/account-data", "Read Polar user account fields exposed by AccessLink. Requires profile:read.");

  registerCollectionTool(server, "polar_list_activity", "Polar Daily Activity", "/activity/list", "List Polar daily activity records. Requires activity:read.", "none");
  registerCollectionTool(server, "polar_list_calendar", "Polar Calendar", "/calendar/list", "List Polar calendar entries in a date range. Requires calendar:read.");
  registerCollectionTool(server, "polar_list_continuous_samples", "Polar Continuous Samples", "/continuous-samples", "List continuous sample records for a date range. Requires continuous_samples:read. Not medical advice.");
  registerCollectionTool(server, "polar_list_nightly_recharge", "Polar Nightly Recharge", "/nightly-recharge-results", "List Nightly Recharge results in a date range. Requires nightly_recharge:read. Not medical advice.");
  registerCollectionTool(server, "polar_list_ppi_samples", "Polar PPI Samples", "/ppi-samples", "List pulse-to-pulse interval samples in a date range. Requires ppi_data:read.");
  registerCollectionTool(server, "polar_list_skin_contacts", "Polar Skin Contacts", "/skin-contacts", "List skin contact periods in a date range. Requires skin_contact:read.");
  registerCollectionTool(server, "polar_list_sleeps", "Polar Sleeps", "/sleeps", "List Polar sleep records in a date range. Requires sleep:read. Not medical advice.");
  registerCollectionTool(server, "polar_list_sleep_wake_vectors", "Polar Sleep Wake Vectors", "/sleep-wake-vectors", "List sleep/wake vector records in a date range. Requires sleep:read. Not medical advice.");
  registerCollectionTool(server, "polar_list_sports", "Polar Sports", "/sports/list", "List sports available in the Polar ecosystem. Requires sports:read.", "none");
  registerCollectionTool(server, "polar_list_sport_profile_catalog", "Polar Sport Profile Catalog", "/sports/profile-list-catalog", "Load Polar sport profile catalog. Requires sports:read.", "none");
  registerCollectionTool(server, "polar_list_sport_profiles", "Polar Sport Profiles", "/sports/profiles", "List the user's Polar sport profiles. Requires sports:read.", "none");
  registerCollectionTool(server, "polar_list_subscriptions", "Polar Subscriptions", "/subscriptions", "List user subscriptions and entitlements. Requires user_subscription:read.", "none");
  registerCollectionTool(server, "polar_list_temperature_measurements", "Polar Temperature Measurements", "/temperature-measurements", "List temperature measurements in a date range. Requires temperature_measurement:read.");
  registerCollectionTool(server, "polar_list_tests", "Polar Test Results", "/tests/list", "List Polar fitness/orthostatic/running test results in a date range. Requires tests:read.");
  registerCollectionTool(server, "polar_list_training_sessions", "Polar Training Sessions", "/training-sessions/list", "List Polar training sessions in a date range. Requires training_sessions:read.");
  registerCollectionTool(server, "polar_list_training_targets", "Polar Training Targets", "/training-target/calendar-targets", "List calendar training targets in a date range. Requires training_targets:read.", "fromDate_toDate");
  registerCollectionTool(server, "polar_list_training_target_favorites", "Polar Training Target Favorites", "/training-target/favorites", "List user training target favorites. Requires training_targets:read.", "none");
  registerCollectionTool(server, "polar_list_user_devices", "Polar User Devices", "/user-devices", "List devices registered to the Polar user. Requires devices:read.", "none");

  server.registerTool("polar_get_route", {
    title: "Polar Route",
    description: "Load a Polar route by route id. Routes are GPS-sensitive; default privacy modes redact coordinates. Requires routes:read.",
    inputSchema: RouteInputSchema.shape,
    outputSchema: EndpointDataOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async ({ route_id, response_format, privacy_mode }) => {
    try {
      const config = getConfig();
      const endpoint = `/routes/${encodeURIComponent(route_id)}`;
      const privacyMode = resolvePrivacyMode(config, privacy_mode);
      const data = applyPrivacy(endpoint, await new PolarClient(config).get(endpoint), privacyMode);
      return makeResponse({ endpoint, privacy_mode: privacyMode, data }, response_format, bulletList("Polar Route", data as Record<string, unknown>));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("polar_connection_status", {
    title: "Polar Connection Status",
    description: "Check local Polar config, token file, Node version, privacy mode, cache readiness and optional MCP client readiness without calling Polar or exposing secrets.",
    inputSchema: ConnectionStatusInputSchema.shape,
    outputSchema: ConnectionStatusOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format, client: targetClient }) => {
    const status = await buildConnectionStatus({ client: targetClient });
    return makeResponse(status, response_format, bulletList("Polar Connection Status", {
      ok: status.ok,
      ready_for_polar_api: status.ready_for_polar_api,
      missing_env: status.missing_env.join(", ") || "none",
      scope_status: status.oauth.scope_status,
      token_path: status.token.path,
      token_exists: status.token.exists,
      privacy_mode: status.privacy_mode,
      next_steps: status.next_steps.join(" | ")
    }));
  });

  server.registerTool("polar_cache_status", {
    title: "Polar Cache Status",
    description: "Show optional local SQLite cache status. Enable with POLAR_CACHE=sqlite or POLAR_CACHE=true.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: CacheStatusOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    try {
      const status = client().cacheStatus();
      return makeResponse(status, response_format, bulletList("Polar Cache Status", status));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("polar_privacy_audit", {
    title: "Polar Privacy Audit",
    description: "Return local privacy, cache, token-path and env-presence posture without revealing secret values.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: PrivacyAuditOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }, async ({ response_format }) => {
    const audit = buildPrivacyAudit();
    return makeResponse(audit, response_format, bulletList("Polar Privacy Audit", audit));
  });

  server.registerTool("polar_revoke_access", {
    title: "Revoke Polar OAuth Access",
    description: "Delete the local Polar token file. Use only when the user explicitly wants to disconnect this MCP; revoke the remote grant from Polar if needed.",
    inputSchema: ResponseOnlyInputSchema.shape,
    outputSchema: RevokeAccessOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }
  }, async ({ response_format }) => {
    try {
      const result = await client().revokeAccess();
      const output = { ...result, note: "Local Polar tokens were removed. Re-authorize before future API calls; revoke the remote grant in Polar AccessLink/Flow if you also want server-side revocation." };
      return makeResponse(output, response_format, bulletList("Polar Tokens Removed", output));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("polar_daily_summary", {
    title: "Polar Daily Training Summary",
    description: "Build a practical daily summary from Polar sleep, activity, Nightly Recharge and training data when available. Read-only and non-medical.",
    inputSchema: DailySummaryInputSchema.shape,
    outputSchema: SummaryOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const summary = await buildDailySummary(client(), params);
      return makeResponse(summary, params.response_format, formatSummaryMarkdown(summary));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("polar_weekly_summary", {
    title: "Polar Weekly Training Review",
    description: "Build a weekly Polar scorecard with sleep, activity, Nightly Recharge, training load context, bottlenecks and actions. Read-only and non-medical.",
    inputSchema: WeeklySummaryInputSchema.shape,
    outputSchema: SummaryOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const summary = await buildWeeklySummary(client(), params);
      return makeResponse(summary, params.response_format, formatSummaryMarkdown(summary));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });

  server.registerTool("polar_wellness_context", {
    title: "Polar Wellness Context",
    description: "Normalize Polar Nightly Recharge, sleep and training load into the shared wellness_context shape for recommendation engines.",
    inputSchema: WellnessContextInputSchema.shape,
    outputSchema: WellnessContextOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }, async (params) => {
    try {
      const context = await buildWellnessContext(client(), params);
      return makeResponse(context, params.response_format, formatWellnessContextMarkdown(context));
    } catch (error) {
      return makeError((error as Error).message);
    }
  });
}

function yesterdayISO(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

function dayBeforeISO(): string {
  return new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
}
