import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildConnectionStatus } from '../dist/services/connection-status.js';
import { formatCollection } from '../dist/services/format.js';

const defaultScopes = 'activity:read calendar:read continuous_samples:read devices:read nightly_recharge:read ppi_data:read profile:read routes:read skin_contact:read sleep:read sports:read temperature_measurement:read tests:read training_sessions:read training_targets:read user_subscription:read';
const dir = mkdtempSync(join(tmpdir(), 'polar-mcp-agent-readiness-'));

try {
  const markdown = formatCollection('Polar Activities', [
    { id: 1, name: 'Morning Tennis', sport_type: 'Tennis', start_date: '2026-04-27T12:30:43Z', distance: 41.3 },
    { id: 2, name: 'Afternoon Tennis', sport_type: 'Tennis', start_date: '2026-04-26T20:05:51Z', distance: 4557 }
  ], {
    endpoint: '/1/user/-/activities/list.json',
    privacy_mode: 'summary',
    count: 2,
    records: [{ id: 1 }, { id: 2 }],
    pages_fetched: 1
  });

  assert.doesNotMatch(markdown, /\[object Object\]/, 'Markdown previews must never leak JavaScript object stringification.');
  assert.doesNotMatch(markdown, /\*\*records\*\*/i, 'Collection markdown should not duplicate full record arrays in metadata.');
  assert.match(markdown, /Morning Tennis/);

  const trainingMarkdown = formatCollection('Polar Training Sessions', [{
    identifier: { id: 'session-123' },
    startTime: '2026-07-10T06:30:00',
    sport: { id: 'running' },
    durationMillis: 3_600_000,
    distanceMeters: 10_000,
    calories: 620,
    hrAvg: 148,
    hrMax: 181,
    trainingBenefit: 'TEMPO_TRAINING',
    recoveryTimeMillis: 21_600_000
  }], {
    endpoint: '/training-sessions/list',
    privacy_mode: 'structured',
    count: 1,
    pages_fetched: 1
  });

  assert.match(trainingMarkdown, /## session-123/);
  assert.match(trainingMarkdown, /\*\*start_time\*\*: 2026-07-10T06:30:00/);
  assert.match(trainingMarkdown, /\*\*sport\*\*: \{"id":"running"\}/);
  assert.match(trainingMarkdown, /\*\*duration_ms\*\*: 3600000/);
  assert.match(trainingMarkdown, /\*\*distance_m\*\*: 10000/);
  assert.match(trainingMarkdown, /\*\*hr_avg\*\*: 148/);
  assert.match(trainingMarkdown, /\*\*training_benefit\*\*: TEMPO_TRAINING/);
  assert.doesNotMatch(trainingMarkdown, /n\/a/);

  const sleepMarkdown = formatCollection('Polar Sleeps', [{
    sleepDate: '2026-07-09',
    sleepScore: { sleepScore: 87 },
    sleepResult: {
      hypnogram: {
        sleepStart: '2026-07-08T23:00:00-03:00',
        sleepEnd: '2026-07-09T07:00:00-03:00'
      }
    }
  }], {
    endpoint: '/sleeps',
    privacy_mode: 'structured',
    count: 1,
    pages_fetched: 1
  });

  assert.match(sleepMarkdown, /## 2026-07-09/);
  assert.match(sleepMarkdown, /\*\*sleep_date\*\*: 2026-07-09/);
  assert.match(sleepMarkdown, /\*\*sleep_score\*\*: 87/);
  assert.match(sleepMarkdown, /\*\*sleep_start\*\*: 2026-07-08T23:00:00-03:00/);
  assert.match(sleepMarkdown, /\*\*sleep_end\*\*: 2026-07-09T07:00:00-03:00/);
  assert.doesNotMatch(sleepMarkdown, /n\/a/);

  const tokenPath = join(dir, 'tokens.json');
  writeFileSync(tokenPath, JSON.stringify({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: 2_000_000,
    scope: 'profile:read'
  }), { mode: 0o600 });

  const limited = await buildConnectionStatus({
    env: {
      POLAR_CLIENT_ID: 'client-id',
      POLAR_CLIENT_SECRET: 'client-secret',
      POLAR_REDIRECT_URI: 'http://127.0.0.1:4567/callback',
      POLAR_TOKEN_PATH: tokenPath
    },
    homeDir: dir,
    nowMs: 1_000_000
  });

  assert.equal(limited.ready_for_polar_api, false, 'A profile-only token should not be reported as fully ready for Polar health tools.');
  assert.equal(limited.ok, false);
  assert.deepEqual(limited.oauth.granted_scopes, ['profile:read']);
  assert.ok(limited.oauth.missing_recommended_scopes.includes('activity:read'));
  assert.ok(limited.oauth.missing_recommended_scopes.includes('sleep:read'));
  assert.equal(limited.oauth.activity_tools_ready, false);
  assert.equal(limited.oauth.profile_tools_ready, true);
  assert.ok(limited.next_steps.some((step) => /re-authorize/i.test(step) && /sleep:read/.test(step)));

  writeFileSync(tokenPath, JSON.stringify({
    access_token: 'access',
    refresh_token: 'refresh',
    expires_at: 2_000_000,
    scope: defaultScopes
  }), { mode: 0o600 });

  const ready = await buildConnectionStatus({
    env: {
      POLAR_CLIENT_ID: 'client-id',
      POLAR_CLIENT_SECRET: 'client-secret',
      POLAR_REDIRECT_URI: 'http://127.0.0.1:4567/callback',
      POLAR_TOKEN_PATH: tokenPath
    },
    homeDir: dir,
    nowMs: 1_000_000
  });

  assert.equal(ready.ok, true);
  assert.equal(ready.ready_for_polar_api, true);
  assert.deepEqual(ready.oauth.missing_recommended_scopes, []);
  assert.equal(ready.oauth.activity_tools_ready, true);

  console.log(JSON.stringify({ ok: true, markdown: true, scope_diagnostics: true }, null, 2));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
