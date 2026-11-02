import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { buildDenseCollectionOutput } from '../dist/services/dense-collection.js';
import { DenseCollectionInputSchema, DenseCollectionOutputSchema } from '../dist/schemas/common.js';
import { registerPolarTools } from '../dist/tools/polar-tools.js';
import { PolarClient } from '../dist/services/polar-client.js';

let cases = 0;
function check(name, fn) { fn(); cases++; console.log(`PASS ${name}`); }
const record = { samples: [1, 2, 3] }; // Five values: record, array, three numbers.
const result = { records: [record, record], pages_fetched: 1, next_page: 2 };
const build = (budget, mode = 'raw', records = result.records) => buildDenseCollectionOutput('/ppi-samples', mode, { ...result, records }, budget);
check('exact boundary preserves complete records', () => {
  const output = build(10); assert.deepEqual(output.records, [record, record]); assert.equal(output.budget_used, 10); assert.equal(output.truncated, false);
});
check('one below drops a whole record, not values', () => {
  const output = build(9); assert.deepEqual(output.records, [record]); assert.equal(output.omitted_records, 1); assert.equal(output.budget_used, 5); assert.equal(output.next_page, 2); assert.equal(output.has_more, true);
});
check('oversized first record cannot block later small record', () => {
  const output = build(5, 'raw', [{ samples: Array(100).fill(1) }, record]); assert.deepEqual(output.records, [record]); assert.equal(output.omitted_records, 1);
});
check('nested and unknown arrays share one budget', () => {
  assert.equal(build(5, 'raw', [{ unknown: { nested: [1, 2, 3] } }]).records.length, 0);
});
check('mapping samples are bounded too', () => {
  assert.equal(build(5, 'raw', [{ samples: { a: 1, b: 2, c: 3, d: 4 } }]).records.length, 0);
});
check('all privacy modes enforce before normalization', () => {
  for (const mode of ['summary', 'structured', 'raw']) assert.equal(build(4, mode).records.length, 0);
});
check('deep nesting rejects without recursive stack overflow', () => {
  let value = 0; for (let i = 0; i < 20000; i++) value = [value];
  assert.equal(build(5000, 'raw', [value]).omitted_records, 1);
});
check('invalid direct helper budgets reject', () => {
  for (const value of [NaN, Infinity, -1, 0, 1.5, 5001, undefined]) assert.throws(() => build(value), /max_points/);
});
check('schema defaults, hard maximum and invalid values', () => {
  assert.equal(DenseCollectionInputSchema.parse({}).max_points, 2000);
  for (const max_points of [0, -1, 1.5, 5001, Infinity, NaN]) assert.equal(DenseCollectionInputSchema.safeParse({ max_points }).success, false);
  DenseCollectionOutputSchema.parse(build(5));
});
check('empty input is not marked truncated', () => {
  const output = build(1, 'raw', []); assert.equal(output.truncated, false); assert.equal(output.budget_used, 0);
});

// Exercise registered handlers, not only a parallel reimplementation. No provider calls.
const tools = new Map();
registerPolarTools({ registerTool(name, options, handler) { tools.set(name, { options, handler }); } });
const fixtureHome = mkdtempSync(join(tmpdir(), 'polar-dense-fixture-'));
process.env.HOME = fixtureHome;
for (const key of Object.keys(process.env)) if (key.startsWith('POLAR_')) delete process.env[key];
process.env.POLAR_CLIENT_ID = 'fixture';
process.env.POLAR_CLIENT_SECRET = 'fixture';
process.env.POLAR_REDIRECT_URI = 'http://127.0.0.1/callback';
const originalList = PolarClient.prototype.list;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network is forbidden in this fixture'); };
PolarClient.prototype.list = async () => result;
try {
  for (const name of ['polar_list_continuous_samples', 'polar_list_ppi_samples']) {
    const { options, handler } = tools.get(name);
    assert.ok(options.inputSchema.max_points);
    assert.ok(options.outputSchema.contract_version);
    for (const response_format of ['json', 'markdown']) {
      const params = z.object(options.inputSchema).parse({ max_points: 5, response_format, privacy_mode: 'raw', explicit_user_intent: true });
      const response = await handler(params);
      assert.notEqual(response.isError, true);
      assert.equal(response.structuredContent.records.length, 1);
      assert.equal(response.structuredContent.omitted_records, 1);
      assert.equal(response.structuredContent.truncated, true);
      DenseCollectionOutputSchema.parse(response.structuredContent);
      if (response_format === 'markdown') assert.match(response.content[0].text, /omitted records: 1; truncated: true/);
      else assert.equal(JSON.parse(response.content[0].text).omitted_records, 1);
      cases++;
    }
  }
} finally { PolarClient.prototype.list = originalList; globalThis.fetch = originalFetch; rmSync(fixtureHome, { recursive: true, force: true }); }
console.log(`PASS ${cases} dense collection checks; no provider/network calls`);
