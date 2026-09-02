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

const v4 = buildHeartSeries({
  records: [
    {
      date: '2026-08-23',
      deviceRef: { deviceId: 'dev-1' },
      samples: [
        { heartRate: 81, offsetMillis: 1000, triggerType: 'TRIGGER_TIMED_247' },
        { heartRate: 60, offsetMillis: 3000, triggerType: 'TRIGGER_TIMED_247' }
      ]
    },
    {
      date: '2026-08-23',
      deviceRef: { deviceId: 'dev-2' },
      samples: [
        { heartRate: 44, offsetMillis: 2000, triggerType: 'TRIGGER_TIMED_247' }
      ]
    }
  ]
}, { activityId: '2026-08-23', startTime: '2026-08-23T00:00:00' });
assert.equal(v4.source_points, 3);
assert.deepEqual(v4.points.map((p) => p.t), [1, 2, 3]);
assert.deepEqual(v4.points.map((p) => p.value), [81, 44, 60]);
assert.equal(v4.stats.min, 44);
assert.equal(v4.stats.max, 81);

const empty = (() => {
  try {
    buildHeartSeries({ records: [{ date: '2026-08-23', samples: [] }] }, { activityId: '2026-08-23' });
    return false;
  } catch (error) {
    assert.match(error.message, /No heart_rate samples/);
    return true;
  }
})();
assert.equal(empty, true);

console.log(JSON.stringify({ ok: true, suite: 'activity-series', returned: series.returned_points, avg: series.stats.avg, v4: v4.source_points }));

