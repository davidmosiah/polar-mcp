import type { PrivacyMode } from "../types.js";
import { buildCollectionOutput, type CollectionResult } from "./collection.js";

export const DENSE_COLLECTION_MAX_POINTS = 5000;
export const DENSE_COLLECTION_DEFAULT_POINTS = 2000;
export const DENSE_COLLECTION_CONTRACT = "polar-bounded-collection/v1";

/** Count JSON values conservatively, not just named sample arrays. Stop at budget+1.
 * Iterators avoid copying large arrays; counting containers also bounds nesting.
 * Upstream JSON has already been fetched/parsed: this is NOT a fetch memory cap.
 */
function boundedSize(value: unknown, budget: number): number {
  function* children(item: unknown): Generator<unknown> {
    if (Array.isArray(item)) {
      yield* item;
    } else if (item !== null && typeof item === "object") {
      for (const key in item) {
        if (Object.prototype.hasOwnProperty.call(item, key)) yield (item as Record<string, unknown>)[key];
      }
    }
  }
  let size = 1;
  const stack = [children(value)];
  while (stack.length && size <= budget) {
    const next = stack[stack.length - 1]!.next();
    if (next.done) { stack.pop(); continue; }
    size += 1;
    if (next.value !== null && typeof next.value === "object") stack.push(children(next.value));
  }
  return size;
}

export function buildDenseCollectionOutput(endpoint: string, privacyMode: PrivacyMode, result: CollectionResult, maxPoints: number) {
  if (!Number.isInteger(maxPoints) || maxPoints < 1 || maxPoints > DENSE_COLLECTION_MAX_POINTS) {
    throw new Error("max_points must be an integer from 1 to 5000");
  }
  const records: unknown[] = [];
  let used = 0;
  let omitted = 0;
  for (const record of result.records) {
    const size = boundedSize(record, maxPoints - used);
    if (size > maxPoints - used) { omitted += 1; continue; }
    records.push(record);
    used += size;
  }
  return {
    ...buildCollectionOutput(endpoint, privacyMode, { ...result, records }),
    contract_version: DENSE_COLLECTION_CONTRACT,
    max_points: maxPoints,
    budget_used: used,
    omitted_records: omitted,
    truncated: omitted > 0,
    notes: ["Budget counts all JSON values in complete upstream records, including containers; oversized records are omitted, never partially sliced. This is not downsampling. Upstream pagination metadata is unchanged; omissions are not a resumable cursor."]
  };
}
