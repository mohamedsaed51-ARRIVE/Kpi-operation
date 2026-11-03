import test from 'node:test';
import assert from 'node:assert/strict';
import { METRICS, evaluateAllMonths, evaluateBranches, evaluateMonth } from '../src/lib/quality.js';
import { evaluateSlaBranches } from '../src/lib/sla.js';

// cell = [total, delivered, paid, firstAttempt, sumDays, deliveredWithDate]
const cell = (t, d, f, days) => [t, d, 0, f, days * d, d];
const clients = [
  { n: 'A', v: { July: cell(10, 8, 4, 3), August: cell(10, 8, 4, 3), September: cell(10, 8, 4, 3), October: cell(10, 8, 2, 4), November: cell(10, 9, 6, 2) } },
  { n: 'B', v: { July: cell(10, 8, 4, 3), August: cell(10, 8, 4, 3), September: cell(10, 8, 4, 3), October: cell(20, 10, 10, 2), November: cell(20, 16, 12, 3) } },
  { n: 'C', v: { October: cell(10, 5, 5, 2), November: cell(10, 5, 5, 2) } }, // not a repeat customer for delivery → must not count
];
const base = { ...METRICS.firstAttempt };
const dEval = (m) => evaluateMonth(clients, m, { metric: METRICS.delivery });

test('delivery eligibility = 3 previous months + measured; First Attempt uses the same customers with October only', () => {
  const del = dEval('November');
  assert.deepEqual(del.rows.map((r) => r.name).sort(), ['A', 'B']);
  const fa = evaluateMonth(clients, 'November', { metric: base, eligibleFor: (m) => new Set(dEval(m).rows.map((r) => r.name)) });
  assert.deepEqual(fa.prev, ['October']);
  assert.deepEqual(fa.rows.map((r) => r.name).sort(), ['A', 'B']); // C excluded although it has October + November
  const a = fa.rows.find((r) => r.name === 'A');
  assert.ok(Math.abs(a.baseline - 20) < 1e-9);  // 2/10 in October only
  assert.ok(Math.abs(a.current - 60) < 1e-9);   // 6/10 in November
  assert.ok(Math.abs(fa.group.baseline - (12 / 30) * 100) < 1e-9); // pooled October: (2+10)/(10+20)
});

test('months up to the baseline month cannot be measured', () => {
  assert.equal(evaluateMonth(clients, 'October', { metric: base }).error, 'before-base');
  const trend = evaluateAllMonths(clients, ['July', 'August', 'September', 'October', 'November'], { metric: base, eligibleFor: (m) => new Set(dEval(m).rows.map((r) => r.name)) });
  assert.deepEqual(trend.map((t) => t.month), ['November']);
});

test('branch SLA: baseline = October only for the delivery customers', () => {
  const clientsB = clients.map((c) => ({ ...c, b: { 0: c.v } }));
  const del = dEval('November');
  const { rows, group } = evaluateSlaBranches(clientsB, ['X'], { ...del, prev: ['October'], method: 'pooled' });
  // October average days: A 4 (8 deliveries), B 2 (10 deliveries) → (32+20)/18
  assert.ok(Math.abs(group.baseline - 52 / 18) < 1e-9);
  assert.equal(rows.length, 1);
  assert.ok(Math.abs(rows[0].current - ((9 * 2 + 16 * 3) / 25)) < 1e-9);
});

test('branch table for First Attempt follows the October baseline', () => {
  const clientsB = clients.map((c) => ({ ...c, b: { 0: c.v } }));
  const fa = evaluateMonth(clientsB, 'November', { metric: base, eligibleFor: (m) => new Set(dEval(m).rows.map((r) => r.name)) });
  const br = evaluateBranches(clientsB, ['X'], fa);
  assert.equal(br.length, 1);
  assert.ok(Math.abs(br[0].baseline - 40) < 1e-9); // (2+10)/(10+20)
});
