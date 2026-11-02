import test from 'node:test';
import assert from 'node:assert/strict';
import { targetFor, meetsTarget, meetsMaxTarget, cleanTargets, invalidCells, normBranch } from '../src/lib/targets.js';
import { monthCoverage, namesWithEntities, similarNames, apiChecks } from '../src/lib/dataQuality.js';
import { METRICS } from '../src/lib/quality.js';

test('target lookup ignores extra spaces and returns null when missing', () => {
  const t = { delivery: { 'فرع طنطا': 92 } };
  assert.equal(targetFor(t, 'delivery', '  فرع   طنطا '), 92);
  assert.equal(targetFor(t, 'firstAttempt', 'فرع طنطا'), null);
  assert.equal(targetFor(null, 'delivery', 'x'), null);
  assert.equal(normBranch(' a   b '), 'a b');
});

test('meetsTarget is inclusive, tolerant, and null without a target', () => {
  assert.equal(meetsTarget(92, 92), true);
  assert.equal(meetsTarget(91.99, 92), false);
  assert.equal(meetsTarget(92 - 1e-12, 92), true);
  assert.equal(meetsTarget(80, null), null);
  assert.equal(meetsTarget(null, 90), null);
});

test('settings form is cleaned: empty / out-of-range / non-numeric are dropped and reported', () => {
  const draft = { delivery: { a: '90', b: '', c: '150', d: 'x', e: '0' }, firstAttempt: { a: '45.5' } };
  assert.deepEqual(cleanTargets(draft), { delivery: { a: 90, e: 0 }, firstAttempt: { a: 45.5 } });
  assert.deepEqual(invalidCells(draft).map((x) => x.branch), ['c', 'd']);
});

const data = {
  months: ['July', 'August'],
  branches: ['a'],
  clients: [
    { n: 'A &amp; B', v: { July: [10, 8, 1, 4], August: [0, 0, 0, 0] }, b: {} },
    { n: 'X-GO Express', v: { July: [5, 5, 0, 5] } },
    { n: 'x go express', v: { August: [7, 6, 0, 3] } },
  ],
};
test('month coverage counts customers / shipments per available month and flags missing months', () => {
  const cov = monthCoverage(data);
  const jul = cov.find((x) => x.month === 'July'), aug = cov.find((x) => x.month === 'August'), nov = cov.find((x) => x.month === 'November');
  assert.deepEqual([jul.customers, jul.total, jul.delivered, jul.paid, jul.first], [2, 15, 13, 1, 9]);
  assert.deepEqual([aug.customers, aug.total], [1, 7]);
  assert.equal(nov.available, false);
});
test('names with HTML entities and near-duplicate names are found', () => {
  assert.deepEqual(namesWithEntities(data.clients), ['A &amp; B']);
  assert.deepEqual(similarNames(data.clients), [['X-GO Express', 'x go express']]);
});
test('API checks report what the server version lacks', () => {
  const c = apiChecks({ branches: undefined, clients: [{ n: 'a', v: { July: [1, 1, 0] } }] }, [METRICS.firstAttempt]);
  assert.deepEqual(c.map((x) => x.ok), [false, false]);
});

test('SLA target is in days (max 60) and lower is better', () => {
  assert.equal(meetsMaxTarget(2.0, 2.0), true);
  assert.equal(meetsMaxTarget(1.5, 2.0), true);
  assert.equal(meetsMaxTarget(2.01, 2.0), false);
  assert.equal(meetsMaxTarget(2.0 + 1e-12, 2.0), true);
  assert.equal(meetsMaxTarget(2.0, null), null);
  const draft = { sla: { a: '2.25', b: '61', c: '-1' }, delivery: { a: '99' } };
  assert.deepEqual(cleanTargets(draft), { sla: { a: 2.25 }, delivery: { a: 99 } });
  assert.deepEqual(invalidCells(draft).map((x) => `${x.metricId}:${x.branch}`), ['sla:b', 'sla:c']);
});
