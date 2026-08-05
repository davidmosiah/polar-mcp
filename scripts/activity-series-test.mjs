import assert from 'node:assert/strict';
import { buildHeartSeries, SERIES_HARD_MAX_POINTS } from '../dist/services/series.js';

const origin = Date.parse('2026-07-15T06:00:00Z');
const records = [];
for (let i = 0; i < 3600; i++) {
  records.push({
    sampleTime: new Date(origin + i * 1000).toISOString(),
    heartRate: 100 + Math.sin(i / 60) * 20
  });
}
const series = buildHeartSeries({ records }, {
  activityId: '2026-07-15',
  resolutionSeconds: 60,
  maxPoints: 400,
  nominalDurationSeconds: 3600,
  startTime: '2026-07-15T06:00:00Z'
});
assert.equal(series.contract_version, 'agent-safe-series/v1');
assert.equal(series.source_points, 3600);
assert.ok(series.returned_points <= SERIES_HARD_MAX_POINTS);
assert.ok(series.downsampled);
assert.equal(series.data_quality.coverage_anchor, 'nominal_duration');
assert.ok(Math.abs(series.stats.avg - 100) < 2);
console.log(JSON.stringify({ ok: true, suite: 'activity-series', returned: series.returned_points, avg: series.stats.avg }));
