// Customer-size tiers (التصنيف) and their weights (النسبة) — settings only for now.
// The table is stored on the server (action=getKpiTiers / saveKpiTiers). It is NOT used in any KPI calculation yet:
// the values are to be filled in by management first.

export const MAX_TIERS = 10;
export const MAX_NAME_LENGTH = 40;
export const MAX_MIN_SHIPMENTS = 10000000;

/** Rows shown when nothing has been saved yet (names only — the numbers are left blank for management to fill in). */
export const DEFAULT_TIER_NAMES = ['كبار', 'متوسطين', 'صغار / جدد'];

const blank = (v) => v === '' || v === null || v === undefined;
const normName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

/** Server value (array or empty) → editable rows of strings. */
export function tiersToDraft(tiers) {
  const list = Array.isArray(tiers) && tiers.length ? tiers : DEFAULT_TIER_NAMES.map((name) => ({ name }));
  return list.map((t) => ({
    name: normName(t.name),
    minShipments: blank(t.minShipments) ? '' : String(t.minShipments),
    weight: blank(t.weight) ? '' : String(t.weight),
  }));
}

const validMin = (raw) => blank(raw) || (Number.isInteger(Number(raw)) && Number(raw) >= 0 && Number(raw) <= MAX_MIN_SHIPMENTS);
const validWeight = (raw) => blank(raw) || (Number.isFinite(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 100);

/** Editable rows → payload for the server. Rows without a name are dropped; blank numbers become null. */
export function cleanTiers(draft) {
  return (draft || [])
    .map((r) => ({ name: normName(r.name).slice(0, MAX_NAME_LENGTH), minShipments: r.minShipments, weight: r.weight }))
    .filter((r) => r.name)
    .slice(0, MAX_TIERS)
    .map((r) => ({
      name: r.name,
      minShipments: blank(r.minShipments) || !validMin(r.minShipments) ? null : Number(r.minShipments),
      weight: blank(r.weight) || !validWeight(r.weight) ? null : Number(r.weight),
    }));
}

/** Sum of the entered weights (blank = nothing entered), rounded against floating-point noise. */
export function weightsTotal(draft) {
  return Math.round((draft || []).reduce((s, r) => s + (blank(r.weight) || !validWeight(r.weight) ? 0 : Number(r.weight)), 0) * 1000) / 1000;
}

/**
 * Problems in the form. `errors` block saving (cannot be stored as typed); `warnings` do not (the table can be filled in later).
 */
export function tierProblems(draft) {
  const errors = [], warnings = [];
  const rows = draft || [];
  rows.forEach((r, i) => {
    const label = normName(r.name) || `الصف ${i + 1}`;
    if (!validMin(r.minShipments)) errors.push(`${label}: الحد الأدنى للشحنات لازم يكون رقم صحيح بين 0 و${MAX_MIN_SHIPMENTS.toLocaleString('en-US')}.`);
    if (!validWeight(r.weight)) errors.push(`${label}: النسبة لازم تكون بين 0 و100.`);
    if (blank(r.name) && (!blank(r.minShipments) || !blank(r.weight))) errors.push(`الصف ${i + 1}: مكتوب أرقام بدون اسم تصنيف.`);
  });
  const names = rows.map((r) => normName(r.name)).filter(Boolean);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length) errors.push(`أسماء تصنيف مكررة: ${[...new Set(dup)].join('، ')}.`);
  const anyWeight = rows.some((r) => !blank(r.weight));
  if (anyWeight) {
    const total = weightsTotal(rows);
    if (Math.abs(total - 100) > 1e-9) warnings.push(`مجموع النسب ${total}٪ — لازم يكون 100٪ قبل ما التصنيف يُستخدم.`);
    if (rows.some((r) => !blank(r.name) && blank(r.weight))) warnings.push('فيه تصنيف بدون نسبة.');
  }
  return { errors, warnings };
}
