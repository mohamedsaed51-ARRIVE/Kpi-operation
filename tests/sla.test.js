import test from 'node:test';
import assert from 'node:assert/strict';
import { SLA, evaluateSlaBranches } from '../src/lib/sla.js';
import { evaluateMonth, levelFor } from '../src/lib/quality.js';

const near = (a, b) => Math.abs(a - b) < 1e-9;
// cell = [total, delivered, paid, first, sumDays, deliveredWithDate]
const cell = (n, days) => [n, n, 0, 0, n * days, n];
const mk = (n, byBranch) => { // byBranch: { idx: { July: [n, days], ... } }
  const v = {}, b = {};
  for (const [bi, months] of Object.entries(byBranch)) {
    b[bi] = {};
    for (const [m, [cnt, days]] of Object.entries(months)) {
      b[bi][m] = cell(cnt, days);
      v[m] = v[m] || [0, 0, 0, 0, 0, 0];
      cell(cnt, days).forEach((x, i) => { v[m][i] += x; });
    }
  }
  return { n, v, b };
};
const M = (cnt, d3, d4) => ({ July: [cnt, d3], August: [cnt, d3], September: [cnt, d3], October: [cnt, d4] });
const clients = [
  mk('A', { 0: M(10, 2.0, 1.7), 1: M(10, 3.0, 3.0) }),   // branch 0 gets faster by 0.3, branch 1 unchanged
  mk('B', { 0: M(10, 2.0, 1.9) }),                        // branch 0: 0.1 faster
  mk('C', { 1: { August: [5, 2], September: [5, 2], October: [5, 2] } }), // only 3 months -> excluded
];

test('levels: improvement of 0.1 / 0.2 / 0.3 days', () => {
  assert.equal(levelFor(0.3, SLA.levels).key, 'excellent');
  assert.equal(levelFor(0.2, SLA.levels).key, 'required');
  assert.equal(levelFor(0.1, SLA.levels).key, 'acceptable');
  assert.equal(levelFor(0.09, SLA.levels).key, 'below');
  assert.equal(levelFor(-0.5, SLA.levels).key, 'below'); // slower than before
  assert.equal(levelFor(0.3 - 1e-12, SLA.levels).key, 'excellent'); // floating-point noise
});

test('branch SLA: same customers methodology, improvement = baseline − current', () => {
  const ev = evaluateMonth(clients, 'October');
  const { rows, group } = evaluateSlaBranches(clients, ['فرع 0', 'فرع 1'], ev);
  const by = Object.fromEntries(rows.map((r) => [r.branch, r]));
  // branch 0: baseline (A 2.0 + B 2.0) = 2.0 ; current (10*1.7 + 10*1.9)/20 = 1.8 ; improvement 0.2 -> المطلوب
  assert.ok(near(by['فرع 0'].baseline, 2.0)); assert.ok(near(by['فرع 0'].current, 1.8));
  assert.ok(near(by['فرع 0'].improvement, 0.2)); assert.equal(by['فرع 0'].level.key, 'required');
  // branch 1: only customer A counts (C is excluded: not in 4 months) -> unchanged -> below
  assert.ok(near(by['فرع 1'].improvement, 0)); assert.equal(by['فرع 1'].level.key, 'below'); assert.equal(by['فرع 1'].customers, 1);
  // group: baseline (20*2 + 10*3)/30 = 2.3333 ; current (10*1.7+10*1.9+10*3)/30 = 2.2 ; improvement 0.1333 -> below 0.2? -> acceptable (>= 0.1)
  assert.ok(near(group.baseline, 70 / 30)); assert.ok(near(group.current, 66 / 30));
  assert.equal(group.level.key, 'acceptable'); assert.equal(group.customers, 2);
});

test('a slower branch is below, not negative-acceptable', () => {
  const slow = [mk('A', { 0: M(10, 2.0, 2.5) })];
  const ev = evaluateMonth(slow, 'October');
  const r = evaluateSlaBranches(slow, ['فرع 0'], ev).rows[0];
  assert.ok(near(r.improvement, -0.5)); assert.equal(r.level.key, 'below');
});

test('mean method averages the 3 monthly averages', () => {
  const uneven = [mk('A', { 0: { July: [1, 1], August: [1, 1], September: [100, 4], October: [10, 2] } })];
  const pooled = evaluateSlaBranches(uneven, ['b'], evaluateMonth(uneven, 'October', { method: 'pooled' })).rows[0];
  const mean = evaluateSlaBranches(uneven, ['b'], evaluateMonth(uneven, 'October', { method: 'mean' })).rows[0];
  assert.ok(near(pooled.baseline, (1 + 1 + 400) / 102)); assert.ok(near(mean.baseline, 2));
});

test('availability needs the SLA values in the response; absent data gives no rows', () => {
  assert.equal(SLA.available(clients), true);
  const old = [{ n: 'x', v: { July: [1, 1, 0, 0] } }];
  assert.equal(SLA.available(old), false);
  assert.deepEqual(evaluateSlaBranches(old, ['b'], { error: 'x' }), { rows: [], group: null });
});
