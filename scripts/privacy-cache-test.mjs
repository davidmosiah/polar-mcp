import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPrivacyAudit } from '../dist/services/audit.js';
import { PolarCache } from '../dist/services/cache.js';
import { applyPrivacy, normalizeStreams } from '../dist/services/privacy.js';
import { redactErrorMessage, redactSensitive } from '../dist/services/redaction.js';

const activity = {
  id: 't123',
  name: 'Morning Ride',
  sport: 'Ride',
  distance: 42,
  calories: 520,
  start_latlng: [40.1, -73.1],
  map: { summary_polyline: 'encoded' },
  averageHeartRate: 142
};

const structured = applyPrivacy('/training-sessions/list', activity, 'structured');
assert.equal(structured.id, 't123');
assert.equal(structured.averageHeartRate, 142);
assert.equal(structured.start_latlng, undefined);
assert.equal(structured.map, undefined);

const summary = applyPrivacy('/training-sessions/list', activity, 'summary');
assert.equal(summary.sport, 'Ride');
assert.equal(summary.calories, 520);
assert.equal(summary.map, undefined);

const raw = applyPrivacy('/training-sessions/list', activity, 'raw');
assert.equal(raw.map.summary_polyline, 'encoded');

const v4Sleep = {
  sleepDate: '2026-07-09',
  sleepResult: {
    hypnogram: {
      sleepStart: '2026-07-08T23:00:00-03:00',
      sleepEnd: '2026-07-09T07:00:00-03:00'
    }
  },
  sleepEvaluation: {
    asleepDuration: '27000s',
    analysis: { continuityIndex: 4.1 },
    phaseDurations: { deep: '5400s', rem: '6300s', light: '15300s' }
  },
  sleepScore: { sleepScore: 87, continuityScore: 82 }
};

const structuredSleep = applyPrivacy('/sleeps', v4Sleep, 'structured');
assert.equal(structuredSleep.sleepDate, '2026-07-09');
assert.equal(structuredSleep.sleepResult.hypnogram.sleepStart, '2026-07-08T23:00:00-03:00');
assert.equal(structuredSleep.sleepEvaluation.phaseDurations.deep, '5400s');
assert.equal(structuredSleep.sleepScore.sleepScore, 87);

const summarySleep = applyPrivacy('/sleeps', v4Sleep, 'summary');
assert.equal(summarySleep.date, '2026-07-09');
assert.equal(summarySleep.sleepStartTime, '2026-07-08T23:00:00-03:00');
assert.equal(summarySleep.sleepEndTime, '2026-07-09T07:00:00-03:00');
assert.equal(summarySleep.sleepDuration, '27000s');
assert.equal(summarySleep.sleepScore, 87);
assert.equal(summarySleep.continuity, 4.1);
assert.equal(summarySleep.deepSleep, '5400s');
assert.equal(summarySleep.remSleep, '6300s');
assert.equal(summarySleep.lightSleep, '15300s');

const streams = normalizeStreams({ heartrate: { data: [120, 121] }, latlng: { data: [[1, 2]] } }, 'structured', false);
assert.equal(streams.latlng, undefined);
assert.deepEqual(streams.heartrate.data, [120, 121]);

assert.equal(redactSensitive({ access_token: 'abc', nested: { client_secret: 'def' } }).access_token, '[REDACTED]');
assert.match(redactErrorMessage('Authorization: Bearer abc.def.ghi'), /REDACTED/);
assert.equal(buildPrivacyAudit().unofficial, true);
assert.equal(buildPrivacyAudit().gps_redaction_default, true);

const dir = mkdtempSync(join(tmpdir(), 'polar-mcp-cache-'));
try {
  const path = join(dir, 'cache.sqlite');
  const cache = new PolarCache(path);
  cache.set('GET', 'https://example.com/a', { ok: true });
  assert.deepEqual(cache.get('GET', 'https://example.com/a'), { ok: true });
  assert.equal(cache.status().entries, 1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, privacy: true, cache: true, redaction: true, audit: true }, null, 2));
