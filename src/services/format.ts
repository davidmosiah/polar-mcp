import type { ResponseFormat, ToolResponse } from "../types.js";
import { redactErrorMessage, redactSensitive } from "./redaction.js";

export function makeResponse<T>(data: T, format: ResponseFormat, markdown: string): ToolResponse<T> {
  const safeData = redactSensitive(data) as T;
  const safeMarkdown = redactErrorMessage(markdown);
  return {
    content: [{ type: "text", text: format === "json" ? JSON.stringify(safeData, null, 2) : safeMarkdown }],
    structuredContent: safeData
  };
}

export function makeError(error: unknown): ToolResponse<{ error: string }> {
  const safeMessage = logToolError(error);
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${safeMessage}` }],
    structuredContent: { error: safeMessage }
  };
}

export function logToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const safeMessage = redactErrorMessage(message);
  // Surface the failure on stderr so stdio clients (Claude Desktop, Hermes, etc.) persist it
  // to their MCP server log (e.g. ~/Library/Logs/Claude/mcp-server-polar.log). Handlers
  // otherwise fold every error into the tool result only, leaving that log with no trace of
  // what failed — which makes upstream HTTP/validation errors impossible to diagnose.
  const detail = error instanceof Error && error.stack ? error.stack : message;
  process.stderr.write(`[polar-mcp] tool error: ${redactErrorMessage(detail)}\n`);
  return safeMessage;
}

export function bulletList(title: string, fields: Record<string, unknown>): string {
  const lines = [`# ${title}`, ""];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    lines.push(`- **${key}**: ${formatMarkdownValue(value)}`);
  }
  return lines.join("\n");
}

export function formatCollection(title: string, records: unknown[], meta: Record<string, unknown>): string {
  const metaLines = Object.entries(meta)
    .filter(([key, value]) => key !== "records" && value !== undefined && value !== null)
    .map(([key, value]) => `- **${key}**: ${formatMarkdownValue(value)}`);
  const lines = [`# ${title}`, "", ...metaLines, ""];
  const preview = records.slice(0, 8);
  for (const [index, record] of preview.entries()) {
    if (record && typeof record === "object") {
      const object = record as Record<string, unknown>;
      const identifier = asRecord(object.identifier);
      const sleepScore = asRecord(object.sleepScore);
      const hypnogram = asRecord(asRecord(object.sleepResult)?.hypnogram);
      const id = object.id ?? object.id_str ?? identifier?.id ?? object.sleepDate ?? `item-${index + 1}`;
      lines.push(`## ${String(id)}`);
      pushPreviewField(lines, "name", object.name);
      if (object.startTime !== undefined) pushPreviewField(lines, "start_time", object.startTime);
      else if (object.sleepDate !== undefined) pushPreviewField(lines, "sleep_date", object.sleepDate);
      else if (object.start_date_local !== undefined) pushPreviewField(lines, "start_time", object.start_date_local);
      else if (object.start_date !== undefined) pushPreviewField(lines, "start_time", object.start_date);
      else if (object.created_at !== undefined) pushPreviewField(lines, "created", object.created_at);
      else pushPreviewField(lines, "updated", object.updated_at);
      pushPreviewField(lines, "sport", object.sport ?? object.sport_type ?? object.type);
      pushPreviewField(lines, "duration_ms", object.durationMillis);
      pushPreviewField(lines, "distance_m", object.distanceMeters ?? object.distance);
      pushPreviewField(lines, "moving_time_s", object.moving_time);
      pushPreviewField(lines, "calories", object.calories);
      pushPreviewField(lines, "hr_avg", object.hrAvg);
      pushPreviewField(lines, "hr_max", object.hrMax);
      pushPreviewField(lines, "training_benefit", object.trainingBenefit);
      pushPreviewField(lines, "recovery_time_ms", object.recoveryTimeMillis);
      pushPreviewField(lines, "sleep_score", sleepScore?.sleepScore ?? object.sleepScore);
      pushPreviewField(lines, "sleep_start", hypnogram?.sleepStart);
      pushPreviewField(lines, "sleep_end", hypnogram?.sleepEnd);
      pushPreviewField(lines, "elevation_m", object.total_elevation_gain);
      lines.push("");
    } else {
      lines.push(`- ${JSON.stringify(record)}`);
    }
  }
  if (records.length > preview.length) lines.push(`... ${records.length - preview.length} more records omitted from markdown preview.`);
  return lines.join("\n");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function pushPreviewField(lines: string[], label: string, value: unknown): void {
  if (value === undefined || value === null) return;
  lines.push(`- **${label}**: ${formatMarkdownValue(value)}`);
}

function formatMarkdownValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "none";
    if (value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) {
      return value.map((item) => String(item)).join(", ");
    }
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}
