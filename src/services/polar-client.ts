import { URL, URLSearchParams } from "node:url";
import { DEFAULT_LIMIT, POLAR_API_BASE_URL, POLAR_AUTH_URL, POLAR_TOKEN_URL, MAX_POLAR_LIMIT, SERVER_VERSION } from "../constants.js";
import type { PolarConfig, PolarTokenSet } from "../types.js";
import { disabledCacheStatus, PolarCache, type CacheStatus } from "./cache.js";
import { fetchWithCache, getCacheStats } from "./http-cache.js";
import { fetchWithRetry as fetchWithRetryMiddleware } from "./http-retry.js";
import { redactErrorMessage } from "./redaction.js";
import { TokenStore } from "./token-store.js";

export interface ListParams {
  after?: string;
  before?: string;
  page?: number;
  limit?: number;
  all_pages?: boolean;
  max_pages?: number;
  date_param_style?: "from_to" | "fromDate_toDate" | "none";
}

export class PolarClient {
  private readonly tokenStore: TokenStore;
  private cache?: PolarCache;

  constructor(private readonly config: PolarConfig) {
    this.tokenStore = new TokenStore(config.tokenPath);
  }

  authUrl(state?: string, scopes?: string[]): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code"
    });
    const requestedScopes = scopes?.length ? scopes : this.config.scopes;
    if (requestedScopes.length) params.set("scope", requestedScopes.join(" "));
    if (state) params.set("state", state);
    return `${POLAR_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(input: string): Promise<{ ok: true; token_path: string; scope?: string; expires_at?: number }> {
    const code = this.extractCode(input);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.config.redirectUri
    });
    const tokens = await this.requestTokens(body);
    const redirectScope = this.extractScope(input);
    await this.tokenStore.withLock(async () => this.tokenStore.write({ ...tokens, scope: tokens.scope ?? redirectScope }));
    return { ok: true, token_path: this.config.tokenPath, scope: tokens.scope ?? redirectScope, expires_at: tokens.expires_at };
  }

  async get(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    return this.request("GET", path, undefined, params);
  }

  async post(path: string, body?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    return this.request("POST", path, body);
  }

  async revokeAccess(): Promise<{ ok: true; token_path: string; local_tokens_cleared: boolean }> {
    await this.tokenStore.withLock(async () => this.tokenStore.clear());
    return { ok: true, token_path: this.config.tokenPath, local_tokens_cleared: true };
  }

  cacheStatus(): CacheStatus {
    const httpStats = getCacheStats();
    const http_cache = {
      size: httpStats.size,
      hit_count: httpStats.hit_count,
      miss_count: httpStats.miss_count,
      hit_rate: httpStats.hit_rate,
      default_ttl_seconds: 60,
      bypass_env_var: "POLAR_NO_CACHE"
    };
    if (!this.config.cacheEnabled) return { ...disabledCacheStatus(this.config.cachePath), http_cache };
    return { ...this.getCache().status(), http_cache };
  }

  async list(path: string, params: ListParams = {}): Promise<{ records: unknown[]; next_page?: number; pages_fetched: number }> {
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_POLAR_LIMIT);
    const maxPages = params.all_pages ? Math.max(1, params.max_pages ?? 1) : 1;
    const records: unknown[] = [];
    let nextToken: string | undefined;
    let pages = 0;

    while (pages < maxPages) {
      const payload = await this.get(path, {
        ...polarDateRange(params, params.date_param_style ?? "from_to"),
        next_token: nextToken
      });
      const pageRecords = extractRecords(payload);
      const maxRecords = Math.max(1, limit * maxPages);
      records.push(...pageRecords.slice(0, Math.max(0, maxRecords - records.length)));
      pages += 1;
      nextToken = extractNextToken(payload);
      if (!params.all_pages || !nextToken || records.length >= maxRecords) break;
    }

    return { records, next_page: nextToken ? (params.page ?? 1) + pages : undefined, pages_fetched: pages };
  }

  private extractCode(input: string): string {
    try {
      const url = new URL(input);
      const code = url.searchParams.get("code");
      if (code) return code;
    } catch {
      // Not a URL; treat as raw code.
    }
    return input;
  }

  private extractScope(input: string): string | undefined {
    try {
      const url = new URL(input);
      return url.searchParams.get("scope") ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async request(method: "GET" | "POST", path: string, body?: Record<string, string | number | boolean | undefined>, params?: Record<string, string | number | boolean | undefined>): Promise<unknown> {
    const token = await this.getValidToken();
    const url = this.buildUrl(path, params);
    const response = await this.fetchWithRetry(url, {
      method,
      headers: this.jsonHeaders(token.access_token),
      body: body ? JSON.stringify(cleanParams(body)) : undefined
    });

    if (response.status === 401) {
      const refreshed = await this.refreshToken(true);
      const retry = await this.fetchWithRetry(url, {
        method,
        headers: this.jsonHeaders(refreshed.access_token),
        body: body ? JSON.stringify(cleanParams(body)) : undefined
      });
      return this.parseAndCache(method, url, retry);
    }

    return this.parseAndCache(method, url, response);
  }

  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${POLAR_API_BASE_URL}${cleanPath}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async getValidToken(): Promise<PolarTokenSet> {
    const tokens = await this.tokenStore.read();
    if (!tokens?.access_token) {
      throw new Error("Polar token not found. Run polar-mcp-server auth, or use polar_get_auth_url then polar_exchange_code.");
    }
    const expiresAt = tokens.expires_at ?? 0;
    const shouldRefresh = Boolean(tokens.refresh_token && expiresAt && expiresAt - Math.floor(Date.now() / 1000) < 3600);
    return shouldRefresh ? this.refreshToken(false) : tokens;
  }

  private async refreshToken(force: boolean): Promise<PolarTokenSet> {
    return this.tokenStore.withLock(async () => {
      const current = await this.tokenStore.read();
      if (!current?.refresh_token) {
        throw new Error("Polar refresh token not found. Re-authorize with polar-mcp-server auth.");
      }
      if (!force && current.expires_at && current.expires_at - Math.floor(Date.now() / 1000) >= 3600) return current;

      const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: current.refresh_token });
      const refreshed = await this.requestTokens(body);
      await this.tokenStore.write({ ...current, ...refreshed });
      return { ...current, ...refreshed };
    });
  }

  private async requestTokens(body: URLSearchParams): Promise<PolarTokenSet> {
    const response = await this.fetchWithRetry(POLAR_TOKEN_URL, {
      method: "POST",
      headers: this.formHeaders(),
      body: body.toString()
    });
    const data = await this.parseResponse(response) as Record<string, unknown>;
    const expiresAt = typeof data.expires_at === "number"
      ? data.expires_at
      : typeof data.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + data.expires_in
        : undefined;
    return {
      access_token: String(data.access_token ?? ""),
      refresh_token: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
      token_type: typeof data.token_type === "string" ? data.token_type : undefined,
      scope: typeof data.scope === "string" ? data.scope : undefined,
      expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
      expires_at: expiresAt
    };
  }

  private jsonHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Accept-Language": "en_US",
      "User-Agent": `polar-mcp-server/${SERVER_VERSION}`
    };
  }

  private formHeaders(): Record<string, string> {
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64");
    return {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "Accept-Language": "en_US",
      "User-Agent": `polar-mcp-server/${SERVER_VERSION}`
    };
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    const payload = text ? safeJson(text) : null;
    if (!response.ok) {
      const details = payload && typeof payload === "object" ? JSON.stringify(payload) : text;
      throw new Error(`Polar API HTTP ${response.status}: ${redactErrorMessage(details || response.statusText)}`);
    }
    return payload ?? {};
  }

  private async parseAndCache(method: "GET" | "POST", url: string, response: Response): Promise<unknown> {
    try {
      const payload = await this.parseResponse(response);
      if (this.config.cacheEnabled && method === "GET") this.getCache().set(method, url, payload);
      return payload;
    } catch (error) {
      if (this.config.cacheEnabled && method === "GET") {
        const cached = this.getCache().get(method, url);
        if (cached !== undefined) return cached;
      }
      throw error;
    }
  }

  private getCache(): PolarCache {
    this.cache ??= new PolarCache(this.config.cachePath);
    return this.cache;
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    const retryWrappedFetch = (u: string, i?: RequestInit) => fetchWithRetryMiddleware(u, i ?? {});
    return fetchWithCache(url, init, {
      defaultTtlSeconds: 60,
      envVarBypass: "POLAR_NO_CACHE",
      innerFetch: retryWrappedFetch
    });
  }
}

function polarDateRange(params: ListParams, style: NonNullable<ListParams["date_param_style"]>): Record<string, string> {
  const range: Record<string, string> = {};
  if (style === "none") return range;
  const fromKey = style === "fromDate_toDate" ? "fromDate" : "from";
  const toKey = style === "fromDate_toDate" ? "toDate" : "to";
  if (params.after) range[fromKey] = toDateTime(params.after, false);
  if (params.before) range[toKey] = toDateTime(params.before, true);
  return range;
}

function toDateTime(value: string, endOfDay: boolean): string {
  // Date-only input (YYYY-MM-DD): expand to start/end of day so a `before` bound keeps the
  // whole final day instead of collapsing to its midnight (Date.parse would drop those hours).
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return `${value.trim()}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
  }
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  const date = value.slice(0, 10);
  return `${date}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
}

function extractRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of [
    "data",
    "records",
    "items",
    "activity",
    "activities",
    "calendarEntries",
    "calendars",
    "continuousSamples",
    "samples",
    "nightlyRechargeResults",
    "ppiSamples",
    "skinContacts",
    "sleepWakeVectors",
    "sleeps",
    "sports",
    "sportProfiles",
    "subscriptions",
    "userSubscriptions",
    "temperatureMeasurements",
    "tests",
    "testResults",
    "trainingSessions",
    "trainingSession",
    "trainingTarget",
    "trainingTargets",
    "devices",
    "userDevices"
  ]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
    if (record[key] && typeof record[key] === "object") {
      const nested = extractRecords(record[key]);
      if (nested.length) return nested;
    }
  }
  const nestedArrays = Object.values(record)
    .map((value) => extractRecords(value))
    .find((items) => items.length > 0);
  return nestedArrays ?? [record];
}

function extractNextToken(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const token = record.next_token ?? record.nextToken ?? record.nextPageToken;
  return typeof token === "string" && token ? token : undefined;
}

function cleanParams(input: Record<string, string | number | boolean | undefined>): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== "")) as Record<string, string | number | boolean>;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
