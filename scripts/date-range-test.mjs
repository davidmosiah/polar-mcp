import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PolarClient } from '../dist/services/polar-client.js';

const dir = mkdtempSync(join(tmpdir(), 'polar-mcp-date-range-'));
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

const originalFetch = globalThis.fetch;
const originalNoCache = process.env.POLAR_NO_CACHE;
const requestedUrls = [];
process.env.POLAR_NO_CACHE = 'true';
globalThis.fetch = async (input) => {
  requestedUrls.push(String(input));
  return new Response('{"records":[]}', {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

try {
  const client = new PolarClient(config);

  await client.list('/nightly-recharge-results', {
    after: '2026-07-08',
    before: '2026-07-15'
  });
  const explicitRange = new URL(requestedUrls.at(-1));
  assert.equal(explicitRange.searchParams.get('from'), '2026-07-08');
  assert.equal(explicitRange.searchParams.get('to'), '2026-07-15');

  await client.list('/sleeps', {
    after: '2026-07-08T18:30:00-03:00',
    before: '2026-07-15T09:00:00-03:00'
  });
  const dateTimeRange = new URL(requestedUrls.at(-1));
  assert.equal(dateTimeRange.searchParams.get('from'), '2026-07-08');
  assert.equal(dateTimeRange.searchParams.get('to'), '2026-07-15');

  await client.list('/activity/list');
  const defaultRange = new URL(requestedUrls.at(-1));
  assert.match(defaultRange.searchParams.get('from') ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.match(defaultRange.searchParams.get('to') ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(defaultRange.searchParams.get('from'), defaultRange.searchParams.get('to'));

  await client.list('/sports/list', { date_param_style: 'none' });
  const noRange = new URL(requestedUrls.at(-1));
  assert.equal(noRange.searchParams.has('from'), false);
  assert.equal(noRange.searchParams.has('to'), false);

  await client.list('/training-target/calendar-targets', {
    after: '2026-07-08',
    before: '2026-07-15',
    date_param_style: 'fromDate_toDate'
  });
  const trainingTargetRange = new URL(requestedUrls.at(-1));
  assert.equal(trainingTargetRange.searchParams.get('fromDate'), '2026-07-08');
  assert.equal(trainingTargetRange.searchParams.get('toDate'), '2026-07-15');

  console.log(JSON.stringify({ ok: true, suite: 'date-range', requests: requestedUrls.length }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  if (originalNoCache === undefined) delete process.env.POLAR_NO_CACHE;
  else process.env.POLAR_NO_CACHE = originalNoCache;
  rmSync(dir, { recursive: true, force: true });
}
