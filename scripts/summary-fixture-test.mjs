import assert from 'node:assert/strict';
import { buildDailySummary, buildWeeklySummary } from '../dist/services/summary.js';
import { buildWellnessContext } from '../dist/services/context.js';

const today = new Date().toISOString().slice(0, 10);
const summaryRequests = [];

const fakeClient = {
  async get(endpoint, params) {
    summaryRequests.push({ endpoint, params });
    if (endpoint.includes('/activity/list')) {
      return { activity: [{ date: today, steps: 9000, activeCalories: 520, totalCalories: 2400, activeDuration: 7200000 }] };
    }
    if (endpoint.includes('/sleeps')) {
      return { sleeps: [{ date: today, sleepDuration: 25800000, sleepScore: 88, continuity: 3.8 }] };
    }
    if (endpoint.includes('/nightly-recharge-results')) {
      return { nightlyRechargeResults: [{ date: today, nightlyRechargeStatus: 'good', ansCharge: 82, sleepCharge: 88, hrv: 48.2 }] };
    }
    if (endpoint.includes('/training-sessions/list')) {
      return { trainingSessions: [{ id: 't1', startTime: `${today}T12:00:00Z`, sport: 'RUNNING', duration: 3600000, calories: 640 }] };
    }
    if (endpoint.includes('/continuous-samples')) {
      return { continuousSamples: [{ date: today, averageHeartRate: 62 }] };
    }
    throw new Error(`unexpected endpoint ${endpoint}`);
  },
  async list(endpoint, params) {
    const payload = await this.get(endpoint, params);
    const key = Object.keys(payload)[0];
    return { records: payload[key], pages_fetched: 1 };
  }
};

const daily = await buildDailySummary(fakeClient, { days: 7, timezone: 'UTC' });
assert.equal(daily.kind, 'daily_summary');
assert.equal(daily.scorecard.steps, 9000);
assert.equal(daily.scorecard.sleep_minutes, 430);
assert.equal(daily.scorecard.sleep_score, 88);
assert.equal(daily.scorecard.training_sessions, 1);
assert.equal(daily.scorecard.hrv_ms, 48.2);
assert.ok(daily.diagnostic.action_candidates.length >= 2);

const weekly = await buildWeeklySummary(fakeClient, { days: 7, compare_days: 7, timezone: 'UTC' });
assert.equal(weekly.kind, 'weekly_summary');
assert.equal(weekly.scorecard.current.days, 7);
assert.equal(weekly.scorecard.current.avg_sleep_hours, 7.17);
assert.equal(weekly.scorecard.current.avg_sleep_score, 88);
assert.equal(weekly.scorecard.current.total_training_sessions, 7);
assert.ok(weekly.diagnostic.bottlenecks.length >= 1);

const context = await buildWellnessContext(fakeClient, { days: 7, timezone: 'UTC' });
assert.equal(context.source, 'polar');
assert.equal(context.readiness_score, 82);
assert.equal(context.sleep_score, 88);
assert.equal(context.recent_training_load, 'normal');
assert.ok(summaryRequests.length > 0);
for (const request of summaryRequests) {
  assert.match(request.params?.after ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.match(request.params?.before ?? '', /^\d{4}-\d{2}-\d{2}$/);
}
assert.ok(summaryRequests.some((request) => request.endpoint === '/activity/list' && request.params?.after));

const v4SummaryClient = {
  async list(endpoint) {
    if (endpoint === '/activity/list') return { records: [{ date: today, steps: 7200 }], pages_fetched: 1 };
    if (endpoint === '/sleeps') {
      return {
        records: [{
          sleepDate: today,
          sleepResult: {
            hypnogram: {
              sleepStart: `${today}T00:00:00Z`,
              sleepEnd: `${today}T07:30:00Z`
            }
          },
          sleepEvaluation: {
            asleepDuration: '27000s',
            analysis: { continuityIndex: 4.2 },
            phaseDurations: { deep: '5400s', rem: '6300s', light: '15300s' }
          },
          sleepScore: { sleepScore: 91 }
        }],
        pages_fetched: 2
      };
    }
    if (endpoint === '/nightly-recharge-results') return { records: [], pages_fetched: 1 };
    if (endpoint === '/training-sessions/list') return { records: [], pages_fetched: 1 };
    if (endpoint === '/continuous-samples') return { records: [], pages_fetched: 1 };
    throw new Error(`unexpected endpoint ${endpoint}`);
  }
};

const v4Daily = await buildDailySummary(v4SummaryClient, { days: 1, timezone: 'UTC' });
assert.equal(v4Daily.data_quality.confidence, 'high');
assert.equal(v4Daily.scorecard.steps, 7200);
assert.equal(v4Daily.scorecard.sleep_score, 91);
assert.equal(v4Daily.scorecard.sleep_minutes, 450);
assert.equal(v4Daily.scorecard.continuity, 4.2);
assert.equal(v4Daily.scorecard.sleep_start, `${today}T00:00:00Z`);
assert.equal(v4Daily.scorecard.sleep_end, `${today}T07:30:00Z`);

const originalStderrWrite = process.stderr.write.bind(process.stderr);
let stderr = '';
process.stderr.write = ((chunk) => {
  stderr += String(chunk);
  return true;
});
try {
  const partial = await buildDailySummary({
    async list(endpoint) {
      throw new Error(`fixture failure for ${endpoint}`);
    }
  }, { days: 1, timezone: 'UTC' });
  assert.equal(partial.data_quality.confidence, 'partial');
  assert.equal(partial.data_quality.missing_or_failed.sleep, true);
} finally {
  process.stderr.write = originalStderrWrite;
}
assert.match(stderr, /\[polar-mcp\] tool error: Error: fixture failure for \/sleeps/);

console.log(JSON.stringify({ ok: true, daily: daily.kind, weekly: weekly.kind }, null, 2));
