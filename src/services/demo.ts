/**
 * Synthetic example payloads for `polar_demo`.
 *
 * The stated purpose of the demo tool is that agents see the contract *before*
 * calling the real Polar AccessLink API. That only holds if the examples match
 * what the server actually returns — an example advertising a field the server
 * never emits makes an agent write a parser for data that never arrives.
 *
 * These shapes are not hand-maintained guesses: `scripts/demo-contract-test.mjs`
 * runs the real `buildDailySummary` / `buildWellnessContext` /
 * `buildCollectionOutput` over a synthetic Polar stub and fails the build when
 * the key sets diverge in either direction (invented keys, or contract fields
 * missing from the example).
 *
 * If you change a builder's output shape, that gate fails and points here.
 * Update this file — do not weaken the gate.
 */

const DEMO_DATE = "2026-05-01";
const DEMO_PREVIOUS_DATE = "2026-04-30";
const DEMO_EARLIER_DATE = "2026-04-29";
const DEMO_TIMEZONE = "America/Fortaleza";
const DEMO_GENERATED_AT = "2026-05-01T23:59:00.000Z";

const DEMO_MEDICAL_DISCLAIMER =
  "This is not medical advice; use Polar as trend context and escalate symptoms or abnormal vitals to a clinician.";

/** Matching `buildDailySummary` — note the metrics live under `scorecard`, not at the top level. */
function demoDailySummary() {
  return {
    kind: "daily_summary",
    generated_at: DEMO_GENERATED_AT,
    window: {
      date: DEMO_DATE,
      days: 7,
      timezone: DEMO_TIMEZONE
    },
    data_quality: {
      confidence: "high",
      missing_or_failed: {
        activity: false,
        sleep: false,
        nightly_recharge: false,
        training_sessions: false,
        continuous_samples: false
      }
    },
    scorecard: {
      date: DEMO_DATE,
      sleep_score: 82,
      sleep_minutes: 451,
      sleep_start: "2026-04-30T23:12:00.000Z",
      sleep_end: "2026-05-01T06:43:00.000Z",
      continuity: 3.9,
      nightly_recharge_status: "good",
      ans_charge: 78,
      sleep_charge: 84,
      steps: 9854,
      active_calories: 612,
      total_calories: 2740,
      active_minutes: 78,
      training_sessions: 1,
      training_minutes: 52,
      training_calories: 486,
      average_heart_rate: 61,
      hrv_ms: 64,
      has_activity_error: false,
      has_sleep_error: false,
      has_recharge_error: false,
      has_training_error: false,
      has_continuous_error: false
    },
    diagnostic: {
      recovery_context: "stable_recharge",
      primary_signal:
        "Use Polar sleep, Nightly Recharge, activity and training sessions together as context, not diagnosis.",
      action_candidates: [
        "If subjective energy agrees, this is a reasonable day for planned training.",
        DEMO_MEDICAL_DISCLAIMER
      ]
    },
    safety: {
      medical_advice: false,
      api_boundary:
        "Polar AccessLink Dynamic API v4 exposes user-authorized activity, sleep, Nightly Recharge, samples, devices, routes and training data. This MCP is read-only and does not provide medical diagnosis."
    }
  };
}

/** Matching `buildWellnessContext` — Nightly Recharge ANS charge is `readiness_score`. */
function demoWellnessContext() {
  return {
    source: "polar",
    generated_at: DEMO_GENERATED_AT,
    readiness_score: 78,
    sleep_score: 82,
    recent_training_load: "normal",
    soreness: [] as string[],
    injury_flags: [] as string[],
    notes: [] as string[],
    data_quality: {
      confidence: "high",
      missing_or_failed: {
        activity: false,
        sleep: false,
        nightly_recharge: false,
        training_sessions: false,
        continuous_samples: false
      }
    },
    telegram_summary: "Polar wellness context | Recharge: 78 | Sleep: 82 | Load: normal"
  };
}

/**
 * Matching the envelope every `polar_list_*` tool returns, with records shaped by
 * the real Nightly Recharge normalizer.
 *
 * Shown in `summary` privacy mode because that projection is fully determined by
 * this server. In `structured` (the default) and `raw`, each record additionally
 * carries the upstream Polar fields — every key below still arrives, but the
 * record is not limited to them.
 */
function demoListNightlyRecharge() {
  return {
    endpoint: "/nightly-recharge-results",
    privacy_mode: "summary",
    count: 3,
    records: [
      {
        date: DEMO_DATE,
        status: "good",
        ansCharge: 78,
        sleepCharge: 84,
        hrv: 64,
        breathingRate: 14.1
      },
      {
        date: DEMO_PREVIOUS_DATE,
        status: "ok",
        ansCharge: 61,
        sleepCharge: 70,
        hrv: 58,
        breathingRate: 14.6
      },
      {
        date: DEMO_EARLIER_DATE,
        status: "compromised",
        ansCharge: 42,
        sleepCharge: 55,
        hrv: 49,
        breathingRate: 15.2
      }
    ],
    next_page: 2,
    has_more: true,
    pages_fetched: 1
  };
}

export function buildDemoPayload() {
  return {
    ok: true,
    is_demo: true,
    sample: {
      polar_daily_summary: demoDailySummary(),
      polar_wellness_context: demoWellnessContext(),
      polar_list_nightly_recharge: demoListNightlyRecharge()
    },
    notes: [
      "All sample data is synthetic; tagged with is_demo=true.",
      "Real calls return live data from the Polar AccessLink v4 API after OAuth setup.",
      "Field names and nesting match the real builders; a contract gate fails the build if they drift.",
      "Daily-summary metrics live under scorecard; values are undefined when Polar has no record for that day.",
      "List tools return this envelope for every endpoint; next_page is present only when has_more is true.",
      "List records are shown in summary privacy mode. structured (the default) and raw add the upstream Polar fields on top of these keys.",
      "Pair with wellness-nourish for recovery-aware meal coaching and wellness-cycle-coach for cycle-aware load adjustments."
    ]
  };
}
