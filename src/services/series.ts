/**
 * Agent-safe series for Polar continuous / PPI sample collections.
 * Shared contract agent-safe-series/v1 (garmin-mcp#19 / Kindred).
 */

export const SERIES_CONTRACT_VERSION = "agent-safe-series/v1";
export const SERIES_HARD_MAX_POINTS = 500;
export const SERIES_DEFAULT_MAX_POINTS = 400;
export const SERIES_DEFAULT_RESOLUTION_SECONDS = 60;
export const SERIES_METRICS = ["heart_rate"] as const;
export type SeriesMetric = (typeof SERIES_METRICS)[number];

export type SeriesPoint = { t: number; value: number; min: number; max: number; samples: number };
export type SeriesStats = {
  avg: number; min: number; max: number; p25: number; p50: number; p75: number;
  percentile_method: "linear_interpolation";
};
export type ReferenceSource = "caller_provided" | "activity_recorded_max" | "observed_max";
export type CoverageAnchor = "nominal_duration" | "sample_span";
export type TimeInZone = {
  zone_model: "percent_of_reference_max_hr";
  reference_max_hr: number;
  reference_source: ReferenceSource;
  zones: Array<{ zone: number; min_bpm: number; max_bpm: number | null; seconds: number; percent: number }>;
};
export type DataQuality = {
  expected_samples: number; actual_samples: number; coverage_ratio: number;
  longest_gap_seconds: number; sample_interval_seconds: number; coverage_anchor: CoverageAnchor;
};
export type ActivitySeries = {
  contract_version: typeof SERIES_CONTRACT_VERSION;
  activity_id: string | number;
  metric: SeriesMetric;
  unit: string;
  start_time?: string;
  t_unit: "seconds_from_start";
  resolution_seconds: number;
  requested_resolution_seconds: number;
  points: SeriesPoint[];
  stats: SeriesStats;
  time_in_zone?: TimeInZone;
  downsampled: boolean;
  source_points: number;
  returned_points: number;
  method: "time_bucket_mean" | "none";
  data_quality: DataQuality;
  notes: string[];
};

interface RawSample { t: number; value: number }

export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const rank = (sorted.length - 1) * q;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}
function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
export function computeStats(values: number[]): SeriesStats {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, v) => a + v, 0);
  return {
    avg: round(sum / values.length), min: round(sorted[0]), max: round(sorted[sorted.length - 1]),
    p25: round(percentile(sorted, 0.25)), p50: round(percentile(sorted, 0.5)), p75: round(percentile(sorted, 0.75)),
    percentile_method: "linear_interpolation"
  };
}
function medianInterval(samples: RawSample[]): number {
  if (samples.length < 2) return 1;
  const deltas: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i].t - samples[i - 1].t;
    if (d > 0) deltas.push(d);
  }
  if (!deltas.length) return 1;
  deltas.sort((a, b) => a - b);
  const mid = Math.floor(deltas.length / 2);
  const m = deltas.length % 2 === 0 ? (deltas[mid - 1] + deltas[mid]) / 2 : deltas[mid];
  return m > 0 ? m : 1;
}
export function computeDataQuality(samples: RawSample[], options: { nominalDurationSeconds?: number } = {}): DataQuality {
  const interval = medianInterval(samples);
  const span = samples.length > 1 ? samples[samples.length - 1].t - samples[0].t : 0;
  let expected: number;
  let coverage_anchor: CoverageAnchor;
  const nominal = options.nominalDurationSeconds;
  if (typeof nominal === "number" && Number.isFinite(nominal) && nominal > 0) {
    expected = Math.round(nominal / interval) + 1;
    coverage_anchor = "nominal_duration";
  } else {
    expected = span > 0 ? Math.round(span / interval) + 1 : samples.length;
    coverage_anchor = "sample_span";
  }
  let longestGap = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i].t - samples[i - 1].t;
    if (d > longestGap) longestGap = d;
  }
  if (coverage_anchor === "nominal_duration" && samples.length > 0 && typeof nominal === "number") {
    const edge = Math.max(Math.max(0, samples[0].t), Math.max(0, nominal - samples[samples.length - 1].t));
    if (edge > longestGap) longestGap = edge;
  }
  return {
    expected_samples: expected, actual_samples: samples.length,
    coverage_ratio: expected > 0 ? round(Math.min(samples.length / expected, 1), 3) : 1,
    longest_gap_seconds: round(longestGap, 1), sample_interval_seconds: round(interval, 2), coverage_anchor
  };
}
export function downsampleToBuckets(samples: RawSample[], resolutionSeconds: number): SeriesPoint[] {
  if (!samples.length) return [];
  const origin = samples[0].t;
  const buckets = new Map<number, { sum: number; min: number; max: number; count: number }>();
  for (const s of samples) {
    const index = Math.floor((s.t - origin) / resolutionSeconds);
    const b = buckets.get(index);
    if (b) { b.sum += s.value; b.count++; if (s.value < b.min) b.min = s.value; if (s.value > b.max) b.max = s.value; }
    else buckets.set(index, { sum: s.value, min: s.value, max: s.value, count: 1 });
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([index, b]) => ({
    t: round(origin + index * resolutionSeconds, 1), value: round(b.sum / b.count), min: round(b.min), max: round(b.max), samples: b.count
  }));
}
export function resolveEffectiveResolution(samples: RawSample[], requested: number, maxPoints: number): number {
  if (!samples.length) return requested;
  const span = samples[samples.length - 1].t - samples[0].t;
  if (span <= 0) return requested;
  let resolution = requested;
  const needed = Math.ceil(span / maxPoints);
  if (needed > resolution) resolution = needed;
  while (downsampleToBuckets(samples, resolution).length > maxPoints) {
    resolution += Math.max(1, Math.ceil(resolution * 0.1));
  }
  return resolution;
}

