import assert from 'node:assert/strict';
import { buildDailySummary, buildWeeklySummary } from '../dist/services/summary.js';
import { buildWellnessContext } from '../dist/services/context.js';

const today = new Date().toISOString().slice(0, 10);

const fakeClient = {
  async get(endpoint) {
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

console.log(JSON.stringify({ ok: true, daily: daily.kind, weekly: weekly.kind }, null, 2));
