import type { PrivacyMode, PolarConfig } from "../types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickDefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null));
}

export function resolvePrivacyMode(config: PolarConfig, override?: PrivacyMode): PrivacyMode {
  return override ?? config.privacyMode;
}

export function applyPrivacy(endpoint: string, payload: unknown, mode: PrivacyMode): unknown {
  if (mode === "raw") return payload;
  if (isObject(payload) && Array.isArray(payload.records)) {
    return { ...payload, privacy_mode: mode, records: payload.records.map((record) => normalizeRecord(endpoint, record, mode)) };
  }
  if (Array.isArray(payload)) return payload.map((record) => normalizeRecord(endpoint, record, mode));
  return normalizeRecord(endpoint, payload, mode);
}

export function normalizeRecord(endpoint: string, record: unknown, mode: PrivacyMode): unknown {
  if (!isObject(record)) return record;
  if (endpoint.includes("/user/account-data")) return normalizeAccount(record, mode);
  if (endpoint.includes("/user-devices")) return normalizeDevice(record, mode);
  if (endpoint.includes("/activity")) return normalizeActivity(record, mode);
  if (endpoint.includes("/sleeps") || endpoint.includes("/sleep-wake-vectors")) return normalizeSleep(record, mode);
  if (endpoint.includes("/nightly-recharge-results")) return normalizeNightlyRecharge(record, mode);
  if (endpoint.includes("/training-sessions")) return normalizeTrainingSession(record, mode);
  if (endpoint.includes("/continuous-samples") || endpoint.includes("/ppi-samples")) return normalizeSamples(record, mode);
  if (endpoint.includes("/temperature-measurements")) return normalizeTemperature(record, mode);
  if (endpoint.includes("/routes/")) return normalizeRoute(record, mode);
  if (endpoint.includes("/tests")) return normalizeTest(record, mode);
  if (endpoint.includes("/sports")) return normalizeSport(record, mode);
  if (endpoint.includes("/training-target")) return normalizeTrainingTarget(record, mode);
  if (endpoint.includes("/skin-contacts")) return normalizeSkinContact(record, mode);
  return mode === "summary" ? summarizeUnknown(record) : removeSensitive(record);
}

export function normalizeStreams(payload: unknown, mode: PrivacyMode, includeGps: boolean): unknown {
  if (mode === "raw") return payload;
  if (!isObject(payload)) return payload;
  const clean = removeSensitive(payload);
  if (!includeGps) return removeGps(clean);
  if (mode === "summary" && isObject(clean)) return summarizeUnknown(clean);
  return clean;
}

