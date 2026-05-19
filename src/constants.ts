export const SERVER_NAME = "polar-mcp-server";
export const SERVER_VERSION = "0.3.2";
export const NPM_PACKAGE_NAME = "polar-mcp-unofficial";
export const PINNED_NPM_PACKAGE = `${NPM_PACKAGE_NAME}@${SERVER_VERSION}`;

export const POLAR_API_BASE_URL = "https://www.polaraccesslink.com/v4/data";
export const POLAR_AUTH_URL = "https://auth.polar.com/oauth/authorize";
export const POLAR_TOKEN_URL = "https://auth.polar.com/oauth/token";
export const POLAR_DEVELOPER_PORTAL_URL = "https://admin.polaraccesslink.com";
export const POLAR_DOCS_URL = "https://www.polar.com/polar-api-v4/";

export const DEFAULT_SCOPES = [
  "activity:read",
  "calendar:read",
  "continuous_samples:read",
  "devices:read",
  "nightly_recharge:read",
  "ppi_data:read",
  "profile:read",
  "routes:read",
  "skin_contact:read",
  "sleep:read",
  "sports:read",
  "temperature_measurement:read",
  "tests:read",
  "training_sessions:read",
  "training_targets:read",
  "user_subscription:read"
];

export const DEFAULT_LIMIT = 30;
export const MAX_POLAR_LIMIT = 100;
export const DEFAULT_MAX_PAGES = 1;
export const MAX_PAGES = 10;
