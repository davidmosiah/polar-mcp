import assert from 'node:assert/strict';
import {
  fetchWithRetry,
  parseRetryAfter,
  RETRYABLE_STATUSES,
  MAX_ATTEMPTS
} from '../dist/services/http-retry.js';

assert.equal(parseRetryAfter(null), undefined);
assert.equal(parseRetryAfter(''), undefined);
assert.equal(parseRetryAfter('5'), 5000);
assert.equal(parseRetryAfter('0'), 0);
assert.equal(parseRetryAfter('1.5'), 1500);
assert.equal(parseRetryAfter('not-a-date'), undefined);

const baseNow = Date.parse('2026-05-19T10:00:00Z');
const futureHeader = new Date(baseNow + 7000).toUTCString();
assert.equal(parseRetryAfter(futureHeader, baseNow), 7000);
const pastHeader = new Date(baseNow - 5000).toUTCString();
assert.equal(parseRetryAfter(pastHeader, baseNow), 0);

for (const code of [408, 429, 500, 502, 503, 504]) {
  assert.ok(RETRYABLE_STATUSES.has(code), `${code} must be retryable`);
}
for (const code of [200, 301, 400, 401, 403, 404, 418]) {
  assert.ok(!RETRYABLE_STATUSES.has(code), `${code} must NOT be retryable`);
}
assert.equal(MAX_ATTEMPTS, 3);

function makeFetch(responses) {
  const calls = [];
  let i = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return r;
  };
  return { fetchImpl, calls };
}

function jsonResp(status, body = '', headers = {}) {
  return new Response(body, { status, headers });
}

const sleeps = [];
const sleepRecord = async (ms) => { sleeps.push(ms); };
const log = [];
const logger = (m) => { log.push(m); };

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl, calls } = makeFetch([jsonResp(200, '{}')]);
  const out = await fetchWithRetry('https://x/y', {}, { fetchImpl, sleep: sleepRecord, logger });
  assert.equal(out.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(sleeps.length, 0);
}

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl, calls } = makeFetch([jsonResp(503), jsonResp(200, '{}')]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger
  });
  assert.equal(out.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(sleeps[0], 500);
  assert.match(log[0], /\[polar-mcp\] retry 1\/3 after 500ms \(status=503\)/);
}

{
  sleeps.length = 0; log.length = 0;
  const r1 = jsonResp(429, '', { 'retry-after': '7' });
  const r2 = jsonResp(200, '{}');
  const { fetchImpl } = makeFetch([r1, r2]);
  await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger
  });
  assert.equal(sleeps[0], 7000);
}

{
  sleeps.length = 0; log.length = 0;
  const fixedNow = Date.parse('2026-05-19T10:00:00Z');
  const dateHeader = new Date(fixedNow + 4000).toUTCString();
  const { fetchImpl } = makeFetch([jsonResp(503, '', { 'retry-after': dateHeader }), jsonResp(200, '{}')]);
  await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger, now: () => fixedNow
  });
  assert.equal(sleeps[0], 4000);
}

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl, calls } = makeFetch([jsonResp(500), jsonResp(500), jsonResp(500)]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger
  });
  assert.equal(out.status, 500);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [500, 1000]);
}

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl } = makeFetch([new TypeError('fetch failed'), jsonResp(200, '{}')]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger
  });
  assert.equal(out.status, 200);
  assert.match(log[0], /error=fetch failed/);
}

{
  sleeps.length = 0; log.length = 0;
  const err = new TypeError('ECONNRESET');
  const { fetchImpl } = makeFetch([err, err, err]);
  let threw = false;
  try {
    await fetchWithRetry('https://x/y', {}, {
      fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger
    });
  } catch (e) {
    threw = true;
    assert.match(String(e.message ?? e), /ECONNRESET/);
  }
  assert.ok(threw);
}

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl, calls } = makeFetch([jsonResp(404)]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0.5, logger
  });
  assert.equal(out.status, 404);
  assert.equal(calls.length, 1);
}

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl, calls } = makeFetch([jsonResp(503), jsonResp(200, '{}')]);
  const out = await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, logger, noRetry: true
  });
  assert.equal(out.status, 503);
  assert.equal(calls.length, 1);
}

{
  sleeps.length = 0; log.length = 0;
  process.env.POLAR_NO_RETRY = 'true';
  try {
    const { fetchImpl, calls } = makeFetch([jsonResp(500), jsonResp(200, '{}')]);
    const out = await fetchWithRetry('https://x/y', {}, {
      fetchImpl, sleep: sleepRecord, logger
    });
    assert.equal(out.status, 500);
    assert.equal(calls.length, 1);
  } finally {
    delete process.env.POLAR_NO_RETRY;
  }
}

{
  sleeps.length = 0; log.length = 0;
  const { fetchImpl } = makeFetch([jsonResp(500), jsonResp(200, '{}')]);
  await fetchWithRetry('https://x/y', {}, {
    fetchImpl, sleep: sleepRecord, jitterRandom: () => 0, logger
  });
  assert.equal(sleeps[0], 400);

  sleeps.length = 0; log.length = 0;
  const { fetchImpl: f2 } = makeFetch([jsonResp(500), jsonResp(200, '{}')]);
  await fetchWithRetry('https://x/y', {}, {
    fetchImpl: f2, sleep: sleepRecord, jitterRandom: () => 0.999999, logger
  });
  assert.equal(sleeps[0], 600);
}

console.log(JSON.stringify({ ok: true, http_retry: true }, null, 2));