function normalizeAccount(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    created: record.created,
    modified: record.modified,
    nickname: record.nickname,
    country: record.country,
    locale: record.locale
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeDevice(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    id: mode === "summary" ? undefined : record.id,
    deviceId: mode === "summary" ? undefined : record.deviceId,
    product: record.product,
    model: record.model,
    modelName: record.modelName,
    created: record.created,
    modified: record.modified
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeActivity(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    date: record.date ?? record.day,
    steps: record.steps ?? record.stepCount,
    activeCalories: record.activeCalories ?? record.active_calories,
    totalCalories: record.totalCalories ?? record.total_calories,
    activeDuration: record.activeDuration ?? record.active_duration,
    distance: record.distance
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeSleep(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const sleepResult = isObject(record.sleepResult) ? record.sleepResult : {};
  const hypnogram = isObject(sleepResult.hypnogram) ? sleepResult.hypnogram : {};
  const evaluation = isObject(record.sleepEvaluation) ? record.sleepEvaluation : {};
  const analysis = isObject(evaluation.analysis) ? evaluation.analysis : {};
  const phaseDurations = isObject(evaluation.phaseDurations) ? evaluation.phaseDurations : {};
  const score = isObject(record.sleepScore) ? record.sleepScore : {};
  const base = pickDefined({
    date: record.date ?? record.day ?? record.sleepDate,
    sleepStartTime: record.sleepStartTime ?? record.startTime ?? hypnogram.sleepStart,
    sleepEndTime: record.sleepEndTime ?? record.endTime ?? hypnogram.sleepEnd,
    sleepDuration: record.sleepDuration ?? record.totalSleepTime ?? evaluation.asleepDuration,
    sleepScore: typeof record.sleepScore === "number" ? record.sleepScore : record.score ?? score.sleepScore,
    continuity: record.continuity ?? record.sleepContinuity ?? analysis.continuityIndex,
    deepSleep: record.deepSleep ?? phaseDurations.deep,
    remSleep: record.remSleep ?? phaseDurations.rem,
    lightSleep: record.lightSleep ?? phaseDurations.light
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeNightlyRecharge(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    date: record.date ?? record.day,
    status: record.nightlyRechargeStatus ?? record.status,
    ansCharge: record.ansCharge ?? record.ans_charge,
    sleepCharge: record.sleepCharge ?? record.sleep_charge,
    hrv: record.hrv ?? record.heartRateVariability,
    breathingRate: record.breathingRate
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeTrainingSession(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    id: record.id,
    name: record.name,
    startTime: record.startTime ?? record.start_time,
    sport: record.sport ?? record.sportName ?? record.sportProfile,
    duration: record.duration,
    calories: record.calories ?? record.kiloCalories,
    distance: record.distance,
    averageHeartRate: record.averageHeartRate,
    maximumHeartRate: record.maximumHeartRate,
    trainingLoad: record.trainingLoad ?? record.cardioLoad
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeSamples(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    date: record.date,
    from: record.from,
    to: record.to,
    type: record.type,
    interval: record.interval,
    sample_count: sampleCount(record)
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeTemperature(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    date: record.date,
    from: record.from,
    to: record.to,
    temperature: record.temperature,
    skinTemperature: record.skinTemperature,
    bodyTemperature: record.bodyTemperature
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeRoute(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    id: record.id,
    name: record.name,
    distance: record.distance,
    duration: record.duration,
    ascent: record.ascent,
    descent: record.descent,
    point_count: sampleCount(record)
  });
  if (mode === "summary") return base;
  return removeGps(removeSensitive({ ...base, ...record }));
}

function normalizeTest(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    id: record.id,
    date: record.date ?? record.startTime,
    type: record.type ?? record.testType,
    result: record.result,
    score: record.score,
    vo2Max: record.vo2Max
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeSport(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    id: record.id,
    name: record.name,
    displayName: record.displayName,
    type: record.type
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeTrainingTarget(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const session = isObject(record.session) ? record.session : record;
  const base = pickDefined({
    id: session.id ?? record.id,
    name: session.name ?? record.name,
    sport: session.sport ?? record.sport,
    duration: session.duration ?? record.duration,
    targetType: session.targetType ?? record.targetType
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function normalizeSkinContact(record: Record<string, unknown>, mode: PrivacyMode): unknown {
  const base = pickDefined({
    date: record.date,
    from: record.from,
    to: record.to,
    contactDuration: record.contactDuration ?? record.duration,
    sample_count: sampleCount(record)
  });
  if (mode === "summary") return base;
  return removeSensitive({ ...base, ...record });
}

function summarizeUnknown(record: Record<string, unknown>): Record<string, unknown> {
  return pickDefined({
    id: record.id,
    date: record.date ?? record.day ?? record.created,
    name: record.name ?? record.displayName,
    type: record.type,
    score: record.score,
    summary: record.summary,
    sample_count: sampleCount(record)
  });
}

function sampleCount(record: Record<string, unknown>): number | undefined {
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) return value.length;
    if (isObject(value)) {
      const nested = sampleCount(value);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function removeSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeSensitive);
  if (!isObject(value)) return value;
  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveKey(key)) continue;
    clone[key] = removeSensitive(child);
  }
  return clone;
}

function removeGps(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(removeGps);
  if (!isObject(value)) return value;
  const clone: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isGpsKey(key)) continue;
    clone[key] = removeGps(child);
  }
  return clone;
}

function isSensitiveKey(key: string): boolean {
  return [
    "email",
    "firstName",
    "lastName",
    "fullName",
    "picture",
    "profilePicture",
    "access_token",
    "refresh_token"
  ].includes(key) || isGpsKey(key);
}

function isGpsKey(key: string): boolean {
  return [
    "lat",
    "lng",
    "lon",
    "latitude",
    "longitude",
    "coordinates",
    "coordinate",
    "latlng",
    "start_latlng",
    "end_latlng",
    "points",
    "map",
    "polyline",
    "summary_polyline",
    "gps",
    "gpx",
    "routePoints"
  ].includes(key);
}
