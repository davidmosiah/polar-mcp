import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  collapseActivityRecords,
  normalizeActivityRecords,
  stepsForActivityDay,
  sumPolarStepSamples
} from '../dist/services/activity.js';
import { PolarClient } from '../dist/services/polar-client.js';
import { applyPrivacy } from '../dist/services/privacy.js';

function dayRecord(date, deviceId, steps) {
  return {
    date,
    activitiesPerDevice: [{
      deviceReference: { deviceId },
      activitySamples: [{
        activityInfos: [],
        inactivityInfos: [],
        stepSamples: { startTime: '00:00:00', interval: 60000, steps }
      }]
    }]
  };
}

const emptyShell = { date: '2026-08-16', activitiesPerDevice: [] };
assert.equal(sumPolarStepSamples(emptyShell), undefined);
assert.equal(stepsForActivityDay([emptyShell]), undefined);

const zeroBuckets = dayRecord('2026-08-16', 'C4F60122', [0, 0, 0]);
assert.equal(sumPolarStepSamples(zeroBuckets), 0);
assert.equal(stepsForActivityDay([zeroBuckets]), 0);

const incremental = dayRecord('2026-08-16', 'C4F60122', [0, 2, 2, 6, 10]);
assert.equal(sumPolarStepSamples(incremental), 20);

const duplicated = collapseActivityRecords([
  dayRecord('2026-08-17', 'C4F60122', [10, 10]),
  dayRecord('2026-08-17', 'C4F60122', [10, 10])
]);
assert.equal(duplicated.length, 1);
assert.equal(stepsForActivityDay(duplicated), 20);

const twoDevices = normalizeActivityRecords([
  dayRecord('2026-08-17', 'C4F60122', [10, 10]),
  dayRecord('2026-08-17', 'H7', [5])
]);
assert.equal(twoDevices.length, 2);
assert.equal(stepsForActivityDay(twoDevices), 25);

const overlapLeak = [
  dayRecord('2026-08-16', 'C4F60122', [1, 2]),
  dayRecord('2026-08-17', 'C4F60122', [3, 4]),
  dayRecord('2026-08-17', 'C4F60122', [3, 4]),
  dayRecord('2026-08-18', 'C4F60122', [5])
];
assert.equal(stepsForActivityDay(overlapLeak.filter((row) => row.date === '2026-08-17')), 7);

const annotated = normalizeActivityRecords([incremental, incremental]);
assert.equal(annotated.length, 1);
assert.equal(annotated[0].steps, 20);
assert.ok(annotated[0].activitiesPerDevice[0].activitySamples[0].stepSamples.steps.length);

const summaryPrivacy = applyPrivacy('/activity/list', incremental, 'summary');
assert.equal(summaryPrivacy.steps, 20);
assert.equal(applyPrivacy('/activity/list', emptyShell, 'summary').steps, undefined);

const dir = mkdtempSync(join(tmpdir(), 'polar-mcp-activity-dedupe-'));
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
process.env.POLAR_NO_CACHE = 'true';
const requestedUrls = [];

const sampleDays = {
  '2026-08-16': dayRecord('2026-08-16', 'C4F60122', [100, 200]),
  '2026-08-17': dayRecord('2026-08-17', 'C4F60122', [10, 20, 30]),
  '2026-08-18': dayRecord('2026-08-18', 'C4F60122', [7, 8])
};

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requestedUrls.push(url);
  const features = url.searchParams.getAll('features');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!features.includes('samples')) {
    return Response.json({
      records: ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19'].map((date) => ({ date, activitiesPerDevice: [] }))
    });
  }
  const records = [];
  if (from && sampleDays[from]) records.push(sampleDays[from]);
  if (to && sampleDays[to] && to !== from) records.push(sampleDays[to]);
  return Response.json({ records });
};

try {
  requestedUrls.length = 0;
  const listed = await client.list('/activity/list', { after: '2026-08-16', before: '2026-08-19', limit: 30 });
  const dates = listed.records.map((row) => row.date);
  assert.deepEqual(dates, ['2026-08-16', '2026-08-17', '2026-08-18']);
  assert.equal(listed.records[0].steps, 300);
  assert.equal(listed.records[1].steps, 60);
  assert.equal(listed.records[2].steps, 15);
  assert.ok(requestedUrls.some((url) => url.searchParams.getAll('features').includes('samples')));

  requestedUrls.length = 0;
  const override = await client.list('/activity/list', { after: '2026-08-16', before: '2026-08-19', features: [] });
  assert.equal(override.records.length, 3);
  assert.deepEqual(override.records.map((row) => row.date), ['2026-08-16', '2026-08-17', '2026-08-18']);
  assert.equal(override.records[0].steps, undefined);
  assert.deepEqual(override.records[0].activitiesPerDevice, []);
  assert.equal(requestedUrls.every((url) => !url.searchParams.getAll('features').includes('samples')), true);

  const oneDay = await client.list('/activity/list', { after: '2026-08-17', before: '2026-08-18' });
  assert.deepEqual(oneDay.records.map((row) => row.date), ['2026-08-17']);
  assert.equal(oneDay.records[0].steps, 60);

  requestedUrls.length = 0;
  await client.list('/sleeps', { after: '2026-08-16', before: '2026-08-19' });
  const sleepHydrate = requestedUrls.filter((url) => url.pathname.endsWith('/sleeps') && url.searchParams.getAll('features').length);
  if (sleepHydrate.length) {
    const hydrate = sleepHydrate[0];
    const from = hydrate.searchParams.get('from');
    const to = hydrate.searchParams.get('to');
    assert.notEqual(from, to, 'sleep hydrate window stays from=D to=D+1');
  }

  console.log(JSON.stringify({ ok: true, suite: 'activity-dedupe', dates, steps: listed.records.map((row) => row.steps) }));
} finally {
  globalThis.fetch = originalFetch;
  if (originalNoCache === undefined) delete process.env.POLAR_NO_CACHE;
  else process.env.POLAR_NO_CACHE = originalNoCache;
  rmSync(dir, { recursive: true, force: true });
}
