import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PolarClient } from '../dist/services/polar-client.js';

const dir = mkdtempSync(join(tmpdir(), 'polar-mcp-endpoint-contract-'));
const tokenPath = join(dir, 'tokens.json');
writeFileSync(tokenPath, JSON.stringify({ access_token: 'test-token' }), { mode: 0o600 });

const client = new PolarClient({
  clientId: 'test-client',
  clientSecret: 'test-secret',
  redirectUri: 'http://127.0.0.1/callback',
  scopes: [],
  tokenPath,
  privacyMode: 'structured',
  cacheEnabled: false,
  cachePath: join(dir, 'cache.sqlite')
});

const originalFetch = globalThis.fetch;
const originalNoCache = process.env.POLAR_NO_CACHE;
const requestedUrls = [];
process.env.POLAR_NO_CACHE = 'true';

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requestedUrls.push(url);

  if (url.pathname.endsWith('/sleeps')) {
    const features = url.searchParams.getAll('features');
    const payload = features.length
      ? {
          nightSleeps: [{
            sleepDate: '2026-07-09',
            sleepResult: {
              hypnogram: {
                sleepStart: '2026-07-08T23:00:00-03:00',
                sleepEnd: '2026-07-09T07:00:00-03:00'
              }
            },
            sleepEvaluation: {
              asleepDuration: '27000s',
              phaseDurations: { deep: '5400s', rem: '6300s', light: '15300s' }
            },
            sleepScore: { sleepScore: 87, continuityScore: 82 }
          }]
        }
      : { nightSleeps: [{ sleepDate: '2026-07-09' }] };
    return Response.json(payload);
  }

  return Response.json({ records: [] });
};

try {
  const failures = [];

  requestedUrls.length = 0;
  await client.list('/training-sessions/list', {
    after: '2026-07-08',
    before: '2026-07-15'
  });
  const trainingUrl = requestedUrls.at(-1);
  try {
    assert.equal(trainingUrl.searchParams.get('from'), '2026-07-08T00:00:00');
    assert.equal(trainingUrl.searchParams.get('to'), '2026-07-15T00:00:00');
  } catch (error) {
    failures.push(error);
  }

  requestedUrls.length = 0;
  await client.list('/training-sessions/list', {});
  const defaultTrainingUrl = requestedUrls.at(-1);
  try {
    assert.match(defaultTrainingUrl.searchParams.get('from'), /^\d{4}-\d{2}-\d{2}T00:00:00$/);
    assert.match(defaultTrainingUrl.searchParams.get('to'), /^\d{4}-\d{2}-\d{2}T00:00:00$/);
  } catch (error) {
    failures.push(error);
  }

  requestedUrls.length = 0;
  await client.list('/training-sessions/list', {
    after: '2026-07-08T14:15:16.789-03:00',
    before: '2026-07-08T16:17Z'
  });
  const explicitTrainingUrl = requestedUrls.at(-1);
  try {
    assert.equal(explicitTrainingUrl.searchParams.get('from'), '2026-07-08T14:15:16');
    assert.equal(explicitTrainingUrl.searchParams.get('to'), '2026-07-08T16:17:00');
  } catch (error) {
    failures.push(error);
  }

  requestedUrls.length = 0;
  const sleeps = await client.list('/sleeps', {
    after: '2026-07-08',
    before: '2026-07-15'
  });
  const sleepUrls = requestedUrls.filter((url) => url.pathname.endsWith('/sleeps'));
  try {
    assert.equal(sleepUrls.length, 2, 'sleep list should index the range, then hydrate the available day');
    assert.deepEqual(sleepUrls[1].searchParams.getAll('features'), [
      'sleep-result',
      'sleep-evaluation',
      'sleep-score'
    ]);
    assert.equal(sleepUrls[1].searchParams.get('from'), '2026-07-09');
    assert.equal(sleepUrls[1].searchParams.get('to'), '2026-07-10');
    assert.equal(sleeps.records[0].sleepScore.sleepScore, 87);
    assert.equal(sleeps.records[0].sleepEvaluation.asleepDuration, '27000s');
  } catch (error) {
    failures.push(error);
  }

  if (failures.length) throw new AggregateError(failures, 'Polar endpoint contract regressions');

  console.log(JSON.stringify({ ok: true, suite: 'endpoint-contracts', requests: requestedUrls.length }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  if (originalNoCache === undefined) delete process.env.POLAR_NO_CACHE;
  else process.env.POLAR_NO_CACHE = originalNoCache;
  rmSync(dir, { recursive: true, force: true });
}
