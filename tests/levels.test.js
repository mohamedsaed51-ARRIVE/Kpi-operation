import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLDS, levelKey, levelsFor, thresholdsFor, thresholdsValid, withLevels } from '../src/lib/levels.js';
import { METRICS, levelFor } from '../src/lib/quality.js';
import { cleanTargets } from '../src/lib/targets.js';

test('defaults when nothing is saved', () => {
  assert.deepEqual(thresholdsFor(null, 'delivery'), DEFAULT_THRESHOLDS.delivery);
  assert.deepEqual(thresholdsFor({}, 'sla'), DEFAULT_THRESHOLDS.sla);
  assert.deepEqual(levelsFor(null, 'firstAttempt').map((l) => l.minDelta), [10, 6, 3, -Infinity]);
});

test('saved thresholds override field by field', () => {
  const t = { delivery: { [levelKey('required')]: 6, [levelKey('excellent')]: 9, 'فرع أ': 90 } };
  assert.deepEqual(thresholdsFor(t, 'delivery'), { acceptable: 3, required: 6, excellent: 9 });
  const m = withLevels(METRICS.delivery, t);
  assert.equal(levelFor(6, m.levels).key, 'required');
  assert.equal(levelFor(8.9, m.levels).key, 'required');
  assert.equal(levelFor(9, m.levels).key, 'excellent');
  assert.equal(METRICS.delivery.levels[1].minDelta, 5); // original untouched
});

test('invalid order falls back to defaults', () => {
  const t = { sla: { [levelKey('acceptable')]: 0.5, [levelKey('required')]: 0.2 } };
  assert.deepEqual(thresholdsFor(t, 'sla'), DEFAULT_THRESHOLDS.sla);
  assert.equal(thresholdsValid({ acceptable: 3, required: 2, excellent: 7 }), false);
  assert.equal(thresholdsValid({ acceptable: 1, required: 2, excellent: 2 }), true);
});

test('level keys survive cleanTargets (they are stored with the branch targets)', () => {
  const out = cleanTargets({ sla: { [levelKey('acceptable')]: '0.15', 'فرع أ': '2' } });
  assert.equal(out.sla[levelKey('acceptable')], 0.15);
  assert.equal(out.sla['فرع أ'], 2);
});
