import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

function userPrompt(text: string) {
  return { messages: [{ role: "user" as const, content: { type: "text" as const, text } }] };
}

export function registerPolarPrompts(server: McpServer): void {
  server.registerPrompt("polar_daily_checkin", {
    title: "Polar Daily Check-in",
    description: "Ask an agent to create a practical daily health and training check-in from Polar.",
    argsSchema: { focus: z.string().optional().describe("Optional focus, e.g. sleep, training, recovery, Nightly Recharge, HRV.") }
  }, ({ focus }) => userPrompt(`Use Polar MCP for a daily check-in${focus ? ` focused on ${focus}` : ""}.

Required flow:
1. Call polar_connection_status.
2. If ready, call polar_daily_summary with response_format=json.
3. Only drill into low-level tools if the summary shows a concrete question.

Return:
- main signal
- what changed or needs attention
- 3 practical actions for today
- confidence and missing data
- no medical diagnosis.`));

  server.registerPrompt("polar_weekly_review", {
    title: "Polar Weekly Review",
    description: "Ask an agent to review Polar trends across activity, sleep and heart context.",
    argsSchema: { goal: z.string().optional().describe("Optional goal, e.g. fat loss, tennis conditioning, endurance base, sleep repair.") }
  }, ({ goal }) => userPrompt(`Use Polar MCP for a weekly review${goal ? ` for this goal: ${goal}` : ""}.

Required flow:
1. Call polar_connection_status.
2. Call polar_weekly_summary with response_format=json.
3. Use polar_list_sleeps, polar_list_nightly_recharge, polar_list_activity or polar_list_training_sessions only to investigate specific bottlenecks.

Return:
- scorecard
- bottlenecks
- next-week actions
- risks/unknowns
- no medical diagnosis.`));

  server.registerPrompt("polar_training_load_investigation", {
    title: "Polar Training Load Investigation",
    description: "Investigate Polar training sessions and adjacent sleep/recovery context when API access permits it.",
    argsSchema: { after: z.string().describe("Start date (YYYY-MM-DD) or local ISO 8601 date-time"), before: z.string().optional().describe("Optional end date or local ISO 8601 date-time") }
  }, ({ after, before }) => userPrompt(`Call polar_list_training_sessions with after=${after}${before ? `, before=${before}` : ""}, response_format=json. If recovery context is needed, call polar_list_sleeps and polar_list_nightly_recharge for the same range.

Explain:
- what the training sessions can and cannot prove
- load, recovery and sleep context
- notable missing data or permission limits
- no diagnosis or alarmism.`));
}
