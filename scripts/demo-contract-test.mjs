/**
 * Contract gate for `polar_demo`.
 *
 * The demo tool exists so agents can see the payload shape before calling the
 * real Polar AccessLink API. A hand-written example nobody compares against
 * reality drifts silently, and an agent that trusts it writes a parser for
 * fields that never arrive.
 *
 * This gate runs the REAL builders over a synthetic Polar stub client and
 * compares key sets against the demo payload, failing in both directions:
 *
 *   - a key in the demo that the builders never emit  -> invented contract
 *   - a key the builders emit that the demo omits     -> incomplete contract
 *
 * Arrays are compared as the union of their elements' key paths, because a real
 * list mixes complete and sparse records and either alone under-describes the
 * shape. Collection envelopes are unioned across a paginated and a final page,
 * so `next_page` is part of the contract an agent must know about.
 *
 * The repo has no recorded Polar fixture (the API needs live OAuth), so the stub
 * below plays the role of the fixture: synthetic values, real record field names,
 * driven through the real client-facing code path.
 */
import assert from 'node:assert/strict';
import { buildDailySummary } from '../dist/services/summary.js';
import { buildWellnessContext } from '../dist/services/context.js';
import { buildCollectionOutput } from '../dist/services/collection.js';
import { buildDemoPayload } from '../dist/services/demo.js';

const TIMEZONE = 'America/Fortaleza';
const RECHARGE_ENDPOINT = '/nightly-recharge-results';

/**
 * Synthetic Polar AccessLink v4 responses. Field names mirror the upstream API;
 * every value is fabricated. No real health data enters this repo.
 */
