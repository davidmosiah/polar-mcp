/**
 * Polar AccessLink v4 daily activity helpers.
 *
 * Live v4 `stepSamples` are 1-minute incremental buckets (`interval: 60000`,
 * values like 0/2/6 that reset), not a running cumulative total. Daily steps
 * are the sum of those buckets. Missing `stepSamples` stays undefined — never
 * coerced to 0.
 */

type UnknownRecord = Record<string, unknown>;

function isObject(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function polarActivityDate(record: unknown): string | undefined {
  if (!isObject(record)) return undefined;
  for (const key of ["date", "day"] as const) {
    const value = record[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  }
  return undefined;
}

export function polarActivityDeviceId(record: unknown): string {
  if (!isObject(record)) return "";
  const direct = deviceIdFrom(record.deviceReference) ?? deviceIdFrom(record.deviceRef);
  if (direct) return direct;
  const perDevice = record.activitiesPerDevice;
  if (!Array.isArray(perDevice)) return "";
  const ids = [...new Set(perDevice.map((item) => (isObject(item) ? deviceIdFrom(item.deviceReference) ?? deviceIdFrom(item.deviceRef) : undefined)).filter((id): id is string => Boolean(id)))].sort();
  return ids.join(",");
}

function deviceIdFrom(value: unknown): string | undefined {
  if (!isObject(value)) return undefined;
  for (const key of ["deviceId", "uuid", "id"] as const) {
    const id = value[key];
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return undefined;
}

/**
 * Sum Polar v4 incremental step buckets.
 * Returns undefined when the payload has no `stepSamples` at all.
 * Returns 0 when Polar sent `stepSamples` whose buckets sum to zero.
 */
export function sumPolarStepSamples(record: unknown): number | undefined {
  const samples = collectStepSampleArrays(record);
  if (!samples.length) return undefined;
  return samples.reduce((total, steps) => total + steps.reduce((sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0), 0);
}

function collectStepSampleArrays(value: unknown): number[][] {
  const found: number[][] = [];
  visitStepSamples(value, found);
  return found;
}

function visitStepSamples(value: unknown, found: number[][]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visitStepSamples(item, found);
    return;
  }
  const record = value as UnknownRecord;
  const stepSamples = record.stepSamples;
  if (isObject(stepSamples) && Array.isArray(stepSamples.steps)) {
    found.push(stepSamples.steps.filter((item): item is number => typeof item === "number"));
  }
  for (const [key, nested] of Object.entries(record)) {
    if (key === "stepSamples") continue;
    visitStepSamples(nested, found);
  }
}

function activityRichness(record: unknown): number {
  const samples = collectStepSampleArrays(record);
  if (!samples.length) return 0;
  return samples.reduce((total, steps) => total + steps.length, 0);
}

export function collapseActivityRecords(records: unknown[]): unknown[] {
  const byKey = new Map<string, unknown>();
  const order: string[] = [];
  records.forEach((record, index) => {
    const date = polarActivityDate(record);
    const key = date ? `${date}::${polarActivityDeviceId(record)}` : `#${index}`;
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, record);
      order.push(key);
      return;
    }
    if (activityRichness(record) > activityRichness(existing)) byKey.set(key, record);
  });
  return order.map((key) => byKey.get(key));
}

/** Additive `steps` alias from Polar buckets. Does not invent 0 when samples are absent. */
export function annotateActivitySteps(records: unknown[]): unknown[] {
  return records.map((record) => {
    if (!isObject(record)) return record;
    if (typeof record.steps === "number" && Number.isFinite(record.steps)) return record;
    if (typeof record.stepCount === "number" && Number.isFinite(record.stepCount)) {
      return { ...record, steps: record.stepCount };
    }
    const summed = sumPolarStepSamples(record);
    if (summed === undefined) return record;
    return { ...record, steps: summed };
  });
}

export function normalizeActivityRecords(records: unknown[]): unknown[] {
  return annotateActivitySteps(collapseActivityRecords(records));
}

function civilDate(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1];
}

/** MCP `before` is exclusive. Polar activity `to` is inclusive — drop the leaked end date. */
export function filterActivityExclusiveRange(records: unknown[], after?: string, before?: string): unknown[] {
  const from = civilDate(after);
  const toExclusive = civilDate(before);
  return records.filter((record) => {
    const date = polarActivityDate(record);
    if (!date) return true;
    if (from && date < from) return false;
    if (toExclusive && date >= toExclusive) return false;
    return true;
  });
}

/**
 * Daily step total after date/device collapse.
 * Multiple devices on the same civil day are summed.
 * Undefined when no record has Polar step data.
 */
export function stepsForActivityDay(records: unknown[]): number | undefined {
  const values = normalizeActivityRecords(records)
    .map((record) => {
      if (!isObject(record)) return undefined;
      if (typeof record.steps === "number" && Number.isFinite(record.steps)) return record.steps;
      return sumPolarStepSamples(record);
    })
    .filter((value): value is number => value !== undefined);
  if (!values.length) return undefined;
  return values.reduce((total, value) => total + value, 0);
}
