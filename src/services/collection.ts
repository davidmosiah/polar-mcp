import type { PrivacyMode } from "../types.js";
import { applyPrivacy } from "./privacy.js";

export interface CollectionResult {
  records: unknown[];
  next_page?: number;
  pages_fetched: number;
}

/**
 * Assemble the envelope every `polar_list_*` tool returns.
 *
 * Extracted from the tool registration so `scripts/demo-contract-test.mjs` can run
 * the REAL assembly (privacy normalization included) instead of re-describing it.
 */
export function buildCollectionOutput(endpoint: string, privacyMode: PrivacyMode, result: CollectionResult) {
  const normalized = applyPrivacy(endpoint, { records: result.records }, privacyMode) as { records: unknown[] };
  return {
    endpoint,
    privacy_mode: privacyMode,
    count: normalized.records.length,
    records: normalized.records,
    next_page: result.next_page,
    has_more: Boolean(result.next_page),
    pages_fetched: result.pages_fetched
  };
}