function stubClient(date) {
  return {
    async list(endpoint) {
      if (endpoint === '/activity/list') {
        return {
          records: [{ date, steps: 9854, activeCalories: 612, totalCalories: 2740, activeDuration: 4_680_000 }],
          pages_fetched: 1
        };
      }
      if (endpoint === '/sleeps') {
        return {
          records: [{
            sleepDate: date,
            sleepResult: { hypnogram: { sleepStart: `${date}T23:12:00.000Z`, sleepEnd: `${date}T06:43:00.000Z` } },
            sleepEvaluation: { asleepDuration: '27060s', analysis: { continuityIndex: 3.9 } },
            sleepScore: { sleepScore: 82 }
          }],
          pages_fetched: 1
        };
      }
      if (endpoint === RECHARGE_ENDPOINT) {
        return {
          records: [{ date, nightlyRechargeStatus: 'good', ansCharge: 78, sleepCharge: 84, hrv: 64, breathingRate: 14.1 }],
          pages_fetched: 1
        };
      }
      if (endpoint === '/training-sessions/list') {
        return {
          records: [{ id: 'demo-1', startTime: `${date}T17:05:00.000Z`, sport: 'RUNNING', duration: 3_120_000, calories: 486 }],
          pages_fetched: 1
        };
      }
      if (endpoint === '/continuous-samples') {
        return { records: [{ date, averageHeartRate: 61 }], pages_fetched: 1 };
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    }
  };
}

/** Two pages of Nightly Recharge, so the envelope union covers next_page/has_more. */
function rechargePages(dates) {
  return [
    {
      records: [{ date: dates[0], nightlyRechargeStatus: 'good', ansCharge: 78, sleepCharge: 84, hrv: 64, breathingRate: 14.1 }],
      next_page: 2,
      pages_fetched: 1
    },
    {
      records: [
        { date: dates[1], nightlyRechargeStatus: 'ok', ansCharge: 61, sleepCharge: 70, hrv: 58, breathingRate: 14.6 },
        { date: dates[2], nightlyRechargeStatus: 'compromised', ansCharge: 42, sleepCharge: 55, hrv: 49, breathingRate: 15.2 }
      ],
      pages_fetched: 2
    }
  ];
}

/**
 * Keys the builders only emit when Polar happens to hold that record type. The
 * demo shows them because they are part of the contract an agent may encounter.
 * Each entry needs a reason.
 *
 * This is deliberately narrow. Adding a key here to silence the gate defeats the
 * gate — only list fields genuinely conditional on upstream data.
 */
const OPTIONAL_IN_REAL = new Map([
  // No allowances needed today: the stub exercises every documented field.
  // Kept as the explicit, reviewable place to record one if that ever changes.
]);

function keyPaths(value, prefix = '', out = new Set()) {
  if (Array.isArray(value)) {
    // Union across elements: a list mixes complete and sparse records.
    for (const item of value) keyPaths(item, `${prefix}[]`, out);
    return out;
  }
  if (value === null || typeof value !== 'object') return out;
  for (const key of Object.keys(value)) {
    const p = prefix ? `${prefix}.${key}` : key;
    out.add(p);
    keyPaths(value[key], p, out);
  }
  return out;
}

function unionKeyPaths(values) {
  const out = new Set();
  for (const value of values) keyPaths(value, '', out);
  return out;
}

function diff(demoSet, realSet) {
  const invented = [...demoSet].filter((k) => !realSet.has(k)).sort();
  const missing = [...realSet]
    .filter((k) => !demoSet.has(k) && !OPTIONAL_IN_REAL.has(k))
    .sort();
  return { invented, missing };
}

function report(name, invented, missing) {
  const lines = [];
  if (invented.length > 0) {
    lines.push(
      `\n  ${name}: ${invented.length} key(s) in the demo that the real builder NEVER returns.`,
      `  An agent trusting these writes a parser for data that never arrives:`,
      ...invented.map((k) => `    - ${k}`)
    );
  }
  if (missing.length > 0) {
    lines.push(
      `\n  ${name}: ${missing.length} key(s) the real builder returns but the demo omits.`,
      `  Agents reading the demo will not know these exist:`,
      ...missing.map((k) => `    + ${k}`)
    );
  }
  return lines.join('\n');
}

const demo = buildDemoPayload().sample;

const today = new Date().toISOString().slice(0, 10);
const client = stubClient(today);
const rechargeDates = [today, today, today];

const real = {
  polar_daily_summary: [await buildDailySummary(client, { days: 7, timezone: TIMEZONE })],
  polar_wellness_context: [await buildWellnessContext(client, { days: 7, timezone: TIMEZONE, soreness: [], injury_flags: [] })],
  // Both pages: page 1 carries next_page, the last page does not.
  polar_list_nightly_recharge: rechargePages(rechargeDates).map((page) =>
    buildCollectionOutput(RECHARGE_ENDPOINT, 'summary', page)
  )
};

const failures = [];
let checked = 0;

for (const [name, realPayloads] of Object.entries(real)) {
  assert.ok(demo[name], `demo payload is missing the ${name} sample entirely`);
  const demoSet = keyPaths(demo[name]);
  const realSet = unionKeyPaths(realPayloads);
  const { invented, missing } = diff(demoSet, realSet);
  checked += demoSet.size;
  if (invented.length > 0 || missing.length > 0) {
    failures.push(report(name, invented, missing));
  } else {
    console.log(`PASS ${name} — ${demoSet.size} key paths match the real builder`);
  }
}

// The demo must stay honest about being synthetic, whatever the shape says.
const payload = buildDemoPayload();
assert.equal(payload.is_demo, true, 'demo payload must be tagged is_demo=true');
assert.ok(Array.isArray(payload.notes) && payload.notes.length > 0, 'demo payload must carry notes');
console.log('PASS demo payload is tagged synthetic');

// A demo that leaks the GPS/PII keys the privacy layer strips would re-teach
// agents the wrong contract.
const encoded = JSON.stringify(payload).toLowerCase();
for (const needle of ['latitude', 'longitude', 'polyline', 'latlng', 'access_token', 'refresh_token', 'email']) {
  assert.ok(!encoded.includes(needle), `demo payload must not contain "${needle}"`);
}
console.log('PASS demo payload carries no positional or credential keys');

if (failures.length > 0) {
  console.error('\nFAIL demo contract drifted from the real builders:');
  console.error(failures.join('\n'));
  console.error(
    '\nFix src/services/demo.ts so the examples match what the builders return.' +
      '\nDo not widen OPTIONAL_IN_REAL to silence this — that is how the drift got here.\n'
  );
  process.exit(1);
}

console.log(`\ndemo-contract: ${checked} key paths verified against the real builders`);
console.log(JSON.stringify({ ok: true, suite: 'demo-contract', samples: Object.keys(real).length }));