/** Extract HR samples from Polar continuous-samples list payload. */
export function extractSamples(payload: unknown): { samples: RawSample[]; notes: string[] } {
  const notes: string[] = [];
  let records: unknown[] = [];
  if (Array.isArray(payload)) records = payload;
  else if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    if (Array.isArray(o.records)) records = o.records;
    else if (Array.isArray(o.data)) records = o.data;
  }
  const samples: RawSample[] = [];
  let originMs: number | undefined;
  for (const row of records) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const value = Number(r.heartRate ?? r.hr ?? r.averageHeartRate ?? r.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    const ts = r.sampleTime ?? r.time ?? r.timestamp ?? r.startTime ?? r.dateTime;
    let t: number;
    if (typeof ts === "string") {
      const ms = Date.parse(ts);
      if (!Number.isFinite(ms)) continue;
      if (originMs === undefined) originMs = ms;
      t = (ms - originMs) / 1000;
    } else if (typeof ts === "number" && Number.isFinite(ts)) {
      const ms = ts > 1e12 ? ts : ts * 1000;
      if (originMs === undefined) originMs = ms;
      t = (ms - originMs) / 1000;
    } else {
      t = samples.length;
    }
    samples.push({ t, value });
  }
  samples.sort((a, b) => a.t - b.t);
  if (!records.length) notes.push("Empty continuous-samples payload.");
  return { samples, notes };
}

export function computeTimeInZone(samples: RawSample[], interval: number, ref: number, source: ReferenceSource): TimeInZone {
  const bounds = [0.5, 0.6, 0.7, 0.8, 0.9].map((p) => Math.round(ref * p));
  const seconds = new Array(bounds.length).fill(0);
  for (const s of samples) {
    let idx = -1;
    for (let i = bounds.length - 1; i >= 0; i--) if (s.value >= bounds[i]) { idx = i; break; }
    if (idx >= 0) seconds[idx] += interval;
  }
  const total = seconds.reduce((a: number, b: number) => a + b, 0);
  return {
    zone_model: "percent_of_reference_max_hr", reference_max_hr: ref, reference_source: source,
    zones: bounds.map((min, i) => ({
      zone: i + 1, min_bpm: min, max_bpm: i === bounds.length - 1 ? null : bounds[i + 1] - 1,
      seconds: round(seconds[i], 1), percent: total > 0 ? round((seconds[i] / total) * 100, 1) : 0
    }))
  };
}

export function buildHeartSeries(payload: unknown, options: {
  activityId: string | number; resolutionSeconds?: number; maxPoints?: number;
  referenceMaxHr?: number; nominalDurationSeconds?: number; startTime?: string;
}): ActivitySeries {
  const {
    activityId,
    resolutionSeconds = SERIES_DEFAULT_RESOLUTION_SECONDS,
    maxPoints = SERIES_DEFAULT_MAX_POINTS,
    referenceMaxHr,
    nominalDurationSeconds,
    startTime
  } = options;
  const budget = Math.min(Math.max(1, Math.trunc(maxPoints)), SERIES_HARD_MAX_POINTS);
  const requested = Math.max(1, Math.trunc(resolutionSeconds));
  const { samples, notes } = extractSamples(payload);
  if (!samples.length) throw new Error(`No heart_rate samples for ${activityId}. Polar continuous samples empty or missing HR fields.`);
  const values = samples.map((s) => s.value);
  const stats = computeStats(values);
  const dataQuality = computeDataQuality(samples, { nominalDurationSeconds });
  const effective = resolveEffectiveResolution(samples, requested, budget);
  if (effective !== requested) notes.push(`Requested ${requested}s resolution would exceed max_points=${budget}; served at ${effective}s instead.`);
  const shouldDownsample = effective > dataQuality.sample_interval_seconds && samples.length > budget;
  const points = shouldDownsample
    ? downsampleToBuckets(samples, effective)
    : samples.map((s) => ({ t: round(s.t, 1), value: round(s.value), min: round(s.value), max: round(s.value), samples: 1 }));
  if (dataQuality.coverage_ratio < 0.9) {
    notes.push(`Sparse series: ${dataQuality.actual_samples} of ~${dataQuality.expected_samples} expected (anchor=${dataQuality.coverage_anchor}).`);
  }
  const source: ReferenceSource = referenceMaxHr !== undefined ? "caller_provided" : "observed_max";
  const reference = referenceMaxHr ?? Math.round(stats.max);
  const time_in_zone = computeTimeInZone(samples, dataQuality.sample_interval_seconds, reference, source);
  if (source !== "caller_provided") notes.push(`reference_max_hr source=${source}. Pass reference_max_hr for cross-day comparable zones.`);
  return {
    contract_version: SERIES_CONTRACT_VERSION, activity_id: activityId, metric: "heart_rate", unit: "bpm",
    start_time: startTime, t_unit: "seconds_from_start",
    resolution_seconds: shouldDownsample ? effective : round(dataQuality.sample_interval_seconds, 2),
    requested_resolution_seconds: requested, points, stats, time_in_zone,
    downsampled: shouldDownsample, source_points: samples.length, returned_points: points.length,
    method: shouldDownsample ? "time_bucket_mean" : "none", data_quality: dataQuality, notes
  };
}
