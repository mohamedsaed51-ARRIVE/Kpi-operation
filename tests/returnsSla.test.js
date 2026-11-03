import test from 'node:test';
import assert from 'node:assert/strict';
import { AGE_BUCKETS, decodeReturns, ageOf, filterReturns, groupStats, normBranch, returnsSlaLimit, stats, RETURNS_SLA_KEY, UNKNOWN } from '../src/lib/returnsSla.js';

const snap = {
  dict: { senders: ['A', 'B'], statuses: ['فى المخزن', 'تم'], branches: ['فرع الهرم', 'تم الارتجاع للراسل', 'منصوره'], finals: ['x'], tabs: ['1-9', '2-9'] },
  rows: [
    ['W1', 0, '2026-09-01', 0, '2026-09-02', 0, 0, '2026-09-05', 3, 0],   // age 3 = calc 3
    ['W2', 1, '', 1, '2026-09-02', 1, 0, '2026-09-04', 5, 0],              // sheet 5 vs calc 2 -> عمر_شاذ, branch unknown, no pickup
    ['W3', 0, '2026-09-01', 0, '2026-09-03', 2, 0, '', null, 1],           // no return date
    ['W1', 0, '2026-09-01', 0, '2026-09-02', 0, 0, '2026-09-06', 4, 1],    // duplicate of W1 (later tab)
  ],
};
const rows = decodeReturns(snap);
const F = { q: '', branches: new Set(), statuses: new Set(), senders: new Set(), from: '', to: '', dup: 'all' };

test('decode: ages, flags, duplicates', () => {
  assert.equal(rows[0].ageC, 3);
  assert.deepEqual(rows[1].flags.sort(), ['بيك_اب_فارغ', 'عمر_شاذ', 'فرع_غير_محدد'].sort());
  assert.deepEqual(rows[2].flags, ['تاريخ_ناقص']);
  assert.ok(rows[0].flags.includes('مكرر_في_تابات') && rows[3].flags.includes('مكرر_في_تابات'));
  assert.equal(rows[0].isFirst, true); assert.equal(rows[3].isLast, true);
});

test('age basis: written vs calc', () => {
  assert.equal(ageOf(rows[1], 'written'), 5);
  assert.equal(ageOf(rows[1], 'calc'), 2);
  assert.equal(ageOf(rows[2], 'written'), null);
});

test('stats with and without a limit', () => {
  const s0 = stats(rows, (r) => ageOf(r, 'written'));
  assert.equal(s0.n, 3); assert.equal(s0.rate, null); assert.equal(s0.within, null);
  assert.ok(Math.abs(s0.avg - 4) < 1e-9); assert.equal(s0.med, 4); assert.equal(s0.max, 5);
  const s1 = stats(rows, (r) => ageOf(r, 'written'), 4);
  assert.equal(s1.within, 2); assert.equal(s1.late, 1); assert.ok(Math.abs(s1.rate - 2 / 3) < 1e-9);
});

test('filters + grouping', () => {
  assert.equal(filterReturns(rows, { ...F, dup: 'last' }).length, 3);
  assert.equal(filterReturns(rows, { ...F, dup: 'first' }).length, 3);
  assert.equal(filterReturns(rows, { ...F, from: '2026-09-05' }).length, 2);
  assert.equal(filterReturns(rows, { ...F, q: 'w3' }).length, 1);
  const g = groupStats(rows, 'branch', (r) => ageOf(r, 'written'), null);
  assert.equal(g.find((x) => x.key === 'الهرم').rows, 2);
  assert.equal(normBranch('تم الارتجاع للراسل'), UNKNOWN);
  assert.equal(normBranch('فرع منصوره'), 'المنصورة');
});

test('buckets and settings limit', () => {
  assert.equal(AGE_BUCKETS.filter(([, f]) => f(3)).length, 1);
  assert.equal(returnsSlaLimit(null), null);
  assert.equal(returnsSlaLimit({ sla: { [RETURNS_SLA_KEY]: 2 } }), 2);
  assert.equal(returnsSlaLimit({ sla: { [RETURNS_SLA_KEY]: -1 } }), null);
});
