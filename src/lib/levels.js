import { makeLevels } from './quality.js';

// Evaluation thresholds (مقبول / المطلوب / ممتاز) per KPI, editable in the Settings page.
// They are stored with the branch targets (same server call), under reserved keys that start with "__" so they can
// never clash with a branch name:  targets.delivery.__level_acceptable = 3, ...
export const LEVEL_FIELDS = ['acceptable', 'required', 'excellent'];
export const levelKey = (field) => `__level_${field}`;
// SLA المرتجعات is not one of the server's KPIs, so its thresholds are stored in the «sla» bucket under their own reserved keys.
export const returnsLevelKey = (field) => `__level_r_${field}`;
/** Where the threshold `field` of KPI `metricId` lives in the saved settings: [bucket, key]. */
export const levelLocation = (metricId, field) => (metricId === 'returnsSla' ? ['sla', returnsLevelKey(field)] : [metricId, levelKey(field)]);
export const isReservedKey = (key) => String(key).startsWith('__');

export const DEFAULT_THRESHOLDS = {
  delivery: { acceptable: 3, required: 5, excellent: 7 },
  firstAttempt: { acceptable: 3, required: 6, excellent: 10 },
  sla: { acceptable: 0.1, required: 0.2, excellent: 0.3 },
  returnsSla: { acceptable: 0.1, required: 0.2, excellent: 0.3 },
};

const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

/** true when the three values are numbers and acceptable <= required <= excellent. */
export const thresholdsValid = (t) => LEVEL_FIELDS.every((f) => Number.isFinite(num(t[f])) && num(t[f]) >= 0)
  && num(t.acceptable) <= num(t.required) && num(t.required) <= num(t.excellent);

/** Thresholds of a KPI: the saved ones, field by field, falling back to the defaults. Invalid sets fall back entirely. */
export function thresholdsFor(targets, metricId) {
  const def = DEFAULT_THRESHOLDS[metricId];
  const merged = Object.fromEntries(LEVEL_FIELDS.map((f) => {
    const [bucket, key] = levelLocation(metricId, f);
    const v = targets?.[bucket]?.[key];
    return [f, typeof v === 'number' && Number.isFinite(v) ? v : def[f]];
  }));
  return thresholdsValid(merged) ? merged : { ...def };
}

export const levelsFor = (targets, metricId) => makeLevels(thresholdsFor(targets, metricId));

/** A copy of a METRICS entry that uses the saved thresholds. */
export const withLevels = (metric, targets) => ({ ...metric, levels: levelsFor(targets, metric.id) });
