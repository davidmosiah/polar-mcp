import assert from 'node:assert/strict';
import { extractRecords } from '../dist/services/polar-client.js';

assert.deepEqual(extractRecords({}), []);
assert.deepEqual(extractRecords({ data: {} }), []);
assert.deepEqual(extractRecords({ trainingSessions: [] }), []);
assert.deepEqual(extractRecords([]), []);
assert.deepEqual(extractRecords({ records: [{}] }), []);

const one = { id: 't1', startTime: '2026-08-23T12:00:00', sport: 'RUNNING' };
assert.deepEqual(extractRecords({ trainingSessions: [one] }), [one]);
assert.deepEqual(extractRecords({ records: [one] }), [one]);
assert.deepEqual(extractRecords(one), [one]);

const a = { id: 'a', startTime: '2026-08-22T08:00:00' };
const b = { id: 'b', startTime: '2026-08-23T09:00:00' };
assert.deepEqual(extractRecords({ trainingSessions: [a, b] }), [a, b]);
assert.deepEqual(extractRecords({ records: [a, {}, b] }), [a, b]);

const nr = {
  sleepResultDate: '2026-08-23',
  ansStatus: -3.96,
  recoveryIndicator: 4,
  meanNightlyRecoveryRmssd: 98,
  meanNightlyRecoveryRri: 1202
};
assert.deepEqual(extractRecords({ nightlyRechargeResults: [nr] }), [nr]);

console.log(JSON.stringify({ ok: true, suite: 'extract-records' }));
