import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMonth, evaluateBranches } from '../src/lib/quality.js';

// b: { branchIndex: { month: [total, delivered, paid] } }; branches = ['القاهرة', 'الإسكندرية']
const branches = ['القاهرة', 'الإسكندرية'];
const mk = (n, parts) => { // parts: { branchIdx: { month: cell } } -> also build v by summing
  const v = {};
  Object.values(parts).forEach((ms) => Object.entries(ms).forEach(([m, c]) => { v[m] = v[m] || [0, 0, 0]; c.forEach((x, i) => { v[m][i] += x; }); }));
  return { n, v, b: parts };
};
const clients = [
  mk('A', { 0: { July: [60, 48, 0], August: [60, 48, 0], September: [60, 48, 0], October: [60, 54, 0] }, 1: { July: [40, 32, 0], August: [40, 32, 0], September: [40, 32, 0], October: [40, 32, 0] } }),
  mk('B', { 0: { July: [100, 90, 0], August: [100, 90, 0], September: [100, 90, 0], October: [100, 85, 5] } }),
  mk('C', { 1: { August: [10, 9, 0], September: [10, 9, 0], October: [10, 9, 0] } }), // only 3 months -> excluded
];

test('branch totals add up to the group totals', () => {
  const ev = evaluateMonth(clients, 'October');
  const br = evaluateBranches(clients, branches, ev);
  assert.equal(br.reduce((s, b) => s + b.curTotal, 0), ev.group.curTotal);
  assert.equal(br.reduce((s, b) => s + b.curSuccess, 0), ev.group.curDelivered + ev.group.curPaid);
});

test('branch rates use only the included customers', () => {
  const ev = evaluateMonth(clients, 'October');
  const br = Object.fromEntries(evaluateBranches(clients, branches, ev).map((b) => [b.branch, b]));
  // Cairo: A 60/60/60 -> 48 each ; B 100 -> 90 each. baseline = (3*(48+90)) / (3*160) = 86.25 ; current = (54 + 90) / 160 = 90
  assert.equal(br['القاهرة'].baseline, 86.25); assert.equal(br['القاهرة'].current, 90);
  assert.equal(br['القاهرة'].delta, 3.75); assert.equal(br['القاهرة'].level.key, 'acceptable');
  assert.equal(br['القاهرة'].customers, 2);
  // Alexandria: only A (C is excluded) -> 80 / 80 -> delta 0
  assert.equal(br['الإسكندرية'].baseline, 80); assert.equal(br['الإسكندرية'].current, 80);
  assert.equal(br['الإسكندرية'].level.key, 'below'); assert.equal(br['الإسكندرية'].customers, 1);
});

test('without branch data the result is empty (old API deployment)', () => {
  const ev = evaluateMonth(clients, 'October');
  assert.deepEqual(evaluateBranches(clients, undefined, ev), []);
  assert.deepEqual(evaluateBranches(clients.map(({ b, ...c }) => c), branches, ev), []);
});
