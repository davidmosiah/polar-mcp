import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PolarClient } from '../dist/services/polar-client.js';

const dir = mkdtempSync(join(tmpdir(), 'polar-mcp-endpoint-contract-'));
const tokenPath = join(dir, 'tokens.json');
writeFileSync(tokenPath, JSON.stringify({ access_token: 'test-token' }), { mode: 0o600 });

const config = {
  clientId: 'test-client',
  clientSecret: 'test-secret',
  redirectUri: 'http://127.0.0.1/callback',
  scopes: [],
  tokenPath,
  privacyMode: 'structured',
  cacheEnabled: false,
  cachePath: join(dir, 'cache.sqlite')
};
const client = new PolarClient(config);

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

  // Issue #4 / bug 6: calendar wants naive datetime; training targets want from/to plain dates.
  requestedUrls.length = 0;
  await client.list('/calendar/list', {
    after: '2026-07-08',
    before: '2026-07-15'
  });
  const calendarUrl = requestedUrls.at(-1);
  try {
    assert.equal(calendarUrl.searchParams.get('from'), '2026-07-08T00:00:00');
    assert.equal(calendarUrl.searchParams.get('to'), '2026-07-15T00:00:00');
  } catch (error) {
    failures.push(error);
  }

  requestedUrls.length = 0;
  await client.list('/calendar/list', {
    after: '2026-07-08T14:15:16.789-03:00',
    before: '2026-07-08T16:17Z'
  });
  const calendarDateTimeUrl = requestedUrls.at(-1);
  try {
    assert.equal(calendarDateTimeUrl.searchParams.get('from'), '2026-07-08T14:15:16');
    assert.equal(calendarDateTimeUrl.searchParams.get('to'), '2026-07-08T16:17:00');
  } catch (error) {
    failures.push(error);
  }

  requestedUrls.length = 0;
  await client.list('/training-target/calendar-targets', {
    after: '2026-07-08',
    before: '2026-07-15'
  });
  const trainingTargetUrl = requestedUrls.at(-1);
  try {
    assert.equal(trainingTargetUrl.searchParams.get('from'), '2026-07-08');
    assert.equal(trainingTargetUrl.searchParams.get('to'), '2026-07-15');
    assert.equal(trainingTargetUrl.searchParams.has('fromDate'), false);
    assert.equal(trainingTargetUrl.searchParams.has('toDate'), false);
  } catch (error) {
    failures.push(error);
  }

  if (failures.length) throw new AggregateError(failures, 'Polar endpoint contract regressions');

  // Exercise the real authenticated request path; cache operations are a generic
  // method+URL Map double. No SQLite constructor, token refresh or network runs.
  const persistentCases = [
    { name: 'initial success', cacheEnabled: true, outcome: 'success' },
    { name: 'refreshed success', cacheEnabled: true, refresh: true, outcome: 'success' },
    { name: 'initial HTTP error', cacheEnabled: true, outcome: 'http' },
    { name: 'refreshed HTTP error', cacheEnabled: true, refresh: true, outcome: 'http' },
    { name: 'same credential HTTP error', cacheEnabled: true, sameCredential: true, outcome: 'http' },
    { name: 'disabled cache HTTP error', cacheEnabled: false, outcome: 'http' },
    { name: 'transport error', cacheEnabled: true, outcome: 'transport' },
    { name: 'response read error', cacheEnabled: true, outcome: 'read' },
  ];
  for (const scenario of persistentCases) {
    const scoped = new PolarClient({ ...config, cacheEnabled: scenario.cacheEnabled });
    const url = 'https://www.polaraccesslink.com/v4/data/users/me';
    const key = `GET ${url}`;
    const stale = { marker: 'synthetic-existing-cache-entry' };
    const cached = new Map([[key, stale]]);
    const calls = { opens: 0, gets: 0, sets: 0, refreshes: 0, requests: [] };
    const storage = {
      get(method, requestUrl) { calls.gets++; return cached.get(`${method} ${requestUrl}`); },
      set(method, requestUrl, payload) { calls.sets++; cached.set(`${method} ${requestUrl}`, payload); },
      status() { return { enabled: true, path: 'synthetic-cache.sqlite', entries: cached.size }; },
    };
    scoped.getCache = () => { calls.opens++; return storage; };
    let credential = 'synthetic-A';
    scoped.getValidToken = async () => ({ access_token: credential });
    scoped.refreshToken = async () => { calls.refreshes++; return { access_token: 'synthetic-refreshed' }; };
    const error = new Error(`synthetic ${scenario.outcome} failure`);
    let phase = 'first';
    scoped.fetchWithRetry = async (requestUrl, init) => {
      calls.requests.push({ url: requestUrl, authorization: new Headers(init.headers).get('Authorization') });
      if (phase === 'first') return Response.json({ marker: 'synthetic-fresh-A' });
      if (scenario.refresh && calls.refreshes === 0) return new Response('', { status: 401 });
      if (scenario.outcome === 'transport') throw error;
      if (scenario.outcome === 'read') {
        const response = new Response('', { status: 200 });
        response.text = async () => { throw error; };
        return response;
      }
      if (scenario.outcome === 'http') return Response.json({ message: 'synthetic unavailable' }, { status: 503 });
      return Response.json({ marker: 'synthetic-fresh-B' });
    };
    assert.deepEqual(await scoped.get('/users/me'), { marker: 'synthetic-fresh-A' }, scenario.name);
    phase = 'second';
    if (!scenario.sameCredential) credential = 'synthetic-B';
    if (scenario.outcome === 'success') {
      assert.deepEqual(await scoped.get('/users/me'), { marker: 'synthetic-fresh-B' }, scenario.name);
    } else if (scenario.outcome === 'http') {
      await assert.rejects(() => scoped.get('/users/me'), /Polar API HTTP 503/, scenario.name);
    } else {
      await assert.rejects(() => scoped.get('/users/me'), observed => observed === error, scenario.name);
    }
    assert.equal(calls.opens, 0, `${scenario.name}: authenticated payloads must not open persistent cache`);
    assert.equal(calls.gets, 0, `${scenario.name}: authenticated errors must not read fallback`);
    assert.equal(calls.sets, 0, `${scenario.name}: authenticated successes must not persist payloads`);
    assert.deepEqual([...cached.entries()], [[key, stale]], `${scenario.name}: existing cache entries stay untouched`);
    assert.equal(scoped.cacheStatus().enabled, false, `${scenario.name}: cache status must not report a persistent cache that authenticated reads never use`);
    assert.equal(calls.opens, 0, `${scenario.name}: cache status must not open persistent cache`);
    assert.equal(calls.refreshes, scenario.refresh ? 1 : 0, scenario.name);
    assert.deepEqual(calls.requests.map(r => r.url), Array(scenario.refresh ? 3 : 2).fill(url), scenario.name);
    assert.deepEqual(calls.requests.map(r => r.authorization), [
      'Bearer synthetic-A',
      scenario.sameCredential ? 'Bearer synthetic-A' : 'Bearer synthetic-B',
      ...(scenario.refresh ? ['Bearer synthetic-refreshed'] : []),
    ], scenario.name);
  }
  console.log(JSON.stringify({ ok: true, suite: 'endpoint-contracts', requests: requestedUrls.length, persistent_cases: persistentCases.length }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  if (originalNoCache === undefined) delete process.env.POLAR_NO_CACHE;
  else process.env.POLAR_NO_CACHE = originalNoCache;
  rmSync(dir, { recursive: true, force: true });
}
