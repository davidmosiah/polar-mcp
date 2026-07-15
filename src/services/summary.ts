import type { PolarClient } from "./polar-client.js";
import { logToolError } from "./format.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type UnknownRecord = Record<string, unknown>;

export interface SummaryOptions {
  days: number;
  compare_days?: number;
  timezone?: string;
}

function isObject(value: unknown): value is UnknownRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function records(value: unknown): UnknownRecord[] {
  if (Array.isArray(value)) return value.filter(isObject);
  if (!isObject(value)) return [];
  for (const key of [
    "data",
    "records",
    "activity",
    "activities",
    "sleeps",
    "nightlyRechargeResults",
    "trainingSessions",
    "continuousSamples"
  ]) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate.filter(isObject);
    const nested = records(candidate);
    if (nested.length) return nested;
  }
  if (typeof value.error === "string") return [];
  return [value];
}

function firstData(value: unknown): UnknownRecord {
  return records(value)[0] ?? {};
}

function num(record: UnknownRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function round(value?: number, digits = 1): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sum(values: Array<number | undefined>): number {
  return values.reduce<number>((total, value) => total + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0);
}

function avg(values: Array<number | undefined>): number | undefined {
  const nums = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return nums.length ? sum(nums) / nums.length : undefined;
}

function percentDelta(current?: number, previous?: number): number | undefined {
  if (current === undefined || previous === undefined || previous === 0) return undefined;
  return ((current - previous) / previous) * 100;
}

function dateString(daysAgo = 0): string {
  return new Date(Date.now() - daysAgo * DAY_MS).toISOString().slice(0, 10);
}

function dayRange(date: string): Record<string, string> {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return { from: date, to: next.toISOString().slice(0, 10) };
}

async function safeGet(client: Pick<PolarClient, "get">, endpoint: string, params?: Record<string, string>): Promise<unknown> {
  try {
    return await client.get(endpoint, params);
  } catch (error) {
    return { error: logToolError(error), endpoint };
  }
}

async function dailyBundle(client: Pick<PolarClient, "get">, date: string) {
  const range = dayRange(date);
  const [activity, sleep, nightlyRecharge, trainingSessions, continuousSamples] = await Promise.all([
    safeGet(client, "/activity/list", range),
    safeGet(client, "/sleeps", range),
    safeGet(client, "/nightly-recharge-results", range),
    safeGet(client, "/training-sessions/list", range),
    safeGet(client, "/continuous-samples", range)
  ]);
  return { date, activity, sleep, nightlyRecharge, trainingSessions, continuousSamples };
}

function dailyStats(bundle: Awaited<ReturnType<typeof dailyBundle>>) {
  const activity = firstData(bundle.activity);
  const sleep = firstData(bundle.sleep);
  const recharge = firstData(bundle.nightlyRecharge);
  const training = records(bundle.trainingSessions);
  const continuous = firstData(bundle.continuousSamples);

  const sleepMs = num(sleep, ["sleepDuration", "totalSleepTime", "totalSleep", "sleep_goal", "sleepGoal"]);
  const activeDurationMs = num(activity, ["activeDuration", "active_duration", "duration"]);
  const trainingDurationMs = sum(training.map((item) => num(item, ["duration", "exerciseDuration", "trainingLoadDuration"])));
  const trainingCalories = sum(training.map((item) => num(item, ["calories", "kiloCalories", "energy"])));

  return {
    date: bundle.date,
    sleep_score: num(sleep, ["sleepScore", "sleep_score", "score", "sleepRating"]),
    sleep_minutes: sleepMs === undefined ? undefined : round(sleepMs / 60000, 0),
    sleep_start: sleep.sleepStartTime ?? sleep.sleepStart ?? sleep.startTime,
    sleep_end: sleep.sleepEndTime ?? sleep.sleepEnd ?? sleep.endTime,
    continuity: num(sleep, ["continuity", "sleepContinuity", "sleepContinuityScore"]),
    nightly_recharge_status: recharge.nightlyRechargeStatus ?? recharge.nightly_recharge_status ?? recharge.status,
    ans_charge: num(recharge, ["ansCharge", "ans_charge", "ansChargeScore"]),
    sleep_charge: num(recharge, ["sleepCharge", "sleep_charge", "sleepChargeScore"]),
    steps: num(activity, ["steps", "stepCount"]),
    active_calories: num(activity, ["activeCalories", "active_calories"]),
    total_calories: num(activity, ["totalCalories", "total_calories", "calories"]),
    active_minutes: activeDurationMs === undefined ? undefined : round(activeDurationMs / 60000, 0),
    training_sessions: training.length,
    training_minutes: trainingDurationMs ? round(trainingDurationMs / 60000, 0) : undefined,
    training_calories: trainingCalories || undefined,
    average_heart_rate: num(continuous, ["averageHeartRate", "heartRateAvg", "avgHr"]),
    hrv_ms: num(recharge, ["hrv", "heartRateVariability", "rmssd"]),
    has_activity_error: isObject(bundle.activity) && typeof bundle.activity.error === "string",
    has_sleep_error: isObject(bundle.sleep) && typeof bundle.sleep.error === "string",
    has_recharge_error: isObject(bundle.nightlyRecharge) && typeof bundle.nightlyRecharge.error === "string",
    has_training_error: isObject(bundle.trainingSessions) && typeof bundle.trainingSessions.error === "string",
    has_continuous_error: isObject(bundle.continuousSamples) && typeof bundle.continuousSamples.error === "string"
  };
}

function classifyRecovery(stats: ReturnType<typeof dailyStats>): string {
  const sleepHours = (stats.sleep_minutes ?? 0) / 60;
  const status = typeof stats.nightly_recharge_status === "string" ? stats.nightly_recharge_status.toLowerCase() : "";
  if (status.includes("poor") || status.includes("compromised")) return "recharge_limited";
  if (stats.sleep_score !== undefined && stats.sleep_score < 65) return "sleep_limited";
  if (sleepHours > 0 && sleepHours < 6) return "sleep_limited";
  if ((stats.training_minutes ?? 0) >= 90 && (stats.sleep_score ?? 100) < 75) return "load_recovery_mismatch";
  if (status.includes("good") || status.includes("very_good") || status.includes("ok")) return "stable_recharge";
  return "neutral";
}

function buildActions(stats: ReturnType<typeof dailyStats>, weekly?: ReturnType<typeof aggregateStats>): string[] {
  const actions: string[] = [];
  const state = classifyRecovery(stats);
  if (state === "recharge_limited") actions.push("Keep intensity conservative today; Nightly Recharge suggests recovery context may be limited.");
  if (state === "sleep_limited") actions.push("Treat sleep as the main constraint before adding more training stress.");
  if (state === "load_recovery_mismatch") actions.push("Training duration is high relative to recovery context; use soreness and schedule pressure before deciding intensity.");
  if (state === "stable_recharge") actions.push("If subjective energy agrees, this is a reasonable day for planned training.");
  if (state === "neutral") actions.push("Use Polar as trend context today: compare sleep, activity, training load and subjective energy.");
  if (weekly?.avg_sleep_hours !== undefined && weekly.avg_sleep_hours < 6.5) actions.push("Weekly sleep average is below 6.5h; recovery improvements may beat training complexity.");
  if ((weekly?.avg_training_minutes ?? 0) > 75 && (weekly?.avg_sleep_hours ?? 8) < 7) actions.push("Training volume is meaningful while sleep is modest; keep progression gradual.");
  actions.push("This is not medical advice; use Polar as trend context and escalate symptoms or abnormal vitals to a clinician.");
  return [...new Set(actions)];
}

function aggregateStats(days: ReturnType<typeof dailyStats>[]) {
  return {
    days: days.length,
    avg_sleep_score: round(avg(days.map((day) => day.sleep_score)), 1),
    avg_sleep_hours: round(avg(days.map((day) => day.sleep_minutes).map((minutes) => minutes === undefined ? undefined : minutes / 60)), 2),
    avg_steps: round(avg(days.map((day) => day.steps)), 0),
    total_steps: round(sum(days.map((day) => day.steps)), 0),
    avg_active_calories: round(avg(days.map((day) => day.active_calories)), 0),
    avg_training_minutes: round(avg(days.map((day) => day.training_minutes)), 0),
    total_training_sessions: round(sum(days.map((day) => day.training_sessions)), 0),
    total_training_calories: round(sum(days.map((day) => day.training_calories)), 0),
    avg_ans_charge: round(avg(days.map((day) => day.ans_charge)), 1),
    avg_sleep_charge: round(avg(days.map((day) => day.sleep_charge)), 1),
    avg_hrv_ms: round(avg(days.map((day) => day.hrv_ms)), 1),
    days_with_sleep: days.filter((day) => day.sleep_minutes !== undefined || day.sleep_score !== undefined).length,
    days_with_recharge: days.filter((day) => day.nightly_recharge_status !== undefined || day.ans_charge !== undefined || day.sleep_charge !== undefined).length,
    days_with_training: days.filter((day) => day.training_sessions > 0).length
  };
}

export async function buildDailySummary(client: Pick<PolarClient, "get">, options: SummaryOptions) {
  const date = dateString(0);
  const bundle = await dailyBundle(client, date);
  const stats = dailyStats(bundle);
  const recovery = classifyRecovery(stats);

  return {
    kind: "daily_summary" as const,
    generated_at: new Date().toISOString(),
    window: { date, days: options.days, timezone: options.timezone ?? "UTC" },
    data_quality: {
      confidence: [stats.has_activity_error, stats.has_sleep_error, stats.has_recharge_error, stats.has_training_error].filter(Boolean).length === 0 ? "high" : "partial",
      missing_or_failed: {
        activity: stats.has_activity_error,
        sleep: stats.has_sleep_error,
        nightly_recharge: stats.has_recharge_error,
        training_sessions: stats.has_training_error,
        continuous_samples: stats.has_continuous_error
      }
    },
    scorecard: stats,
    diagnostic: {
      recovery_context: recovery,
      primary_signal: recovery === "recharge_limited" || recovery === "sleep_limited"
        ? "Recovery is the limiting context today; keep recommendations conservative."
        : "Use Polar sleep, Nightly Recharge, activity and training sessions together as context, not diagnosis.",
      action_candidates: buildActions(stats)
    },
    safety: {
      medical_advice: false,
      api_boundary: "Polar AccessLink Dynamic API v4 exposes user-authorized activity, sleep, Nightly Recharge, samples, devices, routes and training data. This MCP is read-only and does not provide medical diagnosis."
    }
  };
}

export async function buildWeeklySummary(client: Pick<PolarClient, "get">, options: SummaryOptions) {
  const days = Math.max(options.days, 7);
  const compareDays = options.compare_days ?? 7;
  const currentBundles = await Promise.all(Array.from({ length: days }, (_, index) => dailyBundle(client, dateString(index))));
  const current = currentBundles.map(dailyStats).reverse();
  const previous = compareDays > 0
    ? (await Promise.all(Array.from({ length: compareDays }, (_, index) => dailyBundle(client, dateString(days + index))))).map(dailyStats).reverse()
    : [];
  const currentStats = aggregateStats(current);
  const previousStats = previous.length ? aggregateStats(previous) : undefined;

  return {
    kind: "weekly_summary" as const,
    generated_at: new Date().toISOString(),
    window: { days, compare_days: compareDays, timezone: options.timezone ?? "UTC" },
    data_quality: {
      days_with_sleep: currentStats.days_with_sleep,
      days_with_recharge: currentStats.days_with_recharge,
      days_with_training: currentStats.days_with_training,
      confidence: currentStats.days_with_sleep >= 5 && currentStats.days_with_recharge >= 4 ? "high" : currentStats.days_with_sleep >= 3 ? "medium" : "low"
    },
    scorecard: {
      current: currentStats,
      previous: previousStats,
      delta: previousStats ? {
        sleep_score_pct: round(percentDelta(currentStats.avg_sleep_score, previousStats.avg_sleep_score), 1),
        sleep_hours_pct: round(percentDelta(currentStats.avg_sleep_hours, previousStats.avg_sleep_hours), 1),
        steps_pct: round(percentDelta(currentStats.avg_steps, previousStats.avg_steps), 1),
        training_minutes_pct: round(percentDelta(currentStats.avg_training_minutes, previousStats.avg_training_minutes), 1),
        ans_charge_pct: round(percentDelta(currentStats.avg_ans_charge, previousStats.avg_ans_charge), 1)
      } : undefined
    },
    diagnostic: {
      load_classification: classifyWeeklyLoad(currentStats),
      bottlenecks: inferBottlenecks(currentStats, previousStats),
      action_candidates: buildActions(current[current.length - 1] ?? current[0], currentStats),
      next_week_success_metrics: [
        "Keep sleep average above the user's sustainable baseline before increasing intensity.",
        "Track sleep, Nightly Recharge and training sessions together rather than optimizing one metric.",
        "Use continuous samples only when enough days are available; sparse samples should be treated as low confidence.",
        "If symptoms, illness or abnormal vitals appear, seek clinical guidance instead of agent optimization."
      ]
    },
    safety: {
      medical_advice: false,
      raw_sensor_boundary: "Polar MCP exposes user-authorized AccessLink API records. Raw route and sample payloads require explicit raw privacy mode."
    }
  };
}

function classifyWeeklyLoad(stats: ReturnType<typeof aggregateStats>): string {
  const sleep = stats.avg_sleep_hours ?? 0;
  const training = stats.avg_training_minutes ?? 0;
  if (sleep < 6.5 && training >= 60) return "sleep_limited_with_meaningful_training";
  if (sleep < 6.5) return "sleep_limited";
  if (training >= 90 && (stats.avg_ans_charge ?? 100) < 70) return "high_training_lower_recharge";
  if (sleep >= 7 && (stats.avg_ans_charge ?? 0) >= 70) return "stable_recovery_base";
  return "neutral";
}

function inferBottlenecks(current: ReturnType<typeof aggregateStats>, previous?: ReturnType<typeof aggregateStats>): string[] {
  const bottlenecks: string[] = [];
  const sleepDelta = percentDelta(current.avg_sleep_hours, previous?.avg_sleep_hours);
  const trainingDelta = percentDelta(current.avg_training_minutes, previous?.avg_training_minutes);
  if ((current.avg_sleep_hours ?? 0) < 6.5) bottlenecks.push("Average sleep is below 6.5h; recovery may be the limiting factor.");
  if ((current.avg_training_minutes ?? 0) > 90 && (current.avg_ans_charge ?? 100) < 70) bottlenecks.push("Training duration is high while Nightly Recharge context is modest.");
  if (sleepDelta !== undefined && sleepDelta < -10) bottlenecks.push("Sleep duration decreased materially versus the comparison window.");
  if (trainingDelta !== undefined && trainingDelta > 25 && (current.avg_sleep_hours ?? 8) < 7) bottlenecks.push("Training duration increased while sleep is still below 7h.");
  if (current.days_with_recharge < 3) bottlenecks.push("Nightly Recharge data is sparse; do not over-weight recharge conclusions.");
  if (!bottlenecks.length) bottlenecks.push("No obvious Polar-only bottleneck; combine trends with subjective energy, soreness and life stress.");
  return bottlenecks;
}

export function formatSummaryMarkdown(summary: Record<string, unknown>): string {
  const lines = [`# Polar ${summary.kind === "weekly_summary" ? "Weekly" : "Daily"} Summary`, ""];
  lines.push(`Generated: ${summary.generated_at}`);
  const diagnostic = summary.diagnostic as { primary_signal?: string; load_classification?: string; recovery_context?: string; action_candidates?: string[]; bottlenecks?: string[] } | undefined;
  if (diagnostic?.primary_signal) lines.push(`\n## Primary signal\n${diagnostic.primary_signal}`);
  if (diagnostic?.recovery_context) lines.push(`\n## Recovery context\n${diagnostic.recovery_context}`);
  if (diagnostic?.load_classification) lines.push(`\n## Load\n${diagnostic.load_classification}`);
  if (diagnostic?.bottlenecks?.length) {
    lines.push("\n## Bottlenecks");
    diagnostic.bottlenecks.forEach((item) => lines.push(`- ${item}`));
  }
  if (diagnostic?.action_candidates?.length) {
    lines.push("\n## Action candidates");
    diagnostic.action_candidates.forEach((item) => lines.push(`- ${item}`));
  }
  lines.push("\n## Structured data");
  lines.push("```json");
  lines.push(JSON.stringify(summary, null, 2));
  lines.push("```");
  return lines.join("\n");
}
