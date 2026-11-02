import test from 'node:test';
import assert from 'node:assert/strict';
import { METRICS, evaluateMonth, evaluateBranches, levelFor } from '../src/lib/quality.js';

const FA = METRICS.firstAttempt;
// cell = [total, delivered, paid, deliveredFirstAttempt]
const clients = [
  // 3 prior months: 100 shipments each, 40 first-attempt -> 40% ; October: 100 shipments, 50 first attempt -> 50% ; delta +10 -> excellent
  { n: 'A', v: { July: [100, 80, 5, 40], August: [100, 80, 5, 40], September: [100, 80, 5, 40], October: [100, 85, 5, 50] } },
  // 50% -> 56%: +6 -> required (inclusive boundary)
  { n: 'B', v: { July: [100, 90, 0, 50], August: [100, 90, 0, 50], September: [100, 90, 0, 50], October: [100, 90, 0, 56] } },
  // 60% -> 62%: +2 -> below acceptable
  { n: 'C', v: { July: [100, 90, 0, 60], August: [100, 90, 0, 60], September: [100, 90, 0, 60], October: [100, 90, 0, 62] } },
  // only 3 months -> excluded
  { n: 'D', v: { August: [10, 9, 0, 9], September: [10, 9, 0, 9], October: [10, 9, 0, 9] } },
];

test('thresholds are +3 / +6 / +10', () => {
  assert.equal(levelFor(10, FA.levels).key, 'excellent');
  assert.equal(levelFor(9.99, FA.levels).key, 'required');
  assert.equal(levelFor(6, FA.levels).key, 'required');
  assert.equal(levelFor(5.99, FA.levels).key, 'acceptable');
  assert.equal(levelFor(3, FA.levels).key, 'acceptable');
  assert.equal(levelFor(2.99, FA.levels).key, 'below');
  assert.equal(levelFor(6 - 1e-12, FA.levels).key, 'required'); // floating-point noise on an exact boundary
  assert.equal(levelFor(0.1 + 0.2 + 2.7, FA.levels).key, 'acceptable'); // 3.0000000000000004
});

test('success = delivered on first attempt only (paid shipping and rejections are not counted)', () => {
  const r = evaluateMonth(clients, 'October', { metric: FA });
  const by = Object.fromEntries(r.rows.map((x) => [x.name, x]));
  assert.equal(by.A.baseline, 40); assert.equal(by.A.current, 50); assert.equal(by.A.delta, 10);
  assert.equal(by.A.level.key, 'excellent');
  assert.equal(by.B.level.key, 'required');
  assert.equal(by.C.level.key, 'below');
  assert.equal(r.rows.length, 3); // D excluded: not present in all 4 months
});

test('group result pools the included customers and uses the first-attempt levels', () => {
  const r = evaluateMonth(clients, 'October', { metric: FA });
  // baseline (40+50+60)*3 / 900 = 50 ; current (50+56+62)/300 = 56
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(near(r.group.baseline, 50)); assert.ok(near(r.group.current, 56));
  assert.ok(near(r.group.delta, 6)); assert.equal(r.group.level.key, 'required');
  assert.equal(r.group.curSuccess, 168);
});

test('the default metric (delivery) is unchanged by the 4th value', () => {
  const r = evaluateMonth(clients, 'October');
  const A = r.rows.find((x) => x.name === 'A');
  assert.equal(A.baseline, 85); assert.equal(A.current, 90); // (80+5)/100 -> (85+5)/100
});

test('availability: needs the 4th value in the API response', () => {
  assert.equal(FA.available(clients), true);
  assert.equal(FA.available([{ n: 'x', v: { July: [10, 9, 0] } }]), false);
});

test('branch table follows the metric', () => {
  const withB = [
    { n: 'A', v: { July: [10, 8, 0, 4], August: [10, 8, 0, 4], September: [10, 8, 0, 4], October: [10, 8, 0, 5] },
      b: { 0: { July: [6, 5, 0, 3], August: [6, 5, 0, 3], September: [6, 5, 0, 3], October: [6, 5, 0, 4] }, 1: { July: [4, 3, 0, 1], August: [4, 3, 0, 1], September: [4, 3, 0, 1], October: [4, 3, 0, 1] } } },
  ];
  const ev = evaluateMonth(withB, 'October', { metric: FA });
  const br = evaluateBranches(withB, ['القاهرة', 'الجيزة'], ev);
  assert.equal(br.reduce((s, b) => s + b.curTotal, 0), ev.group.curTotal);
  assert.equal(br.reduce((s, b) => s + b.curSuccess, 0), ev.group.curSuccess);
  const cairo = br.find((b) => b.branch === 'القاهرة');
  assert.ok(Math.abs(cairo.baseline - 50) < 1e-9); assert.ok(Math.abs(cairo.current - (4 / 6) * 100) < 1e-9);
});
