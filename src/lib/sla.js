import { makeLevels, levelFor } from './quality.js';

// SLA التسليم = average delivery days (lower is better). Same customers methodology as the other KPIs:
// customers present in the 3 previous months + the measured month; baseline = average of the 3 previous months.
// Improvement (days) = baseline − current  →  ≥ 0.1 مقبول · ≥ 0.2 المطلوب · ≥ 0.3 ممتاز
export const SLA = {
  id: 'sla',
  label: 'SLA التسليم',
  avgLabel: 'متوسط مدة التسليم',
  unit: 'يوم',
  description: 'متوسط مدة التسليم بالأيام لكل فرع مقارنة بمتوسط آخر 3 شهور لنفس العملاء — النقص تحسّن',
  levels: makeLevels({ acceptable: 0.1, required: 0.2, excellent: 0.3 }),
  // cell = [total, delivered, paid, firstAttempt, sumDays, deliveredWithDate]
  available: (clients) => clients.some((c) => Object.values(c.v).some((cell) => cell.length > 5)),
};

export const thresholdsTextSla = () => {
  const [ex, rq, ac] = SLA.levels;
  return `${ac.label} ≥ ${ac.minDelta} · ${rq.label} ≥ ${rq.minDelta} · ${ex.label} ≥ ${ex.minDelta} يوم أسرع`;
};

const avg = (sum, n) => (n > 0 ? sum / n : null);

/**
 * evaluated = result of evaluateMonth() (gives the eligible customers, the previous months and the measured month).
 * Returns { rows (one per branch), group } — both with baseline / current in days and improvement = baseline − current.
 */
export function evaluateSlaBranches(clients, branches, evaluated) {
  if (!evaluated || evaluated.error || !Array.isArray(branches)) return { rows: [], group: null };
  const { prev, month, method } = evaluated;
  const included = new Set(evaluated.rows.map((r) => r.name));
  const months = [...prev, month];
  const acc = new Map(); // branch index -> { cells: {month: [sumDays, n]}, customers: Set }
  const all = Object.fromEntries(months.map((m) => [m, [0, 0]]));
  for (const c of clients) {
    if (!included.has(c.n) || !c.b) continue;
    for (const [bi, byMonth] of Object.entries(c.b)) {
      let a = acc.get(bi);
      if (!a) { a = { cells: Object.fromEntries(months.map((m) => [m, [0, 0]])), customers: new Set() }; acc.set(bi, a); }
      for (const m of months) {
        const cell = byMonth[m];
        if (!cell || cell.length < 6) continue;
        a.cells[m][0] += cell[4]; a.cells[m][1] += cell[5];
        all[m][0] += cell[4]; all[m][1] += cell[5];
        if (m === month && cell[5] > 0) a.customers.add(c.n);
      }
    }
  }
  const build = (cells) => {
    const monthAvgs = prev.map((m) => avg(cells[m][0], cells[m][1]));
    const histDays = prev.reduce((s, m) => s + cells[m][0], 0), histN = prev.reduce((s, m) => s + cells[m][1], 0);
    const cur = cells[month];
    if (!histN || !cur[1]) return null; // needs deliveries in the baseline months and in the measured month
    let baseline;
    if (method === 'mean') { const v = monthAvgs.filter((x) => x !== null); baseline = v.reduce((s, x) => s + x, 0) / v.length; }
    else baseline = histDays / histN;
    const current = cur[0] / cur[1];
    const improvement = baseline - current; // positive = faster than before
    return { monthAvgs, baseline, current, improvement, level: levelFor(improvement, SLA.levels), delivered: cur[1] };
  };
  const rows = [];
  for (const [bi, a] of acc) {
    const r = build(a.cells);
    if (r) rows.push({ branch: branches[Number(bi)], customers: a.customers.size, ...r });
  }
  const g = build(all);
  return { rows, group: g ? { customers: included.size, ...g } : null };
}
