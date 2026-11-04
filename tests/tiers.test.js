import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTiers, tierProblems, tiersToDraft, weightsTotal, DEFAULT_TIER_NAMES } from '../src/lib/tiers.js';

test('empty server value → default rows (names only, numbers blank)', () => {
  const d = tiersToDraft([]);
  assert.deepEqual(d.map((r) => r.name), DEFAULT_TIER_NAMES);
  assert.ok(d.every((r) => r.minShipments === '' && r.weight === ''));
  assert.deepEqual(cleanTiers(d).map((t) => [t.minShipments, t.weight]), [[null, null], [null, null], [null, null]]);
});

test('clean: numbers parsed, blanks → null, nameless rows dropped', () => {
  const out = cleanTiers([{ name: ' كبار ', minShipments: '500', weight: '40' }, { name: '', minShipments: '1', weight: '1' }, { name: 'صغار', minShipments: '', weight: '' }]);
  assert.deepEqual(out, [{ name: 'كبار', minShipments: 500, weight: 40 }, { name: 'صغار', minShipments: null, weight: null }]);
});

test('problems: invalid values and duplicates block; weights total ≠ 100 only warns', () => {
  assert.equal(tierProblems(tiersToDraft([])).errors.length, 0);
  assert.equal(tierProblems(tiersToDraft([])).warnings.length, 0); // nothing entered yet → no noise
  const bad = tierProblems([{ name: 'أ', minShipments: '1.5', weight: '120' }, { name: 'أ', minShipments: '', weight: '' }]);
  assert.equal(bad.errors.length, 3); // fractional min, weight > 100, duplicate name
  const partial = tierProblems([{ name: 'أ', minShipments: '', weight: '40' }, { name: 'ب', minShipments: '', weight: '' }]);
  assert.equal(partial.errors.length, 0);
  assert.ok(partial.warnings.length >= 1);
  assert.equal(tierProblems([{ name: 'أ', minShipments: '', weight: '60' }, { name: 'ب', minShipments: '', weight: '40' }]).warnings.length, 0);
  assert.equal(weightsTotal([{ weight: '33.3' }, { weight: '33.3' }, { weight: '33.4' }]), 100);
});
