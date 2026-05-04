import type { PolarClient } from "./polar-client.js";
import { buildDailySummary, type SummaryOptions } from "./summary.js";

type ContextOptions = SummaryOptions & { soreness?: string[]; injury_flags?: string[]; notes?: string };
type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function loadFromTraining(minutes?: number): "low" | "normal" | "high" | "unknown" {
  if (minutes === undefined) return "unknown";
  if (minutes >= 90) return "high";
  if (minutes <= 20) return "low";
  return "normal";
}

export async function buildWellnessContext(client: Pick<PolarClient, "get">, options: ContextOptions) {
  const summary = await buildDailySummary(client as PolarClient, options);
  const scorecard = record(summary.scorecard);
  const readiness = num(scorecard.ans_charge);
  const sleepScore = num(scorecard.sleep_score);
  const trainingMinutes = num(scorecard.training_minutes);
  const recentTrainingLoad = loadFromTraining(trainingMinutes);

  return {
    source: "polar",
    generated_at: summary.generated_at,
    readiness_score: readiness,
    sleep_score: sleepScore,
    recent_training_load: recentTrainingLoad,
    soreness: options.soreness ?? [],
    injury_flags: options.injury_flags ?? [],
    notes: [options.notes].filter((note): note is string => Boolean(note)),
    data_quality: summary.data_quality,
    telegram_summary: [
      "Polar wellness context",
      readiness !== undefined ? `Recharge: ${readiness}` : undefined,
      sleepScore !== undefined ? `Sleep: ${sleepScore}` : undefined,
      `Load: ${recentTrainingLoad}`
    ].filter(Boolean).join(" | ")
  };
}

export function formatWellnessContextMarkdown(context: Record<string, unknown>): string {
  return ["# Polar Wellness Context", "", JSON.stringify(context, null, 2)].join("\n");
}
