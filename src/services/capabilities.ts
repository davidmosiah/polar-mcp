import { DEFAULT_SCOPES, POLAR_DOCS_URL } from "../constants.js";

export function buildCapabilities() {
  return {
    project: "polar-mcp-unofficial",
    mcp_name: "io.github.davidmosiah/polarmcp",
    creator: { name: "David Mosiah", github: "https://github.com/davidmosiah" },
    unofficial: true,
    api_boundary: {
      source: "Official Polar AccessLink Dynamic API v4 with OAuth 2.0",
      raw_definition: "Raw means the full JSON response returned by supported Polar AccessLink Dynamic API v4 endpoints.",
      does_not_include: [
        "private Polar Flow mobile app endpoints",
        "write/upload/delete actions",
        "medical diagnosis or treatment guidance",
        "server-side token hosting",
        "background data sync outside explicit MCP calls"
      ]
    },
    auth_model: {
      type: "OAuth 2.0 authorization code with refresh tokens",
      token_storage: "Local token file with user-only permissions",
      recommended_redirect_uri: "http://127.0.0.1:3000/callback",
      default_scopes: DEFAULT_SCOPES
    },
    privacy_modes: [
      { mode: "summary", use_when: "Default-safe interpretation with identifiers, account details and GPS minimized." },
      { mode: "structured", use_when: "Normalized activity, sleep, Nightly Recharge, training, sample and device fields for agents." },
      { mode: "raw", use_when: "The user explicitly needs upstream Polar payloads for debugging or deep analysis." }
    ],
    supported_data: [
      { name: "Account and devices", examples: ["account metadata", "registered devices"], tools: ["polar_get_account_data", "polar_list_user_devices"] },
      { name: "Activity and calendar", examples: ["daily activity", "calendar entries", "training targets"], tools: ["polar_list_activity", "polar_list_calendar", "polar_list_training_targets"] },
      { name: "Sleep and recovery", examples: ["sleeps", "sleep/wake vectors", "Nightly Recharge"], tools: ["polar_list_sleeps", "polar_list_sleep_wake_vectors", "polar_list_nightly_recharge"] },
      { name: "Training", examples: ["training sessions", "routes", "sports", "sport profiles"], tools: ["polar_list_training_sessions", "polar_get_route", "polar_list_sports", "polar_list_sport_profiles"] },
      { name: "Samples and tests", examples: ["continuous samples", "PPI samples", "temperature measurements", "test results", "skin contacts"], tools: ["polar_list_continuous_samples", "polar_list_ppi_samples", "polar_list_temperature_measurements", "polar_list_tests", "polar_list_skin_contacts"] }
    ],
    recommended_agent_flow: [
      "Call polar_agent_manifest when installing or operating inside a server agent such as Hermes.",
      "Call polar_connection_status before calling Polar data tools.",
      "If setup is incomplete, guide the user through setup, auth and doctor.",
      "Use polar_daily_summary or polar_weekly_summary before low-level endpoint tools.",
      "Use polar_wellness_context when handing recharge/sleep/training context to Exercise Catalog.",
      "Treat health and route data as sensitive; avoid raw payloads unless explicitly requested.",
      "Use Polar as trend context, not medical diagnosis. Escalate symptoms or abnormal vitals to clinicians."
    ],
    client_aliases: {
      hermes: {
        tool_prefix: "mcp_polar_",
        direct_tools: ["mcp_polar_polar_agent_manifest", "mcp_polar_polar_connection_status", "mcp_polar_polar_daily_summary", "mcp_polar_polar_weekly_summary"],
        reload_command: "/reload-mcp",
        gateway_restart_required_for_data_access: false
      }
    },
    contribution_paths: [
      "Improve non-technical setup UX.",
      "Add more MCP client examples and screenshots.",
      "Track Polar AccessLink Dynamic API v4 changes and add new read endpoints.",
      "Add evaluations for realistic health and training questions.",
      "Keep write actions out of scope unless explicit opt-in and safety gates are added."
    ],
    links: {
      github: "https://github.com/davidmosiah/polarmcp",
      docs: "https://polarmcp.vercel.app/",
      npm: "https://www.npmjs.com/package/polar-mcp-unofficial",
      polar_api_docs: POLAR_DOCS_URL,
      polar_apps: "https://admin.polaraccesslink.com"
    }
  };
}
